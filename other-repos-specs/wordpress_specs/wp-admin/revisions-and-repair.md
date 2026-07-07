# Revisions and Repair - WordPress-to-TypeScript Rewrite Spec

**Source files analyzed:**
- `wp-admin/revision.php`
- `wp-admin/includes/revision.php`
- `wp-includes/revision.php`
- `wp-admin/maint/repair.php`
- `wp-includes/capabilities.php`
- `wp-admin/includes/post.php`

---

## 1. Overview

This file covers two separate admin surfaces that are both operational rather than editorial:

1. **Revisions UI and backend** - the admin comparison/restore screen plus the revision data helpers.
2. **Database repair mode** - the standalone maintenance page that checks and repairs tables when explicitly enabled.

The common theme is that both flows are guarded by narrow, explicit gates. Revisions are protected by post-level capabilities and post-lock checks. Repair mode is protected by a config constant and is deliberately isolated from the normal admin experience.

---

## 2. Revision Data Model

### 2.1 Core storage shape

Revisions are stored as posts with `post_type = 'revision'` and a parent post relationship. Autosaves also travel through this system, but they are treated specially when revisions are disabled.

The important runtime helpers live in `wp-includes/revision.php`:

- `wp_save_post_revision()`
- `wp_get_post_revisions()`
- `wp_get_latest_revision_id_and_total_count()`
- `wp_get_post_revisions_url()`
- `wp_revisions_enabled()`
- `wp_revisions_to_keep()`
- `wp_restore_post_revision()`

### 2.2 Retention policy

By default, WordPress keeps an unlimited number of revisions unless configuration or filters say otherwise.

`wp_revisions_to_keep()` resolves the retention count in this order:

1. post type support
2. `WP_POST_REVISIONS`
3. `wp_revisions_to_keep`
4. per-post-type filters such as `wp_post_revisions_to_keep`

### 2.3 Revision lifecycle

When a post is updated:

- `wp_save_post_revision()` stores a new revision after the post has changed
- old revisions may be pruned based on the retention limit
- autosaves are preserved separately and can survive even when revisions are disabled

The helper also participates in older revision upgrade paths and backward compatibility cleanup.

---

## 3. Revisions UI Controller

### 3.1 `revision.php` routing

`wp-admin/revision.php` handles three request modes:

- `restore`
- `view`
- `edit`

It accepts:

- `revision`
- `from`
- `to`

and redirects away immediately when the requested revision or parent post is invalid.

### 3.2 Restore gate

Restoring a revision requires:

- the revision to exist
- the parent post to exist
- `current_user_can( 'edit_post', $revision->post_parent )`
- the post to not be locked
- a valid restore nonce

Restoration is also blocked if revisions are disabled and the target is not an autosave.

### 3.3 View / compare gate

Comparing or viewing a revision requires:

- `current_user_can( 'read_post', $revision->ID )`
- `current_user_can( 'edit_post', $revision->post_parent )`

That split matters. Reading a revision and restoring a revision are not the same privilege boundary.

### 3.4 UI boot

The screen:

- enqueues the revisions script
- localizes revision data through `wp_prepare_revisions_for_js()`
- sets up help tabs and sidebar links
- renders the compare view template shell

The actual diff UI is front-end driven, but all data assembly is server-side.

---

## 4. Revision Diff Backend

### 4.1 Diff assembly

`wp_get_revision_ui_diff()`:

1. resolves the parent post and revision objects
2. verifies the two revisions belong to the same parent
3. orders the revisions by date if needed
4. iterates the fields returned by `_wp_post_revision_fields()`
5. runs field-level filters for each revision field
6. builds a text diff with `wp_text_diff()`
7. returns only fields that actually have diff output

It also special-cases the title field so the title is still shown even when the title did not change.

### 4.2 JS payload preparation

`wp_prepare_revisions_for_js()`:

- loads all revisions for the post
- strips non-autosave revisions when revisions are disabled
- prepends the parent post in that case
- resolves author avatars and display names
- marks the current revision
- generates restore URLs when the user can restore the post

That function is the bridge between the revision storage backend and the browser UI.

### 4.3 Key hooks

Important filters include:

- `_wp_post_revision_fields`
- `_wp_post_revision_field_{$field}`
- `revision_text_diff_options`
- `wp_get_revision_ui_diff`

These allow plugins to reshape the data shown in the compare interface without rewriting the controller.

---

## 5. Database Repair Mode

### 5.1 Entry conditions

`wp-admin/maint/repair.php` is a standalone maintenance page. It defines:

- `WP_REPAIRING = true`

and loads `wp-load.php` directly.

The page does nothing useful unless:

- `WP_ALLOW_REPAIR` is defined
- `WP_ALLOW_REPAIR` is truthy

If that constant is missing, the page only tells the operator how to enable it in `wp-config.php`.

### 5.2 Repair flow

Once enabled, the page offers two actions:

- `repair=1` - repair only
- `repair=2` - repair and optimize

For each table in `$wpdb->tables()` plus the `tables_to_repair` filter:

1. `CHECK TABLE` runs first
2. if the table is not OK, `REPAIR TABLE` runs
3. if repair succeeded and optimization was requested, `ANALYZE TABLE` and `OPTIMIZE TABLE` run

Failures are accumulated into a textarea so the operator can copy them to support.

### 5.3 Secret-key warning

When repair mode is not yet enabled, the page also checks whether the eight WordPress secret keys/salts are present and unique. If any are missing or duplicated, it warns the operator to fix the config while they are already editing `wp-config.php`.

### 5.4 Security posture

The page is intentionally blunt:

- it is not hidden behind a normal capability gate
- it relies on the explicit `WP_ALLOW_REPAIR` constant
- it tells the operator to remove the constant after use

That is a maintenance escape hatch, not a routine admin screen.

---

## 6. TypeScript Rewrite Notes

### 6.1 Interface sketch

```typescript
interface RevisionCompareRequest {
  revision: number;
  action: 'view' | 'edit' | 'restore';
  from?: number | null;
  to?: number | null;
}

interface RepairResult {
  table: string;
  status: 'ok' | 'repaired' | 'optimized' | 'failed';
  message?: string;
}
```

### 6.2 Carry-over patterns

- Keep comparison assembly separate from the browser controller.
- Preserve the parent-post capability gate for restore operations.
- Treat autosaves as a separate compatibility path.
- Make repair mode explicit and opt-in at the config layer.

---

## Tovu Reconstruction Notes

### Why this exists

This file pairs two operator concerns: revision comparison/restore and maintenance repair escape hatches.

### What Tovu should preserve

- Revision comparison and restore logic separated from the browser/controller layer
- Restore authorization checked against the parent content object
- Maintenance repair mode as an explicit, opt-in operational path rather than a normal admin feature

### What Tovu can simplify

- Tovu does not need a direct SQL repair page unless it supports the same self-hosted database-ops model
- Revision UI can be cleaner as long as diffing, autosave distinction, and restore safety remain explicit

### Possible Tovu seams

- `src/features/revisions/`
- `src/features/maintenance/`
- `src/core/ports/RevisionPort.ts`
- `src/core/ports/MaintenanceModePort.ts`

### Suggested priority

- `V1`: revision compare/restore
- `Later`: operator repair/optimize escape hatches
