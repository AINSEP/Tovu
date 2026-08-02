# wp-content — Specification

**Source files analyzed:**
- `wp-includes/load.php`
- `wp-includes/default-constants.php`
- `wp-includes/ms-load.php`
- `wp-includes/functions.php` (upload dir logic)
- `wp-settings.php`
- `wp-admin/includes/plugin.php`

---

## 1. Overview

`wp-content` is the user-space partition of a WordPress installation. Everything inside it is owned by the site operator, not WordPress core — plugins, themes, user uploads, translation files, and special drop-in override files all live here. The directory is intentionally separable from the WordPress core files (`wp-admin/`, `wp-includes/`) so that core can be upgraded without touching operator content.

The absolute filesystem path to this directory is exposed as `WP_CONTENT_DIR`. Its public URL is `WP_CONTENT_URL`. Both are definable in `wp-config.php`; if not defined they default to `{ABSPATH}/wp-content` and `{siteurl}/wp-content` respectively. The URL constant is set lazily (in `wp_plugin_directory_constants()`) because it requires the database-stored `siteurl` option; the path constant is set early (in `wp_initial_constants()`) because it is needed before the database is available.

---

## 2. Directory Structure

```
wp-content/
├── plugins/            Regular plugins (activated via UI or option)
├── mu-plugins/         Must-use plugins (always active, no UI, flat files only)
├── themes/             Themes (active theme and available themes)
├── uploads/            User-uploaded media files (YYYY/MM subdirectory structure)
├── languages/          Translation files for core, plugins, and themes
├── upgrade/            Temporary staging area used by the plugin/theme upgrader
├── index.php           Silence is golden (prevents directory listing)
│
│   Drop-in override files (placed directly in wp-content/):
├── advanced-cache.php      Full-page caching layer (requires WP_CACHE=true)
├── db.php                  Custom database class (replaces wpdb)
├── db-error.php            Custom database error page
├── object-cache.php        External object cache backend
├── maintenance.php         Custom maintenance mode page
├── fatal-error-handler.php Custom PHP fatal error handler
├── php-error.php           Custom PHP error message page
├── install.php             Custom installation script
│
│   Multisite-only drop-ins:
├── sunrise.php             Domain mapping / early multisite config
├── blog-deleted.php        Shown when a multisite site is deleted
├── blog-inactive.php       Shown when a multisite site is inactive
└── blog-suspended.php      Shown when a multisite site is archived or spammed
```

---

## 3. Plugin Loading

### 3.1 Directory Constants

| Constant | Default Value | Set in |
|---|---|---|
| `WP_PLUGIN_DIR` | `WP_CONTENT_DIR . '/plugins'` | `wp_plugin_directory_constants()` |
| `WP_PLUGIN_URL` | `WP_CONTENT_URL . '/plugins'` | `wp_plugin_directory_constants()` |
| `WPMU_PLUGIN_DIR` | `WP_CONTENT_DIR . '/mu-plugins'` | `wp_plugin_directory_constants()` |
| `WPMU_PLUGIN_URL` | `WP_CONTENT_URL . '/mu-plugins'` | `wp_plugin_directory_constants()` |

All four can be overridden in `wp-config.php` before `wp-settings.php` runs. The `wp_plugin_directory_constants()` function is called after multisite is initialized and after `sunrise.php` has had a chance to run, so sunrise can override these constants for domain-mapped networks.

### 3.2 `get_plugin_data(pluginFile, markup?, translate?)`

Reads up to the first 8 KB of `pluginFile` and extracts plugin header fields.

**Parsing rules:**
- Each header must be on its own line.
- The format is `Header Name: value` inside the opening PHP block comment.
- Only the first 8192 bytes of the file are searched. If headers are not in that range, they will not be found.
- The `get_file_data()` function performs the actual regex-based extraction.

**All recognized header fields:**

| Header in file | Array key | Type | Notes |
|---|---|---|---|
| `Plugin Name` | `Name` | `string` | Required for a file to be recognized as a plugin |
| `Plugin URI` | `PluginURI` | `string` | URL to plugin's home page |
| `Version` | `Version` | `string` | Plugin version string |
| `Description` | `Description` | `string` | Must not contain newlines |
| `Author` | `Author` | `string` | Plugin author name |
| `Author URI` | `AuthorURI` | `string` | URL to author's website |
| `Text Domain` | `TextDomain` | `string` | Unique i18n slug; falls back to plugin directory name if absent |
| `Domain Path` | `DomainPath` | `string` | Relative path to `.mo` files (e.g. `/languages`) |
| `Network` | `Network` | `boolean` | `"true"` (case-insensitive string) → `true`; multisite-only network activation |
| `Requires at least` | `RequiresWP` | `string` | Minimum WordPress version |
| `Requires PHP` | `RequiresPHP` | `string` | Minimum PHP version |
| `Update URI` | `UpdateURI` | `string` | URI used for update checks; prevents WordPress.org update if set to non-wp.org URI |
| `Requires Plugins` | `RequiresPlugins` | `string` | Comma-separated list of WordPress.org plugin slugs that must be active |
| `Site Wide Only` | *(internal)* | `string` | Deprecated alias for `Network: true`; emits deprecation notice |

Two additional derived fields are always present in the returned array:
- `Title` — same as `Name`, but wrapped in an `<a>` tag linking to `PluginURI` when `$markup` is true.
- `AuthorName` — same as `Author` (plain text copy; `Author` itself may have the link markup applied).

When `$markup` is true, HTML is applied: `PluginURI` and `AuthorURI` are run through `esc_url()`, inline HTML in `Name`, `Author`, `Description`, and `Version` is stripped to a safe subset, and author/plugin URI links are constructed.

When `$translate` is true, translatable fields (`Name`, `PluginURI`, `Description`, `Author`, `AuthorURI`, `Version`) are passed through the plugin's text domain.

**Result is not cached** inside `get_plugin_data()`. Caching is the responsibility of callers.

### 3.3 `get_plugins(pluginFolder?)`

Scans `WP_PLUGIN_DIR` (or `WP_PLUGIN_DIR + pluginFolder`) for plugin files and returns an array keyed by plugin basename.

**Scanning algorithm:**
1. Check the object cache group `'plugins'` for key `pluginFolder`; return cached result if present.
2. Open the plugin root directory.
3. For each entry that does not start with `.`:
   - If it is a **directory**: open it and collect all `.php` files inside it (one level deep only). File paths are `dirName/fileName.php`.
   - If it is a **`.php` file** at the root level: collect it as `fileName.php`.
4. For each collected file path, call `get_plugin_data()` with `$markup=false, $translate=false`.
5. Skip files where `Name` is empty (no valid plugin header).
6. Key the result by `plugin_basename()` of the file path.
7. Sort results by `Name` using `strnatcasecmp` (natural-order, case-insensitive).
8. Store in object cache (group: `'plugins'`, non-persistent group).

**Important**: WordPress only supports plugins at exactly two depths: root-level `.php` files and `.php` files inside a single subdirectory. Nested subdirectories (e.g. `plugins/myplugin/includes/main.php`) are not scanned.

### 3.4 `get_mu_plugins()`

Scans `WPMU_PLUGIN_DIR` for `.php` files at the **flat top level only**. No subdirectory scanning.

**Differences from `get_plugins()`:**
- Only the flat directory is scanned (no subdirectory descent).
- If a file has no plugin header, `Name` defaults to the filename (mu-plugins do not require a header to run).
- `index.php` files that are 30 bytes or fewer are silently excluded (these are the standard directory-listing-silence files).
- Results are sorted by `Name` using `strnatcasecmp`.

### 3.5 `active_plugins` Option Format

For single sites, the set of active plugins is stored in the WordPress options table under the key `'active_plugins'`. The value is a serialized PHP array of plugin basenames, each in the form `'plugin-directory/plugin-file.php'` or `'single-file-plugin.php'`.

```typescript
// active_plugins option value:
type ActivePlugins = string[]; // e.g. ["akismet/akismet.php", "hello.php"]
```

The array is kept sorted alphabetically (a `sort()` call after every activation) and is autoloaded.

### 3.6 Network-Activated Plugins (`active_sitewide_plugins`)

In multisite, network-activated plugins are stored in the network (site) options table under the key `'active_sitewide_plugins'`. The value is an associative array where keys are plugin basenames and values are Unix timestamps of when the plugin was network-activated.

```typescript
// active_sitewide_plugins network option value:
type ActiveSitewidePlugins = Record<string, number>; // { "myplugin/myplugin.php": 1700000000 }
```

`wp_get_active_network_plugins()` extracts just the keys, sorts them, validates that each file exists, and returns an array of absolute filesystem paths.

### 3.7 Loading Sequence (from `wp-settings.php`)

The complete plugin loading sequence, in order:

1. **`advanced-cache.php` drop-in** — if `WP_CACHE` is `true` and the file exists, it is `include`d immediately after debug mode is set and before the lang dir is set. It runs before the database is initialized.
2. **`db.php` drop-in** — included inside `require_wp_db()`. If it defines `$wpdb`, WordPress skips creating a `new wpdb()`.
3. **`object-cache.php` drop-in** — included inside `wp_start_object_cache()`. If it defines `wp_cache_init()`, the external cache flag is set.
4. **`wp_plugin_directory_constants()`** is called to define `WP_PLUGIN_DIR`, `WP_PLUGIN_URL`, `WPMU_PLUGIN_DIR`, `WPMU_PLUGIN_URL`.
5. **Must-use plugins** — `wp_get_mu_plugins()` returns all `.php` files in `WPMU_PLUGIN_DIR`, sorted alphabetically. Each is `include_once`d in order. The `mu_plugin_loaded` action fires after each individual mu-plugin loads.
6. **Network-activated plugins** (multisite only) — `wp_get_active_network_plugins()` returns paths for all plugins in `active_sitewide_plugins`, sorted alphabetically. Each is `include_once`d. The `network_plugin_loaded` action fires after each.
7. **`muplugins_loaded` action** fires after all mu-plugins and network plugins have loaded.
8. **Site-activated plugins** — `wp_get_active_and_valid_plugins()` returns the validated contents of the `active_plugins` option, excluding any already loaded as network plugins, excluding any paused in recovery mode. `get_plugin_data()` is called to read `TextDomain` and `DomainPath` so the textdomain registry can be primed before the plugin file is included. The `plugin_loaded` action fires after each.
9. **`pluggable.php`** is loaded (after all plugins, so plugins can override pluggable functions).
10. **`plugins_loaded` action** fires.
11. **Theme loading** — `wp_get_active_and_valid_themes()` returns paths for the active theme and parent theme (if child theme). For each, `functions.php` is `include`d if it exists.
12. **`setup_theme` action**, then **`after_setup_theme` action** fire around theme loading.

---

## 4. Plugin Activation / Deactivation / Deletion

### 4.1 `activate_plugin(plugin, redirect?, networkWide?, silent?)`

Activates a single plugin. Returns `null` on success, `WP_Error` on failure.

**Full flow:**

1. Normalize `plugin` to its basename via `plugin_basename(trim($plugin))`.
2. Determine scope: if `$network_wide` is true, or if the plugin's `Network` header is `true` and multisite is active, set `$network_wide = true` and read `active_sitewide_plugins`. Otherwise read `active_plugins`.
3. Validate the plugin path with `validate_plugin()`: checks `validate_file()` (prevents path traversal), checks that the file exists, checks that `get_plugins()` knows about it (valid header).
4. Validate requirements with `validate_plugin_requirements()`:
   - Check WordPress version against `RequiresWP`.
   - Check PHP version against `RequiresPHP`.
   - Check `RequiresPlugins` via `WP_Plugin_Dependencies::has_unmet_dependencies()`.
5. Check if already active. If already in the active list, skip silently (return `null`).
6. If a redirect URL is provided, set it to the error URL (will be overridden on success).
7. Open an output buffer to catch unexpected output from the plugin file.
8. Call `plugin_sandbox_scrape($plugin)` which performs a test load of the plugin in a subprocess via a scrape request to detect fatal errors before committing.
9. If `$silent` is false:
   - Fire `do_action('activate_plugin', $plugin, $network_wide)`.
   - Fire `do_action("activate_{$plugin}", $network_wide)` — this is the hook set by `register_activation_hook()`.
10. Update the database:
    - Network-wide: `update_site_option('active_sitewide_plugins', ...)` with the plugin key set to `time()`.
    - Single site: append plugin to `active_plugins`, sort, `update_option('active_plugins', ...)`.
11. If `$silent` is false:
    - Fire `do_action('activated_plugin', $plugin, $network_wide)`.
12. If the output buffer has content, clean it and return a `WP_Error('unexpected_output', ...)`.
13. Return `null`.

**Hook sequence (non-silent):**
```
activate_plugin          → (before activation, before option update)
activate_{plugin}        → (the actual activation hook, before option update)
[option is updated]
activated_plugin         → (after option update)
```

### 4.2 `deactivate_plugins(plugins, silent?, networkWide?)`

Deactivates one or more plugins. No return value.

**`networkWide` semantics:**
- `null` (default): deactivate from both network and site lists if present in either.
- `true`: only deactivate network-wide plugins; skip site-active plugins.
- `false`: only deactivate site-active plugins; skip network-wide plugins.

**Flow for each plugin:**
1. Normalize to basename.
2. Skip if not active at all.
3. Determine `$network_deactivating` (true if plugin is in `active_sitewide_plugins` and `$network_wide !== false`).
4. If not silent, fire `do_action('deactivate_plugin', $plugin, $network_deactivating)`.
5. Remove from the appropriate list(s) based on `$network_wide`.
6. If in recovery mode and removing from site list, clear the plugin's paused-extension record.
7. If not silent:
   - Fire `do_action("deactivate_{$plugin}", $network_deactivating)` — the hook set by `register_deactivation_hook()`.
   - Fire `do_action('deactivated_plugin', $plugin, $network_deactivating)`.
8. After iterating all plugins, commit the changed option(s) to the database in batch (one `update_option`/`update_site_option` call).

**Hook sequence (non-silent):**
```
deactivate_plugin        → (before removal from option)
deactivate_{plugin}      → (the actual deactivation hook, before option update)
deactivated_plugin       → (after deactivation hook, before option is written to DB)
[option is updated after the foreach loop]
```

### 4.3 `delete_plugins(plugins)`

Permanently deletes plugin directories and associated files. Returns `true` on success, `false` if `$plugins` is empty, `WP_Error` on filesystem error, `null` if filesystem credentials are needed.

**Flow:**
1. Check filesystem credentials (may redirect to credentials form if FTP/SSH access required).
2. Initialize `WP_Filesystem`.
3. For each plugin file:
   - Call `uninstall_plugin()` if the plugin is uninstallable (has `uninstall.php` or is in `uninstall_plugins` option).
   - Fire `do_action('delete_plugin', $plugin_file)`.
   - If the plugin is in its own directory (basename contains `/`): delete the entire directory recursively.
   - If the plugin is a single file at the root: delete just the file.
   - Fire `do_action('deleted_plugin', $plugin_file, $deleted)`.
   - Clean up translation files from `WP_LANG_DIR/plugins/`: `.po`, `.mo`, `.l10n.php`, and `.json` files.
4. Remove deleted plugins from the `update_plugins` site transient.
5. Return `true` or `WP_Error` listing any files that could not be deleted.

### 4.4 `uninstall_plugin(plugin)`

Called by `delete_plugins()` to run uninstall cleanup.

**Priority order:**
1. If `uninstall.php` exists in the plugin directory: define `WP_UNINSTALL_PLUGIN` constant (set to the plugin basename), remove the plugin's callback from the `uninstall_plugins` option if present, then `include_once` the `uninstall.php` file. Return `true`.
2. If the plugin has a registered callback in the `uninstall_plugins` option: retrieve and remove the callback from the option, `include_once` the main plugin file (to make the function/class available), add the callback to `uninstall_{plugin}` action, then fire it. Return `void`.

**`uninstall.php` contract:** The file must check `defined('WP_UNINSTALL_PLUGIN')` before executing any cleanup. The constant value is the plugin basename (`'myplugin/myplugin.php'`).

### 4.5 Plugin Dependencies (`WP_Plugin_Dependencies`)

When a plugin declares `Requires Plugins: plugin-a, plugin-b` in its header, the `RequiresPlugins` field is a comma-separated list of WordPress.org plugin slugs.

During `validate_plugin_requirements()`:
- `WP_Plugin_Dependencies::initialize()` is called. It reads all installed plugins and builds a dependency map.
- `has_unmet_dependencies($plugin)` returns `true` if any required slug is not installed or is inactive.
- `get_dependency_names($plugin)` returns a map of `{ slug → displayName }` for all dependencies.
- `get_dependency_filepath($slug)` returns the absolute path to a dependency's main file, or `false` if not installed.

If unmet dependencies are found, activation returns a `WP_Error('plugin_missing_dependencies', ...)` with a detail object containing `not_installed` and `inactive` sub-arrays.

---

## 5. Must-Use Plugins

Must-use plugins (mu-plugins) are loaded on every request, unconditionally. They cannot be activated or deactivated through the admin UI — they are always active as long as the file exists.

### 5.1 Key Differences from Regular Plugins

| Property | Regular Plugin | Must-Use Plugin |
|---|---|---|
| Activation required | Yes (via UI or `activate_plugin()`) | No (presence in directory = active) |
| Can be deactivated | Yes | No (must physically remove the file) |
| Appears in Plugins screen | Yes | Yes, but in separate "Must-Use" tab |
| Activation/deactivation hooks fire | Yes | No |
| Can use `register_activation_hook` | Yes | No (hook never fires) |
| Subdirectory support | Yes (one level deep) | No (flat files only) |
| Load order | After mu-plugins and network plugins | Before regular and network plugins |

### 5.2 Discovery: `wp_get_mu_plugins()`

- Opens `WPMU_PLUGIN_DIR` with `opendir()`.
- Collects every file that ends in `.php` at the root level. No subdirectory descent.
- Sorts the collected absolute paths with `sort()` — this is a plain ASCII/locale sort, effectively alphabetical by filename.
- Returns the sorted array of absolute paths.
- If the directory does not exist or cannot be opened, returns an empty array.

This function is used by `wp-settings.php` to load the files. It is distinct from `get_mu_plugins()` in `wp-admin/includes/plugin.php`, which is used for the admin display.

### 5.3 Loading

Each file returned by `wp_get_mu_plugins()` is `include_once`d in alphabetical order. The `mu_plugin_loaded` action fires after each file with the full path as its argument.

### 5.4 Subdirectory Pattern

While mu-plugins cannot be placed in subdirectories themselves, a common pattern is to place a "loader" file in `mu-plugins/` that then includes files from a subdirectory:

```php
// mu-plugins/my-loader.php
require_once WPMU_PLUGIN_DIR . '/my-plugin/my-plugin.php';
```

This pattern is necessary because `wp_get_mu_plugins()` only discovers root-level `.php` files.

### 5.5 `wpmu-functions.php` / `wpmu-compat.php`

Historically, WordPress shipped a `wpmu-functions.php` and `wpmu-compat.php` in the mu-plugins directory as compatibility shims from the WordPress MU era. These are no longer shipped by core. The pattern is mentioned here for historical reference — any such files discovered in a real deployment predate WordPress 3.0 or were custom-added.

---

## 6. Drop-ins

Drop-ins are single PHP files placed directly in `WP_CONTENT_DIR` (not in any subdirectory). Each filename has a fixed meaning. They are loaded at specific, very early points in the bootstrap, before plugins or themes.

The canonical list of recognized drop-ins (from `_get_dropins()` in `wp-admin/includes/plugin.php`):

### 6.1 `advanced-cache.php`

**Requirement:** `WP_CACHE` constant must be `true` (defined in `wp-config.php`).

**When loaded:** In `wp-settings.php`, immediately after `wp_debug_mode()` and before `wp_set_lang_dir()`. This is before the database class is instantiated, before any options are read, before any plugins.

**Load mechanism:**
```php
if ( WP_CACHE && apply_filters('enable_loading_advanced_cache_dropin', true)
     && file_exists( WP_CONTENT_DIR . '/advanced-cache.php' ) ) {
    include WP_CONTENT_DIR . '/advanced-cache.php';
    // Re-initialize any hooks added manually by advanced-cache.php
    if ( $wp_filter ) {
        $wp_filter = WP_Hook::build_preinitialized_hooks( $wp_filter );
    }
}
```

**What it should implement:** A full-page cache that can serve cached responses before WordPress fully boots. Common implementations intercept the request here and output a cached HTML response followed by `exit`. It may also set up `$wp_filter` hooks using the pre-initialization format documented in the hook engine spec.

**`wp_cache_postload()`:** After all plugins load, if `WP_CACHE` is true and `wp_cache_postload()` is defined, it is called. This gives the advanced cache a second hook point after plugins have loaded.

### 6.2 `db.php`

**Requirement:** None (always loaded if present).

**When loaded:** Inside `require_wp_db()`. The standard `class-wpdb.php` is loaded first (which defines the `wpdb` class), then `db.php` is included. If `db.php` sets the global `$wpdb`, `require_wp_db()` returns immediately without creating a `new wpdb()`.

```php
function require_wp_db() {
    global $wpdb;
    require_once ABSPATH . WPINC . '/class-wpdb.php';
    if ( file_exists( WP_CONTENT_DIR . '/db.php' ) ) {
        require_once WP_CONTENT_DIR . '/db.php';
    }
    if ( isset( $wpdb ) ) { return; }
    // ... instantiate default wpdb
}
```

**What it should implement:** A class that extends or replaces `wpdb`. The file must assign `$wpdb` globally. The replacement must implement the full `wpdb` interface. Common use cases: persistent database connections, connection pooling, read/write splitting.

**Effect on MySQL requirement check:** In `wp_check_php_mysql_versions()`, the `mysqli` extension check is skipped if `db.php` exists, because the drop-in may use a different database driver.

### 6.3 `db-error.php`

**Requirement:** None (shown automatically on database connection failure).

**When loaded:** Called by the `dead_db()` function which is invoked when the database connection fails and cannot be recovered. The file is `require`d and then `die()` is called to halt execution.

**What it should implement:** An HTML error page to show the user. No database access is available. Should not depend on WordPress functions beyond what is available before the DB.

### 6.4 `object-cache.php`

**Requirement:** None (loaded automatically if present).

**When loaded:** Inside `wp_start_object_cache()`, which is called from `wp-settings.php` after the database is initialized and the default filters are attached.

```php
function wp_start_object_cache() {
    if ( $first_init && apply_filters('enable_loading_object_cache_dropin', true) ) {
        if ( ! function_exists('wp_cache_init') ) {
            if ( file_exists( WP_CONTENT_DIR . '/object-cache.php' ) ) {
                require_once WP_CONTENT_DIR . '/object-cache.php';
                if ( function_exists('wp_cache_init') ) {
                    wp_using_ext_object_cache(true);
                }
                // Re-initialize any hooks
                if ( $wp_filter ) {
                    $wp_filter = WP_Hook::build_preinitialized_hooks( $wp_filter );
                }
            }
        }
    }
    if ( ! wp_using_ext_object_cache() ) {
        require_once ABSPATH . WPINC . '/cache.php'; // built-in cache
    }
    // ...
    wp_cache_init();
    wp_cache_add_global_groups([...]);
    wp_cache_add_non_persistent_groups(['counts', 'plugins', 'theme_json']);
}
```

**What it must implement:** All `wp_cache_*` functions. The minimum required surface for WordPress to function:

```typescript
function wp_cache_init(): void;
function wp_cache_add(key: string, data: unknown, group?: string, expire?: number): boolean;
function wp_cache_set(key: string, data: unknown, group?: string, expire?: number): boolean;
function wp_cache_get(key: string, group?: string, force?: boolean, found?: boolean): unknown;
function wp_cache_delete(key: string, group?: string): boolean;
function wp_cache_flush(): boolean;
function wp_cache_close(): boolean;
function wp_cache_add_global_groups(groups: string[]): void;
function wp_cache_add_non_persistent_groups(groups: string[]): void;
// Optional but called if defined:
function wp_cache_switch_to_blog(blogId: number): void;
function wp_cache_postload(): void;
```

**`wp_using_ext_object_cache(bool?)`**: A getter/setter for the global `$_wp_using_ext_object_cache` flag. Returns the previous value. WordPress uses this to decide whether to load the built-in cache.

**Special handling for `advanced-cache.php` loading `object-cache.php`:** If `advanced-cache.php` loaded `object-cache.php` early (before `wp_start_object_cache()` runs), `wp_cache_init` will already be defined but `wp_using_ext_object_cache()` will be false. In this case, `wp_start_object_cache()` detects the situation and sets the flag to `true` without re-loading.

### 6.5 `maintenance.php`

**Requirement:** None (loaded automatically during maintenance mode).

**When loaded:** By `wp_maintenance()`, which is called from `wp-settings.php` very early — before the database, before plugins, before themes. Maintenance mode is active when `{ABSPATH}/.maintenance` exists and contains an `$upgrading` timestamp set within the last 10 minutes.

```php
function wp_maintenance() {
    if ( ! wp_is_maintenance_mode() ) { return; }
    if ( file_exists( WP_CONTENT_DIR . '/maintenance.php' ) ) {
        require_once WP_CONTENT_DIR . '/maintenance.php';
        die();
    }
    // ... default maintenance message
}
```

**`wp_is_maintenance_mode()` logic:**
1. `{ABSPATH}/.maintenance` must exist.
2. The file must declare `$upgrading` as a Unix timestamp.
3. `time() - $upgrading` must be less than `10 * 60` seconds.
4. If `$_REQUEST['wp_scrape_key']` and `$_REQUEST['wp_scrape_nonce']` are set and valid (`md5($upgrading) === key && (int)nonce === $upgrading`), maintenance mode is suppressed (allows the error scraper to work during upgrades).
5. The `enable_maintenance_mode` filter can return `false` to suppress maintenance mode (runs before plugins are loaded, so must use pre-initialization hooks).

**What it should implement:** Any HTML to show during maintenance. Has access to WordPress constants (`ABSPATH`, `WP_CONTENT_DIR`) but not to the database or WordPress functions.

### 6.6 `sunrise.php`

**Requirement:** `SUNRISE` constant must be defined as `true` in `wp-config.php` (or `SUBDOMAIN_INSTALL` / `VHOST` must be set, which implies multisite).

**When loaded:** In `ms-settings.php` (the multisite configuration file), before the current site is determined from the request. This is the earliest possible point in multisite boot — before the `$current_blog` and `$current_site` globals are set.

**Purpose:** Domain mapping. Allows mapping arbitrary domains to specific multisite sites. The file can inspect `$_SERVER['HTTP_HOST']` and `$_SERVER['REQUEST_URI']`, then set globals like `$current_blog` and `$current_site` to control which site handles the request.

**What it can do:** Set `$current_blog`, `$current_site`, override `WP_PLUGIN_DIR`, `WP_PLUGIN_URL`, `WPMU_PLUGIN_DIR`, `WPMU_PLUGIN_URL` (since `wp_plugin_directory_constants()` is called after `sunrise.php`). This is how sunrise-based domain mappers redirect different domains to different blog IDs.

**Note on `_get_dropins()`:** `sunrise.php` is listed with the requirement `'SUNRISE'` constant, meaning it only appears in the admin drop-ins list when `SUNRISE` is defined. However, in practice, any multisite installation with `sunrise.php` in `wp-content/` will have `SUNRISE` defined in `wp-config.php`.

### 6.7 `blog-deleted.php`, `blog-inactive.php`, `blog-suspended.php`

**Requirement:** Multisite only. Loaded automatically by `ms_site_check()`.

**When loaded:** In `wp-settings.php` after `init` fires (for the multisite site status check):

```php
if ( is_multisite() ) {
    $file = ms_site_check();
    if ( true !== $file ) {
        require $file;
        die();
    }
}
```

`ms_site_check()` reads the current site's status flags and returns the path to the appropriate drop-in:

| Condition | Drop-in |
|---|---|
| `$blog->deleted === '1'` (site deleted) | `blog-deleted.php` |
| `$blog->deleted === '2'` (archived) | `blog-suspended.php` |
| `$blog->spam === '1'` (spammed) | `blog-suspended.php` |
| `$blog->archived === '1'` | `blog-suspended.php` |
| `$blog->mature === '1'` OR `$blog->public === '-1'` | `blog-inactive.php` |

Super admins always bypass these checks.

**What they should implement:** HTML pages explaining the site status. At this point in the bootstrap, WordPress is fully initialized including plugins and themes, so these pages can use WordPress functions.

### 6.8 `fatal-error-handler.php` and `php-error.php`

**`fatal-error-handler.php`:** Replaces the default WordPress fatal error handler (`WP_Fatal_Error_Handler`). Must implement the same interface.

**`php-error.php`:** Shown on PHP errors (distinct from database errors). Must output an HTML error page.

Both are listed in `_get_dropins()` with `true` as the constant requirement (meaning no constant check — they load automatically if present).

---

## 7. Uploads Directory

### 7.1 Default Structure

```
wp-content/uploads/
└── 2024/
    ├── 01/
    │   ├── my-image.jpg
    │   └── my-image-150x150.jpg
    └── 02/
        └── document.pdf
```

Year/month subdirectories are created automatically when `uploads_use_yearmonth_folders` option is truthy (default: true).

### 7.2 `wp_upload_dir(time?, createDir?, refreshCache?)`

Returns an array describing the upload directory for the given time.

| Field | Type | Description |
|---|---|---|
| `path` | `string` | Absolute filesystem path including subdir (e.g. `/var/www/wp-content/uploads/2024/01`) |
| `url` | `string` | Full URL including subdir (e.g. `https://example.com/wp-content/uploads/2024/01`) |
| `subdir` | `string` | The year/month subdir portion, or empty string if year/month folders disabled (e.g. `/2024/01`) |
| `basedir` | `string` | Absolute filesystem path without subdir |
| `baseurl` | `string` | Full URL without subdir |
| `error` | `string \| false` | `false` on success, error message string if the directory could not be created |

**Caching:** The raw values are cached in a static variable keyed by `{blogId}-{time}`. The `upload_dir` filter is applied on every call (not cached). Directory creation is cached per-path in `$tested_paths`.

**`wp_get_upload_dir()`:** Thin wrapper around `wp_upload_dir(null, false)` — no directory creation attempt.

### 7.3 Path Resolution Logic (`_wp_upload_dir()`)

The base directory and URL are resolved in this priority order:

**Filesystem path (`$dir`):**
1. If `upload_path` option is empty or equals `'wp-content/uploads'`: use `WP_CONTENT_DIR . '/uploads'`.
2. Else if `upload_path` does not start with `ABSPATH` (is relative): join `ABSPATH` + `upload_path`.
3. Else: use `upload_path` as-is (absolute path).

**URL (`$url`):**
1. If `upload_url_path` option is non-empty: use it directly.
2. Else if `upload_path` is empty, equals `'wp-content/uploads'`, or equals `$dir`: use `WP_CONTENT_URL . '/uploads'`.
3. Else: use `trailingslashit(siteurl) . upload_path`.

**`UPLOADS` constant override:**
- If `UPLOADS` is defined and `ms_files_rewriting` is disabled: `$dir = ABSPATH . UPLOADS; $url = trailingslashit(siteurl) . UPLOADS`.
- The `UPLOADS` constant is a path relative to `ABSPATH` (e.g. `'wp-content/uploads'`).

**Year/month subdir:**
- If `uploads_use_yearmonth_folders` option is truthy, extract year and month from `$time` (or from `current_time('mysql')` if `$time` is null).
- `$subdir = "/{Y}/{m}"` (e.g. `/2024/01`).

### 7.4 Multisite Per-Site Uploads

In multisite, uploads are isolated per site.

**Post-3.5 networks (MULTISITE constant defined, no `ms_files_rewriting`):**
- Directory: `basedir + '/sites/' + blogId` (e.g. `/wp-content/uploads/sites/3/2024/01`)
- The `/sites/` prefix prevents a 4-digit site ID from colliding with year-based directories.

**Pre-3.5 networks (no MULTISITE constant, no `ms_files_rewriting`):**
- Directory: `basedir + '/' + blogId` (no `/sites/` prefix).

**Networks with `ms_files_rewriting` enabled (legacy):**
- Uses `BLOGUPLOADDIR` constant (absolute path) or `ABSPATH . UPLOADS` (relative).
- URL becomes `trailingslashit(siteurl) . 'files'` (served through `ms-files.php`).
- The `ms-files.php` script reads files from disk and serves them with appropriate headers.

**Main site exception:** When on the main site of the main network (`is_main_network() && is_main_site() && defined('MULTISITE')`), the multisite subdirectory is not appended — the main site uses the base uploads directory directly.

### 7.5 `upload_path` and `upload_url_path` Options

These are legacy options, settable in the admin under Settings > Misc (removed from UI in newer WordPress but still functional).

- `upload_path`: Filesystem path override. If set to a relative path, it is relative to `ABSPATH`. If absolute, used as-is. Default empty (meaning `wp-content/uploads`).
- `upload_url_path`: URL override for the uploads directory. If set, it completely overrides the URL calculation.

---

## 8. Languages Directory

### 8.1 Location Resolution (`wp_set_lang_dir()`)

`WP_LANG_DIR` is set by calling `wp_set_lang_dir()` in `wp-settings.php` after `advanced-cache.php` has loaded.

**Resolution priority:**
1. If `WP_LANG_DIR` is already defined (in `wp-config.php`): use it unchanged.
2. If `WP_CONTENT_DIR . '/languages'` exists as a directory: set `WP_LANG_DIR = WP_CONTENT_DIR . '/languages'`.
3. If `ABSPATH . WPINC . '/languages'` does NOT exist: set `WP_LANG_DIR = WP_CONTENT_DIR . '/languages'` anyway (create it on demand).
4. Otherwise: set `WP_LANG_DIR = ABSPATH . WPINC . '/languages'`.

The deprecated `LANGDIR` constant is also set (relative path, for backward compatibility).

### 8.2 File Naming Conventions

**Core translations:**
- `{locale}.mo` — binary MO format (e.g. `fr_FR.mo`)
- `{locale}.po` — source PO format
- `{locale}.l10n.php` — PHP array format (newer, faster)
- `admin-{locale}.mo` — admin-specific strings
- `admin-network-{locale}.mo` — network admin strings
- `continents-cities-{locale}.mo` — timezone picker strings

**Plugin translations** (in `WP_LANG_DIR/plugins/`):
- `{textdomain}-{locale}.mo`
- `{textdomain}-{locale}.po`
- `{textdomain}-{locale}.l10n.php`
- `{textdomain}-{locale}-{hash}.json` — JavaScript translations

**Theme translations** (in `WP_LANG_DIR/themes/`):
- `{textdomain}-{locale}.mo`
- `{textdomain}-{locale}.po`
- `{textdomain}-{locale}.l10n.php`

### 8.3 Early Translation Loading

`wp_load_translations_early()` is a special function called during error conditions (before `init`) to load translations for error messages. It loads in this order:

1. Determine locale from `WPLANG` constant or `$wp_local_package` global.
2. Search in: `WP_LANG_DIR`, `WP_CONTENT_DIR/languages`, `ABSPATH/wp-content/languages`, `ABSPATH/{WPINC}/languages`.
3. Call `load_textdomain('default', path)` for the first matching `{locale}.mo` found.
4. If `WP_SETUP_CONFIG` is defined, also load `admin-{locale}.mo`.

### 8.4 Language Pack Installation

Language packs are downloaded by `WP_Language_Pack_Upgrader`. Installed packs land in:
- Core: `WP_LANG_DIR/`
- Plugins: `WP_LANG_DIR/plugins/`
- Themes: `WP_LANG_DIR/themes/`

When a plugin is deleted via `delete_plugins()`, its translation files are also deleted from `WP_LANG_DIR/plugins/`.

---

## 9. Key Constants

| Constant | Default Value | Set when | Notes |
|---|---|---|---|
| `WP_CONTENT_DIR` | `ABSPATH . 'wp-content'` | `wp_initial_constants()` — very early | No trailing slash. Can be overridden in `wp-config.php`. Used before DB is available. |
| `WP_CONTENT_URL` | `get_option('siteurl') . '/wp-content'` | `wp_plugin_directory_constants()` — after DB | Requires DB to read `siteurl`. Can be overridden in `wp-config.php`. |
| `WP_PLUGIN_DIR` | `WP_CONTENT_DIR . '/plugins'` | `wp_plugin_directory_constants()` | Full path, no trailing slash. |
| `WP_PLUGIN_URL` | `WP_CONTENT_URL . '/plugins'` | `wp_plugin_directory_constants()` | Full URL, no trailing slash. |
| `WPMU_PLUGIN_DIR` | `WP_CONTENT_DIR . '/mu-plugins'` | `wp_plugin_directory_constants()` | Full path, no trailing slash. |
| `WPMU_PLUGIN_URL` | `WP_CONTENT_URL . '/mu-plugins'` | `wp_plugin_directory_constants()` | Full URL, no trailing slash. |
| `WP_LANG_DIR` | `WP_CONTENT_DIR . '/languages'` or `ABSPATH . WPINC . '/languages'` | `wp_set_lang_dir()` | Logic described in Section 8. |
| `UPLOADS` | *(not set by default)* | Must be defined manually in `wp-config.php` | Relative path from `ABSPATH` to uploads directory. Overrides `upload_path` option. |
| `WP_CACHE` | `false` | `wp_initial_constants()` | Must be `true` for `advanced-cache.php` to load. |
| `WP_DEBUG` | `false` (or `true` in dev mode) | `wp_initial_constants()` | If development mode or `development` environment type, defaults `true`. |
| `WP_DEBUG_LOG` | `false` | `wp_initial_constants()` | `true` logs to `WP_CONTENT_DIR/debug.log`. A string value sets a custom log file path. Only active when `WP_DEBUG` is `true`. |
| `WP_DEBUG_DISPLAY` | `true` | `wp_initial_constants()` | Controls `display_errors`. `null` = don't change PHP's setting. `false` = force off. Only active when `WP_DEBUG` is `true`. |
| `SCRIPT_DEBUG` | `false` (or `true` for `-src` builds) | `wp_initial_constants()` | When `true`, non-minified, non-concatenated JS/CSS is served. |
| `WP_ENVIRONMENT_TYPE` | `'production'` | `wp_get_environment_type()` | Valid values: `'local'`, `'development'`, `'staging'`, `'production'`. Read from env var first, then constant. Falls back to `'production'` for invalid values. |
| `WP_DEVELOPMENT_MODE` | `''` | `wp_initial_constants()` | Valid values: `'core'`, `'plugin'`, `'theme'`, `'all'`, `''`. Controls development-specific behaviors. Separate from `WP_DEBUG`. |
| `SUNRISE` | *(not set by default)* | Must be defined in `wp-config.php` | Enables `sunrise.php` drop-in loading in multisite. |
| `SHORTINIT` | `false` | `wp_initial_constants()` | When `true`, most of WordPress stops loading after early bootstrap. Used for lightweight scripts. |
| `PLUGINDIR` | `'wp-content/plugins'` | `wp_plugin_directory_constants()` | Deprecated. Relative to `ABSPATH`. Kept for backward compat. |
| `MUPLUGINDIR` | `'wp-content/mu-plugins'` | `wp_plugin_directory_constants()` | Deprecated. Relative to `ABSPATH`. Kept for backward compat. |

---

## 10. Key Hooks and Filters

### Actions

| Hook | When Fired | Arguments | Purpose |
|---|---|---|---|
| `mu_plugin_loaded` | After each mu-plugin file is loaded | `(pluginPath: string)` | Single mu-plugin has loaded |
| `network_plugin_loaded` | After each network plugin file is loaded (multisite) | `(pluginPath: string)` | Single network plugin has loaded |
| `muplugins_loaded` | After all mu-plugins and network plugins have loaded | none | All must-use and network plugins are ready |
| `plugin_loaded` | After each site plugin file is loaded | `(pluginPath: string)` | Single site plugin has loaded |
| `plugins_loaded` | After all site plugins have loaded, after `pluggable.php` | none | All plugins are ready; pluggable functions are available |
| `activate_plugin` | Before a plugin's activation hooks fire (non-silent) | `(plugin: string, networkWide: boolean)` | Plugin is about to be activated |
| `activate_{plugin}` | The activation hook (non-silent); `{plugin}` = basename | `(networkWide: boolean)` | Plugin-specific activation hook |
| `activated_plugin` | After activation option is updated (non-silent) | `(plugin: string, networkWide: boolean)` | Plugin has been activated |
| `deactivate_plugin` | Before a plugin's deactivation hooks fire (non-silent) | `(plugin: string, networkDeactivating: boolean)` | Plugin is about to be deactivated |
| `deactivate_{plugin}` | The deactivation hook (non-silent) | `(networkDeactivating: boolean)` | Plugin-specific deactivation hook |
| `deactivated_plugin` | After deactivation hook, before option is written (non-silent) | `(plugin: string, networkDeactivating: boolean)` | Plugin has been deactivated |
| `delete_plugin` | Before filesystem deletion of a plugin | `(pluginFile: string)` | Plugin is about to be deleted |
| `deleted_plugin` | After filesystem deletion attempt | `(pluginFile: string, deleted: boolean)` | Plugin deletion result |
| `pre_uninstall_plugin` | Before uninstall logic runs | `(plugin: string, uninstallablePlugins: object)` | Plugin uninstall is about to start |
| `uninstall_{plugin}` | The uninstall hook; `{plugin}` = basename | none | Plugin-specific uninstall hook (via `register_uninstall_hook`) |
| `setup_theme` | Before theme functions.php files are included | none | |
| `after_setup_theme` | After theme functions.php files are included | none | |
| `shutdown` | PHP shutdown (via `register_shutdown_function`) | none | Cache close and final cleanup |
| `ms_site_check` | During multisite site status check | none | Filter can return `true` to bypass status checks |

### Filters

| Hook | Applied where | Arguments | Purpose |
|---|---|---|---|
| `enable_loading_advanced_cache_dropin` | `wp-settings.php` | `(enabled: boolean)` | Override whether `advanced-cache.php` loads; runs before plugins |
| `enable_loading_object_cache_dropin` | `wp_start_object_cache()` | `(enabled: boolean)` | Override whether `object-cache.php` loads; runs before plugins |
| `enable_maintenance_mode` | `wp_is_maintenance_mode()` | `(enable: boolean, upgrading: number)` | Override maintenance mode; runs before plugins |
| `enable_wp_debug_mode_checks` | `wp_debug_mode()` | `(enable: boolean)` | Skip debug mode configuration; runs before plugins |
| `upload_dir` | `wp_upload_dir()` | `(uploads: UploadDirInfo)` | Modify upload directory and URL |
| `plugin_files_exclusions` | `get_plugin_files()` | `(exclusions: string[])` | Directories/files to exclude when scanning plugin directory |
| `validate_plugin_requirements` | `validate_plugin_requirements()` | `(met: boolean \| WP_Error, plugin: string)` | Add additional validation steps for plugin activation |
| `wp_using_themes` | `wp_using_themes()` | `(using: boolean)` | Override whether themes should be loaded |
| `file_mod_allowed` | `wp_is_file_mod_allowed()` | `(allowed: boolean, context: string)` | Control whether filesystem modifications are permitted |
| `is_protected_endpoint` | `is_protected_endpoint()` | `(isProtected: boolean)` | Mark additional endpoints as protected against WSODs |
| `wp_protected_ajax_actions` | `is_protected_ajax_action()` | `(actions: string[])` | Add Ajax actions that should be protected against WSODs |

---

## 11. TypeScript Interface Sketch

```typescript
// ---- Constants (runtime config object, not actual TS constants) ----

interface WPContentConfig {
  WP_CONTENT_DIR: string;         // absolute path, no trailing slash
  WP_CONTENT_URL: string;         // full URL, no trailing slash
  WP_PLUGIN_DIR: string;
  WP_PLUGIN_URL: string;
  WPMU_PLUGIN_DIR: string;
  WPMU_PLUGIN_URL: string;
  WP_LANG_DIR: string;
  UPLOADS?: string;               // relative to ABSPATH, overrides upload_path
  WP_CACHE: boolean;
  WP_DEBUG: boolean;
  WP_DEBUG_LOG: boolean | string; // false | true | absolute path string
  WP_DEBUG_DISPLAY: boolean | null;
  SCRIPT_DEBUG: boolean;
  WP_ENVIRONMENT_TYPE: 'local' | 'development' | 'staging' | 'production';
  WP_DEVELOPMENT_MODE: 'core' | 'plugin' | 'theme' | 'all' | '';
  SUNRISE: boolean;
  SHORTINIT: boolean;
}

// ---- Plugin header data ----

interface PluginData {
  Name: string;
  PluginURI: string;
  Version: string;
  Description: string;
  Author: string;
  AuthorURI: string;
  TextDomain: string;
  DomainPath: string;
  Network: boolean;
  RequiresWP: string;
  RequiresPHP: string;
  UpdateURI: string;
  RequiresPlugins: string;     // comma-separated slug list
  Title: string;               // derived: Name possibly wrapped in <a>
  AuthorName: string;          // derived: plain-text Author
}

// ---- Plugin registry ----

// Keys are plugin basenames: "plugin-dir/plugin-file.php" or "single-file.php"
type PluginRegistry = Record<string, PluginData>;

// active_plugins option value (single site)
type ActivePlugins = string[];

// active_sitewide_plugins network option value (multisite)
type ActiveSitewidePlugins = Record<string, number>; // basename → activation timestamp

// ---- Plugin management ----

interface PluginManager {
  getPlugins(pluginFolder?: string): PluginRegistry;
  getMuPlugins(): PluginRegistry;
  getDropins(): PluginRegistry;

  isPluginActive(plugin: string): boolean;
  isPluginActiveForNetwork(plugin: string): boolean;
  isNetworkOnlyPlugin(plugin: string): boolean;

  activatePlugin(
    plugin: string,
    redirect?: string,
    networkWide?: boolean,
    silent?: boolean
  ): null | WPError;

  deactivatePlugins(
    plugins: string | string[],
    silent?: boolean,
    networkWide?: boolean | null
  ): void;

  deletePlugins(plugins: string[]): boolean | null | WPError;

  validatePlugin(plugin: string): 0 | WPError;
  validatePluginRequirements(plugin: string): true | WPError;

  isUninstallablePlugin(plugin: string): boolean;
  uninstallPlugin(plugin: string): true | void;
}

// ---- Drop-in registry ----

interface DropinInfo {
  description: string;
  // The constant that must be true for this drop-in to be active,
  // or true if no constant is required (auto-loads).
  requirement: string | true;
}

type DropinRegistry = Record<string, DropinInfo>;
// e.g. { 'advanced-cache.php': { description: '...', requirement: 'WP_CACHE' }, ... }

// ---- Upload directory ----

interface UploadDirInfo {
  path: string;       // absolute filesystem path including year/month subdir
  url: string;        // full URL including year/month subdir
  subdir: string;     // e.g. "/2024/01" or ""
  basedir: string;    // absolute filesystem path without subdir
  baseurl: string;    // full URL without subdir
  error: string | false;
}

interface UploadsManager {
  getUploadDir(time?: string | null, createDir?: boolean, refreshCache?: boolean): UploadDirInfo;
  getUploadDirLight(): UploadDirInfo; // wp_get_upload_dir: no dir creation
}

// ---- Must-use plugin loader ----

interface MuPluginLoader {
  // Returns absolute paths, sorted alphabetically by filename
  getMuPluginPaths(): string[];
}

// ---- Active plugin loader ----

interface ActivePluginLoader {
  // Returns absolute paths of active+valid site plugins
  getActiveAndValidPlugins(): string[];
  // Returns absolute paths of network-activated plugins
  getActiveNetworkPlugins(): string[];
  // Returns absolute paths of active theme directories
  getActiveAndValidThemes(): string[];
}

// ---- Drop-in loading state ----

interface DropinState {
  advancedCacheLoaded: boolean;
  dbDropinLoaded: boolean;
  objectCacheLoaded: boolean;
  usingExtObjectCache: boolean;
}

// ---- Recovery / error protection ----

interface PausedExtensionsStorage {
  getAll(): Record<string, unknown>;
  set(extension: string, error: unknown): void;
  delete(extension: string): boolean;
}
```

---

## 12. Design Patterns to Carry Over

1. **wp-content as the operator boundary.** All paths that change between WordPress installs, between sites on the same server, or between environments are rooted in `WP_CONTENT_DIR`. The core WordPress codebase under `wp-admin/` and `wp-includes/` is considered read-only from the operator's perspective. In a TypeScript rewrite, maintain this separation: a `contentDir` config value should be the single root for all user-managed content.

2. **Constants set in two phases.** `WP_CONTENT_DIR` is set immediately from filesystem paths (no I/O needed). `WP_CONTENT_URL` and `WP_PLUGIN_URL` require the database `siteurl` and are set later. Reproduce this two-phase pattern: a sync config loading phase (filesystem paths) and an async config loading phase (database-dependent URLs).

3. **Drop-ins replace entire subsystems.** `db.php` and `object-cache.php` are not extension points — they are replacements. The loader checks if the drop-in has set a global (`$wpdb` for db.php, `wp_cache_init` for object-cache.php) and only falls back to the built-in if it hasn't. In TypeScript, this translates to an interface contract: drop-ins must implement the full interface, not extend a base class.

4. **Drop-ins loaded before plugins.** The order is: advanced-cache → db → object-cache → mu-plugins → network plugins → site plugins → themes. No drop-in can depend on anything loaded later. In a TypeScript system, these would be distinct initialization phases with explicit dependency injection, not an arbitrary-order module system.

5. **Plugin header parsing reads only 8 KB.** This is a performance boundary. The header comment must be near the top of the file. In a TypeScript implementation, replicate this limit when reading plugin metadata files.

6. **Plugin activation is sandboxed before committing.** The option is not updated until after the plugin file has been test-loaded. `plugin_sandbox_scrape()` makes a separate HTTP request to detect fatal errors. This pattern prevents a fatally broken plugin from being permanently activated. In a TypeScript system, this could be a subprocess execution with error detection.

7. **`active_plugins` is a sorted flat array; `active_sitewide_plugins` is a keyed object.** The format difference matters: single-site plugins are an array (order preserved for display but sorted alphabetically), while network-activated plugins are a map of basename → timestamp (timestamp records when activation happened). Reproduce both formats faithfully for data compatibility.

8. **Deactivation option writes are batched.** `deactivate_plugins()` iterates through all plugins first, then performs a single `update_option` / `update_site_option` call per scope. This avoids N database writes for N deactivations. Reproduce this batch-write pattern.

9. **Uninstall callbacks survive process restarts via the database.** `register_uninstall_hook` stores the callback in the `uninstall_plugins` option. This is critical: uninstall runs in a different HTTP request from when the plugin was active. In TypeScript, the equivalent is to serialize the uninstall handler identifier (module path + function name) to a persistent store, then re-import and call it during deletion.

10. **Uploads directory has three override layers.** The resolution order is: `UPLOADS` constant → `upload_path` option → default (`wp-content/uploads`). Each layer can override the previous. In a TypeScript rewrite, implement this as a prioritized resolver: (1) check constant, (2) check config/option, (3) use default.

11. **Multisite uploads use blog-ID subdirectories.** The `/sites/{blogId}/` prefix is added for post-3.5 multisite networks. This is a filesystem concern, not just a URL concern — both `path` and `url` in `wp_upload_dir()` must include the suffix. Ensure the TypeScript equivalent does this symmetrically.

12. **The `upload_dir` filter runs on every call, not on cache misses only.** The raw computation is cached statically, but the filter always runs. This means filter callbacks always see the call and can modify the result even when the underlying computation is cached. Reproduce this: cache the computation, always apply the filter.

13. **Language file locations are searched in priority order.** `wp_load_translations_early()` searches `WP_LANG_DIR`, then `WP_CONTENT_DIR/languages`, then hardcoded fallback paths. The first match wins. This ordered-search pattern should be reproduced for any early-boot translation loading.

14. **`WP_ENVIRONMENT_TYPE` has a safe default.** Any unrecognized value collapses to `'production'` — the most restrictive mode. This is a security-safe default: misconfiguration makes the system more conservative, not more permissive. Apply the same principle to any environment-mode logic in the TypeScript rewrite.

---

## Tovu Reconstruction Notes

### Why this exists

`wp-content` is WordPress's operator-managed boundary. It is where mutable code, uploads, translations, drop-ins, and extension artifacts live, and it therefore defines much of the platform's deployment and extension story.

### What Tovu should preserve

- A clear separation between platform/core code and operator-managed content/extension state
- Explicit initialization order for drop-ins/extensions/themes so dependency assumptions stay visible
- Safe plugin activation and upload-directory resolution as first-class operational concerns

### What Tovu can simplify

- Tovu does not need WordPress's exact directory names or drop-in file conventions if it chooses a clearer extension/runtime model
- Replacement-level drop-ins can be narrowed to ports/adapters with explicit contracts rather than filesystem magic

### Possible Tovu seams

- `src/core/extensions/`
- `src/core/ports/ExtensionRuntimePort.ts`
- `src/core/ports/BlobStorePort.ts`
- `src/core/config/`

### Suggested priority

- `V1`: operator/content boundary, extension load phases, upload/storage resolution
- `Later`: broader WordPress-style drop-in compatibility
