# WordPress Settings System — TypeScript Rewrite Spec

Source files analyzed:
- `wp-admin/options-general.php`
- `wp-admin/options-writing.php`
- `wp-admin/options-reading.php`
- `wp-admin/options-discussion.php`
- `wp-admin/options-media.php`
- `wp-admin/options-permalink.php`
- `wp-admin/options-privacy.php`
- `wp-admin/options.php`

---

## Section 1: Overview

WordPress provides a unified Settings API for registering, displaying, and saving site configuration. There are seven distinct admin screens accessible under the Settings menu:

| Screen slug | URL | Option group |
|---|---|---|
| General | `options-general.php` | `general` |
| Writing | `options-writing.php` | `writing` |
| Reading | `options-reading.php` | `reading` |
| Discussion | `options-discussion.php` | `discussion` |
| Media | `options-media.php` | `media` |
| Permalinks | `options-permalink.php` | *(handled separately, not via Settings API POST to options.php)* |
| Privacy | `options-privacy.php` | *(handled separately with custom actions)* |

All pages except Permalinks and Privacy post their forms to `options.php` with a hidden `option_page` field that matches the option group name. The `options.php` handler then validates the nonce, checks capability, confirms the group is in the allowed list, and calls `update_option()` for each allowed key.

Every settings page requires the `manage_options` capability except the Privacy page which requires `manage_privacy_options`.

---

## Section 2: The Settings API

The Settings API is a registry pattern. Developers register settings, sections, and fields before the page renders; the rendering functions walk those registries to produce the HTML.

### 2.1 `register_setting(option_group, option_name, args?)`

Registers an option name so that `options.php` will accept it when the matching option group is posted.

Parameters:
- `option_group` — string. The group name (e.g. `'general'`). Must match the value passed to `settings_fields()` on the form page and the `option_page` hidden field.
- `option_name` — string. The key in the `wp_options` table.
- `args` — optional object:
  - `type` — `'string' | 'boolean' | 'integer' | 'number' | 'array' | 'object'`. Default `'string'`.
  - `label` — human-readable label, used in REST API schema.
  - `description` — description string.
  - `sanitize_callback` — callable that receives the raw posted value and returns the sanitized value. Called during `update_option()`.
  - `show_in_rest` — boolean or object describing REST schema. Default `false`.
  - `default` — the default value returned by `get_option()` when the key does not exist.

Internal storage: a global `$wp_registered_settings` dictionary keyed by `option_name`, each entry containing the `option_group` and `args`.

### 2.2 `add_settings_section(id, title, callback, page)`

Registers a named section on a settings page.

Parameters:
- `id` — string identifier for the section (e.g. `'default'`).
- `title` — string displayed as an `<h2>` above the section's fields.
- `callback` — function that renders any introductory HTML between the title and the fields table.
- `page` — the page slug the section belongs to (matches the `option_group`).

Internal storage: `$wp_settings_sections[$page][$id]` containing `{ id, title, callback }`.

### 2.3 `add_settings_field(id, title, callback, page, section?, args?)`

Registers a single field row inside a section on a settings page.

Parameters:
- `id` — unique field identifier.
- `title` — string shown in the `<th>` label cell.
- `callback` — function that renders the `<td>` input HTML.
- `page` — page slug.
- `section` — section id to attach to. Default `'default'`.
- `args` — passed as-is to the callback. May include `label_for` (causes `<th>` to render as `<label for="…">`).

Internal storage: `$wp_settings_fields[$page][$section][$id]` containing `{ id, title, callback, args }`.

### 2.4 `settings_fields(option_group)`

Outputs three hidden `<input>` elements inside the form:
1. `option_page` — value equals `option_group`.
2. `action` — value `'update'`.
3. A nonce field with nonce action `{option_group}-options` (e.g. `general-options`).

Must be called inside the `<form>` tag before the table.

### 2.5 `do_settings_sections(page)`

Iterates `$wp_settings_sections[page]`. For each section:
1. Outputs `<h2>` with the section title (if not empty).
2. Calls the section callback.
3. Opens a `<table class="form-table">`.
4. Calls `do_settings_fields(page, section_id)`.
5. Closes the `</table>`.

### 2.6 `do_settings_fields(page, section)`

Iterates `$wp_settings_fields[page][section]`. For each field:
1. Opens `<tr>`.
2. `<th scope="row">`: if `args.label_for` is set, renders `<label for="{label_for}">{title}</label>`; otherwise renders `{title}` plain.
3. `<td>`: calls the field callback, passing `args`.
4. Closes `</tr>`.

### 2.7 `options.php` POST handler — save flow

When `action === 'update'` in POST:

1. Read `option_page` from POST.
2. Apply `option_page_capability_{option_page}` filter to determine required capability (default `manage_options`).
3. If user does not have that capability, `wp_die()` with 403.
4. Verify nonce for `{option_page}-options`.
5. If `option_page` is not in `$allowed_options`, die with error.
6. Get the list of option names from `$allowed_options[option_page]`.
7. Special pre-processing for `general` page:
   - If `date_format` is the literal string `\c\u\s\t\o\m`, replace it with `date_format_custom`.
   - If `time_format` is the literal string `\c\u\s\t\o\m`, replace it with `time_format_custom`.
   - If `timezone_string` starts with `UTC+` or `UTC-`, extract the numeric offset into `gmt_offset` and set `timezone_string` to `''`.
   - If `timezone_string` is not a valid PHP timezone identifier, reset it to the current stored value and add a settings error.
   - If `WPLANG` is non-empty and user has `install_languages`, attempt to download the language pack.
8. For each option name in the list:
   - Read `$_POST[option]` (trim if scalar, unslash).
   - Call `update_option(option, value)`. `update_option` internally calls the registered `sanitize_callback`.
9. After all options saved: if no settings errors registered, add a generic `'Settings saved.'` success message.
10. Store settings errors in a 30-second transient `settings_errors`.
11. `wp_redirect` back to the referrer URL with `?settings-updated=true` appended.

### 2.8 Admin email change flow (special case in options.php)

When a user changes `admin_email`, the value is not immediately saved. Instead:
- A confirmation email is sent to the new address.
- The new address is stored in option `new_admin_email` and a hash in `adminhash`.
- When the confirmation link is visited (GET `adminhash` parameter on `options.php`), the hash is verified and `admin_email` is updated.
- A pending-change notice is shown on the General settings page.
- The pending change can be dismissed via a nonce-protected cancel link (GET `dismiss=new_admin_email`).

### 2.9 `$allowed_options` — the whitelist

Built in `options.php` as a PHP array keyed by option group. The canonical groups and their allowed keys are:

**general:**
`blogname`, `blogdescription`, `site_icon`, `gmt_offset`, `date_format`, `time_format`, `start_of_week`, `timezone_string`, `WPLANG`, `new_admin_email`
(Non-multisite only, if not defined as constants: `siteurl`, `home`)
(Non-multisite only: `users_can_register`, `default_role`)

**discussion:**
`default_pingback_flag`, `default_ping_status`, `default_comment_status`, `comments_notify`, `moderation_notify`, `comment_moderation`, `require_name_email`, `comment_previously_approved`, `comment_max_links`, `moderation_keys`, `disallowed_keys`, `show_avatars`, `avatar_rating`, `avatar_default`, `close_comments_for_old_posts`, `close_comments_days_old`, `thread_comments`, `thread_comments_depth`, `page_comments`, `comments_per_page`, `default_comments_page`, `comment_order`, `comment_registration`, `show_comments_cookies_opt_in`, `wp_notes_notify`

**media:**
`thumbnail_size_w`, `thumbnail_size_h`, `thumbnail_crop`, `medium_size_w`, `medium_size_h`, `large_size_w`, `large_size_h`, `image_default_size`, `image_default_align`, `image_default_link_type`
(Non-multisite only: `uploads_use_yearmonth_folders`)
(Non-multisite, only if non-default upload paths: `upload_path`, `upload_url_path`)

**reading:**
`posts_per_page`, `posts_per_rss`, `rss_use_excerpt`, `show_on_front`, `page_on_front`, `page_for_posts`, `blog_public`
(Non-UTF8 charset only: `blog_charset`)

**writing:**
`default_category`, `default_email_category`, `default_link_category`, `default_post_format`
(If `enable_post_by_email_configuration` filter returns true: `mailserver_url`, `mailserver_port`, `mailserver_login`, `mailserver_pass`)
(Non-multisite, if site is public: `ping_sites`)
(Old installs < db version 32453: `use_smilies`, `use_balanceTags`)

Plugins extend this list by hooking `allowed_options` and appending keys to the appropriate group.

---

## Section 3: General Settings (`options-general.php`)

Route: GET `wp-admin/options-general.php`
Capability: `manage_options`
Option group: `general`
Form action: `options.php`

### 3.1 Site Title

- Option key: `blogname`
- Input: `<input type="text" name="blogname">`
- Rendered value: `get_option('blogname')`
- Sanitize: `sanitize_text_field` (strips tags, trims)

### 3.2 Tagline

- Option key: `blogdescription`
- Input: `<input type="text" name="blogdescription">`
- Description: "In a few words, explain what this site is about."
- Sanitize: `sanitize_text_field`

### 3.3 Site Icon

- Option key: `site_icon` (stores attachment ID as integer)
- Requires `upload_files` capability to display the field
- Hidden input: `<input type="hidden" name="site_icon" id="site_icon_hidden_field">`
- A media modal is used (JS-powered) to select an image; requires minimum 512×512 pixels
- The current icon is shown with browser tab and app icon previews
- When no icon is set, preview wrapper has `hidden` class; JS removes this class after selection
- Remove button sets `site_icon` to `0`

### 3.4 WordPress Address (URL) — siteurl

- Option key: `siteurl`
- Input: `<input type="url" name="siteurl">`
- Only shown on non-multisite
- Disabled (read-only) if the PHP constant `WP_SITEURL` is defined
- Stores the URL to the WordPress installation files directory

### 3.5 Site Address (URL) — home

- Option key: `home`
- Input: `<input type="url" name="home">`
- Only shown on non-multisite
- Disabled if the PHP constant `WP_HOME` is defined
- Stores the URL visitors use to reach the site; may differ from `siteurl` if WP is installed in a subdirectory

### 3.6 Administration Email Address

- Option key: `admin_email`
- Input: `<input type="email" name="new_admin_email">`
- The field displays the current `admin_email` value but POSTs to `new_admin_email`
- On change: sends confirmation email; change is pending until confirmed (see Section 2.8)
- Pending state: a yellow notice is shown with the pending new address and a Cancel link

### 3.7 Membership

- Option key: `users_can_register`
- Input: `<input type="checkbox" name="users_can_register" value="1">`
- Non-multisite only
- When checked: anyone can self-register; when unchecked: only admins create accounts

### 3.8 New User Default Role

- Option key: `default_role`
- Input: `<select name="default_role">` populated by `wp_dropdown_roles()`
- Non-multisite only
- Available values: any registered role slug (subscriber, contributor, author, editor, administrator, etc.)

### 3.9 Site Language

- Option key: `WPLANG`
- Input: `<select name="WPLANG">` populated by `wp_dropdown_languages()`
- Shows installed languages plus available (downloadable) translations if user has `install_languages`
- On save: if user has `install_languages` and WP can install language packs, the selected language pack is automatically downloaded before the option is stored
- `''` or `'en_US'` means English (United States)

### 3.10 Timezone

Two underlying options are used together:
- `timezone_string` — a named PHP timezone identifier (e.g. `'America/New_York'`)
- `gmt_offset` — a numeric hour offset from UTC (e.g. `5`, `-5.5`)

Only one is active at a time:
- If `timezone_string` is set to a named zone, `gmt_offset` is derived automatically
- If the user selects a `UTC+N` or `UTC-N` offset (not a named zone), `timezone_string` is stored as `''` and `gmt_offset` is stored as the numeric offset

UI: `<select name="timezone_string">` populated by `wp_timezone_choice()`, which groups cities by region and provides UTC offset entries at the bottom.

The page displays three live pieces of info (updated via JS):
1. Current UTC time
2. Current local time (if timezone is set)
3. DST status and next transition date (if applicable)

On save, `options.php` converts `UTC±N` selections into numeric `gmt_offset` and clears `timezone_string`.

### 3.11 Date Format

- Option key: `date_format`
- UI: radio buttons for common formats + a "Custom" radio + text input
- Common formats (filterable via `date_formats` filter):
  - `'F j, Y'` — e.g. "February 18, 2026"
  - `'Y-m-d'` — e.g. "2026-02-18"
  - `'m/d/Y'` — e.g. "02/18/2026"
  - `'d/m/Y'` — e.g. "18/02/2026"
  - `'d.m.Y'` — e.g. "18.02.2026"
- Custom: radio value is the PHP escaped string `\c\u\s\t\o\m`; the actual format comes from `date_format_custom`
- `options.php` detects the `\custom` sentinel and substitutes `date_format_custom` as the real value
- Live preview is JS-driven via AJAX

### 3.12 Time Format

- Option key: `time_format`
- UI: radio buttons for common formats + a "Custom" radio + text input
- Common formats (filterable via `time_formats` filter):
  - `'g:i a'` — e.g. "3:00 pm"
  - `'g:i A'` — e.g. "3:00 PM"
  - `'H:i'` — e.g. "15:00"
- Same custom format/sentinel mechanism as date format

### 3.13 Week Starts On

- Option key: `start_of_week`
- Input: `<select name="start_of_week">` with options 0 (Sunday) through 6 (Saturday)
- Default: `1` (Monday)

---

## Section 4: Writing Settings (`options-writing.php`)

Route: GET `wp-admin/options-writing.php`
Capability: `manage_options`
Option group: `writing`
Form action: `options.php`

### 4.1 Default Post Category

- Option key: `default_category`
- Input: `<select>` populated by `wp_dropdown_categories()` with all categories
- Default: the ID of the "Uncategorized" category (term ID 1 typically)
- New posts are assigned this category if no category is explicitly selected

### 4.2 Default Post Format

- Option key: `default_post_format`
- Input: `<select name="default_post_format">` with option value `'0'` for "Standard" and one option per registered post format (aside, gallery, image, link, quote, status, video, audio, chat)
- Value `'0'` means standard format
- Only formats registered by the active theme appear as options

### 4.3 Legacy Formatting Options (old installs only)

These fields only appear when site's initial DB version is below 32453:

**Use Smilies:**
- Option key: `use_smilies`
- Checkbox `value="1"`: automatically convert emoticon text to graphical smileys

**Balance Tags:**
- Option key: `use_balanceTags`
- Checkbox `value="1"`: auto-correct improperly nested XHTML

### 4.4 Post via Email

The entire section is gated by the `enable_post_by_email_configuration` filter (default `true`). When the filter returns `false`, the section and all its fields are hidden and the keys are removed from `$allowed_options['writing']`.

**Mail Server:**
- Option key: `mailserver_url`
- Input: `<input type="text" name="mailserver_url">` (hostname)

**Port:**
- Option key: `mailserver_port`
- Input: `<input type="text" name="mailserver_port">` (numeric, typically 110 for POP3)

**Login Name:**
- Option key: `mailserver_login`
- Input: `<input type="text" name="mailserver_login">`

**Password:**
- Option key: `mailserver_pass`
- Input: text input with a reveal/hide toggle button
- Autocomplete disabled

**Default Mail Category:**
- Option key: `default_email_category`
- Input: `<select>` populated by `wp_dropdown_categories()`

### 4.5 Update Services (Ping List)

Gated by the `enable_update_services_configuration` filter (default `true`).

Only shown and saved when `blog_public` option equals `'1'`. If the site is private (search engines discouraged), a message is shown instead explaining that no services are being pinged.

- Option key: `ping_sites`
- Input: `<textarea name="ping_sites">` multi-line, one URL per line
- Default: `http://rpc.pingomatic.com/`
- On new post publish, WordPress pings each URL in this list
- Non-multisite only

---

## Section 5: Reading Settings (`options-reading.php`)

Route: GET `wp-admin/options-reading.php`
Capability: `manage_options`
Option group: `reading`
Form action: `options.php`

### 5.1 Your Homepage Displays

Controls what appears at the site root URL.

Option key: `show_on_front`
Values: `'posts'` or `'page'`
Input: two radio buttons

When `show_on_front === 'posts'`:
- The main blog loop (latest posts in reverse chronological order) is shown at the root URL

When `show_on_front === 'page'`:
- A static page is shown at the root URL
- Two additional dropdowns appear:

**Homepage:**
- Option key: `page_on_front`
- Input: `<select name="page_on_front">` populated by `wp_dropdown_pages()` with all published/draft pages
- Stores the page ID used as the front page

**Posts page:**
- Option key: `page_for_posts`
- Input: `<select name="page_for_posts">` populated by `wp_dropdown_pages()`
- Stores the page ID where the blog loop is displayed
- A warning is shown if `page_for_posts` and `page_on_front` are the same page
- A warning is also shown if either matches `wp_page_for_privacy_policy`

When no pages exist in the database, `show_on_front` is forced to `'posts'` and the page selection UI is hidden (a hidden `<input type="hidden" name="show_on_front" value="posts">` is output instead).

### 5.2 Blog Pages Show at Most

- Option key: `posts_per_page`
- Input: `<input type="number" name="posts_per_page" min="1">`
- Controls the number of posts displayed per page in the blog loop

### 5.3 Syndication Feeds Show the Most Recent

- Option key: `posts_per_rss`
- Input: `<input type="number" name="posts_per_rss" min="1">`
- Controls the number of items in RSS/Atom feeds

### 5.4 For Each Post in a Feed, Include

- Option key: `rss_use_excerpt`
- Input: two radio buttons
  - `value="0"` — Full text
  - `value="1"` — Excerpt

### 5.5 Search Engine Visibility

- Option key: `blog_public`
- Default display (no `blog_privacy_selector` action hooked): single checkbox
  - `<input type="checkbox" name="blog_public" value="0">` — "Discourage search engines from indexing this site"
  - When checked, the stored value is `'0'` (discourage); when unchecked, value is `'1'` (allow)
  - Note: the checkbox value is `0`, which is the "checked = discourage" state — counterintuitively, the option stores `1` for public and `0` for discouraged
- When a plugin hooks the `blog_privacy_selector` action: display changes to two radio buttons (`value="1"` Allow, `value="0"` Discourage) plus any additional options the plugin adds

### 5.6 Encoding for Pages and Feeds (conditional)

- Option key: `blog_charset`
- Only shown when the site is not using a UTF-8 charset
- Input: text field for character set name
- Added dynamically via `add_settings_field()` during page render

---

## Section 6: Discussion Settings (`options-discussion.php`)

Route: GET `wp-admin/options-discussion.php`
Capability: `manage_options`
Option group: `discussion`
Form action: `options.php`

### 6.1 Default Post Settings

Fieldset: "Default post settings"

These three settings apply to new posts by default. Individual posts can override them.

**Attempt to notify blogs linked to from the post:**
- Option key: `default_pingback_flag`
- Checkbox `value="1"`

**Allow link notifications from other blogs (pingbacks and trackbacks) on new posts:**
- Option key: `default_ping_status`
- Checkbox `value="open"` — value stored is `'open'` when checked, `''` (empty/absent) when unchecked

**Allow people to submit comments on new posts:**
- Option key: `default_comment_status`
- Checkbox `value="open"` — value stored is `'open'` when checked, `''` when unchecked

### 6.2 Other Comment Settings

Fieldset: "Other comment settings"

**Comment author must fill out name and email:**
- Option key: `require_name_email`
- Checkbox `value="1"`

**Users must be registered and logged in to comment:**
- Option key: `comment_registration`
- Checkbox `value="1"`

**Automatically close comments on old posts:**
- Option key: `close_comments_for_old_posts`
- Checkbox `value="1"`
- Sub-field — Close comments when post is N days old:
  - Option key: `close_comments_days_old`
  - Input: `<input type="number" min="0">`

**Show comments cookies opt-in checkbox:**
- Option key: `show_comments_cookies_opt_in`
- Checkbox `value="1"` — when enabled, a "Save my name, email, and website in this browser" checkbox is shown in the comment form

**Enable threaded (nested) comments:**
- Option key: `thread_comments`
- Checkbox `value="1"`
- Sub-field — Number of levels:
  - Option key: `thread_comments_depth`
  - Input: `<select>` with options 2 through 10 (max depth filterable via `thread_comments_depth_max` filter, default 10)

### 6.3 Comment Pagination

Fieldset: "Comment Pagination"

**Break comments into pages:**
- Option key: `page_comments`
- Checkbox `value="1"`

**Top level comments per page:**
- Option key: `comments_per_page`
- Input: `<input type="number" min="0">`

**Comments page to display by default:**
- Option key: `default_comments_page`
- Input: `<select>` with options `'newest'` (last page) and `'oldest'` (first page)

**Comments to display at the top of each page:**
- Option key: `comment_order`
- Input: `<select>` with options `'asc'` (older first) and `'desc'` (newer first)

### 6.4 Email Me Whenever

Fieldset: "Email me whenever"

**Anyone posts a comment:**
- Option key: `comments_notify`
- Checkbox `value="1"`

**A comment is held for moderation:**
- Option key: `moderation_notify`
- Checkbox `value="1"`

**Anyone posts a note:**
- Option key: `wp_notes_notify`
- Checkbox `value="1"`, default `1`

### 6.5 Before a Comment Appears

Fieldset: "Before a comment appears"

**Comment must be manually approved:**
- Option key: `comment_moderation`
- Checkbox `value="1"` — when enabled, every comment goes to the moderation queue regardless of any other settings

**Comment author must have a previously approved comment:**
- Option key: `comment_previously_approved`
- Checkbox `value="1"` — when enabled, only hold comments from authors with no prior approved comments

### 6.6 Comment Moderation

**Hold a comment in the queue if it contains N or more links:**
- Option key: `comment_max_links`
- Input: `<input type="number" min="0">`

**Comment moderation keywords:**
- Option key: `moderation_keys`
- Input: `<textarea>` — one word, phrase, or IP address per line
- When a comment's content, author name, URL, email, IP, or user agent contains any of these strings (substring match), the comment is held for moderation
- Matching is case-insensitive substring (e.g. "press" matches "WordPress")

### 6.7 Disallowed Comment Keys

- Option key: `disallowed_keys`
- Input: `<textarea>` — one word, phrase, or IP address per line
- When a comment matches any of these strings in content, author name, URL, email, IP, or user agent, the comment is sent directly to Trash (not moderation queue)

### 6.8 Avatars — Avatar Display

- Option key: `show_avatars`
- Checkbox `value="1"` — when unchecked, all avatar-related settings (rating, default) are hidden via CSS class `hide-if-js`

### 6.9 Avatars — Maximum Rating

Fieldset: "Maximum Rating" (hidden when `show_avatars` is `0`)

- Option key: `avatar_rating`
- Input: radio buttons with values: `'G'`, `'PG'`, `'R'`, `'X'`
- Controls the maximum Gravatar content rating displayed; avatars with a higher rating are shown as the default avatar instead

### 6.10 Avatars — Default Avatar

Fieldset: "Default Avatar" (hidden when `show_avatars` is `0`)

- Option key: `avatar_default`
- Input: radio buttons, one per available default
- Default options (filterable via `avatar_defaults` filter):
  - `'mystery'` — Mystery Person (silhouette)
  - `'blank'` — Blank
  - `'gravatar_default'` — Gravatar Logo
  - `'identicon'` — Identicon (geometric pattern, generated from email hash)
  - `'wavatar'` — Wavatar (generated face)
  - `'monsterid'` — MonsterID (generated monster)
  - `'retro'` — Retro (8-bit face)
  - `'robohash'` — RoboHash (robot)
  - `'initials'` — Initials (generated from name)
  - `'color'` — Color (solid color)
- Each radio button is accompanied by a live preview image (`get_avatar()` called with `force_default: true`)

---

## Section 7: Media Settings (`options-media.php`)

Route: GET `wp-admin/options-media.php`
Capability: `manage_options`
Option group: `media`
Form action: `options.php`

### 7.1 Image Sizes

These options define the maximum dimensions WordPress uses when generating image crops/resizes at upload time. A value of `0` means "no limit" for that dimension.

**Thumbnail size:**
- Width: option key `thumbnail_size_w`, input `<input type="number" min="0">`, default `150`
- Height: option key `thumbnail_size_h`, input `<input type="number" min="0">`, default `150`
- Crop: option key `thumbnail_crop`, checkbox `value="1"`, default `1`
  - When enabled: images are hard-cropped to exactly `thumbnail_size_w × thumbnail_size_h`
  - When disabled: images are scaled proportionally to fit within the bounding box

**Medium size:**
- Max Width: option key `medium_size_w`, input `<input type="number" min="0">`, default `300`
- Max Height: option key `medium_size_h`, input `<input type="number" min="0">`, default `300`
- No crop option; always proportional scaling

**Large size:**
- Max Width: option key `large_size_w`, input `<input type="number" min="0">`, default `1024`
- Max Height: option key `large_size_h`, input `<input type="number" min="0">`, default `1024`
- No crop option; always proportional scaling

### 7.2 Uploading Files

Only displayed on non-multisite installations.

**Organize uploads into month- and year-based folders:**
- Option key: `uploads_use_yearmonth_folders`
- Checkbox `value="1"`, default `1`
- When enabled, uploaded files are stored under `wp-content/uploads/YYYY/MM/`
- When disabled, all uploads go directly into `wp-content/uploads/`

**Advanced upload path fields (only shown when non-default):**

These fields are only editable when the site already has a non-default upload configuration (i.e., `upload_url_path` is non-empty, or `upload_path` is set and differs from `'wp-content/uploads'`). They are not shown if both options are at their defaults.

- Store uploads in this folder: option key `upload_path`, text input, default `'wp-content/uploads'`
- Full URL path to files: option key `upload_url_path`, text input, default `''`

---

## Section 8: Permalink Settings (`options-permalink.php`)

Route: GET/POST `wp-admin/options-permalink.php`
Capability: `manage_options`
Form action: `options-permalink.php` (NOT `options.php` — permalinks are handled entirely within this file)
Nonce action: `update-permalink`

### 8.1 Save Flow

Unlike other settings pages, `options-permalink.php` handles its own POST. When `$_POST['permalink_structure']` or `$_POST['category_base']` is present:

1. Verify nonce for `'update-permalink'`
2. Determine `permalink_structure`:
   - If `selection` is set and not `'custom'`, use `$_POST['selection']` as the structure
   - Otherwise use `$_POST['permalink_structure']`
   - Normalize: strip `#` characters, collapse multiple slashes, prepend `/`
   - In multisite subdirectory on main site: prepend `/blog` prefix
   - On servers without URL rewriting: prepend `/index.php`
   - Sanitize via `sanitize_option('permalink_structure', ...)`
   - Call `$wp_rewrite->set_permalink_structure($permalink_structure)` — this saves the option and regenerates rewrite rules
3. If `category_base` is in POST: strip `#`, normalize slashes, call `$wp_rewrite->set_category_base()`
4. If `tag_base` is in POST: strip `#`, normalize slashes, call `$wp_rewrite->set_tag_base()`
5. After saving: set a success/warning message in `settings_errors` transient, `wp_redirect` back to `options-permalink.php?settings-updated=true`

After redirect, or on any GET: call `flush_rewrite_rules()` to regenerate the `.htaccess` / `web.config` file.

### 8.2 .htaccess / web.config Update

After saving, WordPress attempts to write the new rewrite rules:
- **Apache:** writes `mod_rewrite` rules into `.htaccess` using `WP_Rewrite::mod_rewrite_rules()`
- **IIS7:** writes URL rewrite XML into `web.config` using `WP_Rewrite::iis7_url_rewrite_rules()`
- **Nginx/Caddy:** cannot auto-update; always shows a read-only textarea with manual rules
- If the file is not writable, the rules are displayed in a read-only `<textarea>` so the admin can copy them manually

### 8.3 Permalink Structure Options

The UI presents radio buttons for common structures:

| Radio id | Label | Structure value |
|---|---|---|
| `plain` | Plain | `''` (empty — uses `?p=123` query string) |
| `day-name` | Day and name | `/%year%/%monthnum%/%day%/%postname%/` |
| `month-name` | Month and name | `/%year%/%monthnum%/%postname%/` |
| `numeric` | Numeric | `/archives/%post_id%` |
| `post-name` | Post name | `/%postname%/` |
| `custom_selection` | Custom Structure | whatever is in the text field |

When `index.php` is needed (servers without URL rewriting), the `index.php` segment is prepended automatically.

### 8.4 Available Structure Tags

Structure tags are the tokens that can be used in a custom permalink structure. The list is filterable via `available_permalink_structure_tags`.

Default tags:

| Tag | Description |
|---|---|
| `%year%` | Four-digit year of the post |
| `%monthnum%` | Month number (01–12) |
| `%day%` | Day of the month (01–31) |
| `%hour%` | Hour of the day (00–23) |
| `%minute%` | Minute of the hour (00–59) |
| `%second%` | Second of the minute (00–59) |
| `%post_id%` | Unique numeric post ID |
| `%postname%` | URL-sanitized post title (slug) |
| `%category%` | Category slug; nested categories appear as nested path segments |
| `%author%` | Sanitized author name |

When multiple categories are assigned to a post, only the lowest-numbered category ID is used in the URL.

### 8.5 Optional Category and Tag Bases

- Option key: `category_base` — prefix segment for category archive URLs. Default: `category`. Example: setting `topics` makes URLs like `/topics/uncategorized/`.
- Option key: `tag_base` — prefix segment for tag archive URLs. Default: `tag`.
- If left blank, the defaults are used.
- In multisite subdirectory on main site: a `/blog` prefix is automatically prepended to any non-empty value.

---

## Section 9: Privacy Settings (`options-privacy.php`)

Route: GET/POST `wp-admin/options-privacy.php`
Capability: `manage_privacy_options`
Tab: default tab is Settings; a "Policy Guide" tab loads `privacy-policy-guide.php` (separate include)

### 9.1 Page State Detection

On GET, the stored `wp_page_for_privacy_policy` option is checked:
- If the stored page ID has been deleted from the database: error notice "The currently selected Privacy Policy page does not exist."
- If the stored page is in the Trash: error notice with a link to restore it.
- Otherwise: `$privacy_policy_page_exists = true`.

### 9.2 Create a New Privacy Policy Page

POST action: `create-privacy-page`
Nonce action: `create-privacy-page`

On POST:
1. Verify nonce.
2. Call `WP_Privacy_Policy_Content::get_default_content()` to get the suggested template.
3. Insert a new page (`post_type: 'page'`, `post_status: 'draft'`) with title "Privacy Policy" and the template as content.
4. Save the new page ID to `wp_page_for_privacy_policy` option.
5. Redirect to the post editor for the new page.

`WP_Privacy_Policy_Content` aggregates privacy policy suggestions from all active plugins and themes. Each plugin can register suggested content via `wp_add_privacy_policy_content(plugin_name, content_html)`. The default content template is a generic placeholder text that the site admin is expected to customize.

### 9.3 Select an Existing Privacy Policy Page

POST action: `set-privacy-page`
Nonce action: `set-privacy-page`

Fields:
- `page_for_privacy_policy` — integer page ID (from `<select>` dropdown of published and draft pages)

On POST:
1. Verify nonce.
2. Store `(int) $_POST['page_for_privacy_policy']` into option `wp_page_for_privacy_policy`.
3. If the selected page is published and user has `edit_theme_options` and theme supports menus: show a success message with a link to the Customizer nav menus panel.
4. Otherwise: show a plain success message.

### 9.4 Edit/View Links

When `$privacy_policy_page_exists` is true:
- If page status is `publish`: show "Edit" and "View" links
- Otherwise: show "Edit" and "Preview" links

---

## Section 10: The `options.php` Handler — Full Detail

### 10.1 Direct access (no POST action)

When `options.php` is loaded without `action=update` in POST/GET, it renders a full "All Settings" table:
- Queries all rows from `wp_options` ORDER BY `option_name`
- Skips options with empty names
- Disables (grays out) `home` if `WP_HOME` constant is defined, `siteurl` if `WP_SITEURL` is defined
- Skips serialized data that is not a simple serialized string (renders as `SERIALIZED DATA`, disabled)
- Renders each non-serialized option as a text input or textarea (textarea if value contains newlines)
- Submits back to `options.php` with `option_page=options` (back-compat mode)
- Shows a prominent warning banner: "This page allows direct access to your site settings. You can break things here. Please be cautious!"

### 10.2 Nonce verification

The nonce field is named `_wpnonce` (standard). The nonce action is `{option_page}-options` (e.g. `general-options`, `discussion-options`). For the legacy back-compat path (`option_page === 'options'` and no `option_page` in POST), the nonce action is `update-options`.

### 10.3 Capability filtering

```
$capability = apply_filters("option_page_capability_{$option_page}", 'manage_options');
```

Plugins can require a different capability for a custom options group.

### 10.4 `update_option()` and sanitize callbacks

For each option name in the allowed list, `update_option(option_name, posted_value)` is called. `update_option()` internally:
1. Looks up any registered `sanitize_callback` for the option via `$wp_registered_settings`.
2. Calls the callback with the raw value if it exists.
3. Fires the `sanitize_option_{option_name}` filter (also called by `sanitize_option()`).
4. Only writes to the database if the new value differs from the existing value.
5. Fires `update_option_{option_name}` action after a successful update.
6. Fires `updated_option` action.

### 10.5 Missing POST values

For checkbox-type options (e.g. `users_can_register`), when the checkbox is unchecked, no key appears in `$_POST`. `options.php` stores `null` for these, and `update_option` saves them as an empty string `''`. This is how unchecked checkboxes effectively clear their values.

### 10.6 Admin email confirmation flow (detail)

When `new_admin_email` is posted and differs from the current `admin_email`:
- WordPress's `admin_email` sanitize callback detects the change
- Sends a confirmation email to the new address
- Stores `{ hash, newemail }` in the `adminhash` option
- Stores the pending new email in `new_admin_email` option
- `admin_email` is NOT updated yet

When the confirmation link is clicked:
- GET `?adminhash={hash}` to `options.php`
- `options.php` verifies `hash_equals(stored_hash, GET_hash)` — constant-time comparison
- On success: `update_option('admin_email', newemail)`, deletes `adminhash` and `new_admin_email`, redirects to `options-general.php?updated=true`
- On failure: redirects to `options-general.php?updated=false`

---

## Section 11: Key Hooks and Filters

### Actions

| Hook | Where fired | Purpose |
|---|---|---|
| `admin_head` | General and Reading settings pages | `options_general_add_js()` and `options_reading_add_js()` enqueue inline JS for timezone preview and static page toggling |
| `admin_print_footer_scripts` | Discussion page | `options_discussion_add_js()` for avatar settings toggle |
| `blog_privacy_selector` | Reading page | Allows plugins to replace the single checkbox with a multi-option privacy selector |
| `update_option_{option_name}` | After each option save | Run custom logic after a specific option is updated |
| `updated_option` | After each option save | Generic post-save hook |

### Filters

| Filter | Purpose |
|---|---|
| `date_formats` | Modify the list of preset date format strings shown on the General settings page |
| `time_formats` | Modify the list of preset time format strings |
| `thread_comments_depth_max` | Change the maximum allowed nesting depth for threaded comments (default 10) |
| `avatar_defaults` | Add or remove default avatar options |
| `default_avatar_select` | Filter the HTML output of the default avatar radio button list |
| `enable_post_by_email_configuration` | Return `false` to hide the Post via Email section |
| `enable_update_services_configuration` | Return `false` to hide the Update Services section |
| `available_permalink_structure_tags` | Add or remove structure tags shown in the permalink builder |
| `option_page_capability_{page}` | Change the required capability for a custom options group |
| `allowed_options` | Add options to a group's allowed list (replaces deprecated `whitelist_options`) |
| `sanitize_option_{option_name}` | Filter the value of a specific option before it is stored |
| `wp_nav_locations_listed_per_menu` | Maximum number of assigned locations shown per menu in the dropdown (default 3) |

---

## Section 12: TypeScript Interface Sketch

```typescript
// ─── Option group names ───────────────────────────────────────────────────────

type OptionGroup =
  | 'general'
  | 'writing'
  | 'reading'
  | 'discussion'
  | 'media'
  | 'permalink'
  | 'privacy'
  | 'options'
  | 'misc';

// ─── Settings API registry types ─────────────────────────────────────────────

interface RegisteredSetting {
  group: OptionGroup;
  type: 'string' | 'boolean' | 'integer' | 'number' | 'array' | 'object';
  label?: string;
  description?: string;
  sanitizeCallback?: (value: unknown) => unknown;
  showInRest: boolean | RestSchema;
  default?: unknown;
}

interface RestSchema {
  schema: Record<string, unknown>;
}

interface SettingsSection {
  id: string;
  title: string;
  callback: () => void;
  page: string;
}

interface SettingsField {
  id: string;
  title: string;
  callback: (args: Record<string, unknown>) => void;
  page: string;
  section: string;
  args: Record<string, unknown>;
}

// ─── General settings options ─────────────────────────────────────────────────

interface GeneralSettings {
  blogname: string;                  // Site title
  blogdescription: string;           // Tagline
  site_icon: number;                 // Attachment ID of site icon; 0 = none
  siteurl: string;                   // WordPress address (URL) — installation root
  home: string;                      // Site address (URL) — public front-end root
  admin_email: string;               // Administration email address (confirmed)
  new_admin_email: string;           // Pending unconfirmed new admin email
  users_can_register: '0' | '1';    // '1' = anyone can register
  default_role: string;              // Role slug for new users
  WPLANG: string;                    // Locale code e.g. 'en_US', 'fr_FR', ''
  timezone_string: string;           // Named timezone e.g. 'America/New_York', '' if offset-based
  gmt_offset: number;                // UTC offset in hours e.g. -5, 5.5; 0 by default
  date_format: string;               // PHP date format string e.g. 'F j, Y'
  time_format: string;               // PHP time format string e.g. 'g:i a'
  start_of_week: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, 1 = Monday …
}

// ─── Writing settings options ─────────────────────────────────────────────────

interface WritingSettings {
  default_category: number;          // Term ID of default post category
  default_post_format: string;       // Post format slug; '0' = standard
  default_email_category: number;    // Term ID for posts created via email
  default_link_category: number;     // Term ID for links (legacy)
  mailserver_url: string;            // POP3 server hostname
  mailserver_port: number;           // POP3 server port (typically 110)
  mailserver_login: string;          // POP3 account username
  mailserver_pass: string;           // POP3 account password
  ping_sites: string;                // Newline-separated list of ping URLs
  use_smilies: '0' | '1';           // Legacy: convert emoticons to images
  use_balanceTags: '0' | '1';       // Legacy: auto-fix nested XHTML
}

// ─── Reading settings options ─────────────────────────────────────────────────

interface ReadingSettings {
  show_on_front: 'posts' | 'page';  // What to show at the site root
  page_on_front: number;             // Page ID to show as front page (when show_on_front='page')
  page_for_posts: number;            // Page ID to show the blog loop (when show_on_front='page')
  posts_per_page: number;            // Blog pages show at most N posts
  posts_per_rss: number;             // RSS/Atom feeds show at most N items
  rss_use_excerpt: '0' | '1';       // '0' = full text in feeds, '1' = excerpt only
  blog_public: '0' | '1';           // '1' = allow indexing, '0' = discourage robots
  blog_charset: string;              // Character encoding (legacy; almost always 'UTF-8')
}

// ─── Discussion settings options ─────────────────────────────────────────────

type PingStatus = 'open' | 'closed' | '';
type CommentOrder = 'asc' | 'desc';
type CommentsPage = 'newest' | 'oldest';
type AvatarRating = 'G' | 'PG' | 'R' | 'X';
type AvatarDefault =
  | 'mystery'
  | 'blank'
  | 'gravatar_default'
  | 'identicon'
  | 'wavatar'
  | 'monsterid'
  | 'retro'
  | 'robohash'
  | 'initials'
  | 'color'
  | string; // plugins may add custom values

interface DiscussionSettings {
  default_pingback_flag: '0' | '1';           // Attempt to notify linked blogs
  default_ping_status: PingStatus;             // Allow pingbacks/trackbacks on new posts
  default_comment_status: PingStatus;          // Allow comments on new posts
  comments_notify: '0' | '1';                 // Email on any new comment
  moderation_notify: '0' | '1';               // Email when comment held for moderation
  wp_notes_notify: '0' | '1';                 // Email when anyone posts a note
  comment_moderation: '0' | '1';              // All comments require manual approval
  require_name_email: '0' | '1';              // Comment author must provide name and email
  comment_previously_approved: '0' | '1';     // Require prior approved comment
  comment_max_links: number;                   // Links threshold for auto-moderation
  moderation_keys: string;                     // Newline-separated moderation blacklist
  disallowed_keys: string;                     // Newline-separated spam blacklist (sends to trash)
  show_avatars: '0' | '1';                    // Display Gravatar avatars
  avatar_rating: AvatarRating;                 // Maximum avatar content rating
  avatar_default: AvatarDefault;              // Default avatar type
  close_comments_for_old_posts: '0' | '1';   // Auto-close comments on old posts
  close_comments_days_old: number;             // Days old threshold for auto-close
  thread_comments: '0' | '1';                // Enable nested comments
  thread_comments_depth: number;              // Maximum nesting depth (2–10)
  page_comments: '0' | '1';                  // Paginate comments
  comments_per_page: number;                  // Top-level comments per page
  default_comments_page: CommentsPage;         // Which page to show by default
  comment_order: CommentOrder;                 // Order of comments within a page
  comment_registration: '0' | '1';           // Require login to comment
  show_comments_cookies_opt_in: '0' | '1';   // Show cookies consent checkbox
}

// ─── Media settings options ───────────────────────────────────────────────────

type ImageAlign = 'none' | 'left' | 'center' | 'right' | '';
type ImageLinkType = 'none' | 'file' | 'post' | '';

interface MediaSettings {
  thumbnail_size_w: number;          // Thumbnail max width in px (default 150)
  thumbnail_size_h: number;          // Thumbnail max height in px (default 150)
  thumbnail_crop: '0' | '1';        // '1' = hard crop to exact dimensions
  medium_size_w: number;             // Medium max width in px (default 300)
  medium_size_h: number;             // Medium max height in px (default 300)
  large_size_w: number;              // Large max width in px (default 1024)
  large_size_h: number;              // Large max height in px (default 1024)
  image_default_size: string;        // Default image size when inserting into post
  image_default_align: ImageAlign;   // Default image alignment in editor
  image_default_link_type: ImageLinkType; // Default image link target
  uploads_use_yearmonth_folders: '0' | '1'; // Organize uploads in YYYY/MM folders
  upload_path: string;               // Custom upload directory path (non-default only)
  upload_url_path: string;           // Custom upload URL path (non-default only)
}

// ─── Permalink settings options ───────────────────────────────────────────────

interface PermalinkSettings {
  permalink_structure: string;       // The permalink structure with % tokens; '' = plain
  category_base: string;             // Category archive URL prefix; '' = 'category'
  tag_base: string;                  // Tag archive URL prefix; '' = 'tag'
}

// ─── Privacy settings options ─────────────────────────────────────────────────

interface PrivacySettings {
  wp_page_for_privacy_policy: number; // Post ID of the Privacy Policy page; 0 = none
}

// ─── Combined all-settings type ───────────────────────────────────────────────

interface AllSiteOptions
  extends GeneralSettings,
    WritingSettings,
    ReadingSettings,
    DiscussionSettings,
    MediaSettings,
    PermalinkSettings,
    PrivacySettings {
  // Additional arbitrary options from plugins/themes
  [key: string]: unknown;
}

// ─── Settings API function signatures ────────────────────────────────────────

interface SettingsRegistration {
  type?: 'string' | 'boolean' | 'integer' | 'number' | 'array' | 'object';
  label?: string;
  description?: string;
  sanitizeCallback?: (value: unknown) => unknown;
  showInRest?: boolean | RestSchema;
  default?: unknown;
}

declare function registerSetting(
  optionGroup: string,
  optionName: string,
  args?: SettingsRegistration
): void;

declare function addSettingsSection(
  id: string,
  title: string,
  callback: () => void,
  page: string
): void;

declare function addSettingsField(
  id: string,
  title: string,
  callback: (args: Record<string, unknown>) => void,
  page: string,
  section?: string,
  args?: Record<string, unknown>
): void;

// ─── Permalink structure token type ──────────────────────────────────────────

type PermalinkToken =
  | '%year%'
  | '%monthnum%'
  | '%day%'
  | '%hour%'
  | '%minute%'
  | '%second%'
  | '%post_id%'
  | '%postname%'
  | '%category%'
  | '%author%';

// ─── Admin email change state ─────────────────────────────────────────────────

interface AdminEmailChangeState {
  pending: boolean;
  newEmail?: string;      // The unconfirmed new email
  hash?: string;          // Confirmation hash stored in adminhash option
}

// ─── Settings errors (flash messages) ────────────────────────────────────────

type SettingsErrorType = 'error' | 'success' | 'warning' | 'info';

interface SettingsError {
  setting: string;   // Option group or arbitrary key
  code: string;      // Machine-readable code e.g. 'settings_updated'
  message: string;   // Human-readable message
  type: SettingsErrorType;
}
```

---

## Section 13: Design Patterns

### 13.1 Option group whitelist

The core security mechanism is the `$allowed_options` array. No option can be updated through `options.php` unless its key appears in the allowed list for the posted group. Custom options must be added to this list via the `allowed_options` filter; the deprecated `whitelist_options` filter is still supported for back-compat.

### 13.2 Conditional field exposure

Several fields are only allowed in `$allowed_options` under specific conditions:
- `siteurl` and `home` are excluded when the corresponding PHP constants are defined (prevents forms from overriding constants)
- `ping_sites` is only accepted when `blog_public === '1'` (prevents saving ping settings for private sites)
- `upload_path` and `upload_url_path` are only accepted when already non-default (prevents casual editing of these sensitive paths)
- Post-by-email and Update Services fields are excluded when their respective filters return `false`
- Several legacy writing options are excluded on new installs

### 13.3 Permalink page exceptionalism

Permalinks do not use `options.php` because saving permalink changes has a side effect: `flush_rewrite_rules()` must be called and `.htaccess` / `web.config` may need to be rewritten. This side effect is too significant for the generic handler. Instead, the permalink page handles its own POST, calls methods on the `$wp_rewrite` global object, and redirects back to itself.

### 13.4 Privacy page exceptionalism

The Privacy settings page uses named POST actions (`create-privacy-page`, `set-privacy-page`) rather than the Settings API because:
- Creating a page is a content operation, not an option save
- The page needs to redirect to the post editor after creation
- The field is an object reference (page ID) that requires live validation (is the page published? does it exist?)

### 13.5 Two-step admin email confirmation

Admin email changes use a hash-based confirmation flow to prevent accidental or unauthorized email changes. The new email is not active until the site owner confirms by clicking a link in the email sent to the new address. The confirmation token expires implicitly when a new one is generated.

### 13.6 Sanitize-on-save, not sanitize-on-read

Options are sanitized exactly once, at save time, via registered callbacks. `get_option()` returns the raw stored value without re-sanitizing. The TypeScript equivalent should apply sanitization in the PUT/PATCH route handler, not in the GET route handler.

### 13.7 Checkbox-absent = false

PHP forms do not transmit unchecked checkboxes. `options.php` iterates only the keys in `$allowed_options`, so when a checkbox is unchecked, `$_POST[key]` is null, and `update_option(key, null)` stores an empty string. The TypeScript equivalent must treat missing form fields as `false`/`0`/`''` for boolean options.

### 13.8 Date/time custom format sentinel

The `date_format` and `time_format` fields use a two-input pattern: a radio group for preset values and a hidden text field for the custom value. The radio button for "Custom" has the value `\c\u\s\t\o\m` (the PHP string `\custom` escaped for a form). `options.php` detects this sentinel value and substitutes the companion text input's value. The TypeScript equivalent should implement this substitution in the form submission handler.

---

## Section 14: Tovu Reconstruction Notes

### 14.1 Why this exists

This subsystem exists because global settings are not just key-value writes. They require allowlists, sanitization, capability checks, and sometimes operational side effects such as rewrite flushes, page creation, or email confirmation.

### 14.2 What Tovu should preserve

- A typed registry that defines which settings can be written, by whom, and how they are sanitized
- Separation between plain settings writes and special-case flows with side effects
- Save-time sanitization instead of ad hoc read-time cleanup
- Explicit handling for high-risk settings such as canonical URLs, privacy page selection, and admin email changes

### 14.3 What Tovu can simplify

- Tovu can replace WordPress's option-group forms with a clearer typed settings schema
- It does not need to inherit every legacy setting or sentinel-field convention
- Conditional field exposure can be expressed declaratively in metadata instead of scattered conditionals

### 14.4 Possible Tovu seams

- `src/features/settings/` for settings screens and write flows
- `src/core/ports/SettingsRegistryPort.ts` for write permissions, defaults, and sanitizers
- `src/core/ports/RewriteFlushPort.ts` for permalink/routing side effects
- `src/core/ports/PrivacyPagePort.ts` for content-linked privacy settings

### 14.5 Suggested priority

- `V1`: typed settings registry, save pipeline, side-effect hooks for routing and admin email confirmation
- `Later`: broader legacy settings compatibility and advanced migration helpers
