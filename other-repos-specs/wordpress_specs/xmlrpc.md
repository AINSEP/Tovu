# Spec: `xmlrpc.php`

**Source:** `wordpress/xmlrpc.php`
**Lines:** 107
**Role:** XML-RPC API endpoint and RSD discovery

---

## Purpose

Serves two functions:
1. **RSD discovery** (`?rsd`) — an XML document listing available API endpoints
2. **XML-RPC request handling** — processes XML-RPC method calls for post management, user operations, and other CMS actions

---

## Entry Conditions

1. Define `XMLRPC_REQUEST = true`
2. Discard all cookies: `$_COOKIE = []` (prevents session hijacking via XML-RPC)
3. Read raw POST body into `$HTTP_RAW_POST_DATA` (compatibility shim for PHP < 7.0)
4. Trim leading whitespace from `$HTTP_RAW_POST_DATA` (fixes clients that send content before `<?xml`)
5. `require wp-load.php`

---

## RSD Discovery (`?rsd`)

**Trigger:** `isset($_GET['rsd'])`

**Response:** `Content-Type: text/xml; charset={blog_charset}`

Outputs an RSD (Really Simple Discovery) XML document:

```xml
<?xml version="1.0" encoding="{charset}"?>
<rsd version="1.0" xmlns="http://archipelago.phrasewise.com/rsd">
  <service>
    <engineName>WordPress</engineName>
    <engineLink>https://wordpress.org/</engineLink>
    <homePageLink>{site_url}</homePageLink>
    <apis>
      <api name="WordPress"     blogID="1" preferred="true"  apiLink="{xmlrpc_url}" />
      <api name="Movable Type"  blogID="1" preferred="false" apiLink="{xmlrpc_url}" />
      <api name="MetaWeblog"    blogID="1" preferred="false" apiLink="{xmlrpc_url}" />
      <api name="Blogger"       blogID="1" preferred="false" apiLink="{xmlrpc_url}" />
      <!-- xmlrpc_rsd_apis action fires here -->
    </apis>
  </service>
</rsd>
```

Then `exit`.

---

## XML-RPC Request Handling

### Load dependencies

```php
require_once ABSPATH . 'wp-admin/includes/admin.php';
require_once ABSPATH . WPINC . '/class-IXR.php';           // Incutio XML-RPC Library
require_once ABSPATH . WPINC . '/class-wp-xmlrpc-server.php';
```

### Server class selection

```php
$wp_xmlrpc_server_class = apply_filters('wp_xmlrpc_server_class', 'wp_xmlrpc_server');
$wp_xmlrpc_server = new $wp_xmlrpc_server_class();
$wp_xmlrpc_server->serve_request();
exit;
```

The `wp_xmlrpc_server_class` filter allows replacing the entire server with a custom implementation.

---

## `wp_xmlrpc_server` — Method Registry

The server class (defined in `class-wp-xmlrpc-server.php`) exposes these method namespaces:

### `blogger.*`
- `blogger.getUsersBlogs`
- `blogger.getUserInfo`
- `blogger.getPost`
- `blogger.getRecentPosts`
- `blogger.getTemplate`
- `blogger.setTemplate`
- `blogger.newPost`
- `blogger.editPost`
- `blogger.deletePost`

### `metaWeblog.*`
- `metaWeblog.newPost`
- `metaWeblog.editPost`
- `metaWeblog.getPost`
- `metaWeblog.getRecentPosts`
- `metaWeblog.getCategories`
- `metaWeblog.newMediaObject`
- `metaWeblog.getTemplate`
- `metaWeblog.setTemplate`
- `metaWeblog.getUsersBlogs`

### `mt.*` (MovableType)
- `mt.getCategoryList`
- `mt.getRecentPostTitles`
- `mt.getPostCategories`
- `mt.setPostCategories`
- `mt.supportedMethods`
- `mt.supportedTextFilters`
- `mt.getTrackbackPings`
- `mt.publishPost`

### `pingback.*`
- `pingback.ping`
- `pingback.extensions.getPingbacks`

### `wp.*` (WordPress-specific)
- **Posts:** `wp.getPost`, `wp.getPosts`, `wp.newPost`, `wp.editPost`, `wp.deletePost`, `wp.getPostFormats`, `wp.getPostType`, `wp.getPostTypes`, `wp.getPostStatusList`, `wp.getRevisions`, `wp.restoreRevision`
- **Taxonomies:** `wp.getTaxonomy`, `wp.getTaxonomies`, `wp.getTerm`, `wp.getTerms`, `wp.newTerm`, `wp.editTerm`, `wp.deleteTerm`
- **Media:** `wp.getMediaItem`, `wp.getMediaLibrary`, `wp.uploadFile`
- **Comments:** `wp.getCommentCount`, `wp.getComment`, `wp.getComments`, `wp.newComment`, `wp.editComment`, `wp.deleteComment`, `wp.getCommentStatusList`
- **Users:** `wp.getAuthors`, `wp.getUsers`, `wp.getUser`, `wp.getProfile`, `wp.editProfile`
- **Pages:** `wp.getPage`, `wp.getPages`, `wp.newPage`, `wp.editPage`, `wp.deletePage`, `wp.getPageList`, `wp.getPageStatusList`
- **Options:** `wp.getOptions`, `wp.setOptions`
- **Other:** `wp.getUsersBlogs`, `wp.getCalendar`, `wp.suggestCategories`

### `system.*`
- `system.multicall`
- `system.listMethods`
- `system.getCapabilities`

---

## Authentication

Every `wp.*` and other privileged method authenticates via:
- XML-RPC Basic Auth: `$_SERVER['PHP_AUTH_USER']` and `$_SERVER['PHP_AUTH_PW']`
- Or via application passwords (checked via HTTP Authorization header)

Authentication is handled by `wp_xmlrpc_server::login()`. On failure: returns `IXR_Error(403, ...)`.

---

## Enable/Disable

XML-RPC can be disabled completely:
- `xmlrpc_enabled` filter — return false to disable all non-pingback methods
- When disabled: returns `IXR_Error(405, 'XML-RPC services are disabled on this site.')`

---

## Hooks

| Hook | Type | Description |
|---|---|---|
| `xmlrpc_rsd_apis` | action | Add API entries to RSD discovery output |
| `wp_xmlrpc_server_class` | filter | Replace the server class name |
| `xmlrpc_enabled` | filter | Enable/disable XML-RPC (return false to disable) |
| `xmlrpc_login_error` | action | Fires on auth failure |
| `xmlrpc_call` | action | Fires at start of each method call |
| `xmlrpc_call_success_{method}` | action | Fires after successful method execution |
| `xmlrpc_prepare_post` | filter | Modify post data before returning to client |
| `xmlrpc_prepare_comment` | filter | Modify comment data before returning |
| `xmlrpc_prepare_user` | filter | Modify user data before returning |
| `xmlrpc_prepare_term` | filter | Modify taxonomy term before returning |
| `xmlrpc_prepare_media_item` | filter | Modify media item before returning |
| `xmlrpc_prepare_page` | filter | Modify page before returning |

---

## Deprecated Function

`logIO($io, $msg)` — logs to `error_log()`. Deprecated since 3.4.0, replaced by `error_log()` directly.

---

## TypeScript Interface

```typescript
// XML-RPC is a legacy protocol. In a modern TypeScript rewrite,
// consider implementing the WP REST API instead, which supersedes
// all wp.* methods.

interface XmlRpcServer {
  handleRequest(rawBody: string): Promise<string>;  // returns XML response
  serveRsd(): string;                               // returns RSD XML
}

// RSD endpoint
// GET /xmlrpc.php?rsd → text/xml RSD document

// XML-RPC endpoint
// POST /xmlrpc.php → text/xml methodResponse or fault

interface XmlRpcMethod<TParams, TResult> {
  name: string;
  requiresAuth: boolean;
  handler(params: TParams, auth?: AuthCredentials): Promise<TResult | XmlRpcFault>;
}

interface XmlRpcFault {
  faultCode: number;
  faultString: string;
}
```

### Notes for TypeScript rewrite

- **XML-RPC is largely superseded by the WordPress REST API** (`/wp-json/`). In a modern TypeScript rewrite, prioritise the REST API.
- The `pingback.ping` method must still be supported for cross-blog pingbacks.
- The IXR library (Incutio XML-RPC) must be replaced with a proper XML-RPC parsing library or implemented directly.
- The `$_COOKIE = []` line at the top is a security measure — XML-RPC authentication must never rely on session cookies.
- Cookie reset pattern in TypeScript: ignore cookie header entirely for XML-RPC routes.

---

## Tovu Reconstruction Notes

### Why this exists

This file exists to capture WordPress's legacy remote-publishing and remote-management protocol surface. XML-RPC is mostly a compatibility adapter, but it still teaches useful lessons about cookie-less machine interfaces and method-registry boundaries.

### What Tovu should preserve

- If Tovu supports legacy machine protocols, keep them as explicit adapters outside the core product API
- Cookie-less authentication and request handling for machine endpoints
- A clear method registry and serialization boundary between protocol transport and domain logic

### What Tovu can simplify

- Tovu can omit XML-RPC entirely if REST/webhook-based integrations fully replace it
- Pingback-specific behavior should only survive if cross-site backlink protocols are an actual product requirement

### Possible Tovu seams

- `src/features/integration-entry/`
- `src/core/ports/LegacyProtocolPort.ts`
- `src/core/ports/ApiCredentialPort.ts`

### Suggested priority

- `V1`: probably omit unless compatibility demands it
- `Later`: implement as an adapter-only protocol surface, not a core API pattern
