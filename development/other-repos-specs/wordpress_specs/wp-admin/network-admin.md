# WordPress Network Admin — TypeScript Rewrite Specification

**Source files analyzed:**
- `wp-admin/network/index.php`
- `wp-admin/network/sites.php`
- `wp-admin/network/site-new.php`
- `wp-admin/network/site-info.php`
- `wp-admin/network/site-settings.php`
- `wp-admin/network/site-users.php`
- `wp-admin/network/site-themes.php`
- `wp-admin/network/plugins.php`
- `wp-admin/network/themes.php`
- `wp-admin/network/settings.php`
- `wp-admin/network/upgrade.php`
- `wp-admin/network/users.php`

---

## Section 1: Overview — The Network Admin Context

Network Admin is a separate administrative context in WordPress Multisite. It is accessible only when WordPress is installed in multisite mode (`is_multisite() === true`).

### Constants and Context Signals

| Constant | Value | Set By |
|----------|-------|--------|
| `WP_NETWORK_ADMIN` | `true` | Set before any network admin screen loads |
| `is_network_admin()` | `true` | Function returning `WP_NETWORK_ADMIN === true` |

### URL Structure

- Single-site admin: `/wp-admin/`
- Network admin: `/wp-admin/network/`

Each screen in `/wp-admin/network/` bootstraps via its own `admin.php` located at `/wp-admin/network/admin.php`, which in turn loads the main WordPress bootstrap with the network admin context flag set.

### Capability: Super Admin

The network admin is accessible only to **super admins**. A super admin is a user designated in the `super_admins` site option (an array of user logins) or, by default, the user with ID 1. Super admins bypass all capability checks across all sites in the network.

### Menu Structure (Network Admin)

The network admin menu contains:
- Dashboard (`index.php`)
- Sites (`sites.php`) — submenus: All Sites, Add New Site
- Users (`users.php`) — submenus: All Users, Add New User
- Themes (`themes.php`) — submenus: Installed Themes, Add New Theme
- Plugins (`plugins.php`) — submenus: Installed Plugins, Add New Plugin
- Settings (`settings.php`)
- Updates (`upgrade.php`)

---

## Section 2: Network Dashboard (network/index.php)

### Access

Requires `manage_network` capability.

### Bootstrap

- Loads `wp-admin/includes/dashboard.php`.
- Calls `wp_dashboard_setup()` to register dashboard widgets.
- Calls `wp_dashboard()` to render the widget grid.
- Enqueues `dashboard` and `plugin-install` scripts.
- Adds Thickbox.

### Dashboard Widgets (Network-Specific)

The network dashboard renders the same widget grid framework as the regular dashboard. However, the available widgets differ for the network context. Key widgets present in the network dashboard include:

**Right Now Widget (`dashboard_network_right_now`):**
- Displays current counts of total sites and total users on the network.
- Shows "Create a New User" and "Create a New Site" action links.
- Shows WordPress version and links to available updates.

**Activity Widget:**
- May be present depending on network configuration.

**WordPress News Widget:**
- Fetches news from WordPress.org.

### Help Tabs

Two help tabs are registered:
1. **Overview** — explains the Network Admin purpose and lists capabilities (manage sites, users, themes, plugins, update, settings).
2. **Quick Tasks** — explains the Right Now widget search functionality and how to search for users (by email/username, wildcard support) and sites (by path or domain).

---

## Section 3: Sites List (network/sites.php)

### Access

Requires `manage_sites` capability.

### List Table: `WP_MS_Sites_List_Table`

The sites list uses the `WP_MS_Sites_List_Table` class. It renders a paginated, searchable, sortable table of all sites in the network.

#### Columns

| Column | Sortable | Content |
|--------|----------|---------|
| Site URL (checkbox) | Yes | Domain + path, linked to site frontend |
| Last Updated | Yes | `last_updated` timestamp |
| Registered | Yes | `registered` date |
| Users | No | Count of users on the site |

#### Row Actions (on hover)

Available for non-main-site entries:

| Action | Label | Behavior |
|--------|-------|----------|
| Edit | Edit | Links to `site-info.php?id={site_id}` |
| Dashboard | Dashboard | Links to the site's `/wp-admin/` |
| Deactivate | Deactivate | Sets `deleted=1` via `update_blog_status()`. Flagged-for-deletion sites are inaccessible to their users. |
| Activate | Activate | Sets `deleted=0` (shown when site is deactivated). |
| Archive | Archive | Sets `archived=1`. Archived sites are inaccessible. |
| Unarchive | Unarchive | Sets `archived=0`. |
| Spam | Spam | Sets `spam=1`. Spam sites are inaccessible. |
| Not Spam | Not Spam | Sets `spam=0`. |
| Delete | Delete | Permanently deletes the site and its uploads. Requires confirmation. Non-reversible. |
| Visit | Visit | Links to site frontend in new tab. |

For the main site, only Edit, Dashboard, and Visit are available.

#### Confirmation Screen

Single-site actions (`deactivateblog`, `archiveblog`, `spamblog`, `deleteblog`, `activateblog`, `unarchiveblog`, `unspamblog`) show an intermediate confirmation page at `sites.php?action=confirm&action2={site_action}&id={site_id}`. This page:
1. Verifies nonce `{site_action}_{site_id}`.
2. Blocks if `is_main_site($id)` is true.
3. Shows a warning for destructive operations.
4. Renders a POST form to `sites.php?action={site_action}`.

#### Bulk Actions

Available bulk actions:
- **Spam** → marks selected sites as spam (skips main site)
- **Not Spam** → removes spam flag
- **Delete** → redirects to confirmation screen listing all selected sites

Bulk delete confirmation is a full-page form listing sites with checkboxes, posting to `sites.php?action=delete_sites`.

#### Search

The search box at the top submits to `sites.php?action=blogs&s={query}`. Search matches domain, path, or site ID. Results show with subtitle "Search results for: {query}".

#### Status Messages

After an action, `?updated={action_slug}` is appended to the redirect URL. The following messages are displayed:

| `updated` value | Message |
|-----------------|---------|
| `all_notspam` | "Sites removed from spam." |
| `all_spam` | "Sites marked as spam." |
| `all_delete` | "Sites permanently deleted." |
| `delete` | "Site permanently deleted." |
| `not_deleted` | "Sorry, you are not allowed to delete that site." |
| `archiveblog` | "Site archived." |
| `unarchiveblog` | "Site unarchived." |
| `activateblog` | "Site deletion flag removed." |
| `deactivateblog` | "Site flagged for deletion." |
| `unspamblog` | "Site removed from spam." |
| `spamblog` | "Site marked as spam." |

Custom action messages: `network_sites_updated_message_{action}` filter.

#### Blog Status Flags (stored in wp_blogs table)

| Column | Type | Meaning |
|--------|------|---------|
| `public` | tinyint 0/1 | Whether the site is publicly listed |
| `archived` | tinyint 0/1 | Site is archived (inaccessible) |
| `spam` | tinyint 0/1 | Site is marked as spam |
| `deleted` | tinyint 0/1 | Site is flagged for deletion |
| `mature` | tinyint 0/1 | Site is marked as containing mature content |

---

## Section 4: Add New Site (network/site-new.php)

### Access

Requires `create_sites` capability.

### Form Fields

| Field Name | HTML Name | Type | Validation |
|------------|-----------|------|------------|
| Site Address | `blog[domain]` | text | Required; matches `[a-zA-Z0-9-]+`; lowercase enforced; must not be a reserved subdirectory name |
| Site Title | `blog[title]` | text | Required |
| Site Language | `WPLANG` | dropdown | Optional; must be in `get_available_languages()` or downloadable |
| Admin Email | `blog[email]` | email | Required; must be valid email |

#### Address Handling by Installation Type

**Subdomain install** (`is_subdomain_install() === true`):
- The domain input is just the subdomain portion.
- The full domain is constructed as: `{domain}.{network_domain}` (without `www.` prefix).
- The path is the network path.

**Subdirectory install** (`is_subdomain_install() === false`):
- The path is constructed as: `{network_path}{domain}/`.
- The domain is the network domain.
- Reserved names for subdirectory installs are checked (e.g., `wp-admin`, `blog`, `feed`, etc.).

#### User Creation Logic

1. Look up the email using `email_exists($email)` to get an existing user ID.
2. If the email does not exist:
   - Check if `username_exists($domain)` — die if username conflicts with the site slug.
   - Call `wp_generate_password(12, false)` to generate a random password.
   - Call `wpmu_create_user($domain, $password, $email)` to create the user.
   - Fire `pre_network_site_new_created_user` hook before creation.
   - Fire `network_site_new_created_user($user_id)` hook after creation.
3. If the email exists, use the existing user ID.

#### Site Creation

Calls `wpmu_create_blog($newdomain, $path, $title, $user_id, $meta, $network_id)` where:
- `$meta` = `['public' => 1, 'WPLANG' => $language_code]`
- `$network_id` = current network ID

After successful creation:
1. If user is not a super admin and has no `primary_blog` option, set it: `update_user_option($user_id, 'primary_blog', $id, true)`.
2. Send new site admin notification: `wpmu_new_site_admin_notification($id, $user_id)`.
3. Send welcome notification to site owner: `wpmu_welcome_notification($id, $user_id, $password, $title, ['public' => 1])`.
4. Redirect to `site-new.php?update=added&id={new_site_id}`.

#### Language Installation

If `$_POST['WPLANG']` is set:
- Empty string → English (default, no language pack needed).
- In `get_available_languages()` → use as-is.
- Not available but user has `install_languages` and `wp_can_install_language_pack()` → call `wp_download_language_pack($lang)`.

#### Nonce

Form nonce: `add-blog`, field name `_wpnonce_add-blog`, action: `add-site`.

#### Extensibility Hook

`network_site_new_form` fires at the end of the form, before the submit button.

---

## Section 5: Site Editing

Each site in the network can be edited through four sub-screens, all accessible via `site-info.php?id={site_id}` (and sibling URLs). All require `manage_sites` capability. They share a common navigation rendered by `network_edit_site_nav()`.

### Navigation Tabs

The `network_edit_site_nav()` function renders a tab bar with links to:
- `site-info.php?id={id}` — "Info"
- `site-settings.php?id={id}` — "Settings"
- `site-users.php?id={id}` — "Users"
- `site-themes.php?id={id}` — "Themes"

Additional tabs can be registered via the `network_edit_site_nav_links` filter.

All editing screens display a common header:
- Page heading: "Edit Site: {site_blogname}"
- Action links: "Visit" (frontend) | "Dashboard" (site admin)

---

### 5a: site-info.php

Edits the core attributes of a site stored in the `wp_blogs` table and the site's `home`/`siteurl` options.

#### Form: `POST site-info.php?action=update-site`

Nonce: `edit-site`

**Fields:**

| Field Name | HTML Name | Notes |
|------------|-----------|-------|
| Site Address (URL) | `blog[url]` | For non-main sites only; displays as read-only for main site |
| Registered | `blog[registered]` | `YYYY-MM-DD HH:MM:SS` |
| Last Updated | `blog[last_updated]` | `YYYY-MM-DD HH:MM:SS` |
| Public | `blog[public]` | checkbox |
| Archived | `blog[archived]` | checkbox (non-main sites only) |
| Spam | `blog[spam]` | checkbox (non-main sites only) |
| Flagged for Deletion | `blog[deleted]` | checkbox (non-main sites only) |
| Mature | `blog[mature]` | checkbox |

**Processing Logic:**

1. Switch to the site context: `switch_to_blog($id)`.
2. Delete `rewrite_rules` option (flush rewrite rules for the site).
3. Parse new URL if not main site; extract scheme, domain, and path.
4. For main site: lock domain and path to existing values.
5. Boolean checkbox values: `1` if POST field present, `0` if absent. Non-boolean values (other than 0/1) are preserved unchanged.
6. Call `update_blog_details($id, $blog_data)`.
7. Update `home` option if the old home URL's host/path matched the old domain/path.
8. Update `siteurl` option if the old siteurl's host/path matched.
9. `restore_current_blog()`.
10. Redirect to `site-info.php?update=updated&id={id}`.

Extensibility: `network_site_info_form($id)` fires at end of form.

---

### 5b: site-settings.php

Displays and edits all non-private, non-serialized options for a site from `{prefix}options`.

#### Data Source

A SQL query fetches all rows from `{blog_prefix}options` where:
- `option_name` does NOT start with `_` (private options excluded)
- `option_name` does NOT end with `user_roles`

```sql
SELECT * FROM {prefix}options
WHERE option_name NOT LIKE '_%'
AND option_name NOT LIKE '%user_roles'
```

#### Rendering Rules

- If the value is serialized but is a serialized string: unserialize and display as HTML-escaped text.
- If the value is serialized but NOT a serialized string (complex structure): display as `SERIALIZED DATA`, field is disabled.
- If the value contains newlines: render as a `<textarea>`.
- Otherwise: render as an `<input type="text">`.

#### Form: `POST site-settings.php?action=update-site`

Posted as `option[{option_name}] = {value}`. Processing:
1. Switch to blog context.
2. Skip options where key is `0`, value is an array, or key is in `$skip_options` (`allowedthemes`).
3. Call `update_option($key, $value)` for each.
4. Fire `wpmu_update_blog_options($id)` action.
5. Restore current blog.
6. Redirect with `?update=updated`.

Special rules:
- `siteurl` and `home` are shown as read-only `<code>` on the main site.
- `default_role` gets special handling during the loop to capture its value (used elsewhere).

---

### 5c: site-users.php

Manages user membership for a specific site. Uses `WP_Users_List_Table` for the main list.

Switches to the target blog context (`switch_to_blog($id)`) before processing actions, then `restore_current_blog()` before rendering.

#### Actions

**`newuser` (POST, nonce `add-user` field `_wpnonce_add-new-user`):**
- Requires `user[username]` and `user[email]` in `$_POST['user']`.
- Generates random 12-char password.
- Creates user with `wpmu_create_user()`.
- Adds to site: `add_user_to_blog($id, $user_id, $role)`.
- Fires `network_site_users_created_user($user_id)`.

**`adduser` (POST, nonce `add-user` field `_wpnonce_add-user`):**
- Looks up existing user by login from `$_POST['newuser']`.
- Checks user is not already a member.
- Calls `add_user_to_blog($id, $user->ID, $role)`.

**`remove` (bulk, nonce `bulk-users`):**
- Requires `remove_users` capability.
- Calls `remove_user_from_blog($user_id, $id)` for each selected user.

**`promote` (bulk, nonce `bulk-users`):**
- Requires `promote_users` capability.
- Changes each selected user's role via `$user->set_role($role)`.
- Special value `'none'` → empty string → removes all roles for the site.
- Only works if user is already a member.

#### Forms Shown Below List Table

**Add Existing User** (shown unless `wp_is_large_network('users')` or filter `show_network_site_users_add_existing_form` returns false):
- Username input with autocomplete.
- Role dropdown (populated by `wp_dropdown_roles()` for the target site).
- Nonce: `add-user`, field `_wpnonce_add-user`.

**Add New User** (shown if `current_user_can('create_users')` and filter `show_network_site_users_add_new_form` returns true):
- Username, Email, Role inputs.
- Nonce: `add-user`, field `_wpnonce_add-new-user`.

---

### 5d: site-themes.php

Manages which themes are allowed (enabled) for a specific site, independently of network-level theme enablement.

Themes enabled at the network level do NOT appear in this list — only site-level allowances are managed here.

Uses `WP_MS_Themes_List_Table`.

#### Allowed Themes Option

Per-site theme permissions are stored in the `allowedthemes` option for the site (in `{prefix}options`). Format:

```typescript
type AllowedThemes = Record<string, true>;
// Example: { 'twentytwentyfour': true, 'storefront': true }
```

#### Actions

**`enable` (GET, nonce `enable-theme_{slug}`):**
- Adds `theme_slug: true` to `allowedthemes`.
- Updates option: `update_option('allowedthemes', $allowed_themes, false)` (does not autoload).

**`disable` (GET, nonce `disable-theme_{slug}`):**
- Removes the theme from `allowedthemes`.

**`enable-selected` / `disable-selected` (bulk, nonce `bulk-themes`):**
- Same logic applied to multiple themes from `$_POST['checked']`.

Note: `skip_options` in `site-settings.php` excludes `allowedthemes` from the settings form to prevent conflicts with this dedicated screen.

---

## Section 6: Network Plugins (network/plugins.php)

The network plugins screen (`/wp-admin/network/plugins.php`) proxies to the standard `wp-admin/plugins.php` screen but within the network admin context. The behavior is identical in terms of plugin management, but the context is different:

```php
// network/plugins.php content:
require __DIR__ . '/admin.php';
require ABSPATH . 'wp-admin/plugins.php';
```

### Network-Activate vs Site-Activate

When a plugin is **network-activated**, it is active across all sites without needing to be individually activated per site.

**Network-activated plugins** are stored in the site option (network-level):
```
active_sitewide_plugins: Record<plugin_file, timestamp>
// Example: { 'akismet/akismet.php': 1705000000, 'woocommerce/woocommerce.php': 1705000001 }
```

**Site-activated plugins** are stored per site in the `active_plugins` option:
```
active_plugins: string[]
// Example: ['contact-form-7/wp-contact-form-7.php']
```

### Activation Flow (Network Admin)

1. User clicks "Network Activate" link.
2. POST to `plugins.php?action=activate` with `plugin={file}` and nonce `activate-plugin_{file}`.
3. `activate_plugin($plugin_file)` is called.
4. On network admin context, plugin is added to `active_sitewide_plugins` site option instead of per-site `active_plugins`.

### Deactivation

"Network Deactivate" removes the plugin from `active_sitewide_plugins`.

### Plugin Delete

Plugins can be deleted from the network admin. The delete action removes the plugin files. Deletion is only possible when the plugin is not active anywhere.

### Capability Required

The network plugins screen requires `manage_network_plugins` capability.

---

## Section 7: Network Themes (network/themes.php)

### Access

Requires `manage_network_themes` capability.

### Network Enable vs Network Disable

Network theme enablement controls which themes are available for site administrators to choose across ALL sites. It does not change the currently active theme of any site.

**Network-enabled themes** are stored in the `allowedthemes` site option (network-level meta):
```typescript
type NetworkAllowedThemes = Record<string, true>;
// Stored in wp_sitemeta with meta_key='allowedthemes'
```

Enabling/disabling is done via:
- `WP_Theme::network_enable_theme($theme_slug)` — adds to network `allowedthemes`
- `WP_Theme::network_disable_theme($theme_slug)` — removes from network `allowedthemes`

### Actions

| Action | URL Param / Method | Nonce | Behavior |
|--------|-------------------|-------|----------|
| `enable` | GET `?action=enable&theme={slug}` | `enable-theme_{slug}` | Network enables one theme |
| `disable` | GET `?action=disable&theme={slug}` | `disable-theme_{slug}` | Network disables one theme |
| `enable-selected` | POST, bulk | `bulk-themes` | Network enables checked themes |
| `disable-selected` | POST, bulk | `bulk-themes` | Network disables checked themes |
| `update-selected` | POST, bulk | `bulk-themes` | Updates selected themes via iframe |
| `delete-selected` | POST, bulk | `bulk-themes` | Deletes themes (requires `delete_themes`) |
| `enable-auto-update` | GET | `updates` | Enables auto-update for one theme |
| `disable-auto-update` | GET | `updates` | Disables auto-update for one theme |
| `enable-auto-update-selected` | POST, bulk | `bulk-themes` | Bulk enable auto-updates |
| `disable-auto-update-selected` | POST, bulk | `bulk-themes` | Bulk disable auto-updates |

### Auto-Update Storage

```typescript
// Stored in site option 'auto_update_themes':
type AutoUpdateThemes = string[]; // array of theme slugs
```

Auto-update enablement requires `update_themes` capability and `wp_is_auto_update_enabled_for_type('theme')` to return true.

### Delete Confirmation

Deleting themes shows a warning that the theme "may be active on other sites in the network." Cannot delete the currently active theme on the main site.

### Theme Update via Iframe

The `update-selected` bulk action renders an iframe pointing to `update.php?action=update-selected-themes&themes={comma-separated-slugs}` to display update progress.

### Status Message Query Parameters

After actions, the redirect URL includes one of:
- `?enabled={count}` — theme(s) enabled
- `?disabled={count}` — theme(s) disabled
- `?deleted={count}` — theme(s) deleted
- `?enabled-auto-update={count}` — auto-update enabled
- `?disabled-auto-update={count}` — auto-update disabled
- `?error=none` — no theme selected
- `?error=main` — attempted to delete active main-site theme

---

## Section 8: Network Settings (network/settings.php)

### Access

Requires `manage_network_options` capability.

### Save Mechanism

Form POSTs to `settings.php` with nonce `siteoptions`. All options are saved via `update_site_option($key, $value)`. The `update_wpmu_options` action fires after all options are saved.

Redirect after save: `settings.php?updated=true`.

### Admin Email Change

The `new_admin_email` field (Network Admin Email) uses a confirmation mechanism:
1. When a new email is submitted, it is stored in the `network_admin_hash` site option as `['hash' => $hash, 'newemail' => $new_email]`.
2. An email is sent to the new address with a confirmation URL: `settings.php?network_admin_hash={hash}`.
3. When the confirmation URL is visited, `admin_email` site option is updated and the pending option is deleted.
4. A "Cancel" link dismisses the pending change: `settings.php?dismiss=new_network_admin_email` (nonce: `dismiss_new_network_admin_email`).

### All Settings Fields

#### Operational Settings

| Option Name | Site Option Key | Type | Default | Description |
|-------------|-----------------|------|---------|-------------|
| Network Title | `site_name` | text | — | The name of the network displayed in emails and admin |
| Network Admin Email | `new_admin_email` / `admin_email` | email | — | Admin contact; changes require confirmation |

#### Registration Settings

| Option Name | Site Option Key | Type | Values |
|-------------|-----------------|------|--------|
| Allow new registrations | `registration` | radio | `none` (disabled), `user` (user accounts only), `blog` (new sites for logged-in users), `all` (both) |
| Registration notification | `registrationnotification` | checkbox | `yes` (send email on each registration) or `no` (default when unchecked) |
| Add Users | `add_new_users` | checkbox | `1` = allow site admins to add users; `0` = deny |
| Banned Names | `illegal_names` | text | Space-separated list of disallowed usernames/site slugs |
| Limited Email Registrations | `limited_email_domains` | textarea | One email domain per line; restricts registrations to these domains |
| Banned Email Domains | `banned_email_domains` | textarea | One email domain per line; prevents registration from these domains |

Note: When subdomain install is enabled, a note suggests setting the `NOBLOGREDIRECT` constant in `wp-config.php` if registration is disabled.

Checkboxes default when unchecked:
- `registrationnotification` defaults to `'no'`
- `upload_space_check_disabled` defaults to `1`
- `add_new_users` defaults to `0`
- `menu_items` defaults to `[]`

#### New Site Settings

| Option Name | Site Option Key | Type | Description |
|-------------|-----------------|------|-------------|
| Welcome Email | `welcome_email` | textarea | Email sent to the owner of a newly created site |
| Welcome User Email | `welcome_user_email` | textarea | Email sent to newly registered users |
| First Post | `first_post` | textarea | Default content of the first post on a new site |
| First Page | `first_page` | textarea | Default content of the first page on a new site |
| First Comment | `first_comment` | textarea | Default first comment on a new site |
| First Comment Author | `first_comment_author` | text | Author name for the first comment |
| First Comment Email | `first_comment_email` | text | Email for the first comment author |
| First Comment URL | `first_comment_url` | text | URL for the first comment author |

#### Upload Settings

| Option Name | Site Option Key | Type | Default | Description |
|-------------|-----------------|------|---------|-------------|
| Site upload space | `blog_upload_space` / `upload_space_check_disabled` | number + checkbox | 100 MB | Max total upload size per site; checkbox enables/disables the limit |
| Upload file types | `upload_filetypes` | text | `jpg jpeg png gif` | Space-separated list of allowed file extensions |
| Max upload file size | `fileupload_maxk` | number | 300 | Maximum individual file size in kilobytes |

The `upload_space_check_disabled` checkbox is inverted in rendering: checked means the limit IS enabled (value `0`); unchecked means limit is disabled (value `1`).

#### Language Settings

Shown only if languages or translations are available:

| Option Name | Site Option Key | Type | Description |
|-------------|-----------------|------|-------------|
| Default Language | `WPLANG` | dropdown | Default locale for new sites; auto-downloads language pack if needed |

#### Menu Settings

Controlled by the `mu_menu_items` filter (default: `{ plugins: 'Plugins' }`). Each item in the filtered array becomes a checkbox that, when enabled, allows site administrators (non-super-admins) to access that admin menu.

| Option Name | Site Option Key | Type | Default | Description |
|-------------|-----------------|------|---------|-------------|
| Enable administration menus | `menu_items` | object | `{}` | Maps menu slugs to enabled/disabled state |

Example: If `menu_items['plugins'] === '1'`, site admins see the Plugins menu in their site admin.

#### Extensibility

`wpmu_options` action fires before the submit button, allowing plugins to add custom settings sections.

---

## Section 9: Network Upgrade (network/upgrade.php)

### Access

Requires `upgrade_network` capability.

### Purpose

After a WordPress core update, each site's database schema needs to be updated individually. This screen iterates all sites in the network 5 at a time and triggers the upgrade for each.

### Flow

The upgrade has two "actions" controlled by `$_GET['action']`:

#### `show` (default view)

Displays a notice if `get_site_option('wpmu_upgrade_site')` does not match the current `$wp_db_version` (global constant set by WordPress core). Shows an "Upgrade Network" button linking to `upgrade.php?action=upgrade`.

#### `upgrade` (processing)

1. On the first batch (`$n < 5`), store the current `$wp_db_version` in `wpmu_upgrade_site` site option.
2. Query 5 sites at a time (non-spam, non-deleted, non-archived, from current network, ordered by ID DESC):
   ```
   get_sites([
     spam: 0, deleted: 0, archived: 0,
     network_id: current_network_id,
     number: 5, offset: n,
     fields: 'ids', order: 'DESC', orderby: 'id',
     update_site_meta_cache: false
   ])
   ```
3. For each site:
   a. `switch_to_blog($site_id)` to get its `site_url()` and `admin_url('upgrade.php?step=upgrade_db')`.
   b. `restore_current_blog()`.
   c. Make HTTP GET to the site's upgrade URL with 120-second timeout.
   d. On WP_Error: `wp_die()` with error message.
   e. Fire `after_mu_upgrade($response)` action.
   f. Fire `wpmu_upgrade_site($site_id)` action.
4. Emit `<ul>` listing processed site URLs.
5. Emit JavaScript to auto-redirect to `upgrade.php?action=upgrade&n={n+5}` after 250ms.
6. Emit manual "Next Sites" button as fallback.
7. When `get_sites()` returns empty, display "All done!" and stop.

### Error Handling

If any HTTP GET request fails (WP_Error), the page calls `wp_die()` immediately with a message including the site URL and error message. The upgrade must be restarted manually from that point.

### Hooks

| Hook | Type | Description |
|------|------|-------------|
| `after_mu_upgrade` | action | Fires after each site's upgrade HTTP request; receives the HTTP response array |
| `wpmu_upgrade_site` | action | Fires after each site is processed; receives the site ID |
| `wpmu_upgrade_page` | action | Fires before the footer on the show screen |

---

## Section 10: Super Admin Management

Super admins are managed from `network/users.php` (the network users list) and `network/user-edit.php` (the edit user screen).

### What Makes a Super Admin

The `super_admins` site option stores an array of user login strings. Any user whose login appears in this array is a super admin. There is no separate super admin role — it is a flag checked via `is_super_admin($user_id)`.

```typescript
type SuperAdmins = string[]; // array of user login names
// Stored in wp_sitemeta as meta_key='super_admins'
```

### Granting Super Admin Status

On the Edit User screen (accessible from network user list → edit), a checkbox "Grant this user super admin privileges for the Network" is shown to the current super admin. Checking it and saving calls `grant_super_admin($user_id)`, which:
1. Fires `grant_super_admin` action hook.
2. Adds user login to `super_admins` site option array.
3. Fires `granted_super_admin` action hook.

Unchecking calls `revoke_super_admin($user_id)`:
1. Fires `revoke_super_admin` action hook.
2. Removes user login from `super_admins` site option array.
3. Fires `revoked_super_admin` action hook.

A super admin cannot revoke their own super admin status (prevented by both UI and function check).

### Network Users List (`WP_MS_Users_List_Table`)

Columns:
- Username (linked to edit user page)
- Name (display name)
- Email
- Registered date
- Sites (list of sites the user belongs to, linked to site edit pages)

Row actions: Edit (→ `user-edit.php?user_id={id}&action=edit`), Delete.

Bulk actions:
- **Delete** → Shows confirmation screen (`confirm_delete_users()`). User deletion (`wpmu_delete_user($id)`) removes the user from ALL sites and deletes the user record.
- **Spam** → Sets `spam=1` on the user record and marks all their non-main sites as spam. Super admins cannot be marked as spam.
- **Not Spam** → Sets `spam=0` and removes spam flag from all user sites.

### User Delete Flow

Deleting a network user (`action=dodelete`, nonce `ms-users-delete`):
1. For each site where the user has posts: optionally reassign posts to another user (POST `blog[{site_id}][{user_id}]` → `delete[{blogid}][{id}]` = `reassign`).
2. `remove_user_from_blog($id, $blogid, $reassign_user_id)` if reassigning.
3. `remove_user_from_blog($id, $blogid)` if not reassigning.
4. `wpmu_delete_user($id)` — deletes user account from network.
5. Redirect with `?updated=true&action=delete` or `all_delete`.

---

## Section 11: Key Hooks and Filters

### Actions

| Hook | Source File | Since | Description |
|------|-------------|-------|-------------|
| `wpmuadminedit` | Various network files | MU | Fires at start of network admin edit operations |
| `activate_blog` | `sites.php` | MU | Fires after a site's deletion flag is removed |
| `deactivate_blog` | `sites.php` | MU | Fires before a site is flagged for deletion |
| `after_mu_upgrade` | `upgrade.php` | MU | Fires after each per-site upgrade HTTP response |
| `wpmu_upgrade_site` | `upgrade.php` | MU | Fires after each site is upgraded; receives site ID |
| `wpmu_upgrade_page` | `upgrade.php` | MU | Fires before footer on upgrade show page |
| `update_wpmu_options` | `settings.php` | MU | Fires after network options are saved |
| `wpmu_options` | `settings.php` | MU | Fires before submit button on settings page |
| `network_site_new_form` | `site-new.php` | 4.5.0 | Fires at end of Add Site form |
| `pre_network_site_new_created_user` | `site-new.php` | 4.5.0 | Fires before new user created for new site |
| `network_site_new_created_user` | `site-new.php` | 4.4.0 | Fires after new user created for new site |
| `network_site_info_form` | `site-info.php` | 5.6.0 | Fires at end of site info form |
| `wpmu_update_blog_options` | `site-settings.php` | 3.0.0 | Fires after site options updated |
| `wpmueditblogaction` | `site-settings.php` | MU | Fires at end of site settings table (before submit) |
| `network_site_users_created_user` | `site-users.php` | 4.4.0 | Fires after a user is created in site users screen |
| `network_site_users_after_list_table` | `site-users.php` | 3.1.0 | Fires after the list table |
| `grant_super_admin` | `ms-functions.php` | 3.0.0 | Fires before granting super admin |
| `granted_super_admin` | `ms-functions.php` | 3.0.0 | Fires after granting super admin |
| `revoke_super_admin` | `ms-functions.php` | 3.0.0 | Fires before revoking super admin |
| `revoked_super_admin` | `ms-functions.php` | 3.0.0 | Fires after revoking super admin |

### Filters

| Filter | Source File | Description |
|--------|-------------|-------------|
| `handle_network_bulk_actions-{screen_id}` | `sites.php`, `site-themes.php`, `site-users.php` | Filter redirect URL after custom bulk action; receives `(redirect_url, action, items, site_id)` |
| `network_sites_updated_message_{action}` | `sites.php` | Customize non-default site update messages; receives current message |
| `mu_menu_items` | `settings.php` | Add/remove items from Menu Settings; receives `Record<slug, label>` |
| `network_edit_site_nav_links` | Core function | Add/modify tabs in the per-site edit navigation |
| `show_network_site_users_add_existing_form` | `site-users.php` | Boolean; show/hide Add Existing User form |
| `show_network_site_users_add_new_form` | `site-users.php` | Boolean; show/hide Add New User form |

---

## Section 12: TypeScript Interface Sketch

```typescript
// ---- Network / Site Structures ----

interface NetworkSite {
  blogId: number;
  siteId: number;        // parent network ID
  domain: string;
  path: string;
  registered: string;    // 'YYYY-MM-DD HH:MM:SS'
  lastUpdated: string;
  public: 0 | 1;
  archived: 0 | 1;
  mature: 0 | 1;
  spam: 0 | 1;
  deleted: 0 | 1;
  // Virtual field computed from domain + path:
  siteUrl: string;
}

interface NetworkSiteDetails extends NetworkSite {
  blogname: string;      // from site options
  siteurl: string;       // from site options
  home: string;          // from site options
}

type SiteBlogStatus =
  | 'activateblog'
  | 'deactivateblog'
  | 'archiveblog'
  | 'unarchiveblog'
  | 'spamblog'
  | 'unspamblog'
  | 'matureblog'
  | 'unmatureblog'
  | 'deleteblog';

// ---- Network Settings ----

type RegistrationMode = 'none' | 'user' | 'blog' | 'all';

interface NetworkSettings {
  siteName: string;                 // site_name
  adminEmail: string;               // admin_email
  newAdminEmail?: string;           // new_admin_email (pending)
  registration: RegistrationMode;   // registration
  registrationNotification: 'yes' | 'no'; // registrationnotification
  addNewUsers: boolean;             // add_new_users
  menuItems: Record<string, '1'>;   // menu_items
  uploadSpaceCheckDisabled: boolean; // upload_space_check_disabled
  blogUploadSpace: number;          // blog_upload_space (in MB)
  uploadFiletypes: string;          // upload_filetypes (space-separated)
  fileuploadMaxk: number;           // fileupload_maxk (in KB)
  wplang: string;                   // WPLANG
  illegalNames: string[];           // illegal_names (stored as space-separated)
  limitedEmailDomains: string[];    // limited_email_domains (one per line)
  bannedEmailDomains: string[];     // banned_email_domains (one per line)
  welcomeEmail: string;             // welcome_email
  welcomeUserEmail: string;         // welcome_user_email
  firstPost: string;                // first_post
  firstPage: string;                // first_page
  firstComment: string;             // first_comment
  firstCommentAuthor: string;       // first_comment_author
  firstCommentEmail: string;        // first_comment_email
  firstCommentUrl: string;          // first_comment_url
}

// ---- Themes ----

type AllowedThemes = Record<string, true>;
// Stored at site level: update_option('allowedthemes', ...)
// Stored at network level: update_site_option('allowedthemes', ...)

// ---- Plugins ----

type ActiveSitewidePlugins = Record<string, number>;
// Key: 'plugin-dir/plugin-file.php'
// Value: Unix timestamp of network activation

// ---- Super Admins ----

type SuperAdmins = string[];
// Stored in wp_sitemeta as meta_key='super_admins'
// Each entry is a user_login string

// ---- Add New Site ----

interface NewSiteFormData {
  domain: string;       // subdomain or subdirectory slug
  title: string;
  email: string;
  language?: string;    // WPLANG locale code
}

interface NewSiteCreationParams {
  newdomain: string;    // full domain (subdomain) or network domain (subdirectory)
  path: string;         // '/' for subdomains, '/{slug}/' for subdirectories
  title: string;
  userId: number;
  meta: {
    public: 1;
    WPLANG?: string;
  };
  networkId: number;
}

// ---- Network Upgrade ----

interface NetworkUpgradeProgress {
  offset: number;        // current site offset (n parameter)
  processedUrls: string[]; // site URLs processed in this batch
  done: boolean;         // true when get_sites() returns empty
}

// ---- WP_MS_Sites_List_Table Row Data ----

interface SiteListRow {
  site: NetworkSite;
  userCount: number;
  isMainSite: boolean;
  rowActions: SiteRowAction[];
}

type SiteRowAction = {
  key: string;
  label: string;
  url: string;
  destructive: boolean;
  requiresConfirmation: boolean;
};

// ---- Privacy Request (cross-reference from tools.md) ----

type PrivacyRequestStatus =
  | 'request-pending'
  | 'request-confirmed'
  | 'request-failed'
  | 'request-completed';

// ---- Network Admin Dashboard Widget ----

interface NetworkRightNowData {
  siteCount: number;
  userCount: number;
  wpVersion: string;
  hasUpdates: boolean;
}
```

---

## Section 13: Design Patterns

### Separate Context, Shared Code

The network admin is architecturally a separate admin context (`WP_NETWORK_ADMIN = true`) but shares all underlying WordPress functions, database access, and core APIs. Network-specific behavior is added through conditional checks (`is_network_admin()`, `is_multisite()`) rather than a separate codebase. In a TypeScript rewrite, implement network admin as a router/context layer on top of the shared admin infrastructure.

### Proxied Screen Pattern

`network/plugins.php` is a thin wrapper that simply includes `wp-admin/plugins.php`. This indicates that the core plugins screen is multisite-aware through its own conditionals. The TypeScript rewrite should implement multisite-specific branching within the same controller rather than duplicating controllers.

### Per-Site Context Switching

Many network admin operations need to read or write to a specific site's database tables. The WordPress pattern is:
1. `switch_to_blog($id)` — changes the active database prefix and option cache
2. Perform operations (get_option, update_option, etc.)
3. `restore_current_blog()` — revert to previous context

In TypeScript, implement this as an explicit context parameter passed to all data access functions rather than a global mutable context.

### Nonce Per Action Per Entity

Each destructive action uses a nonce that encodes both the action type and the entity ID, e.g., `activate-plugin_{plugin_file}`, `deactivateblog_{site_id}`, `enable-theme_{theme_slug}`. This prevents CSRF and replay attacks where a valid nonce for one entity is reused on another.

### Batch Processing for Upgrades

The upgrade screen processes 5 sites per HTTP request and auto-redirects to the next batch via JavaScript, using the `?n={offset}` query parameter. This pattern avoids PHP execution time limits. The TypeScript equivalent should use background jobs or paginated API calls rather than chained browser redirects.

### Topological Sort for Parent-Child Relationships

When exporting categories and custom terms (WXR) and when rendering site menus, parents must appear before children. The pattern used is a `while` loop with re-queuing: items whose parent has not yet been placed are pushed back to the end of the queue. This terminates when all items are placed or when circular references are detected (infinite loop guard needed in TypeScript).

### Two-Level Theme Permission System

Themes have a two-tier permission system:
1. **Network level** (`allowedthemes` site meta): which themes are available across the entire network
2. **Site level** (`allowedthemes` option): which themes a specific site can use, independently of network allowance

A theme available to a site must either be network-enabled OR explicitly enabled in the site's `allowedthemes` option. In the TypeScript rewrite, implement this as a union of both sources when determining available themes for a site.

### Confirmation Pattern for Destructive Actions

All destructive actions (site deletion, user deletion, theme deletion) use a two-step confirm pattern:
1. First request: Show a confirmation page with the action details and a POST form
2. Second request: Execute the action

The confirmation page verifies nonces in both directions. This should be implemented as a modal confirmation dialog in the TypeScript rewrite, but the underlying API must still require explicit confirmation tokens.

### Network Options vs Site Options

WordPress multisite has two distinct option storage systems:
- `get_site_option()` / `update_site_option()` → `wp_sitemeta` table (network-wide, shared across all sites)
- `get_option()` / `update_option()` → `{prefix}options` table (per-site, in site-specific table)

In the TypeScript rewrite, make this distinction explicit in the data layer:
```typescript
interface NetworkStore { getSiteOption(key: string): any; updateSiteOption(key: string, value: any): void; }
interface SiteStore { getOption(siteId: number, key: string): any; updateOption(siteId: number, key: string, value: any): void; }
```

### Registration Flow Email Confirmation

The site creation welcome email is sent via `wpmu_welcome_notification()`, and the admin is notified via `wpmu_new_site_admin_notification()`. These are fired unconditionally after site creation. The network admin email change uses a hash-based confirmation instead of direct update, to prevent unauthorized email changes.

---

## Tovu Reconstruction Notes

### Why this exists

This surface exists because multisite needs its own operator context. Network admin is where shared tenancy concerns become manageable without forking the rest of the admin stack.

### What Tovu should preserve

- A separate network/tenant-operator context on top of shared admin infrastructure
- Explicit network-vs-site state boundaries for options, themes, and destructive actions
- Safe per-site context switching or context injection for cross-site operations

### What Tovu can simplify

- Tovu does not need WordPress's wrapper-file approach; context-aware screens on the shared admin shell are enough
- Global mutable site switching should be replaced with explicit scoped context where possible

### Possible Tovu seams

- `src/admin/network/`
- `src/features/tenant/`
- `src/core/ports/TenantContextPort.ts`
- `src/core/ports/TenantConfigPort.ts`

### Suggested priority

- `V1`: tenant-aware operator context if Tovu ships multisite/tenant administration
- `Later`: full parity with all WordPress network-admin screens
