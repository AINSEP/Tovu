# Theme JSON and Global Styles - WordPress-to-TypeScript Rewrite Spec

**Source files analyzed:**
- `wp-includes/class-wp-theme-json.php`
- `wp-includes/class-wp-theme-json-data.php`
- `wp-includes/class-wp-theme-json-resolver.php`
- `wp-includes/class-wp-theme-json-schema.php`
- `wp-includes/global-styles-and-settings.php`
- `wp-includes/theme.php`

---

## 1. Overview

This subsystem is the theme design-token engine behind block themes and modern global styling in classic themes. It reads `theme.json`, merges it with core defaults and user data, translates it into renderable settings and CSS, and exposes the result through both PHP helpers and the REST APIs consumed by the Site Editor.

There are three core layers:

1. **Data model** - `WP_Theme_JSON`, `WP_Theme_JSON_Data`, and `WP_Theme_JSON_Schema` represent, migrate, and sanitize the structured theme configuration.
2. **Resolver** - `WP_Theme_JSON_Resolver` reads data from core, theme, block registry, and user sources, then merges them in priority order.
3. **Public helpers** - `wp_get_global_settings()`, `wp_get_global_styles()`, `wp_get_global_stylesheet()`, and the theme-json cache helpers turn the resolved tree into runtime output.

The design contract is: theme.json is authoritative where present, but theme supports, block metadata, and user customizations still participate in the final merged tree.

---

## 2. Data Sources and Merge Order

`WP_Theme_JSON_Resolver::get_merged_data()` merges the origins in strict priority order:

1. `default` - core WordPress defaults
2. `blocks` - block metadata and block style data
3. `theme` - active theme and parent theme data
4. `custom` - user global styles

Later origins override earlier ones.

That is the contract used by both:

- `wp_get_global_settings()`
- `wp_get_global_styles()`
- `wp_get_global_stylesheet()`

When a caller requests `origin = 'theme'`, the user layer is excluded. When the caller requests `origin = 'base'`, only core and theme data are considered.

---

## 3. WP_Theme_JSON Model

### 3.1 Constructor and Origin

`WP_Theme_JSON_Data` is a thin wrapper around `WP_Theme_JSON`. It stores:

- the current `WP_Theme_JSON` instance
- the origin label (`default`, `theme`, `user`, or `blocks`)

`update_with()` merges a new structure into the wrapped instance. `get_data()` returns the raw theme.json-shaped array, while `get_theme_json()` returns the object for callers that need methods.

### 3.2 Schema Migration

`WP_Theme_JSON_Schema::migrate()` upgrades older theme.json versions to the latest schema. It is used by `WP_Theme_JSON::remove_insecure_properties()` and by the resolver before data is consumed.

The practical rule is that the stored JSON may be old, but core always normalizes it to the current schema before validation or CSS generation.

### 3.3 Core `WP_Theme_JSON` Responsibilities

`WP_Theme_JSON` is the runtime workhorse. The important public methods are:

| Method | Role |
|---|---|
| `get_settings()` | Returns merged settings |
| `get_stylesheet()` | Builds CSS for selected types and origins |
| `get_custom_css()` | Returns custom CSS from the tree |
| `get_custom_templates()` | Returns theme-defined custom templates |
| `get_template_parts()` | Returns template part metadata |
| `get_styles_block_nodes()` | Lists block-specific style nodes |
| `get_styles_for_block()` | Compiles CSS for one block metadata node |
| `get_root_layout_rules()` | Emits layout rules for the root selector |
| `merge()` | Merges another theme-json tree into the current one |
| `get_svg_filters()` | Returns generated duotone/filter markup |
| `remove_insecure_properties()` | Sanitizes user-facing theme.json data |
| `get_raw_data()` | Returns the full raw tree |
| `get_data()` | Returns the validated tree |
| `get_from_editor_settings()` | Converts editor settings to theme.json shape |
| `resolve_variables()` | Resolves preset variables to literal values |

The class also owns the selector-scoping helpers and preset metadata used to turn JSON values into CSS custom properties and class names.

---

## 4. Theme JSON Discovery

### 4.1 Theme File Resolution

`WP_Theme_JSON_Resolver::get_theme_data()` resolves the active theme's `theme.json` through `wp_get_theme()->get_file_path( 'theme.json' )`. If the file is readable, it is decoded and translated using the theme text domain. If not, the resolver still creates a valid empty theme tree so the rest of the pipeline continues to work.

If the theme has a parent and the parent has a separate `theme.json`, the parent tree is merged first and the child overrides it.

### 4.2 Block Style Variations

The resolver also folds in variation data from:

- `styles/*.json` partial files
- registered block style variations
- block registry style metadata

The merge priority is:

1. `styles.blocks.blockType.variations` from theme.json
2. `styles.variations` from theme.json
3. block style variation files
4. block style registry entries

This is what lets block style variations participate in sanitization and then appear in the final merged tree.

### 4.3 Theme File URIs

`resolve_theme_file_uris()` rewrites `file:./...` placeholder URLs inside theme.json back to absolute theme URIs. This is used for background images in both top-level styles and block styles.

---

## 5. Public Global Style Helpers

### 5.1 `wp_get_global_settings()`

This helper returns merged settings by path. It caches results in the non-persistent `theme_json` cache group unless theme development mode is enabled.

The function accepts:

- `path` - nested array path into the settings tree
- `context['block_name']` - scopes the path to a block subtree
- `context['origin']` - selects `theme` or `all` data

### 5.2 `wp_get_global_styles()`

This helper returns merged style values from the same tree. It supports:

- block-scoped paths
- `origin = 'theme'` or `all`
- a `resolve-variables` transform that replaces internal preset references with literal values

### 5.3 `wp_get_global_stylesheet()`

This function is the CSS compiler entry point. It:

1. Checks the cache, unless theme development mode is enabled.
2. Resolves theme file URIs in the merged tree.
3. Chooses style types based on whether the theme has `theme.json`.
4. Generates variables, presets, styles, and base layout rules.
5. Returns the compiled CSS string.

For themes without `theme.json`, the default output still includes the legacy-compatible variables/presets/base layout layers.

### 5.4 `wp_enqueue_global_styles()` and Block Styles

`wp_enqueue_global_styles()` registers `global-styles`, injects the compiled stylesheet, and appends block-specific CSS using `wp_add_global_styles_for_blocks()`.

`wp_add_global_styles_for_blocks()` does the same work per block node, with on-demand behavior when block assets are loaded only when rendered. It uses:

- `wp_filter_out_block_nodes()`
- `wp_should_load_block_assets_on_demand()`
- `wp_get_block_name_from_theme_json_path()`

That design keeps block-specific global styles attached only to blocks actually present on the page.

---

## 6. Theme Presence and Cache Management

### 6.1 `wp_theme_has_theme_json()`

This helper checks whether the active theme or its parent has a readable `theme.json`. It caches the result per stylesheet unless theme development mode is enabled.

That helper is used throughout the global styles pipeline to decide whether to treat the theme as a block-theme-style configuration source or as a classic theme with partial theme support.

### 6.2 Cache Flushes

`wp_clean_theme_json_cache()` clears the `theme_json` cache group and then calls `WP_Theme_JSON_Resolver::clean_cached_data()`.

`clean_cached_data()` resets:

- core data
- block data
- theme data
- user data
- cached block registries
- the user global styles CPT id
- translation schema cache

This is the invalidation path after theme changes, global styles edits, or registry changes that could affect the compiled output.

---

## 7. Editor and REST Integration

The Site Editor and block editor consume this subsystem through a few named helpers:

- `wp_get_theme_directory_pattern_slugs()`
- `wp_get_theme_data_custom_templates()`
- `wp_get_theme_data_template_parts()`
- `wp_get_global_stylesheet()`

`wp_get_theme_data_template_parts()` caches template part metadata in `theme_json`, while the pattern/template helpers expose theme.json-defined metadata to the block editor and Pattern Directory integrations.

The resolver also exposes the active global styles CPT ID through `get_user_global_styles_post_id()`, which is why the Site Editor can preload `/wp/v2/global-styles/{id}` before booting.

---

## 8. Theme Support Bridging

`WP_Theme_JSON_Resolver::get_theme_data()` backfills theme.json with classic theme supports when `with_supports` is true. For classic themes, it explicitly manages compatibility switches such as:

- `default-color-palette`
- `default-gradient-presets`
- `default-font-sizes`
- `default-spacing-sizes`
- `link-color`
- `border`
- `appearance-tools`

That is the bridge that keeps classic themes functional while still allowing theme.json to override the support-derived defaults when both are present.

---

## 9. Operational Implications

1. theme.json is not a static file read. It is a merged design tree with schema migration, translation, block metadata, and user override layers.
2. Cache invalidation is deliberate and centralized. Any rewrite should preserve the non-persistent `theme_json` cache behavior.
3. `theme.json` presence changes output shape. Themes without it use a compatibility path; themes with it get the full global styles pipeline.
4. The Site Editor depends on the resolver as the canonical source for templates, template parts, patterns, and the active global styles entity.
5. URI resolution for `file:./` placeholders is part of the public contract. Callers expecting absolute theme file URLs rely on `resolve_theme_file_uris()`.

---

## 10. Tovu Reconstruction Notes

### 10.1 Why this exists

This subsystem exists so presentation rules can be expressed as structured data instead of scattered theme code and CSS overrides. WordPress uses it to unify theme defaults, user style changes, block-level style rules, and editor-visible design metadata.

### 10.2 What Tovu should preserve

- A canonical structured design/config layer for themes and style state
- Merge precedence between shipped theme defaults and user-authored overrides
- One resolver path for editor and frontend style/runtime data
- Centralized cache invalidation for design-tree changes

### 10.3 What Tovu can simplify

- Tovu does not need to mimic `theme.json` syntax exactly
- Backfill for classic theme supports can be much smaller if Tovu starts with one modern theme contract
- Block-specific stylesheet generation can begin narrower than WordPress as long as style resolution stays data-driven

### 10.4 Possible Tovu seams

- `src/features/presentation/` for theme config, style state, and template metadata
- `src/core/ports/DesignSystemPort.ts` for resolving merged theme/user style trees
- `src/core/ports/StyleAssetPort.ts` for compiled stylesheet output and cache invalidation

### 10.5 Suggested priority

- `V1`: merged theme/user style config and one canonical resolver for editor + frontend
- `Later`: richer block-level style extraction, theme-compat bridging, more advanced cache and asset strategies
