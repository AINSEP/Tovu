# Headless WordPress — Specification

**Source files analyzed:**
- `wp-includes/rest-api.php`
- `wp-includes/rest-api/class-wp-rest-server.php`
- `wp-includes/rest-api/class-wp-rest-request.php`
- `wp-includes/rest-api/class-wp-rest-response.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-posts-controller.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-users-controller.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-terms-controller.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-comments-controller.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-attachments-controller.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-settings-controller.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-menus-controller.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-menu-items-controller.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-search-controller.php`
- `wp-includes/class-wp-application-passwords.php`

---

## 1. Overview

Headless WordPress separates the content management layer from the presentation layer. WordPress runs as a pure backend: it handles content authoring, media management, user management, and all admin operations. A completely independent frontend application (Next.js, Nuxt, SvelteKit, Astro, or any HTTP client) fetches content from WordPress via the REST API and is solely responsible for rendering HTML to end users.

**What WordPress provides in this model:**
- The REST API at `/wp-json/` as the data interface
- The Admin UI (`/wp-admin/`) for content editing and site configuration
- All content storage, querying, and business logic
- Authentication for write operations
- Media processing and storage

**What WordPress does not provide:**
- Routing for the public frontend
- Theming or HTML rendering for the public site
- SEO head tags for the public site (requires a plugin such as Yoast SEO or RankMath, both of which expose their data via REST API extensions)

**REST API version identifier:**
The constant `REST_API_VERSION` is set to `'2.0'`. This value appears in the root index response at `GET /wp-json/`.

**URL routing:**
WordPress registers two rewrite rules. Requests to `/{prefix}/` and `/{prefix}/{path}` rewrite to `index.php?rest_route=/` and `index.php?rest_route=/{path}` respectively. The default prefix is `wp-json`, filterable via the `rest_url_prefix` filter. The full base URL is constructed by `get_rest_url()` and is always the site home URL plus the prefix, for example `https://example.com/wp-json/`.

**Permalinks without pretty URLs:**
When the site does not use pretty permalinks, the REST base URL falls back to query-string form: `https://example.com/?rest_route=/`.

---

## 2. REST API as the Headless Interface

### Base URL

```

## Tovu Reconstruction Notes

### Why this exists

Headless WordPress exists to expose WordPress as a content API and admin backend while the frontend is owned by another application. The real contract is route registration, schema-backed resource shape, and permission-aware reads and writes.

### What Tovu should preserve

- A versioned HTTP API surface for content, users, taxonomies, media, menus, settings, and search
- Schema-driven validation and response shaping, including `OPTIONS` discovery and documented field contexts
- Permission checks tied to the resource/action, not to the transport layer
- Hypermedia and embedding support where clients need linked data

### What Tovu can simplify

- Tovu does not need WordPress's exact route inventory or every historical query parameter
- Batch, `_embed`, and similar compatibility layers can be deferred until a client needs them
- The important part is a stable resource contract, not faithfully copying every endpoint controller

### Possible Tovu seams

- `src/headless/routes/` for transport adapters and route registration
- `src/headless/resources/` for schema, serialization, and permission logic
- `src/core/ports/HeadlessContentPort.ts` if multiple backends or transports emerge
- feature modules should own resource semantics; the server layer should only translate requests and responses

### Suggested priority

- `V1`: content read/write routes, schema validation, permission gates, and predictable response DTOs
- `Later`: embedding, batching, richer hypermedia, and compatibility shims
GET https://example.com/wp-json/
```

This returns a JSON index document describing all registered namespaces, routes, authentication schemes, and general site information. The `Link` response header on every REST response also includes `<https://example.com/wp-json/>; rel="https://api.w.org/"`.

### Namespace Convention

All core endpoints are under the namespace `wp/v2`. The full path is therefore:

```
/wp-json/wp/v2/{resource}
```

Custom plugins register under their own namespaces, e.g. `/wp-json/my-plugin/v1/{resource}`.

### Core Endpoints

| Resource | Collection | Single |
|---|---|---|
| Posts | `GET /wp/v2/posts` | `GET /wp/v2/posts/{id}` |
| Pages | `GET /wp/v2/pages` | `GET /wp/v2/pages/{id}` |
| Media | `GET /wp/v2/media` | `GET /wp/v2/media/{id}` |
| Users | `GET /wp/v2/users` | `GET /wp/v2/users/{id}` |
| Categories | `GET /wp/v2/categories` | `GET /wp/v2/categories/{id}` |
| Tags | `GET /wp/v2/tags` | `GET /wp/v2/tags/{id}` |
| Comments | `GET /wp/v2/comments` | `GET /wp/v2/comments/{id}` |
| Menus | `GET /wp/v2/menus` | `GET /wp/v2/menus/{id}` |
| Menu Items | `GET /wp/v2/menu-items` | `GET /wp/v2/menu-items/{id}` |
| Settings | `GET /wp/v2/settings` | — |
| Search | `GET /wp/v2/search` | — |
| Post Types | `GET /wp/v2/types` | `GET /wp/v2/types/{type}` |
| Taxonomies | `GET /wp/v2/taxonomies` | `GET /wp/v2/taxonomies/{taxonomy}` |
| Post Statuses | `GET /wp/v2/statuses` | `GET /wp/v2/statuses/{status}` |
| Block Types | `GET /wp/v2/block-types` | `GET /wp/v2/block-types/{namespace}/{name}` |
| Templates | `GET /wp/v2/templates` | `GET /wp/v2/templates/{id}` |
| Global Styles | `GET /wp/v2/global-styles/{id}` | — |

**Batch operations:**
A single endpoint handles batched mutations: `POST /wp-json/batch/v1`. The body is `{ requests: [{ method, path, body?, headers? }] }`. Only POST/PUT/PATCH/DELETE are allowed in batch items. Maximum batch size is 25 items by default.

**Schema discovery:**
Send `OPTIONS` to any route to receive its full JSON Schema definition in the `schema` field of the response. This documents all properties, their types, contexts, and whether they are read-only or writable.

---

## 3. Posts Endpoint (full spec)

### Routes

```
GET    /wp/v2/posts
POST   /wp/v2/posts
GET    /wp/v2/posts/{id}
PUT    /wp/v2/posts/{id}
PATCH  /wp/v2/posts/{id}
DELETE /wp/v2/posts/{id}
```

The same controller is reused for custom post types. The route base comes from the post type's `rest_base` property, or falls back to the post type's `name` slug. The namespace defaults to `wp/v2` but is overridable via the post type's `rest_namespace` property.

### Query Parameters — GET /wp/v2/posts

| Parameter | Type | Default | Description |
|---|---|---|---|
| `context` | `string` enum `view\|embed\|edit` | `view` | Scope of fields returned. `edit` returns raw fields and requires authentication. |
| `page` | `integer` | `1` | Current page of the collection. |
| `per_page` | `integer` | `10` | Maximum items to return per page. Hard maximum is 100. |
| `search` | `string` | — | Limit results to those matching a search string. |
| `search_columns` | `string[]` enum `post_title\|post_content\|post_excerpt` | `[]` | Which columns to search. Defaults to all. |
| `search_semantics` | `string` enum `exact` | — | When `exact`, wraps the search term in quotes for an exact-match search. |
| `after` | `string` (ISO8601) | — | Limit to posts published after this date. |
| `modified_after` | `string` (ISO8601) | — | Limit to posts modified after this date. |
| `before` | `string` (ISO8601) | — | Limit to posts published before this date. |
| `modified_before` | `string` (ISO8601) | — | Limit to posts modified before this date. |
| `author` | `integer[]` | `[]` | Limit to posts assigned to these author IDs. |
| `author_exclude` | `integer[]` | `[]` | Exclude posts assigned to these author IDs. |
| `exclude` | `integer[]` | `[]` | Exclude posts with these IDs. |
| `include` | `integer[]` | `[]` | Limit to posts with these IDs. |
| `offset` | `integer` | — | Offset the result set by this many items (alternative to `page`). |
| `order` | `string` enum `asc\|desc` | `desc` | Sort direction. |
| `orderby` | `string` enum | `date` | Sort field. Valid values: `author`, `date`, `id`, `include`, `modified`, `parent`, `relevance`, `slug`, `include_slugs`, `title`. `menu_order` is added if the post type supports `page-attributes`. |
| `slug` | `string[]` | — | Limit to posts with these slugs. |
| `status` | `string[]` | `publish` | Limit to posts with these statuses. Requesting non-`publish` statuses requires authentication and appropriate capability. |
| `tax_relation` | `string` enum `AND\|OR` | — | How taxonomy filters are combined when multiple are given. |
| `categories` | `integer[]` or object | `[]` | Limit to posts in these category IDs. Can be an array of IDs or `{ terms: integer[], include_children: boolean, operator: 'IN'\|'NOT IN'\|'AND' }`. |
| `categories_exclude` | `integer[]` | `[]` | Exclude posts in these category IDs. |
| `tags` | `integer[]` or object | `[]` | Limit to posts with these tag IDs. |
| `tags_exclude` | `integer[]` | `[]` | Exclude posts with these tag IDs. |
| `sticky` | `boolean` | — | `true` returns only sticky posts; `false` excludes sticky posts. |
| `ignore_sticky` | `boolean` | `true` | Whether to ignore sticky post ordering. |
| `format` | `string[]` | — | Limit to posts with one of these post formats (e.g. `standard`, `video`, `audio`). Available only on post types that support `post-formats`. |
| `parent` | `integer[]` | `[]` | Limit to posts with these parent IDs. Available on hierarchical post types. |
| `parent_exclude` | `integer[]` | `[]` | Exclude posts with these parent IDs. |
| `menu_order` | `integer` | — | Limit to posts with this `menu_order` value. Available on post types with `page-attributes` support. |
| `_fields` | `string` (comma-separated) | — | Limit the fields returned in the response to this list. |
| `_embed` | `string` or `true` | — | Embed linked resources inline. See embed section below. |
| `_envelope` | any | — | Wrap the response in an envelope object that includes status, headers, and body. |
| `_pretty` | any | — | Pretty-print the JSON output. |
| `_jsonp` | `string` | — | Wrap the response in a JSONP callback function. |

**Constraint:** When `orderby=relevance`, a non-empty `search` is required. When `orderby=include`, a non-empty `include` is required.

**Sticky post behavior:** The `sticky` filter uses the site's `sticky_posts` option. When `sticky=true`, `post__in` is set to the sticky IDs (intersected with any existing `include` filter). When `sticky=false`, sticky IDs are appended to `post__not_in`.

### Response Fields — GET /wp/v2/posts/{id}

All dates are ISO8601 / RFC3339 strings in the site's configured timezone (for `date`/`modified`) or UTC (for `date_gmt`/`modified_gmt`). Draft posts with no explicit published date return `0000-00-00 00:00:00` in the database; the API shims the GMT value from the local date.

| Field | Type | Context | Read-only | Description |
|---|---|---|---|---|
| `id` | `integer` | view, edit, embed | yes | Unique post ID. |
| `date` | `string\|null` | view, edit, embed | no | Publication date in site timezone (ISO8601). |
| `date_gmt` | `string\|null` | view, edit | no | Publication date in UTC (ISO8601). |
| `guid` | `{ rendered: string, raw: string }` | view/edit | yes | Global unique identifier. `raw` only in `edit` context. |
| `modified` | `string` | view, edit | yes | Last-modified date in site timezone (ISO8601). |
| `modified_gmt` | `string` | view, edit | yes | Last-modified date in UTC (ISO8601). |
| `slug` | `string` | view, edit, embed | no | URL-safe alphanumeric identifier unique within its type. |
| `status` | `string` | view, edit | no | Named post status: `publish`, `future`, `draft`, `pending`, `private`, `trash`, or custom. |
| `type` | `string` | view, edit, embed | yes | Post type slug (e.g. `post`, `page`). |
| `link` | `string` (URI) | view, edit, embed | yes | Full permalink URL. |
| `title` | `{ rendered: string, raw?: string }` | view, edit, embed | partial | `raw` only in `edit` context. `rendered` is the HTML title. |
| `content` | `{ rendered: string, raw?: string, protected: boolean, block_version?: integer }` | view, edit | partial | `raw` and `block_version` only in `edit` context. `rendered` is empty string if password-protected and no password supplied. |
| `excerpt` | `{ rendered: string, raw?: string, protected: boolean }` | view, edit, embed | partial | `raw` only in `edit` context. |
| `author` | `integer` | view, edit, embed | no | Author user ID. |
| `featured_media` | `integer` | view, edit, embed | no | Featured image attachment ID (0 if none). |
| `comment_status` | `string` enum `open\|closed` | view, edit | no | Whether comments are open. |
| `ping_status` | `string` enum `open\|closed` | view, edit | no | Whether the post accepts pingbacks/trackbacks. |
| `sticky` | `boolean` | view, edit | no | Whether the post is pinned to the top of the listing. Posts only. |
| `template` | `string` | view, edit | no | Theme template file assigned to this post (empty string means default). |
| `format` | `string` | view, edit | no | Post format slug (e.g. `standard`, `video`, `audio`). Posts with `post-formats` support only. |
| `meta` | `object` | view, edit | no | Key-value map of meta fields registered with `show_in_rest: true`. |
| `categories` | `integer[]` | view, edit | no | Array of assigned category term IDs. |
| `tags` | `integer[]` | view, edit | no | Array of assigned tag term IDs. |
| `parent` | `integer` | view, edit | no | Parent post ID. Hierarchical post types only. |
| `menu_order` | `integer` | view, edit | no | Sort order integer. Post types with `page-attributes` only. |
| `password` | `string` | edit | no | Post password. Empty string means no password. Edit context only. |
| `permalink_template` | `string` | edit | yes | Permalink URL template with `%postname%` placeholder. Public post types, edit context only. |
| `generated_slug` | `string` | edit | yes | Auto-generated slug from the title. Public post types, edit context only. |
| `class_list` | `string[]` | view, edit | yes | CSS classes for the post container element. Public post types only. |

**Custom taxonomy terms** are also present as fields. For each taxonomy with `show_in_rest: true` that is associated with the post type, a field named by the taxonomy's `rest_base` (or its `name` if no `rest_base`) contains an array of assigned term IDs.

### The `_embed` Parameter

When `?_embed` is present (or `?_embed=1`), the server performs internal sub-requests for all linked resources marked `embeddable: true` and inlines their responses into the `_embedded` object. The value of `_embed` can also be a comma-separated list of link relation names to selectively embed.

Embeddable relations in post responses:

| Relation | Key in `_embedded` | What it contains |
|---|---|---|
| `author` | `author` | Array with the embedded WP user object(s) |
| `https://api.w.org/featuredmedia` | `wp:featuredmedia` | Array with the embedded media attachment object |
| `https://api.w.org/term` | `wp:term` | Array of arrays, one per taxonomy, each containing its term objects |
| `replies` | `replies` | Array with the first page of comments on the post |

The embed cache (`embed_cache`) is per-request, so the same embedded object fetched multiple times in a collection response is only fetched once.

### Content Rendering

`content.rendered` is produced by running the stored post content through the `the_content` filter chain. For block-based content this includes the block parser and renderer. The output is full HTML ready for direct injection into the page. For password-protected posts, `content.rendered` is an empty string unless the request supplies the correct password via the `?password=` query parameter, or the authenticated user has `edit_post` capability for that post.

`content.block_version` (edit context only) is the integer output of `block_version()`. A value of 0 means the content does not use blocks; 1 means it does.

### The `context` Parameter

| Context | Who can use it | Extra fields unlocked |
|---|---|---|
| `view` | Public | Standard public fields |
| `embed` | Public | Subset of view fields: id, date, slug, type, link, title.rendered, excerpt.rendered, author, featured_media, content.protected |
| `edit` | Authenticated user with `edit_posts` cap | All `raw` subfields, `password`, `date_gmt`, `modified_gmt`, `guid.raw`, `content.block_version`, `permalink_template`, `generated_slug` |

The `edit` context on the collection endpoint also allows querying non-`publish` statuses and returns draft/private posts that the user has permission to edit. Without `edit` context, the collection endpoint only returns `publish` status (or whatever the `status` parameter is set to, subject to capability enforcement).

### Creating/Updating Posts — POST / PUT / PATCH

Authentication is required for all write operations. Writable fields on POST/PUT/PATCH:

| Field | Notes |
|---|---|
| `title` | String or `{ raw: string }` |
| `content` | String or `{ raw: string }` |
| `excerpt` | String or `{ raw: string }` |
| `status` | Changing to `publish` or `future` requires `publish_posts` cap. Changing to `private` requires `publish_posts` cap. |
| `author` | Setting a different author requires `edit_others_posts` cap. |
| `date` | ISO8601 local time |
| `date_gmt` | ISO8601 UTC |
| `slug` | Sanitized post name |
| `password` | Post password. Cannot be set if `sticky` is true. |
| `sticky` | Boolean. Requires `edit_others_posts` or `publish_posts` cap. Cannot be set if post has a password. |
| `featured_media` | Attachment ID, 0 to remove |
| `template` | Page template filename. Must be a valid template for the post type. |
| `format` | Post format slug |
| `meta` | Object of meta key-value pairs (only keys registered with `show_in_rest: true`) |
| `categories` | Array of category term IDs (replaces all assignments) |
| `tags` | Array of tag term IDs (replaces all assignments) |
| `parent` | Parent post ID (hierarchical post types) |
| `comment_status` | `open` or `closed` |
| `ping_status` | `open` or `closed` |

**Create (POST):** Returns HTTP 201 with a `Location` header pointing to the new resource.

**Update (PUT/PATCH):** Returns HTTP 200 with the updated resource.

**Delete (DELETE):**
- Without `?force=true`: moves the post to the `trash` status (if the post type supports trash and `EMPTY_TRASH_DAYS > 0`). Returns the trashed post object.
- With `?force=true`: permanently deletes the post. Returns `{ deleted: true, previous: <post object> }`.
- Attempting to trash an already-trashed post returns HTTP 410.

**Drafts and pending posts with a `slug`:** The controller pre-generates a unique slug using `publish` status to avoid slug collision issues that are a known WordPress edge case.

### Password-Protected Posts

- `content.protected` and `excerpt.protected` are `true` when the post has a password.
- `content.rendered` and `excerpt.rendered` return empty strings for password-protected posts when the requester has not supplied the password.
- To read protected content, pass `?password={post_password}` as a query parameter. The password is checked with `hash_equals`.
- Authenticated users with `edit_post` capability always see the content regardless of password.

### Draft/Private Post Visibility

- `status=publish` is the default filter. Only `publish` posts are returned without authentication.
- `status=private` is accessible to users with `read_private_posts` cap or `edit_posts` cap.
- `status=draft`, `status=pending` require `edit_posts` cap.
- `status=any` requires `edit_posts` cap and returns all statuses.
- Posts can only be individually accessed if `check_read_permission` returns true: the post must be `publish`, or have a public custom status, or the current user must have `read_post` cap for it.

---

## 4. Authentication for Headless

### Cookie Authentication (nonce-based)

Used only for requests from the same browser session as the WordPress admin. Requires:
1. The user is logged in (session cookie is present).
2. The request includes the header `X-WP-Nonce: {nonce}` where the nonce was generated by WordPress via `wp_create_nonce('wp_rest')`.

This mechanism is not usable for server-to-server or external frontend requests. It is the mechanism used internally by Gutenberg.

### Application Passwords

Introduced in WordPress 5.6. The native mechanism for external API clients.

**How it works:**
- An application password is a 24-character random string generated by WordPress and stored as a bcrypt-derived hash in user meta under `_application_passwords`.
- The client authenticates every request using HTTP Basic Authentication: `Authorization: Basic base64(username:application_password)`.
- WordPress intercepts the Basic Auth header during `rest_api_init`, verifies the supplied password against the stored hash, and logs in the user if it matches.
- No `X-WP-Nonce` header is required.
- Application passwords only work within REST API requests; they are explicitly rejected for regular login flows.

**Format of a generated application password:**
The raw password is 24 characters, no special characters. When displayed to the user after generation, it is formatted as groups of 4 characters separated by spaces for readability: `XXXX XXXX XXXX XXXX XXXX XXXX`. The spaces must be stripped before encoding in the Basic Auth header (or are handled automatically by most HTTP clients).

**Creating application passwords via REST:**
```
POST /wp/v2/users/{user_id}/application-passwords
Content-Type: application/json
Authorization: Basic base64(username:current_password)

{ "name": "My Headless App", "app_id": "optional-uuid" }
```

Response:
```json
{
  "uuid": "...",
  "app_id": "...",
  "name": "My Headless App",
  "password": "XXXX XXXX XXXX XXXX XXXX XXXX",
  "created": "2025-01-01T00:00:00",
  "last_used": null,
  "last_ip": null
}
```

The `password` field is only present in the creation response. It is never retrievable again afterward. The stored value is a one-way hash (`wp_fast_hash` as of WP 6.8, previously phpass).

**Listing/revoking application passwords:**
```
GET    /wp/v2/users/{user_id}/application-passwords
DELETE /wp/v2/users/{user_id}/application-passwords/{uuid}
DELETE /wp/v2/users/me/application-passwords   // revoke all
```

**Usage in a TypeScript client:**
```typescript
const credentials = btoa(`${username}:${appPassword.replace(/\s/g, '')}`);

const response = await fetch(`${wpBaseUrl}/wp-json/wp/v2/posts`, {
  headers: {
    'Authorization': `Basic ${credentials}`,
    'Content-Type': 'application/json',
  },
});
```

### JWT (not built-in)

JWT authentication is not included in WordPress core. External plugins such as JWT Authentication for WP REST API provide JWT support by hooking into `rest_authentication_errors`. The application password mechanism described above is the official core-supported alternative for programmatic access.

### OAuth 1.0a (not built-in)

OAuth 1.0a was part of the original REST API plugin but was never merged into core. Not available without a third-party plugin.

### The `rest_authentication_errors` Filter Chain

Authentication in WordPress REST API is a filter, not a fixed mechanism. The server calls:

```php
apply_filters('rest_authentication_errors', null)
```

If the result is a `WP_Error`, the request is rejected with that error. If `true`, authentication succeeded. If `null`, no authentication method claimed the request (anonymous access proceeds).

Multiple authentication methods can coexist. Each checks whether its credentials are present and returns `null` if they are not, allowing the next method to check.

Equivalent TypeScript behavior:

```typescript
type AuthResult = { success: true } | { error: ApiError } | null;

function checkAuthentication(req: Request): AuthResult {
  for (const method of authMethods) {
    const result = method.check(req);
    if (result !== null) return result;
  }
  return null; // anonymous
}
```

---

## 5. CORS

### Default Behavior

CORS headers are sent via the `rest_send_cors_headers` function, which is attached to the `rest_pre_serve_request` filter. The exact headers sent depend on whether the request has an `Origin` header:

**When `Origin` header is present:**
```
Access-Control-Allow-Origin: {origin}
Access-Control-Allow-Methods: OPTIONS, GET, POST, PUT, PATCH, DELETE
Access-Control-Allow-Credentials: true
Vary: Origin
```

Note: WordPress reflects the exact origin back. It does not use a wildcard (`*`). This is because `Access-Control-Allow-Credentials: true` is incompatible with `*`.

**When no `Origin` header is present (same-origin or server-side requests):**
- On GET requests from anonymous users, only `Vary: Origin` is sent.

### Exposed Response Headers

The following headers are included in `Access-Control-Expose-Headers` so that browser JavaScript can read them:

```
X-WP-Total, X-WP-TotalPages, Link
```

Filterable via the `rest_exposed_cors_headers` filter (added in WP 5.5).

### Allowed Request Headers

The following headers are included in `Access-Control-Allow-Headers`:

```
Authorization, X-WP-Nonce, Content-Disposition, Content-MD5, Content-Type
```

Filterable via the `rest_allowed_cors_headers` filter (added in WP 5.5).

### Preflight (OPTIONS) Requests

OPTIONS requests are intercepted before authentication via the `rest_handle_options_request` filter. They return HTTP 200 with the allow headers and an empty body.

### Configuring CORS for Headless Usage

WordPress's default CORS policy reflects any origin and allows credentials. For headless use this is usually sufficient. If you need to restrict to specific origins, hook into `rest_pre_serve_request`:

```php
add_filter('rest_pre_serve_request', function($served, $result, $request, $server) {
    $allowed_origins = ['https://my-frontend.com'];
    $origin = get_http_origin();
    if (in_array($origin, $allowed_origins)) {
        header('Access-Control-Allow-Origin: ' . $origin);
    }
    return $served;
}, 15, 4);
```

Equivalent TypeScript middleware behavior (for reference when reimplementing):

```typescript
function corsMiddleware(req: Request, allowedOrigins: string[]): Record<string, string> {
  const origin = req.headers.get('origin');
  if (!origin) return { 'Vary': 'Origin' };

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'OPTIONS, GET, POST, PUT, PATCH, DELETE',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Expose-Headers': 'X-WP-Total, X-WP-TotalPages, Link',
    'Access-Control-Allow-Headers': 'Authorization, X-WP-Nonce, Content-Disposition, Content-MD5, Content-Type',
    'Vary': 'Origin',
  };

  if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}
```

---

## 6. Menus in Headless

Menus and menu items were added to the REST API in WordPress 5.9.

### Access Control

The menus and menu-items endpoints are **not publicly accessible by default**. A request must pass one of these checks:

1. The `rest_menu_read_access` filter returns `true` (allows plugins to open access).
2. The current user has the `edit_theme_options` capability.
3. The current user has the `edit_posts` capability.
4. The current user can edit posts of any REST-exposed post type.

For a publicly accessible headless site, the typical solution is to use a plugin that returns `true` from `rest_menu_read_access`, or to use Application Password auth in the server-side frontend rendering process.

### `GET /wp/v2/menus`

Returns a list of nav menus. Each menu is a term in the `nav_menu` taxonomy. Inherits all standard term collection parameters plus:

**Response fields for each menu:**

| Field | Type | Description |
|---|---|---|
| `id` | `integer` | Term ID of the menu. |
| `name` | `string` | Menu name as displayed in the admin. |
| `slug` | `string` | URL-safe slug. |
| `description` | `string` | Menu description. |
| `count` | `integer` | Number of items in this menu. |
| `link` | `string` | URL to the menu's REST resource. |
| `taxonomy` | `string` | Always `nav_menu`. |
| `meta` | `object` | Meta fields registered for terms. |
| `locations` | `string[]` | Array of theme location slugs this menu is assigned to. |
| `auto_add` | `boolean` | Whether new top-level pages are automatically added to this menu. |
| `_links` | `object` | HAL-style links. Includes `wp:menu-location` links to each assigned location. |

### `GET /wp/v2/menu-items`

Returns a flat list of nav menu item posts (stored as `nav_menu_item` post type internally).

**Collection query parameters:**

All standard post collection params apply, plus:
- `menus` (integer or integer[]): Filter by menu ID(s).
- `menus_exclude` (integer or integer[]): Exclude items from these menu IDs.

**Response fields for each menu item:**

| Field | Type | Description |
|---|---|---|
| `id` | `integer` | Post ID of the menu item. |
| `title` | `{ rendered: string, raw?: string }` | Display title of the menu item. |
| `status` | `string` | Post status. Only `publish` or `draft` are valid for menu items. |
| `url` | `string` | The URL the item links to. |
| `attr_title` | `string` | The `title` attribute for the link element. |
| `description` | `string` | Description text for the menu item. |
| `type` | `string` enum | Item type: `taxonomy`, `post_type`, `post_type_archive`, or `custom`. |
| `type_label` | `string` | Human-readable label for the type. |
| `object` | `string` | Object slug: the taxonomy name, post type name, or empty string for custom links. |
| `object_id` | `integer` | The ID of the linked object (term ID or post ID). 0 for custom links. |
| `parent` | `integer` | Parent menu item ID. 0 for top-level items. |
| `menu_order` | `integer` | Sort position within the menu. |
| `target` | `string` enum `_blank\|` | Link target. |
| `classes` | `string[]` | CSS classes applied to the link. |
| `xfn` | `string[]` | XFN relationship values. |
| `invalid` | `boolean` | Whether the linked object no longer exists. |
| `meta` | `object` | Meta fields. |
| `menus` | `integer` | The ID of the menu this item belongs to. |
| `_links` | `object` | HAL links. Includes `wp:menu-item-object` link to the target REST resource when the target is a post or term. |

### Reconstructing the Menu Tree

The API returns a flat array. To reconstruct the hierarchical tree, group by `parent` and sort by `menu_order`:

```typescript
function buildMenuTree(items: WPMenuItem[]): WPMenuItem[] {
  const sorted = [...items].sort((a, b) => a.menu_order - b.menu_order);
  const map = new Map<number, WPMenuItem & { children: WPMenuItem[] }>();

  for (const item of sorted) {
    map.set(item.id, { ...item, children: [] });
  }

  const roots: (WPMenuItem & { children: WPMenuItem[] })[] = [];

  for (const item of sorted) {
    const node = map.get(item.id)!;
    if (item.parent === 0) {
      roots.push(node);
    } else {
      const parentNode = map.get(item.parent);
      if (parentNode) {
        parentNode.children.push(node);
      } else {
        roots.push(node); // orphan, treat as root
      }
    }
  }

  return roots;
}
```

### Menu Locations

To resolve which menu is assigned to which theme location, use:

```
GET /wp/v2/menu-locations
GET /wp/v2/menu-locations/{location}
```

Each location object has `name`, `description`, and a `_links` entry to the assigned menu.

---

## 7. Custom Post Types and REST

### Opting a Post Type into REST

When registering a post type, include:

```php
register_post_type('product', [
    'show_in_rest' => true,          // required to expose via REST API
    'rest_base'    => 'products',    // URL segment, defaults to post type name
    'rest_namespace' => 'wp/v2',     // namespace, defaults to 'wp/v2'
    'rest_controller_class' => 'WP_REST_Posts_Controller', // defaults to this
]);
```

At site initialization, WordPress iterates all post types with `show_in_rest: true` and calls `register_routes()` on each type's controller instance. This produces routes at `/wp-json/{namespace}/{rest_base}` and `/wp-json/{namespace}/{rest_base}/{id}`.

### Opting a Taxonomy into REST

```php
register_taxonomy('genre', 'product', [
    'show_in_rest' => true,
    'rest_base'    => 'genres',
    'rest_namespace' => 'wp/v2',
    'rest_controller_class' => 'WP_REST_Terms_Controller',
]);
```

Produces routes at `/wp-json/wp/v2/genres` and `/wp-json/wp/v2/genres/{id}`.

### Registering Custom Fields via `register_rest_field()`

```php
register_rest_field('post', 'my_field', [
    'get_callback' => function($post_data) {
        return get_post_meta($post_data['id'], 'my_field', true);
    },
    'update_callback' => function($value, $post) {
        update_post_meta($post->ID, 'my_field', sanitize_text_field($value));
    },
    'schema' => [
        'description' => 'My custom field.',
        'type' => 'string',
        'context' => ['view', 'edit'],
    ],
]);
```

The first argument can be a single object type string or an array of type strings. The field is then present on all REST responses for that object type.

### Registering Custom Fields via `register_meta()`

```php
register_meta('post', 'my_field', [
    'show_in_rest' => true,
    'single' => true,
    'type' => 'string',
    'description' => 'My field',
    'auth_callback' => function() { return current_user_can('edit_posts'); },
]);
```

Meta registered this way appears in the `meta` field of the REST response.

### The OPTIONS Schema Endpoint

`OPTIONS /wp-json/wp/v2/posts` (or any route) returns an `Allow` header listing valid HTTP methods and a body containing:

```json
{
  "namespace": "wp/v2",
  "methods": ["GET", "POST"],
  "endpoints": [...],
  "schema": {
    "title": "post",
    "type": "object",
    "properties": { ... }
  }
}
```

The `schema.properties` object is the authoritative description of all fields, their types, contexts, and whether they are `readonly`.

---

## 8. Pagination and Linking

### Response Headers

Every collection endpoint sets these response headers:

| Header | Type | Description |
|---|---|---|
| `X-WP-Total` | `integer` | Total number of matching items across all pages. |
| `X-WP-TotalPages` | `integer` | Total number of pages given the current `per_page`. |
| `Link` | `string` | RFC 5988 link headers for prev/next pages. |

**`Link` header format:**
```
Link: <https://example.com/wp-json/wp/v2/posts?page=2>; rel="next"
Link: <https://example.com/wp-json/wp/v2/posts?page=1>; rel="prev"
```

Both `rel="next"` and `rel="prev"` may be present on the same response. Only one is present when on the first or last page.

### Pagination Parameters

| Parameter | Default | Max | Notes |
|---|---|---|---|
| `per_page` | `10` | `100` | Can be set to 0 only with special handling; capped at 100. |
| `page` | `1` | — | 1-indexed. Returns HTTP 400 if page exceeds total pages (when total > 0). |
| `offset` | — | — | Absolute record offset. Overrides page-based pagination when set. |

### HAL-style `_links`

Every REST response object includes a `_links` object (when `_fields` does not exclude it). This follows a subset of the HAL spec. Link relations use either IANA-registered names (`self`, `collection`, `author`, `replies`, `about`, `up`) or WordPress-specific URLs as relation names (`https://api.w.org/term`, `https://api.w.org/featuredmedia`, etc.).

WordPress uses CURIEs to shorten the `https://api.w.org/{rel}` prefix to `wp:{rel}` in the serialized output:

```json
{
  "_links": {
    "self": [{ "href": "https://example.com/wp-json/wp/v2/posts/1" }],
    "collection": [{ "href": "https://example.com/wp-json/wp/v2/posts" }],
    "author": [{ "href": "https://example.com/wp-json/wp/v2/users/1", "embeddable": true }],
    "wp:featuredmedia": [{ "href": "https://example.com/wp-json/wp/v2/media/42", "embeddable": true }],
    "wp:term": [
      { "href": "https://example.com/wp-json/wp/v2/categories?post=1", "taxonomy": "category", "embeddable": true },
      { "href": "https://example.com/wp-json/wp/v2/tags?post=1", "taxonomy": "post_tag", "embeddable": true }
    ],
    "wp:attachment": [{ "href": "https://example.com/wp-json/wp/v2/media?parent=1" }],
    "version-history": [{ "href": "...", "count": 5 }],
    "predecessor-version": [{ "href": "...", "id": 23 }],
    "curies": [{ "name": "wp", "href": "https://api.w.org/{rel}", "templated": true }]
  }
}
```

Links marked `"embeddable": true` are resolved by `?_embed`.

**`targetHints`:** As of WP 6.7, the `self` link includes a `targetHints` object describing the `allow`ed HTTP methods for that resource, based on the current user's permissions.

---

## 9. Search

### Unified Search Endpoint

```
GET /wp/v2/search
```

This endpoint is publicly accessible without authentication. It uses a pluggable handler system.

**Query parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `search` | `string` | — | Search string. Required for meaningful results. |
| `type` | `string` | `post` | The top-level type of result. Built-in values: `post`, `term`, `post-format`. |
| `subtype` | `string` | `any` | A sub-type within the `type`. For `post` type, this is a post type slug. For `term` type, this is a taxonomy slug. Use `any` to search all subtypes. |
| `page` | `integer` | `1` | Current page. |
| `per_page` | `integer` | `10` | Items per page. Max 100. |
| `exclude` | `integer[]` | `[]` | Exclude these IDs. |
| `include` | `integer[]` | `[]` | Limit to these IDs. |

**Response fields:**

| Field | Type | Description |
|---|---|---|
| `id` | `integer\|string` | ID of the matched item. |
| `title` | `string` | Title of the matched item. |
| `url` | `string` | Permalink URL of the matched item. |
| `type` | `string` | The result type (`post`, `term`, `post-format`). |
| `subtype` | `string` | The result subtype (post type slug or taxonomy slug). |

Pagination follows the same `X-WP-Total`, `X-WP-TotalPages`, and `Link` header conventions.

### Per-Endpoint Search

Every collection endpoint accepts `?search={term}`. For post endpoints, this uses `WP_Query`'s `s` parameter. The `search_columns` parameter restricts which database columns are searched (`post_title`, `post_content`, `post_excerpt`). The `search_semantics=exact` parameter wraps the search term for exact matching.

### Custom Search Types

Developers register custom search handlers by filtering `wp_rest_search_handlers`:

```php
add_filter('wp_rest_search_handlers', function($handlers) {
    $handlers[] = new My_Custom_Search_Handler();
    return $handlers;
});
```

Each handler must extend `WP_REST_Search_Handler` and implement:
- `get_type()` — returns the `type` string
- `get_subtypes()` — returns valid subtypes
- `search_items($request)` — returns `[RESULT_IDS => int[], RESULT_TOTAL => int]`
- `prepare_item($id, $fields)` — returns the data array for one result
- `prepare_item_links($id)` — returns the `_links` array for one result

---

## 10. Block Content in Headless Context

### `content.rendered`

For the vast majority of headless use cases, `content.rendered` is the correct field to consume. It is produced server-side by WordPress's block parser and renderer pipeline:

1. The raw content (block markup) is parsed into a block tree.
2. Each block's `render_callback` is invoked.
3. The `the_content` filter chain runs on the result (including shortcode processing, autop, embed resolution, etc.).
4. The final HTML string is returned.

This HTML is complete and ready for `innerHTML` injection. It includes all block-generated CSS classes and inline styles.

### `content.block_version`

Available only in `edit` context. Returns an integer:
- `0`: the content does not contain any block markup (classic editor content).
- `1`: the content uses Gutenberg block markup (the current block format version).

### Raw Block Markup

The raw block serialization format is available in `content.raw`, which is only present in `edit` context (requires authentication + edit capability):

```
GET /wp-json/wp/v2/posts/1?context=edit
Authorization: Basic ...
```

The raw format looks like:

```
<!-- wp:paragraph -->
<p>Hello world.</p>
<!-- /wp:paragraph -->

<!-- wp:image {"id":42,"sizeSlug":"large"} -->
<figure class="wp-block-image size-large"><img src="..." /></figure>
<!-- /wp:image -->
```

Each block is an HTML comment delimiter containing optional JSON attributes, followed by the block's static HTML content. Custom blocks can have a `save()` function that produces the HTML, or can be "dynamic" with no saved HTML (content is rendered server-side on every request).

**Client-side block parsing:** The `@wordpress/blocks` package (available via npm as part of the Gutenberg monorepo) provides `parse(rawContent)` which returns an array of block objects with `blockName`, `attrs`, `innerBlocks`, and `innerHTML`. This allows a headless frontend to inspect block structure and render blocks in a custom way.

### Full Site Editing (FSE) Blocks and Templates

For FSE-enabled themes, templates are accessible via:

```
GET /wp/v2/templates
GET /wp/v2/templates/{id}
```

Templates contain raw block markup in their `content.raw` field and rendered HTML in `content.rendered`. Template parts follow the same pattern at `/wp/v2/template-parts`.

---

## 11. Routing for Headless Frontends

### Slug-Based URL Generation

WordPress assigns each post a `slug` (stored as `post_name`). The `link` field in the REST response contains the full canonical permalink. A headless frontend that mirrors WordPress's URL structure uses the slug to construct its own routing.

**Single post by slug:**
```
GET /wp-json/wp/v2/posts?slug=my-post-slug&_embed
```

Returns an array (possibly empty, possibly with one item). The `slug` parameter accepts multiple values (array), so multiple posts can be fetched by slug in one request.

**Page by slug:**
```
GET /wp-json/wp/v2/pages?slug=about
```

For hierarchical pages, the slug is only the last path segment. A page at `/about/team/` has slug `team`. To resolve the full path, either use the `link` field or traverse `parent` IDs.

### URL Pattern Mapping

| WordPress URL structure | Resolution strategy |
|---|---|
| `/{post-slug}/` | `GET /wp/v2/posts?slug={slug}` |
| `/category/{category-slug}/` | `GET /wp/v2/categories?slug={slug}`, then `GET /wp/v2/posts?categories={id}` |
| `/tag/{tag-slug}/` | `GET /wp/v2/tags?slug={slug}`, then `GET /wp/v2/posts?tags={id}` |
| `/{year}/{month}/{day}/{slug}/` | `GET /wp/v2/posts?slug={slug}&after={date}&before={next-date}` |
| `/author/{user-slug}/` | `GET /wp/v2/users?slug={user-slug}`, then `GET /wp/v2/posts?author={id}` |
| `/page/{n}/` | `GET /wp/v2/posts?page={n}` |

**Author slugs:** The user's `slug` field in the REST API is their `user_nicename` value, which is the same slug used in `/{author-slug}/` archive URLs.

### Category and Tag Slugs

Terms have a `slug` field. Use it:
```
GET /wp-json/wp/v2/categories?slug=technology
```

The `link` field on the term object is the full archive URL.

### Date Archives

WordPress does not have a specific date-archive REST endpoint. Emulate with `after`/`before` date parameters:
```
GET /wp-json/wp/v2/posts?after=2025-01-01T00:00:00&before=2025-02-01T00:00:00
```

### SEO Data

WordPress core does not serve SEO head tags via REST. This requires a plugin:
- **Yoast SEO**: exposes `yoast_head` (rendered HTML) and `yoast_head_json` (structured data) on post/term REST responses.
- **RankMath**: exposes `rank_math_head` and related fields.

These are non-core additions registered via `register_rest_field()`. Their presence must be confirmed via `OPTIONS` schema discovery.

---

## 12. Preview / Draft Content

### The Challenge

Draft and private posts are not visible to anonymous users. A headless frontend serving previews from WordPress must authenticate its requests to the REST API using a token that has access to drafts.

### Preview URLs

WordPress generates preview URLs of the form:
```
https://example.com/?p={post_id}&preview=true&preview_nonce={nonce}
```

In a headless setup, the frontend intercepts this URL and exchanges the nonce for content.

### Draft Access via REST

To access a draft post:
```
GET /wp-json/wp/v2/posts/{id}?context=edit
Authorization: Basic {base64(username:apppassword)}
```

Or without `context=edit` (to get the view-context fields without raw markup):
```
GET /wp-json/wp/v2/posts/{id}?status=draft
Authorization: Basic ...
```

The API returns the draft post if the authenticated user has `read_post` capability for it.

### Autosave Access

WordPress stores autosaves as child posts. Access the latest autosave:
```
GET /wp-json/wp/v2/posts/{id}/autosaves
Authorization: Basic ...
```

### Preview Nonce Approach

For preview links where the nonce must be validated:

1. The preview URL contains `?preview_nonce={nonce}&p={id}`.
2. The frontend server verifies the nonce by making an authenticated request to the WP admin (via the REST API or a custom endpoint).
3. If valid, the server fetches the autosave or draft via the REST API using a privileged application password.
4. The fetched content is rendered and returned to the browser.

This requires a server-side rendering step; the preview content cannot be fetched securely from the browser using only the nonce (which is user-session-bound and only usable with the session cookie).

---

## 13. TypeScript Interface Sketch

```typescript
// ─────────────────────────────────────────────
// Common
// ─────────────────────────────────────────────

interface WPRendered {
  rendered: string;
}

interface WPRenderedRaw extends WPRendered {
  raw?: string; // only in edit context
}

interface WPRenderedRawProtected extends WPRenderedRaw {
  protected: boolean;
}

interface WPContentField extends WPRenderedRawProtected {
  block_version?: number; // only in edit context
}

interface WPLinks {
  self: Array<{ href: string; targetHints?: { allow: string[] } }>;
  collection: Array<{ href: string }>;
  about?: Array<{ href: string }>;
  author?: Array<{ href: string; embeddable: boolean }>;
  replies?: Array<{ href: string; embeddable: boolean }>;
  'version-history'?: Array<{ href: string; count: number }>;
  'predecessor-version'?: Array<{ href: string; id: number }>;
  'wp:featuredmedia'?: Array<{ href: string; embeddable: boolean }>;
  'wp:attachment'?: Array<{ href: string }>;
  'wp:term'?: Array<{ href: string; taxonomy: string; embeddable: boolean }>;
  'wp:menu-location'?: Array<{ href: string; embeddable: boolean }>;
  curies: Array<{ name: string; href: string; templated: boolean }>;
  [rel: string]: Array<{ href: string; [key: string]: unknown }> | undefined;
}

interface WPEmbedded {
  author?: WPUser[];
  'wp:featuredmedia'?: WPMedia[];
  'wp:term'?: WPTerm[][];
  replies?: WPComment[][];
}

// ─────────────────────────────────────────────
// Posts
// ─────────────────────────────────────────────

interface WPPost {
  id: number;
  date: string | null;          // ISO8601, site timezone
  date_gmt: string | null;      // ISO8601, UTC (view/edit context)
  guid: WPRendered;             // .raw only in edit context
  modified: string;             // ISO8601, site timezone
  modified_gmt: string;         // ISO8601, UTC (view/edit context)
  slug: string;
  status: 'publish' | 'future' | 'draft' | 'pending' | 'private' | 'trash' | string;
  type: string;
  link: string;
  title: WPRenderedRaw;
  content: WPContentField;
  excerpt: WPRenderedRawProtected;
  author: number;
  featured_media: number;
  comment_status: 'open' | 'closed';
  ping_status: 'open' | 'closed';
  sticky: boolean;              // posts only
  template: string;
  format: string;               // posts with post-formats support
  meta: Record<string, unknown>;
  categories: number[];
  tags: number[];
  // hierarchical post types
  parent?: number;
  menu_order?: number;
  // edit context only
  password?: string;
  permalink_template?: string;
  generated_slug?: string;
  // public post types (view/edit)
  class_list?: string[];
  _links: WPLinks;
  _embedded?: WPEmbedded;
}

// ─────────────────────────────────────────────
// Pages (hierarchical post type)
// ─────────────────────────────────────────────

interface WPPage extends Omit<WPPost, 'sticky' | 'format' | 'categories' | 'tags'> {
  parent: number;
  menu_order: number;
}

// ─────────────────────────────────────────────
// Media (attachments)
// ─────────────────────────────────────────────

interface WPMediaSize {
  file: string;
  width: number;
  height: number;
  filesize?: number;
  mime_type: string;
  source_url: string;
}

interface WPMediaDetails {
  width: number;
  height: number;
  file: string;
  filesize?: number;
  sizes: Record<string, WPMediaSize>;
  image_meta: Record<string, unknown>;
}

interface WPMedia extends Omit<WPPost, 'sticky' | 'format' | 'categories' | 'tags'> {
  type: 'attachment';
  alt_text: string;
  caption: WPRenderedRaw;
  description: WPRenderedRaw;
  media_type: 'image' | 'file';
  mime_type: string;
  media_details: WPMediaDetails;
  post: number | null;         // parent post ID
  source_url: string;
}

// ─────────────────────────────────────────────
// Users / Authors
// ─────────────────────────────────────────────

interface WPUser {
  id: number;
  name: string;                // display name
  url: string;                 // website URL
  description: string;         // biographical info
  link: string;                // author archive URL
  slug: string;                // user_nicename, used in author archive URL
  avatar_urls: Record<'24' | '48' | '96' | string, string>;
  meta: Record<string, unknown>;
  // edit context only
  username?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  registered_date?: string;
  roles?: string[];
  capabilities?: Record<string, boolean>;
  extra_capabilities?: Record<string, boolean>;
  locale?: string;
  _links: WPLinks;
}

// ─────────────────────────────────────────────
// Terms (categories, tags, custom taxonomies)
// ─────────────────────────────────────────────

interface WPTerm {
  id: number;
  count: number;               // number of posts assigned
  description: string;
  link: string;                // archive URL
  name: string;
  slug: string;
  taxonomy: string;            // taxonomy slug
  parent: number;              // parent term ID (0 for top-level); hierarchical taxonomies only
  meta: Record<string, unknown>;
  _links: WPLinks;
}

// ─────────────────────────────────────────────
// Menus
// ─────────────────────────────────────────────

interface WPMenu {
  id: number;
  name: string;
  slug: string;
  description: string;
  count: number;
  link: string;
  taxonomy: 'nav_menu';
  meta: Record<string, unknown>;
  locations: string[];         // theme location slugs
  auto_add: boolean;
  _links: WPLinks;
}

// ─────────────────────────────────────────────
// Menu Items
// ─────────────────────────────────────────────

interface WPMenuItem {
  id: number;
  title: WPRenderedRaw;
  status: 'publish' | 'draft';
  url: string;
  attr_title: string;
  description: string;
  type: 'taxonomy' | 'post_type' | 'post_type_archive' | 'custom';
  type_label: string;
  object: string;              // taxonomy name, post type name, or '' for custom
  object_id: number;           // linked term/post ID; 0 for custom links
  parent: number;              // parent menu item ID; 0 for root items
  menu_order: number;
  target: '_blank' | '';
  classes: string[];
  xfn: string[];
  invalid: boolean;
  meta: Record<string, unknown>;
  menus: number;               // ID of the containing menu
  _links: WPLinks;
  // populated when building tree client-side
  children?: WPMenuItem[];
}

// ─────────────────────────────────────────────
// Search Results
// ─────────────────────────────────────────────

interface WPSearchResult {
  id: number | string;
  title: string;
  url: string;
  type: 'post' | 'term' | 'post-format' | string;
  subtype: string;             // post type slug, taxonomy slug, or 'post-format'
  _links: WPLinks;
}

// ─────────────────────────────────────────────
// Comments
// ─────────────────────────────────────────────

interface WPComment {
  id: number;
  post: number;
  parent: number;
  author: number;              // user ID, 0 for anonymous
  author_name: string;
  author_url: string;
  author_avatar_urls: Record<string, string>;
  date: string;
  date_gmt: string;
  content: WPRenderedRaw;
  link: string;
  status: 'approved' | 'hold' | 'spam' | 'trash' | string;
  type: string;
  meta: Record<string, unknown>;
  _links: WPLinks;
}

// ─────────────────────────────────────────────
// Settings (requires admin auth)
// ─────────────────────────────────────────────

interface WPSettings {
  title: string;
  description: string;
  url: string;
  email: string;
  timezone: string;
  date_format: string;
  time_format: string;
  start_of_week: number;
  language: string;
  use_smilies: boolean;
  default_category: number;
  default_post_format: string;
  posts_per_page: number;
  show_on_front: 'posts' | 'page';
  page_on_front: number;
  page_for_posts: number;
  default_ping_status: 'open' | 'closed';
  default_comment_status: 'open' | 'closed';
  site_logo: number;
  site_icon: number;
  [key: string]: unknown; // additional registered settings
}

// ─────────────────────────────────────────────
// API Client Configuration
// ─────────────────────────────────────────────

interface RestApiConfig {
  baseUrl: string;             // e.g. 'https://example.com/wp-json'
  auth?: {
    type: 'basic';
    username: string;
    applicationPassword: string; // raw password, spaces will be stripped
  } | {
    type: 'nonce';
    nonce: string;             // value from wp_create_nonce('wp_rest')
  };
  defaultHeaders?: Record<string, string>;
}

// ─────────────────────────────────────────────
// Pagination
// ─────────────────────────────────────────────

interface PaginationHeaders {
  total: number;       // X-WP-Total
  totalPages: number;  // X-WP-TotalPages
  nextLink?: string;   // from Link header rel="next"
  prevLink?: string;   // from Link header rel="prev"
}

function parsePaginationHeaders(headers: Headers): PaginationHeaders {
  const total = parseInt(headers.get('X-WP-Total') ?? '0', 10);
  const totalPages = parseInt(headers.get('X-WP-TotalPages') ?? '0', 10);

  let nextLink: string | undefined;
  let prevLink: string | undefined;

  const linkHeader = headers.get('Link') ?? '';
  for (const part of linkHeader.split(',')) {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match) {
      if (match[2] === 'next') nextLink = match[1];
      if (match[2] === 'prev') prevLink = match[1];
    }
  }

  return { total, totalPages, nextLink, prevLink };
}

interface CollectionResponse<T> {
  items: T[];
  pagination: PaginationHeaders;
}
```

---

## 14. Design Patterns to Carry Over

### Route Registration Pattern

Every resource controller follows the same two-route pattern:

```typescript
// Collection route
registerRoute(`/${namespace}/${restBase}`, {
  GET:    { handler: getItems,    permissions: getItemsPermissionsCheck },
  POST:   { handler: createItem,  permissions: createItemPermissionsCheck },
});

// Single item route
registerRoute(`/${namespace}/${restBase}/:id`, {
  GET:    { handler: getItem,     permissions: getItemPermissionsCheck },
  PUT:    { handler: updateItem,  permissions: updateItemPermissionsCheck },
  PATCH:  { handler: updateItem,  permissions: updateItemPermissionsCheck },
  DELETE: { handler: deleteItem,  permissions: deleteItemPermissionsCheck },
});
```

Permissions are checked before the handler runs. A permissions function returns `true` for access granted, or an error object for access denied.

### The Permissions-Then-Handler Split

WordPress always separates `permission_callback` from `callback`. The permission function runs first; if it returns an error, the handler never runs. This is a structural guarantee: no handler can accidentally forget a permissions check.

### Parameter Priority Order

When resolving a parameter's value, the order of precedence (highest first) is:
1. JSON body (when Content-Type is application/json)
2. POST body (form-encoded body for POST/PUT/PATCH/DELETE)
3. GET query string
4. URL path parameters
5. Registered defaults

### Context Filtering

Every response is filtered by `context` before being returned. Fields with `context: ['edit']` only are stripped from `view` and `embed` responses. This prevents leaking raw content or admin-only fields to public requests.

### The `_fields` Sparse Fieldset

Any request can include `?_fields=id,slug,title` to request only those fields. The server checks `rest_is_field_included()` before computing each field, so expensive operations (like rendering block content) are skipped when not requested.

### Idempotent Delete

`DELETE` without `?force=true` moves to trash (soft delete). `DELETE` with `?force=true` permanently removes the record. The delete response always includes `{ deleted: true, previous: <object> }` for hard deletes, or the trashed object representation for soft deletes. This allows clients to confirm the state of the deleted resource.

### Error Response Shape

All error responses follow the same shape:

```typescript
interface WPApiError {
  code: string;              // machine-readable error code, e.g. 'rest_post_invalid_id'
  message: string;           // human-readable message
  data: {
    status: number;          // HTTP status code
    [key: string]: unknown;
  };
  additional_errors?: Array<{
    code: string;
    message: string;
    data: Record<string, unknown>;
  }>;
}
```

HTTP status codes follow REST conventions: 400 for bad input, 401 for unauthenticated, 403 for insufficient permissions, 404 for not found, 500 for server errors.

### Batch Request Processing

The `/batch/v1` endpoint processes multiple mutation requests in a single HTTP round trip. Each sub-request is an independent operation. The `validation` parameter controls behavior: `require-all-validate` aborts all requests if any fails validation; `normal` (default) processes each independently and returns mixed success/failure results.

### HAL Links as Navigation

The `_links` object in every response encodes the API graph. A well-behaved client can navigate the entire API starting from the root index by following links, without hardcoding URLs. The `embeddable: true` flag tells the client which links can be inlined via `?_embed`.

### CURIEs Prefix Expansion

When consuming `_links`, expand the CURIE prefix before matching relation names:

```typescript
function expandLinkRelation(rel: string, curies: Array<{ name: string; href: string }>): string {
  for (const curie of curies) {
    const prefix = curie.name + ':';
    if (rel.startsWith(prefix)) {
      return curie.href.replace('{rel}', rel.slice(prefix.length));
    }
  }
  return rel;
}
```

So `wp:featuredmedia` expands to `https://api.w.org/featuredmedia`.

### REST Field Registration Extensibility

The `register_rest_field()` mechanism is the sanctioned extension point for adding fields to existing endpoints without subclassing. In TypeScript terms, this is equivalent to a registry of field definitions that the serializer consults when building a response:

```typescript
type FieldDefinition<T, V> = {
  get: (object: T, request: RestRequest) => V;
  update?: (value: V, object: T, request: RestRequest) => void;
  schema?: JSONSchema;
};

const additionalFields = new Map<string, Map<string, FieldDefinition<unknown, unknown>>>();

function registerRestField<T, V>(
  objectType: string | string[],
  attribute: string,
  definition: FieldDefinition<T, V>
): void {
  const types = Array.isArray(objectType) ? objectType : [objectType];
  for (const type of types) {
    if (!additionalFields.has(type)) additionalFields.set(type, new Map());
    additionalFields.get(type)!.set(attribute, definition as FieldDefinition<unknown, unknown>);
  }
}
```
