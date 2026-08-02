# Style Engine and Fonts - WordPress-to-TypeScript Rewrite Spec

**Source files analyzed:**
- `wp-includes/style-engine.php`
- `wp-includes/style-engine/class-wp-style-engine.php`
- `wp-includes/style-engine/class-wp-style-engine-css-rule.php`
- `wp-includes/style-engine/class-wp-style-engine-css-declarations.php`
- `wp-includes/style-engine/class-wp-style-engine-css-rules-store.php`
- `wp-includes/fonts.php`
- `wp-includes/fonts/class-wp-font-collection.php`
- `wp-includes/fonts/class-wp-font-face.php`
- `wp-includes/fonts/class-wp-font-face-resolver.php`
- `wp-includes/fonts/class-wp-font-library.php`
- `wp-includes/fonts/class-wp-font-utils.php`
- `wp-includes/global-styles-and-settings.php`
- `wp-includes/block-editor.php`
- `wp-includes/default-filters.php`
- `wp-includes/deprecated.php`

---

## 1. Overview

This subsystem is the runtime bridge between design data and emitted CSS. It has two distinct but connected responsibilities:

1. **Style engine** - converts block-style arrays and theme.json-derived style trees into sanitized CSS declarations, class names, and stored rule sets.
2. **Font runtime** - discovers, validates, registers, and prints font faces and font collections from theme.json and the Font Library.

The important contract is that theme.json and block style data do not go directly to the browser. They are first normalized into a style-engine representation, then compiled into CSS, and only then printed or enqueued.

That same pipeline is also the source of the editor's font-face output, the global styles stylesheet, and the block-scoped inline CSS that the Site Editor and front end both rely on.

---

## 2. Style Engine Core

### 2.1 Public API

`wp_style_engine_get_styles()` is the primary entry point for turning a block-style object into CSS output.

It accepts:

- `block_styles` - the style tree to compile
- `selector` - optional CSS selector wrapper
- `context` - a storage key for capturing compiled rules
- `convert_vars_to_classnames` - whether preset references should stay as CSS vars or become class names

The return value is a normalized bundle:

```typescript
interface StyleEngineOutput {
  css?: string;
  declarations?: Record<string, string>;
  classnames?: string;
}
```

`wp_style_engine_get_stylesheet_from_css_rules()` and `wp_style_engine_get_stylesheet_from_context()` are the lower-level stylesheet builders. They are used when the caller already has selector/declaration pairs or wants to recompile a stored context.

### 2.2 `WP_Style_Engine`

`WP_Style_Engine` is the internal compiler. Its `BLOCK_STYLE_DEFINITIONS_METADATA` table maps block support properties to:

- CSS properties
- class name patterns
- CSS var templates
- value transformation callbacks

The rule is simple: the engine understands block support shape, not editor UI shape. It converts known style keys like color, spacing, typography, border, shadow, and dimensions into a consistent declaration model.

This class is also where the nested CSS rule model is supported. The `rules_group` concept lets the engine represent grouped rules such as `@media (...)` or `@layer ...` without flattening them prematurely.

### 2.3 CSS Rule Store

`WP_Style_Engine_CSS_Rules_Store` is a per-context registry of CSS rules.

It provides:

- `get_store()` / `get_stores()` - singleton-like store lookup
- `add_rule()` - create or fetch a rule for a selector
- `remove_rule()` - delete a selector from the store
- `get_all_rules()` - retrieve the stored rules for compilation

The store is intentionally keyed by context so a caller can keep separate rule buckets for block supports, global styles, or other generated CSS sources.

### 2.4 Rule and Declaration Objects

`WP_Style_Engine_CSS_Rule` and `WP_Style_Engine_CSS_Declarations` are the compile-time primitives.

`WP_Style_Engine_CSS_Rule` owns:

- a selector
- an optional nested rules group
- a declarations object

`WP_Style_Engine_CSS_Declarations` owns:

- sanitized property/value pairs
- filtering through `safecss_filter_attr()`
- string compilation with optional prettified output

The important constraint is that declarations are sanitized before printing. The style engine is not a raw string passthrough.

---

## 3. Font Runtime

### 3.1 Font Discovery

`WP_Font_Face_Resolver` is the bridge from theme.json data to font-face definitions.

It has two sources:

- `get_fonts_from_theme_json()` - reads typography font families from the merged global settings tree
- `get_fonts_from_style_variations()` - reads theme-defined style variations and merges any font-family definitions found there

The resolver does not render CSS. It only extracts and reshapes font-face definitions into a print-ready array.

It also normalizes:

- comma-separated family names
- `file:./` placeholders into real theme file URIs
- camelCase theme.json keys into kebab-case CSS keys

### 3.2 Font Face Printing

`wp_print_font_faces()` is the public print helper. If no explicit fonts array is passed, it resolves fonts from theme.json automatically.

`WP_Font_Face` performs the final print step:

1. Validate each font face declaration
2. Normalize defaults
3. Order `src` values by browser preference
4. Generate `@font-face` CSS
5. Print a `<style class='wp-fonts-local'>` tag

The validation contract is strict:

- `font-family` must be a non-empty string
- `src` must be a non-empty string or array of strings
- `font-weight` must be string or int
- `font-display` is clamped to the supported enum

This means malformed theme.json font-face data is dropped before it can hit the browser.

### 3.3 Font Collections and Library State

`WP_Font_Library` is the in-memory singleton registry for font collections.

It exposes:

- `register_font_collection()`
- `unregister_font_collection()`
- `get_font_collections()`
- `get_font_collection()`

`WP_Font_Collection` is the immutable-ish record type used by the library. It supports:

- direct array data
- lazy JSON file or URL loading
- schema-based sanitization
- optional categories and descriptions

The collection schema is intentionally opinionated. It sanitizes nested `font_family_settings`, `fontFace`, and category data before exposing them to the rest of the runtime.

### 3.4 Font Utilities

`WP_Font_Utils` contains the low-level normalization helpers used by both the library and the REST API:

- `sanitize_font_family()` - sanitizes and quotes CSS font-family lists
- `get_font_face_slug()` - generates a stable duplicate-detection slug
- `sanitize_from_schema()` - recursive tree sanitization
- `get_allowed_font_mime_types()` - upload MIME allowlist for OTF/TTF/WOFF/WOFF2

These helpers are shared because the same font data may arrive from theme.json, REST uploads, or registered collections.

### 3.5 Font Upload Directory

`wp_font_dir()` and `wp_get_font_dir()` resolve the upload target for font files.

`_wp_filter_font_directory()` rewrites the standard uploads directory to `.../fonts` and is used as a scoped `upload_dir` filter so font uploads land in the dedicated fonts subtree.

That directory behavior is not incidental. The REST upload flow and the file-deletion hooks both depend on the same path contract.

---

## 4. Global Styles Integration

`global-styles-and-settings.php` is the bridge that ties the style engine to the theme.json resolver.

The important helpers are:

- `wp_get_global_settings()`
- `wp_get_global_styles()`
- `wp_get_global_stylesheet()`
- `wp_add_global_styles_for_blocks()`
- `wp_get_theme_data_custom_templates()`
- `wp_get_theme_data_template_parts()`
- `wp_get_theme_directory_pattern_slugs()`
- `wp_clean_theme_json_cache()`

The important runtime pattern is:

1. Resolve merged theme.json data.
2. Convert theme file placeholders into real URIs.
3. Compile variables, presets, styles, and block styles.
4. Cache the derived output in the `theme_json` group.
5. Invalidate that cache when theme-json-derived data changes.

`wp_add_global_styles_for_blocks()` is especially important because it attaches block-specific CSS to the `global-styles` handle and respects on-demand block asset loading.

### Theme Support Bridge

`wp_theme_has_theme_json()` is the gate that decides whether the active theme should use the full theme.json pipeline or the compatibility path for classic themes.

That flag changes which stylesheet layers are emitted and whether classic theme supports are folded into the default output.

---

## 5. Runtime Hooks

The font and style runtime is wired into core lifecycle hooks:

- `wp_head` prints font faces
- `deleted_post` removes child font faces when a font family is deleted
- `before_delete_post` removes uploaded font files when a font face is deleted
- `block-editor.php` prints font faces for the editor bootstrap

The important point is that fonts are not only a front-end feature. They are part of the editor boot path and the storage lifecycle too.

---

## 6. Operational Implications

1. Style compilation is a structured transform, not string concatenation. The rule store and declaration objects are part of the contract.
2. Font data is validated twice: once when it enters the library or REST layer, and again when it is printed as CSS.
3. `file:./` theme.json placeholders are resolved before CSS or REST links are emitted. Callers should not expect raw placeholders at the edge.
4. The `theme_json` cache group is intentionally non-persistent. Derived style output must stay fresh across dynamic filters.
5. The font upload directory is a runtime contract. Anything that changes `wp_get_font_dir()` behavior affects REST uploads, deletion hooks, and font asset URLs.

---

## 7. Tovu Reconstruction Notes

### 7.1 Why this exists

This subsystem exists because modern site-building needs a structured path from theme metadata to compiled CSS, preset variables, and managed font assets. WordPress treats styles and fonts as governed data pipelines, not loose strings appended to templates.

### 7.2 What Tovu should preserve

- Structured style compilation from theme/editor metadata into canonical CSS output
- A first-class font library with validation, storage, and deletion lifecycle rules
- Shared style/font contracts across front end, editor boot, and REST transport
- Cache invalidation tied to style-source changes rather than ad hoc string regeneration

### 7.3 What Tovu can simplify

- Tovu does not need to preserve every theme.json compatibility branch if its theme/story surface is narrower
- The CSS compiler can be smaller than WordPress's style-engine pipeline as long as tokens, presets, and block/site styles stay canonical
- Font handling can integrate with Tovu's broader asset model instead of living in a mostly separate subsystem

### 7.4 Possible Tovu seams

- `src/features/theme-styles/` for style resolution and compiled output
- `src/features/font-library/` for managed font assets
- `src/core/ports/StyleCompilerPort.ts` for converting structured style data into CSS artifacts
- `src/core/ports/FontLibraryPort.ts` for upload, validation, and lifecycle operations

### 7.5 Suggested priority

- `V1`: canonical theme/editor style compilation and managed font assets if Tovu's editor exposes them
- `Later`: deeper classic-theme compatibility and advanced style-runtime optimizations
