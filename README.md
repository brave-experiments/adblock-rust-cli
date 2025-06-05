# adblock-rust-cli

Command line tool for quickly checking requests against filter lists using
Brave's adblock-rust library.

## Usage

### Argument Method

There are two ways to call this library. If you just want to check a single
request, you can use the `--url`, `--context`, and `--type` arguments
to describe the request you want to check. For example:

```
./run.js --url https://site.example/fingerprint2.js \
         --type script \
         --context https://site.example
```

### File Method

This is very slow though if you need to check a lot of requests, since you
end up re-parsing the rules in the filter lists (i.e., `--rules`, defaults
to the include, out-of-date versions of `easylist.txt` and `easyprivacy.txt`
in `resources/`) for each check.

Instead, you can check a large number of requests by encoding each
request as a JSON document, and instructing this tool to read them, either
from a file (e.g., `--requests <PATH>`) or from STDIN (i.e., `--requests -`).

```
echo '{"url": "https://site.example/script.js", "type": "script", "context": "https://site.example"}' > /tmp/requests.json
echo '{"url": "https://site.example/img.png", "type": "image", "context": "https://site.example"}' >> /tmp/requests.json
echo '{"url": "https://site.example/styles.css", "type": "stylesheet", "context": "https://site.example"}' >> /tmp/requests.json

./run.js --requests /tmp/requests.json
```

## Arguments and Options

```
optional arguments:
  -h, --help            show this help message and exit
  -v, --version         show program's version number and exit
  --requests REQUESTS   Path to a file of requests to check filter list rules
                        against (or, by default, STDIN).

                        This input should be lines of JSON documents, one
                        document per line. This JSON text must have the
                        following keys: "url", "context", and "type", which
                        corresponds to the --url, --context, and --type
                        arguments.

                        Use "-" to read from stdin.
  --url URL             The full URL to check against the provided filter
                        lists.
  --context CONTEXT     The security context the request occurred in, as a
                        full URL
  --type {
    Attribution resource,
    Audio,
    CSS resource,
    CSS stylesheet,
    Dictionary,
    Document,
    Fetch,
    Font,
    Icon,
    Image,
    Internal resource,
    Link element resource,
    Link prefetch resource,
    Manifest,
    Mock,
    Other resource,
    Processing instruction,
    SVG Use element resource,
    SVG document,
    Script,
    SpeculationRule,
    Text track,
    Track,
    User Agent CSS resource,
    Video,
    XML resource,
    XMLHttpRequest,
    XSL stylesheet,
    beacon,
    csp_report,
    document,
    font,
    image,
    media,
    object,
    other,
    ping,
    script,
    speculative,
    stylesheet,
    sub_frame,
    web_manifest,
    websocket,
    xbl,
    xhr,
    xml_dtd,
    xslt}
                        The type of the request, using either i. the types
                        defined by filter list projects (which are all in
                        lowercase, e.g., "xhr" or "stylesheet"), or ii. the
                        types defined in the Chromium source (which start with
                        an uppercase character, e.g., "XMLHttpRequest" or "CSS
                        stylesheet")
  --rules [RULES ...]   One or more paths to files of filter list rules to
                        check the request against. By default uses bundled
                        old-and-outdated versions of easylist and easyprivacy
  --verbose             Print information about what rule(s) the request
                        matched.
```
