# Load Assets - WordPress-to-TypeScript Rewrite Spec

**Source files analyzed:**
- `wp-admin/load-scripts.php`
- `wp-admin/load-styles.php`
- `wp-includes/script-loader.php`
- `wp-includes/class-wp-dependencies.php`
- `wp-includes/class-wp-scripts.php`
- `wp-includes/class-wp-styles.php`
- `wp-includes/functions.wp-scripts.php`
- `wp-includes/functions.wp-styles.php`
- `wp-includes/global-styles-and-settings.php`

---

## 1. Overview

`load-scripts.php` and `load-styles.php` are not general asset loaders. They are narrow concatenation endpoints used by WordPress when core wants to serve multiple registered handles through a single cached response.

The contract is:

1. Receive a comma-separated `load` query parameter.
2. Normalize and validate the requested handles.
3. Compute a stable ETag from the handle list.
4. Return a single concatenated response with long-lived cache headers.

The endpoints are coupled to `script-loader.php`, which defines the default registries and the handle-to-file mapping that these endpoints consume.

---

## 2. Shared Request Contract

Both endpoints use the same basic request shape:

| Parameter | Purpose |
|---|---|
| `load` | Comma-separated list of registered handles |
| `dir` | Styles-only RTL switch (`rtl`) |

Both endpoints:

- suppress PHP error reporting
- validate `$_SERVER['SERVER_PROTOCOL']`
- sanitize `load` to alphanumerics, commas, underscores, dashes
- sort array input before building the handle list
- return `400 Bad Request` if no handles remain
- return `304 Not Modified` when `If-None-Match` matches the computed ETag
- emit `Cache-Control: public, max-age=31536000`

The important guarantee is that the response is cacheable by handle list, not by full page context.

---

## 3. Script Endpoint

### 3.1 Bootstrap

`load-scripts.php` loads only the minimal files required to resolve script handles:

- `wp-admin/includes/noop.php`
- `wp-includes/script-loader.php`
- `wp-includes/version.php`

It then creates a `WP_Scripts` instance and primes it with:

- `wp_default_scripts()`
- `wp_default_packages_vendor()`
- `wp_default_packages_scripts()`

That bootstrap is deliberate. The endpoint must know the registered handle graph before it can concatenate anything.

### 3.2 Concatenation Flow

For each requested handle:

1. Skip handles that are not registered.
2. Resolve the registered source path.
3. Read the file contents with `get_file()`.
4. Append a newline separator.

The endpoint does not inline dependencies recursively. It only concatenates the requested registered files in the order supplied after normalization.

### 3.3 Headers and Caching

The output is served as JavaScript with:

- `Content-Type: application/javascript; charset=UTF-8`
- `Etag`
- `Expires`
- `Cache-Control`

That makes the endpoint suitable for the old core concatenation mode and for any consumer that needs a stable multi-file bundle from registered handles.

---

## 4. Style Endpoint

### 4.1 Bootstrap

`load-styles.php` needs theme and global-styles helpers because CSS paths and theme.json-derived styles can affect the result.

It loads:

- `wp-admin/includes/noop.php`
- `wp-includes/theme.php`
- `wp-includes/class-wp-theme-json-resolver.php`
- `wp-includes/global-styles-and-settings.php`
- `wp-includes/script-loader.php`
- `wp-includes/version.php`

Then it creates a `WP_Styles` instance and primes it with `wp_default_styles()`.

### 4.2 RTL and Path Rewriting

The `dir=rtl` query parameter switches to the RTL sibling file when the registered style supports RTL and the source is a default CSS asset.

The endpoint also rewrites relative asset paths for files served from `wp-includes/css/`:

- `../images/` becomes `../wp-includes/images/`
- `../js/tinymce/` becomes `../wp-includes/js/tinymce/`
- `../fonts/` becomes `../wp-includes/fonts/`

For non-core CSS files, only image paths are rewritten to remain valid relative URLs.

That rewriting logic is the reason the endpoint needs the core bootstrap context. It is not safe to treat CSS concatenation as plain file concatenation.

### 4.3 Headers and Caching

The stylesheet endpoint mirrors the script endpoint but serves `text/css; charset=UTF-8`.

The same ETag and one-year cache contract applies.

---

## 5. Dependency on `script-loader.php`

`script-loader.php` is the real registry authority. The load endpoints are thin consumers of its output.

Important responsibilities there include:

- defining `wp_default_scripts()` and `wp_default_styles()`
- creating package/vendor handle registries
- assigning base URLs, versions, and default directories
- registering admin, editor, media, theme, and block assets
- enqueuing globals like `global-styles` and `global-styles-css-custom-properties`

The load endpoints depend on this registry being correct. If a handle is missing there, it cannot be concatenated here.

---

## 6. Operational Implications

1. The endpoints are cacheable asset services, not generic asset graphs. They expect pre-registered handles.
2. `load-scripts.php` and `load-styles.php` are separate because CSS requires theme and path rewriting logic that JavaScript does not.
3. ETag correctness depends on the normalized handle list. Any change to handle ordering changes the cache key.
4. The CSS endpoint has special handling for RTL and relative asset paths. Those details are part of the public contract.
5. `script-loader.php` remains the source of truth for what handles exist and what file path each handle resolves to.

## 7. Tovu Reconstruction Notes

### 7.1 Why this exists

These endpoints exist to deliver concatenated, versioned admin assets efficiently while keeping cache behavior deterministic. They are a transport layer over the registered script and style graph, not a general bundler.

### 7.2 What Tovu should preserve

- A single asset registry as the source of truth for handle metadata and dependencies
- Stable cache keys that change when the requested handle set changes
- Separate handling for script and style loading because CSS path rewriting is special
- Explicit versioning so clients and intermediaries can cache safely

### 7.3 What Tovu can simplify

- Tovu does not need the same legacy concatenation endpoint shape if it has a modern build pipeline
- RTL and relative path rewriting can be centralized in a general asset resolver
- The response surface can be a manifest-driven asset service instead of query-string assembly

### 7.4 Possible Tovu seams

- `src/core/ports/AssetRegistryPort.ts` for handle registration and dependency lookup
- `src/features/assets/concatenation/` for request-to-bundle assembly
- `src/core/ports/AssetCacheKeyPort.ts` for deterministic cache keys
- `src/core/ports/StylePathRewritePort.ts` for CSS URL rewriting

### 7.5 Suggested priority

- `V1`: registry-backed asset resolution and cache keys
- `Later`: full script/style concatenation endpoint parity and CSS rewriting edge cases
