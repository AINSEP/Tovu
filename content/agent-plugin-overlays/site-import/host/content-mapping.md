# Tovu write shapes for site-import

Version: 1.0.0 (2026-11-02), split from the skill's content-mapping reference 1.1.0.

The portable reference (`agent_plugin_site_import` with `file: "references/content-mapping.md"`)
owns the rules: slugs, idempotency, media, posts, pages, body conversion, links, SEO, menus,
redirects and batching. This file adds Tovu's exact tool inputs under the same section numbers,
and Tovu's local-folder conversion. Field names are the tools' own input names.

## Local-folder sources (Tovu Theme Part B)

Load this file directly after Part B's submitted choice; do not run site-import's public-URL
crawl or scope questionnaire. The dropped folder remains read-only. Paths come from
`fs_list_files { root: "custom" }`; resolve each asset relative to the HTML/CSS file that uses it,
then normalize to a root-relative source path. Never widen roots or bypass a denied path.

- Use `media_import_local_file { root, path, alt }` for images/video, in `items` batches.
  Keep a source-path → `{id, publicUrl}` map, including CSS backgrounds and each `srcset` candidate;
  URL sources still use §3. Both importers support sanitized SVG, PNG/JPEG/GIF/WebP/AVIF and MP4/WebM.
- Fonts and theme-only ICO files use `theme_import_local_file { themeId, path, root, sourcePath }`;
  `path` is the destination, `sourcePath` is relative to the selected source root.
- Use §5's inner-HTML Page contract and stable region handles. Preserve layout classes with
  matching family shells/partials/styles in the theme; no theme chrome inside Page bodies.
- Create drafts first. Activate the completed theme before setting a Page's custom `template`
  filename via `content_post_update` with `expectedVersion`; templates validate against the
  active theme. Publish locally to make the conversion usable unless draft/preview was requested.
- A rerun updates only known imported entries (§2), using their current versions. Unknown
  provenance is a collision even when slug and kind match: move the original reversibly to a
  free slug before creating the imported Page, as Part B4 requires. Report every move and never
  overwrite a concurrent edit.
- Inspect every batch result. Name refused assets and incomplete pages; source paths are never
  rewritten on disk.

## 1. Addresses (slugs)

Tovu serves every page and post at `/<slug>`: one flat namespace, no folders. A slug is
lower-case letters, digits and dashes, at most 120 characters, and never `admin` or `api`.

- A live page at `/` moves with `content_post_update` to `previous-home` before the imported
  homepage is written at `/` (`kind: "page"` only).
- For local-folder imports, a target slug held by any non-trashed entry not known to this import
  → first move that original with `content_post_update` and its current `expectedVersion` to
  `previous-<slug>` (or the nearest free suffix, such as `previous-about-2`), then create the
  imported Page at the target slug. For `/`, use `previous-home`. Never overwrite or trash the
  original; report every move. A version conflict stops the move and that Page's import.

## 2. Idempotency

For local-folder imports, idempotency applies only to known imported entries: retain the
source-path → entry-id mapping from successful creates in this conversion or a trustworthy prior
import report for the same source folder. A matching slug or kind alone is not provenance; if no
reliable mapping is available, treat the existing entry as unrelated. `expectedVersion` guards
concurrency, not provenance.

1. Before planning, `content_read.content_post` once per `kind` (fields `id`, `kind`, `slug`,
   `title`, `version`, `author`, `showAuthor`) and index existing rows by slug.
2. For local folders, update only the mapped imported entry after confirming its id and kind;
   otherwise apply §1's reversible collision move before creating the imported Page, regardless
   of the existing entry's kind. For public URLs, an update is `content_post_update` with `id`,
   `kind` and the current `version` as `expectedVersion`; a `VERSION_CONFLICT` means a person
   edited it since.
3. Menu reuse is `menus_update_menu_tree` with the menu's `version`.
4. Duplicate redirects come back in `redirects_import`'s `failed` list.

## 3. Media

`media_import_from_url { url, filename, alt }` for every unique content image, in `items` batches.
Tovu's Media refuses ICO and data: URIs.

## 4. Posts

```
content_post_create {
  kind: "post",
  title: <source title, without the " | Site name" suffix>,
  slug: <target slug>,
  bodyJson: <TipTap document, § 6>,
  status: "draft",                      // "published" only if the owner asked to publish
  publishAt: "<source date with offset, e.g. 2025-03-14T09:00:00Z>",
  featuredImage: <media id of the lead image>,
  author: <source author display name, or null when absent>,
  showAuthor: <true only when the source visibly shows a byline>
}
```

Then `taxonomy_assign_terms { contentType: "post", contentId: <id>, termIds: [...] }` and
`seo_set_entry_overrides` (§ 8). Send `author: null` and `showAuthor: false` when no source author
exists. `content_read.content_post` returns the saved values. There is no dedicated excerpt field
yet: a separately editable excerpt remains future work.

## 5. Pages

- **Text pages:** `content_post_create { kind: "page", title, slug, bodyJson, status: "draft" }`.
- **Layout pages:** create the page with no body, then `pages_write_html { id, html }`. Every
  top-level section carries `data-agent-element="<handle>" data-agent-role="region"`. A `warning`
  in the `pages_write_html` result names any element left invisible; fix them and write again.

## 6. Body conversion (HTML → TipTap document)

| Source | TipTap node / mark |
|---|---|
| `<p>` | `paragraph` |
| `<h2>`–`<h4>` (an `<h1>` repeating the title is dropped) | `heading` with `attrs.level` |
| `<ul>` / `<ol>` / `<li>` | `bulletList` / `orderedList` / `listItem` |
| `<blockquote>` | `blockquote` |
| `<pre><code>` | `codeBlock` |
| `<hr>` | `horizontalRule` |
| `<table>` | `table` / `tableRow` / `tableHeader` / `tableCell` |
| `<img>` | `media` with `attrs: { assetId: <media id>, transformName: "public", alt }` |
| YouTube `<iframe>` | `youtube` |
| `<strong>`/`<b>`, `<em>`/`<i>`, `<code>`, `<s>`, `<u>` | `bold`, `italic`, `code`, `strike`, `underline` marks |
| `<a href>` | `link` mark; href rewritten per § 7 |
| `<br>` | `hardBreak` |

## 8. SEO per entry

`seo_set_entry_overrides { entryId, title, description, ogImage }`.

## 9. Menu

```
menus_create_menu {
  title: "Main menu", slug: "main-menu",
  items: [
    { id: "about", label: "About", target: { kind: "entryRef", entryId: <page id>, entryType: "page" } },
    { id: "shop",  label: "Shop", target: { kind: "url", href: "https://shop.example.com/" } },
    ...
  ]
}
```

A static theme shows a menu where its header partial has a menu marker naming that menu's id:
`<nav class="main-nav" data-embed-config='{"type":"menu","id":"<menu id>","variant":"tree"}'>`.
`menus_assign_location` does not place it. Hand the id from `menus_create_menu` to Tovu Theme
Part C, which writes it into the header partial with the header call-to-action.

Footer columns are menus edited in Admin → Menus:

```
menus_create_menu {
  title: "Footer — Explore", slug: "footer-explore",
  items: [ { id: "services", label: "Services", target: { kind: "entryRef", entryId: <page id>, entryType: "page" } }, ... ]
}
```

The footer partial renders each one under its heading with
`<div data-embed-config='{"type":"menu","id":"footer-explore"}'>`; a static theme resolves the
marker's `id` as a menu slug first. Re-running replaces the tree with `menus_update_menu_tree`
using the same item ids.

## 10. Redirects

```
redirects_import { rules: [
  { matchType: "exact", fromPattern: "/journal/2025/03/hand-thrown-mugs/", toTarget: "/hand-thrown-mugs", statusCode: 301 },
  ...
] }
```

Read `failed` in the result: a duplicate means it already exists; anything else is reported.
