# Media Library — WordPress to TypeScript Rewrite Spec

**Source files analyzed:**
- `wp-admin/upload.php`
- `wp-admin/media.php` (deprecated since 6.3.0)
- `wp-admin/media-new.php`
- `wp-admin/includes/media.php`

---

## Section 1: Overview

The Media Library is the administration surface for all uploaded files (attachments). An attachment in WordPress is a post record with `post_type = 'attachment'` and `post_status = 'inherit'`. All binary files (images, audio, video, documents) live in this subsystem.

There are three primary screens:

1. **Media Library screen** (`upload.php`) — browseable in two modes: a JavaScript-driven **grid view** (default) and a server-rendered **list view**. The mode preference is stored per-user.
2. **Upload New Media screen** (`media-new.php`) — a standalone page with a drag-and-drop Plupload/HTML5 uploader for adding new files outside the context of any post.
3. **Attachment edit screen** — reached from either the grid view detail panel or the list view Edit row action. In WordPress 6.3+ this is handled entirely within `upload.php` (the old `media.php` file was deprecated and now just redirects).

`wp-admin/media.php` still exists but every action it previously handled now redirects to `upload.php` with an `?error=deprecated` query parameter. It must not be recreated as a functional route; model it only as a redirect shim.

---

## Section 2: Routes

### 2.1 `GET /wp-admin/upload.php`

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `mode` | `'grid' \| 'list'` | View mode. If omitted, falls back to per-user option `media_library_mode`. Default `'grid'`. Setting this parameter also saves the preference via `update_user_option`. |
| `s` | `string` | Search query (list view only; grid view passes this to JS). |
| `m` | `string` | Date filter in `YYYYMM` format (list view only). |
| `post_mime_type` | `string` | MIME type filter: `'image'`, `'audio'`, `'video'`, `'application/pdf'`, etc. |
| `paged` | `number` | Page number for list view pagination. |
| `item` | `number` | Attachment ID — triggers the grid view detail modal for that item on load. |
| `posted` | `number` | Flash success message: "Media file updated." Removed from URI immediately after display. |
| `attached` | `number` | Count of files just attached. Removed from URI after display. |
| `detach` | `number` | Count of files just detached. Removed from URI after display. |
| `deleted` | `number` | Count of permanently deleted files. Removed from URI after display. |
| `trashed` | `number` | Count of trashed files. Appends "Undo" link using nonce `bulk-media`. Removed from URI after display. |
| `untrashed` | `number` | Count of restored files. Removed from URI after display. |
| `message` | `1\|2\|3\|4\|5` | Numeric message codes: 1=updated, 2=permanently deleted, 3=error saving, 4=moved to trash (with undo), 5=restored from trash. |
| `ids` | `string` | Comma-separated attachment IDs used by the undo-trash link. |

**Mode switching logic:**
- If `?mode=grid` or `?mode=list` is present and valid, save the preference to user meta key `media_library_mode` and use it.
- Otherwise, load from user meta `media_library_mode`.
- If neither is present, default to `'grid'`.

**Grid mode rendering:**
- Enqueue scripts: `media-grid`, `media` (via `wp_enqueue_media()`).
- Compute query vars by calling `wp_edit_attachments_query_vars()` on the current GET parameters, stripping: `mode`, `post_type`, `post_status`, `posts_per_page`, empty values, and `s` (handled by JS).
- Pass the remaining vars to JS as `window._wpMediaGridSettings = { adminUrl, queryVars }`.
- Render a single `<div class="wrap" id="wp-media-grid" data-search="...">` container — the Backbone.js application mounts into this.
- Show a `<noscript>`-equivalent notice `hide-if-js` telling users to switch to list view if JS is unavailable.

**List mode rendering:**
- Instantiate `WP_Media_List_Table`, call `prepare_items()`, render standard list-table HTML inside a `<form id="posts-filter" method="get">`.
- Include `find_posts_div()` — the "Attach media to post" dialog HTML.
- Enqueue script `media`.
- Register a `per_page` screen option.

### 2.2 `POST /wp-admin/upload.php` — Bulk Actions

Nonce: `bulk-media`.

**Input sources (in priority order):**

1. If `doaction === 'delete_all'`, gather all attachment IDs where `post_status = 'trash'` from the database directly.
2. If `$_REQUEST['media']` is set (checkbox array), use those IDs.
3. If `$_REQUEST['ids']` is set (comma-separated string), split and use those.
4. Cast all IDs to integers.

**Actions:**

| `doaction` value | Behavior |
|---|---|
| `trash` | Calls `wp_trash_post()` on each ID. Requires `delete_post` cap per attachment. Redirects with `?trashed=N&ids=...`. |
| `untrash` | Calls `wp_untrash_post()`. Requires `delete_post` cap. Redirects with `?untrashed=N`. |
| `delete` | Calls `wp_delete_attachment()` (permanent). Requires `delete_post` cap per ID. Redirects with `?deleted=N`. |
| `delete_all` | Same as `delete` but targets all trashed attachments. |
| `detach` | Calls `wp_media_attach_action($parent_post_id, 'detach')`. |
| `attach` | Calls `wp_media_attach_action($found_post_id)`. |
| Custom | Fires `handle_bulk_actions-{screen_id}` filter. |

After action, redirect back to the referrer URL (if it contains `upload.php`) stripped of `trashed`, `untrashed`, `deleted`, `message`, `ids`, `posted`. Otherwise redirect to `upload.php`.

If `_wp_http_referer` is present in a GET request (form redirect artifact), strip it and `_wpnonce` from the URI and redirect.

### 2.3 `GET /wp-admin/media-new.php`

Displays the upload form. Accepts optional `?post_id=N` to associate uploads with an existing post. The post ID is validated: if the post does not exist or the current user cannot `edit_post` it, `post_id` is reset to `0`.

If `?browser-uploader` is in the query string, or if the user setting `uploader` is set, adds class `html-uploader` to the form, which hides the Plupload UI and shows a plain `<input type="file">` instead.

### 2.4 `POST /wp-admin/media-new.php`

Nonce: `media-form`.

If `$_POST['html-upload']` is set and `$_FILES` is non-empty:
- Calls `media_handle_upload('async-upload', $post_id)`.
- On `WP_Error`, calls `wp_die()`.
- On success, redirects to `upload.php`.

If POST is received without `html-upload` (i.e., no file), still redirects to `upload.php`.

### 2.5 `GET /wp-admin/media.php` (deprecated, redirect only)

- Any request with `action=editattachment` or `action=edit` and a valid `?attachment_id=N` redirects to `upload.php?item=N&error=deprecated`.
- All other requests redirect to `upload.php?error=deprecated`.

---

## Section 3: Authorization

### 3.1 Page-level access

All three pages (`upload.php`, `media-new.php`, `media.php`) require the `upload_files` capability. Failure calls `wp_die('Sorry, you are not allowed to upload files.')` with no HTTP status code override (defaults to 200 in classic WP — implement as 403).

The comments list check in `edit-comments.php` uses `edit_posts` — note that `upload_files` is separate and higher-specificity.

### 3.2 Per-attachment operations

| Operation | Required capability |
|---|---|
| Trash attachment | `delete_post` on that attachment ID |
| Untrash attachment | `delete_post` on that attachment ID |
| Delete attachment permanently | `delete_post` on that attachment ID |
| Edit attachment fields | `edit_post` on that attachment ID |
| Edit image (crop/rotate/scale) | `edit_post` on that attachment ID |

### 3.3 Bulk action authorization

Each ID in a bulk operation is checked individually. If the user lacks the capability for a specific ID, that ID is silently skipped (for bulk) or `wp_die()` is called (for single-item row actions in list view).

### 3.4 "Attach" dialog

Searching for a post to attach media to requires `edit_posts` (checked by `wp_media_attach_action` internally). The current user must also have `edit_post` on the target post to attach.

---

## Section 4: Grid View

### 4.1 JavaScript architecture

The grid view is built on **Backbone.js** using WordPress's `wp.media` framework. The PHP page renders only a mounting container `<div id="wp-media-grid">`. All rendering, fetching, filtering, and routing happens in JavaScript after page load.

The entry point is the `media-grid` script. On load it reads `window._wpMediaGridSettings`:

```typescript
interface WPMediaGridSettings {
  adminUrl: string;       // e.g. "/wp-admin/"
  queryVars: {            // initial query filters passed from PHP
    post_mime_type?: string;
    m?: string;           // YYYYMM date filter
    [key: string]: string | undefined;
  };
}
```

### 4.2 MediaFrame (Backbone view)

The grid is rendered as a `wp.media.view.MediaFrame.Manage` Backbone view. It is a full-screen "frame" that contains:

- A toolbar with a "Bulk Select" toggle button, view-mode switcher icons, and filter controls.
- A content region that renders the attachment grid.
- A sidebar region that renders the Attachment Details panel when an item is selected.

### 4.3 Attachment query

The grid fetches attachments from the REST API (`/wp/v2/media`) or the legacy AJAX endpoint (`wp_ajax_query-attachments`). Query parameters sent:

| Parameter | Source |
|---|---|
| `post_type` | `'attachment'` (hardcoded) |
| `post_status` | `'inherit'` (hardcoded) |
| `posts_per_page` | `40` (default; configurable) |
| `post_mime_type` | From filter UI |
| `m` | From date filter (YYYYMM) |
| `s` | From search box |
| `paged` / `offset` | Computed for infinite scroll |
| `orderby` | `'date'` default |
| `order` | `'DESC'` default |

### 4.4 Filters

Three filter controls appear above the grid:

1. **Media type filter** — a `<select>` with options: All Media Types, Images, Audio, Video, Documents, Spreadsheets, Archives. Maps to `post_mime_type` parameter values.
2. **Date filter** — a `<select>` with one option per year/month in which uploads exist. Value is `YYYYMM` integer. An option for "All Dates" maps to an empty string.
3. **Search** — a text input. Input is debounced before sending. Does **not** modify the URL (handled entirely in JS state).

### 4.5 Infinite scroll

The grid uses infinite scroll rather than pagination. When the user scrolls to within a threshold of the bottom, a new page of attachments is fetched using the `offset` parameter (not `paged`). Results are appended to the existing collection.

### 4.6 Bulk select mode

When "Bulk Select" is active:
- A checkbox overlay appears on each thumbnail.
- Clicking thumbnails toggles selection.
- A "Delete Selected" button appears. Clicking it fires the `trash` (or `delete` if MEDIA_TRASH is disabled) bulk action via AJAX then removes the items from the DOM.
- A "Cancel Selection" button exits bulk mode.

### 4.7 Attachment details panel

Clicking a single item (outside bulk mode) opens the Attachment Details sidebar. It contains:

- The attachment thumbnail or file icon preview.
- Previous/next navigation arrows (navigates through the current filtered set).
- The editable fields (see Section 7 for all fields).
- Auto-save on field blur — changes are sent immediately via AJAX without a submit button.
- A "Delete permanently" link.
- An "Edit more details" link that navigates to the full attachment edit screen.

---

## Section 5: List View (`WP_Media_List_Table`)

### 5.1 Table columns

| Column key | Label | Sortable | Notes |
|---|---|---|---|
| `cb` | Checkbox | No | Only rendered when `$this->checkbox === true`. |
| `icon` | (blank) | No | Renders the attachment thumbnail or MIME type icon. |
| `title` | `File name` | No | File name as a link to the attachment edit screen. Also displays the attachment title below it. |
| `author` | `Author` | No | Display name of the post author (the uploader). |
| `parent` | `Uploaded to` | No | Post title that this attachment is attached to, or "Unattached" with an "Attach" link. |
| `comments` | Comment bubble | No | Only shown if comments are enabled for attachments. |
| `date` | `Date` | No | Upload date in localized format. |

### 5.2 Filter views (top navigation tabs)

The list view renders filter tabs above the table:

| View key | Label | Query |
|---|---|---|
| `all` | `All` (with count) | No `post_status` filter (shows `inherit` and `private`). |
| `mine` | `Mine` | Filtered to current user's `post_author`. |

Unlike posts, attachments do not have trash/published tabs in the filter view by default. However, a `detached` view showing unattached media may be added via the `views_upload` filter.

### 5.3 Additional filters

A dropdown filter for **MIME type** (`post_mime_type`) renders above the table when multiple media types exist:
- "All media types"
- "Images"
- "Audio"
- "Video"
- Specific types (e.g., PDF) if items exist

A **date dropdown** (`m` parameter in YYYYMM format) is also rendered. Both submit via the GET form on change.

### 5.4 Row actions

On hover over a row, these actions appear (on the `title` column, which is the primary column):

| Action | Label | Condition |
|---|---|---|
| Edit | `Edit` | Always shown. Links to `upload.php?item={ID}` (or attachment page in older WP). |
| Delete Permanently | `Delete Permanently` | `delete_post` cap on the attachment. |
| View | `View` | Always shown. Links to `get_permalink($id)`. |
| Copy URL | `Copy URL` | JS-powered clipboard copy of `wp_get_attachment_url()`. |
| Download file | `Download file` | Link to the file URL with a `download` attribute. |
| Attach | `Attach` | Shown when `post_parent === 0` (unattached). Opens the find-posts modal. |

### 5.5 Bulk actions

Available in the bulk action select:

| Action | Label |
|---|---|
| `trash` | `Move to Trash` |
| `delete` | `Delete Permanently` (only if MEDIA_TRASH is disabled or item is already trashed) |

---

## Section 6: Media Upload

### 6.1 Upload endpoint

New files are uploaded via `POST /wp-admin/async-upload.php` (a separate PHP file not covered here). The Plupload library on the client side sends files to this endpoint with the field name `async-upload`. On success, the endpoint responds with HTML containing the media item form (for the legacy uploader) or JSON (for the modern media modal).

### 6.2 Plupload initialization

The upload widget is configured with a `wpUploaderInit` JavaScript object:

```typescript
interface WPUploaderInit {
  browse_button: string;        // DOM element ID: 'plupload-browse-button'
  container: string;            // DOM element ID: 'plupload-upload-ui'
  drop_element: string;         // DOM element ID: 'drag-drop-area'
  file_data_name: string;       // 'async-upload'
  url: string;                  // admin_url('async-upload.php')
  filters: {
    max_file_size: string;       // e.g. '64mb' — from wp_max_upload_size()
  };
  multipart_params: {
    post_id: number;
    _wpnonce: string;           // nonce for 'media-form'
    type: string;
    tab: string;
    short: '1';
  };
  multi_selection?: boolean;    // false on iOS 7.x to work around a bug
  webp_upload_error?: boolean;  // true if WP_Image_Editor cannot handle WebP
  avif_upload_error?: boolean;  // true if WP_Image_Editor cannot handle AVIF
}
```

`resize_height` and `resize_width` are also emitted as globals, taken from `large_size_h` and `large_size_w` options (default `1024`).

### 6.3 File size limits

`wp_max_upload_size()` returns the smallest of:
- `upload_max_filesize` from PHP ini (e.g., `64M`)
- `post_max_size` from PHP ini
- The `upload_size_limit` filter result

The computed value is passed to Plupload as `max_file_size` in bytes with the suffix `b`.

### 6.4 MIME type filtering

The Plupload filter does **not** restrict MIME types on the client by default. Server-side validation uses WordPress's `wp_check_filetype()` which references the `upload_mimes` filter. The default allowed MIME types are a large list including common images, audio, video, documents, and archives.

MIME types that cannot be edited by the installed image editor (WebP if GD without WebP support, AVIF if unsupported) generate a client-side warning via the `webp_upload_error` / `avif_upload_error` flags. The upload is still allowed — the warning informs the user that sub-sizes will not be generated.

### 6.5 Post-upload processing (`media_handle_upload`)

This function is the canonical server-side handler for all uploads:

1. Determine the timestamp for the upload: use the parent post's `post_date` if the parent is a non-page post with a valid year; otherwise use `current_time('mysql')`.
2. Call `wp_handle_upload()` which moves the temp file to the uploads directory and returns `{ url, file, type }` or `{ error }`.
3. Derive a title from the filename (strip extension).
4. **For audio files** (`preg_match('#^audio#', $type)`): call `wp_read_audio_metadata()` and extract `title`, `album`, `artist`, `year`, `track_number`, `genre`. Build a `post_content` description string from these. Override `$title` if the audio metadata title is non-empty.
5. **For image files** (`str_starts_with($type, 'image/')`): call `wp_read_image_metadata()` and extract `title` (override `$title` if non-numeric and non-empty) and `caption` (use as `post_excerpt`).
6. Construct the attachment array:
   - `post_mime_type` = MIME type string
   - `guid` = full URL of the file
   - `post_parent` = parent post ID (0 if standalone)
   - `post_title` = derived title
   - `post_content` = description (from audio metadata or empty)
   - `post_excerpt` = caption (from image EXIF or empty)
7. Merge any `$post_data` overrides into the array. Unset `ID` to prevent overwriting.
8. Call `wp_insert_attachment()` — inserts a `post_type=attachment` record into `wp_posts`.
9. If successful, set HTTP header `X-WP-Upload-Attachment-ID: {id}` for browser resume capability.
10. Call `wp_generate_attachment_metadata()` on the physical file, then `wp_update_attachment_metadata()` to persist it.
11. Return the attachment ID (integer) or `WP_Error`.

### 6.6 HTML fallback uploader

When JS is unavailable or `?browser-uploader` is set, the form renders a `<input type="file" name="async-upload">` with a standard submit button labeled "Upload File". POST handler is at `media-new.php` itself (not `async-upload.php`). The form is hidden by default with class `hide-if-js` and the Plupload UI has class `hide-if-no-js`.

---

## Section 7: Attachment Edit Screen

### 7.1 Navigation

In WordPress 6.3+ the full attachment edit screen is reached via `upload.php?item={attachment_id}`. The JS-rendered grid view modal handles this by detecting `?item=` in the URL on load and immediately opening the Attachment Details panel for that ID.

For the "Edit more details" link from the grid panel, users are taken to a dedicated edit-form page. In the WordPress source this renders `wp-admin/edit-form-advanced.php` in attachment mode, but the routing is handled via the grid JS navigating to a URL like `upload.php?item={id}&mode=edit`.

### 7.2 Editable fields

| Field | Post field / Meta key | Notes |
|---|---|---|
| Title | `post_title` | Required for images. Text input. |
| Caption | `post_excerpt` | Textarea. Used as caption in shortcodes and galleries. |
| Alternative Text | `_wp_attachment_image_alt` (post meta) | Text input. Images only. |
| Description | `post_content` | Textarea. Used as long description. |
| File URL | `guid` / `wp_get_attachment_url()` | Read-only text field. Copyable. |
| Alignment | `attachments[ID][align]` | Radio buttons: none, left, center, right. Images only. Stored as user setting, not in post. |
| Link URL | `attachments[ID][url]` | Text input with presets: None, File URL, Attachment Post URL. |
| Image Size | `attachments[ID][image-size]` | Radio buttons: Thumbnail, Medium, Large, Full Size. Images only. |
| Order | `menu_order` | Integer. Used for gallery ordering. |

### 7.3 Image editing

The "Edit Image" button is shown for image attachments when `wp_image_editor_supports()` returns true for the attachment's MIME type. Clicking calls the JS function `imageEdit.open(postId, nonce)`.

**Image editor nonce:** `image_editor-{attachment_id}`

The image editor workflow:

1. **Load**: `wp_ajax_imgedit-preview` — generates a cropped/rotated/etc. preview and returns it as a JPEG data stream.
2. **Save**: `wp_ajax_image-editor` — applies the transformation to the original file and regenerates all image sub-sizes.

**Available operations:**

| Operation | Description |
|---|---|
| Crop | Select a region by dragging a box; coordinates sent as `x`, `y`, `width`, `height` in pixels of the full-size original. |
| Rotate left | 90° counter-clockwise. |
| Rotate right | 90° clockwise. |
| Flip horizontal | Mirror left–right. |
| Flip vertical | Mirror top–bottom. |
| Scale | Resize to a maximum width/height while preserving aspect ratio. |
| Restore original | Reverts to the original pre-edit file (if `_wp_attachment_backup_sizes` meta exists). |

Operations are accumulated in a `history` array before being saved. The `?action=editImage` AJAX call processes the history array using `WP_Image_Editor`.

**Backup sizes**: Before the first edit, WordPress copies the original to a `_wp_attachment_backup_sizes` meta entry so that "Restore original" can recover it.

**Apply to**: A radio allows applying crop/rotate/flip to:
- All image sizes
- Thumbnail only
- All except thumbnail

---

## Section 8: Attachment Metadata

### 8.1 `_wp_attachment_metadata` post meta key

All generated metadata for an attachment is stored in a single serialized array under the post meta key `_wp_attachment_metadata`. The structure differs by MIME type group.

### 8.2 Image metadata structure

```typescript
interface ImageAttachmentMetadata {
  width: number;               // full-size width in pixels
  height: number;              // full-size height in pixels
  file: string;                // relative path from uploads dir, e.g. "2024/01/photo.jpg"
  filesize?: number;           // file size in bytes (added in WP 6.0)
  sizes: {
    [sizeName: string]: {      // e.g. "thumbnail", "medium", "large", "medium_large"
      file: string;            // filename only, e.g. "photo-150x150.jpg"
      width: number;
      height: number;
      mime_type: string;
      filesize?: number;
    };
  };
  image_meta: {
    aperture: string;          // e.g. "2.8"
    credit: string;
    camera: string;
    caption: string;
    created_timestamp: number; // Unix timestamp
    copyright: string;
    focal_length: string;      // mm
    iso: string;
    shutter_speed: string;     // fractional seconds as string
    title: string;
    orientation: string;       // EXIF orientation value "1"–"8"
    keywords: string[];
  };
}
```

### 8.3 Audio metadata structure

```typescript
interface AudioAttachmentMetadata {
  dataformat: string;          // e.g. "mp3", "ogg"
  channels: number;
  sample_rate: number;
  bitrate: number;
  channelmode: string;         // e.g. "joint stereo"
  bitrate_mode: string;        // "cbr" or "vbr"
  lossless: boolean;
  encoder_options: string;
  compression_ratio: number;
  filesize: number;
  mime_type: string;
  length: number;              // duration in seconds
  length_formatted: string;    // e.g. "3:24"
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  genre?: string;
  track_number?: string;
  comment?: string;
}
```

### 8.4 Video metadata structure

```typescript
interface VideoAttachmentMetadata {
  dataformat: string;          // e.g. "mp4"
  filesize: number;
  mime_type: string;
  length: number;
  length_formatted: string;
  width?: number;
  height?: number;
  video?: {
    dataformat: string;
    codec: string;
    width: number;
    height: number;
    bits_per_sample: number;
    pixel_aspect_ratio: string;
  };
  audio?: {
    dataformat: string;
    codec: string;
    sample_rate: number;
    channels: number;
    bits_per_sample: number;
    lossless: boolean;
    channelmode: string;
  };
  image?: {                    // embedded thumbnail
    data: string;
    mime: string;
    width: number;
    height: number;
  };
}
```

### 8.5 EXIF/IPTC extraction (`wp_read_image_metadata`)

This function uses PHP's `exif_read_data()` and `iptcparse()` on the uploaded file to populate `image_meta`. Fields extracted:

- **From EXIF**: `Make`, `Model` → `camera`; `FNumber` → `aperture`; `ExposureTime` → `shutter_speed`; `FocalLength` → `focal_length`; `ISOSpeedRatings` → `iso`; `DateTimeOriginal` → `created_timestamp`; `Orientation` → `orientation`; `Title`, `ImageDescription` → `title`/`caption`; `Artist`, `Author` → `credit`; `Copyright` → `copyright`.
- **From IPTC** (takes precedence over EXIF where both exist): `2#005` → `title`; `2#025` → `keywords`; `2#110` → `credit`; `2#115` → `credit`; `2#116` → `copyright`; `2#120` → `caption`; `2#105` → `title`.

The `created_timestamp` is converted from EXIF datetime format `YYYY:MM:DD HH:MM:SS` to a Unix timestamp.

### 8.6 Image sub-sizes

WordPress generates sub-sizes from the registered image sizes. The default sizes are:

| Size name | Max width | Max height | Crop |
|---|---|---|---|
| `thumbnail` | `thumbnail_size_w` option (default 150) | `thumbnail_size_h` option (default 150) | Hard crop: yes |
| `medium` | `medium_size_w` option (default 300) | `medium_size_h` option (default 300) | Soft crop: no |
| `medium_large` | 768 | 0 (no height limit) | Soft crop: no |
| `large` | `large_size_w` option (default 1024) | `large_size_h` option (default 1024) | Soft crop: no |
| `1536x1536` | 1536 | 1536 | Soft crop: no |
| `2048x2048` | 2048 | 2048 | Soft crop: no |

Sub-sizes are only generated if the source image is large enough. If the source is smaller than a registered size, that size is skipped (no upscaling by default).

### 8.7 Additional post meta

| Meta key | Type | Description |
|---|---|---|
| `_wp_attachment_image_alt` | `string` | Alternative text for images. Edited separately from post meta, not in `_wp_attachment_metadata`. |
| `_wp_attachment_backup_sizes` | `object` | Backup of original image sizes created before the first image edit. Allows "Restore original". |
| `_wp_attached_file` | `string` | Relative path from uploads base dir to the original file. Used by `get_attached_file()`. |
| `_source_url` | `string` | Only set when sideloaded via `media_sideload_image()`. The original remote URL. |

---

## Section 9: Key Hooks and Filters

### 9.1 Filters

| Filter | Signature | Description |
|---|---|---|
| `media_upload_tabs` | `(tabs: Record<string,string>) => Record<string,string>` | Add or remove legacy uploader tabs. |
| `upload_mimes` | `(mimes: Record<string,string>, userId: number) => Record<string,string>` | Allowed upload MIME types. |
| `upload_size_limit` | `(limit: number, userId: number) => number` | Override maximum upload size. |
| `wp_handle_upload_prefilter` | `(file: PHPFileArray) => PHPFileArray` | Fires before validation; can add errors. |
| `wp_handle_upload` | `(fileData: object, context: string) => object` | Fires after successful upload. |
| `attachment_fields_to_edit` | `(fields: object, post: WP_Post) => object` | Add or modify attachment edit fields. |
| `attachment_fields_to_save` | `(post: object, attachment: object) => object` | Filter attachment data before saving. |
| `wp_generate_attachment_metadata` | `(metadata: object, attachmentId: number, context: string) => object` | Filter generated metadata before it is saved. |
| `intermediate_image_sizes_advanced` | `(sizes: object, metadata: object, attachmentId: number) => object` | Filter which sub-sizes are generated. |
| `image_size_names_choose` | `(sizes: Record<string,string>) => Record<string,string>` | Labels shown in the image size picker. |
| `plupload_init` | `(init: object) => object` | Override Plupload configuration. |
| `upload_post_params` | `(params: object) => object` | Override POST params sent with each Plupload chunk. |
| `media_send_to_editor` | `(html: string, id: number, attachment: object) => string` | Filter HTML inserted into editor from media modal. |
| `image_send_to_editor` | `(html: string, id: number, ...) => string` | Filter image-specific HTML going to editor. |
| `disable_captions` | `(disabled: string) => string` | Return truthy to disable caption shortcode wrapping. |
| `image_add_caption_text` | `(caption: string, id: number) => string` | Filter caption text. |
| `wp_prepare_attachment_for_js` | `(response: object, post: WP_Post, meta: object) => object` | Filter the attachment data object sent to JS in the media modal. |
| `ajax_query_attachments_args` | `(args: WP_Query_Args) => WP_Query_Args` | Filter query args for grid view attachment fetch. |
| `comments_list_table_query_args` | `(args: object) => object` | (Note: this is a comments hook incorrectly referenced here — see comments spec.) |
| `wp_prevent_unsupported_mime_type_uploads` | `(prevent: boolean, post: null) => boolean` | Disable WebP/AVIF upload warnings. |
| `image_sideload_extensions` | `(exts: string[], file: string) => string[]` | Allowed extensions for sideloaded images. |

### 9.2 Actions

| Action | When fired |
|---|---|
| `add_attachment` | After a new attachment is inserted into the database. |
| `edit_attachment` | After an existing attachment post is updated. |
| `delete_attachment` | Before permanent deletion of an attachment (file + post). |
| `wp_ajax_query-attachments` | AJAX handler for grid view attachment query. |
| `wp_ajax_save-attachment` | AJAX handler for saving attachment fields from grid details panel. |
| `wp_ajax_save-attachment-compat` | AJAX handler for saving compat fields. |
| `wp_ajax_image-editor` | AJAX handler for applying image edits. |
| `wp_ajax_imgedit-preview` | AJAX handler for generating image edit preview. |
| `wp_ajax_set-post-thumbnail` | AJAX handler for setting featured image. |
| `pre-upload-ui` | Before the legacy upload UI renders. |
| `post-upload-ui` | After the legacy upload UI renders. |
| `pre-plupload-upload-ui` | Before the Plupload drag-drop area renders. |
| `post-plupload-upload-ui` | After the Plupload drag-drop area renders. |
| `restrict_manage_posts` | In the list view table nav area (for adding filter controls). |

---

## Section 10: TypeScript Interface Sketch

```typescript
// === Core data types ===

interface Attachment {
  id: number;
  postType: 'attachment';
  postStatus: 'inherit' | 'private' | 'trash';
  postMimeType: string;           // e.g. "image/jpeg", "audio/mpeg"
  postTitle: string;
  postExcerpt: string;            // caption
  postContent: string;            // description
  guid: string;                   // full URL to file
  postParent: number;             // 0 if unattached
  postDate: string;               // ISO 8601 datetime
  postAuthor: number;
  menuOrder: number;
  attachedFile: string;           // relative path from uploads base dir
}

interface AttachmentMeta {
  imageAlt?: string;             // _wp_attachment_image_alt
  metadata?: ImageAttachmentMetadata | AudioAttachmentMetadata | VideoAttachmentMetadata;
  backupSizes?: Record<string, ImageSubSize>;  // _wp_attachment_backup_sizes
  sourceUrl?: string;            // _source_url (sideloaded only)
}

interface ImageSubSize {
  file: string;
  width: number;
  height: number;
  mimeType: string;
  filesize?: number;
}

interface ImageAttachmentMetadata {
  width: number;
  height: number;
  file: string;
  filesize?: number;
  sizes: Record<string, ImageSubSize>;
  imageMeta: ImageExifMeta;
}

interface ImageExifMeta {
  aperture: string;
  credit: string;
  camera: string;
  caption: string;
  createdTimestamp: number;
  copyright: string;
  focalLength: string;
  iso: string;
  shutterSpeed: string;
  title: string;
  orientation: string;
  keywords: string[];
}

interface AudioAttachmentMetadata {
  dataformat: string;
  channels: number;
  sampleRate: number;
  bitrate: number;
  length: number;
  lengthFormatted: string;
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  genre?: string;
  trackNumber?: string;
}

interface VideoAttachmentMetadata {
  dataformat: string;
  filesize: number;
  length: number;
  lengthFormatted: string;
  width?: number;
  height?: number;
}

// === Query / filter types ===

type MediaLibraryMode = 'grid' | 'list';

interface AttachmentQuery {
  postMimeType?: string;
  m?: string;                    // YYYYMM
  s?: string;                    // search term
  paged?: number;
  postsPerPage?: number;
  orderby?: string;
  order?: 'ASC' | 'DESC';
  postParent?: number;
}

// === Upload types ===

interface UploadResult {
  attachmentId: number;
  url: string;
  mimeType: string;
  file: string;
}

interface UploadError {
  code: string;
  message: string;
}

// === Attachment edit field types ===

type AttachmentEditFields = {
  postTitle: string;
  postExcerpt: string;           // caption
  postContent: string;           // description
  imageAlt?: string;             // images only
  align?: 'none' | 'left' | 'center' | 'right';  // images only
  imageSize?: 'thumbnail' | 'medium' | 'large' | 'full';  // images only
  url?: string;                  // link URL
  menuOrder?: number;
};

// === Image edit types ===

type ImageEditorOperation =
  | { type: 'rotate'; angle: 90 | -90 }
  | { type: 'flip'; axis: 'horizontal' | 'vertical' }
  | { type: 'crop'; x: number; y: number; width: number; height: number }
  | { type: 'scale'; maxWidth: number; maxHeight: number };

type ImageEditorApplyTarget = 'all' | 'thumbnail' | 'all-except-thumbnail';

interface ImageEditorRequest {
  attachmentId: number;
  nonce: string;
  history: ImageEditorOperation[];
  target: ImageEditorApplyTarget;
  context: 'edit-attachment';
}

// === Bulk action types ===

type MediaBulkAction = 'trash' | 'untrash' | 'delete' | 'delete_all' | 'attach' | 'detach';

interface MediaBulkActionRequest {
  action: MediaBulkAction;
  ids: number[];
  nonce: string;                 // 'bulk-media'
}

// === Grid settings (passed from PHP to JS) ===

interface WPMediaGridSettings {
  adminUrl: string;
  queryVars: Partial<Record<string, string>>;
}

// === WP_Media_List_Table row ===

interface MediaListRow {
  attachment: Attachment;
  thumbnailUrl: string | null;
  fileUrl: string;
  mimeType: string;
  uploaderName: string;
  parentPostTitle: string | null;  // null if unattached
  canDelete: boolean;
  canEdit: boolean;
}
```

---

## Section 11: Design Patterns

### 11.1 Mode persistence

The grid vs. list view preference is stored per-user in user meta (`media_library_mode`). The TypeScript implementation should read and write this preference through the users/settings API. Do not store it in localStorage — it must be server-side so the preference persists across devices.

### 11.2 Two rendering paths for the same page

`upload.php` conditionally branches at the top of the request: if mode is `grid`, it emits a minimal page and exits; if mode is `list`, it falls through to full server-rendered table output. In TypeScript, implement these as two distinct route handlers or page components sharing the same URL, differentiated by the `mode` query parameter. The grid view should be a React/client-side component; the list view may be server-rendered.

### 11.3 Attachment as a specialized post type

An attachment in the data model is simply a post with `post_type = 'attachment'`. The file path is stored in `_wp_attached_file` meta. The public URL is derived from `guid`. Metadata (dimensions, EXIF, sub-sizes) is stored as a serialized blob in `_wp_attachment_metadata`. In a TypeScript implementation, keep the `Attachment` interface as an extension of a base `Post` interface and store metadata as a typed, normalized companion record.

### 11.4 Deferred metadata generation

After upload, `wp_generate_attachment_metadata()` generates all image sub-sizes synchronously in PHP, which can exceed timeout limits. The `X-WP-Upload-Attachment-ID` response header is set before this so the browser can recover even if the request times out mid-way through sub-size generation. In TypeScript, implement image processing as a background job (queue) rather than inline in the upload HTTP handler.

### 11.5 Auto-save in the grid details panel

The attachment details sidebar saves changes immediately on blur of each field, without a submit button. Each blur fires an AJAX request (`wp_ajax_save-attachment`). In TypeScript, implement this as optimistic updates with a debounced save, and display a save indicator (spinner → checkmark) per field.

### 11.6 Grid view reads from URL state

On grid view load, `_wpMediaGridSettings.queryVars` bootstraps the initial filter state from the PHP-parsed query string. The JS app then takes full ownership of URL state management (pushState/replaceState). The `s` (search) parameter is explicitly excluded from the PHP-side query vars and handled entirely in JS to avoid full page reloads on every keystroke.

### 11.7 Plupload to modern File API

Plupload is legacy. In a TypeScript rewrite, replace it with the native `File`, `FileReader`, and `XMLHttpRequest` / `fetch` APIs. Use chunked uploads via the `Content-Range` header for large files. Maintain the same multipart field name `async-upload` for compatibility with the server-side handler.

### 11.8 Image editor history pattern

The image editor accumulates operations into a `history` array before committing to disk. This prevents multiple disk reads/writes for intermediate states. Apply the same pattern in TypeScript: batch all operations client-side and send a single `POST` to apply them all in sequence via the server-side image processor.

### 11.9 Permissions checked per-item in bulk operations

Never apply a bulk action to an entire result set without per-item authorization checks. Even if the user can trash all their own attachments, they cannot trash an attachment owned by another user unless they have the `delete_others_posts` capability. Check `delete_post` capability per attachment ID.

### 11.10 `wp_edit_attachments_query_vars` normalization

The PHP function `wp_edit_attachments_query_vars()` takes raw GET parameters and maps them into normalized WP_Query arguments (`post_type=attachment`, `post_status=inherit`, etc.). The TypeScript equivalent should be a pure function that transforms raw filter state into a validated query object. Unknown/invalid parameters are dropped; `post_type` and `post_status` are always hardcoded.

## Section 12: Tovu Reconstruction Notes

### 12.1 Why this exists

This subsystem exists to manage uploads, attachment metadata, and media browsing in one place. It supports both browsing and editing flows, with server-side storage for the actual asset and its derivatives.

### 12.2 What Tovu should preserve

- Attachments as first-class content records with file metadata
- Reliable upload recovery and attachment ID handoff even when long image processing runs
- Per-item authorization for bulk actions and edits
- Query normalization that turns raw filter state into a validated media query

### 12.3 What Tovu can simplify

- Tovu does not need the exact WordPress grid/list split or Plupload compatibility
- Blur-save sidebars can become a more modern details drawer with debounced persistence
- Image processing can move to a background job instead of happening inline in the upload request

### 12.4 Possible Tovu seams

- `src/features/media/` for upload, browse, and edit flows
- `src/core/ports/AttachmentStorePort.ts` for attachment records and metadata
- `src/core/ports/MediaUploadPort.ts` for resilient upload handling
- `src/core/ports/ImageProcessingPort.ts` for resize, crop, and metadata generation

### 12.5 Suggested priority

- `V1`: upload, browse, and attachment metadata persistence
- `Later`: grid/list parity, inline edit UX, and image-editor history semantics
