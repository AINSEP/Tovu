# Object Cache — Specification

**Source files analyzed:**
- `wp-includes/cache.php`
- `wp-includes/class-wp-object-cache.php`

---

## 1. Overview

The WordPress Object Cache is a request-scoped in-memory store for arbitrary data. Its primary purpose is to reduce redundant database queries within a single HTTP request. Results from the database (posts, terms, users, options) are placed in the cache on first retrieval and served from memory on subsequent requests.

The system has two layers:

1. **The built-in in-process cache** (`WP_Object_Cache` class in `class-wp-object-cache.php`): a plain PHP associative array that lives only for the duration of the current process. Data does not survive across requests. This is always present as the baseline implementation.

2. **The drop-in persistent cache** (`wp-content/object-cache.php`): an optional file that, if present, completely replaces the built-in implementation. When loaded, WordPress will not instantiate `WP_Object_Cache` at all, and the file must provide its own implementations of all the global `wp_cache_*` functions. The persistent cache is typically backed by Memcached, Redis, APCu, or similar external stores that share state across requests and processes.

The entire public API is a set of global functions (`wp_cache_get`, `wp_cache_set`, etc.) that delegate to a single global instance, `$wp_object_cache`. The instance is created during bootstrap by `wp_cache_init()`.

**All cache data is namespaced by group.** The same key may exist in multiple groups simultaneously with independent values. This is the primary isolation mechanism.

---

## 2. Global State / Data Structures

### Global Instance

```typescript
// Single global instance, created by wp_cache_init()
let wpObjectCache: WPObjectCache;
```

`wp_cache_init()` creates a new `WP_Object_Cache` instance and assigns it to `$GLOBALS['wp_object_cache']`. All public functions reference this global.

### `WP_Object_Cache` Internal State

```typescript
interface WPObjectCacheState {
  // Primary storage: group → key → value
  // Object values are cloned on set and on get (deep isolation).
  cache: Record<string, Record<string | number, unknown>>;

  // Hit/miss counters (public, readable by diagnostic code)
  cacheHits: number;
  cacheMisses: number;

  // Set of groups that are not blog-specific in multisite.
  // Stored as { [groupName: string]: true } (a hash set).
  globalGroups: Record<string, true>;

  // The prefix prepended to cache keys for non-global groups in multisite.
  // On single-site: empty string ''.
  // On multisite: "${blogId}:" (e.g., "3:" for blog ID 3).
  blogPrefix: string;

  // Whether the current install is multisite.
  multisite: boolean;
}
```

### Key Derivation (Multisite)

In a multisite install, non-global group cache keys are prefixed with the current blog ID to prevent data from one site bleeding into another. The effective storage key differs from the key provided by the caller:

- If `multisite === false` OR the group is in `globalGroups`:
  - Effective key = provided key (unchanged)
- If `multisite === true` AND the group is NOT in `globalGroups`:
  - Effective key = `"${blogPrefix}${key}"` where `blogPrefix` is `"${blogId}:"`

This prefixing is applied internally inside `set`, `get`, `delete`, `incr`, `decr`, `add`, and `replace`. It is transparent to callers.

### Object Cloning

When a value being stored is an object, it is cloned via shallow copy (`clone` in PHP). This is applied on both `set` and on `get`. The result is that:

- The value stored in the cache is isolated from the caller's object after the `set` call.
- Each `get` call returns a fresh clone, so modifying the returned object does not affect the cached value or subsequent `get` calls.

This behavior applies only to objects (reference types). Scalar and array values are copied by value in PHP, so no explicit cloning is needed for them.

---

## 3. Complete Public API

### `wp_cache_init()`

Creates a new `WP_Object_Cache` instance and assigns it to the `$wp_object_cache` global. Called once during WordPress bootstrap. Calling it again completely resets the cache (used in unit tests).

---

### `wp_cache_get(key, group?, force?, &found?)`

Retrieves a value from the cache.

**Parameters:**

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `key` | `int \| string` | required | Cache key. Must be an integer or a non-empty string. |
| `group` | `string` | `''` | Cache group. Empty string is coerced to `'default'`. |
| `force` | `boolean` | `false` | In the built-in implementation, unused. For drop-in caches, signals that the local in-process copy should be refreshed from the persistent backend. |
| `found` | `boolean \| null` (by reference) | `null` | Set to `true` if the key existed in the cache, `false` if not. Disambiguates a legitimate stored `false` value from a cache miss. |

**Return value:** `mixed | false` — the cached value on success, `false` on cache miss (but see `found` parameter).

**Behavior:**
1. Validate key via `is_valid_key`. Return `false` if invalid.
2. Normalize group to `'default'` if empty.
3. Apply blog prefix to key if multisite and non-global group.
4. Check if key exists in `cache[group]` using both `isset` and `array_key_exists` (to correctly handle stored `null` values).
5. If found: increment `cacheHits`, set `found = true`, return a clone if the value is an object, otherwise return the value directly.
6. If not found: increment `cacheMisses`, set `found = false`, return `false`.

---

### `wp_cache_set(key, data, group?, expire?)`

Stores a value in the cache. Always writes, regardless of whether the key already exists.

**Parameters:**

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `key` | `int \| string` | required | Cache key. |
| `data` | `mixed` | required | Value to store. Objects are cloned. |
| `group` | `string` | `''` | Cache group. |
| `expire` | `int` | `0` | TTL in seconds. `0` = no expiration. In the built-in implementation, this parameter is accepted but **not enforced** — the in-process cache has no TTL mechanism. Drop-in implementations are expected to honor it. |

**Return value:** `boolean` — `true` if the value was stored, `false` if the key is invalid.

**Behavior:**
1. Validate key. Return `false` if invalid.
2. Normalize group.
3. Apply blog prefix to key if needed.
4. If value is an object, clone it.
5. Assign `cache[group][key] = value`.
6. Return `true`.

---

### `wp_cache_add(key, data, group?, expire?)`

Stores a value only if the key does NOT already exist in the cache.

**Parameters:** Same as `wp_cache_set`.

**Return value:** `boolean` — `true` on success, `false` if the key already exists in the cache or if key is invalid or if cache addition is suspended.

**Behavior:**
1. If `wp_suspend_cache_addition()` returns `true`, return `false` immediately. This is a global suspension mechanism used during imports to prevent the cache from being filled with data that will immediately be stale.
2. Validate key.
3. Normalize group.
4. Compute the prefixed ID (same logic as in `set`).
5. Call `_exists(prefixedId, group)`. If the key already exists, return `false`.
6. Delegate to `set(key, data, group, expire)` — note: `set` re-applies the prefix independently.
7. Return result of `set`.

---

### `wp_cache_add_multiple(data, group?, expire?)`

Calls `wp_cache_add` for each key-value pair in `data`. Returns an associative array of `{ key: boolean }` results.

**Parameters:**

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `data` | `Record<string \| number, unknown>` | required | Map of keys to values. |
| `group` | `string` | `''` | Group for all entries. |
| `expire` | `int` | `0` | TTL for all entries. |

---

### `wp_cache_replace(key, data, group?, expire?)`

Updates a value only if the key DOES already exist in the cache. Inverse condition of `wp_cache_add`.

**Parameters:** Same as `wp_cache_set`.

**Return value:** `boolean` — `true` if the value existed and was replaced, `false` if key does not exist or is invalid.

**Behavior:**
1. Validate key.
2. Normalize group.
3. Compute prefixed ID.
4. Call `_exists(prefixedId, group)`. If key does NOT exist, return `false`.
5. Delegate to `set(key, data, group, expire)`.
6. Return result of `set`.

---

### `wp_cache_set_multiple(data, group?, expire?)`

Calls `wp_cache_set` for each key-value pair. Returns an associative array of `{ key: boolean }` results. In the built-in implementation, all values are always `true` (since `set` only fails on invalid keys, and PHP's associative array keys are always valid).

---

### `wp_cache_get_multiple(keys, group?, force?)`

Retrieves multiple values from the cache in a single call. Returns an associative array of `{ key: mixed|false }`. In the built-in implementation, this iterates over keys and calls `get` for each. In a persistent cache drop-in, this may be implemented as a single round-trip to the backend.

**Parameters:**

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `keys` | `(int \| string)[]` | required | Array of keys to retrieve. |
| `group` | `string` | `''` | Group for all keys. |
| `force` | `boolean` | `false` | Passed through to `get`. |

---

### `wp_cache_delete(key, group?)`

Removes a single entry from the cache.

**Parameters:**

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `key` | `int \| string` | required | Cache key. |
| `group` | `string` | `''` | Cache group. |

**Return value:** `boolean` — `true` if the key existed and was deleted, `false` if it did not exist or key is invalid.

**Behavior:**
1. Validate key.
2. Normalize group.
3. Apply blog prefix.
4. If key does not exist in `cache[group]`, return `false`.
5. `delete cache[group][key]`, return `true`.

---

### `wp_cache_delete_multiple(keys, group?)`

Calls `wp_cache_delete` for each key. Returns `{ key: boolean }` map.

---

### `wp_cache_incr(key, offset?, group?)`

Increments a cached numeric value.

**Parameters:**

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `key` | `int \| string` | required | Cache key. |
| `offset` | `int` | `1` | Amount to increment by. |
| `group` | `string` | `''` | Cache group. |

**Return value:** `int | false` — the new value after incrementing, or `false` if the key does not exist.

**Behavior:**
1. Validate key.
2. Normalize group.
3. Apply blog prefix.
4. If key does not exist in `cache[group]`, return `false`.
5. If `cache[group][key]` is not numeric, set it to `0`.
6. Add `(int) offset` to the value.
7. **Floor at zero**: if result is less than `0`, set it to `0`.
8. Return the new value.

---

### `wp_cache_decr(key, offset?, group?)`

Decrements a cached numeric value. Identical behavior to `wp_cache_incr` except the offset is subtracted.

**Parameters:** Same signature as `wp_cache_incr`.

**Return value:** `int | false` — the new value after decrementing, or `false` if key does not exist.

**Floor behavior:** Same as `incr` — the value will never go below `0`.

---

### `wp_cache_flush()`

Clears the entire cache for all groups.

**Return value:** `boolean` — always `true` in the built-in implementation.

**Behavior:** Sets `cache = {}` (empty object). All groups and all keys are discarded.

---

### `wp_cache_flush_runtime()`

Defined as a wrapper for `wp_cache_flush()`. In the built-in implementation, behavior is identical to `wp_cache_flush`. Drop-in implementations may differentiate between flushing the in-process runtime cache vs. the persistent backend. This function should only flush in-memory data without touching the persistent store.

---

### `wp_cache_flush_group(group)`

Removes all cache entries for a specific group.

**Parameters:**

| Parameter | Type | Notes |
|---|---|---|
| `group` | `string` | Name of the group to flush. |

**Return value:** `boolean` — always `true` in the built-in implementation.

**Important:** Before calling this function, check `wp_cache_supports('flush_group')`. Not all persistent cache implementations support group-level flushing. The built-in implementation does support it.

**Behavior:** `delete cache[group]` (unset the entire group's sub-map).

---

### `wp_cache_supports(feature)`

Checks whether the current cache implementation (built-in or drop-in) supports an optional feature.

**Parameters:**

| Parameter | Type | Notes |
|---|---|---|
| `feature` | `string` | Feature name to check. |

**Return value:** `boolean`

**Features supported by the built-in implementation:**

| Feature name | Description |
|---|---|
| `'add_multiple'` | `wp_cache_add_multiple` is implemented |
| `'set_multiple'` | `wp_cache_set_multiple` is implemented |
| `'get_multiple'` | `wp_cache_get_multiple` is implemented |
| `'delete_multiple'` | `wp_cache_delete_multiple` is implemented |
| `'flush_runtime'` | `wp_cache_flush_runtime` is implemented |
| `'flush_group'` | `wp_cache_flush_group` is implemented |

All other feature names return `false`. Drop-in implementations may return `false` for features they do not support (e.g., an older Redis drop-in might return `false` for `'flush_group'`).

---

### `wp_cache_close()`

A no-op in the built-in implementation. Always returns `true`. Provided as a hook point for drop-in implementations to perform cleanup when WordPress is done using the cache (e.g., close connections). This function has not done anything in the core implementation since WordPress 2.5.

---

### `wp_cache_add_global_groups(groups)`

Registers one or more groups as "global" — meaning they are shared across all sites in a multisite installation and are not prefixed with a blog ID.

**Parameters:**

| Parameter | Type | Notes |
|---|---|---|
| `groups` | `string \| string[]` | A single group name or an array of group names. |

**Behavior:** Merges the provided group names into the `globalGroups` hash set (`{ groupName: true }`). Idempotent — registering an already-global group has no effect.

**Side effect:** All subsequent cache operations on these groups will use the key exactly as provided, without any blog-prefix transformation.

---

### `wp_cache_add_non_persistent_groups(groups)`

In the built-in in-process implementation, this is a **no-op**. Since the built-in cache is never persistent, there is no distinction between persistent and non-persistent groups.

In persistent drop-in implementations, this function must be implemented. Calling it registers the given groups as "never persist to the backend." Data in these groups is stored only in the in-process memory for the current request. This is used for groups containing highly volatile per-request data that should not be shared across processes or requests.

---

### `wp_cache_switch_to_blog(blogId)`

Changes the blog ID prefix used for non-global group keys. Used when a piece of code needs to read/write cache entries belonging to a different site in a multisite network.

**Parameters:**

| Parameter | Type | Notes |
|---|---|---|
| `blogId` | `int` | The blog ID to switch to. Cast to integer internally. |

**Behavior:** Sets `blogPrefix = multisite ? "${blogId}:" : ""`. Does not invalidate or move any existing cache entries. After this call, all subsequent operations on non-global groups will use the new prefix.

---

### `wp_cache_reset()` _(deprecated)_

Deprecated since WordPress 3.5. Use `wp_cache_switch_to_blog()` instead.

The built-in implementation clears all non-global group entries from the cache (iterates over all groups and unsets any that are not in `globalGroups`). Drop-in implementations that stored this function must not be broken by calling it, but should delegate to `switch_to_blog()` or reset key state.

---

## 4. Groups, Expiry, Non-Persistent Groups, and the Drop-in Interface

### 4.1 Groups (Cache Namespacing)

Every cache operation takes a `group` parameter. Groups serve as independent namespaces:

- The same `key` in group `'posts'` and group `'terms'` are completely independent.
- Groups are created implicitly — there is no "register group" step for non-global groups.
- The internal storage structure is `cache[group][key]`.
- There is no cross-group key enumeration or iteration in the public API.

**Core groups used by WordPress itself (selected important ones):**

| Group | Contents |
|---|---|
| `'options'` | `alloptions`, `notoptions`, individual option values |
| `'site-options'` | Network option values, per-network notoptions |
| `'posts'` | Post objects keyed by post ID |
| `'post_meta'` | Post meta data |
| `'terms'` | Term objects |
| `'users'` | User objects keyed by user ID |
| `'userlogins'` | User ID keyed by login name |
| `'useremail'` | User ID keyed by email |
| `'userslugs'` | User ID keyed by slug |
| `'transient'` | Transient values (when external object cache is present) |
| `'site-transient'` | Network transient values (when external object cache is present) |
| `'counts'` | Post/comment count values |
| `'plugins'` | Plugin data |
| `'themes'` | Theme data |

**Global groups** (registered via `wp_cache_add_global_groups`, not blog-prefixed):
- `'users'`, `'userlogins'`, `'useremail'`, `'userslugs'`, `'user_meta'`, `'site-transient'`, `'site-options'`, `'blog-lookup'`, `'blog-details'`, `'rss'`, `'global-posts'`, `'blog-id-cache'`, `'networks'`, `'sites'`, `'site-details'`, `'blog_meta'`

---

### 4.2 Expiry / TTL

**Built-in implementation:** The `$expire` / `$expiration` parameter is accepted but is **not enforced**. Since the cache lives only for the duration of the PHP process, every entry inherently "expires" when the request ends. There is no eviction mechanism within the process.

**Drop-in implementations:** Must honor the `$expire` parameter. An `$expire` of `0` means "never expire" (until the process or server-side eviction removes it). Non-zero values are seconds from now until the entry should be considered expired.

**Transient layer TTL enforcement:** For WordPress installations without a persistent object cache, the transient system implements its own TTL enforcement. It stores expiration timestamps as separate options in the database and checks them on `get_transient()`. This is not the object cache's responsibility in the no-drop-in case.

---

### 4.3 Non-Persistent Groups

Non-persistent groups are a concept relevant only to drop-in persistent cache implementations. The function `wp_cache_add_non_persistent_groups()` registers groups that should never be written to the persistent backend.

**Built-in behavior:** The function is a no-op. Since the built-in cache is always in-memory, there is no concept of persistence.

**Drop-in behavior contract:** When groups are registered as non-persistent:
- `wp_cache_set(key, value, group)` stores the value in an in-process memory map only.
- `wp_cache_get(key, group)` reads from the in-process memory map only, never from the persistent backend.
- `wp_cache_flush()` must clear both persistent and non-persistent groups.

**Use case:** Groups like `'counts'` or `'plugins'` may be registered as non-persistent because their data changes frequently and the cost of persistent storage outweighs the benefit.

---

### 4.4 The External Cache Drop-in Interface

When `wp-content/object-cache.php` exists, WordPress loads it before instantiating `WP_Object_Cache`, and the file completely replaces the built-in cache. The drop-in file must implement all of the following global functions. The function signatures, parameter semantics, and return types must exactly match the built-in implementation.

**Required global functions:**

```typescript
// Core lifecycle
function wp_cache_init(): void;
function wp_cache_close(): boolean;   // always true, or performs cleanup

// Basic CRUD
function wp_cache_get(key: number | string, group?: string, force?: boolean, found?: boolean): unknown | false;
function wp_cache_set(key: number | string, data: unknown, group?: string, expire?: number): boolean;
function wp_cache_add(key: number | string, data: unknown, group?: string, expire?: number): boolean;
function wp_cache_replace(key: number | string, data: unknown, group?: string, expire?: number): boolean;
function wp_cache_delete(key: number | string, group?: string): boolean;

// Bulk operations
function wp_cache_get_multiple(keys: (number | string)[], group?: string, force?: boolean): Record<string | number, unknown | false>;
function wp_cache_set_multiple(data: Record<string | number, unknown>, group?: string, expire?: number): Record<string | number, boolean>;
function wp_cache_add_multiple(data: Record<string | number, unknown>, group?: string, expire?: number): Record<string | number, boolean>;
function wp_cache_delete_multiple(keys: (number | string)[], group?: string): Record<string | number, boolean>;

// Numeric operations
function wp_cache_incr(key: number | string, offset?: number, group?: string): number | false;
function wp_cache_decr(key: number | string, offset?: number, group?: string): number | false;

// Flush operations
function wp_cache_flush(): boolean;
function wp_cache_flush_runtime(): boolean;      // flush in-process only, not persistent backend
function wp_cache_flush_group(group: string): boolean;  // only if supports('flush_group')

// Group management
function wp_cache_add_global_groups(groups: string | string[]): void;
function wp_cache_add_non_persistent_groups(groups: string | string[]): void;

// Multisite support
function wp_cache_switch_to_blog(blogId: number): void;

// Feature detection
function wp_cache_supports(feature: string): boolean;
```

**Additional requirements for drop-in implementations:**
- The drop-in file may define a class (commonly named `WP_Object_Cache`) or use any internal structure. The global functions are the only required contract.
- The drop-in should expose `$wp_object_cache->cache_hits` and `$wp_object_cache->cache_misses` as public integers for compatibility with diagnostic tools.
- If the drop-in connects to an external server (Memcached, Redis), the connection should be established inside `wp_cache_init()` or lazily on first use.
- `wp_cache_flush()` in a persistent drop-in flushes the persistent backend. Use `wp_cache_flush_runtime()` to flush only the in-process layer.
- The `$found` parameter in `wp_cache_get` is passed by reference and must be set by the implementation.

---

### 4.5 How the Cache Integrates with Options and Queries

**Options integration (see also options.md):**
- `wp_load_alloptions()` stores the `alloptions` map in `wp_cache_add('alloptions', ..., 'options')`.
- `get_option()` reads from `wp_cache_get(optionName, 'options')` before hitting the DB.
- `update_option()` and `add_option()` write updated values to both `alloptions` and individual option cache entries.
- `delete_option()` removes entries from cache immediately after DB deletion.

**Query integration:**
- `WP_Query` and related code calls `wp_cache_get(postId, 'posts')` before querying the DB for a post.
- `update_post_caches()` / `update_postmeta_cache()` prime the `posts` and `post_meta` groups with results from a single batch query.
- Term queries check `wp_cache_get(termId, 'terms')` before querying.
- User queries check `wp_cache_get(userId, 'users')` before querying.

**Lazy priming pattern:** WordPress routinely uses "priming" — detecting that N objects are needed, fetching all N in one query, and storing all N in the cache. Subsequent individual lookups then hit the cache. This pattern depends on `wp_cache_add` (not `wp_cache_set`) so that items already in the cache are not overwritten.

---

## 5. WP_Object_Cache Class — Complete Internal Behavior

### Constructor

```
WP_Object_Cache.__construct()
```

- Sets `multisite = is_multisite()`.
- Sets `blogPrefix = multisite ? "${get_current_blog_id()}:" : ""`.

### `is_valid_key(key)` _(protected)_

Returns `true` if:
- `key` is an integer (any integer, including 0 and negative).
- `key` is a non-empty string (after trim).

Returns `false` and triggers `_doing_it_wrong()` (a logged error, not an exception) if:
- `key` is an empty string.
- `key` is any other type (boolean, float, array, object, null).

**Important:** Key validation was added in WordPress 6.1. Prior versions accepted any value as a key. The validation logs an error but does not throw.

### `_exists(key, group)` _(protected)_

```
_exists(key: string | number, group: string): boolean
```

Returns `true` if `cache[group][key]` exists. Uses both `isset` (fast, skips null) and `array_key_exists` (finds null) to correctly detect `null` values that are legitimately stored in the cache.

### `add_global_groups(groups)` _(public)_

Accepts a string or array. Converts to array, creates a `{ groupName: true }` map, merges into `this.globalGroups`. The `globalGroups` structure is a hash set, not an array.

### `switch_to_blog(blogId)` _(public)_

Sets `blogPrefix = multisite ? "${(int)blogId}:" : ""`. Does NOT clear any cached data — just changes the key prefix for future operations.

### `reset()` _(public, deprecated 3.5)_

Clears all non-global groups by iterating over `Object.keys(cache)` and deleting any group not in `globalGroups`. This was the pre-3.5 behavior when switching blogs. The new behavior (switch_to_blog) changes the prefix without clearing data, which is faster.

### `stats()` _(public)_

Outputs HTML with cache hit count, cache miss count, and a list of all group names with their approximate memory size (based on serialized byte length). This is for diagnostic/debug use only.

---

## 6. TypeScript Interface Sketch

```typescript
// Feature names recognized by wp_cache_supports
type CacheFeature =
  | 'add_multiple'
  | 'set_multiple'
  | 'get_multiple'
  | 'delete_multiple'
  | 'flush_runtime'
  | 'flush_group';

// The in-memory structure of the built-in cache
interface WPObjectCache {
  // Primary storage
  readonly cache: Map<string, Map<string | number, unknown>>;

  // Diagnostics (public)
  cacheHits: number;
  cacheMisses: number;

  // Multisite state
  readonly globalGroups: Set<string>;
  blogPrefix: string;
  readonly multisite: boolean;

  // Methods
  add(key: string | number, data: unknown, group?: string, expire?: number): boolean;
  addMultiple(data: Record<string | number, unknown>, group?: string, expire?: number): Record<string | number, boolean>;
  replace(key: string | number, data: unknown, group?: string, expire?: number): boolean;
  set(key: string | number, data: unknown, group?: string, expire?: number): boolean;
  setMultiple(data: Record<string | number, unknown>, group?: string, expire?: number): Record<string | number, boolean>;
  get(key: string | number, group?: string, force?: boolean, found?: { value: boolean }): unknown | false;
  getMultiple(keys: (string | number)[], group?: string, force?: boolean): Record<string | number, unknown | false>;
  delete(key: string | number, group?: string): boolean;
  deleteMultiple(keys: (string | number)[], group?: string): Record<string | number, boolean>;
  incr(key: string | number, offset?: number, group?: string): number | false;
  decr(key: string | number, offset?: number, group?: string): number | false;
  flush(): true;
  flushGroup(group: string): true;
  addGlobalGroups(groups: string | string[]): void;
  switchToBlog(blogId: number): void;

  // Protected helpers
  isValidKey(key: unknown): boolean;
  exists(key: string | number, group: string): boolean;
}

// The public global API
interface ObjectCacheAPI {
  wpCacheInit(): void;
  wpCacheGet(key: string | number, group?: string, force?: boolean, found?: { value: boolean }): unknown | false;
  wpCacheSet(key: string | number, data: unknown, group?: string, expire?: number): boolean;
  wpCacheAdd(key: string | number, data: unknown, group?: string, expire?: number): boolean;
  wpCacheReplace(key: string | number, data: unknown, group?: string, expire?: number): boolean;
  wpCacheDelete(key: string | number, group?: string): boolean;
  wpCacheGetMultiple(keys: (string | number)[], group?: string, force?: boolean): Record<string | number, unknown | false>;
  wpCacheSetMultiple(data: Record<string | number, unknown>, group?: string, expire?: number): Record<string | number, boolean>;
  wpCacheAddMultiple(data: Record<string | number, unknown>, group?: string, expire?: number): Record<string | number, boolean>;
  wpCacheDeleteMultiple(keys: (string | number)[], group?: string): Record<string | number, boolean>;
  wpCacheIncr(key: string | number, offset?: number, group?: string): number | false;
  wpCacheDecr(key: string | number, offset?: number, group?: string): number | false;
  wpCacheFlush(): boolean;
  wpCacheFlushRuntime(): boolean;
  wpCacheFlushGroup(group: string): boolean;
  wpCacheClose(): true;
  wpCacheAddGlobalGroups(groups: string | string[]): void;
  wpCacheAddNonPersistentGroups(groups: string | string[]): void;
  wpCacheSwitchToBlog(blogId: number): void;
  wpCacheSupports(feature: string): boolean;
}

// Interface that a persistent cache drop-in must satisfy
// (All functions must be globally available, not just on this interface)
interface PersistentCacheDropIn {
  // Must implement all ObjectCacheAPI methods
  // Additionally:

  // The $wp_object_cache global instance must have these public properties:
  cacheHits: number;
  cacheMisses: number;

  // Non-persistent groups: data stored here is never sent to persistent backend
  nonPersistentGroups: Set<string>;
}
```

---

## 7. Design Patterns to Carry Over

1. **One global instance, function-level API.** The `WP_Object_Cache` class is an implementation detail. All external callers use the `wp_cache_*` global functions. The global functions are the stable API. The class is what gets swapped out by drop-ins.

2. **Group namespacing is mandatory.** Do not store data without a group. The `'default'` group is used when no group is specified, but relying on it creates conflicts. Every subsystem (options, posts, users, terms) should use a distinct group.

3. **`add` vs `set` distinction is semantically significant.** WordPress uses `wp_cache_add` for priming caches that may have already been filled by another code path. Using `wp_cache_set` in that position would overwrite a value that was intentionally placed there. This prevents "cache stampede recovery" code from overwriting correct data.

4. **The `found` out-parameter is the canonical way to detect misses.** A return value of `false` from `wp_cache_get` is ambiguous: it could be a cache miss, or it could be a legitimately stored `false` value. Code that stores boolean `false` in the cache must use the `found` out-parameter to distinguish these cases. This is by-reference in PHP; in TypeScript it should be implemented as an object reference (`{ value: boolean }`) or a return tuple.

5. **Object isolation through cloning.** The built-in cache clones objects on both `set` (to isolate the stored copy from caller mutations) and `get` (to isolate the returned copy from the stored value). TypeScript implementations using reference types must implement deep copy on both operations. The standard pattern is `JSON.parse(JSON.stringify(value))` for plain objects, or structuredClone where available, with a special-case check for non-plain objects.

6. **The `expire` parameter is advisory in the built-in cache.** The built-in implementation ignores TTL because in-process memory has implicit TTL = request lifetime. Drop-in implementations must honor it. Code that uses the cache should not rely on TTL for security guarantees — TTL is a performance hint, not a hard expiry contract.

7. **Multisite key prefixing is internal and transparent.** Callers always pass the logical key (e.g., a post ID). The blog prefix is applied inside the cache implementation. Callers do not need to know about prefixing or manage it. Switching blogs is done via `wp_cache_switch_to_blog()`, not by manually adjusting keys.

8. **The drop-in replaces all global functions, not the class.** When a persistent cache drop-in is present, the global functions (`wp_cache_get`, etc.) are re-defined by the drop-in file. The `WP_Object_Cache` class may or may not be used internally by the drop-in — that is an implementation choice. What matters is that all global functions behave identically to the built-in spec.

9. **Non-persistent groups require explicit registration.** Drop-in implementations do not automatically detect which data should be kept in-process. The caller (or WordPress core bootstrap) must call `wp_cache_add_non_persistent_groups()` before the first cache operation on those groups. Order matters: data may be stored in the persistent backend before the group is marked as non-persistent.

10. **`wp_suspend_cache_addition()` is a global pause lever.** When WordPress is importing a large batch of data, it can suspend cache additions to prevent the cache from being filled with transient data. `wp_cache_add` checks this flag and returns `false` without actually adding when suspended. `wp_cache_set` is not affected by this flag and always writes. Implementations must replicate this distinction.

11. **Cache hits and misses are observable.** The `$wp_object_cache->cache_hits` and `$wp_object_cache->cache_misses` counters are public and are read by diagnostic and performance tooling (Query Monitor, etc.). These must be maintained accurately across all operations. Only `get` increments these counters — `get_multiple` increments them per-key.

12. **`flush_group` requires a feature check.** Code that calls `wp_cache_flush_group` must first check `wp_cache_supports('flush_group')`. If the persistent cache does not support group flushing, the function will either silently fail or return `false`. Implementations that do not support it must declare so in `wp_cache_supports`. The built-in implementation always supports it.

---

## 8. Tovu Reconstruction Notes

### 8.1 Why this exists

The object cache exists because WordPress assumes many reads should be memory-fast, scoped by subsystem, and sometimes tenant-aware. It is not only an optimization layer; it is part of the behavior of options, metadata, posts, terms, and multisite switching.

### 8.2 What Tovu should preserve

- One shared cache API used by higher-level subsystems instead of bespoke cache logic everywhere
- Group-based namespacing and tenant-aware scoping rules
- A real distinction between "miss" and "stored false/null-like value"
- Clear separation between runtime-only cache and persistent-cache capabilities

### 8.3 What Tovu can simplify

- Tovu does not need WordPress's global-function surface if a small injected cache interface is easier to reason about
- Deep cloning semantics can be replaced with immutable value discipline or structured cloning where appropriate
- Feature detection can be narrower if Tovu controls the supported cache backends

### 8.4 Possible Tovu seams

- `src/core/cache/` for the shared cache runtime
- `src/core/ports/CachePort.ts` for get/set/add/delete and capability checks
- `src/core/ports/TenantScopedCachePort.ts` for tenant-aware partition switching
- feature modules keep their own group names but depend on the same cache contract

### 8.5 Suggested priority

- `V1`: grouped cache API, tenant-aware partitioning, miss-vs-found semantics, runtime/persistent split
- `Later`: richer group-flush support, diagnostics counters, and broader backend compatibility
