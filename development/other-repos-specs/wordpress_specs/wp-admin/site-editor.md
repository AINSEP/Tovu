# Site Editor - WordPress-to-TypeScript Rewrite Spec

**Source files analyzed:**
- `wp-admin/site-editor.php`
- `wp-admin/edit-form-blocks.php`
- `wp-includes/global-styles-and-settings.php`
- `wp-includes/class-wp-theme-json-resolver.php`
- `wp-includes/theme.php`

---

## 1. Overview

`wp-admin/site-editor.php` is the top-level bootstrap for the block-based Site Editor. It is not a generic router. It is a privileged screen controller that:

1. authenticates the user for `edit_theme_options`
2. remaps old editor URLs to the new permalink form
3. builds a `WP_Block_Editor_Context`
4. preloads the REST data the editor needs
5. boots the `wp-edit-site` JavaScript application

The page shares a large amount of infrastructure with `wp-admin/edit-form-blocks.php`, but the Site Editor owns the navigation model for templates, template parts, patterns, styles, and site-wide global styles. Its data contract is tightly coupled to `WP_Theme_JSON_Resolver` and the block editor REST APIs.

---

## 2. Request Flow

### 2.1 Bootstrap and Capability Check

The file starts by requiring `admin.php`. It then immediately denies access unless the current user can `edit_theme_options`.

That is the only broad capability gate in the file. After that point, the rest of the code assumes the user is authorized to edit the site's design system.

### 2.2 URL Redirection Map

`_wp_get_site_editor_redirection_url()` normalizes older query-string URLs into the new `p` permalink shape used by the editor shell.

The important mappings are:

| Legacy request | New `p` target |
|---|---|
| `postType=wp_navigation&postId=...` | `/wp_navigation/{id}` |
| `postType=wp_navigation` | `/navigation` |
| `path=/wp_global_styles` | `/styles` |
| `postType=page&postId=...` | `/page/{id}` |
| `postType=page` with missing canvas or postId | `/page` |
| `postType=wp_template&postId=...` | `/wp_template/{id}` |
| `postType=wp_template` with missing canvas or postId | `/template` |
| `postType=wp_block&postId=...` | `/wp_block/{id}` |
| `postType=wp_block` with missing canvas or postId | `/pattern` |
| `postType=wp_template_part&postId=...` | `/wp_template_part/{id}` |
| `path=/wp_template_part/all` | `/pattern&postType=wp_template_part` |
| `path=/page` | `/page` |
| `path=/wp_template` | `/template` |
| `path=/patterns` | `/pattern` |
| `path=/navigation` | `/navigation` |

If none of the remaps apply, the controller redirects to `p=/`.

---

## 3. Editor Context

### 3.1 Screen State

The screen sets:

- `$title = 'Editor'`
- `$parent_file = 'themes.php'`
- `current_screen->is_block_editor( true )`
- an `admin_body_class` filter that adds `is-fullscreen-mode`

The fullscreen class is not cosmetic. It is part of the UI contract that keeps the shell aligned with the block editor experience rather than the traditional admin chrome.

### 3.2 Block Editor Context

The request creates a `WP_Block_Editor_Context` with:

- `name => 'core/edit-site'`
- an optional `post` when the request targets a page or specific editor entity

The code resolves that `post` from either:

- `$_GET['postId']`
- `p=/page/{id}`

That context object is then passed into `get_block_editor_settings()` so the client receives a settings payload that matches the entity being edited.

### 3.3 Site-Level Settings

The custom settings payload includes:

- `siteUrl`
- `postsPerPage`
- `styles` from `get_block_editor_theme_styles()`
- `defaultTemplateTypes`
- `defaultTemplatePartAreas`
- `supportsLayout` from `wp_theme_has_theme_json()`
- `supportsTemplatePartsMode`

It also injects extra block pattern and category data from the server registries so the editor can render back-compat patterns even when they were registered outside the normal editor boot path.

---

## 4. REST Preload Contract

The Site Editor is REST-driven. Before it loads the client app, it preloads the endpoints the editor will immediately query.

The preload list includes:

- attachment and page `OPTIONS` routes
- `/wp/v2/types?context=view`
- `/wp/v2/types/wp_template?context=edit`
- `/wp/v2/types/wp_template_part?context=edit`
- `/wp/v2/templates?context=edit&per_page=-1`
- `/wp/v2/template-parts?context=edit&per_page=-1`
- `/wp/v2/themes?context=edit&status=active`
- `/wp/v2/global-styles/{id}?context=edit`
- `/wp/v2/global-styles/themes/{stylesheet}?context=view`
- `/wp/v2/global-styles/themes/{stylesheet}/variations?context=view`
- the navigation post-type route
- `/wp/v2/settings`
- `/wp/v2/block-patterns/categories`

If the editor is opened on a specific post, the preload list also includes that post's edit route and the matching template lookup route. If no post is being edited, it preloads the front-page and home template lookups instead.

This makes the first editor render deterministic. The client app expects those responses to already exist in the REST cache.

---

## 5. JavaScript Bootstrapping

After the settings payload is computed, the file injects several inline scripts before enqueuing the editor bundle:

1. `wp.editSite.initializeEditor( "site-editor", ... )`
2. `wp.blocks.unstable__bootstrapServerSideBlockDefinitions(...)`
3. `wp.blocks.registerBlockBindingsSource(...)` for server-registered bindings sources
4. `wp.blocks.setCategories(...)`

Then it enqueues:

- `wp-edit-site`
- `wp-format-library`
- `wp-edit-site` styles
- `wp-format-library` styles
- media assets

If the current theme supports block styles and no custom editor styles are present, it also enqueues `wp-block-library-theme`.

The ordering matters. The block registry and bindings sources must exist before the `wp-edit-site` app mounts, otherwise the editor will not know about server-defined block schemas or sources.

---

## 6. Integration With Theme JSON and Global Styles

The Site Editor is the primary UI for the `wp_global_styles` data model. It derives the active global styles post ID from `WP_Theme_JSON_Resolver::get_user_global_styles_post_id()`, and it includes both the active theme and the current global styles entity in the REST preload list.

On the backend, that means the screen depends on:

- `wp_theme_has_theme_json()`
- `wp_get_global_stylesheet()`
- `wp_get_theme_data_template_parts()`
- `wp_get_theme_directory_pattern_slugs()`

The screen also feeds template data from `get_default_block_template_types()` and `get_allowed_block_template_part_areas()`. So the editor shell is really a combined view over:

- templates
- template parts
- navigation entities
- global styles
- block patterns and categories

That is why the file does not try to build its own state store. It bootstraps a client app against the same resolver and REST contracts used elsewhere in core.

---

## 7. No-JavaScript Fallback

The render output contains a `.site-editor-no-js` notice wrapped in `hide-if-js`. The message is filterable through `site_editor_no_javascript_message`, but the important contract is unchanged: without JavaScript, the site editor is not functional.

The no-JS fallback is intentionally minimal. This is a full application shell, not a progressively enhanced form screen.

---

## 8. Operational Implications

1. The editor is fullscreen by default and should stay that way unless a deliberate UX change is made.
2. Old query-string URLs must continue to redirect to the new permalink style because the file is the canonical migration layer for old Site Editor links.
3. REST preloading is not optional. Removing entries from the preload list will surface as extra network round-trips or broken first renders.
4. The block registry and block bindings source bootstraps are server-defined. Client code should treat them as authoritative, not speculative.
5. `wp_theme_has_theme_json()` gates a large part of the editor experience, including whether the active theme exposes global styles and layout settings.

---

## 9. Tovu Reconstruction Notes

### 9.1 Why this exists

The Site Editor exists because full-site authoring is an application shell, not just another settings page. It coordinates templates, template parts, navigation, patterns, and style state through one preload-heavy editing runtime.

### 9.2 What Tovu should preserve

- Full-site editing needs its own application surface and preload contract
- Server-defined editor state should be bootstrapped before the client mounts
- Template/style/navigation editing belong to one coordinated authoring workflow
- Preview and edit state should stay grounded in authoritative server-side model metadata

### 9.3 What Tovu can simplify

- Tovu does not need to copy Gutenberg’s exact preload list or fullscreen shell
- V1 can start with a narrower site editor if templates, style state, and navigation still share one coherent runtime
- Legacy URL migration behavior can be lighter if Tovu controls the route model from the start

### 9.4 Possible Tovu seams

- `src/admin-shell/site-editor/` for the site-editing shell
- `src/features/presentation/` for template/style/navigation data
- `src/core/ports/EditorBootstrapPort.ts` for preload/bootstrap payload generation
- `src/core/ports/PreviewPort.ts` for live preview coupling

### 9.5 Suggested priority

- `V1`: template + style authoring with deterministic bootstrap payloads
- `Later`: richer navigation/pattern tooling, broader preload optimization, deeper site-editor ergonomics
