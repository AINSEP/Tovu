# Media System — Specification

**Source files analyzed:**
- `wp-includes/media.php`
- `wp-includes/class-wp-image-editor.php`
- `wp-includes/class-wp-image-editor-gd.php`
- `wp-includes/class-wp-image-editor-imagick.php`
- `wp-admin/includes/file.php`
- `wp-admin/includes/image.php`
- `wp-includes/post.php` (attachment CRUD)

---

## 1. Overview

The media system is responsible for accepting file uploads, storing them as a special post type called "attachment," generating resized image variants, and producing the HTML markup to display those images on the front end. It also handles audio and video metadata extraction and provides the JavaScript-driven media modal UI.

**Three major concerns:**

1. **Upload pipeline** — a file arrives via HTTP multipart form or is sideloaded from a URL. It is validated (MIME type, size), moved to the uploads directory, and a database record is created.
2. **Image processing pipeline** — after an upload, registered image sub-sizes are generated on disk. Each sub-size record is stored in attachment post meta as `_wp_attachment_metadata`.
3. **Output** — query functions resolve size names to specific files and produce `<img>` tags with `srcset`, `sizes`, `loading`, `decoding`, and `fetchpriority` attributes.

The uploads directory defaults to `wp-content/uploads/YYYY/MM/` where `YYYY` and `MM` correspond to the year and month of the upload.

---

## 2. Attachment Data Type

An attachment is a `WP_Post` record with `post_type = 'attachment'`. The post fields used by the attachment system are:

| `WP_Post` field | Meaning for attachments |
|---|---|
| `ID` | Attachment post ID |
| `post_title` | Display title (often derived from the filename on upload) |
| `post_content` | Long description |
| `post_excerpt` | Caption |
| `post_name` | URL slug |
| `post_parent` | ID of the post this attachment is "attached to" (0 = unattached) |
| `post_mime_type` | Full MIME type, e.g. `image/jpeg`, `audio/mpeg`, `video/mp4` |
| `post_status` | Always `'inherit'` for a normally uploaded attachment |
| `guid` | Absolute URL to the original file (set on upload, not changed by edits) |
| `menu_order` | Used to order gallery items |

### Post meta fields

| Meta key | Value |
|---|---|
| `_wp_attached_file` | File path relative to the uploads base directory, e.g. `2024/06/photo.jpg` |
| `_wp_attachment_metadata` | Serialized array — see structure below |
| `_wp_attachment_image_alt` | Alt text string for images |
| `_wp_attachment_backup_sizes` | Array of backup file names (used by image editor) |
| `_wp_attachment_context` | Optional string context (e.g. `'site-icon'`) |
| `_thumbnail_id` | For audio/video attachments: post ID of the associated cover image |
| `_cover_hash` | MD5 of embedded cover image data, used to detect duplicates |

### `_wp_attachment_metadata` structure

```typescript
interface AttachmentImageMeta {
  aperture: string;
  credit: string;
  camera: string;
  caption: string;
  created_timestamp: number;
  copyright: string;
  focal_length: string;
  iso: string;
  shutter_speed: string;
  title: string;
  orientation: string;  // EXIF orientation value as string, e.g. "1"
  keywords: string[];
}

interface AttachmentSubSizeMeta {
  file: string;         // filename only, e.g. "photo-150x150.jpg"
  width: number;
  height: number;
  "mime-type": string;  // note: hyphenated key
  filesize?: number;    // added in WP 6.0
}

interface AttachmentMetadata {
  // Image-specific
  width?: number;
  height?: number;
  file?: string;        // path relative to uploads basedir, e.g. "2024/06/photo.jpg"
  filesize?: number;
  sizes?: Record<string, AttachmentSubSizeMeta>;
  image_meta?: AttachmentImageMeta;
  original_image?: string;  // filename of un-scaled original if big-image scaling occurred

  // Audio-specific
  dataformat?: string;  // e.g. "mp3"
  channels?: number;
  sample_rate?: number;
  bitrate?: number;
  channelmode?: string;
  bitrate_mode?: string;
  lossless?: boolean;
  encoder_options?: string;
  compression_ratio?: number;
  fileformat?: string;
  length?: number;
  length_formatted?: string;  // e.g. "3:45"
  artist?: string;
  album?: string;
  year?: string;
  genre?: string;
  title?: string;
  mime_type?: string;
  image?: {
    data: string;
    mime: string;
    width?: number;
    height?: number;
  };

  // Video-specific
  // (also has width, height, fileformat, dataformat, length, length_formatted)
  // plus the image thumbnail data above
}
```

**Key invariant:** `sizes[sizeName].file` contains only the filename, not the directory. The directory is always the same as `dirname(file)` at the top level. Sub-sizes are always stored in the same directory as the full-size file.

---

## 3. Upload Handling

### `wp_handle_upload(file, overrides?, time?)`

Handles a file arriving via an HTML form upload (`$_FILES` entry). Delegates to `_wp_handle_upload()` with action `'wp_handle_upload'`.

```typescript
interface UploadFileInput {
  name: string;      // original filename from client
  type: string;      // MIME type provided by browser
  tmp_name: string;  // path to temp file on server
  size: number;      // bytes
  error: number;     // PHP upload error code (0 = success)
}

interface UploadOverrides {
  test_form?: boolean;                  // default true — check $_POST['action']
  test_size?: boolean;                  // default true — reject zero-byte files
  test_type?: boolean;                  // default true — validate MIME type
  mimes?: Record<string, string>;       // custom allowed MIME map; null = use default
  action?: string;                      // expected $_POST['action'] value
  unique_filename_callback?: Function;  // custom function to generate unique filename
  upload_error_handler?: Function;      // custom error handler
  upload_error_strings?: string[];      // custom PHP error code messages
}

interface UploadResult {
  file: string;   // absolute filesystem path to moved file
  url: string;    // public URL
  type: string;   // detected MIME type
  error?: string; // only present on failure
}
```

**Processing steps:**

1. Fire `wp_handle_upload_prefilter` filter on `$file` (allows plugins to modify or reject the file before any checks).
2. Fire `wp_handle_upload_overrides` filter on `$overrides`.
3. If `test_form` is true, verify `$_POST['action'] === action`. Return error if mismatch.
4. If `$file['error'] > 0`, return the corresponding PHP upload error string.
5. Verify the temp file actually exists and was uploaded via HTTP (`is_uploaded_file`). This check cannot be overridden.
6. If `test_size` is true, verify `$file['size'] > 0`.
7. If `test_type` is true, call `wp_check_filetype_and_ext()` to determine `ext`, `type`, and `proper_filename`. If `proper_filename` differs from `$file['name']`, rename the file in-memory. If no valid type is found and the user lacks `'unfiltered_upload'` capability, return an error.
8. Call `wp_upload_dir($time)` to determine the destination directory. If the directory is not writable, return an error.
9. Call `wp_unique_filename()` to avoid collisions. The filename is sanitized and, if it already exists on disk, a numeric suffix is appended (e.g. `photo-1.jpg`).
10. Fire `pre_move_uploaded_file` filter. If it returns non-null, skip the actual move.
11. Move the temp file to `uploads['path'] . '/' . $filename` using `move_uploaded_file`.
12. Set file permissions to match the parent directory (strip executable bits).
13. Compute the public URL as `uploads['url'] . '/' . $filename`.
14. Fire `wp_handle_upload` filter on the result array. The second argument is the string `'upload'`.
15. Return `{ file, url, type }`.

### `wp_handle_sideload(file, overrides?, time?)`

Identical to `wp_handle_upload` except:
- Action string is `'wp_handle_sideload'`.
- Instead of `is_uploaded_file`, uses `is_readable` to verify the temp file.
- Moves the file using `copy` + `unlink` rather than `move_uploaded_file` (to support stream wrappers).
- The `wp_handle_upload` filter receives `'sideload'` as the second argument.

### Upload directory structure

`wp_upload_dir(time?)` returns:

```typescript
interface UploadDir {
  path: string;     // absolute filesystem path, e.g. /var/www/html/wp-content/uploads/2024/06
  url: string;      // public URL, e.g. https://example.com/wp-content/uploads/2024/06
  subdir: string;   // /2024/06
  basedir: string;  // /var/www/html/wp-content/uploads
  baseurl: string;  // https://example.com/wp-content/uploads
  error: string | false;
}
```

By default, `subdir` is `/YYYY/MM` derived from either the provided `$time` parameter or `current_time('mysql')`. If the `upload_path` option is set to a non-empty string, that path is used as `basedir` instead. The `upload_url_path` option overrides `baseurl`. The `upload_dir` filter fires on the returned array.

---

## 4. Attachment Creation

### `wp_insert_attachment(args, file?, parentPostId?, wpError?, fireAfterHooks?)`

Creates a new attachment post. Internally calls `wp_insert_post()` with `post_type` forced to `'attachment'`.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `args` | `object \| string` | required | Post fields; `file` key sets `_wp_attached_file` meta |
| `file` | `string \| false` | `false` | Absolute path; stored in `args['file']` if args is array |
| `parentPostId` | `number` | `0` | Sets `post_parent` |
| `wpError` | `boolean` | `false` | Return `WP_Error` on failure instead of `0` |
| `fireAfterHooks` | `boolean` | `true` | Whether to fire `add_attachment` action |

Returns the new attachment's post ID (integer) on success, `0` or `WP_Error` on failure.

After inserting, the `'add_attachment'` action fires with the attachment ID.

### `wp_generate_attachment_metadata(attachmentId, file)`

Generates the `_wp_attachment_metadata` array for a freshly uploaded file. Called right after `wp_insert_attachment`.

**Logic:**

1. Get the post's MIME type via `get_post_mime_type`.
2. If MIME is `image/heic` or matches `image/*` and `file_is_displayable_image()` returns true:
   - Call `wp_create_image_subsizes(file, attachmentId)` — returns image meta with sub-size data.
3. Else if the attachment is a video (MIME starts with `video/`):
   - Call `wp_read_video_metadata(file)` to extract codec, dimensions, bitrate, duration, embedded cover art.
4. Else if the attachment is audio:
   - Call `wp_read_audio_metadata(file)` to extract ID3 tags, duration, bitrate.
5. If video or audio has embedded cover image data (`metadata['image']['data']`), and the post type supports thumbnails:
   - Hash the image data with MD5. Search for an existing attachment with `_cover_hash` matching that MD5.
   - If found, set `_thumbnail_id` meta to the existing attachment's ID.
   - If not found, upload the cover image via `wp_upload_bits`, insert it as a new attachment, set `_cover_hash` and `_thumbnail_id`.
6. Fire `wp_generate_attachment_metadata` filter on the metadata array. The filter receives `(metadata, attachmentId, context)` where `context` is `'create'`.
7. Return the (possibly filtered) metadata array.

Callers are expected to then pass the returned array to `wp_update_attachment_metadata`.

### `wp_update_attachment_metadata(attachmentId, data)`

Stores (or removes) the `_wp_attachment_metadata` post meta. If `data` is truthy, calls `update_post_meta`. If falsy, calls `delete_post_meta`. Fires `wp_update_attachment_metadata` filter on `data` before storing.

### `wp_create_image_subsizes(file, attachmentId)`

The core function for building image metadata and all sub-sizes. Called by `wp_generate_attachment_metadata`.

**Steps:**

1. Call `wp_getimagesize(file)` to read image dimensions and MIME type. Return empty array if not an image.
2. Build initial `image_meta`:
   ```
   { width, height, file: _wp_relative_upload_path(file), filesize, sizes: {} }
   ```
3. Call `wp_read_image_metadata(file)` to read EXIF/IPTC data. Add as `image_meta['image_meta']` if present.
4. Apply the `big_image_size_threshold` filter. Default threshold is `2560` pixels.
5. **Big image scaling:** If the original image's width or height exceeds the threshold:
   - Load an image editor, resize to `threshold x threshold` (maintaining aspect ratio).
   - The saved file is named with a `-scaled` suffix: e.g. `photo-scaled.jpg`.
   - Call `maybe_exif_rotate()` if EXIF data is present.
   - Replace the `file`, `width`, `height` in `image_meta` to point to the scaled file.
   - The original unscaled file is referenced in `image_meta['original_image']` (filename only).
   - Update `_wp_attached_file` meta to point to the scaled file.
6. **EXIF-only rotation:** If no scaling was needed but EXIF orientation is not `1`, load editor, rotate, save with `-rotated` suffix, update `image_meta`.
7. Call `wp_update_attachment_metadata` with the initial `image_meta` (before sub-sizes are generated). This ensures partial metadata is saved even if sub-size generation fails.
8. Build the list of sizes to create via `wp_get_registered_image_subsizes()`.
9. Apply the `intermediate_image_sizes_advanced` filter to that list.
10. Call `_wp_make_subsizes()`.

### `_wp_make_subsizes(newSizes, file, imageMeta, attachmentId)`

Internal function. Creates the sub-sizes one at a time via `editor->make_subsize()`, saving metadata after each one. This incremental approach means partial progress is preserved if the process is interrupted.

**Steps:**

1. Skip any size names already present in `image_meta['sizes']`.
2. Sort the sizes in the order: `medium`, `large`, `thumbnail`, `medium_large`, then any custom sizes.
3. Load the image editor.
4. Call `maybe_exif_rotate()` if EXIF data is present.
5. For each size: call `editor->make_subsize(sizeData)`. On success, store the result in `image_meta['sizes'][sizeName]` and call `wp_update_attachment_metadata` immediately.
6. If the editor does not have `make_subsize`, fall back to `editor->multi_resize()`.
7. Return the updated `image_meta`.

---

## 5. Image Sizes

### Built-in sizes

The four built-in sizes are stored as options rather than in `$_wp_additional_image_sizes`:

| Size name | Option keys | Default dimensions |
|---|---|---|
| `thumbnail` | `thumbnail_size_w`, `thumbnail_size_h`, `thumbnail_crop` | 150×150, cropped |
| `medium` | `medium_size_w`, `medium_size_h` | 300×300, not cropped |
| `medium_large` | `medium_large_size_w`, `medium_large_size_h` | 768×0 (height unlimited) |
| `large` | `large_size_w`, `large_size_h` | 1024×1024, not cropped |

A value of `0` for either dimension means that dimension is unconstrained.

### `add_image_size(name, width?, height?, crop?)`

Registers a named image size in the global `$_wp_additional_image_sizes` map.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `name` | `string` | required | Unique slug |
| `width` | `number` | `0` | Max width in pixels (absolute value taken) |
| `height` | `number` | `0` | Max height in pixels (absolute value taken) |
| `crop` | `boolean \| [string, string]` | `false` | See crop behavior below |

**Crop behavior:**
- `false` — "soft crop" (scale only). Image is scaled to fit within the bounding box, preserving aspect ratio. The resulting dimensions may be smaller than requested.
- `true` — "hard crop" centered. Image is cropped to exact dimensions using center-center positioning.
- `['left' | 'center' | 'right', 'top' | 'center' | 'bottom']` — hard crop with specified anchor point.

### `remove_image_size(name)`

Removes a size from `$_wp_additional_image_sizes`. Returns `true` if found and removed, `false` if not found.

### `has_image_size(name)`

Returns `true` if the name exists in `$_wp_additional_image_sizes` (does not check built-in sizes).

### `set_post_thumbnail_size(width, height, crop?)`

Alias for `add_image_size('post-thumbnail', width, height, crop)`.

### `get_intermediate_image_sizes()`

Returns an array of all registered size names: `['thumbnail', 'medium', 'medium_large', 'large', ...customSizeNames]`. The `intermediate_image_sizes` filter fires on this array.

### `wp_get_registered_image_subsizes()`

Returns a normalized map of all registered sizes with their current dimensions, sourcing built-in sizes from options and custom sizes from `$_wp_additional_image_sizes`. Sizes where both width and height are `0` are excluded.

```typescript
type RegisteredImageSubsizes = Record<string, {
  width: number;
  height: number;
  crop: boolean | [string, string];
}>;
```

---

## 6. Image Generation

### `image_resize_dimensions(origW, origH, destW, destH, crop?)`

The core dimension calculator. Returns parameters suitable for passing to an image resampling function, or `false` if the image should not be resized (already at or smaller than destination, or dimensions are invalid).

**Return value when not `false`:**
```
[dst_x, dst_y, src_x, src_y, dst_w, dst_h, src_w, src_h]
```
These eight values correspond directly to the arguments of `imagecopyresampled` (GD):
- `dst_x`, `dst_y` — destination canvas offset (always 0, 0)
- `src_x`, `src_y` — where to start reading from the source (for cropping)
- `dst_w`, `dst_h` — dimensions of the output image
- `src_w`, `src_h` — dimensions of the region being copied from source

**Scale (no crop):**
- Compute constrained dimensions via `wp_constrain_dimensions`. If the result is within 1px of the original, return `false` (effectively a no-op, controlled by `wp_image_resize_identical_dimensions` filter).

**Crop:**
- Compute `new_w`, `new_h` as min of destination and original dimensions.
- Compute `size_ratio = max(new_w/orig_w, new_h/orig_h)`.
- `crop_w = round(new_w / size_ratio)`, `crop_h = round(new_h / size_ratio)`.
- Map crop anchor (`left`, `center`, `right`, `top`, `bottom`) to `src_x` and `src_y` pixel offsets.

The `image_resize_dimensions` filter fires before calculation and can short-circuit the entire function.

### `wp_constrain_dimensions(currentW, currentH, maxW?, maxH?)`

Computes constrained dimensions while maintaining aspect ratio. If only one constraint is provided (the other is `0`), only that axis is constrained. Uses the "larger ratio" logic for a snug fit and rounds fractional pixels up by 1 if within 1px of the target. Returns `[w, h]`.

### `image_make_intermediate_size(file, width, height, crop?)`

Creates a single intermediate size using the image editor pipeline. Returns the sub-size metadata array (without `path`) on success, `false` on failure.

---

## 7. WP_Image_Editor

### Abstract interface

Each instance handles exactly one file. The constructor takes `file` (path). All operations mutate internal state. `save()` writes to disk.

```typescript
abstract class WP_Image_Editor {
  protected file: string;
  protected size: { width: number; height: number } | null;
  protected mime_type: string | null;
  protected output_mime_type: string | null;
  protected quality: number | false;

  // Static methods — must be overridden in subclass
  static test(args?: object): boolean;                         // check if implementation can run
  static supports_mime_type(mimeType: string): boolean;        // check MIME support

  // Instance methods — must be overridden (abstract)
  abstract load(): true | WPError;
  abstract save(destFilename?: string, mimeType?: string): SaveResult | WPError;
  abstract resize(maxW: number | null, maxH: number | null, crop?: boolean | [string, string]): true | WPError;
  abstract multi_resize(sizes: SizeSpec[]): Record<string, SubSizeMeta>;
  abstract crop(srcX: number, srcY: number, srcW: number, srcH: number, dstW?: number, dstH?: number, srcAbs?: boolean): true | WPError;
  abstract rotate(angle: number): true | WPError;
  abstract flip(horz: boolean, vert: boolean): true | WPError;
  abstract stream(mimeType?: string): true | WPError;

  // Concrete methods in base class
  get_size(): { width: number; height: number } | null;
  get_quality(): number;
  set_quality(quality?: number, dims?: { width: number; height: number }): true | WPError;
  generate_filename(suffix?: string | '', destPath?: string, extension?: string): string;
  get_suffix(): string | false;
  maybe_exif_rotate(): boolean | WPError;
  get_output_format(filename?: string, mimeType?: string): [string | null, string, string]; // [filename, ext, mime]
}

interface SaveResult {
  path: string;
  file: string;
  width: number;
  height: number;
  "mime-type": string;
  filesize: number;
}

interface SizeSpec {
  width?: number;
  height?: number;
  crop?: boolean | [string, string];
}
```

### Quality defaults

| MIME type | Default quality |
|---|---|
| `image/jpeg` | 82 |
| `image/webp` | 86 |
| All others | 82 |

Quality 0 is coerced to 1. Quality outside [1, 100] after filtering resets to the default. The `wp_editor_set_quality` filter fires when no explicit quality is set. For JPEG, the legacy `jpeg_quality` filter also fires (with context `'image_resize'`).

### `generate_filename(suffix?, destPath?, extension?)`

Builds the output filename. If `suffix` is provided (non-empty string), appends `-{suffix}` before the extension. If `suffix` is `null`, auto-generates the suffix as `{width}x{height}`. If `suffix` is `''` (empty string), no suffix is appended. The extension defaults to the source file's extension. The directory defaults to the source file's directory.

### `maybe_exif_rotate()`

Reads EXIF `Orientation` from a JPEG file (requires `exif_read_data`). Maps orientation values to transform calls:
- `2` → `flip(false, true)` (horizontal flip)
- `3` → `flip(true, true)` (180°)
- `4` → `flip(true, false)` (vertical flip)
- `5` → `rotate(90)` then `flip(true, false)`
- `6` → `rotate(270)` (90° clockwise)
- `7` → `rotate(90)` then `flip(false, true)`
- `8` → `rotate(90)` (90° counter-clockwise)

The `wp_image_maybe_exif_rotate` filter fires on the orientation value before the switch statement.

### `WP_Image_Editor_GD`

Extends `WP_Image_Editor`. Backed by the PHP `gd` extension.

**`test(args?)`:** Checks `extension_loaded('gd')` and `gd_info()`. If `args['methods']` includes `'rotate'`, also checks for `imagerotate()`.

**`supports_mime_type(mimeType)`:** Maps to GD image type constants: `IMG_JPG`, `IMG_PNG`, `IMG_GIF`, `IMG_WEBP`, `IMG_AVIF`. For AVIF, also requires `imageavif()`.

**`load()`:**
1. Read entire file contents into memory via `file_get_contents`.
2. Prefer `imagecreatefromwebp`/`imagecreatefromavif` for those formats, fall back to `imagecreatefromstring`.
3. Enable alpha blending off and save-alpha on, so transparency is preserved during operations.
4. Set quality via `set_quality`.

**`resize(maxW, maxH, crop?)`:** Calls `_resize()`, which calls `image_resize_dimensions()`, then `imagecopyresampled`. Replaces `$this->image` resource with the result.

**`make_subsize(sizeData)`:** Calls `_resize()` then `_save()`, restoring original size after each call. Does not replace the main `$this->image`. Saves metadata to disk but strips `path` from the returned array.

**`crop(srcX, srcY, srcW, srcH, dstW?, dstH?, srcAbs?)`:** Creates a new canvas, calls `imagecopyresampled`. If `srcAbs` is true, converts absolute coordinates to width/height.

**`rotate(angle)`:** Uses `imagerotate()`. Creates a transparent background for non-rectangular results after rotation. Updates `$this->size`.

**`flip(horz, vert)`:** Uses negative source dimensions in `imagecopyresampled` to achieve flipping.

**`save(destFilename?, mimeType?)`:** Calls `_save()`, updates `$this->file` and `$this->mime_type` with the saved result.

**`_save(image, filename?, mimeType?)`:** Resolves output format via `get_output_format`. Generates a filename if none is provided. Calls `imageinterlace` if progressive output is enabled (`image_save_progressive` filter, default `false`). Dispatches to the correct GD function (`imagejpeg`, `imagepng`, `imagegif`, `imagewebp`, `imageavif`). Sets file permissions. Returns the `SaveResult` array. The `image_make_intermediate_size` filter fires on the filename just before returning (used to get the final basename).

**Special WebP quality:** For lossless WebP images (detected via `wp_get_webp_info`), the quality is set to `IMG_WEBP_LOSSLESS` if the constant exists.

**`stream(mimeType?)`:** Outputs directly to stdout with an appropriate `Content-Type` header. For unsupported types, falls back to JPEG.

### `WP_Image_Editor_Imagick`

Extends `WP_Image_Editor`. Backed by the PHP `imagick` extension (wrapping ImageMagick).

**`test(args?)`:**
- Requires `imagick` extension, `Imagick` and `ImagickPixel` classes.
- Requires Imagick PHP extension >= 2.2.0.
- Requires a specific set of Imagick methods: `clear`, `destroy`, `valid`, `getimage`, `writeimage`, `getimageblob`, `getimagegeometry`, `getimageformat`, `setimageformat`, `setimagecompression`, `setimagecompressionquality`, `setimagepage`, `setoption`, `scaleimage`, `cropimage`, `rotateimage`, `flipimage`, `flopimage`, `readimage`, `readimageblob`.
- Requires `imagick::COMPRESSION_JPEG`.

**`supports_mime_type(mimeType)`:** Uses `Imagick::queryFormats()` with the uppercased extension. Also requires `setIteratorIndex` for non-JPEG formats.

**`load()`:**
- Creates `new Imagick()`, reads via `readImage` or `readImageBlob` (for streams). For PDFs, uses `pdf_load_source` and removes the alpha channel afterwards.
- Calls `setIteratorIndex(0)` to select the first frame of animated images.
- Updates size from `getImageGeometry()`.

**`resize(maxW, maxH, crop?)`:** For crop: delegates to `crop()`. For scale: calls `thumbnail_image()`.

**`thumbnail_image(dstW, dstH, filterName?, stripMeta?)`:**
- The primary resize path.
- Applies the `image_strip_meta` filter (default `true`) to strip metadata but preserve color profiles (`icc`, `icm`, `iptc`, `exif`, `xmp`).
- For large downscales (ratio < 0.111 and result > 128px), first does a `sampleImage` pass at 5x the destination size for efficiency.
- Uses `resizeImage` with `FILTER_TRIANGLE` filter if available, falls back to `scaleImage`.
- For JPEG: applies `unsharpMaskImage(0.25, 0.25, 8, 0.065)` and sets `jpeg:fancy-upsampling` to `off`.
- For PNG: sets compression options; handles indexed PNGs specially (quantize to 256 colors, manage alpha/tRNS chunk, optionally force `png8` format for grayscale).
- The `image_max_bit_depth` filter controls the maximum bit depth of the output.

**`make_subsize(sizeData)`:** Uses `getImage()` to snapshot the current image, resizes, saves, then restores both `$this->image` and `$this->size`. Critical: Imagick's approach creates a copy of the current image for each sub-size, preventing state leakage between sub-sizes.

**`crop(srcX, srcY, srcW, srcH, dstW?, dstH?, srcAbs?)`:** Uses `cropImage` and `setImagePage`. If `dstW`/`dstH` differ from the crop region, calls `thumbnail_image()` to scale.

**`rotate(angle)`:** Uses `rotateImage(new ImagickPixel('none'), 360 - angle)`. Note: Imagick rotates clockwise, GD rotates counter-clockwise, so the angle is reversed. Sets EXIF orientation to `ORIENTATION_TOPLEFT` after rotation.

**`flip(horz, vert)`:** Uses `flipImage()` for horizontal axis, `flopImage()` for vertical axis.

**`_save(image, filename?, mimeType?)`:** Resolves output format, sets image format, handles progressive (interlaced) output via `setInterlaceScheme`, writes via `write_image()`. Restores original format and interlace settings after saving.

**`stream(mimeType?)`:** Temporarily changes the image format, outputs `getImageBlob()` with a `Content-Type` header, then restores the original format.

### Editor selection: `wp_get_image_editor(path, args?)`

1. Determines the MIME type from the file extension if not in `args`.
2. Checks for output format remapping via `wp_get_image_editor_output_format`.
3. Calls `_wp_image_editor_choose(args)` to find the right class.
4. Instantiates the class, calls `load()`.
5. Returns the editor on success, `WP_Error` if no editor can be found or loading fails.

### `_wp_image_editor_choose(args?)`

The `wp_image_editors` filter provides the ordered list of implementation class names. Default order: `['WP_Image_Editor_Imagick', 'WP_Image_Editor_GD']`. Imagick is preferred when available.

For each implementation in order:
1. Call `static::test(args)`. Skip if false.
2. If `args.mime_type` is set, call `static::supports_mime_type(args.mime_type)`. Skip if false.
3. If `args.methods` is set, verify all requested methods exist on the class. Skip if not.
4. If both `args.mime_type` and `args.output_mime_type` are set and they differ, check if the implementation supports the output type too. If not, mark this implementation as a fallback candidate and continue looking for a better one.
5. The first implementation that passes all checks is selected.

Results are cached in `wp_cache` under `'wp_image_editor_choose'` / `'image_editor'` for `DAY_IN_SECONDS`.

### `wp_get_image_editor_output_format(filename, mimeType)`

Fires the `image_editor_output_format` filter which allows mapping an input MIME type to a different output MIME type. For example, converting JPEG to WebP on upload. The filter receives the full path and source MIME type. Returns `Record<string, string>` mapping source MIME to output MIME.

---

## 8. Image Output Functions

### `wp_get_attachment_image_src(attachmentId, size?, icon?)`

Returns image source data for use in output, or `false`.

```typescript
type ImageSrcResult = [
  src: string,
  width: number,
  height: number,
  isIntermediate: boolean
] | false;
```

Process:
1. Calls `image_downsize(attachmentId, size)`.
2. If no image found and `icon` is `true`, falls back to `wp_mime_type_icon()` (SVG icon). SVG icons are given fixed dimensions of 48×64.
3. Fires `wp_get_attachment_image_src` filter on the result.

### `image_downsize(id, size?)`

The internal resolution function. Does not generate new files—only finds existing ones.

1. Check the `image_downsize` filter first. If it returns truthy, return that (allows CDN/external processing plugins to short-circuit).
2. Get the attachment URL and metadata.
3. If the attachment is not an image but has a `sizes['full']` entry in metadata, use that.
4. Try `image_get_intermediate_size(id, size)` to find an exact or closest matching sub-size.
5. For `size === 'thumbnail'`, if no intermediate size, check the legacy `meta['thumb']` fallback.
6. If no dimensions found at all, use the original image dimensions from metadata.
7. Run the result through `image_constrain_size_for_editor` to apply `$content_width` constraints if appropriate.
8. Return `[url, width, height, isIntermediate]`.

### `image_get_intermediate_size(postId, size?)`

Looks up a specific sub-size from the attachment's stored metadata.

- **Named size (string):** Direct lookup in `imagedata['sizes'][size]`.
- **Array size `[w, h]`:** Scans all stored sizes for an exact match first, then looks for the smallest size that is at least `w×h` with matching aspect ratio (within 1px). Falls back to `thumbnail` if requested dimensions are smaller than thumbnail. Returns `false` if nothing suitable exists.
- Returns `{ file, width, height, path, url }` — `path` and `url` are computed from the upload directory and `imagedata['file']`.
- Fires `image_get_intermediate_size` filter.

### `wp_get_attachment_image(attachmentId, size?, icon?, attr?)`

Returns the full `<img>` HTML element.

**Default attributes:**
- `src` — the resolved image URL
- `class` — `"attachment-{size} size-{size}"` where size arrays become `{w}x{h}`
- `alt` — from `_wp_attachment_image_alt` meta (HTML-stripped)
- `width`, `height` — set from resolved image dimensions (can be overridden by `attr`)
- `decoding` — `'async'` by default (can be overridden)
- `loading` — `'lazy'` or `'eager'` based on position on page (see loading optimization)
- `fetchpriority` — `'high'` for the first significant image on the page
- `srcset` — computed by `wp_calculate_image_srcset`
- `sizes` — computed by `wp_calculate_image_sizes`; if lazy-loaded and `wp_img_tag_add_auto_sizes` filter returns true, `'auto, '` is prepended

The `wp_get_attachment_image_attributes` filter fires on the attribute array.
The `wp_get_attachment_image` filter fires on the final HTML string.
The context for loading optimization is `'wp_get_attachment_image'` by default (overridable via `wp_get_attachment_image_context` filter).

### `wp_get_attachment_image_url(attachmentId, size?, icon?)`

Convenience wrapper — returns `wp_get_attachment_image_src()[0]` or `false`.

### `wp_get_attachment_image_srcset(attachmentId, size?, imageMeta?)`

Returns the `srcset` attribute value string or `false`.

### `wp_calculate_image_srcset(sizeArray, imageSrc, imageMeta, attachmentId?)`

Builds the `srcset` string from all stored sub-sizes plus the full-size original.

**Rules:**
- Only includes sizes with the same aspect ratio as the requested size (within 1px tolerance).
- Excludes sizes wider than `max_srcset_image_width` (default 2048, `max_srcset_image_width` filter).
- For edited images (filenames containing `-e{13digits}`), only includes sub-sizes from the same edit session.
- **GIF exception:** If the thumbnail MIME type is `image/gif`, omits the full-size from `srcset` to prevent animated GIFs from appearing where a flat sub-size was requested.
- The `src` image is always placed first in the sources object (iOS 8 bug workaround).
- Returns `false` if fewer than 2 valid sources are found (a single-item srcset is useless).
- Format: `"url1 w1w, url2 w2w, ..."` where `w` descriptors are pixel widths.
- The `wp_calculate_image_srcset` filter fires on the `sources` array before it is serialized.

### `wp_calculate_image_sizes(size, imageSrc?, imageMeta?, attachmentId?)`

Produces the `sizes` attribute value. Default: `"(max-width: {width}px) 100vw, {width}px"`.
The `wp_calculate_image_sizes` filter fires on the result.

### `wp_get_attachment_image_sizes(attachmentId, size?, imageMeta?)`

Thin wrapper around `wp_calculate_image_sizes` that resolves dimensions from the attachment.

### `wp_get_attachment_url(attachmentId?)`

Retrieves the URL for the original attachment file:
1. Read `_wp_attached_file` meta.
2. If the path is absolute (starts with `basedir`), replace `basedir` with `baseurl`.
3. If it contains `wp-content/uploads`, build the URL from `baseurl + relative_path + basename`.
4. Otherwise, treat the path as relative to `basedir`.
5. Fall back to `get_the_guid()` if none of the above produce a URL.
6. On SSL front end, scheme is set to HTTPS.
7. The `wp_get_attachment_url` filter fires.

### `the_post_thumbnail(size?, attr?)` / `get_the_post_thumbnail(postId?, size?, attr?)`

`get_the_post_thumbnail` retrieves `_thumbnail_id` meta from the post, then calls `wp_get_attachment_image`. The `wp-post-image` CSS class is added to the image by temporarily registering a filter on `wp_get_attachment_image_attributes`. The context for loading optimization is set to `'the_post_thumbnail'` via the `wp_get_attachment_image_context` filter.

Fires `begin_fetch_post_thumbnail_html` and `end_fetch_post_thumbnail_html` actions.
The `post_thumbnail_html` filter fires on the final HTML.

---

## 9. File Type Handling

### `wp_check_filetype(filename, mimes?)`

Checks a filename's extension against a MIME map. Does not examine file contents.

```typescript
interface FiletypeResult {
  ext: string | false;
  type: string | false;
}
```

The `mimes` parameter defaults to `wp_get_mime_types()`. Iterates the MIME map keys (pipe-separated extension patterns) and finds the first match.

### `wp_check_filetype_and_ext(file, filename, mimes?)`

More thorough version that reads file contents to validate the claimed extension.

```typescript
interface FiletypeAndExtResult {
  ext: string | false;
  type: string | false;
  proper_filename: string | false;  // corrected name if extension was wrong
}
```

Uses `finfo` (if available) or `mime_content_type` to read the real MIME type from the file. If the real type does not match the claimed extension, `proper_filename` contains the corrected name (with the correct extension).

Special handling for image files: `wp_getimagesize` is used as an additional signal.

The `wp_check_filetype_and_ext` filter fires on the result.

### `wp_get_mime_types()`

Returns the full MIME map (all types, not filtered by user capability). Keys are pipe-separated extension patterns, values are MIME type strings.

The `wp_get_mime_types` filter fires.

Example entries:
```
'jpg|jpeg|jpe'  => 'image/jpeg'
'png'           => 'image/png'
'gif'           => 'image/gif'
'webp'          => 'image/webp'
'avif'          => 'image/avif'
'heic'          => 'image/heic'
'mp3|m4a|m4b'  => 'audio/mpeg'
'mp4|m4v'       => 'video/mp4'
'pdf'           => 'application/pdf'
```

### `get_allowed_mime_types(user?)`

Filters `wp_get_mime_types()` through the `upload_mimes` filter. By default, removes SVG and some other types unless `unfiltered_upload` capability is granted. This is the list used for upload validation.

---

## 10. Media Templates and the Media Modal

### `wp_enqueue_media(args?)`

Enqueues all scripts, styles, settings, and Underscore.js templates needed for the Backbone-based media library UI. Idempotent — only runs once per page (checks `did_action('wp_enqueue_media')`).

**Scripts enqueued:** `media-editor`, `media-audiovideo`, `mce-view` (admin only), `image-edit` (admin only), `wp-playlist`.
**Styles enqueued:** `media-views`, `imgareaselect`, `wp-mediaelement`.
**Templates:** `wp_print_media_templates` is added to `admin_footer`, `wp_footer`, `customize_controls_print_footer_scripts`.

**Settings object (`_wpMediaViewsL10n.settings`):**

```typescript
interface MediaViewSettings {
  tabs: Record<string, string>;        // extra tabs from media_upload_tabs filter
  tabUrl: string;
  mimeTypes: Record<string, string>;   // label per MIME group
  captions: boolean;                   // from disable_captions filter
  nonce: {
    sendToEditor: string;
    setAttachmentThumbnail: string;
  };
  post: {
    id: number;
    nonce?: string;                    // update-post_{id}
    featuredImageId?: number;          // -1 if no featured image
  };
  defaultProps: {
    link: string;    // image_default_link_type option
    align: string;   // image_default_align option
    size: string;    // image_default_size option
  };
  attachmentCounts: {
    audio: 0 | 1;
    video: 0 | 1;
  };
  oEmbedProxyUrl: string;
  embedExts: string[];
  embedMimes: Record<string, string>;
  contentWidth: number | null;
  months: Array<{ year: number; month: number; text: string }>;
  mediaTrash: 0 | 1;
  infiniteScrolling: 0 | 1;
}
```

The `media_view_settings` and `media_view_strings` filters fire on the settings and strings objects respectively.

**Plupload settings (`_wpPluploadSettings`):**

```typescript
interface PluploadSettings {
  defaults: {
    file_data_name: string;   // 'async-upload'
    url: string;              // admin_url('async-upload.php')
    filters: {
      max_file_size: string;  // e.g. "52428800b"
      mime_types: [{ extensions: string }];
    };
    multipart_params: {
      action: string;         // 'upload-attachment'
      _wpnonce: string;
    };
    multi_selection?: boolean;    // false on iOS 7
    webp_upload_error?: boolean;
    avif_upload_error?: boolean;
    heic_upload_error?: boolean;
  };
  browser: {
    mobile: boolean;
    supported: boolean;
  };
  limitExceeded: boolean;   // multisite storage quota
}
```

### `wp_prepare_attachment_for_js(attachment)`

Serializes an attachment post into the JavaScript Attachment model format. Used by both the REST API attachment endpoint and the initial media library data dump.

```typescript
interface AttachmentJSModel {
  id: number;
  title: string;
  filename: string;
  url: string;
  link: string;
  alt: string;
  author: string;
  authorName: string;
  authorLink?: string;
  description: string;
  caption: string;
  name: string;
  status: string;
  uploadedTo: number;
  uploadedToTitle?: string;
  uploadedToLink?: string;
  date: number;           // Unix timestamp * 1000
  modified: number;       // Unix timestamp * 1000
  menuOrder: number;
  mime: string;
  type: string;           // e.g. 'image'
  subtype: string;        // e.g. 'jpeg'
  icon: string;
  dateFormatted: string;
  filesizeInBytes?: number;
  filesizeHumanReadable?: string;
  context: string;
  nonces: { update: string | false; delete: string | false; edit: string | false };
  editLink: string | false;
  meta: object | false;

  // Image-only
  width?: number;
  height?: number;
  orientation?: 'landscape' | 'portrait';
  originalImageURL?: string;
  originalImageName?: string;
  sizes?: Record<string, {
    height: number;
    width: number;
    url: string;
    orientation: 'landscape' | 'portrait';
  }>;

  // Video-only
  // (also width/height from above)
  fileLength?: string;
  fileLengthHumanReadable?: string;
  image?: { src: string; width: number; height: number };
  thumb?: { src: string; width: number; height: number };

  // Audio-only
  // (also meta, fileLength, fileLengthHumanReadable, image, thumb)

  // Media states
  mediaStates?: string;

  // For compat markup
  compat?: { item: string; meta: string };
}
```

The `wp_prepare_attachment_for_js` filter fires on the response array.

---

## 11. Audio and Video

### Supported extensions

Audio (default, `wp_audio_extensions` filter): `mp3`, `ogg`, `flac`, `m4a`, `wav`
Video (default, `wp_video_extensions` filter): `mp4`, `m4v`, `webm`, `ogv`, `flv`

### `[audio]` shortcode

Registered as `wp_audio_shortcode`. Renders a `<audio controls>` element with `<source>` elements for each format attribute. The `src` attribute is the primary source; additional sources can be added as `mp3="url"`, `ogg="url"`, etc.

Attributes:
- `src`, `loop`, `autoplay`, `muted` (default `'false'`), `preload` (default `'none'`), `class`, `style`
- Per-format: `mp3`, `ogg`, `flac`, `m4a`, `wav`

If no `src` is provided and no per-format URLs match, falls back to the first audio attachment of the current post.

Enqueues `wp-mediaelement` style and script when `wp_audio_shortcode_library` filter returns `'mediaelement'` (default).

A no-JS fallback anchor is appended via `wp_mediaelement_fallback`.

The `wp_audio_shortcode_override` filter can replace the entire output.
The `wp_audio_shortcode` filter fires on the final HTML.

### `[video]` shortcode

Registered as `wp_video_shortcode`. Renders a `<div class="wp-video"><video controls>` with `<source>` elements.

Attributes:
- `src`, `poster`, `loop`, `autoplay`, `muted`, `preload` (default `'metadata'`), `width` (default 640), `height` (default 360), `class`
- Per-format: `mp4`, `m4v`, `webm`, `ogv`, `flv`
- YouTube and Vimeo URLs in `src` are detected and passed through (MediaElement.js handles them via plugins).

Width is constrained to `$content_width` in theme context or to 640 in admin context.

The `wp_video_shortcode_override` and `wp_video_shortcode` filters fire.

### `[playlist]` shortcode

Registered as `wp_playlist_shortcode`. Queries attachments by MIME group (`audio` or `video`) and renders a JSON data blob inside `.wp-playlist-script` which is consumed by the `wp-playlist.js` script.

Track data shape:
```typescript
interface PlaylistTrack {
  src: string;
  type: string;
  title: string;
  caption: string;
  description: string;
  meta: {
    artist?: string;
    album?: string;
    genre?: string;
    year?: string;
    length_formatted?: string;
  };
  image?: { src: string; width: number; height: number };
  thumb?: { src: string; width: number; height: number };
  dimensions?: {
    original: { width: number; height: number };
    resized: { width: number; height: number };
  };
}

interface PlaylistData {
  type: 'audio' | 'video';
  tracklist: boolean;
  tracknumbers: boolean;
  images: boolean;
  artists: boolean;
  tracks: PlaylistTrack[];
}
```

### Audio/video metadata structure

`wp_read_audio_metadata` and `wp_read_video_metadata` return data in roughly this shape (stored as `_wp_attachment_metadata`):

```typescript
interface AudioMetadata {
  dataformat: string;
  channels: number;
  sample_rate: number;
  bitrate: number;
  channelmode: string;
  bitrate_mode: string;
  lossless: boolean;
  encoder_options: string;
  compression_ratio: number;
  fileformat: string;
  length: number;
  length_formatted: string;  // "M:SS"
  artist: string;
  album: string;
  year: string;
  genre: string;
  title: string;
  mime_type: string;
  image: { data: string; mime: string };
  filesize: number;
}

interface VideoMetadata {
  dataformat: string;
  length: number;
  length_formatted: string;
  width: number;
  height: number;
  fileformat: string;
  mime_type: string;
  image: { data: string; mime: string };
  filesize: number;
}
```

### `wp_mediaelement_fallback(url)`

Returns `<a href="{url}">{url}</a>` as a no-JS fallback for the MediaElement.js player. The `wp_mediaelement_fallback` filter fires on the output.

---

## 12. Deletion

### `wp_delete_attachment(postId, forceDelete?)`

| Parameter | Default | Notes |
|---|---|---|
| `postId` | required | |
| `forceDelete` | `false` | Bypass Trash; when false, moves to Trash if `MEDIA_TRASH` is enabled |

Returns the deleted `WP_Post` object on success, `false` or `null` on failure.

**Steps when permanently deleting:**

1. The `pre_delete_attachment` filter fires; if non-null, return early with that value.
2. Clear trash meta: delete `_wp_trash_meta_status` and `_wp_trash_meta_time`.
3. Read `_wp_attachment_metadata` and `_wp_attachment_backup_sizes` meta.
4. Get the absolute file path via `get_attached_file()`.
5. Fire the `delete_attachment` action.
6. Delete all taxonomy term relationships (categories, tags, any attachment taxonomies).
7. Delete all `_thumbnail_id` post meta pointing to this attachment's ID from any post.
8. Delete all comments on this post.
9. Delete all post meta for this post.
10. Fire `delete_post` action. Delete the row from `wp_posts`. Fire `deleted_post` action.
11. Call `wp_delete_attachment_files()`.
12. Flush the post cache.

### `wp_delete_attachment_files(postId, meta, backupSizes, file)`

Deletes the physical files from disk. All deletions use `wp_delete_file_from_directory` (which verifies the target file is actually inside the expected directory as a security measure).

**Files deleted:**
1. The legacy `meta['thumb']` file (if it is not referenced by another attachment's metadata).
2. Every file in `meta['sizes']` — all generated sub-sizes.
3. The original un-scaled file `meta['original_image']` (if present, when big-image scaling occurred).
4. Every file in `backupSizes` (stored as `_wp_attachment_backup_sizes`, created by the in-browser image editor).
5. The main attached file (`$file` itself).

All deletions are relative to the uploads `basedir` for safety.

### Trash behavior

If `MEDIA_TRASH` constant is `true` and `EMPTY_TRASH_DAYS > 0` and `forceDelete` is `false` and the attachment is not already in the trash, `wp_trash_post()` is called instead of permanent deletion. The physical files are NOT deleted when trashing.

---

## 13. Key Hooks and Filters

### Filters

| Hook name | Signature | Purpose |
|---|---|---|
| `wp_handle_upload_prefilter` | `(file: FileArray): FileArray` | Modify or reject a file before upload validation. Setting `file['error']` to a string causes rejection. |
| `wp_handle_sideload_prefilter` | `(file: FileArray): FileArray` | Same, for sideloads. |
| `wp_handle_upload_overrides` | `(overrides: object, file: FileArray): object` | Modify the overrides after prefilter. |
| `pre_move_uploaded_file` | `(null, file, newFile, type): mixed` | Short-circuit the actual file move. Return non-null to skip moving. |
| `wp_handle_upload` | `(upload: {file, url, type}, context: string): object` | Modify the result of a successful upload. `context` is `'upload'` or `'sideload'`. |
| `upload_mimes` | `(mimes: Record<string, string>): Record<string, string>` | Filter the allowed MIME types for upload. |
| `wp_get_mime_types` | `(mimes: Record<string, string>): Record<string, string>` | Filter all known MIME types (not just allowed). |
| `wp_check_filetype_and_ext` | `(data: {ext, type, proper_filename}, file, filename, mimes): object` | Override MIME detection. |
| `big_image_size_threshold` | `(threshold: number, imagesize, file, attachmentId): number` | Change (or disable with `false`) the 2560px threshold for big-image scaling. |
| `intermediate_image_sizes_advanced` | `(newSizes: Record<string, SizeDef>, imageMeta, attachmentId): object` | Add, remove, or modify the list of sub-sizes to generate during upload. |
| `wp_generate_attachment_metadata` | `(metadata: object, attachmentId: number, context: string): object` | Filter the final metadata before it is returned. `context` is `'create'` or `'update'`. |
| `wp_update_attachment_metadata` | `(data: object, attachmentId: number): object` | Filter metadata before it is written to post meta. |
| `wp_get_attachment_metadata` | `(data: object, attachmentId: number): object` | Filter metadata after it is read from post meta. |
| `image_resize_dimensions` | `(null, origW, origH, destW, destH, crop): array \| null` | Short-circuit dimension calculation. Return an 8-element array to override. |
| `wp_image_resize_identical_dimensions` | `(proceed: false, origW, origH): boolean` | Allow creating sub-sizes with dimensions matching the original. Default false (skip). |
| `wp_editor_set_quality` | `(quality: number, mimeType: string, size: object): number` | Override default quality for a MIME type. |
| `jpeg_quality` | `(quality: number, context: string): number` | Legacy JPEG quality filter. Context is `'image_resize'` or `'edit_image'`. |
| `image_editor_default_mime_type` | `(mimeType: string): string` | Fallback MIME type when the requested one is unsupported. |
| `image_editor_output_format` | `(formats: Record<string, string>, filename, mimeType): object` | Map input MIME to a different output MIME (e.g. convert JPEG to WebP). |
| `image_save_progressive` | `(interlace: false, mimeType: string): boolean` | Enable progressive/interlaced encoding. |
| `image_strip_meta` | `(stripMeta: true): boolean` | Control whether Imagick strips metadata during resize. |
| `image_max_bit_depth` | `(maxDepth: number, imageDepth: number): number` | Control maximum bit depth for Imagick output. |
| `wp_image_editors` | `(editors: string[]): string[]` | Provide a custom ordered list of editor implementations. |
| `intermediate_image_sizes` | `(sizes: string[]): string[]` | Filter the list of intermediate size names. |
| `image_downsize` | `(false, attachmentId, size): array \| false` | Short-circuit image URL resolution. |
| `wp_get_attachment_image_src` | `(image: array \| false, attachmentId, size, icon): array \| false` | Filter image src result. |
| `wp_get_attachment_image_attributes` | `(attr: Record<string, string>, attachment, size): Record<string, string>` | Filter `<img>` attributes. |
| `wp_get_attachment_image` | `(html: string, attachmentId, size, icon, attr): string` | Filter final `<img>` HTML. |
| `wp_get_attachment_image_context` | `(context: string): string` | Override context used for loading optimization. |
| `wp_calculate_image_srcset_meta` | `(imageMeta, sizeArray, imageSrc, attachmentId): object` | Pre-filter image meta before srcset calculation. |
| `wp_calculate_image_srcset` | `(sources: object, sizeArray, imageSrc, imageMeta, attachmentId): object` | Filter the srcset sources map. |
| `max_srcset_image_width` | `(maxWidth: 2048, sizeArray): number` | Maximum width for images included in srcset. |
| `wp_calculate_image_sizes` | `(sizes: string, size, imageSrc, imageMeta, attachmentId): string` | Filter the `sizes` attribute value. |
| `wp_img_tag_add_auto_sizes` | `(enabled: true): boolean` | Control whether `auto` is prepended to `sizes` for lazy images. |
| `wp_lazy_loading_enabled` | `(default: boolean, tagName, context): boolean` | Control lazy loading per tag and context. |
| `wp_img_tag_add_loading_attr` | `(value: string \| false, image, context): string \| false` | Override `loading` attribute value for an image tag. |
| `wp_img_tag_add_decoding_attr` | `(value: string \| false, image, context): string \| false` | Override `decoding` attribute for an image tag. |
| `image_get_intermediate_size` | `(data: object, postId, size): object` | Filter the result of intermediate size lookup. |
| `wp_get_attachment_url` | `(url: string, attachmentId): string` | Filter attachment file URL. |
| `wp_constrain_dimensions` | `(dimensions: [number, number], currentW, currentH, maxW, maxH): [number, number]` | Filter constrained dimensions result. |
| `editor_max_image_size` | `([maxW, maxH], size, context): [number, number]` | Override the max size for editor display. |
| `image_make_intermediate_size` | `(filename: string): string` | Filter the filename of a newly created sub-size. |
| `wp_image_maybe_exif_rotate` | `(orientation: number, file): number` | Override EXIF orientation before rotation. |
| `pre_delete_attachment` | `(null, post, forceDelete): mixed` | Short-circuit attachment deletion. |
| `post_gallery` | `('', attr, instance): string` | Short-circuit gallery shortcode output. |
| `gallery_style` | `(styleAndDiv: string): string` | Filter gallery CSS/wrapper HTML. |
| `img_caption_shortcode` | `('', attr, content): string` | Short-circuit caption shortcode output. |
| `wp_audio_shortcode_override` | `('', attr, content, instance): string` | Short-circuit audio shortcode. |
| `wp_audio_shortcode` | `(html, atts, audio, postId, library): string` | Filter audio shortcode HTML. |
| `wp_video_shortcode_override` | `('', attr, content, instance): string` | Short-circuit video shortcode. |
| `wp_video_shortcode` | `(output, atts, video, postId, library): string` | Filter video shortcode HTML. |
| `post_playlist` | `('', attr, instance): string` | Short-circuit playlist shortcode. |
| `wp_prepare_attachment_for_js` | `(response, attachment, meta): object` | Filter the JS attachment model data. |
| `media_view_settings` | `(settings, post): object` | Filter the media modal settings object. |
| `media_view_strings` | `(strings, post): object` | Filter the media modal i18n strings. |
| `wp_mediaelement_fallback` | `(output: string, url: string): string` | Filter the no-JS fallback HTML. |

### Actions

| Hook name | Parameters | Fires |
|---|---|---|
| `add_attachment` | `(attachmentId: number)` | After a new attachment post is inserted. |
| `delete_attachment` | `(attachmentId: number, post: WP_Post)` | Before an attachment is permanently deleted. |
| `deleted_attachment` | `(attachmentId: number, post: WP_Post)` | After an attachment row is deleted from the database. |
| `wp_enqueue_media` | `()` | After all media scripts/styles have been enqueued. |
| `wp_playlist_scripts` | `(type: string, style: string)` | To enqueue playlist-specific assets. |

---

## 14. TypeScript Interface Sketch

```typescript
// ─── Core Data Types ────────────────────────────────────────────────────────

type CropPosition = 'left' | 'center' | 'right';
type CropPositionY = 'top' | 'center' | 'bottom';
type CropSpec = boolean | [CropPosition, CropPositionY];
type ImageSizeName = string;
type MimeType = string;

interface ImageSizeDefinition {
  width: number;
  height: number;
  crop: CropSpec;
}

interface SubSizeMeta {
  file: string;
  width: number;
  height: number;
  "mime-type": MimeType;
  filesize?: number;
}

interface AttachmentMetadata {
  width?: number;
  height?: number;
  file?: string;
  filesize?: number;
  sizes?: Record<ImageSizeName, SubSizeMeta>;
  image_meta?: Record<string, unknown>;
  original_image?: string;
  // Audio/video fields
  dataformat?: string;
  length?: number;
  length_formatted?: string;
  artist?: string;
  album?: string;
  [key: string]: unknown;
}

interface ImageSrcTuple {
  0: string;   // URL
  1: number;   // width
  2: number;   // height
  3: boolean;  // isIntermediate
}

// ─── Upload ─────────────────────────────────────────────────────────────────

interface FileInput {
  name: string;
  type: string;
  tmp_name: string;
  size: number;
  error: number;
}

interface UploadOverrides {
  test_form?: boolean;
  test_size?: boolean;
  test_type?: boolean;
  mimes?: Record<string, string>;
  action?: string;
  unique_filename_callback?: (dir: string, name: string, ext: string) => string;
  upload_error_handler?: (file: FileInput, message: string) => UploadResult;
}

interface UploadResult {
  file: string;
  url: string;
  type: string;
  error?: string;
}

interface UploadDir {
  path: string;
  url: string;
  subdir: string;
  basedir: string;
  baseurl: string;
  error: string | false;
}

// ─── Image Editor ────────────────────────────────────────────────────────────

interface SaveResult {
  path: string;
  file: string;
  width: number;
  height: number;
  "mime-type": MimeType;
  filesize: number;
}

interface ImageDimensions {
  width: number;
  height: number;
}

interface SizeSpec {
  width?: number | null;
  height?: number | null;
  crop?: CropSpec;
}

interface ImageEditorConstructor {
  new(file: string): ImageEditor;
  test(args?: Record<string, unknown>): boolean;
  supports_mime_type(mimeType: MimeType): boolean;
}

interface ImageEditor {
  load(): true | WPError;
  save(destFilename?: string, mimeType?: MimeType): SaveResult | WPError;
  resize(maxW: number | null, maxH: number | null, crop?: CropSpec): true | WPError;
  multi_resize(sizes: SizeSpec[]): Record<ImageSizeName, Omit<SaveResult, 'path'>>;
  make_subsize(sizeData: SizeSpec): Omit<SaveResult, 'path'> | WPError;
  crop(srcX: number, srcY: number, srcW: number, srcH: number, dstW?: number, dstH?: number, srcAbs?: boolean): true | WPError;
  rotate(angle: number): true | WPError;
  flip(horz: boolean, vert: boolean): true | WPError;
  stream(mimeType?: MimeType): true | WPError;
  get_size(): ImageDimensions | null;
  get_quality(): number;
  set_quality(quality?: number, dims?: ImageDimensions): true | WPError;
  generate_filename(suffix?: string | null, destPath?: string, extension?: string): string;
  get_suffix(): string | false;
  get_output_format(filename?: string, mimeType?: MimeType): [string | null, string, MimeType];
  maybe_exif_rotate(): boolean | WPError;
}

// ─── Media API ───────────────────────────────────────────────────────────────

interface MediaAPI {
  // Upload
  wpHandleUpload(file: FileInput, overrides?: UploadOverrides, time?: string): UploadResult;
  wpHandleSideload(file: FileInput, overrides?: UploadOverrides, time?: string): UploadResult;
  wpUploadDir(time?: string): UploadDir;

  // Attachment CRUD
  wpInsertAttachment(args: Record<string, unknown>, file?: string, parentPostId?: number): number | WPError;
  wpDeleteAttachment(postId: number, forceDelete?: boolean): WPPost | false | null;
  wpGetAttachmentMetadata(attachmentId: number, unfiltered?: boolean): AttachmentMetadata | false;
  wpUpdateAttachmentMetadata(attachmentId: number, data: AttachmentMetadata): boolean | number;
  wpGetAttachmentUrl(attachmentId: number): string | false;
  getAttachedFile(attachmentId: number): string | false;

  // Metadata generation
  wpGenerateAttachmentMetadata(attachmentId: number, file: string): AttachmentMetadata;
  wpCreateImageSubsizes(file: string, attachmentId: number): AttachmentMetadata;

  // Image sizes
  addImageSize(name: string, width?: number, height?: number, crop?: CropSpec): void;
  removeImageSize(name: string): boolean;
  hasImageSize(name: string): boolean;
  setPostThumbnailSize(width?: number, height?: number, crop?: CropSpec): void;
  getIntermediateImageSizes(): string[];
  wpGetRegisteredImageSubsizes(): Record<ImageSizeName, ImageSizeDefinition>;

  // Image editor
  wpGetImageEditor(path: string, args?: Record<string, unknown>): ImageEditor | WPError;
  wpImageEditorSupports(args?: Record<string, unknown>): boolean;

  // Image output
  wpGetAttachmentImage(attachmentId: number, size?: ImageSizeName | [number, number], icon?: boolean, attr?: Record<string, string> | string): string;
  wpGetAttachmentImageSrc(attachmentId: number, size?: ImageSizeName | [number, number], icon?: boolean): ImageSrcTuple | false;
  wpGetAttachmentImageUrl(attachmentId: number, size?: ImageSizeName | [number, number], icon?: boolean): string | false;
  wpGetAttachmentImageSrcset(attachmentId: number, size?: ImageSizeName | [number, number], imageMeta?: AttachmentMetadata): string | false;
  wpGetAttachmentImageSizes(attachmentId: number, size?: ImageSizeName | [number, number], imageMeta?: AttachmentMetadata): string | false;
  wpCalculateImageSrcset(sizeArray: [number, number], imageSrc: string, imageMeta: AttachmentMetadata, attachmentId?: number): string | false;
  wpCalculateImageSizes(size: ImageSizeName | [number, number], imageSrc?: string, imageMeta?: AttachmentMetadata, attachmentId?: number): string | false;
  imageDownsize(id: number, size?: ImageSizeName | [number, number]): ImageSrcTuple | false;
  imageGetIntermediateSize(postId: number, size?: ImageSizeName | [number, number]): { file: string; width: number; height: number; path: string; url: string } | false;
  imageResizeDimensions(origW: number, origH: number, destW: number, destH: number, crop?: CropSpec): [number, number, number, number, number, number, number, number] | false;
  wpConstrainDimensions(currentW: number, currentH: number, maxW?: number, maxH?: number): [number, number];

  // File types
  wpCheckFiletype(filename: string, mimes?: Record<string, string>): { ext: string | false; type: string | false };
  wpCheckFiletypeAndExt(file: string, filename: string, mimes?: Record<string, string>): { ext: string | false; type: string | false; proper_filename: string | false };
  wpGetMimeTypes(): Record<string, string>;
  getAllowedMimeTypes(user?: unknown): Record<string, string>;

  // Media modal
  wpEnqueueMedia(args?: { post?: number | WPPost }): void;
  wpPrepareAttachmentForJs(attachment: number | WPPost): Record<string, unknown> | undefined;
}
```

---

## 15. Design Patterns to Carry Over

1. **Incremental sub-size generation with immediate metadata persistence.** `_wp_make_subsizes` saves metadata after every single sub-size rather than batching. This is intentional: if the server runs out of memory or time mid-process, partial results are not lost. A TypeScript implementation should replicate this pattern: persist state after each unit of work.

2. **Filtered list of editor implementations, not hardcoded.** The editor chosen is determined at runtime by iterating a filterable list and calling `test()` and `supports_mime_type()` on each. The preferred editor (Imagick) is tried first. A TypeScript port should use a provider registry pattern rather than `if/else` chains.

3. **Short-circuit filters before expensive operations.** `image_downsize` checks `apply_filters('image_downsize', false, ...)` before any disk or database work. `image_resize_dimensions` checks its filter before computing. This allows the heavy lifting to be replaced entirely by a CDN or image service without modifying core code.

4. **The `make_subsize` pattern vs `multi_resize`.** `make_subsize` (added in WP 5.3) processes one sub-size at a time and restores original state after each, allowing metadata saves between subsizes and avoiding cumulative state drift. `multi_resize` is kept as a fallback for editors that do not support `make_subsize`. Prefer `make_subsize` for any new implementation.

5. **Big image scaling as a first-class concern.** Images larger than the threshold (default 2560px) are pre-scaled and the scaled version becomes the "full" size for sub-size generation. The original is saved as `original_image` in metadata. This prevents unnecessarily large source images from being served or processed. The threshold is filterable to `false` to disable scaling entirely.

6. **Output format remapping.** The `image_editor_output_format` filter allows the system to transparently convert uploaded images to a different format (e.g., JPEG → WebP) without changing any upload code. The conversion happens during the first `_save` call in the sub-size generation pipeline.

7. **Srcset requires the src to be present and identifiable.** `wp_calculate_image_srcset` verifies that the current `src` image can be found in the attachment's metadata before producing a `srcset`. If the src URL does not match any known sub-size or the full-size filename, it returns `false`. This guards against stale post content referencing images from old edits.

8. **Separate physical file deletion from database record deletion.** `wp_delete_attachment` deletes the database record first, then calls `wp_delete_attachment_files`. The file deletion function uses `wp_delete_file_from_directory` which enforces that deleted files reside within the expected upload directory — a security invariant preventing directory traversal.

9. **Attachment metadata is versioned across edits.** When images are edited in-browser, backup copies are stored as `_wp_attachment_backup_sizes`. These must be explicitly deleted along with the main metadata sizes. A `-e{timestamp}` hash is embedded in edited filenames and used in `wp_calculate_image_srcset` to exclude sub-sizes from prior edit versions.

10. **Loading optimization is position-aware.** The `loading`, `fetchpriority`, and `decoding` attributes are determined by `wp_get_loading_optimization_attributes`, which tracks how many visible images have been output so far in the current request. The first significant image gets `fetchpriority="high"` and no lazy loading; subsequent images get `loading="lazy"`. This state is a request-global counter. A TypeScript implementation needs a per-request counter that can be read and incremented by the image output functions.

11. **MIME type validation uses both extension and file contents.** `wp_check_filetype_and_ext` combines extension-based lookup with `finfo` content sniffing. A discrepancy between the two produces a `proper_filename` that corrects the extension. This double-check prevents MIME confusion attacks where a malicious file has a permitted extension but dangerous contents.

---

## 16. Tovu Reconstruction Notes

### 16.1 Why this exists

Media handling exists to bridge raw file uploads and usable editorial assets. It owns safe ingestion, attachment records, derivative generation, responsive rendering metadata, and the policy checks that prevent storage and image processing from becoming security holes.

### 16.2 What Tovu should preserve

- A distinct attachment/media model rather than treating uploads as anonymous files
- Provider-based image processing with a clean fallback chain
- Incremental persistence for derivative-generation progress and metadata
- MIME validation, path-safety checks, and deletion guardrails as core invariants
- Responsive image metadata as part of the media contract, not an afterthought

### 16.3 What Tovu can simplify

- Tovu does not need WordPress's exact modal UI or every backup-size convention to preserve the core behavior
- If an external image service handles transforms, Tovu can offload heavy processing as long as metadata and URL resolution stay canonical
- Loading-optimization heuristics can start simpler if the render layer still has a stable place to supply them

### 16.4 Possible Tovu seams

- `src/features/media/` for attachments, metadata, and editorial usage
- `src/core/ports/BlobStorePort.ts` for file persistence
- `src/core/ports/ImageTransformPort.ts` for editor/provider selection and derivative generation
- `src/core/ports/MediaMetadataPort.ts` for responsive-image and edit-history metadata

### 16.5 Suggested priority

- `V1`: upload validation, attachment records, derivative generation, responsive metadata, safe deletion
- `Later`: in-browser image edit history, richer loading heuristics, and WordPress-style modal parity
