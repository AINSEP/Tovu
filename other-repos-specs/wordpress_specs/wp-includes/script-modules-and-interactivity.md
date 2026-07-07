# Script Modules and Interactivity - WordPress-to-TypeScript Rewrite Spec

**Source files analyzed:**
- `wp-settings.php`
- `wp-includes/default-filters.php`
- `wp-includes/script-modules.php`
- `wp-includes/class-wp-script-modules.php`
- `wp-includes/assets/script-modules-packages.php`
- `wp-includes/interactivity-api/interactivity-api.php`
- `wp-includes/interactivity-api/class-wp-interactivity-api.php`
- `wp-includes/interactivity-api/class-wp-interactivity-api-directives-processor.php`
- `wp-includes/class-wp-speculation-rules.php`
- `wp-includes/speculative-loading.php`
- `wp-includes/blocks.php`
- `wp-includes/class-wp-block.php`

---

## 1. Overview

This subsystem spans three closely related runtime surfaces:

- Script modules: WordPress's server-side registry and printing layer for ES modules and import maps.
- The Interactivity API: a server-side directive processor that hydrates client stores, rewrites HTML, and integrates with interactivity-aware block output.
- Speculation rules: the footer-printed JSON structure that enables browser prefetch/prerender behavior.

They are separate features, but they share bootstrap, load-order, and render-time integration points. The shared theme is that WordPress does not hand these features raw browser control. It registers them centrally, derives the final asset graph on the server, and prints only what is safe and needed for the current request.

---

## 2. Bootstrap And Load Order

`wp-settings.php` loads the runtime in this order:

1. `class-wp-script-modules.php`
2. `script-modules.php`
3. `interactivity-api/class-wp-interactivity-api.php`
4. `interactivity-api/class-wp-interactivity-api-directives-processor.php`
5. `interactivity-api/interactivity-api.php`
6. `class-wp-plugin-dependencies.php`
7. `class-wp-url-pattern-prefixer.php`
8. `class-wp-speculation-rules.php`
9. `speculative-loading.php`

After that, WordPress wires the hook entrypoints:

- `after_setup_theme` -> `wp_script_modules()->add_hooks()`
- `after_setup_theme` -> `wp_interactivity()->add_hooks()`

Default filter registration also matters:

- `wp_default_script_modules()` is attached to `wp_default_scripts`.
- `wp_print_speculation_rules()` is attached to `wp_footer`.

This means the module registry is initialized very early, but actual printing stays deferred until the theme and block rendering phases have discovered what is needed.

---

## 3. Script Module Registry

### 3.1 `WP_Script_Modules`

`WP_Script_Modules` is the core registry class. Its state is intentionally small:

- `registered`: module metadata keyed by module ID
- `queue`: enqueued module IDs
- `done`: already printed module IDs
- `dependents_map`: cached reverse dependency lookups
- `a11y_available`: whether the accessibility module was discovered
- `priorities`: valid `fetchpriority` values
- `modules_with_missing_dependencies`: warning suppression for unresolved graphs

The public contract is:

- `register( $id, $src, $deps = array(), $version = false, $args = array() )`
- `enqueue( $id, $src = '', $deps = array(), $version = false, $args = array() )`
- `dequeue( $id )`
- `deregister( $id )`
- `get_queue()`
- `set_fetchpriority( $id, $priority )`
- `set_in_footer( $id, $in_footer )`
- `add_hooks()`

Dependencies are normalized to arrays of `array( 'id' => ..., 'import' => 'static'|'dynamic' )`. Strings are treated as static imports.

### 3.2 Printing Model

`add_hooks()` splits output across multiple surfaces:

- import map printing
- module `<script type="module">` tags
- `<link rel="modulepreload">` hints
- JSON data blobs for modules
- accessibility live-region markup

The distinction matters because module discovery happens incrementally during rendering. WordPress may learn about more module IDs while rendering blocks, so import-map generation must happen late enough to see the final queue.

### 3.3 Output Contracts

The main printing methods are:

- `print_import_map()`
- `print_head_enqueued_script_modules()`
- `print_enqueued_script_modules()`
- `print_script_module_preloads()`
- `print_script_module_data()`
- `print_a11y_script_module_html()`

Important rules:

- Import maps are only printed if there is at least one import entry.
- Module preloads only cover static dependencies that are not themselves enqueued.
- Fetch priority is computed from the highest-priority dependent relationship, not just the module's own setting.
- `@wordpress/a11y` gets special handling because it requires extra DOM markup.

---

## 4. Public API Contracts

### 4.1 Wrapper Functions

`wp-includes/script-modules.php` exposes the procedural entrypoints:

- `wp_script_modules()`
- `wp_register_script_module()`
- `wp_enqueue_script_module()`
- `wp_dequeue_script_module()`
- `wp_deregister_script_module()`
- `wp_default_script_modules()`

The wrapper layer is intentionally thin. It exists to provide the standard WordPress procedural API while keeping the registry class as the canonical implementation.

### 4.2 Versioning And Src Resolution

`get_src()` appends `ver` query parameters according to the usual WordPress rules:

- `false` means use the installed WordPress version
- `null` means no version parameter
- any other string is used verbatim

The final URL then passes through the `script_module_loader_src` filter.

### 4.3 Data Surface

`print_script_module_data()` reads per-module data from filters named:

- `script_module_data_{$module_id}`

That data is serialized as JSON and emitted in a script tag of type `application/json` with an ID of the form `wp-script-module-data-{$module_id}`. This is the supported client bootstrap path for essential module data.

---

## 5. Default Module Catalog

`wp_default_script_modules()` reads `wp-includes/assets/script-modules-packages.php` and converts file paths into module IDs.

The generated ID rules are:

- Prefix `@wordpress/`
- Remove `.min.js`
- Remove `/index` when present

Examples:

- `interactivity/index.js` -> `@wordpress/interactivity`
- `interactivity/debug.js` -> `@wordpress/interactivity/debug`
- `block-library/query/view.js` -> `@wordpress/block-library/query/view`

Special handling is applied to the interactivity modules:

- `@wordpress/interactivity/debug` only loads when `SCRIPT_DEBUG` is true.
- `@wordpress/interactivity` only loads when `SCRIPT_DEBUG` is false.

The default catalog also assigns loading metadata:

- Interactivity, block-library modules, and `@wordpress/a11y` get `fetchpriority: low` and `in_footer: true`.
- Block-library modules are marked as compatible with client-side navigation.

This function is the authoritative source of the built-in module graph. Any rewrite has to preserve the file-name-to-ID mapping and the special cases.

---

## 6. Interactivity API

### 6.1 Server Runtime

`WP_Interactivity_API` is the server-side engine. Its state includes:

- `state_data`
- `config_data`
- `derived_state_closures`
- `has_processed_router_region`
- `script_modules_that_can_load_on_client_navigation`
- directive namespace and context stacks
- the currently processed element snapshot

The procedural wrapper layer in `interactivity-api.php` exposes the author-facing entrypoints:

- `wp_interactivity()`
- `wp_interactivity_process_directives( $html )`
- `wp_interactivity_state( $store_namespace = null, $state = array() )`
- `wp_interactivity_config( $store_namespace, $config = array() )`
- `wp_interactivity_data_wp_context( $context, $store_namespace = '' )`
- `wp_interactivity_get_context( $store_namespace = null )`
- `wp_interactivity_get_element()`

The main public methods are:

- `state( ?string $store_namespace = null, ?array $state = null )`
- `config( string $store_namespace, array $config = array() )`
- `get_context( ?string $store_namespace = null )`
- `get_element()`
- `process_directives( string $html )`
- `add_client_navigation_support_to_script_module( string $script_module_id )`
- `add_hooks()`

### 6.2 Directive Processing

`WP_Interactivity_API_Directives_Processor` extends `WP_HTML_Tag_Processor` and processes the server directives:

- `data-wp-interactive`
- `data-wp-router-region`
- `data-wp-context`
- `data-wp-bind`
- `data-wp-class`
- `data-wp-style`
- `data-wp-text`
- `data-wp-each`

Processing is order-sensitive:

- `data-wp-interactive` establishes the namespace stack.
- `data-wp-context` pushes merged context.
- `data-wp-bind`, `data-wp-class`, `data-wp-style`, and `data-wp-text` mutate the current element.
- `data-wp-each` must run last because it expands template content and advances the cursor.

The runtime contract is fail-safe:

- Unbalanced HTML returns the original HTML from `process_directives()`.
- Directives inside SVG or MathML are ignored server-side.
- The current element is only available during directive processing.

### 6.3 Client Hydration

The server-side state and config are serialized into the `script_module_data_@wordpress/interactivity` payload. Derived state closures accessed during rendering are also tracked and serialized so the client can hydrate lazily computed values.

`add_hooks()` installs:

- `script_module_data_@wordpress/interactivity`
- `script_module_data_@wordpress/interactivity-router`
- `wp_script_attributes` filtering for client-navigation support

That is the bridge between server-rendered directives and the client runtime.

### 6.4 Router Markup

`data-wp-router-region` triggers a one-time enqueue of an inline stylesheet and adds footer markup for the router loading bar / live region.

The printed router markup uses `data-wp-interactive="core/router"` and class-based state bindings, so it is itself an interactivity-enabled fragment.

---

## 7. Speculation Rules

### 7.1 Rule Object

`WP_Speculation_Rules` stores rules by mode and validates them before serialization. Valid modes are:

- `prefetch`
- `prerender`

Valid eagerness levels are:

- `immediate`
- `eager`
- `moderate`
- `conservative`

Valid sources are:

- `list`
- `document`

The object rejects duplicate rule IDs, invalid modes, invalid eagerness values, and invalid source combinations.

### 7.2 Configuration And Print Path

`wp_get_speculation_rules_configuration()` decides whether speculative loading is enabled. By default it only turns on for logged-out visitors on sites with pretty permalinks.

`wp_get_speculation_rules()` then:

- builds the base exclude-path list
- prefixes site-relative patterns with `WP_URL_Pattern_Prefixer`
- applies `wp_speculation_rules_href_exclude_paths`
- creates the default document-level rule
- fires `wp_load_speculation_rules` for amendments

`wp_print_speculation_rules()` serializes the final object into a `script[type="speculationrules"]` tag. `default-filters.php` attaches that to `wp_footer`, so it prints late and only on pages that actually need it.

### 7.3 Operational Boundaries

Speculation rules are intentionally conservative:

- Logged-in users are off by default.
- Non-pretty-permalink installs are off by default.
- `immediate` eagerness is not allowed for the default document-level rule.
- Core excludes admin URLs, login-like paths, and asset roots by default.

Any rewrite should preserve those defaults because they are part of the product safety model, not just implementation detail.

---

## 8. Asset Pipeline Integration

### 8.1 Block Metadata To Module IDs

`blocks.php` bridges block metadata to script module registration through `register_block_script_module_id()`.

The flow is:

1. Read the block metadata field, usually `viewScriptModule`.
2. If it is a file path, look for a sibling `.asset.php` file.
3. Derive the generated module ID from `generate_block_asset_handle()`.
4. Register the module through `wp_register_script_module()`.
5. Pass through dependencies, version, and loading args from the asset metadata.

The metadata pipeline also sets interactivity-related flags:

- `supports.interactivity`
- `supports.interactivity.clientNavigation`

If the block is interactive, the module is deprioritized with `fetchpriority: low` and moved to the footer.

### 8.2 Block Render-Time Enqueue

`WP_Block::render()` captures the module queue before rendering, enqueues block-owned script modules during render, and restores the queue afterward if the rendered block ends up empty. That prevents asset leakage from one render call to the next.

This matters for dynamic blocks because their script-module dependencies are discovered during render, not at registration time.

### 8.3 Client Navigation Support

Modules marked through `wp_interactivity()->add_client_navigation_support_to_script_module()` receive a `data-wp-router-options` attribute with `loadOnClientNavigation: true` when the script tag is emitted.

That behavior is the bridge between:

- block metadata
- the interactivity runtime
- script-module printing
- client-side navigation in the router

---

## 9. Operational Implications

When decomposing this subsystem into TypeScript, keep the following contracts intact:

- Registry state must be server-owned and deterministic.
- Module IDs, import-map keys, and generated handles must match the PHP naming rules exactly.
- Footer/head placement depends on theme type and module metadata.
- Directive processing must be conservative on malformed HTML.
- Speculation rules must remain opt-in and conservative by default.

The most important integration risk is cross-surface leakage: module registration, interactivity hydration, and speculative loading all touch the same rendering path, but each has different print-time rules. Treat them as separate adapters over the same core asset graph.

---

## 10. Tovu Reconstruction Notes

### 10.1 Why this exists

This subsystem exists because modern CMS output is not just static markup plus generic bundles. WordPress is separating:

- module registration
- server-side directive hydration
- client-navigation support
- speculative loading

so they can evolve independently while still meeting on the same page render.

### 10.2 What Tovu should preserve

- A server-owned asset/module graph
- Clear separation between interactivity hydration, client navigation, and speculative preloading
- Conservative defaults for any speculative or navigation-enhancing behavior
- Render-time coupling between structured content metadata and emitted modules

### 10.3 What Tovu can simplify

- Tovu does not need WordPress’s exact import-map/module-id rules
- Speculation rules can come later if the asset/runtime graph is already explicit
- V1 interactivity can start with a smaller directive set than WordPress

### 10.4 Possible Tovu seams

- `src/core/ports/AssetGraphPort.ts` for module/script/style registration
- `src/core/ports/InteractivityRuntimePort.ts` for server-side hydration/directive processing
- `src/core/ports/NavigationEnhancementPort.ts` for client-navigation and speculation behavior

### 10.5 Suggested priority

- `V1`: server-owned asset graph and minimal interactivity hydration model
- `Later`: client navigation integration, speculation policies, richer block-owned module behavior
