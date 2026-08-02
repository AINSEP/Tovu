# Database Abstraction Layer (wpdb) — Specification

**Source files analyzed:**
- `wp-includes/class-wpdb.php`

---

## 1. Overview

`wpdb` is the WordPress database abstraction layer. It wraps a single MySQL connection (via the `mysqli` PHP extension) and provides:

- A `prepare()` method for parameterized query construction using `sprintf()`-style placeholders.
- Convenience CRUD methods (`insert`, `replace`, `update`, `delete`) that build and execute safe SQL without requiring manual query strings.
- Result-fetch helpers (`get_var`, `get_row`, `get_col`, `get_results`) that return data in multiple formats.
- Per-query charset/collation validation and invalid-text stripping.
- A table-prefix system supporting single-site and Multisite installations.
- Error visibility controls (`show_errors`, `suppress_errors`, `hide_errors`).
- A query log activated by the `SAVEQUERIES` constant.
- Automatic reconnection on MySQL error 2006 ("server has gone away").

The global singleton is `$wpdb`, instantiated in `wp-includes/wp-db.php` (or replaced by a `wp-content/db.php` drop-in). All WordPress core database access goes through this object.

Constants defined at file scope (must be available in the TypeScript equivalent as string literals or an enum):

| PHP Constant | Value | Meaning |
|---|---|---|
| `EZSQL_VERSION` | `'WP1.25'` | Legacy version string |
| `OBJECT` | `'OBJECT'` | Return rows as objects |
| `object` | `'OBJECT'` | Back-compat alias |
| `OBJECT_K` | `'OBJECT_K'` | Return rows as object map keyed by first column |
| `ARRAY_A` | `'ARRAY_A'` | Return rows as associative arrays |
| `ARRAY_N` | `'ARRAY_N'` | Return rows as numerically indexed arrays |

---

## 2. Global State / Initialization

### Constructor parameters

```
wpdb(dbuser, dbpassword, dbname, dbhost)
```

| Parameter | Type | Description |
|---|---|---|
| `dbuser` | `string` | MySQL username |
| `dbpassword` | `string` | MySQL password (sensitive) |
| `dbname` | `string` | Database name |
| `dbhost` | `string` | Host string — see `parse_db_host` for full format |

**Constructor behavior (in order):**

1. If `WP_DEBUG` and `WP_DEBUG_DISPLAY` are both truthy, call `show_errors()`.
2. Store the four credentials as protected properties.
3. If the constant `WP_SETUP_CONFIG` is defined, return early without connecting. (Used during installation wizard.)
4. Otherwise, call `db_connect()`.

### Global variable `$EZSQL_ERROR`

A global array that accumulates error records. Each entry is `{ query: string, error_str: string }`. This is appended to in `print_error()`.

### Ready flag

`ready` starts as `false`. It is set to `true` only after a successful `db_connect()` → `select()` cycle. Any call to `query()` when `ready === false` returns `false` immediately and resets `check_current_query` to `true`.

### SAVEQUERIES constant

When `SAVEQUERIES` is defined and truthy, every query call records timing data in `this.queries`. When `SAVEQUERIES` is not defined (the default), no timing overhead is incurred.

---

## 3. Core Data Structures

### Instance State Properties

```typescript
interface WpdbState {
  // --- Connection credentials (protected) ---
  dbuser: string;
  dbpassword: string;
  dbname: string;
  dbhost: string;

  // --- Connection handle (protected) ---
  // null  = not yet connected or connection closed
  // false = connection attempt failed
  // object = active connection handle
  dbh: DatabaseHandle | false | null;

  // --- Ready flag ---
  ready: boolean;           // true only after successful db_connect() + select()
  is_mysql: boolean | null; // set to true in db_connect(); null before connection

  // --- Error display controls ---
  show_errors: boolean;     // default false; true if WP_DEBUG && WP_DEBUG_DISPLAY
  suppress_errors: boolean; // default false
  error: ErrorObject | string | null; // set in bail() when show_errors is false

  // --- Per-query state ---
  last_query: string | null;
  last_result: Record<string, unknown>[] | null; // array of row objects
  last_error: string;         // '' means no error
  num_rows: number;           // rows returned by last SELECT
  rows_affected: number;      // rows changed by last INSERT/UPDATE/DELETE/REPLACE
  insert_id: number;          // AUTO_INCREMENT value from last INSERT/REPLACE
  num_queries: number;        // total queries executed this session
  func_call: string;          // textual description of most recent get_* call

  // --- Query log (only populated when SAVEQUERIES is truthy) ---
  queries: QueryLogEntry[] | undefined;

  // --- Timing (only used when SAVEQUERIES is truthy) ---
  time_start: number | null;

  // --- Table prefix ---
  prefix: string;      // current blog prefix (= base_prefix on single site)
  base_prefix: string; // installation-wide prefix, set once by set_prefix()

  // --- Multisite blog/site IDs ---
  blogid: number;   // current blog ID; 0 on single site
  siteid: number;   // current network/site ID; 0 on single site

  // --- Charset / collation ---
  charset: string;  // connection and table charset (e.g. 'utf8mb4')
  collate: string;  // connection and table collation (e.g. 'utf8mb4_unicode_520_ci')

  // --- Column format hints (used by CRUD methods) ---
  // Keys are column names; values are format specifiers ('%d', '%f', '%s')
  field_types: Record<string, string>;

  // --- Internal charset cache (protected) ---
  table_charset: Record<string, string | false>;  // keyed by lowercased table name
  col_meta: Record<string, Record<string, ColumnMeta>>; // tablekey -> colkey -> metadata
  check_current_query: boolean; // true means: perform charset validation before next query

  // --- Reconnection ---
  reconnect_retries: number; // default 5

  // --- Table name properties (set by set_prefix / set_blog_id) ---
  // Per-blog tables:
  posts: string;
  comments: string;
  links: string;
  options: string;
  postmeta: string;
  terms: string;
  term_taxonomy: string;
  term_relationships: string;
  termmeta: string;
  commentmeta: string;
  // Deprecated per-blog tables:
  categories: string;
  post2cat: string;
  link2cat: string;
  // Global tables (always use base_prefix):
  users: string;
  usermeta: string;
  // Multisite global tables:
  blogs: string | null;
  blogmeta: string | null;
  registration_log: string | null;
  signups: string | null;
  site: string | null;
  sitemeta: string | null;
  sitecategories: string | null; // deprecated
}
```

### Table Name Lists

These arrays govern which property names get set by `set_prefix` and `set_blog_id`:

```typescript
const tables = [
  'posts', 'comments', 'links', 'options', 'postmeta',
  'terms', 'term_taxonomy', 'term_relationships', 'termmeta', 'commentmeta'
];  // per-blog (use blog prefix)

const old_tables = ['categories', 'post2cat', 'link2cat']; // deprecated

const global_tables = ['users', 'usermeta']; // always use base_prefix

const ms_global_tables = [
  'blogs', 'blogmeta', 'signups', 'site', 'sitemeta', 'registration_log'
]; // multisite only, always use base_prefix

const old_ms_global_tables = ['sitecategories']; // deprecated multisite
```

### Query Log Entry

```typescript
interface QueryLogEntry {
  0: string;  // The query's SQL
  1: number;  // Total time in seconds (float)
  2: string;  // Comma-separated calling function names
  3: number;  // Unix timestamp (float) at query start
  4: unknown; // Custom query data (filtered via 'log_query_custom_data')
}
```

### Column Metadata

The `col_meta` cache stores the result of `SHOW FULL COLUMNS FROM table`. Each entry resembles:

```typescript
interface ColumnMeta {
  Field: string;
  Type: string;       // e.g. 'varchar(255)', 'int(11)', 'longtext'
  Collation: string;  // e.g. 'utf8mb4_unicode_520_ci', or empty for non-string types
  Null: string;       // 'YES' or 'NO'
  Key: string;
  Default: string | null;
  Extra: string;
}
```

### Field Processing Intermediate Structure

Used internally by CRUD helpers:

```typescript
interface ProcessedField {
  value: unknown;          // the value to insert/update
  format: string;          // '%s', '%d', or '%f'
  charset?: string | false; // column charset or false for non-string columns
  length?: ColumnLength | false;
}

interface ColumnLength {
  type: 'byte' | 'char';
  length: number;
}
```

---

## 4. Complete Public API

### `__construct(dbuser, dbpassword, dbname, dbhost)`

See Section 2. Returns nothing. Connects immediately unless `WP_SETUP_CONFIG` is defined.

---

### `init_charset()`

Sets `this.charset` and `this.collate` based on `DB_CHARSET` and `DB_COLLATE` constants, with multisite overrides, then passes through `determine_charset()` for upgrade logic.

**Logic:**
- On multisite: force `charset = 'utf8'` first, then `collate = DB_COLLATE || 'utf8_general_ci'`.
- On single site: use `DB_COLLATE` if defined.
- Both paths: use `DB_CHARSET` if defined (overrides the multisite utf8 default).
- Pass both through `determine_charset()` and store the results.

Called once during `db_connect()` on the very first connection. Skipped on reconnect (`has_connected` is already true).

---

### `determine_charset(charset, collate)`

Upgrades a charset/collate pair to the best available option.

**Returns:** `{ charset: string, collate: string }`

**Rules (applied in order):**
1. If no active connection, return inputs unchanged.
2. If `charset === 'utf8'`, upgrade to `'utf8mb4'`.
3. If `charset === 'utf8mb4'`:
   - If `collate` is empty or `'utf8_general_ci'`, set `collate = 'utf8mb4_unicode_ci'`.
   - Otherwise replace the `'utf8_'` prefix with `'utf8mb4_'`.
4. If `has_cap('utf8mb4_520')` (MySQL >= 5.6) and `collate === 'utf8mb4_unicode_ci'`, upgrade to `'utf8mb4_unicode_520_ci'`.

---

### `set_charset(dbh, charset?, collate?)`

Sends `SET NAMES {charset} COLLATE {collate}` to the given connection. Falls back to `this.charset` / `this.collate` if parameters are omitted.

**Behavior:**
- Only runs if `has_cap('collation')` is true and charset is non-empty.
- If `has_cap('set_charset')` (MySQL >= 5.0.7), calls the native `mysqli_set_charset` first.
- Then always runs `SET NAMES %s` (and appends `COLLATE %s` if collate is non-empty) using `prepare()`.

---

### `set_sql_mode(modes?)`

Reads or sets the MySQL `sql_mode` session variable. Removes any modes listed in `incompatible_modes` (or the filtered version from the `incompatible_sql_modes` filter).

**Default incompatible modes:**
`NO_ZERO_DATE`, `ONLY_FULL_GROUP_BY`, `STRICT_TRANS_TABLES`, `STRICT_ALL_TABLES`, `TRADITIONAL`, `ANSI`

**Behavior:**
- If `modes` is empty: query `SELECT @@SESSION.sql_mode` and parse the comma-separated result.
- Normalize all mode names to uppercase.
- Apply `incompatible_sql_modes` filter to the list of modes to remove.
- Remove each incompatible mode from the current list.
- Execute `SET SESSION sql_mode='...'` with the remaining modes.

---

### `set_prefix(prefix, set_table_names?)`

Set the installation-wide table prefix.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `prefix` | `string` | required | Must match `/^[a-z0-9_]+$/i` |
| `set_table_names` | `boolean` | `true` | Whether to update the table name properties |

**Returns:** `string | WP_Error` — old prefix on success, `WP_Error` with code `'invalid_db_prefix'` if prefix contains invalid characters.

**Behavior when `set_table_names` is true:**
1. Apply prefix to all `global_tables` (and `ms_global_tables` on multisite) using `base_prefix`.
2. On multisite, if `blogid` is 0, return early (blog prefix not yet known).
3. Set `this.prefix = get_blog_prefix()`.
4. Apply prefix to all `tables` and `old_tables` using the blog prefix.

---

### `set_blog_id(blog_id, network_id?)`

Switch the current blog context. Updates `this.blogid`, `this.siteid` (if `network_id` non-zero), `this.prefix`, and all per-blog table name properties.

**Returns:** `number` — the previous `blogid`.

---

### `get_blog_prefix(blog_id?)`

Returns the table prefix for a given blog ID.

- Defaults to `this.blogid` if no argument provided.
- On single site: always returns `base_prefix`.
- On multisite:
  - If `MULTISITE` is defined and `blog_id` is `0` or `1`: returns `base_prefix`.
  - Otherwise: returns `base_prefix + blog_id + '_'`.

---

### `tables(scope?, prefix?, blog_id?)`

Returns an array of table names, optionally prefixed.

| Parameter | Type | Default |
|---|---|---|
| `scope` | `'all' \| 'blog' \| 'global' \| 'ms_global' \| 'old'` | `'all'` |
| `prefix` | `boolean` | `true` |
| `blog_id` | `number` | `this.blogid` |

**Scope semantics:**
- `'all'`: `global_tables` + `tables` + `ms_global_tables` (on multisite). No old tables.
- `'blog'`: `tables` only.
- `'global'`: `global_tables` + `ms_global_tables` (on multisite).
- `'ms_global'`: `ms_global_tables` only (regardless of whether multisite is active).
- `'old'`: `old_tables` + `old_ms_global_tables` (on multisite).
- Unknown scope: returns `{}`.

**When `prefix` is true:**
- Global/ms_global tables use `base_prefix`.
- Blog/old tables use the computed blog prefix.
- Returns an object with unprefixed table name as key, full prefixed name as value.

**Custom table overrides:**
- If `CUSTOM_USER_TABLE` is defined, `users` entry is overridden with its value.
- If `CUSTOM_USER_META_TABLE` is defined, `usermeta` entry is overridden with its value.

---

### `select(db, dbh?)`

Selects a MySQL database on the given connection handle. Calls `this.bail()` on failure if `template_redirect` has not yet fired.

---

### `prepare(query, ...args)`

Builds a safe, parameterized SQL string. The primary defense against SQL injection.

**Signature:** `prepare(query: string, ...args: unknown[]): string | undefined`

Returns `undefined` (void in PHP) in error cases. Returns the sanitized query string on success.

**Full behavior — see Section 5 for details.**

---

### `esc_like(text)`

Escapes LIKE special characters (`%`, `_`, `\`) for use as a literal value inside a LIKE expression. The returned string is NOT yet SQL-safe; it must still be passed through `prepare()` or `_real_escape()`.

**Returns:** `string` — input with `%`, `_`, and `\` backslash-escaped.

**Usage pattern:**
```
const wild = '%';
const like = wild + db.esc_like(userInput) + wild;
const sql = db.prepare('SELECT * FROM table WHERE col LIKE %s', like);
```

---

### `query(query)`

Execute a raw SQL query string.

**Returns:** `number | boolean`
- `true` for DDL queries (CREATE, ALTER, TRUNCATE, DROP).
- `number` (rows affected) for DML (INSERT, DELETE, UPDATE, REPLACE).
- `number` (rows returned) for SELECT and other queries.
- `false` on error.

**Detailed behavior:**
1. If `this.ready === false`, reset `check_current_query = true` and return `false`.
2. Apply the `'query'` WordPress filter to the query string.
3. If the filtered query is falsy, set `insert_id = 0` and return `false`.
4. Call `flush()` to reset per-query state.
5. Set `func_call` to a string representation of the call.
6. If `check_current_query` is true and the query is not pure ASCII, call `strip_invalid_text_from_query()`. If the stripped result differs from the original, set `last_error` and return `false`.
7. Reset `check_current_query = true`.
8. Record `last_query = query`.
9. Execute via `_do_query()`.
10. Check for MySQL error 2006 (server gone away): if detected, call `check_connection()` and retry via `_do_query()`. If reconnect fails, set `insert_id = 0` and return `false`.
11. Read `last_error` from `mysqli_error()`.
12. If `last_error` is non-empty: clear `insert_id` for failed INSERT/REPLACE, call `print_error()`, return `false`.
13. Classify the query type:
    - CREATE/ALTER/TRUNCATE/DROP: return the raw result (boolean `true`).
    - INSERT/DELETE/UPDATE/REPLACE: set `rows_affected`; for INSERT/REPLACE also set `insert_id`; return `rows_affected`.
    - Everything else (SELECT, SHOW, etc.): iterate result rows into `last_result`, set `num_rows`, return `num_rows`.

---

### `insert(table, data, format?)`

Insert a row into a table.

| Parameter | Type | Description |
|---|---|---|
| `table` | `string` | Table name |
| `data` | `Record<string, unknown>` | Column → value pairs (raw, not SQL-escaped) |
| `format` | `string[] \| string \| null` | Format specifiers (see Section 5) |

**Returns:** `number | false` — number of rows inserted (always 1), or `false` on error.

**Behavior:**
1. `insert_id = 0`.
2. Call `process_fields(table, data, format)` — returns `false` on charset/length errors.
3. Build `INSERT INTO \`table\` (\`col1\`, \`col2\`) VALUES (%s, %d)` SQL.
4. `NULL` values generate a literal `NULL` token, not a placeholder.
5. Set `check_current_query = false` (charset already validated by `process_fields`).
6. Execute via `query(prepare(sql, values))`.

---

### `replace(table, data, format?)`

Identical signature and behavior to `insert()`, but generates a `REPLACE INTO` statement instead of `INSERT INTO`. Requires a PRIMARY KEY or UNIQUE index on the table.

**Returns:** `number | false` — rows affected (can be 2 if an existing row was deleted and new one inserted).

---

### `update(table, data, where, format?, where_format?)`

Update existing rows.

| Parameter | Type | Description |
|---|---|---|
| `table` | `string` | Table name |
| `data` | `Record<string, unknown>` | Columns to SET |
| `where` | `Record<string, unknown>` | WHERE conditions (ANDed) |
| `format` | `string[] \| string \| null` | Formats for `data` values |
| `where_format` | `string[] \| string \| null` | Formats for `where` values |

**Returns:** `number | false` — rows updated, or `false` on error.

**Behavior:**
- Both `data` and `where` must be arrays; returns `false` if either is not.
- `NULL` values in `data` produce `\`col\` = NULL`.
- `NULL` values in `where` produce `\`col\` IS NULL`.
- Multiple WHERE conditions are joined with `AND`.
- `check_current_query = false` before executing (charset already checked).

---

### `delete(table, where, where_format?)`

Delete rows matching the given conditions.

| Parameter | Type | Description |
|---|---|---|
| `table` | `string` | Table name |
| `where` | `Record<string, unknown>` | WHERE conditions (ANDed) |
| `where_format` | `string[] \| string \| null` | Formats for `where` values |

**Returns:** `number | false` — rows deleted, or `false` on error.

**Behavior:**
- `where` must be an array; returns `false` otherwise.
- `NULL` values produce `\`col\` IS NULL`.
- Multiple conditions ANDed together.
- `check_current_query = false` before executing.

---

### `get_var(query?, x?, y?)`

Retrieve a single scalar value from the database.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `query` | `string \| null` | `null` | SQL query; if null, uses previous result |
| `x` | `number` | `0` | Column index (0-based) |
| `y` | `number` | `0` | Row index (0-based) |

**Returns:** `string | null` — value as string, or `null` if missing/empty.

**Behavior:**
- If `query` is provided and `check_current_query` is true and `check_safe_collation()` returns true, set `check_current_query = false`.
- Executes `query()` if a query string is provided.
- Returns `null` if the value is an empty string `''`.

---

### `get_row(query?, output?, y?)`

Retrieve one row from the database.

| Parameter | Type | Default |
|---|---|---|
| `query` | `string \| null` | `null` |
| `output` | `'OBJECT' \| 'ARRAY_A' \| 'ARRAY_N'` | `OBJECT` |
| `y` | `number` | `0` |

**Returns:**
- `OBJECT`: the row as a plain object. `null` if no row at index `y`.
- `ARRAY_A`: the row as `Record<string, unknown>`. `null` if not found.
- `ARRAY_N`: the row as `unknown[]`. `null` if not found.
- If `query` is null and no previous result: returns `null`.
- If `output` is invalid: calls `print_error()` and returns void.

---

### `get_col(query?, x?)`

Retrieve one column from the database.

| Parameter | Type | Default |
|---|---|---|
| `query` | `string \| null` | `null` |
| `x` | `number` | `0` |

**Returns:** `string[]` — array of values from column `x`, one per result row. Returns `[]` if there are no results.

---

### `get_results(query?, output?)`

Retrieve multiple rows from the database.

| Parameter | Type | Default |
|---|---|---|
| `query` | `string \| null` | `null` |
| `output` | `'OBJECT' \| 'OBJECT_K' \| 'ARRAY_A' \| 'ARRAY_N'` | `OBJECT` |

**Returns:** `unknown[] | Record<string, unknown> | null`

- If `query` is null, returns `null`.
- `OBJECT`: array of row objects indexed from 0.
- `OBJECT_K`: object mapping the first column's value → row object. Duplicate first-column values are discarded (first one wins).
- `ARRAY_A`: array of associative arrays (one per row).
- `ARRAY_N`: array of numerically indexed arrays (one per row).
- Returns `null` for invalid output type.

---

### `show_errors(show?)`

Enable display of database errors.

| Parameter | Default |
|---|---|
| `show` | `true` |

**Returns:** `boolean` — previous value of `show_errors`.

---

### `hide_errors()`

Disable display of database errors.

**Returns:** `boolean` — previous value of `show_errors`.

---

### `suppress_errors(suppress?)`

Enable or disable error suppression. When suppressed, `print_error()` returns early without logging to `error_log` or displaying output.

| Parameter | Default |
|---|---|
| `suppress` | `true` |

**Returns:** `boolean` — previous value of `suppress_errors`.

---

### `print_error(str?)`

Log and optionally display a database error.

**Behavior:**
1. If `str` is empty, get the error from `mysqli_error(this.dbh)`.
2. Append `{ query: this.last_query, error_str: str }` to global `$EZSQL_ERROR`.
3. If `suppress_errors` is true: return `false` (no further output).
4. Build an error string including the calling functions (`get_caller()`).
5. Write to PHP `error_log`.
6. If `show_errors` is false: return `false`.
7. If `show_errors` is true:
   - On multisite: log formatted message to `ERRORLOGFILE` if defined, or call `wp_die()` if `DIEONDBERROR` is defined.
   - On single site: output an HTML `<div>` with the error message and query.

---

### `flush()`

Reset all per-query state. Called automatically at the start of every `query()`.

**Resets:**
- `last_result = []`
- `col_info = null`
- `last_query = null`
- `rows_affected = 0`
- `num_rows = 0`
- `last_error = ''`
- Frees the current `result` resource if it is a `mysqli_result`.
- Drains any pending multi-query results from the connection.

---

### `db_connect(allow_bail?)`

Establish the MySQL connection.

| Parameter | Default |
|---|---|
| `allow_bail` | `true` |

**Returns:** `boolean` — `true` on success, `false` on failure.

**Full behavior:**
1. Set `is_mysql = true`.
2. Read `MYSQL_CLIENT_FLAGS` constant (default `0`) for connection flags.
3. Disable mysqli error reporting (`MYSQLI_REPORT_OFF`) to suppress PHP-level exceptions.
4. Initialize a new mysqli handle.
5. Parse `dbhost` via `parse_db_host()` to extract host, port, socket, and IPv6 flag.
6. If IPv6 and `mysqlnd` is loaded, wrap host in `[...]`.
7. Call `mysqli_real_connect()` (suppress warnings unless `WP_DEBUG`).
8. If `connect_errno` is set, set `dbh = null`.
9. If connection failed and `allow_bail`: load the `wp-content/db-error.php` drop-in if it exists and die; otherwise call `bail()` with a connection error message.
10. If connection succeeded:
    - If first-ever connection (`!has_connected`): call `init_charset()`.
    - Set `has_connected = true`.
    - Call `set_charset(dbh)`.
    - Set `ready = true`.
    - Call `set_sql_mode()`.
    - Call `select(dbname, dbh)`.
    - Return `true`.

---

### `parse_db_host(host)`

Parse the `DB_HOST` configuration string into connection components.

**Returns:** `[host: string, port: number | null, socket: string | null, is_ipv6: boolean] | false`

**Parsing rules:**
1. Extract Unix socket suffix: if `:/` is found, everything from `:/` onward is the socket path; the remainder is the host.
2. Detect IPv6 by counting colons: 2 or more colons → IPv6. Pattern: `[host]:port` or just `host`.
3. Detect IPv4/hostname: `host:port` or just `host`.
4. Port is returned as an integer or `null`. Cannot be a string.
5. Returns `false` if the pattern does not match.

**Examples:**
- `'localhost'` → `['localhost', null, null, false]`
- `'localhost:3306'` → `['localhost', 3306, null, false]`
- `'localhost:/var/run/mysqld/mysqld.sock'` → `['localhost', null, '/var/run/mysqld/mysqld.sock', false]`
- `'[::1]:3306'` → `['::1', 3306, null, true]`

---

### `check_connection(allow_bail?)`

Verify the connection is alive; attempt to reconnect if not.

**Returns:** `boolean | void` — `true` if alive or reconnected. `false` after `template_redirect` has fired and reconnect fails. Calls `dead_db()` after exhausting retries if bailing is allowed.

**Behavior:**
1. Issue `DO 1` query. If it succeeds, return `true`.
2. Attempt `db_connect(false)` up to `reconnect_retries` times (default 5), sleeping 1 second between each.
3. If `template_redirect` has already fired: return `false` (do not bail — too late).
4. If `allow_bail` is false: return `false`.
5. Otherwise: call `bail()` with reconnect error message, then call `dead_db()`.

---

### `close()`

Close the current database connection.

**Returns:** `boolean` — `true` if successfully closed, `false` if no connection existed.

On successful close: sets `dbh = null`, `ready = false`, `has_connected = false`.

---

### `log_query(query, query_time, query_callstack, query_start, query_data)`

Append a query record to `this.queries`. Only called when `SAVEQUERIES` is truthy.

Applies the `'log_query_custom_data'` filter to `query_data` before storing.

The stored entry is the 5-element tuple `[sql, time, callstack, start_timestamp, data]`.

---

### `placeholder_escape()`

Generate a unique per-request placeholder escape string. Used to prevent double-interpolation of `%` characters in queries returned by `prepare()`.

**Returns:** `string` — a string of the form `'{sha256hash}'`.

- The string is computed once per request using `AUTH_SALT` (or `rand()` as fallback) and stored in a static variable.
- On first call, registers `remove_placeholder_escape()` as a `'query'` filter at priority `0`. This ensures all `%`-characters in prepared queries are removed from the escape encoding before the query executes.

---

### `add_placeholder_escape(query)`

Replace every `%` in the query with the placeholder escape string.

**Returns:** `string`

---

### `remove_placeholder_escape(query)`

Replace every occurrence of the placeholder escape string back to `%`.

**Returns:** `string`

This is hooked to the `'query'` filter at priority `0` (runs before user filters).

---

### `get_col_charset(table, column)`

Return the character set for a given column.

**Returns:** `string | false | WP_Error`
- `string`: the charset name (e.g. `'utf8mb4'`).
- `false`: the column is not a string type (no collation).
- `WP_Error`: could not retrieve table metadata.

**Behavior:**
- Applies the `'pre_get_col_charset'` filter first.
- If `is_mysql` is falsy, returns `false` (skip for non-MySQL engines).
- If column metadata is not yet cached, calls `get_table_charset()` to prime it.
- If column is not in metadata, falls back to the table charset.
- If the column has no `Collation` value, returns `false`.
- Extracts the charset from the collation by splitting on `_`.

---

### `get_col_length(table, column)`

Return the maximum length for a given column.

**Returns:** `ColumnLength | false | WP_Error`

| Column type | Return value |
|---|---|
| `CHAR(n)`, `VARCHAR(n)` | `{ type: 'char', length: n }` |
| `BINARY(n)`, `VARBINARY(n)` | `{ type: 'byte', length: n }` |
| `TINYBLOB`, `TINYTEXT` | `{ type: 'byte', length: 255 }` |
| `BLOB`, `TEXT` | `{ type: 'byte', length: 65535 }` |
| `MEDIUMBLOB`, `MEDIUMTEXT` | `{ type: 'byte', length: 16777215 }` |
| `LONGBLOB`, `LONGTEXT` | `{ type: 'byte', length: 4294967295 }` |
| Numeric types and others | `false` |

---

### `strip_invalid_text_for_column(table, column, value)`

Strip invalid characters from a single value destined for a specific column.

**Returns:** `string | WP_Error` — the cleaned string, or `WP_Error` if stripping failed.

If `value` is not a string, returns it unchanged. If the column has no charset (not a string column), returns `value` unchanged.

---

### `get_charset_collate()`

Build the `DEFAULT CHARACTER SET ... COLLATE ...` clause used in `CREATE TABLE` statements.

**Returns:** `string` — e.g. `'DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci'`. Returns `''` if both `charset` and `collate` are empty.

---

### `has_cap(db_cap)`

Check whether a given capability is supported.

| Capability | Minimum Version | Notes |
|---|---|---|
| `'collation'` | MySQL 4.1 | |
| `'group_concat'` | MySQL 4.1 | |
| `'subqueries'` | MySQL 4.1 | |
| `'set_charset'` | MySQL 5.0.7 | |
| `'utf8mb4'` | always `true` | Since WP 6.6, always available |
| `'utf8mb4_520'` | MySQL 5.6 | For `utf8mb4_unicode_520_ci` collation |
| `'identifier_placeholders'` | always `true` | `%i` placeholder support since WP 6.2 |

**MariaDB special case:** If the version string reports `'5.5.5'` but the server info contains `'MariaDB'` (on PHP < 8.0.16), strip the `'5.5.5-'` prefix and reparse the actual version.

Unknown capability names return `false`.

---

### `check_database_version()`

Compare the server version against the global `$required_mysql_version`. Returns `WP_Error` if below minimum, returns nothing if OK.

---

### `get_charset_collate()` — see above.

---

### `supports_collation()` (deprecated 3.5.0)

Delegate to `has_cap('collation')`.

---

### `get_col_info(info_type?, col_offset?)`

Retrieve metadata about columns from the last query result.

| Parameter | Default | Notes |
|---|---|---|
| `info_type` | `'name'` | Property to retrieve: `'name'`, `'table'`, `'def'`, `'max_length'`, `'not_null'`, `'primary_key'`, `'multiple_key'`, `'unique_key'`, `'numeric'`, `'blob'`, `'type'`, `'unsigned'`, `'zerofill'` |
| `col_offset` | `-1` | `-1` returns an array for all columns; `>=0` returns for a single column |

**Returns:**
- `col_offset === -1`: array of `info_type` values, one per column.
- `col_offset >= 0`: single value for that column.

Triggers lazy loading of column metadata via `load_col_info()` if not yet populated.

---

### `timer_start()`

Record `this.time_start = now`. Returns `true`.

---

### `timer_stop()`

Returns elapsed seconds since `timer_start()` as a float.

---

### `bail(message, error_code?)`

Fatal error handler for database-level failures (bad connection, database not selectable).

| Parameter | Default |
|---|---|
| `error_code` | `'500'` |

**Behavior:**
- If `show_errors` is true: prepend the raw MySQL error (if any) to `message`, then call `wp_die(message)`.
- If `show_errors` is false: store `new WP_Error(error_code, message)` in `this.error`, return `false`.

---

### `db_version()`

**Returns:** `string | null` — server version number (digits and dots only), extracted from `db_server_info()`.

---

### `db_server_info()`

**Returns:** `string` — the raw version string from the MySQL server (e.g. `'8.0.32'` or `'10.5.18-MariaDB'`).

---

### `get_caller()`

**Returns:** `string` — comma-separated list of functions in the call stack leading to the current wpdb call. Used in error messages and query logs.

---

### Escape methods

#### `_real_escape(data)`

Escape a scalar value using the active connection's real escape function.

- If `data` is not scalar: returns `''`.
- If connected: uses `mysqli_real_escape_string`.
- If not connected: falls back to `addslashes` and triggers `_doing_it_wrong`.
- Always runs `add_placeholder_escape()` on the result before returning.

**Returns:** `string`

#### `_escape(data)`

Recursively apply `_real_escape` to a string or a (potentially nested) array.

**Returns:** same type as input.

#### `escape_by_ref(&data)`

Escape a value in place. Skips floats (they don't need escaping).

#### `quote_identifier(identifier)`

Wrap an identifier (table or column name) in backticks, with internal backticks doubled.

**Returns:** `` `escaped_identifier` ``

#### `_weak_escape(data)` (deprecated 3.6.0)

Uses `addslashes`. Do not use; use `prepare()` or `esc_sql()` instead.

#### `escape(data)` (deprecated 3.6.0)

Recursively applies `_weak_escape`. Do not use.

---

## 5. Query Building & Parameterization

### `prepare()` — Deep Specification

```
prepare(query: string, ...args: unknown[]): string | undefined
```

#### Pre-processing steps

1. Return `undefined` if `query` is null.
2. Trigger `_doing_it_wrong` if `query` contains no `%` character (query has no placeholders).
3. Strip existing quotes around bare `%s` placeholders: `'%s'` → `%s`, `"%s"` → `%s`. (Only for bare `%s`, not formatted variants like `%1$s`.)
4. Escape any unrecognized `%` sequences (i.e., `%` not followed by a valid format) by doubling them to `%%`.

#### Allowed placeholder format spec

The regex controlling valid format specifiers is:

```
(?:[1-9][0-9]*[$])?   # optional positional argument number, e.g. 1$ in %1$s
[-+0-9]*              # optional sign specifier and width
(?: |0|\'.)?          # optional padding character (space, zero, or custom with ')
[-+0-9]*              # optional alignment / width continuation
(?:\.[0-9]+)?         # optional precision, e.g. .2 in %.2f
```

Valid type characters: `s`, `d`, `f`, `F`, `i`.

#### Placeholder type behaviors

| Placeholder | Behavior |
|---|---|
| `%s` | String. Value is escaped via `_real_escape()`. Output is wrapped in single quotes: `'value'`. |
| `%d` | Integer. Value passed through as-is to `sprintf` (no extra escaping). |
| `%f` | Float. Converted to uppercase `%F` to force locale-unaware decimal formatting (always `.`, never `,`). |
| `%F` | Same as `%f` after conversion — locale-unaware float. |
| `%i` | Identifier (table/column name). Transformed to `` `%s` `` (backtick-quoted). The value is escaped via `_escape_identifier_value()` which doubles internal backticks. |
| `%1$s`, `%5s`, etc. | Formatted/numbered string placeholders. For backward compat, these are NOT automatically quoted. The caller is responsible for surrounding quotes. Emit a `_doing_it_wrong` warning if the same argument position is used as both `%i` and a string type. |

#### Array argument shorthand

If `args[0]` is an array and it is the only argument (i.e., `args.length === 1`), the array is unwrapped and used as the argument list (vsprintf-style). This allows:
```
prepare('SELECT %s AND %d', ['foo', 1])
```

#### Argument count validation

- If argument count does not match placeholder count: trigger `_doing_it_wrong`.
- If there are fewer arguments than placeholders AND the shortfall cannot be covered by numbered placeholders: return `''`.
- A mismatch alone does not abort execution (unless the count is truly insufficient).

#### Dual-use conflict

If any argument position is used as both a `%i` identifier placeholder and a string placeholder (`%s`), trigger `_doing_it_wrong` and return `undefined`.

#### Escaping pipeline

For each argument, in order:
1. If the argument's position is in `arg_identifiers`: escape via `_escape_identifier_value()` (doubles backticks only).
2. If the value is `int` or `float`: pass through unchanged.
3. Otherwise: if not scalar and not null, trigger `_doing_it_wrong` and coerce to `''`. Then escape via `_real_escape()`.

#### Final output

Call `vsprintf(query, escapedArgs)`, then run `add_placeholder_escape()` on the result.

---

### Format resolution in CRUD methods

When `format` is provided to `insert`, `replace`, `update`, or `delete`:
- If a single string (e.g. `'%s'`), that format is used for ALL columns.
- If an array, formats are consumed positionally. If the array is exhausted before all columns are processed, the last format in the array is repeated.
- If `format` is omitted or null, fall back to `this.field_types[columnName]` if defined, otherwise default to `'%s'`.

**NULL handling:** A `null` value in `data` causes the column to emit a literal `NULL` SQL token (no placeholder). The corresponding format specifier is ignored for that column.

---

### LIKE escaping pattern

```
const wild = '%';
const escaped = db.esc_like(userInput);  // escapes % _ \
const like = wild + escaped + wild;
const sql = db.prepare('SELECT * FROM table WHERE col LIKE %s', like);
```

`esc_like` must run BEFORE `prepare` / `_real_escape`. Reversing the order is a security vulnerability.

---

### Identifier placeholder (`%i`) — added in WP 6.2

```
db.prepare('SELECT * FROM %i WHERE %i = %s', tableName, fieldName, value)
// produces: SELECT * FROM `table_name` WHERE `field_name` = 'value'
```

Backticks inside the identifier are doubled: `a\`b` → `` `a``b` ``.

Check support via `has_cap('identifier_placeholders')` (always true as of WP 6.2).

---

## 6. Error Handling

### Three-tier error system

1. **`suppress_errors`** (boolean, default `false`): When true, `print_error()` records the error in `$EZSQL_ERROR` and returns `false` immediately. No `error_log` output. No HTML output. Used during bootstrapping and for expected-failure operations.

2. **`show_errors`** (boolean, default `false`; set to `true` if `WP_DEBUG && WP_DEBUG_DISPLAY`): When true, errors are displayed in the browser (HTML) in addition to being logged. On multisite, writes to `ERRORLOGFILE` and calls `wp_die()` if `DIEONDBERROR` is defined.

3. **`last_error`** (string): Always set to the MySQL error string after every query. Empty string `''` means no error. Always reset by `flush()` at the start of the next query.

### Error flow for `query()`

```
query() called
  → flush() resets last_error to ''
  → _do_query() executes SQL
  → last_error = mysqli_error(dbh)
  → if last_error non-empty:
      → clear insert_id if INSERT/REPLACE failed
      → print_error() [logs, maybe displays, returns false if suppressed]
      → return false
  → else:
      → return result value
```

### `bail()` — fatal connection errors

Used when the connection cannot be established or the database cannot be selected. These are not query errors; they are hard failures that prevent any database operation.

- With `show_errors = true`: calls `wp_die()` (terminates request).
- With `show_errors = false`: stores `WP_Error` in `this.error`.

The `wp-content/db-error.php` drop-in, if present, is `require_once`'d and `die()`'d during `db_connect()` failures.

### `$EZSQL_ERROR` global

Every call to `print_error()` appends to this global array regardless of suppress state. It is a full audit log of all database errors for the current request. Each entry: `{ query: string, error_str: string }`.

---

## 7. Multisite Table Prefix Handling

### Single-site behavior

- `base_prefix` = the configured prefix (e.g. `'wp_'`).
- `prefix` = `base_prefix`.
- All table properties (posts, users, etc.) = `base_prefix + tableName`.

### Multisite behavior

- `base_prefix` = the configured prefix (still e.g. `'wp_'`).
- Global tables (`users`, `usermeta`, all `ms_global_tables`) always use `base_prefix`.
- Per-blog tables use `get_blog_prefix(blogid)`.

**`get_blog_prefix` rules:**
- `blogid === 0` or `blogid === 1` → returns `base_prefix` (main site uses plain prefix).
- `blogid > 1` → returns `base_prefix + blogid + '_'` (e.g. `'wp_5_'` for blog 5).

### Switching blog context

Call `set_blog_id(blogId, networkId?)`:
1. Updates `blogid` (and `siteid` if `networkId` provided).
2. Recalculates `prefix = get_blog_prefix()`.
3. Reassigns all per-blog table properties and old-table properties.

### Custom user/usermeta tables

If `CUSTOM_USER_TABLE` is defined, `$wpdb->users` is set to that constant's value instead of the prefixed default. Same for `CUSTOM_USER_META_TABLE` → `$wpdb->usermeta`.

### `tables()` method scope values

| Scope | Contents | Prefix type |
|---|---|---|
| `'all'` | global + blog + ms_global (on multisite) | mixed |
| `'blog'` | per-blog tables only | blog prefix |
| `'global'` | users + usermeta + ms_global (on multisite) | base prefix |
| `'ms_global'` | multisite network tables only | base prefix |
| `'old'` | deprecated tables | blog prefix + base prefix |

---

## 8. Character Set / Collation Handling

### Connection-time charset setup

1. `init_charset()` determines the target `charset` and `collate` from constants, then upgrades them via `determine_charset()`.
2. `set_charset(dbh)` issues `SET NAMES charset COLLATE collate` to the connection.
3. `set_sql_mode()` removes incompatible SQL modes.

### Charset upgrade path (via `determine_charset`)

- `utf8` → `utf8mb4` (always).
- `utf8mb4` + `utf8_general_ci` → `utf8mb4_unicode_ci`.
- `utf8mb4` + any `utf8_*` collation → `utf8mb4_*` (replace prefix).
- MySQL >= 5.6: `utf8mb4_unicode_ci` → `utf8mb4_unicode_520_ci`.

### Per-query charset validation

Before executing any non-DDL query that contains non-ASCII characters, `query()` calls `strip_invalid_text_from_query()`:

1. Skip DDL: `SHOW`, `DESCRIBE`, `DESC`, `EXPLAIN`, `CREATE` prefixed queries skip validation.
2. Extract the table name from the query via `get_table_from_query()`.
3. If the table has charset `'binary'`, skip stripping (cannot reliably strip binary data).
4. Build a `{ value, charset, ascii: false, length: false }` structure and pass to `strip_invalid_text()`.
5. If the stripped value differs from the original: the query contained invalid characters — `last_error` is set, the query is not executed, `false` is returned.

### `strip_invalid_text()` — per-field cleaning

For each field in the data array:

1. Skip if charset is `false` (non-string column).
2. Skip if value is not a string.
3. **latin1**: any byte is valid; only truncate to byte length if needed.
4. **ASCII values**: any value passing `check_ascii()` is valid; only truncate to byte length.
5. **utf8 / utf8mb3 / utf8mb4**: apply regex to remove invalid byte sequences. For `utf8mb4`, the regex includes 4-byte sequences (U+10000 and above). Truncate by character count if needed.
6. **Other charsets**: send to MySQL via `CONVERT(CONVERT(%s USING charset) USING connection_charset)` SELECT and use the returned value.

The regex accepts:
- Single-byte sequences: `0x00`–`0x7F`
- Two-byte sequences: `0xC2`–`0xDF` + `0x80`–`0xBF`
- Three-byte sequences: various ranges for valid UTF-8 3-byte encodings
- Four-byte sequences (utf8mb4 only): `0xF0–0xF4` ranges

### Collation safety check (`check_safe_collation`)

Before `get_var`, `get_row`, `get_col`, `get_results`, if `check_current_query` is true:

1. Skip DDL queries.
2. If pure ASCII: safe (returns true, skips deep check).
3. Extract table name. If not found: not safe.
4. Get table charset. If `false` (no charset) or `'latin1'`: safe.
5. Check all columns in `col_meta` for that table. If all have a "safe" collation (bin or general_ci for utf8/utf8mb3/utf8mb4 variants): safe.

**Safe collations list:**
- `utf8_bin`
- `utf8_general_ci`
- `utf8mb3_bin`
- `utf8mb3_general_ci`
- `utf8mb4_bin`
- `utf8mb4_general_ci`

If the collation check returns `true`, `check_current_query` is set to `false` for that query (skip duplicate charset stripping in `query()`).

### `table_charset` cache

- Keyed by lowercased table name.
- Value is the detected charset string, `false` (no charset), or `'binary'`.
- Populated lazily by `get_table_charset()`.
- A `'pre_get_table_charset'` filter allows short-circuiting the DB lookup.

### `col_meta` cache

- Keyed by lowercased table name → lowercased column name → `ColumnMeta` object.
- Populated as a side effect of `get_table_charset()` (which runs `SHOW FULL COLUMNS FROM table`).
- The `check_current_query` flag is set to `false` before internal charset-check queries to prevent infinite recursion.

### utf8mb3 alias handling

When building the table charset, `utf8mb3` is treated as an alias for `utf8` — after collection, `charsets['utf8mb3']` is converted to `charsets['utf8']`.

### Multi-charset table resolution

When a table has columns with multiple charsets:
1. Remove `latin1` from the set and recount.
2. If one charset remains: use it.
3. If `utf8` and `utf8mb4` both remain: use `utf8`.
4. Otherwise: use `ascii`.

---

## 9. TypeScript Interface Sketch

```typescript
// Output format constants
type QueryOutputFormat = 'OBJECT' | 'OBJECT_K' | 'ARRAY_A' | 'ARRAY_N';

// A row returned as an object
type RowObject = Record<string, unknown>;

// Column length descriptor
interface ColumnLength {
  type: 'byte' | 'char';
  length: number;
}

// Query log entry (only populated when SAVEQUERIES is truthy)
type QueryLogEntry = [
  sql: string,
  elapsedSeconds: number,
  callstack: string,
  startTimestamp: number,
  customData: unknown
];

// Error type (simplified WP_Error equivalent)
interface WpError {
  code: string;
  message: string;
}

interface Wpdb {
  // --- Public state properties ---
  show_errors: boolean;
  suppress_errors: boolean;
  last_error: string;
  num_queries: number;
  num_rows: number;
  rows_affected: number;
  insert_id: number;
  last_query: string | null;
  last_result: RowObject[] | null;
  queries: QueryLogEntry[] | undefined;
  prefix: string;
  base_prefix: string;
  ready: boolean;
  blogid: number;
  siteid: number;
  charset: string;
  collate: string;
  field_types: Record<string, string>;
  func_call: string;
  is_mysql: boolean | null;
  time_start: number | null;
  error: WpError | string | null;

  // --- Table name properties (all per-blog unless noted) ---
  posts: string;
  comments: string;
  links: string;
  options: string;
  postmeta: string;
  terms: string;
  term_taxonomy: string;
  term_relationships: string;
  termmeta: string;
  commentmeta: string;
  // Global (always base_prefix):
  users: string;
  usermeta: string;
  // Multisite global (always base_prefix, null on single-site):
  blogs: string | null;
  blogmeta: string | null;
  registration_log: string | null;
  signups: string | null;
  site: string | null;
  sitemeta: string | null;
  sitecategories: string | null;
  // Deprecated:
  categories: string;
  post2cat: string;
  link2cat: string;

  // --- Initialization ---
  initCharset(): void;
  determineCharset(charset: string, collate: string): { charset: string; collate: string };
  setCharset(dbh: unknown, charset?: string, collate?: string): void;
  setSqlMode(modes?: string[]): void;

  // --- Prefix / Multisite ---
  setPrefix(prefix: string, setTableNames?: boolean): string | WpError;
  setBlogId(blogId: number, networkId?: number): number;
  getBlogPrefix(blogId?: number | null): string;
  tables(
    scope?: 'all' | 'blog' | 'global' | 'ms_global' | 'old',
    prefix?: boolean,
    blogId?: number
  ): Record<string, string>;

  // --- Connection ---
  select(db: string, dbh?: unknown): void;
  dbConnect(allowBail?: boolean): boolean;
  parseDbHost(host: string): [string, number | null, string | null, boolean] | false;
  checkConnection(allowBail?: boolean): boolean | void;
  close(): boolean;

  // --- Query execution ---
  query(query: string): number | boolean;
  logQuery(
    query: string,
    queryTime: number,
    queryCallstack: string,
    queryStart: number,
    queryData: unknown
  ): void;

  // --- Parameterization ---
  prepare(query: string, ...args: unknown[]): string | undefined;
  escLike(text: string): string;
  placeholderEscape(): string;
  addPlaceholderEscape(query: string): string;
  removePlaceholderEscape(query: string): string;

  // --- CRUD ---
  insert(
    table: string,
    data: Record<string, unknown>,
    format?: string[] | string | null
  ): number | false;
  replace(
    table: string,
    data: Record<string, unknown>,
    format?: string[] | string | null
  ): number | false;
  update(
    table: string,
    data: Record<string, unknown>,
    where: Record<string, unknown>,
    format?: string[] | string | null,
    whereFormat?: string[] | string | null
  ): number | false;
  delete(
    table: string,
    where: Record<string, unknown>,
    whereFormat?: string[] | string | null
  ): number | false;

  // --- Result fetching ---
  getVar(query?: string | null, x?: number, y?: number): string | null;
  getRow(query?: string | null, output?: QueryOutputFormat, y?: number): RowObject | unknown[] | null;
  getCol(query?: string | null, x?: number): string[];
  getResults(query?: string | null, output?: QueryOutputFormat): RowObject[] | Record<string, RowObject> | unknown[][] | null;

  // --- Column / charset metadata ---
  getColCharset(table: string, column: string): string | false | WpError;
  getColLength(table: string, column: string): ColumnLength | false | WpError;
  getColInfo(infoType?: string, colOffset?: number): unknown[] | unknown;
  getCharsetCollate(): string;
  stripInvalidTextForColumn(table: string, column: string, value: string): string | WpError;

  // --- Capabilities ---
  hasCap(
    dbCap: 'collation' | 'group_concat' | 'subqueries' | 'set_charset' | 'utf8mb4' | 'utf8mb4_520' | 'identifier_placeholders' | string
  ): boolean;
  dbVersion(): string | null;
  dbServerInfo(): string;
  checkDatabaseVersion(): WpError | void;

  // --- Error handling ---
  printError(str?: string): void | false;
  showErrors(show?: boolean): boolean;
  hideErrors(): boolean;
  suppressErrors(suppress?: boolean): boolean;
  bail(message: string, errorCode?: string): void | false;

  // --- State management ---
  flush(): void;

  // --- Debug ---
  timerStart(): true;
  timerStop(): number;
  getCaller(): string;
}
```

---

## 10. Design Patterns to Carry Over

1. **`prepare()` is the only safe interpolation path for values.** All CRUD methods route through `prepare()`. Direct string concatenation into a query is never safe. The `%i` placeholder (identifier quoting) was added in WP 6.2 specifically to close the last common remaining SQL-injection surface (table/column names).

2. **Placeholder escape tokens prevent double-interpolation.** After `prepare()` runs, all `%` characters in the output are replaced with a unique per-request token. This prevents a second pass through `prepare()` or `sprintf()` from misinterpreting safe content as placeholders. The `'query'` filter at priority `0` transparently reverses this before execution.

3. **`check_current_query` flag gates charset validation once per query.** The CRUD helpers set this to `false` before calling `query()` because they have already validated character sets in `process_fields()`. Direct callers of `query()` get the full validation path. The `get_*` helpers can also bypass it when `check_safe_collation()` confirms the query does not need stripping.

4. **Lazy charset metadata, eager cache.** `col_meta` and `table_charset` are populated on first access and then cached in memory for the duration of the request. The cache is never invalidated. Any `SHOW FULL COLUMNS FROM` query for charset detection sets `check_current_query = false` to avoid recursive charset checking.

5. **`NULL` values are first-class in CRUD methods.** A `null` value in `data` or `where` emits a literal SQL `NULL` token (not a placeholder), and a `null` WHERE value emits `IS NULL`. This is separate from the placeholder pipeline and must be handled before building the query string.

6. **Automatic reconnection on MySQL 2006.** The `query()` method catches the "server gone away" errno and calls `check_connection()`, which retries `db_connect()` up to `reconnect_retries` times with 1-second delays between attempts. After `template_redirect` has fired, reconnect failure returns `false` rather than halting execution.

7. **Incompatible SQL mode removal.** On every new connection, `set_sql_mode()` queries the current mode and strips modes that break WordPress: `NO_ZERO_DATE`, `ONLY_FULL_GROUP_BY`, `STRICT_TRANS_TABLES`, `STRICT_ALL_TABLES`, `TRADITIONAL`, `ANSI`. The list is filterable via `incompatible_sql_modes`.

8. **`SAVEQUERIES` is a zero-cost opt-in.** Query logging adds a timer, callstack capture, and array append on every query. This is gated behind a constant check so it compiles out entirely in production. The TypeScript equivalent should use the same pattern (an environment flag, not a runtime property).

9. **Three distinct error-visibility levels.** `suppress_errors` (silent), `show_errors = false` (log only), `show_errors = true` (log + display) are three discrete states that must be independently toggleable and restorable. Each of `show_errors()`, `hide_errors()`, and `suppress_errors()` returns the previous state to allow save-and-restore patterns.

10. **Table properties are computed strings, not getters.** `$wpdb->posts` is a plain string property set when the prefix changes. It is not a getter that computes the name on read. This means the table names are always current at the time of prefix change, and reading them later has zero overhead. The TypeScript model should set string properties on `set_prefix` / `set_blog_id` rather than using computed properties.

11. **Invalid text stripping is a hard gate, not a soft filter.** If `strip_invalid_text_from_query()` changes the query string, the entire query is rejected with `last_error` set. There is no silent truncation at the raw query level; only the CRUD methods truncate fields silently (and only with errors reported via `last_error`). This asymmetry is intentional: raw queries are too unpredictable to safely truncate.

12. **`process_fields` is the CRUD charset pipeline.** Every CRUD operation passes through `process_field_formats` → `process_field_charsets` → `process_field_lengths` → `strip_invalid_text`. Any failure in this chain returns `false` from the CRUD method. The pipeline also populates the `col_meta` cache as a side effect.

---

## 11. Tovu Reconstruction Notes

### 11.1 Why this exists

This layer exists so the rest of WordPress can treat SQL access as one governed boundary instead of scattering connection logic, placeholder escaping, charset validation, and table-prefix handling across the codebase. It is low-level, but it shapes almost every higher-level subsystem.

### 11.2 What Tovu should preserve

- One canonical SQL boundary with parameterized interpolation and identifier-safety rules
- A consistent CRUD pipeline that validates values before they hit storage
- Explicit handling for connection loss, error visibility modes, and environment-specific diagnostics
- Tenant/site-aware table or schema switching handled centrally, not in feature code

### 11.3 What Tovu can simplify

- Tovu does not need WordPress's PHP string-placeholder API if a typed query builder or database client gives stronger guarantees
- SQL mode compatibility hacks can be narrower if Tovu supports a smaller set of database environments
- Most feature code should depend on repositories or ports, not raw SQL execution

### 11.4 Possible Tovu seams

- `src/core/db/` for the concrete SQL runtime
- `src/core/ports/SqlClientPort.ts` for parameterized query execution
- `src/core/ports/DatabaseHealthPort.ts` for reconnect and error-state behavior
- higher-level repositories in feature modules so the application core does not couple directly to query text

### 11.5 Suggested priority

- `V1`: canonical SQL boundary, prepared queries, validation pipeline, connection/error handling
- `Later`: compatibility shims for wider database environments and deeper diagnostics
