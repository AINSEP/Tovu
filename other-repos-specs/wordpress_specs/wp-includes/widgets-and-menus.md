# Widgets and Navigation Menus — Specification

**Source files analyzed:**
- `wp-includes/widgets.php`
- `wp-includes/class-wp-widget.php`
- `wp-includes/class-wp-widget-factory.php`
- `wp-includes/nav-menu.php`
- `wp-includes/nav-menu-template.php`
- `wp-includes/class-walker-nav-menu.php`
- `wp-includes/class-wp-walker.php`
- `wp-includes/widgets/class-wp-widget-block.php`
- `wp-includes/widgets/class-wp-widget-text.php`
- `wp-includes/widgets/class-wp-widget-pages.php` (sampled)

---

## 1. Overview

The WordPress widget system is the **legacy (pre-block) mechanism** for placing arbitrary content into registered sidebar areas in a theme. A "widget" is a self-contained unit of content that can be configured per-instance and placed into any sidebar. A "sidebar" (also called a widget area) is a named, theme-registered slot that renders all widgets assigned to it in order.

The system has three participants:

- **Sidebars** — named areas registered by the active theme. Defined with HTML wrappers (`before_widget`, `after_widget`, etc.).
- **Widget types** — classes extending `WP_Widget`, registered globally via `WP_Widget_Factory`. Each type can have zero or many instances.
- **Widget instances** — individual configured copies of a widget type. Settings are stored in the database under a per-type option key. The mapping of which widget instances appear in which sidebar is stored in the `sidebars_widgets` option.

From WordPress 5.8 onward, block-based widgets (`WP_Widget_Block`) allow Gutenberg block markup to be stored as widget instance data and rendered via the block parser. Themes can opt out of the block widget editor by removing the `widgets-block-editor` theme support flag.

---

## 2. Widget Areas (Sidebars)

### Global State

```typescript
// Equivalent global registries
const wpRegisteredSidebars: Record<string, SidebarDefinition> = {};
const wpRegisteredWidgets: Record<string, RegisteredWidget> = {};
const wpRegisteredWidgetControls: Record<string, RegisteredWidgetControl> = {};
const wpRegisteredWidgetUpdates: Record<string, RegisteredWidgetUpdate> = {};
```

### `register_sidebar(args?)`

Registers a single widget area and returns its ID.

**Parameters (all optional, passed as a plain object):**

| Key | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | `'Sidebar {n}'` | Human-readable name shown in admin |
| `id` | `string` | `'sidebar-{n}'` | Slug-like unique identifier. **Should always be explicitly set**; omitting it triggers a deprecation notice. |
| `description` | `string` | `''` | Shown in Widgets admin panel |
| `class` | `string` | `''` | Extra CSS class for admin display only |
| `before_widget` | `string` | `'<li id="%1$s" class="widget %2$s">'` | HTML prepended to each widget. `%1$s` = widget's HTML `id` attribute (the instance id with backslashes replaced by underscores), `%2$s` = classname derived from the widget's `classname` option |
| `after_widget` | `string` | `"</li>\n"` | HTML appended to each widget |
| `before_title` | `string` | `'<h2 class="widgettitle">'` | HTML prepended to each widget's title |
| `after_title` | `string` | `"</h2>\n"` | HTML appended to each widget's title |
| `before_sidebar` | `string` | `''` | HTML prepended to the whole sidebar (front-end only). `%1$s` = sidebar id, `%2$s` = sidebar class |
| `after_sidebar` | `string` | `''` | HTML appended to the whole sidebar (front-end only) |
| `show_in_rest` | `boolean` | `false` | Whether to expose this sidebar to non-admin users via the REST API |

**Behavior:**

1. Compute `i = count(wpRegisteredSidebars) + 1` for default name/id generation.
2. Apply the `register_sidebar_defaults` filter to the defaults object before merging with caller args.
3. If `args.id` was not provided, emit a `_doing_it_wrong` notice.
4. Store the merged sidebar definition in `wpRegisteredSidebars[sidebar.id]`.
5. Automatically call `add_theme_support('widgets')`.
6. Fire the `register_sidebar` action, passing the sidebar definition.
7. Return `sidebar.id`.

### `register_sidebars(number?, args?)`

Creates `number` sidebars at once. Default `number` is 1.

**ID collision handling:**
- If a custom `id` is provided and already registered, append `-2`, `-3`, etc. (starting at `-2`).
- If no `id` is provided, iterate `sidebar-{n}` starting from `count(wpRegisteredSidebars) + 1`, skipping any already registered.

**Name handling:**
- If registering more than one sidebar and `name` contains `%d`, it is treated as a `sprintf` template with the loop index `i`.
- If no `name` provided and multiple sidebars, defaults to `'Sidebar {i}'`.
- If a single sidebar, defaults to `'Sidebar'`.

Each iteration calls `register_sidebar()` with the adjusted args.

### `unregister_sidebar(sidebarId)`

Deletes the entry from `wpRegisteredSidebars[sidebarId]`. No return value. No action is fired.

### `is_registered_sidebar(sidebarId)`

Returns `boolean` — whether `sidebarId` exists as a key in `wpRegisteredSidebars`.

---

## 3. `WP_Widget` Base Class

The abstract base class all widget types must extend. Subclasses **must** override `widget()`. They **should** override `update()` and `form()`.

### Properties

| Property | Type | Description |
|---|---|---|
| `id_base` | `string` | Lowercase unique root ID for all instances of this type (e.g. `'text'`, `'recent-posts'`) |
| `name` | `string` | Human-readable display name shown in admin |
| `option_name` | `string` | WordPress option key: `'widget_' + id_base`. Settings for all instances of this type are stored under this key. |
| `alt_option_name` | `string \| undefined` | Legacy fallback option name. If set, and `option_name` has no data, settings are read from this key and then the key is deleted. |
| `widget_options` | `object` | Options passed to `wp_register_sidebar_widget()`. Always includes: `classname` (defaults to `str_replace('\\', '_', option_name)`), `customize_selective_refresh` (defaults to `false`). May include: `description`, `show_instance_in_rest`. |
| `control_options` | `object` | Options passed to `wp_register_widget_control()`. Always includes: `id_base`. May include: `width` (default 250px), `height` (default 200px, never used). |
| `number` | `number \| false` | The instance number currently being rendered (set via `_set()`). `false` when not set. |
| `id` | `string \| false` | The full instance ID string: `'{id_base}-{number}'`. `false` when not set. |
| `updated` | `boolean` | Guard flag preventing double-save during `update_callback`. Reset to `false` on construction. |

### Constructor

```typescript
constructor(
  id_base: string,   // If empty string, derived from class name by stripping 'wp_' prefix and 'widget_' prefix
  name: string,
  widget_options?: object,
  control_options?: object
)
```

- `id_base` is lowercased.
- If `id_base` is empty, the class name is lowercased and the regex `/(wp_)?widget_/` is stripped from it.
- `option_name` is set to `'widget_' + id_base`.
- `widget_options` is merged with defaults: `{ classname: str_replace('\\', '_', option_name), customize_selective_refresh: false }`.
- `control_options` is merged with defaults: `{ id_base: id_base }`.

### Abstract Methods (must be overridden)

#### `widget(args, instance): void`

Called by the display system to render the widget. Implementations echo HTML directly.

| Parameter | Type | Description |
|---|---|---|
| `args` | `SidebarArgs` | The sidebar's wrapper arguments (`before_widget`, `after_widget`, `before_title`, `after_title`, `widget_id`, `widget_name`, plus all sidebar definition fields). `before_widget` has already had `%1$s`/`%2$s` substituted by the time this is called. |
| `instance` | `Record<string, unknown>` | The specific instance's saved settings |

The base class implementation calls `die()` (throws in TypeScript terms). **Never call super.widget()**.

#### `update(newInstance, oldInstance): Record<string, unknown> | false`

Sanitize/validate new settings before saving. Return the sanitized instance to save, or `false` to cancel saving.

The base class returns `newInstance` unchanged (passthrough default). Override to apply sanitization.

#### `form(instance): string | void`

Render the admin settings form. Should output HTML form fields. Returns `'noform'` if the widget has no settings (and the base class echoes a "no options" paragraph and returns `'noform'`).

Form field names **must** use `get_field_name()`. Form field IDs **must** use `get_field_id()`.

### Helper Methods

#### `get_field_name(fieldName): string`

Generates the correct `name` attribute for form inputs so that posted data is automatically routed to the correct widget instance.

Format: `'widget-{id_base}[{number}][{fieldName}]'`

If `fieldName` itself contains array notation (e.g. `'options[color]'`), the brackets are properly transformed.

#### `get_field_id(fieldName): string`

Generates the correct `id` attribute for form inputs.

Format: `'widget-{id_base}-{number}-{fieldName}'`

Array brackets (`[]`, `[`, `]`) in `fieldName` are replaced with `-`, then the result is trimmed of leading/trailing `-`.

### Final/Internal Methods (do NOT override)

#### `_set(number): void`

Sets `this.number = number` and `this.id = this.id_base + '-' + number`. Called before rendering or form display to point the widget at a specific instance.

#### `display_callback(args, widgetArgs?): void`

The actual callback invoked by `dynamic_sidebar()`. Never override.

1. If `widgetArgs` is a number, wrap it: `{ number: widgetArgs }`.
2. Parse `widgetArgs` with default `{ number: -1 }`.
3. Call `this._set(widgetArgs.number)`.
4. Load all instances via `get_settings()`.
5. If the instance number exists in settings:
   a. Apply the `widget_display_callback` filter to the instance. If the filter returns `false`, abort rendering.
   b. If in Customizer preview, suspend object-cache additions.
   c. Call `this.widget(args, instance)`.
   d. Restore cache suspension if changed.

#### `update_callback(deprecated?): void`

The admin-side POST handler. Never override.

1. Guard with `this.updated` to prevent double-execution.
2. If `$_POST['delete_widget']` is set, delete that instance number from settings.
3. Otherwise, extract the posted `widget-{id_base}` array from `$_POST`, call `this.update(newInstance, oldInstance)`, apply the `widget_update_callback` filter. If not `false`, save.
4. Call `save_settings()`.
5. Set `this.updated = true`.

#### `form_callback(widgetArgs?): string | null`

The admin form renderer. Never override.

1. Parse `widgetArgs` (default `{ number: -1 }`).
2. If number is `-1`, set instance to empty (`{}`) and set `this.number = '__i__'` (template mode for JS-inserted new instances).
3. Otherwise, look up the instance.
4. Apply `widget_form_callback` filter. If `false`, abort.
5. Call `this.form(instance)`.
6. Fire `in_widget_form` action.
7. Return the return value of `form()`.

#### `_register(): void`

Called by `WP_Widget_Factory._register_widgets()` once per widget type. Reads all saved instances from `get_settings()`. For each numeric key, calls `_set(number)` then `_register_one(number)`. If there are no instances, registers a generic template with number `1`.

#### `_register_one(number?): void`

Calls three registration functions:
- `wp_register_sidebar_widget(this.id, this.name, displayCallback, this.widget_options, { number })`
- `_register_widget_update_callback(this.id_base, updateCallback, this.control_options, { number: -1 })`
- `_register_widget_form_callback(this.id, this.name, formCallback, this.control_options, { number })`

#### `get_settings(): Record<number, Record<string, unknown>>`

Loads all instances from the database option `option_name`.

- If option doesn't exist, falls back to `alt_option_name` if set (reads it, deletes it, saves under the new key).
- If settings exist but have no `_multiwidget` key, this is old single-widget format — calls `wp_convert_widget_settings()` to convert to multi-widget format.
- Strips the `_multiwidget` and `__i__` keys from the returned object.
- Returns a plain object keyed by numeric instance number.

#### `save_settings(settings): void`

Sets `settings._multiwidget = 1`, then calls `update_option(this.option_name, settings)`.

### ID Generation

- `id_base`: The root identifier for the type. All instances share this base.
- `number`: A positive integer uniquely identifying an instance within its type. Numbers are not necessarily contiguous.
- `id` (widget instance ID): `'{id_base}-{number}'`, e.g. `'text-3'`, `'recent-posts-1'`.
- The `sidebars_widgets` option stores these full instance IDs.

### Multi-Widget Numbering

When a new instance is added in the admin, the highest existing number is incremented by one. Numbers start at 2 (instance `1` is the "template" used before any instances exist). Numbers 1 through some threshold are considered "default" instances and are not moved to `wp_inactive_widgets` during theme changes; instances numbered 2+ may be moved.

---

## 4. `WP_Widget_Factory`

The singleton that manages all registered widget types.

### Properties

| Property | Type | Description |
|---|---|---|
| `widgets` | `Record<string, WP_Widget>` | Map of key → widget instance. Key is the class name (string) for class-name registrations, or `spl_object_hash` equivalent (unique object ID) for instance registrations. |

### Construction

On construction, registers `_register_widgets()` on the `widgets_init` action at priority `100`.

### `register(widget)`

Accepts either a class name string or a `WP_Widget` instance.

- If a class name string: instantiates the class with `new widget()` and stores under `widgets[className]`.
- If an instance: stores under `widgets[uniqueObjectId]` (using object hash as key).

### `unregister(widget)`

Removes the entry from `widgets`. Accepts a class name string or instance. The key lookup mirrors `register()`.

### `_register_widgets()`

Fired at `widgets_init` priority 100. Iterates all registered widget types. For each, checks whether the `id_base` is already present in `wpRegisteredWidgets` (comparing the `id_base` extracted from each registered widget ID). If already registered, removes the entry from `this.widgets` and skips. Otherwise calls `widget._register()`.

### `get_widget_object(id_base): WP_Widget | null`

Returns the `WP_Widget` instance for the given `id_base`, or `null` if not found.

### `get_widget_key(id_base): string`

Returns the internal key used in `this.widgets` for the given `id_base`, or `''` if not found.

### `is_registered(id_base): boolean`

Implied: returns whether `get_widget_key(id_base) !== ''`.

---

## 5. Widget Registration API

### `register_widget(widget)`

Public wrapper for `WP_Widget_Factory.register()`. Accepts a class name string or `WP_Widget` instance.

### `unregister_widget(widget)`

Public wrapper for `WP_Widget_Factory.unregister()`. Accepts a class name string or `WP_Widget` instance.

### `wp_register_sidebar_widget(id, name, outputCallback, options?, ...params)`

The low-level registration function that populates `wpRegisteredWidgets`. Normally called internally via `WP_Widget._register_one()`.

- `id` is lowercased.
- If `outputCallback` is empty, unregisters the widget (deletes from `wpRegisteredWidgets`).
- Rejects deprecated callback names if not callable.
- Stores in `wpRegisteredWidgets[id]`: `{ name, id, callback: outputCallback, params, classname, description?, show_instance_in_rest? }`.
- Fires the `wp_register_sidebar_widget` action with the widget definition.

---

## 6. Rendering: `dynamic_sidebar(index?)`

Renders all widgets assigned to a sidebar. Default `index` is `1`.

### Index Resolution

1. If `index` is an integer, treat as `'sidebar-{index}'`.
2. Otherwise, `sanitize_title(index)` the value, then scan `wpRegisteredSidebars` for a sidebar whose `sanitize_title(name)` matches. If found, use that sidebar's key.

### Early Bail

If `wpRegisteredSidebars[index]` does not exist, or `sidebars_widgets[index]` is empty or not an array:
- Fire `dynamic_sidebar_before(index, false)`
- Fire `dynamic_sidebar_after(index, false)`
- Return `apply_filters('dynamic_sidebar_has_widgets', false, index)`

### Rendering Loop

1. Load `sidebar = wpRegisteredSidebars[index]`.
2. Interpolate `sidebar.before_sidebar` using `sprintf(before_sidebar, sidebar.id, sidebar.class)`.
3. Fire `dynamic_sidebar_before(index, true)`.
4. If not in admin and `before_sidebar` is non-empty, echo it.
5. For each widget instance ID in `sidebars_widgets[index]`:
   a. Skip if not in `wpRegisteredWidgets`.
   b. Build `params[0]` by merging sidebar definition with `{ widget_id: id, widget_name: widget.name }`.
   c. Build the classname by concatenating all string/object entries from `widget.classname`, joining with `_` and stripping a leading `_`.
   d. Call `sprintf(params[0].before_widget, str_replace('\\', '_', id), classname)` to finalize `before_widget`.
   e. Apply the `dynamic_sidebar_params` filter to `params`.
   f. Fire the `dynamic_sidebar` action with the widget definition object.
   g. If the callback is callable, call it with the params array. Set `did_one = true`.
6. If not in admin and `after_sidebar` is non-empty, echo it.
7. Fire `dynamic_sidebar_after(index, true)`.
8. Return `apply_filters('dynamic_sidebar_has_widgets', did_one, index)`.

### `is_active_sidebar(index)`

Returns whether the sidebar has any widget instance IDs in `sidebars_widgets`. Integer indexes are converted to `'sidebar-{index}'` and string indexes are passed through `sanitize_title`. The final boolean is passed through the `is_active_sidebar` filter.

### `is_active_widget(callback?, widgetId?, idBase?, skipInactive?)`

Scans the full `sidebars_widgets` map. Returns the first sidebar ID where a matching widget is found, or `false`.

Matching logic: either `widget.callback === callback` (by reference) OR `_get_widget_id_base(widgetInstanceId) === idBase`. If `widgetId` is also provided, additionally checks `widget.id === widgetId`.

By default (`skipInactive = true`), skips `wp_inactive_widgets` and any sidebar starting with `orphaned_widgets`.

---

## 7. Widget Storage

### `sidebars_widgets` Option

Stored in the WordPress options table under the key `sidebars_widgets`.

```typescript
type SidebarsWidgets = {
  [sidebarId: string]: string[];  // array of widget instance IDs, e.g. ['text-2', 'recent-posts-1']
  array_version?: 3;              // internal version marker, stripped before use
  wp_inactive_widgets?: string[]; // widgets not assigned to any active sidebar
};
```

The `array_version` key (value `3`) is added when saving and stripped when reading. `wp_inactive_widgets` holds widget instance IDs that exist in settings but are not assigned to any registered sidebar.

### Per-Type Widget Settings Option

Each widget type stores all its instances under `widget_{id_base}` in WordPress options.

```typescript
type WidgetTypeSettings = {
  [instanceNumber: number]: Record<string, unknown>;  // instance-specific settings
  _multiwidget: 1;   // flag indicating multi-widget format; present in DB but stripped by get_settings()
  __i__?: Record<string, unknown>;  // template entry, stripped by get_settings()
};
```

Example: `widget_text` might be:
```json
{
  "2": { "title": "Hello", "text": "World", "filter": true, "visual": true },
  "3": { "title": "Another", "text": "Content", "filter": false },
  "_multiwidget": 1
}
```

### `wp_get_sidebars_widgets()`

Returns the full `sidebars_widgets` map. On the front end, uses a module-level cache (`$_wp_sidebars_widgets`) to avoid repeated database reads. In the admin, always reads fresh from the database. Applies the `sidebars_widgets` filter.

### `wp_set_sidebars_widgets(sidebarsWidgets)`

Saves the mapping. Clears the module-level cache. Adds `array_version: 3` before saving.

### `_get_widget_id_base(id): string`

Strips the trailing `-{number}` from a widget instance ID. `'text-3'` → `'text'`, `'recent-posts-2'` → `'recent-posts'`.

Implementation: regex replace `/-[0-9]+$/` with `''`.

### `wp_parse_widget_id(id)`

Parses an instance ID into `{ id_base, number? }`. If the ID matches `{base}-{digits}`, returns both. Otherwise returns `{ id_base: id }` (legacy single-widget format).

---

## 8. Built-in Widget Types

All built-in widgets are registered in `wp_widgets_init()`, which fires on the `init` hook. After registering all built-in types, `wp_widgets_init()` fires the `widgets_init` action, which is the correct hook for third-party code to register or unregister widgets.

| Class | `id_base` | `classname` | Description |
|---|---|---|---|
| `WP_Widget_Pages` | `pages` | `widget_pages` | List of static pages with sort/exclude options |
| `WP_Widget_Calendar` | `calendar` | `widget_calendar` | Monthly calendar of posts |
| `WP_Widget_Archives` | `archives` | `widget_archive` | Monthly archive drop-down or list |
| `WP_Widget_Media_Audio` | `media_audio` | `widget_media_audio` | Single audio file embed |
| `WP_Widget_Media_Image` | `media_image` | `widget_media_image` | Single image embed |
| `WP_Widget_Media_Video` | `media_video` | `widget_media_video` | Single video embed |
| `WP_Widget_Media_Gallery` | `media_gallery` | `widget_media_gallery` | Gallery of images |
| `WP_Widget_Meta` | `meta` | `widget_meta` | Login/logout link, RSS, WordPress.org links |
| `WP_Widget_Search` | `search` | `widget_search` | Search form |
| `WP_Widget_Text` | `text` | `widget_text` | Arbitrary text/HTML with optional TinyMCE editor |
| `WP_Widget_Categories` | `categories` | `widget_categories` | Category list or drop-down |
| `WP_Widget_Recent_Posts` | `recent-posts` | `widget_recent_entries` | List of most recent posts |
| `WP_Widget_Recent_Comments` | `recent-comments` | `widget_recent_comments` | List of most recent comments |
| `WP_Widget_RSS` | `rss` | `widget_rss` | Entries from any RSS/Atom feed |
| `WP_Widget_Tag_Cloud` | `tag_cloud` | `widget_tag_cloud` | Tag cloud |
| `WP_Nav_Menu_Widget` | `nav_menu` | `widget_nav_menu` | Navigation menu picker |
| `WP_Widget_Custom_HTML` | `custom_html` | `widget_custom_html` | Arbitrary HTML with syntax highlighting |
| `WP_Widget_Block` | `block` | `widget_block` | Block markup rendered via block parser |

`WP_Widget_Links` (id_base `links`) is conditionally registered only when the `link_manager_enabled` option is truthy.

### Instance Settings Schemas

**`WP_Widget_Pages`:**
```typescript
{ title?: string; sortby?: string; exclude?: string }
```

**`WP_Widget_Text`:**
```typescript
{ title?: string; text?: string; filter?: boolean | 'content'; visual?: boolean }
```
- `filter: true` = apply `wpautop`.
- `visual: true` = use TinyMCE visual editor; implies `filter: true`.
- `visual: false` or absent = legacy mode.

**`WP_Widget_Block`:**
```typescript
{ content: string }  // serialized block markup, e.g. '<!-- wp:paragraph --><p>Hello</p><!-- /wp:paragraph -->'
```

**`WP_Widget_RSS`:**
```typescript
{ url: string; title?: string; items?: number; show_summary?: 0|1; show_author?: 0|1; show_date?: 0|1; error?: string; link?: string }
```

**`WP_Widget_Categories`:**
```typescript
{ title?: string; count?: 0|1; hierarchical?: 0|1; dropdown?: 0|1 }
```

**`WP_Widget_Recent_Posts`:**
```typescript
{ title?: string; number?: number; show_date?: 0|1 }
```

**`WP_Nav_Menu_Widget`:**
```typescript
{ title?: string; nav_menu?: number }  // nav_menu is the term_id of the menu
```

---

## 9. Block Widgets

### `WP_Widget_Block`

Introduced in WordPress 5.8. Stores raw serialized block markup in the instance's `content` field.

**Rendering:**

1. Echo `before_widget`, but with the classname dynamically replaced. The standard classname `widget_block` is substituted with a block-aware classname derived from the first block's `blockName`:

| Block name | Substituted classname |
|---|---|
| `core/paragraph` | `widget_block widget_text` |
| `core/calendar` | `widget_block widget_calendar` |
| `core/search` | `widget_block widget_search` |
| `core/html` | `widget_block widget_custom_html` |
| `core/archives` | `widget_block widget_archive` |
| `core/latest-posts` | `widget_block widget_recent_entries` |
| `core/latest-comments` | `widget_block widget_recent_comments` |
| `core/tag-cloud` | `widget_block widget_tag_cloud` |
| `core/categories` | `widget_block widget_categories` |
| `core/audio` | `widget_block widget_media_audio` |
| `core/video` | `widget_block widget_media_video` |
| `core/image` | `widget_block widget_media_image` |
| `core/gallery` | `widget_block widget_media_gallery` |
| `core/rss` | `widget_block widget_rss` |
| (any other) | `widget_block` |

2. Apply the `widget_block_content` filter to `instance.content`.
3. Echo the filtered content.
4. Echo `after_widget`.

The `widget_block_dynamic_classname` filter can override the computed classname.

**`update()`** sanitizes `content` via `wp_kses_post()` unless the user has `unfiltered_html` capability.

### Block Widget Editor

The block widget editor is enabled by default via the `widgets-block-editor` theme support flag, added in `wp_setup_widgets_block_editor()` on `after_setup_theme`. Themes can remove support via `remove_theme_support('widgets-block-editor')`. The `use_widgets_block_editor` filter can also override whether the block editor is used.

---

## 10. Navigation Menu Data Model

Navigation menus use two separate WordPress content types:

### Menus → Taxonomy Terms

Each menu is a **term** in the `nav_menu` taxonomy. The `WP_Term` object for a menu has:

```typescript
interface NavMenuTerm {
  term_id: number;
  name: string;               // human-readable menu name
  slug: string;               // url-safe version of name
  term_group: number;
  term_taxonomy_id: number;
  taxonomy: 'nav_menu';
  description: string;
  parent: number;             // always 0 for menus
  count: number;              // number of items in the menu
}
```

### Menu Items → Posts

Each menu item is a **post** with `post_type = 'nav_menu_item'`. The raw `WP_Post` data is:

| Post field | Usage |
|---|---|
| `ID` | Post ID, used as the menu item's database ID |
| `post_title` | Custom title override. Empty string means use the linked object's title. |
| `post_content` | Item description |
| `post_excerpt` | `attr_title` (the HTML `title` attribute value) |
| `post_parent` | The original object's parent ID (for hierarchical types) |
| `menu_order` | Controls display order within the menu |
| `post_status` | `'publish'` = active; `'draft'` = draft/hidden |

Menu item configuration is stored in post meta:

| Meta key | Type | Description |
|---|---|---|
| `_menu_item_type` | `'post_type' \| 'taxonomy' \| 'post_type_archive' \| 'custom'` | What the item links to |
| `_menu_item_object` | `string` | Post type name or taxonomy name. `'custom'` for arbitrary URL items. |
| `_menu_item_object_id` | `string` (numeric) | ID of the linked object (post ID or term ID). Equals the item's own post ID for custom items. |
| `_menu_item_menu_item_parent` | `string` (numeric) | The `db_id` of the parent menu item. `'0'` for top-level items. |
| `_menu_item_url` | `string` | The URL for custom link items. Empty for post_type/taxonomy items (URL is derived at render time). |
| `_menu_item_target` | `string` | Link `target` attribute (e.g. `'_blank'`). |
| `_menu_item_classes` | `string[]` (serialized array) | Extra CSS classes for the `<li>` element. |
| `_menu_item_xfn` | `string` | XFN relationship string for the `rel` attribute. |
| `_menu_item_orphaned` | `string` (timestamp) | Set when item belongs to no menu (menu_id = 0). |

### Decorated Menu Item Object (`wp_setup_nav_menu_item()`)

Before rendering, each raw `WP_Post` is decorated with additional properties:

```typescript
interface NavMenuItem extends WP_Post {
  db_id: number;               // same as ID, the post ID of the nav_menu_item
  menu_item_parent: string;    // value of _menu_item_menu_item_parent
  object_id: string;           // value of _menu_item_object_id
  object: string;              // value of _menu_item_object (post type or taxonomy name)
  type: string;                // value of _menu_item_type
  type_label: string;          // human-readable type label
  url: string;                 // resolved URL for the linked object
  title: string;               // resolved title (custom override or object's native title)
  attr_title: string;          // _menu_item_attr_title (filtered by nav_menu_attr_title)
  description: string;         // filtered by nav_menu_description
  classes: string[];           // _menu_item_classes array
  xfn: string;                 // _menu_item_xfn
  target: string;              // _menu_item_target
  current: boolean;            // true if this item matches the current page
  current_item_ancestor: boolean;  // true if this item is an ancestor of the current item
  current_item_parent: boolean;    // true if this item is the direct parent of the current item
  _invalid?: boolean;          // true if the linked object no longer exists
}
```

---

## 11. Menu Locations

Themes declare named slots where navigation menus can be placed.

### Global State

```typescript
const _wpRegisteredNavMenus: Record<string, string> = {};
// key = location slug (e.g. 'primary'), value = human-readable description
```

### `register_nav_menu(location, description)`

Registers a single location.

1. Calls `add_theme_support('menus')`.
2. Adds `{ [location]: description }` to `_wpRegisteredNavMenus` (merge, not replace).

### `register_nav_menus(locations)`

Bulk version. Merges `locations` (an object of `slug → description` pairs) into `_wpRegisteredNavMenus`. Validates that all keys are strings (integer keys trigger a `_doing_it_wrong` notice).

### `unregister_nav_menu(location): boolean`

Removes the location from `_wpRegisteredNavMenus`. If the registry becomes empty, removes the `'menus'` theme support. Returns `true` on success, `false` if the location was not registered.

### `get_registered_nav_menus(): Record<string, string>`

Returns the full `_wpRegisteredNavMenus` map.

### `has_nav_menu(location): boolean`

Returns `true` if both:
1. The location is registered in `_wpRegisteredNavMenus`, AND
2. A menu has been assigned to that location (i.e. `get_nav_menu_locations()[location]` is non-empty).

Passed through the `has_nav_menu` filter.

### `get_nav_menu_locations(): Record<string, number>`

Returns the theme mod `nav_menu_locations`, which maps location slugs to menu term IDs. This is the "which menu goes where" assignment. Returns empty object if not set.

### `set_theme_mod('nav_menu_locations', locations)`

This is how the menu-to-location assignment is persisted. It is stored in the theme's own settings (the `theme_mods_{theme-slug}` option), not in a dedicated option. The value is `{ [locationSlug]: menuTermId }`.

---

## 12. Menu CRUD

### `wp_create_nav_menu(menuName): number | WP_Error`

Creates a new menu. Delegates to `wp_update_nav_menu_object(0, { 'menu-name': menuName })`.

Returns the new menu's `term_id` on success.

### `wp_update_nav_menu_object(menuId, menuData): number | WP_Error`

Creates or updates a menu.

- If `menuId === 0`: creates a new term in the `nav_menu` taxonomy via `wp_insert_term()`. Fires `wp_create_nav_menu(termId, menuData)`.
- If `menuId > 0`: updates the existing term via `wp_update_term()`. Fires `wp_update_nav_menu(menuId, menuData)`.
- If the new `menu-name` conflicts with another existing menu's name, returns a `WP_Error` with code `'menu_exists'`.

`menuData` fields:
- `menu-name` (string, required) — the menu's display name
- `description` (string, optional)
- `parent` (number, optional, default 0)

### `wp_delete_nav_menu(menu): boolean | WP_Error`

1. Resolve `menu` to a `WP_Term` via `wp_get_nav_menu_object()`.
2. Delete all `nav_menu_item` posts associated with this menu (via `get_objects_in_term()`).
3. Delete the taxonomy term via `wp_delete_term()`.
4. Remove this menu from all location assignments (set to `0` in `nav_menu_locations` theme mod).
5. Fire `wp_delete_nav_menu(termId)`.

### `wp_get_nav_menu_object(menu): WP_Term | false`

Resolves a menu reference to its `WP_Term`. Accepts:
- A `WP_Term` object (returned as-is)
- A numeric ID (looked up via `get_term()`)
- A slug string (looked up via `get_term_by('slug', ...)`)
- A name string (looked up via `get_term_by('name', ...)`)

Returns `false` if nothing found or on error. The result is passed through the `wp_get_nav_menu_object` filter.

### `wp_get_nav_menus(args?): WP_Term[]`

Returns all menus. Calls `get_terms({ taxonomy: 'nav_menu', hide_empty: false, orderby: 'name', ...args })`. Filtered by `wp_get_nav_menus`.

---

## 13. Menu Item CRUD

### `wp_update_nav_menu_item(menuId, menuItemDbId, menuItemData, fireAfterHooks?): number | WP_Error`

Creates or updates a single menu item.

**Key input fields (`menuItemData`):**

| Field | Type | Default | Description |
|---|---|---|---|
| `menu-item-type` | `string` | `'custom'` | `'post_type'`, `'taxonomy'`, `'post_type_archive'`, or `'custom'` |
| `menu-item-object` | `string` | `''` | Post type slug, taxonomy slug, or `'custom'` |
| `menu-item-object-id` | `number` | `0` | Target post ID or term ID |
| `menu-item-parent-id` | `number` | `0` | Parent menu item's `db_id` |
| `menu-item-position` | `number` | `0` | `menu_order`. If `0`, auto-set to last position + 1 |
| `menu-item-title` | `string` | `''` | Custom title override. Empty = use object's native title |
| `menu-item-url` | `string` | `''` | URL for custom links |
| `menu-item-description` | `string` | `''` | Item description (stored in `post_content`) |
| `menu-item-attr-title` | `string` | `''` | `title` attribute (stored in `post_excerpt`) |
| `menu-item-target` | `string` | `''` | Link `target` attribute |
| `menu-item-classes` | `string` | `''` | Space-separated CSS classes |
| `menu-item-xfn` | `string` | `''` | XFN relationship value |
| `menu-item-status` | `string` | `''` | `'publish'` or `'draft'` |

**Behavior:**

1. Validate: if `menuItemDbId > 0`, it must be a `nav_menu_item` post type. Otherwise returns `WP_Error`.
2. Auto-position: if position is 0 and menu exists, set to `last_menu_order + 1`.
3. Non-custom items: blank out `menu-item-url` (derived at render time). If the custom title matches the object's native title, blank it out too (so native title changes are reflected automatically).
4. Create or update the `nav_menu_item` post.
5. Assign the item to the menu term via `wp_set_object_terms()`.
6. Write all meta fields: `_menu_item_type`, `_menu_item_menu_item_parent`, `_menu_item_object_id`, `_menu_item_object`, `_menu_item_target`, `_menu_item_classes`, `_menu_item_xfn`, `_menu_item_url`.
7. If `menuId === 0`, write `_menu_item_orphaned` with current timestamp.
8. Fire `wp_add_nav_menu_item(menuId, menuItemDbId, args)` for new items, `wp_update_nav_menu_item(menuId, menuItemDbId, args)` for updates.

**Circular parent prevention:** if `menu-item-parent-id === menuItemDbId`, the parent is reset to `0`.

### `wp_get_nav_menu_items(menu, args?): NavMenuItem[] | false`

Fetches all items for a menu, decorated and sorted.

1. Resolve `menu` to a term object.
2. Run `get_posts({ post_type: 'nav_menu_item', post_status: 'publish', orderby: 'menu_order', order: 'ASC', nopaging: true, tax_query: [{ taxonomy: 'nav_menu', field: 'term_taxonomy_id', terms: menu.term_taxonomy_id }] })`.
3. Apply `wp_setup_nav_menu_item()` to each post to decorate with resolved properties.
4. On the front end, filter out invalid items (`_invalid === true`).
5. Re-sort by `output_key` (default `'menu_order'`) and re-number sequentially starting at 1.
6. Apply `wp_get_nav_menu_items(items, menu, args)` filter and return.

---

## 14. `wp_nav_menu(args?)`

The primary template function for outputting a navigation menu. Returns `void` (if echoing) or `string` (if not echoing) or `false` on failure.

### Arguments

| Key | Type | Default | Description |
|---|---|---|---|
| `menu` | `number \| string \| WP_Term \| ''` | `''` | The specific menu to display, by ID, slug, name, or object |
| `menu_class` | `string` | `'menu'` | CSS class for the `<ul>` element |
| `menu_id` | `string` | `''` | ID for the `<ul>`. If empty, auto-generated as `'menu-{slug}'`, with `-1`, `-2`, etc. appended for duplicates within the same page request |
| `container` | `string` | `'div'` | Wrapping element tag. Must be `'div'` or `'nav'` (or another tag listed in `wp_nav_menu_container_allowedtags` filter). Set to `''` or `false` for no wrapper. |
| `container_class` | `string` | `''` | CSS class for the container. Defaults to `'menu-{slug}-container'` if empty |
| `container_id` | `string` | `''` | ID attribute for the container |
| `container_aria_label` | `string` | `''` | `aria-label` attribute for the container (only applied when `container = 'nav'`) |
| `fallback_cb` | `callable \| false` | `'wp_page_menu'` | Called with `(array)args` if no menu is found or menu has no items (and no `theme_location` is set). Set to `false` for no fallback. |
| `before` | `string` | `''` | Raw text/HTML inserted before each `<a>` element |
| `after` | `string` | `''` | Raw text/HTML inserted after each `<a>` element |
| `link_before` | `string` | `''` | Text/HTML inside the `<a>`, before the link text |
| `link_after` | `string` | `''` | Text/HTML inside the `<a>`, after the link text |
| `echo` | `boolean` | `true` | `true` to echo, `false` to return |
| `depth` | `number` | `0` | `0` = all levels. `1` = top-level only. `-1` = flat (all items, no nesting) |
| `walker` | `Walker \| ''` | `''` | Custom `Walker` instance. If empty, a new `Walker_Nav_Menu` is used |
| `theme_location` | `string` | `''` | Registered location slug. If set, uses the menu assigned to this location |
| `items_wrap` | `string` | `'<ul id="%1$s" class="%2$s">%3$s</ul>'` | Printf template. `%1$s` = menu_id, `%2$s` = menu_class, `%3$s` = items HTML |
| `item_spacing` | `'preserve' \| 'discard'` | `'preserve'` | `'preserve'` adds indentation whitespace; `'discard'` omits it |

### Menu Selection Logic

1. If `args.menu` is set, try to resolve it directly via `wp_get_nav_menu_object()`.
2. If not found (or `args.menu` was empty) and `args.theme_location` is set and has a location assignment, resolve the assigned menu.
3. If still not found and no `theme_location` set, iterate all menus and use the first one that has items.

### Short-Circuit

The `pre_wp_nav_menu` filter runs before any rendering. If it returns a non-null value, that value is echoed/returned immediately.

### Fallback Behavior

- If no menu is found or the menu has no items AND no `theme_location` is set: call `fallback_cb((array)args)` and return its result.
- If a `theme_location` is set but the menu is empty: return `false` (no fallback).

### Item Class Assignment

Before walking, `_wp_menu_item_classes_by_context()` is called on all items. This function adds context-aware CSS classes to each item:

- `menu-item` — added to every item.
- `menu-item-type-{type}` — e.g. `menu-item-type-post_type`.
- `menu-item-object-{object}` — e.g. `menu-item-object-page`.
- `menu-item-home` — if the item links to the front page.
- `menu-item-privacy-policy` — if the item links to the privacy policy page.
- `current-menu-item` — if the item matches the current URL/post/term.
- `current-menu-ancestor` — if the item is an ancestor of the current item.
- `current-menu-parent` — if the item is the direct parent of the current item.
- `current-{type}-ancestor` / `current-{type}-parent` — type-specific ancestor/parent classes.
- Back-compat classes for pages: `page_item`, `page-item-{id}`, `current_page_item`, `current_page_parent`, `current_page_ancestor`.

`menu-item-has-children` is added in `wp_nav_menu()` itself, before calling the walker, for any item that has child items in the sorted list.

### Output Structure

```html
<div class="menu-{slug}-container" id="..." aria-label="...">
  <ul id="menu-{slug}" class="menu">
    <!-- walker output here -->
  </ul>
</div>
```

The `wp_nav_menu_items` filter and `wp_nav_menu_{slug}_items` filter both fire on the items HTML before it is inserted into `items_wrap`. The `wp_nav_menu` filter fires on the complete final HTML.

---

## 15. `Walker_Nav_Menu`

Extends `Walker` (see Section 16). Handles converting the flat sorted menu item array into nested HTML lists.

### Configuration

```typescript
class Walker_Nav_Menu extends Walker {
  tree_type = ['post_type', 'taxonomy', 'custom'];
  db_fields = { parent: 'menu_item_parent', id: 'db_id' };
}
```

The walker uses `item.menu_item_parent` to determine the parent-child relationship and `item.db_id` as the unique identifier.

### Whitespace Mode

All four methods (`start_lvl`, `end_lvl`, `start_el`, `end_el`) check `args.item_spacing`:

- `'preserve'` (default): use `\t` for indentation and `\n` for newlines.
- `'discard'`: use empty strings for both, producing compact HTML.

### `start_lvl(output, depth, args)`

Opens a sub-menu list.

Output appended: `"\n{indent}<ul class="{classes}">\n"`

- `indent` = `depth` repetitions of the indent character.
- Initial classes array: `['sub-menu']`.
- Classes are passed through the `nav_menu_submenu_css_class` filter.
- The full `<ul>` attributes are passed through the `nav_menu_submenu_attributes` filter before building the attribute string.

### `end_lvl(output, depth, args)`

Closes a sub-menu list.

Output appended: `"{indent}</ul>\n"`

### `start_el(output, menuItem, depth, args, currentObjectId?)`

Outputs a `<li>` opening tag and its entire `<a>` link content.

**Step-by-step:**

1. Compute `indent` = `depth` repetitions of indent char (or empty string if `depth === 0`).
2. Start with `classes = [...menuItem.classes, 'menu-item-' + menuItem.ID]`.
3. Apply `nav_menu_item_args` filter to `args` (allows per-item args modification).
4. Apply `nav_menu_css_class` filter to the classes array (after removing empty values via `array_filter`).
5. Join classes to a space-separated string.
6. Apply `nav_menu_item_id` filter to the default ID `'menu-item-{menuItem.ID}'`.
7. Build `li_atts = { id: ..., class: ... }`.
8. Apply `nav_menu_item_attributes` filter to `li_atts`.
9. Build attribute string and output: `{indent}<li{atts}>`.
10. Apply `the_title` filter to `menuItem.title`, then `nav_menu_item_title` filter.
11. Build anchor attributes:
    - `target` = `menuItem.target` (empty if not set)
    - `rel` = `menuItem.xfn` (empty if not set)
    - `href` = `menuItem.url` (empty string if URL is empty)
    - `aria-current` = `'page'` if `menuItem.current`, else `''`
    - `title` = `menuItem.attr_title`, but **only** if it differs (case-insensitively, trimmed) from `menuItem.title` (both pre- and post-filter). If no meaningful difference, `title = ''` (omitted).
    - If `menuItem.url` matches the site's privacy policy URL, append `'privacy-policy'` to `rel`.
12. Apply `nav_menu_link_attributes` filter to the `atts` object.
13. Build anchor attribute string (`href` gets `esc_url`, others get `esc_attr`; empty values are omitted).
14. Construct `item_output`:
    ```
    {args.before}<a{attributes}>{args.link_before}{title}{args.link_after}</a>{args.after}
    ```
15. Apply `walker_nav_menu_start_el` filter to `item_output`.
16. Append `item_output` to `output`.

### `end_el(output, menuItem, depth, args)`

Output appended: `"</li>\n"` (or `"</li>"` in discard mode).

---

## 16. `WP_Walker` Base Class

The generic tree-walking base class. Not specific to menus.

### Properties

| Property | Type | Description |
|---|---|---|
| `tree_type` | `string` | Describes what the walker handles (informational only) |
| `db_fields` | `{ id: string; parent: string }` | Tells the walker which object property to use as the unique ID (`db_fields.id`) and which to use as the parent reference (`db_fields.parent`) |
| `max_pages` | `number` | Updated by `paged_walk()` to reflect total page count |
| `has_children` | `boolean` | Set during `display_element()` to indicate whether the current element has children. Available in `start_el()`. |

### `walk(elements, maxDepth, ...args): string`

Main entry point. Converts a flat array of objects into a hierarchical HTML string.

**`maxDepth` semantics:**
- `-1` = flat display (all elements at depth 0, no nesting, no `start_lvl`/`end_lvl`)
- `0` = display all hierarchy levels
- `N > 0` = display at most N levels

**Algorithm:**

1. If `maxDepth < -1` or `elements` is empty, return `''`.
2. If `maxDepth === -1` (flat): call `display_element(e, [], 1, 0, args, output)` for each element.
3. Otherwise, separate elements into `top_level_elements` (where `element[parent_field]` is empty/falsy) and `children_elements` (keyed by parent ID).
4. If no top-level elements exist, treat the first element's parent as the "root" — all elements with the same parent value become top-level.
5. Walk each top-level element via `display_element()`.
6. If `maxDepth === 0` and `children_elements` is not empty after walking, "orphan" children are displayed flat (with `display_element(orphan, [], 1, 0, args, output)`).

### `display_element(element, childrenElements, maxDepth, depth, args, output): void`

Recursive. Renders one element and (if applicable) its children.

1. Get element's own ID via `element[db_fields.id]`.
2. Set `this.has_children = !!(childrenElements[id])`.
3. If `args[0]` is an object, set `args[0].has_children` for back-compat.
4. Call `start_el(output, element, depth, ...args)`.
5. If `maxDepth === 0 || maxDepth > depth + 1`, and children exist:
   a. On first child, call `start_lvl(output, depth, ...args)`.
   b. Recurse: call `display_element(child, childrenElements, maxDepth, depth + 1, args, output)` for each child.
   c. Delete `childrenElements[id]` when done.
   d. Call `end_lvl(output, depth, ...args)`.
6. Call `end_el(output, element, depth, ...args)`.

**Important**: `output` is passed by reference (mutated in place). The `args` parameter is an array — when calling `start_el`, `start_lvl`, etc., the array values are spread: `start_el(output, element, depth, ...Object.values(args))`.

### `paged_walk(elements, maxDepth, pageNum, perPage, ...args): string`

Like `walk()` but returns only a single "page" of top-level elements (and their children). Sets `this.max_pages` to the total number of pages.

- `pageNum` is 1-based.
- `start = (pageNum - 1) * perPage`, `end = start + perPage`.
- Supports `args[0].reverse_top_level` (bool) to reverse top-level order and `args[0].reverse_children` (bool) to reverse children arrays.

### `get_number_of_root_elements(elements): number`

Counts how many elements have an empty/falsy parent field.

### `unset_children(element, childrenElements): void`

Recursively removes all children of `element` from `childrenElements`. Used in `paged_walk()` to discard prior-page children so they are not treated as orphans.

---

## 17. Key Hooks and Filters

### Widget Hooks

| Hook | Type | When | Args |
|---|---|---|---|
| `widgets_init` | action | After all built-in widgets are registered (in `wp_widgets_init()` → hooked to `init`). This is where third-party code registers/unregisters widgets. | none |
| `register_sidebar_defaults` | filter | Before merging defaults in `register_sidebar()`. | `defaults: object` |
| `register_sidebar` | action | After a sidebar is registered. | `sidebar: SidebarDefinition` |
| `wp_register_sidebar_widget` | action | When a widget instance is registered into `wpRegisteredWidgets`. | `widget: RegisteredWidget` |
| `wp_unregister_sidebar_widget` | action | Before a widget instance is unregistered. | `id: string` |
| `sidebars_widgets` | filter | On `wp_get_sidebars_widgets()`. Allows modifying the full map in memory. | `sidebarsWidgets: SidebarsWidgets` |
| `dynamic_sidebar_before` | action | Before sidebar widgets are rendered (fires for both empty and non-empty sidebars). | `index: string \| number, hasWidgets: boolean` |
| `dynamic_sidebar_after` | action | After sidebar widgets are rendered. | `index: string \| number, hasWidgets: boolean` |
| `dynamic_sidebar_has_widgets` | filter | Return value of `dynamic_sidebar()`. | `didOne: boolean, index: string \| number` |
| `dynamic_sidebar_params` | filter | The params array passed to each widget's display callback. Fires on both front-end and back-end, including inactive widgets panel. | `params: [SidebarArgs, ...widgetParams]` |
| `dynamic_sidebar` | action | Immediately before each widget's display callback is called. | `widget: RegisteredWidget` |
| `widget_display_callback` | filter | Inside `display_callback()`. Return `false` to prevent rendering. | `instance: object, widget: WP_Widget, args: SidebarArgs` |
| `widget_update_callback` | filter | Inside `update_callback()` after calling `update()`. Return `false` to prevent saving. | `instance: object, newInstance: object, oldInstance: object, widget: WP_Widget` |
| `widget_form_callback` | filter | Inside `form_callback()` before calling `form()`. Return `false` to prevent rendering the form. | `instance: object, widget: WP_Widget` |
| `in_widget_form` | action | After `form()` is called inside `form_callback()`. | `widget: WP_Widget (by ref), return: null (by ref), instance: object` |
| `is_active_sidebar` | filter | Return value of `is_active_sidebar()`. | `isActiveSidebar: boolean, index: string \| number` |
| `the_widget` | action | Before rendering a widget invoked directly via `the_widget()`. | `widget: string, instance: object, args: SidebarArgs` |
| `use_widgets_block_editor` | filter | Whether to use the block-based widget editor. | `useBlockEditor: boolean` |
| `widget_block_content` | filter | The block widget's `content` before output. | `content: string, instance: object, widget: WP_Widget_Block` |
| `widget_block_dynamic_classname` | filter | The dynamic classname for a block widget's container. | `classname: string, blockName: string` |
| `widget_text` | filter | Text widget content before processing. | `text: string, instance: object, widget: WP_Widget_Text` |
| `widget_text_content` | filter | Text widget content in visual mode (after `widget_text`). Default implementation includes `wpautop` and `do_shortcode`. | `text: string, instance: object, widget: WP_Widget_Text` |

### Navigation Menu Hooks

| Hook | Type | When | Args |
|---|---|---|---|
| `wp_create_nav_menu` | action | After a new menu is created. | `termId: number, menuData: object` |
| `wp_update_nav_menu` | action | After an existing menu is updated. | `menuId: number, menuData: object` |
| `wp_delete_nav_menu` | action | After a menu is deleted. | `termId: number` |
| `wp_add_nav_menu_item` | action | After a new menu item is created. | `menuId: number, menuItemDbId: number, args: object` |
| `wp_update_nav_menu_item` | action | After a menu item is created or updated. | `menuId: number, menuItemDbId: number, args: object` |
| `wp_get_nav_menu_object` | filter | Return value of `wp_get_nav_menu_object()`. | `menuObj: WP_Term \| false, menu: mixed` |
| `wp_get_nav_menus` | filter | Return value of `wp_get_nav_menus()`. | `menus: WP_Term[], args: object` |
| `wp_get_nav_menu_items` | filter | Return value of `wp_get_nav_menu_items()`. | `items: NavMenuItem[], menu: WP_Term, args: object` |
| `wp_setup_nav_menu_item` | filter | Each item after decoration. | `menuItem: NavMenuItem` |
| `pre_wp_setup_nav_menu_item` | filter | Before `wp_setup_nav_menu_item()` runs. Return non-null to short-circuit. | `null, menuItem: object` |
| `has_nav_menu` | filter | Return value of `has_nav_menu()`. | `hasNavMenu: boolean, location: string` |
| `wp_nav_menu_args` | filter | After default args are merged but before any rendering in `wp_nav_menu()`. | `args: object` |
| `pre_wp_nav_menu` | filter | Before any `wp_nav_menu()` rendering. Return non-null to short-circuit. | `null, args: stdClass` |
| `wp_nav_menu_container_allowedtags` | filter | Allowed HTML tags for the menu container. Default `['div', 'nav']`. | `tags: string[]` |
| `wp_nav_menu_objects` | filter | The sorted menu items array before walking. | `sortedMenuItems: NavMenuItem[], args: stdClass` |
| `wp_nav_menu_items` | filter | The HTML `<li>` items string before wrapping. | `items: string, args: stdClass` |
| `wp_nav_menu_{slug}_items` | filter | Same as above but specific to a menu by its slug. | `items: string, args: stdClass` |
| `wp_nav_menu` | filter | The complete final HTML output of `wp_nav_menu()`. | `navMenu: string, args: stdClass` |
| `nav_menu_item_args` | filter | The args object passed to `start_el()` for each item. | `args: stdClass, menuItem: NavMenuItem, depth: number` |
| `nav_menu_css_class` | filter | The CSS classes array for each `<li>` item. | `classes: string[], menuItem: NavMenuItem, args: stdClass, depth: number` |
| `nav_menu_item_id` | filter | The `id` attribute for each `<li>` item. | `menuItemId: string, menuItem: NavMenuItem, args: stdClass, depth: number` |
| `nav_menu_item_attributes` | filter | The full attributes object for each `<li>` item. | `liAtts: object, menuItem: NavMenuItem, args: stdClass, depth: number` |
| `nav_menu_link_attributes` | filter | The anchor (`<a>`) attributes for each menu item. | `atts: object, menuItem: NavMenuItem, args: stdClass, depth: number` |
| `nav_menu_item_title` | filter | The title text inside the anchor. | `title: string, menuItem: NavMenuItem, args: stdClass, depth: number` |
| `nav_menu_submenu_css_class` | filter | Classes on sub-menu `<ul>` elements. | `classes: string[], args: stdClass, depth: number` |
| `nav_menu_submenu_attributes` | filter | Full attributes object for sub-menu `<ul>` elements. | `atts: object, args: stdClass, depth: number` |
| `walker_nav_menu_start_el` | filter | The complete `<a>...</a>` fragment for each item. | `itemOutput: string, menuItem: NavMenuItem, depth: number, args: stdClass` |

---

## 18. TypeScript Interface Sketch

```typescript
// ============================================================
// Sidebar / Widget Area
// ============================================================

interface SidebarDefinition {
  id: string;
  name: string;
  description: string;
  class: string;
  before_widget: string;   // sprintf template: %1$s = widget id, %2$s = classname
  after_widget: string;
  before_title: string;
  after_title: string;
  before_sidebar: string;  // sprintf template: %1$s = sidebar id, %2$s = sidebar class
  after_sidebar: string;
  show_in_rest: boolean;
}

interface RegisteredWidget {
  name: string;
  id: string;              // full instance ID e.g. 'text-2'
  callback: WidgetCallback;
  params: unknown[];
  classname: string | string[];
  description?: string;
  show_instance_in_rest?: boolean;
}

type WidgetCallback = (args: SidebarRenderArgs, ...params: unknown[]) => void;

interface SidebarRenderArgs extends SidebarDefinition {
  widget_id: string;
  widget_name: string;
  before_widget: string;   // already sprintf'd by the time it reaches the callback
}

// ============================================================
// WP_Widget
// ============================================================

abstract class WPWidget {
  id_base: string;
  name: string;
  option_name: string;
  alt_option_name?: string;
  widget_options: {
    classname: string;
    customize_selective_refresh: boolean;
    description?: string;
    show_instance_in_rest?: boolean;
  };
  control_options: {
    id_base: string;
    width?: number;
    height?: number;
  };
  number: number | false;
  id: string | false;
  updated: boolean;

  constructor(
    id_base: string,
    name: string,
    widget_options?: Partial<WPWidget['widget_options']>,
    control_options?: Partial<WPWidget['control_options']>
  );

  // Must override
  abstract widget(args: SidebarRenderArgs, instance: WidgetInstance): void;

  // Should override
  update(newInstance: WidgetInstance, oldInstance: WidgetInstance): WidgetInstance | false;
  form(instance: WidgetInstance): string | void;

  // Helpers for use in form()
  get_field_name(fieldName: string): string;
  get_field_id(fieldName: string): string;

  // Internal — do not override
  _set(number: number | string): void;
  _register(): void;
  _register_one(number?: number): void;
  display_callback(args: SidebarRenderArgs, widgetArgs?: number | { number: number }): void;
  update_callback(deprecated?: number): void;
  form_callback(widgetArgs?: number | { number: number }): string | null;
  get_settings(): Record<number, WidgetInstance>;
  save_settings(settings: Record<number, WidgetInstance>): void;
  is_preview(): boolean;
}

type WidgetInstance = Record<string, unknown>;

// ============================================================
// WP_Widget_Factory
// ============================================================

class WPWidgetFactory {
  widgets: Record<string, WPWidget>;

  register(widget: string | WPWidget): void;
  unregister(widget: string | WPWidget): void;
  get_widget_object(id_base: string): WPWidget | null;
  get_widget_key(id_base: string): string;
  _register_widgets(): void;
}

// ============================================================
// Sidebar Storage
// ============================================================

interface SidebarsWidgets {
  [sidebarId: string]: string[];  // array of widget instance IDs
  wp_inactive_widgets?: string[];
}

// Per-type storage (option key: widget_{id_base})
interface WidgetTypeOption {
  [instanceNumber: number]: WidgetInstance;
  _multiwidget: 1;
}

// ============================================================
// Public Sidebar/Widget API
// ============================================================

interface WidgetSystemAPI {
  register_sidebar(args?: Partial<SidebarDefinition>): string;
  register_sidebars(number?: number, args?: Partial<SidebarDefinition>): void;
  unregister_sidebar(sidebarId: string): void;
  is_registered_sidebar(sidebarId: string): boolean;

  register_widget(widget: string | WPWidget): void;
  unregister_widget(widget: string | WPWidget): void;

  dynamic_sidebar(index?: number | string): boolean;
  is_active_sidebar(index: number | string): boolean;
  is_active_widget(
    callback?: WidgetCallback | false,
    widgetId?: string | false,
    idBase?: string | false,
    skipInactive?: boolean
  ): string | false;

  wp_get_sidebars_widgets(): SidebarsWidgets;
  wp_set_sidebars_widgets(sidebarsWidgets: SidebarsWidgets): void;
  wp_find_widgets_sidebar(widgetId: string): string | null;
  wp_assign_widget_to_sidebar(widgetId: string, sidebarId: string): void;
  wp_render_widget(widgetId: string, sidebarId: string): string;
  wp_parse_widget_id(id: string): { id_base: string; number?: number };
}

// ============================================================
// Navigation Menus
// ============================================================

interface NavMenu {
  term_id: number;
  name: string;
  slug: string;
  term_taxonomy_id: number;
  taxonomy: 'nav_menu';
  count: number;
}

interface NavMenuItem {
  // WP_Post fields
  ID: number;
  post_title: string;
  post_content: string;
  post_excerpt: string;
  post_parent: number;
  post_status: string;
  post_type: 'nav_menu_item';
  menu_order: number;

  // Decorated fields (added by wp_setup_nav_menu_item)
  db_id: number;
  menu_item_parent: string;
  object_id: string;
  object: string;
  type: 'post_type' | 'taxonomy' | 'post_type_archive' | 'custom';
  type_label: string;
  url: string;
  title: string;
  attr_title: string;
  description: string;
  classes: string[];
  xfn: string;
  target: string;
  current: boolean;
  current_item_ancestor: boolean;
  current_item_parent: boolean;
  _invalid?: boolean;
}

interface WpNavMenuArgs {
  menu?: number | string | NavMenu | '';
  menu_class?: string;
  menu_id?: string;
  container?: string | false;
  container_class?: string;
  container_id?: string;
  container_aria_label?: string;
  fallback_cb?: ((...args: unknown[]) => string | void) | false;
  before?: string;
  after?: string;
  link_before?: string;
  link_after?: string;
  echo?: boolean;
  depth?: number;
  walker?: Walker | '';
  theme_location?: string;
  items_wrap?: string;
  item_spacing?: 'preserve' | 'discard';
}

interface NavMenuSystemAPI {
  register_nav_menu(location: string, description: string): void;
  register_nav_menus(locations: Record<string, string>): void;
  unregister_nav_menu(location: string): boolean;
  get_registered_nav_menus(): Record<string, string>;
  get_nav_menu_locations(): Record<string, number>;
  has_nav_menu(location: string): boolean;

  wp_create_nav_menu(menuName: string): number | WP_Error;
  wp_update_nav_menu_object(menuId: number, menuData: object): number | WP_Error;
  wp_delete_nav_menu(menu: number | string | NavMenu): boolean | WP_Error;
  wp_get_nav_menu_object(menu: number | string | NavMenu): NavMenu | false;
  wp_get_nav_menus(args?: object): NavMenu[];

  wp_update_nav_menu_item(
    menuId: number,
    menuItemDbId: number,
    menuItemData?: object,
    fireAfterHooks?: boolean
  ): number | WP_Error;
  wp_get_nav_menu_items(menu: number | string | NavMenu, args?: object): NavMenuItem[] | false;

  wp_nav_menu(args?: WpNavMenuArgs): void | string | false;
}

// ============================================================
// Walker
// ============================================================

abstract class Walker {
  tree_type: string | string[];
  db_fields: { id: string; parent: string };
  max_pages: number;
  has_children: boolean;

  start_lvl(output: string[], depth?: number, args?: unknown): void;
  end_lvl(output: string[], depth?: number, args?: unknown): void;
  start_el(output: string[], dataObject: object, depth?: number, args?: unknown, currentObjectId?: number): void;
  end_el(output: string[], dataObject: object, depth?: number, args?: unknown): void;

  walk(elements: object[], maxDepth: number, ...args: unknown[]): string;
  paged_walk(elements: object[], maxDepth: number, pageNum: number, perPage: number, ...args: unknown[]): string;
  display_element(element: object, childrenElements: Record<string | number, object[]>, maxDepth: number, depth: number, args: unknown[], output: string[]): void;
  get_number_of_root_elements(elements: object[]): number;
  unset_children(element: object, childrenElements: Record<string | number, object[]>): void;
}

class WalkerNavMenu extends Walker {
  tree_type: ['post_type', 'taxonomy', 'custom'];
  db_fields: { parent: 'menu_item_parent'; id: 'db_id' };

  start_lvl(output: string[], depth?: number, args?: object): void;
  end_lvl(output: string[], depth?: number, args?: object): void;
  start_el(output: string[], menuItem: NavMenuItem, depth?: number, args?: object, currentObjectId?: number): void;
  end_el(output: string[], menuItem: NavMenuItem, depth?: number, args?: object): void;

  protected build_atts(atts?: Record<string, string | false>): string;
}
```

---

## 19. Design Patterns to Carry Over

1. **Instance numbering is independent of registration order.** Widget instance numbers are stored in the database and can be sparse. Do not assume they are contiguous or start at 1. The `_register()` method reads all existing instance numbers from the database and registers a widget entry for each one.

2. **The display callback receives sidebar context, not widget context.** The `display_callback()` method must call `_set(number)` to point the widget object at the correct instance before calling `widget()`. The number is conveyed via the `params` array that was set at registration time in `_register_one()`.

3. **`before_widget` is a sprintf template, not final HTML.** When `register_sidebar()` is called, `before_widget` contains `%1$s` and `%2$s`. Substitution happens in `dynamic_sidebar()` per-widget, not at registration time. The first `%1$s` is the widget's full instance ID (with backslashes replaced by underscores); the second `%2$s` is the widget type's classname.

4. **Widget settings are stored by type, not by sidebar.** The `sidebars_widgets` option only stores which instance IDs go in which sidebar. The actual settings for each instance are in `widget_{id_base}`. This means a widget instance's settings survive being moved between sidebars or deactivated.

5. **Theme changes trigger sidebar migration.** On theme switch, `retrieve_widgets()` and `wp_map_sidebars_widgets()` attempt to re-map widget assignments from old sidebar IDs to new ones using slug-matching heuristics. Unmapped widgets go to `wp_inactive_widgets`. The previous theme's sidebar assignments are saved as a theme mod so they can be restored when switching back.

6. **Navigation menus use two different content systems.** The menu itself is a taxonomy term; its items are posts. This dual-system approach means menus participate in the standard taxonomy cache and items participate in the standard post cache, but glue logic (`wp_get_nav_menu_items`, `wp_setup_nav_menu_item`) must bridge the two.

7. **Menu item URLs are resolved at fetch time, not stored.** For `post_type` and `taxonomy` items, the `_menu_item_url` meta is empty. `wp_setup_nav_menu_item()` resolves the URL dynamically by calling `get_permalink()` or `get_term_link()`. Only `custom` type items store a literal URL.

8. **Walker output is built by string concatenation into a passed-by-reference buffer.** The Walker API appends to the `output` parameter. In TypeScript, this should be handled either by passing an object wrapper `{ value: string }` or by accumulating in a local variable and returning from `walk()`.

9. **CSS class annotation happens before walking.** `_wp_menu_item_classes_by_context()` modifies the items array in place (by reference), adding all contextual CSS classes before the walker runs. The walker then adds `menu-item-{id}` and applies the `nav_menu_css_class` filter. The `menu-item-has-children` class is added by `wp_nav_menu()` itself in the pre-walk setup loop, not by the walker.

10. **The `items_wrap` printf template is the mechanism for the `<ul>` wrapper.** `wp_nav_menu()` passes `sprintf(items_wrap, menuId, menuClass, itemsHtml)` to produce the `<ul>` block. This means the container `<div>`/`<nav>` and the `<ul>` are separate levels of wrapping with independent filters.

11. **Menu location assignments survive theme changes through heuristic slug matching.** `wp_map_nav_menu_locations()` uses predefined slug groups (e.g. `['primary', 'menu-1', 'main', 'header', 'navigation', 'top']`) to guess which old location maps to which new location. The previous theme's assignments are saved to `theme_switch_menu_locations` before switching and consumed by `_wp_menus_changed()` after switching.

12. **Walker `db_fields` must be set per subclass and controls the tree structure.** `Walker_Nav_Menu` uses `{ parent: 'menu_item_parent', id: 'db_id' }`. The walker reads these property names dynamically from the element objects — no hardcoding of property names inside `walk()` or `display_element()`. A custom walker for a different data type just needs different `db_fields`.

## Tovu Reconstruction Notes

### Why this exists

Widgets and navigation menus exist as legacy presentation primitives for placing content and navigation into theme-controlled regions. The important contracts are instance configuration, sidebar mapping, and tree-walking menu rendering.

### What Tovu should preserve

- A way to register reusable content regions and populate them with configured instances
- Per-instance widget settings and theme-level placement mapping
- Navigation menu rendering that respects hierarchical items and theme locations
- Clear separation between widget definition, widget instance state, and output rendering

### What Tovu can simplify

- Tovu can de-emphasize classic widgets if blocks or structured layout primitives cover the same use cases
- Legacy widget/editor compatibility layers can stay behind an adapter if needed
- Menu rendering can be narrower if the app does not need WordPress's full walker/plugin surface

### Possible Tovu seams

- `src/presentation/sidebars/` for region registration and instance placement
- `src/presentation/widgets/` for widget definitions and instance state
- `src/navigation/menus/` for tree data, locations, and rendering
- adapters should keep view composition separate from stored configuration

### Suggested priority

- `V1`: sidebar/widget registry and menu rendering contracts
- `Later`: legacy editor compatibility and complex walker extensibility
