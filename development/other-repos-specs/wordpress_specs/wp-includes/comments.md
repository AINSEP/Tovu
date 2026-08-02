# Comments — Specification

**Source files analyzed:**
- `wp-includes/comment.php`
- `wp-includes/class-wp-comment.php`
- `wp-includes/class-wp-comment-query.php`
- `wp-includes/comment-template.php`
- `wp-comments-post.php`

---

## 1. Overview

The comment subsystem manages all user-generated responses to posts, including threaded replies, pingbacks, and trackbacks. It handles the full lifecycle from submission and validation through moderation, storage, display, and deletion.

The system has five major responsibilities:

1. **Data model** — a `WP_Comment` object mapping directly to the `wp_comments` database table, plus a `wp_commentmeta` table for arbitrary key/value pairs.
2. **Query engine** — `WP_Comment_Query`, a full-featured SQL builder with filtering, sorting, pagination, meta queries, date queries, and hierarchical tree assembly.
3. **Submission pipeline** — `wp_handle_comment_submission` (public form) → `wp_new_comment` (internal entry point) → `wp_allow_comment` (approval decision) → `wp_insert_comment` (write to DB).
4. **Moderation system** — status transitions (`approved`, `unapproved`, `spam`, `trash`), disallowed-key blocking, flood control, and admin/moderator overrides.
5. **Threading and display** — `Walker_Comment` traverses parent/child trees to depth-limited HTML output; `wp_list_comments` is the public template API.

The comment count denormalized on every post (`wp_posts.comment_count`) is updated synchronously after every status change or insert. This update can be deferred for bulk operations via `wp_defer_comment_counting`.

---

## 2. WP_Comment Data Type

Every comment is represented as a `WP_Comment` instance. All fields map 1:1 to columns in the `wp_comments` table.

### Database Table: `wp_comments`

| Property | Column | DB Type | Default | Notes |
|---|---|---|---|---|
| `comment_ID` | `comment_ID` | `BIGINT UNSIGNED` | auto-increment | Primary key. Stored as numeric string in PHP for back-compat. |
| `comment_post_ID` | `comment_post_ID` | `BIGINT UNSIGNED` | `0` | FK to `wp_posts.ID`. Zero means not associated with a post. |
| `comment_author` | `comment_author` | `TINYTEXT` | `''` | Display name. Max 245 bytes in practice. |
| `comment_author_email` | `comment_author_email` | `VARCHAR(100)` | `''` | Max 100 chars. |
| `comment_author_url` | `comment_author_url` | `VARCHAR(200)` | `''` | Max 200 chars. Stored as `http://` when empty (normalized to empty string on read). |
| `comment_author_IP` | `comment_author_IP` | `VARCHAR(100)` | `''` | IPv4 or IPv6. Sanitized to `[0-9a-fA-F:., ]` on insert. |
| `comment_date` | `comment_date` | `DATETIME` | `0000-00-00 00:00:00` | Site-local time. Format: `YYYY-MM-DD HH:MM:SS`. |
| `comment_date_gmt` | `comment_date_gmt` | `DATETIME` | `0000-00-00 00:00:00` | UTC time. Used for ordering and moderation-hash expiry. |
| `comment_content` | `comment_content` | `TEXT` | `''` | Raw content. Max ~65,525 bytes. |
| `comment_karma` | `comment_karma` | `INT` | `0` | Voting/karma integer. Rarely used by core. |
| `comment_approved` | `comment_approved` | `VARCHAR(20)` | `1` | See Section 4. Values: `'0'`, `'1'`, `'spam'`, `'trash'`. |
| `comment_agent` | `comment_agent` | `VARCHAR(255)` | `''` | HTTP `User-Agent`. Truncated to 254 chars on insert. |
| `comment_type` | `comment_type` | `VARCHAR(20)` | `'comment'` | See Section 3. |
| `comment_parent` | `comment_parent` | `BIGINT UNSIGNED` | `0` | ID of parent comment. `0` = top-level. |
| `user_id` | `user_id` | `BIGINT UNSIGNED` | `0` | WordPress user ID. `0` = anonymous/unauthenticated. |

### Virtual/Computed Properties (not stored in DB)

| Property | Type | Notes |
|---|---|---|
| `children` | `Record<number, WP_Comment>` | Protected. Populated lazily by `get_children()` or by `WP_Comment_Query.fill_descendants()`. |
| `populated_children` | `boolean` | Protected. When `true`, a call to `get_children()` will NOT hit the database again; returns `this.children` (even if empty). Set to `true` by `WP_Comment_Query` after bulk-filling descendant trees. |
| `post_fields` | `string[]` | Protected. List of post property names that are accessible via magic getter. Accessing any of these on a comment object causes a `get_post(comment_post_ID)` lookup. |

### Magic Property Access — Post Field Delegation

When a property matching any name in `post_fields` is accessed on a `WP_Comment` instance and the property does not exist directly on the comment, the comment's parent post is loaded and the matching property of that post is returned. This covers: `post_author`, `post_date`, `post_date_gmt`, `post_content`, `post_title`, `post_excerpt`, `post_status`, `comment_status`, `ping_status`, `post_name`, `to_ping`, `pinged`, `post_modified`, `post_modified_gmt`, `post_content_filtered`, `post_parent`, `guid`, `menu_order`, `post_type`, `post_mime_type`, `comment_count`.

---

## 3. Comment Types

The `comment_type` field classifies the comment's origin and semantic purpose.

| Value | Meaning | Notes |
|---|---|---|
| `'comment'` | Standard user-submitted comment | Default since 5.5.0. Empty string `''` is also treated as `'comment'` throughout all legacy code paths. |
| `'trackback'` | Outbound trackback received by a remote blog | Sent via HTTP POST with form fields `title`, `url`, `blog_name`, `excerpt`. |
| `'pingback'` | XML-RPC `pingback.ping` method call from a remote blog | Source URI must validate via `wp_http_validate_url`. |
| `'note'` | Internal note (6.9+) | Hidden from comment queries by default unless type `'note'` or `'all'` is explicitly requested. When trashing a top-level note, all child notes are also trashed. |
| (custom) | Any other string | Custom types registered by plugins or REST API consumers. |

The pseudo-type `'pings'` is used as a query alias meaning `pingback OR trackback`. It is not a storable value.

The special query value `'all'` bypasses type filtering entirely.

When displaying comment type in UI, empty string and `'comment'` are normalized to `'comment'`.

---

## 4. Comment Statuses

The `comment_approved` column stores the moderation state. Despite the column name, values are not strictly boolean.

| Status Value | Meaning | `comment_approved` column |
|---|---|---|
| Approved | Publicly visible | `'1'` |
| Unapproved / Hold | Awaiting moderation | `'0'` |
| Spam | Marked as spam | `'spam'` |
| Trash | Soft-deleted | `'trash'` |
| Post-trashed | Post itself is in trash | `'post-trashed'` (query-time virtual status, not stored) |

### Status to Human-Readable Mapping

In `wp_transition_comment_status` and hook names, raw values are translated:

| Raw | Normalized |
|---|---|
| `0` or `'hold'` | `'unapproved'` |
| `1` or `'approve'` | `'approved'` |
| `'spam'` | `'spam'` |
| `'trash'` | `'trash'` |

### Status Query Keywords

In `WP_Comment_Query` `status` argument:

| Keyword | SQL |
|---|---|
| `'hold'` | `comment_approved = '0'` |
| `'approve'` | `comment_approved = '1'` |
| `'all'` or `''` | `(comment_approved = '0' OR comment_approved = '1')` |
| `'spam'` | `comment_approved = 'spam'` |
| `'trash'` | `comment_approved = 'trash'` |
| `'any'` | No restriction on `comment_approved` |
| custom string | `comment_approved = '{custom}'` |

Multiple statuses may be passed as a space- or comma-separated string or as an array. They are OR-combined.

### Trash Metadata

When a comment is trashed or spammed, two meta keys are written:
- `_wp_trash_meta_status` — the previous `comment_approved` value, used to restore on untrash/unspam.
- `_wp_trash_meta_time` — Unix timestamp of the status change.

Both meta keys are deleted when the comment is untrashed or unspammed.

---

## 5. WP_Comment_Query

`WP_Comment_Query` builds and executes a parameterized SQL query against `wp_comments`, with optional JOINs to `wp_posts` and `wp_commentmeta`.

### Constructor and Execution

```typescript
const q = new WP_Comment_Query(args);
// is equivalent to:
const q = new WP_Comment_Query();
q.query(args);
```

Calling `query(args)` calls `parse_query(args)` then `get_comments()`. Results are stored in `this.comments` and also returned.

### Query Arguments Reference

All arguments have defaults; unset arguments fall back to the defaults listed below.

#### Author / User Filters

| Argument | Type | Default | Behavior |
|---|---|---|---|
| `author_email` | `string` | `''` | Exact match on `comment_author_email`. |
| `author_url` | `string` | `''` | Exact match on `comment_author_url`. |
| `author__in` | `number[]` | `''` | Adds `user_id IN (...)` clause. |
| `author__not_in` | `number[]` | `''` | Adds `user_id NOT IN (...)` clause. |
| `user_id` | `number \| number[]` | `''` | Single user: exact match. Array: `IN` clause. |

#### Post Filters

| Argument | Type | Default | Behavior |
|---|---|---|---|
| `post_id` | `number` | `0` | Exact match on `comment_post_ID`. |
| `post__in` | `number[]` | `''` | `comment_post_ID IN (...)`. |
| `post__not_in` | `number[]` | `''` | `comment_post_ID NOT IN (...)`. |
| `post_author` | `number \| string` | `''` | JOINs `wp_posts`; filters on `post_author`. |
| `post_author__in` | `number[]` | `''` | JOINs `wp_posts`; `post_author IN (...)`. |
| `post_author__not_in` | `number[]` | `''` | JOINs `wp_posts`; `post_author NOT IN (...)`. |
| `post_status` | `string \| string[]` | `''` | JOINs `wp_posts`. `'any'` disables filter. |
| `post_type` | `string \| string[]` | `''` | JOINs `wp_posts`. `'any'` disables filter. |
| `post_name` | `string` | `''` | JOINs `wp_posts`; filters on `post_name`. |
| `post_parent` | `number` | `''` | JOINs `wp_posts`; filters on `post_parent`. |

The posts table is only JOINed when at least one post-related argument is non-empty. When joining, the query adds `JOIN wp_posts ON wp_posts.ID = wp_comments.comment_post_ID`.

#### Comment ID Filters

| Argument | Type | Default | Behavior |
|---|---|---|---|
| `comment__in` | `number[]` | `''` | `comment_ID IN (...)`. Also valid as an `orderby` value to preserve input order via SQL `FIELD()`. |
| `comment__not_in` | `number[]` | `''` | `comment_ID NOT IN (...)`. |

#### Parent Filters

| Argument | Type | Default | Behavior |
|---|---|---|---|
| `parent` | `number \| string` | `''` | `comment_parent = N`. When `hierarchical` is set and `parent` is empty, it is forced to `0` to fetch only top-level comments. |
| `parent__in` | `number[]` | `''` | `comment_parent IN (...)`. |
| `parent__not_in` | `number[]` | `''` | `comment_parent NOT IN (...)`. |

#### Status, Type, and Approval

| Argument | Type | Default | Behavior |
|---|---|---|---|
| `status` | `string \| string[]` | `'all'` | See Section 4 for keyword mapping. |
| `include_unapproved` | `(number \| string)[]` | `''` | Array of user IDs (numeric) or email addresses (strings). For each entry, appends an OR clause that includes unapproved comments from that user/email regardless of the `status` argument. Email entries with a matching `$_GET['unapproved']` + `$_GET['moderation-hash']` query are narrowed to a single comment ID. |
| `type` | `string \| string[]` | `''` | Type inclusion filter. `'pings'` expands to `pingback` + `trackback`. `'comments'` expands to `''` + `'comment'`. `'all'` or `''` disables. |
| `type__in` | `string[]` | `''` | Merged with `type` for the IN clause. |
| `type__not_in` | `string[]` | `''` | `comment_type NOT IN (...)`. |
| `karma` | `number` | `''` | Exact match on `comment_karma`. |

**Note on `'note'` type exclusion (6.9+):** Unless the query explicitly requests `type = 'all'`, `type = 'note'`, or puts `'note'` into `type__not_in`, the `'note'` type is automatically appended to the NOT IN list. This hides internal notes from all standard comment queries.

#### Search

| Argument | Type | Default | Behavior |
|---|---|---|---|
| `search` | `string` | `''` | LIKE search across `comment_author`, `comment_author_email`, `comment_author_url`, `comment_author_IP`, `comment_content`. Search string is padded with `%` on both sides. SQL: `(field1 LIKE '%s%' OR field2 LIKE '%s%' ...)`. Empty/falsy values are ignored. |

#### Date Query

| Argument | Type | Default | Behavior |
|---|---|---|---|
| `date_query` | `object[] \| null` | `null` | `WP_Date_Query` arguments array. Column defaults to `comment_date`. |

#### Meta Query

| Argument | Type | Default | Behavior |
|---|---|---|---|
| `meta_key` | `string \| string[]` | `''` | Simple meta key filter. |
| `meta_value` | `string \| string[]` | `''` | Simple meta value filter. |
| `meta_compare` | `string` | — | Comparison operator. |
| `meta_compare_key` | `string` | — | Key comparison operator. |
| `meta_type` | `string` | — | CAST type for `meta_value`. |
| `meta_type_key` | `string` | — | CAST type for `meta_key`. |
| `meta_query` | `object[]` | `''` | Full `WP_Meta_Query` clause array. JOINs `wp_commentmeta`. When present, adds `GROUP BY comment_ID` to avoid duplicates. |

#### Ordering

| Argument | Type | Default | Behavior |
|---|---|---|---|
| `orderby` | `string \| string[] \| Record<string,string>` | `''` (→ `comment_date_gmt DESC`) | See valid keys below. `false`, `[]`, `'none'` disables ORDER BY. Multiple values as array or space/comma-separated string. |
| `order` | `'ASC' \| 'DESC'` | `'DESC'` | Applied to all simple orderby clauses. |

Valid `orderby` keys: `comment_agent`, `comment_approved`, `comment_author`, `comment_author_email`, `comment_author_IP`, `comment_author_url`, `comment_content`, `comment_date`, `comment_date_gmt`, `comment_ID`, `comment_karma`, `comment_parent`, `comment_post_ID`, `comment_type`, `user_id`, `comment__in` (→ `FIELD(comment_ID, ...)`), `meta_value`, `meta_value_num`, the current `meta_key` value, and any named `meta_query` clause key.

A secondary `comment_ID` sort is always appended to ensure deterministic ordering when the primary sort has ties. Its direction is inferred from any `comment_date` / `comment_date_gmt` clause present; otherwise it uses `DESC`.

#### Pagination

| Argument | Type | Default | Behavior |
|---|---|---|---|
| `number` | `number` | `''` (no limit) | Maximum results to return. |
| `offset` | `number` | `''` | Number of rows to skip. When set, takes precedence over `paged`. |
| `paged` | `number` | `1` | Page number. When `offset` is not set, computes `LIMIT (number*(paged-1)), number`. |
| `no_found_rows` | `boolean` | `true` | When `false`, adds `SQL_CALC_FOUND_ROWS` and queries `SELECT FOUND_ROWS()` to populate `found_comments`. |

After a query with `number` set and `no_found_rows = false`:
- `this.found_comments` = total matching rows (ignoring limit).
- `this.max_num_pages` = `Math.ceil(found_comments / number)`.

#### Output Format

| Argument | Type | Default | Behavior |
|---|---|---|---|
| `fields` | `'ids' \| ''` | `''` | `'ids'` returns `number[]` instead of `WP_Comment[]`. Forces `hierarchical` to `false`. |
| `count` | `boolean` | `false` | Return a single integer count instead of rows. Forces `SELECT COUNT(*)`. |
| `hierarchical` | `'threaded' \| 'flat' \| false` | `false` | When `'threaded'` or `'flat'`, calls `fill_descendants()` to attach children. `'threaded'` builds a tree (children in `WP_Comment.children`). `'flat'` returns a flat array with descendants interleaved. |

#### Caching

| Argument | Type | Default | Behavior |
|---|---|---|---|
| `update_comment_meta_cache` | `boolean` | `true` | When `true`, queues found comment IDs for lazy meta cache priming. |
| `update_comment_post_cache` | `boolean` | `false` | When `true`, primes the post cache for all `comment_post_ID` values in the result set. |
| `cache_domain` | `string` | `'core'` | Namespace key used when storing query results in the object cache. |

### Hierarchical Tree Assembly (`fill_descendants`)

When `hierarchical` is truthy, `WP_Comment_Query` performs a level-by-level breadth-first traversal to fetch all descendants of the top-level results:

1. Start with the IDs of the initially returned comments (level 0).
2. For each level, check the parent-child cache for each parent ID. Query the DB only for uncached parent IDs using `parent__in`.
3. Cache each parent ID's list of direct child IDs.
4. Collect all descendant IDs across all levels.
5. Prime the comment cache for all descendant IDs.

For `hierarchical = 'threaded'`: build a reference map, attach each child via `parent.add_child(child)`, set `populated_children(true)` on every comment in the tree.

For `hierarchical = 'flat'`: return a flat array of all comments + descendants in traversal order.

### SQL Structure

The final query is:

```sql
SELECT [SQL_CALC_FOUND_ROWS] {fields}
FROM wp_comments
[JOIN wp_posts ON wp_posts.ID = wp_comments.comment_post_ID]
[JOIN wp_commentmeta ...]
WHERE {conditions}
[GROUP BY wp_comments.comment_ID]
ORDER BY {orderby}
LIMIT {offset},{number}
```

The `comments_clauses` filter receives all six clause strings (`fields`, `join`, `where`, `orderby`, `limits`, `groupby`) as an associative object and may modify any of them before the query executes.

### Short-circuit Filter

The `comments_pre_query` filter fires before any SQL is executed. Returning a non-null value from this filter bypasses the database entirely and uses the returned value as the result.

---

## 6. Comment Submission

### Entry Point: `wp_handle_comment_submission(commentData)`

This is the public-facing entry point, called from `wp-comments-post.php`. It expects **unslashed** data. Returns `WP_Comment` on success or `WP_Error` on failure.

#### Input Fields

| POST field | Mapped to | Processing |
|---|---|---|
| `comment_post_ID` | `comment_post_id` | Cast to `int`. |
| `author` | `comment_author` | `trim(strip_tags(...))`. |
| `email` | `comment_author_email` | `trim(...)`. |
| `url` | `comment_author_url` | `trim(...)`. |
| `comment` | `comment_content` | `trim(...)`. |
| `comment_parent` | `comment_parent` | Cast to absolute integer. |
| `_wp_unfiltered_html_comment` | nonce | Verified for `unfiltered_html` capability check. |

#### Validation Gates (in order)

1. **Reply to unapproved comment check**: if `comment_parent > 0` and the parent comment does not exist or has `comment_approved = 0`, return `WP_Error('comment_reply_to_unapproved_comment', 403)`.
2. **Post existence**: if the post does not exist, fire `comment_id_not_found` action, return `WP_Error('comment_id_not_found')`.
3. **Post visibility**: if post status is `'private'` and current user cannot `read_post`, return `WP_Error('comment_id_not_found')`.
4. **Comments open**: if `comments_open()` is `false`, fire `comment_closed` action, return `WP_Error('comment_closed', 403)`.
5. **Post in trash**: if post status is `'trash'`, fire `comment_on_trash` action, return `WP_Error('comment_on_trash')`.
6. **Post in draft**: if post status is neither public nor private (e.g., `draft`, `pending`), fire `comment_on_draft` action. Users who can `read_post` get a 403 message; others get an empty error.
7. **Password-protected post**: if `post_password_required()`, fire `comment_on_password_protected` action, return `WP_Error('comment_on_password_protected')`.
8. **Login required**: if `comment_registration` option is `'1'` and user is not logged in, return `WP_Error('not_logged_in', 403)`.
9. **Name and email required** (for guests): if `require_name_email` option is `'1'` and user is not logged in, both `comment_author` and `comment_author_email` must be non-empty, and the email must be a valid format. Returns errors `'require_name_email'` or `'require_valid_email'` with HTTP 200.
10. **Non-empty content**: if `comment_content` is empty and the `allow_empty_comment` filter does not permit it, return `WP_Error('require_valid_comment', 200)`.
11. **Field length limits**: `wp_check_comment_data_max_lengths` checks byte lengths:
    - `comment_author`: max 245 bytes (multibyte-safe)
    - `comment_author_email`: max 100 chars
    - `comment_author_url`: max 200 chars
    - `comment_content`: max 65,525 bytes (multibyte-safe)

#### Logged-in User Override

If the current user is authenticated, `comment_author`, `comment_author_email`, `comment_author_url`, and `user_id` are all taken from the user's profile, ignoring POST values. The `unfiltered_html` nonce is verified to determine whether HTML filtering is applied.

#### Dispatch to `wp_new_comment`

After passing all validation gates, `wp_handle_comment_submission` calls `wp_new_comment(wp_slash(commentdata), true)`.

---

### `wp_new_comment(commentdata, wp_error)`

Internal entry point for inserting any new comment (form submission, REST API, programmatic). Expects **slashed** data.

**Processing pipeline:**

1. Normalize `user_ID` ↔ `user_id` (both kept for back-compat).
2. Default `comment_author_IP` from `$_SERVER['REMOTE_ADDR']` if not provided.
3. Default `comment_agent` from `$_SERVER['HTTP_USER_AGENT']` if not provided.
4. Fire `preprocess_comment` filter (allow wholesale modification of all comment fields).
5. Sanitize `comment_author_IP`: strip anything not in `[0-9a-fA-F:., ]`.
6. Truncate `comment_agent` to 254 characters.
7. Default `comment_date` to current local time; `comment_date_gmt` to current UTC.
8. Default `comment_type` to `'comment'`.
9. Validate parent: if `comment_parent > 0`, check that parent comment exists and has status `'approved'` or `'unapproved'`. If neither, reset `comment_parent` to `0`.
10. Call `wp_allow_comment(commentdata)` to determine initial approval status. If it returns a `WP_Error`, propagate immediately.
11. Call `wp_filter_comment(commentdata)` to apply per-field sanitization filters.
12. If the comment is not `'trash'` or `'spam'`, re-run `wp_check_comment_data` after filters (in case filters modified fields).
13. Call `wp_insert_comment(commentdata)`.
14. On DB insertion failure, strip invalid text from text columns and retry once.
15. Fire `comment_post` action with `(comment_id, comment_approved, commentdata)`.
16. Return the new comment ID.

---

### `wp_allow_comment(commentdata, wp_error)`

Determines whether a comment is allowed and what initial approval status it should receive. Returns `0 | 1 | 'spam' | 'trash' | WP_Error`.

**Duplicate detection:**

Queries for an existing comment matching all of:
- Same `comment_post_ID`
- Same `comment_parent`
- `comment_approved != 'trash'`
- Same `comment_author`
- Same `comment_author_email` (if provided)
- Same `comment_content`

If found, fires `comment_duplicate_trigger` action and returns `WP_Error('comment_duplicate', 409)`.

The `duplicate_comment_id` filter can override the found duplicate ID (returning falsy allows the duplicate through).

**Flood check:**

Fires `check_comment_flood` action. The default handler (`wp_check_comment_flood`) is attached via the `wp_is_comment_flood` filter. Flood logic:

- Skip if current user has `manage_options` or `moderate_comments` capability.
- Find the most recent comment from the same IP or email within the last hour.
- Pass timestamps to `comment_flood_filter`. The built-in `wp_throttle_comment_flood` callback returns `true` (flood detected) if the gap between the last comment and the new one is less than 15 seconds.
- If flood detected, return `WP_Error('comment_flood', 429)`.

**Delegates to `wp_check_comment_data`.**

---

### `wp_check_comment_data(commentdata)`

Determines final approval status.

1. If `user_id` is set and is either the post author or has `moderate_comments` capability: immediately approved (`1`).
2. Otherwise:
   a. Call `check_comment(...)`:
      - If `comment_moderation` option is `'1'`: return `false` (force moderation).
      - Count `<a href` tags. If count >= `comment_max_links` option: return `false`.
      - Check `moderation_keys` option (newline-separated). Each keyword is tested as a case-insensitive regex against `author`, `email`, `url`, `comment`, `user_ip`, `user_agent`. Any match: return `false`.
      - If `comment_previously_approved` option is `'1'` (and not a trackback/pingback): look for an existing approved comment from the same `user_id` or from the same `comment_author` + `comment_author_email` pair. If found and the email is not in the moderation keys: return `true`. Otherwise: return `false`.
      - Default return: `true`.
   b. Check `wp_check_comment_disallowed_list(...)`:
      - Reads `disallowed_keys` option (newline-separated).
      - Strips HTML from comment content before testing.
      - Tests each keyword (case-insensitive regex) against `author`, `email`, `url`, `comment`, `comment_without_html`, `user_ip`, `user_agent`.
      - Any match: if `EMPTY_TRASH_DAYS` constant is set, result is `'trash'`; otherwise `'spam'`.
3. Fire `pre_comment_approved` filter with the current status and full comment data. Filter may override the status or return `WP_Error` to abort insertion.

---

### `wp_insert_comment(commentdata)`

Low-level insert. Expects **unslashed** data. Returns the new comment ID or `false`.

1. Extract all fields with defaults.
2. Default `comment_date` to current local time; `comment_date_gmt` derived from `comment_date` if not supplied.
3. `comment_type` defaults to `'comment'`.
4. Execute `INSERT INTO wp_comments (...)`.
5. If `comment_approved = 1`, update the post's comment count and clear the `lastcommentmodified` cache entries for all three timezone variants.
6. Clear the comment object cache.
7. If `comment_meta` key is present in the input array, write each key/value pair via `add_comment_meta(..., unique=true)`.
8. Fire `wp_insert_comment` action with `(id, comment)`.
9. Return the new ID.

---

## 7. Comment CRUD

### `get_comment(comment, output)`

Retrieves a single comment. Accepts a comment ID, an existing `WP_Comment` object, or a plain object.

- Falls back to the global `$comment` variable if argument is empty.
- If given a plain object, wraps it in `new WP_Comment(obj)`.
- If given an ID, calls `WP_Comment.get_instance(id)` which checks the object cache (`'comment'` group) before hitting the DB.
- Passes result through the `get_comment` filter.
- `output` parameter controls return type: `OBJECT` (default), `ARRAY_A` (associative), `ARRAY_N` (numeric).
- Returns `null` if not found.

### `get_comments(args)`

Thin wrapper: `new WP_Comment_Query().query(args)`. See Section 5.

### `get_approved_comments(post_id, args)`

Queries with defaults `{ status: 1, post_id: post_id, order: 'ASC' }`.

### `wp_update_comment(commentarr, wp_error)`

Updates an existing comment. Returns `1` on update, `0` if no change, `false`/`WP_Error` on failure.

1. Fetch the current comment from the DB as an associative array.
2. Validate `comment_post_ID` if provided.
3. Merge existing fields with the new fields (new values win).
4. Apply `wp_filter_comment` for per-field sanitization. If the comment's user does not have `unfiltered_html`, adds `wp_filter_kses` filter on `pre_comment_content` during this step.
5. Recompute `comment_date_gmt` from `comment_date`.
6. Normalize `comment_approved`: `'hold'` → `0`, `'approve'` → `1`.
7. Apply `wp_update_comment_data` filter. If filter returns `WP_Error`, abort.
8. Execute `UPDATE wp_comments SET ... WHERE comment_ID = ?`.
9. Update meta if `comment_meta` key is present in input (via `update_comment_meta`).
10. Clear comment cache, update post comment count.
11. Fire `edit_comment` action.
12. Fire status transition hooks via `wp_transition_comment_status`.

### `wp_delete_comment(comment_id, force_delete)`

- If `force_delete` is `false` and `EMPTY_TRASH_DAYS` is set and the comment is not already in `trash` or `spam`, delegates to `wp_trash_comment`.
- Otherwise: fires `delete_comment` action, re-parents all child comments to the deleted comment's parent, deletes all comment meta, deletes the row from `wp_comments`, fires `deleted_comment` action, updates post comment count, clears comment cache, fires `wp_set_comment_status` with `'delete'` and transition hooks.

### `wp_trash_comment(comment_id)`

- If `EMPTY_TRASH_DAYS` is `0` (trash disabled): calls `wp_delete_comment(id, true)` permanently. If the comment is a top-level `'note'` type, also deletes all child notes.
- Otherwise: fires `trash_comment` action, calls `wp_set_comment_status(comment, 'trash')`, writes `_wp_trash_meta_status` and `_wp_trash_meta_time` meta, fires `trashed_comment` action. For top-level `'note'` type comments, also trashes all child notes.

### `wp_untrash_comment(comment_id)`

Fires `untrash_comment` action, reads `_wp_trash_meta_status` meta to get the previous status, calls `wp_set_comment_status(comment, previous_status)`, deletes both meta keys, fires `untrashed_comment` action.

### `wp_spam_comment(comment_id)` / `wp_unspam_comment(comment_id)`

Parallel to trash/untrash: fires `spam_comment` / `unspam_comment` action, calls `wp_set_comment_status`, stores/restores/deletes the `_wp_trash_meta_status` and `_wp_trash_meta_time` meta, fires `spammed_comment` / `unspammed_comment` action.

---

## 8. Moderation

### `wp_set_comment_status(comment_id, comment_status, wp_error)`

Sets `comment_approved` to one of `'0'`, `'1'`, `'spam'`, `'trash'`. Input aliases:

| Input | Stored as |
|---|---|
| `'hold'` or `'0'` | `'0'` |
| `'approve'` or `'1'` | `'1'` |
| `'spam'` | `'spam'` |
| `'trash'` | `'trash'` |

When setting to `'approve'`/`'1'`, adds a one-time hook so that `wp_new_comment_notify_postauthor` fires after the status change.

Steps:
1. Clone the current comment (to preserve old status for transition hooks).
2. `UPDATE wp_comments SET comment_approved = ? WHERE comment_ID = ?`.
3. Clear comment cache.
4. Fire `wp_set_comment_status` action.
5. Fire status transition hooks via `wp_transition_comment_status`.
6. Update post comment count.

### `wp_get_comment_status(comment_id)`

Returns `'approved'`, `'unapproved'`, `'spam'`, `'trash'`, or `false`.

### `wp_approve_comment(comment_id)`

Convenience wrapper: calls `wp_set_comment_status(comment_id, 'approve')`.

### Status Transition Hooks

`wp_transition_comment_status(new_status, old_status, comment)` fires a normalized sequence of hooks whenever a comment's status changes:

1. If `new_status !== old_status`:
   - `transition_comment_status` action: `(new_status, old_status, comment)`.
   - `comment_{old_status}_to_{new_status}` action: `(comment)`.
2. Always (even if status unchanged):
   - `comment_{new_status}_{comment.comment_type}` action: `(comment_id, comment)`.

Raw values `0`/`'hold'` are normalized to `'unapproved'` and `1`/`'approve'` to `'approved'` before hook name construction.

### `wp_count_comments(post_id)` / `get_comment_count(post_id)`

`wp_count_comments` returns a `stdClass` (object) with keys: `approved`, `moderated`, `spam`, `trash`, `post-trashed`, `total_comments`, `all`. Results are cached in the `'counts'` cache group under key `"comments-{post_id}"`.

`get_comment_count` returns a plain array with keys: `approved`, `awaiting_moderation`, `spam`, `trash`, `post-trashed`, `total_comments`, `all`. It queries the DB directly by running separate count queries for each status.

Definitions:
- `all = approved + awaiting_moderation`
- `total_comments = all + spam`

### Comment Count on Posts

`wp_update_comment_count(post_id)` updates `wp_posts.comment_count` with a fresh `SELECT COUNT(*) WHERE comment_post_ID = ? AND comment_approved = '1' AND comment_type != 'note'` query. The `pre_wp_update_comment_count_now` filter may override the computed count.

`wp_defer_comment_counting(true)` queues post IDs for deferred update. `wp_defer_comment_counting(false)` flushes the queue.

---

## 9. Spam Detection

### Disallowed Keys (`wp_check_comment_disallowed_list`)

The `disallowed_keys` site option holds a newline-separated list of words/patterns. Each entry is:
1. `trim()`-ed.
2. `preg_quote()`-ed (with `#` as delimiter).
3. Tested as a case-insensitive (`i`), Unicode (`u`) regex against: `author`, `email`, `url`, `comment` (raw), `comment` (HTML-stripped), `user_ip`, `user_agent`.

Any match → the comment is set to `'trash'` (if `EMPTY_TRASH_DAYS > 0`) or `'spam'` (otherwise). The disallowed list is a hard block; it fires **after** `check_comment()` in `wp_check_comment_data`, overriding an `approved` result.

### Moderation Keys (`check_comment`)

The `moderation_keys` option uses the same pattern mechanism. Any match sends the comment to the moderation queue (`approved = 0`) rather than auto-approving it. It does not set spam/trash.

### Max Links Check (`check_comment`)

If the `comment_max_links` option is greater than zero, the number of `<a href` occurrences in the comment content (after `comment_text` filter) is counted. If the count is `>= comment_max_links`, the comment is held for moderation. The `comment_max_links_url` filter can override the counted number.

### Akismet Integration Points

Akismet integrates via the `pre_comment_approved` filter, which receives the current approval status and full comment data. It may return `'spam'` to mark a comment as spam or any other valid status string to override the default outcome. Akismet also stores its own comment meta (e.g., `akismet_result`, `akismet_history`) via the standard comment meta API.

---

## 10. Comment Threading

### Parent/Child Relationships

`comment_parent` is a non-nullable foreign key to another `comment_ID` in the same table. `0` means no parent (top-level).

### Maximum Thread Depth

The `thread_comments_depth` option (default: `5`) sets the maximum nesting depth. The `thread_comments` option (boolean) enables/disables threading entirely.

When a reply would exceed `max_depth`, the reply link is not rendered (returns `null`). The Walker enforces depth limits during HTML generation.

### `Walker_Comment`

`Walker_Comment` is a specialized tree walker that renders the comment list to HTML. It is called via `wp_list_comments()`.

**`wp_list_comments(args, comments)` arguments:**

| Argument | Type | Default | Notes |
|---|---|---|---|
| `walker` | `Walker_Comment \| null` | `null` | Custom walker instance. Defaults to `new Walker_Comment()`. |
| `max_depth` | `number \| ''` | `''` | Falls back to `thread_comments_depth` option; `-1` = flat. |
| `style` | `'ul' \| 'ol' \| 'div'` | `'ul'` | Outer list element. `'div'` = no wrapping list element. |
| `callback` | `callable \| null` | `null` | Custom comment rendering callback. |
| `end-callback` | `callable \| null` | `null` | Custom closing callback. |
| `type` | `string` | `'all'` | Filter by comment type. |
| `page` | `number \| ''` | `''` | Current page number for pagination. |
| `per_page` | `number \| ''` | `''` | Comments per page. |
| `avatar_size` | `number` | `32` | Passed to `get_avatar()`. |
| `reverse_top_level` | `boolean \| null` | `null` | If `true`, display newest top-level comments first. Defaults to `comment_order` option. |
| `reverse_children` | `boolean \| ''` | `''` | Reverse child comment ordering. |
| `format` | `'html5' \| 'xhtml'` | `'html5'` if theme supports it | Output format. |
| `short_ping` | `boolean` | `false` | Render pingbacks/trackbacks in short form. |
| `echo` | `boolean` | `true` | Echo or return output. |

Walker calls `$walker->paged_walk($_comments, max_depth, page, per_page, args)`.

### CSS Classes on Comment Elements

`get_comment_class()` generates an array of CSS class strings:

1. Comment type (`comment`, `trackback`, `pingback`, etc.).
2. If `user_id` is non-zero: `'byuser'`, `'comment-author-{nicename}'`.
3. If commenter is the post author: `'bypostauthor'`.
4. Alternating even/odd: `'even'` or `'odd'` + `'alt'` (global `$comment_alt` counter).
5. Thread-level alternating (top-level only): `'thread-even'` or `'thread-odd'` + `'thread-alt'`.
6. `'depth-{N}'` where N is the current nesting depth (global `$comment_depth`).
7. Any additional classes from the `$css_class` argument.

### `get_page_of_comment(comment_id, args)`

Determines which page number a comment appears on:

1. If threading: walk up to the top-level ancestor.
2. Count all approved comments on the same post that are older (by `comment_date_gmt`) and top-level.
3. `page = ceil((older_count + 1) / per_page)`.
4. If `older_count === 0`: page 1.

The `include_unapproved` logic (logged-in user or unapproved-email token) is applied here as well so the commenter can find their own pending comment.

### Comment Permalink

`get_comment_link(comment, args)` builds:
1. Post permalink.
2. If pagination is enabled (`page_comments` option) and `cpage > 1` (or `default_comments_page` is not `'oldest'`): appends `/comment-page-{N}` (pretty permalinks) or `?cpage=N` (plain).
3. Appends `#comment-{comment_ID}` fragment.

---

## 11. Comment Counts

### `wp_count_comments(post_id)`

Returns an object:

```typescript
interface CommentCounts {
  approved: number;       // comment_approved = '1'
  moderated: number;      // comment_approved = '0' (alias: awaiting_moderation)
  spam: number;           // comment_approved = 'spam'
  trash: number;          // comment_approved = 'trash'
  'post-trashed': number; // comments whose post is trashed
  total_comments: number; // approved + moderated + spam
  all: number;            // approved + moderated
}
```

Cached in `'counts'` group under key `"comments-{post_id}"`. Cache is invalidated by `clean_comment_cache()` which calls `wp_cache_set_comments_last_changed()`.

The `wp_count_comments` filter fires first; returning a non-empty value bypasses the database entirely.

### Denormalized Post Comment Count

`wp_posts.comment_count` stores only the count of `comment_approved = '1'` comments that are NOT of type `'note'`. It is updated by `wp_update_comment_count_now()` after every insert, delete, or status change that affects an approved comment.

---

## 12. Pingbacks and Trackbacks

### Outbound Pingbacks (`pingback()`)

When a post is published, `do_all_pings()` fires which triggers `do_all_pingbacks()`:

1. Find all posts with a `_pingme` meta key.
2. For each such post, delete the `_pingme` meta and call `pingback(null, post_id)`.

`pingback(content, post)` extracts all external links from post content, filters out already-pinged URLs (from `wp_posts.pinged` field), self-links, and local attachments. For each remaining link:

1. `discover_pingback_server_uri(url)`: first tries `HEAD` request for `X-Pingback` response header; on failure fetches the HTML body and looks for `<link rel="pingback" href="...">`.
2. If a pingback server is found, makes an XML-RPC call to `pingback.ping` with `(source_url, target_url)`.
3. On success (or error code `48` = already registered), records the URL in `wp_posts.pinged` via `add_ping()`.

### Outbound Trackbacks (`do_trackbacks()`)

1. Reads `wp_posts.to_ping` for the post.
2. For each URL not already in `wp_posts.pinged`: sends an HTTP POST to the trackback URL with form-encoded `title`, `url`, `blog_name`, `excerpt` (max 252 chars).
3. Appends the URL to `wp_posts.pinged` and removes it from `wp_posts.to_ping`.

### Inbound Pingbacks (XML-RPC)

Incoming pingbacks arrive via the XML-RPC endpoint (`xmlrpc.php`) as `pingback.ping` calls. The XMLRPC server:
1. Validates the source URI via `pingback_ping_source_uri` filter (defaults to `wp_http_validate_url`).
2. Fetches the source page and verifies the link to the target.
3. Calls `wp_new_comment()` with `comment_type = 'pingback'`.
4. Error responses are sanitized via the `xmlrpc_pingback_error` filter, which normalizes all errors to code `0` except for `48` (already registered).

### Inbound Trackbacks (`wp-trackback.php`)

Receives HTTP POST with `title`, `url`, `blog_name`, `excerpt`. Calls `wp_new_comment()` with `comment_type = 'trackback'`.

### Ping Status

Whether a post accepts pings is controlled by `wp_posts.ping_status` (`'open'` or `'closed'`). The `pings_open()` template function checks this field (filtered by the `pings_open` filter).

---

## 13. Email Notifications

### Notification to Post Author (`wp_new_comment_notify_postauthor`)

Fires on the `comment_post` action (after every new comment insertion). Checks:
1. `comments_notify` option is enabled (or `wp_notes_notify` for notes).
2. The `notify_post_author` filter does not return `false`.
3. The comment is approved (`comment_approved = '1'`), or it is a `'note'` type.

Calls `wp_notify_postauthor(comment_id)` (implemented in `pluggable.php`).

### Notification to Moderator (`wp_new_comment_notify_moderator`)

Fires on the `comment_post` action (after every new comment insertion). Checks:
1. The comment is pending (`comment_approved = '0'`).
2. The `notify_moderator` filter does not return `false`.

Calls `wp_notify_moderator(comment_id)` (implemented in `pluggable.php`).

### Notification on Manual Approval

When `wp_set_comment_status` is called with `'approve'`, it registers a one-time `wp_set_comment_status` action hook that calls `wp_new_comment_notify_postauthor`. This ensures post authors are notified when a comment is manually approved by a moderator.

### REST API Notes

`wp_new_comment_via_rest_notify_postauthor` fires on the `wp_insert_comment` action for REST API-created `'note'` type comments.

---

## 14. Comment Meta

Comment meta is stored in `wp_commentmeta` table (columns: `meta_id`, `comment_id`, `meta_key`, `meta_value`) and uses the generic metadata API.

### API Functions

```typescript
function addCommentMeta(commentId: number, metaKey: string, metaValue: unknown, unique?: boolean): number | false;
function deleteCommentMeta(commentId: number, metaKey: string, metaValue?: unknown): boolean;
function getCommentMeta(commentId: number, key?: string, single?: boolean): unknown;
function updateCommentMeta(commentId: number, metaKey: string, metaValue: unknown, prevValue?: unknown): number | boolean;
```

All four delegate to `add_metadata / delete_metadata / get_metadata / update_metadata` with object type `'comment'`.

### Serialization

- `false` values are stored and retrieved as empty string `''`.
- `true` values are stored and retrieved as `'1'`.
- Numbers are stored and retrieved as strings.
- Arrays and objects are PHP-serialized.

### Lazy Loading

`wp_lazyload_comment_meta(comment_ids)` queues a list of comment IDs for batch meta loading. When meta for any queued ID is accessed, all queued IDs are loaded in a single query. `WP_Comment_Query` queues the found IDs when `update_comment_meta_cache` is `true`.

### Reserved Meta Keys

| Key | Usage |
|---|---|
| `_wp_trash_meta_status` | Previous `comment_approved` value before trashing or spamming. |
| `_wp_trash_meta_time` | Unix timestamp when comment was trashed or spammed. |

---

## 15. Key Hooks and Filters

### Submission and Insertion Filters

| Hook | Type | Arguments | Purpose |
|---|---|---|---|
| `preprocess_comment` | filter | `commentdata: array` | Modify raw comment data before any processing. Fires inside `wp_new_comment`. |
| `pre_comment_approved` | filter | `approved: 0\|1\|'spam'\|'trash'\|WP_Error, commentdata: array` | Override the computed approval status. Returning `WP_Error` aborts the insert. |
| `pre_comment_author_name` | filter | `author: string` | Sanitize/transform the comment author name. |
| `pre_comment_author_email` | filter | `email: string` | Sanitize/transform the author email. |
| `pre_comment_author_url` | filter | `url: string` | Sanitize/transform the author URL. |
| `pre_comment_user_agent` | filter | `agent: string` | Sanitize/transform the user agent string. |
| `pre_comment_user_ip` | filter | `ip: string` | Sanitize/transform the author IP address. |
| `pre_comment_content` | filter | `content: string` | Sanitize/transform the comment content. `wp_filter_kses` is added here for non-`unfiltered_html` users. |
| `pre_user_id` | filter | `user_id: number` | Sanitize the associated user ID. |
| `allow_empty_comment` | filter | `allow: boolean, commentdata: array` | Control whether empty comment content is permitted. |
| `comment_save_pre` | filter | `content: string` | Filter comment content immediately before it is updated in the DB during `wp_update_comment`. |
| `wp_update_comment_data` | filter | `data: array, old_comment: array, raw_new: array` | Modify processed comment data before `UPDATE`. Return `WP_Error` to abort. |
| `duplicate_comment_id` | filter | `dupe_id: number, commentdata: array` | Override duplicate detection. Return falsy to allow the duplicate. |
| `comment_duplicate_message` | filter | `message: string` | Customize the duplicate comment error message. |
| `comment_flood_message` | filter | `message: string` | Customize the flood-control error message. |

### Flood Control Filters

| Hook | Type | Arguments | Purpose |
|---|---|---|---|
| `check_comment_flood` | action | `ip, email, date_gmt, wp_error` | Triggers flood detection. The default `wp_check_comment_flood` callback is attached to `wp_is_comment_flood`. |
| `wp_is_comment_flood` | filter | `is_flood: boolean, ip, email, date_gmt, avoid_die` | Return `true` to declare a flood. |
| `comment_flood_filter` | filter | `is_flood: boolean, time_last: number, time_new: number` | Core callback `wp_throttle_comment_flood` returns `true` if gap < 15 seconds. |
| `comment_flood_trigger` | action | `time_last: number, time_new: number` | Fires just before the flood error is triggered. |

### Post-Insert Actions

| Hook | Type | Arguments | Purpose |
|---|---|---|---|
| `wp_insert_comment` | action | `id: number, comment: WP_Comment` | Fires immediately after INSERT succeeds. |
| `comment_post` | action | `comment_id: number, approved: 0\|1\|'spam', commentdata: array` | Fires after `wp_insert_comment` inside `wp_new_comment`. Used to trigger email notifications. |

### Status Transition Actions

| Hook | Type | Arguments | Purpose |
|---|---|---|---|
| `wp_set_comment_status` | action | `comment_id: string, status: string` | Fires after a status change is written to DB and cache is cleared. |
| `transition_comment_status` | action | `new: string, old: string, comment: WP_Comment` | Fires when status changes (new ≠ old). |
| `comment_{old}_to_{new}` | action | `comment: WP_Comment` | Dynamic. E.g., `comment_unapproved_to_approved`. |
| `comment_{new}_{type}` | action | `comment_id: string, comment: WP_Comment` | Dynamic. E.g., `comment_approved_comment`. Always fires. |
| `edit_comment` | action | `comment_id: number, data: array` | Fires after `wp_update_comment` writes to DB. |

### Delete and Trash Actions

| Hook | Type | Arguments | Purpose |
|---|---|---|---|
| `delete_comment` | action | `comment_id: string, comment: WP_Comment` | Before hard-delete. |
| `deleted_comment` | action | `comment_id: string, comment: WP_Comment` | After hard-delete. |
| `trash_comment` | action | `comment_id: string, comment: WP_Comment` | Before moving to trash. |
| `trashed_comment` | action | `comment_id: string, comment: WP_Comment` | After moving to trash. |
| `untrash_comment` | action | `comment_id: string, comment: WP_Comment` | Before restoring from trash. |
| `untrashed_comment` | action | `comment_id: string, comment: WP_Comment` | After restoring from trash. |
| `spam_comment` | action | `comment_id: number, comment: WP_Comment` | Before marking as spam. |
| `spammed_comment` | action | `comment_id: number, comment: WP_Comment` | After marking as spam. |
| `unspam_comment` | action | `comment_id: string, comment: WP_Comment` | Before un-spamming. |
| `unspammed_comment` | action | `comment_id: string, comment: WP_Comment` | After un-spamming. |
| `clean_comment_cache` | action | `id: number` | After a comment is removed from the object cache. |

### Query Hooks

| Hook | Type | Arguments | Purpose |
|---|---|---|---|
| `pre_get_comments` | action | `query: WP_Comment_Query` | Modify query vars before SQL is built. |
| `comments_pre_query` | filter | `null, query: WP_Comment_Query` | Return non-null to short-circuit the DB query. |
| `comments_clauses` | filter | `clauses: object, query: WP_Comment_Query` | Modify SQL clause strings directly. |
| `the_comments` | filter | `comments: WP_Comment[], query: WP_Comment_Query` | Filter the raw result set. |
| `parse_comment_query` | action | `query: WP_Comment_Query` | Fires after query vars are parsed. |
| `found_comments_query` | filter | `sql: string, query: WP_Comment_Query` | Override `SELECT FOUND_ROWS()`. |

### Submission Gate Actions

| Hook | Type | Arguments | Purpose |
|---|---|---|---|
| `comment_id_not_found` | action | `comment_post_id: number` | Comment on non-existent post. |
| `comment_closed` | action | `comment_post_id: number` | Comment on closed post. |
| `comment_on_trash` | action | `comment_post_id: number` | Comment on trashed post. |
| `comment_on_draft` | action | `comment_post_id: number` | Comment on draft post. |
| `comment_on_password_protected` | action | `comment_post_id: number` | Comment on password-protected post. |
| `comment_reply_to_unapproved_comment` | action | `post_id: number, parent_id: number` | Reply to unapproved comment. |
| `pre_comment_on_post` | action | `comment_post_id: number` | Fires just before the comment data is assembled. |

### Notification Filters

| Hook | Type | Arguments | Purpose |
|---|---|---|---|
| `notify_moderator` | filter | `notify: boolean, comment_id: number` | Override whether to notify the moderator. |
| `notify_post_author` | filter | `notify: boolean, comment_id: number` | Override whether to notify the post author. |

### Count and Comment Cache

| Hook | Type | Arguments | Purpose |
|---|---|---|---|
| `wp_count_comments` | filter | `count: object, post_id: number` | Short-circuit comment count retrieval. |
| `pre_wp_update_comment_count_now` | filter | `new: null\|number, old: number, post_id: number` | Override the computed comment count. |
| `wp_update_comment_count` | action | `post_id, new, old` | Fires after a post's comment count is updated. |

### Pingback Filters

| Hook | Type | Arguments | Purpose |
|---|---|---|---|
| `pre_ping` | action | `post_links: string[], pung: string[], post_id: number` | Modify links before pinging. |
| `pingback_useragent` | filter | `useragent: string, ...` | Customize pingback user agent string. |
| `pingback_ping_source_uri` | filter | `source_uri: string` | Validate/transform the pingback source URI. |
| `xmlrpc_pingback_error` | filter | `error: IXR_Error` | Sanitize pingback error responses. |

### Comment Post Redirect

| Hook | Type | Arguments | Purpose |
|---|---|---|---|
| `set_comment_cookies` | action | `comment: WP_Comment, user: WP_User, cookies_consent: boolean` | Fires after successful submission; use to set identity cookies. |
| `comment_post_redirect` | filter | `location: string, comment: WP_Comment` | Override redirect destination after comment submission. |

---

## 16. TypeScript Interface Sketch

```typescript
// -----------------------------------------------------------------------
// Core data types
// -----------------------------------------------------------------------

type CommentApproved = '0' | '1' | 'spam' | 'trash';
type CommentType = 'comment' | 'trackback' | 'pingback' | 'note' | string;
type CommentStatus = 'approved' | 'unapproved' | 'spam' | 'trash';

interface WPComment {
  // DB columns
  comment_ID: string;                // numeric string
  comment_post_ID: string;           // numeric string
  comment_author: string;
  comment_author_email: string;
  comment_author_url: string;
  comment_author_IP: string;
  comment_date: string;              // 'YYYY-MM-DD HH:MM:SS' local
  comment_date_gmt: string;          // 'YYYY-MM-DD HH:MM:SS' UTC
  comment_content: string;
  comment_karma: string;             // numeric string
  comment_approved: CommentApproved;
  comment_agent: string;
  comment_type: CommentType;
  comment_parent: string;            // numeric string, '0' = top-level
  user_id: string;                   // numeric string

  // Runtime-only
  children?: Record<string, WPComment>;
  populatedChildren?: boolean;
}

// -----------------------------------------------------------------------
// Comment insertion payload
// -----------------------------------------------------------------------

interface CommentInsertData {
  comment_post_ID?: number;
  comment_author?: string;
  comment_author_email?: string;
  comment_author_url?: string;
  comment_author_IP?: string;
  comment_date?: string;
  comment_date_gmt?: string;
  comment_content?: string;
  comment_karma?: number;
  comment_approved?: CommentApproved | 0 | 1;
  comment_agent?: string;
  comment_type?: CommentType;
  comment_parent?: number;
  user_id?: number;
  comment_meta?: Record<string, unknown>;
}

// -----------------------------------------------------------------------
// Query
// -----------------------------------------------------------------------

type CommentOrderBy =
  | 'comment_agent'     | 'comment_approved'  | 'comment_author'
  | 'comment_author_email' | 'comment_author_IP' | 'comment_author_url'
  | 'comment_content'   | 'comment_date'       | 'comment_date_gmt'
  | 'comment_ID'        | 'comment_karma'      | 'comment_parent'
  | 'comment_post_ID'   | 'comment_type'       | 'user_id'
  | 'comment__in'       | 'meta_value'         | 'meta_value_num'
  | 'none'              | false
  | string;             // meta_key or named meta_query clause

type StatusQueryKeyword = 'hold' | 'approve' | 'all' | 'spam' | 'trash' | 'any' | string;

interface CommentQueryArgs {
  // Author
  author_email?: string;
  author_url?: string;
  author__in?: number[];
  author__not_in?: number[];
  user_id?: number | number[];

  // Post
  post_id?: number;
  post__in?: number[];
  post__not_in?: number[];
  post_author?: number | string;
  post_author__in?: number[];
  post_author__not_in?: number[];
  post_status?: string | string[];
  post_type?: string | string[];
  post_name?: string;
  post_parent?: number;

  // Comment IDs
  comment__in?: number[];
  comment__not_in?: number[];

  // Parent
  parent?: number | '';
  parent__in?: number[];
  parent__not_in?: number[];

  // Status/type
  status?: StatusQueryKeyword | StatusQueryKeyword[];
  include_unapproved?: (number | string)[];
  type?: string | string[];
  type__in?: string[];
  type__not_in?: string[];
  karma?: number;

  // Search
  search?: string;

  // Date
  date_query?: object[] | null;

  // Meta
  meta_key?: string | string[];
  meta_value?: string | string[];
  meta_compare?: string;
  meta_compare_key?: string;
  meta_type?: string;
  meta_type_key?: string;
  meta_query?: object[];

  // Ordering
  orderby?: CommentOrderBy | CommentOrderBy[] | Record<string, string>;
  order?: 'ASC' | 'DESC';

  // Pagination
  number?: number;
  offset?: number;
  paged?: number;
  no_found_rows?: boolean;

  // Output
  fields?: 'ids' | '';
  count?: boolean;
  hierarchical?: 'threaded' | 'flat' | false;

  // Cache
  update_comment_meta_cache?: boolean;
  update_comment_post_cache?: boolean;
  cache_domain?: string;
}

interface CommentQueryResult {
  comments: WPComment[] | number[];
  foundComments: number;
  maxNumPages: number;
  request: string;                   // final SQL string
}

// -----------------------------------------------------------------------
// Submission
// -----------------------------------------------------------------------

interface CommentSubmissionData {
  comment_post_ID: string | number;
  author?: string;
  email?: string;
  url?: string;
  comment?: string;
  comment_parent?: string | number;
  _wp_unfiltered_html_comment?: string;
}

// -----------------------------------------------------------------------
// Counts
// -----------------------------------------------------------------------

interface CommentCounts {
  approved: number;
  moderated: number;       // same as awaiting_moderation
  spam: number;
  trash: number;
  'post-trashed': number;
  total_comments: number;  // approved + moderated + spam
  all: number;             // approved + moderated
}

// -----------------------------------------------------------------------
// Walker output args
// -----------------------------------------------------------------------

interface ListCommentsArgs {
  walker?: object | null;
  max_depth?: number | '';
  style?: 'ul' | 'ol' | 'div';
  callback?: Function | null;
  'end-callback'?: Function | null;
  type?: string;
  page?: number | '';
  per_page?: number | '';
  avatar_size?: number;
  reverse_top_level?: boolean | null;
  reverse_children?: boolean | '';
  format?: 'html5' | 'xhtml';
  short_ping?: boolean;
  echo?: boolean;
}
```

---

## 17. Design Patterns to Carry Over

### Filter-before-insert / Validate-twice Pattern

`wp_new_comment` calls `wp_allow_comment` before `wp_filter_comment`, and then re-calls `wp_check_comment_data` after `wp_filter_comment`. This ensures that:
1. The raw data is checked for duplicates and floods before sanitization changes it.
2. Sanitization filters cannot be used to smuggle content past the disallowed-key check.

Replicate this double-validation in the TypeScript implementation.

### Slashed vs Unslashed Data Boundary

`wp_handle_comment_submission` receives unslashed data (from `wp_unslash($_POST)`) and calls `wp_slash` before passing to `wp_new_comment`. `wp_new_comment` and `wp_insert_comment` both `wp_unslash` internally. Track where slashing/unslashing occurs at the module boundary to avoid double-encoding.

In TypeScript, the equivalent is to canonicalize input strings at the entry point and document that internal functions receive clean strings.

### Object Cache Invalidation

Every write operation (insert, update, delete, status change) calls `clean_comment_cache(id)` which:
1. Deletes the per-ID cache entry from the `'comment'` group.
2. Calls `wp_cache_set_comments_last_changed()` which updates a global timestamp used as a cache salt for query results.

This salt mechanism means all query caches are automatically invalidated when any comment changes, without needing to track which queries touched which comment IDs.

### Deferred Count Updates

Comment count updates to `wp_posts.comment_count` are normally synchronous. Use `wp_defer_comment_counting(true)` before a bulk operation and `wp_defer_comment_counting(false)` after to batch all count updates into a single pass. Replicate as a transaction-like defer/flush API.

### Hierarchical Assembly via Level Sweeps

`fill_descendants` never fetches children one comment at a time. It fetches an entire depth level in a single query using `parent__in`, then caches each parent-to-children mapping. Replicate this level-sweep strategy to avoid N+1 queries when building threaded comment trees.

### Magic Property Delegation to Post

`WP_Comment.__get` delegates unknown property accesses that match post field names to `get_post(comment_post_ID)`. In TypeScript, implement this as an explicit `getPostField(fieldName: string)` method rather than runtime dynamic dispatch. Document that these fields are lazy-loaded and cached per post.

### Status Normalization at Hook Boundaries

`wp_transition_comment_status` normalizes raw DB values (`0`, `1`, `'hold'`, `'approve'`) to human-readable names (`'unapproved'`, `'approved'`) before constructing dynamic hook names. The TypeScript event system should normalize to these canonical strings before emitting events.

### Cookies for Unapproved Comment Preview

After a guest submits a comment that lands in moderation, the system uses `wp_hash(comment_date_gmt)` as a moderation hash. Combined with the comment ID in the query string (`?unapproved=N&moderation-hash=H`), it allows the commenter to see their pending comment within a 10-minute window. Implement this hash-based preview token consistently in the TypeScript comment fetch and rendering path.

### Cookie-based Identity Recall

Three cookies (`comment_author_`, `comment_author_email_`, `comment_author_url_`, all suffixed with `COOKIEHASH`) store guest commenter identity for one year. On comment form render, these cookies populate the form fields. Cookies are only set if the user consented (`wp-comment-cookies-consent` POST field). Implement a cookie-consent gate before writing any commenter identity cookies.

### `'note'` Type Auto-Exclusion

The `'note'` type is a first-class internal type (added in 6.9) that is automatically excluded from all standard queries unless explicitly requested. Replicate this default-exclusion behavior in the query engine's type filtering logic, gated on whether `'all'`, `'note'`, or a type__not_in entry for `'note'` is present.

---

## 18. Tovu Reconstruction Notes

### 18.1 Why this exists

Comments are a full moderation and discussion subsystem, not just rows attached to posts. The code exists to coordinate guest identity, spam/flood protection, threading, status transitions, preview of pending comments, and synchronized post-level counts.

### 18.2 What Tovu should preserve

- A single create/moderate/query path with consistent validation and status transitions
- Cache invalidation and deferred count-update mechanics tied to comment writes
- Threaded retrieval strategies that avoid N+1 queries
- Moderation-preview and commenter-identity behavior treated as explicit product policy, not ad hoc controller code

### 18.3 What Tovu can simplify

- Tovu does not need WordPress's magic property delegation or every historical status alias
- If product scope does not require guest identity recall, those cookies can be optional rather than foundational
- Walker/rendering compatibility can be much thinner if Tovu owns the UI layer end to end

### 18.4 Possible Tovu seams

- `src/features/comments/` for comment lifecycle, moderation, and query behavior
- `src/core/ports/CommentRepositoryPort.ts` for persistence and cache invalidation hooks
- `src/core/ports/ModerationPolicyPort.ts` for approval, flood, spam, and preview rules
- `src/core/ports/CommentNotificationPort.ts` for event-driven follow-up work

### 18.5 Suggested priority

- `V1`: comment create/moderate/query flows, threading, status transitions, cache/count correctness
- `Later`: guest identity recall cookies, pending-comment preview tokens, and deeper rendering compatibility
