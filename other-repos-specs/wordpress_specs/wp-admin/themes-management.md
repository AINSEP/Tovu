# Themes Management — WordPress-to-TypeScript Rewrite Spec

**Source files analyzed:**
- `wp-admin/themes.php`
- `wp-admin/theme-install.php`
- `wp-admin/theme-editor.php`
- `wp-admin/customize.php`
- `wp-admin/includes/theme.php`

---

## Section 1: Overview

The themes management subsystem is responsible for four distinct surfaces:

1. **Themes List** (`themes.php`) — displays all installed themes in a grid, supports activation, deletion, and auto-update toggle actions.
2. **Theme Installer** (`theme-install.php`) — browses the WordPress.org Themes API and installs themes from it or from uploaded ZIP files.
3. **Theme File Editor** (`theme-editor.php`) — a textarea-based code editor for directly editing theme PHP and CSS files on the server.
4. **Customizer** (`customize.php`) — a full-screen preview + controls frame that previews and publishes theme option changes via a changeset system.

The subsystem is JavaScript-heavy on the themes list and installer surfaces. PHP generates an initial dataset which is serialized into the page as a JavaScript configuration object (`_wpThemeSettings`), and from that point the UI is driven by Backbone.js-style client templates (`tmpl-theme`, `tmpl-theme-single`, `tmpl-theme-preview`). The editor and customizer are traditional server-rendered pages with specific JS enhancements layered on top.

---

## Section 2: Routes

### 2.1 `GET /wp-admin/themes.php`

Renders the installed-themes grid.

**Query parameters:**

| Parameter | Type | Purpose |
|---|---|---|
| `action` | string | One of: `activate`, `resume`, `delete`, `enable-auto-update`, `disable-auto-update` |
| `stylesheet` | string | Theme slug (directory name / stylesheet identifier) for the targeted theme |
| `theme` | string | Used for filtering the initial JS dataset to a single theme |
| `search` | string | Pre-populates the client-side search filter |
| `activated` | flag | Displays "New theme activated." success notice |
| `previewed` | flag | When present alongside `activated`, shows "Settings saved and theme activated." |
| `deleted` | flag | Displays "Theme deleted." success notice |
| `delete-active-child` | flag | Displays error "You cannot delete a theme while it has an active child theme." |
| `resumed` | flag | Displays "Theme resumed." success notice |
| `error=resuming` | string | Displays fatal-error resume failure notice |
| `enabled-auto-update` | flag | Displays "Theme will be auto-updated." |
| `disabled-auto-update` | flag | Displays "Theme will no longer be auto-updated." |
| `broken` | flag | Forces display of broken-theme notice |

**Action handling (GET, processed before page render):**

All action-bearing requests require `switch_themes` capability and a valid nonce before any mutation occurs.

- `action=activate`: Nonce `switch-theme_{stylesheet}`. Calls `switch_theme()`, redirects to `?activated=true`.
- `action=resume`: Nonce `resume-theme_{stylesheet}`. Requires `resume_theme` meta-capability. Calls `resume_theme()`, redirects to `?resumed=true`.
- `action=delete`: Nonce `delete-theme_{stylesheet}`. Requires `delete_themes`. If the active theme's `Template` header equals the target stylesheet, redirects to `?delete-active-child=true` instead of deleting. Otherwise calls `delete_theme()`, redirects to `?deleted=true`.
- `action=enable-auto-update`: Nonce `updates`. Requires `update_themes` + auto-updates enabled globally. Appends stylesheet to `auto_update_themes` site option (array), deduplicates, then intersects with installed themes. Redirects to `?enabled-auto-update=true`.
- `action=disable-auto-update`: Nonce `updates`. Same requirements. Removes stylesheet from `auto_update_themes` array, intersects. Redirects to `?disabled-auto-update=true`.

### 2.2 `GET /wp-admin/theme-install.php`

Renders the theme browser/installer. On multisite, non-network-admin requests are redirected to the network admin equivalent.

**Query parameters:**

| Parameter | Type | Purpose |
|---|---|---|
| `tab` | string | Active browse mode: `popular`, `new` (latest), `block-themes`, `favorites`, `search`, `upload`, `dashboard`, `featured`, `updated` |
| `search` | string | Search query forwarded to themes API |
| `user` | string | WordPress.org username for favorites tab |
| `_wpnonce` | string | Nonce for saving WordPress.org username (`save_wporg_username_{user_id}`) |

**Tab hooks fired before and after render:**

- `install_themes_pre_{tab}` — fires before each tab renders (hook names: `install_themes_pre_block-themes`, `install_themes_pre_dashboard`, `install_themes_pre_featured`, `install_themes_pre_new`, `install_themes_pre_search`, `install_themes_pre_updated`, `install_themes_pre_upload`)
- `install_themes_{tab}` — fires in tab body (same name variants)

### 2.3 `GET /wp-admin/theme-editor.php`

Renders the theme file editor. On multisite, non-network-admin requests redirect to network admin.

**Query parameters:**

| Parameter | Type | Purpose |
|---|---|---|
| `theme` | string | Stylesheet slug of the theme to edit; defaults to active theme |
| `file` | string | Relative path within the theme directory of the file to edit; defaults to `style.css` |
| `a` | flag | Success indicator after a save redirect |
| `error` | flag | Present if file does not exist |

**POST action:**

- `action=update` with `newcontent`, `file`, `theme`, nonce `edit-theme_{stylesheet}_{relative_file}`. Calls `wp_edit_theme_plugin_file()`. On success, redirects to `?a=1&theme=...&file=...`.

### 2.4 `GET /wp-admin/customize.php`

Renders the Customizer chrome. Defines `IFRAME_REQUEST = true` which suppresses the normal admin header/footer.

**Query parameters:**

| Parameter | Type | Purpose |
|---|---|---|
| `url` | string | URL of the preview iframe's initial page |
| `return` | string | URL the close button returns to |
| `autofocus[section]` | string | Section slug to auto-open on load |
| `autofocus[control]` | string | Control ID to auto-open on load |
| `autofocus[panel]` | string | Panel slug to auto-open on load |
| `changeset_uuid` | string | UUID of an existing changeset (wp_customize_changeset post) to continue editing |

**Authorization check:**

Requires `customize` capability. If a `changeset_uuid` is provided, additionally checks `edit_post` capability on the changeset post. If the changeset has `future` status and the scheduled time has passed (missed schedule), an Ajax `customize_save` request is fired automatically to publish it.

If the changeset is already in `publish` or `trash` status, the Customizer dies with a 403 and a message directing the user to start fresh.

---

## Section 3: Authorization

### Capability Map

| Capability | Grants access to |
|---|---|
| `switch_themes` | themes.php grid, all activation/deletion/auto-update actions |
| `edit_theme_options` | themes.php grid (read-only, sees only active theme) |
| `install_themes` | theme-install.php, "Add Theme" button on themes.php |
| `upload_themes` | "Upload Theme" button/tab on theme-install.php |
| `update_themes` | auto-update toggle actions, update nag display |
| `delete_themes` | delete action on themes.php |
| `resume_themes` | resume action for paused themes on themes.php |
| `edit_themes` | theme-editor.php |
| `customize` | Customize/Live Preview buttons; customize.php |
| `manage_network_themes` | Network admin theme management on multisite |

### Access Logic

- A user with only `edit_theme_options` (but not `switch_themes`) sees the themes grid but only the currently active theme, with no activate/delete actions.
- On multisite, `install_themes` redirects to the network admin. The "Add Theme" button is hidden unless `!is_multisite() && current_user_can('install_themes')`.
- `DISALLOW_FILE_EDIT` constant (see Section 9) entirely removes the theme editor from the admin menu and blocks access.
- The customizer "Publish" button label changes from "Publish" to "Activate & Publish" when the previewed theme is not the currently active theme.

---

## Section 4: Themes List

### 4.1 Data Flow

PHP calls `wp_prepare_themes_for_js()` which returns an array of theme data objects. This array is serialized and injected via `wp_localize_script('theme', '_wpThemeSettings', {...})`. The resulting JavaScript global is:

```typescript
interface WpThemeSettings {
  themes: ThemeDataForJs[] | false;
  settings: {
    canInstall: boolean;
    installURI: string | null;
    confirmDelete: string;
    adminUrl: string;
    isInstall?: boolean; // only on theme-install.php
    activeTheme?: string; // only on theme-install.php
    installedThemes?: string[]; // only on theme-install.php
  };
  l10n: {
    addNew: string;
    search: string;
    themesFound: string;  // "%d" placeholder
    noThemesFound: string;
    upload?: string;
    back?: string;
    error?: string;
    tryAgain?: string;
    collapseSidebar?: string;
    expandSidebar?: string;
    selectFeatureFilter?: string;
  };
  installedThemes?: string[];
  activeTheme?: string;
}
```

### 4.2 Theme Card (Grid Item)

Each theme occupies a `<div class="theme">` card. The active theme receives the additional class `active` and is rendered first.

**Card anatomy:**

- **Screenshot**: `<div class="theme-screenshot">` containing an `<img>` whose `src` is `screenshot[0] + '?ver=' + version`. If no screenshot is available, the container gets class `blank` and no `<img>` is rendered.
- **Update badge**: If `hasUpdate` is true, a `.update-message` notice is shown inline on the card. If the update is compatible with current WordPress and PHP versions, it shows "New version available. Update now" (button if `hasPackage`, text otherwise). If incompatible, shows an error-style notice explaining which requirement fails.
- **Compatibility notice**: If `!compatibleWP || !compatiblePHP`, an error notice explains the incompatibility and links to update resources.
- **"Theme Details" button**: Opens the detail modal. `id` is `{themeId}-action`.
- **Author line**: "By {author}"
- **Theme name heading** (`h2`): For the active theme, prefixed with "Active:" in a `<span>`.
- **Action buttons**:
  - Active theme: "Customize" button (`.button.button-primary.customize`) linking to `actions.customize`. Only shown if user has `edit_theme_options` + `customize` (or it is a block theme).
  - Inactive theme (compatible): "Activate" button (`.button.activate`) + "Live Preview" button (`.button.button-primary.load-customize`). If it is a block theme, the "Live Preview" button is omitted.
  - Inactive theme (incompatible): disabled "Cannot Activate" button + disabled "Live Preview" button.

### 4.3 Theme Details Modal

Triggered by clicking "Theme Details". The modal template is `#tmpl-theme-single`. It renders:

- Navigation arrows (previous/next theme within the grid)
- Close button
- Screenshot (large)
- Theme name with version string
- Author line (linked if `authorAndUri` contains a URL)
- Compatibility notices (same logic as card)
- Update notices (same logic as card)
- Auto-update control (enable/disable toggle via `data-wp-action` attribute)
- Description text
- Parent theme notice (if `parent` is set): "This is a child theme of {parent}."
- Tags list

**Active-theme modal actions:**

- "Customize" button
- Current theme submenu actions (injected from PHP `$current_theme_actions`)

**Inactive-theme modal actions:**

- "Live Preview" button (if compatible)
- "Activate" button (if compatible and `actions.activate` is present)
- "Delete" button (if `!active && actions.delete` is present)

### 4.4 Client-side Search

The search form at the top of `themes.php` is a live-filter: as the user types, the JS framework filters `_wpThemeSettings.themes` client-side using the search string against theme names, descriptions, authors, and tags. No server round-trip occurs for installed-theme search.

### 4.5 Broken Themes Section

After the main grid, PHP renders a separate "Broken Themes" table for themes that have errors (e.g., missing stylesheet, missing parent). Each broken theme row shows:

- Theme name (display name or directory name if no Name header)
- Error message
- Resume button (if `resume_themes` cap and error code is `theme_paused`)
- Delete button (if `delete_themes` cap)
- "Install Parent Theme" button (if `install_themes` cap and error code is `theme_no_parent` and the parent exists on .org)

---

## Section 5: Theme Activation

### Full Activation Flow

1. User clicks "Activate" on a theme card (or in the modal).
2. The link URL is `themes.php?action=activate&stylesheet={slug}&_wpnonce={nonce}` where nonce action is `switch-theme_{slug}`.
3. Server validates nonce via `check_admin_referer('switch-theme_' + stylesheet)`.
4. Calls `wp_get_theme(stylesheet)`. If theme does not exist or is not allowed (multisite allowlist), dies with 403.
5. Calls `switch_theme(theme.get_stylesheet())` which:
   - Updates the `stylesheet` and `template` site options.
   - Fires `switch_theme` action (passing new theme name, new theme object, old theme object).
   - Deletes `theme_mods_{old_stylesheet}` transient data is preserved but `theme_mods_{stylesheet}` for the new theme is loaded.
6. Redirects to `themes.php?activated=true`.
7. On the next page load, the notice "New theme activated. Visit site" is shown.

### Activation Via Customizer

When a theme is activated through the Customizer (Activate & Publish button), the URL lands on `themes.php?activated=true&previewed=true`. The resulting notice reads "Settings saved and theme activated. Visit site."

### Block Theme Behavior

Block themes do not support the classic Customizer. The "Live Preview" button is suppressed for block themes. Instead, links point to the Site Editor. The "Customize" button for the active block theme also points to the Site Editor.

---

## Section 6: Theme Deletion

### Deletion Rules

A theme may be deleted only if all of the following are true:

1. The current user has the `delete_themes` capability.
2. The theme is not the currently active theme.
3. The theme is not the parent template of the currently active theme. Specifically, `wp_get_theme()->get('Template') !== $_GET['stylesheet']` must hold. If this condition fails, deletion is blocked and the user is redirected to `?delete-active-child=true`.

The "Delete" link only appears in the theme detail modal (not on the card itself), and only for inactive themes where `actions.delete` is present.

### Deletion Process (`delete_theme()`)

1. Acquires filesystem credentials via `request_filesystem_credentials()`. If FTP/SSH credentials are needed and not yet provided, the credentials form is displayed and the function returns `null`.
2. Initializes the WP Filesystem abstraction (`WP_Filesystem()`).
3. Fires `delete_theme` action (before deletion).
4. Calls `$wp_filesystem->delete($theme_dir, true)` (recursive directory deletion).
5. Fires `deleted_theme` action (after deletion, with a boolean success flag).
6. Removes installed translation files: `.po`, `.mo`, `.l10n.php`, and `-*.json` files from `WP_LANG_DIR/themes/`.
7. On multisite, calls `WP_Theme::network_disable_theme(stylesheet)`.
8. Calls `$theme->cache_delete()` to clear the WP_Theme object cache.
9. Deletes the `update_themes` site transient to force a fresh update check.
10. Returns `true` on success, `WP_Error` on failure.

---

## Section 7: Theme Install

### 7.1 Browse Modes (Tabs)

The theme installer's JavaScript fetches results from the WordPress.org API via the `themes_api()` PHP function, which is called server-side through an Ajax handler. The UI tabs map to API browse parameters:

| Tab | API `browse` value | Notes |
|---|---|---|
| Popular | `popular` | Most-downloaded themes |
| Latest | `new` | Recently published/updated |
| Block Themes | `block-themes` | Themes with Full Site Editing support |
| Favorites | (uses `user` param) | Themes favorited by a WordPress.org user |
| Feature Filter | (uses `tag` param array) | Filter by feature checkboxes |
| Search | (uses `search` param) | Full-text search |
| Upload | N/A | File upload form |

### 7.2 `themes_api()` Function

```
themes_api(action: string, args: ThemesApiArgs): object | object[] | WP_Error
```

**Actions:**

- `query_themes` — returns a paginated list of themes. Returns an object with `themes` array and `info` object (page, pages, results count).
- `theme_information` — returns full details for a single theme by slug.
- `feature_list` — returns the canonical list of theme tags/features from .org.
- `hot_tags` — returns popular tags.

**`query_themes` arguments:**

```typescript
interface ThemesApiQueryArgs {
  per_page?: number;    // Default 24
  page?: number;        // Default 1
  search?: string;
  tag?: string;
  author?: string;
  user?: string;        // For favorites browse
  browse?: 'featured' | 'popular' | 'updated' | 'favorites' | 'new' | 'block-themes';
  locale?: string;      // Defaults to get_locale()
  fields?: {
    description?: boolean;
    sections?: boolean;
    rating?: boolean;
    ratings?: boolean;
    downloaded?: boolean;
    downloadlink?: boolean;
    last_updated?: boolean;
    tags?: boolean;
    homepage?: boolean;
    screenshots?: boolean;
    screenshot_count?: number;
    screenshot_url?: boolean;
    photon_screenshots?: boolean;
    template?: boolean;
    parent?: boolean;
    versions?: boolean;
    theme_url?: boolean;
    extended_author?: boolean;
  };
}
```

**`theme_information` arguments:**

```typescript
interface ThemesApiInfoArgs {
  slug: string;
  locale?: string;
  fields?: ThemesApiQueryArgs['fields'];
}
```

**Filters:**

- `themes_api_args` — modify the args object before the API call.
- `themes_api` — short-circuit the API call entirely; must return an object.
- `themes_api_result` — filter the API response.

### 7.3 Feature Filter

The feature filter drawer is populated from `get_theme_feature_list()`. This function first tries to load the feature list from the `wporg_theme_feature_list` site transient (3-hour TTL). On cache miss it calls `themes_api('feature_list')`. The hard-coded fallback categories are:

- **Subject**: blog, e-commerce, education, entertainment, food-and-drink, holiday, news, photography, portfolio
- **Features**: accessibility-ready, block-patterns, block-styles, custom-background, custom-colors, custom-header, custom-logo, editor-style, featured-image-header, featured-images, footer-widgets, full-site-editing, full-width-template, post-formats, sticky-post, style-variations, template-editing, theme-options
- **Layout**: grid-layout, one-column, two-columns, three-columns, four-columns, left-sidebar, right-sidebar, wide-blocks

### 7.4 Install from WordPress.org

The "Install" button on a theme card triggers an Ajax-based install flow. The install URL is:

```
update.php?action=install-theme&theme={slug}&_wpnonce={nonce_for_install-theme_{slug}}
```

This is handled by the `wp-admin/update.php` file, not themes.php or theme-install.php.

### 7.5 Install from ZIP Upload

The upload form (`install_themes_upload()`) posts to `wp-admin/update.php?action=upload-theme`. The uploaded file is a `.zip` archive. The process:

1. The ZIP is uploaded to a temporary location.
2. It is unpacked and validated (must contain a valid theme with a `style.css` with `Theme Name:` header).
3. The theme directory is moved to `WP_CONTENT_DIR/themes/`.
4. Success message with "Activate" and "Return to Theme Installer" links.

### 7.6 Favorites Tab

The favorites form saves the user's WordPress.org username to `wporg_favorites` user meta (key: `wporg_favorites`, stored via `update_user_meta`). The nonce action is `save_wporg_username_{user_id}`. On subsequent loads, the stored username is retrieved via `get_user_option('wporg_favorites')`.

### 7.7 Theme Preview (theme-install.php)

Theme preview from the installer uses the `tmpl-theme-preview` template, which renders a `<div class="wp-full-overlay-sidebar">` alongside an `<iframe src="{{ data.preview_url }}">`. The sidebar shows theme metadata, ratings, install/activate button.

---

## Section 8: Theme Updates

### 8.1 Update Detection

Updates are stored in the `update_themes` site transient. The structure is:

```typescript
interface UpdateThemesTransient {
  last_checked: number;       // Unix timestamp of last check
  checked: Record<string, string>; // slug => installed version
  response: Record<string, {  // themes that have updates
    theme: string;            // stylesheet slug
    new_version: string;
    url: string;              // Theme detail page URL
    package: string;          // Download ZIP URL (empty if unavailable)
    requires: string;         // Minimum WP version
    requires_php: string;
  }>;
  no_update: Record<string, object>; // themes at latest version
  translations: TranslationUpdate[];
}
```

WordPress checks for updates by calling `themes_api('theme_information', {slug, fields: {versions: true}})` for each installed theme and comparing the current version against the latest version.

### 8.2 Update Display

On `themes.php`, the update badge is rendered inline on each theme card and in the detail modal. It shows:

- If compatible with current WP and PHP: yellow warning notice "New version available. Update now" (button if package URL exists).
- If incompatible: red error notice explaining why.

The "Update now" inline button triggers an Ajax update via the `updates` JS module.

### 8.3 Auto-updates

Auto-update state is stored in the `auto_update_themes` site option (an array of theme stylesheet slugs). When the WP-Cron hook `wp_update_themes` fires, it processes themes in this list. The enable/disable toggle is per-theme and controlled via:

- `GET themes.php?action=enable-auto-update&stylesheet={slug}&_wpnonce={nonce}` — nonce action `updates`
- `GET themes.php?action=disable-auto-update&stylesheet={slug}&_wpnonce={nonce}` — nonce action `updates`

Both actions intersect the stored list with currently installed themes before saving, to clean up deleted themes.

The auto-update UI template (`wp_theme_auto_update_setting_template()`) renders inside the theme detail modal. It shows:

- "Auto-updates disabled" (if forced off by filter)
- "Auto-updates enabled" (if forced on by filter)
- "Disable auto-updates" toggle button (if currently enabled, with `data-wp-action="disable"`)
- "Enable auto-updates" toggle button (if currently disabled, with `data-wp-action="enable"`)

If `data.hasUpdate` and auto-updates are enabled, an estimated next-update time is shown.

**Filter:** `auto_update_theme` — return `true`/`false`/`null` to force/prevent/defer auto-update for a given theme.

---

## Section 9: Theme Editor

### 9.1 Access Control

The theme editor requires the `edit_themes` capability. On multisite, it redirects non-network-admin requests to the network admin URL.

**`DISALLOW_FILE_EDIT` constant**: If defined as `true` in `wp-config.php`, the theme editor (and plugin editor) are completely disabled. WordPress removes them from admin menus and any direct access is blocked.

**`DISALLOW_FILE_MODS` constant**: If defined as `true`, it prevents all file modifications including updates, but the editor UI may still be visible (access to the save button is restricted by the filesystem write check).

### 9.2 Theme Selection

A `<select>` dropdown lists all installed themes (excluding those with `theme_no_stylesheet` error). The user selects a theme and submits the form via GET to `theme-editor.php?theme={stylesheet}`. The default theme is the currently active theme (`get_stylesheet()`).

### 9.3 File Listing

The function `wp_get_theme_file_editable_extensions($theme)` returns the allowed editable file types. The default list includes:

- `php`
- `css`
- Additional types as registered by plugins via the `wp_theme_editor_filetypes` filter.

For each allowed type, `$theme->get_files($type, -1)` is called to recursively enumerate all files of that type within the theme directory. The resulting flat map of relative path to absolute path is the `$allowed_files` array.

`functions.php` and `style.css` are moved to the top of the file list. If no `file` parameter is given, `style.css` is the default.

The file tree is rendered via `wp_print_theme_file_tree(wp_make_theme_file_tree($allowed_files))`, which produces a nested `<ul>` tree reflecting the directory structure.

### 9.4 File Editing

The selected file's content is read and HTML-escaped via `esc_textarea()` before output inside a `<textarea id="newcontent">`. The CodeMirror editor (`wp_enqueue_code_editor`) wraps this textarea with syntax highlighting.

**Nonce**: `edit-theme_{stylesheet}_{relative_file}`

The form POSTs `action=update`, `file={relative_file}`, `theme={stylesheet}`, `newcontent={content}`, `nonce={nonce}` to `theme-editor.php`.

Server-side, `validate_file_to_edit($file, $allowed_files)` checks that the requested file is within the allowed list and within the theme directory (prevents path traversal). The file must be writable for the "Update File" submit button to appear; otherwise a message directs the user to adjust file permissions.

### 9.5 PHP Documentation Lookup

For `.php` files, `wp_doc_link_parse($content)` parses the file content and extracts recognized WordPress function names. These populate a `<select id="docs-list">` dropdown. When a function is selected and "Look Up" is clicked, the browser opens:

```
https://api.wordpress.org/core/handbook/1.0/?function={functionName}&locale={locale}&version={wp_version}&redirect=true
```

### 9.6 Warning Dialog

On first visit (based on the `theme_editor_notice` value in the `dismissed_wp_pointers` user meta), a modal warning dialog is shown:

- "Heads up! You appear to be making direct edits to your theme..."
- "Go back" link (to the HTTP referer, excluding `theme-editor.php` and `wp-login.php` from eligible referers; falls back to `admin_url('/')`)
- "I understand" button (dismisses the pointer via an Ajax call to `dismiss-wp-pointer`)

### 9.7 CSS File Special Behavior

When a `.css` file is open, an informational notice is shown:

- For classic themes: "There is no need to change your CSS here — you can edit and live preview CSS changes in the built-in CSS editor." (links to `customize.php?autofocus[section]=custom_css`)
- For block themes: Same message, links to `site-editor.php?p=/styles&section=/css`

If a `.min.css` version of the current file exists, a warning is shown: "There is a minified version of this stylesheet. It is likely that this unminified stylesheet will not be served to visitors."

### 9.8 Child Theme Warning

When editing a file that belongs to the active child theme's parent (i.e., `is_child_theme()` and current theme's stylesheet = get_template()`), a warning notice "Caution: This is a file in your current parent theme." is shown inline within the form.

---

## Section 10: The Customizer

### 10.1 Architecture

The Customizer page (`customize.php`) defines `IFRAME_REQUEST = true` and outputs a complete standalone HTML document (not wrapped in the normal admin header/footer). It consists of:

**Left sidebar (controls pane):**
- `#customize-header-actions`: Contains the "Publish" / "Activate & Publish" / "Cannot Activate" button, "Publish Settings" gear button, preview-toggle button (Customize/Preview), and close button.
- `#customize-notifications-area`: Notification container for control errors.
- `#customize-info`: Accordion showing "You are customizing {site name}" with a help toggle.
- `#customize-theme-controls`: The `<ul class="customize-pane-parent">` into which all panels and sections are injected by JavaScript.
- `#customize-footer-actions`: Collapse-sidebar button and device preview toggle buttons (desktop/tablet/mobile).

**Right area (preview pane):**
- `#customize-preview`: A `<div>` into which a `<iframe>` is injected by JavaScript pointing to the preview URL.

### 10.2 PHP/JavaScript Communication Model

The Customizer uses a two-way postMessage communication channel between the controls pane (parent window) and the preview iframe (child window). This is the "transport" mechanism.

**Preview transport** (`postMessage` vs. `refresh`):

- Each Customize setting has a transport property: `'postMessage'` or `'refresh'`.
- `postMessage` settings update immediately in the preview without a page reload by sending a message to the iframe via `window.postMessage()`.
- `refresh` settings cause the entire preview iframe to reload with the new value added as a query param.

The preview frame loads the site URL with the `?customize_changeset_uuid={uuid}` parameter appended, which signals the front-end to load pending changeset values.

### 10.3 Changeset System

Changesets are stored as WordPress posts of the custom post type `customize_changeset` (internal post type, not shown in admin menus).

**Post type registration:**
- `post_type`: `customize_changeset`
- `post_status`: `draft`, `future` (scheduled publish), `publish` (published / applied)
- `post_name`: The changeset UUID (a v4 UUID string)
- `post_content`: JSON blob containing all pending setting changes

**Changeset flow:**

1. When the user makes a change in the Customizer, the setting value is stored in memory.
2. When the user clicks "Save Draft" or the auto-save timer fires, an Ajax request to `wp-admin/admin-ajax.php?action=customize_save` is made.
3. The `customize_save` handler creates or updates a `customize_changeset` post with `post_status = draft`.
4. The `post_content` JSON format is:
   ```json
   {
     "setting_id": {
       "value": "...",
       "type": "option|theme_mod",
       "user_id": 1,
       "date_modified_gmt": "2026-01-01 00:00:00"
     }
   }
   ```
5. When the user clicks "Publish" (or "Activate & Publish"), the same `customize_save` Ajax endpoint is called with `customize_changeset_status = publish`.
6. Publishing the changeset triggers `wp_customize_save_changeset_post_data`, applies all setting values, and transitions the changeset post status to `publish`.

**Scheduled publishing:**

The Customizer supports scheduling a changeset via a standard WordPress future-post publish mechanism. If a changeset has `post_status = future` and the schedule time has passed when the Customizer is opened, an auto-publish Ajax request is fired immediately.

### 10.4 Device Preview Buttons

The Customizer footer contains device preview toggle buttons. These are populated from `$wp_customize->get_previewable_devices()`. Default devices:

```typescript
interface PreviewableDevice {
  label: string;
  default?: boolean;  // which device is initially selected
}
```

Default: `desktop` (default), `tablet`, `mobile`.

Clicking a device button sets a CSS class on the preview container that constrains its width to simulate that device.

### 10.5 Publishing Flow Detail

When the user clicks "Publish" / "Activate & Publish":

1. JavaScript collects all dirty setting values.
2. Sends Ajax `POST wp-admin/admin-ajax.php action=customize_save` with:
   - `nonce`: from `wp_customize->get_nonces()['save']`
   - `customize_changeset_uuid`: current UUID
   - `wp_customize`: `'on'`
   - `customize_changeset_status`: `'publish'`
   - Dirty setting values serialized
3. Server applies each setting value, transitions changeset to `publish`.
4. If the previewed theme is not active, `switch_theme()` is called.
5. Response includes `changeset_uuid` for a new empty changeset and a redirect URL to `themes.php?activated=true&previewed=true`.

### 10.6 Autofocus

Query parameters `autofocus[section]`, `autofocus[control]`, and `autofocus[panel]` cause the Customizer to automatically open and scroll to the named component on load. The server passes these via `$wp_customize->set_autofocus($autofocus)` and they are included in the `_wpCustomizeSettings.autofocus` JavaScript object.

---

## Section 11: Key Hooks and Filters

### themes.php Actions

| Hook | When Fired |
|---|---|
| `switch_theme` | After `switch_theme()` changes the active theme |
| `delete_theme` | Immediately before a theme directory is deleted |
| `deleted_theme` | Immediately after a theme deletion attempt (bool $deleted passed) |
| `pre_current_active_plugins` | Before plugins list table renders (also fired on themes context) |

### theme-install.php Dynamic Hooks

| Hook | Description |
|---|---|
| `install_themes_pre_{tab}` | Fires before each tab renders |
| `install_themes_{tab}` | Fires in each tab body with `$paged` as argument |

### themes_api Filters

| Filter | Description |
|---|---|
| `themes_api_args` | Modify API request arguments |
| `themes_api` | Short-circuit the API call entirely |
| `themes_api_result` | Filter API response |

### Theme Editor Filters

| Filter | Description |
|---|---|
| `wp_theme_editor_filetypes` | Add/remove editable file extensions |
| `editable_extensions` | Alias filter for editable extensions |

### Customizer Hooks

| Hook | Description |
|---|---|
| `customize_controls_init` | Fires when controls are initialized |
| `customize_controls_enqueue_scripts` | Fires when control scripts should be enqueued |
| `customize_controls_print_styles` | Fires to print control CSS |
| `customize_controls_print_scripts` | Fires to print control JS |
| `customize_controls_head` | Fires in `<head>` of Customizer |
| `customize_controls_print_footer_scripts` | Fires in footer of Customizer |
| `customize_save_{setting_id}` | Fires when a specific setting is saved |
| `customize_save_changeset_post_data` | Filters changeset post data before saving |
| `customize_save_response` | Filters the Ajax response data after save |

### Auto-update Filters

| Filter | Description |
|---|---|
| `auto_update_theme` | Control per-theme auto-update; return true/false/null |
| `theme_auto_update_setting_template` | Filter the JS template for the auto-update toggle |

---

## Section 12: TypeScript Interface Sketch

```typescript
// -------------------------------------------------------
// Theme data as prepared for JavaScript (wp_prepare_themes_for_js output)
// -------------------------------------------------------

interface ThemeActions {
  activate: string;     // URL for activation
  customize: string;    // URL for Customizer/Live Preview
  delete?: string;      // URL for deletion (only for inactive themes)
  autoupdate?: string;  // URL for auto-update toggle
}

interface ThemeAutoUpdate {
  supported: boolean;
  enabled: boolean;
  forced: boolean | null;  // null = not forced; true/false = forced on/off
}

interface ThemeUpdateResponse {
  compatibleWP: boolean;
  compatiblePHP: boolean;
}

interface ThemeDataForJs {
  id: string;           // stylesheet slug
  name: string;
  screenshot: string[]; // array of screenshot URLs; [0] is used
  description: string;
  author: string;
  authorAndUri: string; // HTML anchor or plain text
  version: string;
  tags: string;         // comma-separated or HTML list
  parent: string | false;
  active: boolean;
  blockTheme: boolean;
  compatibleWP: boolean;
  compatiblePHP: boolean;
  hasUpdate: boolean;
  hasPackage: boolean;  // whether update package URL is available
  update: string;       // HTML for the update message
  updateResponse: ThemeUpdateResponse;
  autoupdate: ThemeAutoUpdate;
  actions: ThemeActions;
  customize_url?: string;
}

// -------------------------------------------------------
// themes_api shapes
// -------------------------------------------------------

type ThemesApiAction =
  | 'query_themes'
  | 'theme_information'
  | 'hot_tags'
  | 'feature_list';

interface ThemesApiFields {
  description?: boolean;
  sections?: boolean;
  rating?: boolean;
  ratings?: boolean;
  downloaded?: boolean;
  downloadlink?: boolean;
  last_updated?: boolean;
  tags?: boolean;
  homepage?: boolean;
  screenshots?: boolean;
  screenshot_count?: number;
  screenshot_url?: boolean;
  photon_screenshots?: boolean;
  template?: boolean;
  parent?: boolean;
  versions?: boolean;
  theme_url?: boolean;
  extended_author?: boolean;
}

interface ThemesApiArgs {
  slug?: string;
  per_page?: number;
  page?: number;
  number?: number;
  search?: string;
  tag?: string | string[];
  author?: string;
  user?: string;
  browse?: 'featured' | 'popular' | 'updated' | 'favorites' | 'new' | 'block-themes';
  locale?: string;
  fields?: ThemesApiFields;
}

interface ThemesApiTheme {
  name: string;
  slug: string;
  version: string;
  author: string;
  screenshot_url: string;
  rating: number;
  num_ratings: number;
  reviews_url: string;
  downloaded: number;
  last_updated: string;
  homepage: string;
  description: string;
  tags: Record<string, string>;
  download_link: string;
  compatible_wp: boolean;
  compatible_php: boolean;
  requires: string;
  requires_php: string;
  stars: string;  // HTML star rating markup
}

interface ThemesApiQueryResult {
  themes: ThemesApiTheme[];
  info: {
    page: number;
    pages: number;
    results: number;
  };
}

// -------------------------------------------------------
// Update transient
// -------------------------------------------------------

interface ThemeUpdateEntry {
  theme: string;
  new_version: string;
  url: string;
  package: string;
  requires: string;
  requires_php: string;
}

interface UpdateThemesTransient {
  last_checked: number;
  checked: Record<string, string>;
  response: Record<string, ThemeUpdateEntry>;
  no_update: Record<string, Partial<ThemeUpdateEntry>>;
  translations?: TranslationUpdate[];
}

// -------------------------------------------------------
// Customizer Changeset post content structure
// -------------------------------------------------------

interface ChangesetSettingEntry {
  value: unknown;
  type: 'option' | 'theme_mod';
  user_id: number;
  date_modified_gmt: string;
}

type ChangesetData = Record<string, ChangesetSettingEntry>;

// -------------------------------------------------------
// Previewable devices
// -------------------------------------------------------

interface PreviewableDevice {
  label: string;
  default?: boolean;
}

type PreviewableDevices = Record<string, PreviewableDevice>;

// -------------------------------------------------------
// Theme feature list
// -------------------------------------------------------

type ThemeFeatureList = Record<string, Record<string, string>>;
// e.g. { 'Subject': { 'blog': 'Blog', 'e-commerce': 'E-Commerce' }, ... }

// -------------------------------------------------------
// delete_theme result
// -------------------------------------------------------

type DeleteThemeResult = true | null | ThemeDeleteError;

interface ThemeDeleteError {
  code: 'fs_unavailable' | 'fs_error' | 'fs_no_themes_dir' | 'could_not_remove_theme';
  message: string;
  data?: unknown;
}

// -------------------------------------------------------
// Theme file editor types
// -------------------------------------------------------

interface ThemeEditorFileMap {
  [relativePath: string]: string;  // relative path => absolute path
}

interface ThemeEditorSettings {
  codeEditor: CodeEditorSettings | false;
}

interface CodeEditorSettings {
  codemirror: Record<string, unknown>;
  csslint: Record<string, unknown>;
  jshint: Record<string, unknown>;
  htmlhint: Record<string, unknown>;
}

// -------------------------------------------------------
// _wpThemeSettings global
// -------------------------------------------------------

interface WpThemeSettings {
  themes: ThemeDataForJs[] | false;
  settings: {
    canInstall: boolean;
    installURI: string | null;
    confirmDelete: string;
    adminUrl: string;
    isInstall?: boolean;
    activeTheme?: string;
    installedThemes?: string[];
  };
  l10n: {
    addNew: string;
    search: string;
    themesFound: string;
    noThemesFound: string;
    upload?: string;
    back?: string;
    error?: string;
    tryAgain?: string;
    collapseSidebar?: string;
    expandSidebar?: string;
    selectFeatureFilter?: string;
  };
}
```

---

## Section 13: Design Patterns

### 13.1 PHP-Generated, JavaScript-Driven Grid

The themes list page uses a pattern where PHP renders the initial state of the grid synchronously (for fast first paint and no-JS fallback), and JavaScript then takes over the same DOM by reading from `_wpThemeSettings.themes`. Client-side Underscore.js templates (`tmpl-theme`, `tmpl-theme-single`, `tmpl-theme-preview`) are embedded in `<script type="text/template">` tags and rendered by the JavaScript router.

When rewriting in TypeScript/React, the initial data object (`_wpThemeSettings`) should be treated as the server-sent state and hydrated into a React context or Redux store. Client-side search, modal open/close, and theme navigation all operate against this in-memory dataset.

### 13.2 Nonce-per-Action Pattern

Every mutation action (activate, delete, auto-update toggle) uses a distinct nonce keyed to both the action type and the specific theme slug (e.g., `switch-theme_{slug}`, `delete-theme_{slug}`). This prevents CSRF and also prevents one nonce from authorizing a different theme. In a TypeScript rewrite, the server must issue these nonces per-theme and embed them in the initial page data.

### 13.3 Redirect-After-POST (PRG Pattern)

All state-changing actions redirect after completion. The redirect URL carries a status flag as a query parameter (`?activated=true`, `?deleted=true`). The next page load reads this flag, displays a dismissible admin notice, and then serves a clean URL (the flag is stripped from the canonical URL by JavaScript that rewrites `window.history`). This prevents double-submission on browser refresh.

### 13.4 Filesystem Abstraction

Theme deletion uses `WP_Filesystem`, an abstraction layer that supports Direct, FTP, FTP-over-SSH, and SSH2 transports. When filesystem credentials are not cached, the `request_filesystem_credentials()` function interrupts the request flow with a credentials form. In a TypeScript rewrite, this is best replaced with a server-side service that handles filesystem operations directly with proper permissions, rather than prompting for FTP credentials.

### 13.5 Changeset as Draft

The Customizer's changeset system stores all pending changes as a `draft` post before they are applied. This design allows:

- Multiple concurrent editing sessions (each user gets their own changeset UUID).
- Scheduled publishing (set `post_status = future` with a `post_date`).
- Autosave without side effects.
- Audit trail of who changed what and when.

In a TypeScript rewrite, this pattern maps naturally to a "pending changes" document stored in the database. Each save creates/updates this document. Publishing applies all changes atomically and marks the document as published.

### 13.6 Inline Template Synchronization

The PHP loop that renders the initial theme grid HTML and the `#tmpl-theme` JavaScript template are explicitly documented as synchronized with each other. They must produce identical markup from the same data. In a TypeScript rewrite using a single rendering path (e.g., server-side React), this duplication is eliminated and this synchronization burden disappears.

### 13.7 Capability-Gated UI

All action URLs (activate, delete, customize, live preview) are conditionally included in the theme data objects only if the current user has the necessary capabilities. JavaScript never has to check capabilities directly; it only checks whether `actions.activate`, `actions.delete`, etc. are truthy. This is a clean separation: PHP gates what data is sent; JavaScript determines how to render it.

---

## 14. Tovu Reconstruction Notes

### 14.1 Why this exists

Theme management exists because presentation packages need an operator lifecycle just as much as plugins do. Themes are installed assets, but they also control active rendering state, preview, customization, and pending changes.

### 14.2 What Tovu should preserve

- Presentation packages need explicit lifecycle state and preview semantics
- The server should gate available actions before the UI renders them
- Draftable theme changes are a real product requirement, not just a UI convenience
- Theme switching and preview should be separated from immediate destructive mutation

### 14.3 What Tovu can simplify

- Tovu can avoid PHP filesystem credential flows and duplicated PHP/JS template rendering
- The initial theme grid can be implemented with one render path instead of synchronized dual templates
- V1 can ship a simpler preview/customization draft model than the full Customizer changeset system

### 14.4 Possible Tovu seams

- `src/features/presentation/` for theme lifecycle and active-theme state
- `src/core/ports/ThemePackagePort.ts` for installed theme artifacts
- `src/core/ports/PresentationDraftPort.ts` for pending customization changes and preview sessions

### 14.5 Suggested priority

- `V1`: installed vs active theme state, preview flow, capability-gated actions
- `Later`: richer draft/publish lifecycle, scheduled theme changes, advanced preview orchestration
