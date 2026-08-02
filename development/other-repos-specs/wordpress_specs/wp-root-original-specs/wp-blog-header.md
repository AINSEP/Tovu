# Spec: `wp-blog-header.php`

**Source:** `wordpress/wp-blog-header.php`
**Lines:** 22
**Role:** Single-execution bootstrap + query dispatcher + template loader

---

## Purpose

Acts as the central dispatcher for front-end page requests. It bootstraps WordPress, executes the main query, and then loads the appropriate theme template.

---

## Behaviour

### Guard: single-execution

Uses a global `$wp_did_header` flag to ensure this file runs at most once per request, even if included multiple times.

```
if $wp_did_header is already set → do nothing, return
else → set $wp_did_header = true, proceed
```

### Execution sequence (when not already run)

1. `require wp-load.php` — loads WordPress environment
2. `wp()` — parses the request URL and executes the main database query (`WP_Query`)
3. `require template-loader.php` — selects the correct theme template file and includes it

---

## Dependencies

| Dependency | What it provides |
|---|---|
| `wp-load.php` | Full WordPress environment (config, DB, plugins, theme hooks) |
| `wp()` function | Sets up `$wp_query`, `$wp_the_query`, `$posts`, query vars |
| `template-loader.php` | Template hierarchy resolution and inclusion |

---

## Used By

- `index.php` (primary front-end entry)
- `wp-signup.php` (needs theme header/footer)
- `wp-activate.php` (needs theme header/footer)

---

## `wp()` Function Behaviour

`wp()` (defined in `wp-includes/class-wp.php`) does the following:
1. Parses `$_SERVER['REQUEST_URI']` into query vars
2. Calls `WP_Query::query()` with those vars
3. Sets `$wp_query`, `$posts`, `$post`, and other global template variables
4. Handles 404 detection
5. Sends canonical redirect if needed

The optional argument is an array of extra query vars, e.g. `wp(array('tb' => '1'))` used by `wp-trackback.php`.

---

## TypeScript Equivalent

```typescript
// src/bootstrap/blog-header.ts

let didRun = false;

export async function blogHeader(app: Application, options: { useThemes: boolean }) {
  if (didRun) return;
  didRun = true;

  await loadWordPress(app);         // wp-load equivalent
  await executeMainQuery(app);      // wp() equivalent

  if (options.useThemes) {
    await loadTemplate(app);        // template-loader equivalent
  }
}
```

The `didRun` guard is critical — it must be request-scoped, not module-scoped, in any multi-request server context (e.g. a Node.js HTTP server). In WordPress this is PHP-request-scoped by nature.

---

## Tovu Reconstruction Notes

### Why this exists

This archival note preserves the earlier `wp-blog-header.php` decomposition. The canonical Tovu-facing treatment now lives in [bootstrap.md](/Users/la/Desktop/Tovu AI CMS/other-repos/wordpress_specs/wp-root/bootstrap.md).

### What Tovu should preserve

- The front-controller/bootstrap split and request-scoped main-query/template handoff described in the consolidated bootstrap doc

### What Tovu can simplify

- Use the consolidated bootstrap spec rather than planning from this archival file in isolation

### Possible Tovu seams

- `src/core/bootstrap/`
- `src/features/front-end/`

### Suggested priority

- `Reference only`; implement from the consolidated bootstrap spec
