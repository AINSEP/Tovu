# Rewrite and Routing — Specification

**Source files analyzed:**
- `wp-includes/class-wp-rewrite.php`
- `wp-includes/class-wp.php`
- `wp-includes/rewrite.php`
- `wp-includes/link-template.php` (URL generation functions)
- `wp-includes/category-template.php` (get_category_link, get_tag_link)
- `wp-includes/author-template.php` (get_author_posts_url)

---

## 1. Overview

WordPress does not use a conventional framework router. Instead, it implements a two-phase front-controller pattern built on regular-expression rewrite rules and query variables.

**Phase 1 — Rule matching (WP_Rewrite):** A large ordered array of regex patterns is compiled from permalink structures and stored in the `rewrite_rules` database option. On each request, the incoming URL path is matched against this array from top to bottom. The first matching pattern determines a set of query variables.

**Phase 2 — Query execution (WP class):** The resolved query variables are handed to `WP_Query`, which translates them into a database query and populates the post loop globals.

There is no route-to-controller dispatch. The "controller" is always the same: `WP_Query` runs the query, and the active theme template is loaded based on the resulting query state (is_single, is_archive, etc.). Rewrite rules only determine query variables; they do not select templates.

### Request flow summary

```
HTTP request
  → Web server rewrites to index.php (via mod_rewrite or equivalent)
  → WordPress bootstrap runs wp() / WP::main()
      → WP::init()            — authenticate current user
      → WP::parse_request()   — match URL against rewrite rules → query_vars
      → WP::query_posts()     — run WP_Query with query_vars
      → WP::handle_404()      — set 404 status if nothing matched
      → WP::register_globals()— expose query vars as PHP globals
      → WP::send_headers()    — emit HTTP headers
      → do_action('wp')       — signal that the environment is ready
  → Template loader selects and includes the correct theme file
```

### Permalink modes

Three modes exist:

| Mode | Description | `permalink_structure` value |
|---|---|---|
| Plain | No pretty URLs; all queries via `?p=N` etc. | Empty string |
| Index (PATHINFO) | Pretty URLs but `index.php` appears in the path | Starts with `index.php/` |
| mod_rewrite | Fully pretty URLs; web server rewrites to index.php | Anything else (e.g. `/%year%/%postname%/`) |

---

## 2. WP_Rewrite — Data Structures

`WP_Rewrite` is a singleton-like class instantiated once as `$wp_rewrite`. Its constructor calls `init()`, which reads permalink settings from the database and populates all derived properties.

### Core properties

```typescript
interface WPRewriteState {
  // From the 'permalink_structure' option — the master pattern for post URLs.
  // Example: "/%year%/%monthnum%/%day%/%postname%/"
  // Empty string means plain (no pretty) permalinks.
  permalinkStructure: string;

  // true if permalinkStructure ends with "/"
  useTrailingSlashes: boolean;

  // The static portion of permalinkStructure before the first %-tag.
  // E.g. for "/archive/%post_id%" the front is "/archive/".
  // For "/%year%/%postname%/" the front is "/".
  front: string;

  // Prefix for all permalink structures.
  // Empty string when using mod_rewrite.
  // "index.php/" when using index (PATHINFO) permalinks.
  root: string;

  // The entry-point filename. Always "index.php".
  index: string;

  // Backreference variable name used in generated queries.
  // Empty string normally; set to "matches" during rule regeneration so
  // query strings use "$matches[N]" syntax instead of "$N".
  matches: string;
}
```

### The rewrite rules array

```typescript
// The compiled rule table. Key = regex pattern; value = query string template.
// Example:
//   "([0-9]{4})/([0-9]{1,2})/([0-9]{1,2})/([^/]+)/?$"
//     => "index.php?year=$matches[1]&monthnum=$matches[2]&day=$matches[3]&name=$matches[4]"
type RewriteRules = Record<string, string>;

interface WPRewriteRuleSets {
  // The fully merged and cached rule array. Populated by rewrite_rules() or
  // loaded from the 'rewrite_rules' option by wp_rewrite_rules().
  rules: RewriteRules;

  // Custom rules added via add_rewrite_rule(..., 'bottom'). Appended last.
  extraRules: RewriteRules;

  // Custom rules added via add_rewrite_rule(..., 'top'). Prepended first,
  // but after extra_permastructs rules.
  extraRulesTop: RewriteRules;

  // Rules that do NOT route to index.php. Written to .htaccess directly.
  // Added via add_external_rule() / add_rule() when query doesn't begin with index.php.
  nonWpRules: RewriteRules;
}
```

### Rewrite tags

Three parallel arrays form a lookup table mapping tag names to regex patterns and query variable assignments:

```typescript
interface RewriteTagTable {
  // Tag names — delimited by "%" on both sides.
  rewritecode: string[];

  // Corresponding regex capture groups, one per tag.
  rewritereplace: string[];

  // Corresponding query-string fragments, one per tag. Each ends with "=".
  queryreplace: string[];
}
```

Built-in tags (indices are parallel across all three arrays):

| Index | Tag | Regex | Query fragment |
|---|---|---|---|
| 0 | `%year%` | `([0-9]{4})` | `year=` |
| 1 | `%monthnum%` | `([0-9]{1,2})` | `monthnum=` |
| 2 | `%day%` | `([0-9]{1,2})` | `day=` |
| 3 | `%hour%` | `([0-9]{1,2})` | `hour=` |
| 4 | `%minute%` | `([0-9]{1,2})` | `minute=` |
| 5 | `%second%` | `([0-9]{1,2})` | `second=` |
| 6 | `%postname%` | `([^/]+)` | `name=` |
| 7 | `%post_id%` | `([0-9]+)` | `p=` |
| 8 | `%author%` | `([^/]+)` | `author_name=` |
| 9 | `%pagename%` | `([^/]+?)` | `pagename=` |
| 10 | `%search%` | `(.+)` | `s=` |

The `%pagename%` regex uses a reluctant (`+?`) quantifier to avoid greedy matching conflicts with page hierarchy paths.

### Extra permalink structures

Custom post types, categories, tags, and third-party structures are stored separately:

```typescript
interface PermastructDefinition {
  struct: string;       // the full pattern string after with_front/root is prepended
  withFront: boolean;   // whether $front was prepended (true) or $root was prepended (false)
  epMask: number;       // bitmask of endpoint types (EP_* constants)
  paged: boolean;       // whether to generate /page/N/ pagination rules
  feed: boolean;        // whether to generate /feed/ rules
  forcomments: boolean; // whether feed rules should produce comment feeds
  walkDirs: boolean;    // whether to walk directory levels and generate intermediate rules
  endpoints: boolean;   // whether to attach registered endpoints
}

// Keyed by permastruct name (e.g. "category", "post_tag", "product")
type ExtraPermastructs = Record<string, PermastructDefinition>;
```

### Endpoints

Endpoints extend existing permalink patterns with a named suffix (e.g. `/trackback/`, `/json/`):

```typescript
// Each endpoint is stored as a three-element tuple:
// [0] epMask  — bitmask of EP_* constants controlling where the endpoint is appended
// [1] name    — the URL segment text (e.g. "json")
// [2] queryVar — the query variable name to set, or false to skip query var registration
type EndpointEntry = [epMask: number, name: string, queryVar: string | false];
```

### Feed types

```typescript
// The default set of recognized feed format names.
const DEFAULT_FEEDS: string[] = ['feed', 'rdf', 'rss', 'rss2', 'atom'];
```

### Base strings (configurable)

| Property | Default value | Source option |
|---|---|---|
| `author_base` | `'author'` | hardcoded |
| `search_base` | `'search'` | hardcoded |
| `comments_base` | `'comments'` | hardcoded |
| `pagination_base` | `'page'` | hardcoded |
| `comments_pagination_base` | `'comment-page'` | hardcoded |
| `feed_base` | `'feed'` | hardcoded |
| `category_base` | `''` | `'category_base'` option (empty = use 'category') |
| `tag_base` | `''` | `'tag_base'` option (empty = use 'tag') |

### Verbosity flags

```typescript
interface VerbosityFlags {
  // When true, every rewrite rule is written individually to .htaccess.
  // When false (default), a single catch-all rule routes everything to index.php.
  useVerboseRules: boolean;

  // When true, page permalink rules are placed BEFORE post rules in the array
  // (because post permalinks might ambiguously match page paths).
  // Set to true when permalinkStructure begins with %postname%, %category%, %tag%, or %author%.
  useVerbosePageRules: boolean;
}
```

---

## 3. WP_Rewrite — Permalink Structures

A permalink structure is a template string that mixes literal path segments with `%tag%` tokens. The tokens are replaced with values from the post/term/date when generating a URL, or captured by regex groups when matching an incoming URL.

### init() — deriving front and root

`init()` reads `permalink_structure` from the database and computes two derived values:

**`front`**: Everything in `permalinkStructure` up to (but not including) the first `%` character.
- Example: `"/archive/%post_id%"` → front = `"/archive/"`
- Example: `"/%year%/%postname%/"` → front = `"/"`
- Example: `""` (empty, plain permalinks) → front = `""`

**`root`**: Empty string when using mod_rewrite. Set to `"index.php/"` when `using_index_permalinks()` returns true (i.e. when `permalinkStructure` itself begins with `index.php`).

**`use_trailing_slashes`**: True if `permalinkStructure` ends with `"/"`.

**`use_verbose_page_rules`**: True if `permalinkStructure` matches the pattern `^[^%]*%(?:postname|category|tag|author)%`. This means the structure starts with one of the wildcard-like tags. When true, page rules are placed before post rules so that page paths are checked first and not accidentally captured by post pattern wildcards.

After `init()` runs, all cached structure properties (`author_structure`, `date_structure`, `page_structure`, `search_structure`, `feed_structure`, `comment_feed_structure`) are unset so they are lazily recomputed on next access.

### Derived structure getters

All getters cache their result in a property after first computation:

**`get_author_permastruct()`**
Returns `front + author_base + "/%author%"`.
Example: `"/" + "author" + "/%author%"` = `"/author/%author%"`.
Returns false if `permalink_structure` is empty.

**`get_search_permastruct()`**
Returns `root + search_base + "/%search%"`.
Note: uses `root`, not `front`, so search always starts at the site root.
Example: `"" + "search" + "/%search%"` = `"search/%search%"`.

**`get_page_permastruct()`**
Returns `root + "%pagename%"`.
Example with mod_rewrite: `"" + "%pagename%"` = `"%pagename%"`.

**`get_feed_permastruct()`**
Returns `root + feed_base + "/%feed%"`.
Example: `"feed/%feed%"`.

**`get_comment_feed_permastruct()`**
Returns `root + comments_base + "/" + feed_base + "/%feed%"`.
Example: `"comments/feed/%feed%"`.

**`get_date_permastruct()`**
Examines `permalink_structure` for one of three date orderings:
1. `%year%/%monthnum%/%day%` — year-first (ISO style)
2. `%day%/%monthnum%/%year%` — day-first (European style)
3. `%monthnum%/%day%/%year%` — month-first (US style)

If none is present, defaults to `%year%/%monthnum%/%day%`.

**Collision avoidance with `%post_id%`:** If `%post_id%` appears within the first three tokens of `permalink_structure`, the date structure is prefixed with `front + "date/"` instead of just `front`. This prevents date archive URLs from colliding with post ID URLs.

Final result: `front + date_endian` (or `front + "date/" + date_endian`).

**`get_year_permastruct()`**
Takes `get_date_permastruct()`, removes `%monthnum%` and `%day%`, then collapses double slashes.

**`get_month_permastruct()`**
Takes `get_date_permastruct()`, removes `%day%`, then collapses double slashes.

**`get_day_permastruct()`**
Returns `get_date_permastruct()` unchanged.

**`get_category_permastruct()`**
Returns `get_extra_permastruct('category')`.

**`get_tag_permastruct()`**
Returns `get_extra_permastruct('post_tag')`.

**`get_extra_permastruct(name)`**
Returns `extra_permastructs[name]['struct']` if it exists and `permalink_structure` is non-empty, otherwise false.

---

## 4. WP_Rewrite — Built-in Permalink Structures and Rule Generation

### How `rewrite_rules()` assembles the full rule set

`rewrite_rules()` is the method that produces the final merged rule array. It calls `generate_rewrite_rules()` for each section, applies section-specific filters, merges everything together, fires `generate_rewrite_rules` action and `rewrite_rules_array` filter, and returns the result.

**Assembly order when `use_verbose_page_rules = true`** (structure starts with wildcard tag):
1. `extra_rules_top` (custom top-priority rules + extra permastruct rules)
2. `robots\.txt$` → `index.php?robots=1` (only if installed at root)
3. `favicon\.ico$` → `index.php?favicon=1` (only if installed at root)
4. `sitemap\.xml` → `index.php?sitemap=index` (only if installed at root)
5. Deprecated file rules (old feed PHP files → `index.php?feed=old`, wp-app.php → `index.php?error=403`)
6. Registration pages (wp-signup.php, wp-activate.php for multisite main site; wp-register.php always)
7. Root rules (pagination and feeds for homepage)
8. Comments feed rules
9. Search rules
10. Author archive rules
11. Date archive rules
12. **Page rules (before post rules — verbose page mode)**
13. Post permalink rules
14. `extra_rules` (custom bottom-priority rules)

**Assembly order when `use_verbose_page_rules = false`** (structure starts with a fixed prefix):
Same as above except page rules come **after** post rules (steps 12 and 13 are swapped).

### `generate_rewrite_rules()` — the core algorithm

Signature:
```typescript
function generateRewriteRules(
  permalinkStructure: string,
  epMask: number = EP_NONE,
  paged: boolean = true,
  feed: boolean = true,
  forcomments: boolean = false,
  walkDirs: boolean = true,
  endpoints: boolean = true
): RewriteRules
```

The algorithm:

1. **Build feed regex patterns:**
   - `feedregex2`: `(feed|rdf|rss|rss2|atom)/?$` — matches feed name at end of URL
   - `feedregex`: `feed/(feed|rdf|rss|rss2|atom)/?$` — matches `feed/feedname` style
   - `pageregex`: `page/?([0-9]{1,})/?$`
   - `commentregex`: `comment-page-([0-9]{1,})/?$`
   - `trackbackregex`: `trackback/?$`
   - `embedregex`: `embed/?$`

2. **Build endpoint suffix patterns** (if `endpoints = true`): For each entry in `this.endpoints`, creates a pattern `endpointName(/(.*))?/?$` and a query fragment `&queryVar=`. Filters endpoints by `epMask` bitwise AND during rule generation.

3. **Extract the front** (literal prefix before first `%` in the structure) and **tokenize** all `%tag%` tokens.

4. **Build cumulative query strings**: For each token index `i`, the query string is the accumulation of all `queryVar=$N` fragments from token 0 through token `i`. These are stored in `queries[i]`.

5. **Walk directories** (if `walkDirs = true`): Split the structure (minus its front prefix) by `/` to get an array of "dirs". Each dir is processed in turn, accumulating the regex match pattern segment by segment. When `walkDirs = false`, the structure is treated as a single unit.

6. **For each directory level**, the accumulated regex pattern `match` is used to generate several derived patterns:
   - `match + feedregex` → feed query
   - `match + feedregex2` → feed query (shorthand)
   - `match + pageregex` → paged query (adds `&paged=$N`)
   - `match + commentregex` → comment page query (adds `&cpage=$N`)
   - `match + embedregex` → embed query (adds `&embed=true`)
   - For each registered endpoint whose `epMask` matches: `match + endpointPattern` → base query + endpoint query var

7. **Post/page detection**: A directory level is considered a "permalink" (individual post) level if the accumulated structure contains `%postname%`, `%post_id%`, `%pagename%`, or a full timestamp (`%year%` + `%monthnum%` + `%day%` + `%hour%` + `%minute%` + `%second%`). Custom post type tags (`%productname%` etc.) are also checked via registered post types.

8. **At permalink level**, additional attachment rules are generated:
   - **Short form** (non-page): `submatchBase/([^/]+)/` → attachment query — used when the post type is NOT hierarchical (pages use only explicit form to avoid subpage confusion)
   - **Explicit form**: `submatchBase/attachment/([^/]+)/` → attachment query
   - Both forms also get trackback, feed, comment, and embed variants
   - The main match gets an optional page suffix `(?:/([0-9]+))?/?$` and a `&page=$N` appended

9. **At non-permalink level**, the match simply gets `?$` appended.

10. Each directory's rules are prepended onto the accumulating `post_rewrite` array (so more-specific patterns end up first).

### Rule tables for each built-in structure

**Root rules** (`EP_ROOT`):
Generated from `root + "/"`. Produces pagination and feed rules for the site homepage.

**Post rules** (`EP_PERMALINK`):
Generated from `permalink_structure`. Produces permalink, trackback, attachment, embed, comment pagination, feed, and paged-archive rules for individual posts.

**Date rules** (`EP_DATE`):
Generated from `get_date_permastruct()`. Walks through year/month/day levels, producing archive rules at each level.

**Search rules** (`EP_SEARCH`):
Generated from `get_search_permastruct()`.

**Author rules** (`EP_AUTHORS`):
Generated from `get_author_permastruct()`.

**Page rules** (`EP_PAGES`):
Generated from `get_page_permastruct()` with `walk_dirs = false`, `feed = false`. Uses a special `%pagename%` regex `(.?.+?)` (with a leading `.?` to prevent conflicts). Pages get comment pagination rules.

**Comments feed rules** (`EP_COMMENTS`):
Generated from `root + comments_base` with `paged = false`, `feed = true`, `forcomments = true`. The `forcomments` flag appends `&withcomments=1` to all feed query strings.

**Extra permastruct rules** (categories, tags, custom post types):
Each entry in `extra_permastructs` is passed through `generate_rewrite_rules()` using the stored configuration. Rules land in `extra_rules_top` (they are merged there, so they appear near the top of the final array before post and date rules).

---

## 5. WP_Rewrite — Flushing and Regenerating Rules

### Storage

Compiled rewrite rules are stored in the `rewrite_rules` WordPress option (not autoloaded in cache-optimized configurations). The value is a PHP serialized (or JSON) associative array.

### `wp_rewrite_rules()` — cached access

This is the method called during normal request handling. It:
1. Loads `rewrite_rules` from the options table.
2. If the option is empty (first run, or after flush), calls `refresh_rewrite_rules()`.
3. Returns `this.rules`.

### `refresh_rewrite_rules()` — regeneration

1. Clears `this.rules` to empty string.
2. Sets `this.matches = "matches"` so generated queries use `$matches[N]` syntax.
3. Calls `this.rewrite_rules()` to rebuild the full rule array.
4. **If the `wp_loaded` action has not yet fired**: schedules `flush_rules` on the `wp_loaded` action instead of saving immediately. This handles the case where rules are regenerated during early bootstrap before all plugins have registered their custom rules.
5. **If `wp_loaded` has fired**: immediately calls `update_option('rewrite_rules', this.rules)`.

### `flush_rules(hard)` — public flush method

Called by `flush_rewrite_rules()`. Steps:
1. **If `wp_loaded` has not fired**: schedules itself on `wp_loaded` and records whether a hard flush was requested. Returns early. (Multiple calls before `wp_loaded` merge their `hard` flags with OR — if any requested hard, the final flush will be hard.)
2. Calls `refresh_rewrite_rules()` (which regenerates and saves the option).
3. If `hard = false` or the `flush_rewrite_rules_hard` filter returns false, stops here.
4. **Hard flush**: calls `save_mod_rewrite_rules()` (writes to `.htaccess`) if that function exists, and `iis7_save_url_rewrite_rules()` (writes to `web.config`) if that function exists.

### `flush_rewrite_rules(hard)` — global function

Thin wrapper around `$wp_rewrite->flush_rules(hard)`. `hard` defaults to `true`.

**When to flush**: Any code that adds/removes rewrite rules, permastructs, endpoints, or changes the permalink structure must flush rewrite rules. The canonical pattern is to flush on plugin activation and deactivation hooks.

### `set_permalink_structure(structure)` / `set_category_base(base)` / `set_tag_base(base)`

These methods update the corresponding database option and call `init()` to reset all derived properties. `set_permalink_structure()` additionally fires the `permalink_structure_changed` action with the old and new values.

---

## 6. WP_Rewrite — Adding Custom Rules

### `add_rewrite_rule(regex, query, after)`

Global function `add_rewrite_rule()` proxies to `$wp_rewrite->add_rule()`.

**`add_rule(regex, query, after = 'bottom')`:**
- If `query` is an array, it is converted to a query string via `add_query_arg` against `index.php`.
- If `query` does not contain `?`, or the part before `?` is not `index.php`, the rule is treated as "external" and routed to `add_external_rule()` (goes into `non_wp_rules`).
- Otherwise:
  - `after = 'bottom'` → appends to `extra_rules`
  - anything else → appends to `extra_rules_top`

**Note**: These rules are not written to the database immediately. They are merged into the rule array when `rewrite_rules()` is called. For the rules to persist, `flush_rewrite_rules()` must be called.

### `add_rewrite_tag(tag, regex, query)` — global function

Validates that `tag` is at least 3 characters and is wrapped in `%`. If `query` is empty, derives it from the tag name (strips `%` delimiters, registers the stripped name as a public query var on the `WP` instance, and sets `query = "tagname="`). Then calls `$wp_rewrite->add_rewrite_tag()`.

**`WP_Rewrite::add_rewrite_tag(tag, regex, query)`:**
Checks if `tag` already exists in `rewritecode`. If yes, replaces the existing `rewritereplace` and `queryreplace` entries at that index. If no, appends new entries to all three arrays.

**`remove_rewrite_tag(tag)`** / **`WP_Rewrite::remove_rewrite_tag(tag)`:**
Removes the tag and its corresponding regex and query entries from all three arrays by index.

### `add_permastruct(name, struct, args)` — global function

Proxies to `$wp_rewrite->add_permastruct()`.

**`WP_Rewrite::add_permastruct(name, struct, args)`:**

Default arguments:
```typescript
const defaults: PermastructArgs = {
  withFront: true,
  epMask: EP_NONE,
  paged: true,
  feed: true,
  forcomments: false,
  walkDirs: true,
  endpoints: true,
};
```

- If `withFront = true`, prepends `this.front` to `struct`.
- If `withFront = false`, prepends `this.root` to `struct`.
- Stores the result in `extra_permastructs[name]` with all args included.

**`remove_permastruct(name)`**: Deletes from `extra_permastructs`. Only works for custom permastructs; built-in structures cannot be removed this way.

### `add_rewrite_endpoint(name, places, queryVar)` — global function

Proxies to `$wp_rewrite->add_endpoint()`.

**`WP_Rewrite::add_endpoint(name, places, queryVar = true)`:**
- `queryVar = true` or `null` → normalizes to `name` (uses endpoint name as query var name).
- `queryVar = false` → does not register a query var.
- Appends `[places, name, queryVar]` to `this.endpoints`.
- If `queryVar` is a string, calls `$wp->add_query_var(queryVar)` to register it as a public query var.

**EP_* bitmask constants:**

```typescript
const EP_NONE         = 0;       // match nothing
const EP_PERMALINK    = 1;       // post permalinks
const EP_ATTACHMENT   = 2;       // attachment permalinks
const EP_DATE         = 4;       // any date archive
const EP_YEAR         = 8;       // yearly archives
const EP_MONTH        = 16;      // monthly archives
const EP_DAY          = 32;      // daily archives
const EP_ROOT         = 64;      // site root
const EP_COMMENTS     = 128;     // comment feeds
const EP_SEARCH       = 256;     // search results (pretty URL only)
const EP_CATEGORIES   = 512;     // category archives
const EP_TAGS         = 1024;    // tag archives
const EP_AUTHORS      = 2048;    // author archives
const EP_PAGES        = 4096;    // pages

const EP_ALL_ARCHIVES = EP_DATE | EP_YEAR | EP_MONTH | EP_DAY | EP_CATEGORIES | EP_TAGS | EP_AUTHORS;
// = 4 | 8 | 16 | 32 | 512 | 1024 | 2048 = 3644

const EP_ALL = EP_PERMALINK | EP_ATTACHMENT | EP_ROOT | EP_COMMENTS | EP_SEARCH | EP_PAGES | EP_ALL_ARCHIVES;
// = 1 | 2 | 64 | 128 | 256 | 4096 | 3644 = 8191
```

### `add_feed(feedname, callback)` — global function

Adds `feedname` to `$wp_rewrite->feeds` if not already present. Registers the callback on the `do_feed_{feedname}` action hook. Returns the hook name.

---

## 7. WP Class — The Request Lifecycle

The `WP` class manages the per-request lifecycle. Its `main()` method is called once per request from `wp()`.

### `WP::main(queryArgs)`

```typescript
function main(queryArgs: string | Record<string, string> = ''): void {
  this.init();              // 1. authenticate user
  const parsed = this.parseRequest(queryArgs);  // 2. match URL, populate query_vars
  if (parsed) {
    this.queryPosts();      // 3. run WP_Query
    this.handle404();       // 4. set 404 status if nothing found
    this.registerGlobals(); // 5. expose vars as PHP globals
  }
  this.sendHeaders();       // 6. emit HTTP headers (runs after query, regardless of parsed)
  doAction('wp', this);     // 7. signal readiness
}
```

### `WP::init()`

Calls `wp_get_current_user()` to authenticate the request. This is the earliest point the current user object is available.

### `WP::parse_request(extraQueryVars)`

Returns `false` if the `do_parse_request` filter returns false. Otherwise returns `true`.

**Step-by-step:**

1. **Gate**: Apply `do_parse_request` filter. Allows complete bypass of routing (e.g. for API frameworks co-existing with WordPress).

2. **Load rewrite rules**: Call `$wp_rewrite->wp_rewrite_rules()` to get the cached rule array.

3. **If rewrite rules are non-empty** (pretty permalinks are active):
   - Extract `PATH_INFO` from `$_SERVER`. Percent-encode any literal `%` in the path info to avoid double-decode issues.
   - Extract `REQUEST_URI` (strip query string).
   - Remove the home path prefix from all three (path info, request URI, PHP_SELF).
   - **Determine `requested_path`**: Use path info if it is non-empty and does not end with `index.php`; otherwise use the cleaned request URI. If request URI equals `index.php`, treat as empty.
   - Set `this.request = requested_path`.
   - **Match loop**: Iterate over all rewrite rules in order. For each rule regex `match`, attempt `preg_match("#^{match}#", requestedPath)`. Also try against `urldecode(requestedPath)` if the first attempt fails. If the match succeeds:
     - **Verbose page rule check**: If `use_verbose_page_rules` is true and the query contains `pagename=$matches[N]`, call `get_page_by_path()` with the captured value. If no matching page exists, or the page has a status that is not public/protected/private and is excluded from search, skip this rule and continue the loop.
     - Store the matched regex in `this.matched_rule`. Break the loop.
   - If a rule was matched: strip the `index.php?` prefix from the query template, substitute `$matches[N]` backreferences, and store in `this.matched_query`. Parse the result with `parse_str` to get `perma_query_vars`.
   - If nothing matched, `error` remains `'404'`.

4. **Apply `query_vars` filter** to `this.public_query_vars`. This is where plugins add custom query variables to the allowed list.

5. **Build post-type query var map**: For each viewable post type that has a `query_var`, map `queryVar → postType`.

6. **Collect query vars**: For each allowed public query var, check in priority order:
   - `extra_query_vars` (passed programmatically)
   - `$_POST` (but reject if both `$_GET` and `$_POST` have it with different values — security check)
   - `$_GET`
   - `perma_query_vars` (from URL match)

   Non-scalar values are converted to strings (or arrays of strings). If a query var matches a post type's `query_var`, set `post_type` and `name` accordingly.

7. **Taxonomy spaces**: For taxonomies with `query_var`, replace decoded spaces back with `+` in the value.

8. **Enforce publicly queryable**: Remove any `taxonomy` query var pointing to a non-publicly-queryable taxonomy. Remove any `post_type` query var pointing to a non-publicly-queryable post type.

9. **Numeric slug conflict resolution**: Call `wp_resolve_numeric_slug_conflicts()` on the assembled `query_vars`. See Section 12.

10. **Private query vars**: Copy any matching keys from `extra_query_vars` into `query_vars`. (Private vars can only be set programmatically, not via URL.)

11. **Error propagation**: If `error` was set (value `'404'`), put it into `query_vars['error']`.

12. **Apply `request` filter** to `this.query_vars`.

13. **Fire `parse_request` action** with `$this` as the argument (passed by reference).

### `WP::query_posts()`

1. Calls `this.build_query_string()` to serialize `query_vars` into `this.query_string`.
2. Calls `$wp_the_query->query(this.query_vars)` to execute the database query.

### `WP::handle_404()`

Called after `query_posts()`. Determines whether the response should be 200 or 404.

- If `pre_handle_404` filter returns non-false: skips all logic.
- If already 404: returns early.
- **Never 404**: admin pages, robots.txt, favicon.ico requests.
- **200 when posts found**: if `wp_query->posts` is non-empty.
  - Exception: singular posts where `query_vars['page']` exceeds the actual number of `<!--nextpage-->` sections → 404.
  - Exception: `is_posts_page` with a `page` query var → 404.
- **200 even without posts** for: author archives (author exists), tag/category/taxonomy archives (matched object exists), homepage, search, feeds.
- **404 for paged requests** with no posts.
- Everything else: 404.

When setting 404: calls `$wp_query->set_404()`, sends status 404, sends nocache headers.
When setting 200: sends status 200 only.

### `WP::send_headers()`

Called after the query runs. Emits HTTP response headers.

- **Logged-in users**: Adds no-cache headers unconditionally.
- **Moderation hash preview**: Adds short-lived `Expires` + `Cache-Control: max-age=600` headers.
- **Error responses**:
  - 404: adds no-cache headers, sets `Content-Type: text/html; charset=...`
  - 403, 500, 502, 503: sets status and exits immediately (`exit_required = true`).
- **Normal HTML pages**: sets `Content-Type: text/html; charset=...`
- **Feed responses**: sets correct `Content-Type` for the feed format (e.g. `application/rss+xml`), and adds `Last-Modified` + `ETag` headers based on last modified post/comment date. Supports conditional GET (`If-None-Match`, `If-Modified-Since`): returns 304 and exits if the client already has the current version.
- **Singular posts**: adds `X-Pingback` header if the post allows pings; adds no-cache headers for password-protected posts.

After header assembly, applies `wp_headers` filter, sends headers via PHP `header()`, then fires `send_headers` action.

### `WP::register_globals()`

Copies `$wp_query->query_vars` into PHP `$GLOBALS`. Also sets:
- `$GLOBALS['query_string']` = `this.query_string`
- `$GLOBALS['posts']` = `$wp_query->posts` (by reference)
- `$GLOBALS['post']` = `$wp_query->post`
- `$GLOBALS['request']` = `$wp_query->request` (the SQL query string)
- `$GLOBALS['more']` and `$GLOBALS['single']` = 1 if singular
- `$GLOBALS['authordata']` = user object if author archive

---

## 8. WP Class — Public and Private Query Variables

### Public query vars

Public query vars can be set via URL parameters (GET/POST) as well as programmatically. The full default list:

```typescript
const PUBLIC_QUERY_VARS: string[] = [
  'm',              // combined date: YYYYMMDD, YYYYMM, or YYYY
  'p',              // post ID
  'posts',          // not used directly by WP_Query; legacy
  'w',              // week number
  'cat',            // category ID
  'withcomments',   // show posts with comments (feed parameter)
  'withoutcomments',// opposite
  's',              // search query
  'search',         // alias for search
  'exact',          // exact search matching
  'sentence',       // search as sentence
  'calendar',       // calendar widget query
  'page',           // page number within a single post (<!--nextpage--> pagination)
  'paged',          // page number for archive/listing pagination
  'more',           // show full post content
  'tb',             // trackback flag
  'pb',             // pingback flag
  'author',         // author ID
  'order',          // ASC or DESC
  'orderby',        // sort field
  'year',           // 4-digit year
  'monthnum',       // 1-2 digit month
  'day',            // 1-2 digit day
  'hour',           // hour
  'minute',         // minute
  'second',         // second
  'name',           // post slug
  'category_name',  // category slug
  'tag',            // tag slug
  'feed',           // feed type
  'author_name',    // author nicename/slug
  'pagename',       // page slug (hierarchical path)
  'page_id',        // page ID
  'error',          // HTTP error code (e.g. '404')
  'attachment',     // attachment slug
  'attachment_id',  // attachment post ID
  'subpost',        // attachment child slug
  'subpost_id',     // attachment child ID
  'preview',        // preview flag
  'robots',         // robots.txt flag
  'favicon',        // favicon.ico flag
  'taxonomy',       // taxonomy name
  'term',           // term slug
  'cpage',          // comment page number
  'post_type',      // post type name
  'embed',          // embed flag
];
```

Additional public vars are added by:
- `add_rewrite_endpoint()` (automatically adds the endpoint name as a public var)
- `add_rewrite_tag()` (when called without a query arg, auto-adds the tag's name)
- Registered viewable post types that have a `query_var` set
- The `query_vars` filter

### Private query vars

Private query vars can only be set programmatically (via `extra_query_vars` passed to `WP::parse_request()`, or via direct manipulation). They are **never read from `$_GET` or `$_POST`**.

```typescript
const PRIVATE_QUERY_VARS: string[] = [
  'offset',
  'posts_per_page',
  'posts_per_archive_page',
  'showposts',
  'nopaging',
  'post_type',            // also public, but private here allows programmatic override
  'post_status',
  'category__in',
  'category__not_in',
  'category__and',
  'tag__in',
  'tag__not_in',
  'tag__and',
  'tag_slug__in',
  'tag_slug__and',
  'tag_id',
  'post_mime_type',
  'perm',
  'comments_per_page',
  'post__in',
  'post__not_in',
  'post_parent',
  'post_parent__in',
  'post_parent__not_in',
  'title',
  'fields',
];
```

### `add_query_var(qv)` / `remove_query_var(name)`

Adds/removes a string from `public_query_vars`. These are instance methods on the `WP` class (`$wp->add_query_var(...)`). The global `add_rewrite_endpoint()` calls `add_query_var` internally.

### `set_query_var(key, value)`

Directly sets a key-value pair in `this.query_vars`. Used to inject query vars programmatically after parse_request has already run.

---

## 9. WP Class — matched_rule, matched_query, query_string

```typescript
interface WPInstanceState {
  // The raw path extracted from REQUEST_URI or PATH_INFO, with home path prefix stripped.
  // Example: "2024/05/15/my-post-slug"
  request: string;

  // The regex pattern that successfully matched request.
  // Empty string if no rule matched (e.g. plain permalink mode).
  matchedRule: string;

  // The query string template after backreference substitution.
  // Example: "year=2024&monthnum=05&day=15&name=my-post-slug"
  matchedQuery: string;

  // The serialized form of query_vars, built by build_query_string().
  // Used by WP_Query and stored in $GLOBALS['query_string'].
  queryString: string;

  // Whether the permalink processing path was taken (vs. plain query string mode).
  // Set to true when rewrite rules are non-empty, false if the request is for
  // wp-admin/ or if requested_path is empty.
  didPermalink: boolean;

  // The final resolved query vars (merged from URL match, GET, POST, and extra_query_vars).
  queryVars: Record<string, string | string[]>;
}
```

### `build_query_string()`

Iterates `query_vars` and builds a URL-encoded query string. Skips non-scalar values (arrays are not serialized). Values are `rawurlencode`d. The resulting string is stored in `this.query_string`.

The deprecated `query_string` filter is applied if any listeners are registered (this re-parses the string back into `query_vars`).

---

## 10. URL Generation Functions

All URL generators respect the active permalink mode: they emit pretty URLs when `permalink_structure` is set, and fall back to plain `?param=value` query strings when it is not.

### `get_permalink(post, leavename)`

Generates the canonical URL for a post.

- If `post_type = 'page'`: delegates to `get_page_link()`.
- If `post_type = 'attachment'`: delegates to `get_attachment_link()`.
- If `post_type` is a custom (non-built-in) type: delegates to `get_post_permalink()`.
- For `post_type = 'post'`:
  - Gets `permalink_structure` option.
  - Applies `pre_post_link` filter.
  - If structure is set and post is not forced to plain:
    - Resolves `%category%`: uses the post's lowest-term-ID category; traverses parent hierarchy with `/`; falls back to default category.
    - Resolves `%author%`: uses `user_nicename` from post author.
    - Resolves date tokens from `post_date` (parsed as local time, not UTC).
    - Resolves `%postname%` and `%post_id%`.
    - If `leavename = true`, leaves `%postname%` and `%pagename%` unreplaced.
    - Passes through `home_url()`, then `user_trailingslashit(..., 'single')`.
  - If no structure: `home_url('?p=' + post.ID)`.
  - Applies `post_link` filter.

### `get_page_link(post, leavename, sample)`

- If this page is set as `page_on_front`: returns `home_url('/')`.
- Otherwise delegates to `_get_page_link()`.
- Applies `page_link` filter.

**`_get_page_link(post, leavename, sample)`** (internal):
- Gets `get_page_permastruct()`.
- If structure exists and post is not forced plain: replaces `%pagename%` with `get_page_uri(post)` (the full hierarchical slug path), applies `home_url()`, then `user_trailingslashit(..., 'page')`.
- Otherwise: `home_url('?page_id=' + post.ID)`.
- Applies `_get_page_link` filter.

### `get_post_permalink(post, leavename, sample)`

For custom post types:
- Gets the permastruct via `$wp_rewrite->get_extra_permastruct(post.post_type)`.
- If hierarchical, uses `get_page_uri()` for the slug (full path including ancestors).
- Replaces `%{post_type}%` token with the slug.
- Falls back to `?{query_var}={slug}` or `?post_type={type}&p={ID}` if no permastruct.
- Applies `post_type_link` filter.

### `get_attachment_link(post, leavename)`

- If parent post is invalid or post is forced plain: uses `?attachment_id=ID`.
- If parent exists and using pretty permalinks:
  - If parent is a page, uses `_get_page_link()` for the parent URL.
  - Otherwise uses `get_permalink()` for the parent URL.
  - If the attachment slug is numeric or the permalink structure contains `%category%`, prefixes slug with `attachment/`.
  - Appends slug to parent URL, applies `user_trailingslashit`.
- If no parent but using pretty permalinks: uses `home_url(slug/)`.
- Falls back to `?attachment_id=ID`.
- Applies `attachment_link` filter.

### `get_category_link(category)` / `get_tag_link(tag)`

Both delegate to `get_term_link()`, which uses the permastruct for the term's taxonomy. `get_tag_link` simply calls `get_category_link`.

### `get_author_posts_url(authorId, authorNicename)`

- Gets `get_author_permastruct()`.
- If empty: `home_url('/?author=' + authorId)`.
- If set: replaces `%author%` with `authorNicename` (fetches nicename from DB if not provided), applies `home_url()` + `user_trailingslashit()`.
- Applies `author_link` filter.

### `get_year_link(year)`

- Gets `get_year_permastruct()`.
- If set: replaces `%year%` with year, applies `home_url()` + `user_trailingslashit(..., 'year')`.
- Otherwise: `home_url('?m=' + year)`.
- Applies `year_link` filter.

### `get_month_link(year, month)`

- Gets `get_month_permastruct()`.
- If set: replaces `%year%` and `%monthnum%` (zero-padded to 2 digits), applies `home_url()` + `user_trailingslashit(..., 'month')`.
- Otherwise: `home_url('?m=' + year + zeroPad(month, 2))`.
- Applies `month_link` filter.

### `get_day_link(year, month, day)`

- Gets `get_day_permastruct()` (= `get_date_permastruct()`).
- If set: replaces `%year%`, `%monthnum%`, `%day%` (all zero-padded), applies `home_url()` + `user_trailingslashit(..., 'day')`.
- Otherwise: `home_url('?m=' + year + zeroPad(month, 2) + zeroPad(day, 2))`.
- Applies `day_link` filter.

### `get_search_link(query)`

- Gets `get_search_permastruct()`.
- If empty: `home_url('?s=' + urlencode(search))`.
- If set: URL-encodes query (but leaves `/` decoded — `%2F` is converted back to `/`), replaces `%search%`, applies `home_url()` + `user_trailingslashit(..., 'search')`.
- Applies `search_link` filter.

### `get_post_type_archive_link(postType)`

- For `post` type: returns homepage URL or page-for-posts permalink.
- For other types: requires `has_archive` to be truthy on the post type object.
- If `has_archive` is a string, that string is used as the archive slug instead of the rewrite slug.
- Constructs archive URL from `with_front` + slug + `user_trailingslashit`.
- Falls back to `?post_type={type}`.
- Applies `post_type_archive_link` filter.

### `get_feed_link(feed)`

- Gets `get_feed_permastruct()`.
- If feed name contains `comments_`, switches to `get_comment_feed_permastruct()` and strips the `comments_` prefix.
- If feed is the default feed, sets feed to empty string (the `%feed%` token becomes empty).
- Replaces `%feed%`, collapses double slashes, applies `home_url()` + `user_trailingslashit(..., 'feed')`.
- Falls back to `?feed={feedname}`.
- Applies `feed_link` filter.

### `get_pagenum_link(pagenum, escape)`

Generates a paginated URL for an archive/listing.
- Removes existing `paged` query parameter from the current request URL.
- If not using pretty permalinks or in admin: appends `?paged={N}` (or omits for page 1).
- If using pretty permalinks:
  - Strips existing `/{pagination_base}/N/` segment.
  - Strips `index.php` prefix if present.
  - If page > 1: appends `/{pagination_base}/{N}`.
  - Reassembles and applies `user_trailingslashit(..., 'paged')`.
  - Preserves any existing query string.
- Applies `get_pagenum_link` filter.
- Returns escaped URL (via `esc_url`) by default; `sanitize_url` if `escape = false`.

### `get_home_url(blogId, path, scheme)`

Returns the `home` option value (the public-facing URL). Scheme is auto-detected (https if `is_ssl()`). Appends `path` with a leading `/`. Applies `home_url` filter.

### `get_site_url(blogId, path, scheme)`

Returns the `siteurl` option value (where WordPress files are installed; may differ from `home` in subdirectory installs). Appends `path`. Applies `site_url` filter.

### `get_admin_url(blogId, path, scheme)`

Returns `get_site_url(blogId, 'wp-admin/', 'admin')` with optional `path` appended. The `'admin'` scheme respects `force_ssl_admin()` and `is_ssl()`. Applies `admin_url` filter.

---

## 11. Feed Endpoints and URL Patterns

### Built-in feed names

The default recognized feed format names are `feed`, `rdf`, `rss`, `rss2`, and `atom`. `feed` is an alias that maps to the site's default feed (configurable via the `default_feed` option; defaults to `rss2`).

### Feed URL patterns (pretty permalinks)

All feed URLs follow these patterns, where `{base}` is the permastruct root for that content type:

| Context | Pattern (pretty) | Fallback (plain) |
|---|---|---|
| Site-wide | `/feed/` or `/feed/{format}/` | `/?feed={format}` |
| Site-wide (shorthand) | `/{format}/` | — |
| Post-specific | `/{permalink}/feed/{format}/` | `/?feed={format}&p={ID}` |
| Comment feed (site) | `/comments/feed/` or `/comments/feed/{format}/` | `/?feed=comments-{format}` |
| Comment feed (post) | `/{permalink}/feed/comments/` | `/?feed={format}&withcomments=1&p={ID}` |
| Category | `/category/{slug}/feed/{format}/` | `/?feed={format}&cat={ID}` |
| Tag | `/tag/{slug}/feed/{format}/` | `/?feed={format}&tag={slug}` |
| Author | `/author/{nicename}/feed/{format}/` | `/?feed={format}&author={ID}` |
| Search | `/search/{query}/feed/{format}/` | `/?s={query}&feed={format}` |
| Post type archive | `/{archive-slug}/feed/` | `/?post_type={type}&feed={format}` |

### Feed regex components

During rule generation, two feed regex variants are created:
- `feed/(feed|rdf|rss|rss2|atom)/?$` — captures `feed/atom` style
- `(feed|rdf|rss|rss2|atom)/?$` — captures plain `atom` style (shorthand)

Both are added for every permastruct level that includes feed rules. This means `/2024/feed/` and `/2024/rss2/` both work.

### `forcomments` flag

When generating comment feed rules, `forcomments = true` is passed to `generate_rewrite_rules()`. This appends `&withcomments=1` to all feed query strings, instructing `WP_Query` to query comments rather than posts.

---

## 12. Pagination

### Archive/listing pagination

Archive pages use the `paged` query variable. URL form:
- Pretty: `/{archive-path}/{pagination_base}/{N}/` — e.g. `/blog/page/2/`
- Plain: `?paged={N}`

The `pagination_base` property defaults to `'page'`. It appears in rewrite rules as the literal segment before the page number.

### Single post pagination

Single posts support multiple pages via `<!--nextpage-->` markers in post content. This uses the `page` query variable (not `paged`). URL form:
- Pretty: `/{post-permalink}/{N}/` — the page number appended directly after the permalink
- Plain: `?page={N}&p={ID}`

The regex appended in `generate_rewrite_rules()` for permalink-level rules is `(?:/([0-9]+))?/?$`, making the page number optional (page 1 is the default/omitted case).

### Comment pagination

Comment pages use the `cpage` query variable. URL form:
- Pretty: `/{post-permalink}/{comments_pagination_base}-{N}/` — e.g. `/my-post/comment-page-2/`
- Plain: `?cpage={N}&p={ID}`

The `comments_pagination_base` property defaults to `'comment-page'` (note hyphen, not slash).

### `get_pagenum_link()` algorithm

When rebuilding pagination URLs for the current request:
1. Start with the current request URL (minus its `paged` parameter).
2. Strip the home path prefix.
3. Strip any existing `/{pagination_base}/\d+` segment.
4. Strip any leading `index.php/` component.
5. If using index permalinks and (page > 1 or request is non-empty), re-add `index.php`.
6. If page > 1, append `/{pagination_base}/{N}`.
7. Apply `user_trailingslashit`.
8. Re-append any original query string.

### PATHINFO vs index.php mode

When `using_index_permalinks()` returns true:
- `root` = `"index.php/"` (so all structures include `index.php/` prefix)
- `get_pagenum_link()` re-inserts `index.php` into the rebuilt URL
- `url_to_postid()` strips `index.php/` from the URL before matching against rules

When `using_mod_rewrite_permalinks()` returns true:
- `root` = `""`
- The web server rewrites everything to `index.php` before WordPress sees the request

---

## 13. Key Hooks and Filters

### Filters

**`do_parse_request`** — `(bool $continue, WP $wp, string|array $extra_query_vars) → bool`
Fires at the start of `parse_request()`. Return `false` to skip WordPress's routing entirely. Used by REST API and custom routing layers.

**`query_vars`** — `(string[] $vars) → string[]`
Fires during `parse_request()` after matching. Allows adding, removing, or modifying the list of allowed public query variables.

**`request`** — `(array $query_vars) → array`
Fires at the end of `parse_request()` after all query vars have been assembled. Last chance to modify the full set of resolved query variables before `WP_Query` runs.

**`rewrite_rules_array`** — `(Record<string, string> $rules) → Record<string, string>`
Fires at the end of `rewrite_rules()` after the full rule array has been assembled. Can add, remove, or reorder any rules.

**`post_rewrite_rules`** — `(Record<string, string> $rules) → Record<string, string>`
Filters only the rules generated for post permalinks.

**`date_rewrite_rules`** — `(Record<string, string> $rules) → Record<string, string>`
Filters only the rules generated for date archives.

**`root_rewrite_rules`** — `(Record<string, string> $rules) → Record<string, string>`
Filters rules for root-level patterns (homepage pagination and feeds).

**`comments_rewrite_rules`** — `(Record<string, string> $rules) → Record<string, string>`
Filters rules for the global comments feed.

**`search_rewrite_rules`** — `(Record<string, string> $rules) → Record<string, string>`
Filters rules for search archives.

**`author_rewrite_rules`** — `(Record<string, string> $rules) → Record<string, string>`
Filters rules for author archives.

**`page_rewrite_rules`** — `(Record<string, string> $rules) → Record<string, string>`
Filters rules for page post type permalinks.

**`{permastruct_name}_rewrite_rules`** — `(Record<string, string> $rules) → Record<string, string>`
Dynamic filter for each extra permastruct. Common hook names: `category_rewrite_rules`, `post_tag_rewrite_rules`, `post_format_rewrite_rules`.

**`flush_rewrite_rules_hard`** — `(bool $hard) → bool`
Allows suppressing the hard flush (`.htaccess` / `web.config` write). Return `false` to force a soft flush only.

**`mod_rewrite_rules`** — `(string $rules) → string`
Filters the full `.htaccess` rule block before it is written to disk.

**`wp_headers`** — `(Record<string, string> $headers, WP $wp) → Record<string, string>`
Filters the HTTP headers array before they are sent.

**`pre_handle_404`** — `(bool $preempt, WP_Query $query) → bool`
Return non-false to short-circuit the 404 detection logic in `handle_404()`.

**`pre_post_link`** — `(string $permalink, WP_Post $post, bool $leavename) → string`
Filters the permalink structure string before token substitution for `post` type posts.

**`post_link`** — `(string $permalink, WP_Post $post, bool $leavename) → string`
Filters the final URL for `post` type posts.

**`page_link`** — `(string $link, int $postId, bool $sample) → string`
Filters the final URL for pages.

**`post_type_link`** — `(string $link, WP_Post $post, bool $leavename, bool $sample) → string`
Filters the final URL for custom post types.

**`year_link`**, **`month_link`**, **`day_link`** — `(string $link, int $year, ...) → string`
Filter date archive URLs.

**`author_link`** — `(string $link, int $authorId, string $authorNicename) → string`
Filters author archive URLs.

**`search_link`** — `(string $link, string $search) → string`
Filters search archive URLs.

**`post_type_archive_link`** — `(string $link, string $postType) → string`
Filters post type archive URLs.

**`feed_link`** — `(string $output, string $feed) → string`
Filters feed permalink URLs.

**`get_pagenum_link`** — `(string $result, int $pagenum) → string`
Filters paginated archive URLs.

**`home_url`** — `(string $url, string $path, string|null $scheme, int|null $blogId) → string`
**`site_url`** — `(string $url, string $path, string|null $scheme, int|null $blogId) → string`
**`admin_url`** — `(string $url, string $path, int|null $blogId, string|null $scheme) → string`

**`post_link_category`** — `(WP_Term $cat, WP_Term[] $cats, WP_Post $post) → WP_Term`
Selects which category appears in a `%category%` permalink. Default is the category with the lowest term ID.

**`permalink_structure_changed`** (action) — `(string $old, string $new) → void`
Fires after the permalink structure option is updated.

### Actions

**`parse_request`** — `(WP $wp)` (passed by reference)
Fires after `parse_request()` resolves all query vars. The `$wp` instance is live and query vars can still be modified.

**`send_headers`** — `(WP $wp)` (passed by reference)
Fires after all HTTP headers have been sent.

**`generate_rewrite_rules`** — `(WP_Rewrite $wp_rewrite)` (passed by reference)
Fires at the end of `rewrite_rules()`. Allows direct manipulation of the `WP_Rewrite` instance including its `rules` property.

**`wp`** — `(WP $wp)` (passed by reference)
Fires at the end of `WP::main()`, after request parsing, querying, 404 handling, and header sending. The theme template loader hooks into this to identify the correct template.

---

## 14. TypeScript Interface Sketch

```typescript
// EP_* endpoint bitmask constants
export const EP_NONE         = 0;
export const EP_PERMALINK    = 1;
export const EP_ATTACHMENT   = 2;
export const EP_DATE         = 4;
export const EP_YEAR         = 8;
export const EP_MONTH        = 16;
export const EP_DAY          = 32;
export const EP_ROOT         = 64;
export const EP_COMMENTS     = 128;
export const EP_SEARCH       = 256;
export const EP_CATEGORIES   = 512;
export const EP_TAGS         = 1024;
export const EP_AUTHORS      = 2048;
export const EP_PAGES        = 4096;
export const EP_ALL_ARCHIVES = EP_DATE | EP_YEAR | EP_MONTH | EP_DAY | EP_CATEGORIES | EP_TAGS | EP_AUTHORS;
export const EP_ALL          = EP_PERMALINK | EP_ATTACHMENT | EP_ROOT | EP_COMMENTS | EP_SEARCH | EP_PAGES | EP_ALL_ARCHIVES;

// The compiled rewrite rules table: regex → query template
export type RewriteRules = Record<string, string>;

// Permastruct configuration
export interface PermastructArgs {
  withFront: boolean;    // prepend $front (true) or $root (false)
  epMask: number;        // EP_* bitmask
  paged: boolean;        // generate /page/N/ rules
  feed: boolean;         // generate /feed/ rules
  forcomments: boolean;  // make feeds into comment feeds
  walkDirs: boolean;     // generate rules for each intermediate path level
  endpoints: boolean;    // attach registered endpoint suffixes
}

export interface PermastructEntry extends PermastructArgs {
  struct: string;        // fully-resolved pattern string
}

// Endpoint storage
export type EndpointEntry = [epMask: number, name: string, queryVar: string | false];

// WP_Rewrite equivalent
export interface IRewrite {
  // Config
  permalinkStructure: string;
  useTrailingSlashes: boolean;
  front: string;
  root: string;
  index: string;
  matches: string;
  authorBase: string;
  searchBase: string;
  commentsBase: string;
  paginationBase: string;
  commentsPaginationBase: string;
  feedBase: string;
  useVerboseRules: boolean;
  useVerbosePageRules: boolean;

  // Tag tables (three parallel arrays)
  rewritecode: string[];
  rewritereplace: string[];
  queryreplace: string[];

  // Feed names
  feeds: string[];

  // Rule sets
  rules: RewriteRules;
  extraRules: RewriteRules;
  extraRulesTop: RewriteRules;
  nonWpRules: RewriteRules;
  extraPermastructs: Record<string, PermastructEntry>;
  endpoints: EndpointEntry[];

  // Permalink mode detection
  usingPermalinks(): boolean;
  usingIndexPermalinks(): boolean;
  usingModRewritePermalinks(): boolean;

  // Permastruct getters (cached after first call, lazy)
  getDatePermastruct(): string | false;
  getYearPermastruct(): string | false;
  getMonthPermastruct(): string | false;
  getDayPermastruct(): string | false;
  getAuthorPermastruct(): string | false;
  getSearchPermastruct(): string | false;
  getPagePermastruct(): string | false;
  getFeedPermastruct(): string | false;
  getCommentFeedPermastruct(): string | false;
  getCategoryPermastruct(): string | false;
  getTagPermastruct(): string | false;
  getExtraPermastruct(name: string): string | false;

  // Rule generation
  generateRewriteRules(
    permalinkStructure: string,
    epMask?: number,
    paged?: boolean,
    feed?: boolean,
    forcomments?: boolean,
    walkDirs?: boolean,
    endpoints?: boolean
  ): RewriteRules;
  generateRewriteRule(permalinkStructure: string, walkDirs?: boolean): RewriteRules;
  pageRewriteRules(): RewriteRules;
  rewriteRules(): RewriteRules;
  wpRewriteRules(): RewriteRules;  // cached via options table

  // Rule management
  addRule(regex: string, query: string | Record<string, string>, after?: 'top' | 'bottom'): void;
  addExternalRule(regex: string, query: string): void;
  addRewriteTag(tag: string, regex: string, query: string): void;
  removeRewriteTag(tag: string): void;
  addPermastruct(name: string, struct: string, args?: Partial<PermastructArgs>): void;
  removePermastruct(name: string): void;
  addEndpoint(name: string, places: number, queryVar?: string | boolean): void;

  // Flush
  flushRules(hard?: boolean): void;
  setPermalinkStructure(structure: string): void;
  setCategoryBase(base: string): void;
  setTagBase(base: string): void;

  // Mod rewrite output
  modRewriteRules(): string;
  iis7UrlRewriteRules(addParentTags?: boolean): string;

  // Page URI helpers
  pageUriIndex(): [Record<string, number>, Record<string, number>];

  // Backreference helper
  pregIndex(number: number): string;

  // Lifecycle
  init(): void;
}

// WP class equivalent
export interface IWP {
  publicQueryVars: string[];
  privateQueryVars: string[];
  extraQueryVars: Record<string, string | string[]>;
  queryVars: Record<string, string | string[]>;
  queryString: string;
  request: string;
  matchedRule: string;
  matchedQuery: string;
  didPermalink: boolean;

  addQueryVar(qv: string): void;
  removeQueryVar(name: string): void;
  setQueryVar(key: string, value: unknown): void;

  init(): void;
  parseRequest(extraQueryVars?: string | Record<string, string>): boolean;
  queryPosts(): void;
  handle404(): void;
  registerGlobals(): void;
  buildQueryString(): void;
  sendHeaders(): void;
  main(queryArgs?: string | Record<string, string>): void;
}

// URL generation functions
export interface IURLGenerators {
  getPermalink(post: number | WPPost, leavename?: boolean): string | false;
  getPageLink(post: number | WPPost, leavename?: boolean, sample?: boolean): string;
  getPostPermalink(post: number | WPPost, leavename?: boolean, sample?: boolean): string | false;
  getAttachmentLink(post: number | WPPost | null, leavename?: boolean): string;
  getCategoryLink(category: number | WPTerm): string;
  getTagLink(tag: number | WPTerm): string;
  getAuthorPostsUrl(authorId: number, authorNicename?: string): string;
  getYearLink(year: number | false): string;
  getMonthLink(year: number | false, month: number | false): string;
  getDayLink(year: number | false, month: number | false, day: number | false): string;
  getSearchLink(query?: string): string;
  getFeedLink(feed?: string): string;
  getPostTypeArchiveLink(postType: string): string | false;
  getPagenumLink(pagenum?: number, escape?: boolean): string;
  getHomeUrl(blogId?: number | null, path?: string, scheme?: string | null): string;
  getSiteUrl(blogId?: number | null, path?: string, scheme?: string | null): string;
  getAdminUrl(blogId?: number | null, path?: string, scheme?: string): string;
}

// wp_resolve_numeric_slug_conflicts
export function resolveNumericSlugConflicts(
  queryVars: Record<string, string>
): Record<string, string>;

// url_to_postid
export function urlToPostId(url: string): number;
```

---

## 15. Design Patterns to Carry Over

1. **Regex-based routing with a flat ordered list.** There is no trie, radix tree, or named-group system. Rules are an ordered array tried sequentially. The first match wins. Order is therefore significant and must be preserved. More-specific rules must precede more-general ones.

2. **Three parallel arrays form the tag lookup table.** The `rewritecode`, `rewritereplace`, and `queryreplace` arrays are positionally parallel. A tag's regex and query string fragment are looked up by the same index. Adding or removing a tag modifies all three arrays at the same position. This structure is a de-normalized tuple list, not a map — carry this forward as a `Map<string, { regex: string; query: string }>` in TypeScript for O(1) lookup while preserving the parallel-array semantics at the API surface.

3. **Permastruct as a compile step, not a runtime step.** Permastructs are abstract definitions that are expanded into concrete regex rules once and cached. The cache is persisted to the database. Runtime request matching reads the cached rules; it does not re-expand permastructs on every request.

4. **`front` vs `root` — two different anchors.** `front` is the literal prefix of the post permalink structure (may include a custom path like `/blog/`). `root` is either empty (mod_rewrite) or `index.php/` (PATHINFO). Author, date, search, and page structures use `front` to inherit the blog sub-path. Feed, comments, and page structures use `root` because they are always site-root-relative.

5. **Directory walking generates intermediate rules.** The `walkDirs` flag in `generate_rewrite_rules()` creates rules for each path segment. For `/%year%/%monthnum%/%day%/%postname%/`, rules are generated for `/%year%/`, `/%year%/%monthnum%/`, `/%year%/%monthnum%/%day%/`, and the full pattern. This allows archive listing pages to work at every date granularity without separate permastruct definitions.

6. **Verbose page rules are an anti-ambiguity mechanism.** When post permalinks begin with a wildcard tag (e.g. `/%postname%/`), any incoming URL could match both a post and a page. The `use_verbose_page_rules` flag triggers a database check (`get_page_by_path()`) during rule matching to verify the path is actually a real page before accepting it. This check is a runtime database query and has a performance cost — cache it.

7. **Numeric slug conflict resolution is a post-match correction.** When a permalink structure like `/%year%/%postname%/` contains a numeric postname (e.g. `/2024/05/`), the URL is ambiguously parseable as a date archive or a post. `wp_resolve_numeric_slug_conflicts()` runs after query vars are assembled and resolves the ambiguity by looking up the post, checking its publication date, and checking `<!--nextpage-->` pagination. It modifies `query_vars` in place. This is a necessary correctness step, not an optimization.

8. **The `request` filter is the correct extension point.** All manipulation of the final query vars (e.g. adding a query var based on a custom URL segment) should happen via the `request` filter, not by modifying the rewrite rules array or overriding `parse_request`. The filter receives the fully assembled `query_vars` array and can return a modified version.

9. **Trailing slash consistency is enforced by `user_trailingslashit()`.** All URL generators pass through `user_trailingslashit(url, context)` before returning. This function checks `use_trailing_slashes` and `permalink_structure` to decide whether to add or strip a trailing slash based on context. The context string (e.g. `'single'`, `'category'`, `'year'`, `'feed'`) allows per-context overrides via the `user_trailingslashit` filter.

10. **Flush is deferred until `wp_loaded`.** Any flush requested before all plugins and themes have registered their rules (before the `wp_loaded` action) is automatically deferred. This ensures the regenerated rule set is complete. The deferred flush accumulates `hard` flag values: if any call requested a hard flush, the eventual flush will be hard.

11. **Non-WordPress rules bypass the routing engine entirely.** Rules added via `add_external_rule()` go into `non_wp_rules` and are written to `.htaccess` before the WordPress catch-all rule. They are served directly by the web server and never reach `index.php`. This is the correct pattern for static file aliases, proxy rules, and other server-level redirects.

12. **`url_to_postid()` reuses the same matching algorithm.** To reverse a URL back to a post ID, the function runs the same rewrite-rule matching loop as `parse_request()`, then runs `WP_Query` against the extracted query vars. This means any custom rewrite rules that correctly route to a post ID will also work with `url_to_postid()` without any additional implementation.

---

## 16. Tovu Reconstruction Notes

### 16.1 Why this exists

This subsystem exists to turn content metadata and site configuration into stable human-facing URLs. It also provides the reverse mapping from inbound URLs back into query intent, which is why it sits between routing, content querying, and admin permalink settings.

### 16.2 What Tovu should preserve

- A compiled routing/permalink layer instead of rebuilding route logic ad hoc on every request
- Stable, ordered rule evaluation with one canonical URL-resolution path
- Shared forward and reverse URL logic so generated URLs and parsed URLs stay consistent
- Explicit extension points for route/query modification rather than bypassing the routing core

### 16.3 What Tovu can simplify

- Tovu can use a more modern internal router than WordPress's ordered regex array
- Route compilation does not need to leak WordPress's parallel-array rewrite-tag data structure
- Hard flush and web-server file generation can be deferred if Tovu controls its own runtime environment

### 16.4 Possible Tovu seams

- `src/features/routing/` for permalink policy and route compilation
- `src/core/ports/RouteCompilerPort.ts` for compiling content-model definitions into runtime matchers
- `src/core/ports/PermalinkPort.ts` for URL generation
- `src/core/ports/UrlResolutionPort.ts` for reverse resolution from path to content/query intent

### 16.5 Suggested priority

- `V1`: canonical permalink generation, route resolution, and stable route compilation
- `Later`: advanced rewrite editing UX, external-rule support, and deeper compatibility behaviors
