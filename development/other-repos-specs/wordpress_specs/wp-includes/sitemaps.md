# Sitemaps - Specification

**Source files analyzed:**
- `wp-includes/sitemaps.php`
- `wp-includes/sitemaps/class-wp-sitemaps.php`
- `wp-includes/sitemaps/class-wp-sitemaps-registry.php`
- `wp-includes/sitemaps/class-wp-sitemaps-index.php`
- `wp-includes/sitemaps/class-wp-sitemaps-renderer.php`
- `wp-includes/sitemaps/class-wp-sitemaps-provider.php`
- `wp-includes/sitemaps/class-wp-sitemaps-stylesheet.php`
- `wp-includes/sitemaps/providers/class-wp-sitemaps-posts.php`
- `wp-includes/sitemaps/providers/class-wp-sitemaps-taxonomies.php`
- `wp-includes/sitemaps/providers/class-wp-sitemaps-users.php`

---

## 1. Overview

WordPress XML sitemaps are a request-routed XML generation subsystem, not a content model. The public API is centered around a singleton server object that is lazily bootstrapped the first time a sitemap helper is used. Once initialized, the server owns three concerns:

1. **Routing** - rewrite rules and query vars for sitemap URLs and stylesheet URLs.
2. **Provider registry** - the `posts`, `taxonomies`, and `users` sitemap providers, plus any custom providers added by plugins.
3. **Rendering** - XML and XSL output for the index, provider pages, and stylesheets.

The important constraint is that sitemaps are conditionally enabled from site visibility. When sitemaps are disabled, WordPress still registers the rewrite rules so the sitemap URLs resolve cleanly to 404s instead of falling through to unrelated content.

### URL surfaces

| Surface | Default path | Plain permalink fallback |
|---|---|---|
| Sitemap index | `/wp-sitemap.xml` | `/?sitemap=index` |
| Sitemap stylesheet | `/wp-sitemap.xsl` | `/?sitemap-stylesheet=sitemap` |
| Sitemap index stylesheet | `/wp-sitemap-index.xsl` | `/?sitemap-stylesheet=index` |
| Provider sitemap | `/wp-sitemap-{provider}-{subtype?}-{page}.xml` | `/?sitemap={provider}&sitemap-subtype={subtype}&paged={page}` |

---

## 2. Bootstrap and Entry Points

### `wp_sitemaps_get_server()`

This is the singleton entry point. If `$wp_sitemaps` is empty, WordPress instantiates `WP_Sitemaps`, calls `init()`, and then fires `wp_sitemaps_init`.

That matters operationally because custom providers should register on `wp_sitemaps_init`, not at file load time.

### `WP_Sitemaps::init()`

`init()` always does three things in order:

1. Registers rewrite tags and rewrite rules.
2. Hooks `render_sitemaps()` onto `template_redirect`.
3. If `sitemaps_enabled()` is true, registers the default providers and adds the `robots_txt` filter.

The `template_redirect` hook is the actual request-time dispatcher. It examines the query vars, emits XML or XSL, and exits early.

### `sitemaps_enabled()`

The enabled flag is derived from `get_option( 'blog_public' )` and then filtered through `wp_sitemaps_enabled`. The rewrite rules remain present even when the flag is false so the sitemap URLs still terminate in a 404.

---

## 3. Routing and Request Flow

### `register_rewrites()`

The sitemap router is built with rewrite tags and top-priority rewrite rules:

- `%sitemap%`
- `%sitemap-subtype%`
- `%sitemap-stylesheet%`

The provider route regexes are:

- `^wp-sitemap\.xml$`
- `^wp-sitemap\.xsl$`
- `^wp-sitemap-index\.xsl$`
- `^wp-sitemap-([a-z]+?)-([a-z\d_-]+?)-(\d+?)\.xml$`
- `^wp-sitemap-([a-z]+?)-(\d+?)\.xml$`

### `render_sitemaps()`

The request handler does this:

1. Reads `sitemap`, `sitemap-subtype`, `sitemap-stylesheet`, and `paged` from query vars.
2. Returns immediately if the request is not a sitemap-related route.
3. If sitemaps are disabled, sets the main query to 404 and sends a 404 status.
4. If the route is a stylesheet route, instantiates `WP_Sitemaps_Stylesheet` and renders the XSL document.
5. If the route is `index`, asks `WP_Sitemaps_Index` for the sitemap list and renders the index XML.
6. Otherwise resolves the provider from the registry, asks it for a URL list, and renders the sitemap XML.
7. If the provider returns no URLs, WordPress sets 404 and exits without rendering XML.

### `get_sitemap_url()`

This helper validates all public sitemap URLs before returning them:

- It accepts `index` as a special case.
- It rejects unknown provider names.
- It rejects subtype names that are not present in the provider's subtype list.
- It normalizes page numbers with `absint()` and forces page 1 when the input is invalid.

---

## 4. Core Classes

### `WP_Sitemaps`

The top-level container object wires together:

- `WP_Sitemaps_Registry`
- `WP_Sitemaps_Renderer`
- `WP_Sitemaps_Index`

Its other key methods are:

- `register_sitemaps()`
- `register_rewrites()`
- `render_sitemaps()`
- `redirect_sitemapxml()` - deprecated compatibility redirect
- `add_robots()`

### `WP_Sitemaps_Registry`

This is a strict provider registry. `add_provider()` refuses duplicate names and refuses anything that is not a `WP_Sitemaps_Provider`. It also filters the provider through `wp_sitemaps_add_provider` before storing it.

### `WP_Sitemaps_Index`

The index object flattens all provider entries into a single list. It caps the total index size at 50,000 entries and stops early once that limit is reached.

### `WP_Sitemaps_Renderer`

The renderer is responsible for XML output. It uses `SimpleXMLElement` and emits:

- sitemap index XML
- provider sitemap XML
- optional `xml-stylesheet` processing instructions

If `SimpleXMLElement` is unavailable, it installs `_xml_wp_die_handler` and terminates with `wp_die()`.

### `WP_Sitemaps_Stylesheet`

This class generates the XSL documents used to render human-readable sitemap pages in browsers.

### `WP_Sitemaps_Provider`

This abstract base class defines the provider contract:

- `get_url_list( $page_num, $object_subtype = '' )`
- `get_max_num_pages( $object_subtype = '' )`
- `get_sitemap_type_data()`
- `get_sitemap_entries()`
- `get_sitemap_url( $name, $page )`
- `get_object_subtypes()`

---

## 5. Default Providers

### `WP_Sitemaps_Posts`

This provider exposes public, viewable post types except attachments. It uses `WP_Query` with conservative query flags:

- `no_found_rows => true`
- `update_post_term_cache => false`
- `update_post_meta_cache => false`
- `ignore_sticky_posts => true`

Important behavior:

- For `page` on the homepage when `show_on_front = posts`, it adds the homepage as the first entry and computes an approximate `lastmod` from the newest posts.
- Individual post entries include `loc` and `lastmod`.
- Query behavior is filterable through `wp_sitemaps_posts_query_args`.

### `WP_Sitemaps_Taxonomies`

This provider exposes public, viewable taxonomies and uses `WP_Term_Query` with:

- `hide_empty => true`
- `hierarchical => false`
- `update_term_meta_cache => false`

It computes pagination with `wp_count_terms()` and a simple ceiling division.

### `WP_Sitemaps_Users`

This provider exposes authors with published posts. It uses `WP_User_Query` and limits the query to users who have published posts in public post types, excluding attachments and pages.

---

## 6. XML and Stylesheet Behavior

The sitemap XML is deliberately narrow. The renderer only accepts the fields the protocol expects:

- Index entries: `loc`, `lastmod`
- Sitemap entries: `loc`, `lastmod`, `changefreq`, `priority`

Anything else triggers `_doing_it_wrong()` and is ignored.

The stylesheet URLs are filterable:

- `wp_sitemaps_stylesheet_url`
- `wp_sitemaps_stylesheet_index_url`

The stylesheet content is also filterable:

- `wp_sitemaps_stylesheet_content`
- `wp_sitemaps_stylesheet_index_content`
- `wp_sitemaps_stylesheet_css`

---

## 7. Operational Implications

- The subsystem depends on rewrite rule registration. A rewrite flush is required when routes change.
- Disabled sitemaps still need rewrite rules so the URLs do not resolve to unrelated content.
- The public provider list is intentionally small and can be extended safely through the registry and `wp_sitemaps_init`.
- The default URL budget is 2,000 entries per sitemap and 50,000 entries per index, which matches the XML sitemap protocol's practical limits.
- Querying is tuned to avoid extra cache churn: providers suppress meta/term cache priming where possible.

## Tovu Reconstruction Notes

### Why this exists

Sitemaps exist to expose a discoverable XML surface for crawlers without coupling the crawler contract to the page renderer. The important idea is route registration plus provider-driven XML generation.

### What Tovu should preserve

- A sitemap index plus provider-specific sitemap routes
- A provider registry so content sources can be added without rewriting the router
- XML rendering with clear limits and stable URL construction
- Conditional enablement so disabled sitemaps still resolve cleanly

### What Tovu can simplify

- Tovu can reduce the provider list if only a subset of content types needs indexing
- Stylesheet output and other browser-facing sugar can be deferred
- The route contract matters more than mirroring WordPress's exact provider classes

### Possible Tovu seams

- `src/sitemaps/router/` for rewrite and request dispatch
- `src/sitemaps/providers/` for content-specific URL generation
- `src/sitemaps/render/` for XML and optional stylesheet output
- registry and renderer should stay separate so providers remain swappable

### Suggested priority

- `V1`: route registration, provider registry, and sitemap XML output
- `Later`: stylesheet polish, extra providers, and advanced compatibility behavior
