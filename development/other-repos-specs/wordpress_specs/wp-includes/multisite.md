# Multisite — Specification

**Source files analyzed:**
- `wp-includes/ms-functions.php`
- `wp-includes/ms-load.php`
- `wp-includes/ms-default-filters.php`
- `wp-includes/ms-deprecated.php`
- `wp-includes/ms-blogs.php`
- `wp-includes/ms-site.php`
- `wp-includes/ms-network.php`
- `wp-includes/ms-settings.php`
- `wp-includes/ms-default-constants.php`
- `wp-includes/class-wp-network.php`
- `wp-includes/class-wp-site.php`
- `wp-includes/class-wp-site-query.php`
- `wp-includes/class-wp-network-query.php`
- `wp-includes/option.php` (network option functions)
- `wp-includes/capabilities.php` (super admin functions)
- `wp-includes/user.php` (user-site relationship functions)

---

## 1. Overview

WordPress Multisite is a mode in which a single WordPress installation serves multiple websites (called "sites" or "blogs") from a shared codebase, shared user table, and shared database. Each site has its own set of database tables prefixed with `wp_{blog_id}_` (e.g., `wp_2_posts`, `wp_2_options`), but users, network-level options, and site registry data are stored in globally shared tables.

The architecture has two levels of hierarchy:

- **Network** (also called "site" in older code): the top-level container. Identified by a domain and path in `wp_site`. Stores network-wide settings in `wp_sitemeta`. In a standard installation there is exactly one network (ID 1).
- **Site** (also called "blog" in older code): an individual website belonging to a network. Identified by a domain and path in `wp_blogs`. Each site has its own option set, posts, comments, terms, users-capabilities mapping, and uploaded files.

The naming collision is intentional legacy: PHP code refers to the network object as `$current_site` (type `WP_Network`) and to the site object as `$current_blog` (type `WP_Site`). The database table for networks is `wp_site`; the database table for sites is `wp_blogs`.

**Two topology modes** are supported:

- **Subdomain install** (`SUBDOMAIN_INSTALL = true`): each site gets its own subdomain (e.g., `site1.example.com`). The `domain` column in `wp_blogs` is `site1.example.com` and the `path` is `/`.
- **Subdirectory install** (`SUBDOMAIN_INSTALL = false`): all sites share the root domain; each site is distinguished by a path segment (e.g., `example.com/site1/`). The `domain` column is `example.com` and the `path` is `/site1/`.

**Key behavioral rules:**
- The `wp_users` table is global across the entire network; users authenticate network-wide.
- Per-site roles and capabilities are stored in site-specific user meta keys: `wp_{blog_id}_capabilities`.
- Switching between sites mid-request (`switch_to_blog`) changes the active table prefix, flushes per-site caches, and re-initializes the roles object and current user's capability set for the new site.
- Network-wide options are stored in `wp_sitemeta` (`meta_key` / `meta_value` / `site_id`).
- A "super admin" is a user whose login appears in the `site_admins` network option; they bypass all per-site permission checks.

---

## 2. Database Schema Differences

### Global tables (shared across all sites)

| Table | Purpose |
|---|---|
| `wp_users` | All network users (login, password, email, registration date) |
| `wp_usermeta` | Per-user metadata. Per-site capabilities stored as `wp_{N}_capabilities`. |
| `wp_site` | Network registry. One row per network. |
| `wp_sitemeta` | Network options. `site_id` + `meta_key` + `meta_value`. |
| `wp_blogs` | Site registry. One row per site. |
| `wp_blog_versions` | Tracks the database schema version for each site. |
| `wp_registration_log` | Log of new site registrations (email, IP, blog_id, date_registered). |
| `wp_signups` | Pending user/site registrations awaiting email confirmation. |

### `wp_signups` columns

| Column | Type | Description |
|---|---|---|
| `signup_id` | bigint | Auto-increment primary key |
| `domain` | varchar | For site signups: the target domain. Empty for user-only signups. |
| `path` | varchar | For site signups: the target path. Empty for user-only signups. |
| `title` | longtext | Site title for site signups. |
| `user_login` | varchar | Requested username |
| `user_email` | varchar | User email address |
| `registered` | datetime | When the signup row was created |
| `activated` | datetime | When the signup was activated (zero date if not yet active) |
| `active` | tinyint | 0 = pending, 1 = activated |
| `activation_key` | varchar | 16-character hex key used in the confirmation URL |
| `meta` | longtext | Serialized array of extra data (privacy setting, lang_id, etc.) |

### `wp_blogs` columns

| Column | Type | Description |
|---|---|---|
| `blog_id` | bigint | Auto-increment primary key |
| `site_id` | bigint | Foreign key to `wp_site.id` (the network this site belongs to) |
| `domain` | varchar | Site domain |
| `path` | varchar | Site path (always ends with `/`) |
| `registered` | datetime | Creation timestamp |
| `last_updated` | datetime | Last time the site was updated |
| `public` | tinyint | 1 = public, 0 = private |
| `archived` | tinyint | 1 = archived |
| `mature` | tinyint | 1 = mature-content flag |
| `spam` | tinyint | 1 = flagged as spam |
| `deleted` | tinyint | 1 = soft-deleted, 2 = not yet activated |
| `lang_id` | int | Language ID (unused in core, available for plugin use) |

### `wp_site` columns

| Column | Type | Description |
|---|---|---|
| `id` | bigint | Auto-increment primary key |
| `domain` | varchar | Network domain |
| `path` | varchar | Network path prefix (usually `/`) |

### Per-site tables

For each site with ID `N`, a separate set of tables is created with the prefix `wp_{N}_`. For the main site (ID 1) the prefix is just `wp_` (no numeric infix, for historical reasons). The per-site tables mirror the standard single-site WordPress tables:

- `wp_{N}_posts`
- `wp_{N}_postmeta`
- `wp_{N}_comments`
- `wp_{N}_commentmeta`
- `wp_{N}_options`
- `wp_{N}_terms`
- `wp_{N}_term_taxonomy`
- `wp_{N}_term_relationships`
- `wp_{N}_termmeta`
- `wp_{N}_links`
- `wp_{N}_blogmeta` (site metadata, distinct from user meta; stores arbitrary `key/value` pairs for a site)

---

## 3. WP_Network

`WP_Network` represents a single multisite network (the top-level container). The source is `class-wp-network.php`.

### Fields

```typescript
interface WPNetworkData {
  id: number;           // private internally; integer. Exposed via __get('id').
  domain: string;       // network domain, e.g. "example.com"
  path: string;         // network path, e.g. "/" or "/network/"
  blog_id: string;      // numeric string. ID of the main site. Private; exposed via __get('blog_id').
  cookie_domain: string; // domain used for cookies (no leading www.)
  site_name: string;    // human-readable network name
}
```

The `id` and `blog_id` fields are private in PHP; access goes through magic `__get`. The `__get('id')` always returns `int`. The `__get('blog_id')` returns a `string` (numeric string). The `__get('site_id')` is an alias for `blog_id` and returns `int`.

### Construction

`new WP_Network(networkRow)` copies all properties from the source object, then calls two private setup methods:

1. `_set_site_name()`: if `site_name` is empty, reads from network option `site_name`, defaulting to `ucfirst(domain)`.
2. `_set_cookie_domain()`: if `cookie_domain` is empty, sets it to the host portion of `domain`, stripping a leading `www.` if present.

### Static methods

#### `WP_Network.get_instance(networkId: number): WP_Network | false`

Retrieves a network by ID. Checks the `networks` cache group first (keyed by network ID). On miss, queries `SELECT * FROM wp_site WHERE id = %d LIMIT 1`. If not found, caches the sentinel value `-1` and returns `false`. Otherwise constructs and returns a `WP_Network` instance.

#### `WP_Network.get_by_path(domain: string, path: string, segments?: number | null): WP_Network | false`

Finds the best-matching network for a given domain and path. Algorithm:

1. Build a list of candidate domains by progressively stripping subdomains: `["sub.example.com", "example.com", "com"]`.
2. If an external object cache is in use and all known networks use path `/`, skip path matching for performance.
3. If paths are used, build a candidate paths list by progressively stripping path segments, always ending with `["/"]`. Apply filter `network_by_path_segments_count` to limit segments considered.
4. Apply filter `pre_get_network_by_path` — if it returns non-null, use that result.
5. Query `wp_site` for rows matching `domain IN (candidates)` and `path IN (paths)`, ordered by `CHAR_LENGTH(domain) DESC, CHAR_LENGTH(path) DESC`.
6. Iterate results. A network matches if its domain exactly matches the requested domain (or `www.{network.domain}` matches), and its path is in the candidate paths list, **or** its path is `/` (wildcard fallback).
7. Return the first match, or `false` if none.

### Instance method: `get_main_site_id(): number`

Determines the ID of the main site for this network. Resolution order:

1. Fire filter `pre_get_main_site_id` — if a positive integer is returned, use it.
2. If `this.blog_id > 0`, use it.
3. If the network matches `DOMAIN_CURRENT_SITE`/`PATH_CURRENT_SITE` constants, use `BLOG_ID_CURRENT_SITE` constant if defined.
4. If the current site's domain/path match this network, use the current site's ID.
5. Look up the `main_site` network option. If not found, query `wp_blogs` for the first site matching this network's domain and path; cache result in `main_site` network option.

### Standalone functions

```typescript
function get_network(network?: WP_Network | number | null): WP_Network | null
function get_networks(args?: Partial<NetworkQueryArgs>): WP_Network[] | number[] | number
function get_network_by_path(domain: string, path: string, segments?: number | null): WP_Network | false
function clean_network_cache(ids: number | number[]): void
function update_network_cache(networks: WP_Network[]): void
```

`get_network()` with no argument returns the current network (`$current_site` global). It passes the result through the `get_network` filter.

`get_networks()` is a thin wrapper that constructs a `WP_Network_Query` and calls `query()`.

`clean_network_cache()` deletes all entries from the `networks` cache group for the given IDs, fires `clean_network_cache` action per ID, and updates the `networks` last-changed timestamp.

---

## 4. WP_Site

`WP_Site` represents a single multisite site (individual blog). The source is `class-wp-site.php`. The class is declared `final`.

### Core fields (stored in `wp_blogs`)

```typescript
interface WPSiteData {
  blog_id: string;      // numeric string. Primary key. Access as .id (int) via __get.
  domain: string;       // site domain
  path: string;         // site path (trailing slash guaranteed)
  site_id: string;      // numeric string. Parent network ID. Access as .network_id (int) via __get.
  registered: string;   // MySQL datetime, e.g. "2024-01-15 12:00:00"
  last_updated: string; // MySQL datetime
  public: string;       // "1" = public, "0" = private
  archived: string;     // "1" = archived
  mature: string;       // "1" = mature
  spam: string;         // "1" = spam
  deleted: string;      // "1" = deleted, "2" = not yet activated
  lang_id: string;      // language pack ID
}
```

All status flags are stored as numeric strings for backward compatibility.

### Extended (lazy-loaded) properties

These are NOT in `wp_blogs`; they are loaded by switching to the site and reading its options table. They are fetched on first access via `__get` and cached in the `site-details` cache group.

```typescript
interface WPSiteExtended extends WPSiteData {
  blogname: string;        // from wp_{N}_options where option_name = 'blogname'
  siteurl: string;         // from wp_{N}_options where option_name = 'siteurl'
  post_count: string;      // from wp_{N}_options where option_name = 'post_count'
  home: string;            // from wp_{N}_options where option_name = 'home'
}
```

Extended properties are only available after the `ms_loaded` action has fired. Before that, `__get` returns `null` for extended keys.

### Construction

`new WP_Site(siteRow)` copies all fields from the source object using `Object.entries` semantics.

### Static method

#### `WP_Site.get_instance(siteId: number): WP_Site | false`

Retrieves a site by ID. Checks the `sites` cache group (keyed by `blog_id`). On miss, queries `SELECT * FROM wp_blogs WHERE blog_id = %d LIMIT 1`. Caches `-1` sentinel on miss. Returns `false` if not found.

### Instance methods

```typescript
toArray(): Record<string, string>   // returns all own properties as plain object
```

### Magic accessors

`__get('id')` returns `parseInt(this.blog_id)` as a number.
`__get('network_id')` returns `parseInt(this.site_id)` as a number.
`__get('blogname')`, `__get('siteurl')`, `__get('post_count')`, `__get('home')` trigger `get_details()`.
Any other key triggers `get_details()` and checks for the key there (for plugin-added properties via `site_details` filter).

### Private `get_details()`

1. Check `site-details` cache for `this.blog_id`.
2. On miss: `switch_to_blog(this.blog_id)`, read `blogname`, `siteurl`, `post_count`, `home` options, `restore_current_blog()`. Cache the result.
3. Apply deprecated `blog_details` filter, then apply `site_details` filter.
4. Return the details object.

### Standalone functions

```typescript
function get_site(site?: WP_Site | number | null): WP_Site | null
function get_sites(args?: Partial<SiteQueryArgs>): WP_Site[] | number[] | number
function clean_site_details_cache(siteId?: number): void
function get_blog_details(fields?: number | string | Record<string, string> | null, getAll?: boolean): WP_Site | false
function update_blog_details(blogId: number, details: Record<string, string>): boolean
function refresh_blog_details(blogId?: number): void
function get_blog_status(id: number, pref: string): string | boolean | null
function update_blog_status(blogId: number, pref: string, value: string): string | false
```

`get_site()` with no argument returns the current site. It passes the result through the `get_site` filter.

`get_blog_details()` is the older API supporting lookup by blog ID, slug, or domain+path array. When `getAll = true` it loads extended properties (blogname, siteurl, etc.) by switching blogs. Results are cached in `blog-details` (full) and `blog-details` with `short` suffix (core fields only).

---

## 5. WP_Site_Query

`WP_Site_Query` is the canonical way to query `wp_blogs`. Source: `class-wp-site-query.php`.

### Constructor query arguments

```typescript
interface SiteQueryArgs {
  // Inclusion / exclusion by ID
  site__in: number[];           // include only these site IDs
  site__not_in: number[];       // exclude these site IDs
  ID: number;                   // return only this site (single)

  // Pagination
  number: number;               // max results (default 100)
  offset: number;               // SQL OFFSET (default 0)
  no_found_rows: boolean;       // skip SQL_CALC_FOUND_ROWS (default true)

  // Return format
  fields: '' | 'ids' | 'count'; // '' = WP_Site[]; 'ids' = number[]; 'count' = number
  count: boolean;               // alias for fields = 'count'

  // Ordering
  orderby: string | string[] | Record<string, 'ASC' | 'DESC'>;
  // Accepted values: 'id', 'domain', 'path', 'network_id', 'last_updated',
  //   'registered', 'domain_length', 'path_length', 'site__in',
  //   'network__in', 'deleted', 'mature', 'spam', 'archived', 'public',
  //   false | [] | 'none' to disable ORDER BY
  order: 'ASC' | 'DESC';       // default 'ASC'

  // Network filters
  network_id: number;           // 0 = all networks (default 0)
  network__in: number[];
  network__not_in: number[];

  // Domain filters
  domain: string;
  domain__in: string[];
  domain__not_in: string[];

  // Path filters
  path: string;
  path__in: string[];
  path__not_in: string[];

  // Status filters (null = no filter, 1 = match flag set, 0 = match flag unset)
  public: 1 | 0 | null;
  archived: 1 | 0 | null;
  mature: 1 | 0 | null;
  spam: 1 | 0 | null;
  deleted: 1 | 0 | null;

  // Language
  lang_id: number | null;
  lang__in: number[];
  lang__not_in: number[];

  // Search
  search: string;               // matches against domain and/or path
  search_columns: ('domain' | 'path')[];

  // Date query (uses WP_Date_Query against 'registered')
  date_query: DateQueryArgs | null;

  // Cache control
  update_site_cache: boolean;       // prime 'sites' cache (default true)
  update_site_meta_cache: boolean;  // prime site meta cache (default true)

  // Meta query
  meta_query: MetaQueryArgs | '';
  meta_key: string | string[];
  meta_value: string | string[];
  meta_compare: string;
  meta_compare_key: string;
  meta_type: string;
  meta_type_key: string;
}
```

### Execution model

1. Construct with args or call `query(args)`.
2. `parse_query()` merges args with defaults; fires action `parse_site_query` passing `this` by reference.
3. `get_sites()` fires action `pre_get_sites` (by reference), then filter `sites_pre_query`. If the filter returns non-null, that is the result (bypasses DB).
4. Cache key built from query vars (excluding `fields` and `update_site_cache`); checked against the `site-queries` cache group. The cache key incorporates the `sites` last-changed timestamp so it invalidates automatically when any site changes.
5. On cache miss: build SELECT from `wp_blogs`. Join `wp_blogmeta` if `meta_query` is present.
6. `WHERE` clauses accumulate for each non-null filter.
7. `ORDER BY`: computed column aliases for `domain_length` (= `CHAR_LENGTH(domain)`) and `path_length` (= `CHAR_LENGTH(path)`) are injected into the SELECT if needed.
8. If `count = true`: executes a `SELECT COUNT(*)` query and returns the integer.
9. Otherwise: executes query, primes `sites` and `site-details` caches if `update_site_cache = true`, queues lazy-load for site meta if `update_site_meta_cache = true`.
10. Returns `WP_Site[]` (default), `number[]` (when `fields = 'ids'`), or `number` (when `count = true`).

### Public properties after execution

```typescript
request: string;         // the executed SQL string
sites: WP_Site[];        // result set
found_sites: number;     // total matching rows (only set when no_found_rows = false)
max_num_pages: number;   // Math.ceil(found_sites / number)
```

---

## 6. WP_Network_Query

`WP_Network_Query` queries `wp_site`. Source: `class-wp-network-query.php`.

### Constructor query arguments

```typescript
interface NetworkQueryArgs {
  network__in: number[];
  network__not_in: number[];
  count: boolean;
  fields: '' | 'ids';
  number: number | '';    // empty = no limit
  offset: number | '';
  no_found_rows: boolean; // default true
  orderby: string | string[] | Record<string, 'ASC' | 'DESC'>;
  // Accepted: 'id', 'domain', 'path', 'domain_length', 'path_length', 'network__in'
  order: 'ASC' | 'DESC';
  domain: string;
  domain__in: string[];
  domain__not_in: string[];
  path: string;
  path__in: string[];
  path__not_in: string[];
  search: string;         // matches domain or path
  update_network_cache: boolean;  // default true
}
```

### Execution model

Mirrors `WP_Site_Query`:

1. `parse_query()` merges and fires `parse_network_query` action.
2. `get_networks()` fires `pre_get_networks` action, then `networks_pre_query` filter.
3. Cache key built against `network-queries` cache group, invalidated by `networks` last-changed stamp.
4. On miss: SELECT from `wp_site` with accumulated WHERE clauses.
5. `domain_length` / `path_length` virtual columns injected for those orderby keys.
6. Results primed into `networks` cache if `update_network_cache = true`.
7. Returns `WP_Network[]`, `number[]` (ids), or `number` (count).

### Public properties

```typescript
request: string;
networks: WP_Network[];
found_networks: number;
max_num_pages: number;
```

---

## 7. Site CRUD

### `wp_insert_site(data: Partial<SiteInsertData>): number | WPError`

Inserts a new row into `wp_blogs`.

```typescript
interface SiteInsertData {
  domain: string;       // required
  path: string;         // default '/'
  network_id: number;   // default: current network ID
  registered: string;   // default: current UTC time
  last_updated: string; // default: same as registered
  public: 0 | 1;        // default 1
  archived: 0 | 1;      // default 0
  mature: 0 | 1;        // default 0
  spam: 0 | 1;          // default 0
  deleted: 0 | 1;       // default 0
  lang_id: number;      // default 0
  // Passed to wp_initialize_site, not stored in wp_blogs:
  user_id: number;
  title: string;
  options: Record<string, unknown>;
  meta: Record<string, unknown>;
}
```

**Procedure:**

1. Call `wp_prepare_site_data(data, defaults)` — normalizes and validates (see below). Returns `WPError` on failure.
2. `INSERT INTO wp_blogs`. On DB failure, return `WPError('db_insert_error')`.
3. `clean_blog_cache(site_id)`.
4. `get_site(site_id)` to confirm the row exists.
5. Fire action `wp_insert_site` with the new `WP_Site`.
6. Fire action `wp_initialize_site` with the new `WP_Site` and any extra args (`user_id`, `title`, `options`, `meta`). This action creates the per-site tables and seeds initial options.
7. For backward compat, if `wpmu_new_blog` action has listeners, fire deprecated `wpmu_new_blog` action.
8. Return the new site ID.

### `wp_update_site(siteId: number, data: Partial<SiteInsertData>): number | WPError`

1. Fetch old site with `get_site(siteId)`. Return `WPError('site_not_exist')` if absent.
2. Merge data over old site's current values.
3. `wp_prepare_site_data(data, defaults, oldSite)`.
4. `UPDATE wp_blogs SET ... WHERE blog_id = siteId`.
5. `clean_blog_cache(oldSite)`.
6. Fire action `wp_update_site` with `(newSite, oldSite)`.
7. Return site ID.

### `wp_delete_site(siteId: number): WP_Site | WPError`

1. Fetch `oldSite`. Return `WPError` if absent.
2. Fire action `wp_validate_site_deletion` with a `WPError` object and `oldSite`. If errors were added to it, return the error object.
3. Fire deprecated action `delete_blog`.
4. Fire action `wp_uninitialize_site` — this drops the per-site tables and cleans up data.
5. Delete all entries from `wp_blogmeta` for this site.
6. `DELETE FROM wp_blogs WHERE blog_id = siteId`.
7. `clean_blog_cache(oldSite)`.
8. Fire action `wp_delete_site` with `oldSite`.
9. Fire deprecated action `deleted_blog`.
10. Return `oldSite`.

### `wp_prepare_site_data(data, defaults, oldSite?): Record<string, unknown> | WPError`

1. If `data.site_id` is set and `data.network_id` is not, treat `site_id` as `network_id` (backward compat).
2. Apply filter `wp_normalize_site_data` — default handler normalizes domain (strip illegal chars), path (ensure leading+trailing slash), `network_id` (cast to int), status flags (cast to int), and removes empty date fields.
3. Strip all keys except the allowed list: `domain`, `path`, `network_id`, `registered`, `last_updated`, `public`, `archived`, `mature`, `spam`, `deleted`, `lang_id`.
4. Fire action `wp_validate_site_data` with an error accumulator, `data`, and `oldSite`. Default handler checks:
   - domain not empty
   - path not empty
   - network_id not empty
   - dates are valid
   - domain+path+network_id combination is unique (unless same as oldSite)
5. If errors exist, return the `WPError` object.
6. Rename `network_id` → `site_id` for the database column name, then return the prepared data.

### `wp_initialize_site(siteId, args)`

Hooked to `wp_initialize_site` by `ms-default-filters.php`. Creates the per-site database tables and seeds them with initial values. Steps:

1. Verify site exists and is not already initialized (checks for existence of the site's options table).
2. Resolve `user_id`, `title` (default `"Site {N}"`), `options`, `meta` from args.
3. Set `wp_installing(true)`.
4. `switch_to_blog(siteId)`.
5. Create per-site tables using `make_db_current_silent()` / `populate_options()`.
6. Set initial options: `siteurl`, `blogname` (title), `admin_email`, `public`, WPLANG, etc.
7. Set up default `wp_user_roles` option from the roles object.
8. If `user_id` is given, add them as administrator via `add_user_to_blog`.
9. `restore_current_blog()`.

### `wp_uninitialize_site(site)`

Hooked to `wp_uninitialize_site`. Drops all per-site tables.

### `get_site(site?)` and `get_sites(args?)`

See Sections 4 and 5.

### `domain_exists(domain, path, networkId?): number | null`

Queries `wp_blogs` for a matching domain+path+network_id combination. Returns the matching `blog_id` or `null`. Runs through the `domain_exists` filter.

---

## 8. Blog Switching

### `switch_to_blog(newBlogId: number): true`

Switches the active site context. Called extensively in cross-site operations.

**Steps:**

1. Push current `blog_id` onto `$_wp_switched_stack`.
2. If `newBlogId === currentBlogId`: fire `switch_blog` action with context `'switch'`, set `$switched = true`, return.
3. Call `wpdb.set_blog_id(newBlogId)` — updates the database object to use the new site's table prefix.
4. Update `$table_prefix = wpdb.get_blog_prefix()`.
5. Update `$blog_id = newBlogId`.
6. If a persistent cache driver supplies `wp_cache_switch_to_blog(newBlogId)`, call it. Otherwise: reinitialize the object cache (`wp_cache_init()`), re-add global cache groups, re-add non-persistent groups.
7. Fire action `switch_blog(newBlogId, prevBlogId, 'switch')`.
8. Set `$switched = true`. Return `true`.

### `restore_current_blog(): boolean`

Restores the previous site context.

**Steps:**

1. If `$_wp_switched_stack` is empty, return `false`.
2. Pop the previous blog ID off the stack (`newBlogId = stack.pop()`).
3. If same as current: fire `switch_blog` action with context `'restore'`, update `$switched`, return `true`.
4. Perform same table prefix and cache logic as `switch_to_blog`.
5. Fire action `switch_blog(newBlogId, prevBlogId, 'restore')`.
6. Update `$switched = !stack.isEmpty()`.

### `ms_is_switched(): boolean`

Returns `true` if the switched stack is non-empty.

### `get_current_blog_id(): number`

Returns the global `$blog_id`. This is always up to date with the currently active site context.

### What changes on switch

| Global / object | Change |
|---|---|
| `$blog_id` | Updated to `newBlogId` |
| `$table_prefix` | Updated via `wpdb.get_blog_prefix(newBlogId)` |
| `wpdb` table properties | `wpdb.posts`, `wpdb.options`, etc. all update to `wp_{N}_posts`, etc. |
| Object cache | Either switched via `wp_cache_switch_to_blog` or fully re-initialized |
| Roles | `wp_roles().for_site(newSiteId)` — reloads capability definitions from new site |
| Current user | `wp_get_current_user().for_site(newSiteId)` — reloads capability allotments from new site |

The `wp_switch_roles_and_user` function handles the roles and user switch; it is hooked to `switch_blog` at priority 1, and only runs after the `init` action has fired.

### `get_blog_option(id, option, default?)`, `add_blog_option`, `update_blog_option`, `delete_blog_option`

These functions switch to the target site, perform the option operation, then restore. If the target site is the current site, no switch is performed.

---

## 9. Network Options

Network options are stored in `wp_sitemeta` as `(site_id, meta_key, meta_value)` rows. They correspond to single-site's `wp_options` table but scoped to a network.

### `get_network_option(networkId: number | null, option: string, defaultValue?: unknown): unknown`

1. Normalize `networkId` (default to current network if 0/null).
2. Apply filter `pre_site_option_{option}` — short-circuit if non-false.
3. Apply filter `pre_site_option` — short-circuit if non-false.
4. Check `{networkId}:notoptions` cache. If option is in the notoptions list, return `apply_filters('default_site_option_{option}', defaultValue)`.
5. On non-multisite: delegate to `get_option(option, defaultValue)`.
6. On multisite: check `{networkId}:{option}` key in `site-options` cache. On miss, query `wp_sitemeta WHERE meta_key = %s AND site_id = %d`. Unserialize and cache the value. If row not found, add to notoptions cache and return default.
7. Apply filter `site_option_{option}` on the value and return.

### `add_network_option(networkId, option, value): boolean`

1. Apply filter `pre_add_site_option_{option}`.
2. Check if option already exists (using notoptions cache or direct read).
3. If it does, return `false` (existing options not updated).
4. `INSERT INTO wp_sitemeta`. Remove from notoptions cache. Update `site-options` cache.
5. Fire actions `add_site_option_{option}` and `add_site_option`.

### `update_network_option(networkId, option, value): boolean`

1. Get old value with `get_network_option`.
2. Apply filter `pre_update_site_option_{option}`.
3. If old == new value, return `false`.
4. If the option did not previously exist, delegate to `add_network_option` and return.
5. `UPDATE wp_sitemeta SET meta_value = ... WHERE site_id = ... AND meta_key = ...`.
6. Update `site-options` cache. Remove from notoptions cache.
7. Fire actions `update_site_option_{option}` and `update_site_option`.

### `delete_network_option(networkId, option): boolean`

1. Apply filter `pre_delete_site_option_{option}`.
2. On non-multisite, delegate to `delete_option`.
3. `DELETE FROM wp_sitemeta WHERE meta_key = ... AND site_id = ...`.
4. Evict from cache. Fire actions `delete_site_option_{option}` and `delete_site_option`.

### Aliases

`get_site_option`, `add_site_option`, `update_site_option`, `delete_site_option` are aliases for the network option functions, using `get_current_network_id()` as the implicit network ID.

### Cache structure

- Cache group: `site-options`
- Key for a value: `"{networkId}:{optionName}"`
- Key for the notoptions map: `"{networkId}:notoptions"` — value is a `Record<string, true>` tracking which options are known to not exist in the DB

---

## 10. User–Site Relationships

A user's membership on a site is encoded as a capability entry in user meta. The meta key is `wp_{blog_id}_capabilities` and the value is a serialized object of `{ roleName: true }` pairs, e.g., `{ "editor": true }`.

### `add_user_to_blog(blogId, userId, role): true | WPError`

1. `switch_to_blog(blogId)`.
2. Fetch user. Return `WPError('user_does_not_exist')` if not found.
3. Apply filter `can_add_user_to_blog` — can veto or return custom error.
4. If user has no `primary_blog` meta, set `primary_blog = blogId` and `source_domain = site.domain`.
5. Call `user.set_role(role)` — writes the `wp_{blogId}_capabilities` user meta.
6. Fire action `add_user_to_blog(userId, role, blogId)`.
7. `clean_user_cache(userId)`.
8. Delete `{blogId}_user_count` from `blog-details` cache.
9. `restore_current_blog()`. Return `true`.

### `remove_user_from_blog(userId, blogId, reassign?): true | WPError`

1. `switch_to_blog(blogId)`.
2. Fire action `remove_user_from_blog(userId, blogId, reassign)`.
3. If this blog was the user's `primary_blog`, find their next available blog and update `primary_blog` and `source_domain` meta.
4. `user.remove_all_caps()` — deletes the `wp_{blogId}_capabilities` meta entry.
5. If user now has no blogs at all, clear `primary_blog` and `source_domain` meta.
6. If `reassign` is given: UPDATE posts and links that belong to the removed user, assigning them to the reassign user.
7. `clean_user_cache(userId)`.
8. `restore_current_blog()`. Return `true`.

### `is_user_member_of_blog(userId?, blogId?): boolean`

1. Default `userId` = current user; default `blogId` = current site.
2. On non-multisite, always return `true`.
3. Fetch user. If not found, return `false`.
4. Look up the site. If not found, return `false`.
5. Determine the table prefix for the blog. Check user meta `{prefix}capabilities` — if the key exists, return `true`.

### `get_blogs_of_user(userId, all?: boolean): Record<number, UserBlogObject>`

Returns an object keyed by site ID.

1. Apply filter `pre_get_blogs_of_user` — short-circuit if non-null.
2. On non-multisite, return a synthetic single-site entry.
3. Get all user meta keys. Scan for keys matching `{base_prefix}{N}_capabilities`. Collect those `N` values as candidate site IDs.
4. Also check `{base_prefix}capabilities` (site ID 1 role).
5. Query `get_sites({ site__in: siteIds, archived: 0, spam: 0, deleted: 0 })` (unless `all = true`, in which case all statuses are included).
6. Map results to `UserBlogObject` shape: `{ userblog_id, blogname, domain, path, site_id, siteurl, archived, mature, spam, deleted }`.
7. Apply filter `get_blogs_of_user`.

```typescript
interface UserBlogObject {
  userblog_id: number;
  blogname: string;
  domain: string;
  path: string;
  site_id: number;      // network ID
  siteurl: string;
  archived: string;
  mature: string;
  spam: string;
  deleted: string;
}
```

### `get_active_blog_for_user(userId): WP_Site | undefined`

1. Get all blogs with `get_blogs_of_user(userId)`.
2. Read `primary_blog` user meta. If set and the corresponding blog exists and is not archived/spam/deleted, return it.
3. If primary is gone, iterate other blogs to find an active one, update `primary_blog` meta.

---

## 11. Super Admins

A super admin is a user who has unrestricted network-wide access. The list is stored in the `site_admins` network option as an array of user login strings.

### `is_super_admin(userId?: number): boolean`

1. If no `userId`, use current user.
2. If not multisite: return whether user has the `delete_users` capability.
3. If multisite: get the super admins list, check if `user.user_login` is in it.

### `get_super_admins(): string[]`

Returns the `site_admins` network option. Defaults to `['admin']` if not set. If the global `$super_admins` array is defined, that override is used instead.

### `grant_super_admin(userId): boolean`

1. If `$super_admins` global is defined or not multisite, return `false`.
2. Fire action `grant_super_admin(userId)`.
3. Fetch `site_admins` option directly (not via `get_super_admins()` to avoid global override).
4. If user login is already present, return `false`.
5. Append login to array, call `update_site_option('site_admins', updatedArray)`.
6. Fire action `granted_super_admin(userId)`. Return `true`.

### `revoke_super_admin(userId): boolean`

1. If `$super_admins` global is defined or not multisite, return `false`.
2. Fire action `revoke_super_admin(userId)`.
3. Fetch `site_admins` option directly.
4. Find and remove user login from array.
5. `update_site_option('site_admins', updatedArray)`.
6. Fire action `revoked_super_admin(userId)`. Return `true`.

### `$super_admins` global override

If the PHP global `$super_admins` is defined (typically in `wp-config.php`), the `get_super_admins()` function returns that array directly without reading from the database. `grant_super_admin` and `revoke_super_admin` both refuse to operate and return `false` when this override is present, because there is no canonical writable source.

---

## 12. Signup/Activation Flow

The self-service signup system uses the `wp_signups` table. The full flow has two paths: user-only signup, and site+user signup.

### Step 1 — Validation

#### `wpmu_validate_user_signup(userName, userEmail): ValidationResult`

Validates a new user registration attempt. Checks:

- Username matches `[a-z0-9]+` only (sanitized with `sanitize_user`).
- Not in the `illegal_names` network option (defaults: `www, web, root, admin, main, invite, administrator`).
- Not in the `illegal_user_logins` filter list.
- Email passes `is_email()` and is not in the banned email domains list (`banned_email_domains` network option).
- Username length is between 4 and 60 characters.
- Username is not all-numeric.
- Email domain is in `limited_email_domains` if that option is set.
- Username not already taken (`username_exists()`).
- Email not already registered (`email_exists()`).
- No pending signup row for this username or email (if the signup row is older than 2 days, the old row is deleted and the check passes).

```typescript
interface ValidationResult {
  user_name: string;
  orig_username: string;
  user_email: string;
  errors: WPError;
}
```

Passes result through filter `wpmu_validate_user_signup`.

#### `wpmu_validate_blog_signup(blogname, blogTitle, user?): BlogValidationResult`

Validates a new site registration attempt.

- `blogname` matches `[a-z0-9]+` only.
- Not in `illegal_names` option.
- On subdirectory installs: also not in `get_subdirectory_reserved_names()` list: `['page', 'comments', 'blog', 'files', 'feed', 'wp-admin', 'wp-content', 'wp-includes', 'wp-json', 'embed']`.
- Minimum length (default 4, filterable via `minimum_site_name_length`).
- Not all-numeric.
- On subdirectory: not matching any page slug on the main site.
- Does not conflict with an existing username (unless `user.user_login === blogname`).
- `domain_exists()` check — domain+path combination must be unique.
- No pending signup row for this domain+path (unless older than 2 days).

```typescript
interface BlogValidationResult {
  domain: string;
  path: string;
  blogname: string;
  blog_title: string;
  user: WPUser | '';
  errors: WPError;
}
```

Passes result through filter `wpmu_validate_blog_signup`.

### Step 2 — Recording the signup

#### `wpmu_signup_user(user, userEmail, meta?)`

Inserts a user-only signup row into `wp_signups`:
- `domain = ''`, `path = ''`, `title = ''`
- `user_login`, `user_email`, `registered = now()`
- `activation_key = substr(md5(time + rand + email), 0, 16)`
- `meta = serialize(meta)` (filtered through `signup_user_meta`)

Fires action `after_signup_user(user, userEmail, key, meta)`.

#### `wpmu_signup_blog(domain, path, title, user, userEmail, meta?)`

Inserts a site signup row into `wp_signups`:
- `domain`, `path`, `title`, `user_login`, `user_email`, `registered = now()`
- `activation_key = substr(md5(time + rand + domain), 0, 16)`
- `meta = serialize(meta)` (filtered through `signup_site_meta`)

Fires action `after_signup_site(domain, path, title, user, userEmail, key, meta)`.

### Step 3 — Notification emails

`wpmu_signup_user_notification` is hooked to `after_signup_user`. It sends the activation email. The email body and subject are filterable via `wpmu_signup_user_notification_email` / `wpmu_signup_user_notification_subject`. The entire notification can be suppressed by returning falsy from the `wpmu_signup_user_notification` filter.

`wpmu_signup_blog_notification` is hooked to `after_signup_site`. Similar pattern with `wpmu_signup_blog_notification_email` / `wpmu_signup_blog_notification_subject` filters.

### Step 4 — Activation

#### `wpmu_activate_signup(key): ActivationResult | WPError`

1. Query `wp_signups WHERE activation_key = %s`.
2. Return `WPError('invalid_key')` if no row found.
3. Return `WPError('already_active')` if `signup.active = 1`.
4. Deserialize `signup.meta`.
5. Generate a random 12-character password.
6. If user login does not yet exist: `wpmu_create_user(login, password, email)`.
7. Mark the signup as active: `UPDATE wp_signups SET active=1, activated=now() WHERE activation_key = key`.
8. If `signup.domain` is empty (user-only signup): fire action `wpmu_activate_user(userId, password, meta)`. Return `{ user_id, password, meta }`.
9. If `signup.domain` is not empty (site signup): `wpmu_create_blog(domain, path, title, userId, meta, networkId)`.
10. If blog creation succeeds, fire action `wpmu_activate_blog(blogId, userId, password, title, meta)`.
11. Return `{ blog_id, user_id, password, title, meta }`.

```typescript
// user-only activation result
interface UserActivationResult {
  user_id: number;
  password: string;
  meta: Record<string, unknown>;
}

// site activation result
interface SiteActivationResult {
  blog_id: number;
  user_id: number;
  password: string;
  title: string;
  meta: Record<string, unknown>;
}
```

### `wpmu_create_user(userName, password, email): number | false`

Wraps `wp_create_user`. After creation, deletes the `capabilities` and `user_level` user options (new multisite users have no role until added to a site). Fires action `wpmu_new_user(userId)`.

### `wpmu_create_blog(domain, path, title, userId, options?, networkId?): number | WPError`

Checks `domain_exists`; if taken returns `WPError('blog_taken')`. Sets `wp_installing(true)`. Builds site data and calls `wp_insert_site()`.

---

## 13. Domain Mapping and `sunrise.php`

WordPress Multisite supports custom domain mapping through a mechanism called `sunrise.php`. This is an optional drop-in file at `wp-content/sunrise.php` that loads during multisite bootstrap, before the automatic domain/path detection logic runs.

### Loading sequence

In `ms-settings.php`:

```
1. Define MULTISITE and load WP_Network, WP_Site classes
2. Load ms-load.php
3. Load ms-default-constants.php
4. If define('SUNRISE', ...) constant is defined, include wp-content/sunrise.php
5. ms_subdomain_constants() — handles SUBDOMAIN_INSTALL / VHOST
6. If $current_site or $current_blog are not yet set, run automatic detection
```

If `SUNRISE` is defined, `sunrise.php` is loaded before the automatic `ms_load_current_site_and_network` call. A `sunrise.php` file can:
- Set `$current_site` and `$current_blog` manually (bypassing automatic detection entirely).
- Set only `$current_site` and let the path-matching detect `$current_blog`.
- Do neither, allowing automatic detection to run as normal.

### Domain mapping pattern

A domain mapping plugin typically:
1. Defines `SUNRISE`.
2. In `sunrise.php`, queries a mapping table for the incoming `HTTP_HOST` to find the real site ID.
3. Sets `$current_blog = get_site(mappedSiteId)` and `$current_site = get_network($current_blog->site_id)`.

The system does not provide built-in domain mapping; `sunrise.php` is the integration point.

### Domain handling details

When detecting a site by domain:

- Both `www.example.com` and `example.com` are queried simultaneously. The longer (more specific) match wins. This means a site can be registered as `example.com` and will match both `example.com` and `www.example.com` requests.
- Ports `:80` and `:443` are stripped from `HTTP_HOST` before comparison.
- Domain comparison is case-insensitive.

---

## 14. ms-load.php — Multisite Bootstrap

`ms-load.php` provides the functions needed to bootstrap multisite. It runs before any site-specific code loads.

### `is_subdomain_install(): boolean`

Returns `SUBDOMAIN_INSTALL` constant if defined. Falls back to `VHOST === 'yes'` for legacy compatibility.

### `ms_site_check(): true | string`

Called on every request to verify the current site is not blocked. Returns `true` if the site passes checks or if the current user is a super admin. Returns a path to a drop-in file if one of the following conditions applies:

| Condition | `deleted` value | Drop-in file |
|---|---|---|
| Site deleted | `"1"` | `wp-content/blog-deleted.php` |
| Site inactive/not activated | `"2"` | `wp-content/blog-inactive.php` |
| Site archived or spam | archived=`"1"` or spam=`"1"` | `wp-content/blog-suspended.php` |

If the corresponding drop-in file does not exist, `wp_die()` is called directly.

Can be bypassed by returning non-null from the `ms_site_check` filter.

### `ms_load_current_site_and_network(domain, path, subdomain?): true | false | string`

The central bootstrap function. Populates `$current_blog` and `$current_site` globals.

**Inputs:** normalized domain (lowercase, no port), path (without query string, admin paths truncated to their base), subdomain flag.

**Output:** `true` (success), `false` (fatal — site not installed), or a redirect URL string.

**Logic:**

**Case A — Constants defined (`DOMAIN_CURRENT_SITE` + `PATH_CURRENT_SITE`):**
Construct `$current_site` stub from constants. Then find `$current_blog` using `get_site_by_path`:
- If the request matches the network's domain and path exactly: call with full path.
- If the network has a non-root path and the request starts with it: call with `1 + count(networkPathSegments)` segments.
- Otherwise: call with 1 segment.

**Case B — Subdirectory install (subdomain = false):**
Network must be found first because path segments depend on the network's path prefix.
1. Check `current_network` in `site-options` cache.
2. If only one network exists, use it directly.
3. Otherwise call `WP_Network.get_by_path(domain, path, 1)`.
4. If no network found, fire `ms_network_not_found(domain, path)` action and return `false`.
5. Find site using `get_site_by_path` with the correct number of path segments relative to the network path.

**Case C — Subdomain install (subdomain = true):**
Site can be found first.
1. Call `get_site_by_path(domain, path, 1)`.
2. If site found, load its network via `WP_Network.get_instance(site.site_id)`.
3. If no site: find network via `WP_Network.get_by_path(domain, path, 1)`.

**Post-resolution:**
- If `$current_blog.site_id !== $current_site.id`: reload `$current_site` to match the site's declared network.
- If no network: fire `ms_network_not_found`, return `false`.
- If no site and `wp_installing()`: create a synthetic `$current_blog` stub (blog_id=1, public=1).
- If no site: fire `ms_site_not_found($current_site, domain, path)`. Build redirect URL:
  - Subdomain + no `NOBLOGREDIRECT`: redirect to `{networkUrl}wp-signup.php?new={subdomain}`.
  - Subdomain + `NOBLOGREDIRECT`: redirect to that constant's value (unless it's `'%siteurl%'`).
  - Subdirectory where network domain matches request domain: return `false` (not installed).
  - Otherwise: return redirect URL to network home.
- Ensure `$current_site.blog_id` is set by calling `get_main_site_id`.
- Return `true`.

### `get_site_by_path(domain, path, segments?): WP_Site | false`

1. Parse `path` into segments. Apply `site_by_path_segments_count` filter.
2. Build candidate paths list from longest to shortest, always ending with `["/"]`.
3. Apply `pre_get_site_by_path` filter — short-circuit if non-null.
4. Build domains list: if `domain` starts with `www.`, also include the non-www version.
5. Query `get_sites` with domain(s), path(s), ordered by `domain_length DESC, path_length DESC`, limit 1.
6. Return site or `false`.

### `ms-settings.php` bootstrap sequence

```
1. Declare globals: $current_site, $current_blog, $domain, $path, $site_id, $public
2. Require class-wp-network.php
3. Require class-wp-site.php
4. Require ms-load.php
5. Require ms-default-constants.php
6. If SUNRISE defined: include wp-content/sunrise.php
7. ms_subdomain_constants()
8. If $current_site or $current_blog not set:
   a. Normalize domain from HTTP_HOST (lowercase, strip :80/:443)
   b. Normalize path from REQUEST_URI (strip query string; if admin, truncate to site root)
   c. ms_load_current_site_and_network(domain, path, is_subdomain_install())
   d. On false: ms_not_installed(domain, path) — fatal
   e. On string: Location: redirect, exit
9. Set $blog_id, $public, $site_id from $current_blog
10. wp_load_core_site_options($site_id)
11. wpdb.set_prefix($table_prefix, false)
12. wpdb.set_blog_id($current_blog.blog_id, $current_blog.site_id)
13. $table_prefix = wpdb.get_blog_prefix()
14. Initialize $_wp_switched_stack = [], $switched = false
15. wp_start_object_cache() — re-init after blog_id is known
16. Cast $current_site to WP_Network if needed
17. Cast $current_blog to WP_Site if needed
18. ms_upload_constants()
19. Fire action 'ms_loaded'
```

---

## 15. Multisite-Specific Constants

### Required constants (set in `wp-config.php`)

```typescript
declare const MULTISITE: boolean;        // true — enables multisite
declare const SUBDOMAIN_INSTALL: boolean; // true = subdomains, false = subdirectories
declare const DOMAIN_CURRENT_SITE: string; // network domain, e.g. "example.com"
declare const PATH_CURRENT_SITE: string;   // network path, e.g. "/"
declare const SITE_ID_CURRENT_SITE: number; // network ID, typically 1
declare const BLOG_ID_CURRENT_SITE: number; // main site ID, typically 1
```

When `DOMAIN_CURRENT_SITE` and `PATH_CURRENT_SITE` are defined, the bootstrap skips the DB query to find the network and constructs `$current_site` directly from constants. This is the standard single-network configuration.

When these constants are absent, the network is found by querying `wp_site` based on the incoming domain/path.

### Optional / computed constants

```typescript
declare const VHOST: 'yes' | 'no';        // deprecated alias for SUBDOMAIN_INSTALL
declare const BLOGID_CURRENT_SITE: number; // deprecated alias for BLOG_ID_CURRENT_SITE
declare const NOBLOGREDIRECT: string;      // if defined, redirects 404 subdomain requests here
                                           // '%siteurl%' means redirect to network home
declare const SUNRISE: string;            // if defined, sunrise.php is included
declare const UPLOADBLOGSDIR: string;     // base upload dir for legacy file serving
declare const UPLOADS: string;            // per-site upload path (legacy ms-files.php mode)
declare const BLOGUPLOADDIR: string;      // absolute upload path (legacy mode)
declare const WPMU_SENDFILE: boolean;     // enable X-Sendfile header (default false)
declare const WPMU_ACCEL_REDIRECT: boolean; // enable X-Accel-Redirect header (default false)
declare const COOKIEPATH: string;         // set to network path
declare const SITECOOKIEPATH: string;     // set to network path
declare const ADMIN_COOKIE_PATH: string;  // wp-admin cookie scope
declare const COOKIE_DOMAIN: string;      // set to ".{network.cookie_domain}" for subdomains
```

### Cookie constants behavior

`ms_cookie_constants()` defines these based on the current network:

- `COOKIEPATH` and `SITECOOKIEPATH` = `current_site.path`.
- `ADMIN_COOKIE_PATH`: on subdirectory installs or if the site has a path, equals `SITECOOKIEPATH`; otherwise `SITECOOKIEPATH + 'wp-admin'`.
- `COOKIE_DOMAIN`: only defined on subdomain installs. Value is `"." + network.cookie_domain` (note leading dot for cross-subdomain cookie sharing).

---

## 16. Key Hooks and Filters

### Bootstrap hooks

| Hook | Type | When | Arguments |
|---|---|---|---|
| `ms_loaded` | action | After `$current_site` and `$current_blog` are established | none |
| `ms_network_not_found` | action | No network found for domain+path | `domain, path` |
| `ms_site_not_found` | action | Network found but no site for domain+path | `current_site, domain, path` |
| `ms_site_check` | filter | Before the site status check; return non-null to bypass | `null` |

### Site discovery filters

| Hook | Type | Description |
|---|---|---|
| `pre_get_site_by_path` | filter | Short-circuit `get_site_by_path`; return `WP_Site`, `false`, or `null` |
| `site_by_path_segments_count` | filter | Override the number of path segments examined |
| `pre_get_network_by_path` | filter | Short-circuit `WP_Network.get_by_path` |
| `network_by_path_segments_count` | filter | Override segments for network path matching |
| `pre_get_main_site_id` | filter | Override main site ID for a network |

### Site CRUD hooks

| Hook | Type | Arguments |
|---|---|---|
| `wp_insert_site` | action | `new_site: WP_Site` |
| `wp_update_site` | action | `new_site: WP_Site, old_site: WP_Site` |
| `wp_delete_site` | action | `old_site: WP_Site` |
| `wp_initialize_site` | action | `new_site: WP_Site, args: object` |
| `wp_uninitialize_site` | action | `old_site: WP_Site` |
| `wp_validate_site_deletion` | action | `errors: WPError, old_site: WP_Site` |
| `wp_validate_site_data` | action | `errors: WPError, data: object, old_site: WP_Site \| null` |
| `wp_normalize_site_data` | filter | `data: object` |
| `get_site` | filter | `site: WP_Site` |
| `sites_pre_query` | filter | Short-circuit `WP_Site_Query.get_sites` |
| `pre_get_sites` | action | `query: WP_Site_Query` (by reference) |

### Blog switching hooks

| Hook | Type | Arguments |
|---|---|---|
| `switch_blog` | action | `new_blog_id, prev_blog_id, context: 'switch' \| 'restore'` |

### Network option hooks (dynamic, `{option}` = option name)

| Hook | Type |
|---|---|
| `pre_site_option_{option}` | filter — short-circuit get |
| `pre_site_option` | filter — short-circuit all gets |
| `site_option_{option}` | filter — modify retrieved value |
| `default_site_option_{option}` | filter — modify default when option missing |
| `pre_add_site_option_{option}` | filter — modify value before add |
| `add_site_option_{option}` | action — fired after successful add |
| `add_site_option` | action — fired after any successful add |
| `pre_update_site_option_{option}` | filter — modify value before update |
| `update_site_option_{option}` | action — fired after successful update |
| `update_site_option` | action — fired after any successful update |
| `delete_site_option_{option}` | action — fired after successful delete |
| `delete_site_option` | action — fired after any successful delete |

### User–site relationship hooks

| Hook | Type | Arguments |
|---|---|---|
| `add_user_to_blog` | action | `user_id, role, blog_id` |
| `remove_user_from_blog` | action | `user_id, blog_id, reassign` |
| `can_add_user_to_blog` | filter | `true \| WPError, user_id, role, blog_id` |
| `pre_get_blogs_of_user` | filter | `null, user_id, all` |
| `get_blogs_of_user` | filter | `sites, user_id, all` |

### Super admin hooks

| Hook | Type | Arguments |
|---|---|---|
| `grant_super_admin` | action | `user_id` |
| `granted_super_admin` | action | `user_id` |
| `revoke_super_admin` | action | `user_id` |
| `revoked_super_admin` | action | `user_id` |

### Signup/activation hooks

| Hook | Type | Arguments |
|---|---|---|
| `after_signup_user` | action | `user, userEmail, key, meta` |
| `after_signup_site` | action | `domain, path, title, user, userEmail, key, meta` |
| `wpmu_activate_user` | action | `user_id, password, meta` |
| `wpmu_activate_blog` | action | `blog_id, user_id, password, signup_title, meta` |
| `wpmu_new_user` | action | `user_id` |
| `wpmu_validate_user_signup` | filter | `result: ValidationResult` |
| `wpmu_validate_blog_signup` | filter | `result: BlogValidationResult` |
| `signup_user_meta` | filter | `meta, user, userEmail, key` |
| `signup_site_meta` | filter | `meta, domain, path, title, user, userEmail, key` |
| `wpmu_signup_user_notification` | filter | short-circuit; return falsy to suppress |
| `wpmu_signup_blog_notification` | filter | short-circuit; return falsy to suppress |

### Count update hooks

| Hook | Type | Arguments |
|---|---|---|
| `update_network_counts` | action | none — scheduled twicedaily |
| `wp_insert_site` | action | triggers `wp_maybe_update_network_site_counts_on_update` |
| `wp_update_site` | action | triggers site count and status transition checks |
| `wp_delete_site` | action | triggers site count update |

### Default filters registered by `ms-default-filters.php`

```
init          → ms_subdomain_constants
init          → maybe_add_existing_user_to_blog
switch_blog   → wp_switch_roles_and_user  (priority 1)
update_option_blog_public → update_blog_public
option_users_can_register → users_can_register_signup_filter
wpmu_new_user → newuser_notify_siteadmin
wpmu_activate_user → add_new_user_to_blog
wpmu_activate_user → wpmu_welcome_user_notification
wpmu_activate_blog → wpmu_welcome_notification
after_signup_user → wpmu_signup_user_notification
after_signup_site → wpmu_signup_blog_notification
wp_initialize_site → wp_initialize_site        (priority 10)
wp_initialize_site → wpmu_log_new_registrations (priority 100)
wp_initialize_site → newblog_notify_siteadmin   (priority 100)
wp_uninitialize_site → wp_uninitialize_site
template_redirect → maybe_redirect_404
sanitize_user     → strtolower
deleted_user      → wp_delete_signup_on_user_delete
admin_init        → wp_schedule_update_network_counts
update_network_counts → wp_update_network_counts
wp_upload_bits    → upload_is_file_too_big
upload_size_limit → upload_size_limit_filter
phpmailer_init    → fix_phpmailer_messageid
```

Additionally, `WP_HOME` and `WP_SITEURL` environment constants are explicitly **disconnected** on multisite — the filters `option_siteurl` and `option_home` that would apply those constants are removed.

---

## 17. TypeScript Interface Sketch

```typescript
// ─── Core entity interfaces ───────────────────────────────────────────────────

interface WPNetwork {
  readonly id: number;
  domain: string;
  path: string;
  readonly blog_id: string;  // numeric string, main site ID
  cookie_domain: string;
  site_name: string;

  getMainSiteId(): number;
  toInstance(): WPNetwork;
}

interface WPSite {
  blog_id: string;      // numeric string (primary key)
  domain: string;
  path: string;
  site_id: string;      // numeric string (network ID)
  registered: string;   // MySQL datetime
  last_updated: string; // MySQL datetime
  public: '0' | '1';
  archived: '0' | '1';
  mature: '0' | '1';
  spam: '0' | '1';
  deleted: '0' | '1' | '2';
  lang_id: string;

  // Computed accessors
  readonly id: number;
  readonly network_id: number;

  // Lazy-loaded (available after ms_loaded action)
  readonly blogname?: string;
  readonly siteurl?: string;
  readonly post_count?: string;
  readonly home?: string;

  toArray(): Record<string, string>;
}

// ─── Query argument interfaces ────────────────────────────────────────────────

interface SiteQueryArgs {
  site__in?: number[];
  site__not_in?: number[];
  count?: boolean;
  date_query?: DateQueryArgs | null;
  fields?: '' | 'ids';
  ID?: number;
  number?: number;
  offset?: number;
  no_found_rows?: boolean;
  orderby?: string | string[] | Record<string, 'ASC' | 'DESC'> | false;
  order?: 'ASC' | 'DESC';
  network_id?: number;
  network__in?: number[];
  network__not_in?: number[];
  domain?: string;
  domain__in?: string[];
  domain__not_in?: string[];
  path?: string;
  path__in?: string[];
  path__not_in?: string[];
  public?: 1 | 0 | null;
  archived?: 1 | 0 | null;
  mature?: 1 | 0 | null;
  spam?: 1 | 0 | null;
  deleted?: 1 | 0 | null;
  lang_id?: number | null;
  lang__in?: number[];
  lang__not_in?: number[];
  search?: string;
  search_columns?: ('domain' | 'path')[];
  update_site_cache?: boolean;
  update_site_meta_cache?: boolean;
  meta_query?: MetaQueryArgs | '';
  meta_key?: string | string[];
  meta_value?: string | string[];
  meta_compare?: string;
}

interface NetworkQueryArgs {
  network__in?: number[];
  network__not_in?: number[];
  count?: boolean;
  fields?: '' | 'ids';
  number?: number;
  offset?: number;
  no_found_rows?: boolean;
  orderby?: string | string[] | Record<string, 'ASC' | 'DESC'> | false;
  order?: 'ASC' | 'DESC';
  domain?: string;
  domain__in?: string[];
  domain__not_in?: string[];
  path?: string;
  path__in?: string[];
  path__not_in?: string[];
  search?: string;
  update_network_cache?: boolean;
}

// ─── CRUD data shapes ─────────────────────────────────────────────────────────

interface SiteInsertData {
  domain: string;
  path?: string;
  network_id?: number;
  registered?: string;
  last_updated?: string;
  public?: 0 | 1;
  archived?: 0 | 1;
  mature?: 0 | 1;
  spam?: 0 | 1;
  deleted?: 0 | 1;
  lang_id?: number;
  // Initialization extras (not stored in wp_blogs):
  user_id?: number;
  title?: string;
  options?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

// ─── Signup / activation ──────────────────────────────────────────────────────

interface SignupRow {
  signup_id: number;
  domain: string;
  path: string;
  title: string;
  user_login: string;
  user_email: string;
  registered: string;
  activated: string;
  active: 0 | 1;
  activation_key: string;
  meta: string;  // serialized
}

interface UserValidationResult {
  user_name: string;
  orig_username: string;
  user_email: string;
  errors: WPError;
}

interface BlogValidationResult {
  domain: string;
  path: string;
  blogname: string;
  blog_title: string;
  user: WPUser | '';
  errors: WPError;
}

interface UserActivationResult {
  user_id: number;
  password: string;
  meta: Record<string, unknown>;
}

interface SiteActivationResult {
  blog_id: number;
  user_id: number;
  password: string;
  title: string;
  meta: Record<string, unknown>;
}

// ─── User–blog object (returned by get_blogs_of_user) ─────────────────────────

interface UserBlogObject {
  userblog_id: number;
  blogname: string;
  domain: string;
  path: string;
  site_id: number;   // network ID
  siteurl: string;
  archived: string;
  mature: string;
  spam: string;
  deleted: string;
}

// ─── Global runtime state ─────────────────────────────────────────────────────

interface MultisiteGlobals {
  currentSite: WPNetwork;          // $current_site
  currentBlog: WPSite;             // $current_blog
  blogId: number;                  // $blog_id
  tablePrefix: string;             // $table_prefix (changes on switch_to_blog)
  switched: boolean;               // $switched
  switchedStack: number[];         // $_wp_switched_stack
  superAdmins?: string[];          // $super_admins (optional override)
}

// ─── Multisite constants ──────────────────────────────────────────────────────

interface MultisiteConstants {
  MULTISITE: boolean;
  SUBDOMAIN_INSTALL: boolean;
  DOMAIN_CURRENT_SITE: string;
  PATH_CURRENT_SITE: string;
  SITE_ID_CURRENT_SITE: number;
  BLOG_ID_CURRENT_SITE: number;
  NOBLOGREDIRECT?: string;
  SUNRISE?: string;
  COOKIE_DOMAIN?: string;
  COOKIEPATH: string;
  SITECOOKIEPATH: string;
  ADMIN_COOKIE_PATH: string;
}
```

---

## 18. Design Patterns to Carry Over

### Naming collision: network vs. site

The PHP code uses "site" to mean "network" in many places (the table is `wp_site`, the global is `$current_site`, the class is `WP_Network`). In a TypeScript rewrite, always use `network` to mean the top-level container and `site` to mean an individual blog. The legacy names exist only to explain where things live in the original DB schema and PHP globals.

### Numeric-string fields

`WP_Site` stores all status fields as string representations of integers (e.g., `public = "1"`). This is for PHP backward compatibility. In TypeScript, prefer actual number types and coerce only at the persistence boundary.

### Lazy loading via magic accessors

`WP_Site`'s extended properties (`blogname`, `siteurl`, `home`, `post_count`) are loaded on first access by switching to the site, reading options, and caching. Implement this with a getter that checks a cache and populates on miss. The cache key in WordPress is `blog_id` in the `site-details` group.

### Sentinel cache values

A miss in the `sites` or `networks` cache groups is stored as the integer `-1` to distinguish "cache miss" from "checked and not found". Without this, a lookup for a non-existent entity would always go to the database. A TypeScript equivalent would be a three-state cache: `undefined` (not checked), `null` or a sentinel symbol (checked, does not exist), and the actual value.

### Switched-stack context management

`switch_to_blog` / `restore_current_blog` implement a LIFO stack. Callers that call `switch_to_blog` in a loop or in error paths must always call `restore_current_blog()` in a `finally` block. A TypeScript implementation should provide a `withBlog(id, fn)` helper that wraps the switch/restore in a try/finally automatically.

### Cache groups: global vs. site-scoped

On multisite, some cache groups are **global** (shared across all site contexts even when switched) and some are **site-local** (cleared/replaced when switching). The global groups are:

```
'blog-details', 'blog-id-cache', 'blog-lookup', 'blog_meta',
'global-posts', 'image_editor', 'networks', 'network-queries',
'sites', 'site-details', 'site-options', 'site-queries',
'site-transient', 'theme_files', 'rss',
'users', 'user-queries', 'user_meta', 'useremail', 'userlogins', 'userslugs'
```

Non-persistent (in-memory only, not synced to external cache):
```
'counts', 'plugins', 'theme_json'
```

A TypeScript cache implementation needs to respect this partitioning: when the active site changes, site-local cache partitions are replaced while global partitions remain.

### Table prefix switching

The database object's table property aliases (`.posts`, `.options`, `.users`, etc.) must recalculate when the active site switches. The pattern is: when `switch_to_blog(N)` is called, the DB object recalculates all table names using `wp_{N}_` as the prefix (except the main site which uses `wp_`). Any code that caches a table name reference must be invalidated on switch.

### Filter short-circuits with `null` vs. `false` sentinel

Multiple discovery filters use `null` to mean "I don't want to override" and `false` to mean "I want to explicitly return nothing found." For example, `pre_get_site_by_path` returning `null` allows WordPress to continue; returning `false` signals "no site exists here"; returning a `WP_Site` provides the result directly. Implement the same three-state semantics in TypeScript filter hooks.

### Signup expiry

Pending signups older than 2 days are treated as expired. When `wpmu_validate_user_signup` or `wpmu_validate_blog_signup` finds a conflicting signup row that is older than `2 * 86400` seconds, it deletes the row and allows the new registration to proceed. This prevents usernames and site names from being permanently blocked by unactivated signups.

### Large network detection

`wp_is_large_network(context)` returns `true` when user or site count exceeds 10,000. When a network is large, live-count updates are skipped (counts are only updated on the scheduled cron). The threshold and the large/small determination are both filterable. A TypeScript implementation should respect this opt-out of expensive count queries.

### `notoptions` cache pattern for network options

The `{networkId}:notoptions` cache entry is a set of option names that are known to not exist in `wp_sitemeta`. Before querying the database for any network option, this set is checked. If the option is in the notoptions set, the default value is returned immediately. This avoids repeated DB queries for frequently-requested options that don't exist. The set is invalidated when any option is added or deleted.

---

## 19. Tovu Reconstruction Notes

### 19.1 Why this exists

Multisite exists so one runtime can host many independently addressed sites under a shared network/container model. It forces WordPress to distinguish network-wide state from site-local state and to make context switching explicit across cache, database, URLs, and permissions.

### 19.2 What Tovu should preserve

- A precise distinction between top-level network/tenant state and per-site state
- Centralized context switching so caches, table/schema bindings, and URLs all move together
- Shared user identity with site-scoped permissions and configuration
- Discovery and negative-cache behavior for sites/networks so tenant lookup is cheap and deterministic

### 19.3 What Tovu can simplify

- Tovu should use consistent terminology like `network` and `site` instead of inheriting WordPress's naming confusion
- Global mutable switching APIs can be wrapped in safer helper scopes or request contexts
- If Tovu's tenancy model is narrower than WordPress multisite, some legacy branches can stay out of V1

### 19.4 Possible Tovu seams

- `src/features/tenant/` for network/site discovery and context policy
- `src/core/ports/TenantContextPort.ts` for safe switch/restore behavior
- `src/core/ports/TenantDiscoveryPort.ts` for host/path-to-site resolution
- `src/core/ports/TenantConfigPort.ts` for network and site option access

### 19.5 Suggested priority

- `V1`: tenant discovery, explicit context switching, shared-user plus site-scoped permission model
- `Later`: large-network optimizations, legacy compatibility terminology, and deeper signup/network admin parity
