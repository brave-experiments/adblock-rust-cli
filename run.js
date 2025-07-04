#!/usr/bin/env node

const { text } = require('node:stream/consumers')
const readline = require('node:readline')
const fs = require('node:fs')

const adblockRust = require('adblock-rs')
const { ArgumentParser, FileType } = require('argparse')

const adblockRustCliPackage = require('./package.json')

// These are defined by different content filter projects (AdBlock Plus,
// uBlockOrigin, AdGuard, etc.).
// For example, https://github.com/gorhill/uBlock/wiki/Static-filter-syntax
const filterListRequestTypes = [
  'beacon',
  'csp_report',
  'document',
  'font',
  'image',
  'media',
  'object',
  'ping',
  'script',
  'stylesheet',
  'sub_frame',
  'websocket',
  'xhr',
  'other',
  'speculative',
  'web_manifest',
  'xbl',
  'xml_dtd',
  'xslt'
]

// These values are defined by Blink, in `Resource::ResourceTypeToString`.
// See third_party/blink/renderer/platform/loader/fetch/resource.h.
// The OTHER catch all case covers the additional types
// defined in `blink::Resource::InitiatorTypeNameToString`.
//
// See https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/platform/loader/fetch/resource.cc
/* eslint-disable quote-props */
const chromiumRequestTypeMapping = {
  'Attribution resource': 'other',
  'Audio': 'media',
  'CSS resource': 'stylesheet',
  'CSS stylesheet': 'stylesheet',
  'Dictionary': 'other',
  'Document': 'document',
  'Fetch': 'xhr',
  'Font': 'font',
  'Icon': 'other',
  'Image': 'image',
  'Internal resource': 'other',
  'Link element resource': 'other',
  'Link prefetch resource': 'speculative',
  'Manifest': 'web_manifest',
  'Mock': 'other',
  'Other resource': 'other',
  'Processing instruction': 'other',
  'Script': 'script',
  'SpeculationRule': 'speculative',
  'SVG document': 'media',
  'SVG Use element resource': 'media',
  'Text track': 'other',
  'Track': 'other',
  'User Agent CSS resource': 'stylesheet',
  'Video': 'media',
  'XML resource': 'document',
  'XMLHttpRequest': 'xhr',
  'XSL stylesheet': 'xslt'
}
/* eslint-enable quote-props */
const chromiumRequestTypes = Object.keys(chromiumRequestTypeMapping)
const requestTypeOptions = filterListRequestTypes.concat(chromiumRequestTypes)
requestTypeOptions.sort()

const parser = new ArgumentParser({
  add_help: true,
  description: 'Check whether a URL would be blocked by given filter list rules'
})
parser.add_argument('-v', '--version', {
  action: 'version',
  version: adblockRustCliPackage.version
})

parser.add_argument('--requests', {
  type: FileType('r'),
  help: 'Path to a file of requests to check filter list rules against (or, ' +
        'by default, STDIN). This input should be lines of JSON documents, ' +
        'one document per line. This JSON text must have the following keys: ' +
        '"url", "context", and "type", which corresponds to the --url, ' +
        '--context, and --type arguments. Use "-" to read from stdin.'
})

parser.add_argument('--url', {
  type: URL,
  help: 'The full URL to check against the provided filter lists.'
})
parser.add_argument('--context', {
  type: URL,
  help: 'The security context the request occurred in, as a full URL'
})
parser.add_argument('--type', {
  help: 'The type of the request, using either i. the types defined by ' +
        'filter list projects (which are all in lowercase, e.g., "xhr" or ' +
        '"stylesheet"), or ii. the types defined in the Chromium source ' +
        '(which start with an uppercase character, e.g., "XMLHttpRequest" or ' +
        '"CSS stylesheet")',
  choices: requestTypeOptions
})

parser.add_argument('--rules', {
  type: FileType('r'),
  nargs: '*',
  help: 'One or more paths to files of filter list rules to check the ' +
        'request against. By default uses bundled old-and-outdated versions ' +
        'of easylist and easyprivacy'
})
parser.add_argument('--verbose', {
  default: false,
  action: 'store_true',
  help: 'Print information about what rule(s) the request matched.'
})

const checkRequest = (engine, request, requestType, requestContext) => {
  const requestTypeUnified = chromiumRequestTypeMapping[requestType] || requestType
  try {
    return engine.check(
      request.toString(),
      requestContext.toString(),
      requestTypeUnified,
      true
    )
  } catch (e) {
    console.error(`Error checking request: url:${request}, ` +
                  `context:${requestContext}, type:${requestTypeUnified}`)
    console.error('adblock-rust error: ' + e.toString())
    return null
  }
}

const validateArgs = (args) => {
  // Check that we either have all three arguments needed for the "argument"
  // invoking method (i.e., "--url", "--type", and "--context"), or we have
  // a path to read request JSON descriptions from (i.e., "--requests").
  const receivedAnyRequestArgs = (
    args.url !== undefined ||
    args.context !== undefined ||
    args.type !== undefined)
  const receivedAllRequestArgs = (
    args.url !== undefined &&
    args.context !== undefined &&
    args.type !== undefined)

  if (receivedAnyRequestArgs === true) {
    if (receivedAllRequestArgs === false) {
      const errorMsg = '--url, --context, and --type must be either all ' +
        'provided, or none of them provided.'
      return { valid: false, msg: errorMsg }
    }
    return { valid: true, method: 'args' }
  }

  if (!args.requests) {
    const errorMsg = 'Must use either --requests to describe where to read ' +
      'request information from, or the --url, --context, and --type ' +
      'arguments to describe the request.'
    return { valid: false, msg: errorMsg }
  }
  return { valid: true, method: 'file' }
}

;(async () => {
  const args = parser.parse_args()

  const filterSet = new adblockRust.FilterSet(true)
  let ruleStreams
  if (args.rules) {
    ruleStreams = args.rules
  } else {
    const defaultLists = [
      './resources/easylist.txt',
      './resources/easyprivacy.txt'
    ]
    ruleStreams = defaultLists.map((x) => fs.createReadStream(x, {}))
  }

  for (const aRuleStream of ruleStreams) {
    const rulesText = await text(aRuleStream)
    filterSet.addFilters(rulesText.split('\n'))
  }

  const engine = new adblockRust.Engine(filterSet, true)
  const checkRequestFunc = checkRequest.bind(undefined, engine)

  // This code can either be invoked to consider one request, using command
  // line flags, or read request descriptions from a handle. If
  // any of the following arguments were provided, then we assume we're in
  // "arguments" mode, otherwise we stream request descriptions from the
  // --requests argument.
  const validationResult = validateArgs(args)
  if (validationResult.valid === false) {
    console.error(validationResult.msg)
    process.exit(1)
  }

  if (validationResult.method === 'args') {
    const result = checkRequestFunc(args.url, args.type, args.context)
    if (result === null) {
      process.exit(1)
    }
    const resultMatched = result.matched
    console.log(args.verbose ? result : resultMatched)
    process.exit(0)
  }

  // Otherwise, we're in "streaming" mode, and we read requests off whatever
  // was provided in --requests (which is either the path to a file, or
  // stdin).
  const readlineInterface = readline.createInterface({
    input: args.requests,
    terminal: false
  })
  let anyErrors = false
  readlineInterface.on('line', (line) => {
    let requestData
    try {
      requestData = JSON.parse(line)
    } catch (e) {
      const msg = 'Invalid JSON in requests input: ' + line
      throw new Error(msg)
    }

    if (requestData.url === undefined ||
        requestData.type === undefined ||
        requestData.context === undefined) {
      throw new Error('Request description does not include all three ' +
                      'required keys, "url", "type", "context".\n' + line)
    }

    const result = checkRequestFunc(
      requestData.url, requestData.type, requestData.context)
    if (result === null) {
      anyErrors = true
    } else {
      const resultMatched = result.matched
      console.log(args.verbose ? JSON.stringify(result) : resultMatched)
    }
  })

  readlineInterface.on('close', () => {
    process.exit(anyErrors === true ? 1 : 0)
  })
})()
