# Comments Admin — WordPress to TypeScript Rewrite Spec

**Source files analyzed:**
- `wp-admin/edit-comments.php`
- `wp-admin/comment.php`
- `wp-admin/includes/class-wp-comments-list-table.php`

---

## Section 1: Overview

The comments administration system has three layers:

1. **Comments list screen** (`edit-comments.php`) — a paginated, filterable list of all comments. The primary surface for bulk moderation (approve, unapprove, spam, trash, delete).
2. **Single-comment moderation confirmation screen** (`comment.php` with `action=approve|trash|spam|delete`) — a confirmation page for single-item status changes reached from outside the main list (e.g. from an email notification link).
3. **Full edit screen** (`comment.php` with `action=editcomment`) — a full form for editing every field of a single comment (author name, email, URL, content, status, date/time).

Comment statuses map to the `comment_approved` database column:

| Status name | `comment_approved` value |
|---|---|
| Approved | `'1'` |
| Pending (held for moderation) | `'0'` |
| Spam | `'spam'` |
| Trash | `'trash'` |

---

## Section 2: Routes

### 2.1 `GET /wp-admin/edit-comments.php`

Displays the comment list with the current filter and status applied.

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `comment_status` | `'all'\|'mine'\|'moderated'\|'approved'\|'spam'\|'trash'` | Which status tab is active. Default `'all'`. |
| `comment_type` | `string` | Filter by comment type: `'comment'`, `'pings'`, or any registered type. Empty string = all types. |
| `s` | `string` | Search term. Searched against author name, email, URL, IP, and comment text. |
| `p` | `number` | Post ID — restrict list to comments on this post. |
| `user_id` | `number` | Filter to comments by a specific user (used internally by the "Mine" view). |
| `orderby` | `'comment_author'\|'comment_post_ID'\|'comment_date'` | Sort column. |
| `order` | `'ASC'\|'DESC'` | Sort direction. |
| `paged` | `number` | Page number. |
| `mode` | `'list'\|'excerpt'` | View density mode. Saved to user setting `posts_list_mode`. |
| `post_type` | `string` | Filter to comments on posts of this type. |
| `pagegen_timestamp` | `string` | MySQL datetime UTC; used as the upper bound for `delete_all` to avoid deleting comments added after the page was generated. |
| `error` | `1\|2` | Error code: 1=Invalid comment ID, 2=Not allowed to edit comments on this post. |
| `approved` | `number` | Flash message: N comments approved. |
| `unapproved` | `number` | Flash message: N comments unapproved. |
| `spammed` | `number` | Flash message: N comments marked as spam (with Undo link). |
| `unspammed` | `number` | Flash message: N comments restored from spam. |
| `trashed` | `number` | Flash message: N comments moved to trash (with Undo link). |
| `untrashed` | `number` | Flash message: N comments restored from trash. |
| `deleted` | `number` | Flash message: N comments permanently deleted. |
| `ids` | `string` | Comma-separated comment IDs used by undo links for spam and trash actions. |
| `same` | `number` | Comment ID for "already in this status" notice. The system checks `comment_approved` and shows an appropriate message with an edit link. |

**Hidden form fields emitted in the HTML form:**

```html
<input type="hidden" name="comment_status" value="...">
<input type="hidden" name="pagegen_timestamp" value="..."> <!-- current UTC datetime -->
<input type="hidden" name="_total" value="...">
<input type="hidden" name="_per_page" value="...">
<input type="hidden" name="_page" value="...">
<input type="hidden" name="paged" value="...">
<input type="hidden" name="p" value="..."> <!-- only if filtering by post_id -->
```

**Title logic:**
- If filtering by a specific post (`$post_id > 0`) and there are pending comments: `"Comments (N) on "Post Title""`.
- If filtering by a specific post and no pending: `"Comments on "Post Title""`.
- If global view and pending comments exist: `"Comments (N)"`.
- Otherwise: `"Comments"`.

### 2.2 `POST /wp-admin/edit-comments.php` — Bulk Actions

Nonce: `bulk-comments`.

**Input resolution (in priority order):**

1. If `doaction === 'delete_all'` and `pagegen_timestamp` is set: SELECT all comment IDs where `comment_approved = {comment_status}` AND `comment_date_gmt < {pagegen_timestamp}`. Then set `doaction = 'delete'`.
2. If `$_REQUEST['delete_comments']` is set: use that array. Set `doaction = $_REQUEST['action']`.
3. If `$_REQUEST['ids']` is set: split by comma, cast to `absint`.
4. If none of the above, and a referer exists, redirect to referer.

**Per-comment permission check:** Each comment ID is checked with `current_user_can('edit_comment', $comment_id)`. If the user cannot edit a specific comment, that comment is silently skipped.

**Actions and their effects:**

| `doaction` | DB change | Counter incremented |
|---|---|---|
| `approve` | `wp_set_comment_status($id, 'approve')` — sets `comment_approved = '1'` | `$approved` |
| `unapprove` | `wp_set_comment_status($id, 'hold')` — sets `comment_approved = '0'` | `$unapproved` |
| `spam` | `wp_spam_comment($id)` — sets `comment_approved = 'spam'` | `$spammed` |
| `unspam` | `wp_unspam_comment($id)` — restores prior status from `_wp_trash_meta_status` | `$unspammed` |
| `trash` | `wp_trash_comment($id)` — sets `comment_approved = 'trash'` | `$trashed` |
| `untrash` | `wp_untrash_comment($id)` — restores prior status from `_wp_trash_meta_status` | `$untrashed` |
| `delete` | `wp_delete_comment($id)` — permanent deletion | `$deleted` |
| Custom | Fires `handle_bulk_actions-{screen_id}` filter | — |

**Comment counting deferral:** `wp_defer_comment_counting(true)` is called before the loop and `wp_defer_comment_counting(false)` after. This batches the re-count of comment counts on posts into a single operation instead of recounting after each individual update. In a TypeScript implementation, batch comment count recalculation as a single database operation at the end of a bulk action, not per-comment.

**Redirect after bulk action:**
- Start with the referer URL, strip: `trashed`, `untrashed`, `deleted`, `spammed`, `unspammed`, `approved`, `unapproved`, `ids`.
- Add `paged` = current page number.
- Append non-zero counters as query parameters.
- If `trashed > 0` or `spammed > 0`: also append `ids` = comma-separated comment IDs (for the Undo link).

**Undo links (spam and trash):**
- For `spammed`: undo URL is `edit-comments.php?doaction=undo&action=unspam&ids={ids}` with nonce `bulk-comments`.
- For `trashed`: undo URL is `edit-comments.php?doaction=undo&action=untrash&ids={ids}` with nonce `bulk-comments`.

### 2.3 `GET /wp-admin/comment.php?action=editcomment&c={id}`

Displays the full edit form for a single comment.

**Authorization checks (in order):**
1. Comment must exist; if not, show error "Invalid comment ID."
2. Current user must have `edit_comment` cap for this comment ID; if not, show error "Sorry, you are not allowed to edit this comment."
3. Comment must not be in `trash` status; if it is, show "This comment is in the Trash."
4. If the comment's parent post has `post_status = 'trash'`, `wp_die()` with "You cannot edit this comment because the associated post is in the Trash."

**Action aliases:**
- `cdc` → treated as `delete`.
- `mac` → treated as `approve`.
- `?dt=spam` → treated as `spam` action.
- `?dt=trash` → treated as `trash` action.

Renders `wp-admin/edit-form-comment.php`.

### 2.4 `GET /wp-admin/comment.php?action=approve|trash|spam|delete&c={id}`

Displays a **moderation confirmation** page. Shows a summary of the comment (author, email, URL, post it was made on, submitted date, content text) and a single action button.

**Authorization:**
- Comment must exist; if not, redirect to `edit-comments.php?error=1`.
- User must have `edit_comment` on this comment; if not, redirect to `edit-comments.php?error=2`.

**Idempotency check:** If the comment's current `comment_approved` value already matches the requested action (e.g., requesting `approve` when `comment_approved = '1'`), redirect immediately to `edit-comments.php?same={comment_id}` without showing the form.

**Status mapping for idempotency:**
- `'1'` is equivalent to `'approve'` (the string `'1'` is replaced with `'approve'` for comparison).

**Current status notice:** If the comment is not currently pending (`comment_approved !== '0'`), a notice is shown indicating its current state ("This comment is currently approved.", "This comment is currently marked as spam.", "This comment is currently in the Trash.").

**Form rendered:**
```
POST /wp-admin/comment.php
  action = {formaction}   (e.g. 'approvecomment', 'spamcomment', 'deletecomment', 'trashcomment')
  c = {comment_id}
  noredir = 1
  _wpnonce = {nonce}
```

Nonce for approve/unapprove: `approve-comment_{comment_id}`
Nonce for delete/spam/trash: `delete-comment_{comment_id}`

### 2.5 `POST /wp-admin/comment.php` — Commit Single-Comment Actions

Actions handled: `deletecomment`, `trashcomment`, `untrashcomment`, `spamcomment`, `unspamcomment`, `approvecomment`, `unapprovecomment`.

**Nonce validation:**
- `approvecomment` / `unapprovecomment`: nonce `approve-comment_{comment_id}`.
- All others: nonce `delete-comment_{comment_id}`.

**Authorization:** `edit_comment` cap on the comment ID. If not authorized, `comment_footer_die()`.

**Redirect logic:**
- Determine redirect target in priority order:
  1. The HTTP referer (if it exists, does not contain `comment.php`, and `noredir` is not set).
  2. The original referer from `wp_get_original_referer()` (if it exists and `noredir` is not set).
  3. For approve/unapprove: `edit-comments.php?p={comment_post_ID}`.
  4. Default: `edit-comments.php`.
- Strip from the redirect URL: `spammed`, `unspammed`, `trashed`, `untrashed`, `deleted`, `ids`, `approved`, `unapproved`.
- Append action-specific counter to redirect URL.

| Action | Appended parameter |
|---|---|
| `deletecomment` | `deleted=1` |
| `trashcomment` | `trashed=1&ids={comment_id}` |
| `untrashcomment` | `untrashed=1` |
| `spamcomment` | `spammed=1&ids={comment_id}` |
| `unspamcomment` | `unspammed=1` |
| `approvecomment` | `approved=1` |
| `unapprovecomment` | `unapproved=1` |

### 2.6 `POST /wp-admin/comment.php?action=editedcomment` — Save Full Edit

**Input fields:**
- `comment_ID` (integer, from POST)
- `comment_post_ID` (integer, from POST)
- `referredby` (URL, from POST — where to redirect after save)

**Nonce:** `update-comment_{comment_ID}`

**Processing:**
1. Validate nonce.
2. Call `edit_comment()` — a WordPress core function that reads from `$_POST` and calls `wp_update_comment()`.
3. On `WP_Error`, call `wp_die()` with the error message.
4. On success, redirect to `{referredby}#comment-{comment_id}`, or `edit-comments.php?p={comment_post_id}#comment-{comment_id}` if `referredby` is empty.
5. The redirect target is passed through the `comment_edit_redirect` filter.

---

## Section 3: Authorization

### 3.1 Page-level access

`edit-comments.php` requires the `edit_posts` capability. Users who cannot `edit_posts` receive an HTTP 403 error.

Note: `edit_posts` is the threshold, not `moderate_comments`. A subscriber who can edit posts can see the comments list. However, the bulk action dropdown is only shown when `current_user_can('moderate_comments')` returns true.

### 3.2 Per-comment capabilities

| Operation | Required capability |
|---|---|
| View comment in list | `edit_post` on the parent post, OR `read_post` on the parent post (when post is not password-protected) |
| Approve / unapprove / spam / trash / delete / edit | `edit_comment` on the comment ID |

`edit_comment` is a meta capability. WordPress maps it to `edit_post` on the comment's parent post — meaning the user must be able to edit the post the comment was made on. Site administrators get this for all comments.

### 3.3 AJAX capability check

The `WP_Comments_List_Table::ajax_user_can()` method checks `edit_posts`. AJAX requests (inline reply, quick edit) that arrive without this capability are rejected.

### 3.4 Row visibility

`WP_Comments_List_Table::single_row()` checks before rendering each row:
```
!current_user_can('edit_post', comment_post_ID)
  && (post_password_required(comment_post_ID) || !current_user_can('read_post', comment_post_ID))
```
If this condition is true, the row is silently skipped (returns false). In a TypeScript implementation, filter the comments list query server-side to exclude comments the current user cannot see, rather than rendering empty rows.

---

## Section 4: Comments List (`WP_Comments_List_Table`)

### 4.1 Columns

| Column key | Label | Sortable | Notes |
|---|---|---|---|
| `cb` | Checkbox | No | Only when `moderate_comments` cap is present. Input: `name="delete_comments[]"` value=comment_ID. |
| `author` | `Author` | Yes — `comment_author` | Shows name (bold), URL (truncated to 50 chars, noreferrer), email (as mailto link), IP address (as search link). Only shows email/IP if user can `edit_comment`. |
| `comment` | `Comment` | No (primary column) | Shows author info block, "In reply to {parent}" if threaded, comment text, and a hidden `#inline-{id}` div for quick edit data. |
| `response` | `In response to` | Yes — `comment_post_ID` | Hidden when filtering by a specific post (`$post_id > 0`). Shows post title, view link, approved-comment count bubble, pending-comment count bubble (red if >0). |
| `date` | `Submitted on` | Yes — `comment_date` | Date linked to the live comment anchor if comment is approved. |

### 4.2 Sortable columns

```typescript
const sortableColumns = {
  author:   { orderby: 'comment_author', defaultDesc: false },
  response: { orderby: 'comment_post_ID', defaultDesc: false },
  date:     { orderby: 'comment_date' },
};
```

### 4.3 Default ordering

The default ordering is by `comment_date DESC`. There is no visible column header for this default — the table renders a screen-reader-only `<caption>` saying "Ordered by Comment Date, descending." When any `?orderby=` parameter is set, the standard sortable column headers are used instead.

### 4.4 Density / view mode

The `mode` parameter (`'list'` or `'excerpt'`) controls row density. In `'excerpt'` mode, the row actions are always visible (no hover required) — this is controlled by the CSS class `row-actions visible` vs `row-actions` on the actions container.

The mode is saved to user setting `posts_list_mode`.

### 4.5 Filter views (status tabs)

The views bar renders tabs with counts. All counts come from `wp_count_comments()` (global) or `wp_count_comments($post_id)` (per-post).

| View key | Label | `comment_status` param | Count source |
|---|---|---|---|
| `all` | `All` | `'all'` | `$num_comments->total_comments` |
| `mine` | `Mine` | `'all'` + `user_id={current_user_id}` | Separate `get_comments(count:true, user_id:...)` call |
| `moderated` | `Pending` | `'moderated'` | `$num_comments->moderated` |
| `approved` | `Approved` | `'approved'` | `$num_comments->approved` |
| `spam` | `Spam` | `'spam'` | `$num_comments->spam` |
| `trash` | `Trash` | `'trash'` | `$num_comments->trash` (only shown if `EMPTY_TRASH_DAYS > 0`) |

Status parameter values map to query statuses:

```typescript
const statusMap: Record<string, string> = {
  mine:      '',        // no status filter; user_id filter applied instead
  moderated: 'hold',   // comment_approved = '0'
  approved:  'approve', // comment_approved = '1'
  all:       '',        // no filter
  // 'spam' and 'trash' pass through as-is
};
```

The `comment_type` filter is preserved when switching between status tabs (appended to tab URLs if non-empty and not `'all'`).

### 4.6 Comment type filter dropdown

Shown in the "top" table navigation area. Fires `restrict_manage_comments` action.

Default types offered:
- `comment` → "Comments"
- `pings` → "Pings"

Options are only rendered if `get_comments(count:true, type:$type)` returns non-zero. The `admin_comment_types_dropdown` filter can add/remove types.

Submits via a Filter button with `id="post-query-submit"`.

### 4.7 Empty Spam / Empty Trash buttons

When the current status is `spam` or `trash` AND there are items AND the user can `moderate_comments`, a destructive "Empty Spam" or "Empty Trash" button is rendered. This submits to the bulk action handler with `doaction=delete_all`. The button is protected by a separate nonce `bulk-destroy` (field `_destroy_nonce`).

### 4.8 Pagination

The per-page value is stored in a screen option with key `edit_comments_per_page`. It defaults to 20 comments per page. The `comments_per_page` filter allows overriding this per status.

**Extra items pre-fetch:** The query fetches `per_page + min(8, per_page)` items. The first `per_page` go into `$this->items`; the remaining go into `$this->extra_items`. Extra items are rendered in a hidden `<tbody id="the-extra-comment-list">` element. JavaScript uses these pre-fetched items to reduce AJAX requests when the user performs actions that remove items from the current page.

### 4.9 Row actions

Row actions appear on hover over the `comment` column (the primary column). They are only rendered when `$this->user_can` is true (i.e., `edit_comment` cap check passed for this row).

**Ordered action positions:** Approve | Unapprove | Reply | Quick Edit | Edit | Spam | Trash

**Approve / Unapprove rendering depends on current status tab:**

When viewing `all` (showing both approved and pending):
- Both `approve` and `unapprove` are rendered.
- Uses `dim:` list directive for client-side toggling without page reload.

When viewing a specific status (not `all`):
- Only the opposing action is shown (on `approved` tab, show `unapprove`; on `moderated` tab, show `approve`).
- Uses `delete:` list directive — the row is removed from the current view after the action.

**Action URL patterns:**

```
approve:    comment.php?action=approvecomment&c={id}&_wpnonce={approve_nonce}
unapprove:  comment.php?action=unapprovecomment&c={id}&_wpnonce={approve_nonce}
spam:       comment.php?action=spamcomment&c={id}&_wpnonce={del_nonce}
unspam:     comment.php?action=unspamcomment&c={id}&_wpnonce={del_nonce}
trash:      comment.php?action=trashcomment&c={id}&_wpnonce={del_nonce}
untrash:    comment.php?action=untrashcomment&c={id}&_wpnonce={del_nonce}
delete:     comment.php?action=deletecomment&c={id}&_wpnonce={del_nonce}
edit:       comment.php?action=editcomment&c={id}
```

Nonce keys:
- Approve nonce: `approve-comment_{comment_id}`
- Delete nonce: `delete-comment_{comment_id}`

**Reply and Quick Edit** are rendered as `<button>` elements (not links) and are hidden when JS is not active (`hide-if-no-js` class appended to the action class). They use `data-comment-id`, `data-post-id`, and `data-action` attributes.

**Untrash/Unspam action class decoration:** When restoring a comment from trash or spam, the system reads `_wp_trash_meta_status` meta to determine what status to restore to. If the stored status is `'1'` (approved), the `untrash`/`unspam` action link gets an additional class `approve`. Otherwise it gets `unapprove`. This affects the client-side animation color.

**Spam/Trash conditional:**
- If `spam === the_comment_status || trash === the_comment_status || !EMPTY_TRASH_DAYS`: show permanent `delete` link instead of `trash`.
- Otherwise: show `trash` link.

**Edit / Quick Edit / Reply:** These are suppressed when comment status is `spam` or `trash`.

### 4.10 Inline edit data

For comments where `user_can` is true, the `column_comment()` method outputs a hidden `<div id="inline-{comment_id}">` containing:
```html
<textarea class="comment">{comment_content}</textarea>
<div class="author-email">{email}</div>
<div class="author">{author_name}</div>
<div class="author-url">{author_url}</div>
<div class="comment_status">{comment_approved}</div>
```
This data is read by the quick-edit JS to pre-populate the inline form.

### 4.11 Author column detail

For each comment, the `author` column shows:
- **Name** (bold) — from `comment_author`
- **URL** (if present) — truncated to 50 chars; protocol and `www.` stripped for display; full URL used for the `href`; rendered with `rel="noopener noreferrer"`
- **Email** (if present AND user can `edit_comment`) — rendered as `mailto:` link, passed through `comment_email` filter
- **IP address** (if present AND user can `edit_comment`) — rendered as a search link: `edit-comments.php?s={ip}&mode=detail` (appends `comment_status=spam` if currently on the spam tab)

**Avatars:** If the site option `show_avatars` is enabled, the `floated_admin_avatar` filter is added to `comment_author` which prepends a 32×32 avatar (using the `mystery` default) before the author name.

### 4.12 Response column detail

The `response` column (hidden when filtering by post) shows:
- Post thumbnail (80×60) if the parent post type is `attachment`
- Post title as an edit-post link (if user can `edit_post`) or plain text
- "View Post" link using the post type's `labels->view_item`
- A comment count bubble showing approved comment count
- A pending count bubble (red) showing pending comment count on that post, linking to `edit-comments.php?p={post_id}&comment_status=moderated`

The pending counts are retrieved from `get_pending_comments_num()` for all post IDs in the current page, in a single batch query at `prepare_items()` time.

---

## Section 5: Comment Moderation Queue

### 5.1 Pending count badge

The admin menu "Comments" item shows a badge with the pending comment count. This count comes from `wp_count_comments()->moderated`. The badge is a `<span class="awaiting-mod count-N"><span class="pending-count">N</span></span>` element.

### 5.2 Admin menu badge rendering

The badge appears in the admin sidebar menu next to the "Comments" menu item. The count is re-fetched on each page load. If `moderated === 0`, the badge is hidden (count shown as 0, styled as invisible).

### 5.3 Page title pending count

When `moderated > 0`, the browser tab title includes the count:
- Global view: `"Comments (N) — Site Name"`
- Per-post view: `"Comments (N) on "Post Title" — Site Name"`

### 5.4 Keyboard shortcuts

The file loads `admin-comments` script and calls `enqueue_comment_hotkeys_js()`. The keyboard shortcuts are not defined in PHP — they are a client-side feature of the `admin-comments` script. The implementation uses Vim-style keys: `j` (next), `k` (previous), `a` (approve), `d` (delete/trash), `r` (reply), `q` (quick edit), `s` (spam), `t` (trash), `z` (undo last).

---

## Section 6: Inline Reply

### 6.1 Trigger

Clicking the "Reply" row action opens an inline reply form below the comment row. The button has `data-action="replyto"`, `data-comment-id`, and `data-post-id` attributes. This is JS-only (`hide-if-no-js` class).

### 6.2 Reply form markup (pre-rendered)

`wp_comment_reply('-1', true, 'detail')` is called at the bottom of `edit-comments.php`. This renders the reply form HTML into the DOM (hidden). The form is moved by JS into the appropriate position in the table when the Reply button is clicked.

The pre-rendered form container has id `replyrow` and is initially hidden with `style="display:none"`. It contains:
- A status dropdown (approve, pending, spam, trash)
- A textarea for the reply content
- A hidden `comment_parent_ID` field
- Submit ("Reply") and Cancel buttons
- A spinner element

### 6.3 AJAX handler: `wp_ajax_replyto-comment`

**HTTP method:** POST
**Nonce:** `replyto-comment` (field `_ajax_nonce`)

**Input fields:**
- `comment_post_ID` — the post the comment is on
- `content` — reply text
- `status` — comment status to set immediately (`approve`, `hold`, `spam`, `trash`)
- `comment_parent` — the parent comment ID
- `_wp_unfiltered_html_comment` — nonce for unfiltered HTML (if user has `unfiltered_html` cap)
- `mode` — `'dashboard'` or `'single'`

**Processing:**
1. Validate nonce.
2. Check `edit_post` cap on `comment_post_ID`.
3. Build comment data array: `comment_post_ID`, `comment_author`, `comment_author_email`, `comment_author_url`, `comment_content`, `comment_type='', comment_parent`, `user_id = current_user_id`.
4. If user has `unfiltered_html` and valid nonce, allow unfiltered HTML in `comment_content`.
5. Call `wp_new_comment()` to insert the comment.
6. Set the comment status using `wp_set_comment_status()`.
7. Return a JSON response containing the rendered HTML of the new comment row.

### 6.4 Response

On success, the JS inserts the returned HTML row below the parent comment and removes the reply form from the DOM. On failure, the error is displayed inline.

---

## Section 7: Quick Edit

### 7.1 Trigger

Clicking "Quick Edit" on a row opens an inline form in place of the comment text. The button has `data-action="edit"` (note: same value as the full edit, the quick-edit handler is invoked based on how JS calls the AJAX endpoint).

### 7.2 Quick edit form fields

The quick edit form is populated from the hidden `#inline-{comment_id}` div. Fields editable in quick edit:
- **Author name** (text input)
- **Author email** (text input)
- **Author URL** (text input)
- **Comment text** (textarea)

The form also includes a status button (approve/unapprove toggle based on current status).

### 7.3 AJAX handler: `wp_ajax_edit-comment`

**HTTP method:** POST
**Nonce:** `replyto-comment` (same nonce key as inline reply)

**Input fields:**
- `comment_ID`
- `comment_post_ID`
- `content`
- `newcomment_author`
- `newcomment_author_email`
- `newcomment_author_url`
- `comment_status` (approve / hold)

**Processing:**
1. Validate nonce `replyto-comment`.
2. Check `edit_comment` cap on `comment_ID`.
3. Build an update array and call `wp_update_comment()`.
4. Return JSON with the rendered HTML for the updated comment row.

### 7.4 Response

The returned HTML replaces the quick-edit form and the comment text in the row. The row's CSS class is updated to reflect the new status.

---

## Section 8: Full Edit Screen (`comment.php?action=editcomment`)

### 8.1 Form file

Renders `wp-admin/edit-form-comment.php`. The form's fields cover all comment data.

### 8.2 All editable fields

| Field | `$_POST` key | Comment DB column / note |
|---|---|---|
| Comment ID (hidden) | `comment_ID` | `comment_ID` |
| Post ID (hidden) | `comment_post_ID` | `comment_post_ID` |
| Author name | `newcomment_author` | `comment_author` |
| Author email | `newcomment_author_email` | `comment_author_email` |
| Author URL | `newcomment_author_url` | `comment_author_url` |
| Comment content | `content` | `comment_content` |
| Status | `comment_status` | `comment_approved` — dropdown: Approved (`'1'`), Pending (`'0'`), Spam (`'spam'`), Trash (`'trash'`) |
| Date | `aa`, `mm`, `jj`, `hh`, `mn`, `ss` | `comment_date` — separate year, month, day, hour, minute, second fields |
| Referredby (hidden) | `referredby` | Used for post-save redirect URL |

### 8.3 Date field components

The date is edited as six separate integer inputs:

| Input name | Meaning | Constraints |
|---|---|---|
| `aa` | Year (4 digits) | e.g. `2024` |
| `mm` | Month (2 digits, zero-padded) | `01`–`12` |
| `jj` | Day (2 digits, zero-padded) | `01`–`31` |
| `hh` | Hour (2 digits, 24h, zero-padded) | `00`–`23` |
| `mn` | Minute (2 digits, zero-padded) | `00`–`59` |
| `ss` | Second (2 digits, zero-padded) | `00`–`59` |

`edit_comment()` reassembles these into `comment_date` = `"YYYY-MM-DD HH:MM:SS"` and `comment_date_gmt` (by applying the site's UTC offset).

### 8.4 Comment status field

The status field is a `<select>` with values matching the `comment_approved` column values:
- `'0'` → "Pending"
- `'1'` → "Approved"
- `'spam'` → "Spam"
- `'trash'` → "Trash" (only shown when comment is currently in trash)

Changing status to `'trash'` or `'spam'` via this form is equivalent to using the respective row action.

### 8.5 Save flow (`action=editedcomment`)

`edit_comment()` in `wp-admin/includes/comment.php`:
1. Reads from `$_POST`.
2. Sanitizes and validates fields.
3. Calls `wp_update_comment()` to update the comment record.
4. Also calls `wp_set_comment_status()` if the status changed.
5. Returns true on success or `WP_Error`.

After save, redirect to `{referredby}#comment-{id}`, passed through `comment_edit_redirect` filter.

### 8.6 Parent comment context

If the comment being edited has a `comment_parent > 0`, the form shows a "In reply to" context line with the parent comment author's name and a link to the parent comment's live URL on the site.

---

## Section 9: Bulk Actions

### 9.1 Bulk action availability by status tab

The bulk action `<select>` contents vary by the current `comment_status`. The dropdown is only rendered at all if `current_user_can('moderate_comments')`.

| Action | Shown when status is |
|---|---|
| `unapprove` (label: "Unapprove") | `all`, `approved` |
| `approve` (label: "Approve") | `all`, `moderated` |
| `spam` (label: "Mark as spam") | `all`, `moderated`, `approved`, `trash` |
| `untrash` (label: "Restore") | `trash` only |
| `unspam` (label: "Not spam") | `spam` only |
| `delete` (label: "Delete permanently") | `trash`, `spam`, or when `EMPTY_TRASH_DAYS = 0` |
| `trash` (label: "Move to Trash") | All other cases (i.e., when not trash/spam and EMPTY_TRASH_DAYS > 0) |

### 9.2 `delete_all` action

The "Empty Spam" / "Empty Trash" buttons submit as `delete_all` (not as a standard bulk checkbox action). This uses a different nonce (`bulk-destroy`) to protect it from CSRF. The `pagegen_timestamp` hidden field scopes the deletion to only comments present when the page was loaded, preventing race conditions where new comments arrive between page load and form submit.

### 9.3 Undo mechanism for spam and trash

When comments are spammed or trashed via bulk action:
- The redirect URL includes `ids={comma_separated_ids}`.
- A flash message includes an "Undo" link.
- The Undo link URL is `edit-comments.php?doaction=undo&action=unspam&ids={ids}&_wpnonce={nonce}` or `edit-comments.php?doaction=undo&action=untrash&ids={ids}&_wpnonce={nonce}`.
- Clicking Undo submits the same bulk action handler with `doaction=unspam` or `doaction=untrash` and the stored IDs.

### 9.4 Per-comment permission in bulk

The bulk handler iterates each comment ID and checks `current_user_can('edit_comment', $comment_id)`. Comments the user cannot edit are silently skipped. The counter only increments for successfully processed comments. This means the redirect flash message counts may be lower than the number of checkboxes the user selected.

### 9.5 Status consistency

After each status change, the comment count on the parent post must be recalculated. WordPress defers this with `wp_defer_comment_counting()` so only one recalculation occurs per request. The TypeScript implementation must replicate this: recalculate comment counts once at the end of a bulk operation, not per-comment.

---

## Section 10: Key Hooks and Filters

### 10.1 Filters

| Filter | Signature | Description |
|---|---|---|
| `comment_status_links` | `(links: Record<string,string>) => Record<string,string>` | Filter the rendered status tab links (All, Mine, Pending, etc.). |
| `comment_row_actions` | `(actions: Record<string,string>, comment: WP_Comment) => Record<string,string>` | Add, remove, or modify per-row action links. Return an object; falsy values are filtered out. |
| `comments_per_page` | `(perPage: number, status: string) => number` | Override per-page count per status. |
| `comments_list_table_query_args` | `(args: GetCommentsArgs) => GetCommentsArgs` | Filter the query arguments before fetching the comments list. |
| `admin_comment_types_dropdown` | `(types: Record<string,string>) => Record<string,string>` | Add/remove comment types from the filter dropdown. Default: `{comment: 'Comments', pings: 'Pings'}`. |
| `comment_edit_redirect` | `(location: string, commentId: number) => string` | Filter the redirect URL after editing a comment. |
| `comment_edit_pre` | `(content: string) => string` | Filter comment content before it is rendered in the quick-edit textarea. |
| `comment_email` | `(email: string, comment: WP_Comment) => string` | Filter comment author email before display in the author column. |
| `manage_comments_columns` | `(columns: Record<string,string>) => Record<string,string>` | Add/remove columns from the comments list table. |
| `manage_comments_sortable_columns` | `(columns: object) => object` | Modify which columns are sortable. |
| `handle_bulk_actions-edit-comments` | `(redirect: string, action: string, ids: number[]) => string` | Handle custom bulk actions on the comments screen. |

### 10.2 Actions

| Action | When fired |
|---|---|
| `wp_ajax_replyto-comment` | Handle inline reply form submission. |
| `wp_ajax_edit-comment` | Handle quick-edit form submission. |
| `wp_ajax_dim-comment` | Toggle approve/unapprove without full reload (used by dim: list directive). |
| `wp_ajax_delete-comment` | Delete or trash a comment via AJAX row action. |
| `wp_set_comment_status` | Fires after `wp_set_comment_status()` changes a comment's approved value. Not a hook — this is the function name. The hook is `set_comment_status`. |
| `set_comment_status` | `(commentId: number, status: string)` — fires after a comment status is changed. |
| `edit_comment` | `(commentId: number, data: object)` — fires after a comment is updated via `wp_update_comment()`. |
| `trash_comment` | `(commentId: number)` — fires before a comment is trashed. |
| `untrash_comment` | `(commentId: number)` — fires before a comment is untrashed. |
| `spam_comment` | `(commentId: number)` — fires before a comment is marked spam. |
| `unspam_comment` | `(commentId: number)` — fires before a comment is unspammed. |
| `delete_comment` | `(commentId: number)` — fires before a comment is permanently deleted. |
| `restrict_manage_comments` | Fires in the table nav to add custom filter controls. |
| `manage_comments_custom_column` | `(columnName: string, commentId: string)` — fires to render custom column content. |
| `manage_comments_nav` | `(status: string, which: 'top'|'bottom')` — fires after the filter submit button. |

---

## Section 11: TypeScript Interface Sketch

```typescript
// === Core data types ===

type CommentApproved = '0' | '1' | 'spam' | 'trash';

type CommentStatus = 'approved' | 'unapproved' | 'spam' | 'trash';

interface Comment {
  commentID: number;
  commentPostID: number;
  commentAuthor: string;
  commentAuthorEmail: string;
  commentAuthorUrl: string;
  commentAuthorIP: string;
  commentDate: string;           // "YYYY-MM-DD HH:MM:SS" (local time)
  commentDateGmt: string;        // "YYYY-MM-DD HH:MM:SS" (UTC)
  commentContent: string;
  commentKarma: number;
  commentApproved: CommentApproved;
  commentAgent: string;
  commentType: string;           // 'comment', 'pingback', 'trackback', or custom
  commentParent: number;
  userId: number;                // 0 for anonymous commenters
}

interface CommentCounts {
  approved: number;
  moderated: number;             // pending (comment_approved = '0')
  spam: number;
  trash: number;
  postTrash: number;
  totalComments: number;
  allComments: number;           // approved + moderated
  mine?: number;                 // current user's comments (computed separately)
}

// === Query types ===

type CommentStatusFilter = 'all' | 'mine' | 'moderated' | 'approved' | 'spam' | 'trash';
type CommentListMode = 'list' | 'excerpt';

interface CommentListQuery {
  status: CommentStatusFilter;
  commentType?: string;
  search?: string;
  postId?: number;
  userId?: number;
  orderby?: 'comment_author' | 'comment_post_ID' | 'comment_date';
  order?: 'ASC' | 'DESC';
  postType?: string;
  offset: number;
  number: number;
}

// === Bulk action types ===

type CommentBulkAction =
  | 'approve'
  | 'unapprove'
  | 'spam'
  | 'unspam'
  | 'trash'
  | 'untrash'
  | 'delete'
  | 'delete_all';

interface CommentBulkActionRequest {
  action: CommentBulkAction;
  commentIds: number[];
  nonce: string;                 // 'bulk-comments'
  pagegenTimestamp?: string;     // required for delete_all
  commentStatus?: string;        // required for delete_all
}

interface CommentBulkActionResult {
  approved: number;
  unapproved: number;
  spammed: number;
  unspammed: number;
  trashed: number;
  untrashed: number;
  deleted: number;
  ids: number[];                 // IDs processed (for undo links)
}

// === Single-comment action types ===

type SingleCommentAction =
  | 'approvecomment'
  | 'unapprovecomment'
  | 'spamcomment'
  | 'unspamcomment'
  | 'trashcomment'
  | 'untrashcomment'
  | 'deletecomment';

interface SingleCommentActionRequest {
  action: SingleCommentAction;
  commentId: number;
  nonce: string;
  noredir?: boolean;
  referredby?: string;
}

// === Edit form types ===

interface CommentEditFields {
  commentID: number;
  commentPostID: number;
  newcommentAuthor: string;
  newcommentAuthorEmail: string;
  newcommentAuthorUrl: string;
  content: string;
  commentStatus: CommentApproved;
  // Date components
  aa: number;   // year
  mm: number;   // month
  jj: number;   // day
  hh: number;   // hour
  mn: number;   // minute
  ss: number;   // second
  referredby?: string;
}

// === Inline reply types ===

interface InlineReplyRequest {
  commentPostID: number;
  content: string;
  status: 'approve' | 'hold' | 'spam' | 'trash';
  commentParent: number;
  nonce: string;                 // 'replyto-comment'
  mode?: 'dashboard' | 'single';
}

// === Quick edit types ===

interface QuickEditRequest {
  commentID: number;
  commentPostID: number;
  content: string;
  newcommentAuthor: string;
  newcommentAuthorEmail: string;
  newcommentAuthorUrl: string;
  commentStatus: '0' | '1';     // hold or approve
  nonce: string;                 // 'replyto-comment'
}

// === List table row ===

interface CommentListRow {
  comment: Comment;
  post: {
    id: number;
    title: string;
    type: string;
    editUrl?: string;
    viewUrl: string;
  } | null;
  parentComment: {
    id: number;
    author: string;
    link: string;
  } | null;
  pendingCountOnPost: number;
  canEdit: boolean;
  avatarUrl?: string;
  rowActions: CommentRowActions;
}

interface CommentRowActions {
  approve?: string;
  unapprove?: string;
  reply?: string;
  quickedit?: string;
  edit?: string;
  spam?: string;
  unspam?: string;
  trash?: string;
  untrash?: string;
  delete?: string;
}

// === Status tab ===

interface CommentStatusTab {
  key: CommentStatusFilter;
  label: string;
  count: number;
  url: string;
  isCurrent: boolean;
}
```

---

## Section 12: Design Patterns

### 12.1 Status-aware bulk action availability

The bulk action dropdown contents change based on the current status tab. Never show "Approve" when on the `approved` tab or "Unapprove" when on the `moderated` tab — these would be no-ops. The TypeScript implementation should compute available bulk actions as a pure function of `currentStatus: CommentStatusFilter`.

### 12.2 Deferred comment count recalculation

Never recalculate post comment counts inside a per-item loop. Collect all affected post IDs during the bulk operation, then issue a single recalculation pass at the end. In WordPress this is `wp_defer_comment_counting(true/false)`. In TypeScript, this means your service layer should accept a list of comment IDs to bulk-update and compute affected post IDs once, then update those counts in a single query.

### 12.3 Trash metadata for undo

When a comment is trashed or spammed, WordPress saves the original `comment_approved` value to `_wp_trash_meta_status` post meta on the comment. When restoring, this value is read back to determine which status to restore to. In TypeScript, store a `previousStatus` field (or equivalent meta) when transitioning to `'trash'` or `'spam'`.

### 12.4 Pagegen timestamp scoping for delete_all

The `pagegen_timestamp` pattern prevents a race condition: when a user loads the "Empty Spam" page, new spam may arrive. By recording a UTC timestamp at page load and using it as an upper bound in the `delete_all` query (`comment_date_gmt < pagegen_timestamp`), only the comments present at page-load time are deleted. Implement the same pattern in TypeScript: the list query response must include a `pagegenTimestamp` field that is sent back with any `delete_all` request.

### 12.5 Extra items prefetch

`WP_Comments_List_Table` fetches `per_page + min(8, per_page)` items in one query. The first `per_page` are displayed; the remainder are placed in a hidden table body. When a row action removes an item from the visible list, the JS pulls from the hidden list to fill the gap. This reduces AJAX calls. In TypeScript, implement the same pattern: the list API response should return `perPage + buffer` items, and the buffer items should be held client-side.

### 12.6 Inline data embedding

Quick edit works without a separate AJAX prefetch because the comment data is already embedded in the page as `#inline-{id}` div contents. The JS reads this div to populate the form. In TypeScript, embed a `data-inline` JSON attribute (or a hidden companion element) on each row containing the editable fields. This avoids a round-trip to populate the quick-edit form.

### 12.7 Vim-style keyboard navigation

The comments screen enqueues keyboard shortcuts. The shortcuts operate on a "current" highlighted comment. `j`/`k` move the highlight down/up; action keys then operate on the highlighted comment via AJAX. In TypeScript, implement this as a focus/selection state in the list component, with keyboard event listeners registered only on the comments list screen.

### 12.8 `noredir` parameter for confirmation pages

Single-comment confirmation pages (approve/trash/spam/delete confirmations) post with `noredir=1`. This tells the handler to fall back to the generic `edit-comments.php` redirect rather than going back to whatever page initiated the action. This prevents loops where confirmation → action → confirmation. Implement this as an explicit boolean in the action request payload.

### 12.9 Comment type filtering

The `type__not_in: ['note']` argument is hardcoded in the list query. This hides internal system comments (used by some plugins) from the admin list. In TypeScript, add a `typeNotIn` filter to the comment query interface and apply it by default in the admin list query builder.

### 12.10 Per-status nonce keys

Approve/unapprove use a different nonce key (`approve-comment_{id}`) than delete/trash/spam (`delete-comment_{id}`). This is intentional — approve is a lower-privilege action and using a separate nonce means a stolen approve nonce cannot be used for destructive actions. Maintain this separation in the TypeScript implementation: use separate nonce generation and validation for status-promotion vs. status-demotion/deletion operations.

## 13. Tovu Reconstruction Notes

### 13.1 Why this exists

This screen exists to let operators moderate high-volume user feedback quickly and safely. It combines filtering, row-level actions, bulk transitions, inline editing, and status counts so comment handling stays fast under load.

### 13.2 What Tovu should preserve

- Per-comment authorization before destructive or state-changing actions
- Bulk moderation flows that keep list counts and post counts consistent
- Fast review paths for approve, unapprove, spam, trash, and restore
- A stable moderation queue that can support inline edit and row actions without a full page rebuild

### 13.3 What Tovu can simplify

- Tovu does not need legacy keyboard shortcuts or the exact WordPress list-table markup
- Quick-edit can be a dedicated drawer or modal instead of inline DOM injection
- Count recalculation and hidden buffer rows can be handled in a cleaner service layer

### 13.4 Possible Tovu seams

- `src/features/comments/moderation/` for the list, filters, and row actions
- `src/core/ports/CommentModerationPort.ts` for approve/trash/spam/restore workflows
- `src/core/ports/CommentQueryPort.ts` for status-aware filtering and pagination
- `src/core/ports/CommentCountPort.ts` for deferred count updates

### 13.5 Suggested priority

- `V1`: comment list, status filters, and bulk moderation
- `Later`: inline edit parity, keyboard shortcuts, and extra pagination optimizations
