# Taxonomy — Specification

**Source files analyzed:**
- `wp-includes/taxonomy.php`
- `wp-includes/class-wp-taxonomy.php`
- `wp-includes/class-wp-term.php`
- `wp-includes/class-wp-term-query.php`

---

## 1. Overview

The taxonomy system provides the classification layer in WordPress. A **taxonomy** is a named classification scheme (e.g., `category`, `post_tag`). A **term** is a single entry within that scheme (e.g., "JavaScript", "News"). Terms are linked to objects (posts, users, etc.) through the `term_relationships` table.

Two database concerns are distinct:
- The `terms` table stores `term_id`, `name`, `slug`, and `term_group`. It is shared across all taxonomies — the same underlying term row can be reused in multiple taxonomies (a "shared term").
- The `term_taxonomy` table stores `term_taxonomy_id`, `term_id`, `taxonomy`, `description`, `parent`, and `count`. It contextualizes a term within a specific taxonomy.

When a term is retrieved, both rows are joined. A `WP_Term` object combines both into a single flat object. The `term_taxonomy_id` uniquely identifies a term-within-a-taxonomy and is used as the join key in `term_relationships`.

Taxonomies are registered in the global `$wp_taxonomies` array, keyed by taxonomy name. Registration must happen before or on the `init` action.

---

## 2. WP_Taxonomy Data Type

`WP_Taxonomy` is a `final` class. Its constructor delegates to `set_props()`, which merges provided arguments with defaults, resolves inheritance rules, and assigns all properties.

```typescript
interface TaxonomyLabels {
  name: string;
  singular_name: string;
  search_items: string;
  popular_items: string | null;       // non-hierarchical only
  all_items: string;
  parent_item: string | null;         // hierarchical only
  parent_item_colon: string | null;   // hierarchical only
  name_field_description: string;
  slug_field_description: string;
  parent_field_description: string | null; // hierarchical only
  desc_field_description: string;
  edit_item: string;
  view_item: string;
  update_item: string;
  add_new_item: string;
  new_item_name: string;
  template_name: string;             // e.g. "Tag Archives" / "Category Archives"
  separate_items_with_commas: string | null; // non-hierarchical only
  add_or_remove_items: string | null; // non-hierarchical only
  choose_from_most_used: string | null; // non-hierarchical only
  not_found: string;
  no_terms: string;
  filter_by_item: string | null;     // hierarchical only
  items_list_navigation: string;
  items_list: string;
  most_used: string;
  back_to_items: string;
  item_link: string;
  item_link_description: string;
  menu_name: string;                 // alias of name
}

interface TaxonomyCapabilities {
  manage_terms: string; // default 'manage_categories'
  edit_terms: string;   // default 'manage_categories'
  delete_terms: string; // default 'manage_categories'
  assign_terms: string; // default 'edit_posts'
}

interface TaxonomyRewrite {
  slug: string;         // default: taxonomy key sanitized
  with_front: boolean;  // default true
  hierarchical: boolean;// default false — whether to use hierarchical URL segments
  ep_mask: number;      // endpoint mask, default EP_NONE
}

interface TaxonomyDefaultTerm {
  name: string;
  slug: string;         // default ''
  description: string;  // default ''
}

interface WPTaxonomy {
  // Identity
  name: string;                  // taxonomy key, max 32 chars, lowercase alphanumeric + dash + underscore
  label: string;                 // resolved from labels.name
  labels: TaxonomyLabels;
  description: string;           // default ''

  // Visibility
  public: boolean;               // default true; master switch
  publicly_queryable: boolean;   // default: inherits from `public`
  show_ui: boolean;              // default: inherits from `public`
  show_in_menu: boolean;         // default: inherits from `show_ui`; requires show_ui=true
  show_in_nav_menus: boolean;    // default: inherits from `public`
  show_tagcloud: boolean;        // default: inherits from `show_ui`
  show_in_quick_edit: boolean;   // default: inherits from `show_ui`
  show_admin_column: boolean;    // default false
  show_in_rest: boolean;         // default false; enables Block Editor support
  rest_base: string | false;     // default: taxonomy key
  rest_namespace: string | false;// default 'wp/v2' when show_in_rest=true
  rest_controller_class: string | false; // default 'WP_REST_Terms_Controller'

  // Behavior
  hierarchical: boolean;         // default false; enables parent/child relationships
  query_var: string | false;     // default: taxonomy key; false disables URL querying
  rewrite: TaxonomyRewrite | false; // false disables rewrites
  update_count_callback: string | CallableFunction; // default: _update_post_term_count or _update_generic_term_count

  // Meta box
  meta_box_cb: CallableFunction | false | null;
  // null → post_categories_meta_box (hierarchical) or post_tags_meta_box (flat)
  // false → no meta box
  meta_box_sanitize_cb: CallableFunction | null;

  // Capabilities
  cap: TaxonomyCapabilities;

  // Object types
  object_type: string[];

  // REST
  rest_controller: object | null; // lazy-instantiated

  // Misc
  default_term: TaxonomyDefaultTerm | null;
  sort: boolean | null;          // if true, term order is preserved in wp_set_object_terms
  args: Record<string, unknown> | null; // default args merged into wp_get_object_terms calls
  _builtin: boolean;             // true for WordPress built-in taxonomies
}
```

### Registration Argument Inheritance Rules

When `public` is set:
- `publicly_queryable` → inherits `public` if null
- `show_ui` → inherits `public` if null
- `show_in_nav_menus` → inherits `public` if null

When `show_ui` is resolved:
- `show_in_menu` → inherits `show_ui` if null (also forced false when `show_ui` is false)
- `show_tagcloud` → inherits `show_ui` if null
- `show_in_quick_edit` → inherits `show_ui` if null

When `show_in_rest` is true:
- `rest_namespace` defaults to `'wp/v2'`

When `query_var` is not explicitly false, it is sanitized with `sanitize_title_with_dashes`. For non-public taxonomies that are not in admin, `query_var` is forced to false.

When `rewrite` is not false, it is expanded into a full object with `slug`, `with_front`, `hierarchical`, and `ep_mask`. The default `slug` is the taxonomy key run through `sanitize_title_with_dashes`.

---

## 3. WP_Term Data Type

`WP_Term` is a `final` class. It holds the merged result of a join between `terms` and `term_taxonomy`. All integer fields are cast to `int` after sanitization in 'raw' context. Integer fields that are negative are reset to 0.

```typescript
interface WPTerm {
  // From `terms` table
  term_id: number;          // auto-increment primary key
  name: string;             // display name, not unique globally
  slug: string;             // URL-safe identifier; unique per taxonomy (since WP 4.1)
  term_group: number;       // grouping mechanism for alias terms; 0 = no group

  // From `term_taxonomy` table
  term_taxonomy_id: number; // auto-increment, unique per taxonomy+term pair
  taxonomy: string;         // the taxonomy this term belongs to
  description: string;      // arbitrary HTML; stored raw
  parent: number;           // term_id of parent; 0 = top-level
  count: number;            // number of objects associated with this term

  // Runtime / virtual
  filter: 'raw' | 'edit' | 'db' | 'display' | 'rss' | 'attribute' | 'js';
  // Tracks which sanitization context was last applied. Default 'raw'.
}
```

### Sanitization Contexts

`sanitize_term()` / `sanitize_term_field()` apply different escaping based on context:

| Context     | Behavior |
|-------------|----------|
| `raw`       | No change; values returned as-is from DB |
| `edit`      | `esc_attr` (description uses `esc_html`); fires `edit_term_{field}` and `edit_{taxonomy}_{field}` filters |
| `db`        | Fires `pre_term_{field}` and `pre_{taxonomy}_{field}` filters before write |
| `display`   | Fires `term_{field}` and `{taxonomy}_{field}` filters |
| `rss`       | Fires `term_{field}_rss` and `{taxonomy}_{field}_rss` filters |
| `attribute` | `esc_attr` applied after display filters |
| `js`        | `esc_js` applied after display filters |

### The `data` Virtual Property

Accessing `$term->data` returns a `sanitize_term()`-processed `stdClass` containing only the nine database columns: `term_id`, `name`, `slug`, `term_group`, `term_taxonomy_id`, `taxonomy`, `description`, `parent`, `count`.

### Static Constructor: `WP_Term::get_instance(term_id, taxonomy?)`

1. Checks the `terms` object cache group for the term ID.
2. On cache miss, queries `terms JOIN term_taxonomy WHERE term_id = ?`.
3. If multiple taxonomy rows are returned (shared term), and no `taxonomy` argument is given, selects the single valid-taxonomy match, or returns `WP_Error('ambiguous_term_id')` if multiple valid matches exist.
4. Sanitizes with context `'raw'` and stores in cache only when the term is not shared.
5. Returns a `WP_Term` instance or `false`/`WP_Error`.

---

## 4. Built-in Taxonomies

| Key | Object Type | Hierarchical | Public | show_in_rest | REST base | Notes |
|-----|-------------|-------------|--------|-------------|-----------|-------|
| `category` | `post` | true | true | true | `categories` | Default category protected from deletion; query_var = `category_name` |
| `post_tag` | `post` | false | true | true | `tags` | query_var = `tag` |
| `post_format` | `post` | false | true | false | — | show_ui = false; show_in_nav_menus depends on theme support |
| `nav_menu` | `nav_menu_item` | false | false | true | `menus` | REST controller = WP_REST_Menus_Controller; used internally by the menu system |
| `link_category` | `link` | false | false | false | — | show_ui = true; used by blogroll/links feature |
| `wp_theme` | `wp_template`, `wp_template_part`, `wp_global_styles` | false | false | false | — | Internal FSE theme tracking |
| `wp_template_part_area` | `wp_template_part` | false | false | false | — | Internal FSE template part area |
| `wp_pattern_category` | `wp_block` | false | false | true | — | Pattern categories; show_ui = true |

All built-in taxonomies have `_builtin = true` and cannot be unregistered.

Built-in taxonomies are registered twice during bootstrap: once before plugins load (rewrite disabled), and again on `init` (rewrite enabled). The second call overwrites the first.

---

## 5. Registration Functions

### `register_taxonomy(taxonomy, object_type, args)`

```typescript
function register_taxonomy(
  taxonomy: string,         // max 32 chars; lowercase alphanumeric, dash, underscore
  object_type: string | string[],
  args?: Partial<WPTaxonomy>
): WPTaxonomy | WPError
```

Behavior:
1. Validates taxonomy key length (1–32 chars); returns `WP_Error('taxonomy_length_invalid')` otherwise.
2. Constructs a `WP_Taxonomy` instance, which triggers `register_taxonomy_args` and `register_{taxonomy}_taxonomy_args` filters.
3. Calls `add_rewrite_rules()` — registers query var with `$wp` and calls `add_rewrite_tag` / `add_permastruct`.
4. Stores in `$wp_taxonomies[taxonomy]`.
5. Calls `add_hooks()` — registers the AJAX handler for hierarchical term addition.
6. If `default_term` is set, calls `wp_insert_term()` for it (or retrieves existing), then stores term ID in `option: default_term_{taxonomy}`.
7. Fires `registered_taxonomy` and `registered_taxonomy_{taxonomy}` actions.
8. Returns the `WP_Taxonomy` object.

If called for a taxonomy that already exists, it overwrites the existing registration (including object type).

### `unregister_taxonomy(taxonomy)`

```typescript
function unregister_taxonomy(taxonomy: string): true | WPError
```

- Refuses to unregister built-in taxonomies (`_builtin = true`).
- Calls `remove_rewrite_rules()` and `remove_hooks()` on the taxonomy object.
- Removes from `$wp_taxonomies`.
- Fires `unregistered_taxonomy` action.

### `register_taxonomy_for_object_type(taxonomy, object_type)`

```typescript
function register_taxonomy_for_object_type(
  taxonomy: string,
  object_type: string
): boolean
```

Appends `object_type` to an existing taxonomy's `object_type` array if not already present. Returns false if the taxonomy does not exist or if the post type does not exist. Fires `registered_taxonomy_for_object_type`.

### `unregister_taxonomy_for_object_type(taxonomy, object_type)`

Removes `object_type` from the taxonomy's `object_type` array. Fires `unregistered_taxonomy_for_object_type`. Returns false if not found.

### Helper Queries

```typescript
// Get all registered taxonomy names or objects
function get_taxonomies(
  args?: Partial<WPTaxonomy>,
  output?: 'names' | 'objects',
  operator?: 'and' | 'or'
): string[] | WPTaxonomy[]

// Get taxonomy names/objects for a post type or post object
function get_object_taxonomies(
  object_type: string | string[] | WPPost,
  output?: 'names' | 'objects'
): string[] | WPTaxonomy[]

// Retrieve a single taxonomy object
function get_taxonomy(taxonomy: string): WPTaxonomy | false

// Check existence
function taxonomy_exists(taxonomy: string): boolean

// Check hierarchy
function is_taxonomy_hierarchical(taxonomy: string): boolean
```

---

## 6. WP_Term_Query

`WP_Term_Query` is the unified query class for terms. `get_terms()` is the public wrapper. All arguments are parsed through `query_var_defaults`, then `get_terms_defaults` filter.

### Constructor Defaults and Query Arguments

```typescript
interface TermQueryArgs {
  // Taxonomy filtering
  taxonomy: string | string[] | null;  // default null (all taxonomies)
  object_ids: number | number[] | null; // limit to terms on these objects

  // Ordering
  orderby:
    | 'name'           // default
    | 'slug'
    | 'term_id' | 'id'
    | 'description'
    | 'parent'
    | 'term_group'
    | 'term_order'     // uses term_relationships.term_order; same as term_id unless object_ids is set
    | 'count'
    | 'include'        // matches order of `include` param
    | 'slug__in'       // matches order of `slug` param
    | 'meta_value'
    | 'meta_value_num'
    | 'none'           // omit ORDER BY clause
    | string;          // meta_key value or meta_query clause key
  order: 'ASC' | 'DESC'; // default 'ASC'

  // Visibility
  hide_empty: boolean | 0 | 1; // default true; hides terms with count = 0
  hierarchical: boolean;        // default true; when hide_empty=true, include terms with non-empty descendants

  // Inclusion / Exclusion
  include: number[] | string;   // default []; comma/space-separated term IDs allowed
  exclude: number[] | string;   // default []; ignored if include is non-empty
  exclude_tree: number[] | string; // default []; excludes term + all descendants; ignored if include is set

  // Pagination
  number: number | '';          // default '' (0 = all); max results to return
  offset: number | '';          // default ''; number of terms to skip

  // Field selection
  fields:
    | 'all'                // default; returns WP_Term[]
    | 'all_with_object_id' // returns WP_Term[] with object_id prop; requires object_ids
    | 'ids'                // returns number[]
    | 'tt_ids'             // returns number[] (term_taxonomy_ids)
    | 'names'              // returns string[]
    | 'slugs'              // returns string[]
    | 'count'              // returns numeric string
    | 'id=>parent'         // returns Record<number, number>
    | 'id=>name'           // returns Record<number, string>
    | 'id=>slug';          // returns Record<number, string>

  // Exact match filters
  name: string | string[];       // default ''
  slug: string | string[];       // default ''
  term_taxonomy_id: number | number[] | ''; // default ''

  // Search
  search: string;                // default ''; SQL LIKE with wildcards on name and slug
  name__like: string;            // default ''; LIKE on name only
  description__like: string;     // default ''; LIKE on description

  // Hierarchy traversal
  pad_counts: boolean;           // default false; adds descendant counts to each term's count
  get: 'all' | '';               // default ''; 'all' overrides hide_empty, childless, child_of, hierarchical, pad_counts
  child_of: number;              // default 0; returns all descendants of this term_id (requires single taxonomy)
  parent: number | '';           // default ''; returns direct children only; overrides child_of
  childless: boolean;            // default false; limit to leaf terms (no children)

  // Caching
  cache_domain: string;          // default 'core'
  cache_results: boolean;        // default true; whether to cache term data
  update_term_meta_cache: boolean; // default true; whether to prime meta cache for results

  // Meta queries
  meta_key: string | string[];   // default ''
  meta_value: string | string[]; // default ''
  meta_compare: string;          // default '='; MySQL operator
  meta_compare_key: string;      // MySQL operator for key comparison
  meta_type: string;             // MySQL CAST type for value
  meta_type_key: string;         // MySQL CAST type for key
  meta_query: WPMetaQueryArgs | ''; // default ''; structured meta query
}
```

### `get` = `'all'` Shortcut

Setting `get: 'all'` forces: `childless = false`, `child_of = 0`, `hide_empty = 0`, `hierarchical = false`, `pad_counts = false`. Used internally by `get_term_by()` for slug/name lookups.

### `parent` vs `child_of`

- `parent` → only direct children of that term_id (SQL: `term_taxonomy.parent = N`)
- `child_of` → all descendants recursively (post-query PHP filtering)
- If `parent > 0`, `child_of` is ignored.

### Return Type by `fields`

| `fields` value | Return type |
|----------------|-------------|
| `all` | `WP_Term[]` |
| `all_with_object_id` | `WP_Term[]` (with `.object_id` property) |
| `ids` | `number[]` |
| `tt_ids` | `number[]` |
| `names` | `string[]` |
| `slugs` | `string[]` |
| `count` | `string` (numeric) |
| `id=>parent` | `Record<number, number>` |
| `id=>name` | `Record<number, string>` |
| `id=>slug` | `Record<number, string>` |

### Public API Functions

```typescript
// Primary query function — wrapper around WP_Term_Query
function get_terms(
  args?: TermQueryArgs | string,
  deprecated?: TermQueryArgs // legacy: get_terms(taxonomy, args)
): WPTerm[] | number[] | string[] | string | WPError

// Count terms in a taxonomy
function wp_count_terms(
  args?: TermQueryArgs | string,
  deprecated?: TermQueryArgs
): string | WPError
```

---

## 7. Term CRUD

### `wp_insert_term(term, taxonomy, args?)`

```typescript
function wp_insert_term(
  term: string,
  taxonomy: string,
  args?: {
    alias_of?: string;   // slug of term to alias; creates/joins term_group
    description?: string;
    parent?: number;     // term_id; must exist if > 0
    slug?: string;       // auto-generated from name if empty
  }
): { term_id: number; term_taxonomy_id: number } | WPError
```

Insert sequence:
1. Fires `pre_insert_term` filter (can abort by returning `WP_Error`).
2. Validates name is non-empty after sanitization.
3. Checks parent exists if provided.
4. Resolves `alias_of` → sets `term_group`.
5. Checks for duplicate name at the same hierarchy level. For hierarchical taxonomies, duplicates are scoped to the same parent. Returns `WP_Error('term_exists')` with the existing term_id as data.
6. Calls `wp_unique_term_slug()` to ensure slug uniqueness.
7. Fires `wp_insert_term_data` filter on `{ name, slug, term_group }`.
8. Inserts into `terms` table. Inserts into `term_taxonomy` table.
9. Runs a "confidence check" for race-condition duplicates. If a duplicate is found, deletes the new rows and returns the older term's IDs.
10. Fires (in order): `create_term`, `create_{taxonomy}`, applies `term_id_filter`, cleans cache, fires `created_term`, `created_{taxonomy}`, `saved_term`, `saved_{taxonomy}`.
11. Returns `{ term_id, term_taxonomy_id }`.

### `wp_update_term(term_id, taxonomy, args?)`

```typescript
function wp_update_term(
  term_id: number,
  taxonomy: string,
  args?: {
    alias_of?: string;
    description?: string;
    parent?: number;
    slug?: string;
    name?: string;
  }
): { term_id: number; term_taxonomy_id: number } | WPError
```

- Merges provided args over existing term data (fetched from DB).
- Checks for duplicate slug — returns `WP_Error('duplicate_term_slug')` unless the slug was auto-generated or the parent changed (in which case a new unique slug is generated).
- Runs `_split_shared_term()` if the term is currently shared between taxonomies.
- Applies `wp_update_term_parent` filter before setting parent.
- Fires `wp_update_term_data` filter on `{ name, slug, term_group }`.
- Updates both `terms` and `term_taxonomy` rows.
- Fires hooks: `edit_terms`, `edited_terms`, `edit_term_taxonomy`, `edited_term_taxonomy`, `edit_term`, `edit_{taxonomy}`, applies `term_id_filter`, cleans cache, fires `edited_term`, `edited_{taxonomy}`, `saved_term`, `saved_{taxonomy}`.

### `wp_delete_term(term, taxonomy, args?)`

```typescript
function wp_delete_term(
  term: number,
  taxonomy: string,
  args?: {
    default?: number;       // term_id to reassign objects to
    force_default?: boolean; // always assign default even if object has other terms
  }
): true | false | 0 | WPError
```

- Returns `false` if term does not exist.
- Returns `0` if attempting to delete the taxonomy's default term (e.g., default category).
- For hierarchical taxonomies: reassigns children's `parent` to the deleted term's parent.
- Reassigns objects to `default` term if provided. Objects with only the deleted term get the default; others get it removed. With `force_default`, all objects get the default added.
- Deletes all term meta via `delete_metadata_by_mid`.
- Deletes from `term_taxonomy`. Deletes from `terms` only if no other taxonomy rows reference the term_id.
- Fires: `pre_delete_term`, `edit_term_taxonomies`, `edited_term_taxonomies`, `delete_term_taxonomy`, `deleted_term_taxonomy`, `delete_term`, `delete_{taxonomy}`.

### Single-Term Retrieval

```typescript
function get_term(
  term: number | WPTerm | object,
  taxonomy?: string,
  output?: 'OBJECT' | 'ARRAY_A' | 'ARRAY_N',
  filter?: string  // sanitization context, default 'raw'
): WPTerm | Record<string, unknown> | unknown[] | WPError | null

function get_term_by(
  field: 'id' | 'ID' | 'term_id' | 'slug' | 'name' | 'term_taxonomy_id',
  value: string | number,
  taxonomy?: string,  // optional when field = 'term_taxonomy_id'
  output?: 'OBJECT' | 'ARRAY_A' | 'ARRAY_N',
  filter?: string
): WPTerm | Record<string, unknown> | unknown[] | false
```

`get_term_by` for `id`/`ID`/`term_id` delegates to `get_term`. For `slug` and `name`, it uses `get_terms` with `get: 'all'`, `number: 1`, `suppress_filter: true`. For `term_taxonomy_id`, taxonomy is omitted from the query and inferred from the result.

### Multi-Term Retrieval

```typescript
function get_term_children(
  term_id: number,
  taxonomy: string
): number[] | WPError
// Returns all descendant term_ids recursively.
// Uses _get_term_hierarchy() which caches the parent→children map.

function term_exists(
  term: number | string, // ID, slug, or name
  taxonomy?: string,
  parent_term?: number | null
): null | 0 | string | { term_id: string; term_taxonomy_id: string }
// null = does not exist
// 0 = term_id 0 was passed
// string = term_id (when no taxonomy given)
// object = { term_id, term_taxonomy_id } (when taxonomy given)
```

---

## 8. Object-Term Relationships

### `wp_set_object_terms(object_id, terms, taxonomy, append?)`

```typescript
function wp_set_object_terms(
  object_id: number,
  terms: string | number | Array<string | number>, // slugs or IDs
  taxonomy: string,
  append?: boolean  // default false
): number[] | WPError // returns array of tt_ids
```

When `append = false` (default): replaces all existing terms in the taxonomy with the provided set. Terms not in `terms` are removed; terms in `terms` that are new are added.

When `append = true`: adds terms without removing existing ones.

For each new term slug, if no matching term exists, `wp_insert_term()` is called automatically. Integer IDs for non-existent terms are silently skipped.

If the taxonomy has `sort = true`, updates `term_relationships.term_order` to match the order terms were provided.

Fires per new relationship: `add_term_relationship`, `added_term_relationship`.
Fires at end: `set_object_terms`.

### `wp_add_object_terms(object_id, terms, taxonomy)`

Calls `wp_set_object_terms(object_id, terms, taxonomy, true)`.

### `wp_remove_object_terms(object_id, terms, taxonomy)`

```typescript
function wp_remove_object_terms(
  object_id: number,
  terms: string | number | Array<string | number>,
  taxonomy: string
): boolean | WPError
```

Resolves each term to its `term_taxonomy_id` via `term_exists()`, then deletes from `term_relationships`. Fires `delete_term_relationships` / `deleted_term_relationships`. Updates term counts afterward.

### `wp_get_object_terms(object_ids, taxonomies, args?)`

```typescript
function wp_get_object_terms(
  object_ids: number | number[],
  taxonomies: string | string[],
  args?: TermQueryArgs
): WPTerm[] | number[] | string[] | string | WPError
```

Wrapper around `get_terms` that populates `object_ids` and `taxonomy`. Respects taxonomy-level `args` property. Uses `update_term_meta_cache: false` by default (changed in WP 6.3).

### `get_the_terms(post, taxonomy)`

```typescript
function get_the_terms(
  post: number | WPPost,
  taxonomy: string
): WPTerm[] | false | WPError
```

Post-specific wrapper. Checks the `{taxonomy}_relationships` object cache first. Returns `false` (not `[]`) when the post has no terms. Fires `get_the_terms` filter.

### `has_term(term?, taxonomy?, post?)`

```typescript
function has_term(
  term?: string | number | Array<string | number>,  // default ''
  taxonomy?: string,
  post?: number | WPPost | null
): boolean
```

Calls `is_object_in_term()` internally. Returns `false` on WP_Error. With no `term` argument, checks if the post has any term in the taxonomy.

### `get_objects_in_term(term_ids, taxonomies, args?)`

```typescript
function get_objects_in_term(
  term_ids: number | number[],
  taxonomies: string | string[],
  args?: { order?: 'ASC' | 'DESC' }
): string[] | WPError  // returns object_ids as numeric strings
```

---

## 9. Term Hierarchy

Hierarchy is only meaningful for taxonomies where `hierarchical = true`. The `parent` field in `term_taxonomy` holds the `term_id` of the direct parent; 0 indicates a root term.

### Internal Cache: `_get_term_hierarchy(taxonomy)`

Builds and caches a map of `parent_term_id → child_term_ids[]` for a given taxonomy. Stored in the `{taxonomy}_children` option (not a transient). Rebuilt whenever the term cache is cleaned.

### `get_term_children(term_id, taxonomy)`

Returns all descendant `term_id` values recursively. Uses the hierarchy cache. Returns `[]` if the term has no children. Returns `WP_Error` if taxonomy is invalid.

### `get_ancestors(object_id, object_type, resource_type?)`

```typescript
function get_ancestors(
  object_id: number,
  object_type: string,
  resource_type?: 'taxonomy' | 'post_type' | ''
): number[]  // ancestor IDs from lowest (direct parent) to highest (root)
```

For `resource_type = 'taxonomy'`: walks `term.parent` links upward until reaching 0 or a cycle. Returns IDs in order from direct parent to root.

Auto-detects `resource_type` from `is_taxonomy_hierarchical()` and `post_type_exists()` if not provided.

### `term_is_ancestor_of(term1, term2, taxonomy)`

Returns `true` if `term1` is a direct or indirect ancestor of `term2`. Recursive — walks up `term2.parent` chain.

### Loop Prevention

`wp_check_term_hierarchy_for_loops()` is attached to the `wp_update_term_parent` filter. It prevents a term from being set as its own ancestor by traversing the parent chain upward.

---

## 10. Term Counts

The `count` column in `term_taxonomy` stores the number of objects associated with each term. It is updated asynchronously via `wp_update_term_count()`.

### `wp_update_term_count(terms, taxonomy, do_deferred?)`

```typescript
function wp_update_term_count(
  terms: number | number[],  // term_taxonomy_ids
  taxonomy: string,
  do_deferred?: boolean      // default false; flush all deferred counts
): boolean
```

If deferred mode is active (`wp_defer_term_counting(true)`), counts are queued rather than executed immediately. Call `wp_defer_term_counting(false)` to flush.

Delegates to `wp_update_term_count_now()`, which calls:
- `_update_post_term_count()` — for taxonomies attached exclusively to post types; counts only `publish` status posts.
- `_update_generic_term_count()` — for other object types; counts all relationships unconditionally.
- Custom `update_count_callback` if defined on the taxonomy.

### Deferred Counting

Bulk import operations should wrap with:
```typescript
wp_defer_term_counting(true);
// ... many term operations ...
wp_defer_term_counting(false); // flushes deferred counts
```

### `pad_counts` in Queries

When `pad_counts: true` in a `WP_Term_Query`, the returned term objects have their `count` padded to include all descendant term counts. This is a post-query PHP operation, not a DB aggregation.

---

## 11. Term Meta

Term meta is stored in the `termmeta` table (`meta_id`, `term_id`, `meta_key`, `meta_value`). It follows the same conventions as post meta.

**Shared terms cannot have meta.** If `wp_term_is_shared(term_id)` returns true, `add_term_meta()` and `update_term_meta()` return `WP_Error('ambiguous_term_id')`.

```typescript
function add_term_meta(
  term_id: number,
  meta_key: string,
  meta_value: unknown,
  unique?: boolean  // default false; prevent duplicate keys
): number | false | WPError  // meta_id on success

function get_term_meta(
  term_id: number,
  key?: string,          // empty = all meta
  single?: boolean       // default false
): unknown

function update_term_meta(
  term_id: number,
  meta_key: string,
  meta_value: unknown,
  prev_value?: unknown   // default ''
): number | true | false | WPError
// Returns meta_id (int) if key was new, true on successful update,
// false on failure or if value is unchanged.

function delete_term_meta(
  term_id: number,
  meta_key: string,
  meta_value?: unknown   // default ''; if provided, only delete rows with this value
): boolean

function register_term_meta(
  taxonomy: string,       // '' = all taxonomies
  meta_key: string,
  args: RegisterMetaArgs
): boolean

function unregister_term_meta(
  taxonomy: string,
  meta_key: string
): boolean
```

### Meta Value Serialization

Non-scalar values (arrays, objects) are serialized before storage and deserialized on retrieval. Scalar edge cases:
- `false` → stored as `''`, retrieved as `''`
- `true` → stored as `'1'`, retrieved as `'1'`
- numbers → stored as strings, retrieved as strings (unless `$single = true` and the registered type is known)

### Meta Cache Priming

`update_termmeta_cache(term_ids)` bulk-primes the meta cache for a list of term IDs. This is called automatically by `WP_Term_Query` when `update_term_meta_cache = true`. Lazy loading is also available via `wp_lazyload_term_meta(term_ids)`.

---

## 12. Slug Generation and Uniqueness

### Initial Slug

If no `slug` is provided to `wp_insert_term()`, the slug is generated by `sanitize_title($name)`, which:
1. Lowercases the string.
2. Converts accented characters to ASCII equivalents.
3. Strips HTML tags.
4. Replaces spaces and special characters with hyphens.
5. Trims leading/trailing hyphens.

### Uniqueness Algorithm: `wp_unique_term_slug(slug, term)`

Since WP 4.1, slugs need only be unique **within** a taxonomy (not globally). The uniqueness check proceeds:

1. If `slug` does not exist in the taxonomy at all → use it as-is.
2. If the taxonomy is hierarchical and the term has a parent → try appending parent slugs (e.g., `-parent-slug`, `-parent-slug-grandparent-slug`) until unique.
3. If still not unique → append `-2`, `-3`, … until a unique slug is found.

The `wp_unique_term_slug_is_bad_slug` filter can override whether a suffix is needed. The `wp_unique_term_slug` filter transforms the final result.

### Duplicate Name Detection

`wp_insert_term()` checks for existing terms with the same name at the same hierarchy level before calling `wp_unique_term_slug`. The name comparison is case-insensitive (`strtolower` on both sides) but stricter than the DB query (which is collation-dependent).

---

## 13. Key Hooks and Filters

### Taxonomy Registration

| Hook | Type | Signature | Description |
|------|------|-----------|-------------|
| `register_taxonomy_args` | filter | `(args, taxonomy, object_type)` | Fired in `WP_Taxonomy::set_props` for all taxonomies |
| `register_{taxonomy}_taxonomy_args` | filter | `(args, taxonomy, object_type)` | Fired for a specific taxonomy |
| `registered_taxonomy` | action | `(taxonomy, object_type, args)` | After any taxonomy is registered |
| `registered_taxonomy_{taxonomy}` | action | `(taxonomy, object_type, args)` | After a specific taxonomy is registered |
| `unregistered_taxonomy` | action | `(taxonomy)` | After taxonomy is unregistered |
| `taxonomy_labels_{taxonomy}` | filter | `(labels)` | Modify labels for a specific taxonomy |

### Term Insertion

| Hook | Type | Signature | Description |
|------|------|-----------|-------------|
| `pre_insert_term` | filter | `(term, taxonomy, args)` | Can abort insert by returning WP_Error |
| `wp_insert_term_data` | filter | `(data, taxonomy, args)` | Modify `{name, slug, term_group}` before DB insert |
| `wp_insert_term_duplicate_term_check` | filter | `(duplicate, term, taxonomy, args, tt_id)` | Override duplicate detection logic |
| `create_term` | action | `(term_id, tt_id, taxonomy, args)` | Before cache clean |
| `create_{taxonomy}` | action | `(term_id, tt_id, args)` | Before cache clean, taxonomy-specific |
| `term_id_filter` | filter | `(term_id, tt_id, args)` | Transform term_id after creation |
| `created_term` | action | `(term_id, tt_id, taxonomy, args)` | After cache clean |
| `created_{taxonomy}` | action | `(term_id, tt_id, args)` | After cache clean, taxonomy-specific |
| `saved_term` | action | `(term_id, tt_id, taxonomy, update, args)` | After both insert and update |
| `saved_{taxonomy}` | action | `(term_id, tt_id, update, args)` | After both insert and update, taxonomy-specific |

### Term Update

| Hook | Type | Signature | Description |
|------|------|-----------|-------------|
| `wp_update_term_parent` | filter | `(parent, term_id, taxonomy, parsed_args, args)` | Can prevent hierarchy loops |
| `wp_update_term_data` | filter | `(data, term_id, taxonomy, args)` | Modify `{name, slug, term_group}` before DB update |
| `edit_terms` | action | `(term_id, taxonomy, args)` | Before terms row update |
| `edited_terms` | action | `(term_id, taxonomy, args)` | After terms row update |
| `edit_term_taxonomy` | action | `(tt_id, taxonomy, args)` | Before term_taxonomy row update |
| `edited_term_taxonomy` | action | `(tt_id, taxonomy, args)` | After term_taxonomy row update |
| `edit_term` | action | `(term_id, tt_id, taxonomy, args)` | After DB update, before cache clean |
| `edit_{taxonomy}` | action | `(term_id, tt_id, args)` | After DB update, taxonomy-specific |
| `edited_term` | action | `(term_id, tt_id, taxonomy, args)` | After cache clean |
| `edited_{taxonomy}` | action | `(term_id, tt_id, args)` | After cache clean, taxonomy-specific |

### Term Deletion

| Hook | Type | Signature | Description |
|------|------|-----------|-------------|
| `pre_delete_term` | action | `(term, taxonomy)` | Before any deletions |
| `delete_term_taxonomy` | action | `(tt_id)` | Before term_taxonomy row deleted |
| `deleted_term_taxonomy` | action | `(tt_id)` | After term_taxonomy row deleted |
| `delete_term` | action | `(term, tt_id, taxonomy, deleted_term, object_ids)` | After full deletion + cache clean |
| `delete_{taxonomy}` | action | `(term, tt_id, deleted_term, object_ids)` | After deletion, taxonomy-specific |

### Term Retrieval

| Hook | Type | Signature | Description |
|------|------|-----------|-------------|
| `get_term` | filter | `(term, taxonomy)` | Fired on every `get_term()` call |
| `get_{taxonomy}` | filter | `(term, taxonomy)` | Taxonomy-specific get_term filter |
| `get_terms_defaults` | filter | `(defaults, taxonomies)` | Modify WP_Term_Query defaults |
| `get_terms_args` | filter | `(args, taxonomies)` | Modify query args before execution |
| `get_terms` | filter | `(terms, taxonomies, args, term_query)` | Modify query results |
| `get_the_terms` | filter | `(terms, post_id, taxonomy)` | Modify get_the_terms results |

### Object-Term Relationships

| Hook | Type | Signature | Description |
|------|------|-----------|-------------|
| `add_term_relationship` | action | `(object_id, tt_id, taxonomy)` | Before relationship row inserted |
| `added_term_relationship` | action | `(object_id, tt_id, taxonomy)` | After relationship row inserted |
| `delete_term_relationships` | action | `(object_id, tt_ids, taxonomy)` | Before relationships deleted |
| `deleted_term_relationships` | action | `(object_id, tt_ids, taxonomy)` | After relationships deleted |
| `set_object_terms` | action | `(object_id, terms, tt_ids, taxonomy, append, old_tt_ids)` | After all set operations |

### Slug / Uniqueness

| Hook | Type | Signature | Description |
|------|------|-----------|-------------|
| `wp_unique_term_slug_is_bad_slug` | filter | `(needs_suffix, slug, term)` | Override whether slug needs uniquification |
| `wp_unique_term_slug` | filter | `(slug, term, original_slug)` | Transform the final unique slug |

### Term Field Sanitization (per-field, per-context)

| Pattern | Context |
|---------|---------|
| `edit_term_{field}` | edit context |
| `edit_{taxonomy}_{field}` | edit context, taxonomy-specific |
| `pre_term_{field}` | db context |
| `pre_{taxonomy}_{field}` | db context, taxonomy-specific |
| `term_{field}_rss` | rss context |
| `{taxonomy}_{field}_rss` | rss context, taxonomy-specific |
| `term_{field}` | display context |
| `{taxonomy}_{field}` | display context, taxonomy-specific |

---

## 14. TypeScript Interface Sketch

```typescript
// Taxonomy registry
const wpTaxonomies: Record<string, WPTaxonomy> = {};

// Term query result union
type TermQueryResult =
  | WPTerm[]
  | number[]
  | string[]
  | string              // numeric string when fields='count'
  | Record<number, number>
  | Record<number, string>
  | WPError;

// Insert/update return
interface TermMutationResult {
  term_id: number;
  term_taxonomy_id: number;
}

// Object-term relationship table row
interface TermRelationship {
  object_id: number;
  term_taxonomy_id: number;
  term_order: number;  // used when taxonomy.sort = true
}

// Hierarchy cache structure
type TermHierarchyCache = Record<number, number[]>; // parent_id → child_ids[]

// Taxonomy registration
function registerTaxonomy(
  taxonomy: string,
  objectType: string | string[],
  args?: Partial<WPTaxonomy>
): WPTaxonomy | WPError;

// Term CRUD
function wpInsertTerm(
  term: string,
  taxonomy: string,
  args?: {
    alias_of?: string;
    description?: string;
    parent?: number;
    slug?: string;
  }
): TermMutationResult | WPError;

function wpUpdateTerm(
  termId: number,
  taxonomy: string,
  args?: Partial<Pick<WPTerm, 'name' | 'slug' | 'description' | 'parent'>>
    & { alias_of?: string }
): TermMutationResult | WPError;

function wpDeleteTerm(
  term: number,
  taxonomy: string,
  args?: { default?: number; force_default?: boolean }
): true | false | 0 | WPError;

// Object relationships
function wpSetObjectTerms(
  objectId: number,
  terms: string | number | Array<string | number>,
  taxonomy: string,
  append?: boolean
): number[] | WPError; // returns tt_ids

function wpGetObjectTerms(
  objectIds: number | number[],
  taxonomies: string | string[],
  args?: Partial<TermQueryArgs>
): TermQueryResult;

// Term meta
function addTermMeta(termId: number, key: string, value: unknown, unique?: boolean): number | false | WPError;
function getTermMeta(termId: number, key?: string, single?: boolean): unknown;
function updateTermMeta(termId: number, key: string, value: unknown, prevValue?: unknown): number | true | false | WPError;
function deleteTermMeta(termId: number, key: string, value?: unknown): boolean;
```

---

## 15. Design Patterns to Carry Over

**Two-table architecture.** The split between `terms` and `term_taxonomy` is deliberate: the same underlying term concept (same name/slug) can belong to multiple taxonomies via separate `term_taxonomy` rows. New implementations should model this as a many-to-many relationship between term identities and taxonomy contexts.

**`term_taxonomy_id` as the join key.** Relationships between objects and terms use `term_taxonomy_id`, not `term_id`. This means the relationship is scoped to a specific taxonomy, which allows the same object to have a "Jazz" term in both a `genre` and a `mood` taxonomy without ambiguity.

**Shared terms and meta exclusion.** Because two taxonomy contexts can reference the same `term_id`, term meta is blocked for shared terms. Any system implementing term meta must track whether a term is shared and handle this case explicitly.

**Slug uniqueness is per-taxonomy, not global.** Since WP 4.1 (db_version >= 30133), slugs need only be unique within a taxonomy. The slug uniqueness algorithm builds this in; a reimplementation should not enforce global slug uniqueness.

**Name uniqueness is per-level within hierarchy.** Duplicate names are blocked at the same parent + taxonomy level for hierarchical taxonomies, but the same name can exist under different parents. Flat (non-hierarchical) taxonomies block duplicate names taxonomy-wide.

**Term counts are eventually consistent.** Counts are updated after relationship changes, but `wp_defer_term_counting` allows batching. When `_update_post_term_count` is used, only published posts are counted. A reimplementation must handle the distinction between raw relationship count and published-only count.

**`pad_counts` is a post-query operation.** Padding descendant counts into each ancestor's count is done in PHP after the query, not in SQL. Hierarchical count aggregation is a read-time computation, not stored data.

**Sanitization context permeates retrieval.** Every term leaves the system with an associated `filter` value recording what sanitization was applied. The `raw` context is stored internally; `display` context is applied before rendering. A reimplementation needs a clear sanitization pipeline tied to output context.

**Registration defaults cascade from `public`.** Most visibility flags default to `null` and inherit from `public`. Only `show_admin_column` defaults independently to `false`. The implementation of a taxonomy registry must apply these inheritance rules in the correct order.

**`get = 'all'` is an escape hatch.** The `get: 'all'` query argument unconditionally overrides `hide_empty`, `hierarchical`, `childless`, `child_of`, and `pad_counts`. It is used internally for existence checks where hierarchy and emptiness are irrelevant. A reimplementation should preserve this override as an explicit bypass mode.

---

## 16. Tovu Reconstruction Notes

### 16.1 Why this exists

Taxonomy exists so content classification can be modeled as a first-class reusable subsystem instead of bespoke per-feature tags and categories. It gives WordPress shared vocabulary management, hierarchical browsing, and queryable relationships across content types.

### 16.2 What Tovu should preserve

- A taxonomy registry separate from individual content-type implementations
- Explicit distinction between the concept of a term and that term's role within a taxonomy context
- Shared relationship/query infrastructure for attaching classifications to content
- Hierarchical counting and query behavior as part of the taxonomy model, not custom code in each feature

### 16.3 What Tovu can simplify

- Tovu can avoid historical shared-term oddities by giving each taxonomy-context term its own stable identity
- Serialized legacy sanitization markers and compatibility behaviors do not need to survive into a new model
- If counts are recomputed or denormalized differently, the important part is preserving consistent read semantics

### 16.4 Possible Tovu seams

- `src/features/taxonomy/` for taxonomy definitions, term CRUD, and relationship workflows
- `src/core/ports/TaxonomyRegistryPort.ts` for registering and reading taxonomy metadata
- `src/core/ports/TermRepositoryPort.ts` for term persistence and query behavior
- `src/core/ports/ContentClassificationPort.ts` for object-term relationship management

### 16.5 Suggested priority

- `V1`: taxonomy registry, term CRUD, content-term relations, and taxonomy-aware querying
- `Later`: advanced count strategies, compatibility edge cases, and richer admin affordances
