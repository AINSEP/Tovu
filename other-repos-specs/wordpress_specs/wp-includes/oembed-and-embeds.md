# oEmbed and Embeds - Specification

**Source files analyzed:**
- `wp-includes/embed.php`
- `wp-includes/class-wp-embed.php`
- `wp-includes/class-wp-oembed.php`
- `wp-includes/class-wp-oembed-controller.php`
- `wp-includes/class-oembed.php`

---

## 1. Overview

WordPress embeds are a two-layer system:

1. **Classic embed handling** - the `[embed]` shortcode, auto-embedding of bare URLs, and custom handler callbacks managed by `WP_Embed`.
2. **oEmbed provider resolution** - remote provider lookup, discovery, HTML conversion, sanitization, and the REST API endpoint that serves post embed data.

The two layers meet in `WP_Embed::shortcode()`: WordPress first checks registered internal handlers, then falls back to `wp_oembed_get()`. That fallback path can resolve either a built-in/sanctioned provider, a discovered provider, or a same-site post embed.

This subsystem also includes the public embed endpoint for posts, discovery links in `wp_head`, iframe host JavaScript, and the proxy endpoint used by the editor.

---

## 2. Bootstrap and Entry Points

### `WP_Embed`

The constructor hooks the embed pipeline into content rendering:

- `the_content` at priority 8 for `run_shortcode()`
- `widget_text_content` at priority 8 for `run_shortcode()`
- `widget_block_content` at priority 8 for `run_shortcode()`
- The same three filters for `autoembed()`
- `edit_form_advanced` and `edit_page_form` for Ajax-based oEmbed cache priming

The key operational point is that `[embed]` is processed before `wpautop()`, which is why the constructor does its filter work early.

### `wp_maybe_load_embeds()`

This helper registers the default legacy handlers only if the `load_default_embeds` filter allows it. It adds:

- the YouTube handler
- the audio handler
- the video handler

### REST and head hooks

The REST route is registered by `wp_oembed_register_route()`, which instantiates `WP_oEmbed_Controller` and calls `register_routes()`.

Discovery links are emitted by `wp_oembed_add_discovery_links()`, and host JS is conditionally enqueued by `wp_maybe_enqueue_oembed_host_js()`.

### Public URL helpers

- `get_post_embed_url()` builds the public iframe URL for a post.
- `get_oembed_endpoint_url()` builds the REST endpoint URL, with optional `format=xml`.
- `get_post_embed_html()` returns the blockquote + iframe markup used by the embed template and the share dialog.

---

## 3. Request Routing

### REST routes

`WP_oEmbed_Controller::register_routes()` registers two routes under `oembed/1.0`:

| Route | Purpose |
|---|---|
| `/embed` | Public oEmbed endpoint for post URLs |
| `/proxy` | Authenticated proxy for arbitrary oEmbed lookups |

### `/oembed/1.0/embed`

`get_item()`:

1. Resolves the post ID from the requested URL using `url_to_postid()`.
2. Applies `oembed_request_post_id`.
3. Calls `get_oembed_response_data( $post_id, $maxwidth )`.
4. Returns a 404 `WP_Error` when the URL does not resolve to embeddable content.

The response format defaults to JSON, but the request can ask for XML.

### `/oembed/1.0/proxy`

`get_proxy_item_permissions_check()` requires `edit_posts`.

`get_proxy_item()`:

1. Builds a cache key from the request parameters, excluding `_wpnonce`.
2. Checks a transient cache first.
3. Short-circuits same-site URLs via `get_oembed_response_data_for_url()`.
4. Falls back to `WP_oEmbed::get_data()`.
5. Falls back again to classic embed handlers if the remote provider fails.
6. Stores the successful result back into a transient using `rest_oembed_ttl`.

This endpoint is editor-facing infrastructure, not a public anonymous API.

---

## 4. Provider Resolution and Remote Fetching

### `WP_oEmbed`

The provider object owns the remote oEmbed lookup logic. Its constructor seeds a large built-in provider table with sanctioned providers and then applies `oembed_providers`.

Two provider mutation paths exist:

- `wp_oembed_add_provider()` / `wp_oembed_remove_provider()` after `plugins_loaded`
- `_add_provider_early()` / `_remove_provider_early()` before `plugins_loaded`

### `get_provider()`

Provider selection works in this order:

1. Walk the provider table in priority order.
2. Match the requested URL against each provider pattern.
3. If no match is found and `discover` is true, call `discover()`.

### `discover()`

Discovery fetches the target HTML with a 150 KB response cap, then looks for provider link tags. It prefers JSON over XML and accepts these link types:

- `application/json+oembed`
- `text/xml+oembed`
- `application/xml+oembed`

The process is filterable through:

- `oembed_remote_get_args`
- `oembed_linktypes`

### `fetch()`

`fetch()` appends the standard provider query arguments:

- `maxwidth`
- `maxheight`
- `url`
- `dnt=1`

It then tries JSON first and XML second. A 501 response from the provider is treated as `not-implemented` so the alternate format can be tried.

### XML safety

`_parse_xml()` rejects unsafe input by:

- requiring `libxml_disable_entity_loader()` support
- disabling external entity loading on older PHP
- rejecting XML with a doctype
- rejecting documents whose child nodes include `XML_DOCUMENT_TYPE_NODE`

---

## 5. HTML Conversion and Sanitization

### `data2html()`

This method maps provider payloads to HTML:

- `photo` -> linked `<img>`
- `video` and `rich` -> raw provider HTML
- `link` -> linked title
- anything else -> `false`

The final output passes through `oembed_dataparse`.

### `wp_filter_oembed_result()`

This filter is the main safety gate. For trusted providers it returns the result unchanged. For untrusted providers it:

1. Whitelists only `a`, `blockquote`, and `iframe`.
2. Requires an iframe to be present.
3. Adds a random secret to the iframe `src` and `data-secret`.
4. Hides the iframe when a fallback blockquote is present.
5. Forces restricted iframe attributes like `sandbox="allow-scripts"`.

### `wp_filter_oembed_iframe_title_attribute()`

This helper ensures the iframe gets a title attribute, using the provider title unless an explicit title already exists in the markup.

---

## 6. Same-Site Embeds and Caching

### Same-site short-circuit

`get_oembed_response_data_for_url()` detects URLs that belong to the current site, including multisite subdomain and subdirectory configurations. It refuses deleted, spam, or archived sites, switches to the target blog if needed, and then resolves the post ID directly.

That same helper powers:

- the REST endpoint
- `pre_oembed_result`
- `wp_filter_pre_oembed_result()`

### `WP_Embed::shortcode()`

The shortcode path is where persistent caching happens. It:

1. Checks custom internal handlers.
2. Computes a cache key from the URL and attributes.
3. Looks for cached HTML in post meta or in the `oembed_cache` custom post type.
4. Respects the `oembed_ttl` filter, defaulting to one day.
5. Uses `embed_oembed_html` for cached hits.
6. Calls `wp_oembed_get()` if no cache is valid.
7. Stores the successful result back into post meta or `oembed_cache`.
8. Stores `{{unknown}}` on failure so repeated failures are cached too.

The cache lookup uses `find_oembed_post_id()`, which first checks the `oembed_cache_post` object cache group and then falls back to a `WP_Query`.

### `cache_oembed()`

This helper is the Ajax-driven cache warmer triggered after post save. It only runs for post types that have `show_ui` enabled, and it temporarily disables `usecache` while reprocessing the post content.

---

## 7. Embed Presentation

The user-facing embed presentation is assembled from:

- `get_post_embed_html()` - blockquote + iframe + inline script tag
- `wp_oembed_add_discovery_links()` - JSON/XML discovery tags in the document head
- `wp_maybe_enqueue_oembed_host_js()` - conditionally enqueues `wp-embed`
- `wp_enqueue_embed_styles()` and `print_embed_scripts()` - embed iframe assets
- `print_embed_comments_button()`, `print_embed_sharing_button()`, and `print_embed_sharing_dialog()` - embed iframe UI
- `the_embed_site_title()` - footer site branding

`wp_oembed_add_discovery_links()` only emits links on singular, embeddable posts. It also has a back-compat fallback check for the old `wp_head` hook behavior.

---

## 8. Operational Implications

- Discovery is opt-in on the content side through the embed pipeline, but provider support is broad because the default provider list is pre-seeded in core.
- Unsanctioned providers are sanitized aggressively. Trusted providers are not.
- The XML oEmbed output depends on `SimpleXMLElement`; without it, WordPress returns 501.
- The proxy endpoint caches per-request responses in transients, while normal content embeds cache in post meta or `oembed_cache` posts.
- The legacy `class-oembed.php` file is only a deprecated shim that loads `class-wp-oembed.php`.

## Tovu Reconstruction Notes

### Why this exists

Embeds exist to turn URLs and shortcodes into embedded HTML while keeping provider resolution and discovery separate from content rendering. The useful pattern is a two-stage pipeline: detect an embed candidate, then resolve it through a provider or same-site lookup.

### What Tovu should preserve

- Classic embed handling plus provider-based oEmbed resolution
- Separate public embed endpoints and authenticated proxy endpoints
- Discovery links and provider matching for known services
- Caching for resolved embeds so repeat requests stay cheap

### What Tovu can simplify

- Tovu can drop legacy handler tables if direct provider resolution covers the needed services
- XML output and old compatibility shims can be deferred if JSON is the primary client format
- The important part is reliable resolution and cache behavior, not every historical embed variant

### Possible Tovu seams

- `src/embeds/registry/` for provider registration and matching
- `src/embeds/render/` for HTML generation and discovery helpers
- `src/embeds/proxy/` for authenticated fetch and cache orchestration
- transport adapters should keep provider lookup separate from HTML sanitization

### Suggested priority

- `V1`: provider resolution, same-site embeds, and cache-backed HTML generation
- `Later`: proxy edge cases, legacy handler compatibility, and obscure provider shims
