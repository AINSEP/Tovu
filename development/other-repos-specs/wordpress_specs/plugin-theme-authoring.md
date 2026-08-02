# Plugin and Theme Authoring — Specification

**Source files analyzed:**
- `wp-includes/plugin.php`
- `wp-admin/includes/plugin.php`
- `wp-includes/class-wp-theme.php`
- `wp-includes/theme.php`
- `wp-includes/widgets.php`
- `wp-includes/class-wp-widget.php`
- `wp-includes/blocks.php`
- `wp-includes/rest-api.php`
- `wp-includes/shortcodes.php`

---

## 1. Overview

WordPress extensions fall into two categories: **plugins** and **themes**. Both use exactly the same hook engine (actions and filters) as their integration mechanism. There is no required base class — a plugin can consist entirely of free functions. Themes add a structural layer through file conventions and template tags, but their `functions.php` file is also pure PHP with hook registrations.

**Core architectural properties:**

- The system is **event-driven**. WordPress fires named hooks at fixed points in its boot and request lifecycle. Plugins and themes register callbacks against those hooks.
- **No class inheritance is required** for plugins. A file containing `add_action('init', 'my_function')` is a fully valid plugin.
- **Header comments** in specific files declare plugin and theme metadata. WordPress scans the file system to discover plugins and themes by reading these headers.
- **Activation, deactivation, and uninstallation** are special lifecycle events that fire before or after the plugin is present in the active-plugins list.
- **Block themes** are detected by the presence of `templates/index.html`. Classic themes are detected by `index.php`. Both require `style.css`.

---

## 2. Plugin File Structure

### 2.1 Header Comment Block

WordPress reads the first 8 KB of each PHP file in the plugins directory. It uses `get_file_data()` to scan for a doc-comment block with `Key: Value` pairs on individual lines. The recognized header keys are:

| Comment field text      | Internal key        | Required | Notes |
|-------------------------|---------------------|----------|-------|
| `Plugin Name`           | `Name`              | Yes      | Must be present for the file to be recognized as a plugin |
| `Plugin URI`            | `PluginURI`         | No       | URL to plugin's homepage |
| `Description`           | `Description`       | No       | Single-line description |
| `Version`               | `Version`           | No       | Semantic version string |
| `Author`                | `Author`            | No       | Author display name |
| `Author URI`            | `AuthorURI`         | No       | URL to author's website |
| `Text Domain`           | `TextDomain`        | No       | i18n slug; falls back to plugin directory slug if absent |
| `Domain Path`           | `DomainPath`        | No       | Relative path to `.mo` files, e.g. `/languages` |
| `Network`               | `Network`           | No       | `"true"` string forces network-wide activation only |
| `Requires at least`     | `RequiresWP`        | No       | Minimum WordPress version |
| `Requires PHP`          | `RequiresPHP`       | No       | Minimum PHP version |
| `Update URI`            | `UpdateURI`         | No       | URI used as the plugin identifier for updates |
| `Requires Plugins`      | `RequiresPlugins`   | No       | Comma-separated list of dot-org plugin slugs that must be active |

The `Network` field is normalized: the raw string `"true"` (case-insensitive) is converted to a boolean `true`. All other fields remain strings.

A minimal valid plugin header:

```
/**
 * Plugin Name: My Plugin
 * Version: 1.0.0
 */
```

### 2.2 Single-file vs Directory Plugins

WordPress scans two levels deep in `wp-content/plugins/`:

1. **Single-file plugin**: A `.php` file directly in `wp-content/plugins/`. Example: `wp-content/plugins/hello.php`.
2. **Directory plugin**: A `.php` file one level inside a subdirectory of `wp-content/plugins/`. Example: `wp-content/plugins/my-plugin/my-plugin.php`. **Only one level of subdirectory is supported.** WordPress does not recursively scan deeper.

The convention is to name the main file after its containing directory (e.g., `my-plugin/my-plugin.php`), though this is not enforced.

### 2.3 Plugin Detection via `get_plugins()`

`get_plugins()` opens the plugins directory and reads all `.php` files at depth 0 (single-file) and depth 1 (directory plugins). For each file it calls `get_plugin_data()`, which calls `get_file_data()` against the header map. Files with an empty `Name` are silently skipped. Results are cached in the object cache under group `'plugins'`.

`get_file_data()` reads the first 8 KB of a file and extracts `Key: Value` pairs matching the provided header map. The colon-separated key must match exactly.

### 2.4 Path and URL Helpers

```typescript
// Returns the filesystem path to the directory containing the plugin file, with trailing slash.
function pluginDirPath(file: string): string;  // equivalent: path.dirname(file) + '/'

// Returns the public URL to the directory containing the plugin file, with trailing slash.
function pluginDirUrl(file: string): string;   // equivalent: pluginsUrl('', file) + '/'

// Returns the plugin's basename relative to the plugins directory.
// e.g. 'my-plugin/my-plugin.php'
function pluginBasename(file: string): string;
```

The PHP idiom `plugin_dir_path(__FILE__)` and `plugin_dir_url(__FILE__)` is how plugins resolve their own paths at runtime. In a TypeScript port, `__FILE__` is equivalent to the module's `import.meta.url` or `__dirname`.

### 2.5 Conditional Loading Patterns

Plugins frequently gate functionality behind context checks:

```typescript
// Admin-only functionality
if (isAdmin()) {
  addAction('admin_menu', registerMyAdminPages);
  addAction('admin_init', registerMySettings);
}

// Frontend-only functionality
if (!isAdmin()) {
  addAction('wp_enqueue_scripts', enqueueMyScripts);
}

// AJAX handlers (run in admin context even from frontend requests)
addAction('wp_ajax_my_action', handleMyAjaxLoggedIn);
addAction('wp_ajax_nopriv_my_action', handleMyAjaxPublic);
```

---

## 3. Plugin Lifecycle Hooks

### 3.1 `register_activation_hook($file, $callback)`

Registers a callback to run when the plugin is activated. Implemented by hooking into `'activate_{plugin-basename}'`.

**What to do on activation:**
- Create custom database tables using `$wpdb->query()` with `dbDelta()` for safe schema migration.
- Set default options using `add_option()` (not `update_option()`, to avoid overwriting existing values).
- Flush rewrite rules: call `flush_rewrite_rules()`. **Do not call this on every request**; call it only on activation and deactivation.
- Store a version option to enable update detection later.

```typescript
registerActivationHook(__FILE__, function() {
  addOption('my_plugin_version', '1.0.0');
  addOption('my_plugin_settings', { enabled: true });
  flushRewriteRules();
});
```

The callback receives one argument: `$network_wide` (boolean), which is `true` when activated network-wide on multisite.

### 3.2 `register_deactivation_hook($file, $callback)`

Registers a callback to run when the plugin is deactivated. Implemented by hooking into `'deactivate_{plugin-basename}'`.

**What to do on deactivation:**
- Flush rewrite rules (removes the plugin's rewrite rules from the cache).
- Clear any scheduled cron events added by the plugin: `wp_clear_scheduled_hook('my_plugin_cron_event')`.
- **Do NOT delete data.** Deleting user data on deactivation is unexpected. Reserve data deletion for uninstall.

```typescript
registerDeactivationHook(__FILE__, function() {
  wpClearScheduledHook('my_plugin_daily_task');
  flushRewriteRules();
});
```

### 3.3 `register_uninstall_hook($file, $callback)` vs `uninstall.php`

**Two patterns exist:**

**Pattern A — `register_uninstall_hook()`**: Registers a static function or plain function to be called when the user clicks "Delete" for the plugin. The callback is stored in the `'uninstall_plugins'` site option (not autoloaded). Instance methods on objects cannot be used; only static methods or plain functions are allowed (enforced at registration time).

**Pattern B — `uninstall.php`**: A file named exactly `uninstall.php` placed in the plugin's root directory. When it exists, WordPress includes it during uninstallation instead of calling the registered hook callback. This file **must** check for the `WP_UNINSTALL_PLUGIN` constant before executing any code:

```php
// uninstall.php
if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}
// Delete options, custom tables, etc.
delete_option('my_plugin_version');
```

**Which to use:** Prefer `uninstall.php` when the uninstall logic is complex, needs to require other files, or when the code outside of functions in the plugin file would execute during uninstall (which is the case because WordPress must include the main plugin file to call the hook callback).

**What to do on uninstall:**
- Delete all plugin options: `delete_option()`, `delete_site_option()`.
- Drop custom database tables: `$wpdb->query("DROP TABLE IF EXISTS {$wpdb->prefix}my_table")`.
- Delete all custom post type posts if the data is plugin-specific.
- Delete user meta added by the plugin.

### 3.4 Plugin Update Detection

WordPress has no built-in plugin-update lifecycle hook. The pattern is:

1. On activation, store the current version in an option: `add_option('my_plugin_version', '1.0.0')`.
2. On every request (typically hooked to `'init'` or `'plugins_loaded'`), compare the stored version to the current version constant.
3. If the versions differ, run the upgrade routine, then update the stored version.

```typescript
addAction('plugins_loaded', function() {
  const storedVersion = getOption('my_plugin_version', '0.0.0');
  if (storedVersion !== MY_PLUGIN_VERSION) {
    runUpgradeRoutine(storedVersion, MY_PLUGIN_VERSION);
    updateOption('my_plugin_version', MY_PLUGIN_VERSION);
  }
});
```

### 3.5 Network Activation (Multisite)

When `Network: true` is declared in the plugin header, the plugin can only be activated network-wide. The activation callback receives `$network_wide = true`.

For network-active plugins that need per-site setup:
- Hook into `'wpmu_new_blog'` to set up data when a new site is created.
- On activation, iterate over all sites using `get_sites()` and call `switch_to_blog()` / `restore_current_blog()` to set up each one.

---

## 4. Adding Functionality via Hooks

### 4.1 Three Callback Patterns

**Pattern 1 — Named function:**
```typescript
function myPluginFilterTitle(title: string): string {
  return `[Prefix] ${title}`;
}
addFilter('the_title', 'my_plugin_filter_title');
```

**Pattern 2 — Class method (instance):**
```typescript
class MyPlugin {
  constructor() {
    addAction('init', [this, 'onInit']);
    addFilter('the_content', [this, 'filterContent'], 10, 1);
  }
  onInit(): void { /* ... */ }
  filterContent(content: string): string { return content; }
}
new MyPlugin();
```

**Pattern 3 — Closure:**
```typescript
addFilter('the_title', (title: string) => `[Prefix] ${title}`);
```

Closures have a memory implication: the closure object persists in the filter registry for the lifetime of the request, preventing garbage collection of any variables captured in its scope. For hooks that are added and removed dynamically, using closures makes `remove_filter` impossible unless a reference to the closure is kept.

### 4.2 Priority Best Practices

Default priority is `10`. The full integer range is valid. Common conventions:

| Priority | Use case |
|----------|----------|
| `1` | Must run before nearly everything |
| `9` | Just before default priority |
| `10` | Default — use when order does not matter |
| `11` | Just after default priority |
| `20` | Late processing, after most plugins have run |
| `99` | Very late; almost last |
| `PHP_INT_MAX` | Last possible (avoid unless you truly need it) |

Negative priorities are valid and execute before priority 0.

### 4.3 Removing Hooks

`remove_filter()` and `remove_action()` require the **exact same callback reference and priority** used when the hook was added. If the priority does not match, removal silently fails.

```typescript
// This works — same callback reference and priority
addFilter('the_title', myCallback, 15);
removeFilter('the_title', myCallback, 15);  // must pass 15, not 10

// This fails silently — closures are unique objects
addFilter('the_title', (t) => t + '!');
removeFilter('the_title', (t) => t + '!');  // different object, removal fails
```

To remove a core hook (or another plugin's hook), you must know the exact priority it was registered at. This requires reading the source or documentation. No warning is given on removal failure.

`remove_all_filters(hookName)` removes every callback from a hook regardless of priority. `remove_all_filters(hookName, priority)` removes only callbacks at that specific priority.

### 4.4 Class-Based Registration Patterns

**Constructor registration (most common):**
```typescript
class MyFeature {
  constructor() {
    addAction('wp_enqueue_scripts', [this, 'enqueueScripts']);
    addFilter('the_content', [this, 'processContent'], 10, 1);
  }
}
// Instantiate once; the constructor wires up all hooks.
new MyFeature();
```

**Static method registration:**
```typescript
class MyPlugin {
  static init(): void {
    addAction('init', [MyPlugin, 'registerPostTypes']);
  }
  static registerPostTypes(): void { /* ... */ }
}
MyPlugin.init();
```

**Late-binding pattern** — using `'plugins_loaded'` to instantiate the class after all plugins have loaded, ensuring dependencies are available:
```typescript
addAction('plugins_loaded', function() {
  new MyPlugin();
});
```

---

## 5. Extending the Admin

### 5.1 `add_menu_page()` — Top-level Admin Menu

```typescript
function addMenuPage(
  pageTitle: string,    // HTML title of the page (goes in <title>)
  menuTitle: string,    // Text shown in the menu sidebar
  capability: string,   // Required capability, e.g. 'manage_options'
  menuSlug: string,     // Unique slug for the page URL: ?page={slug}
  callback: () => void, // Function that outputs the page HTML
  iconUrl: string,      // URL to icon image, or a dashicon slug like 'dashicons-admin-generic', or 'none'
  position: number,     // Position in the menu order; null for default
): string;              // Returns the hook suffix for use with load-{suffix} action
```

Common `capability` values: `'manage_options'` (administrator), `'edit_posts'`, `'publish_posts'`, `'read'`.

Must be called on the `'admin_menu'` action hook.

### 5.2 `add_submenu_page()` — Submenu Page

```typescript
function addSubmenuPage(
  parentSlug: string,   // Slug of the parent menu, e.g. 'options-general.php', 'tools.php', or custom slug
  pageTitle: string,
  menuTitle: string,
  capability: string,
  menuSlug: string,
  callback: () => void,
  position?: number,
): string | false;
```

### 5.3 Shortcut Functions for Built-in Menus

All of these call `add_submenu_page()` with the appropriate parent slug:

| Function | Parent slug | Default capability |
|---|---|---|
| `add_options_page()` | `options-general.php` | `manage_options` |
| `add_management_page()` | `tools.php` | `manage_options` |
| `add_theme_page()` | `themes.php` | `edit_theme_options` |
| `add_plugins_page()` | `plugins.php` | `activate_plugins` |
| `add_dashboard_page()` | `index.php` | `read` |
| `add_posts_page()` | `edit.php` | `edit_posts` |
| `add_media_page()` | `upload.php` | `upload_files` |
| `add_comments_page()` | `edit-comments.php` | `moderate_comments` |

Each has the same signature as `add_submenu_page()` but without the `parentSlug` parameter.

### 5.4 `add_meta_box()` — Post Edit Boxes

```typescript
function addMetaBox(
  id: string,                  // Unique HTML id for the meta box
  title: string,               // Title displayed in the box header
  callback: (post: WP_Post, args: { id: string; title: string; args: unknown }) => void,
  screen: string | string[] | null,  // Post type slug(s), or null for current screen
  context: 'normal' | 'side' | 'advanced',  // Column placement
  priority: 'high' | 'core' | 'default' | 'low',
  callbackArgs?: unknown,      // Passed as args['args'] to the callback
): void;
```

The callback receives the `WP_Post` object and a meta box definition array. Output HTML directly from the callback. Include a nonce for security:

```php
wp_nonce_field('my_meta_box_save', 'my_meta_box_nonce');
```

Save meta box data on `'save_post'` action, verifying the nonce:
```php
add_action('save_post', function($postId) {
    if (!isset($_POST['my_meta_box_nonce']) ||
        !wp_verify_nonce($_POST['my_meta_box_nonce'], 'my_meta_box_save')) {
        return;
    }
    update_post_meta($postId, '_my_field', sanitize_text_field($_POST['my_field']));
});
```

### 5.5 `admin_enqueue_scripts` — Scoped Admin Script Loading

The `'admin_enqueue_scripts'` action receives the current admin page's hook suffix. Use it to conditionally enqueue assets:

```typescript
addAction('admin_enqueue_scripts', function(hookSuffix: string) {
  // Only load on our plugin's settings page
  if (hookSuffix !== 'settings_page_my-plugin') return;

  wpEnqueueScript(
    'my-plugin-admin',
    pluginDirUrl(__FILE__) + 'js/admin.js',
    ['jquery'],
    '1.0.0',
    true  // in footer
  );
  wpEnqueueStyle('my-plugin-admin', pluginDirUrl(__FILE__) + 'css/admin.css');
});
```

The hook suffix for a page created with `add_options_page('My Plugin', ..., 'my-plugin', ...)` will be `'settings_page_my-plugin'`.

### 5.6 Settings API

The Settings API provides a structured way to register, save, and render plugin settings. Three functions work together:

**`register_setting($optionGroup, $optionName, $args)`**

```typescript
function registerSetting(
  optionGroup: string,     // Name of the options group; must match the form's $option_group
  optionName: string,      // The option name in wp_options
  args?: {
    type?: 'string' | 'boolean' | 'integer' | 'number' | 'array' | 'object';
    description?: string;
    sanitize_callback?: (value: unknown) => unknown;
    show_in_rest?: boolean;
    default?: unknown;
  }
): void;
```

**`add_settings_section($id, $title, $callback, $page)`**

```typescript
function addSettingsSection(
  id: string,               // Section slug
  title: string,            // Section heading
  callback: () => void,     // Outputs section description HTML
  page: string,             // Page slug where this section appears
): void;
```

**`add_settings_field($id, $title, $callback, $page, $section, $args)`**

```typescript
function addSettingsField(
  id: string,
  title: string,            // Label text
  callback: (args: Record<string, unknown>) => void,  // Outputs the field HTML
  page: string,
  section?: string,         // Section id; default 'default'
  args?: {
    label_for?: string;     // Sets the `for` attribute on the label
    class?: string;
    [key: string]: unknown; // Any additional args passed to callback
  }
): void;
```

Registration occurs on `'admin_init'`. Rendering uses `settings_fields($optionGroup)` and `do_settings_sections($page)` inside a `<form method="post" action="options.php">`.

### 5.7 `plugin_action_links_{plugin-file}` Filter

Adds links to the row of action links beneath a plugin's name on the Plugins list screen:

```typescript
addFilter(
  `plugin_action_links_${pluginBasename(__FILE__)}`,
  function(links: string[]): string[] {
    const settingsLink = `<a href="${adminUrl('options-general.php?page=my-plugin')}">Settings</a>`;
    links.unshift(settingsLink);
    return links;
  }
);
```

The filter name's dynamic portion is the plugin basename relative to the plugins directory, with slashes preserved (e.g., `'my-plugin/my-plugin.php'`).

### 5.8 Admin Notices

Hook into `'admin_notices'` to display notices at the top of admin pages:

```typescript
addAction('admin_notices', function() {
  echo `<div class="notice notice-success is-dismissible">
    <p>Settings saved.</p>
  </div>`;
});
```

CSS classes for the notice container:

| Class | Meaning |
|---|---|
| `notice-success` | Green — success |
| `notice-error` | Red — error |
| `notice-warning` | Yellow — warning |
| `notice-info` | Blue — informational |
| `is-dismissible` | Adds an X button; requires the `wp-a11y` script |

For persistent conditional notices (e.g., "please configure the plugin"), store a flag in a transient or option, check it in the notice callback, and delete the flag once acknowledged.

---

## 6. Extending Post Types and Taxonomies

### 6.1 `register_post_type($postType, $args)`

Must be called on the `'init'` action.

```typescript
function registerPostType(
  postType: string,  // Max 20 chars, lowercase, no spaces. Avoid reserved types (post, page, attachment, revision, nav_menu_item, etc.)
  args: RegisterPostTypeArgs
): WP_Post_Type | WP_Error;
```

```typescript
interface RegisterPostTypeArgs {
  // Labels
  labels?: {
    name: string;                     // General name, plural. e.g. 'Books'
    singular_name: string;            // Singular name. e.g. 'Book'
    add_new: string;                  // e.g. 'Add New'
    add_new_item: string;             // e.g. 'Add New Book'
    edit_item: string;                // e.g. 'Edit Book'
    new_item: string;                 // e.g. 'New Book'
    view_item: string;                // e.g. 'View Book'
    view_items: string;               // e.g. 'View Books'
    search_items: string;             // e.g. 'Search Books'
    not_found: string;                // e.g. 'No books found'
    not_found_in_trash: string;       // e.g. 'No books found in Trash'
    parent_item_colon?: string;       // For hierarchical types, e.g. 'Parent Page:'
    all_items: string;                // e.g. 'All Books'
    archives: string;                 // e.g. 'Book Archives'
    attributes: string;               // e.g. 'Book Attributes'
    insert_into_item: string;         // e.g. 'Insert into book'
    uploaded_to_this_item: string;    // e.g. 'Uploaded to this book'
    featured_image: string;
    set_featured_image: string;
    remove_featured_image: string;
    use_featured_image: string;
    menu_name: string;
    filter_items_list: string;
    filter_by_date: string;
    items_list_navigation: string;
    items_list: string;
    item_published: string;
    item_published_privately: string;
    item_reverted_to_draft: string;
    item_trashed: string;
    item_scheduled: string;
    item_updated: string;
    item_link: string;
    item_link_description: string;
  };

  // Visibility
  public?: boolean;             // Default false. Shorthand for publicly_queryable, show_ui, show_in_nav_menus, show_in_admin_bar
  publicly_queryable?: boolean; // Whether queries can be performed on the front end. Default: value of public
  show_ui?: boolean;            // Whether to show admin UI. Default: value of public
  show_in_menu?: boolean | string; // Show in admin menu. true, false, or parent menu slug
  show_in_nav_menus?: boolean;  // Whether available for selection in nav menus. Default: value of public
  show_in_admin_bar?: boolean;  // Whether to include in the WP admin bar. Default: value of show_in_menu
  show_in_rest?: boolean;       // Expose via REST API; required for Gutenberg editor support. Default false
  rest_base?: string;           // REST API route slug. Default: post type key
  rest_namespace?: string;      // REST API namespace. Default: 'wp/v2'
  rest_controller_class?: string; // Controller class. Default: 'WP_REST_Posts_Controller'

  // Query behavior
  query_var?: boolean | string; // Query var. true = post type name, string = custom name. Default: value of public
  rewrite?: boolean | {
    slug?: string;              // URL prefix. Default: post type key
    with_front?: boolean;       // Whether to prepend the permalink structure front base. Default true
    feeds?: boolean;
    pages?: boolean;
    ep_mask?: number;
  };

  // Capabilities
  capability_type?: string | [string, string]; // Used to build capability names. Default 'post'. Use ['book', 'books'] for custom caps
  capabilities?: Record<string, string>;       // Map of capability names
  map_meta_cap?: boolean;       // Whether to use meta capability mapping. Default false

  // Structure
  hierarchical?: boolean;       // Posts can have parent/child relationships (like Pages). Default false
  supports?: string[];          // Features: 'title', 'editor', 'author', 'thumbnail', 'excerpt', 'trackbacks', 'custom-fields', 'comments', 'revisions', 'page-attributes', 'post-formats'
  register_meta_box_cb?: () => void; // Called when setting up meta boxes
  taxonomies?: string[];        // Taxonomies to initially register with this post type
  has_archive?: boolean | string; // Enable archive. true = post type slug, string = custom slug. Default false
  menu_position?: number;       // Position in admin menu. 5=below Posts, 10=below Media, 15=below Links, 20=below Pages, 25=below Comments, 60+=below first separator
  menu_icon?: string;           // Dashicon slug or URL
  delete_with_user?: boolean;   // Whether posts of this type should be deleted on user deletion. Default null

  // Template (block editor)
  template?: unknown[][];       // Default block template
  template_lock?: false | 'all' | 'insert' | 'contentOnly'; // Block template locking
}
```

### 6.2 `register_taxonomy($taxonomy, $objectType, $args)`

```typescript
function registerTaxonomy(
  taxonomy: string,             // Max 32 chars, lowercase
  objectType: string | string[], // Post type(s) to attach to
  args: RegisterTaxonomyArgs
): WP_Taxonomy | WP_Error;
```

```typescript
interface RegisterTaxonomyArgs {
  labels?: {
    name: string;
    singular_name: string;
    search_items: string;
    popular_items?: string;       // Non-hierarchical only
    all_items: string;
    parent_item?: string;         // Hierarchical only
    parent_item_colon?: string;   // Hierarchical only
    edit_item: string;
    view_item: string;
    update_item: string;
    add_new_item: string;
    new_item_name: string;
    separate_items_with_commas?: string; // Non-hierarchical only
    add_or_remove_items?: string;        // Non-hierarchical only
    choose_from_most_used?: string;      // Non-hierarchical only
    not_found: string;
    no_terms: string;
    filter_by_item?: string;
    items_list_navigation: string;
    items_list: string;
    most_used: string;
    back_to_items: string;
    item_link: string;
    item_link_description: string;
  };

  hierarchical?: boolean;           // true = categories (parent/child), false = tags (free-form). Default false
  public?: boolean;                 // Default true
  publicly_queryable?: boolean;     // Default: value of public
  show_ui?: boolean;                // Default: value of public
  show_in_menu?: boolean;           // Default: value of show_ui
  show_in_nav_menus?: boolean;      // Default: value of public
  show_in_rest?: boolean;           // Expose via REST API. Default false
  rest_base?: string;               // REST route slug
  rest_namespace?: string;
  rest_controller_class?: string;
  show_tagcloud?: boolean;          // Whether to show in tag cloud widget. Default: value of show_ui
  show_in_quick_edit?: boolean;     // Default: value of show_ui
  show_admin_column?: boolean;      // Show column on post list table. Default false
  meta_box_cb?: callable | false;   // Custom meta box callback. false disables the meta box
  meta_box_sanitize_cb?: callable;
  capabilities?: {
    manage_terms?: string;
    edit_terms?: string;
    delete_terms?: string;
    assign_terms?: string;
  };
  rewrite?: boolean | {
    slug?: string;
    with_front?: boolean;
    hierarchical?: boolean;
    ep_mask?: number;
  };
  query_var?: boolean | string;     // Default: taxonomy key
  update_count_callback?: callable;
  default_term?: string | { name: string; slug: string; description: string; };
  sort?: boolean;                   // Whether terms are sortable in the admin
  args?: unknown[];                  // Arguments to pass to wp_get_object_terms()
}
```

---

## 7. Shortcodes

### 7.1 `add_shortcode($tag, $callback)`

Registers a shortcode handler. The `$tag` must not contain spaces or the characters `& / < > [ ] =`.

```typescript
type ShortcodeCallback = (
  atts: Record<string, string> | string[],  // Parsed attributes; string[] if no attributes at all
  content: string | null,                    // Enclosed content for enclosing shortcodes; null for self-closing
  tag: string                                // The shortcode tag name
) => string;  // Must return a string — do not echo
```

### 7.2 Self-closing vs Enclosing Shortcodes

**Self-closing**: `[my-shortcode attr="value" /]` or `[my-shortcode attr="value"]`
- `content` is `null` in the callback.

**Enclosing**: `[my-shortcode]inner content[/my-shortcode]`
- `content` contains the raw string between the tags.
- To process nested shortcodes in the content: call `doShortcode(content)` inside the callback.

### 7.3 `shortcode_atts($defaults, $atts, $tag)` — Attribute Normalization

Merges user-supplied attributes with defaults. Unknown attributes in `$atts` are stripped. Attribute names are lowercased.

```typescript
function shortcodeAtts(
  defaults: Record<string, unknown>,
  atts: Record<string, string> | string[],
  tag?: string  // Used for the 'shortcode_atts_{tag}' filter
): Record<string, unknown>;

// Example usage:
function myShortcode(atts, content, tag) {
  const a = shortcodeAtts({ color: 'blue', size: 'medium' }, atts, tag);
  return `<div style="color:${a.color}">${content}</div>`;
}
```

### 7.4 `do_shortcode($content)`

Parses and executes all shortcodes found in a string. Called automatically on `the_content` filter. Safe to call manually on arbitrary strings.

### 7.5 Other Shortcode Functions

- `remove_shortcode($tag)` — unregisters a shortcode.
- `remove_all_shortcodes()` — clears all registered shortcodes.
- `has_shortcode($content, $tag)` — returns `true` if content contains the specified shortcode (including in nested shortcodes).
- `shortcode_exists($tag)` — returns `true` if a shortcode with that tag is registered.

---

## 8. Widgets (Legacy)

Widgets are the pre-block-editor widget system. They are registered as PHP classes extending `WP_Widget`.

### 8.1 Extending `WP_Widget`

Three methods must be implemented:

**`widget($args, $instance)`** — Renders the widget on the frontend. `$args` contains the sidebar's wrapper HTML. `$instance` contains this widget's stored settings.

```typescript
widget(args: SidebarArgs, instance: Record<string, unknown>): void {
  // Must echo output, not return it
  echo args.before_widget;
  if (instance.title) {
    echo args.before_title + applyFilters('widget_title', instance.title) + args.after_title;
  }
  echo '<p>' + instance.text + '</p>';
  echo args.after_widget;
}
```

**`form($instance)`** — Renders the settings form in the admin Widgets screen. Must use `get_field_name()` and `get_field_id()` to generate input names and IDs.

```typescript
form(instance: Record<string, unknown>): void {
  const title = instance.title ?? '';
  const fieldId = this.getFieldId('title');
  const fieldName = this.getFieldName('title');
  echo `<p>
    <label for="${fieldId}">Title:</label>
    <input class="widefat" id="${fieldId}" name="${fieldName}" type="text" value="${escAttr(title)}">
  </p>`;
}
```

**`update($newInstance, $oldInstance)`** — Sanitizes and returns the new settings to save. Return `false` to cancel saving.

```typescript
update(newInstance: Record<string, string>, oldInstance: Record<string, unknown>): Record<string, unknown> {
  return {
    title: stripTags(newInstance.title),
  };
}
```

### 8.2 Constructor Pattern

```typescript
constructor() {
  super(
    'my-widget',           // id_base: unique lowercase identifier
    'My Widget',           // name: human-readable display name
    {                      // widget_options
      description: 'A short description shown under the widget name in the admin.',
      classname: 'my-widget',  // CSS class on the widget container <li>
      customize_selective_refresh: true,
    },
    {                      // control_options (rarely needed)
      width: 400,
      height: 350,
    }
  );
}
```

The `id_base` is lowercased internally. The `option_name` (used to store settings in `wp_options`) is automatically set to `'widget_{id_base}'`.

### 8.3 Registration

```typescript
addAction('widgets_init', function() {
  registerWidget('MyWidgetClass');
  // Or pass an instance:
  registerWidget(new MyWidgetClass());
});
```

`register_widget()` calls `$wp_widget_factory->register()`, which instantiates the class and registers all existing instances by reading saved settings from the option.

### 8.4 Settings Storage

Settings for all instances of a widget type are stored in a single option keyed by `'widget_{id_base}'`. The option value is an array keyed by instance number. The key `'_multiwidget'` is a marker value (value `1`) and is always present:

```
{
  1: { title: 'First Instance', text: 'Hello' },
  2: { title: 'Second Instance', text: 'World' },
  _multiwidget: 1
}
```

Do not interact with this option directly. Use `get_settings()` and `save_settings()` inherited from `WP_Widget`, or use `get_option()`/`update_option()` for storing state outside of the instance array.

---

## 9. Block Authoring (Server-side)

### 9.1 When PHP Block Registration Is Needed

- **Dynamic blocks**: the block's HTML output is computed at render time from current data (database queries, user state, etc.) rather than being stored statically.
- **Server-side rendering**: the `render_callback` PHP function runs on every page load that includes the block, producing fresh HTML.
- **Block metadata registration**: registering a block's script/style handles from PHP so they can be enqueued.

For purely static blocks that produce the same HTML every time, no PHP is needed — register the block only in JavaScript.

### 9.2 `register_block_type()` and `register_block_type_from_metadata()`

`register_block_type()` accepts:
1. A block type name string (`'namespace/block-name'`) — registers from scratch with `$args`.
2. A path to a directory containing `block.json` or a path directly to `block.json` — delegates to `register_block_type_from_metadata()`.
3. A `WP_Block_Type` instance.

`register_block_type_from_metadata()` is the preferred method. It reads `block.json` and:
- Registers script and style handles from the `editorScript`, `script`, `viewScript`, `editorStyle`, `style`, `viewStyle` fields.
- Automatically generates handle names from the block name and field name.
- Processes the `render` field (path to a PHP template file) into a `render_callback`.
- Processes the `variations` field (if it is a path to a PHP file) into a `variation_callback`.
- Applies the `block_type_metadata` filter before processing and `block_type_metadata_settings` filter after.

Script/style field formats in `block.json`:
- `"file:./editor.js"` — path relative to block.json directory. WordPress auto-generates a handle and registers the script.
- `"my-registered-handle"` — an already-registered script handle. WordPress uses it as-is.

### 9.3 Dynamic Block `render_callback`

```typescript
type BlockRenderCallback = (
  attributes: Record<string, unknown>,  // Block attributes from the editor
  content: string,                       // Inner blocks HTML (for blocks with `InnerBlocks`)
  block: WP_Block                        // Full block instance object
) => string;                             // Must return HTML string
```

Registration example:
```typescript
registerBlockType('my-plugin/my-block', {
  render_callback: (attributes, content, block) => {
    const title = attributes.title ?? '';
    const wrapperAttributes = getBlockWrapperAttributes();
    return `<div ${wrapperAttributes}><h2>${escHtml(title)}</h2>${content}</div>`;
  }
});
```

### 9.4 `get_block_wrapper_attributes($extraAttributes)`

Returns a string of HTML attributes for the block's outer wrapper element. Merges the block's `className`, `style`, and any attributes from `block.json`'s `supports` field (e.g., `spacing`, `color`) with any extra attributes passed in:

```typescript
function getBlockWrapperAttributes(
  extraAttributes?: Record<string, string>
): string;
// Returns: 'class="wp-block-my-plugin-my-block has-background" style="background-color: #ff0"'
```

Call this inside a `render_callback` only; it relies on a global block instance context.

### 9.5 Block Registration Hooks

Always register blocks on the `'init'` action:

```typescript
addAction('init', function() {
  registerBlockType(pluginDirPath(__FILE__) + 'blocks/my-block/');
});
```

Or use `register_block_type_from_metadata()` directly for clarity.

### 9.6 `block.json` Key Fields Reference

```json
{
  "apiVersion": 3,
  "name": "my-plugin/my-block",
  "version": "1.0.0",
  "title": "My Block",
  "category": "text",
  "icon": "smiley",
  "description": "A brief description.",
  "keywords": ["keyword1", "keyword2"],
  "textdomain": "my-plugin",
  "attributes": {
    "title": { "type": "string", "default": "" }
  },
  "supports": { "html": false, "color": { "background": true } },
  "editorScript": "file:./index.js",
  "editorStyle": "file:./index.css",
  "style": "file:./style.css",
  "viewScript": "file:./view.js",
  "render": "file:./render.php"
}
```

---

## 10. REST API Extensions

### 10.1 `register_rest_route()` — Custom Endpoints

Must be called on the `'rest_api_init'` action. All routes **must** have a namespace (format: `my-plugin/v1`).

```typescript
function registerRestRoute(
  namespace: string,    // Plugin-specific namespace, e.g. 'my-plugin/v1'. No leading/trailing slashes.
  route: string,        // Route relative to namespace, e.g. '/items' or '/items/(?P<id>[\d]+)'
  args: RestRouteArgs | RestRouteArgs[],
  override?: boolean    // Whether to override existing route. Default false
): boolean;
```

```typescript
interface RestRouteArgs {
  methods: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | string;  // Or WP_REST_Server constant
  callback: (request: WP_REST_Request) => WP_REST_Response | WP_Error | mixed;
  permission_callback: (request: WP_REST_Request) => boolean | WP_Error;  // Required since WP 5.5. Use () => true for public routes
  args?: Record<string, RestArgDefinition>;
}

interface RestArgDefinition {
  type?: 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  required?: boolean;
  default?: unknown;
  validate_callback?: (value: unknown, request: WP_REST_Request, param: string) => boolean | WP_Error;
  sanitize_callback?: (value: unknown, request: WP_REST_Request, param: string) => unknown;
}
```

Example:
```typescript
addAction('rest_api_init', function() {
  registerRestRoute('my-plugin/v1', '/items', {
    methods: 'GET',
    callback: getItems,
    permission_callback: () => currentUserCan('read'),
    args: {
      per_page: { type: 'integer', default: 10, sanitize_callback: absInt },
    }
  });

  registerRestRoute('my-plugin/v1', '/items/(?P<id>[\\d]+)', {
    methods: 'GET',
    callback: getItem,
    permission_callback: () => true,  // public
  });
});
```

### 10.2 `register_rest_field()` — Adding Fields to Existing Endpoints

Adds a custom field to the response of an existing REST API object type. Must be called on `'rest_api_init'`.

```typescript
function registerRestField(
  objectType: string | string[],  // 'post', 'page', 'user', 'comment', 'term', or any custom post type slug
  attribute: string,               // The field name in the response
  args: {
    get_callback?: ((
      object: Record<string, unknown>,  // The prepared object (post, user, etc.)
      fieldName: string,
      request: WP_REST_Request,
      objectType: string
    ) => unknown) | null;

    update_callback?: ((
      value: unknown,
      object: unknown,              // The raw model object (WP_Post, WP_User, etc.)
      fieldName: string,
      request: WP_REST_Request,
      objectType: string
    ) => true | WP_Error) | null;

    schema?: {
      description?: string;
      type?: string;
      context?: string[];
      [key: string]: unknown;
    } | null;
  }
): void;
```

Setting `get_callback` to `null` means the field is write-only (not returned). Setting `update_callback` to `null` means the field is read-only. Setting `schema` to `null` means the field will not appear in the schema endpoint.

### 10.3 Custom REST Controller

For complex endpoints, extend `WP_REST_Controller`:

```typescript
class MyRestController extends WP_REST_Controller {
  constructor() {
    super();
    this.namespace = 'my-plugin/v1';
    this.rest_base = 'items';
  }

  registerRoutes(): void {
    registerRestRoute(this.namespace, `/${this.rest_base}`, [
      {
        methods: WP_REST_Server.READABLE,
        callback: [this, 'getItems'],
        permission_callback: [this, 'getItemsPermissionsCheck'],
        args: this.getCollectionParams(),
      },
      { schema: [this, 'getPublicItemSchema'] }
    ]);
  }

  getItems(request: WP_REST_Request): WP_REST_Response | WP_Error { /* ... */ }
  getItemsPermissionsCheck(request: WP_REST_Request): boolean { return true; }
}

addAction('rest_api_init', function() {
  const controller = new MyRestController();
  controller.registerRoutes();
});
```

---

## 11. Theme File Structure

### 11.1 Required Files

**Classic theme (PHP-based):**
- `style.css` — required; contains theme header comment.
- `index.php` — required; the fallback template.

**Block theme (HTML-template-based):**
- `style.css` — required; contains theme header comment.
- `templates/index.html` — required; the fallback block template. A theme is identified as a block theme by the presence of this file (or the deprecated `block-templates/index.html`).

### 11.2 `functions.php`

Loaded by WordPress during `wp_settings.php` after all plugins have loaded, before the theme's templates run. It executes on every request (both frontend and admin) whenever the theme is active. For child themes, the child's `functions.php` loads **before** the parent's `functions.php`.

`functions.php` should contain:
- `add_theme_support()` calls.
- `register_nav_menus()` calls.
- `register_sidebar()` calls.
- `add_image_size()` calls.
- `load_theme_textdomain()` call.
- Enqueue hooks (`'wp_enqueue_scripts'`).
- Any custom functions used by templates.

Do not place template output code directly in `functions.php`. Keep it to hook registrations and function definitions.

### 11.3 `style.css` Theme Header

The first `8 KB` of `style.css` is parsed by `WP_Theme` using `get_file_data()` against this header map:

| Comment field text  | Internal key   | Notes |
|---------------------|----------------|-------|
| `Theme Name`        | `Name`         | Required; must be unique |
| `Theme URI`         | `ThemeURI`     | URL to theme homepage |
| `Author`            | `Author`       | Author display name |
| `Author URI`        | `AuthorURI`    | URL to author page |
| `Description`       | `Description`  | Single paragraph description |
| `Version`           | `Version`      | Version string |
| `License`           | (not extracted) | License name |
| `License URI`       | (not extracted) | License URL |
| `Text Domain`       | `TextDomain`   | i18n slug |
| `Domain Path`       | `DomainPath`   | Relative path to translations |
| `Requires at least` | `RequiresWP`   | Minimum WordPress version |
| `Requires PHP`      | `RequiresPHP`  | Minimum PHP version |
| `Tags`              | `Tags`         | Comma-separated; displayed in theme directory |
| `Template`          | `Template`     | **Child theme only**: parent theme's directory name |
| `Update URI`        | `UpdateURI`    | Update identifier |

The `Tags` field is parsed as a comma-separated array. `Status` (publish/draft) is also read but only used internally.

### 11.4 Child Themes

A child theme is any theme whose `style.css` contains a `Template` header pointing to the parent theme's directory name. The `Template` value must be the exact directory name of the parent (e.g., `twentytwentyfive`), not the theme's display name.

Child theme behavior:
- The child theme's `functions.php` executes **before** the parent's `functions.php`.
- Template files are looked up first in the child theme directory, then in the parent theme directory.
- `get_stylesheet_directory()` returns the child theme path; `get_template_directory()` returns the parent theme path.
- `get_stylesheet_uri()` returns the child's `style.css` URL.
- Translation files are **not** inherited from the parent.
- The child theme must declare its own `style.css` that enqueues the parent's styles.

### 11.5 Block Theme Directory Structure

```
my-block-theme/
  style.css             # Theme header
  theme.json            # Design tokens: typography, colors, spacing, block settings
  functions.php         # Optional PHP hooks
  templates/
    index.html          # Required fallback template
    single.html
    archive.html
    page.html
    404.html
    search.html
    front-page.html
  parts/
    header.html         # Template parts (wp_template_part blocks reference these)
    footer.html
    sidebar.html
  patterns/
    hero.php            # Block patterns (PHP files with header comments)
  assets/
    css/
    js/
    images/
```

The default folder names are `templates/` for `wp_template` and `parts/` for `wp_template_part`. These can be overridden, but using the deprecated names `block-templates/` and `block-template-parts/` is still supported for backward compatibility.

---

## 12. Theme Functions and APIs

### 12.1 `add_theme_support($feature, ...$args)`

Declares support for a named WordPress feature. Must be called from `functions.php` or on `'after_setup_theme'`.

| Feature string | Args | Description |
|---|---|---|
| `'post-thumbnails'` | optional `string[]` of post types | Enable featured images. Pass array to limit to specific types |
| `'post-formats'` | `string[]` of format slugs | Enables post format support. Slugs: `aside`, `gallery`, `link`, `image`, `quote`, `status`, `video`, `audio`, `chat` |
| `'html5'` | `string[]` of components | Enables HTML5 output for: `comment-list`, `comment-form`, `search-form`, `gallery`, `caption`, `style`, `script` |
| `'title-tag'` | none | Lets WordPress manage `<title>` via `wp_head()`; do not hard-code `<title>` in header |
| `'custom-logo'` | optional `{ width, height, flex-width, flex-height }` | Adds logo upload to Customizer |
| `'custom-header'` | options array | Adds header image upload to Customizer |
| `'custom-background'` | options array | Adds background image/color to Customizer |
| `'menus'` | none | Enables navigation menu support |
| `'widgets'` | none | Enables sidebar/widget support (auto-added by `register_sidebar()`) |
| `'automatic-feed-links'` | none | Outputs RSS feed `<link>` tags in `<head>` via `wp_head()` |
| `'editor-styles'` | none | Enables loading theme styles in the block editor |
| `'responsive-embeds'` | none | Enables responsive embed wrapper class |
| `'align-wide'` | none | Enables `alignwide` and `alignfull` block alignment options |
| `'dark-editor-style'` | none | Applies dark background to block editor |
| `'wp-block-styles'` | none | Includes default WordPress block styles on the frontend |
| `'block-templates'` | none | Declared automatically for block themes; enables block template engine |

### 12.2 `register_nav_menus($locations)`

Registers named navigation menu locations. The keys are location slugs; values are human-readable labels.

```typescript
addAction('after_setup_theme', function() {
  registerNavMenus({
    primary: 'Primary Navigation',
    footer: 'Footer Navigation',
    social: 'Social Links Menu',
  });
});
```

Themes display a registered menu using `wp_nav_menu()`, passing the location key as `theme_location`.

### 12.3 `register_sidebar($args)`

Registers a widget area. Returns the sidebar ID. Automatically calls `add_theme_support('widgets')` if not already done.

```typescript
function registerSidebar(args: {
  name?: string;             // Display name. Default 'Sidebar N'
  id?: string;               // Unique slug. Default 'sidebar-N'
  description?: string;      // Shown in admin Widgets panel
  class?: string;            // Extra CSS class in the admin interface
  before_widget?: string;    // HTML before each widget. Receives widget ID as %1$s, classname as %2$s
  after_widget?: string;     // HTML after each widget. Default '</li>'
  before_title?: string;     // HTML before widget title. Default '<h2 class="widgettitle">'
  after_title?: string;      // HTML after widget title. Default '</h2>'
  before_sidebar?: string;   // HTML before the sidebar. Receives id as %1$s, class as %2$s
  after_sidebar?: string;    // HTML after the sidebar
  show_in_rest?: boolean;    // Expose in REST API. Default false
}): string;
```

### 12.4 `add_image_size($name, $width, $height, $crop)`

Registers a custom image size that WordPress generates when images are uploaded.

```typescript
function addImageSize(
  name: string,              // Unique slug for this size
  width?: number,            // Max width in pixels. 0 = no constraint
  height?: number,           // Max height in pixels. 0 = no constraint
  crop?: boolean | [string, string]  // false = proportional resize, true = center crop, ['left'|'center'|'right', 'top'|'center'|'bottom'] = crop position
): void;
```

To make the size appear in the image size selector in the media library, add it to the list via the `'image_size_names_choose'` filter.

### 12.5 `load_theme_textdomain($domain, $path)`

Loads the theme's `.mo` translation file. Must be called on `'after_setup_theme'`.

```typescript
addAction('after_setup_theme', function() {
  loadThemeTextdomain(
    'my-theme',
    getTemplateDirectory() + '/languages'
  );
});
```

The `.mo` file must be named `{locale}.mo` (e.g., `fr_FR.mo`).

### 12.6 `wp_enqueue_scripts` — Frontend Asset Enqueueing

```typescript
addAction('wp_enqueue_scripts', function() {
  // Enqueue main stylesheet — uses style.css header Version for cache-busting
  wpEnqueueStyle(
    'my-theme-style',     // handle
    getStylesheetUri(),   // URL to style.css
    [],                   // dependencies
    undefined,            // version (reads from style.css header when undefined)
    'all'                 // media
  );

  // Enqueue a JavaScript file
  wpEnqueueScript(
    'my-theme-script',
    getTemplateDirectoryUri() + '/js/main.js',
    ['jquery'],   // dependencies
    '1.0.0',
    true          // in_footer: true = load before </body>
  );

  // Pass PHP data to JavaScript
  wpLocalizeScript('my-theme-script', 'MyThemeData', {
    ajaxUrl: adminUrl('admin-ajax.php'),
    nonce: wpCreateNonce('my-action'),
  });
});
```

### 12.7 `wp_head()` and `wp_footer()`

These two calls are **mandatory** in every theme template.

`wp_head()` — placed immediately before `</head>`. Fires the `'wp_head'` action. Core and plugins use this to output:
- `<title>` (when `title-tag` support is declared)
- Feed `<link>` tags
- Enqueued stylesheets
- Enqueued scripts with `in_footer = false`
- Open Graph / SEO tags (via plugins)
- Inline CSS for block styles

`wp_footer()` — placed immediately before `</body>`. Fires the `'wp_footer'` action. Core and plugins use this to output:
- Enqueued scripts with `in_footer = true`
- Inline JavaScript
- WordPress admin bar scripts

**Classic theme template skeleton:**
```php
<!doctype html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo('charset'); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1">
<?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<!-- content -->
<?php wp_footer(); ?>
</body>
</html>
```

### 12.8 `body_class` and `post_class` Filters

`body_class()` outputs CSS classes on the `<body>` tag. WordPress adds classes for page type, template, logged-in state, and more. Themes extend it via the `'body_class'` filter:

```typescript
addFilter('body_class', function(classes: string[]): string[] {
  if (isPage('contact')) classes.push('contact-page');
  return classes;
});
```

`post_class()` outputs classes on individual post wrapper elements. Extended via the `'post_class'` filter.

### 12.9 Template Tags

Template tags output dynamic content inside templates. They are echo functions (they print directly) unless prefixed with `get_`.

| Tag | Output |
|---|---|
| `the_title()` | Post title, filtered through `'the_title'` |
| `the_content()` | Post content, processed through all content filters including shortcodes |
| `the_excerpt()` | Post excerpt (auto-generated or manual), filtered through `'the_excerpt'` |
| `the_permalink()` | Permanent URL of current post |
| `the_author()` | Display name of post author |
| `the_date($format)` | Publication date |
| `the_tags($before, $sep, $after)` | Comma-separated tags with links |
| `the_category($sep)` | Comma-separated categories with links |
| `get_header($name)` | Loads `header.php` or `header-{name}.php` |
| `get_footer($name)` | Loads `footer.php` or `footer-{name}.php` |
| `get_sidebar($name)` | Loads `sidebar.php` or `sidebar-{name}.php` |
| `get_template_part($slug, $name)` | Loads `{slug}.php` or `{slug}-{name}.php`; child theme overrides first |
| `comments_template($file, $separate_comments)` | Loads `comments.php` |

`get_template_part()` is the primary template composition mechanism in classic themes. A theme's `loop.php` or `content-{format}.php` files are loaded with this function.

---

## 13. Theme Customizer Integration

### 13.1 `'customize_register'` Action

The `WP_Customize_Manager` object is passed to callbacks registered on `'customize_register'`:

```typescript
addAction('customize_register', function(wpCustomize: WP_Customize_Manager) {
  // Add panel, section, settings, controls here
});
```

### 13.2 Panels

Group multiple sections under a single panel heading:

```typescript
wpCustomize.addPanel('my_panel', {
  title: 'My Plugin Options',
  description: 'Configure the plugin appearance.',
  priority: 160,  // Controls panel order in the Customizer sidebar
});
```

### 13.3 Sections

```typescript
wpCustomize.addSection('my_section', {
  title: 'Colors',
  panel: 'my_panel',          // Parent panel slug (optional)
  priority: 10,
  capability: 'edit_theme_options',
  description: 'Adjust the color scheme.',
  theme_supports: '',         // Require a theme support feature
  active_callback: () => isPage('front-page'),  // Show section only on specific pages
});
```

### 13.4 Settings

```typescript
wpCustomize.addSetting('my_option[color]', {
  type: 'option',           // 'option' stores in wp_options, 'theme_mod' stores in theme mods
  capability: 'edit_theme_options',
  default: '#000000',
  transport: 'refresh',     // 'refresh' = full page reload on preview; 'postMessage' = JS-handled live preview
  sanitize_callback: sanitizeHexColor,
  sanitize_js_callback: maybeHashHexColor,  // For JS representation
});
```

**Setting types:**
- `'theme_mod'` (default): value stored via `set_theme_mod()`; retrieved via `get_theme_mod()`. Scoped to the active theme. The setting ID is the mod name.
- `'option'`: value stored via `update_option()`; retrieved via `get_option()`. Works with array access using brackets (`'my_option[color]'`).

**Transport modes:**
- `'refresh'`: the Customizer reloads the entire preview iframe when the value changes.
- `'postMessage'`: the Customizer sends a `postMessage` to the preview frame. The theme must register JavaScript to handle the message and update the DOM in real time (using `wp.customize` JS API).

### 13.5 Controls

```typescript
wpCustomize.addControl('my_color_control', {
  type: 'color',            // Built-in types: 'text', 'checkbox', 'textarea', 'radio', 'select', 'dropdown-pages', 'email', 'url', 'number', 'hidden', 'date', 'image', 'cropped_image', 'media', 'upload', 'color', 'background_position'
  settings: 'my_option[color]',  // Setting ID this control manages
  section: 'my_section',
  label: 'Primary Color',
  description: 'Choose the primary color.',
  priority: 10,
  choices: {},              // For 'select' and 'radio' types: { value: 'Label' }
  input_attrs: {},          // HTML attributes on the input element
  active_callback: () => true,
});
```

### 13.6 Sanitization Callbacks

Every setting should have a `sanitize_callback`. Common sanitizers:

| Sanitizer | Use for |
|---|---|
| `sanitize_text_field` | Single-line text |
| `sanitize_textarea_field` | Multi-line text |
| `sanitize_email` | Email addresses |
| `esc_url_raw` | URLs |
| `sanitize_hex_color` | Hex color values |
| `absint` | Positive integers |
| Custom allow-list function | `select` / `radio` options — verify the value is one of the allowed choices |

---

## 14. Key Extension Points Summary

| Task | Hook or Function | When to Call |
|---|---|---|
| Run code on every request | `add_action('init', cb)` | Any time |
| Register custom post type | `register_post_type()` | On `'init'` |
| Register custom taxonomy | `register_taxonomy()` | On `'init'` |
| Register shortcode | `add_shortcode()` | On `'init'` |
| Register block type | `register_block_type()` | On `'init'` |
| Register REST route | `register_rest_route()` | On `'rest_api_init'` |
| Add REST field | `register_rest_field()` | On `'rest_api_init'` |
| Register widget | `register_widget()` | On `'widgets_init'` |
| Enqueue frontend scripts/styles | `wp_enqueue_script/style()` | On `'wp_enqueue_scripts'` |
| Enqueue admin scripts/styles | `wp_enqueue_script/style()` | On `'admin_enqueue_scripts'` |
| Add admin menu page | `add_menu_page()` | On `'admin_menu'` |
| Add admin submenu page | `add_submenu_page()` | On `'admin_menu'` |
| Add meta box | `add_meta_box()` | On `'add_meta_boxes'` |
| Register settings | `register_setting()` | On `'admin_init'` |
| Plugin activation tasks | `register_activation_hook()` | File load time |
| Plugin deactivation tasks | `register_deactivation_hook()` | File load time |
| Plugin uninstall | `register_uninstall_hook()` or `uninstall.php` | File load time |
| Theme setup (support, menus) | `add_theme_support()`, `register_nav_menus()` | On `'after_setup_theme'` |
| Load theme translations | `load_theme_textdomain()` | On `'after_setup_theme'` |
| Customizer settings | `$wp_customize->add_setting()` | On `'customize_register'` |
| Filter post content | `add_filter('the_content', cb)` | Any time |
| Filter post title | `add_filter('the_title', cb)` | Any time |
| Add body CSS classes | `add_filter('body_class', cb)` | Any time |
| Plugin list action links | `plugin_action_links_{basename}` filter | Any time |
| Show admin notice | `add_action('admin_notices', cb)` | Any time |
| Save post data | `add_action('save_post', cb)` | Any time |
| AJAX handler (logged in) | `add_action('wp_ajax_{action}', cb)` | Any time |
| AJAX handler (public) | `add_action('wp_ajax_nopriv_{action}', cb)` | Any time |

---

## 15. TypeScript Interface Sketch

```typescript
interface PluginHeader {
  Name: string;
  PluginURI: string;
  Version: string;
  Description: string;
  Author: string;
  AuthorURI: string;
  TextDomain: string;
  DomainPath: string;
  Network: boolean;        // Parsed from string 'true'/'false'
  RequiresWP: string;
  RequiresPHP: string;
  UpdateURI: string;
  RequiresPlugins: string; // Comma-separated list
  // Derived fields (after markup processing):
  Title: string;           // Name wrapped in <a> if PluginURI is set
  AuthorName: string;      // Author without link markup
}

interface ThemeHeader {
  Name: string;
  ThemeURI: string;
  Author: string;
  AuthorURI: string;
  Description: string;
  Version: string;
  Template: string;        // Parent theme directory name (child themes only)
  Status: string;
  Tags: string[];          // Parsed from comma-separated string
  TextDomain: string;
  DomainPath: string;
  RequiresWP: string;
  RequiresPHP: string;
  UpdateURI: string;
}

interface MenuPageArgs {
  pageTitle: string;
  menuTitle: string;
  capability: string;
  menuSlug: string;
  callback: () => void;
  iconUrl?: string;
  position?: number;
}

interface MetaBoxArgs {
  id: string;
  title: string;
  callback: (post: WP_Post, metaBox: { id: string; title: string; args: unknown }) => void;
  screen: string | string[] | null;
  context: 'normal' | 'side' | 'advanced';
  priority: 'high' | 'core' | 'default' | 'low';
  callbackArgs?: unknown;
}

interface PostTypeLabels {
  name: string;
  singular_name: string;
  add_new: string;
  add_new_item: string;
  edit_item: string;
  new_item: string;
  view_item: string;
  view_items: string;
  search_items: string;
  not_found: string;
  not_found_in_trash: string;
  parent_item_colon?: string;
  all_items: string;
  archives: string;
  attributes: string;
  insert_into_item: string;
  uploaded_to_this_item: string;
  featured_image: string;
  set_featured_image: string;
  remove_featured_image: string;
  use_featured_image: string;
  menu_name: string;
  filter_items_list: string;
  filter_by_date: string;
  items_list_navigation: string;
  items_list: string;
  item_published: string;
  item_published_privately: string;
  item_reverted_to_draft: string;
  item_trashed: string;
  item_scheduled: string;
  item_updated: string;
  item_link: string;
  item_link_description: string;
}

interface RegisterPostTypeArgs {
  labels?: Partial<PostTypeLabels>;
  description?: string;
  public?: boolean;
  hierarchical?: boolean;
  exclude_from_search?: boolean;
  publicly_queryable?: boolean;
  show_ui?: boolean;
  show_in_menu?: boolean | string;
  show_in_nav_menus?: boolean;
  show_in_admin_bar?: boolean;
  show_in_rest?: boolean;
  rest_base?: string;
  rest_namespace?: string;
  rest_controller_class?: string;
  menu_position?: number | null;
  menu_icon?: string | null;
  capability_type?: string | [string, string];
  capabilities?: Partial<Record<string, string>>;
  map_meta_cap?: boolean;
  supports?: string[];
  register_meta_box_cb?: (() => void) | null;
  taxonomies?: string[];
  has_archive?: boolean | string;
  rewrite?: boolean | {
    slug?: string;
    with_front?: boolean;
    feeds?: boolean;
    pages?: boolean;
    ep_mask?: number;
  };
  query_var?: boolean | string;
  can_export?: boolean;
  delete_with_user?: boolean | null;
  template?: unknown[][];
  template_lock?: false | 'all' | 'insert' | 'contentOnly';
}

interface TaxonomyLabels {
  name: string;
  singular_name: string;
  search_items: string;
  popular_items?: string;
  all_items: string;
  parent_item?: string;
  parent_item_colon?: string;
  edit_item: string;
  view_item: string;
  update_item: string;
  add_new_item: string;
  new_item_name: string;
  separate_items_with_commas?: string;
  add_or_remove_items?: string;
  choose_from_most_used?: string;
  not_found: string;
  no_terms: string;
  filter_by_item?: string;
  items_list_navigation: string;
  items_list: string;
  most_used: string;
  back_to_items: string;
  item_link: string;
  item_link_description: string;
}

interface RegisterTaxonomyArgs {
  labels?: Partial<TaxonomyLabels>;
  description?: string;
  public?: boolean;
  publicly_queryable?: boolean;
  hierarchical?: boolean;
  show_ui?: boolean;
  show_in_menu?: boolean;
  show_in_nav_menus?: boolean;
  show_in_rest?: boolean;
  rest_base?: string;
  rest_namespace?: string;
  rest_controller_class?: string;
  show_tagcloud?: boolean;
  show_in_quick_edit?: boolean;
  show_admin_column?: boolean;
  meta_box_cb?: (() => void) | false | null;
  meta_box_sanitize_cb?: ((taxonomy: string, terms: unknown) => unknown) | null;
  capabilities?: Partial<{
    manage_terms: string;
    edit_terms: string;
    delete_terms: string;
    assign_terms: string;
  }>;
  rewrite?: boolean | {
    slug?: string;
    with_front?: boolean;
    hierarchical?: boolean;
    ep_mask?: number;
  };
  query_var?: boolean | string;
  update_count_callback?: (terms: number[], taxonomy: WP_Taxonomy) => void;
  default_term?: string | { name: string; slug: string; description: string; };
  sort?: boolean | null;
}

type ShortcodeCallback = (
  atts: Record<string, string> | '',  // '' when no attributes; shortcode_atts normalizes this
  content: string | null,
  tag: string
) => string;

interface WidgetConstructorArgs {
  idBase: string;
  name: string;
  widgetOptions?: {
    classname?: string;
    description?: string;
    customize_selective_refresh?: boolean;
  };
  controlOptions?: {
    width?: number;
    height?: number;
    id_base?: string;
  };
}

interface SidebarDisplayArgs {
  name: string;
  id: string;
  description: string;
  class: string;
  before_widget: string;
  after_widget: string;
  before_title: string;
  after_title: string;
  before_sidebar: string;
  after_sidebar: string;
}

type BlockRenderCallback = (
  attributes: Record<string, unknown>,
  content: string,
  block: WP_Block
) => string;

interface CustomizerSettingArgs {
  type?: 'theme_mod' | 'option';
  capability?: string;
  theme_supports?: string | string[];
  default?: unknown;
  transport?: 'refresh' | 'postMessage';
  validate_callback?: (validity: WP_Error, value: unknown, setting: WP_Customize_Setting) => WP_Error;
  sanitize_callback?: (value: unknown, setting: WP_Customize_Setting) => unknown;
  sanitize_js_callback?: (value: unknown, setting: WP_Customize_Setting) => unknown;
  dirty?: boolean;
}

interface RestFieldArgs {
  get_callback: ((
    object: Record<string, unknown>,
    fieldName: string,
    request: WP_REST_Request,
    objectType: string
  ) => unknown) | null;

  update_callback: ((
    value: unknown,
    object: unknown,
    fieldName: string,
    request: WP_REST_Request,
    objectType: string
  ) => true | WP_Error) | null;

  schema: {
    description?: string;
    type?: 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object' | 'null';
    context?: Array<'view' | 'edit' | 'embed'>;
    readonly?: boolean;
    [key: string]: unknown;
  } | null;
}
```

---

## 16. Design Patterns to Carry Over

### Single-Responsibility Plugin Files

The main plugin file (`my-plugin.php`) should do only four things:
1. Declare the header comment.
2. Define constants (plugin version, paths).
3. Register activation/deactivation/uninstall hooks.
4. Load other files and instantiate the plugin class (on `'plugins_loaded'`).

All feature code lives in separate files included by the main file.

### Prefix Everything

To avoid collisions with other plugins, all function names, class names, option names, post type slugs, taxonomy slugs, shortcode tags, hook names, and script handles should be prefixed with a unique vendor string derived from the plugin/theme slug (e.g., `myplugin_`, `MyPlugin_`).

### Options Prefix Pattern

Group all plugin settings under a single option key as a serialized array rather than creating individual `wp_options` rows for each setting:

```typescript
// Prefer this (one row):
const settings = getOption<MySettings>('my_plugin_settings', { version: '1.0' });

// Over this (many rows):
const version = getOption('my_plugin_version');
const enabled = getOption('my_plugin_enabled');
```

### Nonce-Protected Forms

Every admin form that saves data must include a nonce field (generated with `wp_nonce_field()`) and verify it on the processing side with `wp_verify_nonce()` before acting on `$_POST` data.

### Late Instantiation

Instantiate plugin classes inside a callback registered on `'plugins_loaded'` rather than at global scope. This ensures all other plugins have loaded before your plugin's constructor runs, which is important when your plugin depends on functions provided by other plugins or the theme.

### Template Hierarchy Override

In classic themes, `get_template_part()` searches the child theme first, then the parent. This means a child theme can override any template part by creating a file with the same relative path. The same logic applies to all template files loaded via the template hierarchy (`single.php`, `archive.php`, etc.).

### Avoid Output in Hooks That Run Too Early

Hooks like `'muplugins_loaded'`, `'plugins_loaded'`, and `'init'` run before headers are sent. Do not call `echo` or `wp_redirect()` from these hooks without first checking that it is appropriate (e.g., confirming a REST or AJAX context). Redirect calls should typically happen on `'template_redirect'` or later.

### Capability Checking Everywhere

Every admin callback, AJAX handler, REST endpoint callback, and form processing function must call `current_user_can()` before performing any action. Use the most restrictive capability appropriate to the action. Do not rely on the `capability` argument of `add_menu_page()` alone — it only controls menu visibility, not direct URL access.

### `WP_Error` for Structured Error Returns

Anywhere WordPress core expects a return value that might be an error (REST callbacks, sanitization callbacks, validation callbacks), return a `WP_Error` instance rather than `false` or throwing an exception. `WP_Error` carries a machine-readable code and a human-readable message:

```typescript
if (!isValid(value)) {
  return new WP_Error(
    'invalid_value',
    'The provided value is not valid.',
    { status: 400 }
  );
}
```

---

## 17. Tovu Reconstruction Notes

### 17.1 Why this exists

This authoring guidance exists because the extension/theme ecosystem only stays viable when there is a disciplined contract between platform and third-party code. WordPress encodes that discipline through naming, hooks, capabilities, nonces, and file conventions.

### 17.2 What Tovu should preserve

- A documented authoring contract for plugins/extensions and themes
- Clear guidance on lifecycle hooks, capability checks, and error-return conventions
- Strong namespacing/isolation expectations for third-party code
- Explicit boundaries between bootstrapping, feature code, and platform callbacks

### 17.3 What Tovu can simplify

- Tovu should prefer typed manifests, ports, and contracts over WordPress’s loose PHP conventions
- Nonces, hooks, and global prefixes may map to different mechanisms, but the underlying safety goals remain
- Theme and extension authoring can be more opinionated than WordPress if the contract is clearer

### 17.4 Possible Tovu seams

- `src/features/extensions/` and `src/features/presentation/` define the platform-side authoring contracts
- extension/theme SDK or template docs can come later once the runtime contracts stabilize
- `src/core/ports/*` should become the preferred integration seam instead of global monkey-patching

### 17.5 Suggested priority

- `V1`: documented extension/theme contract, lifecycle boundaries, capability/error conventions
- `Later`: dedicated authoring SDK/tooling, richer scaffolding and validation workflows
