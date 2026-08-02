# Admin Bootstrap — Specification

**Source files analyzed:**
- `wp-admin/admin.php`
- `wp-admin/menu.php`
- `wp-admin/includes/class-wp-screen.php`
- `wp-admin/admin-ajax.php`
- `wp-admin/admin-post.php`
- `wp-admin/includes/class-wp-list-table.php`

---

## 1. Overview

Every wp-admin page loads `wp-admin/admin.php` as its first include. This file is the administrative bootstrap layer: it initializes WordPress for admin context, authenticates the current user, builds the menu, fires `admin_init`, determines the current screen, and then hands control back to the calling page file. It is not a router. Each admin screen is its own standalone PHP file (e.g. `post.php`, `edit.php`, `options-general.php`) that simply starts with `require_once dirname(__DIR__) . '/wp-load.php'` followed by including `admin.php` indirectly via their own pattern, or more commonly begins with `require_once ABSPATH . 'wp-admin/admin.php'` after some minimal setup.

The three entry-point variants are:

| Entry point | Purpose |
|---|---|
| `wp-admin/admin.php` | All standard admin page files |
| `wp-admin/admin-ajax.php` | AJAX requests (sets `DOING_AJAX = true`) |
| `wp-admin/admin-post.php` | Form POST submissions not needing full admin UI |

All three define `WP_ADMIN = true`, load `wp-load.php`, require the admin includes bundle, and fire `admin_init`. None of them render a full page — that is left to the individual screen file or to AJAX handler callbacks.

The constants defined early in bootstrap:

| Constant | Value | Meaning |
|---|---|---|
| `WP_ADMIN` | `true` | In admin context; set before anything else |
| `WP_NETWORK_ADMIN` | `false` (default) | Overridden to `true` in network admin screens |
| `WP_USER_ADMIN` | `false` (default) | Overridden to `true` in user admin screens |
| `WP_BLOG_ADMIN` | `true` | Set when neither of the above is true |
| `WP_LOAD_IMPORTERS` | `true` | Set when `?import=` is in the query string |
| `DOING_AJAX` | `true` | Set only in `admin-ajax.php` |
| `WP_IMPORTING` | `true` | Set during importer execution |

---

## 2. Admin Bootstrap (`admin.php`)

### 2.1 Step-by-Step Execution

**Step 1 — Define admin constants.**
`WP_ADMIN`, `WP_NETWORK_ADMIN`, `WP_USER_ADMIN`, and `WP_BLOG_ADMIN` are conditionally defined. If `?import=` is present in `$_GET`, `WP_LOAD_IMPORTERS` is also defined.

**Step 2 — Load WordPress core.**
`require_once dirname(__DIR__) . '/wp-load.php'` bootstraps the full WordPress environment: database, options, plugins, and theme functions.

**Step 3 — Send no-cache headers.**
`nocache_headers()` is called immediately after WordPress loads. All admin responses are non-cacheable by default.

**Step 4 — Handle DB version mismatch.**
If `get_option('db_upgraded')` is truthy, rewrite rules are flushed and `do_action('after_db_upgrade')` fires. Otherwise, if the stored `db_version` does not match `$wp_db_version` and no POST data is present and it is not an AJAX request:
- Single site: redirects to `upgrade.php`.
- Multisite: fires `do_mu_upgrade` filter (default `true`), and if enabled, makes an HTTP request to `upgrade.php?step=1` internally. This is throttled for networks with more than 50 sites.

**Step 5 — Load admin includes bundle.**
`require_once ABSPATH . 'wp-admin/includes/admin.php'` pulls in the full set of admin-only functions. This single file itself includes:
- `upgrade.php` — DB upgrade routines
- `template.php` — admin template helpers
- `misc.php` — miscellaneous admin utilities
- `meta.php` — meta box registration and rendering
- `nav-menus.php` — nav menu admin functions
- `class-wp-list-table.php` — base list table class
- `class-wp-plugin-install-list-table.php` — plugin install table
- `class-wp-theme-install-list-table.php` — theme install table
- `class-wp-ms-sites-list-table.php` — multisite sites table
- `class-wp-ms-users-list-table.php` — multisite users table
- `class-wp-ms-themes-list-table.php` — multisite themes table
- `class-wp-screen.php` — screen API
- `class-wp-comments-list-table.php` — comments table
- `class-wp-media-list-table.php` — media library table
- `class-wp-plugin-install-list-table.php` — plugin install list
- `class-wp-posts-list-table.php` — posts table
- `class-wp-terms-list-table.php` — terms table
- `class-wp-users-list-table.php` — users table
- `class-wp-application-passwords-list-table.php` — app passwords table
- `menu.php` — menu registration helpers
- `ajax-actions.php` — built-in AJAX handler functions

**Step 6 — Authenticate.**
`auth_redirect()` checks whether the current user is authenticated. If not, it redirects to the login page. This is the gate that prevents unauthenticated access to all admin pages.

**Step 7 — Schedule cron jobs.**
Two cron events are registered if not already scheduled (and WordPress is not in installation mode):
- `wp_scheduled_delete` — runs daily to purge trashed posts older than `EMPTY_TRASH_DAYS`.
- `delete_expired_transients` — runs daily to clean expired transients.

**Step 8 — Apply screen options.**
`set_screen_options()` reads `$_POST['wp_screen_options']` (submitted from the Screen Options panel) and saves the chosen values as user options via `update_user_option()`. This must occur before headers are sent.

**Step 9 — Set date/time globals and enqueue common script.**
`$date_format` and `$time_format` are set from localized strings. `wp_enqueue_script('common')` loads the admin-common JS bundle.

**Step 10 — Declare globals.**
`$pagenow`, `$wp_importers`, `$hook_suffix`, `$plugin_page`, `$typenow`, and `$taxnow` are declared global. `$pagenow` is set earlier in `wp-includes/vars.php` during core bootstrap and holds the filename of the current page (e.g. `'post.php'`, `'edit.php'`).

**Step 11 — Determine `$plugin_page`, `$typenow`, `$taxnow`.**
- If `$_GET['page']` exists, `$plugin_page` is set to `plugin_basename($_GET['page'])`.
- If `$_REQUEST['post_type']` exists and is a registered post type, `$typenow` is set.
- If `$_REQUEST['taxonomy']` exists and is a registered taxonomy, `$taxnow` is set.

**Step 12 — Load menu.**
Depending on which admin context is active:
- `WP_NETWORK_ADMIN`: load `wp-admin/network/menu.php`
- `WP_USER_ADMIN`: load `wp-admin/user/menu.php`
- otherwise: load `wp-admin/menu.php`

This populates the `$menu` and `$submenu` globals, fires `admin_menu` (or the network/user variants), and calls the registered callbacks that add plugin-registered menu pages.

**Step 13 — Raise memory limit for admins.**
If the current user has `manage_options`, `wp_raise_memory_limit('admin')` is called. The `admin_memory_limit` filter controls the target limit.

**Step 14 — Fire `admin_init`.**
`do_action('admin_init')` fires. This is the primary hook for admin-specific plugin initialization. It fires on standard admin pages, AJAX requests, and admin-post requests.

**Step 15 — Resolve `$plugin_page` hook.**
If `$plugin_page` is set:
1. Attempt to find a hook via `get_plugin_page_hook($plugin_page, $pagenow)` (with `?post_type=` appended if `$typenow` is set).
2. If that fails, attempt `get_plugin_page_hook($plugin_page, $plugin_page)` (for top-level pages).
3. Back-compat: if `$pagenow` is `edit.php` and a hook exists under `tools.php`, redirect to `tools.php?...`.
4. The resolved hook is stored in `$page_hook`.

**Step 16 — Set `$hook_suffix`.**
Priority order: `$page_hook` > `$plugin_page` > `$pagenow`. `$hook_suffix` is used throughout the admin to namespace hooks and scripts.

**Step 17 — Set current screen.**
`set_current_screen()` calls `WP_Screen::get()` with `$hook_suffix` and makes the result the global `$current_screen`. Also fires `current_screen` action.

**Step 18 — Handle the current page type.**
Three branches:

*Branch A — Plugin page with registered callback:*
1. `do_action("load-{$page_hook}")` — fires before page content renders; use for permission checks, data loading, redirects.
2. Unless `$_GET['noheader']` is set, `admin-header.php` is loaded (renders HTML head and sidebar nav).
3. `do_action($page_hook)` — fires the callback registered when the page was added.
4. `admin-footer.php` is loaded.
5. `exit`.

*Branch B — Plugin page as a directly-included file (old style):*
1. `validate_file($plugin_page)` — if the path traverses directories, die with an error.
2. Confirm the file exists in `WP_PLUGIN_DIR` or `WPMU_PLUGIN_DIR`.
3. `do_action("load-{$plugin_page}")`.
4. Include the file directly.
5. `admin-footer.php`, then `exit`.

*Branch C — Standard core admin page:*
1. `do_action("load-{$pagenow}")`.
2. Legacy back-compat hooks are fired for `page` post type and old taxonomy pages (e.g. `load-page.php`, `load-categories.php`).
3. If `$_REQUEST['action']` is non-empty, `do_action("admin_action_{$action}")` fires.

### 2.2 Key Globals Set by Bootstrap

```typescript
// All set as PHP globals; listed here for reference
const pagenow: string;        // filename of current page, e.g. 'edit.php'
const hookSuffix: string;     // resolved hook name for current page
const pluginPage: string;     // value of $_GET['page'] if present, plugin_basnamed
const pageHook: string | null;// resolved hook from get_plugin_page_hook()
const typenow: string;        // current post type, empty if none
const taxnow: string;         // current taxonomy, empty if none
const currentScreen: WPScreen;// WP_Screen instance for current page
```

### 2.3 Important Redirect/Exit Points

- DB version mismatch on single site → redirect to `upgrade.php`.
- Unauthenticated user → `auth_redirect()` redirects to login.
- Invalid `$plugin_page` path traversal → `wp_die()`.
- Plugin file not found → `wp_die()`.
- Invalid importer → redirect to `import.php?invalid=`.
- Plugin page without `$page_hook` and without valid file → `wp_die()`.

---

## 3. Admin Menu System

### 3.1 Global Data Structures

The admin menu is stored in two PHP globals populated during menu loading and consumed by `admin-header.php` to render the sidebar navigation.

```typescript
// $menu — indexed by position (numeric string key)
// Each entry is a 7-element array:
type MenuEntry = [
  label: string,         // [0] Display name (may contain HTML for update counts)
  capability: string,    // [1] Required capability to see/access this item
  slug: string,          // [2] URL or file path (e.g. 'edit.php', 'options-general.php')
  pageTitle: string,     // [3] <title> content for the page (often empty for top-level)
  cssClasses: string,    // [4] Space-separated CSS classes for the <li> element
  htmlId: string,        // [5] ID attribute for the <li> element
  icon: string,          // [6] Dashicon slug, data:image/svg+xml;base64,... URL, or 'none'/'div'
];

// $submenu — keyed by parent slug, then by numeric position
// Each entry is a 3-element array (minimum):
type SubmenuEntry = [
  label: string,         // [0] Display name
  capability: string,    // [1] Required capability
  slug: string,          // [2] URL or file path
  pageTitle?: string,    // [3] Optional page title
];

// Example:
// $menu[10] = ['Media', 'upload_files', 'upload.php', '', 'menu-top menu-icon-media', 'menu-media', 'dashicons-admin-media']
// $submenu['upload.php'][5] = ['Library', 'upload_files', 'upload.php']
```

**Separator entries** use the capability `'read'`, an empty label, and a special CSS class `'wp-menu-separator'`. The slug is a human-readable name like `'separator1'`, `'separator2'`, `'separator-last'`. They occupy positions 4, 59, and 99 in the default menu.

**CSS class patterns for top-level items:**
- `menu-top` — always present
- `menu-top-first` — on the first item (Dashboard at position 2)
- `menu-icon-{name}` — slug-based icon class, e.g. `menu-icon-dashboard`
- `open-if-no-js` — on Posts (supports keyboard navigation fallback)

### 3.2 `add_menu_page()`

Register a top-level menu item.

```typescript
function add_menu_page(
  pageTitle: string,       // Used in the <title> of the page
  menuTitle: string,       // Display text in the sidebar
  capability: string,      // User must have this capability to see it
  menuSlug: string,        // Unique identifier; used as URL slug (?page=slug)
  callback?: callable,     // Function that renders the page content; optional
  iconUrl?: string,        // Dashicon slug, full URL, SVG data URI, or 'none'/'div'
  position?: number,       // Numeric position in menu; higher = lower in list
): string                  // Returns hook name: '{type}_page_{slug}'
```

**Position collision resolution:** If the requested position is already occupied, the position is incremented by 1 until a free slot is found. Core reserves positions 59, 60, 65, 70, 75, 80, and 99. Custom post types also check against `$core_menu_positions` and step forward as needed.

**Return value:** The hook name is used to target the `load-{hook}` and `{hook}` dynamic actions for this page. The format is:
- `'toplevel_page_{slug}'` — when added as a top-level item
- `'{parent-base}_page_{slug}'` — when added as a submenu item (see `add_submenu_page`)

**Icon values:**
- `dashicons-{name}` — renders using the Dashicons webfont
- `data:image/svg+xml;base64,...` — inline SVG, rendered via `background-image`
- Any other URL string — rendered as an `<img>` tag
- `'none'` — empty `<div>` with no icon (use custom CSS)
- `'div'` — same as `'none'`

### 3.3 `add_submenu_page()`

Register a submenu item under an existing top-level page.

```typescript
function add_submenu_page(
  parentSlug: string,      // Slug of the parent top-level page
  pageTitle: string,       // Used in the <title> of the page
  menuTitle: string,       // Display text in the submenu
  capability: string,      // Required capability
  menuSlug: string,        // Unique slug for this page
  callback?: callable,     // Renders the page content
  position?: number,       // Position within the submenu
): string | false          // Hook name or false if parent not found
```

The return value hook name format is `'{parent-base}_page_{menu-slug}'`. For example, a page added under `options-general.php` with slug `myplugin-settings` returns `'settings_page_myplugin-settings'`.

### 3.4 Shortcut Registration Functions

Each shortcut calls `add_submenu_page()` with a hardcoded `$parent_slug`:

| Function | Parent slug | Capability |
|---|---|---|
| `add_dashboard_page()` | `index.php` | _(caller-supplied)_ |
| `add_posts_page()` | `edit.php` | _(caller-supplied)_ |
| `add_media_page()` | `upload.php` | _(caller-supplied)_ |
| `add_comments_page()` | `edit-comments.php` | _(caller-supplied)_ |
| `add_theme_page()` | `themes.php` | _(caller-supplied)_ |
| `add_plugins_page()` | `plugins.php` | _(caller-supplied)_ |
| `add_users_page()` | `users.php` (or `profile.php` for non-admins) | _(caller-supplied)_ |
| `add_management_page()` | `tools.php` | _(caller-supplied)_ |
| `add_options_page()` | `options-general.php` | _(caller-supplied)_ |

All have the same signature: `(pageTitle, menuTitle, capability, menuSlug, callback?, position?)`.

### 3.5 Removing Menu Items

```typescript
function remove_menu_page(menuSlug: string): array | false
// Removes the entry from $menu. Returns the removed item array, or false if not found.

function remove_submenu_page(parentSlug: string, menuSlug: string): array | false
// Removes one submenu entry. Returns the removed entry, or false if not found.
```

Removal only removes the menu entry. If the page callback was registered, requests to that page URL will still work — the hook fires even without a visible menu item. To prevent access, also check capabilities in the page callback.

### 3.6 `menu_page_url()`

```typescript
function menu_page_url(menuSlug: string, echo?: boolean): string
// Returns (or echoes) the URL to reach a registered plugin page.
// Handles both top-level pages (?page=slug) and submenu pages.
// If the page was not registered, returns an empty string.
```

### 3.7 Default Menu Structure

The default menu built by `wp-admin/menu.php`:

| Position | Label | Slug | Capability | Icon |
|---|---|---|---|---|
| 2 | Dashboard | `index.php` | `read` | `dashicons-dashboard` |
| 4 | _(separator)_ | `separator1` | `read` | — |
| 5 | Posts | `edit.php` | `edit_posts` | `dashicons-admin-post` |
| 10 | Media | `upload.php` | `upload_files` | `dashicons-admin-media` |
| 15 | Links | `link-manager.php` | `manage_links` | `dashicons-admin-links` |
| 20 | Pages | `edit.php?post_type=page` | `edit_posts` | `dashicons-admin-page` |
| 25 | Comments | `edit-comments.php` | `edit_posts` | `dashicons-admin-comments` |
| 26–58 | Custom post types | varies | varies | varies |
| 59 | _(separator)_ | `separator2` | `read` | — |
| 60 | Appearance | `themes.php` | `switch_themes` or `edit_theme_options` | `dashicons-admin-appearance` |
| 65 | Plugins | `plugins.php` | `activate_plugins` | `dashicons-admin-plugins` |
| 70 | Users | `users.php` or `profile.php` | `list_users` or `read` | `dashicons-admin-users` |
| 75 | Tools | `tools.php` | `edit_posts` | `dashicons-admin-tools` |
| 80 | Settings | `options-general.php` | `manage_options` | `dashicons-admin-settings` |
| 99 | _(separator)_ | `separator-last` | `read` | — |

**Comments entry** is only added if the current user `can('edit_posts')`. Its label includes a live pending-comment count badge rendered as `<span class="awaiting-mod count-N">`.

**Updates badge** is added to Dashboard and Plugins/Appearance labels when updates are available (single site only, not multisite).

**Users/Profile split:** If the user has `list_users`, the top-level item is "Users" at `users.php`. If not, it is "Profile" at `profile.php`. A `$_wp_real_parent_file` back-compat alias maps `profile.php` → `users.php`.

### 3.8 Hooks

| Hook | Type | When | Notes |
|---|---|---|---|
| `admin_menu` | action | After `$menu`/`$submenu` are built | Use `add_menu_page()`, `add_submenu_page()` here |
| `network_admin_menu` | action | Same, in network admin context | — |
| `user_admin_menu` | action | Same, in user admin context | — |
| `_admin_menu` | action | Before public `admin_menu` | Low-level; avoid using |
| `menu_order` | filter | `array $menu_order` | Override menu sort order |
| `custom_menu_order` | filter | `bool` | Return `true` to enable custom `menu_order` filtering |

---

## 4. `WP_Screen`

`WP_Screen` is a `final` class representing the current admin screen. It is constructed via `WP_Screen::get()` (factory pattern) and should never be instantiated directly. One screen object is the canonical current screen for a request.

### 4.1 `get_current_screen()`

```typescript
function get_current_screen(): WP_Screen | null
// Returns the global $current_screen object, or null if not yet set.
// Safe to call after set_current_screen() has been invoked in admin.php.
```

`set_current_screen()` is the global function that calls `WP_Screen::get($hook_suffix)` and sets `$GLOBALS['current_screen']`. It also fires `do_action('current_screen', $current_screen)`.

### 4.2 Screen Properties

```typescript
interface WPScreen {
  // The unique ID of this screen. Derived from $hook_suffix with post type and
  // taxonomy embedded. Examples: 'edit-post', 'edit-page', 'edit-category',
  // 'post', 'page', 'dashboard', 'settings_page_myplugin'
  id: string;

  // The base type: same as id but with post type/taxonomy stripped.
  // Examples: 'edit', 'post', 'edit-tags', 'dashboard'
  base: string;

  // Action associated with the screen: 'add' for *-new.php and *-add.php
  // screens. Empty string otherwise.
  action: string;

  // Post type associated with the screen, if any. E.g. 'post', 'page',
  // 'attachment'. Empty string if not applicable.
  post_type: string;

  // Taxonomy associated with the screen, if any. E.g. 'category',
  // 'post_tag'. Empty string if not applicable.
  taxonomy: string;

  // Which admin context: 'network' | 'user' | 'site' | false
  // Use in_admin() method instead of reading directly.
  // in_admin: protected — access via in_admin()

  // @deprecated 3.5.0 — use in_admin('network') instead
  is_network: boolean;

  // @deprecated 3.5.0 — use in_admin('user') instead
  is_user: boolean;

  // Whether the block editor (Gutenberg) is loading on this screen.
  is_block_editor: boolean;

  // The parent file for the screen in the menu system.
  // E.g. 'edit.php?post_type=page', 'options-general.php'.
  // Set by set_parentage() in admin-header.php.
  parent_file: string | null;

  // The parent base: parent_file with query string and .php stripped.
  // E.g. 'edit' for parent_file of 'edit.php?post_type=page'.
  parent_base: string | null;
}
```

**ID construction logic:**
- `edit.php` with `?post_type=page` → id = `'edit-page'`, base = `'edit'`
- `post.php` editing a page → id = `'page'`, base = `'post'`
- `edit-tags.php` with `?taxonomy=category` → id = `'edit-category'`, base = `'edit-tags'`
- `index.php` → id = `'dashboard'`, base = `'dashboard'` (special-cased from `'index'`)
- Plugin page `settings_page_myplugin` → id = `'settings_page_myplugin'`, base = `'settings_page_myplugin'`
- Network admin adds `-network` suffix to id and base.
- User admin adds `-user` suffix.

### 4.3 `add_screen_option()`

```typescript
function add_screen_option(option: string, args?: object): void
// Registers a Screen Options panel entry for the current screen.
// Must be called on the load-{page} hook, before admin-header.php renders.
// Equivalent to $current_screen->add_option(option, args).
```

**Built-in option types:**

*`per_page`* — Renders a number input in Screen Options for "items per page."

```typescript
get_current_screen().add_option('per_page', {
  label: string,      // Label text. Default: 'Number of items per page:'
  default: number,    // Default value if user has not saved a preference. Default: 20
  option: string,     // User option key to store the value under.
                      // Default: '{screen_id}_per_page' (underscores replacing hyphens)
});
```

The stored value is read back via `get_user_option(option)`. A `{option}` filter (dynamic name) allows overriding the computed value.

*`layout_columns`* — Renders radio buttons for 1, 2, or N column dashboard layouts.

```typescript
get_current_screen().add_option('layout_columns', {
  max: number,        // Maximum number of columns allowed
  default: number,    // Default number of columns
});
```

The stored value lives in user option `screen_layout_{screen_id}`.

### 4.4 Help System

The contextual help panel is populated by calling methods on the current screen object. All calls must happen on the `load-{page}` hook.

**`add_help_tab(args)`**

```typescript
get_current_screen().add_help_tab({
  id: string,           // Required. HTML-safe, no spaces. Uniquely identifies the tab.
  title: string,        // Required. Displayed as the tab link text.
  content?: string,     // HTML content for the tab panel. Default empty.
  callback?: callable,  // Called with ($screen, $tab) to render dynamic content.
  priority?: number,    // Determines tab order. Lower = earlier. Default 10.
});
```

If a tab with the same `id` already exists, it is replaced. The `id` is sanitized through `sanitize_html_class()`. Tabs are sorted by priority (ascending) when rendered.

**`remove_help_tab(id)`** — Removes a single tab by ID.

**`remove_help_tabs()`** — Removes all tabs.

**`set_help_sidebar(content)`** — Sets the right-side panel of the help overlay. Content is arbitrary HTML. Call with an empty string to remove the sidebar.

**`get_help_tabs()`** — Returns sorted array of registered tabs.

**`get_help_sidebar()`** — Returns the sidebar HTML string.

### 4.5 Screen Columns (Dashboard Widgets)

The `layout_columns` screen option controls the number of metabox columns on the Dashboard and similar screens that support `add_meta_box()`. When `add_option('layout_columns', { max: 2 })` is called, the Screen Options panel shows column count radio buttons. The user's chosen value is stored as user option `screen_layout_{screen_id}` and read back via `get_columns()`.

`$GLOBALS['screen_layout_columns']` is set as a back-compat alias to `$current_screen->get_columns()`.

### 4.6 `current_screen` Action

```typescript
// Fires immediately after the current screen is set.
// Use to add help tabs, screen options, or modify the screen.
// Receives the WP_Screen instance as its first argument.
do_action('current_screen', currentScreen: WPScreen);
```

### 4.7 Screen Reader Content

```typescript
get_current_screen().set_screen_reader_content({
  heading_views: string,      // Default: 'Filter items list'
  heading_pagination: string, // Default: 'Items list navigation'
  heading_list: string,       // Default: 'Items list'
});
```

Used by `WP_List_Table` to output visually-hidden heading text for assistive technologies.

---

## 5. `WP_List_Table`

`WP_List_Table` is the base class for all tabular data views in the admin. Subclasses implement the abstract methods and optionally override the virtual methods to customize behavior.

### 5.1 Constructor

```typescript
new WP_List_Table({
  singular?: string,  // Singular name for one item. Used in nonces, data attributes.
  plural?: string,    // Plural name. Used as CSS class and nonce. Defaults to screen base.
  ajax?: boolean,     // If true, outputs list_args JS variable for AJAX refresh.
  screen?: string,    // Hook name to use as screen; defaults to current screen.
})
```

The constructor:
1. Calls `convert_to_screen($args['screen'])` to set `$this->screen`.
2. Registers `get_columns()` on the `manage_{screen_id}_columns` filter at priority 0.
3. If `$ajax` is true, hooks `_js_vars()` on `admin_footer`.
4. Sets default view modes: `{ list: 'Compact view', excerpt: 'Extended view' }`.

### 5.2 Abstract Methods (Must Override)

**`get_columns(): array`**

Return an associative array of `column_slug => 'Display Label'`. The `'cb'` key is the checkbox column; its value is ignored (replaced with a select-all checkbox in the header). This array is passed through the `manage_{screen_id}_columns` filter.

```typescript
get_columns(): Record<string, string>
// Example: { cb: '<input type="checkbox">', title: 'Title', date: 'Date' }
```

**`prepare_items(): void`**

Fetch data and set `$this->items`. Must call `set_pagination_args()` and typically calls `get_column_info()` to set `$this->_column_headers`. This is the data-loading phase.

**`ajax_user_can(): boolean`**

Called to check permissions before an AJAX list refresh. Must be overridden; the base implementation calls `die()`.

### 5.3 Methods to Override (Optional)

**`get_sortable_columns(): array`**

Return sortable column definitions. Format:

```typescript
// Simple: column_slug → orderby_string
// Extended: column_slug → [orderby, descFirst?, abbr?, orderbyText?, initialOrder?]
{
  title: 'post_title',
  date: ['date', true, 'Date', 'Sorted by date', 'desc'],
}
// descFirst: true = initial click sorts descending; false/string = sorts ascending
// abbr: short name for <abbr> attribute
// orderbyText: translatable string for screen reader caption
// initialOrder: 'asc' | 'desc' — sets initial default sort direction
```

**`get_bulk_actions(): array`**

Return available bulk actions. Format: `action_slug => 'Label'`. Can include optgroups:

```typescript
{
  edit: 'Edit',
  delete: 'Delete',
  'Change Status': {
    publish: 'Publish',
    draft: 'Draft',
  }
}
```

The result is passed through `bulk_actions-{screen_id}` filter.

**`column_default(item, columnName): string`**

Fallback renderer called when no specific `column_{slug}()` method exists. Return the HTML to display in the cell.

**`column_{slug}(item): string`**

Per-column cell renderer. Implement one method per column slug to render that column's content. Called by `single_row_columns()` via `method_exists()` check. The primary column's renderer should include a call to `row_actions()`.

**`no_items(): void`**

Renders the message when `$this->items` is empty. Default: "No items found."

**`extra_tablenav(which): void`**

Renders additional controls between bulk actions and pagination in the tablenav. `which` is `'top'` or `'bottom'`.

### 5.4 Core Methods

**`display(): void`**

Renders the complete list table HTML: tablenav top, `<table>` with thead/tbody/tfoot, tablenav bottom. The table has classes `wp-list-table widefat fixed striped {view-mode} {plural}`.

**`single_row(item): void`**

Renders one `<tr>` wrapping `single_row_columns()`. Override to add custom row attributes or wrapping markup.

**`print_column_headers(withId?: boolean): void`**

Renders all `<th>` and `<td>` header cells. Handles hidden columns (adds `hidden` class), sortable columns (wraps in `<a>` with `orderby`/`order` query args and sort indicators), the primary column (`column-primary` class), and the checkbox cell.

**`pagination(which: 'top' | 'bottom'): void`**

Renders pagination controls. Only displays if `total_items` was set in `set_pagination_args()`. Renders item count, first/prev/next/last page links, and a current page input field (top only).

**`search_box(text, inputId): void`**

Renders a `<p class="search-box">` with a text search input and submit button. Hidden inputs preserve `orderby`, `order`, `post_mime_type`, and `detached` from the current request. Only renders if there are items or an active search (`$_REQUEST['s']`).

**`bulk_action_form(): void`**

Not a standalone method — the nonce field for bulk actions is rendered by `display_tablenav()` via `wp_nonce_field('bulk-{plural}')`. The bulk select dropdown is rendered by `bulk_actions(which)`.

### 5.5 `items` Property and `set_pagination_args()`

`$this->items` is a public array populated in `prepare_items()` with the current page's data.

```typescript
this.set_pagination_args({
  total_items: number,   // Total count across all pages (for pagination display)
  per_page: number,      // Items shown per page
  total_pages?: number,  // Calculated as ceil(total_items / per_page) if omitted
  infinite_scroll?: boolean, // Hides pagination controls with JS
});
```

If the requested `?paged=` value exceeds `total_pages` and headers have not been sent, `set_pagination_args()` redirects to the last page.

`get_pagenum()` returns the current page from `$_REQUEST['paged']`, defaulting to 1, clamped to `total_pages`.

`get_items_per_page($option, $default)` reads the stored user option and applies `{$option}` filter. Standard option names: `edit_{post_type}_per_page`, `edit_{taxonomy}_per_page`, `users_per_page`.

### 5.6 `column_cb()` and `row_actions()`

**`column_cb(item): string`**

Override to return the checkbox HTML for bulk action selection. Typical implementation:

```php
return '<input type="checkbox" name="ids[]" value="' . $item->ID . '">';
```

Called from `single_row_columns()` when the `cb` column is present. Rendered inside `<th scope="row" class="check-column">`.

**`row_actions(actions, alwaysVisible?): string`**

Helper to build the hover-revealed action link set shown on the primary column.

```typescript
this.row_actions({
  edit: '<a href="...">Edit</a>',
  trash: '<a href="...">Trash</a>',
  view: '<a href="...">View</a>',
}, false /* alwaysVisible */)
// Returns: <div class="row-actions"><span class="edit">...</span>...</div>
// If view mode is 'excerpt', alwaysVisible is forced true.
```

### 5.7 `get_primary_column_name()`

Returns the primary column slug. The primary column:
- Receives the `has-row-actions column-primary` CSS class.
- Is the only column that renders row actions in responsive view.
- Defaults to the first non-`cb` column from `get_columns()`.
- Can be customized via the `list_table_primary_column` filter.

```typescript
apply_filters('list_table_primary_column', defaultColumn: string, screenId: string): string
```

### 5.8 Views (Filter Tabs)

`get_views()` returns an array of filter tab links shown above the table as a `<ul class="subsubsub">`. Format: `view_key => '<a href="...">Label <span class="count">(N)</span></a>'`.

```typescript
// Typical implementation:
get_views(): Record<string, string> {
  return {
    all: '<a href="edit.php" class="current" aria-current="page">All <span class="count">(42)</span></a>',
    publish: '<a href="edit.php?post_status=publish">Published <span class="count">(30)</span></a>',
    draft: '<a href="edit.php?post_status=draft">Drafts <span class="count">(12)</span></a>',
  };
}
```

The `current` class and `aria-current="page"` attribute mark the active view. Views are passed through `views_{screen_id}` filter before rendering.

The helper `get_views_links(linkData)` (since 6.1.0) generates view link markup from structured data:

```typescript
this.get_views_links([
  { url: 'edit.php', label: 'All <span>(42)</span>', current: true },
  { url: 'edit.php?post_status=publish', label: 'Published <span>(30)</span>' },
])
```

### 5.9 AJAX List Refresh

When `ajax: true` is passed to the constructor, `_js_vars()` outputs a `list_args` JS object:

```typescript
const list_args = {
  class: 'WP_Posts_List_Table', // PHP class name
  screen: {
    id: 'edit-post',
    base: 'edit',
  },
};
```

The built-in `fetch-list` AJAX action (`wp_ajax_fetch_list`) calls `ajax_response()` on the appropriate list table class. `ajax_response()` calls `prepare_items()`, captures the rendered rows, and `die()`s with JSON:

```typescript
{
  rows: string,              // rendered HTML rows
  total_items_i18n?: string, // localized item count
  total_pages?: number,
  total_pages_i18n?: string,
}
```

The nonce for AJAX list fetches is generated by `wp_create_nonce('fetch-list-' . $requestedClass)`.

---

## 6. Admin AJAX (`admin-ajax.php`)

### 6.1 How It Works

`admin-ajax.php` is the single endpoint for all WordPress AJAX requests. It is not a framework — it is a dispatcher that maps an `action` string to one or two dynamic hook names.

Execution sequence:
1. Define `DOING_AJAX = true` and `WP_ADMIN = true`.
2. Load `wp-load.php` (full WordPress bootstrap, no screen setup).
3. `send_origin_headers()` — emits `Access-Control-Allow-Origin` for cross-domain requests from the front end.
4. Set `Content-Type: text/html; charset={blog_charset}` and `X-Robots-Tag: noindex`.
5. Validate `$_REQUEST['action']` — must be non-empty scalar or die with 400.
6. Load admin includes: `wp-admin/includes/admin.php`, then `wp-admin/includes/ajax-actions.php`.
7. `send_nosniff_header()`, `nocache_headers()`.
8. `do_action('admin_init')`.
9. Register built-in core AJAX actions (see Section 6.3).
10. Dispatch: if user is logged in, fire `wp_ajax_{action}`; otherwise fire `wp_ajax_nopriv_{action}`.
11. If no handler is registered, die with `'0'` and 400 status.
12. After handler runs, die with `'0'` (default fallback — well-behaved handlers die before reaching this).

**Key contract:** The AJAX handler is fully responsible for:
- Verifying the nonce (typically with `check_ajax_referer()` or `wp_verify_nonce()`).
- Checking user capabilities.
- Sending a response and calling `wp_die()` or `die()` to end execution.

If no handler fires, the endpoint always terminates with `wp_die('0')`.

### 6.2 Hook Names

```typescript
// Logged-in users:
do_action(`wp_ajax_${action}`);

// Logged-out users:
do_action(`wp_ajax_nopriv_${action}`);
```

Register handlers with:

```typescript
add_action('wp_ajax_my_action', myHandler);           // logged-in only
add_action('wp_ajax_nopriv_my_action', myHandler);    // logged-out only
add_action('wp_ajax_my_action', myHandler);
add_action('wp_ajax_nopriv_my_action', myHandler);    // both
```

### 6.3 Built-in Core AJAX Actions

The following actions are registered by `admin-ajax.php` for `$_GET` requests:

| Action | Handler function |
|---|---|
| `fetch-list` | `wp_ajax_fetch_list` |
| `ajax-tag-search` | `wp_ajax_ajax_tag_search` |
| `wp-compression-test` | `wp_ajax_wp_compression_test` |
| `imgedit-preview` | `wp_ajax_imgedit_preview` |
| `oembed-cache` | `wp_ajax_oembed_cache` |
| `autocomplete-user` | `wp_ajax_autocomplete_user` |
| `dashboard-widgets` | `wp_ajax_dashboard_widgets` |
| `logged-in` | `wp_ajax_logged_in` |
| `rest-nonce` | `wp_ajax_rest_nonce` |

The following actions are registered for `$_POST` requests (selected):

| Action | Handler function |
|---|---|
| `heartbeat` | `wp_ajax_heartbeat` |
| `image-editor` | `wp_ajax_image_editor` |
| `delete-comment` | `wp_ajax_delete_comment` |
| `add-tag` | `wp_ajax_add_tag` |
| `inline-save` | `wp_ajax_inline_save` |
| `upload-attachment` | `wp_ajax_upload_attachment` |
| `get-attachment` | `wp_ajax_get_attachment` |
| `query-attachments` | `wp_ajax_query_attachments` |
| `save-attachment` | `wp_ajax_save_attachment` |
| `set-post-thumbnail` | `wp_ajax_set_post_thumbnail` |
| `get-comments` | `wp_ajax_get_comments` |
| `replyto-comment` | `wp_ajax_replyto_comment` |
| `edit-comment` | `wp_ajax_edit_comment` |
| `add-menu-item` | `wp_ajax_add_menu_item` |
| `meta-box-order` | `wp_ajax_meta_box_order` |
| `closed-postboxes` | `wp_ajax_closed_postboxes` |
| `hidden-columns` | `wp_ajax_hidden_columns` |
| `find_posts` | `wp_ajax_find_posts` |
| `save-widget` | `wp_ajax_save_widget` |
| `update-widget` | `wp_ajax_update_widget` |
| `install-plugin` | `wp_ajax_install_plugin` |
| `update-plugin` | `wp_ajax_update_plugin` |
| `delete-plugin` | `wp_ajax_delete_plugin` |
| `activate-plugin` | `wp_ajax_activate_plugin` |
| `install-theme` | `wp_ajax_install_theme` |
| `update-theme` | `wp_ajax_update_theme` |
| `delete-theme` | `wp_ajax_delete_theme` |
| `crop-image` | `wp_ajax_crop_image` |
| `generate-password` | `wp_ajax_generate_password` |
| `destroy-sessions` | `wp_ajax_destroy_sessions` |
| `toggle-auto-updates` | `wp_ajax_toggle_auto_updates` |
| `wp-privacy-export-personal-data` | `wp_ajax_wp_privacy_export_personal_data` |
| `wp-privacy-erase-personal-data` | `wp_ajax_wp_privacy_erase_personal_data` |
| `health-check-site-status-result` | `wp_ajax_health_check_site_status_result` |
| `health-check-get-sizes` | `wp_ajax_health_check_get_sizes` |

Nopriv (logged-out) actions: `generate-password` and `heartbeat` are the only built-in nopriv actions.

### 6.4 The Heartbeat API

The heartbeat is an AJAX polling mechanism for features like post lock, autosave, and login session expiry detection.

- **Action:** `heartbeat` (POST), registered as both `wp_ajax_heartbeat` and `wp_ajax_nopriv_heartbeat`.
- **Tick interval:** 15–60 seconds, configurable via `heartbeat_settings` filter. Default 15s while the window is focused, slows to 60s when unfocused. The `WP_Heartbeat` class on the front end manages the interval.
- **Data flow:** The JS client sends `{ data: { ...feature_data... } }`. The PHP handler fires `heartbeat_received` filter with the data payload, then fires `heartbeat_tick` action, and returns a JSON response of aggregated feature responses.

```typescript
// Filter to process heartbeat data from a specific feature:
apply_filters('heartbeat_received', response: object, data: object, screenId: string): object;

// Action fired on each tick:
do_action('heartbeat_tick', response: object, screenId: string);

// Filter to modify heartbeat settings sent to JS:
apply_filters('heartbeat_settings', settings: {
  interval: number,        // seconds between ticks
  minimalInterval: number, // minimum enforced interval
  suspension: 'disable' | undefined, // 'disable' to stop heartbeat
}): object;
```

### 6.5 `WP_Ajax_Response`

A utility class for sending structured XML responses from AJAX handlers (legacy; `wp_send_json_*` is preferred for new code).

```typescript
new WP_Ajax_Response([{
  what: string,          // Element name in response XML
  action: string | false,// Action to trigger in JS; false to use WP default
  id: number | WP_Error, // ID of affected object, or WP_Error on failure
  oldID: number,         // Previous ID (for replace operations)
  position: number,      // Position for insertion
  data: string,          // Response data (HTML or string)
  supplemental: object,  // Additional key-value data
}])
// Calling send() outputs XML and calls wp_die().
```

### 6.6 JSON Response Helpers

These functions are the preferred way to terminate AJAX handlers:

```typescript
function wp_send_json(data: unknown, statusCode?: number, flags?: number): never
// JSON-encodes data, sets Content-Type to application/json, calls wp_die().

function wp_send_json_success(data?: unknown, statusCode?: number, flags?: number): never
// Sends: { success: true, data: data }

function wp_send_json_error(data?: unknown, statusCode?: number, flags?: number): never
// Sends: { success: false, data: data }
// If data is a WP_Error, converts to { code, message } objects.
```

All three functions call `wp_die('')` after sending headers and output. If called inside `admin-ajax.php`, the default status code is 200. Pass a non-zero `$status_code` to send HTTP errors.

### 6.7 `wp_die()` as Response Terminator

All AJAX handlers must end by calling `wp_die()` (or `die()`/`exit`). `wp_die()` in an AJAX context:
- When `DOING_AJAX` is true: outputs the message string directly and calls `die()`, skipping the full HTML error page.
- The fallback `wp_die('0')` at the end of `admin-ajax.php` ensures no response is given if no handler ran (or if a handler forgot to die).

---

## 7. `admin-post.php`

`admin-post.php` is the generic handler for HTML form submissions that require WordPress authentication context but do not need the full admin UI (no sidebar, no admin header).

**Use case:** Plugin settings forms, custom form processors, content submitted from the front end that needs auth.

### 7.1 Execution Sequence

1. Define `WP_ADMIN = true`.
2. Load `wp-load.php`.
3. `send_origin_headers()`.
4. Load admin includes.
5. `nocache_headers()`.
6. `do_action('admin_init')`.
7. Sanitize `$_REQUEST['action']` via `sanitize_text_field()`.
8. Dispatch based on login state:

```
if NOT logged in:
  if no action:
    do_action('admin_post_nopriv')
  else:
    if no handler registered: wp_die('', 400)
    do_action('admin_post_nopriv_{action}')
else:
  if no action:
    do_action('admin_post')
  else:
    if no handler registered: wp_die('', 400)
    do_action('admin_post_{action}')
```

### 7.2 Hook Names

```typescript
// Logged-in, with action:
do_action(`admin_post_${action}`);

// Logged-out, with action:
do_action(`admin_post_nopriv_${action}`);

// No action (rarely used):
do_action('admin_post');
do_action('admin_post_nopriv');
```

### 7.3 Handler Contract

Unlike AJAX, `admin-post.php` does not output a default response. The handler is responsible for all output and must redirect or die. The typical pattern:

```php
add_action('admin_post_my_form', function() {
    check_admin_referer('my_form_nonce');
    // process data
    wp_redirect(admin_url('options-general.php?page=myplugin&updated=1'));
    exit;
});
```

Nonce checking, capability verification, data validation, and response (redirect or output) are entirely the handler's responsibility.

---

## 8. Admin Notices

### 8.1 `admin_notices` Action

```typescript
do_action('admin_notices');
// Fires inside the admin page body, after the page heading area.
// Handlers echo notice HTML directly.
// Also: 'network_admin_notices' in network admin, 'user_admin_notices' in user admin.
// 'all_admin_notices' fires on all three contexts.
```

### 8.2 Notice HTML Structure

```html
<div class="notice notice-{type} [is-dismissible]">
    <p>Notice message text here.</p>
</div>
```

Valid `type` values and their meaning:

| Class | Color | Use for |
|---|---|---|
| `notice-success` | Green | Successful operation |
| `notice-warning` | Yellow/orange | Caution; action may be needed |
| `notice-error` | Red | Failed operation or critical issue |
| `notice-info` | Blue | Informational message |

Adding `is-dismissible` renders an `×` dismiss button. WordPress JS handles the click and hides the notice via CSS. The dismissal is **not persisted** automatically — if you need persistence, the handler must store a flag in user meta and only output the notice when the flag is unset.

### 8.3 Persistent Dismissal Pattern

```typescript
// Output the notice with a dismiss link that fires an AJAX action:
add_action('admin_notices', () => {
    if (get_user_meta(getCurrentUserId(), 'dismissed_my_notice', true)) return;
    echo '<div class="notice notice-info is-dismissible" id="my-notice">';
    echo '<p>My notice text.</p>';
    echo '</div>';
});

// AJAX handler to dismiss:
add_action('wp_ajax_dismiss_my_notice', () => {
    check_ajax_referer('dismiss_my_notice');
    update_user_meta(getCurrentUserId(), 'dismissed_my_notice', '1');
    wp_die();
});
```

### 8.4 `settings_errors()`

```typescript
function settings_errors(
  settingName?: string,  // Slug of the setting group; defaults to current page slug
  sanitize?: boolean,    // Whether to re-sanitize before display. Default false.
  hideOnUpdate?: boolean // Whether to hide on successful save. Default false.
): void
// Renders notices queued via add_settings_error().
```

`add_settings_error(settingName, code, message, type?)` queues a notice for a settings group. This is the standard mechanism for Settings API feedback. Type is `'error'` or `'success'` (default `'error'`). The queued notices are stored in a transient and displayed on the next page load via `settings_errors()`.

---

## 9. Admin Bar

### 9.1 `WP_Admin_Bar`

The admin bar (toolbar) is a persistent navigation strip rendered at the top of both admin and public-facing pages when a user is logged in. It is implemented by `WP_Admin_Bar` (`wp-includes/class-wp-admin-bar.php`) and stored in `$GLOBALS['wp_admin_bar']`.

Initialization is triggered from `admin.php` via `_wp_admin_bar_init()`, which is called before page output begins. This function:
1. Calls `is_admin_bar_showing()` — if false, returns early.
2. Applies `wp_admin_bar_class` filter (default `'WP_Admin_Bar'`) and instantiates the class.
3. Calls `$wp_admin_bar->initialize()` — enqueues scripts/styles, hooks `wp_head`/`admin_head`.
4. Calls `$wp_admin_bar->add_menus()` — registers the default node-building callbacks on `admin_bar_menu`.

### 9.2 Node Structure

The admin bar is a tree of nodes. Each node is an object:

```typescript
interface AdminBarNode {
  id: string;           // Required. Unique node identifier.
  title: string;        // HTML displayed in the bar or submenu.
  parent: string | false; // Parent node ID; false = top-level.
  href: string | false; // Link URL; false = non-linked item.
  group: boolean;       // If true, node is a visual group container, not a link.
  meta: {
    html?: string;      // Extra HTML inserted after the link.
    class?: string;     // CSS class on the <li>.
    rel?: string;       // rel attribute on the link.
    lang?: string;      // lang attribute.
    dir?: string;       // dir attribute (ltr/rtl).
    onclick?: string;   // onclick attribute on the link.
    target?: string;    // target attribute on the link.
    title?: string;     // title attribute on the link.
    tabindex?: number;  // tabindex when no href.
    menu_title?: string;// ARIA label for the submenu (since 6.5.0).
  };
}
```

Top-level nodes (no parent or `parent: false`) appear in the main bar. Nodes with a `parent` appear in that parent's dropdown. Nodes with `group: true` visually separate submenu items with a horizontal rule.

### 9.3 `add_node()` and `remove_node()`

```typescript
// Add or update a node:
$wp_admin_bar->add_node({
  id: string,
  title?: string,
  parent?: string | false,
  href?: string | false,
  group?: boolean,
  meta?: object,
});
// If a node with the same id already exists, missing keys are inherited from
// the existing node (merge, not replace).

// Remove a node:
$wp_admin_bar->remove_node(id: string): void
// Also: remove_menu(id) is an alias.

// Retrieve a node (returns a clone):
$wp_admin_bar->get_node(id: string): AdminBarNode | void
```

### 9.4 `admin_bar_menu` Action

```typescript
do_action_ref_array('admin_bar_menu', [&$wp_admin_bar]);
// Fires when the admin bar is being built, just before rendering.
// Receives $wp_admin_bar by reference.
// Use add_node() / remove_node() here to customize the bar.
// Priority determines node insertion order.
```

Additional hooks around rendering:
```typescript
do_action('wp_before_admin_bar_render'); // Fires just before render()
do_action('wp_after_admin_bar_render');  // Fires just after render()
do_action('admin_bar_init');             // Fires after WP_Admin_Bar is initialized
```

### 9.5 Built-in Admin Bar Nodes

| Node ID | Parent | Description |
|---|---|---|
| `wp-logo` | — | WordPress logo with About/Contribute links |
| `wp-logo-external` | `wp-logo` | Group for external WP.org links |
| `about` | `wp-logo` | About WordPress link |
| `contribute` | `wp-logo` | Get Involved link |
| `wporg` | `wp-logo-external` | WordPress.org |
| `documentation` | `wp-logo-external` | Documentation |
| `learn` | `wp-logo-external` | Learn WordPress |
| `support-forums` | `wp-logo-external` | Support forums |
| `feedback` | `wp-logo-external` | Feedback forum |
| `menu-toggle` | — | Mobile sidebar toggle (admin only) |
| `site-name` | — | Site title / visit site link |
| `dashboard` | `site-name` | Dashboard link |
| `appearance` | `site-name` | Customize/appearance (non-block themes) |
| `view-site` | `site-name` | View site link (admin context) |
| `edit-site` | `site-name` | Site editor link (block themes) |
| `updates` | — | Update count badge |
| `comments` | — | Comments moderation count badge |
| `new-content` | — | "+ New" dropdown |
| `new-post` | `new-content` | New Post |
| `new-media` | `new-content` | New Media |
| `new-page` | `new-content` | New Page |
| `new-user` | `new-content` | New User (if capability) |
| `my-account` | `top-secondary` | User avatar and greeting |
| `user-actions` | `my-account` | Group for user account links |
| `user-info` | `user-actions` | Display name |
| `edit-profile` | `user-actions` | Edit profile link |
| `logout` | `user-actions` | Log out link |
| `my-sites` | — | My Sites (multisite only) |
| `top-secondary` | — | Right-aligned group container |
| `search` | — | Quick search bar |

### 9.6 `is_admin_bar_showing()` and `show_admin_bar()`

```typescript
function is_admin_bar_showing(): boolean
// Returns whether the admin bar should be shown for the current request.
// True if:
//   - User is logged in AND
//   - User has 'read' capability AND
//   - show_admin_bar filter returns true AND
//   - It is not a login/register page, iframe page, or XML/feed request.

function show_admin_bar(show: boolean): void
// Forces the admin bar to show or hide. Must be called before wp_head.

// Filter:
apply_filters('show_admin_bar', isShowing: boolean): boolean;
```

---

## 10. Key Hooks and Filters Reference

### 10.1 Lifecycle Hooks (in execution order)

| Hook | Type | Location | Notes |
|---|---|---|---|
| `admin_init` | action | `admin.php`, `admin-ajax.php`, `admin-post.php` | Primary admin initialization hook |
| `admin_menu` | action | `menu.php` (after menu is built) | Add/modify menu items |
| `network_admin_menu` | action | `network/menu.php` | Network-admin menu modifications |
| `current_screen` | action | `WP_Screen::set_current_screen()` | Screen object just set; arg: `WP_Screen` |
| `load-{pagenow}` | action | `admin.php` | Before core page renders |
| `load-{page_hook}` | action | `admin.php` | Before plugin page renders |
| `load-importer-{slug}` | action | `admin.php` | Before importer runs |
| `{page_hook}` | action | `admin.php` | Renders plugin page content |
| `admin_action_{action}` | action | `admin.php` | `$_REQUEST['action']` dispatch |
| `admin_notices` | action | `admin-header.php` | Output admin notices |
| `all_admin_notices` | action | `admin-header.php` | Notices in all admin contexts |
| `admin_bar_init` | action | `WP_Admin_Bar::initialize()` | After admin bar initialized |
| `admin_bar_menu` | action | `wp_admin_bar_render()` | Build admin bar nodes |
| `wp_before_admin_bar_render` | action | `wp_admin_bar_render()` | Just before bar HTML output |
| `wp_after_admin_bar_render` | action | `wp_admin_bar_render()` | Just after bar HTML output |
| `after_db_upgrade` | action | `admin.php` | After successful DB upgrade |
| `after_mu_upgrade` | action | `network/upgrade.php` | After multisite upgrade request |

### 10.2 Key Filters

| Filter | Signature | Notes |
|---|---|---|
| `do_mu_upgrade` | `bool` | Enable/disable multisite auto-upgrade. Default true. |
| `force_filtered_html_on_import` | `bool` | Force kses on imported content. Default false. |
| `show_admin_bar` | `bool` | Override admin bar visibility. |
| `wp_admin_bar_class` | `string` | Override admin bar class. Default `'WP_Admin_Bar'`. |
| `screen_layout_columns` | `array $columns, $screen_id, WP_Screen` | Back-compat for layout_columns option. |
| `screen_settings` | `string $html, WP_Screen` | Add custom HTML to Screen Options panel. |
| `screen_options_show_screen` | `bool, WP_Screen` | Show/hide Screen Options panel. |
| `screen_options_show_submit` | `bool, WP_Screen` | Show/hide Screen Options submit button. |
| `manage_{screen_id}_columns` | `array $columns` | Modify list table columns for a screen. |
| `manage_{screen_id}_sortable_columns` | `array $sortable` | Modify sortable columns. |
| `bulk_actions-{screen_id}` | `array $actions` | Modify bulk action list. |
| `views_{screen_id}` | `array $views` | Modify view filter tab links. |
| `list_table_primary_column` | `string $column, string $screen_id` | Override primary column. |
| `admin_memory_limit` | `int|string` | Memory limit for admin users. |
| `heartbeat_settings` | `array $settings` | Heartbeat tick interval and behavior. |
| `heartbeat_received` | `array $response, array $data, string $screen_id` | Process heartbeat payload. |
| `custom_menu_order` | `bool` | Enable custom menu ordering. |
| `menu_order` | `array $order` | Reorder admin menu items. |
| `{per_page_option}` | `int $perPage` | Override per-page count for any list table. |
| `disable_months_dropdown` | `bool, string $post_type` | Remove months dropdown from list table. |

---

## 11. TypeScript Interface Sketch

```typescript
// ─── Bootstrap globals ───────────────────────────────────────────────────────

interface AdminBootstrapGlobals {
  pagenow: string;           // Filename of the current screen, e.g. 'edit.php'
  hookSuffix: string;        // Resolved hook name: page_hook | plugin_page | pagenow
  pluginPage: string | null; // plugin_basename($_GET['page']) if present
  pageHook: string | null;   // Resolved from get_plugin_page_hook()
  typenow: string;           // Active post type slug, empty if none
  taxnow: string;            // Active taxonomy slug, empty if none
}

// ─── Menu system ─────────────────────────────────────────────────────────────

type MenuEntry = [string, string, string, string, string, string, string];
// [label, capability, slug, pageTitle, cssClasses, htmlId, icon]

type SubmenuEntry = [string, string, string, string?];
// [label, capability, slug, pageTitle?]

interface MenuRegistry {
  menu: Record<number, MenuEntry>;
  submenu: Record<string, Record<number, SubmenuEntry>>;
}

interface MenuPageRegistrar {
  addMenuPage(
    pageTitle: string,
    menuTitle: string,
    capability: string,
    menuSlug: string,
    callback?: () => void,
    iconUrl?: string,
    position?: number
  ): string; // hook suffix

  addSubmenuPage(
    parentSlug: string,
    pageTitle: string,
    menuTitle: string,
    capability: string,
    menuSlug: string,
    callback?: () => void,
    position?: number
  ): string | false;

  removeMenuPage(menuSlug: string): MenuEntry | false;
  removeSubmenuPage(parentSlug: string, menuSlug: string): SubmenuEntry | false;
  menuPageUrl(menuSlug: string, echo?: boolean): string;
}

// ─── WP_Screen ───────────────────────────────────────────────────────────────

interface WPScreenHelpTab {
  id: string;
  title: string;
  content?: string;
  callback?: (screen: WPScreen, tab: WPScreenHelpTab) => void;
  priority?: number;
}

interface WPScreenOption {
  label?: string;
  default?: number;
  option?: string;
  max?: number;
}

interface WPScreen {
  readonly id: string;
  readonly base: string;
  readonly action: string;
  readonly post_type: string;
  readonly taxonomy: string;
  readonly is_block_editor: boolean;
  readonly is_network: boolean;    // deprecated, use in_admin('network')
  readonly is_user: boolean;       // deprecated, use in_admin('user')
  readonly parent_file: string | null;
  readonly parent_base: string | null;

  in_admin(admin?: 'network' | 'user' | 'site'): boolean;
  isBlockEditor(set?: boolean): boolean;

  // Screen options
  addOption(option: string, args?: WPScreenOption): void;
  removeOption(option: string): void;
  removeOptions(): void;
  getOption(option: string, key?: string | false): WPScreenOption | string | null;
  getOptions(): Record<string, WPScreenOption>;

  // Help system
  addHelpTab(args: WPScreenHelpTab): void;
  removeHelpTab(id: string): void;
  removeHelpTabs(): void;
  getHelpTab(id: string): WPScreenHelpTab | null;
  getHelpTabs(): Record<string, WPScreenHelpTab>;
  setHelpSidebar(content: string): void;
  getHelpSidebar(): string;

  // Columns
  getColumns(): number;

  // Screen reader content
  setScreenReaderContent(content: {
    heading_views?: string;
    heading_pagination?: string;
    heading_list?: string;
  }): void;
  getScreenReaderContent(): Record<string, string>;
  getScreenReaderText(key: string): string | null;
  renderScreenReaderContent(key: string, tag?: string): void;

  // Rendering
  renderScreenMeta(): void;
  showScreenOptions(): boolean;
  renderScreenOptions(options?: { wrap?: boolean }): void;
}

// ─── WP_List_Table ───────────────────────────────────────────────────────────

interface ListTableArgs {
  singular?: string;
  plural?: string;
  ajax?: boolean;
  screen?: string | null;
}

interface PaginationArgs {
  total_items: number;
  per_page: number;
  total_pages?: number;
  infinite_scroll?: boolean;
}

// Column info tuple: [columns, hidden, sortable, primaryColumn]
type ColumnInfo = [
  Record<string, string>,
  string[],
  Record<string, [string, boolean?, string?, string?, string?]>,
  string,
];

interface WPListTable {
  items: unknown[];
  screen: WPScreen;

  // Abstract — must override
  getColumns(): Record<string, string>;
  prepareItems(): void;
  ajaxUserCan(): boolean;

  // Virtual — optionally override
  getSortableColumns(): Record<string, string | [string, boolean?, string?, string?, string?]>;
  getBulkActions(): Record<string, string | Record<string, string>>;
  columnDefault(item: unknown, columnName: string): string;
  noItems(): void;
  extraTablenav(which: 'top' | 'bottom'): void;
  getViews(): Record<string, string>;

  // Core methods
  display(): void;
  singleRow(item: unknown): void;
  printColumnHeaders(withId?: boolean): void;
  pagination(which: 'top' | 'bottom'): void;
  searchBox(text: string, inputId: string): void;
  views(): void;
  rowActions(actions: Record<string, string>, alwaysVisible?: boolean): string;

  // Pagination
  setPaginationArgs(args: PaginationArgs): void;
  getPaginationArg(key: string): number;
  getPagenum(): number;
  getItemsPerPage(option: string, defaultValue?: number): number;

  // Column info
  getColumnInfo(): ColumnInfo;
  getColumnCount(): number;
  getPrimaryColumn(): string;

  // AJAX
  ajaxResponse(): never;
}

// ─── Admin AJAX ──────────────────────────────────────────────────────────────

interface AjaxSuccessResponse {
  success: true;
  data?: unknown;
}

interface AjaxErrorResponse {
  success: false;
  data?: unknown | Array<{ code: string; message: string; data: unknown }>;
}

type AjaxResponse = AjaxSuccessResponse | AjaxErrorResponse;

interface AjaxHelpers {
  wpSendJson(data: unknown, statusCode?: number): never;
  wpSendJsonSuccess(data?: unknown, statusCode?: number): never;
  wpSendJsonError(data?: unknown, statusCode?: number): never;
}

// ─── Admin Bar ───────────────────────────────────────────────────────────────

interface AdminBarNodeMeta {
  html?: string;
  class?: string;
  rel?: string;
  lang?: string;
  dir?: string;
  onclick?: string;
  target?: string;
  title?: string;
  tabindex?: number;
  menu_title?: string;
}

interface AdminBarNodeArgs {
  id: string;
  title?: string;
  parent?: string | false;
  href?: string | false;
  group?: boolean;
  meta?: AdminBarNodeMeta;
}

interface WPAdminBar {
  addNode(args: AdminBarNodeArgs): void;
  removeNode(id: string): void;
  getNode(id: string): AdminBarNodeArgs | undefined;
  getNodes(): Record<string, AdminBarNodeArgs>;
  addMenu(node: AdminBarNodeArgs): void;   // alias for addNode
  removeMenu(id: string): void;            // alias for removeNode
  render(): void;
}

// ─── Admin Notices ───────────────────────────────────────────────────────────

type NoticeType = 'success' | 'warning' | 'error' | 'info';

interface AdminNotice {
  type: NoticeType;
  message: string;
  isDismissible?: boolean;
}

// HTML structure:
// <div class="notice notice-{type} [is-dismissible]"><p>{message}</p></div>
```

---

## 12. Design Patterns to Carry Over

1. **Not a router — each screen is its own file.** The admin bootstrap does not dispatch to controllers. Every admin URL maps to a physical PHP file. The bootstrap layer handles auth, environment, and menu; the screen file handles page-specific logic. This is the opposite of MVC. Implications: each screen is independently testable, and there is no central URL-to-handler map to maintain.

2. **Two-phase page loading: `load-` then render.** The `load-{hook}` action fires before any HTML is sent. This is where permissions are checked, redirects happen, and screen setup (help tabs, screen options) is done. The render phase follows. Any system replicating this must maintain the same separation — a "before headers" phase and an "after headers" phase.

3. **Hook suffix as the universal screen identifier.** `$hook_suffix` threads through bootstrap, screen identification, script enqueueing, and dynamic action names. It is the string that ties `load-{hook}`, `{hook}`, `WP_Screen::id`, and `manage_{screen}_columns` together. A re-implementation must maintain a single canonical screen identifier used consistently.

4. **Menu position as a sparse integer array.** The `$menu` global is indexed by position integer. Positions are not contiguous. Plugins insert at any integer. Collision resolution bumps the position forward. Core reserves specific positions (59, 60, 65, 70, 75, 80, 99). Replicating this requires a sorted, collision-aware insertion mechanism.

5. **`WP_Screen` is a registry-backed singleton per screen ID.** `WP_Screen::get()` returns an existing cached instance if the screen ID matches the current screen, or a new instance otherwise. There is at most one canonical current screen per request. Re-implementations should use a similar singleton-per-request pattern.

6. **`WP_List_Table` is a template method pattern.** The base class defines the rendering algorithm; subclasses supply data and column definitions. `prepare_items()` and `get_columns()` are the primary extension points. The base class handles all HTML rendering, sorting, pagination, and AJAX response formatting. This pattern means subclasses stay small — they only implement data fetching and column output.

7. **Column resolution dispatch chain.** `single_row_columns()` dispatches to `_column_{slug}()`, then `column_{slug}()`, then `column_default()`. The `_column_` prefix is for internal framework use (it passes extra arguments). Subclasses always implement the `column_{slug}` form. This layered dispatch allows the framework to inject row action links without the subclass needing to know about them.

8. **AJAX actions are hook-based, not method-based.** There is no AJAX controller class. Each action is a WordPress hook (`wp_ajax_{action}`) that any code can register a handler on. This means multiple plugins can share or extend AJAX endpoints using the priority system. A re-implementation should maintain this decoupling rather than using a central AJAX method registry.

9. **Admin bar nodes are a tree, not a flat list.** Nodes reference their parent by ID. The tree is assembled lazily during `admin_bar_menu` and rendered in one pass. Adding a node to a parent that does not exist yet works because the tree is assembled before rendering. This declarative approach — describe the tree structure, let the framework render it — avoids ordering dependencies.

10. **Notices are side effects, not return values.** Admin notices are output during the `admin_notices` action by functions that echo HTML. There is no notice accumulator API for standard notices (though `settings_errors()` provides one for settings-API notices). A re-implementation should consider whether centralized notice accumulation (queue + render) is preferable to the side-effect model.

11. **Screen options are stored per user, not per screen.** Screen option values (per-page counts, column visibility, layout columns) are stored in user meta via `update_user_option()`. They are keyed by the option name (often including the screen ID). This means each user has independent preferences, and preferences survive across sessions. The storage key format must be preserved for any system that shares user data with WordPress.

---

## 13. Tovu Reconstruction Notes

### 13.1 Why this exists

This layer exists to turn a pile of admin pages into a coherent operator environment. It standardizes authentication, screen identity, menu composition, page lifecycle, notices, list tables, and per-user admin preferences before any individual screen runs.

### 13.2 What Tovu should preserve

- A shared admin shell lifecycle with a "load/setup" phase before render
- One canonical screen identifier that ties navigation, permissions, assets, and preferences together
- A reusable operator framework for tables, notices, menus, and per-user screen preferences
- The distinction between shared admin infrastructure and page-specific business logic

### 13.3 What Tovu can simplify

- Tovu does not need file-per-screen routing to preserve the behavioral model
- Notices can be represented as queued state instead of side-effect HTML output
- List/table primitives can be modernized as long as they still provide extensible sorting, bulk actions, and column configuration

### 13.4 Possible Tovu seams

- `src/admin/shell/` for lifecycle, layout, and navigation composition
- `src/admin/screens/` for screen-specific modules on top of the shell
- `src/core/ports/AdminScreenRegistryPort.ts` for screen identity and registration
- `src/core/ports/UserPreferencePort.ts` for per-user admin UI state

### 13.5 Suggested priority

- `V1`: admin shell lifecycle, screen registry, menu composition, and user preferences
- `Later`: richer admin-bar parity and deeper list-table compatibility
