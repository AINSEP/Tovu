# Assets and Dependencies - WordPress-to-TypeScript Rewrite Spec

**Source files analyzed:**
- `wp-includes/class-wp-dependencies.php`
- `wp-includes/class-wp-scripts.php`
- `wp-includes/class-wp-styles.php`
- `wp-includes/functions.wp-scripts.php`
- `wp-includes/functions.wp-styles.php`
- `wp-includes/script-loader.php`
- `wp-includes/global-styles-and-settings.php`

---

## 1. Overview

WordPress assets are not a single loader. They are a layered dependency graph with two registries:

- `WP_Scripts` for JavaScript.
- `WP_Styles` for stylesheets.

Both extend `WP_Dependencies`, which owns the handle registry, queue, dependency resolution, and final print order. The public API is the thin wrapper set in `functions.wp-scripts.php` and `functions.wp-styles.php` (`wp_register_script()`, `wp_enqueue_script()`, `wp_register_style()`, `wp_enqueue_style()`, and the inline/translations helpers).

The important contract is that registration and printing are separate phases. Core registers a large default catalog at singleton initialization time, plugins and themes add handles later, and the print phase walks the dependency graph in a stable order. Asset loading for the block editor, global styles, and block themes builds on top of that same primitive.

---

## 2. Core Registry Model

### 2.1 `WP_Dependencies`

`WP_Dependencies` provides the shared state:

| Property | Meaning |
|---|---|
| `registered` | Map of handle to `_WP_Dependency` |
| `queue` | Enqueued handles |
| `to_do` | Flattened dependency walk order |
| `done` | Handles already printed |
| `args` | Extra query-string args per handle |
| `groups` | Footer/head grouping state |

Its core methods are:

- `add()`
- `add_data()`
- `enqueue()`
- `dequeue()`
- `query()`
- `all_deps()`
- `do_items()`
- `do_item()`
- `set_group()`

`all_deps()` is the key graph step. It recursively resolves dependencies, filters out missing handles, and prevents duplicate queue entries. `do_items()` then iterates `to_do` and calls the subclass-specific `do_item()`.

### 2.2 `WP_Scripts`

`WP_Scripts` extends the base class with script-specific behavior:

- inline script support
- translation support
- footer grouping
- script tag generation
- backward-compatible handle args and extra data

Important methods include `do_item()`, `add_inline_script()`, `set_translations()`, `all_deps()`, and `add_data()`.

### 2.3 `WP_Styles`

`WP_Styles` mirrors the same architecture for CSS. Its `do_item()` method prints `<link>` tags, handles RTL replacement, concatenation, inline styles, and alternate stylesheet metadata. `add_inline_style()` and `add_data()` attach extra CSS or metadata such as `path` and `rtl`.

---

## 3. Load Order

### 3.1 Singleton Boot

`wp_scripts()` and `wp_styles()` lazily instantiate the registries. Their constructors immediately call:

- `wp_default_scripts( $scripts )`
- `wp_default_styles( $styles )`

Those functions are the first load-order boundary. They seed the registry with WordPress core handles, default URLs, versions, and localizations.

### 3.2 Enqueue Phases

The main enqueue hooks are:

| Hook / function | Context |
|---|---|
| `wp_enqueue_scripts()` | Front end enqueue hook |
| `wp_print_footer_scripts()` | Footer script print hook |
| `print_admin_styles()` | Admin stylesheet print phase |
| `print_late_styles()` | Styles queued too late for the head |
| `enqueue_block_assets` | Block assets shared by editor and front end |
| `enqueue_block_editor_assets` | Block editor-only assets |

The enqueue phase adds handles to the registry. The print phase resolves and emits them.

### 3.3 Concatenation and Compression

`script_concat_settings()` controls the global concatenation flags:

- `CONCATENATE_SCRIPTS`
- `COMPRESS_SCRIPTS`
- `COMPRESS_CSS`

`_print_styles()` and the script print pipeline use those flags to decide whether to emit a combined load URL or individual tags.

---

## 4. Public API Contracts

### 4.1 Scripts Wrappers

`functions.wp-scripts.php` exposes the standard entry points:

- `wp_scripts()`
- `wp_print_scripts()`
- `wp_add_inline_script()`
- `wp_register_script()`
- `wp_deregister_script()`
- `wp_enqueue_script()`
- `wp_dequeue_script()`
- `wp_script_is()`
- `wp_set_script_translations()`

The key contract is that `wp_enqueue_script()` may register the handle if a source is provided, but it never overwrites an existing registration.

### 4.2 Styles Wrappers

`functions.wp-styles.php` exposes the CSS counterparts:

- `wp_styles()`
- `wp_print_styles()`
- `wp_add_inline_style()`
- `wp_register_style()`
- `wp_deregister_style()`
- `wp_enqueue_style()`
- `wp_dequeue_style()`
- `wp_style_is()`
- `wp_style_add_data()`

`wp_add_inline_style()` strips accidental `<style>` tags from its input. `wp_style_add_data( $handle, 'path', $file )` is the hook that allows later inlining of small stylesheets.

---

## 5. Default Registries

### 5.1 `wp_default_scripts()`

`wp_default_scripts()` defines the canonical handles, base URLs, and translation payloads used across core. Examples include:

- `common`
- `utils`
- `quicktags`
- `editor`
- `heartbeat`
- `wp-a11y`
- `wp-api-request`
- `wp-auth-check`
- `jquery` and jQuery UI handles

These defaults are not just convenience registrations. Other subsystems assume they exist and enqueue them by handle name only.

### 5.2 `wp_default_styles()`

`WP_Styles` fires `wp_default_styles` during construction. That is the equivalent place where default CSS handles are seeded, including admin styles, block library styles, and the theme/editor style scaffolding used later by the block and global styles pipelines.

---

## 6. Block and Theme Integration

### 6.1 Shared Block Assets

`wp_common_block_scripts_and_styles()` is the shared entry point for front-end and editor block assets. It enqueues:

- `wp-block-library`
- `wp-block-library-theme` when the theme opts into block styles and separate core assets are not enabled

It then fires `enqueue_block_assets`.

### 6.2 Separate Block Assets

`wp_should_load_separate_core_block_assets()` and `wp_should_load_block_assets_on_demand()` decide whether block assets are loaded globally or only when a block is rendered.

`wp_enqueue_registered_block_scripts_and_styles()` then iterates the registered block types and enqueues:

- `style_handles`
- `script_handles`
- `editor_style_handles`
- `editor_script_handles`

depending on the current screen and the asset-loading mode.

### 6.3 Global Styles

`wp_enqueue_global_styles()` is the bridge between `theme.json` and the style registry. It:

1. Adds a `wp_theme_json_get_style_nodes` filter so block nodes can be omitted when on-demand block assets are enabled.
2. Calls `wp_get_global_stylesheet()`.
3. Registers and enqueues `global-styles`.
4. Appends block-specific inline styles via `wp_add_global_styles_for_blocks()`.

`wp_enqueue_global_styles_css_custom_properties()` separately enqueues the CSS custom property layer used by preset variables.

### 6.4 Block Style Variations

`enqueue_block_styles_assets()` and `enqueue_editor_block_styles_assets()` use the block styles registry. The front end either enqueues the registered stylesheet or attaches inline styles to `global-styles`; the editor registers the variation definitions in JavaScript with `wp.blocks.registerBlockStyle()`.

---

## 7. Inline Assets and File-Based Inlining

`wp_maybe_inline_styles()` scans the style queue for handles with a `path` metadata entry. If the combined size stays under the configured threshold, it:

- reads the file contents
- normalizes relative URLs
- stores the original `src` in `inlined_src`
- replaces the external `src` with inline `after` data

This is the same contract used by `wp_enqueue_block_style()` when a block stylesheet includes an absolute path. The system is designed so theme and block assets can be shipped as physical files but later inlined when that is cheaper.

---

## 8. Operational Implications

1. Handle names are stable API. Many callers enqueue by handle only and assume core registered them.
2. Dependency order is graph-based, not caller-order-based. Missing dependencies are treated as a registration bug, not a recoverable runtime state.
3. `wp_add_inline_script()` and `wp_add_inline_style()` attach to an existing handle; they do not create independent assets.
4. Block and theme systems rely on the same registry, so a change to `script-loader.php` can affect editor boot, front-end rendering, and global styles output at once.
5. Cache and inlining behavior depends on `path` metadata, development mode, and block asset loading mode. Those flags materially change the final HTML payload.

---

## 9. Tovu Reconstruction Notes

### 9.1 Why this exists

This subsystem exists to make assets a governed runtime dependency graph rather than a collection of ad hoc `<script>` and `<link>` tags. WordPress uses it as the shared contract for admin boot, front-end rendering, editor startup, block assets, and theme-derived styles.

### 9.2 What Tovu should preserve

- One canonical asset registry with stable handles/identifiers and dependency ordering
- A shared asset system across admin, front end, and editor shells
- Inline data and inline asset attachment tied to existing handles rather than free-floating blobs
- Theme/block/editor integration built on the same registry, not parallel bespoke loaders

### 9.3 What Tovu can simplify

- Tovu can back the registry with a modern build manifest instead of hand-registering every asset in PHP-style bootstrap code
- Legacy default handles can be reduced to the set Tovu actually needs
- On-demand loading and inlining heuristics can start narrower if the registry shape stays extensible

### 9.4 Possible Tovu seams

- `src/features/assets/` for registry policy and runtime enqueue logic
- `src/core/ports/AssetRegistryPort.ts` for register/enqueue/inline contracts
- `src/core/ports/EditorAssetPort.ts` for editor/bootstrap-specific asset injection
- `src/core/ports/ThemeAssetPort.ts` for theme and structured-style integration

### 9.5 Suggested priority

- `V1`: shared asset registry, dependency graph, inline-data attachment, editor/front/admin integration
- `Later`: richer file-based inlining and advanced on-demand block-asset heuristics
