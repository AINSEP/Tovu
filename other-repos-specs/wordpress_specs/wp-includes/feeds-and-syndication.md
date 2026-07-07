# Feeds and Syndication - Specification

**Source files analyzed:**
- `wp-includes/feed.php`
- `wp-includes/feed-rss.php`
- `wp-includes/feed-rss2.php`
- `wp-includes/feed-rdf.php`
- `wp-includes/feed-atom.php`
- `wp-includes/feed-rss2-comments.php`
- `wp-includes/feed-atom-comments.php`
- `wp-includes/class-feed.php`
- `wp-includes/rss.php`
- `wp-includes/rss-functions.php`

---

## 1. Overview

WordPress feeds are split across two different concerns:

1. **Feed generation** - the template functions and feed templates that render RSS, Atom, RDF, and comment feeds for the current query.
2. **Feed consumption** - the remote feed reader stack used by `fetch_feed()`, plus the older MagpieRSS compatibility layer.

The public-facing feed templates are still procedural PHP files. They rely on the loop, the current query, and a set of helper functions in `feed.php` to produce correct XML output. The consumption side is a separate client that fetches remote feeds, caches them, and normalizes the results into SimplePie objects.

---

## 2. Feed Template Bootstrap

### `get_default_feed()`

This helper returns the default feed format, filtered by `default_feed`. WordPress normalizes the historical `rss` default to `rss2`.

### `feed_content_type()`

This maps a feed type to its MIME type:

- `rss` and `rss2` -> `application/rss+xml`
- `rss-http` -> `text/xml`
- `atom` -> `application/atom+xml`
- `rdf` -> `application/rdf+xml`

The result is filterable via `feed_content_type`.

### Template files

The public feed templates are direct output scripts:

- `feed-rss.php` for RSS 0.92
- `feed-rss2.php` for RSS 2.0
- `feed-rdf.php` for RSS 1.0 / RDF
- `feed-atom.php` for Atom
- `feed-rss2-comments.php` for comment RSS
- `feed-atom-comments.php` for comment Atom

Each template emits the XML prolog, sets the `Content-Type` header, and then renders the feed body using the helpers from `feed.php`.

---

## 3. Core Feed Helpers

The helper file is the public API surface for template tags in feeds. The important functions are:

- `get_bloginfo_rss()` / `bloginfo_rss()`
- `get_wp_title_rss()` / `wp_title_rss()`
- `get_the_title_rss()` / `the_title_rss()`
- `get_the_content_feed()` / `the_content_feed()`
- `the_excerpt_rss()`
- `the_permalink_rss()`
- `comments_link_feed()`
- `get_comment_guid()` / `comment_guid()`
- `comment_link()`
- `get_comment_author_rss()` / `comment_author_rss()`
- `comment_text_rss()`
- `get_the_category_rss()` / `the_category_rss()`
- `html_type_rss()`
- `rss_enclosure()` / `atom_enclosure()`
- `prep_atom_text_construct()`
- `atom_site_icon()` / `rss2_site_icon()`
- `get_self_link()` / `self_link()`
- `get_feed_build_date()`

These functions do the actual feed-specific escaping and normalization. The template files are mostly thin wrappers around them.

### Notable behavior

- `get_the_content_feed()` runs `the_content` first and then escapes `]]>` so CDATA sections remain valid.
- `get_the_category_rss()` maps categories and tags differently depending on feed type.
- `prep_atom_text_construct()` classifies content as `text`, `xhtml`, or `html` according to Atom rules, and falls back safely when the XML extension is unavailable.
- `get_feed_build_date()` computes the most recent post or comment modification time in the current query and falls back to the last modified post sitewide.

---

## 4. Feed Templates and Hook Points

The feed templates are mostly procedural XML emitters with well-defined hook points.

### RSS 2.0

`feed-rss2.php` is the main modern feed template. It emits:

- `<rss version="2.0">`
- the standard core namespaces
- `rss_tag_pre`
- `rss2_ns`
- `rss2_head`
- `rss2_item`

It also uses `rss_update_period` and `rss_update_frequency` to populate the syndication metadata.

### Atom

`feed-atom.php` emits:

- `<feed xmlns="http://www.w3.org/2005/Atom">`
- `rss_tag_pre`
- `atom_ns`
- `atom_head`
- `atom_author`
- `atom_entry`

### RSS 0.92 and RDF

`feed-rss.php` and `feed-rdf.php` exist for older syndication clients. They use the same helper layer but different document shapes and hook names:

- `rss_head`
- `rss_item`
- `rdf_header`
- `rdf_ns`
- `rdf_item`

### Comment feeds

The comment feed templates follow the same pattern but render comment-specific titles, item bodies, and threading metadata:

- `commentsrss2_head`
- `commentrss2_item`
- `comments_atom_head`
- `atom_comments_ns`

---

## 5. Remote Feed Consumption

### `fetch_feed()`

This is the modern remote feed entry point. It builds a `SimplePie\SimplePie` object, registers WordPress sanitization and file/cache adapters, and then initializes the feed.

Key behavior:

- Loads `class-simplepie.php` if needed.
- Registers `WP_SimplePie_Sanitize_KSES`.
- Uses `WP_Feed_Cache_Transient` through SimplePie's cache registration when available.
- Falls back to `WP_Feed_Cache` for older SimplePie versions.
- Sets the cache lifetime from `wp_feed_cache_transient_lifetime`, defaulting to 12 hours.
- Fires `wp_feed_options` before initialization.
- Supports a single feed URL or an array of URLs.
- Merges multiple feeds with `SimplePie::merge_items()`.

On failure it returns `WP_Error( 'simplepie-error', ... )`.

### `class-feed.php`

This file is a deprecation shim. It warns, then loads the newer feed classes required by `fetch_feed()`.

---

## 6. Legacy MagpieRSS Layer

### `rss.php`

The legacy RSS stack still exists for back-compat and older helper APIs. It is intentionally marked deprecated, but it remains functional.

The file does three things:

1. Fires `load_feed_engine` so callers can replace the engine.
2. Defines the `MagpieRSS` parser.
3. Defines the cache and convenience wrappers used by `fetch_rss()`, `wp_rss()`, and `get_rss()`.

### `fetch_rss()`

This older fetcher uses a transient-backed cache layer through `RSSCache`. The cache behavior is:

- Cache key = `rss_` + `md5( $url )`
- `MAGPIE_CACHE_ON` toggles cache use
- `MAGPIE_CACHE_AGE` controls freshness
- Conditional requests use `If-None-Match` and `If-Last-Modified`
- Stale cache entries are reused if the remote fetch fails

### `RSSCache`

`RSSCache` stores and retrieves serialized feed objects from transients. The class exposes:

- `set()`
- `get()`
- `check_cache()`
- `file_name()`

### Parsing and transport

`_fetch_remote_file()` uses `wp_safe_remote_request()` with a short timeout. `_response_to_rss()` extracts `etag` and `last-modified` headers and hydrates the `MagpieRSS` object.

### Deprecation shim

`rss-functions.php` is a compatibility wrapper that just loads `rss.php`.

---

## 7. Operational Implications

- Feed output is query-driven. The current main query determines what appears in the templates.
- `rss_use_excerpt` changes whether full content or excerpts are emitted in RSS templates.
- `default_feed` can change the canonical feed format, but `rss` is normalized to `rss2`.
- Remote feed fetching is cached by default on both the SimplePie and Magpie paths.
- The legacy Magpie layer is still present, but new work should treat `fetch_feed()` and SimplePie as the real implementation surface.

## Tovu Reconstruction Notes

### Why this exists

Feeds exist to expose query-driven syndication output and to consume external feeds through a cached client stack. The durable lesson is the split between XML rendering for the current content query and a separate remote-fetch pipeline.

### What Tovu should preserve

- Query-driven output for RSS, Atom, and comment feeds
- A dedicated remote feed client with caching and normalization
- Feed-specific escaping and content shaping rules
- A clear MIME/type mapping for public feed routes

### What Tovu can simplify

- Tovu can ignore Magpie compatibility if SimplePie-style fetching is enough
- Legacy feed variants can be reduced if only the modern syndication formats matter
- The template layer can be thinner if the content helpers stay correct

### Possible Tovu seams

- `src/feeds/renderers/` for feed-format-specific XML emitters
- `src/feeds/client/` for remote fetch, cache, and normalization
- `src/feeds/helpers/` for content formatting and escaping
- an adapter boundary should separate feed query rendering from remote consumption

### Suggested priority

- `V1`: canonical feed output, helper functions, and cached remote fetching
- `Later`: legacy compatibility layers and rarely used feed formats
