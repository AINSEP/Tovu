# Bootstrap Chain — Specification

**Source files analyzed:**
- `wordpress/index.php`
- `wordpress/wp-blog-header.php`
- `wordpress/wp-load.php`
- `wordpress/wp-config-sample.php`
- `wordpress/wp-settings.php`

---

## 1. Overview

WordPress bootstrap is a strict linear chain. Every front-end page request enters at `index.php` and proceeds through exactly four more files before any plugin or theme code runs. The chain is:

```
index.php
  └─ wp-blog-header.php
       └─ wp-load.php
            └─ wp-config.php
                 └─ wp-settings.php
```

Each file has a single, well-bounded responsibility:

| File | Responsibility |
|---|---|
| `index.php` | Declares `WP_USE_THEMES=true` and delegates unconditionally to `wp-blog-header.php`. Contains no logic of its own. |
| `wp-blog-header.php` | Guards against double execution, then performs three steps in order: load the environment, execute the main query, load the theme template. |
| `wp-load.php` | Defines `ABSPATH`, locates `wp-config.php` by crawling the filesystem, and requires it. If no config file is found, redirects to the setup wizard. |
| `wp-config.php` | User-authored configuration file. Defines all environment constants (DB credentials, salts, feature flags) and ends by requiring `wp-settings.php`. |
| `wp-settings.php` | Initialises every WordPress subsystem in a precise, ordered sequence of ~54 discrete steps. No request is served until this file completes (unless `SHORTINIT` is set). |

The chain has two notable properties. First, it is **pull-based**: each file explicitly requires the next; there is no autoloader, dispatcher, or framework orchestrating the sequence. Second, once `wp-settings.php` finishes, the entire framework is live — all globals populated, all hooks registered, all plugins loaded, current user resolved.

---

## 2. `index.php`

**Source:** `wordpress/index.php` (17 lines)

`index.php` is the web server's document-root entry point for all front-end requests. Its entire content is two statements:

```php
define( 'WP_USE_THEMES', true );
require __DIR__ . '/wp-blog-header.php';
```

### `WP_USE_THEMES`

Setting this constant to `true` before delegating signals to the bootstrap chain that the final step should load a theme template. This flag is read by `wp-blog-header.php` implicitly (it always calls `template-loader.php`), and by other WordPress files like `wp-trackback.php` or `wp-comments-post.php` that include `wp-blog-header.php` but do not want a full theme render.

The distinction matters: scripts that need WordPress loaded but do not want HTML output set `WP_USE_THEMES` to `false` before requiring `wp-blog-header.php`. `index.php` is the canonical case where themes should load.

### Delegation

`index.php` requires `wp-blog-header.php` from its own directory using `__DIR__`, which is an absolute path. This means `index.php` never has to know about `ABSPATH` — that constant is defined inside `wp-load.php`, which is a downstream file.

`index.php` contains no conditional logic, no function definitions, and no output. Its sole job is to set the theme flag and pass control.

---

## 3. `wp-blog-header.php`

**Source:** `wordpress/wp-blog-header.php` (21 lines)

This file is the dispatcher for front-end page requests. It ensures WordPress loads exactly once, executes the main query, and renders the theme template.

### The `$wp_did_header` Guard

The very first thing this file checks is the global `$wp_did_header`:

```php
if ( ! isset( $wp_did_header ) ) {
    $wp_did_header = true;
    // ... three steps
}
```

This guard exists because `wp-blog-header.php` is designed to be safe to include from anywhere. Several WordPress files (historically: `wp-signup.php`, `wp-activate.php`, themes that include it directly) may require it. Without the guard, the bootstrap chain would execute multiple times in a single PHP request, re-loading plugins, re-running queries, and re-sending headers.

The guard is a plain PHP global variable, not a constant, because it must be visible across all included files in the same process. PHP constants are also global but less idiomatic here since the flag needs to communicate presence, not value.

### Three Steps

When `$wp_did_header` is not already set, the file executes exactly three steps:

**Step 1: Load the WordPress environment**

```php
require_once __DIR__ . '/wp-load.php';
```

This triggers the entire bootstrap chain: config location, wp-settings.php, plugins, theme setup. By the time this line returns, WordPress is fully initialized.

**Step 2: Execute the main query**

```php
wp();
```

`wp()` (defined in `wp-includes/class-wp.php`) parses `$_SERVER['REQUEST_URI']` into query variables, runs `WP_Query`, sets the globals `$wp_query`, `$wp_the_query`, `$posts`, `$post`, handles 404 detection, and issues canonical redirects if needed. The optional argument to `wp()` is an array of additional query variables; `index.php` passes none.

**Step 3: Load the theme template**

```php
require_once ABSPATH . WPINC . '/template-loader.php';
```

`template-loader.php` walks the template hierarchy (single, page, archive, home, index, etc.), finds the first matching template file in the active theme, and includes it.

### Why `wp-blog-header.php` Exists as a Separate File

The separation between `index.php` and `wp-blog-header.php` is deliberate. `index.php` is the web server's document root entry point, while `wp-blog-header.php` is the re-usable bootstrap unit. Any file that needs a bootstrapped WordPress environment — signup forms, activation pages, trackback handlers — can `require wp-blog-header.php` without duplicating the bootstrap logic or worrying about the double-execution problem.

This separation also allows WordPress to be installed in a subdirectory while serving requests from the web root: `index.php` in the web root can simply set `WP_USE_THEMES` and require the `wp-blog-header.php` from the WordPress subdirectory. The guard on `wp-blog-header.php` still works correctly in that configuration.

---

## 4. `wp-load.php`

**Source:** `wordpress/wp-load.php` (106 lines)

`wp-load.php` is responsible for one task: find `wp-config.php` and load it. Everything that happens after this file returns is downstream of configuration.

### Step 1: Define `ABSPATH`

```php
if ( ! defined( 'ABSPATH' ) ) {
    define( 'ABSPATH', __DIR__ . '/' );
}
```

`ABSPATH` is the absolute filesystem path to the WordPress root directory, always with a trailing slash. The guard (`if ! defined`) is present because `wp-config.php` can itself define `ABSPATH` before requiring `wp-settings.php` — in installations where WordPress lives in a subdirectory and the config file is in a parent directory, `ABSPATH` will have been set by `wp-load.php`, and the guard in `wp-config.php` prevents a redefinition error.

All subsequent path constructions throughout WordPress are relative to `ABSPATH`.

### Step 2: Set Initial Error Reporting

```php
error_reporting( E_CORE_ERROR | E_CORE_WARNING | E_COMPILE_ERROR | E_ERROR | E_WARNING | E_PARSE | E_USER_ERROR | E_USER_WARNING | E_RECOVERABLE_ERROR );
```

This is a safe, conservative error reporting baseline that catches real errors and warnings without emitting notices or deprecation warnings. The call is wrapped in `function_exists('error_reporting')` because PHP's `error_reporting` function can be disabled in `php.ini` on locked-down hosting environments; calling it unconditionally would cause a fatal error on such systems.

This baseline is replaced later in `wp-settings.php` by `wp_debug_mode()`, which adjusts error reporting based on `WP_DEBUG`. The reason for setting it here, before config loads, is to catch any errors in `wp-config.php` itself.

### Step 3: Locate `wp-config.php` — Three Cases

The discovery algorithm checks three cases in order:

**Case A: `wp-config.php` exists in `ABSPATH`**

```
if file_exists( ABSPATH . 'wp-config.php' ) → require_once ABSPATH . 'wp-config.php'
```

This is the standard case. The config file is in the WordPress root directory.

**Case B: `wp-config.php` exists one directory above `ABSPATH`, AND `wp-settings.php` does NOT exist one directory above**

```
elseif file_exists( dirname(ABSPATH) . '/wp-config.php' )
    && ! file_exists( dirname(ABSPATH) . '/wp-settings.php' )
  → require_once dirname(ABSPATH) . '/wp-config.php'
```

This supports the security best practice of placing WordPress in a subdirectory (e.g., `/var/www/html/wordpress/`) while keeping the config file in the web root (`/var/www/html/wp-config.php`), where it is not directly web-accessible. The `wp-settings.php` check prevents accidentally picking up a config file that belongs to a different WordPress installation in the parent directory (a "nested installation" scenario where `/` and `/blog/` are both WordPress installs).

The `@` suppressor on `file_exists` in the source suppresses potential permission warnings when checking the parent directory.

**Case C: No config file found**

The fallback path performs a minimal bootstrap sufficient to display an error and redirect:

1. `define('WPINC', 'wp-includes')` — enough to construct paths for the next steps
2. `require version.php` — populates version globals
3. `require compat.php` — PHP polyfills
4. `require load.php` — defines `wp_check_php_mysql_versions`, `wp_fix_server_vars`, `wp_guess_url`, `wp_load_translations_early`, `wp_die`
5. `wp_check_php_mysql_versions()` — die with a version error if PHP/MySQL is too old
6. `wp_fix_server_vars()` — normalize `$_SERVER`
7. `define('WP_CONTENT_DIR', ABSPATH . 'wp-content')` — needed for `wp_guess_url`
8. `require functions.php` — needed for `wp_die` rendering and `wp_guess_url`
9. Compute `$path = wp_guess_url() . '/wp-admin/setup-config.php'`
10. If the current `$_SERVER['REQUEST_URI']` does not already contain the string `'setup-config'`: send a `Location` redirect header to the setup wizard and `exit`
11. If already on the setup-config page: call `wp_load_translations_early()` to enable translated error messages, then `wp_die()` with a detailed HTML error message explaining that `wp-config.php` is missing, with a "Create a Configuration File" button linking back to the setup wizard

The double-check on `REQUEST_URI` prevents an infinite redirect loop if the setup wizard itself somehow hits this code path.

### Step 4: `WPINC` Fallback Define

In Cases A and B, `WPINC` is defined inside `wp-settings.php` (the first thing it does). Case C defines `WPINC` before reaching `wp-settings.php`. In all cases, once past `wp-load.php`, `WPINC` is guaranteed to be `'wp-includes'`.

### Step 5: `wp_fix_server_vars()`

Called in the no-config fallback path (Case C). In the normal paths (A and B), it is called inside `wp-settings.php` at step 14. Normalizes `$_SERVER['PHP_SELF']`, `$_SERVER['SCRIPT_NAME']`, `$_SERVER['SCRIPT_FILENAME']`, and `$_SERVER['PATH_INFO']` to consistent values across Apache, Nginx, IIS, and CGI configurations.

### Step 6: `wp_check_php_mysql_versions()`

Called in the no-config fallback path (Case C). In the normal paths, called inside `wp-settings.php` at step 7. Compares the running PHP version against `$required_php_version` and the available MySQL/MySQLi/PDO extensions against the requirement. Dies with a descriptive error if requirements are not met.

### Step 7: Maintenance Mode Check

In the normal bootstrap (Cases A/B), maintenance mode is checked inside `wp-settings.php` (step 15) via `wp_maintenance()`. That function checks for a `.maintenance` file in `ABSPATH`. If the file exists and was modified within the last 10 minutes, it outputs a 503 maintenance page and exits.

### Step 8: `timer_start()`

Called in `wp-settings.php` at step 16. Records the microtime at bootstrap start. The result is used by `timer_stop()` to produce page generation time, which is often rendered in theme footers via `<!-- {elapsed}s -->`.

### Step 9: `SHORTINIT` Path

`SHORTINIT` is a constant that can be defined in `wp-config.php` or before requiring `wp-load.php`. When it is truthy, `wp-settings.php` returns early after completing only the minimal setup (database, object cache, default filters, multisite initialization). No plugins load, no theme loads, no L10n, no bulk core libraries. This is used by WP-CLI commands and custom scripts that need database access and core functions but not the full WordPress stack.

---

## 5. `wp-config.php` Contract

**Source template:** `wordpress/wp-config-sample.php`

`wp-config.php` is user-authored and never version-controlled. `wp-config-sample.php` is the canonical template. The file defines all environment-specific constants and variables, then ends with:

```php
if ( ! defined( 'ABSPATH' ) ) {
    define( 'ABSPATH', __DIR__ . '/' );
}
require_once ABSPATH . 'wp-settings.php';
```

The `ABSPATH` guard handles the case where WordPress is in a subdirectory and `wp-load.php` already defined `ABSPATH` before finding the config file one directory up.

### Required: Database

| Constant | Default in sample | Type | Purpose |
|---|---|---|---|
| `DB_NAME` | `'database_name_here'` | `string` | MySQL database name |
| `DB_USER` | `'username_here'` | `string` | MySQL username |
| `DB_PASSWORD` | `'password_here'` | `string` | MySQL password |
| `DB_HOST` | `'localhost'` | `string` | MySQL host; may include port (`localhost:3307`) or socket path |
| `DB_CHARSET` | `'utf8mb4'` | `string` | Table character set |
| `DB_COLLATE` | `''` | `string` | Table collation; empty string means use the MySQL default for the charset |

### Required: Table Prefix

```php
$table_prefix = 'wp_';
```

This is a PHP variable, not a constant, because `wpdb` reads it at runtime. Only letters, numbers, and underscores are permitted. Multiple WordPress installations can share one database by using distinct prefixes. Changing this value after installation makes WordPress unable to find its own tables.

### Required: Authentication Keys and Salts

Eight secret strings used in HMAC operations for cookie signing, nonce generation, and password hashing. Each must be unique and random, at least 60 characters long. Changing any of them invalidates all existing login sessions for all users.

| Constant |
|---|
| `AUTH_KEY` |
| `SECURE_AUTH_KEY` |
| `LOGGED_IN_KEY` |
| `NONCE_KEY` |
| `AUTH_SALT` |
| `SECURE_AUTH_SALT` |
| `LOGGED_IN_SALT` |
| `NONCE_SALT` |

The WordPress.org secret-key API (`https://api.wordpress.org/secret-key/1.1/salt/`) generates fresh values on request.

### Required: Debug Flag

| Constant | Default | Purpose |
|---|---|---|
| `WP_DEBUG` | `false` | Master switch for PHP error display. `wp_debug_mode()` reads this in `wp-settings.php`. |

### Optional: Debugging

| Constant | Default | Purpose |
|---|---|---|
| `WP_DEBUG_LOG` | `false` | When `true` (and `WP_DEBUG` is on), errors are written to `wp-content/debug.log`. Can also be an absolute path string to write the log elsewhere. |
| `WP_DEBUG_DISPLAY` | `true` | When `false` (with `WP_DEBUG` on), errors are logged but not displayed on screen. |
| `SCRIPT_DEBUG` | `false` | Forces non-minified `.js` and `.css` files to load. Useful for front-end debugging. |
| `SAVEQUERIES` | `false` | When `true`, all SQL queries are stored in `$wpdb->queries` for inspection. |

### Optional: Performance

| Constant | Default | Purpose |
|---|---|---|
| `WP_CACHE` | `false` | Enables loading of the `advanced-cache.php` drop-in during bootstrap. |
| `WP_MEMORY_LIMIT` | `'40M'` | PHP memory limit for front-end requests. WordPress calls `ini_set('memory_limit', ...)` if the current limit is lower. |
| `WP_MAX_MEMORY_LIMIT` | `'256M'` | PHP memory limit for admin requests. Applied when the admin raises memory during import/export operations. |

### Optional: File System Paths

| Constant | Default | Purpose |
|---|---|---|
| `WP_CONTENT_DIR` | `ABSPATH . 'wp-content'` | Absolute filesystem path to `wp-content`. Override to move content outside the WordPress root. |
| `WP_CONTENT_URL` | Derived from `siteurl` option | Public URL to `wp-content`. Must be updated if `WP_CONTENT_DIR` is moved. |
| `WP_PLUGIN_DIR` | `WP_CONTENT_DIR . '/plugins'` | Absolute path to the plugins directory. |
| `WP_PLUGIN_URL` | `WP_CONTENT_URL . '/plugins'` | Public URL to the plugins directory. |
| `WPMU_PLUGIN_DIR` | `WP_CONTENT_DIR . '/mu-plugins'` | Must-use plugins directory. |
| `WP_LANG_DIR` | `WP_CONTENT_DIR . '/languages'` | Translations directory. |

### Optional: Security

| Constant | Default | Purpose |
|---|---|---|
| `FORCE_SSL_ADMIN` | `false` | Force HTTPS for all admin and login pages. |
| `DISALLOW_FILE_EDIT` | `false` | Removes the theme and plugin file editor from wp-admin. |
| `DISALLOW_FILE_MODS` | `false` | Disables all file modifications: updates, installs, and the file editor. Implies `DISALLOW_FILE_EDIT`. |
| `DISALLOW_UNFILTERED_HTML` | `false` | Strips HTML from even admin-level users. Normally administrators can post unfiltered HTML; this removes that capability. |

### Optional: Updates and Maintenance

| Constant | Default | Purpose |
|---|---|---|
| `WP_AUTO_UPDATE_CORE` | `'minor'` | Controls automatic core updates. `true` = all updates; `'minor'` = security/minor only; `false` = disable. |
| `AUTOMATIC_UPDATER_DISABLED` | `false` | Completely disables the automatic updater. |

### Optional: Multisite

| Constant | Purpose |
|---|---|
| `WP_ALLOW_MULTISITE` | Enables the multisite setup UI in wp-admin (Network Setup page). |
| `MULTISITE` | Marks this as an active multisite installation. Set during network activation. |
| `SUBDOMAIN_INSTALL` | `true` = subdomain-per-site; `false` = subdirectory-per-site. |
| `DOMAIN_CURRENT_SITE` | Primary network domain. |
| `PATH_CURRENT_SITE` | Primary network base path. |
| `SITE_ID_CURRENT_SITE` | Network ID of the primary network (usually `1`). |
| `BLOG_ID_CURRENT_SITE` | Site ID of the primary site (usually `1`). |
| `COOKIE_DOMAIN` | Override the domain used for authentication cookies. |

### Optional: Cron

| Constant | Default | Purpose |
|---|---|---|
| `DISABLE_WP_CRON` | `false` | Prevents WordPress from spawning a cron runner on every page load. Use when running cron externally (e.g., system cron via `wp-cron.php`). |
| `WP_CRON_LOCK_TIMEOUT` | `60` | Seconds to hold the cron execution lock (prevents concurrent cron runs). |
| `ALTERNATE_WP_CRON` | `false` | Use a redirect-based cron method instead of a loopback HTTP request. Useful when loopback requests fail. |

### Optional: Environment and URL

| Constant | Default | Purpose |
|---|---|---|
| `WP_ENVIRONMENT_TYPE` | `'production'` | Declares the environment type. Recognized values: `'local'`, `'development'`, `'staging'`, `'production'`. Used by `wp_get_environment_type()`. |
| `WP_SITEURL` | DB option `siteurl` | Overrides the WordPress address (URL) at the constant level, bypassing the database. |
| `WP_HOME` | DB option `home` | Overrides the site address (URL) at the constant level. |
| `WP_LOCAL_DEV` | — | Informal flag used by some plugins to detect local development. Not formally defined by WordPress core. |

### Optional: Script/Style Loading

| Constant | Default | Purpose |
|---|---|---|
| `CONCATENATE_SCRIPTS` | Auto-detected | Concatenate admin JavaScript files into a single request. |
| `COMPRESS_SCRIPTS` | Auto-detected | Gzip-compress concatenated admin JavaScript. |
| `COMPRESS_CSS` | Auto-detected | Gzip-compress admin CSS. |
| `ENFORCE_GZIP` | `false` | Force gzip encoding even if the browser doesn't advertise support. |

### Optional: Miscellaneous

| Constant | Purpose |
|---|---|
| `SHORTINIT` | Bail out of `wp-settings.php` after minimal setup. No plugins, no theme, no L10n. Used by WP-CLI and specialized scripts. |
| `RELOCATE` | When `true`, auto-updates the `siteurl` database option to match the current request URL. Used when moving a site to a new domain. |
| `FS_METHOD` | Filesystem abstraction method: `'direct'`, `'ftpext'`, `'ftpsockets'`, `'ssh2'`. Normally auto-detected. |

---

## 6. `wp-settings.php` Bootstrap Sequence

**Source:** `wordpress/wp-settings.php` (764 lines)

This file initializes every WordPress subsystem. Every step is unconditional unless noted; the order is not arbitrary — each step depends on the ones before it.

### Phase 1: Core Constants and Minimal Libraries (Steps 1–10)

**Step 1: Define `WPINC`**

```php
define( 'WPINC', 'wp-includes' );
```

Sets the name of the includes directory. All subsequent `require` calls for core files use `ABSPATH . WPINC . '/'` as their base. Defined as the very first action so that every file loaded by this script can construct correct paths.

**Step 2: Declare version globals**

```php
global $wp_version, $wp_db_version, $tinymce_version,
       $required_php_version, $required_php_extensions,
       $required_mysql_version, $wp_local_package;
```

These globals must be declared before `version.php` populates them so that PHP's global scope rules take effect.

**Step 3: Load `version.php`**

```
require ABSPATH . WPINC . '/version.php'
```

Populates: `$wp_version` (e.g. `'6.5.0'`), `$wp_db_version` (integer schema version), `$tinymce_version`, `$required_php_version` (minimum PHP version string), `$required_php_extensions` (array of extension names), `$required_mysql_version`, and `$wp_local_package` (locale of the distributed package).

**Step 4: Load `compat-utf8.php`**

UTF-8 compatibility layer. Provides a `mbstring` polyfill for environments where the `mbstring` PHP extension is not available.

**Step 5: Load `compat.php`**

PHP function compatibility shims. Polyfills functions introduced in newer PHP versions that WordPress uses internally, so WordPress can run on older PHP releases down to `$required_php_version`.

**Step 6: Load `load.php`**

Defines foundational functions that must exist before any other code runs:
- `wp_check_php_mysql_versions()` — version gate
- `wp_fix_server_vars()` — `$_SERVER` normalization
- `wp_maintenance()` — maintenance mode check
- `wp_debug_mode()` — error reporting configuration
- `timer_start()` / `timer_stop()` — request timing
- `wp_set_lang_dir()` — language directory setup
- `wp_not_installed()` — install check
- `require_wp_db()` — database class loader
- `wp_start_object_cache()` — object cache starter
- `wp_set_wpdb_vars()` — `$wpdb` table name setup
- Various shutdown and init helpers

**Step 7: `wp_check_php_mysql_versions()`**

Immediately after loading `load.php`, version requirements are verified. If the running PHP version is below `$required_php_version`, execution stops with an HTML error page. If neither the `mysqli` extension nor a `db.php` drop-in is available, execution stops with a database extension error.

**Step 8: Load error protection classes**

Six class files are loaded to enable the fatal error handler before any further code runs:

- `class-wp-paused-extensions-storage.php` — persists a list of plugins/themes that caused fatal errors, so they can be paused
- `class-wp-exception.php` — WordPress's own exception class (extends `\Exception`)
- `class-wp-fatal-error-handler.php` — the shutdown handler that catches fatal errors and shows the recovery UI
- `class-wp-recovery-mode-cookie-service.php` — reads/writes the recovery mode authentication cookie
- `class-wp-recovery-mode-key-service.php` — generates and verifies the recovery mode link token
- `class-wp-recovery-mode-link-service.php` — constructs and validates the recovery mode URL
- `class-wp-recovery-mode-email-service.php` — sends the recovery mode email to the admin
- `class-wp-recovery-mode.php` — the top-level orchestrator for recovery mode sessions

**Step 9: Load `error-protection.php`**

Defines `wp_register_fatal_error_handler()` and `wp_recovery_mode()` (the singleton accessor). Wires the error handler classes together.

**Step 10: Load `default-constants.php` and `plugin.php`**

`default-constants.php` defines `wp_initial_constants()`, `wp_functionality_constants()`, `wp_templating_constants()`, and `wp_set_template_globals()` — the functions that will set all the feature-flag constants throughout the bootstrap.

`plugin.php` defines the hook engine: `add_filter`, `apply_filters`, `add_action`, `do_action`, and all related functions. This is the earliest point at which hooks can be used. Immediately after loading, if `$wp_filter` is already populated (e.g. by a very early mu-plugin or a config-time hook), `WP_Hook::build_preinitialized_hooks()` converts the plain-array entries to proper `WP_Hook` instances.

---

### Phase 2: Early Initialization (Steps 11–17)

**Step 11: `wp_initial_constants()`**

Sets the first wave of constants. If not already defined in `wp-config.php`, defines:
- `WP_MEMORY_LIMIT` (default `'40M'`)
- `WP_MAX_MEMORY_LIMIT` (default `'256M'`)
- `WP_DEBUG` (default `false`)
- `SCRIPT_DEBUG` (default `false`)
- `WP_CONTENT_DIR` (default `ABSPATH . 'wp-content'`)
- `WP_CACHE` (default `false`)

Also raises PHP's `memory_limit` to `WP_MEMORY_LIMIT` if the current limit is lower.

**Step 12: `wp_register_fatal_error_handler()`**

Registers the fatal error shutdown handler via PHP's `register_shutdown_function`. From this point onward, fatal errors anywhere in WordPress will be caught by the handler, which decides whether to show a user-facing error page or initiate recovery mode. This is registered as early as possible — before any plugin code or complex file loading — so that errors anywhere downstream are caught.

**Step 13: `date_default_timezone_set('UTC')`**

All dates and times throughout WordPress are calculated in UTC. Timezone conversion to the site's configured timezone happens at display time, never at storage time. This call ensures that PHP's date functions, which are timezone-sensitive, operate on UTC regardless of the server's system timezone setting.

**Step 14: `wp_fix_server_vars()`**

Normalizes `$_SERVER` variables. Ensures `$_SERVER['PHP_SELF']`, `$_SERVER['SCRIPT_NAME']`, `$_SERVER['SCRIPT_FILENAME']`, and `$_SERVER['PATH_INFO']` contain consistent values across different web server and PHP deployment configurations (Apache mod_php, Nginx + PHP-FPM, IIS, CGI). Must run before any code that reads these variables to construct URLs.

**Step 15: `wp_maintenance()`**

Checks for the presence of `ABSPATH . '.maintenance'`. If that file exists and its `filemtime` is within 600 seconds (10 minutes) of the current time, WordPress is considered to be in maintenance mode. The function reads the file, which may contain a PHP variable `$upgrading` (a timestamp). Outputs a 503 Service Unavailable page with `Retry-After: 600` header and exits. The `.maintenance` file is created automatically during core/plugin/theme updates and removed when the update completes.

**Step 16: `timer_start()`**

Records `microtime(true)` into a global variable. Used later by `timer_stop()` to compute and report page generation time. Placed here rather than at the very top because it only makes sense to time the portion of bootstrap that happens after configuration is loaded.

**Step 17: `wp_debug_mode()`**

Configures PHP error reporting based on `WP_DEBUG`:

- `WP_DEBUG = true`:
  - `error_reporting( E_ALL )` — report every error type
  - If `WP_DEBUG_DISPLAY` is not `false`: `ini_set('display_errors', 1)` — show errors on screen
  - If `WP_DEBUG_LOG` is `true`: `ini_set('log_errors', 1)`, `ini_set('error_log', WP_CONTENT_DIR . '/debug.log')` — also write to log file
  - If `WP_DEBUG_LOG` is a string path: use that path as the log file
- `WP_DEBUG = false`:
  - `error_reporting( E_CORE_ERROR | E_CORE_WARNING | E_COMPILE_ERROR | E_ERROR | E_WARNING | E_PARSE | E_USER_ERROR | E_USER_WARNING | E_RECOVERABLE_ERROR )` — the same baseline as `wp-load.php`
  - `ini_set('display_errors', 0)` — suppress display on production

---

### Phase 3: Caching Layer (Step 18)

**Step 18: Load `advanced-cache.php` drop-in**

```
if ( WP_CACHE && apply_filters('enable_loading_advanced_cache_dropin', true) )
    && file_exists( WP_CONTENT_DIR . '/advanced-cache.php' )
  → include WP_CONTENT_DIR . '/advanced-cache.php'
```

The `enable_loading_advanced_cache_dropin` filter is applied before the drop-in loads. It defaults to `true` but allows non-web runtimes (e.g. WP-CLI, PHPUnit tests) to suppress loading the page cache. The filter runs before any plugins are loaded; only `plugin.php` is available to have registered callbacks, which means only callbacks registered in `wp-config.php` or by the pre-initialization hook mechanism can influence this.

After the drop-in loads, `WP_Hook::build_preinitialized_hooks($wp_filter)` is called if `$wp_filter` is non-empty. This allows the advanced cache drop-in to have registered hooks using the plain-array pre-initialization format defined in the hook engine specification.

The advanced cache drop-in can serve a cached response and `exit`, preventing the remainder of bootstrap from running at all. This is intentional: full-page caching must happen before any database queries.

---

### Phase 4: Language Directory (Step 19)

**Step 19: `wp_set_lang_dir()`**

Defines `WP_LANG_DIR` if it was not already set in `wp-config.php`. Default value: `WP_CONTENT_DIR . '/languages'`. The function also falls back to `ABSPATH . WPINC . '/languages'` if no content directory has been configured. This constant is needed by the L10n system loaded in Phase 12.

---

### Phase 5: Core Utility Classes (Step 20)

**Step 20: Early library files**

A set of fundamental utility classes and libraries that all subsequent code depends on:

- `class-wp-list-util.php` — array manipulation utilities (`WP_List_Util`)
- `class-wp-token-map.php` — fast token lookup map (`WP_Token_Map`)
- `utf8.php` — UTF-8 string utilities
- `formatting.php` — sanitization, escaping, `wpautop`, `wptexturize`, and all string formatting functions. Loaded this early because nearly every other system uses sanitize/escape functions.
- `meta.php` — the metadata API (`get_metadata`, `update_metadata`, `delete_metadata`)
- `functions.php` — general WordPress functions: `wp_die`, `wp_json_encode`, `wp_parse_args`, `wp_list_pluck`, `absint`, etc.
- `class-wp-meta-query.php` — `WP_Meta_Query`, used by `WP_Query`, `WP_User_Query`, `WP_Comment_Query`
- `class-wp-matchesmapregex.php` — regex matching utility used by the rewrite system
- `class-wp.php` — the `WP` class; parses request URLs and dispatches to `WP_Query`
- `class-wp-error.php` — `WP_Error`, the standard error-return object used throughout WordPress
- `pomo/mo.php` — MO translation file parser (Gettext binary format)
- Five L10n class files in `wp-includes/l10n/`: `WP_Translation_Controller`, `WP_Translations`, `WP_Translation_File`, `WP_Translation_File_MO`, `WP_Translation_File_PHP`

---

### Phase 6: Database (Steps 21–23)

**Step 21: `require_wp_db()`**

Loads the database abstraction layer. If `WP_CONTENT_DIR . '/db.php'` exists, that drop-in is loaded instead of the built-in `class-wpdb.php`. If the drop-in does not define `$wpdb`, or if no drop-in exists, `class-wpdb.php` is loaded and `$wpdb = new wpdb(DB_USER, DB_PASSWORD, DB_NAME, DB_HOST)` is instantiated. The `wpdb` instance connects to MySQL lazily (on first query), not at construction time.

**Step 22: Assign `$table_prefix` global**

```php
$GLOBALS['table_prefix'] = $table_prefix;
```

The `$table_prefix` variable defined in `wp-config.php` is made globally accessible. `wpdb` has not yet been given this prefix.

**Step 23: `wp_set_wpdb_vars()`**

Configures `$wpdb` with the table prefix and sets all the named table properties:
- `$wpdb->posts`, `$wpdb->postmeta`, `$wpdb->users`, `$wpdb->usermeta`
- `$wpdb->options`, `$wpdb->terms`, `$wpdb->term_taxonomy`, `$wpdb->term_relationships`
- `$wpdb->comments`, `$wpdb->commentmeta`
- `$wpdb->links`, `$wpdb->blog_versions`, `$wpdb->site`
- All multisite tables
- Global tables (shared across multisite)

After this step, code can construct table names using `$wpdb->posts` etc.

---

### Phase 7: Object Cache (Step 24)

**Step 24: `wp_start_object_cache()`**

Starts the object cache. If `WP_CONTENT_DIR . '/object-cache.php'` exists, that drop-in is loaded. The drop-in may define its own cache backend (Memcached, Redis, APCu, etc.). If no drop-in exists, the built-in `WP_Object_Cache` class (`class-wp-object-cache.php`) is loaded, which provides an in-memory (per-request) cache only.

After the cache starts, `$GLOBALS['wp_object_cache']` is set and all `wp_cache_*` functions are available.

---

### Phase 8: Default Filters (Step 25)

**Step 25: Load `default-filters.php`**

Registers all of WordPress's own core action and filter hooks. This is a large file (~500 lines) that adds core callbacks to hooks like `the_title`, `the_content`, `save_post`, `wp_insert_post_data`, `sanitize_*`, etc. After this step, the hook registry contains all core callbacks. Plugin hooks are added in Phase 18.

---

### Phase 9: Multisite (Steps 26–27)

**Step 26: Multisite initialization (if `is_multisite()`)**

If `MULTISITE` is defined and truthy, four files are loaded:
- `class-wp-site-query.php` — `WP_Site_Query` for querying sites in the network
- `class-wp-network-query.php` — `WP_Network_Query` for querying networks
- `ms-blogs.php` — multisite blog-level functions
- `ms-settings.php` — sets `$blog_id` for the current site, configures `$wpdb` table names for the current site's tables, and verifies the site is active

**Step 27: MULTISITE false define (if single-site)**

```php
elseif ( ! defined( 'MULTISITE' ) ) {
    define( 'MULTISITE', false );
}
```

Ensures `MULTISITE` is always defined after this point. Code throughout WordPress can check `is_multisite()` (which checks this constant) without fear of an undefined-constant notice.

---

### Phase 10: Shutdown Hook (Step 28)

**Step 28: `register_shutdown_function('shutdown_action_hook')`**

Registers `shutdown_action_hook` as a PHP shutdown function. When the PHP process ends (normally or due to a non-fatal error), this function fires the `shutdown` action hook. Plugins use `shutdown` for cleanup tasks.

---

### Phase 11: SHORTINIT Bail Point (Step 29)

**Step 29: SHORTINIT check**

```php
if ( SHORTINIT ) {
    return false;
}
```

If `SHORTINIT` is truthy, `wp-settings.php` returns `false` immediately. At this point the following are available: database (`$wpdb`), object cache, default filters, and basic utility functions. Nothing else — no plugins, no theme, no L10n, no roles, no query objects.

This escape hatch is used by WP-CLI commands that need only a minimal environment, and by any custom script that calls `define('SHORTINIT', true)` before requiring `wp-load.php`.

---

### Phase 12: Localization (Steps 30–33)

**Step 30: Load `l10n.php`**

The full localization function library: `__()`, `_e()`, `_n()`, `_x()`, `esc_html__()`, `load_textdomain()`, `load_plugin_textdomain()`, `load_theme_textdomain()`, `get_locale()`, etc.

**Step 31: Load `class-wp-textdomain-registry.php`**

`WP_Textdomain_Registry` tracks which text domain belongs to which plugin or theme directory. Supports just-in-time (JIT) translation loading.

**Step 32: Load `class-wp-locale.php`**

`WP_Locale` stores locale-specific data: month names, day names, AM/PM strings, number formatting separators.

**Step 33: Load `class-wp-locale-switcher.php`**

`WP_Locale_Switcher` provides `switch_to_locale()` and `restore_current_locale()`, used for per-request or per-block locale switching (e.g., rendering a block in its editor locale).

---

### Phase 13: Installation Check (Step 34)

**Step 34: `wp_not_installed()`**

Queries the database to check whether WordPress is installed. Specifically, checks whether the `options` table (or its multisite equivalent) is reachable and contains a `siteurl` row. If not, redirects the browser to `wp-admin/install.php`. This check runs every request; the redirect is cheap because it is a 302 and the install page itself handles the case where WordPress is already installed.

---

### Phase 14: Bulk Core Library Load (Step 35)

**Step 35: Load ~100 core files**

The largest single step: loads every remaining core library. The files are required in dependency order. Major subsystems, in order:

**Walker and AJAX:**
`class-wp-walker.php`, `class-wp-ajax-response.php`

**Capabilities and Users:**
`capabilities.php`, `class-wp-roles.php`, `class-wp-role.php`, `class-wp-user.php`

**Query:**
`class-wp-query.php`, `query.php`, `class-wp-date-query.php`

**Theme and Templates:**
`theme.php`, `class-wp-theme.php`, `class-wp-theme-json-schema.php`, `class-wp-theme-json-data.php`, `class-wp-theme-json.php`, `class-wp-theme-json-resolver.php`, `class-wp-duotone.php`, `global-styles-and-settings.php`, `class-wp-block-template.php`, `class-wp-block-templates-registry.php`, `block-template-utils.php`, `block-template.php`, `theme-templates.php`, `theme-previews.php`, `template.php`

**HTTPS and User Requests:**
`https-detection.php`, `https-migration.php`, `class-wp-user-request.php`

**Users and Sessions:**
`user.php`, `class-wp-user-query.php`, `class-wp-session-tokens.php`, `class-wp-user-meta-session-tokens.php`

**Template Tags:**
`general-template.php`, `link-template.php`, `author-template.php`, `robots-template.php`

**Posts:**
`post.php`, `class-walker-page.php`, `class-walker-page-dropdown.php`, `class-wp-post-type.php`, `class-wp-post.php`, `post-template.php`, `revision.php`, `post-formats.php`, `post-thumbnail-template.php`

**Taxonomy:**
`category.php`, `class-walker-category.php`, `class-walker-category-dropdown.php`, `category-template.php`, `taxonomy.php`, `class-wp-taxonomy.php`, `class-wp-term.php`, `class-wp-term-query.php`, `class-wp-tax-query.php`

**Comments:**
`comment.php`, `class-wp-comment.php`, `class-wp-comment-query.php`, `class-walker-comment.php`, `comment-template.php`

**Rewrite:**
`rewrite.php`, `class-wp-rewrite.php`

**Feeds, Bookmarks, KSES, Cron, Deprecated:**
`feed.php`, `bookmark.php`, `bookmark-template.php`, `kses.php`, `cron.php`, `deprecated.php`

**Script/Style Loader and Update:**
`script-loader.php`, `update.php`, `canonical.php`, `shortcodes.php`

**Embed and oEmbed:**
`embed.php`, `class-wp-embed.php`, `class-wp-oembed.php`, `class-wp-oembed-controller.php`

**Media and HTTP:**
`media.php`, `http.php`

**HTML API:**
`html-api/` — 11 files including the HTML5 tag processor (`WP_HTML_Tag_Processor`) and full HTML5 parser (`WP_HTML_Processor`), plus `class-wp-block-processor.php`

**HTTP Transport Classes:**
`class-wp-http.php`, `class-wp-http-streams.php`, `class-wp-http-curl.php`, `class-wp-http-proxy.php`, `class-wp-http-cookie.php`, `class-wp-http-encoding.php`, `class-wp-http-response.php`, `class-wp-http-requests-response.php`, `class-wp-http-requests-hooks.php`

**Widgets and Navigation:**
`widgets.php`, `class-wp-widget.php`, `class-wp-widget-factory.php`, `nav-menu-template.php`, `nav-menu.php`, `admin-bar.php`

**Application Passwords and Abilities:**
`class-wp-application-passwords.php`, `abilities-api/` (4 files), `abilities-api.php`, `abilities.php`

**REST API:**
`rest-api.php`, `rest-api/class-wp-rest-server.php`, `rest-api/class-wp-rest-response.php`, `rest-api/class-wp-rest-request.php`, then ~40 endpoint controllers, 5 meta field classes, and 4 search handler classes

**Sitemaps:**
`sitemaps.php` and 9 sitemaps class files

**Block System:**
`class-wp-block-bindings-source.php`, `class-wp-block-bindings-registry.php`, `class-wp-block-editor-context.php`, `class-wp-block-type.php`, `class-wp-block-pattern-categories-registry.php`, `class-wp-block-patterns-registry.php`, `class-wp-block-styles-registry.php`, `class-wp-block-type-registry.php`, `class-wp-block.php`, `class-wp-block-list.php`, `class-wp-block-metadata-registry.php`, `class-wp-block-parser-block.php`, `class-wp-block-parser-frame.php`, `class-wp-block-parser.php`, `class-wp-classic-to-block-menu-converter.php`, `class-wp-navigation-fallback.php`, `block-bindings.php`, `block-bindings/` (4 source files), `blocks.php`, `blocks/index.php`, `block-editor.php`, `block-patterns.php`

**Block Supports:**
`class-wp-block-supports.php` and 15 block-supports files (align, colors, typography, border, layout, spacing, duotone, shadow, etc.)

**Style Engine:**
`style-engine.php` and 5 style engine class files

**Fonts:**
`fonts/` (5 class files), `fonts.php`

**Script Modules, Interactivity API, Plugin Dependencies, Speculative Loading:**
`class-wp-script-modules.php`, `script-modules.php`, `interactivity-api/` (3 files), `class-wp-plugin-dependencies.php`, `class-wp-url-pattern-prefixer.php`, `class-wp-speculation-rules.php`, `speculative-loading.php`

After this step, two hooks are added: `add_action('after_setup_theme', [wp_script_modules(), 'add_hooks'])` and `add_action('after_setup_theme', [wp_interactivity(), 'add_hooks'])`.

---

### Phase 15: Singletons (Step 36)

**Step 36: Instantiate early singletons**

```php
$GLOBALS['wp_embed'] = new WP_Embed();
$GLOBALS['wp_textdomain_registry'] = new WP_Textdomain_Registry();
$GLOBALS['wp_textdomain_registry']->init();
```

`WP_Embed` is instantiated now (before plugins load) so that plugins can register oEmbed providers and handlers on the `init` hook. `WP_Textdomain_Registry` is initialized to begin tracking text domain registration before mu-plugins load.

---

### Phase 16: Multisite Functions (Step 37)

**Step 37: Multisite-specific libraries (if multisite)**

If `is_multisite()`: load `ms-functions.php` (multisite API functions), `ms-default-filters.php` (multisite-specific default hook registrations), `ms-deprecated.php` (multisite deprecated function stubs).

---

### Phase 17: Plugin Directory Constants (Step 38)

**Step 38: `wp_plugin_directory_constants()` and `$wp_plugin_paths`**

`wp_plugin_directory_constants()` defines the plugin path constants if not already set in `wp-config.php`:
- `WP_PLUGIN_DIR`, `WP_PLUGIN_URL`
- `WPMU_PLUGIN_DIR`, `WPMU_PLUGIN_URL`
- `PLUGINDIR` (legacy)

`$GLOBALS['wp_plugin_paths'] = []` initializes the registry of real plugin paths, used by `wp_register_plugin_realpath()` and `plugin_basename()` to support symlinked plugins.

---

### Phase 18: Must-Use and Network Plugins (Steps 39–42)

**Step 39: Load must-use plugins**

```
foreach wp_get_mu_plugins() as $mu_plugin:
    include_once $mu_plugin
    do_action('mu_plugin_loaded', $mu_plugin)
```

`wp_get_mu_plugins()` returns all `.php` files in `WPMU_PLUGIN_DIR`, sorted alphabetically. Must-use plugins cannot be deactivated through the UI; they always load. Each fires `mu_plugin_loaded` with its file path after loading.

**Step 40: Load network-activated plugins (if multisite)**

```
foreach wp_get_active_network_plugins() as $network_plugin:
    wp_register_plugin_realpath($network_plugin)
    include_once $network_plugin
    do_action('network_plugin_loaded', $network_plugin)
```

Network-activated plugins are activated for all sites in the network. They load before site-level active plugins and before `muplugins_loaded`.

**Step 41: `do_action('muplugins_loaded')`**

Fires after all must-use and network-activated plugins have loaded. Site-level active plugins have not yet loaded.

**Step 42: Recovery mode initialization (if single-site)**

If not multisite and the fatal error handler is enabled: `wp_recovery_mode()->initialize()`. This checks whether a recovery mode cookie is present in the request, verifies it against the stored key, and if valid, enters recovery mode (which disables the paused plugins list, allowing all plugins to load for debugging).

This is placed here — after mu-plugins, before regular plugins — because mu-plugins may register recovery mode callbacks, and the recovery mode initialization must happen before regular plugins are loaded (in case those plugins are the ones causing the fatal error).

---

### Phase 19: Cookie and SSL Constants (Steps 43–45)

**Step 43: `ms_cookie_constants()` (if multisite)**

Defines multisite-specific cookie constants: `COOKIEPATH`, `SITECOOKIEPATH`, and `ADMIN_COOKIE_PATH` for the network.

**Step 44: `wp_cookie_constants()`**

Defines `COOKIEHASH` (an MD5 of the site URL), `USER_COOKIE`, `PASS_COOKIE`, `AUTH_COOKIE`, `SECURE_AUTH_COOKIE`, `LOGGED_IN_COOKIE`, `TEST_COOKIE`, `COOKIEPATH`, `SITECOOKIEPATH`, `ADMIN_COOKIE_PATH`, `PLUGINS_COOKIE_PATH`. These constants are used by all cookie-reading and cookie-writing code. Must be defined after multisite settings are loaded (because multisite changes the siteurl that `COOKIEHASH` is derived from).

**Step 45: `wp_ssl_constants()`**

Defines `FORCE_SSL_ADMIN` (if not already set in `wp-config.php`) based on whether the current request is on HTTPS. Also defines `FORCE_SSL_LOGIN` (deprecated alias).

---

### Phase 20: Common Globals (Step 46)

**Step 46: Load `vars.php`**

Sets browser-detection globals and the `$pagenow` variable:
- `$pagenow` — the basename of the current PHP file (e.g. `'index.php'`, `'edit.php'`, `'admin-ajax.php'`)
- `$is_iphone`, `$is_chrome`, `$is_safari`, `$is_NS4`, `$is_opera`, `$is_macIE`, `$is_winIE`, `$is_gecko`, `$is_lynx`, `$is_IE`, `$is_edge` — browser detection flags (deprecated for new use but maintained for compatibility)
- `$is_apache`, `$is_nginx`, `$is_iis7`, `$is_IIS` — web server detection flags

---

### Phase 21: Initial Registrations (Steps 47–50)

**Step 47: `create_initial_taxonomies()`**

Registers the built-in taxonomies before plugins load so that plugins can depend on them in their `init` callbacks:
- `category` (hierarchical, for posts)
- `post_tag` (non-hierarchical, for posts)
- `nav_menu` (for navigation menu objects)
- `link_category` (for blogroll links)
- `post_format` (for post formats)

These taxonomies are re-registered on the `init` hook. The pre-`init` registration here is for mu-plugins and network plugins that need them available now.

**Step 48: `create_initial_post_types()`**

Registers the built-in post types:
- `post`, `page`, `attachment`, `revision`, `nav_menu_item`
- `custom_css`, `customize_changeset` (Customizer)
- `oembed_cache`, `user_request`
- `wp_block` (Reusable blocks), `wp_template`, `wp_template_part`, `wp_global_styles`
- `wp_navigation` (Navigation menus), `wp_font_family`, `wp_font_face`

Like taxonomies, post types are also re-registered on `init`.

**Step 49: `wp_start_scraping_edited_file_errors()`**

Registers a mechanism to detect fatal errors introduced by file edits through the theme/plugin editor. If a `wp_scratchpad_*` query variable is present, WordPress forks a request to detect errors before saving the edit.

**Step 50: `register_theme_directory(get_theme_root())`**

Registers the default theme directory (usually `WP_CONTENT_DIR . '/themes'`) with the theme registry. Additional theme directories can be registered by plugins using `register_theme_directory()`.

---

### Phase 22: Active Plugins (Steps 51–52)

**Step 51: Load `wp-admin/includes/plugin.php`**

Loads `get_plugin_data()` and related plugin header functions. Required here because the active plugin loader (Step 52) reads each plugin's text domain from its file header.

**Step 52: Load active plugins**

```
foreach wp_get_active_and_valid_plugins() as $plugin:
    wp_register_plugin_realpath($plugin)
    register plugin's text domain path in WP_Textdomain_Registry
    include_once $plugin
    do_action('plugin_loaded', $plugin)
```

`wp_get_active_and_valid_plugins()` reads the `active_plugins` option from the database and filters out invalid entries (plugins whose files no longer exist). For each valid plugin: its real path is registered (for symlink support), its text domain directory is registered in `WP_Textdomain_Registry` (for JIT translation loading), then the file is included, and `plugin_loaded` fires with the plugin's path.

---

### Phase 23: Pluggable Functions (Step 53)

**Step 53: Load `pluggable.php` and `pluggable-deprecated.php`**

`pluggable.php` defines functions that plugins are explicitly permitted to override by defining them before this file loads. These include: `wp_mail()`, `wp_authenticate()`, `wp_hash_password()`, `wp_check_password()`, `wp_generate_password()`, `wp_rand()`, `wp_set_auth_cookie()`, `wp_clear_auth_cookie()`, `wp_validate_auth_cookie()`, `wp_get_current_user()`, `get_userdata()`, `get_user_by()`, `cache_users()`, `send_confirmation_on_profile_email()`, `send_password_change_email()`.

Each function in `pluggable.php` is wrapped in `if ( ! function_exists(...) )`. Plugins can therefore completely replace these functions by defining them during their load (Step 52), which happens before this file. `pluggable-deprecated.php` follows the same pattern for functions that have been deprecated.

---

### Phase 24: Post-Plugin Setup (Steps 54–56)

**Step 54: `wp_set_internal_encoding()`**

Sets PHP's `mbstring` internal encoding to match the blog's configured charset (`get_option('blog_charset')`). This ensures that `mb_*` string functions operate on the same encoding as the database content.

**Step 55: `wp_cache_postload()` (if applicable)**

If `WP_CACHE` is true and the function `wp_cache_postload` exists (defined by the `object-cache.php` drop-in), it is called. Object cache drop-ins use `wp_cache_postload` to perform initialization that requires WordPress functions (which are not yet available when `wp_start_object_cache()` runs at Step 24).

**Step 56: `do_action('plugins_loaded')`**

Fires after all active plugins and pluggable functions are loaded. The full plugin API surface is available. This is the first hook that regular plugins can depend on for inter-plugin communication — e.g. plugin A checking whether plugin B is active.

---

### Phase 25: Magic Quotes and Request Setup (Steps 57–59)

**Step 57: `wp_functionality_constants()`**

Sets feature-flag constants that depend on the options database or on what plugins have defined. Must run after plugins load because plugins may define these constants. Examples: `CONCATENATE_SCRIPTS`, `COMPRESS_SCRIPTS`, `COMPRESS_CSS`.

**Step 58: `wp_magic_quotes()`**

Applies `wp_slash()` (which escapes single quotes with backslashes) to `$_GET`, `$_POST`, `$_COOKIE`, and `$_SERVER`. This is a legacy compatibility layer: WordPress's string-processing functions and SQL quoting assume that superglobal values have been "magic-quoted". Removing this mechanism would break many plugins and themes that depend on it.

`$_REQUEST` is rebuilt as a merge of `$_GET` and `$_POST` after slashing. Note: `$_FILES` is not modified.

**Step 59: `do_action('sanitize_comment_cookies')`**

Fires to allow plugins to sanitize the comment author cookies (`comment_author`, `comment_author_email`, `comment_author_url`) before they are read by the comment system. These cookies are set by WordPress when a visitor posts a comment, and their values are pre-filled into comment forms on return visits.

---

### Phase 26: Core Globals (Steps 60–65)

**Step 60: `$GLOBALS['wp_the_query'] = new WP_Query()`**

Creates the canonical `WP_Query` instance. This is the object that `wp()` will call to execute the main database query.

**Step 61: `$GLOBALS['wp_query'] = $GLOBALS['wp_the_query']`**

Sets `$wp_query` to point to the same object as `$wp_the_query`. `$wp_query` is the variable that most code reads. `$wp_the_query` is the protected reference; `query_posts()` replaces `$wp_query` with a new query but leaves `$wp_the_query` pointing to the original. `wp_reset_query()` restores `$wp_query = $wp_the_query`.

**Step 62: `$GLOBALS['wp_rewrite'] = new WP_Rewrite()`**

Instantiates the rewrite engine. `WP_Rewrite` reads rewrite rules from the database on construction. After this point, URL routing decisions can be made.

**Step 63: `$GLOBALS['wp'] = new WP()`**

Creates the main `WP` environment object. `WP::init()` (called later in Step 72) sets the current user. `WP::main()` (called by `wp()` in `wp-blog-header.php`) executes the main query.

**Step 64: `$GLOBALS['wp_widget_factory'] = new WP_Widget_Factory()`**

Creates the widget factory registry. Widgets register themselves with this object during `widgets_init` (which is called on `init`).

**Step 65: `$GLOBALS['wp_roles'] = new WP_Roles()`**

Instantiates the roles system, which loads role definitions from the `user_roles` option. After this point, capability checks work correctly.

---

### Phase 27: Theme Loading (Steps 66–74)

**Step 66: `do_action('setup_theme')`**

Fires before any theme files load. Plugins that need to run before the theme (e.g. to change the active theme programmatically) hook here. Child theme selection can still be changed at this hook.

**Step 67: `wp_templating_constants()`**

Defines `TEMPLATEPATH` (absolute path to the active theme directory) and `STYLESHEETPATH` (absolute path to the stylesheet/child theme directory). These differ only when a child theme is active.

**Step 68: `wp_set_template_globals()`**

Sets `$wp_theme_directories` (the registered theme directory list) and other template-related globals.

**Step 69: `load_default_textdomain()`**

Loads the WordPress core translation file for the current locale. The locale is determined by `get_locale()`, which reads the `WPLANG` constant (if defined in `wp-config.php`) or the `WPLANG` option from the database.

**Step 70: Load locale PHP file**

```php
$locale_file = WP_LANG_DIR . "/$locale.php";
if ( validate_file($locale) === 0 && is_readable($locale_file) ) {
    require $locale_file;
}
```

Some locales ship a PHP file alongside their MO translation file, containing locale-specific overrides for date/time formatting strings. `validate_file()` prevents path traversal attacks.

**Step 71: `$GLOBALS['wp_locale'] = new WP_Locale()`**

Instantiates `WP_Locale`, which populates locale-specific date/time strings (month names, day names, AM/PM) in the current language.

**Step 72: `$GLOBALS['wp_locale_switcher'] = new WP_Locale_Switcher(); ->init()`**

Creates and initializes the locale switcher. After `->init()`, the `switch_to_locale` and `restore_current_locale` functions are available for use by plugins and REST API locale-switching.

**Step 73: Load active theme `functions.php` files**

```
foreach wp_get_active_and_valid_themes() as $theme:
    wp_get_theme(basename($theme))->load_textdomain()
    if file_exists($theme . '/functions.php'):
        include $theme . '/functions.php'
```

`wp_get_active_and_valid_themes()` returns an ordered list: parent theme first, then child theme. Each theme's text domain is loaded via `load_textdomain()`. The parent theme's `functions.php` runs before the child theme's. This order is intentional: the parent defines its functions (often wrapped in `if ! function_exists`), and the child overrides or extends them.

**Step 74: `do_action('after_setup_theme')`**

Fires after theme `functions.php` files have executed. Theme features registered in `functions.php` (via `add_theme_support()`) are available from this point. Plugin code that should run after the theme is set up (but before `init`) hooks here. The `wp_script_modules()->add_hooks()` and `wp_interactivity()->add_hooks()` registered in Step 35 fire here.

---

### Phase 28: Site Health (Step 75)

**Step 75: `WP_Site_Health::get_instance()`**

Loads `WP_Site_Health` (from `wp-admin/includes/class-wp-site-health.php` if not already loaded) and calls `get_instance()` to register its cron events. This ensures that scheduled health checks (background loopback tests, directory size calculations) are registered on every request, not just when the admin visits the Site Health screen.

---

### Phase 29: Current User (Step 76)

**Step 76: `$GLOBALS['wp']->init()`**

Calls `WP::init()`, which calls `wp_get_current_user()`. This resolves the current user from the authentication cookie, sets `$GLOBALS['current_user']`, and populates the user's capabilities. After this step, `is_user_logged_in()`, `current_user_can()`, and `wp_get_current_user()` return correct results.

---

### Phase 30: Final Hooks (Steps 77–79)

**Step 77: `do_action('init')`**

The primary hook for initialization code. At this point: all plugins are loaded, the theme is set up, the current user is known, and all subsystems are fully initialized. Plugins register post types, taxonomies, shortcodes, widgets, and cron events here. Most plugin setup code runs on `init`.

**Step 78: Multisite site status check**

```
if is_multisite():
    $file = ms_site_check()
    if $file !== true:
        require $file
        die()
```

`ms_site_check()` verifies the current site is active in the network. If the site has been archived, suspended, deleted, or marked as spam, it returns the path to an appropriate error file. The check runs after `init` so that plugins can influence the result if needed.

**Step 79: `do_action('wp_loaded')`**

Fires when WordPress is fully loaded: all plugins loaded, theme set up, current user resolved, `init` completed. Intended for code that needs to run after everything else is initialized. Also used by `wp-cron.php` and REST API requests that need the full environment but need to do something after the normal `init` flow.

After `wp_loaded` fires, `wp-settings.php` returns, returning execution to `wp-config.php`, which returns to `wp-load.php`, which returns to `wp-blog-header.php`, which then calls `wp()` and `template-loader.php`.

---

## 7. Constants Reference

Complete table of constants defined during the bootstrap chain, in approximate definition order.

| Constant | Defined In | Type | Default | Purpose |
|---|---|---|---|---|
| `WP_USE_THEMES` | `index.php` | `bool` | `true` | Signals that the theme template should load. False in non-theme entry points. |
| `ABSPATH` | `wp-load.php` (or `wp-config.php`) | `string` | `__DIR__ . '/'` | Absolute path to WordPress root, trailing slash. Foundation for all path construction. |
| `DB_NAME` | `wp-config.php` | `string` | — | MySQL database name. |
| `DB_USER` | `wp-config.php` | `string` | — | MySQL username. |
| `DB_PASSWORD` | `wp-config.php` | `string` | — | MySQL password. |
| `DB_HOST` | `wp-config.php` | `string` | `'localhost'` | MySQL host; may include port or socket. |
| `DB_CHARSET` | `wp-config.php` | `string` | `'utf8mb4'` | Table character set. |
| `DB_COLLATE` | `wp-config.php` | `string` | `''` | Table collation; empty = MySQL default. |
| `AUTH_KEY` | `wp-config.php` | `string` | — | HMAC key for auth cookies. |
| `SECURE_AUTH_KEY` | `wp-config.php` | `string` | — | HMAC key for secure auth cookies (HTTPS). |
| `LOGGED_IN_KEY` | `wp-config.php` | `string` | — | HMAC key for logged-in cookies. |
| `NONCE_KEY` | `wp-config.php` | `string` | — | HMAC key for nonces. |
| `AUTH_SALT` | `wp-config.php` | `string` | — | Salt for auth cookie signing. |
| `SECURE_AUTH_SALT` | `wp-config.php` | `string` | — | Salt for secure auth cookie signing. |
| `LOGGED_IN_SALT` | `wp-config.php` | `string` | — | Salt for logged-in cookie signing. |
| `NONCE_SALT` | `wp-config.php` | `string` | — | Salt for nonce signing. |
| `WP_DEBUG` | `wp-config.php` / `wp_initial_constants()` | `bool` | `false` | Master PHP error display switch. |
| `WP_DEBUG_LOG` | `wp-config.php` | `bool\|string` | `false` | Write errors to log file. Path string overrides default log location. |
| `WP_DEBUG_DISPLAY` | `wp-config.php` | `bool` | `true` | Display errors on screen (only with `WP_DEBUG`). |
| `SCRIPT_DEBUG` | `wp-config.php` / `wp_initial_constants()` | `bool` | `false` | Load non-minified JS/CSS assets. |
| `SAVEQUERIES` | `wp-config.php` | `bool` | `false` | Store all SQL queries in `$wpdb->queries`. |
| `SHORTINIT` | `wp-config.php` | `bool` | `false` | Bail after minimal bootstrap; skip plugins, theme, L10n. |
| `WP_CACHE` | `wp-config.php` / `wp_initial_constants()` | `bool` | `false` | Enable `advanced-cache.php` drop-in. |
| `WP_MEMORY_LIMIT` | `wp-config.php` / `wp_initial_constants()` | `string` | `'40M'` | PHP memory limit for front-end. |
| `WP_MAX_MEMORY_LIMIT` | `wp-config.php` / `wp_initial_constants()` | `string` | `'256M'` | PHP memory limit for admin. |
| `WP_CONTENT_DIR` | `wp-config.php` / `wp_initial_constants()` | `string` | `ABSPATH . 'wp-content'` | Absolute path to content directory, no trailing slash. |
| `WP_CONTENT_URL` | `wp_plugin_directory_constants()` | `string` | Derived from `siteurl` | Public URL to content directory. |
| `WP_PLUGIN_DIR` | `wp_plugin_directory_constants()` | `string` | `WP_CONTENT_DIR . '/plugins'` | Absolute path to plugins directory. |
| `WP_PLUGIN_URL` | `wp_plugin_directory_constants()` | `string` | `WP_CONTENT_URL . '/plugins'` | Public URL to plugins directory. |
| `PLUGINDIR` | `wp_plugin_directory_constants()` | `string` | `'wp-content/plugins'` | Legacy relative path to plugins. |
| `WPMU_PLUGIN_DIR` | `wp_plugin_directory_constants()` | `string` | `WP_CONTENT_DIR . '/mu-plugins'` | Absolute path to must-use plugins. |
| `WPMU_PLUGIN_URL` | `wp_plugin_directory_constants()` | `string` | `WP_CONTENT_URL . '/mu-plugins'` | Public URL to must-use plugins. |
| `WP_LANG_DIR` | `wp_set_lang_dir()` | `string` | `WP_CONTENT_DIR . '/languages'` | Absolute path to translations directory. |
| `WPINC` | `wp-settings.php` (Step 1) | `string` | `'wp-includes'` | Name of the includes directory, no trailing slash. |
| `FORCE_SSL_ADMIN` | `wp-config.php` / `wp_ssl_constants()` | `bool` | `false` | Force HTTPS for admin and login pages. |
| `DISALLOW_FILE_EDIT` | `wp-config.php` | `bool` | `false` | Disable theme/plugin editor in wp-admin. |
| `DISALLOW_FILE_MODS` | `wp-config.php` | `bool` | `false` | Disable all file modifications (updates, installs, editor). |
| `DISALLOW_UNFILTERED_HTML` | `wp-config.php` | `bool` | `false` | Strip HTML from admin-level users. |
| `WP_AUTO_UPDATE_CORE` | `wp-config.php` | `bool\|string` | `'minor'` | Core auto-update policy. |
| `DISABLE_WP_CRON` | `wp-config.php` | `bool` | `false` | Suppress cron spawn on page load. |
| `WP_CRON_LOCK_TIMEOUT` | `wp-config.php` | `int` | `60` | Cron execution lock timeout in seconds. |
| `ALTERNATE_WP_CRON` | `wp-config.php` | `bool` | `false` | Use redirect-based cron instead of loopback HTTP. |
| `WP_ENVIRONMENT_TYPE` | `wp-config.php` | `string` | `'production'` | Deployment environment identifier. |
| `WP_SITEURL` | `wp-config.php` | `string` | — | Override for `siteurl` option; bypasses database. |
| `WP_HOME` | `wp-config.php` | `string` | — | Override for `home` option; bypasses database. |
| `MULTISITE` | `wp-config.php` / `wp-settings.php` | `bool` | `false` | Whether this is a multisite installation. |
| `SUBDOMAIN_INSTALL` | `wp-config.php` | `bool` | — | `true` = subdomain; `false` = subdirectory (multisite only). |
| `DOMAIN_CURRENT_SITE` | `wp-config.php` | `string` | — | Primary multisite domain. |
| `PATH_CURRENT_SITE` | `wp-config.php` | `string` | — | Primary multisite base path. |
| `SITE_ID_CURRENT_SITE` | `wp-config.php` | `int` | `1` | Primary multisite network ID. |
| `BLOG_ID_CURRENT_SITE` | `wp-config.php` | `int` | `1` | Primary multisite site ID. |
| `COOKIE_DOMAIN` | `wp-config.php` / `wp_cookie_constants()` | `string\|false` | Derived from `siteurl` | Domain used for authentication cookies. |
| `COOKIEHASH` | `wp_cookie_constants()` | `string` | MD5 of site URL | Used to namespace cookie names per-site. |
| `USER_COOKIE` | `wp_cookie_constants()` | `string` | `'wordpressuser_' . COOKIEHASH` | Username cookie name. |
| `PASS_COOKIE` | `wp_cookie_constants()` | `string` | `'wordpresspass_' . COOKIEHASH` | Password cookie name (legacy). |
| `AUTH_COOKIE` | `wp_cookie_constants()` | `string` | `'wordpress_' . COOKIEHASH` | Authentication cookie name (HTTP). |
| `SECURE_AUTH_COOKIE` | `wp_cookie_constants()` | `string` | `'wordpress_sec_' . COOKIEHASH` | Authentication cookie name (HTTPS). |
| `LOGGED_IN_COOKIE` | `wp_cookie_constants()` | `string` | `'wordpress_logged_in_' . COOKIEHASH` | Logged-in status cookie. |
| `TEST_COOKIE` | `wp_cookie_constants()` | `string` | `'wordpress_test_cookie'` | Used to verify cookie support. |
| `COOKIEPATH` | `wp_cookie_constants()` | `string` | Path from site URL | Cookie path scope. |
| `SITECOOKIEPATH` | `wp_cookie_constants()` | `string` | Path from site URL | Cookie path for the WordPress directory. |
| `ADMIN_COOKIE_PATH` | `wp_cookie_constants()` | `string` | `SITECOOKIEPATH . 'wp-admin'` | Cookie path for the admin area. |
| `PLUGINS_COOKIE_PATH` | `wp_cookie_constants()` | `string` | Derived from `WP_PLUGIN_URL` | Cookie path for the plugins directory. |
| `TEMPLATEPATH` | `wp_templating_constants()` | `string` | Active theme dir | Absolute path to the parent (template) theme directory. |
| `STYLESHEETPATH` | `wp_templating_constants()` | `string` | Active stylesheet dir | Absolute path to the stylesheet (child) theme directory. |
| `CONCATENATE_SCRIPTS` | `wp_functionality_constants()` | `bool` | Auto-detected | Concatenate admin JS into one request. |
| `COMPRESS_SCRIPTS` | `wp_functionality_constants()` | `bool` | Auto-detected | Gzip-compress concatenated admin JS. |
| `COMPRESS_CSS` | `wp_functionality_constants()` | `bool` | Auto-detected | Gzip-compress admin CSS. |
| `ENFORCE_GZIP` | `wp-config.php` | `bool` | `false` | Force gzip even without browser support declaration. |
| `FS_METHOD` | `wp-config.php` | `string` | Auto-detected | Filesystem method: `'direct'`, `'ftpext'`, `'ftpsockets'`, `'ssh2'`. |
| `RELOCATE` | `wp-config.php` | `bool` | — | Auto-update `siteurl` to current request URL (post-migration helper). |
| `WP_LOCAL_DEV` | `wp-config.php` | `bool` | — | Informal local development flag (not formally defined by core). |

---

## 8. Drop-in Load Points

Drop-ins are single PHP files placed in `WP_CONTENT_DIR` that replace or augment specific subsystems. Each has exactly one load point in the bootstrap chain.

### `advanced-cache.php`

**Load point:** Step 18, Phase 3 — after `wp_debug_mode()`, before `wp_set_lang_dir()`.

**Condition:** `WP_CACHE` must be `true` AND the `enable_loading_advanced_cache_dropin` filter must not return `false` AND the file must exist at `WP_CONTENT_DIR . '/advanced-cache.php'`.

**Mechanism:** `include` (not `require`). A fatal error in the drop-in will not necessarily halt bootstrap if the file is included, but in practice any error before the cache logic runs is fatal.

**Purpose:** Full-page object caching. The drop-in can serve a cached response and call `exit` before any database queries run. If it does not exit, bootstrap continues normally.

**Hook re-initialization:** After the file loads, `WP_Hook::build_preinitialized_hooks($wp_filter)` is called if `$wp_filter` is non-empty. This converts any plain-array hook registrations made by the drop-in into proper `WP_Hook` instances.

**What is available at load time:** `ABSPATH`, `WPINC`, `WP_CONTENT_DIR`, version globals, compat shims, `load.php` functions, `wp_initial_constants()` results, the fatal error handler, the hook engine (`plugin.php`).

**What is NOT available:** Database, object cache, plugins, theme, `$wp_query`, current user.

---

### `db.php`

**Load point:** Step 21, inside `require_wp_db()`.

**Condition:** File must exist at `WP_CONTENT_DIR . '/db.php'`.

**Mechanism:** `require_once`. If the drop-in does not define `$wpdb`, the built-in `class-wpdb.php` is loaded and `$wpdb` is instantiated. If the drop-in does define `$wpdb`, the built-in class is not loaded.

**Purpose:** Replaces the database abstraction layer entirely. Used by drop-in database backends (e.g. HyperDB for multi-server configurations, or custom PDO adapters). The drop-in must define a `$wpdb` object that is API-compatible with the built-in `wpdb` class.

**What is available at load time:** Everything up to and including Step 20 (early libraries, constants, error handler). The object cache has NOT started yet (Step 24 comes after this).

---

### `object-cache.php`

**Load point:** Step 24, inside `wp_start_object_cache()`.

**Condition:** File must exist at `WP_CONTENT_DIR . '/object-cache.php'`.

**Mechanism:** `include_once`. After the file loads, `wp_cache_init()` is called if it exists (defined by the drop-in), which sets up `$GLOBALS['wp_object_cache']`.

**Purpose:** Replaces the in-memory per-request object cache with a persistent external cache (Memcached, Redis, APCu, etc.). The drop-in must implement the `wp_cache_*` function API: `wp_cache_get`, `wp_cache_set`, `wp_cache_add`, `wp_cache_delete`, `wp_cache_flush`, `wp_cache_replace`, `wp_cache_incr`, `wp_cache_decr`, `wp_cache_get_multiple`, `wp_cache_set_multiple`, `wp_cache_delete_multiple`.

**What is available at load time:** Database (`$wpdb` is configured with table names), all early libraries, constants, error handler, default filters registered.

---

### `maintenance.php`

**Load point:** Step 15, inside `wp_maintenance()`.

**Condition:** The standard `.maintenance` file (not `maintenance.php`) triggers maintenance mode. There is no `maintenance.php` drop-in in current WordPress core. The maintenance behavior is controlled entirely by the `.maintenance` PHP file in `ABSPATH`, which may set `$upgrading` to a Unix timestamp.

**Mechanism:** `@include( ABSPATH . '.maintenance' )`. The `@` suppresses errors if the file is unreadable. The file is expected to set `$upgrading` — if `$upgrading` is within 600 seconds of the current time, maintenance mode activates.

**Purpose:** Suppress all page serving while a core/plugin/theme update is in progress. The update process creates `.maintenance` before making any file changes and removes it when finished.

---

### `sunrise.php`

**Load point:** Inside `ms-settings.php` (loaded at Step 26, multisite only).

**Condition:** `SUNRISE` constant must be defined (set to `'on'` or any truthy value) AND `MULTISITE` must be true AND the file must exist at `WP_CONTENT_DIR . '/sunrise.php'`.

**Mechanism:** `include( WP_CONTENT_DIR . '/sunrise.php' )`.

**Purpose:** Multisite domain mapping. The drop-in runs before `ms-settings.php` resolves the current blog, allowing it to redirect the request to a different blog based on a custom domain. Used by domain-mapping plugins in multisite networks.

**What is available at load time:** `$wpdb` (configured), object cache, `ABSPATH`, `WPINC`, `WP_CONTENT_DIR`, version globals, basic utility functions, multisite classes (`WP_Site_Query`, `WP_Network_Query`, `ms-blogs.php` functions). Plugins have NOT loaded.

---

## 9. Error Recovery

### Fatal Error Handler

The fatal error handler is registered at Step 12 (`wp_register_fatal_error_handler()`) via PHP's `register_shutdown_function`. When the PHP process shuts down, the handler runs:

1. `error_get_last()` is checked for a fatal error.
2. If a fatal error exists and `wp_is_fatal_error_handler_enabled()` returns true, the handler proceeds.
3. The handler checks whether the current request is an XML-RPC or REST API request. If so, it returns a machine-readable error response (JSON or XML) instead of an HTML page.
4. Otherwise, it checks whether the current request is in recovery mode. If so, it allows the error to propagate (so the admin can see it).
5. Otherwise, it calls `WP_Fatal_Error_Handler::handle()`, which:
   a. Determines whether the error was caused by a plugin or theme by comparing the error file path against known plugin/theme directories.
   b. If caused by an extension: pauses the extension (stores its path in `WP_Paused_Extensions_Storage`, persisted in the `paused_plugins` or `paused_themes` option), then sends a 500 response with a generic error page that includes a link to initiate recovery mode.
   c. If caused by core: sends a 500 response with a generic error page.

`wp_is_fatal_error_handler_enabled()` returns `false` in the following cases:
- The `WP_DISABLE_FATAL_ERROR_HANDLER` constant is defined and truthy.
- The `wp_fatal_error_handler_enabled` filter returns false (only if the filter system is available).

### `WP_Paused_Extensions_Storage`

Persists a list of plugins and themes that have caused fatal errors, so they can be skipped on the next request. Storage uses the `paused_plugins` and `paused_themes` options in the database. On each request, `wp_get_active_and_valid_plugins()` filters out paused plugins before loading them. This means a plugin that causes a fatal error on request N will not load on request N+1, allowing the site to recover automatically.

### Recovery Mode

Recovery mode allows an administrator to log in to the site even when a fatal error would normally prevent it, in order to deactivate the offending extension.

**Initiation:** From the fatal error page, the admin clicks "Please try again" which sends an email to the admin email address. The email contains a unique, time-limited URL.

**The recovery mode URL:** Contains a one-time token generated by `WP_Recovery_Mode_Key_Service`. The token is derived from a random key stored in the `recovery_keys` option and is valid for a configurable timeout (default: 1 day).

**`wp_recovery_mode()->initialize()`** (Step 42): Called on single-site installations before active plugins load. Checks whether:
- The current request contains a recovery mode link token (`?action=enter_recovery_mode&rm_key=...`). If so, validates the token, sets the recovery mode cookie, and redirects to the same URL without the token.
- The current request has a valid recovery mode cookie. If so, activates recovery mode for this request.

**When recovery mode is active:**
- The paused extensions list is bypassed: all plugins and themes load, including the one causing the fatal error.
- The admin bar shows a recovery mode banner.
- The fatal error handler will not pause additional extensions during this session.
- The admin can navigate to the plugins/themes screen and deactivate the problematic extension.

**`WP_Recovery_Mode_Cookie_Service`:** Handles reading and writing the recovery mode session cookie. The cookie value is an HMAC-signed session token.

**`WP_Recovery_Mode_Key_Service`:** Generates and validates the recovery mode link token. Tokens are stored as hashed values in the database option `recovery_keys` and expire after the configured timeout.

**`WP_Recovery_Mode_Email_Service`:** Sends the recovery mode email. Includes the recovery URL, the error message, and the file/line number of the error. Implements a rate limit to prevent email flooding (one email per `WP_RECOVERY_MODE_EMAIL_RATE_LIMIT` seconds, default 1 day).

**`WP_Recovery_Mode_Link_Service`:** Constructs the recovery mode URL from the base URL and the signed token. Validates incoming URLs by verifying the token.

---

## 10. TypeScript Interface Sketch

```typescript
// Configuration equivalent of wp-config.php

interface DatabaseConfig {
  name: string;
  user: string;
  password: string;
  host: string;
  charset: string;
  collate: string;
  tablePrefix: string;
}

interface AuthConfig {
  authKey: string;
  secureAuthKey: string;
  loggedInKey: string;
  nonceKey: string;
  authSalt: string;
  secureAuthSalt: string;
  loggedInSalt: string;
  nonceSalt: string;
}

interface DebugConfig {
  enabled: boolean;
  log: boolean | string;   // false, true (default path), or absolute path string
  display: boolean;
  scriptDebug: boolean;
  saveQueries: boolean;
}

interface PerformanceConfig {
  cache: boolean;
  memoryLimit: string;
  maxMemoryLimit: string;
}

interface PathConfig {
  abspath: string;
  contentDir: string;
  contentUrl: string;
  pluginDir: string;
  pluginUrl: string;
  muPluginDir: string;
  langDir: string;
}

interface SecurityConfig {
  forceSslAdmin: boolean;
  disallowFileEdit: boolean;
  disallowFileMods: boolean;
  disallowUnfilteredHtml: boolean;
}

interface CronConfig {
  disabled: boolean;
  lockTimeout: number;
  alternate: boolean;
}

interface MultisiteConfig {
  enabled: boolean;
  subdomainInstall: boolean;
  domainCurrentSite: string;
  pathCurrentSite: string;
  siteIdCurrentSite: number;
  blogIdCurrentSite: number;
  cookieDomain?: string;
}

interface BootstrapConfig {
  db: DatabaseConfig;
  auth: AuthConfig;
  debug: DebugConfig;
  performance: PerformanceConfig;
  paths: PathConfig;
  security: SecurityConfig;
  cron: CronConfig;
  multisite?: MultisiteConfig;
  environmentType: 'local' | 'development' | 'staging' | 'production';
  siteUrl?: string;
  homeUrl?: string;
  shortinit?: boolean;
  autoUpdateCore?: boolean | 'minor';
}

// Result of a completed bootstrap — the live application context

interface BootstrapContext {
  config: BootstrapConfig;

  // Subsystem instances
  db: DatabaseConnection;         // wpdb equivalent
  objectCache: ObjectCache;       // wp_object_cache equivalent
  hooks: HookEngine;              // $wp_filter + wp() API equivalent

  // Core globals populated during bootstrap
  query: QueryInstance;           // $wp_query / $wp_the_query
  rewrite: RewriteEngine;         // $wp_rewrite
  roles: RolesRegistry;           // $wp_roles
  locale: LocaleInstance;         // $wp_locale
  localeSwitcher: LocaleSwitcher; // $wp_locale_switcher

  // State flags
  isMultisite: boolean;
  isShortinit: boolean;
  currentUser: UserContext | null;
  currentBlogId: number;

  // Registered extensions
  activePlugins: string[];
  activeTheme: ThemeContext;
  muPlugins: string[];
}

// The bootstrap function — equivalent of running wp-settings.php

interface BootstrapPhaseCallbacks {
  onMuPluginLoaded?: (path: string) => void | Promise<void>;
  onNetworkPluginLoaded?: (path: string) => void | Promise<void>;
  onMuPluginsLoaded?: () => void | Promise<void>;
  onPluginLoaded?: (path: string) => void | Promise<void>;
  onPluginsLoaded?: () => void | Promise<void>;
  onSetupTheme?: () => void | Promise<void>;
  onAfterSetupTheme?: () => void | Promise<void>;
  onInit?: () => void | Promise<void>;
  onWpLoaded?: () => void | Promise<void>;
}

async function bootstrap(
  config: BootstrapConfig,
  callbacks?: BootstrapPhaseCallbacks,
): Promise<BootstrapContext>;
```

The `BootstrapConfig` interface is the typed equivalent of `wp-config.php`. The `BootstrapContext` is the typed equivalent of all globals set by `wp-settings.php`. The `bootstrap()` function encapsulates the entire `wp-settings.php` sequence as an async function.

The `BootstrapPhaseCallbacks` interface maps to the action hooks fired during bootstrap, providing hook-shaped extension points without requiring an in-process hook registry to be bootstrapped before the function is called. Once bootstrapped, the `HookEngine` on `BootstrapContext` handles all subsequent hook registration.

---

## 11. Design Patterns to Carry Over

### 1. Linear, ordered bootstrap with explicit dependencies

The bootstrap chain is not a dependency graph resolved at runtime — it is a manually ordered list where every step's position is intentional. Each step can depend on all previous steps having completed. This avoids circular dependency problems and makes the initialization order auditable. Any re-implementation must preserve the ordering guarantees, not just the presence of each step.

### 2. Configuration as code, loaded once

`wp-config.php` is executed PHP code, not a parsed data file. This means it can contain conditional logic (`if getenv('APP_ENV') === 'production'`), computed values, and any PHP expression. The TypeScript equivalent should support this through a configuration function signature (`config: () => BootstrapConfig | Promise<BootstrapConfig>`) rather than requiring a plain object.

### 3. Drop-in points as filesystem conventions

Drop-ins are identified purely by their presence in `WP_CONTENT_DIR`. There is no registry, no manifest, no declaration. The pattern is: "if a file exists at this known path, load it instead of the default." This is a powerful convention because it requires no coordination between the drop-in and the bootstrap code. The cost is discoverability — there is no single place to declare all drop-ins. The TypeScript equivalent can preserve this with a `dropins` directory convention or make it explicit in `BootstrapConfig`.

### 4. The SHORTINIT escape hatch

The `SHORTINIT` bail at Step 29 divides bootstrap into two halves: the "minimal" half (database, object cache, basic functions) and the "full" half (plugins, theme, L10n, all libraries). This is a first-class architectural feature. The TypeScript equivalent should expose this as a `shortinit` option to `bootstrap()`, returning a `BootstrapContext` with `isShortinit: true` and only the minimal subsystems populated.

### 5. Guard flags for idempotency

The `$wp_did_header` guard in `wp-blog-header.php` and the `if ! defined(...)` guards around constant definitions are both idempotency patterns. They ensure that including a file multiple times has the same effect as including it once. Any re-implementation of the bootstrap chain must handle the case where a bootstrap function is called when already bootstrapped — either by returning the existing context or by throwing a `AlreadyBootstrappedError`.

### 6. Pluggable functions: late-binding via conditional definition

Functions in `pluggable.php` are declared with `if ( ! function_exists(...) )`. Plugins can shadow them by defining them during their own load (which happens before `pluggable.php` is required). This is PHP's equivalent of dependency injection through monkey-patching. The TypeScript equivalent is a services registry on `BootstrapContext` with typed interfaces: `context.services.mail`, `context.services.auth`, `context.services.passwordHasher`. Plugins register service implementations before the defaults are registered.

### 7. Hook re-initialization after drop-in load

When `advanced-cache.php` loads, it may register hooks using the pre-initialized array format. After it loads, `WP_Hook::build_preinitialized_hooks()` converts those arrays. This pattern supports a drop-in registering hooks before the hook engine itself has fully initialized. The TypeScript equivalent: a `HookEngine` that accepts pending registrations queued before initialization and flushes them when initialized.

### 8. `$wp_the_query` / `$wp_query` split

`$wp_the_query` is the immutable reference to the main query. `$wp_query` is the mutable alias. Functions like `query_posts()` replace `$wp_query` temporarily; `wp_reset_query()` restores it. This pattern prevents code from permanently losing the main query. The TypeScript equivalent is a `QueryContext` with a `mainQuery` property that is read-only and a `currentQuery` property that is writable, plus a `resetQuery()` method.

### 9. Timezone normalization at the framework level

Setting UTC as the global timezone in Step 13 is a framework-level contract: all internal timestamps are UTC; conversion is a display concern. This eliminates an entire class of timezone-related bugs. Any re-implementation must enforce this contract at the persistence and computation layers, not the display layer.

### 10. `wp_loaded` as the safe extension point

The `wp_loaded` hook fires last. It is the correct hook for code that needs everything initialized but does not need to modify the initialization process. REST API endpoint registration, deferred cron spawning, and external integrations that want to run after the full environment is available all belong here. This maps directly to a `onWpLoaded` callback or an event emitted by the `bootstrap()` function after it resolves.

---

## 12. Tovu Reconstruction Notes

### 12.1 Why this exists

WordPress bootstrap exists to guarantee that configuration, low-level runtime state, plugins, themes, users, hooks, and request routing all become available in a stable order. The order is the feature.

### 12.2 What Tovu should preserve

- Deterministic ordered bootstrap rather than incidental module import side effects
- Explicit phases for config, core services, extensions, theme/runtime, and final request readiness
- Early escape hatches and safe-mode style reduced boot paths
- Idempotency and late-binding extension points

### 12.3 What Tovu can simplify

- Tovu does not need PHP-style globals or `pluggable.php`
- Config can be function-based or structured instead of arbitrary executable PHP
- Drop-ins can become explicit ports/adapters rather than magic filenames, as long as the extension seam remains early and swappable

### 12.4 Possible Tovu seams

- `src/server/` as composition root
- `src/core/ports/BootstrapExtensionPort.ts` for early boot extension hooks
- `src/core/ports/ThemeRuntimePort.ts` and `src/core/ports/ExtensionRuntimePort.ts` for late-binding runtime services
- lifecycle events in `src/core/events/`

### 12.5 Suggested priority

- `V1`: deterministic bootstrap phases, config loading, extension/theme initialization ordering
- `Later`: reduced boot modes, richer recovery/safe-mode paths, compatibility shims
