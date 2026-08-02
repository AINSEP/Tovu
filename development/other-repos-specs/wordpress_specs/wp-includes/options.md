# Options API — Specification

**Source files analyzed:**
- `wp-includes/option.php`

---

## 1. Overview

The Options API is WordPress's primary key-value persistence layer. It provides a database-backed store for arbitrary named values with an in-memory caching layer on top of it. Nearly every configuration value in WordPress — site URL, active plugins, theme settings, scheduled cron tasks — is stored and retrieved through this API.

The system has four distinct sub-systems that all build on the same primitives:

1. **Site options** (`get_option` / `update_option` / `add_option` / `delete_option`): per-site key-value pairs stored in `wp_options`. This is the primary API.
2. **Network options** (`get_network_option` / `update_network_option` / `add_network_option` / `delete_network_option`): key-value pairs scoped to a multisite network, stored in `wp_sitemeta`. On single-site installs, these delegate directly to the site options functions.
3. **Transients** (`get_transient` / `set_transient` / `delete_transient`): time-limited values. Implemented on top of either site options (when no external object cache is present) or directly on the object cache.
4. **Network transients** (`get_site_transient` / `set_site_transient` / `delete_site_transient`): same as transients but network-scoped. Implemented on top of network options or the object cache.

The `get_site_option` / `update_site_option` / `add_site_option` / `delete_site_option` family are thin wrappers for the `*_network_option` family. They have been the canonical public API since WordPress 2.8; the `*_network_option` variants were introduced in 4.4 to expose the `$network_id` parameter explicitly.

---

## 2. Global State / Data Structures

### Database Schema

**`wp_options` table** (single-site options):

| Column | Type | Notes |
|---|---|---|
| `option_id` | `bigint unsigned` | Auto-increment primary key |
| `option_name` | `varchar(191)` | Unique key |
| `option_value` | `longtext` | Value, serialized when non-scalar |
| `autoload` | `varchar(20)` | Controls whether the option is preloaded at startup |

The `autoload` column accepts the following values:

| Value | Meaning |
|---|---|
| `'on'` | Explicitly enabled by caller |
| `'off'` | Explicitly disabled by caller |
| `'auto-on'` | Determined by heuristic to autoload |
| `'auto-off'` | Determined by heuristic to not autoload |
| `'auto'` | Heuristic was indeterminate |
| `'yes'` | Legacy equivalent of `'on'` (backward compat) |
| `'no'` | Legacy equivalent of `'off'` (backward compat) |

The values that actively cause autoloading are: `'yes'`, `'on'`, `'auto-on'`, `'auto'`. Values `'no'`, `'off'`, `'auto-off'` do not autoload. This set is returned by `wp_autoload_values_to_autoload()`.

**`wp_sitemeta` table** (network options, multisite only):

| Column | Type | Notes |
|---|---|---|
| `meta_id` | `bigint unsigned` | Auto-increment primary key |
| `site_id` | `bigint unsigned` | Foreign key to network ID |
| `meta_key` | `varchar(255)` | Option name |
| `meta_value` | `longtext` | Value, serialized when non-scalar |

### In-Memory Cache Keys

All options caching uses the object cache (see object-cache spec). The relevant cache groups and keys are:

**Group `'options'`** (site options):

| Cache key | Contents |
|---|---|
| `'alloptions'` | Array of `{ [optionName: string]: string }` — raw (not unserialized) values of all autoloaded options |
| `'notoptions'` | Array of `{ [optionName: string]: true }` — set of option names confirmed to not exist in the database |
| `optionName` | Raw (not unserialized) value of a single non-autoloaded option |

**Group `'site-options'`** (network options):

| Cache key | Contents |
|---|---|
| `"${networkId}:${optionName}"` | Unserialized value of a single network option |
| `"${networkId}:notoptions"` | Array of `{ [optionName: string]: true }` — set of non-existent network option names |

### Global PHP Variables (TypeScript equivalents)

```typescript
// Registered settings (via register_setting / unregister_setting)
const wpRegisteredSettings: Record<string, RegisteredSettingArgs> = {};

// Options allowed per settings group (for REST API and settings pages)
const newAllowedOptions: Record<string, string[]> = {};
```

### Protected Option Names

The option names `'alloptions'` and `'notoptions'` are reserved. Any attempt to read, write, or delete these names via the public API triggers a fatal error (`wp_die`). This protection is enforced by `wp_protect_special_option()`, which is called at the start of `update_option`, `add_option`, `delete_option`, `add_network_option`, and `update_network_option`.

### Deprecated Option Name Aliases

Two option names are deprecated and automatically redirected (unless WordPress is installing):

| Deprecated name | Canonical name |
|---|---|
| `'blacklist_keys'` | `'disallowed_keys'` |
| `'comment_whitelist'` | `'comment_previously_approved'` |

This redirection is applied in `get_option`, `update_option`, and `add_option`.

---

## 3. Complete Public API

### `get_option(option, defaultValue?)`

Retrieves an option value from the database.

**Parameters:**

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `option` | `string` | required | Option name. Trimmed. Empty string returns `false`. |
| `defaultValue` | `mixed` | `false` | Value to return if the option does not exist. |

**Return value:** `mixed` — the option value, or `defaultValue` (defaulting to `false`) if not found.

**Execution order:**

1. Scalar option names are trimmed. Empty option names return `false` immediately.
2. Deprecated key aliases are redirected (unless installing).
3. Filter `pre_option_{$option}` is applied with initial value `false`. If any filter callback returns a non-`false` value, that value is returned immediately (short-circuit).
4. Filter `pre_option` is applied to the result of step 3. If the result is non-`false`, it is returned immediately.
5. If the constant `WP_SETUP_CONFIG` is defined, return `false`.
6. Track whether a default was explicitly passed (`func_num_args() > 1`). This distinguishes `get_option('foo', false)` from `get_option('foo')`.
7. If NOT installing:
   a. Load `alloptions` cache via `wp_load_alloptions()`.
   b. If the option name is found in `alloptions`, use that raw value.
   c. Otherwise, check `notoptions` cache. If the option name is in `notoptions`, apply filter `default_option_{$option}` and return.
   d. Otherwise, check individual `options` cache for this key. If found, use that raw value.
   e. Otherwise, query the database: `SELECT option_value FROM wp_options WHERE option_name = ? LIMIT 1`. If found, populate the individual `options` cache. If not found, add to `notoptions` cache, apply `default_option_{$option}`, and return.
8. If installing: query the database directly with error suppression. If not found, apply `default_option_{$option}` and return.
9. Special case: if `option === 'home'` and the returned value is an empty string, return `get_option('siteurl')` instead.
10. Special case: options `'siteurl'`, `'home'`, `'category_base'`, `'tag_base'` have trailing slashes stripped from their value.
11. Apply filter `option_{$option}` to `maybe_unserialize(value)` and return the result.

**Value type handling:**

- Values retrieved from the database are raw strings (as stored). Serialized values are unserialized by `maybe_unserialize` at step 11.
- Non-string scalars (`false`, `true`, `0`, `1`, `null`) stored in the database are returned as their string equivalents (`""`, `"1"`, `"0"`, `"1"`, `""`). This is because the database column is `longtext`.
- Arrays and objects are serialized before being stored and unserialized when retrieved; they retain their original types.

---

### `update_option(option, value, autoload?)`

Updates an existing option. If the option does not exist, creates it.

**Parameters:**

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `option` | `string` | required | Option name. Trimmed. Empty string returns `false`. |
| `value` | `mixed` | required | New option value. Must be serializable. Objects are cloned before processing. |
| `autoload` | `boolean \| null` | `null` | Whether to autoload. `null` means re-evaluate using heuristics. See autoload system section. |

**Return value:** `boolean` — `true` if the value was changed and written, `false` otherwise (including when old and new values are identical).

**Execution order:**

1. Scalar option names are trimmed. Empty option names return `false`.
2. Deprecated key aliases are redirected.
3. `wp_protect_special_option` is called.
4. Object values are cloned.
5. `sanitize_option($option, $value)` is applied to sanitize the value.
6. `get_option($option)` is called to retrieve the old value.
7. Filter `pre_update_option_{$option}` is applied with `(value, oldValue, option)`.
8. Filter `pre_update_option` is applied with `(value, option, oldValue)`.
9. If `value === oldValue` or `maybe_serialize(value) === maybe_serialize(oldValue)`, return `false` (no change needed).
10. If `default_option_{$option}` filter returns the same value as `oldValue`, the option doesn't actually exist yet in the DB — delegate to `add_option(option, value, '', autoload)` and return its result.
11. Serialize the value: `serializedValue = maybe_serialize(value)`.
12. Fire action `update_option` with `(option, oldValue, value)`.
13. Determine the `autoload` column value:
    - If `autoload !== null`: call `wp_determine_option_autoload_value(option, value, serializedValue, autoload)`.
    - If `autoload === null`: query the current DB autoload value. If it is one of `'auto-on'`, `'auto-off'`, `'auto'` (an automatically determined value), re-run `wp_determine_option_autoload_value` and update the DB column if the result differs.
14. Run `UPDATE wp_options SET option_value = ?, [autoload = ?] WHERE option_name = ?`. If 0 rows affected, return `false`.
15. Remove option from `notoptions` cache if present.
16. Update the appropriate cache:
    - If autoload was not changed: if the option is in `alloptions`, update it there; otherwise update the individual key.
    - If autoload was changed to an autoload value: delete individual cache key, reload `alloptions`, set value in `alloptions`.
    - If autoload was changed to a non-autoload value: reload `alloptions`, remove the option from `alloptions`, set the individual cache key.
17. Fire action `update_option_{$option}` with `(oldValue, value, option)`.
18. Fire action `updated_option` with `(option, oldValue, value)`.
19. Return `true`.

---

### `add_option(option, value?, deprecated?, autoload?)`

Adds a new option. Does NOT overwrite existing options.

**Parameters:**

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `option` | `string` | required | Option name. |
| `value` | `mixed` | `''` | Option value. |
| `deprecated` | `string` | `''` | Unused third parameter. Triggers deprecation notice if non-empty. |
| `autoload` | `boolean \| null` | `null` | See autoload system section. |

**Return value:** `boolean` — `true` if added, `false` if already existed or on DB error.

**Execution order:**

1. Non-empty `deprecated` triggers a deprecation notice.
2. Scalar option names are trimmed. Empty option names return `false`.
3. Deprecated key aliases are redirected.
4. `wp_protect_special_option` is called.
5. Object values are cloned.
6. `sanitize_option($option, $value)` is applied.
7. Check if the option already exists: consult `notoptions` cache. If the option is NOT in `notoptions`, call `get_option($option)` and compare with `default_option_{$option}` — if `get_option` returns something other than the default, the option already exists; return `false`.
8. Serialize the value.
9. Call `wp_determine_option_autoload_value(option, value, serializedValue, autoload)` to resolve autoload.
10. Fire action `add_option` with `(option, value)`.
11. Run `INSERT INTO wp_options (option_name, option_value, autoload) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE ...`. If 0 rows affected, return `false`.
12. Update cache: if autoload is in the autoload set, add to `alloptions`; otherwise set individual cache key.
13. Re-read `notoptions` and remove this option from it if present. Write `notoptions` back to cache.
14. Fire action `add_option_{$option}` with `(option, value)`.
15. Fire action `added_option` with `(option, value)`.
16. Return `true`.

---

### `delete_option(option)`

Removes an option from the database.

**Parameters:**

| Parameter | Type | Notes |
|---|---|---|
| `option` | `string` | Option name. Trimmed. Empty string returns `false`. |

**Return value:** `boolean` — `true` if deleted, `false` if option did not exist or deletion failed.

**Execution order:**

1. Scalar option names are trimmed. Empty option names return `false`.
2. `wp_protect_special_option` is called.
3. Query `SELECT autoload FROM wp_options WHERE option_name = ?`. If no row exists, return `false`.
4. Fire action `delete_option` with `(option)`.
5. Execute `DELETE FROM wp_options WHERE option_name = ?`.
6. If NOT installing:
   a. If the option's old `autoload` value is in the autoload set, reload `alloptions` and remove the option from it, write back to cache.
   b. Otherwise, delete the individual `options` cache key.
   c. Add the option name to `notoptions` cache.
7. If deletion succeeded:
   a. Fire action `delete_option_{$option}` with `(option)`.
   b. Fire action `deleted_option` with `(option)`.
   c. Return `true`.
8. Return `false`.

---

### `get_options(options)`

Retrieves multiple options in a single database round-trip.

**Parameters:**

| Parameter | Type | Notes |
|---|---|---|
| `options` | `string[]` | Array of option names to retrieve. |

**Return value:** `Record<string, mixed>` — associative array of option name to value. Primes caches first with `wp_prime_option_caches()`, then calls `get_option()` for each.

---

### `wp_prime_option_caches(options)`

Pre-warms the options cache for a set of option names using a single database query. Only fetches options not already in any cache layer (alloptions, notoptions, or individual options cache).

**Parameters:**

| Parameter | Type | Notes |
|---|---|---|
| `options` | `string[]` | Array of option names to prime. |

Inserts found values (raw, not unserialized) into the `options` cache group. Inserts not-found names into `notoptions`.

---

### `wp_prime_option_caches_by_group(optionGroup)`

Calls `wp_prime_option_caches()` for all options registered under the given option group (from `$new_allowed_options`).

---

### `wp_load_alloptions(forceCache?)`

Loads and returns all autoloaded options as a raw key-value map. This is the primary warm-up function called at the start of every request.

**Parameters:**

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `forceCache` | `boolean` | `false` | If `true`, bypasses the local cache and forces a fresh read from the persistent cache or database. |

**Return value:** `Record<string, string>` — raw (not unserialized) values for all autoloaded options.

**Execution order:**

1. Apply filter `pre_wp_load_alloptions` with `(null, forceCache)`. If the filter returns an array, return it immediately.
2. If NOT installing OR NOT multisite, attempt `wp_cache_get('alloptions', 'options', forceCache)`.
3. If not cached: query `SELECT option_name, option_value FROM wp_options WHERE autoload IN (...)` using the values from `wp_autoload_values_to_autoload()`. If this returns no rows, fall back to fetching ALL options (no autoload filter).
4. If NOT installing OR NOT multisite: apply filter `pre_cache_alloptions` to the result array, then call `wp_cache_add('alloptions', result, 'options')`.
5. Apply filter `alloptions` to the array and return it.

---

### `wp_set_option_autoload(option, autoload)`

Sets the autoload value for a single option without changing its value.

**Return value:** `boolean` — whether the autoload value was actually changed (false if it was already set to the same value).

---

### `wp_set_options_autoload(options, autoload)`

Sets the same autoload value for multiple options. Wrapper for `wp_set_option_autoload_values`.

---

### `wp_set_option_autoload_values(options)`

Sets potentially different autoload values for multiple options in up to two UPDATE queries (one for 'on', one for 'off'). Only updates options where the current autoload value differs from the requested value.

**Parameters:**

| Parameter | Type | Notes |
|---|---|---|
| `options` | `Record<string, boolean \| 'on' \| 'off' \| 'yes' \| 'no'>` | Map of option name to desired autoload state. |

**Return value:** `Record<string, boolean>` — per-option success flag.

**Cache invalidation:** If any options were changed to an autoload-on value, deletes their individual cache keys and deletes the entire `alloptions` cache. If options were changed to autoload-off only, removes them from the `alloptions` cache array and writes it back.

---

### `wp_determine_option_autoload_value(option, value, serializedValue, autoload)` _(private)_

Resolves the concrete database autoload string from the provided autoload argument. Returns one of: `'on'`, `'off'`, `'auto-on'`, `'auto-off'`, `'auto'`.

| Input `autoload` | Return value |
|---|---|
| `true` | `'on'` |
| `false` | `'off'` |
| `'on'` or `'yes'` | `'on'` |
| `'off'` or `'no'` | `'off'` |
| `null` or anything else | Apply filter `wp_default_autoload_value(null, option, value, serializedValue)`. If filter returns `true` → `'auto-on'`. If `false` → `'auto-off'`. If `null` → `'auto'`. |

The built-in filter `wp_filter_default_autoload_value_via_option_size` is registered on `wp_default_autoload_value`. It returns `false` (suppress autoload) if `strlen(serializedValue) > 150000` (filterable via `wp_max_autoloaded_option_size`). Default threshold: 150,000 bytes.

---

### `wp_autoload_values_to_autoload()`

Returns the array of database autoload column values that constitute "autoloading". Default: `['yes', 'on', 'auto-on', 'auto']`. Filterable via `wp_autoload_values_to_autoload`, but the filter can only remove values from the default set, not add new ones (the return is intersected with the default).

---

### `wp_protect_special_option(option)` _(internal)_

If `option` is `'alloptions'` or `'notoptions'`, calls `wp_die()` immediately. Called at the beginning of all write operations.

---

## 4. Autoload System, Network Options, and Transients

### 4.1 The Autoload System

**Purpose:** Autoloading amortizes the cost of individual `get_option()` calls. All autoloaded options are fetched in a single query at startup (`wp_load_alloptions()`), stored in the `alloptions` object cache entry, and served from memory for the rest of the request.

**The `alloptions` cache:** An in-memory map of `{ optionName → rawValue }`. Values are stored raw (not deserialized). Deserialization happens at the `get_option` call site via `maybe_unserialize`. This cache is populated once per request on the first call to `wp_load_alloptions()`. Subsequent calls return the cached value unless `forceCache = true` is passed.

**The `notoptions` cache:** An in-memory set of option names confirmed to not exist in the database. This prevents repeated database queries for non-existent options. When `get_option('nonexistent')` is first called, it queries the DB, finds nothing, and adds the name to `notoptions`. On subsequent calls within the same request, the cache hit returns immediately.

**Lookup order for `get_option`:**
1. `alloptions` (autoloaded options, fastest)
2. `notoptions` (known-absent options, avoids DB hit)
3. Individual `options` cache entry (non-autoloaded options that were previously looked up)
4. Database query (cache miss, also populates individual or notoptions cache)

**Autoload decision (for new options):**
- Explicit `true`/`false` from caller → `'on'`/`'off'`.
- `null` (default) → heuristic via `wp_determine_option_autoload_value`:
  - Built-in heuristic: if serialized value > 150,000 bytes, use `'auto-off'`.
  - If no clear decision: `'auto'` (treated as autoload-on by the system).
- For `update_option`, passing `autoload = null` also re-evaluates heuristics for existing `'auto-*'` options, which may update the DB column on the next write.

**Autoload value semantics in the DB:**

| DB value | Autoloads? | Set by |
|---|---|---|
| `'on'` | Yes | Explicit `true` |
| `'off'` | No | Explicit `false` |
| `'auto-on'` | Yes | Heuristic decision: autoload |
| `'auto-off'` | No | Heuristic decision: don't autoload |
| `'auto'` | Yes | Heuristic was indeterminate |
| `'yes'` | Yes | Legacy backward compat |
| `'no'` | No | Legacy backward compat |

---

### 4.2 Network Options (Multisite)

Network options are scoped to a network (multisite installation). The public API is via `get_site_option` / `update_site_option` / `add_site_option` / `delete_site_option`, which are all wrappers for the `*_network_option` family with `networkId = null` (meaning: current network).

**Storage:**
- On single-site: network options fall back to regular site options. `get_network_option` calls `get_option`, `add_network_option` calls `add_option(..., false)` (no autoload), etc.
- On multisite: stored in `wp_sitemeta` table with `site_id = networkId`, `meta_key = optionName`, `meta_value = serializedValue`.

**Caching:**
- Cache group: `'site-options'`
- Individual option cache key: `"${networkId}:${optionName}"` → unserialized value
- Not-found tracking: `"${networkId}:notoptions"` → `{ [optionName]: true }`

**Key differences from site options:**
- No autoload system for network options. Each option is cached individually.
- Network options store unserialized values in the cache (site options store raw strings).
- `add_network_option` does NOT accept an `autoload` parameter.

**`get_network_option(networkId, option, defaultValue?)` execution order:**
1. Normalize `networkId` (default to current network).
2. Apply `pre_site_option_{$option}` filter. Short-circuit if non-false returned.
3. Apply `pre_site_option` filter. Short-circuit if non-false returned.
4. Check `notoptions` cache (`"${networkId}:notoptions"`). If option is in it, apply `default_site_option_{$option}` and return.
5. On single-site: apply `default_site_option_{$option}` filter to default, then call `get_option(option, default)`.
6. On multisite: check individual cache key `"${networkId}:${optionName}"`. If miss, query `SELECT meta_value FROM wp_sitemeta WHERE meta_key = ? AND site_id = ?`. If found, unserialize and cache. If not found, add to notoptions cache, apply `default_site_option_{$option}`, return.
7. Apply `site_option_{$option}` filter and return.

**`add_network_option(networkId, option, value)`:**
- Calls `wp_protect_special_option`.
- Applies `pre_add_site_option_{$option}` filter to value.
- On multisite: checks notoptions cache, then calls `get_network_option` to confirm non-existence. Sanitizes value, serializes, inserts into `wp_sitemeta`. On success: sets cache, updates notoptions.
- Fires `add_site_option_{$option}` and `add_site_option` actions on success.

**`delete_network_option(networkId, option)`:**
- Fires `pre_delete_site_option_{$option}` action.
- On multisite: queries for `meta_id`, deletes from `wp_sitemeta`, deletes from cache, adds to notoptions.
- On success: fires `delete_site_option_{$option}` and `delete_site_option` actions.

**`update_network_option(networkId, option, value)`:**
- Fetches old value, applies `pre_update_site_option_{$option}` filter.
- Returns `false` if value unchanged.
- If old value is `false`, calls `add_network_option`.
- On multisite: sanitizes, serializes, runs UPDATE on `wp_sitemeta`. On success: updates cache, removes from notoptions.
- Fires `update_site_option_{$option}` and `update_site_option` actions on success.

**Bulk cache priming:**
- `wp_prime_network_option_caches(networkId, options)`: loads multiple network options in a single `SELECT ... WHERE meta_key IN (...)` query. Populates cache and notoptions.
- `wp_prime_site_option_caches(options)`: wrapper for current network.
- `wp_load_core_site_options(networkId?)`: primes a hardcoded list of core network options: `['site_name', 'siteurl', 'active_sitewide_plugins', '_site_transient_timeout_theme_roots', '_site_transient_theme_roots', 'site_admins', 'can_compress_scripts', 'global_terms_enabled', 'ms_files_rewriting', 'WPLANG']`.

---

### 4.3 Transients

Transients are ephemeral key-value pairs with optional expiration. They use a two-mode storage strategy:

**Mode 1: External object cache present** (`wp_using_ext_object_cache() === true` or `wp_installing() === true`):
- Transients map directly to the object cache.
- `get_transient($t)` → `wp_cache_get($t, 'transient')`
- `set_transient($t, $v, $exp)` → `wp_cache_set($t, $v, 'transient', $exp)`
- `delete_transient($t)` → `wp_cache_delete($t, 'transient')`
- The external cache is responsible for enforcing TTL natively.

**Mode 2: No external object cache** (default WordPress install):
- Transients are stored as options in `wp_options`.
- Transient value stored under option name `_transient_{$transient}`.
- Expiration time (as a Unix timestamp) stored under option name `_transient_timeout_{$transient}`.
- If there is no expiration, only the value option is stored (no timeout option). The value option is autoloaded (`true`).
- If there is an expiration, the value option is NOT autoloaded (`false`). The timeout option is also NOT autoloaded.

**`get_transient(transient)`:**
1. Apply `pre_transient_{$transient}` filter. Short-circuit if non-false returned.
2. External cache mode: `wp_cache_get(transient, 'transient')`.
3. DB mode:
   a. Check `alloptions` for `_transient_{$transient}`.
   b. If NOT in `alloptions` (meaning it has a timeout): prime the cache for both `_transient_{$transient}` and `_transient_timeout_{$transient}`. Read the timeout option. If it exists and `timeout < time()`: delete both options, set `value = false`.
   c. If value not yet resolved: `get_option('_transient_' . transient)`.
4. Apply `transient_{$transient}` filter to value and return.

**`set_transient(transient, value, expiration?)`:**
- `expiration` defaults to `0` (no expiration, stored as autoloaded option).
- Applies `pre_set_transient_{$transient}` filter to `value`.
- Applies `expiration_of_transient_{$transient}` filter to `expiration`.
- External cache mode: `wp_cache_set(transient, value, 'transient', expiration)`.
- DB mode:
  - Prime caches for both option names.
  - If option does not exist yet (`get_option('_transient_' . t) === false`):
    - If `expiration > 0`: `add_option('_transient_timeout_' . t, time() + expiration, '', false)`, then `add_option('_transient_' . t, value, '', false)` (not autoloaded).
    - If `expiration === 0`: `add_option('_transient_' . t, value, '', true)` (autoloaded).
  - If option already exists:
    - If `expiration > 0` and timeout option does not exist: delete value option, re-add both (this handles the case where an existing non-expiring transient is given an expiration).
    - Otherwise: `update_option('_transient_timeout_' . t, time() + expiration)` if needed, then `update_option('_transient_' . t, value)`.
- On success: fires `set_transient_{$transient}(value, expiration, transient)`, `set_transient(transient, value, expiration)`, and deprecated `setted_transient` actions.

**Transient name length limit:** 172 characters.

**`delete_transient(transient)`:**
1. Fire `delete_transient_{$transient}` action.
2. External cache mode: `wp_cache_delete(transient, 'transient')`.
3. DB mode: `delete_option('_transient_' . transient)`. If successful, also `delete_option('_transient_timeout_' . transient)`.
4. On success: fire `deleted_transient` action.

**`delete_expired_transients(forceDb?)`:**
Performs a multi-table JOIN DELETE to clean up all expired transients in a single query. Does nothing if external object cache is in use (unless `forceDb = true`). Handles single-site (`wp_options` for site transients) and multisite (`wp_sitemeta` for network transients) in separate queries.

---

### 4.4 Network Transients

Network transients follow the same pattern as regular transients, but use `get_site_option`/`update_site_option`/`add_site_option`/`delete_site_option` for DB-mode storage, and `'site-transient'` as the object cache group.

**Option name prefix:** `_site_transient_{$transient}` (value) and `_site_transient_timeout_{$transient}` (expiration).

**`get_site_transient(transient)`:**
- Filter: `pre_site_transient_{$transient}`.
- External cache: `wp_cache_get(transient, 'site-transient')`.
- DB mode: hardcoded no-timeout list for core transients `['update_core', 'update_plugins', 'update_themes']` — these skip the timeout check. All others check `_site_transient_timeout_{$transient}` via `get_site_option()`.
- Filter: `site_transient_{$transient}`.

**`set_site_transient(transient, value, expiration?)`:**
- Applies `pre_set_site_transient_{$transient}` filter.
- Applies `expiration_of_site_transient_{$transient}` filter.
- External cache: `wp_cache_set(transient, value, 'site-transient', expiration)`.
- DB mode: follows same new/existing logic as `set_transient` but uses `add_site_option`/`update_site_option`. Unlike site transients, there is no "autoload for non-expiring" logic — site options do not have an autoload parameter in the `add_site_option` API.
- On success: fires `set_site_transient_{$transient}`, `set_site_transient`, and deprecated `setted_site_transient` actions.

**Site transient name length limit:** 167 characters.

**`delete_site_transient(transient)`:**
- Fires `delete_site_transient_{$transient}`.
- External cache: `wp_cache_delete(transient, 'site-transient')`.
- DB mode: `delete_site_option('_site_transient_' . transient)`. On success: also `delete_site_option('_site_transient_timeout_' . transient)`.
- On success: fires `deleted_site_transient`.

---

### 4.5 Setting Registration

**`register_setting(optionGroup, optionName, args?)`**

Registers an option with metadata for use by the Settings API and REST API.

| `args` field | Type | Default | Notes |
|---|---|---|---|
| `type` | `string` | `'string'` | One of `'string'`, `'boolean'`, `'integer'`, `'number'`, `'array'`, `'object'` |
| `label` | `string` | `''` | Human-readable label |
| `description` | `string` | `''` | Human-readable description |
| `sanitize_callback` | `callable \| null` | `null` | Registered as `sanitize_option_{$optionName}` filter if set |
| `show_in_rest` | `boolean \| object` | `false` | Whether to expose in REST API |
| `default` | `mixed` | (unset) | If set, registered as `default_option_{$optionName}` filter via `filter_default_option` |
| `group` | `string` | `$optionGroup` | Internal copy |

Side effects:
- Option name is added to `$new_allowed_options[$optionGroup]`.
- `sanitize_callback` is added as a filter on `sanitize_option_{$optionName}`.
- If a `default` is provided, `filter_default_option` is added as a filter on `default_option_{$optionName}` at priority 10.
- Fires `register_setting` action.
- Deprecated groups: `'misc'` is redirected to `'general'`; `'privacy'` is redirected to `'reading'`.

**`unregister_setting(optionGroup, optionName)`**

Reverses all effects of `register_setting`. Removes from `$new_allowed_options`, removes the sanitize filter, removes the default filter, fires `unregister_setting` action.

**`get_registered_settings()`**

Returns the `$wp_registered_settings` global as-is, or an empty array if uninitialized.

**`filter_default_option(defaultValue, option, passedDefault)`**

Internal filter callback registered by `register_setting` when a `default` is provided. Returns `defaultValue` unchanged if the caller explicitly passed a default (i.e., `passedDefault === true`). Otherwise returns the registered default from `$wp_registered_settings`.

---

## 5. Hooks Reference

### Filters on `get_option`

| Filter | Args | Short-circuits? | Notes |
|---|---|---|---|
| `pre_option_{$option}` | `(false, option, defaultValue)` | Yes, if non-false returned | Option-specific pre-retrieval override |
| `pre_option` | `(preValue, option, defaultValue)` | Yes, if non-false returned | Universal pre-retrieval override (since 6.1) |
| `default_option_{$option}` | `(defaultValue, option, passedDefault)` | N/A — returned when option missing | Customize per-option default |
| `option_{$option}` | `(unserializedValue, option)` | No | Transform retrieved value |
| `pre_wp_load_alloptions` | `(null, forceCache)` | Yes, if array returned | Override full alloptions load |
| `pre_cache_alloptions` | `(alloptions)` | No | Filter alloptions before caching |
| `alloptions` | `(alloptions)` | No | Filter alloptions after retrieval |

### Filters on `update_option`

| Filter | Args | Notes |
|---|---|---|
| `pre_update_option_{$option}` | `(value, oldValue, option)` | Option-specific pre-update transform |
| `pre_update_option` | `(value, option, oldValue)` | Universal pre-update transform |
| `wp_default_autoload_value` | `(null, option, value, serializedValue)` | Determines heuristic autoload value |
| `wp_max_autoloaded_option_size` | `(150000, option)` | Max autoload byte size threshold |
| `wp_autoload_values_to_autoload` | `(defaultValues)` | Restrict which DB values trigger autoloading |

### Filters on `add_network_option` / `update_network_option`

| Filter | Args | Notes |
|---|---|---|
| `pre_add_site_option_{$option}` | `(value, option, networkId)` | Transform value before adding |
| `pre_update_site_option_{$option}` | `(value, oldValue, option, networkId)` | Transform value before updating |
| `pre_site_option_{$option}` | `(false, option, networkId, defaultValue)` | Short-circuit get |
| `pre_site_option` | `(preValue, option, networkId, defaultValue)` | Universal short-circuit get (since 6.9) |
| `default_site_option_{$option}` | `(defaultValue, option, networkId)` | Default for missing network option |
| `site_option_{$option}` | `(value, option, networkId)` | Transform retrieved network option |

### Filters on transients

| Filter | Args | Notes |
|---|---|---|
| `pre_transient_{$transient}` | `(false, transient)` | Short-circuit get |
| `transient_{$transient}` | `(value, transient)` | Transform retrieved value |
| `pre_set_transient_{$transient}` | `(value, expiration, transient)` | Transform value before set |
| `expiration_of_transient_{$transient}` | `(expiration, value, transient)` | Modify expiration before set |
| `pre_site_transient_{$transient}` | `(false, transient)` | Short-circuit get (network) |
| `site_transient_{$transient}` | `(value, transient)` | Transform retrieved value (network) |
| `pre_set_site_transient_{$transient}` | `(value, transient)` | Transform value before set (network) |
| `expiration_of_site_transient_{$transient}` | `(expiration, value, transient)` | Modify expiration before set (network) |

### Actions

| Action | Args | When fired |
|---|---|---|
| `add_option` | `(option, value)` | Before option is inserted |
| `add_option_{$option}` | `(option, value)` | After option is inserted (success only) |
| `added_option` | `(option, value)` | After option is inserted (success only) |
| `update_option` | `(option, oldValue, value)` | Before option is updated |
| `update_option_{$option}` | `(oldValue, value, option)` | After option is updated (success only) |
| `updated_option` | `(option, oldValue, value)` | After option is updated (success only) |
| `delete_option` | `(option)` | Before option is deleted |
| `delete_option_{$option}` | `(option)` | After option is deleted (success only) |
| `deleted_option` | `(option)` | After option is deleted (success only) |
| `add_site_option_{$option}` | `(option, value, networkId)` | After network option is inserted |
| `add_site_option` | `(option, value, networkId)` | After network option is inserted |
| `pre_delete_site_option_{$option}` | `(option, networkId)` | Before network option is deleted |
| `delete_site_option_{$option}` | `(option, networkId)` | After network option is deleted |
| `delete_site_option` | `(option, networkId)` | After network option is deleted |
| `update_site_option_{$option}` | `(option, value, oldValue, networkId)` | After network option is updated |
| `update_site_option` | `(option, value, oldValue, networkId)` | After network option is updated |
| `delete_transient_{$transient}` | `(transient)` | Before transient is deleted |
| `deleted_transient` | `(transient)` | After transient is deleted (success) |
| `set_transient_{$transient}` | `(value, expiration, transient)` | After transient is set (success) |
| `set_transient` | `(transient, value, expiration)` | After transient is set (success, since 6.8) |
| `delete_site_transient_{$transient}` | `(transient)` | Before site transient is deleted |
| `deleted_site_transient` | `(transient)` | After site transient is deleted (success) |
| `set_site_transient_{$transient}` | `(value, expiration, transient)` | After site transient is set (success) |
| `set_site_transient` | `(transient, value, expiration)` | After site transient is set (success, since 6.8) |
| `register_setting` | `(optionGroup, optionName, args)` | During `register_setting` |
| `unregister_setting` | `(optionGroup, optionName)` | During `unregister_setting` |

---

## 6. TypeScript Interface Sketch

```typescript
// Autoload column values
type AutoloadValue = 'on' | 'off' | 'auto-on' | 'auto-off' | 'auto' | 'yes' | 'no';
type AutoloadInput = boolean | null | 'on' | 'off' | 'yes' | 'no' | 'auto-on' | 'auto-off' | 'auto';

// Raw option row as stored in database
interface OptionRow {
  optionId: number;
  optionName: string;
  optionValue: string;   // always a raw string; may be serialized
  autoload: AutoloadValue;
}

// Registered setting metadata
interface RegisteredSettingArgs {
  type: 'string' | 'boolean' | 'integer' | 'number' | 'array' | 'object';
  group: string;
  label: string;
  description: string;
  sanitizeCallback: ((value: unknown) => unknown) | null;
  showInRest: boolean | { name?: string; schema?: object };
  default?: unknown;
}

// The in-memory state of the options layer
interface OptionsState {
  // Cache group 'options'
  alloptions: Record<string, string> | null;        // null = not yet loaded
  notoptions: Record<string, true>;                 // set of known-absent option names
  individualCache: Record<string, string>;          // keyed by option name, raw value

  // Cache group 'site-options' (multisite)
  // keys are "${networkId}:${optionName}" or "${networkId}:notoptions"
  siteOptionsCache: Record<string, unknown>;
}

// Primary site option API
interface SiteOptionsAPI {
  getOption(option: string, defaultValue?: unknown): unknown;
  updateOption(option: string, value: unknown, autoload?: AutoloadInput): boolean;
  addOption(option: string, value?: unknown, deprecated?: string, autoload?: AutoloadInput): boolean;
  deleteOption(option: string): boolean;
  getOptions(options: string[]): Record<string, unknown>;
  wpPrimeOptionCaches(options: string[]): void;
  wpPrimeOptionCachesByGroup(optionGroup: string): void;
  wpLoadAlloptions(forceCache?: boolean): Record<string, string>;
  wpSetOptionAutoload(option: string, autoload: AutoloadInput): boolean;
  wpSetOptionsAutoload(options: string[], autoload: AutoloadInput): Record<string, boolean>;
  wpSetOptionAutoloadValues(options: Record<string, AutoloadInput>): Record<string, boolean>;
  wpProtectSpecialOption(option: string): void;  // throws on 'alloptions' or 'notoptions'
  wpAutoloadValuesToAutoload(): AutoloadValue[];
  wpDetermineOptionAutoloadValue(
    option: string,
    value: unknown,
    serializedValue: string,
    autoload: AutoloadInput
  ): AutoloadValue;
}

// Network option API
interface NetworkOptionsAPI {
  getNetworkOption(networkId: number | null, option: string, defaultValue?: unknown): unknown;
  addNetworkOption(networkId: number | null, option: string, value: unknown): boolean;
  deleteNetworkOption(networkId: number | null, option: string): boolean;
  updateNetworkOption(networkId: number | null, option: string, value: unknown): boolean;
  wpPrimeNetworkOptionCaches(networkId: number | null, options: string[]): void;
  wpPrimeSiteOptionCaches(options: string[]): void;
  wpLoadCoreSiteOptions(networkId?: number | null): void;

  // Convenience wrappers (use current network ID)
  getSiteOption(option: string, defaultValue?: unknown): unknown;
  addSiteOption(option: string, value: unknown): boolean;
  deleteSiteOption(option: string): boolean;
  updateSiteOption(option: string, value: unknown): boolean;
}

// Transient API
interface TransientsAPI {
  getTransient(transient: string): unknown;
  setTransient(transient: string, value: unknown, expiration?: number): boolean;
  deleteTransient(transient: string): boolean;
  deleteExpiredTransients(forceDb?: boolean): void;

  getSiteTransient(transient: string): unknown;
  setSiteTransient(transient: string, value: unknown, expiration?: number): boolean;
  deleteSiteTransient(transient: string): boolean;
}

// Setting registration API
interface SettingsRegistrationAPI {
  registerSetting(optionGroup: string, optionName: string, args?: Partial<RegisteredSettingArgs> | ((value: unknown) => unknown)): void;
  unregisterSetting(optionGroup: string, optionName: string, deprecated?: string): void;
  getRegisteredSettings(): Record<string, RegisteredSettingArgs>;
}

// Serialization helpers (equivalent of PHP's maybe_serialize / maybe_unserialize)
interface SerializationHelpers {
  maybeSerialize(value: unknown): string;
  maybeUnserialize(value: string): unknown;
}
```

---

## 7. Design Patterns to Carry Over

1. **Three-tier lookup hierarchy.** Every `get_option` call checks in-memory alloptions first, then notoptions, then the individual object cache key, then the database. Short-circuiting at each tier is critical for performance. Implementing only DB lookups defeats the purpose of this system.

2. **The `notoptions` negative cache is not optional.** Without it, every call to `get_option('nonexistent')` within a request hits the database. Many WordPress features call `get_option` defensively to check for existence. The notoptions set must be initialized on first use and cleared accurately on write operations.

3. **Raw values in `alloptions`, unserialized at read time.** The `alloptions` cache stores the raw database strings. Deserialization is deferred to `get_option` at the point of return (after the `option_{$option}` filter). This means the cache can be shared across callers with different type expectations.

4. **Values are equal by serialized representation, not PHP equality.** The `update_option` no-op check is: `value === oldValue || maybe_serialize(value) === maybe_serialize(oldValue)`. This is necessary because two logically identical objects may not pass a strict equality check.

5. **`update_option` falls through to `add_option` for new options.** If `update_option` is called and the current stored value equals the registered default (i.e., the option doesn't actually exist in the DB), it calls `add_option` instead of running an UPDATE that would affect zero rows.

6. **Transients are a leaky abstraction over two different systems.** When an external object cache is present, transients are cache entries with native TTL. When no external cache is present, they are pairs of `wp_options` rows. The storage format is completely different in each mode. Code that deletes a transient must use `delete_transient()`, not `delete_option('_transient_' . name)`.

7. **Network options use a different cache key format and cache group.** Single-site and network option caches are fully separate. The key `"${networkId}:${optionName}"` in group `'site-options'` is categorically different from key `optionName` in group `'options'`.

8. **Autoload decisions are re-evaluated on update for heuristic values.** Options stored with `'auto'`, `'auto-on'`, or `'auto-off'` have their autoload re-evaluated every time `update_option` is called with `autoload = null`. An option whose value grows past 150,000 bytes may have its autoload automatically changed from `'auto-on'` to `'auto-off'` on the next update.

9. **`pre_option_{$option}` false means "not intercepted."** The convention throughout is that `false` is the sentinel value meaning "no override." Any truthy or falsy-non-false value from a filter is a real override. Callers must use `!== false` to detect a genuine stored `false` value; hence the `$found` by-reference parameter in the cache layer.

10. **`register_setting` ties together three orthogonal concerns.** A single call registers: (a) permission for the Settings API to save the option, (b) a sanitization callback, and (c) a default value override. These are all implemented as filters and can be reproduced without the registration system, but the registration provides the canonical integration point.

---

## 8. Tovu Reconstruction Notes

### 8.1 Why this exists

This subsystem exists because "configuration" in WordPress spans cached options, network options, transients, and settings registration. It provides a shared read/write path plus caching behavior that the rest of the system assumes is cheap and always available.

### 8.2 What Tovu should preserve

- A single configuration API rather than ad hoc table reads and writes across the codebase
- Multi-tier caching, including negative caching for missing keys
- A separate transient/TTL abstraction for short-lived coordination and cached computations
- One registration point for defaults, sanitizers, and writable-setting metadata

### 8.3 What Tovu can simplify

- Tovu can use typed stores instead of serialized PHP values as long as the access semantics stay centralized
- Autoload heuristics can be simpler at first if cache behavior is still explicit and observable
- Network- or tenant-scoped config can be implemented with clearer primitives than WordPress's site-option conventions

### 8.4 Possible Tovu seams

- `src/features/config/` for options and settings registration
- `src/core/ports/OptionStorePort.ts` for persistent config access
- `src/core/ports/TransientStorePort.ts` for TTL-backed temporary state
- `src/core/ports/SettingsRegistryPort.ts` for defaults, sanitizers, and save permissions

### 8.5 Suggested priority

- `V1`: centralized option API, negative cache, transient TTL store, settings registration seam
- `Later`: richer autoload heuristics, tenant/network cache nuance, and compatibility migrations
