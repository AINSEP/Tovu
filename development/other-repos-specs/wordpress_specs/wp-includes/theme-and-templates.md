# Theme and Templates — Specification

**Source files analyzed:**
- `wp-includes/theme.php`
- `wp-includes/class-wp-theme.php`
- `wp-includes/template.php`
- `wp-includes/template-loader.php`
- `wp-includes/theme-templates.php`
- `wp-includes/block-template-utils.php`
- `wp-includes/general-template.php` (for `get_header`, `get_footer`, `get_sidebar`, `get_template_part`)

---

## 1. Overview

WordPress has two distinct theme architectures that coexist under the same theme system.

### Classic Themes

A classic (PHP-based) theme is a directory of PHP template files. The template loader selects one file based on the current request type (single post, archive, 404, etc.) and `include`s it. The PHP file can in turn call `get_header()`, `get_footer()`, `get_sidebar()`, and `get_template_part()` to assemble the page from smaller files. Everything is PHP, and templates have access to the global WordPress environment via extracted query vars.

The mandatory file is `index.php` at the theme root (or `style.css` for a child theme that delegates to a parent). Without `index.php`, the theme is considered broken.

### Block Themes (Full Site Editing — FSE)

A block theme ships HTML files instead of PHP files. These HTML files contain block markup (WordPress block grammar). The mandatory file is `templates/index.html`. Instead of `index.php`, the theme root contains a `theme.json` file that configures design tokens (colors, typography, spacing), block styles, and layout settings.

Block themes register two custom post types for database-persisted user customizations:
- `wp_template` — full page templates (stored as block markup in `post_content`)
- `wp_template_part` — reusable regions like headers and footers

When no user customization exists, templates are loaded from theme files (`templates/*.html`, `parts/*.html`).

### Coexistence

The active theme is always identified by two options: `template` (the parent theme's directory name) and `stylesheet` (the child theme's directory name, or the same as `template` for a non-child theme). Every theme path computation traces back to these two options.

---

## 2. WP_Theme Data Type

`WP_Theme` is the primary object representing a theme. It is instantiated with a directory name and an absolute theme root path. It parses `style.css`, resolves the parent theme if applicable, validates structure, and caches the result.

### Style.css Headers

The following fields are parsed from the `style.css` file header comment:

| Internal key | Header string | Notes |
|---|---|---|
| `Name` | `Theme Name` | Display name; required |
| `ThemeURI` | `Theme URI` | URL-sanitized |
| `Description` | `Description` | HTML-sanitized with limited tags |
| `Author` | `Author` | HTML-sanitized |
| `AuthorURI` | `Author URI` | URL-sanitized |
| `Version` | `Version` | Tags stripped |
| `Template` | `Template` | Directory name of parent theme |
| `Status` | `Status` | Defaults to `'publish'` if empty |
| `Tags` | `Tags` | Parsed as comma-separated array |
| `TextDomain` | `Text Domain` | i18n text domain |
| `DomainPath` | `Domain Path` | Relative path to .po files |
| `RequiresWP` | `Requires at least` | Minimum WordPress version |
| `RequiresPHP` | `Requires PHP` | Minimum PHP version |
| `UpdateURI` | `Update URI` | Custom update server URI |

### Internal Properties

```typescript
interface WPThemeInternals {
  stylesheet: string;           // directory name of this theme (child's dir if child)
  template: string;             // directory name of the parent (same as stylesheet for non-child)
  theme_root: string;           // absolute filesystem path to the themes root directory
  headers: Record<string, string | string[]>; // raw parsed headers
  headers_sanitized: Record<string, string | string[]>; // sanitized headers (lazily populated)
  errors: WPError | null;       // null if valid
  parent: WPTheme | null;       // parent theme instance; null if standalone
  theme_root_uri: string | null; // lazily resolved URL to themes root
  textdomain_loaded: boolean | null; // null = not yet attempted
  name_translated: string | null;   // cached translated name
  block_theme: boolean | null;       // null = not yet determined
  block_template_folders: Record<string, string> | null; // null = not yet determined
  cache_hash: string;           // md5(theme_root + '/' + stylesheet), used as cache key
}
```

### Error Codes

| Code | Meaning |
|---|---|
| `theme_not_found` | The theme directory does not exist at all |
| `theme_no_stylesheet` | `style.css` is absent |
| `theme_stylesheet_not_readable` | `style.css` exists but is not readable |
| `theme_no_index` | Not a child theme and lacks both `templates/index.html` and `index.php` |
| `theme_no_parent` | `Template` header points to a parent that cannot be found |
| `theme_child_invalid` | The `Template` header points to itself |
| `theme_parent_invalid` | Circular parent reference or three-generation chain |
| `theme_root_missing` | The entire themes directory is missing |
| `theme_paused` | Theme is in the paused-themes recovery list |

A theme with an error **does exist** unless the error code is `theme_not_found`. The `exists()` method checks for this distinction.

### Block Theme Detection

A theme is a block theme if it has a readable file at either:
- `{stylesheet_directory}/templates/index.html`
- `{stylesheet_directory}/block-templates/index.html` (deprecated path, kept for backwards compat)

This is checked once and cached in `block_theme`.

### Block Template Folders

The default template folders are:
- `wp_template` → `'templates'`
- `wp_template_part` → `'parts'`

For themes that still use the deprecated folder names (`block-templates`, `block-template-parts`), these are used instead. The folder names are determined by checking for the existence of the deprecated directories, and the result is cached.

### Constructor Logic (Step by Step)

1. Compute `cache_hash = md5(theme_root + '/' + stylesheet)`.
2. Attempt to load a cached theme object from the `'themes'` object cache group using key `'theme-' + cache_hash`.
3. If cache hit: restore `block_template_folders`, `block_theme`, `errors`, `headers`, `template` from cache. If errors exist, stop.
4. If the `style.css` file does not exist:
   - Set `errors` with `theme_not_found` or `theme_no_stylesheet` depending on whether the directory itself exists.
   - Cache the error state and return.
5. If `style.css` is not readable: set `theme_stylesheet_not_readable`, cache, return.
6. Parse all headers from `style.css`.
7. If `Template` header equals `stylesheet` (circular self-reference): set `theme_child_invalid`, cache, return.
8. If `Template` header is empty (standalone theme): check for `index.php` (classic) or `templates/index.html` (block). If neither exists, set `theme_no_index`, cache, return.
9. If `Template` header is non-empty: try to locate the parent. Check adjacent directory, then `search_theme_directories()`. If not found: set `theme_no_parent`, instantiate a stub parent, cache, return.
10. If parent found: instantiate `parent = new WP_Theme(template, parentRoot, this)`. The third argument is passed so the parent can detect circular chains (max two generations).
11. Check if theme is paused: if so, add `theme_paused` error.
12. Cache the valid theme object.

### Public Methods

| Method | Returns | Notes |
|---|---|---|
| `get(header)` | `string \| string[] \| false` | Sanitized raw header (not translated) |
| `display(header, markup?, translate?)` | `string \| string[] \| false` | Sanitized, optionally translated, optionally HTML-marked-up header |
| `get_stylesheet()` | `string` | Directory name of this theme |
| `get_template()` | `string` | Directory name of the parent theme (or same) |
| `get_stylesheet_directory()` | `string` | Absolute path to this theme's directory |
| `get_template_directory()` | `string` | Absolute path to the parent theme's directory (or this theme if standalone) |
| `get_stylesheet_directory_uri()` | `string` | URL to this theme's directory |
| `get_template_directory_uri()` | `string` | URL to the parent theme's directory (or this theme if standalone) |
| `get_theme_root()` | `string` | Absolute path to the themes root |
| `get_theme_root_uri()` | `string` | URL to the themes root (lazily resolved via `get_theme_root_uri()` global) |
| `get_screenshot(uri?)` | `string \| false` | Screenshot file. `uri='relative'` returns filename only, default returns absolute URI. Searches for `screenshot.png/gif/jpg/jpeg/webp/avif`. |
| `get_files(type?, depth?, search_parent?)` | `Record<string, string>` | Scans for files by extension. Keys are relative paths, values are absolute paths. |
| `get_post_templates()` | `Record<string, Record<string, string>>` | All page templates keyed by post type then by relative file path → template name header |
| `get_page_templates(post?, post_type?)` | `Record<string, string>` | Templates for a given post type (default `'page'`) |
| `is_block_theme()` | `boolean` | Whether this is a block/FSE theme |
| `get_block_template_folders()` | `Record<string, string>` | Folder names for `wp_template` and `wp_template_part` |
| `get_file_path(file?)` | `string` | Resolves a relative file path, checking child dir first then parent dir |
| `exists()` | `boolean` | True unless error code is `theme_not_found` |
| `errors()` | `WPError \| false` | Returns error object or false if valid |
| `parent()` | `WPTheme \| false` | The parent theme object or false |
| `load_textdomain()` | `boolean` | Loads the theme's translation files |
| `is_allowed(check?, blog_id?)` | `boolean` | Multisite: checks if theme is allowed on network/site. Always true in single-site. |
| `cache_delete()` | `void` | Invalidates all cache entries and re-initializes |

**Static Methods:**

| Method | Returns | Notes |
|---|---|---|
| `WP_Theme.get_core_default_theme()` | `WPTheme \| false` | Finds the most recent installed default theme by iterating `$default_themes` in reverse |
| `WP_Theme.get_allowed(blog_id?)` | `Record<string, true>` | Combined network + site allowed themes |
| `WP_Theme.get_allowed_on_network()` | `Record<string, true>` | Themes allowed on the entire network (from `allowedthemes` site option) |
| `WP_Theme.get_allowed_on_site(blog_id?)` | `Record<string, true>` | Themes allowed on a specific site (from `allowedthemes` site option) |

### Header Sanitization Rules

- `Name`, `Status`: HTML-filtered (allowed tags: `abbr`, `acronym`, `code`, `em`, `strong`). Status defaults to `'publish'`.
- `Author`, `Description`: HTML-filtered with additionally allowed `<a href title>`.
- `ThemeURI`, `AuthorURI`: URL-sanitized.
- `Tags`: Comma-split into array, trimmed, stripped of HTML.
- `Version`, `RequiresWP`, `RequiresPHP`, `UpdateURI`: Tags stripped.

### Header Display (markup=true)

- `Name`: If empty after sanitization, falls back to the stylesheet slug.
- `Description`: Passed through `wptexturize()`.
- `Author`: Wrapped in `<a href="{AuthorURI}">...</a>` if `AuthorURI` exists; falls back to 'Anonymous' if empty.
- `Tags`: Joined with locale-aware list separator.
- `ThemeURI`, `AuthorURI`: URL-escaped.

### Post Template Discovery

Post templates are found by scanning all `.php` files up to depth 1 in both the child and parent directories, looking for a `Template Name:` header comment. The `Template Post Type:` comment optionally restricts the template to specific post types (comma-separated, defaults to `'page'`).

For block themes, custom block templates (those with `is_custom = true`) from `get_block_templates()` are also included.

---

## 3. Theme Discovery

### Global State

```typescript
// Registered theme root directories
const wpThemeDirectories: string[] = [];
```

The default root is `WP_CONTENT_DIR + '/themes'`. Additional roots are registered via `register_theme_directory()`.

### `register_theme_directory(directory)`

Adds a directory to `wpThemeDirectories`. If the path does not exist as an absolute path, `WP_CONTENT_DIR + '/' + directory` is tried. Trailing slashes are stripped. Duplicates are ignored. Returns `false` if the final path does not exist.

### `search_theme_directories(force?)`

Scans all registered theme roots and returns a map of theme slug → `{ theme_file: string, theme_root: string }`. The result is statically cached (reset only when `force = true`).

Scan logic:
1. For each theme root, `scandir` it.
2. For each subdirectory, if `{dir}/style.css` exists: it's a theme at slug `dir`.
3. If `{dir}/style.css` does not exist, scan one level deeper. If any subdirectory has `style.css`, it's a theme at slug `dir/subdir`.
4. If scanning a subdirectory finds no themes (all subdirs lack `style.css`), the top-level directory is still added as a broken theme so `WP_Theme` can report the error.
5. The result is sorted alphabetically.
6. The relative theme root for each theme is stored in the `theme_roots` site transient (default expiry: 30 minutes, configurable via `wp_cache_themes_persistently` filter).

### `wp_get_themes(args?)`

Returns all installed `WP_Theme` objects. Arguments:

| Arg | Default | Meaning |
|---|---|---|
| `errors` | `false` | `false` = themes without errors; `true` = themes with errors; `null` = all |
| `allowed` | `null` | Multisite filter: `'network'`, `'site'`, `true` (either), `false` (neither), `null` (all) |
| `blog_id` | `0` | Multisite site ID for `allowed` check |

Internally, when multiple theme roots exist, the active theme's root is corrected to ensure it wins over other roots if there is a name collision.

Results are statically cached in a per-process map keyed by `theme_root + '/' + slug`.

### `wp_get_theme(stylesheet?, theme_root?)`

Returns a single `WP_Theme` object. Defaults to the active stylesheet. If `theme_root` is not provided, it is resolved via `get_raw_theme_root()`. Always constructs a new `WP_Theme` instance (caching happens inside `WP_Theme`'s constructor via the object cache).

### Theme Root Resolution (`get_raw_theme_root`)

For the active stylesheet/template: reads `stylesheet_root` and `template_root` options directly (fast path, avoids calling `get_theme_roots()`). For other themes: calls `get_theme_roots()` which reads the `theme_roots` site transient.

### Theme Registry Cache

The `'themes'` object cache group holds per-theme data. Cache keys are in the format `'{type}-{cache_hash}'` where type is one of `theme`, `screenshot`, `headers`, `post_templates` and `cache_hash` is `md5(theme_root + '/' + stylesheet)`.

By default, this group is non-persistent (in-process only). It can be made persistent by returning a truthy value from the `wp_cache_themes_persistently` filter.

---

## 4. Active Theme

The active theme is stored in two WordPress options:

| Option | Meaning |
|---|---|
| `stylesheet` | Directory name of the active (child) theme |
| `template` | Directory name of the parent theme (same as stylesheet for standalone themes) |
| `current_theme` | Display name of the active theme |
| `stylesheet_root` | Relative theme root for stylesheet (only set when multiple roots exist) |
| `template_root` | Relative theme root for template (only set when multiple roots exist) |

### Global Path Variables

```typescript
// Set by wp_set_template_globals(), updated on switch_theme
let wpStylesheetPath: string; // = get_stylesheet_directory()
let wpTemplatePath: string;   // = get_template_directory()
```

These globals are the canonical source of truth for `locate_template()`.

### Key Functions

#### `get_stylesheet()`
Returns `apply_filters('stylesheet', get_option('stylesheet'))`. This is the child theme's directory name (or the only theme if no child theme is active).

#### `get_template()`
Returns `apply_filters('template', get_option('template'))`. This is the parent theme's directory name.

#### `get_stylesheet_directory()`
Returns `{theme_root}/{stylesheet}` passed through `apply_filters('stylesheet_directory', ...)`.

For the full URL path: `get_stylesheet_directory_uri()` = `{theme_root_uri}/{stylesheet_url_encoded}`, filtered by `'stylesheet_directory_uri'`.

#### `get_template_directory()`
Returns `{theme_root}/{template}` passed through `apply_filters('template_directory', ...)`.

For the full URL path: `get_template_directory_uri()` = `{theme_root_uri}/{template_url_encoded}`, filtered by `'template_directory_uri'`.

#### `is_child_theme()`
Returns `wpStylesheetPath !== wpTemplatePath`. If these are equal, it is a standalone (non-child) theme.

#### `get_stylesheet_uri()`
Returns `get_stylesheet_directory_uri() + '/style.css'`, filtered by `'stylesheet_uri'`.

#### `get_theme_root(stylesheet_or_template?)`
Resolves the absolute path to the themes root for a given stylesheet/template slug. If the raw root is not in the list of registered directories, prepends `WP_CONTENT_DIR`. Defaults to `WP_CONTENT_DIR + '/themes'`. Filtered by `'theme_root'`.

#### `get_theme_root_uri(stylesheet_or_template?, theme_root?)`
Resolves the URL of a theme root using these heuristics:
- If root is under `WP_CONTENT_DIR`: use `content_url()`.
- If root is under `ABSPATH`: use `site_url()`.
- If root is under `WP_PLUGIN_DIR` or `WPMU_PLUGIN_DIR`: use `plugins_url()`.
- Otherwise: use the path as-is.
Filtered by `'theme_root_uri'`.

### Child vs. Parent Theme Behavior

In a child theme setup:
- `get_stylesheet()` → child theme directory (e.g., `'my-child-theme'`)
- `get_template()` → parent theme directory (e.g., `'twentytwentyfive'`)
- `get_stylesheet_directory()` → absolute path to the child theme
- `get_template_directory()` → absolute path to the parent theme

Files in the child stylesheet directory take precedence over the parent template directory in `locate_template()`.

---

## 5. Theme Activation

### `switch_theme(stylesheet)`

1. Call `validate_theme_requirements(stylesheet)`: checks `RequiresWP` and `RequiresPHP` headers; dies with error if incompatible.
2. Snapshot current `$sidebars_widgets` and save into the **outgoing theme's** mods as `sidebars_widgets` (with timestamp), so it can be restored if the theme is re-activated.
3. Save current `nav_menu_locations` theme mod into a transient option `theme_switch_menu_locations`.
4. Update options: `template`, `stylesheet`, `current_theme`.
5. If multiple theme roots exist: update `template_root` and `stylesheet_root`; otherwise delete those options.
6. Migrate theme mods:
   - If `theme_mods_{new_stylesheet}` does not yet exist in options: copy from deprecated `mods_{theme_name}` option. Also merge in `nav_menu_locations` if the new mods do not have any.
   - Set `theme_mods_{new_stylesheet}` autoload to `yes`, old theme's mods to `no`.
7. If the new theme is a block theme: save classic sidebar widget data as `wp_classic_sidebars` theme mod.
8. Store the **old** stylesheet in `theme_switched` option.
9. Call `wp_set_template_globals()` to update the global path variables.
10. Delete pattern caches for both old and new theme.
11. Fire `do_action('switch_theme', new_name, new_theme, old_theme)`.

### `validate_current_theme()`

Called during bootstrap. Checks that the current theme has the required files:
- A standalone theme needs `templates/index.html`, `block-templates/index.html` (deprecated), or `index.php` in the template directory.
- A child theme needs `style.css` in the stylesheet directory.
- Both need `style.css` in the template directory.

If invalid, falls back to `WP_DEFAULT_THEME` or the most recent installed default theme. Returns `false` if switched, `true` if valid (or if `wp_installing()`).

The `validate_current_theme` filter can return `false` to disable this check entirely.

### `after_setup_theme` Action

Themes must hook into `after_setup_theme` (fired from `functions.php` include) to register features, menus, image sizes, etc. This fires before `init`.

---

## 6. Theme Mods

Theme mods are per-theme user customizations stored in a single serialized array in the options table.

### Storage

The option key is `theme_mods_{stylesheet}` where `stylesheet` is the directory name of the active child theme (or the only theme). The value is an associative array of `modName → modValue`.

The deprecated key format `mods_{theme_name}` (keyed by the theme's display name) is read as a fallback and migrated to the new format on first admin access.

### `get_theme_mods()`

Reads `theme_mods_{stylesheet}` from options. Falls back to `mods_{current_theme}` (deprecated). Always returns an array.

### `get_theme_mod(name, default_value?)`

1. Get all mods via `get_theme_mods()`.
2. If `mods[name]` exists: return `apply_filters('theme_mod_{name}', mods[name])`.
3. If it doesn't exist and `default_value` is a string containing `%s` or `%1$s`/`%2$s` format directives: run `sprintf(default_value, get_template_directory_uri(), get_stylesheet_directory_uri())` to interpolate paths.
4. Return `apply_filters('theme_mod_{name}', default_value)`.

### `set_theme_mod(name, value)`

1. Get current mods.
2. Apply `pre_set_theme_mod_{name}` filter to the new value.
3. Set `mods[name] = filteredValue`.
4. Update the `theme_mods_{stylesheet}` option.

### `remove_theme_mod(name)`

1. Get current mods.
2. Unset `mods[name]`.
3. If mods is now empty: call `remove_theme_mods()` (deletes the entire option).
4. Otherwise: update the option.

### `remove_theme_mods()`

Deletes both `theme_mods_{stylesheet}` and the deprecated `mods_{theme_name}` options.

---

## 7. Theme Features

Theme features are capabilities that themes declare support for. They gate WordPress functionality so features only activate for themes that want them.

### Global State

```typescript
// Registry of active theme features
const _wpThemeFeatures: Record<string, unknown[]> = {};

// Registry of defined feature schemas (for REST API)
const _wpRegisteredThemeFeatures: Record<string, ThemeFeatureDefinition> = {};
```

### `add_theme_support(feature, ...args)`

Registers support for a feature. Must be called from `functions.php` or `after_setup_theme`. Stores `args` in `_wpThemeFeatures[feature]`.

Special handling per feature:

- **`post-thumbnails`**: If `true` already registered (all types), returns early. If an array is passed and support already exists, merges the arrays.
- **`post-formats`**: `args[0]` must be an array of valid format slugs. Invalid slugs are filtered out.
- **`html5`**: `args[0]` must be an array of type strings. If called again, merges with existing array.
- **`custom-logo`**: Merges with defaults: `{ width, height, flex-width, flex-height, header-text, unlink-homepage-logo }`. If no width/height: both flex options default to `true`.
- **`custom-header`**: Complex defaults: `{ default-image, random-default, width, height, flex-height, flex-width, default-text-color, header-text, uploads, wp-head-callback, admin-head-callback, admin-preview-callback, video, video-active-callback }`. First registered value wins (child theme priority). Reads/writes legacy PHP constants (`HEADER_IMAGE`, `HEADER_IMAGE_WIDTH`, `HEADER_IMAGE_HEIGHT`, `HEADER_TEXTCOLOR`, `NO_HEADER_TEXT`) for back-compat.
- **`custom-background`**: Merges with defaults: `{ default-image, default-preset, default-position-x, default-position-y, default-size, default-repeat, default-attachment, default-color, wp-head-callback, admin-head-callback, admin-preview-callback }`. Reads/writes `BACKGROUND_COLOR` and `BACKGROUND_IMAGE` constants.
- **`title-tag`**: Must be called before the `wp_loaded` hook; returns `false` and logs `_doing_it_wrong` if called too late.

### `remove_theme_support(feature)`

Removes a feature from `_wpThemeFeatures`. The features `'editor-style'`, `'widgets'`, and `'menus'` cannot be removed by themes. Use `_remove_theme_support()` internally to bypass this restriction.

For `custom-header` and `custom-background`, if `wp_loaded` has already fired: removes any registered `wp_head` callbacks and tears down the admin UI objects.

### `current_theme_supports(feature, ...args)`

Returns `boolean` indicating whether the active theme supports the feature.

Special argument checks:
- **`post-thumbnails`**: If registered as `true` (all types): always returns `true`. If registered as an array: checks if `args[0]` (post type) is in the array.
- **`html5`**, **`post-formats`**: Checks if `args[0]` (type string) is in the registered array.
- **`custom-logo`**, **`custom-header`**, **`custom-background`**: Checks if `args[0]` (option key) exists and is truthy in the options array.
- All other features: filtered by `current_theme_supports-{feature}`.

### `get_theme_support(feature, ...args)`

Returns the raw args stored for the feature, or `false` if not registered. With additional args for `custom-logo`, `custom-header`, `custom-background`: returns the specific option value from `args[0]` key.

### `register_theme_feature(feature, args)`

Registers a feature definition for REST API exposure. Args:

| Field | Type | Default |
|---|---|---|
| `type` | `'string' \| 'boolean' \| 'integer' \| 'number' \| 'array' \| 'object'` | `'boolean'` |
| `variadic` | `boolean` | `false` |
| `description` | `string` | `''` |
| `show_in_rest` | `boolean \| { schema, name?, prepare_callback? }` | `false` |

Array and object types shown in REST require a full JSON Schema definition. Returns `true` on success or `WP_Error` on invalid args.

### Built-in Feature Strings

| Feature | Registered by | `args[0]` type | Notes |
|---|---|---|---|
| `post-thumbnails` | Theme | `string[]` or `true` | Post types that support featured images |
| `post-formats` | Theme | `string[]` | Format slugs: `aside`, `gallery`, `link`, `image`, `quote`, `status`, `video`, `audio`, `chat` |
| `html5` | Theme | `string[]` | Types: `comment-list`, `comment-form`, `search-form`, `gallery`, `caption`, `style`, `script` |
| `custom-logo` | Theme | `object` | `width`, `height`, `flex-width`, `flex-height`, `header-text`, `unlink-homepage-logo` |
| `custom-header` | Theme | `object` | See above; can include `wp-head-callback` |
| `custom-background` | Theme | `object` | See above; can include `wp-head-callback` |
| `menus` | Theme/Core | — | Enables navigation menu registration |
| `widgets` | Theme/Core | — | Enables sidebar widget registration |
| `editor-style` | Theme (via `add_editor_style()`) | — | Automatically set by `add_editor_style()` |
| `title-tag` | Theme | — | Theme manages `<title>` tag output |
| `automatic-feed-links` | Theme | — | Auto-adds RSS links to `<head>` |
| `responsive-embeds` | Theme | — | Enables responsive embed CSS |
| `align-wide` | Theme | — | Enables wide/full block alignment |
| `wp-block-styles` | Theme | — | Loads default block styles |
| `editor-color-palette` | Theme | `object[]` | Custom editor color palette |
| `editor-gradient-presets` | Theme | `object[]` | Custom gradient presets |
| `editor-font-sizes` | Theme | `object[]` | Custom font sizes |
| `custom-spacing` | Theme | — | Custom spacing controls in block editor |
| `custom-units` | Theme | — | Custom unit support in block editor |
| `block-templates` | Core (auto, block themes) | — | Registered automatically for block themes |
| `starter-content` | Theme | `object` | Initial content definition |
| `widgets-block-editor` | Core | — | Enables the block-based widget editor |

---

## 8. Template Loader

`template-loader.php` is included near the end of WordPress's bootstrap. It selects and includes the appropriate template file.

### Full Execution Flow

```
1. if wp_using_themes():
     do_action('template_redirect')

2. if REQUEST_METHOD === 'HEAD' && apply_filters('exit_on_http_head', true):
     exit

3. if is_robots(): do_action('do_robots'); return
4. if is_favicon(): do_action('do_favicon'); return
5. if is_feed(): do_feed(); return
6. if is_trackback(): include wp-trackback.php; return

7. if wp_using_themes():
     Iterate tag_templates map in order:
       [
         'is_embed'             => get_embed_template,
         'is_404'               => get_404_template,
         'is_search'            => get_search_template,
         'is_front_page'        => get_front_page_template,
         'is_home'              => get_home_template,
         'is_privacy_policy'    => get_privacy_policy_template,
         'is_post_type_archive' => get_post_type_archive_template,
         'is_tax'               => get_taxonomy_template,
         'is_attachment'        => get_attachment_template,
         'is_single'            => get_single_template,
         'is_page'              => get_page_template,
         'is_singular'          => get_singular_template,
         'is_category'          => get_category_template,
         'is_tag'               => get_tag_template,
         'is_author'            => get_author_template,
         'is_date'              => get_date_template,
         'is_archive'           => get_archive_template,
       ]

       For each entry: if the conditional function returns true, call the getter.
       If the getter returns a non-empty string: stop iterating.

       Special case: if 'is_attachment' matched, remove the 'prepend_attachment' filter from 'the_content'.

     If no template found: $template = get_index_template()

     $template = apply_filters('template_include', $template)

     if ($template):
       do_action('wp_before_include_template', $template)
       include $template
     elif current_user_can('switch_themes') && theme has errors:
       wp_die(theme errors)
```

### Notes on `is_paged`

`is_paged` is not in the default `tag_templates` map. It was removed because `paged.php` templates are rarely used and `index.php` serves as the fallback naturally. If needed, a plugin can hook `template_include`.

### `HEAD` Request Optimization

HEAD requests (not GET/POST) short-circuit before template inclusion if the `exit_on_http_head` filter returns `true` (the default). This avoids rendering content for HEAD requests.

---

## 9. Template Hierarchy

All template resolution flows through `get_query_template(type, templates)`:

1. Apply `{type}_template_hierarchy` filter to the candidate list (allows adding/removing candidates).
2. Call `locate_template(templates)` to find the first file that exists (searches child dir, parent dir, `wp-includes/theme-compat/` in that order).
3. Call `locate_block_template(found_file, type, templates)` — for block themes, this may replace or supplement the found file.
4. Apply `{type}_template` filter to the final path.
5. Return the path.

### Hierarchy Per Request Type

#### `is_embed`
1. `embed-{post_type}-{post_format}.php`
2. `embed-{post_type}.php`
3. `embed.php`

#### `is_404`
1. `404.php`

#### `is_search`
1. `search.php`

#### `is_front_page`
1. `front-page.php`

#### `is_home` (posts page / blog home)
1. `home.php`
2. `index.php`

#### `is_privacy_policy`
1. `privacy-policy.php`

#### `is_post_type_archive`
Delegates to `get_archive_template()`. Only proceeds if the post type has `has_archive = true`.
1. `archive-{post_type}.php` (only if a single post type is queried)
2. `archive.php`

#### `is_tax` (custom taxonomy terms)
1. `taxonomy-{taxonomy}-{decoded_term_slug}.php` (only if slug has multibyte chars)
2. `taxonomy-{taxonomy}-{term_slug}.php`
3. `taxonomy-{taxonomy}-{term_id}.php`
4. `taxonomy-{taxonomy}.php`
5. `taxonomy.php`

#### `is_attachment`
1. `{mime_type}-{sub_type}.php` (e.g., `image-jpeg.php`)
2. `{sub_type}.php` (e.g., `jpeg.php`)
3. `{mime_type}.php` (e.g., `image.php`)
4. `attachment.php`

#### `is_single`
1. `{Post Type Template}.php` (from `Template Name` header in the assigned template)
2. `single-{post_type}-{decoded_post_name}.php` (only if post name has multibyte chars)
3. `single-{post_type}-{post_name}.php`
4. `single-{post_type}.php`
5. `single.php`

#### `is_page`
1. `{Page Template}.php` (assigned template, validated with `validate_file()`)
2. `page-{decoded_pagename}.php` (only if pagename has multibyte chars)
3. `page-{pagename}.php`
4. `page-{id}.php`
5. `page.php`

#### `is_singular` (catch-all for single posts not matched above)
1. `singular.php`

#### `is_category`
1. `category-{decoded_slug}.php` (only if slug has multibyte chars)
2. `category-{slug}.php`
3. `category-{term_id}.php`
4. `category.php`

#### `is_tag`
1. `tag-{decoded_slug}.php` (only if slug has multibyte chars)
2. `tag-{slug}.php`
3. `tag-{term_id}.php`
4. `tag.php`

#### `is_author`
1. `author-{user_nicename}.php`
2. `author-{user_id}.php`
3. `author.php`

#### `is_date`
1. `date.php`

#### `is_archive`
1. `archive-{post_type}.php` (only if a single post type is queried)
2. `archive.php`

#### Default fallback (no condition matched)
1. `index.php`

---

## 10. Template Functions

### `locate_template(template_names, load?, load_once?, args?)`

Searches for the first existing template file in the following order:
1. `wpStylesheetPath/{template_name}` (child theme / active theme)
2. `wpTemplatePath/{template_name}` (parent theme — only checked if `is_child_theme()` is true)
3. `ABSPATH + WPINC + '/theme-compat/{template_name}'` (WordPress compatibility fallback)

Returns the absolute path to the located file, or `''` if not found.

If `load = true` and a file was located: calls `load_template(located_path, load_once, args)`.

**Note**: Steps 1 and 2 use the global `wpStylesheetPath` and `wpTemplatePath` variables, not live calls to `get_stylesheet_directory()`. These globals are set by `wp_set_template_globals()` at bootstrap and updated on `switch_theme`.

### `load_template(_template_file, load_once?, args?)`

Includes a template file in the WordPress environment:

1. If `wp_query->query_vars` is an array: `extract()` all query vars into the local scope using `EXTR_SKIP` (cannot overwrite existing variables). This means templates can use `$s` for search terms, `$pagename`, etc. as local variables.
2. Escape `$s` (search query) through `esc_attr()` if set.
3. `do_action('wp_before_load_template', file, load_once, args)`
4. `require_once` or `require` the file depending on `load_once`.
5. `do_action('wp_after_load_template', file, load_once, args)`

### `wp_set_template_globals()`

Sets `wpStylesheetPath = get_stylesheet_directory()` and `wpTemplatePath = get_template_directory()`. Called at bootstrap and after `switch_theme`.

### `get_header(name?, args?)`

1. `do_action('get_header', name, args)`
2. Build candidate list: `['header-{name}.php']` if name is non-empty, then `['header.php']`.
3. `locate_template(candidates, load=true, load_once=true, args)`.
4. Returns `false` if no template found.

### `get_footer(name?, args?)`

Same pattern as `get_header`. Candidates: `['footer-{name}.php', 'footer.php']`. Action: `get_footer`.

### `get_sidebar(name?, args?)`

Same pattern. Candidates: `['sidebar-{name}.php', 'sidebar.php']`. Action: `get_sidebar`.

### `get_template_part(slug, name?, args?)`

1. `do_action('get_template_part_{slug}', slug, name, args)` — fires per-slug action.
2. Build candidates: `['{slug}-{name}.php']` if name non-empty, then `['{slug}.php']`.
3. `do_action('get_template_part', slug, name, templates, args)` — fires general action with full list.
4. `locate_template(candidates, load=true, load_once=false, args)` — note `load_once=false`, so the same part can be included multiple times (important for loops).
5. Returns `false` if no template found.

### `get_query_template(type, templates?)`

Core resolution function (described fully in Section 9). Returns the resolved absolute path or `''`.

### Template Enhancement Output Buffering (since 6.9.0)

An opt-in output buffering mechanism wraps the `include $template` call:

1. `do_action('wp_before_include_template', $template)` fires at priority 1000.
2. If `has_filter('wp_template_enhancement_output_buffer')` or `has_action('wp_finalized_template_enhancement_output_buffer')` returns true: an output buffer is started using `ob_start('wp_finalize_template_enhancement_output_buffer', ...)`.
3. The buffer callback is **not flushable** (uses `PHP_OUTPUT_HANDLER_STDFLAGS ^ PHP_OUTPUT_HANDLER_FLUSHABLE`) to ensure the entire output is captured before processing.
4. On buffer close: `apply_filters('wp_template_enhancement_output_buffer', html, original_html)` is applied only if the response content type is `text/html` or `application/xhtml+xml`.
5. `do_action('wp_finalized_template_enhancement_output_buffer', filtered_output)` fires before flush.

The `wp_should_output_buffer_template_for_enhancement` filter can force the buffer on/off regardless of filter registration.

---

## 11. Block Themes (FSE)

### Directory Structure

```
theme-slug/
  style.css               (required; same headers as classic themes)
  theme.json              (design tokens, settings, block styles)
  functions.php           (optional; for PHP-side support declarations)
  templates/
    index.html            (required; block markup)
    single.html
    page.html
    archive.html
    404.html
    ...
  parts/
    header.html
    footer.html
    sidebar.html
    ...
```

The legacy directory names `block-templates/` and `block-template-parts/` are supported for backwards compatibility but deprecated.

### `theme.json`

A JSON file at the theme root that declares:
- **`version`**: Schema version (current: `3`)
- **`settings`**: Block editor settings — colors, typography, spacing, layout, custom properties
- **`styles`**: Global CSS styles and per-block overrides
- **`customTemplates`**: Array of `{ name, title, postTypes[] }` objects registering custom templates
- **`templateParts`**: Array of `{ name, title, area }` objects declaring template parts and their areas
- **`patterns`**: Array of pattern slugs from the block pattern directory

### `WP_Block_Template` Data Type

```typescript
interface WPBlockTemplate {
  id: string;             // '{theme_slug}//{template_slug}', e.g. 'mytheme//single'
  theme: string;          // stylesheet (theme slug)
  slug: string;           // template slug, e.g. 'single'
  source: 'theme' | 'custom' | 'plugin'; // where the template came from
  origin: string | null;  // original source before user customization
  type: 'wp_template' | 'wp_template_part';
  title: string;
  description: string;
  status: 'publish' | 'draft' | 'auto-draft';
  content: string;        // serialized block markup
  has_theme_file: boolean; // whether a corresponding .html file exists in the theme
  is_custom: boolean;     // false for default template types (index, single, page, etc.)
  wp_id: number | null;   // database post ID if user-customized; null for file-only
  author: number | null;  // post author ID
  modified: string | null; // ISO date of last modification
  area: string;            // for wp_template_part only: 'header', 'footer', 'sidebar', 'uncategorized'
  post_types: string[];    // for wp_template only: post types this template applies to
  plugin: string | null;   // plugin that registered this template (via registry)
}
```

### Template Part Areas

Defined constants:
- `WP_TEMPLATE_PART_AREA_HEADER = 'header'` → rendered with `<header>` tag
- `WP_TEMPLATE_PART_AREA_FOOTER = 'footer'` → rendered with `<footer>` tag
- `WP_TEMPLATE_PART_AREA_SIDEBAR = 'sidebar'`
- `WP_TEMPLATE_PART_AREA_UNCATEGORIZED = 'uncategorized'` → rendered with `<div>` tag

The allowed areas list is filterable via `default_wp_template_part_areas`. Any invalid area value is coerced to `'uncategorized'`.

### `get_block_templates(query?, template_type?)`

Fetches an array of `WP_Block_Template` objects. Merges three sources in priority order:

1. **Database** (`wp_template` or `wp_template_part` posts with the `wp_theme` taxonomy term matching the current stylesheet): user customizations take highest priority.
2. **Theme files** (`templates/*.html` or `parts/*.html`): files whose slugs are not already in the database results.
3. **Plugin-registered templates** (from `WP_Block_Templates_Registry`): templates registered by plugins that don't have theme file counterparts.

Query parameters:
- `slug__in`: only return templates matching these slugs
- `slug__not_in`: exclude these slugs
- `wp_id`: return only the template with this post ID
- `area`: filter by area (template parts only)
- `post_type`: filter by associated post type

The `pre_get_block_templates` filter can short-circuit the query. The `get_block_templates` filter runs on the final result.

### `get_block_template(id, template_type?)`

Fetches a single `WP_Block_Template` by its ID (`theme_slug//template_slug`):

1. Check `pre_get_block_template` filter first.
2. Query database for a matching post.
3. If not found: fall back to `get_block_file_template()`, which checks:
   a. Theme files on disk.
   b. Plugin-registered templates in `WP_Block_Templates_Registry`.
4. Apply `get_block_template` filter.

### `get_block_file_template(id, template_type?)`

File-only lookup (no database). Checks:
1. `pre_get_block_file_template` filter.
2. The theme's `templates/` or `parts/` directory for a matching `.html` file.
3. `WP_Block_Templates_Registry`.
4. Apply `get_block_file_template` filter.

### Template Registration API (`WP_Block_Templates_Registry`)

Plugins can register templates programmatically. This registry maps `slug → WP_Block_Template`. Registered templates participate in `get_block_templates()` and `get_block_template()`.

### Classic Themes vs Block Themes: Template Resolution

In `get_query_template()`, after `locate_template()` finds (or fails to find) a PHP template, `locate_block_template()` runs. For block themes, this function:
1. Determines the equivalent block template slug for the request type.
2. Calls `get_block_template()` to find a database-persisted or file-based block template.
3. If found: returns a path that causes the block template rendering path instead.

### Rendering Block Templates

When a block template is loaded, its `content` (serialized block markup) is passed through `do_blocks()` which parses and renders each block. The global `$_wp_current_template_content` holds the current template's content for use by skip-link injection and other hooks.

### `block_template_part(part)`, `block_header_area()`, `block_footer_area()`

Convenience functions that look up a template part by the current theme's stylesheet + part name, then `echo do_blocks(content)`.

---

## 12. The Customizer

The Customizer (`WP_Customize_Manager`) provides a live-preview editing interface for theme options. The data model (independent of the admin UI) is described here.

### Core Data Model

```typescript
interface WPCustomizeManager {
  panels:   Map<string, WPCustomizePanel>;
  sections: Map<string, WPCustomizeSection>;
  settings: Map<string, WPCustomizeSetting>;
  controls: Map<string, WPCustomizeControl>;
}

interface WPCustomizePanel {
  id: string;
  title: string;
  description: string;
  priority: number;
  capability: string;
  active_callback: () => boolean;
  sections: WPCustomizeSection[];
}

interface WPCustomizeSection {
  id: string;
  title: string;
  description: string;
  priority: number;
  panel: string;            // parent panel ID, or '' if top-level
  capability: string;
  active_callback: () => boolean;
  controls: WPCustomizeControl[];
}

interface WPCustomizeSetting {
  id: string;               // e.g., 'blogname' or 'theme_mods[header_color]'
  type: 'theme_mod' | 'option' | 'custom';
  default: unknown;
  transport: 'refresh' | 'postMessage';  // how live preview updates
  capability: string;
  sanitize_callback: (value: unknown, setting: this) => unknown;
  sanitize_js_callback: (value: unknown) => unknown;
}

interface WPCustomizeControl {
  id: string;
  settings: Record<string, WPCustomizeSetting>;  // 'default' key is primary
  section: string;
  priority: number;
  type: string;             // 'text', 'checkbox', 'radio', 'select', 'textarea', 'color', 'image', etc.
  label: string;
  description: string;
  active_callback: () => boolean;
}
```

### Setting Types and Storage

- **`theme_mod`**: The setting ID (after stripping `theme_mods[...]` wrapper) maps to a theme mod. Saved via `set_theme_mod()`.
- **`option`**: The setting ID maps directly to a WordPress option. Saved via `update_option()`.
- **`custom`**: Arbitrary save logic.

### Transport Modes

- **`refresh`**: The preview iframe reloads on change.
- **`postMessage`**: JavaScript in the preview handles the change without a reload (for smooth UX). The theme must provide a `customizer.js` or equivalent to handle the message.

### Custom CSS

Since WordPress 4.7, additional CSS is stored in a `custom_css` custom post type (not a theme mod directly). The post's `post_content` holds the CSS. The `custom_css_post_id` theme mod caches the post ID.

`wp_get_custom_css(stylesheet?)` reads the CSS from the post and filters it through `wp_get_custom_css`.
`wp_update_custom_css_post(css, args?)` creates or updates the post.

---

## 13. Editor Styles

### `add_editor_style(stylesheet?)`

Registers a stylesheet to be loaded in the block editor (and classic TinyMCE editor):

1. Automatically calls `add_theme_support('editor-style')`.
2. Appends the stylesheet to the global `$editor_styles` array.
3. If an RTL site: also appends a `-rtl` variant (`editor-style.css` → `editor-style-rtl.css`).
4. Default value is `'editor-style.css'`.
5. Can accept an array of stylesheets.
6. External URLs (starting with `http://`, `https://`, or `//`) are supported.

### `get_editor_stylesheets()`

Returns an array of fully-resolved stylesheet URLs for use in the editor:

1. Filter out absolute URLs first (used as-is).
2. If a child theme is active: check parent theme directory first (so child can override).
3. Check stylesheet (child/active theme) directory.
4. Return the array, filtered by `editor_stylesheets`.

### Block Editor Loading

Block editor styles registered via `add_editor_style()` are enqueued via `enqueue_block_editor_assets` using `wp_enqueue_style()` with a URL derived from the theme directory. For block themes, `theme.json` can also declare styles inline.

### `remove_editor_styles()`

Removes all registered editor styles and removes the `editor-style` theme support. Returns `false` if the feature was never registered.

---

## 14. Key Hooks and Filters

### Actions

| Hook | When | Args | Purpose |
|---|---|---|---|
| `after_setup_theme` | After `functions.php` loaded | — | Theme initialization: register nav menus, image sizes, features |
| `switch_theme` | End of `switch_theme()` | `new_name, new_theme, old_theme` | React to theme change |
| `template_redirect` | Before template selection | — | Redirect or special handling before template loading |
| `wp_before_include_template` | Immediately before `include $template` | `template_path` | Last chance before template file is included |
| `wp_before_load_template` | Inside `load_template()`, before include | `file, load_once, args` | Fires for each template file load |
| `wp_after_load_template` | Inside `load_template()`, after include | `file, load_once, args` | Cleanup after a template file loads |
| `get_header` | Before header template loads | `name, args` | Pre-header hook |
| `get_footer` | Before footer template loads | `name, args` | Pre-footer hook |
| `get_sidebar` | Before sidebar template loads | `name, args` | Pre-sidebar hook |
| `get_template_part_{slug}` | Before template part loads | `slug, name, args` | Per-slug pre-load hook |
| `get_template_part` | Before template part locate | `slug, name, templates[], args` | General pre-locate hook |
| `do_robots` | On robots.txt request | — | Generate robots.txt output |
| `do_favicon` | On favicon.ico request | — | Generate favicon output |
| `wp_template_enhancement_output_buffer_started` | When enhancement buffer opens | — | Notification that buffering started |
| `wp_finalized_template_enhancement_output_buffer` | Before enhancement buffer flushes | `output` | Last chance to send HTTP headers |

### Filters

| Filter | Args | Purpose |
|---|---|---|
| `template_include` | `template_path` | Override which template file is included |
| `{type}_template` | `path, type, templates[]` | Override template path for a specific type (e.g., `single_template`, `page_template`, `404_template`) |
| `{type}_template_hierarchy` | `templates[]` | Modify the candidate list for a specific type (e.g., `single_template_hierarchy`) |
| `template_directory` | `dir, template, theme_root` | Override the template directory path |
| `stylesheet_directory` | `dir, stylesheet, theme_root` | Override the stylesheet directory path |
| `template_directory_uri` | `uri, template, theme_root_uri` | Override the template directory URL |
| `stylesheet_directory_uri` | `uri, stylesheet, theme_root_uri` | Override the stylesheet directory URL |
| `stylesheet` | `stylesheet_name` | Override the active stylesheet name |
| `template` | `template_name` | Override the active template name |
| `theme_root` | `absolute_path` | Override the themes root path |
| `theme_root_uri` | `uri, siteurl, name` | Override the themes root URL |
| `validate_current_theme` | `bool` | Return `false` to disable theme validation |
| `validate_theme_requirements` | `true\|WPError, stylesheet` | Add custom validation requirements |
| `pre_set_theme_mod_{name}` | `new_value, old_value` | Filter a theme mod value before saving |
| `theme_mod_{name}` | `value` | Filter a theme mod value on retrieval |
| `current_theme_supports-{feature}` | `bool, args, registered_args` | Override feature support check |
| `editor_stylesheets` | `urls[]` | Modify the list of editor stylesheet URLs |
| `get_search_form` | `html` | Filter the search form HTML |
| `wp_cache_themes_persistently` | `bool\|int` | Enable persistent theme caching |
| `theme_scandir_exclusions` | `string[]` | Directories to skip when scanning theme files |
| `default_template_types` | `types{}` | Modify built-in block template type definitions |
| `default_wp_template_part_areas` | `areas[]` | Modify allowed template part area definitions |
| `pre_get_block_templates` | `templates\|null, query, type` | Short-circuit block template query |
| `get_block_templates` | `templates[], query, type` | Modify block templates query results |
| `pre_get_block_template` | `template\|null, id, type` | Short-circuit single block template lookup |
| `get_block_template` | `template\|null, id, type` | Modify single block template result |
| `pre_get_block_file_template` | `template\|null, id, type` | Short-circuit file-based template lookup |
| `get_block_file_template` | `template\|null, id, type` | Modify file-based template result |
| `theme_templates` | `templates[], theme, post\|null, post_type` | Modify page templates list |
| `theme_{post_type}_templates` | `templates[], theme, post\|null, post_type` | Modify templates for a specific post type |
| `exit_on_http_head` | `bool` | Whether to exit early on HEAD requests |
| `wp_should_output_buffer_template_for_enhancement` | `bool` | Whether to start template enhancement buffer |
| `wp_template_enhancement_output_buffer` | `filtered_html, original_html` | Process entire HTML output of a template |
| `wp_get_custom_css` | `css, stylesheet` | Modify custom CSS before output |
| `update_custom_css_data` | `data{css,preprocessed}, args` | Filter custom CSS before saving |
| `get_header_image` | `url` | Filter the header image URL |
| `get_header_image_tag` | `html, header, attr` | Filter the header image tag markup |
| `locale_stylesheet_uri` | `uri, stylesheet_dir_uri` | Override locale-specific stylesheet URI |

---

## 15. TypeScript Interface Sketch

```typescript
// ============================================================
// WP_Theme equivalent
// ============================================================

type ThemeHeader =
  | 'Name' | 'ThemeURI' | 'Description' | 'Author' | 'AuthorURI'
  | 'Version' | 'Template' | 'Status' | 'Tags' | 'TextDomain'
  | 'DomainPath' | 'RequiresWP' | 'RequiresPHP' | 'UpdateURI';

type ThemeError =
  | 'theme_not_found'
  | 'theme_no_stylesheet'
  | 'theme_stylesheet_not_readable'
  | 'theme_no_index'
  | 'theme_no_parent'
  | 'theme_child_invalid'
  | 'theme_parent_invalid'
  | 'theme_root_missing'
  | 'theme_paused';

interface WPTheme {
  // Identity
  getStylesheet(): string;
  getTemplate(): string;

  // Paths & URLs
  getStylesheetDirectory(): string;
  getTemplateDirectory(): string;
  getStylesheetDirectoryUri(): string;
  getTemplateDirectoryUri(): string;
  getThemeRoot(): string;
  getThemeRootUri(): string;
  getFilePath(file?: string): string;
  getScreenshot(uri?: 'uri' | 'relative'): string | false;

  // Header access
  get(header: ThemeHeader): string | string[] | false;
  display(header: ThemeHeader, markup?: boolean, translate?: boolean): string | string[] | false;

  // State
  exists(): boolean;
  errors(): WPError | false;
  parent(): WPTheme | false;
  isBlockTheme(): boolean;
  getBlockTemplateFolders(): { wp_template: string; wp_template_part: string };

  // Files & templates
  getFiles(type?: string | string[] | null, depth?: number, searchParent?: boolean): Record<string, string>;
  getPostTemplates(): Record<string, Record<string, string>>;
  getPageTemplates(post?: WPPost | null, postType?: string): Record<string, string>;

  // Cache
  cacheDelete(): void;

  // i18n
  loadTextdomain(): boolean;

  // Multisite
  isAllowed(check?: 'both' | 'network' | 'site', blogId?: number | null): boolean;

  // Static methods
  getCoreDefaultTheme(): WPTheme | false;
  getAllowed(blogId?: number | null): Record<string, true>;
  getAllowedOnNetwork(): Record<string, true>;
  getAllowedOnSite(blogId?: number | null): Record<string, true>;
}

// ============================================================
// Theme discovery
// ============================================================

interface ThemeDiscovery {
  registerThemeDirectory(directory: string): boolean;
  searchThemeDirectories(force?: boolean): Record<string, { theme_file: string; theme_root: string }> | false;
  wpGetThemes(args?: {
    errors?: boolean | null;
    allowed?: boolean | 'network' | 'site' | null;
    blog_id?: number;
  }): Record<string, WPTheme>;
  wpGetTheme(stylesheet?: string, themeRoot?: string): WPTheme;
  wpCleanThemesCache(clearUpdateCache?: boolean): void;
}

// ============================================================
// Active theme
// ============================================================

interface ActiveTheme {
  getStylesheet(): string;
  getTemplate(): string;
  getStylesheetDirectory(): string;
  getTemplateDirectory(): string;
  getStylesheetDirectoryUri(): string;
  getTemplateDirectoryUri(): string;
  getStylesheetUri(): string;
  getThemeRoot(stylesheetOrTemplate?: string): string;
  getThemeRootUri(stylesheetOrTemplate?: string, themeRoot?: string): string;
  getRawThemeRoot(stylesheetOrTemplate: string, skipCache?: boolean): string | false;
  getThemeRoots(): Record<string, string> | string;
  isChildTheme(): boolean;
  wpSetTemplateGlobals(): void;
}

// ============================================================
// Theme activation
// ============================================================

interface ThemeActivation {
  switchTheme(stylesheet: string): void;
  validateCurrentTheme(): boolean;
  validateThemeRequirements(stylesheet: string): true | WPError;
}

// ============================================================
// Theme mods
// ============================================================

interface ThemeMods {
  getThemeMods(): Record<string, unknown>;
  getThemeMod(name: string, defaultValue?: unknown): unknown;
  setThemeMod(name: string, value: unknown): boolean;
  removeThemeMod(name: string): void;
  removeThemeMods(): void;
}

// ============================================================
// Theme features
// ============================================================

type BuiltInThemeFeature =
  | 'post-thumbnails' | 'post-formats' | 'html5' | 'custom-logo'
  | 'custom-header' | 'custom-background' | 'menus' | 'widgets'
  | 'editor-style' | 'automatic-feed-links' | 'title-tag'
  | 'responsive-embeds' | 'align-wide' | 'wp-block-styles'
  | 'block-templates' | 'starter-content' | 'widgets-block-editor'
  | 'custom-spacing' | 'custom-units' | 'editor-color-palette'
  | 'editor-gradient-presets' | 'editor-font-sizes';

interface ThemeFeatures {
  addThemeSupport(feature: string, ...args: unknown[]): void | false;
  removeThemeSupport(feature: string): boolean | void;
  currentThemeSupports(feature: string, ...args: unknown[]): boolean;
  getThemeSupport(feature: string, ...args: unknown[]): unknown;
  registerThemeFeature(feature: string, args?: {
    type?: 'string' | 'boolean' | 'integer' | 'number' | 'array' | 'object';
    variadic?: boolean;
    description?: string;
    show_in_rest?: boolean | {
      schema?: Record<string, unknown>;
      name?: string;
      prepare_callback?: (value: unknown) => unknown;
    };
  }): true | WPError;
}

// ============================================================
// Template resolution
// ============================================================

interface TemplateLoader {
  locateTemplate(
    templateNames: string | string[],
    load?: boolean,
    loadOnce?: boolean,
    args?: Record<string, unknown>
  ): string;

  loadTemplate(
    templateFile: string,
    loadOnce?: boolean,
    args?: Record<string, unknown>
  ): void;

  getQueryTemplate(type: string, templates?: string[]): string;

  // Specific template getters
  getIndexTemplate(): string;
  get404Template(): string;
  getArchiveTemplate(): string;
  getPostTypeArchiveTemplate(): string;
  getAuthorTemplate(): string;
  getCategoryTemplate(): string;
  getTagTemplate(): string;
  getTaxonomyTemplate(): string;
  getDateTemplate(): string;
  getHomeTemplate(): string;
  getFrontPageTemplate(): string;
  getPrivacyPolicyTemplate(): string;
  getPageTemplate(): string;
  getSearchTemplate(): string;
  getSingleTemplate(): string;
  getEmbedTemplate(): string;
  getSingularTemplate(): string;
  getAttachmentTemplate(): string;
}

// ============================================================
// Template parts
// ============================================================

interface TemplateParts {
  getHeader(name?: string | null, args?: Record<string, unknown>): void | false;
  getFooter(name?: string | null, args?: Record<string, unknown>): void | false;
  getSidebar(name?: string | null, args?: Record<string, unknown>): void | false;
  getTemplatePart(
    slug: string,
    name?: string | null,
    args?: Record<string, unknown>
  ): void | false;
}

// ============================================================
// Block templates
// ============================================================

type BlockTemplateType = 'wp_template' | 'wp_template_part';
type BlockTemplateArea = 'header' | 'footer' | 'sidebar' | 'uncategorized';
type BlockTemplateSource = 'theme' | 'custom' | 'plugin';

interface WPBlockTemplate {
  id: string;
  theme: string;
  slug: string;
  source: BlockTemplateSource;
  origin: string | null;
  type: BlockTemplateType;
  title: string;
  description: string;
  status: 'publish' | 'draft' | 'auto-draft';
  content: string;
  has_theme_file: boolean;
  is_custom: boolean;
  wp_id: number | null;
  author: number | null;
  modified: string | null;
  area?: BlockTemplateArea;
  post_types?: string[];
  plugin?: string | null;
}

interface BlockTemplates {
  getBlockTemplates(
    query?: {
      slug__in?: string[];
      wp_id?: number;
      area?: BlockTemplateArea;
      post_type?: string;
    },
    templateType?: BlockTemplateType
  ): WPBlockTemplate[];

  getBlockTemplate(
    id: string,
    templateType?: BlockTemplateType
  ): WPBlockTemplate | null;

  getBlockFileTemplate(
    id: string,
    templateType?: BlockTemplateType
  ): WPBlockTemplate | null;

  blockTemplatePart(part: string): void;
  blockHeaderArea(): void;
  blockFooterArea(): void;
}

// ============================================================
// Editor styles
// ============================================================

interface EditorStyles {
  addEditorStyle(stylesheet?: string | string[]): void;
  removeEditorStyles(): boolean;
  getEditorStylesheets(): string[];
}

// ============================================================
// Customizer settings (data model only)
// ============================================================

interface WPCustomizeSetting {
  id: string;
  type: 'theme_mod' | 'option' | 'custom';
  default: unknown;
  transport: 'refresh' | 'postMessage';
  capability: string;
  sanitizeCallback?: (value: unknown) => unknown;
}

interface WPCustomizeSection {
  id: string;
  title: string;
  description: string;
  priority: number;
  panel: string;
  capability: string;
}

interface WPCustomizePanel {
  id: string;
  title: string;
  description: string;
  priority: number;
  capability: string;
}

interface WPCustomizeControl {
  id: string;
  type: string;
  label: string;
  description: string;
  section: string;
  priority: number;
  settings: Record<string, string>; // key → setting ID; 'default' is primary
}

interface CustomCSS {
  wpGetCustomCssPost(stylesheet?: string): WPPost | null;
  wpGetCustomCss(stylesheet?: string): string;
  wpUpdateCustomCssPost(
    css: string,
    args?: { preprocessed?: string; stylesheet?: string }
  ): WPPost | WPError;
}
```

---

## 16. Design Patterns to Carry Over

1. **Stylesheet vs. Template duality.** Every theme operation must track both the stylesheet (child theme) and the template (parent theme). They are the same string for non-child themes. Never conflate them. `get_stylesheet()` is for CSS/assets; `get_template()` is for PHP template files. In a child theme, PHP templates come from the parent, CSS comes from the child.

2. **Two-pass template resolution for block themes.** Classic template resolution (`locate_template`) runs first. Then `locate_block_template` either replaces the result with a block template or leaves the PHP result intact. This allows a site to mix classic and block templates during migration.

3. **Database-over-file precedence for block templates.** User-customized block templates (stored as `wp_template`/`wp_template_part` posts) always override theme file templates of the same slug. Build the data layer so user overrides win automatically when they exist.

4. **Theme mods are per-stylesheet.** The option key `theme_mods_{stylesheet}` is scoped to the active child theme's directory name. If you switch themes (even back to the same parent), the mods are different. Never share mods between themes unless explicitly migrating.

5. **Feature registration ordering.** `add_theme_support()` must be called in `functions.php` or early in `after_setup_theme`. The `title-tag` feature has a hard deadline of `wp_loaded`. Any feature system you build should enforce ordering constraints.

6. **First-value-wins for merged features.** For `custom-header` and `custom-background`, when the same feature is registered twice (e.g., child theme then parent theme), the child theme's values win because it registers first. Merge with child's values taking priority.

7. **locate_template searches three places, in order.** Always: child dir → parent dir → theme-compat. The parent dir check is only performed when `is_child_theme()` is true. This three-tier fallback is fundamental to the override system.

8. **The `get_template_part` action (not just the hook).** Two hooks fire: `get_template_part_{slug}` (per-slug, for targeted hooks) and `get_template_part` (general, fires for all parts with the full template list). Both fire before location. Template parts use `require` not `require_once`, enabling loops.

9. **Block theme detection is filesystem-based.** `is_block_theme()` checks for the existence of `templates/index.html` — no meta flag, no option, no header. Any theme that places that file becomes a block theme. Design your theme type detection accordingly.

10. **Template part areas control HTML element wrapping.** When block themes render template parts, the `area` field (`header`, `footer`, etc.) determines what HTML element wraps the output. This semantic mapping is part of the data model, not just a UI label.

11. **Theme mods migration on activation.** When activating a theme that has never been activated before, the system copies mods from the deprecated `mods_{theme_name}` option (keyed by display name) to `theme_mods_{stylesheet}` (keyed by directory slug). Any migration system must handle both old and new option formats.

12. **Object cache vs. persistent cache for themes.** The themes object cache group is non-persistent by default (request-scoped). The `wp_cache_themes_persistently` filter enables persistent caching with a configurable TTL (default 1800 seconds). Any cache invalidation must clear both the in-memory static caches and the object cache.

13. **Template enhancement buffering is opt-in.** The output buffer for template post-processing only starts if filters/actions are registered on `wp_template_enhancement_output_buffer` or `wp_finalized_template_enhancement_output_buffer`. Do not start the buffer unconditionally; this would prevent streaming responses.

14. **The Customizer's `transport` property governs live-preview behavior.** Settings with `transport: 'postMessage'` require JavaScript on the theme side to handle preview updates without iframe refresh. This is a contract between the data layer and the presentation layer that must be enforced.

---

## 17. Tovu Reconstruction Notes

### 17.1 Why this exists

This subsystem exists to separate content from presentation while still allowing themes, template overrides, user customizations, and live preview to coexist. WordPress’s lesson is that rendering is a layered resolution system, not a single “render page” function.

### 17.2 What Tovu should preserve

- A clear distinction between content data and presentation resolution
- User overrides should have explicit precedence over shipped theme defaults
- Theme metadata and template lookup rules must be first-class runtime concepts
- Preview and theme-state changes should be modeled as data, not just temporary UI hacks

### 17.3 What Tovu can simplify

- Tovu does not need PHP template files or stylesheet/template duality exactly as WordPress has it
- Child-theme compatibility can be reinterpreted as theme inheritance or theme layering
- The Customizer model can be simplified if Tovu keeps a draftable theme-state layer

### 17.4 Possible Tovu seams

- `src/features/presentation/` for themes, templates, and style state
- `src/core/ports/ThemeResolverPort.ts` for template/theme resolution
- `src/core/ports/PresentationDraftPort.ts` for pending theme/template changes and preview state

### 17.5 Suggested priority

- `V1`: theme resolution, template assignment, preview-friendly presentation model
- `Later`: theme inheritance, richer live customization drafts, advanced compatibility layers
