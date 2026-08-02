# Spec: `wp-links-opml.php`

**Source:** `wordpress/wp-links-opml.php`
**Lines:** 99
**Role:** OPML export of WordPress bookmarks/links

---

## Purpose

Outputs an OPML 1.0 XML document containing the site's bookmarks (the legacy "Links" feature, stored in `wp_links` table with `link_category` taxonomy). Used to export links for import into another blog or RSS reader.

---

## Entry Conditions

- Loads `wp-load.php`
- Outputs `Content-Type: text/xml; charset={blog_charset}`
- No authentication required (public endpoint)

---

## Query Parameter

| Param | Type | Description |
|---|---|---|
| `link_cat` | string/int | Optional. Filter to a specific link category. `'all'` or `'0'` = all categories. Any other value is treated as a category term ID (`absint(urldecode(...))`). |

If `link_cat` is absent: all link categories are included.

---

## Output Format

```xml
<?xml version="1.0"?>
<opml version="1.0">
  <head>
    <title>Links for {site_name}</title>
    <dateCreated>{D, d M Y H:i:s} GMT</dateCreated>
    <!-- opml_head action fires here -->
  </head>
  <body>
    <outline type="category" title="{category_name}">
      <outline
        text="{link_name}"
        type="link"
        xmlUrl="{link_rss}"
        htmlUrl="{link_url}"
        updated="{link_updated or empty}"
      />
      <!-- ... more links ... -->
    </outline>
    <!-- ... more categories ... -->
  </body>
</opml>
```

---

## Data Sources

### Categories

```
get_categories({
  taxonomy: 'link_category',
  hierarchical: 0,
  [include: link_cat]    // only if link_cat is set
})
```

The `link_category` name is passed through the `link_category` filter before output.

### Bookmarks (per category)

```
get_bookmarks({ category: category_term_id })
```

Returns `WP_Post`-like objects from `wp_links` with fields:
- `link_name` — display name (filtered through `link_title` filter)
- `link_rss` — RSS/Atom feed URL (output as `xmlUrl`)
- `link_url` — HTML page URL (output as `htmlUrl`)
- `link_updated` — last updated datetime; omitted if value is `'0000-00-00 00:00:00'`

---

## Hooks

| Hook | Type | Description |
|---|---|---|
| `opml_head` | action | Fires inside `<head>` block, after `dateCreated` |
| `link_category` | filter | Modify category name before output |
| `link_title` | filter | Modify link name/title before output |

---

## Notes

- This file is not linked from WordPress theme pages automatically; it must be added manually.
- The Links/Bookmarks feature is largely unused in modern WordPress but the code remains.
- No authentication is required — the link list is considered public data.

---

## TypeScript Interface

```typescript
interface OpmlBookmark {
  text: string;       // link_name
  xmlUrl: string;     // link_rss (feed URL)
  htmlUrl: string;    // link_url (page URL)
  updated?: string;   // link_updated, omitted if '0000-00-00 00:00:00'
}

interface OpmlCategory {
  title: string;
  bookmarks: OpmlBookmark[];
}

interface OpmlExporter {
  getCategories(filter?: number): Promise<OpmlCategory[]>;
  render(categories: OpmlCategory[], siteName: string): string;  // returns XML string
}

// Route: GET /wp-links-opml.php?link_cat={id|all}
// Response: Content-Type: text/xml
```

---

## Tovu Reconstruction Notes

### Why this exists

This archival note preserves the earlier `wp-links-opml.php` decomposition. The canonical Tovu-facing treatment now lives in [integrations.md](/Users/la/Desktop/Tovu AI CMS/other-repos/wordpress_specs/wp-root/integrations.md).

### What Tovu should preserve

- The idea that standardized export formats should be treated as dedicated adapters, not scattered template code

### What Tovu can simplify

- OPML itself is optional; prefer the consolidated integrations doc for actual Tovu prioritization

### Possible Tovu seams

- `src/features/integration-entry/`
- `src/core/ports/ExportRendererPort.ts`

### Suggested priority

- `Reference only`; implement from the consolidated integrations spec
