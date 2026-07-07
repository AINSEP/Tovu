# REST API — Specification

**Source files analyzed:**
- `wp-includes/rest-api.php`
- `wp-includes/rest-api/class-wp-rest-server.php`
- `wp-includes/rest-api/class-wp-rest-request.php`
- `wp-includes/rest-api/class-wp-rest-response.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-controller.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-posts-controller.php` (representative endpoint)
- `wp-includes/rest-api/fields/` (meta fields registry)
- `wp-includes/rest-api/search/` (search handlers)

---

## 1. Overview

The REST API is a JSON-over-HTTP interface that exposes WordPress data (posts, users, taxonomies, settings, etc.) via conventional URL endpoints. It is versioned and namespaced, living under the `wp-json/` URL prefix by default.

### Architecture Summary

The system has four layers:

1. **URL routing** — Rewrite rules map `wp-json/*` to `?rest_route=*`. The query var triggers `rest_api_loaded()`, which instantiates a `WP_REST_Server` and calls `serve_request()`.
2. **Server** (`WP_REST_Server`) — Handles the full HTTP lifecycle: authentication, route matching via regex, parameter validation and sanitization, permission checking, dispatch, and JSON encoding.
3. **Request/Response objects** (`WP_REST_Request`, `WP_REST_Response`) — Encapsulate all per-request data cleanly. The request holds all input sources (URL params, query string, body, JSON, files, headers). The response holds the data, status, headers, and HAL-style links.
4. **Controllers** (`WP_REST_Controller` subclasses) — Each resource type (posts, users, taxonomies, etc.) extends the base controller and registers its own routes with specific callbacks, permission callbacks, and argument schemas.

### Versioning and Base URL

- **API version constant**: `REST_API_VERSION = '2.0'`
- **URL prefix**: `wp-json` (configurable via the `rest_url_prefix` filter)
- **Full base URL**: `{home_url}/wp-json/` (with pretty permalinks) or `{home_url}/index.php?rest_route=/` (without)
- **All route paths start with** `/namespace/version/resource`

### Namespace Convention

Namespaces take the form `vendor/v{n}`, e.g. `wp/v2`. They must not start or end with a slash. All built-in routes live under `wp/v2`. Custom plugins should use a unique namespace like `my-plugin/v1`.

### URL Structure

```
/wp-json/{namespace}/{resource}
/wp-json/wp/v2/posts           GET  → list posts
/wp-json/wp/v2/posts           POST → create post
/wp-json/wp/v2/posts/{id}      GET  → get single post
/wp-json/wp/v2/posts/{id}      PUT/PATCH → update post
/wp-json/wp/v2/posts/{id}      DELETE → delete post
```

Route patterns are stored as PHP-style named capture group regexes:
```
/wp/v2/posts/(?P<id>[\d]+)
```
which produce URL params like `{ id: "42" }`.

---

## 2. WP_REST_Server

`WP_REST_Server` is a singleton (one global `$wp_rest_server` instance). It is the central dispatcher.

### HTTP Method Constants

```typescript
const READABLE  = 'GET';
const CREATABLE = 'POST';
const EDITABLE  = 'POST, PUT, PATCH';
const DELETABLE = 'DELETE';
const ALLMETHODS = 'GET, POST, PUT, PATCH, DELETE';
```

### Internal State

```typescript
interface RestServer {
  namespaces: Record<string, Record<string, true>>;  // namespace → { route → true }
  endpoints: Record<string, RouteArgs>;               // route regex → handler array
  routeOptions: Record<string, RouteOptions>;         // route regex → route-level options
  embedCache: Record<string, unknown>;                // href → embedded response data
  dispatchingRequests: RestRequest[];                 // stack of in-progress requests
}
```

### serve_request() Lifecycle

This is the entry point called by `rest_api_loaded()`. Steps in exact order:

1. **Reset current user** — If `$current_user` is a non-existent `WP_User` instance, nullify it so auth checks can re-evaluate.
2. **JSONP check** — If `_jsonp` query param is present and JSONP is enabled, set `Content-Type: application/javascript`. Otherwise `application/json`.
3. **Send fixed headers**:
   - `Content-Type: application/json; charset={blog_charset}`
   - `X-Robots-Tag: noindex`
   - `Link: <{api_root}>; rel="https://api.w.org/"`
   - `X-Content-Type-Options: nosniff`
4. **JSONP validation** — If JSONP callback present but disabled, return 400 error. If callback string is invalid (not a valid JS identifier), return 400 error.
5. **Build request object** — Create `WP_REST_Request` from `$_SERVER['REQUEST_METHOD']` and path. Populate query params from `$_GET`, body params from `$_POST`, file params from `$_FILES`, headers from `$_SERVER`, raw body from `php://input`.
6. **HTTP method override** — Check `$_GET['_method']` first, then `$_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE']`. Override the request method if present.
7. **CORS expose headers** — Send `Access-Control-Expose-Headers: X-WP-Total, X-WP-TotalPages, Link` (filterable via `rest_exposed_cors_headers`).
8. **CORS allow headers** — Send `Access-Control-Allow-Headers: Authorization, X-WP-Nonce, Content-Disposition, Content-MD5, Content-Type` (filterable via `rest_allowed_cors_headers`).
9. **Authentication** — Call `check_authentication()`. If it returns a `WP_Error`, skip dispatch.
10. **Dispatch** — Call `dispatch($request)`.
11. **Normalize result** — Wrap result in `WP_REST_Response` via `rest_ensure_response()`. Convert any `WP_Error` to a response via `error_to_response()`.
12. **Post-dispatch filter** — Apply `rest_post_dispatch` filter.
13. **Envelope** — If `_envelope` query param is present, wrap response in envelope object.
14. **Send headers** — Send all response headers from the response object.
15. **Send status** — Call `status_header($code)`.
16. **No-cache headers** — If user is logged in (`is_user_logged_in()`) or method override produced a 4xx, send no-cache headers.
17. **Pre-serve filter** — Apply `rest_pre_serve_request` filter. If it returns `true`, skip body output.
18. **HEAD shortcut** — If `HEAD` method, return `null` without body.
19. **Embed links** — Process `_embed` query param. Resolve embedded sub-requests.
20. **Pre-echo filter** — Apply `rest_pre_echo_response` filter.
21. **204 shortcut** — If status is 204 or data is null, return without body.
22. **JSON encode** — Call `json_encode($result, $options)`. If encoding fails (JSON error), return 500 with error details.
23. **JSONP wrapping** — If JSONP: output `/**/{callback}({json})`. Otherwise output plain JSON.

### CORS Headers

CORS is handled in two places:
- `rest_send_cors_headers()` is hooked to `rest_pre_serve_request` and sends `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods: OPTIONS, GET, POST, PUT, PATCH, DELETE`, `Access-Control-Allow-Credentials: true`, and `Vary: Origin`.
- Allowed request headers and exposed response headers are sent in `serve_request()`.

When `Origin` is null (file:// or data: URL), the literal string `"null"` is reflected. When there is no origin and the request is GET from a non-logged-in user, only `Vary: Origin` is sent.

### dispatch() Flow

```
dispatch(request):
  1. Push request onto dispatchingRequests stack.
  2. Apply rest_pre_dispatch filter — if non-empty result returned, use it as the response and return.
  3. Call match_request_to_handler(request) — returns [route, handler] or WP_Error.
  4. If WP_Error (rest_no_route, 404), return error response.
  5. Validate handler callback is callable. If not, set error (rest_invalid_handler, 500).
  6. If no error: call request.has_valid_params(). If WP_Error, set error.
  7. If no error: call request.sanitize_params(). If WP_Error, set error.
  8. Call respond_to_request(request, route, handler, error).
  9. Pop request from dispatchingRequests stack.
  10. Return response.
```

### match_request_to_handler()

1. Extract method and path from request.
2. Narrow routes: if path starts with a known namespace, only search that namespace's routes. Otherwise search all routes.
3. For each route regex, run `preg_match('@^{route}$@i', path, matches)`.
4. Extract named capture groups from matches as URL params.
5. For each matching handler, check if the request's HTTP method (or GET if HEAD with no HEAD handler) is in `handler.methods`.
6. If method matches and callback is callable:
   - Set URL params on request via `request.set_url_params(args)`.
   - Set attributes on request via `request.set_attributes(handler)`.
   - Collect `default` values from `handler.args` and set via `request.set_default_params(defaults)`.
   - Return `[route, handler]`.
7. If no match found: return `WP_Error('rest_no_route', 404)`.

### respond_to_request()

1. Apply `rest_request_before_callbacks` filter (passes current error if any).
2. If no error and `handler.permission_callback` is set: call it with `(request)`. If it returns `WP_Error`, use that as error. If it returns `false` or `null`, produce `rest_forbidden` error with status from `rest_authorization_required_code()` (401 if not logged in, 403 if logged in).
3. If no error: apply `rest_dispatch_request` filter. If non-null result returned, use it. Otherwise call `handler.callback(request)`.
4. Apply `rest_request_after_callbacks` filter.
5. If result is `WP_Error`, convert to response. Otherwise wrap with `rest_ensure_response()`.
6. Set `matched_route` and `matched_handler` on response.
7. Return response.

### Route Registry Structure

```typescript
// Stored in server.endpoints[routeRegex]:
type RouteArgs = Array<HandlerDef> & {
  namespace?: string;
  // non-numeric keys become routeOptions
};

interface HandlerDef {
  methods: Record<string, true>;   // e.g. { GET: true }
  callback: Callable;
  permission_callback?: Callable;
  args?: Record<string, ArgSchema>;
  show_in_index?: boolean;         // default true
  accept_json?: boolean;           // default false
  accept_raw?: boolean;            // default false
  allow_batch?: { v1: boolean };
}

// Stored separately in server.routeOptions[routeRegex]:
interface RouteOptions {
  namespace?: string;
  schema?: Callable;               // () => SchemaObject
  allow_batch?: { v1: boolean };
}
```

### JSON Encoding Options

- `_pretty` query param → adds `JSON_PRETTY_PRINT`
- Filterable via `rest_json_encode_options` filter

### Batch Requests

The server registers a built-in `POST /batch/v1` endpoint. Batch requests:
- Accept up to 25 sub-requests (configurable via `rest_get_max_batch_size` filter).
- Each sub-request specifies: `method` (POST/PUT/PATCH/DELETE, default POST), `path` (required), `body` (object), `headers` (object).
- Routes must opt-in with `allow_batch: { v1: true }`.
- Validation mode `require-all-validate`: if any sub-request fails validation, return all validation results with HTTP 207.
- Normal mode: execute valid sub-requests, return all responses with HTTP 207.
- Each response is enveloped: `{ body, status, headers }`.

### Header Extraction from $_SERVER

Headers are extracted from `$_SERVER`:
- Keys prefixed with `HTTP_` → strip prefix (e.g. `HTTP_ACCEPT` → `ACCEPT`).
- `REDIRECT_HTTP_AUTHORIZATION` → `AUTHORIZATION` (if `HTTP_AUTHORIZATION` not present).
- `CONTENT_LENGTH`, `CONTENT_MD5`, `CONTENT_TYPE` → included without prefix.

---

## 3. Route Registration

### register_rest_route()

```typescript
function register_rest_route(
  namespace: string,  // e.g. "wp/v2" — no leading/trailing slashes
  route: string,      // e.g. "/posts/(?P<id>[\d]+)" — leading slash
  args: RouteArgsDef | RouteArgsDef[],
  override: boolean = false
): boolean
```

**Validation rules (errors logged, false returned):**
- `namespace` must not be empty.
- `route` must not be empty.
- `namespace` must not start or end with `/` (warning only, proceeds).
- Must be called on or after the `rest_api_init` action (warning only, proceeds).
- Each endpoint def must have `permission_callback` (warning only, proceeds).
- Each arg in `args.args` must be an array (warning logged, loop exits early).

**Route construction:**
```
full_route = '/' + trim(namespace, '/') + '/' + trim(route, '/')
```

**Normalization before calling `server.register_route()`:**
- If `args` has a `callback` key at the top level (single endpoint), wrap it in an array.
- A top-level `args` key in the outer object is extracted as `common_args` and merged into each per-handler `args`.
- Each handler def gets defaults: `{ methods: 'GET', callback: null, args: {} }`.

**What `server.register_route()` does:**
- If this is the first route for a namespace, auto-registers `GET /{namespace}` → `get_namespace_index()`.
- Stores namespace membership.
- If `override=true` or route doesn't exist: replace `endpoints[route]` entirely.
- If `override=false` and route exists: `array_merge` old and new (newer numeric-keyed handlers appended; newer non-numeric keys like `schema`, `namespace` overwrite).

### Argument Schema (per handler)

```typescript
interface RouteHandlerDef {
  methods: string | string[];       // 'GET' | 'POST, PUT' | ['GET', 'POST'] etc.
  callback: Callable;
  permission_callback: Callable;    // required (warning if absent)
  args?: Record<string, ArgDef>;
  show_in_index?: boolean;          // default true
  accept_json?: boolean;            // default false — accept JSON body even without Content-Type
  accept_raw?: boolean;             // default false — accept raw binary body
  allow_batch?: { v1: boolean };
}
```

**Method normalization:** comma-separated strings are split; each method is uppercased and trimmed; stored as `{ [METHOD]: true }` map.

---

## 4. WP_REST_Request

`WP_REST_Request` is the request value object. It holds parameters from all sources and provides a unified access interface.

### Internal Parameter Storage

```typescript
interface RequestParams {
  URL:      Record<string, string>;   // named captures from route regex
  GET:      Record<string, unknown>;  // query string ($_GET)
  POST:     Record<string, unknown>;  // form body ($_POST) or parsed body
  FILES:    Record<string, unknown>;  // multipart files ($_FILES)
  JSON:     Record<string, unknown> | null;  // parsed JSON body (lazy)
  defaults: Record<string, unknown>;  // default values from route args
}
```

### Constructor

```typescript
new WP_REST_Request(
  method: string = '',       // uppercased on set
  route: string = '',
  attributes: object = {}
)
```

### Parameter Priority Order

`get_param(key)` and `get_params()` respect a priority order. The order is computed by `get_parameter_order()`:

1. If Content-Type is a JSON media type: `JSON` is first.
2. Lazily parse JSON params.
3. For non-POST methods with a non-empty body: lazily parse body params (URL-encoded).
4. For methods that accept body data (`POST`, `PUT`, `PATCH`, `DELETE`): `POST`.
5. `GET` (query string).
6. `URL` (route params).
7. `defaults`.

This means **JSON beats POST beats GET beats URL beats defaults** for write methods. For GET requests with JSON content type, JSON beats GET.

The order is filterable via `rest_request_parameter_order`.

### `get_params()` vs `get_param(key)`

- `get_param(key)`: returns first found value scanning priority order.
- `get_params()`: merges all sources in **reverse** priority order so higher-priority sources overwrite lower-priority ones. Strips `rest_route` key when not using pretty permalinks.
- `has_param(key)`: distinguishes between missing and explicitly-set-to-null.
- `set_param(key, value)`: updates in the first source that already has the key; if not found, sets in `priority[0]` source.

### Source-Specific Accessors

| Method | Source |
|---|---|
| `get_url_params()` | `params.URL` |
| `get_query_params()` | `params.GET` |
| `get_body_params()` | `params.POST` |
| `get_json_params()` | `params.JSON` (triggers lazy parse) |
| `get_file_params()` | `params.FILES` |
| `get_default_params()` | `params.defaults` |
| `get_body()` | raw body string |

### JSON Parsing (Lazy)

`parse_json_params()` is triggered on first access:
1. If already parsed, return `true`.
2. If Content-Type is not a JSON media type, skip (return `true`).
3. If body is empty, skip (return `true`).
4. Call `json_decode(body, true)`.
5. If result is `null` and `json_last_error() !== JSON_ERROR_NONE`: return `WP_Error('rest_invalid_json', 400)` with `json_error_code` and `json_error_message` in error data. Reset parsed flag so subsequent calls retry.
6. Set `params.JSON = decoded`.

### Body Parsing (Lazy, URL-encoded)

`parse_body_params()` is triggered for non-POST methods when body is non-empty:
1. If already parsed, return.
2. If Content-Type is set and is not `application/x-www-form-urlencoded`, skip.
3. `parse_str(body, params)`.
4. Merge into `params.POST` — **manually set params (via `set_body_params`) take precedence**: `params.POST = merge(parsed, existing_POST)`.

### Header Handling

- Header names are **canonicalized**: lowercased, dashes replaced with underscores. `X-WP-Nonce` → `x_wp_nonce`.
- Multiple values for the same header are stored as an array and joined with `,` on `get_header()`.
- `get_header_as_array()` returns the raw array.
- `get_content_type()` returns `{ value, type, subtype, parameters }` or null.

### `from_url(url)` Static Factory

Parses a full URL into a `WP_REST_Request`:
1. Parse URL components.
2. If pretty permalinks are on and URL is under API root: extract path portion after the API root.
3. Otherwise if `rest_route` query param is set: use that.
4. If neither: return `false`.
5. Create `new WP_REST_Request('GET', route)` with extracted query params.
6. Filterable via `rest_request_from_url`.

### `has_valid_params()` — Validation

Called during dispatch before `sanitize_params()`:

1. Run `parse_json_params()`. If `WP_Error`, return it.
2. For each arg in `attributes.args`: if arg has `required: true` and `get_param(key) === null`, add to required list.
3. If required list non-empty: return `WP_Error('rest_missing_callback_param', 400)` with `params` array.
4. For each arg with a present value and `validate_callback`: call `validate_callback(value, request, key)`. If result is `false`, record `'Invalid parameter.'`. If `WP_Error`, record messages. Collect invalid params.
5. If invalid params: return `WP_Error('rest_invalid_param', 400)` with `params` (messages) and `details` (full error objects).
6. If `attributes.validate_callback` is set: call it with `(request)`. If `WP_Error` or `false`, return error.
7. Return `true`.

### `sanitize_params()`

Called after `has_valid_params()` during dispatch:

1. For each parameter source in priority order, for each key in that source:
   - If no arg schema for this key, skip.
   - If arg has a `type` but no `sanitize_callback`: default `sanitize_callback` to `rest_parse_request_arg`.
   - If still no `sanitize_callback`, skip.
   - Call `sanitize_callback(value, request, key)`.
   - If result is `WP_Error`: collect invalid param. If valid: update `params[source][key]` with sanitized value.
2. If invalid params: return `WP_Error('rest_invalid_param', 400)`.
3. Return `true`.

### ArrayAccess

`WP_REST_Request` implements array access:
- `$request['key']` → `get_param('key')`
- `$request['key'] = value` → `set_param('key', value)`
- `isset($request['key'])` → checks all sources
- `unset($request['key'])` → removes from all sources

---

## 5. Parameter Validation and Sanitization

### Argument Schema (ArgDef)

```typescript
interface ArgDef {
  // Type system
  type?: SchemaType | SchemaType[];  // 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object' | 'null'
  format?: SchemaFormat;              // 'date-time' | 'email' | 'ip' | 'uuid' | 'hex-color' | 'uri' | 'text-field' | 'textarea-field'

  // Constraints
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: boolean;
  exclusiveMaximum?: boolean;
  multipleOf?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;               // ECMA regex pattern (not anchored)
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  minProperties?: number;
  maxProperties?: number;

  // Nested structure
  items?: ArgDef;                          // for array type
  properties?: Record<string, ArgDef>;     // for object type
  additionalProperties?: ArgDef | false;   // for object type
  patternProperties?: Record<string, ArgDef>;  // for object type

  // Combining schemas
  anyOf?: ArgDef[];
  oneOf?: ArgDef[];

  // REST-specific
  required?: boolean;
  default?: unknown;
  description?: string;
  validate_callback?: Callable;   // (value, request, paramKey) => true | WP_Error
  sanitize_callback?: Callable;   // (value, request, paramKey) => mixed | WP_Error
  context?: string[];             // which response contexts include this field

  // Internal (stripped from public schema)
  arg_options?: Record<string, unknown>;
}
```

### `rest_validate_value_from_schema(value, args, param)`

Entry point for schema-based validation:

1. If `args.anyOf`: call `rest_find_any_matching_schema()`. Returns first matching sub-schema or `WP_Error`. Inherits `type` from matching schema if not set.
2. If `args.oneOf`: call `rest_find_one_matching_schema()`. Exactly one must match. Returns matching sub-schema or `WP_Error`. Error `rest_one_of_multiple_matches` if more than one matches.
3. Resolve multi-type: if `args.type` is an array, call `rest_handle_multi_type_schema()` to find the best matching type.
4. Dispatch per type:
   - `null`: value must be `null` exactly.
   - `boolean`: value must satisfy `rest_is_boolean()` — accepts `true`, `false`, `'true'`, `'false'`, `'0'`, `'1'`, `0`, `1`.
   - `integer`: passes number validation, then requires `round(float(value)) === float(value)`.
   - `number`: must be numeric; checks `multipleOf`, `minimum`/`maximum` with exclusive variants.
   - `string`: must be string; checks `minLength` (mb_strlen), `maxLength` (mb_strlen), `pattern`.
   - `array`: must satisfy `rest_is_array()` (scalar → `parse_list`; must be numerically-keyed array); checks `items` schema recursively, `minItems`, `maxItems`, `uniqueItems`.
   - `object`: must satisfy `rest_is_object()` (empty string, stdClass, JsonSerializable, or array); checks `required` properties, validates each property against `properties`, `patternProperties`, or `additionalProperties` schema; checks `minProperties`, `maxProperties`.
5. If type-valid: check `enum` — sanitize value first, then compare each enum entry using `rest_are_values_equal()` (JSON-semantic equality: integer/float cross-comparison, recursive array comparison, property-order-independent for objects).
6. If `format` is set (and type is `string` or not set): validate:
   - `hex-color`: regex `#([A-Fa-f0-9]{3}){1,2}`
   - `date-time`: regex for ISO 8601 / RFC 3339, then `strtotime()`
   - `email`: must pass email validation
   - `ip`: must be valid IPv4 or IPv6
   - `uuid`: must be valid UUID

### `rest_sanitize_value_from_schema(value, args, param)`

Coerces values to their schema type:

- `null` → returns `null`
- `boolean` → `rest_sanitize_boolean()`: strings `'false'`/`'0'` → `false`, everything else → `bool()`
- `integer` → `(int)`
- `number` → `(float)`
- `string` → applies format sanitizers:
  - `date-time`: no transformation (validation only)
  - `email`: `sanitize_email()`
  - `ip`: pass-through if valid
  - `uri`: `sanitize_url()`
  - `hex-color`: pass-through if valid
  - `text-field`: `sanitize_text_field()`
  - `textarea-field`: `sanitize_textarea_field()`
- `array` → `rest_sanitize_array()`: scalar → `parse_list`, normalize to numeric array; recursively sanitize `items`
- `object` → `rest_sanitize_object()`: normalizes to associative array; recursively sanitizes `properties` and `additionalProperties`

### `rest_parse_request_arg(value, request, param)`

Convenience that runs `rest_validate_request_arg()` (which calls `rest_validate_value_from_schema()`) then `rest_sanitize_request_arg()` (which calls `rest_sanitize_value_from_schema()`). Used as default `sanitize_callback` when `type` is set but no explicit `sanitize_callback` is provided.

### Boolean Coercion Rules

The string values `"false"` and `"0"` are falsy. All other non-empty strings are truthy. This is important because query string values are always strings.

### Array Coercion Rules

Scalar values (from query strings) are parsed as comma-separated lists via `parse_list()`. The result must be a numerically indexed array.

### Allowed Schema Keywords (exposed in route index)

```
title, description, default, type, format, enum, items, properties,
additionalProperties, patternProperties, minProperties, maxProperties,
minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf,
minLength, maxLength, pattern, minItems, maxItems, uniqueItems, anyOf, oneOf
```

---

## 6. WP_REST_Response

`WP_REST_Response` extends `WP_HTTP_Response`, which holds `data`, `status`, and `headers`.

### Constructor

```typescript
new WP_REST_Response(
  data?: unknown,         // response body data
  status?: number = 200,
  headers?: Record<string, string> = {}
)
```

### Additional Properties

```typescript
interface RestResponse {
  data: unknown;
  status: number;
  headers: Record<string, string>;
  links: Record<string, Array<{ href: string; attributes: Record<string, unknown> }>>;
  matched_route: string;
  matched_handler: HandlerDef | null;
}
```

### Link Management

```typescript
add_link(rel: string, href: string, attributes?: Record<string, unknown>): void
// Appends to links[rel] array. Removes 'href' from attributes if accidentally included.

remove_link(rel: string, href?: string): void
// Removes specific href from rel, or all links for rel if href not specified.

add_links(links: Record<string, LinkDef | LinkDef[]>): void
// Bulk add. If a single link (object with 'href'), wraps in array.

get_links(): Record<string, Array<{ href: string; attributes: Record<string, unknown> }>>
```

### Link Header

```typescript
link_header(rel: string, link: string, other?: Record<string, string>): void
// Appends to HTTP Link header: <{link}>; rel="{rel}"; key=value
// Title values are quoted.
```

### Pagination Headers

Pagination is communicated via headers set by the controller:
- `X-WP-Total`: total number of matching items (integer)
- `X-WP-TotalPages`: total number of pages (integer)
- `Link: <{url}>; rel="next"` and/or `Link: <{url}>; rel="prev"`

These are set by calling `response.header('X-WP-Total', count)` etc.

### Envelope Mode

When `_envelope` query param is present, `serve_request()` wraps the response:

```typescript
{
  body:    responseData,   // the normal JSON body with _links embedded
  status:  httpStatus,     // e.g. 200
  headers: responseHeaders // map of header name → value
}
```

The enveloped object is returned as HTTP 200 regardless of the original status, allowing clients that cannot read HTTP status codes to see the real status in the body.

### is_error() / as_error()

- `is_error()`: returns `true` if status >= 400.
- `as_error()`: converts an error response back to a `WP_Error` object by reading `data.code`, `data.message`, `data.data`, and `data.additional_errors`.

### CURIEs (Compact URIs)

`get_curies()` returns the default CURIE definition:

```typescript
[{
  name: 'wp',
  href: 'https://api.w.org/{rel}',
  templated: true
}]
```

Additional CURIEs can be registered via the `rest_response_link_curies` filter.

When building `_links`, full URIs matching a CURIE template are compacted. For example, `https://api.w.org/term` becomes `wp:term`. The `curies` key in `_links` lists all used CURIEs.

---

## 7. Authentication

Authentication in the REST API uses a **filter chain**. Every authentication method hooks into `rest_authentication_errors` and either returns `null` (not applicable), `true` (success), or a `WP_Error` (failure).

### check_authentication()

```typescript
function check_authentication(): WP_Error | null | true {
  return applyFilters('rest_authentication_errors', null);
}
```

The filter starts at `null`. Each handler must check if a previous handler has already returned a non-null value and pass through if so.

### Cookie Authentication

This is the default auth method for logged-in users, relying on WordPress session cookies.

**Nonce verification is mandatory.** The nonce prevents CSRF attacks. The nonce action is `wp_rest`.

**Flow:**
1. `rest_cookie_collect_status()` is hooked to `auth_cookie_valid` and similar actions to record whether cookie auth succeeded in `$wp_rest_auth_cookie`.
2. `rest_cookie_check_errors()` hooks into `rest_authentication_errors`:
   - If `$wp_rest_auth_cookie !== true` and the user is already logged in, it means another auth method was used — pass through.
   - Look for nonce in `$_REQUEST['_wpnonce']` or `$_SERVER['HTTP_X_WP_NONCE']`.
   - If no nonce: call `wp_set_current_user(0)` (treat as anonymous) and return `true`.
   - Verify nonce with `wp_verify_nonce($nonce, 'wp_rest')`.
   - If invalid: add `rest_send_nocache_headers` filter → return `WP_Error('rest_cookie_invalid_nonce', 403)`.
   - If valid: refresh nonce via `X-WP-Nonce` response header → return `true`.

**Client usage:** Include `X-WP-Nonce: {nonce}` header on every request. The nonce is obtained via `wp_create_nonce('wp_rest')` in PHP, or via `wpApiSettings.nonce` in JavaScript (set by the WP admin).

### Application Passwords

Introduced in WordPress 5.6. A user can generate multiple passwords for use by applications.

**Authentication mechanism:** HTTP Basic Auth, where the username is the WordPress username and the password is an application password (formatted as `XXXX XXXX XXXX XXXX XXXX XXXX`).

**Flow:**
1. `rest_application_password_collect_status()` receives the result of application password auth and stores in `$wp_rest_application_password_status` (a `WP_User` on success, `WP_Error` on failure, `null` if not attempted).
2. `rest_application_password_check_errors()` hooks into `rest_authentication_errors`:
   - If previous handler returned non-null, pass through.
   - If status is `WP_Error`: ensure `status` key is present in error data (default 401) → return error.
   - If status is `WP_User`: return `true`.
   - Otherwise: pass through (`null`).

**UUID tracking:** `rest_get_authenticated_app_password()` returns the UUID of the used application password.

### OAuth (External)

Not built into WordPress core. Third-party OAuth providers hook into `rest_authentication_errors` to implement OAuth 1.0a or OAuth 2.0.

### Authentication Filter Contract

Each `rest_authentication_errors` callback must:
- Return `null` if this authentication method is not being attempted.
- Return `true` if authentication succeeded.
- Return a `WP_Error` with `status` in the error data if authentication failed.
- Always check if `$result` (the current filter value) is already non-null and return it unchanged if so.

---

## 8. Permissions

### permission_callback

Every route handler should have a `permission_callback`. It is called after route matching but before the main `callback`.

```typescript
type PermissionCallback = (request: RestRequest) => true | false | null | WP_Error;
```

**Return value behavior:**
- `true`: permission granted. Proceed to callback.
- `WP_Error`: permission denied with specific error. Response is the error.
- `false` or `null`: permission denied. Produces `WP_Error('rest_forbidden')` with status `401` (if not logged in) or `403` (if logged in). The HTTP status from `rest_authorization_required_code()` is used.

**For public endpoints:** the permission_callback should be `() => true` (PHP: `'__return_true'`).

**Capability checks:** Typically use `current_user_can('capability_name')` inside the callback:

```typescript
permission_callback: (request) => {
  if (!currentUserCan('edit_posts')) {
    return new WpError('rest_forbidden', 'Sorry, you are not allowed.', { status: 403 });
  }
  return true;
}
```

### Allow Header

`rest_send_allow_header()` is hooked into `rest_post_dispatch`. It iterates all handlers for the matched route, calls their permission callbacks, and builds an `Allow` header listing only the methods the current user is permitted to use.

This means the `Allow` header reflects actual user capabilities, not just registered methods.

### rest_authorization_required_code()

Returns `403` if user is logged in (they are authenticated but lack permission), `401` if not logged in (they need to authenticate first).

---

## 9. WP_REST_Controller

`WP_REST_Controller` is an abstract base class. All built-in endpoint implementations extend it.

### Properties

```typescript
abstract class RestController {
  protected namespace: string;   // e.g. 'wp/v2'
  protected rest_base: string;   // e.g. 'posts'
  protected schema: SchemaObject | null;  // cached schema
}
```

### Methods That Must Be Overridden

All of these return `WP_Error('invalid-method', 405)` in the base class:

| Method | HTTP | Description |
|---|---|---|
| `register_routes()` | — | Register all routes for this resource |
| `get_items_permissions_check(request)` | — | Check permission for collection listing |
| `get_items(request)` | GET | Get collection of items |
| `get_item_permissions_check(request)` | — | Check permission for single item read |
| `get_item(request)` | GET | Get single item |
| `create_item_permissions_check(request)` | — | Check permission for create |
| `create_item(request)` | POST | Create item |
| `update_item_permissions_check(request)` | — | Check permission for update |
| `update_item(request)` | PUT/PATCH | Update item |
| `delete_item_permissions_check(request)` | — | Check permission for delete |
| `delete_item(request)` | DELETE | Delete item |
| `prepare_item_for_database(request)` | — | Transform request data to DB format |
| `prepare_item_for_response(item, request)` | — | Transform DB item to response format |
| `get_item_schema()` | — | Return JSON Schema for item |

### Helper Methods (implemented in base class)

**`prepare_response_for_collection(response)`**: Extracts data from a `WP_REST_Response` and inlines compact `_links`. Used when building a collection array where each item needs links but is not a standalone response.

**`filter_response_by_context(data, context)`**: Strips properties from response data that do not include the specified context in their `context` array. Delegates to `rest_filter_response_by_context()`.

**`get_fields_for_response(request)`**: Computes the set of fields to include based on:
1. All properties in the item schema.
2. Additional registered fields.
3. Context filtering (exclude properties whose `context` array doesn't include the request's context).
4. The `_fields` query parameter (comma-separated list of field names, supports dot-notation for nested fields).
5. Always includes `id` if it exists (needed by additional field callbacks).
6. Always includes `_links` and optionally `_embedded`.

**`get_collection_params()`**: Returns standard collection parameters:
```typescript
{
  context:  { type: 'string', sanitize: 'sanitize_key', validate: 'rest_validate_request_arg' },
  page:     { type: 'integer', default: 1, minimum: 1, sanitize: 'absint' },
  per_page: { type: 'integer', default: 10, minimum: 1, maximum: 100, sanitize: 'absint' },
  search:   { type: 'string', sanitize: 'sanitize_text_field' },
}
```

**`get_context_param(args?)`**: Returns the context parameter definition. Populates `enum` from all `context` values across all schema properties, sorted in reverse order.

**`get_endpoint_args_for_item_schema(method)`**: Converts schema properties to endpoint `args`. For `CREATABLE`, marks required properties and sets defaults. For `EDITABLE`, required is not enforced and defaults are omitted. Delegates to `rest_get_endpoint_args_for_schema()`.

**`add_additional_fields_to_object(data, request)`**: For each registered additional field (via `register_rest_field()`), if the field has a `get_callback` and is in the requested fields, call the callback and merge the result into the response data.

**`update_additional_fields_for_object(object, request)`**: For each registered additional field with an `update_callback`, if the field was present in the request, call the callback.

**`add_additional_fields_schema(schema)`**: Merges schema definitions from additional fields into the item schema's `properties`.

**`get_public_item_schema()`**: Returns `get_item_schema()` with `arg_options` stripped from all properties.

**`get_object_type()`**: Returns `schema.title` to identify this controller's object type.

### Typical register_routes() Pattern

```typescript
register_routes() {
  register_rest_route(this.namespace, '/' + this.rest_base, [
    {
      methods: 'GET',
      callback: [this, 'get_items'],
      permission_callback: [this, 'get_items_permissions_check'],
      args: this.get_collection_params(),
    },
    {
      methods: 'POST',
      callback: [this, 'create_item'],
      permission_callback: [this, 'create_item_permissions_check'],
      args: this.get_endpoint_args_for_item_schema('POST'),
    },
    allow_batch: this.allow_batch,
    schema: [this, 'get_public_item_schema'],
  ]);

  register_rest_route(this.namespace, '/' + this.rest_base + '/(?P<id>[\\d]+)', [
    {
      methods: 'GET',
      callback: [this, 'get_item'],
      permission_callback: [this, 'get_item_permissions_check'],
      args: { context: this.get_context_param({ default: 'view' }) },
    },
    {
      methods: 'POST, PUT, PATCH',
      callback: [this, 'update_item'],
      permission_callback: [this, 'update_item_permissions_check'],
      args: this.get_endpoint_args_for_item_schema('PUT'),
    },
    {
      methods: 'DELETE',
      callback: [this, 'delete_item'],
      permission_callback: [this, 'delete_item_permissions_check'],
      args: { force: { type: 'boolean', default: false } },
    },
    allow_batch: this.allow_batch,
    schema: [this, 'get_public_item_schema'],
  ]);
}
```

---

## 10. Built-in Endpoints

All built-in routes are registered on the `rest_api_init` action by `create_initial_rest_routes()`. All use the `wp/v2` namespace unless noted otherwise.

### Posts and Post Types

Post types with `show_in_rest: true` get a controller automatically. The controller class defaults to `WP_REST_Posts_Controller` but can be overridden per post type.

| Route | Methods | Notes |
|---|---|---|
| `/wp/v2/posts` | GET, POST | Standard post type |
| `/wp/v2/posts/{id}` | GET, PUT, PATCH, DELETE | |
| `/wp/v2/posts/{id}/revisions` | GET | |
| `/wp/v2/posts/{id}/revisions/{revision_id}` | GET, DELETE | |
| `/wp/v2/posts/{id}/autosaves` | GET, POST | |
| `/wp/v2/pages` | GET, POST | `page` post type |
| `/wp/v2/pages/{id}` | GET, PUT, PATCH, DELETE | |
| `/wp/v2/pages/{id}/revisions` | GET | |
| `/wp/v2/media` | GET, POST | `attachment` post type |
| `/wp/v2/media/{id}` | GET, PUT, PATCH, DELETE | |
| `/wp/v2/media/{id}/post-process` | POST | image editing |
| `/wp/v2/blocks` | GET, POST | Reusable blocks |
| `/wp/v2/blocks/{id}` | GET, PUT, PATCH, DELETE | |
| `/wp/v2/templates` | GET, POST | Block templates |
| `/wp/v2/templates/{id}` | GET, PUT, PATCH, DELETE | |
| `/wp/v2/template-parts` | GET, POST | |
| `/wp/v2/navigation` | GET, POST | Navigation menus (block-based) |
| `/wp/v2/navigation/{id}` | GET, PUT, PATCH, DELETE | |

### Taxonomies and Terms

Taxonomies with `show_in_rest: true` get a controller.

| Route | Methods |
|---|---|
| `/wp/v2/categories` | GET, POST |
| `/wp/v2/categories/{id}` | GET, PUT, PATCH, DELETE |
| `/wp/v2/tags` | GET, POST |
| `/wp/v2/tags/{id}` | GET, PUT, PATCH, DELETE |
| `/wp/v2/taxonomies` | GET |
| `/wp/v2/taxonomies/{taxonomy}` | GET |

### Users

| Route | Methods | Notes |
|---|---|---|
| `/wp/v2/users` | GET, POST | |
| `/wp/v2/users/{id}` | GET, PUT, PATCH, DELETE | |
| `/wp/v2/users/me` | GET, PUT, PATCH, DELETE | Current user |
| `/wp/v2/users/{user_id}/application-passwords` | GET, POST | |
| `/wp/v2/users/{user_id}/application-passwords/{uuid}` | GET, PUT, PATCH, DELETE | |
| `/wp/v2/users/{user_id}/application-passwords/introspect` | GET | |

### Comments

| Route | Methods |
|---|---|
| `/wp/v2/comments` | GET, POST |
| `/wp/v2/comments/{id}` | GET, PUT, PATCH, DELETE |

### Meta Endpoints

| Route | Methods | Notes |
|---|---|---|
| `/wp/v2` | GET | Namespace index |
| `/` | GET | Site index (all routes) |
| `/batch/v1` | POST | Batch requests |

### Settings, Themes, Plugins

| Route | Methods |
|---|---|
| `/wp/v2/settings` | GET, PUT, PATCH |
| `/wp/v2/themes` | GET |
| `/wp/v2/themes/{stylesheet}` | GET |
| `/wp/v2/plugins` | GET, POST |
| `/wp/v2/plugins/{plugin}` | GET, PUT, PATCH, DELETE |

### Widgets and Sidebars

| Route | Methods |
|---|---|
| `/wp/v2/sidebars` | GET |
| `/wp/v2/sidebars/{id}` | GET, PUT, PATCH |
| `/wp/v2/widget-types` | GET |
| `/wp/v2/widget-types/{id}` | GET |
| `/wp/v2/widget-types/{id}/encode` | POST |
| `/wp/v2/widgets` | GET, POST |
| `/wp/v2/widgets/{id}` | GET, PUT, PATCH, DELETE |

### Blocks and Block-related

| Route | Methods | Notes |
|---|---|---|
| `/wp/v2/block-types` | GET | |
| `/wp/v2/block-types/{namespace}` | GET | |
| `/wp/v2/block-types/{namespace}/{name}` | GET | |
| `/wp/v2/block-renderer/{name}` | GET, POST | Render a block |
| `/wp/v2/block-directory/search` | GET | |
| `/wp/v2/block-patterns` | GET | |
| `/wp/v2/block-pattern-categories` | GET | |

### Menus and Navigation

| Route | Methods |
|---|---|
| `/wp/v2/menus` | GET, POST |
| `/wp/v2/menus/{id}` | GET, PUT, PATCH, DELETE |
| `/wp/v2/menu-items` | GET, POST |
| `/wp/v2/menu-items/{id}` | GET, PUT, PATCH, DELETE |
| `/wp/v2/menu-locations` | GET |
| `/wp/v2/menu-locations/{location}` | GET |

### Search

| Route | Methods |
|---|---|
| `/wp/v2/search` | GET |

Search supports multiple types via handlers: `post` (posts), `term` (taxonomy terms), `post-format`. Additional handlers can be registered via `wp_rest_search_handlers` filter.

### Global Styles

| Route | Methods |
|---|---|
| `/wp/v2/global-styles/{id}` | GET, PUT, PATCH |
| `/wp/v2/global-styles/{parent}/revisions` | GET |
| `/wp/v2/global-styles/{parent}/revisions/{id}` | GET, DELETE |

### Fonts

| Route | Methods |
|---|---|
| `/wp/v2/font-families` | GET, POST |
| `/wp/v2/font-families/{id}` | GET, PUT, PATCH, DELETE |
| `/wp/v2/font-families/{font_family_id}/font-faces` | GET, POST |
| `/wp/v2/font-families/{font_family_id}/font-faces/{id}` | GET, DELETE |
| `/wp/v2/font-collections` | GET |
| `/wp/v2/font-collections/{slug}` | GET |

### Post Types and Statuses

| Route | Methods |
|---|---|
| `/wp/v2/types` | GET |
| `/wp/v2/types/{type}` | GET |
| `/wp/v2/statuses` | GET |
| `/wp/v2/statuses/{status}` | GET |

### Miscellaneous

| Route | Methods | Notes |
|---|---|---|
| `/wp/v2/site-health/tests` | GET | |
| `/wp/v2/url-details` | GET | Fetch metadata from external URL |
| `/wp/v2/edit-site-export` | GET | Download site export zip |
| `/wp/v2/navigation-fallback` | GET | |
| `/wp/v2/pattern-directory/patterns` | GET | |

---

## 11. Error Handling

### WP_Error in REST Context

`WP_Error` objects carry one or more errors. When used in REST responses, the `data` array should include a `status` key with an HTTP status code:

```typescript
new WpError(
  'error_code',          // machine-readable slug
  'Human message',       // display message
  { status: 404, ...extra }  // data bag; status determines HTTP response code
)
```

### rest_convert_error_to_response(error)

Converts a `WP_Error` to a `WP_REST_Response`:

1. Collects all error codes and messages.
2. First error becomes the primary: `{ code, message, data }`.
3. Additional errors become `additional_errors` array of `{ code, message, data }`.
4. The HTTP status is taken from the first error's `data.status`. Defaults to 500 if not present.

The response body structure:
```typescript
{
  code: string;
  message: string;
  data: {
    status: number;
    [key: string]: unknown;
  };
  additional_errors?: Array<{
    code: string;
    message: string;
    data: unknown;
  }>;
}
```

### Standard Error Codes

| Code | HTTP | When |
|---|---|---|
| `rest_no_route` | 404 | No route matches the URL and method |
| `rest_invalid_handler` | 500 | Route callback is not callable |
| `rest_forbidden` | 401/403 | permission_callback returned false/null |
| `rest_missing_callback_param` | 400 | Required parameter not provided |
| `rest_invalid_param` | 400 | Parameter failed validation or sanitization |
| `rest_invalid_json` | 400 | Invalid JSON in body |
| `rest_invalid_type` | 400 | Value is wrong type |
| `rest_not_in_enum` | 400 | Value not in allowed enum list |
| `rest_out_of_bounds` | 400 | Number outside min/max |
| `rest_too_short` | 400 | String shorter than minLength |
| `rest_too_long` | 400 | String longer than maxLength |
| `rest_invalid_pattern` | 400 | String doesn't match pattern |
| `rest_too_few_items` | 400 | Array has fewer than minItems |
| `rest_too_many_items` | 400 | Array has more than maxItems |
| `rest_duplicate_items` | 400 | Array has duplicate items (uniqueItems) |
| `rest_property_required` | 400 | Required object property missing |
| `rest_additional_properties_forbidden` | 400 | Extra property when additionalProperties: false |
| `rest_no_matching_schema` | 400 | No anyOf/oneOf schema matched |
| `rest_one_of_multiple_matches` | 400 | Multiple oneOf schemas matched |
| `rest_cookie_invalid_nonce` | 403 | Nonce verification failed |
| `rest_encode_error` | 500 | JSON encoding of response failed |
| `rest_invalid_namespace` | 404 | Namespace not registered |
| `rest_batch_not_allowed` | 400 | Route doesn't support batch requests |

### json_error() for Pre-Route Errors

For errors that happen before dispatch (e.g. invalid JSONP callback), `WP_REST_Server::json_error($code, $message, $status)` outputs a minimal `{"code": ..., "message": ...}` directly.

---

## 12. Links and Embedding

### HAL-Style `_links`

Every response can include a `_links` object following the HAL specification. Links are structured as:

```typescript
{
  _links: {
    [rel: string]: Array<{
      href: string;
      embeddable?: boolean;
      [attr: string]: unknown;
    }>
  }
}
```

Standard relations used by WordPress:
- `self` — canonical URL for this resource
- `collection` — URL for the collection this item belongs to
- `about` — URL for schema/documentation
- `author` — link to the author (user resource)
- `replies` — link to comments
- `version-history` — link to revisions list
- `predecessor-version` — link to previous revision
- `up` — parent resource
- `wp:attachment` — associated media
- `wp:term` — associated taxonomy terms
- `wp:featuredmedia` — featured image
- `wp:action-*` — capability-based action links
- `curies` — compact URI definitions

### targetHints

For `self` links, the server computes `targetHints` containing an `allow` key listing the HTTP methods the current user can use:

```typescript
{
  self: [{
    href: 'https://example.com/wp-json/wp/v2/posts/1',
    targetHints: {
      allow: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
    }
  }]
}
```

This is computed by running `match_request_to_handler()` on the link href and calling all `permission_callback`s.

### `_embed` Query Parameter

When `?_embed` is present:

1. The server processes all embeddable links (those with `embeddable: true`).
2. For each embeddable link, an internal sub-request is dispatched via `server.dispatch()`.
3. Sub-requests receive `context=embed` automatically.
4. Sub-request results are cached by href to avoid duplicate requests within the same response.
5. For collection responses (numeric arrays), each item's links are embedded separately.
6. Results appear in `_embedded[rel][index]` parallel to `_links[rel][index]`.
7. Non-embeddable links remain in `_links` but get empty slots in `_embedded`.

**Selective embedding**: `?_embed=author,wp:term` embeds only those specific relations.

**per_page in embeds**: When embedding a collection, if the matched handler has `args.per_page.maximum`, the embed request sets `per_page` to that maximum automatically.

### Link Compaction (CURIEs)

Before serialization, `get_compact_response_links()` processes `_links`:
1. Collects all registered CURIEs.
2. For each link relation that is a full URI matching a CURIE template, replaces it with `{name}:{rel}`.
3. Adds used CURIEs to `_links.curies` array.

---

## 13. Index Endpoint and Schema Discovery

### Site Index (`GET /wp-json/` or `GET /wp-json/wp-json/`)

`WP_REST_Server::get_index()` returns:

```typescript
{
  name: string;              // blogname option
  description: string;       // blogdescription option
  url: string;               // siteurl option
  home: string;              // home_url()
  gmt_offset: string;        // gmt_offset option
  timezone_string: string;   // timezone_string option
  page_for_posts: number;
  page_on_front: number;
  show_on_front: string;     // 'posts' | 'page'
  namespaces: string[];      // all registered namespaces
  authentication: {
    'application-passwords'?: {
      endpoints: { authorization: string }
    }
  };
  routes: {                  // all routes, keyed by route pattern
    [route: string]: {
      namespace: string;
      methods: string[];
      endpoints: Array<{
        methods: string[];
        args: Record<string, ArgSchemaPublic>;
        allow_batch?: { v1: boolean };
      }>;
      _links?: { self: [{ href: string }] };  // for non-variable routes
    }
  };
  site_logo?: number;        // attachment ID
  site_icon?: number;        // attachment ID
  site_icon_url?: string;
}
```

The index also includes `_links.help` pointing to the REST API documentation, `_links.https://api.w.org/active-theme` (if user has theme editing capability), and links for site logo and icon images.

Filterable via `rest_index`.

### Namespace Index (`GET /wp-json/{namespace}`)

Returns:
```typescript
{
  namespace: string;
  routes: RouteDescriptions;  // same format as routes in site index, but filtered to namespace
  _links: { up: [{ href: '/wp-json/' }] }
}
```

Auto-registered when any route in a namespace is first registered. Filterable via `rest_namespace_index`.

### Schema Discovery (`OPTIONS` request)

OPTIONS requests are handled by the `rest_handle_options_request` filter on `rest_pre_dispatch`. It matches the route and calls `server.get_data_for_route(route, endpoints, 'help')`, which includes the `schema` when context is `'help'`. Returns HTTP 200 with the route description.

### Route Description Fields (Public)

When serializing route data for the index:
- Non-numeric handler keys (e.g. `schema`, `allow_batch`) become route-level options.
- Only `show_in_index: true` handlers are included.
- Per-arg data is filtered to allowed schema keywords only.
- Route regex named capture groups are converted from `(?P<name>...)` to `{name}` in the public representation.

### `_fields` Query Parameter

Any endpoint that returns an object (not just a collection) supports `?_fields=field1,field2,nested.field`. This is processed by `rest_filter_response_fields()` on `rest_post_dispatch`:

1. Parse the comma-separated list.
2. Build a nested key hierarchy.
3. Recursively intersect the response data with the allowed fields structure.
4. Works on both single objects and numeric arrays.
5. Parent field selection includes all nested fields. Nested field selection excludes siblings.

---

## 14. Key Hooks and Filters

### Bootstrap

| Hook | Type | When | Usage |
|---|---|---|---|
| `rest_api_init` | action | When server is first instantiated | Register routes, add auth handlers |
| `wp_rest_server_class` | filter | Before server instantiation | Replace server class |

### Authentication

| Hook | Type | Signature | Usage |
|---|---|---|---|
| `rest_authentication_errors` | filter | `(WP_Error\|null\|true $result)` | Add auth handler; return null/true/WP_Error |

### Request Dispatch

| Hook | Type | Signature | Usage |
|---|---|---|---|
| `rest_pre_dispatch` | filter | `(mixed $result, WP_REST_Server $server, WP_REST_Request $request)` | Short-circuit dispatch |
| `rest_request_before_callbacks` | filter | `(mixed $response, array $handler, WP_REST_Request $request)` | Pre-callback hook (runs even with error) |
| `rest_dispatch_request` | filter | `(mixed $result, WP_REST_Request $request, string $route, array $handler)` | Override callback execution |
| `rest_request_after_callbacks` | filter | `(mixed $response, array $handler, WP_REST_Request $request)` | Post-callback cleanup |
| `rest_post_dispatch` | filter | `(WP_HTTP_Response $result, WP_REST_Server $server, WP_REST_Request $request)` | Modify final response |

### Route Management

| Hook | Type | Signature | Usage |
|---|---|---|---|
| `rest_endpoints` | filter | `(array $endpoints)` | Modify registered endpoints at dispatch time |
| `rest_route_data` | filter | `(array $available, array $routes)` | Modify index route data |
| `rest_endpoints_description` | filter | `(array $data)` | Modify single route description |

### Response Shaping

| Hook | Type | Signature | Usage |
|---|---|---|---|
| `rest_pre_serve_request` | filter | `(bool $served, WP_HTTP_Response $result, WP_REST_Request $request, WP_REST_Server $server)` | Custom response output |
| `rest_pre_echo_response` | filter | `(array $result, WP_REST_Server $server, WP_REST_Request $request)` | Modify data before JSON encoding |
| `rest_envelope_response` | filter | `(array $envelope, WP_REST_Response $response)` | Modify envelope wrapping |
| `rest_json_encode_options` | filter | `(int $options, WP_REST_Request $request)` | JSON encode options |
| `rest_filter_response_fields` | — | (hooked as `rest_post_dispatch`) | `_fields` param filtering |
| `rest_send_allow_header` | — | (hooked as `rest_post_dispatch`) | Compute and send Allow header |

### CORS

| Hook | Type | Signature | Usage |
|---|---|---|---|
| `rest_exposed_cors_headers` | filter | `(string[] $headers, WP_REST_Request $request)` | Expand Access-Control-Expose-Headers |
| `rest_allowed_cors_headers` | filter | `(string[] $headers, WP_REST_Request $request)` | Expand Access-Control-Allow-Headers |
| `rest_send_cors_headers` | — | (hooked as `rest_pre_serve_request`) | Send CORS headers |

### Index and Discovery

| Hook | Type | Signature | Usage |
|---|---|---|---|
| `rest_index` | filter | `(WP_REST_Response $response, WP_REST_Request $request)` | Modify site index data |
| `rest_namespace_index` | filter | `(WP_REST_Response $response, WP_REST_Request $request)` | Modify namespace index data |

### Additional Fields

| Hook | Type | Signature | Usage |
|---|---|---|---|
| `rest_response_link_curies` | filter | `(array $additional)` | Add custom CURIEs |
| `rest_avatar_sizes` | filter | `(int[] $sizes)` | Change avatar sizes [24, 48, 96] |
| `wp_rest_search_handlers` | filter | `(WP_REST_Search_Handler[])` | Add custom search handlers |
| `rest_request_parameter_order` | filter | `(string[] $order, WP_REST_Request $request)` | Change parameter priority order |
| `rest_request_from_url` | filter | `(WP_REST_Request\|false $request, string $url)` | Modify request from URL parsing |

### Other

| Hook | Type | Notes |
|---|---|---|
| `rest_send_nocache_headers` | filter | `(bool)` — whether to send no-cache headers |
| `rest_url_prefix` | filter | Change `wp-json` prefix |
| `rest_url` | filter | `(string $url, string $path, int\|null $blog_id, string $scheme)` |
| `rest_jsonp_enabled` | filter | `(bool)` — enable/disable JSONP |
| `rest_get_max_batch_size` | filter | `(int 25)` — max batch sub-requests |

---

## 15. TypeScript Interface Sketch

```typescript
// ---- Core Error ----

interface WpErrorData {
  status?: number;
  [key: string]: unknown;
}

interface WpError {
  readonly _type: 'WpError';
  codes: string[];
  messages: Record<string, string[]>;
  data: Record<string, WpErrorData>;
  add(code: string, message: string, data?: WpErrorData): void;
  getErrorCode(): string;
  getErrorMessage(code?: string): string;
  getErrorData(code?: string): WpErrorData | undefined;
  getErrorCodes(): string[];
  getErrorMessages(code?: string): string[];
  hasErrors(): boolean;
}

function isWpError(value: unknown): value is WpError;

// ---- Parameter Schema ----

type SchemaType = 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object' | 'null';
type SchemaFormat = 'date-time' | 'email' | 'ip' | 'uuid' | 'hex-color' | 'uri' | 'text-field' | 'textarea-field';

interface ArgSchema {
  type?: SchemaType | SchemaType[];
  format?: SchemaFormat;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  required?: boolean;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: boolean;
  exclusiveMaximum?: boolean;
  multipleOf?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  minProperties?: number;
  maxProperties?: number;
  items?: ArgSchema;
  properties?: Record<string, ArgSchema>;
  additionalProperties?: ArgSchema | false;
  patternProperties?: Record<string, ArgSchema>;
  anyOf?: ArgSchema[];
  oneOf?: ArgSchema[];
  validate_callback?: ValidateCallback;
  sanitize_callback?: SanitizeCallback;
  context?: string[];
  arg_options?: Record<string, unknown>;
}

type ValidateCallback = (value: unknown, request: RestRequest, param: string) => true | WpError;
type SanitizeCallback = (value: unknown, request: RestRequest, param: string) => unknown | WpError;

// ---- Route Handler ----

type Callable = (...args: unknown[]) => unknown;

interface HandlerDefinition {
  methods: Record<string, true>;
  callback: Callable;
  permission_callback?: Callable;
  args?: Record<string, ArgSchema>;
  show_in_index?: boolean;
  accept_json?: boolean;
  accept_raw?: boolean;
  allow_batch?: { v1: boolean };
  namespace?: string;
}

interface RouteOptions {
  namespace?: string;
  schema?: () => SchemaObject;
  allow_batch?: { v1: boolean };
}

// ---- Request ----

interface ContentType {
  value: string;
  type: string;
  subtype: string;
  parameters: string;
}

interface RestRequest {
  // Accessors
  getMethod(): string;
  setMethod(method: string): void;
  isMethod(method: string): boolean;
  getRoute(): string;
  setRoute(route: string): void;
  getAttributes(): HandlerDefinition;
  setAttributes(attributes: HandlerDefinition): void;

  // Parameter sources
  getUrlParams(): Record<string, string>;
  setUrlParams(params: Record<string, string>): void;
  getQueryParams(): Record<string, unknown>;
  setQueryParams(params: Record<string, unknown>): void;
  getBodyParams(): Record<string, unknown>;
  setBodyParams(params: Record<string, unknown>): void;
  getJsonParams(): Record<string, unknown> | null;
  getFileParams(): Record<string, unknown>;
  setFileParams(params: Record<string, unknown>): void;
  getDefaultParams(): Record<string, unknown>;
  setDefaultParams(params: Record<string, unknown>): void;

  // Merged access
  getParam(key: string): unknown;
  hasParam(key: string): boolean;
  setParam(key: string, value: unknown): void;
  getParams(): Record<string, unknown>;

  // Body
  getBody(): string;
  setBody(data: string): void;

  // Headers
  getHeaders(): Record<string, string[]>;
  getHeader(key: string): string | null;
  getHeaderAsArray(key: string): string[] | null;
  setHeader(key: string, value: string | string[]): void;
  addHeader(key: string, value: string | string[]): void;
  removeHeader(key: string): void;
  setHeaders(headers: Record<string, string | string[]>, override?: boolean): void;
  getContentType(): ContentType | null;
  isJsonContentType(): boolean;

  // Validation/Sanitization
  hasValidParams(): true | WpError;
  sanitizeParams(): true | WpError;

  // Array access (bracket notation)
  [key: string]: unknown;
}

// ---- Response ----

interface LinkAttributes {
  href: string;
  embeddable?: boolean;
  [key: string]: unknown;
}

interface RestResponse {
  getData(): unknown;
  setData(data: unknown): void;
  getStatus(): number;
  setStatus(code: number): void;
  getHeaders(): Record<string, string>;
  header(key: string, value: string, replace?: boolean): void;

  // Links
  addLink(rel: string, href: string, attributes?: Record<string, unknown>): void;
  removeLink(rel: string, href?: string): void;
  addLinks(links: Record<string, LinkAttributes | LinkAttributes[]>): void;
  getLinks(): Record<string, Array<{ href: string; attributes: Record<string, unknown> }>>;
  linkHeader(rel: string, link: string, other?: Record<string, string>): void;

  // Meta
  getMatchedRoute(): string;
  setMatchedRoute(route: string): void;
  getMatchedHandler(): HandlerDefinition | null;
  setMatchedHandler(handler: HandlerDefinition): void;

  // Utilities
  isError(): boolean;
  asError(): WpError | null;
  getCuries(): Array<{ name: string; href: string; templated: boolean }>;
}

// ---- Server ----

interface RestServer {
  registerRoute(namespace: string, route: string, args: HandlerDefinition[], override?: boolean): void;
  getRoutes(namespace?: string): Record<string, HandlerDefinition[]>;
  getNamespaces(): string[];
  getRouteOptions(route: string): RouteOptions | null;
  dispatch(request: RestRequest): RestResponse;
  serveRequest(path?: string): null | false;
  isDispatching(): boolean;
  sendHeader(key: string, value: string): void;
  sendHeaders(headers: Record<string, string>): void;
  removeHeader(key: string): void;
  responseToData(response: RestResponse, embed: boolean | string[]): Record<string, unknown>;
  envelopeResponse(response: RestResponse, embed: boolean | string[]): RestResponse;
  getIndex(request: RestRequest): RestResponse;
  getNamespaceIndex(request: RestRequest): RestResponse | WpError;
}

// ---- Schema ----

interface SchemaObject {
  $schema?: string;
  title?: string;
  description?: string;
  type?: SchemaType;
  properties?: Record<string, ArgSchema>;
  [key: string]: unknown;
}

// ---- Controller ----

abstract class RestController {
  protected namespace: string;
  protected rest_base: string;
  protected schema: SchemaObject | null;

  abstract register_routes(): void;
  abstract get_items_permissions_check(request: RestRequest): true | WpError;
  abstract get_items(request: RestRequest): RestResponse | WpError;
  abstract get_item_permissions_check(request: RestRequest): true | WpError;
  abstract get_item(request: RestRequest): RestResponse | WpError;
  abstract create_item_permissions_check(request: RestRequest): true | WpError;
  abstract create_item(request: RestRequest): RestResponse | WpError;
  abstract update_item_permissions_check(request: RestRequest): true | WpError;
  abstract update_item(request: RestRequest): RestResponse | WpError;
  abstract delete_item_permissions_check(request: RestRequest): true | WpError;
  abstract delete_item(request: RestRequest): RestResponse | WpError;
  abstract prepare_item_for_database(request: RestRequest): object | WpError;
  abstract prepare_item_for_response(item: unknown, request: RestRequest): RestResponse | WpError;
  abstract get_item_schema(): SchemaObject;

  prepare_response_for_collection(response: RestResponse): Record<string, unknown>;
  filter_response_by_context(data: Record<string, unknown>, context: string): Record<string, unknown>;
  get_fields_for_response(request: RestRequest): string[];
  get_collection_params(): Record<string, ArgSchema>;
  get_context_param(args?: Partial<ArgSchema>): ArgSchema;
  get_endpoint_args_for_item_schema(method?: string): Record<string, ArgSchema>;
  get_public_item_schema(): SchemaObject;
}

// ---- Additional Fields Registry ----

interface AdditionalFieldDef {
  get_callback?: (data: Record<string, unknown>, fieldName: string, request: RestRequest, objectType: string) => unknown;
  update_callback?: (value: unknown, object: unknown, fieldName: string, request: RestRequest, objectType: string) => true | WpError | void;
  schema?: ArgSchema | null;
}

// ---- Utility Functions ----

function restEnsureResponse(response: unknown): RestResponse | WpError;
function restEnsureRequest(request: RestRequest | string | Record<string, unknown>): RestRequest;
function restDoRequest(request: RestRequest | string): RestResponse;
function restGetServer(): RestServer;
function restUrl(path?: string, scheme?: string): string;
function restGetUrlPrefix(): string;
function registerRestRoute(namespace: string, route: string, args: unknown, override?: boolean): boolean;
function registerRestField(objectType: string | string[], attribute: string, args: AdditionalFieldDef): void;
function restAuthorizationRequiredCode(): 401 | 403;
function restValidateValueFromSchema(value: unknown, args: ArgSchema, param?: string): true | WpError;
function restSanitizeValueFromSchema(value: unknown, args: ArgSchema, param?: string): unknown | WpError;
function restParseDate(date: string, forceUtc?: boolean): number | false;
function restGetDateWithGmt(date: string, isUtc?: boolean): [string, string] | null;
function restSanitizeBoolean(value: unknown): boolean;
function restIsBoolean(value: unknown): boolean;
function restIsInteger(value: unknown): boolean;
function restIsArray(value: unknown): boolean;
function restSanitizeArray(value: unknown): unknown[];
function restIsObject(value: unknown): boolean;
function restSanitizeObject(value: unknown): Record<string, unknown>;
function restConvertErrorToResponse(error: WpError): RestResponse;
function restIsFieldIncluded(field: string, fields: string[]): boolean;
function restParseEmbedParam(embed: string): string[] | boolean;
function restFilterResponseByContext(data: Record<string, unknown>, schema: SchemaObject, context: string): Record<string, unknown>;
```

---

## 16. Design Patterns to Carry Over

### 1. Single Global Server Instance with Lazy Initialization

The `WP_REST_Server` is a singleton created on first use via `rest_get_server()`. It fires `rest_api_init` during creation, which is the signal for all controllers to register their routes. Implement this as a module-level singleton with deferred initialization.

### 2. Filter Chain Authentication

Authentication is a cooperative filter chain — not a switch/case or ordered list of checked methods. Each handler is responsible for detecting whether it applies, returning `null` if not, and passing through non-null results from earlier handlers. This allows any number of auth methods to coexist and fail gracefully.

### 3. Lazy Parameter Parsing

JSON body and URL-encoded body are parsed on first access, not on request construction. This avoids decoding overhead for requests that never access those params. Implement with a `parsed` flag and parse-on-demand.

### 4. Priority-Based Parameter Merging

Parameters are not merged into a single flat map at construction time. Instead, the priority order is computed fresh for each access. This means setting a parameter via `set_param()` updates the right source. The priority order itself is filterable.

### 5. WP_Error as a Value Type

`WP_Error` carries enough information to produce a well-formed HTTP error response on its own. Every function that can fail returns either the success value or a `WP_Error`. Check with `isWpError()` before using the result. In TypeScript, this maps naturally to `T | WpError` union types.

### 6. Respond-to-Error-Inline Pattern

The dispatch flow does not throw on errors. Instead, errors are carried as values through the flow. Once an error occurs, subsequent steps check for it and either skip or pass it through. Only at `error_to_response()` is the error converted to an HTTP response.

### 7. Schema as Source of Truth

The `ArgSchema` object is used for three purposes simultaneously: public documentation (exposed in the index), input validation, and input sanitization. The same schema drives `get_endpoint_args_for_item_schema()`, `has_valid_params()`, and `sanitize_params()`. Keep this unified rather than separating validation config from documentation config.

### 8. Controller as Resource Boundary

Each resource type owns its schema, its route patterns, its CRUD handlers, and its permission logic. The base controller class provides enough scaffolding that a concrete controller only needs to implement the business-logic methods. Implement this as an abstract class that subclasses override.

### 9. Link-First Response Design

Responses include structured links, not just data. Links enable clients to navigate the API without constructing URLs themselves. The `targetHints.allow` on `self` links is a particularly useful pattern — it tells clients which HTTP methods they can use before they try.

### 10. Embed as Internal Sub-Dispatch

Embedding (`_embed`) reuses the full dispatch infrastructure: the server makes internal requests and caches results by href. This means embedded resources go through all the same auth, permission, and formatting logic as top-level requests. Implement embedding as recursive `dispatch()` calls, not as direct database queries.

### 11. Envelope for Legacy Client Compatibility

The `_envelope` parameter converts any response into a 200 OK with the real status, headers, and body nested inside the JSON. This solves the real-world problem of clients (e.g., some JavaScript environments) that cannot read HTTP status codes. Always implement this as a response wrapper, not a special mode.

### 12. Batch as a Managed Parallel Dispatch

The `/batch/v1` endpoint executes multiple sub-requests as a unit. Key behaviors to preserve: routes must explicitly opt in to batch support; a `require-all-validate` mode aborts all if any fail validation; results are always enveloped; the response uses HTTP 207 Multi-Status.

### 13. Context-Driven Field Filtering

Schema properties declare which response contexts they appear in (e.g. `context: ['view', 'edit']`). The `context` query param acts as a field selector at the schema level, separate from the explicit `_fields` param. Implement context filtering as a post-processing step over the raw schema.

### 14. Namespace as Versioning Unit

Namespaces (e.g. `wp/v2`) are the unit of versioning. Every namespace auto-gets an index endpoint. When breaking changes are needed, introduce a new namespace. Routes within a namespace inherit its versioning contract.

---

## 17. Tovu Reconstruction Notes

### 17.1 Why this exists

The WordPress REST API exists to expose the CMS as a navigable application boundary rather than a set of ad hoc AJAX endpoints. Its key lesson is not the exact endpoints, but the combination of route registration, schema-driven validation, permission callbacks, and link-aware responses.

### 17.2 What Tovu should preserve

- A first-class headless HTTP contract, not scattered one-off handlers
- Schema as the shared source for validation, sanitization, and documentation
- Resource controllers with explicit permission logic
- Versioned namespaces or equivalent contract versioning

### 17.3 What Tovu can simplify

- Tovu does not need WordPress’s exact singleton server object or every legacy compatibility feature
- `_embed`, `_envelope`, and batch can come later if not immediately needed
- The important part is a disciplined contract surface, not mirroring every WP query parameter

### 17.4 Possible Tovu seams

- `src/headless/` for route and DTO contracts
- `src/server/routes/` as thin transport adapters
- `src/core/ports/HeadlessDispatchPort.ts` only if multiple transport protocols emerge
- feature slices own resource semantics; server owns request/response translation

### 17.5 Suggested priority

- `V1`: versioned resource routes, schema-driven validation, permission-aware handlers
- `Later`: embedding, batch dispatch, richer hypermedia and compatibility layers
