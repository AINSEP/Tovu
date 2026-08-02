# HTTP Client — Specification

**Source files analyzed:**
- `wp-includes/class-wp-http.php`
- `wp-includes/http.php`
- `wp-includes/class-wp-http-requests-response.php`
- `wp-includes/class-wp-http-response.php`
- `wp-includes/class-wp-http-cookie.php`
- `wp-includes/class-wp-http-proxy.php`

---

## 1. Overview

`WP_Http` is WordPress's HTTP client abstraction layer. It provides a single unified API for making outbound HTTP requests regardless of the underlying transport mechanism. The class wraps the bundled `WpOrg\Requests` library (a fork of the Requests PHP library) and adds WordPress-specific behaviors: hook integration, cookie handling, SSRF protection, proxy support, and request blocking controls.

All public-facing HTTP functions (`wp_remote_get`, `wp_remote_post`, etc.) are thin wrappers around a single shared `WP_Http` instance returned by the private `_wp_http_get_object()` singleton factory.

**Supported protocols**: HTTP and HTTPS only. `ftp://`, `file://`, and all other schemes are rejected.

**Transport**: The underlying HTTP transport is provided by `WpOrg\Requests\Requests::request()`. The Requests library is autoloaded from `wp-includes/Requests/src/Autoload.php`. The CA certificate bundle is set to `wp-includes/certificates/ca-bundle.crt`.

---

## 2. Public API

### `wp_remote_request(url, args?)`

The base function. Makes an HTTP request using the method specified in `args.method` (defaults to `GET`).

### `wp_remote_get(url, args?)`

Shortcut for `wp_remote_request` with `method: 'GET'`.

### `wp_remote_post(url, args?)`

Shortcut for `wp_remote_request` with `method: 'POST'`.

### `wp_remote_head(url, args?)`

Shortcut for `wp_remote_request` with `method: 'HEAD'`. Additionally, the default value of `redirection` is overridden to `0` for HEAD requests (no redirects by default).

---

### Request Arguments

All four functions accept an `args` object. The full set of recognized properties and their defaults:

```typescript
interface HttpRequestArgs {
  method?: 'GET' | 'POST' | 'HEAD' | 'PUT' | 'DELETE' | 'TRACE' | 'OPTIONS' | 'PATCH';
  // Default: 'GET'

  timeout?: number;
  // How long to keep the connection open, in seconds (float allowed).
  // Default: 5 (filterable via `http_request_timeout` filter)

  redirection?: number;
  // Maximum number of redirects to follow.
  // Default: 5 (filterable via `http_request_redirection_count` filter)
  // HEAD requests override this to 0 before the filter runs.

  httpversion?: '1.0' | '1.1';
  // HTTP protocol version to use.
  // Default: '1.0' (filterable via `http_request_version` filter)

  'user-agent'?: string;
  // User-Agent header value.
  // Default: 'WordPress/{version}; {siteurl}' (filterable via `http_headers_useragent` filter)

  reject_unsafe_urls?: boolean;
  // Whether to run the URL through wp_http_validate_url() before sending.
  // If true, also validates all redirect URLs.
  // Default: false (filterable via `http_request_reject_unsafe_urls` filter)

  blocking?: boolean;
  // Whether the caller needs the response.
  // If false, the request is fire-and-forget; a stub empty response is returned immediately.
  // Default: true

  headers?: Record<string, string> | string;
  // Request headers. String headers are parsed into an object.
  // Default: {}

  cookies?: Array<WpHttpCookie | { name: string; value: string }> | Record<string, string>;
  // Cookies to send. Plain name/value pairs are wrapped into WpHttpCookie objects.
  // Default: []

  body?: string | Record<string, string> | null;
  // Request body. Non-GET/HEAD requests send the body as the request body.
  // Default: null

  compress?: boolean;
  // Whether to compress the request body before sending.
  // Default: false

  decompress?: boolean;
  // Whether to decompress a compressed response body.
  // Default: true

  sslverify?: boolean;
  // Whether to verify the SSL certificate.
  // Default: true (filterable via `https_ssl_verify` filter)

  sslcertificates?: string;
  // Absolute path to a CA bundle .crt file.
  // Default: ABSPATH + WPINC + '/certificates/ca-bundle.crt'

  stream?: boolean;
  // Whether to stream the response to a file instead of holding it in memory.
  // If true and no filename is given, a temp file is used.
  // When streaming, `blocking` is forced to true.
  // Default: false

  filename?: string | null;
  // Destination file path when stream is true.
  // Default: null (uses WP temp dir + URL basename)

  limit_response_size?: number | null;
  // Maximum number of bytes to read from the response body.
  // Default: null (no limit)
}
```

---

### `WP_Http.request()` — Core Implementation

This is the single method that all public functions ultimately call.

**Execution flow:**

1. Build the `defaults` object. Several defaults are themselves the results of filter calls (`http_request_timeout`, `http_request_redirection_count`, `http_request_version`, `http_headers_useragent`, `http_request_reject_unsafe_urls`). These filters fire on every request.

2. Pre-parse `args` to check the method before merging. If `method === 'HEAD'`, set `defaults.redirection = 0`.

3. Merge `args` into `defaults` (`args` wins on conflicts). Apply `http_request_args` filter to the merged result.

4. Store `_redirection = redirection` in the merged args. This internal copy tracks the decrementing redirect counter separately from the original requested limit.

5. Apply `pre_http_request` filter. If it returns anything other than `false`, short-circuit and return that value immediately. This is the primary extension point for mock/stub transport implementations.

6. If `reject_unsafe_urls` is true, run `wp_http_validate_url(url)`. If validation fails (returns false), the URL becomes empty/falsy.

7. Sanitize the URL through `wp_kses_bad_protocol`, restricting to `http`, `https`, and `ssl` schemes.

8. Parse the URL. If the URL is empty or has no scheme, return a `WP_Error('http_request_failed', 'A valid URL was not provided.')`.

9. Check `this.block_request(url)`. If true (request is blocked by `WP_HTTP_BLOCK_EXTERNAL` logic), return `WP_Error('http_request_not_executed', ...)`.

10. If `stream` is true and no `filename` is set, auto-assign to `get_temp_dir() + basename(url)`. Force `blocking = true`. Verify the destination directory is writable.

11. Normalize `headers` to an object if passed as a string.

12. Build the `options` object for the Requests library:
    - `timeout`, `useragent` (from `user-agent`), `blocking`, a `hooks` object.
    - Register `browser_redirect_compatibility` on `requests.before_redirect`.
    - Register `validate_redirects` on `requests.before_redirect` if `reject_unsafe_urls` is true.
    - If `stream`, set `options.filename`.
    - If `redirection === 0`, set `options.follow_redirects = false`. Otherwise set `options.redirects = redirection`.
    - If `limit_response_size` is set, pass as `options.max_bytes`.
    - Convert cookies via `normalize_cookies()` into the Requests cookie jar format.
    - If `sslverify` is false: set `options.verify = false` and `options.verifyname = false`. If true: set `options.verify = sslcertificates` path.
    - Apply `https_ssl_verify` filter to `options.verify`.
    - For non-GET/non-HEAD methods, set `options.data_format = 'body'`.

13. Check proxy configuration. If `WP_HTTP_Proxy` is enabled and `send_through_proxy(url)` returns true, construct proxy options.

14. Call `WpOrg\Requests\Requests::request(url, headers, body, method, options)`.

15. On success, wrap the response in `WP_HTTP_Requests_Response`, call `to_array()`, then attach the response object itself to the array under the `http_response` key.

16. On exception (`WpOrg\Requests\Exception`), return `WP_Error('http_request_failed', exceptionMessage)`.

17. Fire the `http_api_debug` action with the response.

18. If the response is a `WP_Error`, return it.

19. If `blocking` is false, return a stub empty response (empty headers, empty body, `{ code: false, message: false }`, empty cookies, null http_response).

20. Apply `http_response` filter to the successful response array and return.

---

## 3. Response Structure

All HTTP functions return either a response array or a `WP_Error` on failure.

```typescript
interface HttpResponse {
  headers: CaseInsensitiveDictionary;
  // Response headers. Keys are lowercased. Duplicate headers are returned as arrays.

  body: string;
  // Response body as a string. Empty string if no body (HEAD, stream, non-blocking).

  response: {
    code: number | false;
    // HTTP status code as an integer. false if non-blocking or on error.
    message: string | false;
    // HTTP status message (e.g. "OK", "Not Found"). false if non-blocking.
  };

  cookies: WpHttpCookie[];
  // Array of cookies set by the server via Set-Cookie headers.

  filename: string | null;
  // Path to the streamed file if stream was true, otherwise null.

  http_response: WpHttpRequestsResponse | null;
  // The WP_HTTP_Requests_Response wrapper object around the raw Requests response.
  // null for non-blocking requests.
}

type HttpResult = HttpResponse | WpError;
```

### `CaseInsensitiveDictionary`

Header names are normalized to lowercase. If a response contains multiple headers with the same name, they are stored as an array of strings. A single-value header is stored as a plain string.

### Response Accessor Functions

These functions accept a response value (either the array or a `WP_Error`) and return safe values in both cases.

```typescript
function wpRemoteRetrieveHeaders(response: HttpResult): CaseInsensitiveDictionary | Record<string, never>;
// Returns {} if response is WP_Error or headers key is missing.

function wpRemoteRetrieveHeader(response: HttpResult, header: string): string | string[];
// Returns '' if response is WP_Error, headers missing, or header not found.
// Returns an array if multiple headers with that name were received.

function wpRemoteRetrieveResponseCode(response: HttpResult): number | '';
// Returns '' if response is WP_Error or response.code missing.

function wpRemoteRetrieveResponseMessage(response: HttpResult): string | '';
// Returns '' if response is WP_Error or response.message missing.

function wpRemoteRetrieveBody(response: HttpResult): string;
// Returns '' if response is WP_Error or body key is missing.

function wpRemoteRetrieveCookies(response: HttpResult): WpHttpCookie[];
// Returns [] if response is WP_Error or cookies is empty.

function wpRemoteRetrieveCookie(response: HttpResult, name: string): WpHttpCookie | '';
// Returns the first matching cookie by name, or '' if not found.

function wpRemoteRetrieveCookieValue(response: HttpResult, name: string): string;
// Returns the value of the matching cookie, or '' if not found.
```

---

## 4. Transport Selection

### Requests Library

WordPress bundles `WpOrg\Requests` (formerly `Requests` by rmccue). This library handles the actual TCP connections. WordPress's `WP_Http` does not implement its own transport; it is a configuration and policy wrapper around this library.

The library is autoloaded from `wp-includes/Requests/src/Autoload.php`. On first use, the CA certificate bundle is registered:
```
WpOrg\Requests\Requests::set_certificate_path(ABSPATH + WPINC + '/certificates/ca-bundle.crt')
```

### Transport Negotiation

The Requests library internally selects the best available transport (cURL preferred, PHP streams as fallback). WordPress does not control this directly. The legacy `_get_first_available_transport()` method and the `http_api_transports` filter are deprecated since WordPress 6.4.

### SSL Verification

SSL verification is enabled by default (`sslverify: true`). The `https_ssl_verify` filter is applied to the final SSL verification value (which can be `false`, `true`, or a path to a CA bundle). The default CA bundle path is `wp-includes/certificates/ca-bundle.crt`.

For local loopback requests (e.g. the cron spawn), the `https_local_ssl_verify` filter is used separately and defaults to `false`.

### `wp_http_supports(capabilities, url?)`

Checks whether the current environment's HTTP transport supports a given capability set. Delegates to `WpOrg\Requests\Requests::has_capabilities()`. If `url` is provided and it's HTTPS, `ssl` capability is automatically added to the check.

---

## 5. Safe URL Checking

### `wp_http_validate_url(url)`

Validates a URL for safe use in HTTP requests. Returns the original URL string if valid, or `false` if unsafe.

**Validation steps (in order):**

1. Must be a non-empty, non-numeric string.
2. Must pass `wp_kses_bad_protocol` with only `http` and `https` allowed. The cleaned URL must match the original (case-insensitively). This rejects protocol-relative URLs, URLs with embedded null bytes, and anything that was altered by sanitization.
3. Must parse successfully with a non-empty `host`.
4. Must not contain `user` or `pass` components (no `http://user:pass@host/` URLs).
5. The host must not contain any of the characters `:#?[]` (rejects malformed hosts).
6. **Private IP check** (only for non-same-host URLs):
   - If the host is an IPv4 address, it is used directly.
   - If the host is a hostname, it is resolved via DNS (`gethostbyname`). If DNS resolution fails (returns the hostname itself), the URL is rejected.
   - Resolved IP is rejected if it falls into any private/loopback range:
     - `0.x.x.x` (reserved)
     - `10.x.x.x` (private)
     - `127.x.x.x` (loopback)
     - `172.16.x.x` – `172.31.x.x` (private)
     - `192.168.x.x` (private)
   - If the IP is private, the `http_request_host_is_external` filter is checked. If it returns `true`, the URL is allowed through.
7. **Port check** (only if a port is specified in the URL):
   - Allowed ports: `80`, `443`, `8080` (filterable via `http_allowed_safe_ports`).
   - Exception: if the URL's host matches the site's own home URL host and the port matches the site's own port, it is allowed.
   - Any other port is rejected.

**DNS resolution note**: In a TypeScript implementation, DNS resolution must be asynchronous. The validation logic must perform an async DNS lookup and check the resolved IP against the private ranges. This is a critical behavioral difference from the synchronous PHP implementation.

### `WP_Http.block_request(uri)`

Separate from `wp_http_validate_url`, this method checks whether all external requests should be blocked.

**Logic:**

1. If `WP_HTTP_BLOCK_EXTERNAL` constant is not defined or is false, always return `false` (allow).
2. Parse the URI. If parsing fails, return `true` (block).
3. If the host is `localhost` or matches the site's own host, apply the `block_local_requests` filter (default `false` = allow local).
4. If `WP_ACCESSIBLE_HOSTS` constant is not defined, return `true` (block everything external).
5. Parse `WP_ACCESSIBLE_HOSTS` as a comma-separated list. Supports `*` wildcards (e.g. `*.wordpress.org`). If the host matches any entry, return `false` (allow). Otherwise return `true` (block).

### SSRF Prevention Summary

`wp_safe_remote_*` functions set `reject_unsafe_urls: true`, which causes the request pipeline to call `wp_http_validate_url` on both the initial URL and every redirect URL. This prevents:
- Requests to localhost and private IP ranges.
- Requests via non-HTTP protocols.
- Requests with embedded credentials.
- Requests to hostnames that do not resolve in DNS.

---

## 6. Cookies

### `WpHttpCookie` Class

Represents a single HTTP cookie for both sending and receiving.

```typescript
interface WpHttpCookieData {
  name: string;
  value: string;
  expires?: number | string | null;  // Unix timestamp or date string; null = session cookie
  path?: string;                     // Default '/' (or path of the requesting URL)
  domain?: string;                   // Default: host of the requesting URL
  port?: number | string | null;     // Port or comma-separated port list
  host_only?: boolean;               // Default true; host-only storage flag
}

class WpHttpCookie {
  name: string;
  value: string;
  expires: number | null;    // Always stored as a Unix timestamp or null
  path: string;
  domain: string;
  port: number | string | null;
  host_only: boolean;

  constructor(data: string | WpHttpCookieData, requestedUrl?: string);
  // String input: parsed as a raw Set-Cookie header value.
  // Object input: fields set directly. `expires` is converted to a timestamp.
  // requestedUrl: used to derive default `domain` and `path` values.

  test(url: string): boolean;
  // Whether this cookie should be sent to the given URL.
  // Checks: not expired, domain matches, port matches (if set), path matches.

  getHeaderValue(): string;
  // Returns "name=value" for use in the Cookie header.
  // Applies `wp_http_cookie_value` filter to the value before serializing.

  getFullHeader(): string;
  // Returns "Cookie: name=value"

  getAttributes(): { expires: number | string | null; path: string; domain: string };
  // Returns the cookie attributes for conversion to Requests library format.
}
```

### Construction from Set-Cookie Header

When a string is passed to the constructor, it is parsed as a `Set-Cookie` header value:

1. Split on `;`.
2. First segment: split on the first `=`. Left is the name (trimmed), right is the URL-decoded value.
3. Remaining segments: for each `key=val` pair, set `this[key.toLowerCase()] = val`. For `expires`, the value is parsed via `strtotime` (parse as a date string into a Unix timestamp).

### Construction from Object

When an object is passed, fields are mapped directly. The `expires` field is normalized: if it is a string, it is converted to a Unix timestamp.

### Cookie Matching (`test(url)`)

```
1. If name is null, return false.
2. If expires is set and time() > expires, return false.
3. Parse the target URL. Default port to 443 (HTTPS) or 80 (HTTP) if not specified.
4. Resolve cookie domain: use this.domain if set, or default to url.host.
   If domain has no dot, append '.local'.
   Strip leading dot from domain for comparison.
5. URL host must end with cookie domain. (suffix match)
6. If this.port is set, url.port must appear in the comma-separated port list.
7. url.path must start with this.path. (prefix match)
8. Return true if all checks pass.
```

### Sending Cookies

When `cookies` are passed in request args, `normalize_cookies()` converts them to a `WpOrg\Requests\Cookie\Jar`:
- `WpHttpCookie` instances: converted using their `name`, `value`, and `getAttributes()`, with the `host_only` flag preserved.
- Plain scalar name/value pairs: converted to bare Requests cookies.

---

## 7. Redirects

### Default Behavior

The `redirection` argument (default `5`) controls how many redirects are followed. `HEAD` requests override this to `0` (no redirects).

### Redirect Following

Redirects are followed automatically by the `WpOrg\Requests` library based on the `options.redirects` value. WordPress does not implement its own redirect loop.

### Browser Compatibility for 302

WordPress registers a `requests.before_redirect` hook that overrides the redirect method to `GET` when the response status code is `302`. This matches browser behavior (RFC 7231 user-agent discretion) rather than strict HTTP compliance.

```typescript
// Equivalent behavior:
if (originalResponse.statusCode === 302) {
  options.method = 'GET';
}
```

### Redirect URL Validation

When `reject_unsafe_urls` is true, a second `requests.before_redirect` hook validates every redirect URL through `wp_http_validate_url`. If the redirect URL fails validation, the redirect is aborted with an exception (which is caught and returned as `WP_Error`).

### Redirect Header Handling

When multiple `Location` headers are present (e.g., returned after multiple intermediate redirects), the last one is used.

### `WP_Http.handle_redirects(url, args, response)` (Static)

A legacy static method for manual redirect handling (used when the Requests library is not handling redirects). Only acts if `response.headers.location` exists and the status code is in the 3xx range.

- Decrements `args.redirection`. If it reaches 0, returns `WP_Error('http_request_failed', 'Too many redirects.')`.
- Converts relative redirect URLs to absolute using `make_absolute_url`.
- POST requests to 302 or 303 are converted to GET.
- Copies any applicable cookies from the response to the next request.
- Calls `wp_remote_request` recursively.

---

## 8. Safe Remote Variants

`wp_safe_remote_request`, `wp_safe_remote_get`, `wp_safe_remote_post`, and `wp_safe_remote_head` are identical to their non-safe counterparts except they force `reject_unsafe_urls: true` before invoking the underlying `WP_Http` method.

```typescript
function wpSafeRemoteGet(url: string, args: HttpRequestArgs = {}): HttpResult {
  args.reject_unsafe_urls = true;
  return wpHttpGetObject().get(url, args);
}
```

The `reject_unsafe_urls` flag activates two behaviors:
1. The initial URL is validated by `wp_http_validate_url` before the request is sent.
2. Each redirect URL is validated before following.

**Use case**: Use safe variants whenever the URL originates from user input, database content, or any untrusted source. The standard (non-safe) variants are for URLs that have already been validated or are hardcoded.

---

## 9. Proxy Support

### `WP_HTTP_Proxy` Class

Reads proxy configuration from PHP constants and determines whether a given request should be routed through the proxy.

```typescript
class WpHttpProxy {
  isEnabled(): boolean;
  // True if WP_PROXY_HOST and WP_PROXY_PORT are both defined.

  useAuthentication(): boolean;
  // True if WP_PROXY_USERNAME and WP_PROXY_PASSWORD are both defined.

  host(): string;        // WP_PROXY_HOST or ''
  port(): string;        // WP_PROXY_PORT or ''
  username(): string;    // WP_PROXY_USERNAME or ''
  password(): string;    // WP_PROXY_PASSWORD or ''

  authentication(): string;
  // Returns "username:password"

  authenticationHeader(): string;
  // Returns "Proxy-Authorization: Basic <base64(username:password)>"

  sendThroughProxy(uri: string): boolean;
  // Whether this request should go through the proxy.
  // Always false for localhost and the site's own hostname.
  // Applies `pre_http_send_through_proxy` filter first.
  // If WP_PROXY_BYPASS_HOSTS is defined, checks the comma-separated list
  // (with wildcard support) and returns false for matching hosts.
}
```

### Configuration Constants

```
WP_PROXY_HOST           — hostname or IP of the proxy server
WP_PROXY_PORT           — port number
WP_PROXY_USERNAME       — optional; for authenticated proxies
WP_PROXY_PASSWORD       — optional; for authenticated proxies
WP_PROXY_BYPASS_HOSTS   — comma-separated list of hosts to NOT proxy (wildcards supported, e.g. "*.wordpress.org")
```

Localhost and the site's own host are always bypassed, even without `WP_PROXY_BYPASS_HOSTS`.

Only HTTP proxies are supported. HTTPS proxies are not supported by the underlying library.

---

## 10. Key Hooks and Filters

### Filters Applied on Every Request

| Filter | Arguments | Purpose |
|---|---|---|
| `http_request_timeout` | `(5: number, url: string)` | Override the default timeout in seconds. |
| `http_request_redirection_count` | `(5: number, url: string)` | Override the default maximum redirect count. |
| `http_request_version` | `('1.0': string, url: string)` | Override the default HTTP version. |
| `http_headers_useragent` | `('WordPress/...: string, url: string)` | Override the default User-Agent. |
| `http_request_reject_unsafe_urls` | `(false: boolean, url: string)` | Override whether URL safety is enforced. |
| `http_request_args` | `(args: HttpRequestArgs, url: string)` | Modify the full merged args object before the request is made. This is the recommended hook for modifying headers, adding authentication, etc. |
| `pre_http_request` | `(false, args: HttpRequestArgs, url: string)` | Short-circuit the request entirely. Return a response array, WP_Error, or false to proceed normally. |
| `https_ssl_verify` | `(true \| false \| string, url: string)` | Override SSL verification. Can be a boolean or a path to a CA bundle. |
| `https_local_ssl_verify` | `(false)` | Override SSL verification specifically for loopback/local requests. |
| `http_response` | `(response: HttpResponse, args: HttpRequestArgs, url: string)` | Modify the successful response before it is returned to the caller. |

### Filters for URL and Request Safety

| Filter | Arguments | Purpose |
|---|---|---|
| `http_request_host_is_external` | `(false: boolean, host: string, url: string)` | Allow a specific private/local IP to be treated as external (overrides SSRF block). |
| `http_allowed_safe_ports` | `([80, 443, 8080]: number[], host: string, url: string)` | Override the list of ports considered safe for URL validation. |
| `block_local_requests` | `(false: boolean)` | Whether to block requests to localhost and the site's own host when `WP_HTTP_BLOCK_EXTERNAL` is active. |

### Filters for Proxy

| Filter | Arguments | Purpose |
|---|---|---|
| `pre_http_send_through_proxy` | `(null \| boolean, uri: string, check: ParsedUrl, home: ParsedUrl)` | Short-circuit proxy routing decision. Return true to force through proxy, false to bypass, null to continue. |

### Filters for Cookies

| Filter | Arguments | Purpose |
|---|---|---|
| `wp_http_cookie_value` | `(value: string, name: string)` | Modify a cookie value before it is serialized into the `Cookie` header. |

### Actions

| Action | Arguments | Purpose |
|---|---|---|
| `http_api_debug` | `(response: HttpResult, context: string, class: string, args: HttpRequestArgs, url: string)` | Fires after every HTTP response (success or failure). `context` is always `'response'`. Used for logging and debugging. |

### Filters for CORS / Origin Handling

| Filter | Arguments | Purpose |
|---|---|---|
| `http_origin` | `(origin: string)` | Modify the detected HTTP Origin header value. |
| `allowed_http_origins` | `(origins: string[])` | Modify the list of allowed HTTP origins for CORS checks. |
| `allowed_http_origin` | `(origin: string, originalArg: string)` | Modify the result of `is_allowed_http_origin()`. |

---

## 11. TypeScript Interface Sketch

```typescript
// ---- Request and Response types ----

type HttpMethod = 'GET' | 'POST' | 'HEAD' | 'PUT' | 'DELETE' | 'TRACE' | 'OPTIONS' | 'PATCH';

interface HttpRequestArgs {
  method?: HttpMethod;
  timeout?: number;
  redirection?: number;
  httpversion?: '1.0' | '1.1';
  'user-agent'?: string;
  reject_unsafe_urls?: boolean;
  blocking?: boolean;
  headers?: Record<string, string> | string;
  cookies?: HttpCookieInput[];
  body?: string | Record<string, string> | null;
  compress?: boolean;
  decompress?: boolean;
  sslverify?: boolean;
  sslcertificates?: string;
  stream?: boolean;
  filename?: string | null;
  limit_response_size?: number | null;
  // Internal: populated automatically, do not pass
  _redirection?: number;
}

type HttpCookieInput = WpHttpCookie | { name: string; value: string } | string;

interface HttpResponseData {
  headers: Map<string, string | string[]>;  // case-insensitive, lowercase keys
  body: string;
  response: {
    code: number | false;
    message: string | false;
  };
  cookies: WpHttpCookie[];
  filename: string | null;
  http_response: WpHttpRequestsResponse | null;
}

interface WpError {
  code: string;
  message: string;
  data?: unknown;
}

type HttpResult = HttpResponseData | WpError;

// ---- Cookie class ----

interface WpHttpCookieFields {
  name: string;
  value: string;
  expires?: number | string | null;
  path?: string;
  domain?: string;
  port?: number | string | null;
  host_only?: boolean;
}

class WpHttpCookie {
  name: string;
  value: string;
  expires: number | null;
  path: string;
  domain: string;
  port: number | string | null;
  host_only: boolean;

  constructor(data: string | WpHttpCookieFields, requestedUrl?: string);
  test(url: string): boolean;
  getHeaderValue(): string;
  getFullHeader(): string;
  getAttributes(): { expires: number | null; path: string; domain: string };
}

// ---- Response wrapper class ----

class WpHttpResponse {
  data: unknown;
  headers: Record<string, string>;
  status: number;

  constructor(data?: unknown, status?: number, headers?: Record<string, string>);
  getData(): unknown;
  setData(data: unknown): void;
  getHeaders(): Record<string, string>;
  setHeaders(headers: Record<string, string>): void;
  header(key: string, value: string, replace?: boolean): void;
  getStatus(): number;
  setStatus(code: number): void;
}

class WpHttpRequestsResponse extends WpHttpResponse {
  protected filename: string | null;

  constructor(response: RawRequestsResponse, filename?: string);
  getResponseObject(): RawRequestsResponse;
  getHeaders(): Map<string, string | string[]>;
  getCookies(): WpHttpCookie[];
  toArray(): HttpResponseData;
}

// ---- Proxy class ----

class WpHttpProxy {
  isEnabled(): boolean;
  useAuthentication(): boolean;
  host(): string;
  port(): string;
  username(): string;
  password(): string;
  authentication(): string;
  authenticationHeader(): string;
  sendThroughProxy(uri: string): boolean;
}

// ---- Main HTTP client ----

class WpHttp {
  request(url: string, args?: HttpRequestArgs): Promise<HttpResult>;
  get(url: string, args?: HttpRequestArgs): Promise<HttpResult>;
  post(url: string, args?: HttpRequestArgs): Promise<HttpResult>;
  head(url: string, args?: HttpRequestArgs): Promise<HttpResult>;
  blockRequest(uri: string): boolean;
  static normalizeCookies(cookies: HttpCookieInput[]): CookieJar;
  static browserRedirectCompatibility(location: string, headers: object, data: unknown, options: object, original: RawResponse): void;
  static validateRedirects(location: string): void;
  static makeAbsoluteUrl(maybeRelativePath: string, url: string): string;
}

// ---- Public API functions ----

function wpRemoteRequest(url: string, args?: HttpRequestArgs): Promise<HttpResult>;
function wpRemoteGet(url: string, args?: HttpRequestArgs): Promise<HttpResult>;
function wpRemotePost(url: string, args?: HttpRequestArgs): Promise<HttpResult>;
function wpRemoteHead(url: string, args?: HttpRequestArgs): Promise<HttpResult>;
function wpSafeRemoteRequest(url: string, args?: HttpRequestArgs): Promise<HttpResult>;
function wpSafeRemoteGet(url: string, args?: HttpRequestArgs): Promise<HttpResult>;
function wpSafeRemotePost(url: string, args?: HttpRequestArgs): Promise<HttpResult>;
function wpSafeRemoteHead(url: string, args?: HttpRequestArgs): Promise<HttpResult>;

function wpRemoteRetrieveHeaders(response: HttpResult): Map<string, string | string[]>;
function wpRemoteRetrieveHeader(response: HttpResult, header: string): string | string[];
function wpRemoteRetrieveResponseCode(response: HttpResult): number | '';
function wpRemoteRetrieveResponseMessage(response: HttpResult): string | '';
function wpRemoteRetrieveBody(response: HttpResult): string;
function wpRemoteRetrieveCookies(response: HttpResult): WpHttpCookie[];
function wpRemoteRetrieveCookie(response: HttpResult, name: string): WpHttpCookie | '';
function wpRemoteRetrieveCookieValue(response: HttpResult, name: string): string;

function wpHttpValidateUrl(url: string): Promise<string | false>;
// Async in TypeScript due to DNS resolution requirement.

// ---- HTTP Status Code constants ----
const HTTP_CONTINUE = 100;
const OK = 200;
const CREATED = 201;
const NO_CONTENT = 204;
const MOVED_PERMANENTLY = 301;
const FOUND = 302;
const NOT_MODIFIED = 304;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const INTERNAL_SERVER_ERROR = 500;
// ... (full list mirrors WP_Http class constants)
```

---

## 12. Design Patterns to Carry Over

1. **Single shared instance.** All public API functions (`wp_remote_get`, etc.) share one `WP_Http` instance via a singleton factory (`_wp_http_get_object`). In TypeScript, use a module-level singleton or a DI container singleton. Do not construct a new client instance per request.

2. **All public functions are thin facades.** `wp_remote_get` does nothing except set `method: 'GET'` and delegate to the shared instance's `request()`. The single `request()` method contains all logic. Reproduce this: one core request method, thin helpers that set the method default.

3. **pre_http_request as a first-class mock point.** The `pre_http_request` filter fires before any network I/O. Returning a response array from this filter short-circuits everything. In testing, this is how HTTP calls are intercepted without any real network activity. Reproduce this as a middleware/interceptor layer at the very beginning of the request pipeline.

4. **`reject_unsafe_urls` is opt-in, not the default.** By design, the basic `wp_remote_*` functions do not validate the URL for SSRF safety. Only `wp_safe_remote_*` functions do. Replicate this API split: keep the unsafe variants as-is, and implement the safe variants as wrappers that inject `reject_unsafe_urls: true`.

5. **DNS resolution is part of URL validation.** `wp_http_validate_url` resolves hostnames via DNS and checks the resolved IP against private ranges. In PHP this is synchronous; in TypeScript it must be async. The `wpHttpValidateUrl` function signature must be `async` and return a `Promise<string | false>`. All callers (request pipeline, redirect validation) must `await` it.

6. **Case-insensitive response headers.** Response headers use case-insensitive keys. In TypeScript, implement this as a `Map` with a lowercasing key proxy, or a wrapper class that normalizes lookups to lowercase. This must apply to all header access, including when checking for `location` during redirect handling.

7. **Non-blocking requests return immediately with a stub.** When `blocking: false`, the HTTP library is instructed not to wait for a response. The function returns immediately with a stub response `{ headers: {}, body: '', response: { code: false, message: false }, cookies: [], http_response: null }`. Callers cannot know whether the request succeeded or what the response was. In Node.js, this is equivalent to firing the request with no `await` and returning the stub.

8. **Cookie test() is used for forwarding cookies on redirect.** When following a redirect, `WP_Http.handle_redirects()` tests each cookie from the current response against the redirect URL using `cookie.test(redirectUrl)`. Only cookies that pass the test are forwarded. Reproduce this logic faithfully (domain suffix match, path prefix match, port list match, expiry check).

9. **Block external requests at the instance level.** `WP_Http.block_request()` is checked before every request if `WP_HTTP_BLOCK_EXTERNAL` is configured. This is a site-wide setting. In TypeScript, check a config value at the start of every `request()` call.

10. **`http_api_debug` fires for every response including errors.** The debug action fires unconditionally after the request completes, whether it succeeded or failed. It fires before the early-return for non-blocking requests. This makes it reliable for logging and monitoring all outbound HTTP activity regardless of outcome.

11. **Defaults are themselves filterable at construction time.** Several defaults (timeout, redirection, httpversion, user-agent) are set by calling filters at the start of `request()`. This means the filter runs on every request, with the URL available as context. Reproduce this: do not cache default values; compute them fresh for each request invocation via the filter system.

12. **`_redirection` vs `redirection`.** The args object carries both `redirection` (the original requested max redirects, used for decrementing in `handle_redirects`) and `_redirection` (a copy of the original, set once and never decremented, used for logging and context). Preserve this distinction.

## Tovu Reconstruction Notes

### Why this exists

WordPress's HTTP client exists to give the platform one outbound request path with filters, proxy support, SSRF controls, and a stable response shape. Tovu should treat that as an outbound transport port, not as a grab bag of ad hoc fetch calls.

### What Tovu should preserve

- A single request API with method, timeout, redirect, header, cookie, and body controls
- Filterable defaults and pre/post request interception points
- SSRF and external-request blocking policy before transport execution
- A consistent response DTO and error path

### What Tovu can simplify

- Tovu does not need the exact Requests library wrapper or every compatibility knob
- Streaming and proxy support can be thinner if the platform does not need them immediately
- Legacy response shims should stay behind the transport adapter boundary

### Possible Tovu seams

- `src/network/http/` for request orchestration and response normalization
- `src/network/http/transports/` for provider-specific adapters
- `src/network/http/policy/` for SSRF, proxy, and allowlist checks
- `src/core/ports/HttpClientPort.ts` as the main abstraction for callers

### Suggested priority

- `V1`: request/response contract, policy enforcement, and filterable defaults
- `Later`: streaming, proxy nuance, and compatibility layers
