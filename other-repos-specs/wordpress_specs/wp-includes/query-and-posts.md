# Query and Posts — Specification

**Source files analyzed:**
- `wp-includes/class-wp-query.php`
- `wp-includes/class-wp-post.php`
- `wp-includes/post.php`
- `wp-includes/class-wp-post-type.php`
- `wp-includes/revision.php`
- `wp-includes/post-thumbnail-template.php`
- `wp-includes/query.php`

---

## 1. Overview

The post and query system is the content backbone of WordPress. Every piece of displayable content — posts, pages, attachments, navigation menus, reusable blocks, and custom content types — is a row in the `wp_posts` database table, represented in PHP as a `WP_Post` object.

Querying that content always flows through `WP_Query`, a class that accepts a rich set of query parameters, builds a MySQL SELECT statement, executes it, and returns an array of `WP_Post` objects (or IDs). The global `$wp_query` instance represents the current page's main query, determined by the URL. Secondary queries ("sub-queries" or "custom loops") are separate `WP_Query` instances.

Key invariants:

- Every piece of structured content in WordPress is a post. Custom content types are registered post types.
- `WP_Query` is the single, canonical path for reading posts. Direct SQL bypasses caching and hook-driven filtering.
- `wp_insert_post` / `wp_update_post` are the single, canonical paths for writing posts. They trigger all required hooks, cache invalidation, and revision creation.
- The main query is created and executed before any theme template runs. Template files receive it via the global `$wp_query`.

---

## 2. WP_Post Data Type

Every post in the database maps to a `WP_Post` instance. The class is declared `final` and allows dynamic properties (for post meta access via magic `__get`).

```typescript
interface WPPost {
  // --- Core database fields ---
  ID: number;                    // Unsigned integer. Primary key. Auto-increment.
  post_author: string;           // Numeric string. FK to wp_users.ID. '0' if no author.
  post_date: string;             // 'YYYY-MM-DD HH:MM:SS'. Site's local timezone.
  post_date_gmt: string;         // 'YYYY-MM-DD HH:MM:SS'. UTC. '0000-00-00 00:00:00' for floating dates.
  post_content: string;          // Full post body. May contain blocks, shortcodes, HTML.
  post_title: string;            // The display title of the post.
  post_excerpt: string;          // Manually written excerpt. Empty string uses auto-excerpt.
  post_status: PostStatus;       // 'publish'|'draft'|'pending'|'private'|'future'|'trash'|'auto-draft'|'inherit'|string
  comment_status: 'open'|'closed';  // Whether comments are allowed.
  ping_status: 'open'|'closed';     // Whether pingbacks/trackbacks are allowed.
  post_password: string;         // Plaintext password. Empty string = no password.
  post_name: string;             // URL slug. Unique per post_type + post_status scope.
  to_ping: string;               // Newline-separated list of URLs queued to be pinged.
  pinged: string;                // Newline-separated list of URLs already pinged.
  post_modified: string;         // 'YYYY-MM-DD HH:MM:SS'. Last modification. Site local time.
  post_modified_gmt: string;     // 'YYYY-MM-DD HH:MM:SS'. Last modification. UTC.
  post_content_filtered: string; // Utility field. Stores processed/filtered content. Not used by core by default.
  post_parent: number;           // ID of parent post. 0 for top-level. Used by pages, attachments, revisions.
  guid: string;                  // Globally unique identifier. Typically the post's original permalink. Never changes after creation.
  menu_order: number;            // Integer used to order hierarchical posts. Default 0.
  post_type: string;             // Registered post type key. 'post'|'page'|'attachment'|custom slug.
  post_mime_type: string;        // MIME type. Only populated for 'attachment' post type. e.g. 'image/jpeg'.
  comment_count: string;         // Numeric string. Cached count. Updated by wp_update_comment_count().

  // --- Runtime-only field (not in DB column) ---
  filter: 'raw'|'edit'|'db'|'display'|undefined;
  // Tracks the sanitization context of the object's string fields.
  // 'raw'     = fields are as stored in DB, no sanitization applied.
  // 'edit'    = fields are sanitized for editing (admin forms).
  // 'db'      = fields are sanitized for DB insertion.
  // 'display' = fields are sanitized for display (kses, etc.).
  // undefined = unfiltered object, typically freshly constructed.

  // --- Virtual/computed properties (resolved via __get) ---
  ancestors: number[];           // Array of ancestor post IDs (closest first). Hierarchical post types only.
  page_template: string;         // Value of _wp_page_template meta key. Only meaningful for 'page' post type.
  post_category: number[];       // Array of category term IDs the post belongs to.
  tags_input: string[];          // Array of tag names (not IDs) the post belongs to.
  // Any unknown property access falls through to get_post_meta(ID, key, true).
}
```

### Field Details

**`ID`**
Auto-increment primary key. Zero is never a valid post ID. `WP_Post::get_instance()` returns `false` if `$post_id <= 0`.

**`post_author`**
Stored as a numeric string for historical PHP compatibility reasons. The corresponding user may not exist (user deleted). Compare with `absint()`, not strict equality.

**`post_date` / `post_date_gmt`**
Both stored as `YYYY-MM-DD HH:MM:SS` strings, not Unix timestamps. `post_date` is in the site's configured local timezone. `post_date_gmt` is UTC. For `draft` and `pending` posts, `post_date_gmt` is `'0000-00-00 00:00:00'` (a "floating" date — the post has no committed publish time). When the post is published, `post_date_gmt` is set from `post_date` + timezone offset.

**`post_content`**
Unprocessed body content. To get rendered HTML, pass through `apply_filters('the_content', $post->post_content)`. Block-based posts store block delimiters (`<!-- wp:paragraph -->`) in this field.

**`post_status`**
Controls visibility and lifecycle state. See Section 3.

**`post_password`**
Stored in plaintext in the database. When non-empty, the post requires the visitor to enter this password before the content is shown. The cookie-based check is handled by `post_password_required()`.

**`post_name`**
The URL slug. Must be unique within the combination of post_type and publication scope. WordPress auto-generates this from `post_title` if not provided. Sanitized via `sanitize_title()`. Stored URL-encoded for international characters.

**`to_ping` / `pinged`**
Newline-separated URL lists. `to_ping` is consumed by `do_trackbacks()` and moved to `pinged` after pinging.

**`post_content_filtered`**
A spare DB field. Core does not use it for any built-in purpose. Plugins use it to store pre-processed or alternative versions of `post_content` (e.g. the raw markdown before conversion).

**`post_parent`**
`0` for root-level posts. For pages: the ID of the parent page. For attachments: the ID of the post the file was uploaded to. For revisions: the ID of the post being revised. Circular parent relationships are detected and broken by `get_post_ancestors()`.

**`guid`**
Set to the post's permalink at creation time and **never updated**, even if the permalink changes. Used as the post's feed GUID (`<guid>` in RSS). Do not use this as a current URL.

**`menu_order`**
Used by pages and other hierarchical types for manual sort ordering in admin. Default `0`. Queried via `orderby=menu_order`.

**`post_mime_type`**
Only populated for `attachment` post type. Contains the full MIME type string, e.g. `'image/jpeg'`, `'application/pdf'`. Queryable via `post_mime_type` query var.

**`comment_count`**
Denormalized cache of `COUNT(*)` from `wp_comments` for this post. Updated by `wp_update_comment_count_now()`. A numeric string for historical compatibility.

**`filter`**
Not a database column. Tracks the sanitization context the object was last processed through. Methods like `.filter('display')` re-sanitize and return a new instance at that context level.

### `WP_Post::get_instance(postId)`

The canonical factory method. Steps:
1. Cast `$post_id` to int; return `false` if `<= 0`.
2. Check `wp_cache_get($post_id, 'posts')`.
3. If cache miss, run `SELECT * FROM $wpdb->posts WHERE ID = %d LIMIT 1`.
4. If no row, return `false`.
5. `sanitize_post($result, 'raw')`.
6. `wp_cache_add($result->ID, $result, 'posts')`.
7. Return `new WP_Post($result)`.

If the cached object exists but has `filter !== 'raw'`, re-sanitize before returning.

### `WP_Post::filter(context)`

Returns `$this` if already at that context. For `'raw'`, calls `self::get_instance(this.ID)` to get a fresh raw copy from cache/DB. For other contexts, calls `sanitize_post($this, $context)`.

### `WP_Post::to_array()`

Returns all object vars plus the four virtual properties (`ancestors`, `page_template`, `post_category`, `tags_input`) as a plain array.

---

## 3. Post Statuses

Post statuses control visibility, queryability, and lifecycle transitions. Registered via `register_post_status()`.

```typescript
type PostStatus =
  | 'publish'
  | 'future'
  | 'draft'
  | 'pending'
  | 'private'
  | 'trash'
  | 'auto-draft'
  | 'inherit'
  | string;  // custom registered statuses
```

### Built-in Statuses

**`publish`**
- `public: true`
- Visible to all visitors without authentication.
- Returned by default `WP_Query` calls.
- A post transitions to `publish` when `wp_publish_post()` runs.

**`future`**
- `protected: true`
- Used for posts scheduled to publish at a future date.
- Not visible to unauthenticated visitors.
- WordPress cron (`publish_future_post`) checks for posts with `post_status = 'future'` and `post_date <= now` and transitions them to `publish`.
- `post_date_gmt` is set (not floating) for future posts.

**`draft`**
- `protected: true`, `date_floating: true`
- Work in progress. Not publicly visible.
- `post_date_gmt` is `'0000-00-00 00:00:00'` (floating date) unless explicitly set.
- Saving a draft does not commit the publication date.

**`pending`**
- `protected: true`, `date_floating: true`
- Submitted for review. Not publicly visible.
- Typically used with editorial workflow: contributor submits, editor reviews.
- Same floating-date behavior as `draft`.

**`private`**
- `private: true`
- Visible only to logged-in users with capability to read private posts (`read_private_posts`).
- Does not appear in public archives or feeds.
- Does not require a password — it is a capability-gated status.

**`trash`**
- `internal: true`, `show_in_admin_status_list: true`
- Posts moved to trash. Not publicly visible. Not returned by default queries.
- Trashed posts retain their previous status in the `_wp_trash_meta_status` post meta key.
- Trashed posts are permanently deleted after `EMPTY_TRASH_DAYS` (default 30).
- If `EMPTY_TRASH_DAYS === 0`, calling `wp_delete_post()` on a non-attachment immediately force-deletes it instead of trashing.

**`auto-draft`**
- `internal: true`, `date_floating: true`
- Created automatically when the post editor is opened and no post ID is given yet.
- Represents unsaved content. Auto-drafts older than 7 days are cleaned up by `wp_delete_auto_drafts()`.
- Never transitioning through `publish` — they are either promoted to `draft` or deleted.

**`inherit`**
- `internal: true`, `exclude_from_search: false`
- Used by attachments (`post_status = 'inherit'` means the attachment inherits the status of its parent post).
- Also used by revisions.
- `WP_Query` does not return `inherit` posts by default.

### Status Visibility Matrix

| Status | Public queries | Logged-in | Admin only |
|---|---|---|---|
| `publish` | Yes | Yes | No |
| `future` | No | With cap | Yes |
| `draft` | No | With cap | Yes |
| `pending` | No | With cap | Yes |
| `private` | No | read_private_posts | Yes |
| `trash` | No | No | Yes |
| `auto-draft` | No | No | Yes |
| `inherit` | Depends on parent | Depends | Yes |

---

## 4. Post Types

All post types share the `wp_posts` table. The `post_type` column distinguishes them. Built-in types are registered by `create_initial_post_types()` on the `init` action.

### Built-in Post Types

**`post`**
The default content type. Blog posts. Supports: title, editor, author, thumbnail, excerpt, trackbacks, custom-fields, comments, revisions, post-formats. `hierarchical: false`. `public: true`. REST base: `posts`.

**`page`**
Static pages. Supports: title, editor, author, thumbnail, page-attributes, custom-fields, comments, revisions. `hierarchical: true`. `publicly_queryable: false` (pages are queried by slug/ID, not via a `?post_type=page` query var). REST base: `pages`.

**`attachment`**
Media uploads. `post_status` defaults to `inherit`. Supports: title, author, comments. Audio/video attachments additionally support thumbnail. `public: true`, `show_ui: true`. REST base: `media`.

**`revision`**
Immutable snapshots of post content. `public: false`, `can_export: false`. Post name format: `{parent_id}-revision-v{N}` for regular revisions, `{parent_id}-autosave-v1` for autosaves. Never queried by default. Deleted when parent post is deleted.

**`nav_menu_item`**
Individual navigation menu entries. `public: false`. Capabilities tied to `edit_theme_options`. REST base: `menu-items`.

**`custom_css`**
Stores the Customizer's additional CSS. `public: false`. One record per theme (stored by theme slug as `post_name`). Supports: title, revisions.

**`customize_changeset`**
Customizer session state. `public: false`. Supports: title, author.

**`oembed_cache`**
Cached oEmbed responses. `public: false`, `can_export: false`. No supports.

**`user_request`**
GDPR data export/erasure requests. `public: false`, `can_export: false`. No supports.

**`wp_block`**
Reusable block patterns. `public: false`, `show_ui: true`. Supports: title, excerpt, editor, revisions, custom-fields. REST base: `blocks`.

**`wp_template`**
Block-based theme templates (Full Site Editing). `public: false`, `show_in_rest: true`. Supports: title, slug, excerpt, editor, revisions, author. REST base: `templates`.

**`wp_template_part`**
Reusable sections of block templates (headers, footers). `public: false`, `show_in_rest: true`. Supports: title, slug, excerpt, editor, revisions, author. REST base: `template-parts`.

**`wp_global_styles`**
Global styles data for the active theme. `public: false`, `show_in_rest: true`. Supports: title, editor, revisions. Autosave explicitly disabled.

**`wp_navigation`**
Block-based navigation menus. `public: false`, `show_ui: true`, `show_in_rest: true`. Supports: title, editor, revisions. REST base: `navigation`.

**`wp_font_family`** / **`wp_font_face`**
Font management. `public: false`, `show_in_rest: true`. REST base: `font-families` / `font-families/{id}/font-faces`.

### `register_post_type(postType, args)`

Registers a custom post type. Must be called on the `init` action or earlier. Returns a `WP_Post_Type` object on success or `WP_Error` if the post type name is invalid (empty, > 20 chars, or not a valid slug key).

```typescript
interface RegisterPostTypeArgs {
  // Presentation
  label?: string;                  // Singular name shown in menus. Derived from labels.name if omitted.
  labels?: PostTypeLabels;         // Full labels object. See get_post_type_labels().
  description?: string;            // Short description. Default ''.

  // Visibility
  public?: boolean;                // Master switch. Sets defaults for publicly_queryable, show_ui, show_in_nav_menus, exclude_from_search. Default false.
  hierarchical?: boolean;          // Whether posts can have parent posts. Default false.
  exclude_from_search?: boolean;   // Exclude from ?s= searches. Default: opposite of public.
  publicly_queryable?: boolean;    // Allow front-end queries like ?post_type=slug. Default: value of public.
  show_ui?: boolean;               // Generate admin UI. Default: value of public.
  show_in_menu?: boolean | string; // Show in admin menu. String = parent menu slug. Default: value of show_ui.
  show_in_nav_menus?: boolean;     // Available in nav menu builder. Default: value of public.
  show_in_admin_bar?: boolean;     // Appear in the "+ New" admin bar dropdown. Default: value of show_in_menu.
  show_in_rest?: boolean;          // Register REST API endpoints. Default false.
  rest_base?: string;              // REST API endpoint base slug. Default: post type key.
  rest_namespace?: string;         // REST API namespace. Default 'wp/v2'.
  rest_controller_class?: string;  // REST controller class name. Default 'WP_REST_Posts_Controller'.
  revisions_rest_controller_class?: string; // REST controller for revisions. Default 'WP_REST_Revisions_Controller'.
  autosave_rest_controller_class?: string;  // REST controller for autosaves.
  late_route_registration?: boolean; // Register REST routes after revisions/autosaves. Default false.

  // Admin UI
  menu_position?: number | null;   // Position in admin menu. Null = bottom. Default null.
  menu_icon?: string;              // Dashicons class, SVG data URI, or 'none'. Default inherits posts icon.
  register_meta_box_cb?: Function; // Callback to register custom meta boxes for this type.

  // Capabilities
  capability_type?: string | [string, string]; // Base for capability names. Default 'post'. Array form for custom plurals.
  capabilities?: Partial<PostTypeCapabilities>; // Override individual capability names.
  map_meta_cap?: boolean;          // Use WordPress's default meta capability mapping. Default false.

  // Taxonomy
  taxonomies?: string[];           // Taxonomies to register for this type at registration. Default [].

  // Permalink / Rewrite
  has_archive?: boolean | string;  // Enable post type archive. String = archive slug. Default false.
  rewrite?: false | {              // Rewrite rules. false = disable. Default: true (uses post type key as slug).
    slug?: string;                 // URL prefix. Default: post type key.
    with_front?: boolean;          // Prepend blog permalink prefix. Default true.
    feeds?: boolean;               // Feed rewrite rules. Default: value of has_archive.
    pages?: boolean;               // Pagination rewrite rules. Default true.
    ep_mask?: number;              // Endpoint mask. Default EP_PERMALINK.
  };
  query_var?: string | false;      // Query var key. false = disable. Default: post type key.

  // Misc
  supports?: string[] | false;     // Feature list. false = no supports. Common values: 'title', 'editor', 'author', 'thumbnail', 'excerpt', 'revisions', 'page-attributes', 'comments', 'trackbacks', 'custom-fields', 'post-formats'.
  can_export?: boolean;            // Include in WXR exports. Default true.
  delete_with_user?: boolean | null; // Delete posts when user deleted. null = depends on 'author' support. Default null.
  template?: object[];             // Default block template array for new posts.
  template_lock?: 'all' | 'insert' | false; // Lock block template. Default false.

  // Internal (do not use in plugins)
  _builtin?: boolean;
  _edit_link?: string;
}
```

**Post type name constraints:** 1–20 characters, sanitized via `sanitize_key()` (lowercase alphanumeric and hyphens). Reserved names include all built-in types and some WordPress internal slugs.

**Registration fires actions:**
- `registered_post_type` — fires after any type is registered.
- `registered_post_type_{post_type}` — fires after a specific type is registered.

---

## 5. WP_Query — Complete Query Argument Reference

`WP_Query` accepts a flat associative array (or query string) of parameters. After construction, call `get_posts()` or access `$query->posts`.

```typescript
interface WPQueryArgs {
  // --- Single post retrieval ---
  p?: number;                    // Post ID. Overrides all other single-post selectors.
  name?: string;                 // Post slug (post_name). Triggers is_single = true.
  page_id?: number;              // Page ID. Triggers is_page = true.
  pagename?: string;             // Page slug, optionally with parent path: 'parent/child'. Triggers is_page = true.

  // --- Post parent ---
  post_parent?: number;          // Retrieve direct children of this post ID. 0 = only top-level.
  post_parent__in?: number[];    // Array of post IDs to retrieve children from.
  post_parent__not_in?: number[]; // Array of post IDs to exclude children of.

  // --- Post set inclusion/exclusion ---
  post__in?: number[];           // Array of post IDs to include. Sticky posts are prepended even with this set unless ignore_sticky_posts = true.
  post__not_in?: number[];       // Array of post IDs to exclude. Must be a true array — comma strings do NOT work.
  post_name__in?: string[];      // Array of post slugs to match.

  // --- Taxonomy — Category ---
  category_name?: string;        // Category slug (or comma-separated slugs for OR). Includes children.
  cat?: number | string;         // Category ID or comma-separated IDs. Negative ID excludes that category. Includes children.
  category__in?: number[];       // Array of category IDs (OR match, no children).
  category__not_in?: number[];   // Array of category IDs to exclude (no children).
  category__and?: number[];      // Array of category IDs (AND match — post must be in all).

  // --- Taxonomy — Tag ---
  tag?: string;                  // Tag slug. Comma = OR, plus-sign = AND.
  tag_id?: number | string;      // Tag ID or comma-separated IDs.
  tag__in?: number[];            // Array of tag IDs (OR match).
  tag__not_in?: number[];        // Array of tag IDs to exclude.
  tag__and?: number[];           // Array of tag IDs (AND match).
  tag_slug__in?: string[];       // Array of tag slugs (OR match).
  tag_slug__and?: string[];      // Array of tag slugs (AND match).

  // --- Taxonomy — Generic ---
  tax_query?: TaxQueryClause[];  // WP_Tax_Query clauses. Allows querying any taxonomy.

  // --- Author ---
  author?: number | string;      // Author ID or comma-separated IDs (negative excludes).
  author_name?: string;          // Author user_nicename (login slug).
  author__in?: number[];         // Array of author IDs to include.
  author__not_in?: number[];     // Array of author IDs to exclude.

  // --- Search ---
  s?: string;                    // Search keyword(s). Prepend '-' to a term to exclude it. Max 1600 chars.
  exact?: boolean;               // Match whole word only (no LIKE wildcards). Default false.
  sentence?: boolean;            // Treat s as a phrase (exact multi-word match). Default false.
  search_columns?: Array<'post_title' | 'post_excerpt' | 'post_content'>; // Columns to search. Default: all three.

  // --- Post type / status ---
  post_type?: string | string[]; // Post type slug or array of slugs. Special value 'any' = all queryable types.
  post_status?: PostStatus | PostStatus[]; // Post status or array of statuses.
  post_mime_type?: string;       // MIME type filter. Used with attachment post type.

  // --- Pagination ---
  posts_per_page?: number;       // Max posts to return. -1 = all. Default: 'posts_per_page' option (typically 10). 0 is coerced to 1.
  posts_per_archive_page?: number; // Override posts_per_page on archive and search pages.
  nopaging?: boolean;            // Return all posts, disable pagination. Default false.
  paged?: number;                // Current page number for paginated results. Page 1 = first page.
  page?: number;                 // Sub-page within a static front page (<!--nextpage--> splits).
  offset?: number;               // Skip this many posts before the first result. Disables sticky post logic when used.

  // --- Ordering ---
  order?: 'ASC' | 'DESC';        // Sort direction. Default 'DESC'.
  orderby?: OrderbyValue | Record<OrderbyValue, 'ASC' | 'DESC'>; // Sort field(s). Default 'date'. Object form allows multi-key sorting.

  // --- Meta (simple shorthand) ---
  meta_key?: string | string[];  // Meta key or array of keys.
  meta_value?: string | string[]; // Meta value or array of values.
  meta_value_num?: number;       // Meta value as number (for numeric comparison).
  meta_compare?: MetaCompareOp;  // Comparison operator. Default '='.
  meta_compare_key?: string;     // Comparison operator for meta_key matching.
  meta_type?: string;            // MySQL CAST type for meta_value. e.g. 'NUMERIC', 'DATE', 'DATETIME', 'BINARY'.
  meta_type_key?: string;        // MySQL CAST type for meta_key column.

  // --- Meta (complex) ---
  meta_query?: MetaQueryClause[]; // WP_Meta_Query clauses. More powerful than shorthand meta_* vars.

  // --- Date (complex) ---
  date_query?: DateQueryClause[]; // WP_Date_Query clauses. Structured date filtering.

  // --- Date (simple) ---
  year?: number;                 // Four-digit year. e.g. 2024.
  monthnum?: number;             // Month number 1–12.
  w?: number;                    // Week number 0–53.
  day?: number;                  // Day of month 1–31. Combined with monthnum+year, validated as a real date.
  hour?: number;                 // Hour 0–23.
  minute?: number;               // Minute 0–59.
  second?: number;               // Second 0–59.
  m?: string;                    // YearMonthDayHourMinuteSecond. Length determines specificity: 4=year, 6=month, 8=day, 10=hour, 12=minute, 14=second.

  // --- Password ---
  has_password?: boolean;        // true = only password-protected posts. false = only non-protected.
  post_password?: string;        // Match posts with this exact password.

  // --- Comment count ---
  comment_count?: number | { value: number; compare: CompareOp }; // Filter by comment count. Integer = exact match. Object form allows comparison operators.

  // --- Sticky posts ---
  ignore_sticky_posts?: boolean; // Do not prepend sticky posts. Default false.

  // --- Hook suppression ---
  suppress_filters?: boolean;    // Skip most filters (posts_*, post_limits, etc.). Default false. Does NOT skip pre_get_posts.

  // --- Field projection ---
  fields?: '' | 'ids' | 'id=>parent'; // Return type. '' = full WP_Post objects. 'ids' = int[]. 'id=>parent' = {[id]: parent_id}.

  // --- Cache control ---
  update_post_meta_cache?: boolean;  // Prime post meta cache after query. Default true.
  update_post_term_cache?: boolean;  // Prime post term cache after query. Default true.
  update_menu_item_cache?: boolean;  // Prime nav menu item cache. Default false.
  lazy_load_term_meta?: boolean;     // Lazy-load term meta (queue for deferred loading). Default: value of update_post_term_cache.
  no_found_rows?: boolean;           // Skip SQL_CALC_FOUND_ROWS. Disables pagination total count. Default false. Use when total count is not needed (improves performance).
  cache_results?: boolean;           // Cache post objects. Default true.
}

type OrderbyValue =
  | 'none' | 'name' | 'author' | 'date' | 'title' | 'modified'
  | 'menu_order' | 'parent' | 'ID' | 'rand' | 'relevance'
  | 'comment_count' | 'meta_value' | 'meta_value_num'
  | 'post__in' | 'post_name__in' | 'post_parent__in'
  | string;  // meta_query clause array key

type MetaCompareOp = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'LIKE' | 'NOT LIKE'
  | 'IN' | 'NOT IN' | 'BETWEEN' | 'NOT BETWEEN' | 'NOT EXISTS' | 'REGEXP' | 'NOT REGEXP' | 'RLIKE';

type CompareOp = '=' | '!=' | '>' | '>=' | '<' | '<=';
```

### `tax_query` Structure

```typescript
interface TaxQueryClause {
  taxonomy: string;              // Taxonomy slug.
  field?: 'term_id' | 'name' | 'slug' | 'term_taxonomy_id'; // Default 'term_id'.
  terms: number | string | (number | string)[]; // Term IDs, names, or slugs.
  include_children?: boolean;    // Include child terms for hierarchical taxonomies. Default true.
  operator?: 'IN' | 'NOT IN' | 'AND' | 'EXISTS' | 'NOT EXISTS'; // Default 'IN'.
}

// Multiple clauses are combined with a top-level 'relation' key:
// tax_query: [{ relation: 'AND' }, clause1, clause2]
// relation: 'AND' | 'OR'  (default 'AND')
```

### `meta_query` Structure

```typescript
interface MetaQueryClause {
  key?: string;
  value?: string | number | string[];
  compare?: MetaCompareOp;
  type?: 'NUMERIC' | 'BINARY' | 'CHAR' | 'DATE' | 'DATETIME' | 'DECIMAL' | 'SIGNED' | 'TIME' | 'UNSIGNED';
  compare_key?: string;          // Operator for key comparison.
  type_key?: string;             // CAST type for the key column.
}

// Multiple clauses with a relation:
// meta_query: [{ relation: 'OR' }, clause1, clause2]
```

### `date_query` Structure

```typescript
interface DateQueryClause {
  year?: number;
  month?: number;
  week?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
  after?: string | { year?: number; month?: number; day?: number };
  before?: string | { year?: number; month?: number; day?: number };
  inclusive?: boolean;           // Include the boundary dates. Default false.
  compare?: CompareOp;           // Default '='.
  column?: string;               // DB column to compare. Default 'post_date'.
  relation?: 'AND' | 'OR';
}
```

### Default Values Applied by `get_posts()`

- `posts_per_page`: falls back to `get_option('posts_per_page')` if `0` or unset.
- `post_type`: defaults to `''` (all default post types) or `'any'` on search pages.
- `cache_results`: `true`
- `update_post_meta_cache`: `true`
- `update_post_term_cache`: `true`
- `lazy_load_term_meta`: same as `update_post_term_cache`
- `no_found_rows`: `false`
- `ignore_sticky_posts`: `false`
- `suppress_filters`: `false`

### Special `post_type = 'any'`

Queries all post types that have `publicly_queryable = true` (or `exclude_from_search = false` for search). Does not include types with `exclude_from_search = true` or `_builtin` internal types like `revision` and `auto-draft`.

---

## 6. WP_Query Execution Lifecycle

### Phase 1: Construction / `query()`

```typescript
new WP_Query(args)
// Calls: parse_query(args), then get_posts()
```

`WP_Query::query($args)` is equivalent — sets `$this->query` and `$this->query_vars`, then calls `get_posts()`.

### Phase 2: `parse_query()`

1. Resets all `is_*` boolean flags via `init_query_flags()`.
2. Calls `fill_query_vars()` to populate missing keys with empty defaults.
3. Sanitizes and normalizes all query vars (casts `p`, `page_id` etc. to integers, strips invalid characters from `cat`, `author`, etc.).
4. Sets `is_single`, `is_page`, `is_attachment` based on presence of `name`, `p`, `pagename`, `page_id`, `attachment`, `attachment_id`.
5. Sets `is_date`, `is_year`, `is_month`, `is_day`, `is_time` based on date vars.
6. Calls `parse_tax_query()` which sets `is_category`, `is_tag`, `is_tax`.
7. Sets `is_author`, `is_search`, `is_feed`, `is_paged`, `is_preview`, `is_embed`, `is_trackback`.
8. Derives `is_archive` = `is_date || is_author || is_category || is_tag || is_tax || is_post_type_archive`.
9. Derives `is_singular` = `is_single || is_page || is_attachment`.
10. Computes `is_home`: `true` if none of the other contextual flags are set.
11. Handles `page_on_front` / `page_for_posts` corrections.
12. Sets `queried_object` and `queried_object_id` for page/category requests.
13. Fires `do_action_ref_array('parse_query', [&$this])`.
14. Caches `query_vars_hash = md5(serialize(query_vars))`.

### Phase 3: `get_posts()` — SQL Query Building

1. Calls `parse_query()` again (no-op if hash unchanged).
2. Fires `do_action_ref_array('pre_get_posts', [&$this])`.
   - This is the primary hook for modifying query vars before SQL is built.
   - Calls `fill_query_vars()` again in case `pre_get_posts` hooks unset vars.
3. Parses `meta_query` via `WP_Meta_Query::parse_query_vars()`.
4. Builds SQL components: `$where`, `$join`, `$distinct`, `$groupby`, `$limits`, `$orderby`.
   - Posts-per-page and pagination produce a `LIMIT` clause (unless `nopaging = true`).
   - `no_found_rows = false` adds `SQL_CALC_FOUND_ROWS`.
   - `suppress_filters = false` applies filters on each SQL clause: `posts_where`, `posts_join`, `posts_orderby`, `posts_distinct`, `posts_groupby`, `posts_limits`, `posts_fields`.
5. Fires `apply_filters('posts_request', $sql)` for full-query filtering.
6. If `suppress_filters = false`, fires `apply_filters('posts_pre_query', null, &$this)` — returning non-null short-circuits DB execution.
7. Runs the DB query via `$wpdb->get_results()`.
8. Fires `apply_filters('posts_results', $posts, &$this)`.
9. If `suppress_filters = false`, fires `apply_filters('the_posts', $posts, &$this)`.
10. If `no_found_rows = false`, runs `SELECT FOUND_ROWS()` to get `$this->found_posts`, then computes `$this->max_num_pages`.
11. If `cache_results = true`, calls `update_post_caches()` / `_prime_post_caches()`.
12. If `update_post_meta_cache = true`, calls `update_postmeta_cache()`.
13. If `update_post_term_cache = true`, calls `update_object_term_cache()`.
14. Sets `$this->posts`, `$this->post_count`.
15. Returns `$this->posts`.

### Phase 4: The Loop

```typescript
while (query.have_posts()) {
  query.the_post();
  // template code: the_title(), the_content(), etc.
}
```

**`have_posts()`**
- Returns `true` if `current_post + 1 < post_count`.
- When `current_post + 1 === post_count` (just exhausted), fires `do_action_ref_array('loop_end', [&$this])` and calls `rewind_posts()`.
- When `post_count === 0`, fires `do_action('loop_no_results', $this)`.
- Sets `in_the_loop = false` before returning `false`.

**`the_post()`**
- On first call: sets `in_the_loop = true`, `before_loop = false`, fires `loop_start` action.
- Calls `next_post()` to increment `current_post` and retrieve `$this->posts[current_post]`.
- If `fields !== 'all'` (IDs or partial objects were queried), fetches full post via `get_post()`.
- Calls `setup_postdata($post)` which sets the global `$post` and global template tags.

**`rewind_posts()`**
Resets `current_post = -1`. Does not change `$post` global.

**`setup_postdata($post)`**
Sets global `$post` and prepares template tag globals (`$id`, `$authordata`, `$currentday`, `$currentmonth`, `$page`, `$pages`, `$multipage`, `$more`, `$numpages`).

### Phase 5: Reset

**`wp_reset_postdata()`**
Calls `$wp_query->reset_postdata()` which restores `$post` global to `$wp_query->post` (the main query's current post). Must be called after any secondary `WP_Query` loop.

**`wp_reset_query()`**
Replaces `$wp_query` global with `$wp_the_query` (the original main query), then calls `wp_reset_postdata()`. Used to recover from `query_posts()`.

---

## 7. The Main Query and `$wp_query` Global

### How the Main Query Is Set

1. WordPress bootstrap calls `WP::main()` after loading plugins.
2. `WP::parse_request()` reads the current URL, matches rewrite rules, and populates `$wp->query_vars`.
3. `WP::query_posts()` creates `$wp_query = new WP_Query()` and calls `$wp_query->query($wp->query_vars)`.
4. The `$wp_the_query` global is set to this same instance (a copy reference), used by `wp_reset_query()` to restore after `query_posts()` abuse.

### `is_main_query()`

```typescript
function is_main_query(): boolean;
// Returns true if the query currently executing is $wp_the_query.
// Reliable only inside hooks that receive a WP_Query argument (like pre_get_posts).
// Checking: $query === $GLOBALS['wp_the_query']
```

Inside `pre_get_posts`, always use `$query->is_main_query()` rather than the global `is_main_query()`, because the global tests against `$wp_query` (which may already be the secondary query during the hook).

### `pre_get_posts` Action

The central hook for modifying the main query before SQL executes. Fires inside `get_posts()`, after `parse_query()` has set all `is_*` flags, but before SQL is built.

```typescript
add_action('pre_get_posts', (query: WP_Query) => {
  if (query.is_main_query() && query.is_archive()) {
    query.set('posts_per_page', 20);
  }
});
```

**Rules:**
- Receives the `WP_Query` instance by reference — mutate `$query->query_vars` directly or use `$query->set(key, value)`.
- Fires for ALL queries — main and secondary. Always check `is_main_query()` to avoid affecting secondary loops.
- Changes made here are reflected in the SQL and in `$query->query_vars`.
- Setting `posts_per_page`, adding tax_query entries, changing post_status, etc. are all valid.
- Do not return a value — this is an action.

### `WP::query()`

The global function `query_posts($args)` is a shortcut that calls `$wp_query->query($args)`. It replaces the main query object. This is **discouraged** in most contexts — use `pre_get_posts` instead. `query_posts` does not restore the original query automatically; `wp_reset_query()` is required.

---

## 8. Post CRUD

### `wp_insert_post(postarr, wpError?, fireAfterHooks?)`

The canonical function for creating and updating posts. When `postarr['ID']` is set, it updates the existing post. When omitted, it creates a new one.

```typescript
function wp_insert_post(
  postarr: WPInsertPostArgs,
  wpError?: boolean,      // Default false. If true, return WP_Error instead of 0 on failure.
  fireAfterHooks?: boolean // Default true. If false, skip post-insert hooks (used by autosave).
): number | WP_Error;
// Returns: new post ID on success, 0 or WP_Error on failure.
```

```typescript
interface WPInsertPostArgs {
  ID?: number;                    // Set to update existing post. Omit or 0 to create.
  post_author?: number;           // Default: current user ID.
  post_date?: string;             // 'YYYY-MM-DD HH:MM:SS' local time. Default: current time.
  post_date_gmt?: string;         // 'YYYY-MM-DD HH:MM:SS' UTC. Computed from post_date if omitted.
  post_content?: string;          // Default ''.
  post_content_filtered?: string; // Default ''.
  post_title?: string;            // Default ''.
  post_excerpt?: string;          // Default ''.
  post_status?: PostStatus;       // Default 'draft'.
  post_type?: string;             // Default 'post'.
  comment_status?: 'open'|'closed'; // Default: site's default_comment_status option.
  ping_status?: 'open'|'closed';  // Default: site's default_ping_status option.
  post_password?: string;         // Default ''.
  post_name?: string;             // Slug. Auto-generated from post_title if omitted.
  to_ping?: string;               // Newline-separated URLs.
  pinged?: string;                // Newline-separated URLs.
  post_parent?: number;           // Default 0.
  menu_order?: number;            // Default 0.
  guid?: string;                  // Only set on new posts; ignored on update.
  import_id?: number;             // Use a specific ID for imported posts. Default 0.
  post_mime_type?: string;        // For attachments.
  tags_input?: string | string[]; // Comma-separated or array of tag names.
  post_category?: number[];       // Array of category IDs.
  tax_input?: Record<string, number[] | string[]>; // Taxonomy → terms map for other taxonomies.
  meta_input?: Record<string, any>; // Key → value map of post meta to set after insert.
  page_template?: string;         // For pages: the _wp_page_template meta value.
  context?: string;               // Context string used in hooks.
}
```

**Internal execution sequence:**
1. Merge defaults; sanitize via `sanitize_post($postarr, 'db')`.
2. If `ID` is set and post not found, return `0` / `WP_Error`.
3. Apply `wp_insert_post_empty_content` filter; abort if empty content detected (for supported types).
4. Normalize `post_status` (attachments forced to `inherit` unless private/trash/auto-draft).
5. Set default category if `post_category` is empty and post type supports categories.
6. Generate `post_name` slug if not provided, ensure uniqueness via `wp_unique_post_slug()`.
7. Handle `future` status: if `post_date` is in the past, promote to `publish`.
8. Fire `wp_insert_post_data` filter to allow last-minute data manipulation.
9. Run DB INSERT or UPDATE.
10. If `post_status` changed from `future` to `publish` (or vice versa), schedule/unschedule cron for `publish_future_post`.
11. Set taxonomies via `wp_set_post_terms()`.
12. Set post meta via `update_post_meta()` for each `meta_input` entry.
13. Invalidate caches: `clean_post_cache($post_id)`.
14. Fire `save_post_{post_type}` action.
15. Fire `save_post` action.
16. Fire `wp_insert_post` action.
17. If `fireAfterHooks = true`, fire `wp_after_insert_post` action (which also saves revisions via `wp_save_post_revision_on_insert`).

### `wp_update_post(postarr, wpError?, fireAfterHooks?)`

Thin wrapper over `wp_insert_post` for updates. Requires `postarr['ID']`. Steps:
1. Fetch existing post as `ARRAY_A`.
2. Escape fetched data via `wp_slash()`.
3. Merge: existing fields overwritten by provided fields.
4. Pass merged array to `wp_insert_post()`.

For attachment post types, delegates to `wp_insert_attachment()` instead.

Drafts/pending/auto-draft posts have their `post_date` set to `current_time('mysql')` on update unless `edit_date = true` is passed (to commit a specific date).

### `wp_delete_post(postId, forceDelete?)`

```typescript
function wp_delete_post(
  postId: number,
  forceDelete?: boolean  // Default false. If false, trashable post types go to trash first.
): WP_Post | false | null;
```

**Behavior:**
- If `forceDelete = false` AND post type is `post`/`page` AND current status is not already `trash` AND `EMPTY_TRASH_DAYS > 0`: delegates to `wp_trash_post()`.
- For attachments: delegates to `wp_delete_attachment()`.
- The `pre_delete_post` filter can short-circuit (return non-null to prevent deletion).
- Before deletion: fires `before_delete_post` action.
- Deletes term relationships, revisions (via `wp_delete_post_revision`), comments.
- For hierarchical types: re-parents children to the deleted post's parent.
- Re-parents attachments to the deleted post's parent.
- Removes from `sticky_posts` option if sticky.
- Deletes the DB row.
- Clears all caches.
- Fires `delete_post` action, then `deleted_post` action.
- Returns the `WP_Post` object of the deleted post on success, `false` or `null` on failure.

### `wp_trash_post(postId)`

```typescript
function wp_trash_post(postId: number): WP_Post | false;
```

- If `EMPTY_TRASH_DAYS === 0`, immediately calls `wp_delete_post($postId, true)`.
- Returns `false` if post not found or already in trash.
- Saves pre-trash status in `_wp_trash_meta_status` post meta.
- Saves trash timestamp in `_wp_trash_meta_time` post meta.
- Fires `wp_trash_post` action (before status change).
- Updates post status to `'trash'` via `wp_update_post()`.
- Trashes post's comments via `wp_trash_post_comments()`.
- Fires `trashed_post` action.

### `wp_untrash_post(postId)`

```typescript
function wp_untrash_post(postId: number): WP_Post | false | null;
```

- Returns `false` if post status is not `trash`.
- Reads `_wp_trash_meta_status` to get original status.
- Since WordPress 5.6: untrashed posts default to `'draft'` status, not the previous status (unless filtered).
- The `wp_untrash_post_status` filter controls what status is restored.
- Fires `before_untrash_post`, then `untrashed_post` actions.
- Deletes `_wp_trash_meta_status` and `_wp_trash_meta_time` meta.
- Restores post's comments.

### `get_post(post?, output?, filter?)`

```typescript
function get_post(
  post?: number | WP_Post | object | null,
  output?: 'OBJECT' | 'ARRAY_A' | 'ARRAY_N',  // Default OBJECT
  filter?: 'raw' | 'edit' | 'db' | 'display'   // Default 'raw'
): WP_Post | object | null;
```

- If `$post` is empty, falls back to global `$post`.
- If `$post` is already a `WP_Post`, returns it (after re-sanitizing if not 'raw').
- If `$post` is an object with no `filter`, sanitizes as 'raw' and wraps in `WP_Post`.
- Otherwise calls `WP_Post::get_instance($post)` (integer ID path).
- Returns `null` if not found.
- `ARRAY_A` output calls `$post->to_array()`.
- `ARRAY_N` returns `array_values($post->to_array())`.

### `get_posts(args?)`

```typescript
function get_posts(args?: Partial<WPQueryArgs> & {
  numberposts?: number;   // Alias for posts_per_page. Default 5.
  category?: number;      // Alias for cat.
  include?: number[];     // Alias for post__in. Forces posts_per_page to match count.
  exclude?: number[];     // Alias for post__not_in.
}): WP_Post[];
```

Convenience wrapper over `WP_Query`. Key differences from direct `WP_Query`:
- Default `post_type = 'post'`.
- Default `suppress_filters = true` (filters are suppressed).
- Always sets `ignore_sticky_posts = true`.
- Always sets `no_found_rows = true` (no pagination totals).
- Default `post_status` depends on post type: `'inherit'` for attachments, `'publish'` for all others.
- Returns the array directly, not the query object.

---

## 9. Post Meta Shortcuts

Post meta (custom fields) is stored in `wp_postmeta`. Each row is: `meta_id`, `post_id`, `meta_key`, `meta_value`. A post can have multiple rows with the same `meta_key` (multi-value meta).

### `add_post_meta(postId, metaKey, metaValue, unique?)`

```typescript
function add_post_meta(
  postId: number,
  metaKey: string,
  metaValue: any,         // Arrays/objects serialized. false → ''. true → '1'. Numbers → string.
  unique?: boolean        // Default false. If true, abort if key already exists.
): number | false;
// Returns: new meta_id on success, false on failure.
```

- If `postId` is a revision ID, redirects to the parent post ID.
- Delegates to `add_metadata('post', postId, metaKey, metaValue, unique)`.
- Meta key and value are expected to be slashed (escaped) on input for historical reasons. In practice, use literal values; the slashing layer handles escaping.

### `update_post_meta(postId, metaKey, metaValue, prevValue?)`

```typescript
function update_post_meta(
  postId: number,
  metaKey: string,
  metaValue: any,
  prevValue?: any  // If provided, only update rows where meta_value matches prevValue.
): number | true | false;
// Returns: meta_id (int) if inserted as new. true if updated. false if no change or failure.
```

- If the key does not exist, inserts it (acts like `add_post_meta`).
- If `prevValue` is provided, only the matching row is updated (useful for multi-value keys).
- Fires `update_post_meta` and `updated_post_meta` actions.

### `get_post_meta(postId, key?, single?)`

```typescript
function get_post_meta(
  postId: number,
  key?: string,       // If empty string '', returns all meta as { [key]: value[] }.
  single?: boolean    // Default false. If true, return the first value (not an array).
): any;
// Returns:
//   key + single=true  → scalar value or '' if not found
//   key + single=false → array of values (may be empty [])
//   key=''             → { [metaKey]: string[] } — all meta for the post
```

- Retrieves from object cache first (`wp_cache_get(postId, 'post_meta')`).
- Unserialized automatically on retrieval.
- Keys beginning with `_` are "protected" (not shown as public custom fields in the editor).

### `delete_post_meta(postId, metaKey, metaValue?)`

```typescript
function delete_post_meta(
  postId: number,
  metaKey: string,
  metaValue?: any   // Default ''. If provided, only delete rows matching this value.
): boolean;
```

- If `metaValue` is empty, deletes **all** rows for that key on the post.
- If `metaValue` is provided, only deletes rows with matching value (for multi-value keys).
- If `postId` is a revision, redirects to parent post.
- Fires `delete_post_meta` and `deleted_post_meta` actions.

---

## 10. Sticky Posts

Sticky posts are prepended to the front page archive above all other posts, regardless of publication date. The sticky list is stored as a flat array of post IDs in the `sticky_posts` site option.

### `stick_post(postId)`

```typescript
function stick_post(postId: number): void;
```

- Reads `get_option('sticky_posts')` → array.
- If `postId` is not already in the array, appends it and calls `update_option('sticky_posts', ...)`.
- Fires `post_stuck` action if the option was updated.
- Idempotent: calling twice has no effect.

### `unstick_post(postId)`

```typescript
function unstick_post(postId: number): void;
```

- Reads `get_option('sticky_posts')`.
- If `postId` is in the array, removes it and calls `update_option('sticky_posts', ...)`.
- Fires `post_unstuck` action if the option was updated.

### `is_sticky(postId?)`

```typescript
function is_sticky(postId?: number): boolean;
// postId defaults to global $post->ID.
```

- Returns `true` if `postId` is in `get_option('sticky_posts')`.

### Sticky Logic in `WP_Query`

When `ignore_sticky_posts = false` (the default) and the query is for the main blog posts page (or when sticky posts should be shown):

1. At the start of `get_posts()`, WordPress reads `get_option('sticky_posts')`.
2. Sticky post IDs are prepended to the result set even if they wouldn't otherwise match the query.
3. However, if `post__in` is specified, stickies are only included if they are in `post__in`.
4. If `offset` is non-zero, sticky post prepending is disabled.
5. Setting `ignore_sticky_posts = true` (as `get_posts()` always does) suppresses all sticky behavior.

---

## 11. Post Revisions

Revisions are `WP_Post` objects with `post_type = 'revision'` stored in the `wp_posts` table as children (`post_parent`) of the post being revised.

### Revision Naming

- Regular revision: `post_name = '{parent_id}-revision-v{N}'`
- Autosave: `post_name = '{parent_id}-autosave-v1'` (only one autosave per user per post)

### `wp_save_post_revision(postId)`

```typescript
function wp_save_post_revision(postId: number): number | WP_Error | void;
// Returns new revision ID on success, void/0 on no-op (nothing changed, or revisions disabled).
```

**Conditions that prevent saving:**
- `DOING_AUTOSAVE` constant is defined.
- Post type does not support `'revisions'`.
- Post status is `'auto-draft'`.
- `wp_revisions_enabled($post)` returns false (can be filtered).

**Change detection:**
1. Retrieves most recent non-autosave revision.
2. Compares revisioned fields (controlled by `_wp_post_revision_fields()`): `post_title`, `post_content`, `post_excerpt`.
3. If none of the revisioned fields changed (after `normalize_whitespace()`), skips saving unless the `wp_save_post_revision_check_for_changes` filter returns false.

**Revision limit enforcement:**
1. After saving, calls `wp_revisions_to_keep($post)` which reads `WP_POST_REVISIONS` constant.
2. If the limit is `0`, no revisions are kept (deletes all).
3. If the limit is `-1` (or `true`), unlimited revisions are kept.
4. Otherwise, oldest revisions beyond the limit are deleted. Autosaves are preserved.

### `WP_POST_REVISIONS` Constant

Controls the maximum number of revisions per post. Set in `wp-config.php`:

```php
define('WP_POST_REVISIONS', 5);   // Keep last 5 revisions
define('WP_POST_REVISIONS', 0);   // Disable revisions
define('WP_POST_REVISIONS', true); // Keep all revisions (default)
```

The `wp_revisions_to_keep` filter can override per-post.

### `wp_get_post_revisions(post?, args?)`

```typescript
function wp_get_post_revisions(
  post?: number | WP_Post,
  args?: {
    order?: 'ASC' | 'DESC';        // Default 'DESC' (newest first).
    orderby?: string;              // Default 'date ID'.
    check_enabled?: boolean;       // Check wp_revisions_enabled() before querying. Default true.
  }
): WP_Post[];
// Returns array keyed by revision ID. Empty array if revisions disabled or post not found.
```

- Queries `post_type = 'revision'`, `post_status = 'inherit'`, `post_parent = postId`.
- Uses `get_children()` internally.

### `wp_restore_post_revision(revision, fields?)`

```typescript
function wp_restore_post_revision(
  revision: number | WP_Post,
  fields?: string[]  // Field names to restore. Default: all revisioned fields.
): number | WP_Error | false;
// Returns the parent post ID on success.
```

1. Fetches revision as `ARRAY_A`.
2. Extracts revisioned field values from the revision.
3. Sets `ID = revision.post_parent` (the parent post's ID).
4. Calls `wp_update_post()` with the revision's field values.
5. Updates `_edit_last` meta on the parent post.
6. Fires `wp_restore_post_revision` action.

### Revision Meta (WordPress 6.4+)

Post meta fields can opt into revision tracking by registering with `'revisions_enabled' => true` in `register_meta()`. On revision restore, `wp_restore_post_revision_meta()` copies the meta values from the revision post to the parent post.

---

## 12. Post Thumbnails (Featured Images)

The featured image (thumbnail) is stored as the `_thumbnail_id` post meta key, whose value is the attachment post ID of the image.

Theme support must be declared via `add_theme_support('post-thumbnails')` for featured images to be functional.

### `set_post_thumbnail(post, thumbnailId)`

```typescript
function set_post_thumbnail(
  post: number | WP_Post,
  thumbnailId: number
): number | true | false;
```

- Verifies both `post` and `thumbnail_id` exist via `get_post()`.
- Verifies the attachment has a displayable image via `wp_get_attachment_image()`.
- If valid: `update_post_meta(post.ID, '_thumbnail_id', thumbnailId)`.
- If `wp_get_attachment_image()` returns empty (not a valid image): `delete_post_meta(post.ID, '_thumbnail_id')`.
- Returns `false` if post or thumbnail do not exist.

### `get_post_thumbnail_id(post?)`

```typescript
function get_post_thumbnail_id(post?: number | WP_Post): number | string | false;
// Returns the attachment ID stored in _thumbnail_id meta, or '' if not set, or false if no post.
```

Pass through `apply_filters('post_thumbnail_id', $thumbnailId, $post)` before returning.

### `has_post_thumbnail(post?)`

```typescript
function has_post_thumbnail(post?: number | WP_Post): boolean;
```

- Calls `get_post_thumbnail_id()`.
- Returns `(bool) apply_filters('has_post_thumbnail', $hasThumbnail, $post, $thumbnailId)`.
- Returns `false` if no thumbnail ID or theme does not support `'post-thumbnails'`.

### `the_post_thumbnail(size?, attr?)`

```typescript
function the_post_thumbnail(
  size?: string | number[],  // Default 'post-thumbnail'. Image size name or [width, height].
  attr?: string | object     // Additional img attributes.
): void;
// Echoes the result of get_the_post_thumbnail().
```

### `get_the_post_thumbnail(post?, size?, attr?)`

Returns the full `<img>` HTML tag for the post's featured image, or `''` if none exists.

- Size `'post-thumbnail'` corresponds to the size registered by the theme (typically 150×150 or theme-specific).
- Passes through `apply_filters('post_thumbnail_html', $html, $postId, $postThumbnailId, $size, $attr)`.

---

## 13. Post Password Protection

Password-protected posts have a non-empty `post_password` field. Visitors must enter the correct password to see the content.

### `post_password_required(post?)`

```typescript
function post_password_required(post?: number | WP_Post): boolean;
```

**Logic:**
1. If `post->post_password` is empty, return `false` immediately (passes through `post_password_required` filter).
2. If the WordPress password cookie (`wp-postpass_{COOKIEHASH}`) is not set, return `true`.
3. Hash the entered password via `wp_hash_password()`.
4. Compare with the stored hash in the cookie.
5. Return `false` if match (user has entered the correct password), `true` if mismatch.
6. The result is passed through `apply_filters('post_password_required', $required, $post)`.

The cookie is set with `wp-postpass_{COOKIEHASH}` name where `COOKIEHASH` is a site-specific constant.

### `get_the_password_form(post?)` / `the_password_form()`

```typescript
function get_the_password_form(post?: number | WP_Post): string;
// Returns the HTML password form.
function the_password_form(post?: number | WP_Post): void;
// Echoes get_the_password_form().
```

Returns an HTML `<form>` that posts to the current URL with the password. The form output passes through `apply_filters('the_password_form', $output, $post, $invalidPassword)`.

**Template integration:** `the_content()` and `the_excerpt()` check `post_password_required()` and replace the content with the password form if the post is protected and the user hasn't authenticated.

---

## 14. Key Hooks and Filters

### `pre_get_posts`

**Type:** Action
**Signature:** `(query: WP_Query) => void`
**Fires:** Inside `WP_Query::get_posts()`, after `parse_query()`, before SQL is built.
**Purpose:** Modify any query var before the database is hit. The primary extension point for changing what posts are retrieved on any page.

```typescript
add_action('pre_get_posts', (query) => {
  if (query.is_main_query() && !query.is_admin && query.is_home()) {
    query.set('posts_per_page', 20);
    query.set('post_type', ['post', 'announcement']);
  }
});
```

**Rules:** Always guard with `is_main_query()` unless intentionally affecting all queries.

---

### `the_posts`

**Type:** Filter
**Signature:** `(posts: WP_Post[], query: WP_Query) => WP_Post[]`
**Fires:** Inside `get_posts()`, after DB query, before caching.
**Purpose:** Modify, add to, or replace the fetched post array.
**Suppressed by:** `suppress_filters = true`.

---

### `found_posts`

**Type:** Filter
**Signature:** `(foundPosts: number, query: WP_Query) => number`
**Fires:** After `SELECT FOUND_ROWS()` returns a value.
**Purpose:** Override the total found-posts count (used for pagination calculation).

---

### `posts_results`

**Type:** Filter
**Signature:** `(posts: WP_Post[], query: WP_Query) => WP_Post[]`
**Fires:** Just before `the_posts` filter.
**Purpose:** First opportunity to inspect/modify the raw DB result.

---

### `the_content`

**Type:** Filter
**Signature:** `(content: string) => string`
**Fires:** When `the_content()` or `apply_filters('the_content', $content)` is called.
**Purpose:** Process the raw `post_content` into display HTML. Core registers at priority 10: `wptexturize`, `convert_smilies`, `wpautop`, `shortcode_unautop`, `do_shortcode`. Blocks are rendered by `do_blocks` at priority 9.

**Important:** Never call `the_content()` outside the loop without first setting the global `$post`. Always pass the content explicitly: `apply_filters('the_content', $post->post_content)`.

---

### `the_excerpt`

**Type:** Filter
**Signature:** `(excerpt: string) => string`
**Fires:** When `the_excerpt()` is called.
**Purpose:** Process the excerpt. Core registers: `wptexturize`, `convert_smilies`, `wpautop`.
If `post_excerpt` is empty, auto-generates from `post_content` via `wp_trim_excerpt()`.

---

### `save_post`

**Type:** Action
**Signature:** `(postId: number, post: WP_Post, update: boolean) => void`
**Fires:** At the end of `wp_insert_post()`, after the post is inserted/updated and taxonomies/meta are set.
**Guards:** This fires for every `wp_insert_post` call including autosaves and revisions. Check `wp_is_post_revision($postId)` and `wp_is_post_autosave($postId)` to skip those.

```typescript
add_action('save_post', (postId, post, update) => {
  if (wp_is_post_revision(postId) || wp_is_post_autosave(postId)) return;
  // safe to act on the saved post
});
```

---

### `save_post_{post_type}`

**Type:** Action
**Signature:** `(postId: number, post: WP_Post, update: boolean) => void`
**Fires:** Just before `save_post`. Same semantics but scoped to a specific post type.

---

### `wp_insert_post`

**Type:** Action
**Signature:** `(postId: number, post: WP_Post, update: boolean, unsanitizedPostarr: object) => void`
**Fires:** After `save_post`. Receives the original, pre-sanitized postarr as the fourth argument.

---

### `delete_post`

**Type:** Action
**Signature:** `(postId: number, post: WP_Post) => void`
**Fires:** Inside `wp_delete_post()`, after all related data (terms, comments, revisions, meta) are deleted, but before the post row itself is deleted.

---

### `trash_post`

**Type:** Action
**Signature:** `(postId: number, previousStatus: string) => void`
**Fires:** Inside `wp_trash_post()`, before the status is changed to `'trash'`.

---

### `trashed_post`

**Type:** Action
**Signature:** `(postId: number, previousStatus: string) => void`
**Fires:** After the post has been successfully moved to trash.

---

### `post_updated`

**Type:** Action
**Signature:** `(postId: number, postAfter: WP_Post, postBefore: WP_Post) => void`
**Fires:** When a post is updated (not on first insert). Provides the before and after post objects. Used by the revision system: `wp_save_post_revision` is hooked here at default priority.

---

### SQL Fragment Filters (all suppressed by `suppress_filters = true`)

| Filter | Signature | Controls |
|---|---|---|
| `posts_where` | `(where, query) => string` | WHERE clause |
| `posts_join` | `(join, query) => string` | JOIN clauses |
| `posts_orderby` | `(orderby, query) => string` | ORDER BY clause |
| `posts_distinct` | `(distinct, query) => string` | DISTINCT keyword |
| `posts_groupby` | `(groupby, query) => string` | GROUP BY clause |
| `posts_limits` | `(limits, query) => string` | LIMIT clause |
| `posts_fields` | `(fields, query) => string` | SELECT field list |
| `posts_request` | `(sql, query) => string` | Full SQL string (last chance before execution) |
| `posts_pre_query` | `(null, query) => WP_Post[]|null` | Short-circuit DB; return array to skip query |

---

## 15. TypeScript Interface Sketch

```typescript
// ---- Post types ----

type PostStatus = 'publish' | 'future' | 'draft' | 'pending' | 'private'
  | 'trash' | 'auto-draft' | 'inherit' | string;

interface WPPost {
  ID: number;
  post_author: string;
  post_date: string;
  post_date_gmt: string;
  post_content: string;
  post_title: string;
  post_excerpt: string;
  post_status: PostStatus;
  comment_status: 'open' | 'closed';
  ping_status: 'open' | 'closed';
  post_password: string;
  post_name: string;
  to_ping: string;
  pinged: string;
  post_modified: string;
  post_modified_gmt: string;
  post_content_filtered: string;
  post_parent: number;
  guid: string;
  menu_order: number;
  post_type: string;
  post_mime_type: string;
  comment_count: string;
  filter?: 'raw' | 'edit' | 'db' | 'display';
  // Virtual/magic properties:
  ancestors?: number[];
  page_template?: string;
  post_category?: number[];
  tags_input?: string[];
  [metaKey: string]: any;
}

// ---- WP_Query result state ----

interface WPQueryState {
  // Input
  query: Record<string, any>;
  query_vars: Record<string, any>;

  // Output — post list
  posts: WPPost[] | number[];
  post_count: number;
  found_posts: number;
  max_num_pages: number;
  request: string;               // The SQL string that ran

  // Output — current loop position
  current_post: number;          // -1 before loop, increments in the_post()
  post: WPPost | null;           // Current post in loop
  in_the_loop: boolean;
  before_loop: boolean;

  // Output — query type flags
  is_single: boolean;
  is_page: boolean;
  is_attachment: boolean;
  is_singular: boolean;
  is_archive: boolean;
  is_date: boolean;
  is_year: boolean;
  is_month: boolean;
  is_day: boolean;
  is_time: boolean;
  is_author: boolean;
  is_category: boolean;
  is_tag: boolean;
  is_tax: boolean;
  is_search: boolean;
  is_feed: boolean;
  is_comment_feed: boolean;
  is_home: boolean;
  is_posts_page: boolean;
  is_post_type_archive: boolean;
  is_preview: boolean;
  is_paged: boolean;
  is_admin: boolean;
  is_404: boolean;
  is_embed: boolean;
  is_robots: boolean;
  is_favicon: boolean;
  is_privacy_policy: boolean;
  is_trackback: boolean;

  // Sub-query objects
  tax_query: WPTaxQuery | null;
  meta_query: WPMetaQuery | false;
  date_query: WPDateQuery | false;

  // Queried object
  queried_object: WPPost | WPTerm | WPPostType | WPUser | null;
  queried_object_id: number;
}

interface WPQueryMethods {
  // Construction
  query(args: Partial<WPQueryArgs>): WPPost[] | number[];

  // Parsing
  parse_query(query?: string | Record<string, any>): void;
  fill_query_vars(queryVars: Record<string, any>): Record<string, any>;

  // Execution
  get_posts(): WPPost[] | number[];

  // Loop control
  have_posts(): boolean;
  the_post(): void;
  rewind_posts(): void;
  setup_postdata(post: WPPost): boolean;
  reset_postdata(): void;

  // Var access
  get(queryVar: string, defaultValue?: any): any;
  set(queryVar: string, value: any): void;

  // Context check
  is_main_query(): boolean;
}

// ---- Post CRUD ----

interface PostInsertArgs {
  ID?: number;
  post_author?: number;
  post_date?: string;
  post_date_gmt?: string;
  post_content?: string;
  post_content_filtered?: string;
  post_title?: string;
  post_excerpt?: string;
  post_status?: PostStatus;
  post_type?: string;
  comment_status?: 'open' | 'closed';
  ping_status?: 'open' | 'closed';
  post_password?: string;
  post_name?: string;
  to_ping?: string;
  pinged?: string;
  post_parent?: number;
  menu_order?: number;
  guid?: string;
  import_id?: number;
  post_mime_type?: string;
  tags_input?: string | string[];
  post_category?: number[];
  tax_input?: Record<string, number[] | string[]>;
  meta_input?: Record<string, any>;
  page_template?: string;
  context?: string;
}

interface PostCRUD {
  wp_insert_post(postarr: PostInsertArgs, wpError?: boolean, fireAfterHooks?: boolean): number | WPError;
  wp_update_post(postarr: PostInsertArgs & { ID: number }, wpError?: boolean, fireAfterHooks?: boolean): number | WPError;
  wp_delete_post(postId: number, forceDelete?: boolean): WPPost | false | null;
  wp_trash_post(postId: number): WPPost | false;
  wp_untrash_post(postId: number): WPPost | false | null;
  get_post(post?: number | WPPost | null, output?: 'OBJECT' | 'ARRAY_A' | 'ARRAY_N', filter?: string): WPPost | object | null;
  get_posts(args?: Partial<WPQueryArgs>): WPPost[];
}

// ---- Post Meta ----

interface PostMetaAPI {
  add_post_meta(postId: number, metaKey: string, metaValue: any, unique?: boolean): number | false;
  update_post_meta(postId: number, metaKey: string, metaValue: any, prevValue?: any): number | true | false;
  get_post_meta(postId: number, key?: string, single?: boolean): any;
  delete_post_meta(postId: number, metaKey: string, metaValue?: any): boolean;
}

// ---- Sticky Posts ----

interface StickyPostAPI {
  stick_post(postId: number): void;
  unstick_post(postId: number): void;
  is_sticky(postId?: number): boolean;
}

// ---- Revisions ----

interface RevisionAPI {
  wp_save_post_revision(postId: number): number | WPError | void;
  wp_get_post_revisions(post?: number | WPPost, args?: {
    order?: 'ASC' | 'DESC';
    orderby?: string;
    check_enabled?: boolean;
  }): WPPost[];
  wp_restore_post_revision(revision: number | WPPost, fields?: string[]): number | WPError | false;
}

// ---- Post Thumbnails ----

interface ThumbnailAPI {
  set_post_thumbnail(post: number | WPPost, thumbnailId: number): number | true | false;
  get_post_thumbnail_id(post?: number | WPPost): number | string | false;
  has_post_thumbnail(post?: number | WPPost): boolean;
  the_post_thumbnail(size?: string | number[], attr?: string | object): void;
  get_the_post_thumbnail(post?: number | WPPost, size?: string | number[], attr?: string | object): string;
}

// ---- Password Protection ----

interface PasswordAPI {
  post_password_required(post?: number | WPPost): boolean;
  get_the_password_form(post?: number | WPPost): string;
  the_password_form(post?: number | WPPost): void;
}
```

---

## 16. Design Patterns to Carry Over

1. **Everything is a post.** Navigation menus, templates, reusable blocks, custom CSS, font definitions — all are rows in `wp_posts` with different `post_type` values. This unifies storage, revision support, meta, capability checks, and REST API access into a single layer. The new CMS should adopt a similarly unified content entity model rather than separate tables per content type.

2. **`WP_Query` is the single read path.** Direct SQL against posts is never the right answer — it bypasses caching, skip hooks, and the filter system. The query builder pattern (accumulating SQL clauses that are individually filterable) is the correct model: each clause (`WHERE`, `JOIN`, `ORDER BY`, etc.) is a separate filter point.

3. **`wp_insert_post` / `wp_update_post` are the single write path.** They enforce slug uniqueness, sanitize input, fire status-transition hooks, invalidate caches, create revisions, and set taxonomy/meta atomically. Direct DB inserts or UPDATE statements skip all of that.

4. **Post status is a first-class lifecycle concept.** The transition from `draft` → `future` → `publish` → `trash` is a defined state machine, with specific actions firing on each transition (`transition_post_status`, `{old_status}_to_{new_status}`, `{status}_{post_type}`). Future posts have a "floating" publication date (`post_date_gmt = '0000-00-00 00:00:00'`) until they are committed by publishing.

5. **Cache-first reads.** `WP_Post::get_instance()` checks the object cache before hitting the DB. `get_posts()` primes meta and term caches for all returned posts in a single query each, not per-post. The CMS must reproduce this "priming on batch query" pattern to avoid N+1 database queries.

6. **Sticky posts are stored in an option, not in the post row.** This separates editorial curation from content metadata. The sticky post list is loaded once per request and consulted when building the main query result. No per-post DB query needed to determine stickiness.

7. **Revisions are posts.** The revision system reuses the same `wp_posts` table with `post_type = 'revision'` and `post_status = 'inherit'`. Revision comparison compares revisioned field values (title, content, excerpt) with normalized whitespace. This keeps the revision storage orthogonal to the main content model — no migration needed to add revision support to a new post type.

8. **Featured image is post meta.** The connection between a post and its featured image attachment is `_thumbnail_id` meta pointing to an attachment's post ID. There is no dedicated column. This design allows any attachment to serve as the thumbnail for any post, and allows removing the thumbnail without touching the attachment.

9. **The `filter` field as a sanitization passport.** The `WPPost.filter` property tells you what sanitization context the object's string fields have been processed through. Code that displays HTML must ensure it has a `'display'`-filtered post; code writing to the DB needs `'db'`-filtered data. The passport pattern prevents double-escaping and missed escaping. A new CMS should carry a similar context annotation on content objects.

10. **`pre_get_posts` is the query modification contract.** All archive customization, per-page post count changes, custom query conditions, and capability-based filtering happen through a single hook fired on all queries before SQL. This design means theme/plugin code never needs to rebuild the query from scratch — it only needs to modify what the system was already going to do. The equivalent hook in a new CMS is the single most important query extension point to implement correctly.

---

## 17. Tovu Reconstruction Notes

### 17.1 Why this exists

This is WordPress's real content kernel. The subsystem exists to make content querying, lifecycle transitions, revisions, meta, featured images, and extension hooks all flow through one shared model instead of a pile of disconnected tables and screen-specific logic.

### 17.2 What Tovu should preserve

- One canonical read path and one canonical write path for primary content entities
- A unified content model with status transitions, meta, revisions, and query extensibility built into the core
- Batch cache priming and cache-first reads for collections of content
- A query-modification seam that extensions can use without rebuilding the entire query from scratch

### 17.3 What Tovu can simplify

- Tovu does not need to force every future entity into one physical table if the logical content contract stays unified
- Legacy quirks such as sticky posts living in a generic option can be redesigned
- Sanitization-context handling can be expressed with typed view models instead of mutable `filter` markers if the same guarantees remain

### 17.4 Possible Tovu seams

- `src/features/content-entry/` for canonical entity writes and status transitions
- `src/features/content-query/` for query building, cache priming, and collection reads
- `src/core/ports/ContentRepositoryPort.ts` for persistence
- `src/core/ports/ContentQueryPort.ts` for read/query execution
- `src/core/ports/RevisionPort.ts` for revision capture and restore

### 17.5 Suggested priority

- `V1`: canonical content entity model, query path, write path, status transitions, meta/revision support
- `Later`: sticky-post style editorial overlays and deeper compatibility edge cases
