# Meta API — Specification

**Source files analyzed:**
- `wp-includes/meta.php`
- `wp-includes/class-wp-meta-query.php`

---

## 1. Overview

The Meta API is the unified key-value storage layer for attaching arbitrary data to any first-class WordPress object. Every post, user, term, and comment can have an unlimited number of metadata entries, where each entry is a (key, value) pair. Multiple entries may share the same key on the same object; they are distinguished only by their auto-incremented row ID.

The system is intentionally generic. A single set of low-level CRUD functions — `add_metadata`, `get_metadata`, `update_metadata`, `delete_metadata` — accepts a `meta_type` string parameter that routes the operation to the correct backing table. Type-specific wrappers (`add_post_meta`, `get_user_meta`, etc.) are thin pass-throughs that hard-code the `meta_type` argument.

The four built-in meta types are:

| Meta type | Backing table | Object it annotates |
|---|---|---|
| `post` | `wp_postmeta` | Posts, pages, and custom post types |
| `user` | `wp_usermeta` | User accounts |
| `term` | `wp_termmeta` | Taxonomy terms |
| `comment` | `wp_commentmeta` | Comments |

A fifth type, `blog`, exists in multisite installations and refers to individual sites within a network. Additional custom types can be registered by creating a table named `{type}meta` and exposing it on the `$wpdb` object.

---

## 2. Database Schema

Each meta type has its own table. All four tables share the same column layout, with one naming difference: `user`-type meta uses `umeta_id` as its primary key column; all others use `meta_id`.

### `wp_postmeta`

```sql
CREATE TABLE wp_postmeta (
  meta_id     BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id     BIGINT(20) UNSIGNED NOT NULL DEFAULT 0,
  meta_key    VARCHAR(255)        DEFAULT NULL,
  meta_value  LONGTEXT            DEFAULT NULL,
  PRIMARY KEY (meta_id),
  KEY post_id (post_id),
  KEY meta_key (meta_key(191))
);
```

### `wp_usermeta`

```sql
CREATE TABLE wp_usermeta (
  umeta_id    BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT(20) UNSIGNED NOT NULL DEFAULT 0,
  meta_key    VARCHAR(255)        DEFAULT NULL,
  meta_value  LONGTEXT            DEFAULT NULL,
  PRIMARY KEY (umeta_id),
  KEY user_id (user_id),
  KEY meta_key (meta_key(191))
);
```

### `wp_termmeta`

```sql
CREATE TABLE wp_termmeta (
  meta_id     BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  term_id     BIGINT(20) UNSIGNED NOT NULL DEFAULT 0,
  meta_key    VARCHAR(255)        DEFAULT NULL,
  meta_value  LONGTEXT            DEFAULT NULL,
  PRIMARY KEY (meta_id),
  KEY term_id (term_id),
  KEY meta_key (meta_key(191))
);
```

### `wp_commentmeta`

```sql
CREATE TABLE wp_commentmeta (
  meta_id      BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  comment_id   BIGINT(20) UNSIGNED NOT NULL DEFAULT 0,
  meta_key     VARCHAR(255)         DEFAULT NULL,
  meta_value   LONGTEXT             DEFAULT NULL,
  PRIMARY KEY (meta_id),
  KEY comment_id (comment_id),
  KEY meta_key (meta_key(191))
);
```

### Column conventions

| Column | Notes |
|---|---|
| `meta_id` / `umeta_id` | Auto-increment primary key. `umeta_id` is used only for `wp_usermeta`; all other tables use `meta_id`. |
| `{type}_id` | Foreign key to the parent object (e.g. `post_id`, `user_id`). Named dynamically as `sanitize_key(meta_type + '_id')`. |
| `meta_key` | String key. Keys beginning with `_` are considered protected (hidden from default UI). |
| `meta_value` | `LONGTEXT`. PHP scalars are stored as strings. Arrays and objects are PHP-serialized before storage. |

The table name for a given type is resolved by looking up `{type}meta` as a property on the `$wpdb` database abstraction object. If that property does not exist, the operation returns `false` immediately.

---

## 3. Core CRUD Functions

These are the low-level, type-agnostic functions that all higher-level wrappers delegate to.

### `add_metadata(metaType, objectId, metaKey, metaValue, unique?)`

Inserts a new metadata row for the given object. Does **not** update an existing row.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `metaType` | `string` | required | `'post'`, `'user'`, `'term'`, `'comment'`, etc. |
| `objectId` | `number` | required | ID of the object. Must be a positive integer. |
| `metaKey` | `string` | required | The metadata key. Non-empty string. |
| `metaValue` | `unknown` | required | The value to store. Arrays/objects will be serialized. |
| `unique` | `boolean` | `false` | If `true`, abort if a row with this key already exists for this object. |

**Returns:** `number | false` — The new `meta_id` (or `umeta_id`) on success; `false` on failure.

**Exact execution sequence:**

1. Validate: `metaType`, `metaKey`, and `objectId` must all be truthy. `objectId` must be numeric and, after casting to an absolute integer, non-zero. Return `false` if any check fails.
2. Resolve the backing table name. Return `false` if the table does not exist.
3. Determine the object subtype via `getObjectSubtype(metaType, objectId)`.
4. Strip slashes from `metaKey` and `metaValue` (legacy slashing convention).
5. Pass `metaValue` through `sanitizeMeta(metaKey, metaValue, metaType, objectSubtype)`.
6. Fire the short-circuit filter `add_{metaType}_metadata` with `(null, objectId, metaKey, metaValue, unique)`. If the filter returns non-`null`, return that value directly without touching the database.
7. If `unique` is `true`, query the database to count existing rows for `(metaKey, objectId)`. If count > 0, return `false`.
8. Serialize `metaValue` via `maybeSerialize`.
9. Fire action `add_{metaType}_meta(objectId, metaKey, unserializedValue)`.
10. Execute `INSERT INTO {table} ({typeIdColumn}, meta_key, meta_value) VALUES (...)`.
11. If the insert fails, return `false`.
12. Capture the inserted row's auto-increment ID.
13. Delete the object's meta cache entry: `cache.delete(objectId, metaType + '_meta')`.
14. Fire action `added_{metaType}_meta(newMetaId, objectId, metaKey, unserializedValue)`.
15. Return the new meta ID.

---

### `update_metadata(metaType, objectId, metaKey, metaValue, prevValue?)`

Updates existing metadata. If no row exists for the given key, delegates to `add_metadata` instead.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `metaType` | `string` | required | |
| `objectId` | `number` | required | |
| `metaKey` | `string` | required | |
| `metaValue` | `unknown` | required | New value. |
| `prevValue` | `unknown` | `''` | If provided, only update rows whose current `meta_value` matches this value. |

**Returns:** `number | boolean` — The new meta ID if a row was inserted (key did not exist), `true` on successful update, `false` on failure or if the new value is identical to the stored value.

**Exact execution sequence:**

1. Validate inputs identically to `add_metadata`. Return `false` on failure.
2. Resolve table. Return `false` if table not found.
3. Determine object subtype.
4. Strip slashes from `metaKey` and `metaValue`. Preserve the original slashed copies for fallback.
5. Pass `metaValue` through `sanitizeMeta`.
6. Fire short-circuit filter `update_{metaType}_metadata` with `(null, objectId, metaKey, metaValue, prevValue)`. If non-`null` returned, cast to `boolean` and return.
7. **No-op check** (only when `prevValue` is empty): call `getMetadataRaw` to fetch existing values for this key. If exactly one row exists and its stored value equals `metaValue` (strict equality after sanitization, before serialization), return `false` — nothing to update.
8. Query all row IDs for `(metaKey, objectId)`. If none exist, call `add_metadata(metaType, objectId, originalSlashedKey, originalPassedValue)` and return its result.
9. Serialize `metaValue` via `maybeSerialize`.
10. Build the `WHERE` clause: `{typeIdColumn} = objectId AND meta_key = metaKey`. If `prevValue` is non-empty, also add `meta_value = maybeSerialize(prevValue)`.
11. For each matched row ID, fire action `update_{metaType}_meta(metaId, objectId, metaKey, unserializedValue)`. For `post` type additionally fire `update_postmeta(metaId, objectId, metaKey, serializedValue)`.
12. Execute `UPDATE {table} SET meta_value = ? WHERE ...`.
13. If the update returns 0 affected rows, return `false`.
14. Delete the object's meta cache entry.
15. For each row ID, fire action `updated_{metaType}_meta(metaId, objectId, metaKey, unserializedValue)`. For `post` type additionally fire `updated_postmeta(metaId, objectId, metaKey, serializedValue)`.
16. Return `true`.

---

### `delete_metadata(metaType, objectId, metaKey, metaValue?, deleteAll?)`

Deletes one or more metadata rows.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `metaType` | `string` | required | |
| `objectId` | `number` | required | Ignored if `deleteAll` is `true`. |
| `metaKey` | `string` | required | |
| `metaValue` | `unknown` | `''` | If non-empty and not `null`/`false`, restrict deletion to rows matching this value. |
| `deleteAll` | `boolean` | `false` | If `true`, delete matching rows across all objects, ignoring `objectId`. |

**Returns:** `boolean` — `true` on success, `false` on failure or no matching rows.

**Exact execution sequence:**

1. Validate: `metaType` and `metaKey` must be truthy. `objectId` must be numeric unless `deleteAll` is `true`. Return `false` if checks fail.
2. Cast `objectId` to absolute integer. If zero and `deleteAll` is `false`, return `false`.
3. Resolve table. Return `false` if not found.
4. Strip slashes from `metaKey` and `metaValue`.
5. Fire short-circuit filter `delete_{metaType}_metadata` with `(null, objectId, metaKey, metaValue, deleteAll)`. If non-`null` returned, cast to `boolean` and return.
6. Serialize `metaValue` via `maybeSerialize`.
7. Build a `SELECT` query to find matching row IDs: `WHERE meta_key = ?`. Append `AND {typeIdColumn} = ?` if `deleteAll` is `false`. Append `AND meta_value = ?` if `metaValue` is neither empty string, `null`, nor `false`.
8. If no row IDs found, return `false`.
9. If `deleteAll` is `true`, also collect the affected `objectId` list for cache invalidation.
10. Fire action `delete_{metaType}_meta(metaIds[], objectId, metaKey, unserializedValue)`.
11. For `post` type additionally fire `delete_postmeta(metaIds[])`.
12. Execute `DELETE FROM {table} WHERE {idColumn} IN (metaIds...)`.
13. If delete count is zero, return `false`.
14. Invalidate cache for affected object IDs: `cache.deleteMultiple(affectedIds, metaType + '_meta')`.
15. Fire action `deleted_{metaType}_meta(metaIds[], objectId, metaKey, unserializedValue)`.
16. For `post` type additionally fire `deleted_postmeta(metaIds[])`.
17. Return `true`.

---

### `get_metadata(metaType, objectId, metaKey?, single?)`

Retrieves metadata for an object. This is the primary read function; it composes `getMetadataRaw` and `getMetadataDefault`.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `metaType` | `string` | required | |
| `objectId` | `number` | required | |
| `metaKey` | `string` | `''` | If empty, all metadata for the object is returned. |
| `single` | `boolean` | `false` | If `true`, return only the first value for the key. |

**Returns:**
- `false` — invalid `objectId` or missing `metaType`.
- All meta for the object (as `Record<string, string[]>`) when `metaKey` is empty.
- An array of values when `metaKey` is provided and `single` is `false`.
- A single value when `metaKey` is provided and `single` is `true`.
- `''` (empty string) when `single` is `true` and the key does not exist.
- `[]` (empty array) when `single` is `false` and the key does not exist.

**Implementation:** Calls `getMetadataRaw`. If the result is not `null`, return it. Otherwise fall through to `getMetadataDefault` (which returns `''` or `[]` as defaults, subject to the `default_{metaType}_metadata` filter).

---

### `get_metadata_raw(metaType, objectId, metaKey?, single?)`

The raw read path. Does not supply defaults.

**Returns:** Same as `get_metadata`, but returns `null` instead of a default value when the key does not exist.

**Exact execution sequence:**

1. Validate `metaType` and `objectId`. Return `false` on failure.
2. Fire short-circuit filter `get_{metaType}_metadata` with `(null, objectId, metaKey, single, metaType)`. If non-`null` returned: if `single` is `true` and the result is an array, return `result[0]`; otherwise return the result as-is.
3. Attempt `cache.get(objectId, metaType + '_meta')`. On miss, call `update_meta_cache(metaType, [objectId])` and use the result for `objectId`.
4. If `metaKey` is empty, return the entire cache entry for the object (all keys and their value arrays), or `null` if no cache entry.
5. If `metaKey` is present in the cache:
   - `single === true`: return `maybeUnserialize(cache[metaKey][0])`.
   - `single === false`: return `cache[metaKey].map(maybeUnserialize)`.
6. If `metaKey` is not in the cache, return `null`.

---

### `get_metadata_default(metaType, objectId, metaKey, single?)`

Returns the default value for a meta key, used as a fallback when no data exists in the database.

- Default is `''` when `single` is `true`.
- Default is `[]` when `single` is `false`.
- These baseline defaults are passed through the `default_{metaType}_metadata` filter, which allows registered meta keys (via `register_meta`) to supply a configured default value.
- After filtering, if `single` is `false` and the result is not a numeric array, the result is wrapped in a single-element array.

---

### `metadata_exists(metaType, objectId, metaKey)`

Returns `boolean` indicating whether at least one row exists for the given object and key. Uses the same cache path as `get_metadata_raw`; fires the `get_{metaType}_metadata` short-circuit filter.

---

### `get_metadata_by_mid(metaType, metaId)`

Retrieves a single metadata row directly by its primary key (`meta_id` or `umeta_id`).

**Returns:** An object representing the row with `meta_value` already unserialized, or `false` if not found. The returned object has the same shape as a database row, including the type-specific object ID column (e.g. `post_id`).

Fires short-circuit filter `get_{metaType}_metadata_by_mid(null, metaId)`.

---

### `update_metadata_by_mid(metaType, metaId, metaValue, metaKey?)`

Updates a metadata row directly by its primary key. If `metaKey` is `false` (default), the existing key is preserved; passing a string replaces the key.

Sanitizes the value, serializes it, fires `update_{metaType}_meta` and `updated_{metaType}_meta` actions (plus `update_postmeta`/`updated_postmeta` for post type), invalidates cache.

Fires short-circuit filter `update_{metaType}_metadata_by_mid(null, metaId, metaValue, metaKey)`.

---

### `delete_metadata_by_mid(metaType, metaId)`

Deletes a single metadata row by its primary key. Looks up the row first to get the object ID for cache invalidation.

Fires `delete_{metaType}_meta` and `deleted_{metaType}_meta` actions. For `post` and `comment` types additionally fires `delete_{metaType}meta` and `deleted_{metaType}meta` (no underscore before "meta") with just the single `metaId` as argument.

Fires short-circuit filter `delete_{metaType}_metadata_by_mid(null, metaId)`.

---

## 4. Type-Specific Wrappers

All of these are pass-throughs. They accept the same parameters as the core functions minus `metaType`, which is hard-coded.

### Post Meta

```typescript
function add_post_meta(postId: number, metaKey: string, metaValue: unknown, unique?: boolean): number | false;
function get_post_meta(postId: number, metaKey?: string, single?: boolean): unknown;
function update_post_meta(postId: number, metaKey: string, metaValue: unknown, prevValue?: unknown): number | boolean;
function delete_post_meta(postId: number, metaKey: string, metaValue?: unknown): boolean;
```

Each delegates to the corresponding `{verb}_metadata('post', ...)` function.

### User Meta

```typescript
function add_user_meta(userId: number, metaKey: string, metaValue: unknown, unique?: boolean): number | false;
function get_user_meta(userId: number, metaKey?: string, single?: boolean): unknown;
function update_user_meta(userId: number, metaKey: string, metaValue: unknown, prevValue?: unknown): number | boolean;
function delete_user_meta(userId: number, metaKey: string, metaValue?: unknown): boolean;
```

### Term Meta

```typescript
function add_term_meta(termId: number, metaKey: string, metaValue: unknown, unique?: boolean): number | false;
function get_term_meta(termId: number, metaKey?: string, single?: boolean): unknown;
function update_term_meta(termId: number, metaKey: string, metaValue: unknown, prevValue?: unknown): number | boolean;
function delete_term_meta(termId: number, metaKey: string, metaValue?: unknown): boolean;
```

### Comment Meta

```typescript
function add_comment_meta(commentId: number, metaKey: string, metaValue: unknown, unique?: boolean): number | false;
function get_comment_meta(commentId: number, metaKey?: string, single?: boolean): unknown;
function update_comment_meta(commentId: number, metaKey: string, metaValue: unknown, prevValue?: unknown): number | boolean;
function delete_comment_meta(commentId: number, metaKey: string, metaValue?: unknown): boolean;
```

---

## 5. Unique vs Non-Unique Meta

### The `unique` parameter

`add_metadata` accepts a boolean `unique` parameter (default `false`).

- `unique = false` (default): Multiple rows with the same `(objectId, metaKey)` combination are allowed. Each `add_metadata` call always appends a new row.
- `unique = true`: Before inserting, the function queries `COUNT(*)` for `(metaKey, objectId)`. If count > 0, the function returns `false` immediately and performs no insert.

### What happens with duplicate keys

When `unique` is `false`, an object can accumulate arbitrarily many rows with the same key. They are independent rows distinguished only by `meta_id`.

`update_metadata` is not subject to the `unique` constraint; it updates **all** matching rows for a given `(objectId, metaKey)` pair in a single `UPDATE` statement (unless `prevValue` further restricts the target rows).

### How `get_metadata` returns single vs array

The cache structure stores all values for a key as a flat array: `cache[objectId][metaKey] = [val1, val2, ...]`. Retrieval behavior depends on the `single` flag:

| `single` | Key found | Key not found |
|---|---|---|
| `false` | Array of all deserialized values | `[]` |
| `true` | First deserialized value (`cache[key][0]`) | `''` |

When `metaKey` is omitted entirely, the entire `cache[objectId]` map is returned, with each key mapping to its raw (still-serialized) value array.

---

## 6. Serialization

### Storage encoding

Values are passed through `maybeSerialize` before being written to `meta_value`. The rules are:

- **Scalars** (`string`, `number`, `boolean`): stored as their string representation. `false` → `''`. `true` → `'1'`. Numbers → their string form.
- **Arrays and objects**: serialized using PHP's `serialize()` format (e.g. `a:2:{i:0;s:3:"foo";i:1;s:3:"bar";}`).
- **Strings that are already PHP-serialized**: re-serialized again (double-serialized). This is intentional: storing a serialized string as a meta value must be distinguishable from storing the data structure itself.

### Retrieval decoding

On read, each raw string from the cache is passed through `maybeUnserialize`. This function checks whether the string looks like PHP-serialized data (starts with recognized PHP serialization prefixes: `a:`, `O:`, `s:`, `i:`, `d:`, `b:`, `N;`, etc.) and if so, calls `unserialize()` on it. Strings that are not serialized are returned as-is.

### Security implications

- **Object injection**: Deserializing untrusted data can trigger PHP's `__wakeup` and `__destruct` magic methods during `unserialize()`. In a TypeScript reimplementation, JSON is the natural serialization format, but the deserializer must be restricted to plain data structures — no class instantiation or code execution during deserialization.
- **Double serialization**: The PHP implementation has a known footgun where a string value that happens to look like serialized data is automatically unserialized on read, which can produce unexpected type coercions. The TypeScript implementation should use a more explicit encoding strategy (e.g. a JSON envelope with a type discriminator) to avoid this class of ambiguity.
- **Protected keys**: Keys beginning with `_` are protected. They pass the `is_protected_meta` check, which by default sets `auth_callback` to a function that always returns `false`, preventing unprivileged users from reading or writing those keys through the REST API.

---

## 7. Meta Value Sanitization — `sanitize_meta()`

`sanitize_meta` is called automatically by `add_metadata` and `update_metadata` on every write. It also fires in `update_metadata_by_mid`.

```typescript
function sanitize_meta(
  metaKey: string,
  metaValue: unknown,
  objectType: string,
  objectSubtype?: string
): unknown;
```

**Lookup order:**

1. If `objectSubtype` is non-empty and the filter `sanitize_{objectType}_meta_{metaKey}_for_{objectSubtype}` has any registered callbacks, fire that filter with `(metaValue, metaKey, objectType, objectSubtype)` and return the result.
2. Otherwise fire the filter `sanitize_{objectType}_meta_{metaKey}` with `(metaValue, metaKey, objectType)` and return the result.

If neither filter has any registered callbacks, `metaValue` is returned unchanged. The actual sanitization logic lives entirely in the registered callbacks, not in this function itself.

When `register_meta` is called with a `sanitize_callback`, that callback is automatically registered on the appropriate sanitize filter hook (see Section 8).

---

## 8. `register_meta()`

Registers a meta key with the global metadata registry (`$wp_meta_keys`). Registration enables REST API exposure, default values, sanitization callbacks, capability checks, and revisions support.

```typescript
function register_meta(
  objectType: string,
  metaKey: string,
  args: RegisterMetaArgs
): boolean;
```

**Returns** `true` if the key was successfully added to the global registry, `false` otherwise.

### `RegisterMetaArgs`

```typescript
interface RegisterMetaArgs {
  object_subtype?: string;       // default ''
  type?: MetaValueType;          // default 'string'
  label?: string;                // default ''
  description?: string;          // default ''
  single?: boolean;              // default false
  default?: unknown;             // default ''
  sanitize_callback?: Function | null;  // default null
  auth_callback?: Function | null;      // default null
  show_in_rest?: boolean | RestSchema;  // default false
  revisions_enabled?: boolean;   // default false
}

type MetaValueType = 'string' | 'boolean' | 'integer' | 'number' | 'array' | 'object';

interface RestSchema {
  schema?: {
    items?: object;        // required when type === 'array'
    [key: string]: unknown;
  };
  prepare_callback?: Function;
}
```

### Argument details

| Field | Type | Notes |
|---|---|---|
| `object_subtype` | `string` | Restricts registration to a specific subtype (e.g. a post type like `'page'`). If omitted, the key is registered for the entire object type and applies to all subtypes. |
| `type` | `string` | The JavaScript/JSON Schema type of the stored value. Used for REST API schema generation and default value validation. |
| `label` | `string` | Human-readable label for the meta key. Used in UI contexts. |
| `description` | `string` | Human-readable description. Included in REST API schema output. |
| `single` | `boolean` | Whether this key stores a single value per object (as opposed to multiple rows with the same key). Governs how `get_registered_metadata` retrieves the value. |
| `default` | `unknown` | Default value returned when no meta exists. Must conform to the JSON Schema of the registered type. An empty string is the hardcoded baseline default before registration. |
| `sanitize_callback` | `Function \| null` | Called on every write via the sanitize filter hook. If `object_subtype` is set, registers on `sanitize_{objectType}_meta_{metaKey}_for_{objectSubtype}`; otherwise on `sanitize_{objectType}_meta_{metaKey}`. |
| `auth_callback` | `Function \| null` | Governs capability checks for REST API access. If omitted: protected keys (beginning with `_`) get `__return_false`; unprotected keys get `__return_true`. Registers on `auth_{objectType}_meta_{metaKey}` (or the subtype variant). |
| `show_in_rest` | `boolean \| object` | `false` hides the key from the REST API. `true` exposes it. An object allows specifying a `schema` (including `items` for array types) and/or a `prepare_callback`. When `type === 'array'`, `show_in_rest` **must** be an object with `show_in_rest.schema.items` defined; omitting it causes registration to fail. |
| `revisions_enabled` | `boolean` | When `true`, the meta key participates in WordPress revisions. Only valid when `objectType === 'post'` and (if `object_subtype` is set) the post type supports revisions. Failure to meet these conditions causes registration to fail. |

### Registration mechanics

1. Apply the `register_meta_args` filter to allow third-party modification of registration arguments before processing.
2. Merge provided args with defaults (`wp_parse_args`).
3. Validate `show_in_rest`/`type` for array constraints. Return `false` on violation.
4. Validate `revisions_enabled` constraints. Return `false` on violation.
5. If `auth_callback` is not provided, assign `__return_false` for protected keys, `__return_true` for unprotected keys.
6. If `sanitize_callback` is callable, register it on the sanitize hook for this key.
7. If `auth_callback` is callable, register it on the auth hook for this key.
8. If a `default` value is provided, validate it against the schema. If invalid, return `false`. Register the `filter_default_metadata` function on `default_{objectType}_metadata` (only once per object type, guarded by `has_filter` check).
9. Store the final args object at `wp_meta_keys[objectType][objectSubtype][metaKey]`.
10. Return `true`.

**Registry structure:**

```typescript
// Global registry shape:
// wpMetaKeys[objectType][objectSubtype][metaKey] = args
const wpMetaKeys: Record<string, Record<string, Record<string, RegisterMetaArgs>>> = {};
```

An `object_subtype` of `''` (empty string) means the key applies to the whole object type.

### `unregister_meta_key(objectType, metaKey, objectSubtype?)`

Removes a key from the global registry. Also removes the sanitize and auth filter callbacks that were registered when `register_meta` was called. Cleans up empty sub-objects in the registry.

### `registered_meta_key_exists(objectType, metaKey, objectSubtype?)`

Returns `boolean`. Checks `get_registered_meta_keys(objectType, objectSubtype)` for the key.

### `get_registered_meta_keys(objectType, objectSubtype?)`

Returns the map of `metaKey → args` for the given type/subtype combination. Returns `{}` if nothing is registered.

### `get_registered_metadata(objectType, objectId, metaKey?)`

Retrieves the stored value(s) for registered meta keys only.

- If `metaKey` is specified: returns `false` if the key is not registered; otherwise returns `get_metadata(objectType, objectId, metaKey, args.single)`.
- If `metaKey` is omitted: fetches all metadata for the object, then returns only the subset whose keys appear in the merged registered-key lists (both the object-type-wide and subtype-specific registrations).

### `get_object_subtype(objectType, objectId)`

Returns the subtype string for a given object:

| Object type | Subtype returned |
|---|---|
| `post` | The post type (e.g. `'page'`, `'post'`, `'product'`) |
| `term` | The taxonomy (e.g. `'category'`, `'post_tag'`) |
| `comment` | `'comment'` (always) |
| `user` | `'user'` (always) |
| Other | `''` (empty string) |

The result is passed through the `get_object_subtype_{objectType}` filter before being returned, allowing extensions to override or supplement the default logic.

---

## 9. `WP_Meta_Query`

`WP_Meta_Query` generates `JOIN` and `WHERE` SQL fragments to be appended to a parent query (e.g. `WP_Query`, `WP_User_Query`). It supports deeply nested boolean logic and a rich set of comparison operators.

### Constructor input

```typescript
interface MetaQueryInput {
  relation?: 'AND' | 'OR';   // default 'AND'
  [key: string]: MetaClause | MetaQueryInput | string;
}

interface MetaClause {
  key?: string | string[];
  compare_key?: CompareKeyOperator;
  type_key?: 'BINARY' | '';
  value?: unknown | unknown[];
  compare?: CompareOperator;
  type?: MetaCastType;
}

type CompareOperator =
  | '=' | '!=' | '>' | '>=' | '<' | '<='
  | 'LIKE' | 'NOT LIKE'
  | 'IN' | 'NOT IN'
  | 'BETWEEN' | 'NOT BETWEEN'
  | 'REGEXP' | 'NOT REGEXP' | 'RLIKE'
  | 'EXISTS' | 'NOT EXISTS';

type CompareKeyOperator =
  | '=' | '!='
  | 'LIKE' | 'NOT LIKE'
  | 'IN' | 'NOT IN'
  | 'REGEXP' | 'NOT REGEXP' | 'RLIKE'
  | 'EXISTS' | 'NOT EXISTS';

type MetaCastType =
  | 'NUMERIC' | 'BINARY' | 'CHAR'
  | 'DATE' | 'DATETIME' | 'DECIMAL'
  | 'SIGNED' | 'TIME' | 'UNSIGNED';
```

**Named clauses:** When a first-order clause or sub-query is given a string key in the array (e.g. `{ myClause: { key: '_color', value: 'red' } }`), it can be referenced by that name in `orderby` parameters of the parent query.

### First-order clause detection

A query array element is a "first-order clause" (as opposed to a nested sub-query) if it contains either a `key` property or a `value` property. All other array elements are treated as nested sub-queries and processed recursively.

### Clause defaults

| Property | Default when omitted |
|---|---|
| `compare` | `'IN'` if `value` is an array; `'='` otherwise |
| `compare_key` | `'IN'` if `key` is an array; `'='` otherwise |
| `type` | `'CHAR'` |
| `type_key` | `''` |

Any unrecognized `compare` or `compare_key` value is silently replaced with `'='`.

### Type casting

The `type` field governs how `meta_value` is cast in the SQL comparison:

| `type` value | SQL cast expression |
|---|---|
| `'CHAR'` (default) | No cast applied; comparison is against raw string |
| `'NUMERIC'` | `CAST(meta_value AS SIGNED)` |
| `'BINARY'` | `CAST(meta_value AS BINARY)` |
| `'DATE'` | `CAST(meta_value AS DATE)` |
| `'DATETIME'` | `CAST(meta_value AS DATETIME)` |
| `'DECIMAL'` | `CAST(meta_value AS DECIMAL)` |
| `'DECIMAL(p,s)'` | `CAST(meta_value AS DECIMAL(p,s))` |
| `'SIGNED'` | `CAST(meta_value AS SIGNED)` |
| `'TIME'` | `CAST(meta_value AS TIME)` |
| `'UNSIGNED'` | `CAST(meta_value AS UNSIGNED)` |

`NUMERIC` is an alias for `SIGNED`. Any value that does not match the allowed pattern (validated by regex `^(?:BINARY|CHAR|DATE|DATETIME|SIGNED|UNSIGNED|TIME|NUMERIC(?:\(\d+(?:,\s?\d+)?\))?|DECIMAL(?:\(\d+(?:,\s?\d+)?\))?)$`) falls back to `CHAR`.

`type_key` applies the same `BINARY` cast to the `meta_key` column, used only with `REGEXP` and `NOT REGEXP` key comparisons to make them case-sensitive.

### SQL generation — `get_sql(type, primaryTable, primaryIdColumn, context?)`

Entry point for SQL generation. Accepts the meta type name (e.g. `'post'`), the primary table being joined against, its primary key column name, and an optional context object (e.g. the parent `WP_Query` instance).

**Returns** `{ join: string, where: string } | false`. Returns `false` if no meta table exists for the type.

**Post-processing:** If any generated JOIN is a `LEFT JOIN` (which occurs when any clause uses `NOT EXISTS`), all other `INNER JOIN`s in the output are upgraded to `LEFT JOIN`. This ensures objects without any metadata are not incorrectly excluded from results when mixed with `NOT EXISTS` clauses.

The final SQL pair is passed through the `get_meta_sql` filter before being returned.

### JOIN generation

For each first-order clause that requires a new JOIN:

- **Alias assignment:** The first clause uses the raw meta table name (no alias). Subsequent clauses use `mt1`, `mt2`, etc.
- **`NOT EXISTS` clauses:** Generate a `LEFT JOIN ... ON (primaryTable.primaryId = alias.metaIdColumn AND alias.meta_key = ?)`. The `IS NULL` check in the `WHERE` clause then identifies non-matching rows.
- **All other clauses:** Generate `INNER JOIN ... ON (primaryTable.primaryId = alias.metaIdColumn)`.

**JOIN reuse (alias compatibility):** Before generating a new JOIN, the engine checks whether an existing sibling clause's alias is compatible:
- Under an `OR` relation: positive-operator clauses (`=`, `IN`, `BETWEEN`, `LIKE`, `REGEXP`, `RLIKE`, `>`, `>=`, `<`, `<=`) can share a JOIN alias.
- Under an `AND` relation: negative-operator clauses (`!=`, `NOT IN`, `NOT LIKE`) that share the same `key` value can share a JOIN alias.

When a compatible alias is found, no new JOIN is emitted and the existing alias is reused. This prevents unnecessary table multiplications in OR queries.

Duplicate JOIN fragments are deduplicated before the final string is assembled.

### WHERE generation

#### Key comparison (`meta_key` column)

| `compare_key` | Generated SQL |
|---|---|
| `=` or `EXISTS` | `alias.meta_key = 'value'` |
| `LIKE` | `alias.meta_key LIKE '%value%'` |
| `IN` | `alias.meta_key IN ('v1', 'v2', ...)` |
| `REGEXP` or `RLIKE` | `alias.meta_key REGEXP 'pattern'` (or `CAST(... AS BINARY) REGEXP ...` if `type_key = 'BINARY'`) |
| `!=` or `NOT EXISTS` | `NOT EXISTS (SELECT 1 FROM meta_table subAlias WHERE subAlias.post_ID = alias.post_ID AND subAlias.meta_key = 'value' LIMIT 1)` |
| `NOT LIKE` | `NOT EXISTS (... AND subAlias.meta_key LIKE '%value%' ...)` |
| `NOT IN` | `NOT EXISTS (... AND subAlias.meta_key IN (...) ...)` |
| `NOT REGEXP` | `NOT EXISTS (... AND subAlias.meta_key REGEXP ... ...)` |
| `NOT EXISTS` (value compare) | `alias.metaIdColumn IS NULL` |

For `NOT EXISTS` as the primary `compare` (value comparison), the WHERE clause becomes `alias.{meta_id_column} IS NULL`.

#### Value comparison (`meta_value` column)

| `compare` | Value handling |
|---|---|
| `IN` / `NOT IN` | Value is split on `/[,\s]+/` if not already an array. SQL: `meta_value IN ('v1','v2')` |
| `BETWEEN` / `NOT BETWEEN` | Value must be a 2-element array. SQL: `meta_value BETWEEN 'v1' AND 'v2'` |
| `LIKE` / `NOT LIKE` | Value is wrapped with `%…%`. SQL: `meta_value LIKE '%value%'` |
| `EXISTS` (with value) | Treated as `=`. |
| `NOT EXISTS` | Value is ignored. No value WHERE clause is emitted. |
| All others | Exact string match. |

When `type` is not `CHAR`, the comparison wraps the column: `CAST(alias.meta_value AS {type}) {compare} {value}`.

#### Multi-clause assembly

If a single first-order clause produces both a key condition and a value condition, they are combined: `( key_condition AND value_condition )`.

Multiple first-order clauses and sub-queries within a query group are joined by the group's `relation` (`AND` or `OR`) and wrapped in parentheses.

### Nested queries

Sub-queries are arrays that contain neither `key` nor `value` at the top level. They are processed recursively by `get_sql_for_query` with incremented depth (used for indentation in the generated SQL only). Each nested group produces its own JOIN and WHERE fragments that are merged into the parent.

### Named clause lookup

After SQL generation, every first-order clause is stored in a flat `clauses` map keyed by the clause's name (if it had a string key in the input) or by its table alias (if it had a numeric key). Duplicate names are disambiguated by appending `-1`, `-2`, etc.

The `getClauses()` method returns this flat map. Parent queries use it to resolve `orderby=named_clause_key` → `alias.meta_value` or `CAST(alias.meta_value AS type)` in the `ORDER BY` clause.

### `has_or_relation()`

Returns `true` if any OR relation appears anywhere in the parsed query tree. Parent queries use this to determine whether to add `DISTINCT` or `GROUP BY` to prevent duplicate rows (multiple JOIN hits for the same object under OR conditions can multiply rows).

### `parse_query_vars(qv)`

Convenience method for `WP_Query`. Reads `meta_key`, `meta_value`, `meta_compare`, `meta_type`, `meta_compare_key`, `meta_type_key`, and `meta_query` from a flat query vars object and constructs the equivalent structured `meta_query` array. The simple `meta_key`/`meta_value` pair is placed first in the merged query so that `orderby=meta_value` operates against an unaliased table.

---

## 10. Meta Caching

### Cache structure

Meta for all keys of a single object is cached as a single unit in the WordPress object cache under the group `{metaType}_meta`, keyed by `objectId`.

The cached value is a map:

```typescript
type MetaCacheEntry = Record<string, string[]>;
// { [metaKey: string]: rawSerializedValues[] }
// Values are stored as raw strings (not yet deserialized).
// Deserialization happens at read time in get_metadata_raw.
```

### `update_meta_cache(metaType, objectIds)`

Batch-loads metadata for an array of object IDs into the cache.

```typescript
function update_meta_cache(metaType: string, objectIds: number[] | string): Record<number, MetaCacheEntry> | false;
```

**Exact execution sequence:**

1. Validate `metaType` and `objectIds`. Return `false` on empty input.
2. Resolve table. Return `false` if not found.
3. Normalize `objectIds`: if a comma-delimited string, strip non-numeric/comma characters and split. Cast all IDs to integers.
4. Fire short-circuit filter `update_{metaType}_metadata_cache(null, objectIds[])`. If non-`null` returned, cast to `boolean` and return.
5. Call `cache.getMultiple(objectIds, cacheGroup)` to separate already-cached IDs from uncached IDs.
6. If all IDs are already cached, return the assembled cache map immediately (no database query).
7. For uncached IDs, query the database: `SELECT {typeIdColumn}, meta_key, meta_value FROM {table} WHERE {typeIdColumn} IN (...) ORDER BY {idColumn} ASC`.
8. Iterate results, building `cache[objectId][metaKey] = [val1, val2, ...]` (appending each value in `meta_id` / `umeta_id` order).
9. For every ID that had no database rows, store an empty object `{}` in the cache (so subsequent reads know the object genuinely has no meta, as opposed to an unloaded state).
10. Call `cache.addMultiple(data, cacheGroup)` to persist the loaded entries.
11. Return the complete cache map including both pre-cached and freshly loaded entries.

### Cache invalidation

- `add_metadata`: deletes the single object's cache entry after insert.
- `update_metadata`: deletes the single object's cache entry after update.
- `delete_metadata`: deletes cache entries for all affected object IDs (using `cache.deleteMultiple`). When `deleteAll` is `true`, all objects that had the deleted key must be invalidated.
- `update_metadata_by_mid` / `delete_metadata_by_mid`: delete the single object's cache entry.

### Lazy loader

A singleton `WP_Metadata_Lazyloader` instance (`wp_metadata_lazyloader()`) provides deferred batch loading. Consumers can register object IDs to load later; when the first read for any object in the queue occurs, the entire queue is loaded in one `update_meta_cache` call. This is used by post loop rendering to prime all post meta in a single query rather than one query per post.

The lazy loader maintains separate queues per meta type. The queue is consumed (cleared) when the batch load fires.

---

## 11. Key Hooks and Filters

### Short-circuit filters (pre-operation)

These run before any database access. Returning non-`null` overrides the default behavior entirely.

| Hook | When it fires | Passes | Override behavior |
|---|---|---|---|
| `add_{metaType}_metadata` | Before insert | `(null, objectId, metaKey, metaValue, unique)` | Return `false` or a meta ID |
| `update_{metaType}_metadata` | Before update | `(null, objectId, metaKey, metaValue, prevValue)` | Return any non-null value, cast to `boolean` |
| `delete_{metaType}_metadata` | Before delete | `(null, objectId, metaKey, metaValue, deleteAll)` | Return any non-null value, cast to `boolean` |
| `get_{metaType}_metadata` | Before read | `(null, objectId, metaKey, single, metaType)` | Return the desired value; if `single` is `true` and result is an array, `result[0]` is used |
| `get_{metaType}_metadata_by_mid` | Before read by ID | `(null, metaId)` | Return the row object or `false` |
| `update_{metaType}_metadata_by_mid` | Before update by ID | `(null, metaId, metaValue, metaKey)` | Return any non-null value, cast to `boolean` |
| `delete_{metaType}_metadata_by_mid` | Before delete by ID | `(null, metaId)` | Return any non-null value, cast to `boolean` |
| `update_{metaType}_metadata_cache` | Before cache load | `(null, objectIds[])` | Return any non-null value |

### Before-write actions

| Hook | When it fires | Arguments |
|---|---|---|
| `add_{metaType}_meta` | After uniqueness check, before INSERT | `(objectId, metaKey, unserializedValue)` |
| `update_{metaType}_meta` | Before each row UPDATE | `(metaId, objectId, metaKey, unserializedValue)` |
| `update_postmeta` | Same as above, post-only | `(metaId, objectId, metaKey, serializedValue)` |
| `delete_{metaType}_meta` | Before DELETE | `(metaIds[], objectId, metaKey, unserializedValue)` |
| `delete_postmeta` | Same as above, post-only | `(metaIds[])` |
| `delete_commentmeta` | Before DELETE by mid, comment-only | `(metaId)` — note: singular, not array |
| `delete_postmeta` (by mid) | Before DELETE by mid, post-only | `(metaId)` — note: singular, not array |

### After-write actions

| Hook | When it fires | Arguments |
|---|---|---|
| `added_{metaType}_meta` | After INSERT, after cache delete | `(newMetaId, objectId, metaKey, unserializedValue)` |
| `updated_{metaType}_meta` | After each row UPDATE, after cache delete | `(metaId, objectId, metaKey, unserializedValue)` |
| `updated_postmeta` | Same as above, post-only | `(metaId, objectId, metaKey, serializedValue)` |
| `deleted_{metaType}_meta` | After DELETE, after cache delete | `(metaIds[], objectId, metaKey, unserializedValue)` |
| `deleted_postmeta` | Same as above, post-only | `(metaIds[])` |
| `deleted_commentmeta` | After DELETE by mid, comment-only | `(metaId)` |
| `deleted_postmeta` (by mid) | After DELETE by mid, post-only | `(metaId)` |

### Default value filter

| Hook | Purpose |
|---|---|
| `default_{metaType}_metadata` | Filters the default return value when no meta exists. Arguments: `(defaultValue, objectId, metaKey, single, metaType)`. Registered automatically when a meta key with a `default` is registered via `register_meta`. |

### Registration hooks

| Hook | Purpose |
|---|---|
| `register_meta_args` | Filters the args array before `register_meta` processes it. Arguments: `(args, defaults, objectType, metaKey)`. |
| `sanitize_{objectType}_meta_{metaKey}` | The sanitize callback registered via `register_meta` (object-type-wide). Arguments: `(metaValue, metaKey, objectType)`. |
| `sanitize_{objectType}_meta_{metaKey}_for_{subtype}` | The sanitize callback registered via `register_meta` (subtype-specific). Arguments: `(metaValue, metaKey, objectType, objectSubtype)`. |
| `auth_{objectType}_meta_{metaKey}` | The auth callback registered via `register_meta` (object-type-wide). Used for REST API capability checks. |
| `auth_{objectType}_meta_{metaKey}_for_{subtype}` | The auth callback (subtype-specific). |
| `is_protected_meta` | Filters whether a meta key is considered protected. Default: any key starting with `_` is protected. |
| `get_object_subtype_{objectType}` | Filters the resolved object subtype. Arguments: `(subtype, objectId)`. |

### Meta query hooks

| Hook | Purpose |
|---|---|
| `get_meta_sql` | Filters the final `{ join, where }` SQL pair generated by `WP_Meta_Query::get_sql`. Arguments: `(sql, queries, type, primaryTable, primaryIdColumn, context)`. |
| `meta_query_find_compatible_table_alias` | Filters the result of the compatible-alias lookup during JOIN generation. Arguments: `(alias \| false, clause, parentQuery, wpMetaQueryInstance)`. |

---

## 12. TypeScript Interface Sketch

```typescript
// ---- Meta types ----

type MetaType = 'post' | 'user' | 'term' | 'comment' | 'blog' | string;

type MetaCacheEntry = Record<string, string[]>;
// { [metaKey: string]: rawSerializedStringValues[] }

// ---- Core CRUD ----

interface MetaAPI {
  addMetadata(
    metaType: MetaType,
    objectId: number,
    metaKey: string,
    metaValue: unknown,
    unique?: boolean
  ): number | false;

  updateMetadata(
    metaType: MetaType,
    objectId: number,
    metaKey: string,
    metaValue: unknown,
    prevValue?: unknown
  ): number | boolean;

  deleteMetadata(
    metaType: MetaType,
    objectId: number,
    metaKey: string,
    metaValue?: unknown,
    deleteAll?: boolean
  ): boolean;

  getMetadata(
    metaType: MetaType,
    objectId: number,
    metaKey?: string,
    single?: boolean
  ): unknown;

  getMetadataRaw(
    metaType: MetaType,
    objectId: number,
    metaKey?: string,
    single?: boolean
  ): unknown | null | false;

  getMetadataDefault(
    metaType: MetaType,
    objectId: number,
    metaKey: string,
    single?: boolean
  ): unknown;

  metadataExists(metaType: MetaType, objectId: number, metaKey: string): boolean;

  getMetadataByMid(metaType: MetaType, metaId: number): MetaRow | false;
  updateMetadataByMid(metaType: MetaType, metaId: number, metaValue: unknown, metaKey?: string | false): boolean;
  deleteMetadataByMid(metaType: MetaType, metaId: number): boolean;

  updateMetaCache(
    metaType: MetaType,
    objectIds: number[] | string
  ): Record<number, MetaCacheEntry> | false;
}

// ---- Row shape ----

interface MetaRow {
  meta_key: string;
  meta_value: unknown;        // already deserialized
  meta_id?: string;           // for non-user types
  umeta_id?: string;          // for user type
  post_id?: string;
  user_id?: string;
  term_id?: string;
  comment_id?: string;
  blog_id?: string;
}

// ---- Type-specific wrappers ----

interface PostMetaAPI {
  addPostMeta(postId: number, metaKey: string, metaValue: unknown, unique?: boolean): number | false;
  getPostMeta(postId: number, metaKey?: string, single?: boolean): unknown;
  updatePostMeta(postId: number, metaKey: string, metaValue: unknown, prevValue?: unknown): number | boolean;
  deletePostMeta(postId: number, metaKey: string, metaValue?: unknown): boolean;
}

interface UserMetaAPI {
  addUserMeta(userId: number, metaKey: string, metaValue: unknown, unique?: boolean): number | false;
  getUserMeta(userId: number, metaKey?: string, single?: boolean): unknown;
  updateUserMeta(userId: number, metaKey: string, metaValue: unknown, prevValue?: unknown): number | boolean;
  deleteUserMeta(userId: number, metaKey: string, metaValue?: unknown): boolean;
}

interface TermMetaAPI {
  addTermMeta(termId: number, metaKey: string, metaValue: unknown, unique?: boolean): number | false;
  getTermMeta(termId: number, metaKey?: string, single?: boolean): unknown;
  updateTermMeta(termId: number, metaKey: string, metaValue: unknown, prevValue?: unknown): number | boolean;
  deleteTermMeta(termId: number, metaKey: string, metaValue?: unknown): boolean;
}

interface CommentMetaAPI {
  addCommentMeta(commentId: number, metaKey: string, metaValue: unknown, unique?: boolean): number | false;
  getCommentMeta(commentId: number, metaKey?: string, single?: boolean): unknown;
  updateCommentMeta(commentId: number, metaKey: string, metaValue: unknown, prevValue?: unknown): number | boolean;
  deleteCommentMeta(commentId: number, metaKey: string, metaValue?: unknown): boolean;
}

// ---- Meta registration ----

type MetaValueType = 'string' | 'boolean' | 'integer' | 'number' | 'array' | 'object';

interface RestSchema {
  schema?: { items?: object; [key: string]: unknown };
  prepare_callback?: (...args: unknown[]) => unknown;
}

interface RegisterMetaArgs {
  object_subtype?: string;
  type?: MetaValueType;
  label?: string;
  description?: string;
  single?: boolean;
  default?: unknown;
  sanitize_callback?: ((...args: unknown[]) => unknown) | null;
  auth_callback?: ((...args: unknown[]) => unknown) | null;
  show_in_rest?: boolean | RestSchema;
  revisions_enabled?: boolean;
}

interface MetaRegistryAPI {
  registerMeta(objectType: MetaType, metaKey: string, args: RegisterMetaArgs): boolean;
  unregisterMetaKey(objectType: MetaType, metaKey: string, objectSubtype?: string): boolean;
  registeredMetaKeyExists(objectType: MetaType, metaKey: string, objectSubtype?: string): boolean;
  getRegisteredMetaKeys(objectType: MetaType, objectSubtype?: string): Record<string, RegisterMetaArgs>;
  getRegisteredMetadata(objectType: MetaType, objectId: number, metaKey?: string): unknown;
}

// ---- WP_Meta_Query ----

type CompareOperator =
  | '=' | '!=' | '>' | '>=' | '<' | '<='
  | 'LIKE' | 'NOT LIKE'
  | 'IN' | 'NOT IN'
  | 'BETWEEN' | 'NOT BETWEEN'
  | 'REGEXP' | 'NOT REGEXP' | 'RLIKE'
  | 'EXISTS' | 'NOT EXISTS';

type CompareKeyOperator =
  | '=' | '!='
  | 'LIKE' | 'NOT LIKE'
  | 'IN' | 'NOT IN'
  | 'REGEXP' | 'NOT REGEXP' | 'RLIKE'
  | 'EXISTS' | 'NOT EXISTS';

type MetaCastType =
  | 'NUMERIC' | 'BINARY' | 'CHAR'
  | 'DATE' | 'DATETIME' | 'DECIMAL'
  | 'SIGNED' | 'TIME' | 'UNSIGNED';

interface MetaClause {
  key?: string | string[];
  compare_key?: CompareKeyOperator;
  type_key?: 'BINARY' | '';
  value?: unknown;
  compare?: CompareOperator;
  type?: MetaCastType;
}

interface MetaQueryGroup {
  relation?: 'AND' | 'OR';
  [key: string]: MetaClause | MetaQueryGroup | string | undefined;
}

interface MetaSqlResult {
  join: string;
  where: string;
}

interface WPMetaQuery {
  queries: MetaQueryGroup;
  relation: 'AND' | 'OR';
  metaTable: string;
  metaIdColumn: string;
  primaryTable: string;
  primaryIdColumn: string;

  getSql(
    type: MetaType,
    primaryTable: string,
    primaryIdColumn: string,
    context?: unknown
  ): MetaSqlResult | false;

  getClauses(): Record<string, MetaClause & { alias: string; cast: string }>;
  hasOrRelation(): boolean;
  parseQueryVars(qv: Record<string, unknown>): void;
  getCastForType(type?: string): string;
}

// ---- Sanitization ----

interface MetaSanitizationAPI {
  sanitizeMeta(
    metaKey: string,
    metaValue: unknown,
    objectType: MetaType,
    objectSubtype?: string
  ): unknown;

  isProtectedMeta(metaKey: string, metaType?: MetaType): boolean;
  getObjectSubtype(objectType: MetaType, objectId: number): string;
}

// ---- Serialization helpers ----

interface SerializationAPI {
  maybeSerialize(value: unknown): string;
  maybeUnserialize(value: string): unknown;
}
```

---

## 13. Design Patterns to Carry Over

1. **Single backing implementation, multiple type surfaces.** The four meta types (post, user, term, comment) share one implementation. Every type-specific function is a one-liner that hard-codes the type string. Do not duplicate logic; add a dispatcher and keep the core generic.

2. **Short-circuit pattern on every operation.** Every CRUD function fires a filter before touching the database. If the filter returns non-`null`, the database is never accessed. This enables in-memory mocks, object-cache-only implementations, and test doubles without any code changes to callers. This pattern must be preserved on every operation, including the by-mid variants.

3. **Before and after action pairs.** Every write fires two actions: one immediately before the database mutation and one immediately after (with cache already invalidated). The "before" action gives observers the chance to read the old value. The "after" action gives them access to the confirmed new state. The argument shapes differ: "added/updated" variants pass the meta ID; "deleted" variants pass an array of IDs.

4. **Cache-first reads with on-demand hydration.** `get_metadata_raw` always checks the object cache before querying the database. On a cache miss, it loads all meta for that single object in one query. The `update_meta_cache` function allows batch pre-loading many objects at once to avoid N+1 patterns. Implement reads with this two-level logic: check cache → if miss, bulk-load → return from cache.

5. **Values stored as raw strings in cache.** The cache holds the serialized string form, not the deserialized value. Deserialization happens at the last moment, in the read path, so the same cache entry can serve both serialized-aware and deserialized-aware consumers without double-caching.

6. **`unique` prevents add but not update.** The `unique` constraint is enforced only in `add_metadata`, not in `update_metadata`. This is intentional: `update_metadata` is idempotent by nature (it updates existing rows or creates one if none exist). The `unique` flag is about controlling insertion cardinality, not about enforcing a one-value-only invariant on the stored data.

7. **`update_metadata` falls back to `add_metadata` when key is absent.** Rather than returning `false` when no rows exist to update, `update_metadata` transparently delegates to `add_metadata`. This upsert behavior is fundamental to how plugins use the API — they call `update_post_meta` regardless of whether the key has been set before.

8. **No-op detection in update.** Before executing an `UPDATE`, `update_metadata` compares the sanitized new value against the existing value. If the key exists exactly once and the value is identical, it returns `false` without touching the database or firing hooks. This prevents spurious cache invalidations and hook fires.

9. **Subtype-scoped registration overrides type-wide registration.** `register_meta` stores entries in a two-level map: `objectType → objectSubtype → metaKey`. When looking up a registered key, the subtype-specific registration is tried first; the type-wide registration (stored under subtype key `''`) is used as a fallback. This allows a plugin to register `_my_key` for all post types, but then provide a more specific registration with different behavior for just the `'product'` post type.

10. **Protected keys are convention, not enforcement.** Any key beginning with `_` is considered protected by default, which sets its `auth_callback` to `__return_false` when registered. But this is only a REST API and capability-check convention, not a database-level restriction. Protected keys can be read and written freely by server-side code; the protection applies only to external API access.

11. **JOIN reuse in meta queries.** `WP_Meta_Query` actively minimizes the number of table JOINs. Before adding a new JOIN, it checks whether a sibling clause under the same relation is compatible for alias reuse. Under `OR` relations, all positive-operator clauses can share a JOIN. Under `AND` relations, negative-operator clauses that match on the same key can share a JOIN. This optimization is critical for query performance and must be implemented faithfully to avoid both incorrect results and excessive joins.

12. **`NOT EXISTS` forces all JOINs to LEFT JOIN.** When any clause in a meta query uses `NOT EXISTS`, its own JOIN must be a `LEFT JOIN` (to find rows that are absent). But a single `LEFT JOIN` in a chain of `INNER JOIN`s would produce incorrect results. The solution is post-processing: after all JOIN fragments are generated, if any `LEFT JOIN` is present, all `INNER JOIN`s are upgraded to `LEFT JOIN`.

13. **Nested meta queries with arbitrary depth.** The `MetaQueryGroup` structure is recursive. Each group has a `relation` and any number of child items, where each child is either a first-order `MetaClause` or another `MetaQueryGroup`. The SQL generator processes this tree recursively, producing properly nested parenthesized `WHERE` fragments. There is no depth limit in the original implementation.

14. **The `get_meta_sql` helper function vs the class.** `get_meta_sql()` is a convenience wrapper that instantiates `WP_Meta_Query` and immediately calls `get_sql` on it. Callers that need access to clause metadata (for `orderby` support) must instantiate the class directly and call `getClauses()` after `getSql()`.

---

## 14. Tovu Reconstruction Notes

### 14.1 Why this exists

Metadata exists as WordPress's universal extensibility escape hatch. It lets any major object type carry arbitrary keyed data without schema changes, while still providing shared CRUD, cache, registration, REST exposure, and query support.

### 14.2 What Tovu should preserve

- One generic metadata subsystem shared across major object families
- Cache-first metadata reads with batch priming and centralized invalidation
- Registration and subtype-specific policy for externally exposed metadata
- A generic metadata-query capability for extension and long-tail feature needs

### 14.3 What Tovu can simplify

- Tovu should not lean on metadata for core first-class fields that deserve structured schema
- Serialized-value conventions can be replaced with typed storage where practical
- The generic query layer can start with a smaller operator set if core features do not need WordPress's full meta-query surface immediately

### 14.4 Possible Tovu seams

- `src/features/meta/` for generic metadata CRUD and registration
- `src/core/ports/MetadataStorePort.ts` for read/write and invalidation behavior
- `src/core/ports/MetadataQueryPort.ts` for cross-object metadata filtering
- `src/core/ports/MetadataSchemaPort.ts` for per-type and per-subtype registration rules

### 14.5 Suggested priority

- `V1`: generic metadata store, cache-aware reads, registration for API exposure
- `Later`: deeper metadata-query parity and more advanced compatibility behaviors
