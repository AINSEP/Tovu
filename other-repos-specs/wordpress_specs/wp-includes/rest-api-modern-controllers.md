# REST API Modern Controllers - WordPress-to-TypeScript Rewrite Spec

**Source files analyzed:**
- `wp-includes/rest-api.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-templates-controller.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-template-revisions-controller.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-template-autosaves-controller.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-global-styles-controller.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-global-styles-revisions-controller.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-font-collections-controller.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-font-families-controller.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-font-faces-controller.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-themes-controller.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-menus-controller.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-menu-items-controller.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-menu-locations-controller.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-navigation-fallback-controller.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-search-controller.php`
- `wp-includes/rest-api/search/class-wp-rest-post-search-handler.php`
- `wp-includes/rest-api/search/class-wp-rest-term-search-handler.php`
- `wp-includes/rest-api/search/class-wp-rest-post-format-search-handler.php`
- `wp-includes/rest-api/fields/class-wp-rest-meta-fields.php`
- `wp-includes/rest-api/fields/class-wp-rest-post-meta-fields.php`
- `wp-includes/rest-api/fields/class-wp-rest-term-meta-fields.php`
- `wp-includes/rest-api/fields/class-wp-rest-comment-meta-fields.php`
- `wp-includes/rest-api/fields/class-wp-rest-user-meta-fields.php`

---

## 1. Overview

This doc covers the newer REST controller families that support the block editor, Site Editor, font library, menu/navigation UI, and editor/search surfaces.

It intentionally excludes the base REST transport layer already covered elsewhere:

- `WP_REST_Server`
- `WP_REST_Request`
- `WP_REST_Response`
- route registration mechanics

The controllers here are the parts that define the domain model on top of that transport layer.

The key boot rule is that these controllers are registered during `rest_api_init` by `create_initial_rest_routes()` in `wp-includes/rest-api.php`. The server does not discover them dynamically from the network. Core explicitly wires them into the initial route table.

---

## 2. Boot and Registration

`rest_api_init()` only adds rewrite plumbing and query vars. The real controller registration happens in `create_initial_rest_routes()`.

The registration order matters:

1. Core post type controllers
2. Template, revisions, autosaves controllers
3. Themes and settings controllers
4. Navigation and menu controllers
5. Search controller
6. Font library controllers

That order is part of the runtime contract because editor bootstrap code preloads several of these routes before the client app starts.

---

## 3. Template Controllers

### 3.1 `WP_REST_Templates_Controller`

This is the base controller for block templates and template parts. It uses the post type object to derive:

- namespace
- REST base
- capability model
- revision/autosave siblings

Key route families:

- `GET /wp/v2/{rest_base}`
- `POST /wp/v2/{rest_base}`
- `GET /wp/v2/{rest_base}/lookup`
- `GET /wp/v2/{rest_base}/{id}`
- `POST /wp/v2/{rest_base}/{id}`
- `DELETE /wp/v2/{rest_base}/{id}`

Important behaviors:

- `lookup` resolves fallback template content through template hierarchy logic.
- `get_items()` reads block templates through `get_block_templates()`.
- `get_item()` can source templates from theme or plugin files when `source=theme|plugin`.
- `update_item()` can update custom templates or replace theme templates.

The controller treats template IDs as `theme//slug` identifiers and has a sanitizer that restores the double-slash form when routing collapses it.

### 3.2 Template Revisions and Autosaves

`WP_REST_Template_Revisions_Controller` and `WP_REST_Template_Autosaves_Controller` are the revision-layer companions for templates.

They follow the same parent-post-type pattern as the template controller and expose nested routes under the template parent ID.

The important design point is that template history is not a separate model. It is a nested child of the template entity.

---

## 4. Global Styles Controllers

### 4.1 `WP_REST_Global_Styles_Controller`

This controller manages the stored global styles config and active-theme variations.

Route families include:

- theme global styles variations
- active theme global styles config
- individual global styles config by post ID

The controller operates on the `wp_global_styles` post type and uses `WP_Theme_JSON` / `WP_Theme_JSON_Resolver` as its data source.

Important behaviors:

- `get_theme_item()` only serves the active theme for now.
- `get_theme_items()` returns theme variations and attaches resolved theme file URIs.
- `prepare_item_for_response()` separates `settings` and `styles` and includes `api.w.org/theme-file` links when available.
- `validate_custom_css()` rejects markup in custom CSS.
- `get_available_actions()` exposes publish and edit-css link relations when the current user can perform them.

### 4.2 Global Styles Revisions

`WP_REST_Global_Styles_Revisions_Controller` is the revision companion for the global styles entity.

It wraps a `wp_global_styles` post and exposes revision access under the parent style config. The controller only accepts revisions that are marked as user theme JSON.

This is the same pattern as templates, but the payload is JSON theme data instead of block template content.

---

## 5. Font Library Controllers

### 5.1 `WP_REST_Font_Collections_Controller`

This controller is not post-based. It exposes the in-memory `WP_Font_Library` registry over REST.

Route families:

- `GET /wp/v2/font-collections`
- `GET /wp/v2/font-collections/{slug}`

The controller supports collection pagination semantics, but the backing storage is the singleton font library, not a database table.

### 5.2 `WP_REST_Font_Families_Controller`

This controller manages `wp_font_family` posts.

Its important contract points are:

- font family settings arrive as stringified JSON in multipart requests
- slugs are unique
- trashing is not supported
- each response can include `theme_json_version`, `font_faces`, and `font_family_settings`

The controller is intentionally schema-driven. It validates and sanitizes the `font_family_settings` object using the theme.json-compatible schema before persistence.

### 5.3 `WP_REST_Font_Faces_Controller`

This controller manages child `wp_font_face` posts under a font family parent.

Route families:

- `GET /wp/v2/font-families/{font_family_id}/font-faces`
- `POST /wp/v2/font-families/{font_family_id}/font-faces`
- `GET /wp/v2/font-families/{font_family_id}/font-faces/{id}`
- `DELETE /wp/v2/font-families/{font_family_id}/font-faces/{id}`

Important behaviors:

- uploads can be multipart file uploads or remote URLs
- uploaded files are moved into the dedicated fonts directory
- duplicate faces are rejected using `WP_Font_Utils::get_font_face_slug()`
- the response includes the decoded `font_face_settings`
- trashing is not supported

The controller is the REST layer that turns theme.json font-face declarations into persisted library entities.

---

## 6. Theme and Navigation Controllers

### 6.1 `WP_REST_Themes_Controller`

This controller exposes installed themes, with read access gated by theme management capabilities.

Important behavior:

- collection results can be filtered by `status`
- the active theme has a special read path even for users without full theme switching access
- individual theme lookups are sanitized through the stylesheet slug

This is the route family the Site Editor preloads when it needs to know the active theme state.

### 6.2 Menu Controllers

The navigation UI is split into three REST controllers:

- `WP_REST_Menus_Controller`
- `WP_REST_Menu_Items_Controller`
- `WP_REST_Menu_Locations_Controller`

These controllers layer richer navigation semantics on top of terms and posts:

- `menus` manages menu term objects plus menu-specific metadata like auto-add and locations
- `menu-items` manages nav menu item posts
- `menu-locations` exposes registered theme menu slots and which menu is assigned to each slot

The read access model is more permissive than classic theme editing in one respect: users who can edit relevant content types may be allowed to inspect navigation data, depending on the `rest_menu_read_access` filter and capability checks.

### 6.3 `WP_REST_Navigation_Fallback_Controller`

This controller lives in `wp-block-editor/v1`, not `wp/v2`.

Its responsibility is narrow:

- fetch the best fallback `wp_navigation` post
- create the fallback if needed

It only works for users who can both create navigation posts and satisfy the required editor/theme capabilities. It is the bridge that lets the block editor bootstrap navigation UI even when no explicit navigation menu exists yet.

---

## 7. Search Controller and Handlers

### 7.1 `WP_REST_Search_Controller`

This controller is a handler dispatcher. It does not search directly.

It accepts a list of `WP_REST_Search_Handler` instances and exposes them through:

- `GET /wp/v2/search`

Its query contract includes:

- `type` - object family to search
- `subtype` - one or more subtypes, including `any`
- `include` / `exclude`
- `page` / `per_page`

The response schema is a normalized search-result envelope with:

- `id`
- `title`
- `url`
- `type`
- `subtype`

### 7.2 Built-in Handlers

Core registers three handlers by default:

- `WP_REST_Post_Search_Handler`
- `WP_REST_Term_Search_Handler`
- `WP_REST_Post_Format_Search_Handler`

Each handler implements:

- `search_items()` - return matching IDs and total count
- `prepare_item()` - shape one search result
- `prepare_item_links()` - emit REST links for that result

The search controller is therefore an aggregation layer over multiple object families, not a single query model.

---

## 8. REST Field Families

`WP_REST_Meta_Fields` is the shared abstraction for meta transport through REST fields.

It is the base implementation behind:

- `WP_REST_Post_Meta_Fields`
- `WP_REST_Term_Meta_Fields`
- `WP_REST_Comment_Meta_Fields`
- `WP_REST_User_Meta_Fields`

Its job is to:

- expose registered meta fields through `register_rest_field()`
- read values from the metadata tables
- validate against schema before update
- sanitize before persistence
- enforce delete/update capabilities for each meta key

The concrete subclasses only supply the meta type, subtype, and REST field object type mapping.

The important architectural point is that meta fields are not ad hoc controller properties. They are a parallel field registry attached to existing object controllers.

---

## 9. Cross-Cutting Contracts

These modern controllers share a few implementation patterns:

1. They are schema-driven, not hand-serialized.
2. They rely on `get_fields_for_response()` and `_links`/`_embedded` inclusion rules.
3. They use `prepare_item_for_response()` as the stable response boundary.
4. They enforce permissions separately for collection and item routes.
5. They lean on custom post types, custom taxonomies, or singleton registries rather than inventing new persistence layers.

That last point matters for decomposition: the REST layer is mostly a contract surface. The real domain data still lives in post types, theme.json, the font library, or the theme resolver.

---

## 10. Operational Implications

1. The editor and Site Editor depend on these controllers being registered during `rest_api_init`. They are not optional extensions.
2. Template and global-styles revisions are nested history models, not separate top-level resources.
3. Font family and font face creation is a multipart upload workflow, not a simple JSON POST.
4. Navigation data is spread across menus, menu items, locations, and fallback creation. Any rewrite has to preserve those boundaries.
5. Search and meta fields are transport abstractions. They should stay generic and reusable, not folded into one-off editor endpoints.

---

## 11. Tovu Reconstruction Notes

### 11.1 Why this exists

These controllers exist because the editor and site-building surfaces need more than generic post and term endpoints. WordPress uses schema-driven transport layers for templates, fonts, navigation, revisions, search, and meta exposure while still reusing the same underlying content/storage primitives.

### 11.2 What Tovu should preserve

- Schema-driven API controllers with a stable `prepare_item_for_response` style boundary
- Reusable field registries for cross-cutting concerns like metadata rather than hardcoding them into every controller
- Clear separation between transport contracts and the underlying domain/storage modules
- Editor-critical controllers treated as first-class product APIs, not incidental admin endpoints

### 11.3 What Tovu can simplify

- Tovu does not need WordPress's exact route shapes or controller class hierarchy
- Some specialized resources can be collapsed if Tovu's internal content model is cleaner
- Search aggregation and nested revision models can start narrower as long as the API surface stays explicit and extensible

### 11.4 Possible Tovu seams

- `src/features/api/` for HTTP transport and controller composition
- `src/core/ports/ApiSchemaPort.ts` for schema and field exposure rules
- `src/core/ports/RestFieldRegistryPort.ts` for cross-cutting field families like metadata
- domain feature modules continue to own persistence while the API layer owns shaping and permissions

### 11.5 Suggested priority

- `V1`: schema-driven controllers for editor-critical resources, shared field registries, clear response boundary
- `Later`: broader compatibility surface and more specialized aggregate endpoints
