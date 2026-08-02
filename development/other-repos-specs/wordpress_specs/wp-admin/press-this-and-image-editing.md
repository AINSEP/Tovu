# Press This and Image Editing - WordPress to TypeScript Rewrite Spec

**Source files analyzed:**
- `wp-admin/press-this.php`
- `wp-includes/deprecated.php`
- `wp-admin/admin-ajax.php`
- `wp-admin/includes/image-edit.php`
- `wp-admin/includes/ajax-actions.php`
- `wp-admin/includes/media.php`

## Section 1: Overview

These are two legacy admin surfaces that still matter operationally:

1. **Press This** - `wp-admin/press-this.php` is a bootstrap-and-gate shell for the old bookmarklet-style posting flow. The actual UI and save logic live in the Press This plugin when it is installed and active.
2. **Image editing** - `wp-admin/includes/image-edit.php` provides the attachment image editor UI and the server-side helpers that power crop, rotate, flip, scale, restore, preview, and save flows.

Both surfaces are intentionally conservative. Press This refuses to do anything unless the user can create posts and the plugin is available. The image editor only operates on editable attachments and uses a nonce-protected AJAX loop to keep edits tied to a specific attachment ID.

## Section 2: Entry Points

### 2.1 `GET /wp-admin/press-this.php`

This file defines `IFRAME_REQUEST`, loads `admin.php`, and immediately calls `wp_load_press_this()`.

Flow:

1. Verify the user can `edit_posts`.
2. Verify the user can create posts for the `post` post type.
3. If the Press This plugin is active, include `press-this/class-wp-press-this-plugin.php`, instantiate `WP_Press_This_Plugin`, and call `html()`.
4. If the plugin is not active but the user can `activate_plugins`, offer an activation link or install link with a nonce.
5. Otherwise, die with an installation-required message.

On multisite, if the current site is not the main site, the install prompt points the user back to the main site Press This page.

### 2.2 `POST /wp-admin/admin-ajax.php?action=press-this-save-post`

This is a deprecated compatibility route. `admin-ajax.php` still registers the action, but the implementation is a wrapper in `wp-includes/deprecated.php`.

If the Press This plugin is active, the wrapper loads the plugin class and delegates to `WP_Press_This_Plugin::save_post()`. If not, it returns a JSON error saying the plugin is required.

### 2.3 `POST /wp-admin/admin-ajax.php?action=press-this-add-category`

This is the companion deprecated route for category creation. It follows the same plugin-loaded-or-error behavior as `press-this-save-post`.

### 2.4 `POST /wp-admin/admin-ajax.php?action=image-editor`

This is the operational entry point for the attachment image editor.

The AJAX handler in `wp-admin/includes/ajax-actions.php`:

1. Casts `postid` to an attachment ID.
2. Checks `current_user_can( 'edit_post', $attachment_id )`.
3. Verifies the nonce `image_editor-$attachment_id`.
4. Includes `wp-admin/includes/image-edit.php`.
5. Dispatches on `$_POST['do']`:
   - `open` renders the editor HTML.
   - `scale` saves a scaled image and re-renders the UI.
   - `restore` restores the original image and re-renders the UI.
   - `save` persists the edit and returns JSON success or failure.

### 2.5 `GET /wp-admin/admin-ajax.php?action=imgedit-preview`

The image editor preview image is also fetched over AJAX. `wp_ajax_imgedit_preview()` checks `current_user_can( 'edit_post', $post_id )`, verifies the same `image_editor-$post_id` nonce, and streams the preview through `stream_preview_image()`. The live preview is the visual feedback loop for crop and rotate history.

## Section 3: Authorization

### 3.1 Press This capability gates

`press-this.php` requires both of these checks to pass before it can show the UI:

- `current_user_can( 'edit_posts' )`
- `current_user_can( get_post_type_object( 'post' )->cap->create_posts )`

The shell also checks `current_user_can( 'activate_plugins' )` to decide whether it can offer installation or activation links when the plugin is missing.

### 3.2 Image editor capability gates

The image editor does not trust the browser. It relies on the AJAX handler to enforce:

- `current_user_can( 'edit_post', $attachment_id )`
- `check_ajax_referer( "image_editor-$attachment_id" )`

If the attachment is missing or the user lacks permission, the AJAX handler returns `-1`.

### 3.3 Attachment metadata gate

`wp_image_editor()` refuses to render the UI if the attachment metadata does not contain width and height. In that case it dies with "Image data does not exist. Please re-upload the image."

## Section 4: Press This

`press-this.php` is a launcher, not a full editor implementation. Its job is to either load the plugin UI or show the user how to install or activate the plugin.

### 4.1 Active plugin path

If `is_plugin_active( 'press-this/press-this-plugin.php' )` is true, the file loads the plugin class and calls `WP_Press_This_Plugin::html()`.

That means the owning implementation is outside this file. This script is only the compatibility entry point and access guard.

### 4.2 Missing plugin path

If the plugin is missing but the user can manage plugins, the page constructs one of two actions:

| Case | Action |
|---|---|
| Plugin file exists | Generate an `activate-plugin_...` nonce URL to `plugins.php?action=activate`. |
| Plugin file missing | Generate an `install-plugin_press-this` nonce URL to `update.php?action=install-plugin`. |

If the request is on a non-main network site, the page cannot install the plugin locally and instead tells the user to install it from the main site.

### 4.3 Failure path

If the plugin is unavailable and the user cannot activate plugins, the request dies with a generic "Press This is not available" message. There is no fallback editing UI in core.

### 4.4 Legacy compatibility surface

The deprecated AJAX wrappers in `wp-includes/deprecated.php` still exist for compatibility with older client code. They load the plugin class if available and otherwise return a JSON error. This is the bridge that keeps old Press This interactions from breaking outright when the plugin is installed.

## Section 5: Image Editing

`wp-admin/includes/image-edit.php` is the server-side backbone for attachment image editing. The actual interaction model is a mix of PHP-rendered HTML and AJAX-driven state changes.

### 5.1 UI renderer: `wp_image_editor( $post_id, $msg = false )`

This function renders the editor panel and toolbar for an attachment. It creates a per-attachment nonce, loads the attachment metadata, and decides whether restore controls should appear.

The UI includes:

- Crop controls
- Scale controls
- Rotate menu
- Flip controls
- Undo and redo
- Cancel editing
- Save edits
- Optional thumbnail-specific controls when `image_edit_thumbnails_separately` is enabled

The `image_edit_thumbnails_separately` filter determines whether the editor shows a separate "apply changes to thumbnail" branch.

### 5.2 Preview and save helpers

| Function | Role |
|---|---|
| `wp_stream_image()` | Streams a `WP_Image_Editor` preview to the browser. |
| `wp_save_image_file()` | Saves a file through `WP_Image_Editor` or the deprecated GD path. |
| `image_edit_apply_changes()` | Applies rotate, flip, and crop operations from the serialized history array. |
| `stream_preview_image()` | Rebuilds the preview image with queued history changes and rescales it for display. |
| `wp_restore_image()` | Restores the attachment metadata and on-disk files from backup metadata. |
| `wp_save_image()` | Persists edits, scales, backup data, and generated sub-sizes. |

### 5.3 History and transform model

The editor stores a serialized `history` array that contains rotate, flip, and crop operations. `image_edit_apply_changes()` normalizes the shorthand keys used by the browser and collapses consecutive compatible operations before applying them.

That matters operationally because the preview path and the save path share the same history format. The browser can preview the exact state that will later be saved.

### 5.4 Save behavior

`wp_save_image()` handles two main modes:

1. **Scale mode** - used when the request sends `do=scale` and full dimensions.
2. **History mode** - used when the request sends a serialized `history` payload.

During save, the function:

- Validates the original dimensions and rejects upscaling.
- Generates a new edited filename unless overwrite mode is enabled.
- Writes backup metadata to `_wp_attachment_backup_sizes`.
- Updates the attachment metadata and attached file path.
- Rebuilds sub-sizes as needed.
- Deletes temporary files if the save fails.

The `context=edit-attachment` request parameter changes how the returned thumbnail URL is computed after a successful save.

### 5.5 Restore behavior

`wp_restore_image()` restores the original attachment file and any backed-up intermediate sizes. It also handles overwrite mode differently from non-overwrite mode, which affects whether old edited files are deleted or preserved.

## Section 6: Hooks and Filters

### 6.1 Image editor hooks

| Hook | Role |
|---|---|
| `image_edit_thumbnails_separately` | Enables separate thumbnail editing controls and save targets. |
| `image_editor_save_pre` | Filters the `WP_Image_Editor` instance before streaming or saving. |
| `wp_save_image_editor_file` | Short-circuits or overrides the image save operation. |
| `wp_image_editor_before_change` | Filters the image editor before rotate, flip, or crop operations are applied. |
| `jpeg_quality` | Controls JPEG quality for the deprecated GD save path. |

### 6.2 Deprecated compatibility hooks

The legacy function paths still document and support older filters:

- `image_save_pre`
- `image_edit_before_change`
- `wp_save_image_file`

These are deprecated wrappers around the newer editor-based filters, but they are still part of the operational contract for older plugins.

## Section 7: Operational Implications

1. Press This is legacy by design. The file exists to bridge old bookmarklet flows into a plugin-backed UI, not to provide a new content creation architecture.
2. The image editor is attachment-specific and capability-specific. Every save path is tied to one attachment ID and one nonce.
3. Image edits are stateful and incremental. The browser stores a history stack, then the server replays that history in the same order when previewing or saving.
4. The save path is intentionally defensive. It rejects invalid metadata, rejects upscaling, cleans up temp files on failure, and maintains backup metadata for restore.
5. Any rewrite must preserve the distinction between the PHP-rendered surface and the AJAX handlers, because the UI and the save logic are split across both layers.

---

## Tovu Reconstruction Notes

### Why this exists

This file covers a legacy capture tool and an attachment-specific image editor. The long-term lesson for Tovu is mostly in the image-editing pipeline, not in Press This.

### What Tovu should preserve

- Preview/save parity driven by one transform-history model
- Defensive attachment editing with backups, restore, and no-upscale rules
- Separation between the editor UI and the server-side image-transform execution path

### What Tovu can simplify

- Press This is optional and likely unnecessary for Tovu
- The image editor can be modernized or delegated to a media service as long as backup/restore and transform determinism stay explicit

### Possible Tovu seams

- `src/features/media-editor/`
- `src/core/ports/ImageTransformPort.ts`
- `src/core/ports/MediaMetadataPort.ts`

### Suggested priority

- `V1`: only if Tovu needs in-product image editing
- `Later`: legacy capture/bookmarklet-style tooling
