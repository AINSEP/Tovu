# Plugins Management — WordPress-to-TypeScript Rewrite Spec

**Source files analyzed:**
- `wp-admin/plugins.php`
- `wp-admin/plugin-install.php`
- `wp-admin/plugin-editor.php`
- `wp-admin/includes/plugin.php`
- `wp-admin/includes/class-wp-plugins-list-table.php`

---

## Section 1: Overview

The plugins management subsystem covers four distinct surfaces:

1. **Plugins List** (`plugins.php`) — tabular list of all installed plugins with status views, row actions, and bulk actions.
2. **Plugin Installer** (`plugin-install.php`) — browse the WordPress.org Plugins API and install plugins from it or from uploaded ZIP files.
3. **Plugin File Editor** (`plugin-editor.php`) — textarea-based code editor for directly editing plugin PHP files on the server.
4. **Plugin data layer** (`includes/plugin.php`) — the functions for reading plugin metadata from file headers, activating/deactivating plugins, deleting plugins, and enumerating must-use and drop-in plugins.

The subsystem is primarily server-rendered with targeted JavaScript enhancements. The list table is a standard WP_List_Table derivative. The installer uses a JavaScript-driven browsing interface similar to the themes installer. The editor is mostly a static form with CodeMirror layered on.

---

## Section 2: Routes

### 2.1 `GET /wp-admin/plugins.php`

Renders the plugins list. Requires `activate_plugins` capability as the baseline guard.

**Query parameters accepted:**

| Parameter | Type | Purpose |
|---|---|---|
| `action` | string | Single-item action. Values: `activate`, `deactivate`, `delete-selected`, `activate-selected`, `deactivate-selected`, `update-selected`, `error_scrape`, `resume`, `enable-auto-update`, `disable-auto-update`, `enable-auto-update-selected`, `disable-auto-update-selected`, `clear-recent-list` |
| `plugin` | string | Plugin file path relative to plugins dir (e.g., `my-plugin/my-plugin.php`) |
| `plugin_status` | string | Active view filter. Values: `all`, `active`, `inactive`, `recently_activated`, `upgrade`, `mustuse`, `dropins`, `search`, `paused`, `auto-update-enabled`, `auto-update-disabled` |
| `paged` | int | Page number within the current view |
| `s` | string | URL-encoded search term |
| `checked[]` | string[] | Array of plugin paths for bulk actions |
| `from` | string | Referrer context; `import` or `press-this` for post-activation redirects |
| `orderby` | string | Column to sort by (default: `Name`) |
| `order` | string | Sort direction: `ASC` or `DESC` |

**Status flags (query parameters that trigger notices):**

| Parameter | Notice Shown |
|---|---|
| `error=true` | Plugin activation error (see Section 5) |
| `error=resuming` | "Plugin could not be resumed because it triggered a fatal error." |
| `activate=true` | "Plugin activated." |
| `activate-multi=true` | "Selected plugins activated." |
| `deactivate=true` | "Plugin deactivated." |
| `deactivate-multi=true` | "Selected plugins deactivated." |
| `deleted={n}` | "The selected plugin(s) have been deleted." |
| `resume=true` | "Plugin resumed." |
| `enabled-auto-update=true` | "Plugin will be auto-updated." |
| `disabled-auto-update=true` | "Plugin will no longer be auto-updated." |
| `enabled-auto-update-multi=true` | "Selected plugins will be auto-updated." |
| `disabled-auto-update-multi=true` | "Selected plugins will no longer be auto-updated." |

**Cleaned query args (removed from `REQUEST_URI` before display):**

`error`, `deleted`, `activate`, `activate-multi`, `deactivate`, `deactivate-multi`, `enabled-auto-update`, `disabled-auto-update`, `enabled-auto-update-multi`, `disabled-auto-update-multi`, `_error_nonce`

### 2.2 `GET /wp-admin/plugin-install.php`

Renders the plugin browser/installer. Requires `install_plugins` capability. On multisite, non-network-admin requests are redirected to the network admin.

**Query parameters:**

| Parameter | Type | Purpose |
|---|---|---|
| `tab` | string | Browse mode: `featured`, `popular`, `recommended`, `favorites`, `search`, `upload`, `plugin-information`, `beta` |
| `s` | string | Search query |
| `paged` | int | Pagination |
| `user` | string | WordPress.org username for favorites |

The `plugin-information` tab is special: it sets `IFRAME_REQUEST = true` and renders a plugin detail page in a Thickbox overlay (not the full page).

**Tab hooks:**

- `install_plugins_pre_{tab}` — fires before each tab renders. Possible values: `install_plugins_pre_beta`, `install_plugins_pre_favorites`, `install_plugins_pre_featured`, `install_plugins_pre_plugin-information`, `install_plugins_pre_popular`, `install_plugins_pre_recommended`, `install_plugins_pre_search`, `install_plugins_pre_upload`
- `install_plugins_{tab}` — fires in tab body with `$paged` as argument. Same name variants.

Additionally, `install_plugins_pre_upload` fires on every non-upload tab (because the upload form is always present on those screens, hidden by JavaScript).

### 2.3 `GET /wp-admin/plugin-editor.php`

Renders the plugin file editor. Requires `edit_plugins` capability. On multisite, non-network-admin requests redirect to the network admin.

**Query parameters:**

| Parameter | Type | Purpose |
|---|---|---|
| `plugin` | string | Plugin file path (e.g., `my-plugin/my-plugin.php`) |
| `file` | string | Specific file within the plugin to edit; defaults to the plugin's main file |
| `a` | flag | Success indicator after a save redirect |

**POST action:**

`action=update` with `newcontent`, `file`, `plugin`, nonce `edit-plugin_{file}`. Calls `wp_edit_theme_plugin_file()`. On success, redirects to `?a=1&plugin=...&file=...`.

---

## Section 3: Authorization

### Capability Map

| Capability | Required for |
|---|---|
| `activate_plugins` | Viewing plugins.php, bulk activate/deactivate |
| `activate_plugin` | Per-plugin meta-capability checked for individual activate/deactivate |
| `deactivate_plugin` | Per-plugin meta-capability for individual deactivation |
| `deactivate_plugins` | Bulk deactivation |
| `install_plugins` | plugin-install.php, "Add Plugin" button on plugins.php |
| `upload_plugins` | "Upload Plugin" button on plugin-install.php |
| `update_plugins` | Bulk update action, auto-update toggles |
| `delete_plugins` | Delete action in list table, bulk delete |
| `edit_plugins` | plugin-editor.php |
| `resume_plugin` | Per-plugin meta-capability for resuming paused plugins |
| `manage_network_plugins` | Network admin plugin management on multisite |

### Multisite Constraints

- `install_plugins`, `delete_plugins`, `update_plugins` are network-only on multisite (must be performed from network admin).
- Network-only plugins (with `Network: true` in header) cannot be activated on a single site; such activation attempts are silently redirected.
- The bulk activate, deactivate, update, and delete actions check `is_network_admin()` to determine whether to operate on site-level or network-level plugin lists.
- On multisite non-network admin, the "Add Plugin" button is only shown if `!is_multisite() || is_network_admin()`.

### DISALLOW_FILE_EDIT / DISALLOW_FILE_MODS

- If `DISALLOW_FILE_EDIT` is defined as `true` in `wp-config.php`, the plugin editor is disabled. WordPress removes it from admin menus and direct access is blocked.
- `DISALLOW_FILE_MODS` prevents file modifications and also blocks installs and updates.

---

## Section 4: Plugins List (WP_Plugins_List_Table)

### 4.1 Status Views

The list table's view links filter plugins into these status buckets:

| Status key | Label | Contents |
|---|---|---|
| `all` | All | Every plugin from `get_plugins()` |
| `active` | Active | Plugins currently active on this site or network |
| `inactive` | Inactive | Installed but not activated plugins |
| `recently_activated` | Recently Active | Deactivated within the past week (stored in `recently_activated` option) |
| `upgrade` | Update Available | Plugins present in `update_plugins` transient's `response` key |
| `mustuse` | Must-Use | Plugins in `wp-content/mu-plugins/` |
| `dropins` | Drop-ins | Special files in `wp-content/` |
| `paused` | Paused | Active plugins that threw a fatal error (recovery mode) |
| `auto-update-enabled` | Auto-updates Enabled | Plugins with auto-update enabled |
| `auto-update-disabled` | Auto-updates Disabled | Plugins with auto-update disabled |
| `search` | (inline label) | Live search results filtered from `all` |

View links are only shown when the corresponding count is greater than zero.

### 4.2 Columns

```typescript
type PluginColumns = {
  cb: string;           // Checkbox column (empty for mustuse/dropins)
  name: 'Plugin';
  description: 'Description';
  'auto-updates'?: 'Automatic Updates';  // only when auto-updates UI is enabled
};
```

The `auto-updates` column is shown only when `wp_is_auto_update_enabled_for_type('plugin')` returns true and the current user has `update_plugins`.

### 4.3 Row Structure (single_row)

Each plugin row (`<tr>`) carries:

- A `data-slug` attribute containing the plugin's sanitized name (used by the updates JS).
- A `data-plugin` attribute with the plugin file path.
- A CSS class: `active` (active plugin), `inactive` (inactive), `plugin-update-tr` (has update), `paused` (paused), etc.

**Row columns:**

**`name` column:**
- Plugin name (linked to `PluginURI` if set)
- Row actions (see below)

**`description` column:**
- Plugin description (first 200 chars by default)
- Meta line: Version {version} | By {author} | {View details link} | {Visit plugin site link}
- Update notice (if update available, same notice as the `upgrade` view)
- Dependency notice (if plugin has unmet `RequiresPlugins` dependencies)
- Compatibility notice (if `RequiresWP` or `RequiresPHP` is not satisfied)

**`auto-updates` column:**
- If auto-updates are supported: "Enable auto-updates" or "Disable auto-updates" toggle link
- If auto-updates are forced by filter: "Auto-updates enabled" or "Auto-updates disabled" text
- If update is available and auto-updates are enabled: estimated next-update time string

### 4.4 Row Actions

Row actions appear below the plugin name as a pipe-separated list of links. The available actions depend on the plugin's state and the current user's capabilities:

**Standard plugin (not mustuse/dropin):**

| Action key | Label | Condition |
|---|---|---|
| `deactivate` | Deactivate | Plugin is active; user has `deactivate_plugin`; no active dependents blocking deactivation |
| `activate` | Activate | Plugin is inactive; user has `activate_plugin`; plugin is compatible with WP + PHP; no unmet dependencies |
| `delete` | Delete | Plugin is inactive; user has `delete_plugins`; no dependents (or only circular dependency) |
| `edit` | Edit | `DISALLOW_FILE_EDIT` is false; user has `edit_plugins` |
| `details` | View details | Plugin has a `.org` slug; opens `plugin-install.php?tab=plugin-information&plugin={slug}` in Thickbox |

**Network admin row actions:**

| Action key | Label | Condition |
|---|---|---|
| `deactivate` | Network Deactivate | Plugin is network-active; user has `manage_network_plugins`; no active dependents |
| `activate` | Network Activate | Plugin is not network-active; compatible; no unmet dependencies |
| `delete` | Delete | Plugin is not active; user has `delete_plugins`; no dependents |

**Non-network multisite with network-active plugins:**

- `network_active`: Shows "Network Active" text (no link) — cannot be deactivated from single-site admin.
- `network_only`: Shows "Network Only" text — plugin requires `Network: true`, inactive on this site.

**Paused plugins:**

When a plugin is active but paused (threw fatal error in recovery mode), the deactivate action is replaced with a "Resume" action.

**Dependency blocking:**

- If a plugin has active dependents (other plugins that depend on it), the Deactivate action is shown as plain text (not a link), with a screen-reader span: "You cannot deactivate this plugin as other plugins require it."
- If a plugin has unmet dependencies, the Activate action is shown as plain text: "You cannot activate this plugin as it has unmet requirements."

### 4.5 Bulk Actions

Available bulk actions (context-dependent):

| Action | Label | Condition |
|---|---|---|
| `activate-selected` | Activate | Status is not `active` |
| `deactivate-selected` | Deactivate | Status is not `inactive` or `recently_activated` |
| `update-selected` | Update | User has `update_plugins`; single-site or network admin |
| `delete-selected` | Delete | User has `delete_plugins`; status is not `active`; single-site or network admin |
| `enable-auto-update-selected` | Enable Auto-updates | Auto-updates enabled; status is not `auto-update-enabled` |
| `disable-auto-update-selected` | Disable Auto-updates | Auto-updates enabled; status is not `auto-update-disabled` |

Bulk actions are suppressed entirely for the `mustuse` and `dropins` views.

Bulk nonce action: `bulk-plugins`.

The "Clear List" button appears in the extra navigation for the `recently_activated` status view.

### 4.6 Pagination

Default items per page: `999` (effectively no pagination for most installs). The per-page option is registered via `add_screen_option('per_page', ['default' => 999])`. The screen ID used for the option key is the current screen ID + `_per_page`.

### 4.7 Search

The search form filters plugins client-side by calling `_search_callback()` which does a case-insensitive substring search across every string value in each plugin's data array (Name, Description, Author, etc.) against the URL-decoded search term.

---

## Section 5: Plugin Activation and Deactivation

### 5.1 Single Plugin Activation Flow

1. User clicks "Activate" link. URL: `plugins.php?action=activate&plugin={path}&plugin_status={view}&paged={n}&s={s}&_wpnonce={nonce}`. Nonce action: `activate-plugin_{plugin}`.
2. Server checks `activate_plugin` meta-capability for this plugin file. Dies if insufficient.
3. If multisite and plugin has `Network: true` header and this is not the network admin: silently redirect (plugin is network-only, cannot be activated here).
4. Calls `activate_plugin($plugin, $redirect_on_error_url, $is_network_admin)`.
5. Inside `activate_plugin()`:
   a. Calls `plugin_basename(trim($plugin))` to normalize the path.
   b. Determines if network-wide: either `$network_wide` param is true, or `is_network_only_plugin()` returns true.
   c. Calls `validate_plugin($plugin)` — checks the file exists and is readable. Returns `WP_Error` on failure.
   d. Calls `validate_plugin_requirements($plugin)` — checks `RequiresWP` and `RequiresPHP` headers. Returns `WP_Error` if requirements not met.
   e. If plugin is not already active: pre-sets an error redirect URL.
   f. Calls `plugin_sandbox_scrape($plugin)` — includes the plugin file inside output buffering to catch unexpected output and fatal errors.
   g. Fires `activate_plugin` action.
   h. Fires `activate_{plugin_file}` action (dynamic, used by `register_activation_hook()`).
   i. Updates `active_plugins` option (site-level) or `active_sitewide_plugins` site option (network-level). For network: stores `plugin_file => timestamp`. For site: appends to array and sorts.
   j. Fires `activated_plugin` action.
   k. If output was captured in the sandbox, returns `WP_Error('unexpected_output', ...)`.
6. On `WP_Error('unexpected_output')`: redirects to `?error=true&charsout={N}&plugin={path}&_error_nonce={nonce}`. The error page shows an inline `<iframe>` that re-runs the plugin in `error_scrape` mode to display the actual PHP error.
7. On `WP_Error` (other codes): `wp_die()` with the error.
8. On success: removes plugin from `recently_activated` option (since it's now active). Redirects to `?activate=true`.
9. Special `from` parameter handling:
   - `from=import`: Redirects to `import.php?import={plugin_slug_without_-importer}`.
   - `from=press-this`: Redirects to `press-this.php`.

### 5.2 Bulk Activation

Nonce action: `bulk-plugins`.

Iterates `$_POST['checked']` array, skipping:
- Already-active plugins
- Network-only plugins when not in network admin
- Plugins where user lacks `activate_plugin` meta-capability

Calls `activate_plugins($plugins, $redirect_url, $is_network)` which calls `activate_plugin()` for each. On completion, removes all from `recently_activated`. Redirects to `?activate-multi=true`.

### 5.3 Single Plugin Deactivation Flow

1. User clicks "Deactivate" link. URL: `plugins.php?action=deactivate&plugin={path}&...`. Nonce action: `deactivate-plugin_{plugin}`.
2. Checks `deactivate_plugin` meta-capability.
3. If not network admin and plugin is network-active: silently redirect (cannot deactivate network plugins from single-site admin).
4. Calls `deactivate_plugins($plugin, false, $is_network)`.
5. Inside `deactivate_plugins()`:
   a. For each plugin: normalizes basename.
   b. Skips if not currently active.
   c. Fires `deactivate_plugin` action.
   d. Fires `deactivate_{plugin_file}` action (dynamic, used by `register_deactivation_hook()`).
   e. Removes from `active_plugins` option (site) or `active_sitewide_plugins` (network).
   f. If in recovery mode: clears the plugin from the paused plugins store.
   g. Fires `deactivated_plugin` action.
6. Adds plugin to `recently_activated` option with current timestamp: `{plugin => time()}`.
7. Redirects to `?deactivate=true`.

### 5.4 Network Activate vs. Single Site Activate

The `activate_plugin()` function distinguishes by the `$network_wide` parameter:

- **Single site**: Appends plugin path to `active_plugins` array option (`wp_options` table). Sorts the array.
- **Network-wide**: Adds `plugin_path => timestamp` to `active_sitewide_plugins` site option (`wp_sitemeta` table).

On the plugins page, links for network activation/deactivation are only rendered when `$screen->in_admin('network')`.

### 5.5 Activation Redirect

After activation, the redirect target `?activate=true` simply shows a success notice. There is no built-in mechanism to redirect to a "welcome" page for third-party plugins. However, plugins may use the `activated_plugin` action to set a transient and implement their own activation redirect via `admin_init`.

### 5.6 Plugin Action Links Filter

The `plugin_action_links_{plugin_file}` filter (dynamic) and the `plugin_action_links` filter (global) allow plugins to add or modify row actions. These filters receive and return an array of HTML link strings keyed by action name.

```typescript
// Filter signature (conceptual TypeScript equivalent)
type PluginActionLinksFilter = (
  links: Record<string, string>,
  pluginFile: string,
  pluginData: PluginData,
  context: string
) => Record<string, string>;
```

---

## Section 6: Plugin Deletion

### 6.1 Deletion Eligibility

A plugin may only be deleted if:

1. The current user has `delete_plugins` capability.
2. The plugin is currently **inactive** (not active on site or network). `delete-selected` action filters the checked list via `array_filter($plugins, 'is_plugin_inactive')`. If all selected plugins are active, redirects to `?error=true&main=true`.
3. The plugin file path passes `validate_file()` (no path traversal).

### 6.2 Confirmation Screen

When `verify-delete` is not set, a confirmation page is shown listing:

- Plugin names with their authors.
- If any plugin has an uninstall hook (`is_uninstallable_plugin()` returns true): the plugin name is labeled "(will also delete its data)".
- Confirmation question: "Are you sure you want to delete these files?" or "...these files and data?" if any have uninstall hooks.
- Two buttons: "Yes, delete these files [and data]" and "No, return me to the plugin list."

The "Yes" button resubmits the same form with `verify-delete=1` appended.

On multisite network admin, if any of the plugins to delete are not network-only (could be active on individual sites), a caution notice is shown: "These plugins may be active on other sites in the network."

### 6.3 Deletion Process (`delete_plugins()`)

1. Acquires filesystem credentials via `request_filesystem_credentials()`. If not available, shows credentials form and returns `null`.
2. Initializes WP Filesystem.
3. For each plugin file:
   a. If `is_uninstallable_plugin($plugin_file)`: calls `uninstall_plugin($plugin_file)` which requires the plugin file, calls the registered uninstall hook, and then re-includes `wp-admin/admin.php` to restore the admin context.
   b. Fires `delete_plugin` action (before deletion).
   c. If the plugin is in a subdirectory (`strpos($plugin_file, '/')` is truthy and the subdirectory is not the plugins root): deletes the entire subdirectory recursively.
   d. If the plugin is a single-file plugin at the plugins root: deletes just the PHP file.
   e. Fires `deleted_plugin` action (after deletion, with bool success).
   f. Removes translation files (`.po`, `.mo`, `.l10n.php`, `-*.json`) from `WP_LANG_DIR/plugins/`.
4. Returns `true` on full success, `WP_Error` if any plugin could not be deleted.

### 6.4 Delete Result Storage

The delete result (`true` or `WP_Error`) is stored in the `plugins_delete_result_{user_id}` option (not a transient, to survive cache flushes that some plugins trigger during uninstall). The option is read on the next page load and then immediately deleted.

---

## Section 7: Plugin Install

### 7.1 Browse Tabs

| Tab | `plugins_api` browse param | Notes |
|---|---|---|
| Featured | `featured` | Plugins featured by WordPress.org |
| Popular | `popular` | Most-downloaded plugins |
| Recommended | `recommended` | Editor's picks |
| Favorites | (uses `user` param) | User's WordPress.org favorites |
| Search | (uses `search`, `author`, or `tag`) | Full-text search |
| Upload | N/A | ZIP upload form |
| Beta | `beta` | Beta/experimental plugins (rarely used) |

### 7.2 `plugins_api()` Function

```
plugins_api(action: string, args: PluginsApiArgs): object | array | WP_Error
```

**Actions:**

- `query_plugins` — paginated plugin list
- `plugin_information` — full details for a single plugin by slug
- `hot_categories` — popular categories
- `hot_tags` — popular tags

**`query_plugins` arguments:**

```typescript
interface PluginsApiQueryArgs {
  search?: string;
  author?: string;
  tag?: string | string[];
  browse?: 'featured' | 'popular' | 'recommended' | 'favorites' | 'beta';
  user?: string;       // For favorites
  slug?: string;       // For plugin_information
  per_page?: number;   // Default 24
  page?: number;       // Default 1
  locale?: string;
  installed_plugins?: string[];  // slugs already installed, to mark them
  fields?: {
    banners?: boolean;
    icons?: boolean;
    reviews?: boolean;
    compatibility?: boolean;
    active_installs?: boolean;
    sections?: boolean;   // description, installation, FAQ, changelog
    short_description?: boolean;
    tags?: boolean;
    versions?: boolean;
    screenshots?: boolean;
    requires?: boolean;
    tested?: boolean;
    requires_php?: boolean;
    rating?: boolean;
    ratings?: boolean;
    num_ratings?: boolean;
    downloaded?: boolean;
    last_updated?: boolean;
    added?: boolean;
    homepage?: boolean;
    donate_link?: boolean;
    contributors?: boolean;
    download_link?: boolean;
    author_profile?: boolean;
  };
}
```

**`plugin_information` result shape:**

```typescript
interface PluginInfoApiResult {
  name: string;
  slug: string;
  version: string;
  author: string;        // HTML, may contain a link
  author_profile: string;
  requires: string;
  tested: string;
  requires_php: string;
  rating: number;        // 0-100
  num_ratings: number;
  ratings: Record<string, number>;  // "1" through "5"
  active_installs: number;
  downloaded: number;
  last_updated: string;
  added: string;
  homepage: string;
  donate_link: string;
  download_link: string;
  sections: {
    description: string;
    installation?: string;
    faq?: string;
    screenshots?: string;
    other_notes?: string;
    changelog?: string;
  };
  banners: { low?: string; high?: string };
  icons: { '1x'?: string; '2x'?: string; svg?: string };
  short_description: string;
  tags: Record<string, string>;
  versions: Record<string, string>;  // version => download URL
  contributors: Record<string, { profile: string; avatar: string; display_name: string }>;
  compatibility: Record<string, Record<string, object>>;
  external: boolean;
}
```

**Filters:**

- `plugins_api_args` — modify args before the API call.
- `plugins_api` — short-circuit the API call entirely.
- `plugins_api_result` — filter the API response.

### 7.3 `plugin-information` Tab (Thickbox Overlay)

When `tab=plugin-information`, `IFRAME_REQUEST` is defined and the page renders a minimal plugin detail view inside a Thickbox modal (triggered by links on the plugins list with class `thickbox open-plugin-details-modal`). The URL pattern is:

```
plugin-install.php?tab=plugin-information&plugin={slug}&TB_iframe=true&width=600&height=800
```

### 7.4 Install from WordPress.org

The "Install Now" button on a plugin card navigates to:

```
update.php?action=install-plugin&plugin={slug}&_wpnonce={nonce_for_install-plugin_{slug}}
```

This is handled by `wp-admin/update.php`, not `plugin-install.php`.

### 7.5 Install from ZIP Upload

The upload form (toggle button "Upload Plugin") shows a file input that posts to `wp-admin/update.php?action=upload-plugin`. The process:

1. ZIP file is uploaded to a temp directory.
2. Unpacked and validated (must contain a `.php` file with a `Plugin Name:` header in the first 8KB).
3. The plugin directory is moved to `WP_PLUGIN_DIR`.
4. Result page shows "Install Plugin: {Name} - {result}" with "Activate Plugin" and "Return to Plugin Installer" links.

### 7.6 WP_Plugin_Install_List_Table

The plugin installer page uses `WP_Plugin_Install_List_Table` (a different class from `WP_Plugins_List_Table`). It calls `plugins_api()` with the current tab's parameters and paginates the results. The class is used for the server-rendered tab content, but on the JavaScript-driven tabs the JS makes direct API calls.

### 7.7 Plugin Dependencies

WordPress 6.5+ introduced `WP_Plugin_Dependencies`. On `plugin-install.php`:

```
WP_Plugin_Dependencies::initialize();
WP_Plugin_Dependencies::display_admin_notice_for_unmet_dependencies();
WP_Plugin_Dependencies::display_admin_notice_for_circular_dependencies();
```

A plugin can declare dependencies via the `Requires Plugins` header (comma-separated slugs of `.org` plugin slugs). The dependency system:

- Disables the Activate button for a plugin if its dependencies are not yet activated.
- Shows a notice on plugins.php listing any unmet dependencies.
- Marks install-from-installer installs to also install required dependencies.

---

## Section 8: Plugin Updates

### 8.1 `update_plugins` Transient Structure

```typescript
interface UpdatePluginsTransient {
  last_checked: number;
  checked: Record<string, string>;   // plugin_file => current version
  response: Record<string, {         // plugins with available updates
    id: string;          // plugin ID on .org (slug/slug.php)
    slug: string;
    plugin: string;      // file path
    new_version: string;
    url: string;         // plugin detail page
    package: string;     // download ZIP URL
    icons: Record<string, string>;
    banners: Record<string, string>;
    banners_rtl: Record<string, string>;
    tested: string;
    requires_php: string;
    compatibility: Record<string, object>;
  }>;
  no_update: Record<string, {        // plugins at latest version
    id: string;
    slug: string;
    plugin: string;
    new_version: string;
    url: string;
    package: string;
    icons: Record<string, string>;
    banners: Record<string, string>;
    banners_rtl: Record<string, string>;
    tested: string;
    requires_php: string;
    compatibility: Record<string, object>;
  }>;
  translations: TranslationUpdate[];
}
```

The `checked` map is compared against the versions returned by the `.org API` to determine which plugins have updates. WordPress uses `plugins_api('query_plugins', {installed_plugins: slugs})` or a batch version check endpoint.

### 8.2 Update Detection and the `upgrade` View

During `WP_Plugins_List_Table::prepare_items()`:

1. `get_site_transient('update_plugins')` is fetched.
2. For each plugin in `$plugins['all']`, if `current->response[$plugin_file]` exists, the plugin is added to `$plugins['upgrade']` and its `update` key is set to `true`.
3. The `upgrade` view shows the count of plugins with available updates.

The update data from the transient is merged into the plugin data array. The `update-supported` flag (derived from presence in `response` or `no_update`) controls whether auto-update UI is shown.

### 8.3 Auto-updates

Auto-update state is stored in `auto_update_plugins` site option (array of plugin file paths). The `wp_update_plugins` WP-Cron hook processes this list.

Enable/disable per plugin:

- `GET plugins.php?action=enable-auto-update&plugin={path}&_wpnonce={nonce}` — nonce action `updates`
- `GET plugins.php?action=disable-auto-update&plugin={path}&_wpnonce={nonce}` — nonce action `updates`

Bulk enable/disable:

- `POST plugins.php` with `action=enable-auto-update-selected` or `action=disable-auto-update-selected`, `checked[]`, nonce `bulk-plugins`

Both single and bulk actions require `update_plugins` capability, `wp_is_auto_update_enabled_for_type('plugin')` to return true, and must be on the network admin screen if multisite.

After updating the `auto_update_plugins` option, stale entries (plugins no longer installed) are cleaned up by intersecting with `array_keys(get_plugins())`.

**Filter:** `auto_update_plugin` — return `true`/`false`/`null` to force/prevent/defer auto-update for a given plugin.

### 8.4 Update Nag

The update nag on plugins.php appears as a `plugin-update-tr` row (a secondary `<tr>` after each plugin row) whenever the plugin has an entry in `update_plugins->response`. It contains:

- "There is a new version of {plugin} available. View version {n} details or update now."
- Compatible: warning-style notice.
- Incompatible with WP or PHP: error-style notice explaining which requirement fails.

The update row is rendered by `wp_plugin_update_row()`.

---

## Section 9: Plugin Editor

### 9.1 Plugin Discovery and File Listing

When the editor loads:

1. `get_plugins()` enumerates all installed plugins (see Section 10.1 for how this works).
2. If `$_REQUEST['plugin']` is set, that plugin is selected. Otherwise, if `$_REQUEST['file']` is set, the plugin owning that file is found by matching `dirname($file)` against `dirname($plugin_candidate)` for each known plugin. Otherwise the first plugin in the sorted list is selected.
3. `get_plugin_files($plugin)` enumerates all files within the plugin's directory (recursively, excluding `CVS`, `node_modules`, `vendor`, `bower_components`). Files are returned as paths relative to `WP_PLUGIN_DIR`.
4. The selected `$file` defaults to `$plugin_files[0]` (the main plugin file).
5. `wp_get_plugin_file_editable_extensions($plugin)` returns editable extensions; defaults to `php`.
6. `validate_file_to_edit($file, $plugin_files)` validates the file is in the allowed list.
7. The file tree sidebar renders via `wp_print_plugin_file_tree(wp_make_plugin_file_tree($plugin_editable_files))`.

### 9.2 Plugin Selection Dropdown

A `<select name="plugin">` lists all installed plugins by name (using `get_plugins()` with `Name` key). Submitting the selection reloads the editor to `plugin-editor.php?plugin={selected}`.

### 9.3 Editing and Saving

The file content is read with `file_get_contents()` and HTML-escaped. The form posts `action=update`, `newcontent`, `file`, `plugin`, nonce `edit-plugin_{file}` to `plugin-editor.php`.

Server-side processing via `wp_edit_theme_plugin_file()`:

1. Validates the `action` is `update`.
2. Checks the nonce (`edit-plugin_{file}` for plugins, `edit-theme_{stylesheet}_{file}` for themes).
3. Validates the file is writable.
4. Writes the new content to the file.
5. If the file is a PHP file, attempts syntax check via `wp_syntax_highlight()` or error recovery.

On success: `wp_redirect("plugin-editor.php?a=1&plugin={plugin}&file={file}")`.

On error: returns `WP_Error` with the error message, and the form is re-rendered with the attempted content pre-filled.

### 9.4 Editable Extensions

The function `wp_get_plugin_file_editable_extensions($plugin)` returns the array of file extensions editable in the plugin editor. The default is `['php']`.

**Filter:** `editable_extensions` — modify the list of editable extensions.

### 9.5 Warning Dialog

On first visit (based on `plugin_editor_notice` in `dismissed_wp_pointers` user meta), a modal warning dialog is shown:

- "Heads up! You appear to be making direct edits to your plugin..."
- "Go back" link (to HTTP referer, excluding `plugin-editor.php` and `wp-login.php`; falls back to `admin_url('/')`)
- "I understand" button (dismisses via Ajax)

### 9.6 Active Plugin Warning

When editing a file belonging to an active plugin, an inline warning notice is shown within the form:

> "Warning: Making changes to active plugins is not recommended."

This is shown only when the file is writable (the save button is present). If the file is read-only, a file permissions message is shown instead of the save button.

### 9.7 PHP Documentation Lookup

Identical to the theme editor (Section 9 of themes spec): `wp_doc_link_parse()` extracts WordPress function names from PHP files, populating a documentation `<select>` that opens the API reference in a new window.

---

## Section 10: Must-Use Plugins and Drop-ins

### 10.1 Must-Use Plugins

Must-use plugins (mu-plugins) reside in `WP_CONTENT_DIR/mu-plugins/` (`wp-content/mu-plugins/`). They are loaded automatically on every request, before regular plugins. They cannot be activated or deactivated.

**Discovery (`get_mu_plugins()`):**

- Scans `WPMU_PLUGIN_DIR` for `.php` files directly in that directory (not subdirectories).
- Each file is processed through `get_plugin_data()` to read header metadata.
- If a file named `index.php` has a file size of 30 bytes or less, it is excluded (it is a stub silence file).
- Files are sorted by name.
- Returns an array keyed by filename.

**Display in the list table:**

- Shown under the "Must-Use" status view (`plugin_status=mustuse`).
- The checkbox column is suppressed (no bulk actions available).
- The auto-updates column is suppressed.
- Extra navigation shows: "Files in the {mu-plugins directory path} directory are executed automatically."
- Row actions are empty — no activate, deactivate, delete, or edit actions.
- `is_active` is hardcoded to `true` for all must-use plugins.

### 10.2 Drop-ins

Drop-ins are special single PHP files placed in `WP_CONTENT_DIR` (`wp-content/`) that override or extend core WordPress functionality.

**Known drop-in filenames and their purposes:**

| Filename | Purpose | Activation condition |
|---|---|---|
| `advanced-cache.php` | Advanced caching plugin | `WP_CACHE` constant is `true` |
| `db.php` | Custom database class | Auto-loaded on startup |
| `db-error.php` | Custom database error message | Auto on DB error |
| `install.php` | Custom installation script | Auto on installation |
| `maintenance.php` | Custom maintenance message | Auto during maintenance |
| `object-cache.php` | External object cache | Auto-loaded on startup |
| `php-error.php` | Custom PHP error message | Auto on PHP error |
| `fatal-error-handler.php` | Custom PHP fatal error handler | Auto on fatal error |
| `sunrise.php` | Executed before Multisite loads | `SUNRISE` constant (multisite only) |
| `blog-deleted.php` | Custom site deleted message | Auto (multisite only) |
| `blog-inactive.php` | Custom site inactive message | Auto (multisite only) |
| `blog-suspended.php` | Custom site suspended message | Auto (multisite only) |

**Discovery (`get_dropins()`):**

- Calls `_get_dropins()` for the canonical list.
- Scans `WP_CONTENT_DIR` for files that match known drop-in filenames.
- Processes each through `get_plugin_data()`.
- Returns an array keyed by filename.

**Active status determination in the list table:**

- If the drop-in's activation condition is `true` (no constant required): `is_active = true`.
- If the activation condition is a constant name and `defined($constant) && constant($constant)`: `is_active = true`.
- Otherwise: `is_active = false`. The description shows "Inactive: Requires {CONSTANT_NAME} in wp-config.php."

**Display in the list table:**

- Shown under the "Drop-in" / "Drop-ins" status view (`plugin_status=dropins`).
- Checkbox column suppressed. Auto-updates column suppressed.
- Extra navigation shows: "Drop-ins are single files, found in the {wp-content directory} directory..."
- Row actions: empty.
- The `name` column shows the filename with the display name on a second line if different.

---

## Section 11: Key Hooks and Filters

### Plugin Activation / Deactivation

| Hook | When Fired |
|---|---|
| `activate_plugin` | Before a plugin is activated (single or network; not fired if `$silent=true`) |
| `activate_{plugin_file}` | As a specific plugin is being activated (dynamic; used by `register_activation_hook()`) |
| `activated_plugin` | After a plugin has been activated (not if silent) |
| `deactivate_plugin` | Before a plugin is deactivated (not if silent) |
| `deactivate_{plugin_file}` | As a specific plugin is being deactivated (dynamic; used by `register_deactivation_hook()`) |
| `deactivated_plugin` | After a plugin has been deactivated (not if silent) |

### Plugin Deletion

| Hook | When Fired |
|---|---|
| `delete_plugin` | Immediately before a plugin deletion attempt |
| `deleted_plugin` | Immediately after a deletion attempt (with bool success flag) |
| `uninstall_{plugin_file}` | Fired by `uninstall_plugin()` if an uninstall hook is registered |

### List Table and Display

| Filter | Description |
|---|---|
| `all_plugins` | Filter the full array of plugins shown in the list table |
| `plugins_list` | Filter the categorized plugins array after status bucketing |
| `show_advanced_plugins` | Control whether mustuse/dropin plugins are shown (receives `$type`) |
| `show_network_active_plugins` | Whether to show network-active plugins on single-site admin |
| `plugin_action_links` | Global filter for all plugin row action links |
| `plugin_action_links_{plugin_file}` | Per-plugin row action links filter (dynamic) |
| `plugin_row_meta` | Add or remove links in the plugin description meta row |
| `plugin_files_exclusions` | Directories/files to exclude when scanning plugin files |
| `network_admin_plugin_action_links` | Row action links on the network admin screen |

### Auto-updates

| Filter | Description |
|---|---|
| `auto_update_plugin` | Per-plugin auto-update control; return true/false/null |
| `auto_update_plugins` | Filter the list of plugins to auto-update |

### Plugin Install

| Filter | Description |
|---|---|
| `plugins_api_args` | Modify `plugins_api()` request arguments |
| `plugins_api` | Short-circuit `plugins_api()` entirely |
| `plugins_api_result` | Filter `plugins_api()` response |
| `install_plugins_tabs` | Add/remove tabs on the plugin installer screen |
| `install_plugins_nonmenu_tabs` | Tabs that don't appear in the navigation |

### Plugin Editor

| Filter | Description |
|---|---|
| `editable_extensions` | Add/remove file extensions editable in the plugin editor |
| `wp_plugin_file_editable_extensions` | Alias; per-plugin editable extensions |

### Page Render

| Hook | Description |
|---|---|
| `pre_current_active_plugins` | Fires before the plugins list table is rendered (passes all plugins array) |
| `install_plugins_pre_{tab}` | Fires before each tab on the installer page |
| `install_plugins_{tab}` | Fires in each installer tab body |
| `install_plugins_upload` | Fires to render the upload form |

---

## Section 12: TypeScript Interface Sketch

```typescript
// -------------------------------------------------------
// Plugin file header metadata (from get_plugin_data())
// -------------------------------------------------------

interface PluginData {
  Name: string;
  PluginURI: string;
  Version: string;
  Description: string;
  Author: string;          // May contain HTML anchor if markup=true
  AuthorURI: string;
  TextDomain: string;
  DomainPath: string;
  Network: boolean;        // true = network-only plugin
  RequiresWP: string;      // e.g. "5.0"
  RequiresPHP: string;     // e.g. "7.4"
  UpdateURI: string;
  RequiresPlugins: string; // comma-separated .org slugs
  Title: string;           // = Name (with link markup if markup=true)
  AuthorName: string;      // = Author (plain text)
  // Runtime fields added during list table preparation:
  update?: true;
  'update-supported'?: boolean;
  'auto-update-forced'?: boolean;
  slug?: string;           // from update API response
}

// -------------------------------------------------------
// List table plugin status buckets
// -------------------------------------------------------

type PluginStatus =
  | 'all'
  | 'active'
  | 'inactive'
  | 'recently_activated'
  | 'upgrade'
  | 'mustuse'
  | 'dropins'
  | 'paused'
  | 'auto-update-enabled'
  | 'auto-update-disabled'
  | 'search';

type PluginsBuckets = Record<PluginStatus, Record<string, PluginData>>;

// -------------------------------------------------------
// update_plugins transient
// -------------------------------------------------------

interface PluginUpdateEntry {
  id: string;
  slug: string;
  plugin: string;
  new_version: string;
  url: string;
  package: string;
  icons: Record<string, string>;
  banners: Record<string, string>;
  banners_rtl: Record<string, string>;
  tested: string;
  requires_php: string;
  compatibility: Record<string, object>;
}

interface UpdatePluginsTransient {
  last_checked: number;
  checked: Record<string, string>;
  response: Record<string, PluginUpdateEntry>;
  no_update: Record<string, PluginUpdateEntry>;
  translations?: TranslationUpdate[];
}

interface TranslationUpdate {
  type: 'plugin' | 'theme';
  slug: string;
  language: string;
  version: string;
  updated: string;
  package: string;
  autoupdate: boolean;
}

// -------------------------------------------------------
// plugins_api shapes
// -------------------------------------------------------

type PluginsApiAction =
  | 'query_plugins'
  | 'plugin_information'
  | 'hot_categories'
  | 'hot_tags';

interface PluginsApiFields {
  banners?: boolean;
  icons?: boolean;
  reviews?: boolean;
  compatibility?: boolean;
  active_installs?: boolean;
  sections?: boolean;
  short_description?: boolean;
  tags?: boolean;
  versions?: boolean;
  screenshots?: boolean;
  requires?: boolean;
  tested?: boolean;
  requires_php?: boolean;
  rating?: boolean;
  ratings?: boolean;
  num_ratings?: boolean;
  downloaded?: boolean;
  last_updated?: boolean;
  added?: boolean;
  homepage?: boolean;
  donate_link?: boolean;
  contributors?: boolean;
  download_link?: boolean;
  author_profile?: boolean;
}

interface PluginsApiArgs {
  search?: string;
  author?: string;
  tag?: string | string[];
  browse?: 'featured' | 'popular' | 'recommended' | 'favorites' | 'beta';
  user?: string;
  slug?: string;
  per_page?: number;
  page?: number;
  locale?: string;
  installed_plugins?: string[];
  fields?: PluginsApiFields;
}

interface PluginInfoApiResult {
  name: string;
  slug: string;
  version: string;
  author: string;
  author_profile: string;
  requires: string;
  tested: string;
  requires_php: string;
  rating: number;
  num_ratings: number;
  ratings: Record<string, number>;
  active_installs: number;
  downloaded: number;
  last_updated: string;
  added: string;
  homepage: string;
  donate_link: string;
  download_link: string;
  sections: {
    description: string;
    installation?: string;
    faq?: string;
    screenshots?: string;
    other_notes?: string;
    changelog?: string;
  };
  banners: { low?: string; high?: string };
  icons: { '1x'?: string; '2x'?: string; svg?: string };
  short_description: string;
  tags: Record<string, string>;
  versions: Record<string, string>;
  contributors: Record<string, {
    profile: string;
    avatar: string;
    display_name: string;
  }>;
  compatibility: Record<string, Record<string, object>>;
  external?: boolean;
}

interface PluginsApiQueryResult {
  plugins: PluginInfoApiResult[];
  info: {
    page: number;
    pages: number;
    results: number;
  };
}

// -------------------------------------------------------
// Drop-in descriptor
// -------------------------------------------------------

interface DropInDescriptor {
  description: string;
  constant: string | true;  // true = always active, string = constant name
}

type DropInsMap = Record<string, [string, string | true]>;

// -------------------------------------------------------
// Plugin row actions
// -------------------------------------------------------

interface PluginRowActions {
  deactivate?: string;   // HTML anchor or plain text
  activate?: string;     // HTML anchor or plain text
  delete?: string;       // HTML anchor or plain text
  edit?: string;         // HTML anchor
  details?: string;      // HTML anchor (Thickbox)
  network_active?: string;
  network_only?: string;
  resume?: string;       // HTML anchor
}

// -------------------------------------------------------
// Plugin editor types
// -------------------------------------------------------

interface PluginEditorSettings {
  codeEditor: CodeEditorSettings | false;
}

interface CodeEditorSettings {
  codemirror: Record<string, unknown>;
  csslint: Record<string, unknown>;
  jshint: Record<string, unknown>;
  htmlhint: Record<string, unknown>;
}

// -------------------------------------------------------
// activate_plugin result
// -------------------------------------------------------

type ActivatePluginResult = null | PluginActivationError;

interface PluginActivationError {
  code:
    | 'no_valid_plugins'
    | 'plugin_not_found'
    | 'unexpected_output'
    | 'requirements_not_met';
  message: string;
  data?: unknown;
}

// -------------------------------------------------------
// delete_plugins result
// -------------------------------------------------------

type DeletePluginsResult = true | null | PluginDeleteError;

interface PluginDeleteError {
  code:
    | 'fs_unavailable'
    | 'fs_error'
    | 'fs_no_plugins_dir'
    | 'could_not_remove_plugin';
  message: string;
  data?: unknown;
}
```

---

## Section 13: Design Patterns

### 13.1 Server-Authoritative Status Bucketing

The `WP_Plugins_List_Table::prepare_items()` method classifies every installed plugin into multiple status buckets in a single pass. The result is a flat `plugins` array with keys for each status (all, active, inactive, etc.) populated with references to the same plugin data objects. Counts for each bucket populate the view link badges.

In a TypeScript rewrite, this is naturally expressed as a derivation step: start with the full plugin list and compute derived arrays for each status using filter conditions. The view badges are then the `.length` of each derived array.

### 13.2 Nonce-per-Action Pattern

Every destructive action uses a distinct nonce. Single-item actions use nonces keyed to `{action}_{plugin_file}` (e.g., `activate-plugin_my-plugin/my-plugin.php`). Bulk actions use the generic `bulk-plugins` nonce. This allows the server to confirm that the submitted action matches the intended target without relying on session state.

### 13.3 Confirmation Screen (non-destructive two-step)

The delete flow uses a two-step confirm pattern: the first POST renders a confirmation screen (no mutation), and the confirmation form POSTs again with `verify-delete=1`. The hidden inputs carry the full list of plugins to delete. This prevents accidental deletion and allows the user to see exactly what will be removed before proceeding.

### 13.4 Activation Sandbox (Error Isolation)

Before recording a plugin as active, `plugin_sandbox_scrape()` includes the plugin file inside `ob_start()`. If the file throws a fatal error, PHP's error handler catches it and the error redirect URL (pre-set before the sandbox include) is used. Output buffering captures any unexpected text output. This isolation prevents a broken plugin from corrupting the admin state.

In a TypeScript/Node.js rewrite, equivalent sandboxing would require a separate worker or subprocess to safely execute plugin code, or a different architecture entirely (not executing untrusted PHP).

### 13.5 Filesystem Abstraction for Delete/Install

Plugin deletion and installation both use `WP_Filesystem`, which may prompt for FTP credentials if the web server process cannot write to `WP_PLUGIN_DIR`. In a TypeScript rewrite, running the server with appropriate file system permissions eliminates this prompt-based credential flow. File operations can be performed directly with Node.js `fs` module calls, potentially gated behind an API endpoint that verifies capability before executing.

### 13.6 Option-Based Delete Result

The delete result is stored in `plugins_delete_result_{user_id}` option rather than a URL parameter or transient. This handles the case where a plugin's uninstall hook flushes the object cache (which would destroy a transient). The option is read on the next page load and deleted immediately after reading. In a TypeScript rewrite, this could be replaced with a session-scoped flash message or a server-sent event.

### 13.7 Recently Activated List

When a plugin is deactivated, its file path and the deactivation timestamp are stored in the `recently_activated` option (array of `plugin_file => timestamp`). On the list table, entries older than `WEEK_IN_SECONDS` (604800 seconds) are pruned on each page load and the option is updated. This makes the "Recently Active" view eventually consistent rather than requiring explicit cleanup. The "Clear List" button empties the option entirely.

### 13.8 Per-Plugin Capability Meta

WordPress uses "meta-capabilities" for `activate_plugin`, `deactivate_plugin`, and `resume_plugin` that are checked per plugin file. The `map_meta_cap()` function maps these to primitive capabilities (`activate_plugins`, `deactivate_plugins`, etc.) by default, but this mapping can be altered by plugins via the `map_meta_cap` filter. This allows granular capability grants per plugin if needed (e.g., allowing a user to activate only a specific plugin).

### 13.9 Drop-in Constant Gating

Drop-ins have a unique activation model: they are active only when a specific PHP constant is defined and truthy in `wp-config.php`. The list table reads this at display time by calling `defined($constant) && constant($constant)`. This means a drop-in file can be present in `wp-content/` but completely inert unless the constant is set. The UI displays "Inactive: Requires define('{CONSTANT}', true); in wp-config.php" for such drop-ins.

---

## 14. Tovu Reconstruction Notes

### 14.1 Why this exists

Plugin management exists because extension installation is not enough. Operators need lifecycle controls, sandboxed activation, capability-gated actions, and a reliable model of what is installed, active, recently active, or broken.

### 14.2 What Tovu should preserve

- Extension lifecycle state as first-class platform data
- Safe activation/deactivation flows with rollback or isolation behavior
- Capability-gated admin actions owned by the server
- Distinction between install-time filesystem state and runtime activation state

### 14.3 What Tovu can simplify

- Tovu should not inherit PHP plugin sandbox assumptions; it can use safer runtime boundaries from the start
- FTP credential flows are unnecessary if Tovu owns its deployment/runtime model
- “Recently activated” and flash-result UX can start simpler if lifecycle state is still explicit

### 14.4 Possible Tovu seams

- `src/features/extensions/` for install/activate/deactivate/delete use cases
- `src/core/ports/ExtensionLifecyclePort.ts` for runtime enable/disable and health checks
- `src/core/ports/ExtensionPackagePort.ts` for package/artifact IO

### 14.5 Suggested priority

- `V1`: installed vs active lifecycle, safe activation checks, capability-gated admin actions
- `Later`: richer lifecycle analytics, quarantine/recovery, historical activation timelines
