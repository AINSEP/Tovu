# Template Canvas and Theme Previews - Specification

**Source files analyzed:**
- `wp-includes/template-canvas.php`
- `wp-includes/theme-previews.php`
- `wp-includes/block-template.php`
- `wp-includes/block-template-utils.php`
- `wp-includes/theme.php`
- `wp-includes/default-filters.php`
- `wp-admin/includes/theme.php`
- `wp-admin/includes/class-theme-installer-skin.php`
- `wp-includes/class-wp-theme.php`

---

## 1. Overview

These two files form the small but critical bridge between block-theme resolution and the final browser response for a previewed site.

- `wp-includes/template-canvas.php` is the generic HTML shell used to render a resolved block template.
- `wp-includes/theme-previews.php` rewires theme lookup and Site Editor requests so a previewed block theme behaves like the active theme without permanently switching it.

Together they support:

- block themes and Full Site Editing
- template selection through `resolve_block_template()` and `locate_block_template()`
- theme preview gating through `current_user_can( 'switch_themes' )`
- global styles and block asset output via `wp_head()` / `wp_footer()`
- iframe-based editor and Site Editor rendering

The key contract is:

1. Theme and template selection resolve the correct block template.
2. The resolved template is rendered inside `template-canvas.php`.
3. If a preview theme is requested, `theme-previews.php` makes all theme lookups and Site Editor API calls behave as if that theme were active.

---

## 2. Template Canvas

### 2.1 Purpose

`wp-includes/template-canvas.php` is not a template selector. It is the final response wrapper for block templates after core has already decided which `wp_template` content to render.

Its job is to:

- fetch the current block template HTML
- print a complete HTML document
- preserve the normal WordPress hook surface for scripts, styles, body-open logic, and footer scripts

The file is intentionally minimal so the block rendering pipeline stays centralized in `block-template.php`.

### 2.2 Execution Flow

The file runs in this order:

1. Call `get_the_block_template_html()` and store the result in `$template_html`.
2. Emit the `<!DOCTYPE html>` document wrapper.
3. Print `<html>` with `language_attributes()`.
4. Print `<head>` with the site charset and `wp_head()`.
5. Print `<body>` with `body_class()` and `wp_body_open()`.
6. Echo the resolved block template HTML.
7. Print `wp_footer()`.

That ordering matters. The file comments explicitly note that `get_the_block_template_html()` runs before `<head>` so blocks can enqueue scripts and styles that are then printed during `wp_head()`.

### 2.3 Output Contract

The canvas does not invent layout. It assumes the block template content already contains the page structure, typically including:

- template parts such as header and footer blocks
- block-generated markup from `do_blocks()`
- any theme or block assets registered during rendering

The canvas only supplies the HTML document shell around that content.

### 2.4 Hook Surface Preserved by the Canvas

The file deliberately keeps the usual theme hooks intact:

| Hook or helper | Role in the canvas |
|---|---|
| `language_attributes()` | Prints `<html>` attributes for locale and direction |
| `bloginfo( 'charset' )` | Supplies the page charset meta tag |
| `wp_head()` | Emits enqueued styles, scripts, block assets, global styles, and preview-related head output |
| `body_class()` | Adds body classes derived from the current query and theme context |
| `wp_body_open()` | Preserves the modern body-open insertion point |
| `wp_footer()` | Flushes footer scripts and late block assets |

This makes the canvas compatible with:

- classic front-end expectations
- block theme asset loading
- plugin code that hooks into `wp_head`, `wp_body_open`, or `wp_footer`

---

## 3. Block Template Rendering Path

`template-canvas.php` only works because `block-template.php` prepares the globals it reads.

### 3.1 Template Resolution

When block themes are active, `locate_block_template()` can replace a PHP template path with `ABSPATH . WPINC . '/template-canvas.php'`.

The selection path is:

1. `locate_block_template()` checks `current_theme_supports( 'block-templates' )`.
2. It narrows the candidate hierarchy when a PHP fallback template already exists.
3. It calls `resolve_block_template()`.
4. If a matching `WP_Block_Template` is found, it stores the template ID and content in the globals used by the canvas.
5. It adds:
   - `_block_template_viewport_meta_tag` to `wp_head`
   - `_block_template_render_title_tag` to `wp_head`
6. It returns `template-canvas.php` as the file to include.

### 3.2 Template Content Assembly

`get_the_block_template_html()` performs the actual render transformation:

1. If no template content exists:
   - logged-in users get a visible "No matching template found" message
   - logged-out users get an empty string
2. It processes embeds and shortcodes:
   - `run_shortcode()`
   - `autoembed()`
   - `shortcode_unautop()`
   - `do_shortcode()`
3. It runs `do_blocks()`.
4. For singular templates from the current theme, it forces the main loop to run once so query-dependent blocks behave correctly even when the template omits `core/query` and `core/post-template`.
5. It applies text and media formatting:
   - `wptexturize()`
   - `convert_smilies()`
   - `wp_filter_content_tags()`
   - newline-safe escaping of `]]>`
6. It wraps the result in `<div class="wp-site-blocks">`.

That wrapper is the same scoping boundary used by block-theme styles and descendant selectors.

### 3.3 Why the Canvas Must Run Before `<head>`

Because template rendering happens before `wp_head()`, blocks can register or enqueue assets during render and still have those assets printed in the head. This is the essential block-theme behavior:

- blocks render markup
- rendering can enqueue scripts/styles
- `wp_head()` flushes those registrations into the page

If the canvas delayed `get_the_block_template_html()` until after `wp_head()`, block assets would miss the head output window.

### 3.4 Interaction with Global Styles

The canvas itself does not compute global styles, but it participates in their delivery:

- `wp_head()` is where global style stylesheets and block-related inline styles are emitted.
- The `wp-site-blocks` wrapper gives global-style selectors a stable root.
- The final output is the same front-end document shape consumed by block theme styling and the Site Editor preview iframe.

This is an important distinction: `template-canvas.php` is a render shell, while `wp-includes/theme-json-and-global-styles` is the style compiler. The canvas simply makes sure the compiler output has a place to land.

---

## 4. Theme Preview Pipeline

`wp-includes/theme-previews.php` enables temporary theme previews for block themes without changing the stored active theme options.

### 4.1 Preview Gate

The entire preview system is gated by the `wp_theme_preview` query parameter.

`wp_initialize_theme_preview_hooks()` is attached on `plugins_loaded` at priority `1` in `default-filters.php`. When the query parameter is present, it registers:

- `stylesheet` filter -> `wp_get_theme_preview_path()`
- `template` filter -> `wp_get_theme_preview_path()`
- `init` action -> `wp_attach_theme_preview_middleware()`
- `admin_head` action -> `wp_block_theme_activate_nonce()`

The early `plugins_loaded` timing matters because the preview hooks need pluggable capability checks such as `current_user_can()`.

### 4.2 Preview Path Resolution

`wp_get_theme_preview_path( $current_stylesheet = null )` is the core filter callback.

Behavior:

1. If the current user cannot `switch_themes`, return the current value unchanged.
2. Read `$_GET['wp_theme_preview']` and sanitize it with `sanitize_text_field( wp_unslash(...) )`.
3. Load the preview theme with `wp_get_theme( $preview_stylesheet )`.
4. If the theme object is valid, return either:
   - `$wp_theme->get_template()` when filtering `template`
   - `$wp_theme->get_stylesheet()` when filtering `stylesheet`
5. If the preview theme is invalid or missing, return the original value.

The `current_filter() === 'template'` branch is important for child themes. It preserves the active template/stylesheet split instead of forcing both lookups to the same slug.

### 4.3 Capability and Validation Rules

The preview path only applies if:

- the current user can `switch_themes`
- the preview slug resolves to a valid `WP_Theme`

That means previewing a theme never succeeds for unauthorized users, and malformed preview values fall back to the real active theme.

### 4.4 Site Editor API Middleware

`wp_attach_theme_preview_middleware()` adds inline JavaScript after `wp-api-fetch`.

It injects:

```js
wp.apiFetch.use( wp.apiFetch.createThemePreviewMiddleware( previewSlug ) );
```

That middleware appends `wp_theme_preview` to API requests from the Site Editor so REST responses resolve against the preview theme too. Without this, the editor chrome and the front-end preview iframe could disagree about which theme is active.

### 4.5 Activation Nonce

`wp_block_theme_activate_nonce()` prints a JavaScript constant:

- `window.WP_BLOCK_THEME_ACTIVATE_NONCE`

The nonce is created from:

- action: `switch-theme_` + preview path

This nonce is used in the Site Editor activation flow so a previewed block theme can be activated from within the editor.

### 4.6 Preview Hook Scope

The preview hooks do not run globally. They only activate when `wp_theme_preview` exists in the request.

That keeps the preview machinery isolated to:

- Site Editor preview requests
- admin theme actions that intentionally carry the preview parameter

---

## 5. Integration With Theme and Template Loading

### 5.1 Theme Object Resolution

`theme-previews.php` uses `wp_get_theme()` rather than directly manipulating options. That matters because `WP_Theme` already resolves:

- stylesheet vs template directory names
- parent-child theme relationships
- theme root lookup
- error states for missing or invalid themes

The preview system therefore inherits the same validation and fallback behavior as the normal theme loading path.

### 5.2 Filtered Theme Options

The `stylesheet` and `template` filters are the mechanism by which previewing affects core lookups.

Those filtered values feed into:

- `get_stylesheet()`
- `get_template()`
- `get_stylesheet_directory()`
- `get_template_directory()`
- `wp_get_theme()`
- any downstream template and asset resolution that depends on the active theme identity

This is the part that makes a previewed block theme behave like the active theme without writing anything to the database.

### 5.3 Admin and Installer Entry Points

The preview parameter is also threaded into theme-related admin URLs:

- `wp-admin/includes/theme.php` adds `wp_theme_preview` to the Site Editor action for block themes that are not currently active.
- `wp-admin/includes/class-theme-installer-skin.php` also passes the same query arg for theme previews during installation flows.

Those entry points ensure preview state survives the round-trip from theme lists or install screens into the Site Editor.

### 5.4 Template Canvas and the Active Theme Contract

Once the preview filters are in place, the block-template loader sees the preview theme as active and can resolve its template files and template parts normally.

In practice:

1. `get_stylesheet()` / `get_template()` resolve to the preview theme paths.
2. `resolve_block_template()` and `get_block_templates()` search the preview theme data.
3. `locate_block_template()` chooses `template-canvas.php` when a block template should render.
4. `template-canvas.php` prints the final block template HTML.

That sequence is the core preview loop.

---

## 6. Iframe and Editor Rendering

### 6.1 Why the Site Editor Uses This Path

The Site Editor and block theme preview experience are effectively front-end renders inside an editor-controlled browsing context, commonly an iframe. The preview path must therefore satisfy two environments at once:

- the front-end document that the iframe loads
- the editor chrome that issues API requests and activation actions

`template-canvas.php` serves the front-end document, while `theme-previews.php` keeps editor-side requests synchronized with the preview theme.

### 6.2 Front-End Iframe Document

The iframe document needs a full, standards-compliant HTML shell, not just template markup.

`template-canvas.php` supplies that shell by including:

- `doctype`
- `<html>`
- `<head>`
- `wp_head()`
- `<body>`
- `wp_body_open()`
- template HTML
- `wp_footer()`

That means the same template content can render:

- on the public site
- in the Site Editor preview iframe
- in preview-related admin flows

### 6.3 Editor Request Synchronization

`wp_attach_theme_preview_middleware()` is the editor-side companion to the iframe document.

It ensures that when the Site Editor makes REST requests for:

- global styles
- templates
- template parts
- theme data

those requests are evaluated using the preview theme slug. This keeps the editor UI, the API responses, and the rendered iframe in sync.

### 6.4 Theme Activation From Preview

`WP_BLOCK_THEME_ACTIVATE_NONCE` gives the editor a secure activation token tied to the previewed theme path. That closes the loop between preview, edit, and activation.

---

## 7. Operational Contract

1. `template-canvas.php` must stay small and deterministic. It should remain a shell around already-resolved template HTML.
2. `get_the_block_template_html()` must continue to run before `wp_head()` so block assets and styles can be emitted in the head.
3. Preview hooks must stay capability-gated by `switch_themes`.
4. Preview requests must preserve the template vs stylesheet split for child themes.
5. The Site Editor preview experience depends on both the front-end canvas and the API middleware; changing only one side breaks consistency.
6. Any rewrite should preserve the `wp-site-blocks` wrapper because downstream block styles and selectors expect it.

---

## 8. TypeScript Rewrite Notes

If this subsystem is reimplemented in TypeScript, the clean split is:

- `TemplateCanvasRenderer` for the HTML shell
- `ThemePreviewService` for request-scoped theme overrides
- `BlockTemplateResolver` for template selection and content assembly
- `EditorPreviewMiddleware` for API request decoration

The important boundary is that preview state should be request-scoped and swappable. It should not leak into persistent theme settings or global application state.

## Tovu Reconstruction Notes

### Why this exists

This subsystem exists to bridge block template resolution, final HTML shell rendering, and request-scoped theme preview behavior. The key lesson is that template selection and preview state are separate from the final response wrapper.

### What Tovu should preserve

- A renderer shell that prints the final HTML document around resolved template content
- Template resolution that happens before head output so assets can be enqueued in time
- Request-scoped preview state that can override theme lookups without mutating stored settings
- A middleware hook for editor/API requests so previews stay consistent across surfaces

### What Tovu can simplify

- Tovu can collapse some of the block-theme compatibility branches if it owns the rendering stack end-to-end
- The preview UX does not need to mirror WordPress exactly if the request-scoped override stays correct
- The important part is preserving the render boundary, not every historical bootstrap hook

### Possible Tovu seams

- `src/rendering/template-canvas/` for the HTML shell
- `src/themes/preview/` for request-scoped theme overrides
- `src/themes/templates/` for block template resolution and assembly
- `src/editor/middleware/` for preview-aware API request decoration

### Suggested priority

- `V1`: template shell, block template resolution, and preview-scoped theme overrides
- `Later`: editor middleware polish and compatibility branches
