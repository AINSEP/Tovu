# Spec: `wp-load.php`

**Source:** `wordpress/wp-load.php`
**Lines:** 106
**Role:** Configuration locator and bootstrap initiator

---

## Purpose

Locates `wp-config.php` and loads it, thereby triggering the full WordPress bootstrap via `wp-settings.php`. If no config file is found, redirects to the web-based setup wizard.

---

## Behaviour

### 1. Define `ABSPATH`

If not already defined, sets `ABSPATH` to the directory containing this file (the WordPress root), with a trailing slash.

```
ABSPATH = __DIR__ + '/'
```

### 2. Set initial error reporting level

Sets PHP error reporting to a safe baseline:
- `E_CORE_ERROR | E_CORE_WARNING | E_COMPILE_ERROR | E_ERROR | E_WARNING | E_PARSE | E_USER_ERROR | E_USER_WARNING | E_RECOVERABLE_ERROR`

This baseline is later adjusted by `wp_debug_mode()` in `wp-settings.php` based on `WP_DEBUG`.

### 3. Locate `wp-config.php` — three cases

**Case A: `wp-config.php` exists in `ABSPATH`**
```
require ABSPATH/wp-config.php
```

**Case B: `wp-config.php` exists one directory above `ABSPATH`, AND `wp-settings.php` does NOT exist one directory above**

This supports the pattern of placing the WordPress directory in a subdirectory (e.g. `/var/www/wordpress/`) while keeping the config in the web root (`/var/www/wp-config.php`). The `wp-settings.php` check prevents accidentally picking up config from a different WordPress installation.

```
require dirname(ABSPATH)/wp-config.php
```

**Case C: No config file found**

Minimal bootstrap is run (just enough to display a friendly error):
1. Define `WPINC = 'wp-includes'`
2. Load `version.php`, `compat.php`, `load.php`
3. Check PHP/MySQL versions
4. Fix `$_SERVER` vars
5. Define `WP_CONTENT_DIR`
6. Load `functions.php`
7. If the request URI does not already contain `'setup-config'`:
   - Redirect to `{guessed_url}/wp-admin/setup-config.php`
   - `exit`
8. Otherwise (already on setup-config page):
   - Load early translations
   - `wp_die()` with a descriptive error message and a "Create a Configuration File" button

---

## What `wp-config.php` must contain

(Documented in `wp-config-sample.php`, spec'd separately in `wp-config.md`)

After defining DB credentials and salts, `wp-config.php` ends with:
```php
require_once ABSPATH . 'wp-settings.php';
```

This means loading `wp-load.php` is equivalent to loading `wp-settings.php`, unless SHORTINIT or other early exits occur.

---

## TypeScript Equivalent

```typescript
// src/bootstrap/load.ts

export async function load(rootDir: string): Promise<AppConfig> {
  const configPath = await locateConfig(rootDir);

  if (!configPath) {
    // Redirect to setup wizard
    throw new SetupRequiredError(rootDir);
  }

  const config = await loadConfig(configPath);
  return config;
}

async function locateConfig(rootDir: string): Promise<string | null> {
  // Case A: config in root
  if (await fileExists(path.join(rootDir, 'wp-config.php'))) {
    return path.join(rootDir, 'wp-config.php');
  }

  const parentDir = path.dirname(rootDir);
  const parentConfig = path.join(parentDir, 'wp-config.php');
  const parentSettings = path.join(parentDir, 'wp-settings.php');

  // Case B: config in parent but no wp-settings there (avoids nested installs)
  if (await fileExists(parentConfig) && !(await fileExists(parentSettings))) {
    return parentConfig;
  }

  return null;
}
```

In a TypeScript rewrite, `wp-config.php` becomes an environment config (`.env`, JSON, or YAML). The lookup logic (root → parent) can be preserved or simplified depending on deployment model.

---

## Tovu Reconstruction Notes

### Why this exists

This archival note preserves the earlier `wp-load.php` decomposition. The canonical Tovu-facing treatment now lives in [bootstrap.md](/Users/la/Desktop/Tovu AI CMS/other-repos/wordpress_specs/wp-root/bootstrap.md).

### What Tovu should preserve

- The early config/bootstrap handoff and request boot chain described in the consolidated bootstrap doc

### What Tovu can simplify

- Tovu can use a cleaner environment-loading model without preserving WordPress's root/parent file search behavior

### Possible Tovu seams

- `src/core/bootstrap/`
- `src/core/config/`

### Suggested priority

- `Reference only`; implement from the consolidated bootstrap spec
