# WordPress Navigation Menus and Widgets Admin — TypeScript Rewrite Spec

Source files analyzed:
- `wp-admin/nav-menus.php`
- `wp-admin/widgets.php`
- `wp-admin/widgets-form.php`
- `wp-admin/widgets-form-blocks.php`
- `wp-admin/includes/nav-menu.php`

---

## Section 1: Overview

WordPress provides two major theme customization admin screens:

**Nav Menus (`nav-menus.php`):** A drag-and-drop interface for creating hierarchical navigation menus, adding items from various content sources (pages, posts, categories, tags, custom links, and any registered post type or taxonomy), reordering items, configuring per-item settings, and assigning menus to theme-registered locations.

**Widgets (`widgets.php`):** An interface for placing independently-configured content blocks (widgets) into theme-registered widget areas (sidebars). In modern WordPress, this screen conditionally loads either the classic drag-and-drop UI (`widgets-form.php`) or the block-based editor (`widgets-form-blocks.php`) depending on whether `wp_use_widgets_block_editor()` returns true.

Both screens require the `edit_theme_options` capability.

Data model:
- Nav menus are stored as WordPress taxonomy terms in the `nav_menu` taxonomy. Each menu is a term; menu items are `nav_menu_item` post type posts associated with the term.
- Widget instances are stored as serialized arrays in `wp_options` under keys like `widget_{id_base}` (e.g. `widget_text`, `widget_recent-posts`). Widget-to-sidebar assignments are stored in the `sidebars_widgets` option.

---

## Section 2: Nav Menus Admin (`nav-menus.php`) — Routes

### 2.1 GET routes

| Query params | Behavior |
|---|---|
| *(none or `action=edit`)* | Show the main Edit Menus tab with the most-recently-edited or first menu loaded |
| `menu=0` | Show the "Add new menu" screen (empty editor) |
| `menu={id}` | Load the specified menu into the editor |
| `action=locations` | Show the Manage Locations tab |
| `action=delete&menu={id}` | (nonce required) Shows a delete confirmation; on GET after redirect, re-shows the first remaining menu |

On any GET to the main Edit Menus tab, the page:
1. Loads all nav menus (`wp_get_nav_menus()`).
2. Determines which menu to show — in order of priority: `$_GET['menu']`, the user's last-edited menu stored in user meta `nav_menu_recently_edited`, or the first menu in the list.
3. If there are zero menus and no `menu=0` param, redirects to `nav-menus.php?action=edit&menu=0`.
4. Calls `wp_get_nav_menu_to_edit($nav_menu_selected_id)` to build the sorted, indented list HTML.
5. Calls `wp_nav_menu_setup()` to register all meta boxes (post types, custom links, taxonomies).
6. Calls `wp_initial_nav_menu_meta_boxes()` on first-ever visit to hide non-core meta boxes.

### 2.2 POST routes (the `action` field in POST or `action` query parameter)

| POST action | Description |
|---|---|
| `update` | Create a new menu or save changes to an existing menu, including all its items |
| `add-menu-item` | Add a single item or update menu locations (AJAX path) |
| `move-up-menu-item` | Move a single item up one position in the keyboard-accessible list |
| `move-down-menu-item` | Move a single item down one position |
| `delete-menu-item` | Permanently delete a single menu item post |
| `delete` | Delete an entire menu (term + all its items) |
| `delete_menus` | Bulk delete multiple menus |
| `locations` | Save menu-to-location assignments from the Manage Locations tab |

All write actions check nonces. The nonce actions used are:
- `update-nav_menu` for the `update` action (nonce field `update-nav-menu-nonce`)
- `add-menu_item` for `add-menu-item` (nonce field `menu-settings-column-nonce`)
- `move-menu_item` for move-up and move-down
- `delete-menu_item_{id}` for deleting a single item
- `delete-nav_menu-{id}` for deleting a whole menu
- `nav_menus_bulk_actions` for bulk delete
- `save-menu-locations` for the locations form

---

## Section 3: Authorization

Required capability: `edit_theme_options`

Checked at the very top of `nav-menus.php`:
```
if (!current_user_can('edit_theme_options')) { wp_die(403); }
```

Additionally, the page dies if the active theme supports neither `menus` nor `widgets`.

The `edit_theme_options` capability is held by the Administrator role by default. On multisite it is a per-site capability; it does not grant network-level access.

---

## Section 4: Menu Creation and Editing UI

### 4.1 Page layout

The screen has two columns:
- **Left column (`#menu-settings-column`):** A set of collapsible meta boxes — one per item source type (Pages, Posts, Custom Links, Categories, Tags, and any registered post type or taxonomy). Each meta box is an accordion panel.
- **Right column (`#menu-management`):** The menu editor — a sortable list of the current menu's items, plus a name field, Save/Delete buttons, and a Menu Settings panel at the bottom.

### 4.2 Creating a menu

1. Navigate to `nav-menus.php?action=edit&menu=0`.
2. Enter a name in the "Menu Name" text field.
3. Submit — POST action `update` with `menu=0`.
4. Server calls `wp_update_nav_menu_object(0, { menu-name: $title })` which creates a new `nav_menu` term.
5. Redirects to `nav-menus.php?menu={new_id}`.

The "Auto add pages" checkbox controls whether newly published top-level pages are automatically added to this menu. The list of menus that have auto-add enabled is stored in the `nav_menu_options` option as `{ auto_add: [menu_id, …] }`.

### 4.3 Adding items to a menu

Each meta box on the left contains tabs: "Most Recent", "View All", "Search". Items are shown as a checklist. Selecting one or more items and clicking "Add to Menu" submits the meta box form with `action=add-menu-item`.

The POST payload contains one entry per checked item:
```
menu-item[{placeholder_id}][menu-item-type]      = 'post_type' | 'taxonomy' | 'custom' | 'post_type_archive'
menu-item[{placeholder_id}][menu-item-object]    = post_type name or taxonomy name
menu-item[{placeholder_id}][menu-item-object-id] = post ID or term ID
menu-item[{placeholder_id}][menu-item-title]     = display label
menu-item[{placeholder_id}][menu-item-url]       = resolved URL (for custom links)
```

Placeholder IDs are negative integers generated client-side so they don't collide with real DB IDs.

The `wp_save_nav_menu_items($menu_id, $menu_data)` function processes this array:
- Skips entries with no `menu-item-object-id` (unchecked)
- Skips custom link entries where URL is empty or one of `https://`, `http://`
- For each valid entry, calls `wp_update_nav_menu_item($menu_id, 0, $args)` to create a new `nav_menu_item` post

### 4.4 Item types

**Post type items:**
- Each registered public post type with `show_in_nav_menus: true` gets its own meta box
- Meta box callback: `wp_nav_menu_item_post_type_meta_box()`
- Pages meta box shows important pages first (Front Page, Posts Page, Privacy Policy) pinned to the top of the "View All" tab
- Post types with `has_archive: true` also get an "Archive" pseudo-item prepended

**Taxonomy items (categories, tags, custom taxonomies):**
- Each registered taxonomy with `show_in_nav_menus: true` gets its own meta box
- Meta box callback: `wp_nav_menu_item_taxonomy_meta_box()`
- Tabs: "Most Used" (top 10 by post count), "View All", "Search"

**Custom links:**
- Meta box ID: `add-custom-links`
- Meta box callback: `wp_nav_menu_item_link_meta_box()`
- Fields: URL text input and Link Text input
- Submitted as a single item with `menu-item-type: 'custom'`

All post-type and taxonomy meta boxes support pagination (50 items per page) and search (AJAX-driven via the `wp_ajax_menu_quick_search` handler).

### 4.5 Item reordering

Items are stored as `nav_menu_item` posts. Their order is stored in the `menu_order` column of `wp_posts`.

The drag-and-drop UI sends the entire menu structure as a JSON blob in `nav-menu-data` (to avoid PHP `max_input_vars` limits for large menus). `_wp_expand_nav_menu_post_data()` parses this blob and injects it into `$_POST` before processing.

The JSON structure is an array of objects like:
```json
[
  { "name": "menu-item-db-id[{key}]", "value": "{id}" },
  { "name": "menu-item-position[{key}]", "value": "1" },
  { "name": "menu-item-parent-id[{key}]", "value": "0" },
  ...
]
```

Keyboard-accessible "Move up one" and "Move down one" buttons use GET requests with `action=move-up-menu-item` or `action=move-down-menu-item` and `menu-item={id}`. The server swaps `menu_order` values between adjacent items, taking care of parent-child relationships (a move-up past a parent causes the item to "bubble out" of its parent).

### 4.6 Item settings

Each item in the editor has an expand/collapse arrow. When expanded, the following fields are shown. The basic fields are always visible; advanced fields are shown/hidden via Screen Options:

**Always visible:**
- Navigation Label — the `post_title` of the `nav_menu_item` post; what the visitor sees in the menu
- Remove link (deletes the item from the menu)
- Cancel link (collapses without saving changes)

**Advanced (hidden by default, enabled per-item via Screen Options):**

| Field label | Stored as | Storage location |
|---|---|---|
| Title Attribute | `title-attribute` / `menu-item-attr-title` | `_menu_item_attr_title` post meta |
| Open Link in a New Tab | `menu-item-target` | `_menu_item_target` post meta; value is `_blank` when checked |
| CSS Classes (optional) | `menu-item-classes` | `_menu_item_classes` post meta; stored as serialized array |
| Link Relationship (XFN) | `menu-item-xfn` | `_menu_item_xfn` post meta |
| Description | `menu-item-description` | `_menu_item_description` post meta (shown below label in some themes) |

**Non-advanced but below the label:**
- Original: for items linked to a real post/term, a read-only "Original:" label showing the object title

**Screen Options columns** (managed via `wp_nav_menu_manage_columns()`):
- `link-target` — show/hide the "Open in new tab" checkbox
- `title-attribute` — show/hide the Title Attribute field
- `css-classes` — show/hide the CSS Classes field
- `xfn` — show/hide the Link Relationship field
- `description` — show/hide the Description field

On the user's first visit, all five advanced columns are hidden by default. This is stored in `managenav-menuscolumnshidden` user meta.

---

## Section 5: Menu Locations

### 5.1 Theme-registered locations

Themes register named locations via `register_nav_menus()` (or `register_nav_menu()`). These are stored in a global `$wp_registered_nav_menus` array. The `get_registered_nav_menus()` function returns this array as `{ locationSlug: humanReadableLabel }`.

### 5.2 Assigning menus to locations

The current assignments are stored in the theme's mod storage as `nav_menu_locations`: an array of `{ locationSlug: menuTermId }`. Retrieved via `get_nav_menu_locations()`, saved via `set_theme_mod('nav_menu_locations', $array)`.

**From the Edit Menus tab:**
In the "Menu Settings" section at the bottom of the editor, checkboxes appear for each registered location. Checking a location assigns the current menu to it; unchecking removes the assignment. This is saved as part of the main `update` POST action.

**From the Manage Locations tab (`action=locations`):**
Each registered location has a dropdown of all existing menus. The form submits to `nav-menus.php?action=locations` with `menu-locations[{locationSlug}] = {menuTermId}`. Nonce: `save-menu-locations`. An "Edit" link and a "Use new menu" link appear next to each dropdown.

### 5.3 Manage Locations tab display

Only shown if:
- At least one theme location is registered (`$num_locations > 0`)
- At least one menu exists (`$menu_count > 0`)

The "Manage Locations" nav tab links to `nav-menus.php?action=locations`.

---

## Section 6: Menu Save Flow

### 6.1 Saving a menu (`action=update`)

**Creating a new menu (menu=0 in POST):**
1. Validate nonce `update-nav_menu`.
2. Trim and escape the new menu name from `$_POST['menu-name']`.
3. Call `wp_update_nav_menu_object(0, ['menu-name' => $name])`.
   - Creates a new term in the `nav_menu` taxonomy.
   - Returns the new term ID.
4. If `$_REQUEST['menu-item']` is set, call `wp_save_nav_menu_items($new_id, absint($item))`.
5. If `auto-add-pages` is checked or `zero-menu-state` is set, call `wp_nav_menu_update_menu_items()`.
6. Save location assignments: if any `menu-locations` are in POST, call `set_theme_mod('nav_menu_locations', $merged_locations)`.
7. Redirect to `nav-menus.php?menu={new_id}`.

**Updating an existing menu:**
1. Validate nonce `update-nav_menu`.
2. Process location assignments: for each registered location, if not in `$_POST['menu-locations']` and the current menu is assigned there, remove the assignment.
3. Call `set_theme_mod('nav_menu_locations', $menu_locations)`.
4. Validate and save menu name via `wp_update_nav_menu_object($id, ['menu-name' => $name])`.
5. Call `wp_nav_menu_update_menu_items($id, $title)`.

### 6.2 `wp_nav_menu_update_menu_items()`

This function (in `wp-admin/includes/nav-menu.php`) performs the full item save:

1. Load all existing items for the menu (indexed by DB ID).
2. Iterate `$_POST['menu-item-db-id']` array:
   - For each key, extract all fields into an `$args` array.
   - Skip items with an empty title.
   - Call `wp_update_nav_menu_item($menu_id, $db_id_or_0, $args)`.
   - `wp_update_nav_menu_item()` creates or updates a `nav_menu_item` post and stores all the `_menu_item_*` post meta.
   - Remove the item's DB ID from the "existing items" tracking set.
3. After the loop: any items still in the "existing items" set were not submitted — delete them via `wp_delete_post()`.
4. Update `nav_menu_options` to record or remove this menu from the `auto_add` list.
5. Call `wp_defer_term_counting(false)` to flush deferred term counts.
6. Fire `wp_update_nav_menu` action.
7. Return an array of success/error notices.

### 6.3 `wp_update_nav_menu_item(menu_id, item_db_id, args)`

This is the core function for creating/updating a single menu item (in `wp-includes/nav-menu.php`, called from the admin):

- `$item_db_id = 0` means create a new post; non-zero means update.
- Creates or updates a post of type `nav_menu_item` with:
  - `post_title` = `menu-item-title`
  - `post_status` = `'publish'` (or `'draft'` if `menu-item-type` is not set)
  - `menu_order` = `menu-item-position`
- Stores the following as post meta (`_menu_item_` prefix):
  - `type` — `'post_type'` | `'taxonomy'` | `'custom'` | `'post_type_archive'`
  - `menu_item_parent` — parent item's DB ID (0 = top level)
  - `object_id` — the referenced post ID or term ID (0 for custom links)
  - `object` — post type name or taxonomy name
  - `target` — `'_blank'` or `''`
  - `classes` — serialized array of CSS class strings
  - `xfn` — XFN link relationship string
  - `description` — description string
  - `attr_title` — title attribute string
  - `url` — the resolved URL (for custom links; post/term items resolve dynamically)
- Associates the post with the menu term via `wp_set_object_terms()`.
- Returns the post ID (item DB ID).

---

## Section 7: Adding Custom Menu Item Types

### 7.1 The Walker_Nav_Menu_Edit class

`Walker_Nav_Menu_Edit` (in `wp-admin/includes/class-walker-nav-menu-edit.php`) is responsible for rendering each item row in the menu editor. It extends `Walker` and walks the flat (but menu_order+parent-id structured) list of `nav_menu_item` posts.

For each item it outputs:
- A `<li>` element with CSS classes indicating depth, item type, and whether it has children
- The collapsed view: title, arrows
- The expanded view: the label field, all advanced fields, the Original info, Remove/Cancel links

Custom item types can alter this output by hooking `wp_nav_menu_item_{type}_meta_box` (see 7.3) or by replacing the walker entirely via the `wp_edit_nav_menu_walker` filter.

The walker is instantiated and used in `wp_get_nav_menu_to_edit()`:
```
$walker_class_name = apply_filters('wp_edit_nav_menu_walker', 'Walker_Nav_Menu_Edit', $menu_id);
$walker = new $walker_class_name();
```

### 7.2 `wp_nav_menu_setup()`

Called once per page load (from `nav-menus.php`). Registers all meta boxes:

1. Calls `wp_nav_menu_post_type_meta_boxes()` — iterates `get_post_types(['show_in_nav_menus' => true], 'object')` and registers one meta box per type:
   - Box ID: `add-post-type-{post_type_name}`
   - Callback: `wp_nav_menu_item_post_type_meta_box`
   - Priority: `'core'` for pages, `'default'` for others
   - Each post type is passed through the `nav_menu_meta_box_object` filter first; returning `false` suppresses the meta box

2. Registers the Custom Links meta box:
   - Box ID: `add-custom-links`
   - Callback: `wp_nav_menu_item_link_meta_box`

3. Calls `wp_nav_menu_taxonomy_meta_boxes()` — iterates `get_taxonomies(['show_in_nav_menus' => true], 'object')` and registers one meta box per taxonomy:
   - Box ID: `add-{taxonomy_name}`
   - Callback: `wp_nav_menu_item_taxonomy_meta_box`
   - Each taxonomy is passed through the `nav_menu_meta_box_object` filter

4. Adds the `manage_nav-menus_columns` filter pointing to `wp_nav_menu_manage_columns()`.

### 7.3 First-time meta box visibility

`wp_initial_nav_menu_meta_boxes()` runs only if `metaboxhidden_nav-menus` user meta has never been set. It hides all meta boxes except the initial four:
- `add-post-type-page`
- `add-post-type-post`
- `add-custom-links`
- `add-category`

All other registered meta boxes are added to the hidden list. This is stored in `metaboxhidden_nav-menus` user meta.

### 7.4 Quick search AJAX (`_wp_ajax_menu_quick_search()`)

AJAX handler for the search tabs in each meta box. Called via `wp_ajax_menu_quick_search`.

Request params:
- `type` — either `'get-post-item'` or a pattern like `'quick-search-posttype-{name}'` or `'quick-search-taxonomy-{name}'`
- `object_type` — post type slug or taxonomy slug (used with `get-post-item`)
- `q` — search query string
- `response-format` — `'json'` or `'markup'`
- `ID` — numeric ID (used with `get-post-item`)

For post type searches: queries up to 10 posts matching the search string using `WP_Query` with `s` and `search_columns: ['post_title']`. Filterable via `wp_ajax_menu_quick_search_args`.

For taxonomy searches: queries up to 10 terms matching `name__like`.

Response: either JSON array of `{ ID, post_title, post_type }` objects, or HTML markup (Walker_Nav_Menu_Checklist output).

### 7.5 `_wp_nav_menu_meta_box_object()` defaults

Before meta boxes are registered, each post type and taxonomy object passes through `_wp_nav_menu_meta_box_object()` which sets `_default_query` on the object:
- `page` → `{ orderby: 'menu_order title', post_status: 'publish' }`
- `post` → `{ post_status: 'publish' }`
- `category` → `{ orderby: 'id', order: 'DESC' }`
- Everything else → `{ post_status: 'publish' }`

---

## Section 8: Widgets Admin (`widgets.php`)

Route: GET `wp-admin/widgets.php`
Capability: `edit_theme_options`
Parent menu: `themes.php`

On load, `widgets.php` checks:
- `current_user_can('edit_theme_options')` — die 403 if not
- `current_theme_supports('widgets')` — die with explanation if not
- `wp_use_widgets_block_editor()` — determines which form file to load:
  - `true` → `widgets-form-blocks.php` (block editor)
  - `false` → `widgets-form.php` (classic drag-and-drop)

---

## Section 9: Widget Drag-Drop and Sidebar Assignment (Classic)

### 9.1 Data model

`sidebars_widgets` option: an associative array mapping sidebar IDs to ordered arrays of widget instance IDs.

```
{
  sidebar-1: ['text-2', 'recent-posts-3', 'archives-1'],
  sidebar-2: ['search-1'],
  wp_inactive_widgets: ['meta-1']
}
```

Widget instance IDs are strings in the format `{id_base}-{number}` (e.g. `text-2`, `recent-posts-3`).

Each widget type's settings are stored under `widget_{id_base}` option as an array indexed by the instance number:
```
widget_text: {
  2: { title: 'Hello', text: 'World', filter: false },
  _multiwidget: 1
}
```

### 9.2 AJAX widget save

When the user drops a widget into a sidebar or drags one between sidebars, an AJAX request is sent to `wp-admin/admin-ajax.php` with `action=save-widget`.

The AJAX handler (`wp_ajax_save_widget`) in `wp-admin/includes/widgets.php`:
1. Verifies nonce `save-sidebar-widgets`.
2. Identifies the widget by `widget-id` in POST.
3. Calls the widget's update callback (part of `$wp_registered_widget_updates`).
4. Updates `sidebars_widgets` to place the widget in the correct sidebar at the correct position.
5. Responds with JSON containing the updated widget form HTML.

The `sidebars_widgets` update is also triggered when a widget is deleted or moved to `wp_inactive_widgets`.

### 9.3 No-JS fallback

When JavaScript is disabled (or "Accessibility Mode" is enabled via `?widgets-access=on`):
- The `admin-widgets` script is not enqueued
- Instead, each widget is shown as a standalone form with sidebar/position dropdowns
- POST `savewidget` saves changes
- POST `removewidget` removes the widget from its sidebar

No-JS save flow (classic):
1. GET `?editwidget={widget_id}[&addnew=1][&base={id_base}&num={n}]` — show the widget's edit form
2. POST to `widgets.php` with `savewidget` or `removewidget`
3. Nonce: `save-delete-widget-{widget_id}`
4. On `removewidget`: remove the widget ID from its sidebar's array, run the widget's update callback with empty data, call `wp_set_sidebars_widgets()`
5. On `savewidget`: run the widget's update callback, insert the widget into the target sidebar at the specified position, call `wp_set_sidebars_widgets()`, redirect to `widgets.php?message=0`

### 9.4 Inactive Widgets panel

All sidebar IDs in `sidebars_widgets` that are not registered as active sidebars are treated as orphaned/inactive. The `wp_inactive_widgets` key is the canonical inactive area.

On page load, any unregistered sidebar that has widgets is re-registered dynamically as an "Inactive Sidebar (not used)" with an appropriate description. Empty unregistered sidebars are pruned from `sidebars_widgets`.

The "Clear Inactive Widgets" button (POST `removeinactivewidgets`, nonce `remove-inactive-widgets`) iterates `sidebars_widgets['wp_inactive_widgets']`, reads `widget_{id_base}` for each widget, unsets the widget's instance number, updates the option, and removes the widget from the inactive list.

### 9.5 Available Widgets panel

`wp_list_widgets()` renders all registered widgets that are NOT currently placed in a sidebar. Widgets already in a sidebar are shown in their sidebar, not in the "Available Widgets" panel. The available panel acts as a source to drag from.

The classic UI lays out sidebars in two columns when there are more than one. The first sidebar is expanded; all others start collapsed.

### 9.6 Accessibility mode

Toggled via `?widgets-access=on|off` (nonce: `widgets-access`). The setting is stored in per-user browser storage via `set_user_setting('widgets_access', ...)`. When on, the `wp_widgets_access_body_class` filter adds a CSS class that hides the drag-and-drop UI and shows the screen-reader-friendly form-based UI.

---

## Section 10: Widget Forms and Saving

### 10.1 Widget registration

Widgets register themselves by extending `WP_Widget` and calling `register_widget()`. Each `WP_Widget` subclass must implement:
- `widget($args, $instance)` — renders the frontend output
- `form($instance)` — renders the backend settings form HTML
- `update($new_instance, $old_instance)` — sanitizes new settings, returns saved array

The constructor sets:
- `id_base` — unique string identifier used in option keys and instance IDs
- `name` — human-readable label
- `widget_options` — optional: `classname`, `description`, `customize_selective_refresh`
- `control_options` — optional: `width`, `height`

### 10.2 Widget instance storage

When `form()` renders inputs, their `name` attributes use the pattern `widget-{id_base}[{number}][{field_name}]` (e.g. `widget-text[2][title]`).

On save (AJAX or no-JS), `update($new_instance, $old_instance)` is called. Its return value (the sanitized settings array) is stored at `widget_{id_base}[{number}]` in the options table.

`get_option('widget_text')` returns the full array of all text widget instances plus `_multiwidget: 1`.

### 10.3 AJAX widget save detail

POST params to `wp-admin/admin-ajax.php?action=save-widget`:
- `action` — `save-widget`
- `_wpnonce_widgets` — nonce for `save-sidebar-widgets`
- `widget-id` — the full instance ID (e.g. `text-2`)
- `id_base` — the widget's base ID (e.g. `text`)
- `sidebar` — the target sidebar ID
- `multi_number` — the instance number (used for multi-instance widgets)
- `widget-{id_base}[{number}][field]` — the widget's form field values

The AJAX handler:
1. Calls `wp_save_sidebars_widgets()` or directly calls the widget's update callback
2. Calls `wp_set_sidebars_widgets()` with the updated assignments
3. Returns HTML of the updated widget form via `wp_widget_control()`

### 10.4 `sidebars_widgets` and `wp_set_sidebars_widgets()`

`wp_set_sidebars_widgets($sidebars_widgets)` saves the full assignment array to the `sidebars_widgets` option after filtering out empty strings and removing invalid widget IDs. It fires the `pre_update_option_sidebars_widgets` filter and `wp_sidebar_widgets` before saving.

---

## Section 11: Block-Based Widgets Editor

### 11.1 Detection

`wp_use_widgets_block_editor()` returns `true` if:
- WordPress version >= 5.8
- The `use_widgets_block_editor` filter has not returned `false`
- The `classic-widgets` plugin is not active

### 11.2 Block editor bootstrap (`widgets-form-blocks.php`)

When the block editor is used:

1. Sets `$current_screen->is_block_editor(true)`.
2. Creates a `WP_Block_Editor_Context` with `name: 'core/edit-widgets'`.
3. Preloads REST API responses for:
   - `OPTIONS /wp/v2/attachments` (for media handling)
   - `GET /wp/v2/widget-types?context=edit&per_page=-1`
   - `GET /wp/v2/sidebars?context=edit&per_page=-1`
   - `GET /wp/v2/widgets?context=edit&per_page=-1&_embed=about`
4. Calls `get_block_editor_settings()` merging legacy widget settings and theme styles.
5. Removes the Block Directory enqueue action (widgets editor does not support installing new blocks).
6. Enqueues `wp-edit-widgets` script and style.
7. Initializes the editor via inline script:
   ```js
   wp.domReady(function() {
     wp.editWidgets.initialize('widgets-editor', settings);
   });
   ```
8. Bootstraps server-side block definitions and block binding sources.
9. Sets block categories.

The block editor communicates with the backend entirely via the REST API:
- `GET /wp/v2/sidebars` — list registered sidebars
- `GET /wp/v2/widgets` — list all widget instances
- `PUT /wp/v2/sidebars/{id}` — update sidebar widget assignments
- `PUT /wp/v2/widgets/{id}` — update a widget instance
- `DELETE /wp/v2/widgets/{id}` — remove a widget instance

### 11.3 Legacy widget block

Legacy widgets (those not converted to blocks) are surfaced in the block editor as "Legacy Widget" blocks. The `WP_Widget_Block` wrapper class (in `wp-includes/widgets/class-wp-widget-block.php`) handles rendering a `WP_Widget`-based widget inside the block editor.

Each legacy widget is also available as a `widget-type` via the REST API (`/wp/v2/widget-types`). The block editor uses this API to discover available legacy widgets and render their forms in an iframe-based preview.

The block editor renders each sidebar as a block area. Widgets within it are either native blocks or Legacy Widget blocks wrapping classic widgets. The entire widget tree is saved via REST API calls, not via `options.php`.

---

## Section 12: Key Hooks and Filters

### Actions

| Hook | Fired | Purpose |
|---|---|---|
| `sidebar_admin_setup` | Early in widgets page load | For plugins to do setup before widgets render; fired for both classic and block widgets |
| `widgets_admin_page` | Before widget areas are displayed | For plugins to add content to the widgets page |
| `sidebar_admin_page` | After widget areas, before footer | For plugins to append content |
| `delete_widget` | When a widget is marked for deletion | `delete_widget($widget_id, $sidebar_id, $id_base)` |
| `wp_update_nav_menu` | After a menu is saved | `wp_update_nav_menu($menu_id)` |
| `after_menu_locations_table` | After the locations table on the Manage Locations tab | For plugins to append content |

### Filters

| Filter | Purpose |
|---|---|
| `wp_edit_nav_menu_walker` | Replace the walker class used to render the menu item list in the editor |
| `nav_menu_meta_box_object` | Modify or suppress a post type or taxonomy before its meta box is registered; return `false` to suppress |
| `nav_menu_items_{post_type_name}` | Filter posts shown in the "View All" tab of a post type meta box |
| `nav_menu_items_{post_type_name}_recent` | Filter posts shown in the "Most Recent" tab of a post type meta box |
| `wp_nav_locations_listed_per_menu` | Number of assigned location labels shown in the menu dropdown (default 3) |
| `available_permalink_structure_tags` | Not applicable here — see settings spec |
| `wp_ajax_menu_quick_search_args` | Filter WP_Query args for the quick search AJAX handler |
| `use_widgets_block_editor` | Return `false` to force the classic widgets editor |
| `block_widgets_no_javascript_message` | Filter the message shown when JS is disabled in the block widgets editor |
| `sidebars_widgets` | Filter the complete sidebars_widgets array on retrieval |
| `pre_update_option_sidebars_widgets` | Filter before saving sidebars_widgets |

---

## Section 13: TypeScript Interface Sketch

```typescript
// ─── Nav Menu data types ──────────────────────────────────────────────────────

interface NavMenu {
  termId: number;
  name: string;
  slug: string;
  termGroup: number;
  count: number;
  truncatedName?: string;        // Client-side truncation at 40 chars
}

type MenuItemType =
  | 'post_type'
  | 'taxonomy'
  | 'custom'
  | 'post_type_archive';

interface NavMenuItem {
  // Post fields
  ID: number;                         // post ID (db_id)
  postTitle: string;                  // Navigation label (post_title)
  menuOrder: number;                  // Sort position (menu_order)
  postStatus: 'publish' | 'draft';

  // Meta fields (_menu_item_* post meta)
  menuItemType: MenuItemType;
  menuItemObject: string;             // Post type slug or taxonomy slug
  menuItemObjectId: number;           // Referenced post ID or term ID (0 for custom)
  menuItemParentId: number;           // Parent nav_menu_item post ID (0 = top level)
  menuItemUrl: string;                // Resolved URL
  menuItemTarget: '_blank' | '';      // Link target
  menuItemAttrTitle: string;          // title attribute
  menuItemClasses: string[];          // CSS classes array
  menuItemXfn: string;                // XFN relationship
  menuItemDescription: string;        // Description text

  // Derived at runtime
  depth: number;                      // Nesting depth (0 = top level)
  hasChildren: boolean;
  isInvalid?: boolean;                // True if referenced object no longer exists
}

// ─── Menu location types ──────────────────────────────────────────────────────

interface NavMenuLocation {
  slug: string;                       // Machine-readable location key
  label: string;                      // Human-readable label
}

interface NavMenuLocationAssignment {
  locationSlug: string;
  menuTermId: number;                 // 0 = unassigned
}

// ─── Menu item save payload ───────────────────────────────────────────────────

interface NavMenuItemSaveArgs {
  'menu-item-db-id': number;
  'menu-item-object-id': number;
  'menu-item-object': string;
  'menu-item-parent-id': number;
  'menu-item-position': number;
  'menu-item-type': MenuItemType;
  'menu-item-title': string;
  'menu-item-url': string;
  'menu-item-description': string;
  'menu-item-attr-title': string;
  'menu-item-target': '_blank' | '';
  'menu-item-classes': string;        // Space-separated class string
  'menu-item-xfn': string;
}

// ─── Nav menu page actions ────────────────────────────────────────────────────

type NavMenuAction =
  | 'edit'
  | 'update'
  | 'delete'
  | 'delete_menus'
  | 'delete-menu-item'
  | 'add-menu-item'
  | 'move-up-menu-item'
  | 'move-down-menu-item'
  | 'locations';

// ─── Nav menu screen state ────────────────────────────────────────────────────

interface NavMenuScreenState {
  selectedMenuId: number;             // 0 = create new
  selectedMenuTitle: string;
  isAddNewScreen: boolean;
  isLocationsScreen: boolean;
  allMenus: NavMenu[];
  menuCount: number;
  numLocations: number;
  registeredLocations: Record<string, string>; // slug → label
  menuLocations: Record<string, number>;       // slug → menu term ID
  menuItems: NavMenuItem[];
  messages: string[];                 // Admin notice HTML strings
  navMenuMaxDepth: number;            // Max depth of current menu's items
}

// ─── Auto-add pages setting ───────────────────────────────────────────────────

interface NavMenuOptions {
  auto_add: number[];                 // Array of menu IDs with auto-add enabled
}

// ─── Widget types ─────────────────────────────────────────────────────────────

interface RegisteredSidebar {
  id: string;
  name: string;
  description: string;
  class: string;
  beforeWidget: string;
  afterWidget: string;
  beforeTitle: string;
  afterTitle: string;
}

interface RegisteredWidget {
  id: string;                         // Full instance ID e.g. 'text-2'
  idBase: string;                     // Base ID e.g. 'text'
  name: string;                       // Human-readable name
  description?: string;
  width: number;
  height: number;
  isMulti: boolean;
}

interface WidgetInstance {
  id: string;                         // e.g. 'text-2'
  idBase: string;                     // e.g. 'text'
  instanceNumber: number;             // e.g. 2
  settings: Record<string, unknown>;  // Widget-specific settings
}

// ─── Sidebar widget assignments ───────────────────────────────────────────────

type SidebarsWidgets = Record<string, string[]>;
// Keys: sidebar IDs (including 'wp_inactive_widgets')
// Values: ordered arrays of widget instance IDs

// ─── Widget save AJAX payload ─────────────────────────────────────────────────

interface WidgetSaveRequest {
  action: 'save-widget';
  widgetId: string;                   // Full instance ID
  idBase: string;                     // Widget base ID
  sidebar: string;                    // Target sidebar ID
  multiNumber: number;                // Instance number
  settings: Record<string, unknown>;  // Form field values
  nonce: string;
}

interface WidgetSaveResponse {
  success: boolean;
  data: {
    form?: string;                    // Updated widget form HTML
    widgetId?: string;
    sidebarId?: string;
  };
}

// ─── Block widgets REST API types ────────────────────────────────────────────

interface RestSidebar {
  id: string;
  name: string;
  description: string;
  class: string;
  before_widget: string;
  after_widget: string;
  before_title: string;
  after_title: string;
  status: 'active' | 'inactive';
  widgets: string[];                  // Widget IDs assigned to this sidebar
}

interface RestWidget {
  id: string;
  id_base: string;
  sidebar: string;
  rendered: string;                   // Rendered frontend HTML
  rendered_form: string;              // Rendered backend form HTML
  instance: {
    encoded: string;                  // Base64-encoded serialized instance data
    hash: string;                     // HMAC hash for tamper detection
    raw?: Record<string, unknown>;    // Decoded instance (if widget supports it)
  };
}

interface RestWidgetType {
  id: string;                         // Widget type ID (id_base)
  name: string;
  description: string;
  is_multi: boolean;
  classname: string;
}

// ─── Block editor widget context ─────────────────────────────────────────────

interface EditWidgetsBlockEditorSettings {
  styles: Array<{ css: string }>;
  // Plus all standard block editor settings
  allowedBlockTypes: boolean | string[];
  hasFixedToolbar: boolean;
  [key: string]: unknown;
}

// ─── Walker_Nav_Menu_Edit column definitions ──────────────────────────────────

type NavMenuColumn =
  | 'link-target'
  | 'title-attribute'
  | 'css-classes'
  | 'xfn'
  | 'description';

interface NavMenuManageColumns {
  _title: string;
  cb: string;
  'link-target': string;
  'title-attribute': string;
  'css-classes': string;
  xfn: string;
  description: string;
}

// ─── Quick search request/response ───────────────────────────────────────────

interface NavMenuQuickSearchRequest {
  type: string;                       // e.g. 'quick-search-posttype-page'
  objectType?: string;
  q: string;
  responseFormat: 'json' | 'markup';
  ID?: number;
}

interface NavMenuQuickSearchResultItem {
  ID: number;
  post_title: string;
  post_type: string;
}

// ─── Menu JSON blob (to bypass max_input_vars) ────────────────────────────────

interface NavMenuDataEntry {
  name: string;   // e.g. 'menu-item-db-id[3]'
  value: string;
}

type NavMenuDataBlob = NavMenuDataEntry[];
```

---

## Section 14: Design Patterns

### 14.1 Menu items as posts

Nav menu items are `nav_menu_item` custom post type records, not a separate database table. This gives them all the infrastructure of posts (meta, revisions disabled, post status). The menu structure is encoded by:
- `menu_order` column → sort order within the menu
- `_menu_item_menu_item_parent` post meta → parent-child nesting (parent's post ID; 0 = root level)
- `wp_term_relationships` → which `nav_menu` term this item belongs to

The TypeScript implementation should model menu items as a flat array sorted by `menuOrder`, with parent-child relationships expressed via `menuItemParentId`.

### 14.2 max_input_vars workaround

Large menus can easily exceed PHP's `max_input_vars` limit (default 1000). WordPress works around this by serializing the entire menu as a JSON blob in a single POST field `nav-menu-data`. The `_wp_expand_nav_menu_post_data()` function parses this blob and repopulates `$_POST` before any processing happens.

The TypeScript equivalent should submit menu saves as a single JSON body rather than form-encoded data.

### 14.3 Idempotent item save

`wp_nav_menu_update_menu_items()` implements a diff-and-replace pattern:
1. Load all existing items for the menu.
2. For each item in the POST, upsert it.
3. Delete any existing items that were NOT in the POST.

This means the entire menu state is sent in every save. Partial saves are not supported. The TypeScript implementation should follow this same all-or-nothing pattern to avoid orphaned items.

### 14.4 Widget instance numbering

Widget instance numbers are not contiguous. When widgets are deleted, their numbers are not reused. The `_multiwidget` key in `widget_{id_base}` options tracks the next available number (it is always one more than the highest assigned number).

The TypeScript implementation should treat instance numbers as opaque identifiers and not assume contiguity.

### 14.5 Block vs classic widget detection

The decision to use the block or classic widget editor is made server-side via `wp_use_widgets_block_editor()`. Clients should not make this decision. The block editor uses REST API endpoints (`/wp/v2/widgets`, `/wp/v2/sidebars`) exclusively. The classic editor uses AJAX with `action=save-widget`. These two paths are mutually exclusive and should be implemented as separate systems.

### 14.6 Sidebar registration is theme-local

Sidebars are registered by the active theme (and sometimes plugins) on every request via `register_sidebar()`. They are not stored in the database. The `sidebars_widgets` option only stores the widget-to-sidebar mapping. If the theme changes and the new theme has different sidebar IDs, the old sidebar IDs become "orphaned" and their widgets are moved to the implicit inactive pool.

The TypeScript implementation needs to handle sidebar registration as a runtime configuration step, not a database-backed entity, and must gracefully handle the case where stored widget assignments reference sidebar IDs that are no longer registered.

### 14.7 Location assignment atomicity

Menu location assignments (`nav_menu_locations` theme mod) are updated as a whole when any change is made. A partial POST (e.g. only some locations submitted) results in the omitted locations being cleared for the current menu (not for other menus). The Manage Locations tab sends all locations in one form; the Edit Menu tab only sends checkboxes for locations associated with the current menu.

### 14.8 Orphaned draft menu items cleanup

When items are added to a new menu (not yet saved) and the user navigates away, draft `nav_menu_item` posts may be left orphaned. These are tagged with `_menu_item_orphaned` post meta set to the creation timestamp. A scheduled cleanup (`_wp_delete_orphaned_draft_menu_items`) deletes items with this meta where the timestamp is older than `EMPTY_TRASH_DAYS` days.

---

## Tovu Reconstruction Notes

### Why this exists

This admin surface exists to manage navigation structure, widget placement, and theme-defined presentation slots without hardcoding those relationships into the theme itself.

### What Tovu should preserve

- A whole-document save model for navigation structures
- Runtime-registered theme slots/sidebars rather than assuming they are static database entities
- A clear distinction between navigation data and widget/component placement data

### What Tovu can simplify

- Tovu does not need separate classic and block widget eras if it owns one coherent composition model
- Menu items do not need to be stored as pseudo-posts if ordering, nesting, and assignment rules stay explicit

### Possible Tovu seams

- `src/features/navigation/`
- `src/features/widget-placement/`
- `src/core/ports/ThemeSlotRegistryPort.ts`
- `src/core/ports/NavigationStorePort.ts`

### Suggested priority

- `V1`: navigation structures and theme-slot assignment
- `Later`: deeper widget-compatibility behavior and orphan-cleanup edge cases
