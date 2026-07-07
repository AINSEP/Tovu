# Spec: `wp-config.php` (via `wp-config-sample.php`)

**Source:** `wordpress/wp-config-sample.php`
**Role:** Site configuration file — not a runtime entry point, but required for bootstrap

---

## Purpose

`wp-config.php` is the user-created configuration file, generated from `wp-config-sample.php`. It defines all environment-specific constants before loading `wp-settings.php`.

This file is **never versioned** in a real installation. `wp-config-sample.php` is the template.

---

## Required Configuration Values

### Database

| Constant | Default | Description |
|---|---|---|
| `DB_NAME` | `'database_name_here'` | Database name |
| `DB_USER` | `'username_here'` | Database username |
| `DB_PASSWORD` | `'password_here'` | Database password |
| `DB_HOST` | `'localhost'` | Database host (can include port: `localhost:3307`) |
| `DB_CHARSET` | `'utf8mb4'` | Table character set |
| `DB_COLLATE` | `''` | Table collation (empty = use DB default) |

### Authentication Keys and Salts

Eight unique secret strings used for cookie signing and hashing. Changing any of them invalidates all existing login sessions.

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

Each should be a unique, random string of at least 60 characters. They are used in HMAC operations throughout the authentication system.

### Table Prefix

```php
$table_prefix = 'wp_';
```

A variable (not a constant). Allows multiple WordPress installations in one database. Only letters, numbers, and underscores allowed. Changing after installation breaks the site.

---

## Optional Configuration Constants

These can be added to `wp-config.php` between the "custom values" markers.

### Debugging

| Constant | Default | Description |
|---|---|---|
| `WP_DEBUG` | `false` | Enable PHP error display |
| `WP_DEBUG_LOG` | `false` | Log errors to `wp-content/debug.log` |
| `WP_DEBUG_DISPLAY` | `true` | Display errors on screen (only effective if `WP_DEBUG` is on) |
| `SCRIPT_DEBUG` | `false` | Load unminified JS/CSS |
| `SAVEQUERIES` | `false` | Log all DB queries to `$wpdb->queries` |

### Performance

| Constant | Default | Description |
|---|---|---|
| `WP_CACHE` | `false` | Enable advanced-cache drop-in |
| `WP_MEMORY_LIMIT` | `'40M'` | PHP memory limit for front-end |
| `WP_MAX_MEMORY_LIMIT` | `'256M'` | PHP memory limit for admin |

### File System

| Constant | Default | Description |
|---|---|---|
| `WP_CONTENT_DIR` | `ABSPATH . 'wp-content'` | Absolute path to content directory |
| `WP_CONTENT_URL` | (derived from `siteurl`) | URL to content directory |
| `WP_PLUGIN_DIR` | `WP_CONTENT_DIR . '/plugins'` | Absolute path to plugins |
| `WP_PLUGIN_URL` | `WP_CONTENT_URL . '/plugins'` | URL to plugins |
| `WPMU_PLUGIN_DIR` | `WP_CONTENT_DIR . '/mu-plugins'` | Must-use plugins path |
| `WP_LANG_DIR` | `WP_CONTENT_DIR . '/languages'` | Languages directory |
| `FS_METHOD` | (auto-detected) | Filesystem method: `'direct'`, `'ftpext'`, `'ftpsockets'`, `'ssh2'` |

### Security

| Constant | Default | Description |
|---|---|---|
| `FORCE_SSL_ADMIN` | `false` | Force HTTPS for admin and logins |
| `FORCE_SSL_LOGIN` | `false` | (deprecated) Force HTTPS for logins only |
| `DISALLOW_FILE_EDIT` | `false` | Disable theme/plugin editor in admin |
| `DISALLOW_FILE_MODS` | `false` | Disable all file modifications (updates, installs) |
| `DISALLOW_UNFILTERED_HTML` | `false` | Strip HTML even from admin users |

### Multisite

| Constant | Description |
|---|---|
| `WP_ALLOW_MULTISITE` | Enable the multisite setup UI |
| `MULTISITE` | Marks this as a multisite installation |
| `SUBDOMAIN_INSTALL` | `true` = subdomain, `false` = subdirectory |
| `DOMAIN_CURRENT_SITE` | Primary domain |
| `PATH_CURRENT_SITE` | Primary path |
| `SITE_ID_CURRENT_SITE` | Primary network ID (usually `1`) |
| `BLOG_ID_CURRENT_SITE` | Primary site ID (usually `1`) |
| `COOKIE_DOMAIN` | Override cookie domain |

### Cron

| Constant | Default | Description |
|---|---|---|
| `DISABLE_WP_CRON` | `false` | Disable automatic cron spawn on page load |
| `WP_CRON_LOCK_TIMEOUT` | `60` | Seconds to hold cron execution lock |
| `ALTERNATE_WP_CRON` | `false` | Use a redirect-based cron method instead of loopback |

### Other

| Constant | Default | Description |
|---|---|---|
| `ABSPATH` | `__DIR__ . '/'` | WordPress root directory |
| `RELOCATE` | — | Auto-update `siteurl` to match current location (used after moving a site) |
| `SHORTINIT` | — | Abort `wp-settings.php` after minimal setup (no plugins, no theme) |
| `CONCATENATE_SCRIPTS` | — | Combine admin JS files into one request |
| `COMPRESS_SCRIPTS` | — | gzip admin JS |
| `COMPRESS_CSS` | — | gzip admin CSS |
| `ENFORCE_GZIP` | — | Force gzip encoding for compressed files |

---

## Load Order (last two lines)

```php
if ( ! defined( 'ABSPATH' ) ) {
    define( 'ABSPATH', __DIR__ . '/' );
}
require_once ABSPATH . 'wp-settings.php';
```

`ABSPATH` may already be defined by `wp-load.php` when loading from a parent directory. The guard prevents double-definition errors.

---

## TypeScript Equivalent

In a TypeScript rewrite, `wp-config.php` maps to a typed configuration object, loaded from environment variables or a config file:

```typescript
interface WordPressConfig {
  db: {
    name: string;
    user: string;
    password: string;
    host: string;
    charset: string;
    collate: string;
    tablePrefix: string;
  };
  auth: {
    authKey: string;
    secureAuthKey: string;
    loggedInKey: string;
    nonceKey: string;
    authSalt: string;
    secureAuthSalt: string;
    loggedInSalt: string;
    nonceSalt: string;
  };
  debug: {
    enabled: boolean;
    log: boolean;
    display: boolean;
    scriptDebug: boolean;
    saveQueries: boolean;
  };
  performance: {
    cache: boolean;
    memoryLimit: string;
    maxMemoryLimit: string;
  };
  paths: {
    abspath: string;
    contentDir: string;
    contentUrl: string;
    pluginDir: string;
    langDir: string;
  };
  security: {
    forceSslAdmin: boolean;
    disallowFileEdit: boolean;
    disallowFileMods: boolean;
  };
  cron: {
    disabled: boolean;
    lockTimeout: number;
  };
  multisite?: MultisiteConfig;
}
```

---

## Tovu Reconstruction Notes

### Why this exists

This archival note preserves the earlier `wp-config.php` decomposition. The canonical Tovu-facing treatment now lives in [bootstrap.md](/Users/la/Desktop/Tovu AI CMS/other-repos/wordpress_specs/wp-root/bootstrap.md).

### What Tovu should preserve

- Centralized environment/config loading and the operational constants captured in the consolidated bootstrap doc

### What Tovu can simplify

- Tovu should use its own config system rather than carrying WordPress file-shape assumptions forward

### Possible Tovu seams

- `src/core/bootstrap/`
- `src/core/config/`

### Suggested priority

- `Reference only`; implement from the consolidated bootstrap spec
