# WordPress Post Editor — TypeScript Rewrite Spec

**Source files analyzed:**
- `wp-admin/post.php`
- `wp-admin/post-new.php`
- `wp-admin/edit.php`
- `wp-admin/includes/post.php`
- `wp-admin/includes/meta-boxes.php`

---

## Section 1: Overview

The WordPress post editor has two implementations that coexist and serve the same data model:

### 1.1 Block Editor (Gutenberg)

The block editor is the default editor for all post types where `use_block_editor_for_post()` returns true. It is a React/Redux single-page application served from `edit-form-blocks.php`. It communicates with the server exclusively via the REST API (`/wp-json/wp/v2/`). The admin PHP page acts as a boot loader — it sets up the page, enqueues assets, and outputs a JSON configuration object that bootstraps the React app.

### 1.2 Classic Editor

The classic editor is a PHP-rendered form with server-side metaboxes. It is served from `edit-form-advanced.php`. Data is submitted via a standard HTML form POST. It supports TinyMCE as the `post_content` editor. It is used when `use_block_editor_for_post()` returns false, or when the `replace_editor` filter returns true (third-party replacement), or when the post type explicitly disables the block editor.

### 1.3 Two entry points

| Entry point | Purpose |
|---|---|
| `post-new.php` | Create a new post of a given type |
| `post.php` | Edit an existing post OR handle POST actions |

Both entry points check capabilities, determine which editor to use, and include the appropriate form template.

---

## Section 2: Routes

### 2.1 post-new.php

Always a GET request for the initial page load.

**Query parameters:**

| Parameter | Description |
|---|---|
| `post_type` | Optional. Post type slug. Defaults to `'post'` if absent. Must exist in `get_post_types(['show_ui' => true])` or the request dies with "Invalid post type." |

**Flow:**
1. Resolve `$post_type` from query param (default `'post'`).
2. If `post_type=attachment`, redirect to `media-new.php`.
3. Check capabilities: `edit_posts` AND `create_posts` for the post type — die 403 if missing.
4. Create an auto-draft: `get_default_post_to_edit($post_type, true)` — inserts a row with `post_status='auto-draft'` and title "Auto Draft" into the database. Returns the WP_Post object.
5. Apply `replace_editor` filter — if true, skip editor loading.
6. Call `use_block_editor_for_post($post)` — if true, include `edit-form-blocks.php`; otherwise enqueue autosave script and include `edit-form-advanced.php`.

### 2.2 post.php (action dispatch)

`post.php` is both a GET page (action=edit) and a POST handler. The action is determined by:
```
$action = sanitize_text_field($_REQUEST['action'] ?? '')
```

Special case overrides before the switch:
- If `$_POST['deletepost']` is set: `$action = 'delete'`
- If `$_POST['wp-preview'] === 'dopreview'`: `$action = 'preview'`

**Mismatch guards** (immediately before the switch):
- If `GET post != POST post_ID`: die 400 "A post ID mismatch has been detected."
- If `POST post_type != $post->post_type`: die 400 "A post type mismatch has been detected."

#### action = 'edit' (GET)

Renders the editor for an existing post.

Pre-flight checks:
1. `$post_id` must be non-zero — else redirect to `post.php`.
2. Post must exist (`get_post($post_id)`) — else die 404.
3. Post type must be valid and have `show_ui => true` — else die 403.
4. Current user must have `edit_post` cap for this specific post — else die 403.
5. Post must not be in `trash` status — else die 409.

Post lock handling:
- If `GET get-post-lock` is set: verify nonce `lock-post_{post_id}`, call `wp_set_post_lock($post_id)`, redirect to edit URL.
- Otherwise, if `!wp_check_post_lock($post->ID)`: call `wp_set_post_lock($post->ID)`. Enqueue `autosave` script (unless attachment).

Editor selection:
- If `replace_editor` filter returns true: break without loading editor.
- If `use_block_editor_for_post($post)`: include `edit-form-blocks.php`.
- Otherwise: include `edit-form-advanced.php`.

If post type supports `comments`: enqueue `admin-comments` and call `enqueue_comment_hotkeys_js()`.

#### action = 'post' / 'postajaxpost' (POST — new post)

- Verify nonce: `add-{post_type}`.
- `'postajaxpost'`: calls `edit_post()` (updates existing).
- `'post'`: calls `write_post()` (creates new).
- Redirects via `redirect_post($post_id)`.

#### action = 'editpost' (POST — update existing post)

1. Verify nonce: `update-post_{post_id}`.
2. Call `edit_post()` — see Section 5 for full `edit_post()` behavior.
3. Set a session cookie `wp-saving-post` if the `wp-saving-post` cookie contains `{post_id}-check` — sets it to `{post_id}-saved` with a 24-hour expiry.
4. Redirect via `redirect_post($post_id)`.

#### action = 'editattachment' (POST — update media)

1. Verify nonce: `update-post_{post_id}`.
2. Prevent `guid` field changes; force `post_type=attachment`.
3. Update `_wp_attachment_thumb` meta with `$_POST['thumb']` basename.
4. Falls through to `editpost` to call `edit_post()`.

#### action = 'trash' (GET or POST)

1. Verify nonce: `trash-post_{post_id}`.
2. Check `delete_post` cap.
3. Check if post is locked by another user: die 409 with the editor's name if locked.
4. Call `wp_trash_post($post_id)` — die 500 on failure.
5. Redirect to `$sendback` with `?trashed=1&ids={post_id}`.

#### action = 'untrash' (GET)

1. Verify nonce: `untrash-post_{post_id}`.
2. Check `delete_post` cap.
3. Call `wp_untrash_post($post_id)` — die 500 on failure.
4. Redirect to `$sendback` with `?untrashed=1&ids={post_id}`.

#### action = 'delete' (POST)

1. Verify nonce: `delete-post_{post_id}`.
2. Check `delete_post` cap.
3. For attachments: `wp_delete_attachment($post_id, !MEDIA_TRASH)`.
4. For all others: `wp_delete_post($post_id, true)` (force-delete, bypass trash).
5. Redirect to `$sendback` with `?deleted=1`.

#### action = 'preview' (POST)

1. Verify nonce: `update-post_{post_id}`.
2. Call `post_preview()` — saves a preview revision and returns the preview URL.
3. Redirect to the preview URL.

#### action = 'post-quickdraft-save' (POST)

Quick Draft dashboard widget form submission:
1. Verify nonce: `add-post`.
2. Check `create_posts` cap — exit if not met.
3. Get the post from `$_REQUEST['post_ID']`.
4. Verify secondary nonce: `add-{post_type}`.
5. Set default comment/ping status.
6. Wrap content in `<!-- wp:paragraph -->` block if not already wrapped.
7. Call `edit_post()`.
8. Re-render `wp_dashboard_quick_press()` and exit (returns partial HTML for AJAX replacement).

#### action = 'toggle-custom-fields' (POST)

1. Verify nonce: `toggle-custom-fields`.
2. Toggle user meta `enable_custom_fields` for current user (boolean flip).
3. Redirect back to referer.

#### Default action (unknown)

Fires `do_action("post_action_{$action}", $post_id)` for custom action handlers, then redirects to `edit.php`.

### 2.3 Sendback URL

`$sendback` is computed at the start of `post.php`:
1. Use `wp_get_referer()` if the referer does not contain `post.php` or `post-new.php`.
2. Otherwise default to `edit.php` (or `upload.php` for attachments).
3. Strip `trashed`, `untrashed`, `deleted`, `ids` from referer before use.

---

## Section 3: Authorization

### 3.1 post-new.php capability checks

```
current_user_can($post_type_object->cap->edit_posts)   // Can edit this post type
AND
current_user_can($post_type_object->cap->create_posts)  // Can create new posts of this type
```
Both must pass. Fails: die 403.

### 3.2 post.php edit action

```
current_user_can('edit_post', $post_id)  // Per-post capability check
```
Plus: the post type must be in `get_post_types(['show_ui' => true])`.

### 3.3 edit.php list screen

```
current_user_can($post_type_object->cap->edit_posts)  // Access the list at all
```

Per-row delete/trash: `current_user_can('delete_post', $post_id)`.

### 3.4 _wp_translate_postdata() authorization

This function is called during every form submission. It enforces:

| Condition | Error |
|---|---|
| Update with no `edit_post` cap for `$post_data['ID']` | `edit_others_pages` / `edit_others_posts` |
| Create with no `create_posts` cap | `edit_others_pages` / `edit_others_posts` |
| Setting a different `post_author` without `edit_others_posts` cap | `edit_others_pages` / `edit_others_posts` |
| Setting `post_status='private'` without `publish_posts` cap | Status downgraded to previous status or `pending` |
| Setting `post_status='publish'` or `'future'` without `publish_posts` cap | Status downgraded to `pending` |
| Setting `post_password` without `publish_posts` cap | Password field is unset |
| Assigning categories without `assign_terms` cap | Category field is unset |

### 3.5 Status elevation rules

- `auto-draft` → always treated as `draft` when submitted.
- A user without `publish_posts` who submits with status `publish` or `future` gets `pending`.
- A user who already has a published post and has `edit_post` cap: can re-save as published.

---

## Section 4: The Edit List (edit.php)

### 4.1 Overview

`edit.php` renders a filterable, paginatable table of posts using `WP_Posts_List_Table`. The `$typenow` global (set by `admin.php` from `GET post_type`) determines which post type is being listed.

### 4.2 Query parameters (GET)

| Parameter | Type | Description |
|---|---|---|
| `post_type` | string | Post type slug. Set via `$typenow`. Default behavior shows `post`. |
| `post_status` | string | Filter by status: `publish`, `draft`, `pending`, `private`, `trash`, `any`, etc. |
| `author` | int | Filter by author user ID. |
| `s` | string | Search query. |
| `m` | string | Filter by year-month (YYYYMM format). |
| `cat` | int | Filter by category term ID. |
| `tag` | string | Filter by tag slug. |
| `orderby` | string | Sort field. |
| `order` | `ASC`\|`DESC` | Sort direction. |
| `paged` | int | Page number. |
| `show_sticky` | `0`\|`1` | Show only sticky posts. |
| `_wp_http_referer` | string | Cleaned up after use — triggers a redirect to strip it from the URL. |

### 4.3 Screen options

`add_screen_option('per_page', ['default' => 20, 'option' => "edit_{$post_type}_per_page"])` — stored per user per post type.

### 4.4 Bulk actions

Bulk actions are processed before the page renders. Nonce: `bulk-posts`.

Post IDs are gathered from:
1. `$_REQUEST['media']` (media library)
2. `$_REQUEST['ids']` (comma-separated string)
3. `$_REQUEST['post']` (array of IDs from checkboxes)

#### Bulk action: trash

For each post ID:
- Check `delete_post` cap — die if not met.
- Check `wp_check_post_lock()` — if locked, increment `$locked` counter and skip.
- Call `wp_trash_post($post_id)`.

Redirects with `?trashed={count}&ids={csv}&locked={count}`.

#### Bulk action: untrash

For each post ID:
- Check `delete_post` cap — die if not met.
- If `GET doaction === 'undo'`: apply `wp_untrash_post_set_previous_status` filter to restore the pre-trash status.
- Call `wp_untrash_post($post_id)`.

Redirects with `?untrashed={count}`.

#### Bulk action: delete (permanent)

For each post ID:
- Check `delete_post` cap — die if not met.
- Attachments: `wp_delete_attachment($post_id)`.
- Others: `wp_delete_post($post_id)`.

Redirects with `?deleted={count}`.

#### Bulk action: delete_all

Special action that targets a specific `post_status` (e.g., "Empty Trash"). Queries all post IDs matching `post_type` + `post_status` directly via SQL, then falls through to `delete`.

#### Bulk action: edit (bulk edit)

Calls `bulk_edit_posts($_REQUEST)`. See bulk edit logic below.

#### Custom bulk actions

Unknown action values fire `handle_bulk_actions-{screen_id}` filter, passing `$sendback`, `$doaction`, and `$post_ids`. The filter is expected to return a modified redirect URL.

### 4.5 Bulk edit (`bulk_edit_posts()`)

Processes the Bulk Edit form submission. Fields that are empty or `'-1'` are ignored (meaning "no change"). The `_status` field is mapped to `post_status`; value `-1` means "no change".

For each selected post:
- Skip if `edit_post` cap is missing.
- Skip if `wp_check_post_lock()` returns a user ID (post is locked).
- Merge new taxonomy terms into existing terms (adds without removing for bulk).
- For categories: handles "indeterminate" checkboxes (partially checked in bulk edit UI) — keeps existing cats from the indeterminate set, applies newly checked cats.
- Call `_wp_translate_postdata(true, $post_data)` for authorization.
- Call `wp_update_post()`.
- Handle `sticky` flag if user has `edit_others_posts` cap.

Returns `['updated' => int[], 'skipped' => int[], 'locked' => int[]]`.

### 4.6 Quick Edit fields

Quick Edit is an inline form that appears when the "Quick Edit" row action is clicked. It submits via AJAX. Fields available depend on post type and capabilities:

**All post types:**
- Title (`post_title`)
- Slug (`post_name`)
- Date (`aa`, `mm`, `jj`, `hh`, `mn`)
- Author (`post_author`) — only if `edit_others_posts` cap
- Password (`post_password`) — only if `publish_posts` cap
- Status (`post_status`)
- Comment status checkbox (`comment_status`)
- Ping status checkbox (`ping_status`)

**For `post` type additionally:**
- Categories (`post_category`)
- Tags (`tax_input[post_tag]`)
- Format (`post_format`) — if theme supports post formats
- Sticky checkbox — only if `edit_others_posts` cap

**For pages additionally:**
- Parent page (`post_parent`)
- Template (`page_template`)
- Order (`menu_order`)

### 4.7 Row actions

Each row shows action links on hover:

| Action | Condition |
|---|---|
| Edit | Always (if `edit_post` cap) |
| Quick Edit | Always (if `edit_post` cap), JS-only |
| Trash | If `delete_post` cap and status is not `trash` |
| Restore | If `delete_post` cap and status is `trash` |
| Delete Permanently | If `delete_post` cap and status is `trash` |
| Preview | If not published and post type is viewable |
| View | If published and post type is viewable |

### 4.8 Bulk action result messages

After bulk actions, `$sendback` contains query params (`updated`, `locked`, `deleted`, `trashed`, `untrashed`) which are read on the next page load to display notice messages. These are filterable via `bulk_post_updated_messages`.

Built-in message sets: `post`, `page`, `wp_block`. Custom post types fall back to the `post` set.

Special cases:
- `trashed`: adds an "Undo" link if `ids` query param is present.
- `untrashed` of a single post: adds an "Edit" link if user has `edit_post` cap.

---

## Section 5: Block Editor Initialization

### 5.1 Entry point

When `use_block_editor_for_post($post)` returns true, `edit-form-blocks.php` is included. This file:
1. Collects the full editor settings object (a PHP array).
2. Calls `wp_enqueue_editor()` to register all block editor assets.
3. Outputs the `<div id="editor">` container where React mounts.
4. Outputs a `<script>` tag that passes the settings object to JavaScript as `window._wpUseBlockEditor`.

### 5.2 `wp_enqueue_editor()` behavior

Loads all packages needed by Gutenberg:
- Core packages: `wp-editor`, `wp-blocks`, `wp-components`, `wp-data`, `wp-element`, `wp-i18n`, etc.
- Third-party: `react`, `react-dom`, `lodash`, `moment`.
- Inline script data containing `window.wpApiSettings` (REST API nonce and root URL).

### 5.3 Block editor settings object

The settings object passed to the block editor contains:

```typescript
interface BlockEditorSettings {
  // Post identification
  postId: number;
  postType: string;

  // Initial content
  initialEdits: {
    content?: string;
    title?: string;
    excerpt?: string;
  } | null;

  // Editor feature flags
  settings: {
    alignWide: boolean;
    allowedBlockTypes: boolean | string[];  // true = all
    allowedMimeTypes: Record<string, string>;
    autosaveInterval: number;              // seconds; default 10
    availableTemplates: Record<string, string>;
    bodyPlaceholder: string;
    canLockBlocks: boolean;
    capabilities: {
      publishPosts: boolean;
      editPosts: boolean;
      editOthersPosts: boolean;
      deletePosts: boolean;
      deleteOthersPosts: boolean;
      readPrivatePosts: boolean;
      createPages: boolean;
      publishPages: boolean;
      editPages: boolean;
      editOthersPages: boolean;
      deletePages: boolean;
      deleteOthersPages: boolean;
      readPrivatePages: boolean;
      manageCategories: boolean;
      moderateComments: boolean;
      manageOptions: boolean;
      unfiltered_html: boolean;
      edit_post: boolean;    // per post ID
    };
    codeEditingEnabled: boolean;
    colors: Array<{ name: string; slug: string; color: string }>;
    defaultEditorStyles: Array<{ css: string }>;
    disableCustomColors: boolean;
    disableCustomFontSizes: boolean;
    disableCustomGradients: boolean;
    enableCustomUnits: boolean;
    enableCustomLineHeight: boolean;
    fontSizes: Array<{ name: string; slug: string; size: number }>;
    gradients: Array<{ name: string; slug: string; gradient: string }>;
    imageDimensions: Record<string, { width: number; height: number; crop: boolean }>;
    imageSizes: Array<{ slug: string; name: string }>;
    isRTL: boolean;
    maxUploadFileSize: number;
    mediaUpload: boolean;
    postLock: {
      isLocked: boolean;
      user: number | null;
      nonce: string;
    };
    postLocked: boolean;
    richEditingEnabled: boolean;
    supportsLayout: boolean;
    template: Array<[string, Record<string, unknown>]> | null;  // Block template
    templateIsEditable: boolean;
    templateLock: false | 'all' | 'insert';
    titlePlaceholder: string;
    // Additional registered settings from `block_editor_settings_all` filter
    [key: string]: unknown;
  };

  // REST API
  restApiSettings: {
    url: string;     // REST root URL
    namespace: string;
    nonce: string;
    schema: null;
  };
}
```

### 5.4 REST API endpoints used by the block editor

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/wp/v2/{post_type}/{id}` | Load post data |
| PUT/PATCH | `/wp/v2/{post_type}/{id}` | Save post |
| POST | `/wp/v2/{post_type}/{id}/autosaves` | Create autosave |
| GET | `/wp/v2/{post_type}/{id}/autosaves` | Load autosaves |
| GET | `/wp/v2/{post_type}/{id}/revisions` | Load revisions |
| GET/POST | `/wp/v2/media` | Upload/list media |
| GET | `/wp/v2/types/{type}` | Post type info |
| GET | `/wp/v2/taxonomies` | Available taxonomies |
| GET | `/wp/v2/categories` | Category list |
| GET | `/wp/v2/tags` | Tag list |
| GET | `/wp/v2/users` | Author list |
| GET | `/wp/v2/settings` | Site settings |
| GET | `/wp/v2/search` | Block/pattern search |
| GET | `/wp/v2/blocks` | Reusable blocks |
| GET | `/wp/v2/block-patterns/patterns` | Block patterns |
| GET | `/wp/v2/block-patterns/categories` | Pattern categories |
| POST | `/wp/v2/block-renderer/{block}` | Server-side block rendering |

---

## Section 6: Classic Editor Metaboxes

Classic editor metaboxes are registered in `wp-admin/includes/meta-boxes.php` and `edit-form-advanced.php`. Each metabox is registered via `add_meta_box()`.

### 6.1 Registration function signature

```
add_meta_box(
  id: string,
  title: string,
  callback: (post: WP_Post, metabox: MetaboxArgs) => void,
  screen: string | WP_Screen | string[],
  context: 'normal' | 'side' | 'advanced',
  priority: 'high' | 'core' | 'default' | 'low',
  callback_args?: Record<string, unknown> | null
)
```

### 6.2 All built-in metaboxes

#### submitdiv — Publish

| Property | Value |
|---|---|
| **ID** | `submitdiv` |
| **Title** | "Publish" |
| **Callback** | `post_submit_meta_box()` |
| **Context** | `side` |
| **Priority** | `core` |
| **Supports** | All post types with `show_ui` |
| **Capability** | None (inner elements are capability-gated individually) |

See Section 7 for full details.

#### postimagediv — Featured Image

| Property | Value |
|---|---|
| **ID** | `postimagediv` |
| **Title** | Varies (post type label) |
| **Callback** | `post_thumbnail_meta_box()` |
| **Context** | `side` |
| **Priority** | `low` |
| **Supports** | `thumbnail` feature on the post type |
| **Capability** | None (upload handled by media library) |

Renders a thumbnail preview if one is set, with links to "Set featured image" / "Remove featured image". Clicking opens the media library modal (`wp.media` frame).

#### postexcerpt — Excerpt

| Property | Value |
|---|---|
| **ID** | `postexcerpt` |
| **Title** | "Excerpt" |
| **Callback** | `post_excerpt_meta_box()` |
| **Context** | `normal` |
| **Priority** | `core` |
| **Supports** | `excerpt` feature on the post type |

Renders a `<textarea name="excerpt" id="excerpt">` with the current `post_excerpt` value.

#### trackbacksdiv — Trackbacks / Send Trackbacks

| Property | Value |
|---|---|
| **ID** | `trackbacksdiv` |
| **Title** | "Send Trackbacks" |
| **Callback** | `post_trackback_meta_box()` |
| **Context** | `normal` |
| **Priority** | `core` |
| **Supports** | Only for `post` post type |

Renders a text input (`name="trackback_url"`) for space-separated URLs to ping. Shows already-pinged URLs from `$post->pinged`.

#### postcustom — Custom Fields

| Property | Value |
|---|---|
| **ID** | `postcustom` |
| **Title** | "Custom Fields" |
| **Callback** | `post_custom_meta_box()` |
| **Context** | `normal` |
| **Priority** | `core` |
| **Supports** | `custom-fields` feature on the post type |
| **Capability** | Per-field checks via `edit_post_meta` cap; protected meta keys are filtered out |

Renders two sub-components:
- `list_meta($metadata)`: table of existing meta key-value pairs with edit/delete actions.
- `meta_form($post)`: form to add a new meta key-value pair.

Protected meta keys (prefixed with `_`) and keys where the user lacks `edit_post_meta` or `delete_post_meta` are not shown.

Visibility controlled per-user by `enable_custom_fields` user meta (toggled via `action=toggle-custom-fields`).

#### commentsdiv — Comments

| Property | Value |
|---|---|
| **ID** | `commentsdiv` |
| **Title** | "Comments" |
| **Callback** | `post_comment_meta_box()` |
| **Context** | `normal` |
| **Priority** | `core` |
| **Supports** | `comments` feature on the post type |

Renders a `WP_Post_Comments_List_Table` showing comments on the current post. Shows "Add Comment" button (JS-only). Loads comments lazily via `commentsBox.get()` JS call if the metabox is visible.

#### commentstatusdiv — Discussion

| Property | Value |
|---|---|
| **ID** | `commentstatusdiv` |
| **Title** | "Discussion" |
| **Callback** | `post_comment_status_meta_box()` |
| **Context** | `normal` |
| **Priority** | `core` |
| **Supports** | `comments` or `trackbacks` feature |

Two checkboxes:
- `comment_status = 'open'` — "Allow comments"
- `ping_status = 'open'` — "Allow trackbacks and pingbacks"

#### slugdiv — Slug

| Property | Value |
|---|---|
| **ID** | `slugdiv` |
| **Title** | "Slug" |
| **Callback** | `post_slug_meta_box()` |
| **Context** | `normal` |
| **Priority** | `core` |
| **Supports** | Only shown for published posts or explicitly for all; controlled by screen option |

Renders a text input (`name="post_name"`) with the URL-decoded slug. The `editable_slug` filter allows plugins to transform the value.

#### authordiv — Author

| Property | Value |
|---|---|
| **ID** | `authordiv` |
| **Title** | "Author" |
| **Callback** | `post_author_meta_box()` |
| **Context** | `normal` |
| **Priority** | `core` |
| **Supports** | `author` feature on the post type |
| **Capability** | `edit_others_posts` (implied — the dropdown only lists users with `edit_posts` cap) |

Renders `wp_dropdown_users()` with `name="post_author_override"`, filtered to users with `edit_posts` capability for the post type. `include_selected=true` ensures the current author always appears even if they lack the capability.

#### revisionsdiv — Revisions

| Property | Value |
|---|---|
| **ID** | `revisionsdiv` |
| **Title** | "Revisions" |
| **Callback** | `post_revisions_meta_box()` |
| **Context** | `normal` |
| **Priority** | `core` |
| **Supports** | `revisions` feature on the post type, AND post must have at least one revision |

Calls `wp_list_post_revisions($post)` which renders an HTML table of revision entries. Each row shows: revision date, author, auto-save indicator, and a "Restore" link.

#### formatdiv — Post Format

| Property | Value |
|---|---|
| **ID** | `formatdiv` |
| **Title** | "Format" |
| **Callback** | `post_format_meta_box()` |
| **Context** | `side` |
| **Priority** | `core` |
| **Supports** | `post-formats` feature on the post type AND active theme declares `add_theme_support('post-formats')` |

Renders radio buttons for Standard plus each format declared by the active theme (from `get_theme_support('post-formats')[0]`). Selected value is from `get_post_format($post->ID)` (default `'0'` for Standard).

#### categorydiv — Categories

| Property | Value |
|---|---|
| **ID** | `categorydiv` |
| **Title** | "Categories" |
| **Callback** | `post_categories_meta_box()` |
| **Context** | `side` |
| **Priority** | `core` |
| **Supports** | Post type must be associated with the `category` taxonomy |
| **Capability** | `assign_terms` for the category taxonomy |

Renders two tabs: "All Categories" (full checkbox hierarchy via `wp_terms_checklist()`) and "Most Used" (top 45 by count via `wp_popular_terms_checklist()`). Has an inline "Add New Category" sub-form for users with `edit_terms` cap.

Input name: `post_category[]` (array of term IDs), plus a hidden `post_category[]=0` to send an empty set when all are unchecked.

#### tagsdiv-post_tag — Tags

| Property | Value |
|---|---|
| **ID** | `tagsdiv-post_tag` |
| **Title** | "Tags" |
| **Callback** | `post_tags_meta_box()` |
| **Context** | `side` |
| **Priority** | `core` |
| **Supports** | Post type must be associated with the `post_tag` taxonomy |
| **Capability** | `assign_terms` for the post_tag taxonomy |

Renders a token-input style field. Non-JS fallback: `<textarea name="tax_input[post_tag]">`. With JS: shows tag tokens with delete buttons, a text input with autocomplete, an "Add" button, and a "Choose from the most used tags" cloud link.

#### pageparentdiv — Page Attributes (Pages)

| Property | Value |
|---|---|
| **ID** | `pageparentdiv` |
| **Title** | "Page Attributes" |
| **Callback** | `page_attributes_meta_box()` |
| **Context** | `side` |
| **Priority** | `core` |
| **Supports** | `page-attributes` feature on the post type OR hierarchical post types |

Three optional sub-fields:
- **Parent** dropdown (`name="parent_id"`): only shown for hierarchical post types. Filtered via `page_attributes_dropdown_pages_args`.
- **Template** select (`name="page_template"`): only shown if `get_page_templates($post)` returns templates and post is not the "posts page". Default option is "Default template" (filterable via `default_page_template_title`).
- **Order** input (`name="menu_order"`): only shown if the post type supports `page-attributes`.

---

## Section 7: Publish Metabox

The Publish metabox (`submitdiv`) contains all save/publish controls. Rendered by `post_submit_meta_box()`.

### 7.1 Structure

```
<div class="submitbox" id="submitpost">
  <div id="minor-publishing">
    <div id="minor-publishing-actions">
      <!-- Save Draft / Preview buttons -->
    </div>
    <div id="misc-publishing-actions">
      <!-- Status, Visibility, Date, Revisions count -->
    </div>
  </div>
  <div id="major-publishing-actions">
    <!-- Delete/Trash link | Publish/Update/Schedule/Submit button -->
  </div>
</div>
```

### 7.2 Status display and selector

The current status is shown as a read-only label. An inline "Edit" link reveals a `<select>` for users who can publish:

| Status value | Display label |
|---|---|
| `private` | "Privately Published" |
| `publish` | "Published" |
| `future` | "Scheduled" |
| `pending` | "Pending Review" |
| `draft` / `auto-draft` | "Draft" |

The `<select name="post_status">` options depend on the current status:
- If current status is `publish`: shows "Published", "Pending Review", "Draft".
- If current status is `private`: shows "Privately Published", "Pending Review", "Draft".
- If current status is `future`: shows "Scheduled", "Pending Review", "Draft".
- Otherwise: shows "Pending Review", "Draft".

A hidden `<input name="hidden_post_status">` stores the status at page load for comparison.

### 7.3 Visibility selector

Three radio button options (only shown to users with `publish_posts` cap):

| Radio value | Label | Behavior |
|---|---|---|
| `public` | "Public" | Clears `post_password`; if `post` type and editor has `edit_others_posts`, shows sticky checkbox. |
| `password` | "Password protected" | Shows password input (max 255 chars). Unsets sticky. |
| `private` | "Private" | Forces `post_status=private`. Clears password. Unsets sticky. |

Current visibility is determined by:
- `private` status → visibility is "private"
- Non-empty `post_password` → visibility is "password"
- `is_sticky($post_id)` → visibility is "public" (labeled "Public, Sticky")
- Otherwise → "public"

Hidden fields: `hidden_post_password`, `hidden_post_sticky`, `hidden_post_visibility` (store initial values for JS change detection).

### 7.4 Date/time selector

Shown only to users with `publish_posts` cap. The timestamp label shows different text based on state:

| State | Label |
|---|---|
| `future` status | "Scheduled for: {date}" |
| `publish` or `private` status | "Published on: {date}" |
| `draft`, no date | "Publish immediately" |
| `draft`, future date | "Schedule for: {date}" |
| `draft`, past date | "Publish on: {date}" |

The "Edit" link reveals a `<fieldset id="timestampdiv">` containing `touch_time()` output:
- Five inputs: `aa` (year), `mm` (month), `jj` (day), `hh` (hour), `mn` (minute), `ss` (second, hidden).
- `hidden_aa`, `hidden_mm`, `hidden_jj`, `hidden_hh`, `hidden_mn` inputs store original values.
- When any `hidden_*` differs from its counterpart on form submission, `edit_date=1` is set.

Date validation in `_wp_translate_postdata()`:
- Constructs: `post_date = sprintf('%04d-%02d-%02d %02d:%02d:%02d', aa, mm, jj, hh, mn, ss)`
- Validates with `wp_checkdate()` — returns `WP_Error('invalid_date')` if invalid.
- If new date differs from stored `post_date`, sets `post_date_gmt` via `get_gmt_from_date()`.

### 7.5 Revisions count

If `$args['revisions_count']` is non-empty (passed from `edit-form-advanced.php`), shows "Revisions: {N}" with a "Browse" link to `get_edit_post_link($revision_id)`.

### 7.6 Minor publishing actions (top of box)

**Save Draft button** — shown when status is not `publish`, `future`, or `pending`:
- Input: `name="save"` with value "Save Draft".
- For `private` status: hidden via inline style.

**Save as Pending button** — shown only when status is `pending` AND user can publish:
- Input: `name="save"` with value "Save as Pending".

**Preview button** — shown when post type is viewable:
- Anchor linking to `get_preview_post_link($post)`, target `wp-preview-{post_id}`.
- Label: "Preview Changes" if published; "Preview" otherwise.
- Hidden input: `name="wp-preview"` value="" — JS sets to "dopreview" on click.

### 7.7 Major publishing actions (bottom of box)

**Delete/Trash link** — shown if user has `delete_post` cap:
- If `EMPTY_TRASH_DAYS === 0`: "Delete permanently" → `get_delete_post_link($post_id)`.
- Otherwise: "Move to Trash" → `get_delete_post_link($post_id)`.

**Primary action button** — depends on state:

| State | Button label | Input name |
|---|---|---|
| Not published, can publish, future date | "Schedule" | `publish` |
| Not published, can publish, no/past date | "Publish" | `publish` |
| Not published, cannot publish | "Submit for Review" | `publish` |
| Already published (`publish`/`future`/`private`) | "Update" | `save` (id=publish) |

A hidden `input[name="original_publish"]` stores the label for JavaScript tracking.

### 7.8 Hooks in the Publish box

| Hook | Location |
|---|---|
| `post_submitbox_minor_actions` | After Preview/Save Draft buttons |
| `post_submitbox_misc_actions` | After date/time section |
| `post_submitbox_start` | At start of major publishing actions div |

---

## Section 8: Autosave

### 8.1 Classic editor autosave

The classic editor JavaScript (`autosave.js`) runs a timer that fires every 60 seconds (or on the `autosave_interval` setting). On each tick it:
1. Reads the current form data.
2. POSTs to `admin-ajax.php` with `action=autosave` and all post fields.
3. On success, updates a status indicator.

The server-side autosave stores a revision post with `post_status='inherit'` and `post_type='{original_type}-revision'`, or updates an existing autosave revision.

A session cookie `wp-saving-post` containing `{post_id}-check` is set before the save is submitted. After a successful `editpost` action, the server detects this cookie and sets it to `{post_id}-saved`. The JS reads the cookie to display a "Post saved" confirmation.

### 8.2 Block editor autosave

The block editor uses `localStorage` to immediately persist drafts client-side as a fallback, and also POSTs to the REST API autosave endpoint:

```
POST /wp/v2/{post_type}/{id}/autosaves
```

Request body: `{ post_title, post_content, post_excerpt }` (fields that changed).

An autosave interval (default 10 seconds of inactivity after a change) is configured in the editor settings object via `autosaveInterval`.

If a localStorage autosave exists that is newer than the server-stored version, the editor shows a "The backup of this post in your browser is different from the version below" notice with a "Restore the backup" option.

### 8.3 Autosave revision storage

Autosaves are stored as revision posts in the `wp_posts` table:
- `post_type`: `'{parent_type}'` (e.g., `post`)
- `post_status`: `'inherit'`
- `post_parent`: the parent post's ID
- `post_name`: `'{post_id}-autosave-v1'`

Only one autosave per user per post is stored. New autosaves overwrite the previous autosave revision for that user.

Standard revisions have `post_name` in the format `'{post_id}-revision-v1'` and there can be multiple (up to the revision limit).

---

## Section 9: Post Locking

Post locking prevents two users from simultaneously editing the same post and overwriting each other's changes.

### 9.1 Lock data storage

Lock data is stored in post meta:
- **Meta key:** `_edit_lock`
- **Meta value:** `{timestamp}:{user_id}` — e.g., `"1700000000:42"`

### 9.2 `wp_check_post_lock($post_id)`

Returns `false` if the post is not locked. Returns the locking user's ID (integer) if it IS locked.

A post is considered NOT locked if:
- No `_edit_lock` meta exists.
- The lock's user ID matches the current user (you locked it yourself).
- The lock timestamp is older than 150 seconds (2.5 minutes) — the lock is considered stale.

### 9.3 `wp_set_post_lock($post_id)`

Stores a fresh lock:
```
update_post_meta($post_id, '_edit_lock', time() + ':' + current_user_id)
```
Returns the `[time, user_id]` array that was stored.

### 9.4 Lock refresh via Heartbeat API

The classic editor page enqueues the `heartbeat` script. The Heartbeat API sends periodic AJAX POSTs to `admin-ajax.php?action=heartbeat` every 60 seconds.

The request payload includes `wp_refresh_post_lock: { post_id, lock_nonce }`. The server:
1. Verifies the nonce.
2. Calls `wp_set_post_lock($post_id)` to refresh the lock timestamp.
3. Returns `{ wp_lock_isStillMine: true, lock_nonce: new_nonce }`.

If the lock belongs to a different user, the response includes the other user's display name and avatar for the "Take Over" UI.

### 9.5 Lock contention flow

If `wp_check_post_lock()` returns a user ID when the edit page is opened:
1. The "post locked" dialog is shown immediately (rather than the editor).
2. The dialog shows the locking user's name and avatar, with options:
   - "Go back" — navigates to the post list.
   - "Take Over" — navigates to `post.php?post={id}&action=edit&get-post-lock=1&_wpnonce={nonce}`.
3. Navigating with `get-post-lock=1` causes the server to call `wp_set_post_lock()` unconditionally, overwriting the previous lock.

If the current user holds the lock and the Heartbeat API response indicates that another user has taken over:
1. The "post taken over" notice appears in the editor.
2. All edits are effectively frozen — the UI may disable saving.

### 9.6 Lock nonce

A nonce `lock-post_{post_id}` is required for the `get-post-lock` takeover URL. For Heartbeat refreshes, a `_nonce` value is generated and passed in the editor settings as `postLock.nonce`.

---

## Section 10: Revisions

### 10.1 Revision creation

A revision is created on every successful call to `wp_update_post()` when the post type supports `revisions`. A revision is a copy of the post stored in the `wp_posts` table with:
- `post_type`: `'revision'`
- `post_status`: `'inherit'`
- `post_parent`: the original post ID
- `post_name`: `'{post_id}-revision-v1'` (incrementing suffix)

### 10.2 Revision limit

The number of stored revisions is controlled by:
- `WP_POST_REVISIONS` constant: `false` disables revisions entirely; `true` or `-1` stores unlimited; a positive integer limits to that count.
- Filter: `wp_revisions_to_keep($num, $post)` — overrides the limit per post.

When the limit is reached, the oldest revision is deleted before the new one is created.

### 10.3 `wp_get_post_revisions($post_id, $args)`

Returns an array of revision WP_Post objects ordered by date descending. Accepts standard `WP_Query` args:

| Arg | Default |
|---|---|
| `order` | `'DESC'` |
| `orderby` | `'date ID'` |
| `check_enabled` | `true` |

### 10.4 edit_post() revision handling

Before saving, `edit_post()` checks if revisions have been upgraded:
```php
wp_get_post_revisions($post_id, ['order' => 'ASC', 'posts_per_page' => 1])
```
If the earliest revision has a revision version < 1 (pre-4.5 format), it calls `_wp_upgrade_revisions_of_post()` to migrate the revision data.

The `_edit_last` post meta is updated with `get_current_user_id()` on every save.

### 10.5 Revisions UI

In the classic editor, the Revisions metabox (`revisionsdiv`) calls `wp_list_post_revisions($post)`. This renders an HTML table with columns: date/time, "by {author}", auto-save badge, "Restore" link.

The full Revisions comparison screen is at `wp-admin/revision.php`. It loads a side-by-side diff UI where each revision can be compared and restored.

The Publish metabox shows the revision count as "Revisions: {N}" with a "Browse" link to `get_edit_post_link($revision_id)` (where `$revision_id` is the ID of the most recent revision, passed from `edit-form-advanced.php` to `post_submit_meta_box()` via `$args['revisions_count']` and `$args['revision_id']`).

---

## Section 11: Custom Post Type Support

### 11.1 The `supports` array

When registering a custom post type via `register_post_type()`, the `supports` array determines which built-in metaboxes appear. Each value maps to a feature that `post_type_supports()` checks.

| `supports` value | Metabox(es) registered |
|---|---|
| `title` | Post title `<input>` in the form header (not a separate metabox) |
| `editor` | TinyMCE / block editor content area |
| `author` | `authordiv` |
| `thumbnail` | `postimagediv` |
| `excerpt` | `postexcerpt` |
| `trackbacks` | `trackbacksdiv` |
| `custom-fields` | `postcustom` |
| `comments` | `commentsdiv`, `commentstatusdiv` |
| `revisions` | `revisionsdiv` |
| `page-attributes` | `pageparentdiv` (Order + Template sub-fields) |
| `post-formats` | `formatdiv` |

### 11.2 `use_block_editor_for_post_type($post_type)`

Returns true if:
1. The post type supports `editor`.
2. The `use_block_editor_for_post_type` filter returns true (default: all post types with editor support).

Returns false if:
1. Post type does not support `editor`.
2. Filter explicitly returns false (e.g., for ACF-heavy post types, or when Classic Editor plugin is active).

### 11.3 Taxonomy metaboxes

When a taxonomy is registered with `show_ui=true` and is associated with a post type, a metabox is automatically registered for it. Hierarchical taxonomies (like categories) use the checkbox-tree UI; flat taxonomies (like tags) use the token-input UI.

The `meta_box_cb` property on the taxonomy object overrides the default callback. Setting it to `false` suppresses the metabox entirely.

### 11.4 `show_in_menu` behavior

For custom post types where `show_in_menu` is not `true`:
- The parent admin menu item is the value of `show_in_menu` (a slug of another menu item).
- `$parent_file` and `$submenu_file` are set accordingly to highlight the correct menu item.
- If no `post-new.php` submenu exists for the post type under that parent, falls back to `edit.php?post_type={type}` or the parent file.

---

## Section 12: Key Hooks and Filters

### Actions

| Hook | Where fired | Args | Description |
|---|---|---|---|
| `wp_dashboard_setup` | `wp_dashboard_setup()` | — | Register dashboard widgets. |
| `add_meta_boxes` | `edit-form-advanced.php` | `$post_type, $post` | Register classic editor metaboxes. |
| `add_meta_boxes_{post_type}` | `edit-form-advanced.php` | `$post` | Register metaboxes for specific post type. |
| `do_meta_boxes` | `edit-form-advanced.php` | `$post_type, $context, $post` | Fires for each context during metabox rendering. |
| `edit_form_top` | `edit-form-advanced.php` | `$post` | Before title field. |
| `edit_form_after_title` | `edit-form-advanced.php` | `$post` | After title field, before content. |
| `edit_form_after_editor` | `edit-form-advanced.php` | `$post` | After classic editor textarea. |
| `edit_form_advanced` | `edit-form-advanced.php` | `$post` | After all normal-context metaboxes. |
| `post_submitbox_minor_actions` | `meta-boxes.php` | `$post` | After save/preview buttons in Publish box. |
| `post_submitbox_misc_actions` | `meta-boxes.php` | `$post` | After date/time section in Publish box. |
| `post_submitbox_start` | `meta-boxes.php` | `$post` | Start of major publishing actions. |
| `save_post` | `wp_insert_post()` | `$post_id, $post, $update` | After every post save. |
| `save_post_{post_type}` | `wp_insert_post()` | `$post_id, $post, $update` | After save for specific post type. |
| `bulk_edit_posts` | `bulk_edit_posts()` | `$updated, $shared_post_data` | After bulk edit processing. |
| `post_action_{$action}` | `post.php` | `$post_id` | Custom post actions. |

### Filters

| Hook | Description | Default |
|---|---|---|
| `replace_editor` | Return true to completely replace the editor. | `false` |
| `use_block_editor_for_post` | Control per-post block editor usage. | `true` (if post type supports editor) |
| `use_block_editor_for_post_type` | Control per-type block editor usage. | `true` (if supports editor) |
| `block_editor_settings_all` | Modify the block editor settings object. | — |
| `bulk_post_updated_messages` | Modify bulk action success/fail messages. | Built-in messages per post type |
| `handle_bulk_actions-{screen}` | Handle custom bulk actions; return modified redirect URL. | `$sendback` unchanged |
| `wp_revisions_to_keep` | Number of revisions to store. | `WP_POST_REVISIONS` constant |
| `admin_email_remind_interval` | Seconds between admin email verification reminders. | `3 * DAY_IN_SECONDS` |
| `default_content` | Default `post_content` for new post form. | `''` |
| `default_title` | Default `post_title` for new post form. | `''` |
| `default_excerpt` | Default `post_excerpt` for new post form. | `''` |
| `page_attributes_dropdown_pages_args` | Args for parent page dropdown in Page Attributes. | See Section 6.2 |
| `post_edit_category_parent_dropdown_args` | Args for Add New Category parent dropdown. | See Section 6.2 |
| `default_page_template_title` | Label for "Default template" in page template select. | `'Default template'` |
| `editable_slug` | Transform the slug value shown in the Slug metabox. | `$post->post_name` |
| `dashboard_recent_drafts_query_args` | Query args for Quick Draft's recent drafts. | See Section 2.7 of dashboard spec |

---

## Section 13: TypeScript Interface Sketch

```typescript
type PostStatus =
  | 'publish'
  | 'draft'
  | 'auto-draft'
  | 'pending'
  | 'private'
  | 'future'
  | 'trash'
  | 'inherit'
  | string;

type PostType = string;  // 'post', 'page', or any registered CPT slug

type PostVisibility = 'public' | 'password' | 'private';

type MetaboxContext = 'normal' | 'side' | 'advanced';
type MetaboxPriority = 'high' | 'core' | 'default' | 'low';

// ----------------------------------------------------------------
// Core post data
// ----------------------------------------------------------------

interface WPPost {
  ID: number;
  post_author: number;
  post_date: string;          // 'YYYY-MM-DD HH:MM:SS' in site timezone
  post_date_gmt: string;      // 'YYYY-MM-DD HH:MM:SS' in UTC
  post_content: string;
  post_title: string;
  post_excerpt: string;
  post_status: PostStatus;
  comment_status: 'open' | 'closed';
  ping_status: 'open' | 'closed';
  post_password: string;
  post_name: string;           // URL slug
  to_ping: string;             // Newline-separated URLs to ping
  pinged: string;              // Newline-separated already-pinged URLs
  post_modified: string;
  post_modified_gmt: string;
  post_content_filtered: string;
  post_parent: number;
  guid: string;
  menu_order: number;
  post_type: PostType;
  post_mime_type: string;
  comment_count: number;
}

// ----------------------------------------------------------------
// Post editor context
// ----------------------------------------------------------------

interface PostEditorContext {
  post: WPPost;
  postType: PostTypeObject;
  isNew: boolean;               // true when creating via post-new.php
  activePostLock: [number, number] | null;  // [timestamp, user_id] or null
  action: PostEditorAction;
}

type PostEditorAction =
  | 'edit'
  | 'post'
  | 'postajaxpost'
  | 'editpost'
  | 'editattachment'
  | 'trash'
  | 'untrash'
  | 'delete'
  | 'preview'
  | 'post-quickdraft-save'
  | 'toggle-custom-fields'
  | string;

// ----------------------------------------------------------------
// Post type object (from get_post_type_object())
// ----------------------------------------------------------------

interface PostTypeObject {
  name: PostType;
  label: string;
  labels: PostTypeLabels;
  description: string;
  public: boolean;
  hierarchical: boolean;
  exclude_from_search: boolean;
  publicly_queryable: boolean;
  show_ui: boolean;
  show_in_menu: boolean | string;
  show_in_nav_menus: boolean;
  show_in_admin_bar: boolean;
  show_in_rest: boolean;
  rest_base: string;
  rest_namespace: string;
  menu_position: number | null;
  menu_icon: string;
  capability_type: string;
  capabilities: PostTypeCapabilities;
  cap: PostTypeCapabilities;
  supports: string[];          // From get_all_post_type_supports()
  rewrite: false | { slug: string; with_front: boolean };
  query_var: false | string;
  has_archive: boolean | string;
  taxonomies: string[];
}

interface PostTypeLabels {
  name: string;
  singular_name: string;
  add_new: string;
  add_new_item: string;
  edit_item: string;
  new_item: string;
  view_item: string;
  view_items: string;
  search_items: string;
  not_found: string;
  not_found_in_trash: string;
  parent_item_colon: string;
  all_items: string;
  archives: string;
  attributes: string;
  insert_into_item: string;
  uploaded_to_this_item: string;
  featured_image: string;
  set_featured_image: string;
  remove_featured_image: string;
  use_featured_image: string;
  menu_name: string;
  filter_items_list: string;
  filter_by_date: string;
  items_list_navigation: string;
  items_list: string;
  item_published: string;
  item_published_privately: string;
  item_reverted_to_draft: string;
  item_scheduled: string;
  item_updated: string;
}

interface PostTypeCapabilities {
  edit_post: string;
  read_post: string;
  delete_post: string;
  edit_posts: string;
  edit_others_posts: string;
  publish_posts: string;
  read_private_posts: string;
  create_posts: string;
  delete_posts: string;
  delete_private_posts: string;
  delete_published_posts: string;
  delete_others_posts: string;
  edit_private_posts: string;
  edit_published_posts: string;
}

// ----------------------------------------------------------------
// Classic editor metabox
// ----------------------------------------------------------------

interface Metabox {
  id: string;
  title: string;
  callback: (post: WPPost, args: MetaboxCallbackArgs) => void;
  screen: string | string[];
  context: MetaboxContext;
  priority: MetaboxPriority;
  callbackArgs: Record<string, unknown> | null;
}

interface MetaboxCallbackArgs {
  id: string;
  title: string;
  callback: () => void;
  args: Record<string, unknown>;
}

// ----------------------------------------------------------------
// Publish metabox state
// ----------------------------------------------------------------

interface PublishBoxState {
  postStatus: PostStatus;
  visibility: PostVisibility;
  postPassword: string;
  isSticky: boolean;
  publishDate: Date | null;    // null = "publish immediately"
  canPublish: boolean;
  canDelete: boolean;
  revisionsCount: number;
  latestRevisionId: number | null;
  isScheduled: boolean;       // publishDate is in the future
}

// ----------------------------------------------------------------
// Post lock
// ----------------------------------------------------------------

interface PostLock {
  postId: number;
  userId: number;
  timestamp: number;           // Unix timestamp of last lock refresh
}

interface PostLockCheckResult {
  isLocked: boolean;
  lockingUserId: number | null;
  lockingUserDisplayName: string | null;
  lockingUserAvatarUrl: string | null;
}

// ----------------------------------------------------------------
// Edit list (WP_Posts_List_Table)
// ----------------------------------------------------------------

interface PostListQuery {
  post_type: PostType;
  post_status?: PostStatus | 'all';
  author?: number;
  s?: string;
  m?: string;                  // YYYYMM
  cat?: number;
  tag?: string;
  orderby?: string;
  order?: 'ASC' | 'DESC';
  paged?: number;
  per_page?: number;           // From screen option
}

interface PostListBulkAction {
  action: 'trash' | 'untrash' | 'delete' | 'edit' | 'delete_all' | string;
  postIds: number[];
  postStatus?: PostStatus;     // For delete_all
}

interface PostListBulkResult {
  updated: number;
  skipped: number;
  locked: number;
  deleted: number;
  trashed: number;
  untrashed: number;
}

interface QuickEditData {
  postId: number;
  post_title: string;
  post_name: string;
  post_author: number;
  post_status: PostStatus;
  post_password: string;
  post_date: {
    aa: number;   // year
    mm: number;   // month
    jj: number;   // day
    hh: number;   // hour
    mn: number;   // minute
  };
  comment_status: 'open' | 'closed';
  ping_status: 'open' | 'closed';
  post_category: number[];
  tax_input: Record<string, string | number[]>;
  post_format?: string;
  sticky?: boolean;
  post_parent?: number;
  page_template?: string;
  menu_order?: number;
}

// ----------------------------------------------------------------
// Post form submission data
// ----------------------------------------------------------------

interface PostSubmitData {
  post_ID: number;
  post_title: string;
  content: string;             // Maps to post_content
  excerpt: string;             // Maps to post_excerpt
  post_status: PostStatus;
  post_password: string;
  visibility: PostVisibility;
  sticky?: 'sticky';
  post_author: number;
  post_category?: number[];
  tax_input?: Record<string, string | number[]>;
  post_format?: string;
  trackback_url?: string;      // Maps to to_ping
  meta?: Record<number, { key: string; value: string }>;
  deletemeta?: Record<number, 1>;
  aa: number;                  // Year
  mm: number;                  // Month
  jj: number;                  // Day
  hh: number;                  // Hour
  mn: number;                  // Minute
  ss: number;                  // Second
  edit_date?: '1';
  hidden_aa: number;
  hidden_mm: number;
  hidden_jj: number;
  hidden_hh: number;
  hidden_mn: number;
  wp-preview?: 'dopreview';
  post_name?: string;
  parent_id?: number;
  page_template?: string;
  menu_order?: number;
}

// ----------------------------------------------------------------
// Autosave
// ----------------------------------------------------------------

interface AutosaveData {
  postId: number;
  postAuthor: number;
  postTitle: string;
  postContent: string;
  postExcerpt: string;
  modifiedAt: Date;
  isAutosave: true;
}

// ----------------------------------------------------------------
// Revision
// ----------------------------------------------------------------

interface PostRevision extends WPPost {
  post_type: 'revision';
  post_status: 'inherit';
  post_parent: number;         // Original post ID
}

// ----------------------------------------------------------------
// Block editor settings (top-level)
// ----------------------------------------------------------------

interface BlockEditorInitSettings {
  postId: number;
  postType: string;
  settings: BlockEditorFeatureSettings;
  initialEdits: Partial<{
    title: string;
    content: string;
    excerpt: string;
  }> | null;
}

interface BlockEditorFeatureSettings {
  alignWide: boolean;
  allowedBlockTypes: boolean | string[];
  autosaveInterval: number;
  bodyPlaceholder: string;
  canLockBlocks: boolean;
  capabilities: Record<string, boolean>;
  codeEditingEnabled: boolean;
  colors: Array<{ name: string; slug: string; color: string }>;
  disableCustomColors: boolean;
  disableCustomFontSizes: boolean;
  fontSizes: Array<{ name: string; slug: string; size: number }>;
  imageSizes: Array<{ slug: string; name: string }>;
  isRTL: boolean;
  maxUploadFileSize: number;
  postLock: {
    isLocked: boolean;
    user: number | null;
    nonce: string;
  };
  richEditingEnabled: boolean;
  titlePlaceholder: string;
  template: Array<[string, Record<string, unknown>]> | null;
  templateIsEditable: boolean;
  templateLock: false | 'all' | 'insert';
  [key: string]: unknown;
}
```

---

## Section 14: Design Patterns

### Dual-entry architecture

Both `post-new.php` and `post.php` (action=edit) converge at the same decision point: call `use_block_editor_for_post()` and include either `edit-form-blocks.php` or `edit-form-advanced.php`. The only practical difference is that `post-new.php` always creates an auto-draft first.

In TypeScript, model this as a single `PostEditorPage` component that receives an existing or newly-created post ID and delegates to `BlockEditor` or `ClassicEditor` based on the same condition.

### Form action dispatch pattern

`post.php` implements a manual switch-case action dispatcher on `$_REQUEST['action']`. Every action verifies its own nonce and capability before proceeding. This is the "action" pattern: a single URL handles multiple verbs via a discriminating field.

In TypeScript, replicate with an Express-style router where each action is a dedicated handler function, each responsible for its own authorization and validation.

### Auto-draft lifecycle

New post creation always starts with an auto-draft inserted into the database. This ensures the post has an ID before the user has saved anything, which enables:
- Autosave targeting a real post ID.
- Media upload attached to the new post.
- Post lock acquisition before the user begins editing.

Auto-drafts are cleaned up by a daily `wp_scheduled_auto_draft_delete` cron job.

### Metabox registration and rendering separation

Metabox registration (via `add_meta_box()`) and rendering (via `do_meta_boxes()`) are entirely separate phases. Registration happens at `add_meta_boxes` action time; rendering happens when the page template calls `do_meta_boxes($screen, $context, $post)`. This allows third parties to remove or modify metaboxes between registration and rendering using `remove_meta_box()`.

### Post status machine

Post statuses form a state machine with enforced transitions based on capabilities:

```
auto-draft → draft (any save)
draft → pending (via form, users without publish_posts)
draft → publish (via Publish button, requires publish_posts)
draft → future (via Schedule, future date + publish_posts)
publish → draft (manually via Status selector)
publish → private (via Visibility selector, requires publish_posts)
any → trash (via Trash action, requires delete_post)
trash → previous_status (via Restore, requires delete_post)
trash → deleted (via Delete Permanently, requires delete_post)
```

Unauthorized transitions are silently downgraded server-side in `_wp_translate_postdata()`.

### Post lock refresh protocol

The post lock is a short-lived lease (150-second expiry) that must be actively refreshed. The Heartbeat API fires every 60 seconds and refreshes the lock, keeping the lease active. When the page is closed, the Heartbeat stops and the lock naturally expires within 2.5 minutes. This avoids the need for an explicit "release lock" call on page unload.

### Nonce architecture

Every destructive operation requires a nonce. Nonce action strings follow the pattern `{verb}-{noun}_{id}`:
- `add-post` — create any new post
- `update-post_{id}` — update a specific post
- `delete-post_{id}` — delete a specific post
- `trash-post_{id}` — trash a specific post
- `untrash-post_{id}` — restore a specific post from trash
- `lock-post_{id}` — acquire the edit lock
- `bulk-posts` — any bulk action on the post list

Nonces are output as hidden form fields (classic editor) or passed in `wpApiSettings.nonce` HTTP header (REST API / block editor).

### Bulk taxonomy merging

Bulk edit adds taxonomy terms but never removes them. This is intentional: the UI is expected to add terms that the user just checked. A post that already has "Science" in its categories will keep it after a bulk edit that adds "Technology". Removing terms must be done through individual Quick Edit or full edit.

### Block editor REST communication

The block editor is a fully client-side React application that treats the PHP page as a configuration injector. All data operations go through the REST API. The PHP page's only role is:
1. Authentication and authorization.
2. Injecting the initial settings/post data via a JSON script tag.
3. Serving the compiled JS bundles.

This means the block editor can, in principle, be re-implemented with any REST client talking to the same WordPress REST API, with no PHP dependency.

---

## Section 15: Tovu Reconstruction Notes

### 15.1 Why this exists

The post editor exists to let authors work against a real content record, with autosave, media attachment, lock coordination, and publish-state transitions all happening against the same object. The editor is not just a form; it is a workflow coordinator for content lifecycle.

### 15.2 What Tovu should preserve

- Creation of a real draft identifier before the editing session becomes stateful
- Autosave and edit-lock coordination as core editor infrastructure
- Explicit server-enforced status transitions and per-action authorization checks
- A clean split between the editor shell and the API/content services it talks to

### 15.3 What Tovu can simplify

- Tovu does not need to preserve both classic and block editor modes if one structured editor is the product direction
- Action dispatch can be implemented with normal typed routes instead of one multi-action endpoint
- Metabox compatibility layers can be thinner if Tovu defines clearer extension surfaces up front

### 15.4 Possible Tovu seams

- `src/features/post-editor/` for authoring-session orchestration
- `src/core/ports/AutosavePort.ts` for draft snapshots and recovery
- `src/core/ports/EditLockPort.ts` for lease acquisition and refresh
- `src/core/ports/StructuredContentPort.ts` for the editor's canonical content contract
- `src/core/ports/MediaAttachmentPort.ts` for upload/attach behavior during editing

### 15.5 Suggested priority

- `V1`: draft creation, save/publish lifecycle, autosave, edit locks, structured editor integration
- `Later`: alternate editors, richer metabox-style extensions, deeper bulk edit parity
