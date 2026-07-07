# Users and Auth — Specification

**Source files analyzed:**
- `wp-includes/user.php`
- `wp-includes/class-wp-user.php`
- `wp-includes/class-wp-roles.php`
- `wp-includes/class-wp-role.php`
- `wp-includes/class-wp-user-query.php`
- `wp-includes/class-wp-session-tokens.php`
- `wp-includes/capabilities.php`
- `wp-includes/pluggable.php`
- `wp-includes/class-wp-application-passwords.php`
- `wp-admin/includes/user.php`
- `wp-admin/includes/schema.php`

---

## 1. Overview

The users and auth system covers the full lifecycle of a WordPress user: the data model, the capability/role engine, CRUD functions, authentication (password + cookie + application passwords), session management, and the current-user context.

The system has two main conceptual layers:

- **Identity layer**: `WP_User` is the principal object. It wraps the `wp_users` DB row and the associated `wp_usermeta` rows. The `wp_capabilities` user meta key maps a user to their roles, and the runtime `allcaps` property is the fully merged capability set.

- **Authorization layer**: capabilities are the unit of permission checking. `current_user_can()` resolves both primitive capabilities (stored directly on a role or user) and meta capabilities (computed at call time from object context — e.g., "can this user edit *this* post?"). `map_meta_cap()` is the dispatch table that maps meta caps to their required primitive caps.

Authentication flows:

1. **Password login** via `wp_signon()` → `authenticate` filter chain → cookie set via `wp_set_auth_cookie()`.
2. **Cookie validation** via `wp_validate_auth_cookie()` on every request, which checks the HMAC and delegates to `WP_Session_Tokens` for token liveness.
3. **Application passwords** for REST and XML-RPC — HTTP Basic Auth, no session cookie.

---

## 2. WP_User Data Type

### Database Columns (`wp_users` table)

| Column | Type | Notes |
|---|---|---|
| `ID` | `BIGINT UNSIGNED` | Auto-increment primary key. Exposed as `WP_User::$ID` (int). |
| `user_login` | `VARCHAR(60)` | The username. Unique. Max 60 characters. Sanitized with `sanitize_user()`. |
| `user_pass` | `VARCHAR(255)` | Hashed password. Since WordPress 6.8 defaults to bcrypt with `$wp` prefix. Legacy hashes start with `$P$` (phpass) or `$2y$` (vanilla bcrypt). |
| `user_nicename` | `VARCHAR(50)` | URL-safe slug derived from `user_login`. Max 50 characters. Used in author archive URLs. |
| `user_email` | `VARCHAR(100)` | Must be unique. Case-insensitive uniqueness check on insert/update. |
| `user_url` | `VARCHAR(100)` | Website URL. Max 100 characters. |
| `user_registered` | `DATETIME` | UTC datetime of registration. Format: `Y-m-d H:i:s`. Defaults to `gmdate('Y-m-d H:i:s')` on insert. |
| `user_activation_key` | `VARCHAR(255)` | Used for password reset flow. Cleared on successful login by `wp_signon()`. |
| `user_status` | `INT` | Legacy field. Always 0 in modern WordPress. Not used for spam/deleted status. |
| `display_name` | `VARCHAR(250)` | The user's public display name. Defaults to `user_login` on create. |

### User Meta Fields (stored in `wp_usermeta`)

These meta keys are managed by `wp_insert_user()` and accessed via `WP_User::__get()`:

| Meta Key | Type | Notes |
|---|---|---|
| `first_name` | `string` | Profile first name. |
| `last_name` | `string` | Profile last name. |
| `nickname` | `string` | Defaults to `user_login` on create. |
| `description` | `string` | Biographical info. |
| `user_level` | `int` | Deprecated legacy user level (0–10). Stored as `{prefix}user_level`. |
| `rich_editing` | `string` | `'true'` or `'false'`. Whether to use visual editor. |
| `syntax_highlighting` | `string` | `'true'` or `'false'`. Code editor syntax highlighting. |
| `comment_shortcuts` | `string` | `'false'` by default. |
| `admin_color` | `string` | Admin color scheme slug (e.g., `'fresh'`, `'classic'`). |
| `use_ssl` | `string` | Legacy. `'0'` or `'1'`. |
| `show_admin_bar_front` | `string` | `'true'` or `'false'`. Whether to show the admin bar on the front end. |
| `locale` | `string` | Per-user locale override. Empty string means site default. |

### Capabilities and Roles Storage

Capabilities for a given site are stored in a single user meta key:

- **Single site**: `wp_capabilities` (where `wp_` is the database table prefix).
- **Multisite (site 1)**: `wp_capabilities`.
- **Multisite (site N)**: `wp_{N}_capabilities`.

The value is a serialized PHP associative array mapping role slugs and/or direct capability names to booleans:

```
// Role assignment:
a:1:{s:13:"administrator";b:1;}

// Direct capability grant:
a:2:{s:13:"administrator";b:1;s:12:"edit_plugins";b:1;}
```

A companion meta key `{prefix}user_level` stores the legacy integer level (0–10) as a scalar.

### WP_User Object Properties

```typescript
interface WPUser {
  ID: number;                        // integer user ID
  data: object;                      // raw DB row (stdClass equivalent)
  caps: Record<string, boolean>;     // individual caps set directly on this user
  cap_key: string;                   // e.g. "wp_capabilities"
  roles: string[];                   // e.g. ["administrator"]
  allcaps: Record<string, boolean>;  // merged: role caps + individual caps
  filter: string | null;             // sanitization context applied to __get()
}
```

**`allcaps` construction** (`WP_User::get_role_caps()`):
1. Start with an empty object.
2. For each role name in `this.roles`, fetch the `WP_Role` object and merge its `capabilities` into `allcaps`.
3. Merge `this.caps` on top (individual caps override role caps).
4. The result is `allcaps`.

**`WP_User::has_cap(cap, ...args)`**:
1. Calls `map_meta_cap(cap, this.ID, ...args)` to get the list of required primitive caps.
2. Passes the result through the `user_has_cap` filter: `apply_filters('user_has_cap', allcaps, requiredCaps, [cap, this.ID, ...args], this)`.
3. Checks that every primitive cap in the list is `=== true` in the filtered `allcaps`.
4. Returns `true` only if all required primitives pass. If any required primitive is `'do_not_allow'`, returns `false` immediately.

**Back-compat key aliases** (resolved transparently in `__get`/`__isset`):
- `user_firstname` → `first_name`
- `user_lastname` → `last_name`
- `user_description` → `description`
- `user_level` → `{prefix}user_level`

---

## 3. Capabilities System

### Primitive vs Meta Capabilities

**Primitive capabilities** are stored directly in the role's capabilities array or in `user->caps`. They are the atomic units that `has_cap()` checks against. Examples: `edit_posts`, `manage_options`, `delete_users`.

**Meta capabilities** are context-dependent capabilities that cannot be stored statically because they depend on an object (a post, user, term, etc.). Examples: `edit_post` (requires a post ID), `edit_user` (requires a user ID), `delete_app_password` (requires a UUID). They are always resolved through `map_meta_cap()`.

### `map_meta_cap(cap, userId, ...args): string[]`

Returns an array of primitive capabilities that the user must possess to satisfy `cap`. Never checks whether the user has the caps — it only computes what caps are needed.

**Full dispatch table:**

| Meta cap | Maps to primitive(s) | Notes |
|---|---|---|
| `remove_user` | `remove_users` | If `args[0] === userId` and user is not super admin: `do_not_allow` |
| `promote_user`, `add_users` | `promote_users` | |
| `edit_user` | `edit_users` | Self-edit allowed (no cap required). Multisite: `manage_network_users` required for editing super admins. |
| `edit_users` | `edit_users` | Same multisite constraints. |
| `delete_user`, `delete_users` | `delete_users` | Multisite: `do_not_allow` for non-super-admins. |
| `create_users` | `create_users` | Multisite: `do_not_allow` unless super admin or `add_new_users` site option is set. |
| `edit_post` | `edit_posts`, `edit_others_posts`, `edit_published_posts`, `edit_private_posts` | Depends on post author vs requester, post status. See below. |
| `edit_page` | Same as `edit_post` | |
| `delete_post` | `delete_posts`, `delete_others_posts`, `delete_published_posts`, `delete_private_posts` | Same author/status matrix. `manage_options` for posts/pages set as homepage or posts page. |
| `delete_page` | Same as `delete_post` | |
| `read_post` | `read`, `read_private_posts` | Public post status → `read`. Own post → `read`. Private → `read_private_posts`. Otherwise delegates to `edit_post`. |
| `read_page` | Same as `read_post` | |
| `publish_post` | Post type's `publish_posts` cap | |
| `edit_post_meta`, `add_post_meta`, `delete_post_meta` | `edit_post` for the given post ID, then `auth_post_meta_{key}` filter | Protected meta keys result in `do_not_allow`. |
| `edit_comment_meta`, `add_comment_meta`, `delete_comment_meta` | `edit_comment` | Same meta key filter pattern. |
| `edit_term_meta`, `add_term_meta`, `delete_term_meta` | `edit_term` | |
| `edit_user_meta`, `add_user_meta`, `delete_user_meta` | `edit_user` | |
| `edit_comment` | `edit_post` for the comment's parent post (or `edit_posts` for orphaned comments) | |
| `unfiltered_upload` | `unfiltered_upload` | Only if `ALLOW_UNFILTERED_UPLOADS` constant is defined and true. |
| `unfiltered_html`, `edit_css` | `unfiltered_html` | `do_not_allow` if `DISALLOW_UNFILTERED_HTML` is defined. Multisite: super admin only. |
| `edit_files`, `edit_plugins`, `edit_themes` | `edit_files`/`edit_plugins`/`edit_themes` | `do_not_allow` if `DISALLOW_FILE_EDIT` is defined or file mods are not allowed. |
| `update_plugins`, `delete_plugins`, `install_plugins` | Self (same cap string) | `do_not_allow` if file mods not allowed. Multisite: super admin only. |
| `upload_plugins` | `install_plugins` | |
| `update_themes`, `delete_themes`, `install_themes` | Self | Same file mod / multisite constraints. |
| `upload_themes` | `install_themes` | |
| `update_core` | `update_core` | `do_not_allow` if file mods not allowed. Multisite: super admin only. |
| `install_languages`, `update_languages` | `install_languages` | |
| `activate_plugins`, `deactivate_plugins`, `activate_plugin`, `deactivate_plugin` | `activate_plugins` | Multisite: also requires `manage_network_plugins` if plugin menu is disabled. |
| `resume_plugin` | `resume_plugins` | |
| `resume_theme` | `resume_themes` | |
| `manage_links` | `manage_links` | `do_not_allow` if `link_manager_enabled` option is false. |
| `customize` | `edit_theme_options` | |
| `delete_site` | `manage_options` (single site: `do_not_allow`) | |
| `edit_term`, `delete_term`, `assign_term` | Taxonomy's own cap object (e.g. `edit_terms`) | Delegates through taxonomy cap map. `do_not_allow` for default terms. |
| `manage_post_tags`, `edit_categories`, `edit_post_tags`, `delete_categories`, `delete_post_tags` | `manage_categories` | |
| `assign_categories`, `assign_post_tags` | `edit_posts` | |
| `manage_network`, `manage_sites`, `manage_network_users`, `manage_network_plugins`, `manage_network_themes`, `manage_network_options`, `upgrade_network`, `create_sites`, `delete_sites` | Self (same cap string) | Multisite-only. |
| `setup_network` | `manage_network_options` (multisite) or `manage_options` (single) | |
| `update_php` | `update_core` | Multisite: super admin only. |
| `update_https` | `manage_options` + `update_core` | Multisite: super admin only. |
| `export_others_personal_data`, `erase_others_personal_data`, `manage_privacy_options` | `manage_network` (multisite) or `manage_options` (single) | |
| `create_app_password`, `list_app_passwords`, `read_app_password`, `edit_app_password`, `delete_app_passwords`, `delete_app_password` | `edit_user` for `args[0]` | |
| `edit_block_binding` | `edit_post` (post context) or `edit_theme_options` (site editor) | |
| Block caps (`edit_blocks`, etc.) | Equivalent `_posts` cap (e.g., `edit_posts`) | `_blocks` suffix replaced with `_posts`. |
| Custom post type meta caps | Resolved via `$post_type_meta_caps` global | |
| Default (unknown) | The cap string itself | Pass-through for primitive caps. |

The entire result array is then passed through: `apply_filters('map_meta_cap', caps, cap, userId, args)`.

**`do_not_allow`** is the sentinel string that causes `has_cap()` to return `false` unconditionally regardless of what else is in the caps array.

### `current_user_can(capability, ...args): boolean`

Delegates to `user_can(wp_get_current_user(), capability, ...args)`.

### `user_can(user, capability, ...args): boolean`

Accepts a `WP_User` instance or a user ID. Calls `WP_User::has_cap(capability, ...args)` after resolving the user object.

---

## 4. WP_Roles and WP_Role

### WP_Roles — the Role Registry

The global role registry is accessed via `wp_roles()` which returns the singleton `WP_Roles` instance stored in `$wp_roles`.

**Storage**: roles are persisted in the `{prefix}user_roles` option (e.g., `wp_user_roles`). The format:

```php
[
  'administrator' => [
    'name'         => 'Administrator',
    'capabilities' => [ 'switch_themes' => true, 'edit_themes' => true, ... ]
  ],
  'editor' => [ ... ],
  ...
]
```

**`$wp_user_roles` global override**: if the global `$wp_user_roles` is set before `WP_Roles` initializes (e.g., in `wp-config.php`), it is used instead of the database option and `use_db` is set to `false` (no DB writes).

**Key methods:**

`add_role(role, displayName, capabilities): WP_Role | void`
- Does nothing and returns `void` if `role` is empty or already registered.
- Capabilities can be a numerically indexed array of strings (converted to `{ cap: true }` map) or an associative boolean map.
- Persists to DB via `update_option` if `use_db` is true.
- Creates and stores a `WP_Role` object in `role_objects[role]`.
- Returns the new `WP_Role` instance.

`remove_role(role): void`
- Silently does nothing if the role does not exist.
- Removes from `role_objects`, `role_names`, `roles`.
- Persists to DB.
- If the removed role was the `default_role` option, resets it to `'subscriber'`.

`get_role(role): WP_Role | null`
- Returns `null` if not found.

`add_cap(role, cap, grant = true): void`
- Adds `cap => grant` to the role's capabilities in the `roles` array and persists to DB.
- Does not update the in-memory `WP_Role` object's own `capabilities` property (it is kept separate).

`remove_cap(role, cap): void`
- Removes `cap` from the role's capabilities and persists to DB.

`get_names(): Record<string, string>`
- Returns `role_names` map: `{ roleSlug: 'Display Name' }`.

`is_role(role): boolean`
- True if `role_names[role]` is set.

`for_site(siteId?): void`
- Re-initializes roles for a specific site. Called by `switch_to_blog()`. Sets `role_key` to `{prefix}user_roles`. Reloads `roles` from DB and re-runs `init_roles()`.

`init_roles(): void`
- Rebuilds `role_objects` and `role_names` from the `roles` array.
- Fires `do_action('wp_roles_init', this)` at the end.

### WP_Role — a Single Role

```typescript
interface WPRole {
  name: string;                        // role slug
  capabilities: Record<string, boolean>; // cap => grant
}
```

`add_cap(cap, grant = true): void`
- Sets `this.capabilities[cap] = grant`.
- Calls `wp_roles().add_cap(this.name, cap, grant)` to persist.

`remove_cap(cap): void`
- Deletes `this.capabilities[cap]`.
- Calls `wp_roles().remove_cap(this.name, cap)`.

`has_cap(cap): boolean`
- Runs `apply_filters('role_has_cap', this.capabilities, cap, this.name)`.
- Returns `!!filteredCapabilities[cap]`.

---

## 5. Built-in Roles and Their Capability Sets

Roles are populated by the `populate_roles()` function chain during installation. The full set of primitive caps per role after all populate_roles_* functions run:

### administrator

```
switch_themes, edit_themes, activate_plugins, edit_plugins, edit_users,
edit_files, manage_options, moderate_comments, manage_categories, manage_links,
upload_files, import, unfiltered_html, edit_posts, edit_others_posts,
edit_published_posts, publish_posts, edit_pages, read, level_10 through level_0,
edit_others_pages, edit_published_pages, publish_pages, delete_pages,
delete_others_pages, delete_published_pages, delete_posts, delete_others_posts,
delete_published_posts, delete_private_posts, edit_private_posts, read_private_posts,
delete_private_pages, edit_private_pages, read_private_pages, delete_users,
create_users, unfiltered_upload, edit_dashboard, update_plugins, delete_plugins,
install_plugins, update_themes, install_themes, update_core, list_users,
remove_users, promote_users, edit_theme_options, delete_themes, export
```

### editor

```
moderate_comments, manage_categories, manage_links, upload_files, unfiltered_html,
edit_posts, edit_others_posts, edit_published_posts, publish_posts, edit_pages,
read, level_7 through level_0, edit_others_pages, edit_published_pages,
publish_pages, delete_pages, delete_others_pages, delete_published_pages,
delete_posts, delete_others_posts, delete_published_posts, delete_private_posts,
edit_private_posts, read_private_posts, delete_private_pages, edit_private_pages,
read_private_pages
```

### author

```
upload_files, edit_posts, edit_published_posts, publish_posts, read,
level_2, level_1, level_0, delete_posts, delete_published_posts
```

### contributor

```
edit_posts, read, level_1, level_0, delete_posts
```

Note: Contributors **cannot** publish posts — they can only submit for review. They have no `publish_posts` cap.

### subscriber

```
read, level_0
```

---

## 6. WP_User_Query

All query arguments with defaults (from `WP_User_Query::fill_query_vars()`):

| Parameter | Type | Default | Description |
|---|---|---|---|
| `blog_id` | `number` | current site ID | The site to query users for. |
| `role` | `string \| string[]` | `''` | Users must have ALL listed roles (AND logic). Accepts comma-separated string or array. |
| `role__in` | `string[]` | `[]` | Users must have AT LEAST ONE of these roles (OR logic). |
| `role__not_in` | `string[]` | `[]` | Users must not have any of these roles. |
| `capability` | `string \| string[]` | `''` | Users must have ALL listed capabilities (AND logic). Only works for DB-stored caps, not `map_meta_cap` results. |
| `capability__in` | `string[]` | `[]` | Users must have AT LEAST ONE of these capabilities. |
| `capability__not_in` | `string[]` | `[]` | Users must not have any of these capabilities. |
| `meta_key` | `string \| string[]` | `''` | Meta key(s) to filter by. |
| `meta_value` | `string \| string[]` | `''` | Meta value(s) to filter by. |
| `meta_compare` | `string` | `''` | MySQL comparison operator. Defaults to `'='`. |
| `meta_compare_key` | `string` | `''` | MySQL operator for meta key comparison. |
| `meta_type` | `string` | `''` | MySQL CAST type for meta_value comparisons. |
| `meta_type_key` | `string` | `''` | MySQL CAST type for meta_key comparisons. |
| `meta_query` | `array` | — | Full `WP_Meta_Query` argument array. |
| `include` | `number[]` | `[]` | Array of user IDs to include. If set, only these IDs are returned. |
| `exclude` | `number[]` | `[]` | Array of user IDs to exclude. |
| `search` | `string` | `''` | Search string. Wildcards are added automatically. |
| `search_columns` | `string[]` | `[]` | Columns to search. Accepts: `'ID'`, `'user_login'`, `'user_email'`, `'user_url'`, `'user_nicename'`, `'display_name'`. Auto-detected from search string format if empty. |
| `orderby` | `string \| string[] \| Record<string, string>` | `'login'` | See orderby values below. |
| `order` | `'ASC' \| 'DESC'` | `'ASC'` | Default sort direction. |
| `offset` | `number` | `''` (0) | Number of users to skip. |
| `number` | `number` | `''` (-1, all) | Max users to return. `-1` means all. |
| `paged` | `number` | `1` | Current page number. Used with `number` for pagination. |
| `count_total` | `boolean` | `true` | Whether to run a `SQL_CALC_FOUND_ROWS` query to get the total count. Set to `false` if pagination data is not needed. |
| `fields` | `string \| string[]` | `'all'` | Which fields to return. See fields values below. |
| `who` | `string` | `''` | Deprecated since 5.9.0. Use `capability` instead. `'authors'` returns users with `edit_posts` capability. |
| `has_published_posts` | `boolean \| string[]` | `null` | Filter to users who have published posts. `true` = all public post types; array = specific post types. |
| `nicename` | `string` | `''` | Exact `user_nicename` match. |
| `nicename__in` | `string[]` | `[]` | Included nicenames (OR logic). |
| `nicename__not_in` | `string[]` | `[]` | Excluded nicenames. |
| `login` | `string` | `''` | Exact `user_login` match. |
| `login__in` | `string[]` | `[]` | Included logins (OR logic). |
| `login__not_in` | `string[]` | `[]` | Excluded logins. |
| `cache_results` | `boolean` | `true` | Whether to prime the user cache with query results. |

**`orderby` accepted values:**
`'ID'`, `'display_name'` (alias `'name'`), `'include'`, `'user_login'` (alias `'login'`), `'login__in'`, `'user_nicename'` (alias `'nicename'`), `'nicename__in'`, `'user_email'` (alias `'email'`), `'user_url'` (alias `'url'`), `'user_registered'` (alias `'registered'`), `'post_count'`, `'meta_value'`, `'meta_value_num'`, or a named `meta_query` clause key. Multi-dimensional: `{ field: 'ASC' | 'DESC' }`.

**`fields` accepted values:**
- `'all'` — returns full `WP_User` objects with meta loaded (default).
- `'all_with_meta'` — deprecated alias for `'all'`.
- `'ID'`, `'display_name'`, `'user_login'`, `'user_nicename'`, `'user_email'`, `'user_url'`, `'user_registered'`, `'user_pass'`, `'user_activation_key'`, `'user_status'` — returns plain objects with only those fields.
- Array of field names — returns objects with only the specified fields.

**Result methods:**
- `get_results(): WP_User[] | object[] | string[]` — query results.
- `get_total(): number` — total found users (only valid if `count_total` was true).

**`pre_get_users` action**: fired before SQL is built. Receives the `WP_User_Query` instance by reference. Allows modification of `query_vars`.

---

## 7. User CRUD

### `wp_create_user(username, password, email?): number | WP_Error`

Thin wrapper around `wp_insert_user`. Accepts plaintext password. Returns the new user ID on success or a `WP_Error`.

```typescript
function wp_create_user(
  username: string,
  password: string,
  email?: string
): number | WPError
```

### `wp_insert_user(userdata): number | WP_Error`

The canonical create/update function. Accepts an array, `stdClass`, or `WP_User` object.

**Input fields (all optional on update; `user_login` and `user_pass` required on create):**

| Field | Type | Notes |
|---|---|---|
| `ID` | `number` | If present, treated as an update to the existing user. Must exist. |
| `user_login` | `string` | Required on create. Max 60 chars. Sanitized. Filtered through `pre_user_login`. |
| `user_pass` | `string` | Plaintext on create (auto-hashed). Pre-hashed on update via `wp_update_user`. Empty on create triggers a warning and sets an empty hash (forces password reset). |
| `user_nicename` | `string` | Defaults to first 50 chars of `user_login`. Slug-sanitized. Max 50 chars. Auto-suffixed if duplicate. |
| `user_email` | `string` | Filtered through `pre_user_email`. Duplicate check (case-insensitive) on create. |
| `user_url` | `string` | Filtered through `pre_user_url`. Max 100 chars. |
| `user_registered` | `string` | UTC datetime string. Defaults to `gmdate('Y-m-d H:i:s')`. |
| `user_activation_key` | `string` | Defaults to `''`. |
| `user_status` | `number` | Legacy. Always stored. |
| `display_name` | `string` | Defaults to `user_login` on create. Filtered through `pre_user_display_name`. |
| `nickname` | `string` | Stored in user meta. Defaults to `user_login`. |
| `first_name` | `string` | Stored in user meta. |
| `last_name` | `string` | Stored in user meta. |
| `description` | `string` | Stored in user meta (biographical info). |
| `rich_editing` | `string` | `'true'` or `'false'`. Stored in user meta. |
| `syntax_highlighting` | `string` | `'true'` or `'false'`. Stored in user meta. |
| `comment_shortcuts` | `string` | Stored in user meta. |
| `admin_color` | `string` | Stored in user meta. Defaults to `'fresh'`. |
| `use_ssl` | `number` | Stored in user meta. Defaults to `0`. |
| `show_admin_bar_front` | `string` | Stored in user meta. Defaults to `'true'`. |
| `locale` | `string` | Stored in user meta. Empty = site default. |
| `role` | `string` | Role name. Calls `WP_User::set_role()`. Not stored in `wp_users`; stored in user meta. |
| `spam` | `boolean` | Multisite only. Set on `wp_users.spam`. |

**Error codes returned as `WP_Error`:**
- `empty_user_login` — empty login name.
- `user_login_too_long` — exceeds 60 characters.
- `existing_user_login` — login already exists (create only).
- `invalid_username` — login is in the `illegal_user_logins` filter list.
- `empty_user_nicename` — nicename became empty after sanitization.
- `user_nicename_too_long` — exceeds 50 characters.
- `existing_user_email` — email already in use (create only, skipped when `WP_IMPORTING` is defined).
- `user_url_too_long` — URL exceeds 100 characters.
- `no_spam` — spam flag set on non-multisite.
- `invalid_user_id` — update with non-existent ID.

**Hooks fired:**
- `pre_user_login`, `pre_user_nicename`, `pre_user_email`, `pre_user_url`, `pre_user_display_name`, `pre_user_description`, `pre_user_first_name`, `pre_user_last_name`, `pre_user_nickname` — filters before each field is committed.
- `illegal_user_logins` — filter returning array of disallowed login names.
- `insert_user_meta` — filter on the meta array before it is saved.
- `user_register` action — fires with `(userId)` after a new user is inserted.
- `profile_update` action — fires with `(userId, oldUserData, newUserData)` after an update.

### `wp_update_user(userdata): number | WP_Error`

Loads the existing user, merges existing data with provided `userdata`, hashes the password if it has changed, then calls `wp_insert_user()`. Sends password/email change notification emails. Returns the user ID on success.

### `wp_delete_user(id, reassign?): boolean`

Deletes a user and handles their content.

- `id`: integer user ID.
- `reassign`: integer user ID to reassign posts/links to, or `null` to delete them.
- Returns `false` for non-numeric IDs or non-existent users.

**When `reassign` is `null`**: deletes all posts whose type has `delete_with_user = true` or `delete_with_user = null && supports('author')`. Deletes all links owned by the user.

**When `reassign` is a user ID**: updates `post_author` and `link_owner` to `reassign` for all of the deleted user's posts/links.

**On multisite**: calls `remove_user_from_blog()` instead of deleting from the global users table.

**Hooks:**
- `delete_user` action — fires with `(id, reassign, userObject)` before deletion.
- `deleted_user` action — fires with `(id, reassign, userObject)` after deletion.
- `post_types_to_delete_with_user` filter — filters the array of post types to delete.

### `get_userdata(userId): WP_User | false`

Alias for `get_user_by('id', userId)`.

### `get_user_by(field, value): WP_User | false`

Retrieves a user by a given field. Uses an object cache keyed per cache group.

| `field` value | DB column queried | Cache group |
|---|---|---|
| `'id'` or `'ID'` | `ID` | `'users'` |
| `'slug'` | `user_nicename` | `'userslugs'` |
| `'email'` | `user_email` | `'useremail'` |
| `'login'` | `user_login` | `'userlogins'` (value sanitized first) |

Returns `false` for invalid/missing users. Uses `update_user_caches()` to populate all four cache groups on a DB hit.

### `get_users(args): WP_User[]`

Wrapper around `WP_User_Query`. Forces `count_total = false`. Returns the results array (empty array if none).

---

## 8. Authentication

### `wp_signon(credentials, secureCookie): WP_User | WP_Error`

The primary login entry point.

**Parameters:**

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `credentials` | `object` | `{}` | If empty, falls back to `$_POST['log']`, `$_POST['pwd']`, `$_POST['rememberme']`. |
| `credentials.user_login` | `string` | `''` | Username. |
| `credentials.user_password` | `string` | `''` | Plaintext password. |
| `credentials.remember` | `boolean` | `false` | Whether to set a long-lived cookie (14 days vs 2 days). |
| `secureCookie` | `string \| boolean` | `''` | Whether to use a secure cookie. Defaults to `is_ssl()`. |

**Execution flow:**
1. Fires `do_action_ref_array('wp_authenticate', [&username, &password])` — allows mutating credentials before auth.
2. Resolves `secureCookie`; applies `secure_signon_cookie` filter.
3. Registers `wp_authenticate_cookie` on the `authenticate` filter at priority 30.
4. Calls `wp_authenticate(username, password)` which fires the `authenticate` filter chain.
5. If `WP_Error`, returns it immediately.
6. Calls `wp_set_auth_cookie(user.ID, remember, secureCookie)`.
7. Clears `user_activation_key` in DB if set.
8. Fires `do_action('wp_login', user_login, user)`.
9. Returns the `WP_User` object.

### `wp_authenticate(username, password): WP_User | WP_Error`

Fires `apply_filters('authenticate', null, username, password)`. The chain of filters on `authenticate` is responsible for returning a `WP_User` on success or a `WP_Error` on failure. Built-in hooks on `authenticate` (in priority order):

| Priority | Handler | Description |
|---|---|---|
| 20 | `wp_authenticate_username_password` | Checks login + phpass/bcrypt password. |
| 20 | `wp_authenticate_email_password` | Falls through to email-based login if `username` is an email address. |
| 30 | `wp_authenticate_cookie` (added by `wp_signon`) | Validates an existing auth cookie when no credentials supplied. |
| 20 | `wp_authenticate_application_password` | REST/XML-RPC only; validates an application password. |
| 99 | `wp_authenticate_spam_check` | Multisite spam user guard. |

### `wp_authenticate_username_password(user, username, password): WP_User | WP_Error`

- If `user` is already a `WP_User`, returns it immediately (short-circuit).
- Returns `WP_Error('empty_username')` or `WP_Error('empty_password')` for empty inputs.
- Calls `get_user_by('login', username)`. Returns `WP_Error('invalid_username')` if not found.
- Applies `wp_authenticate_user` filter (allows plugins to block login).
- Calls `wp_check_password(password, user.user_pass, user.ID)`.
- Returns `WP_Error('incorrect_password')` on mismatch.
- If hash needs rehash (`wp_password_needs_rehash()`), calls `wp_set_password()` transparently.

### `wp_authenticate_email_password(user, email, password): WP_User | WP_Error`

Same flow as `wp_authenticate_username_password` but:
- Skips if `email` is not a valid email address (returns `user` unchanged).
- Calls `get_user_by('email', email)`.
- Returns `WP_Error('invalid_email')` if not found.
- Same `wp_authenticate_user` filter + password check.

### `wp_authenticate_spam_check(user): WP_User | WP_Error`

Multisite only. If `user` is a `WP_User`, applies `check_is_user_spammed` filter. Returns `WP_Error('spammer_account')` if the user is marked as a spammer.

---

## 9. Password Handling

### `wp_hash_password(password): string`

Hashes a plaintext password for storage.

**Algorithm (since WordPress 6.8 default):**
1. If `$wp_hasher` global is set (custom phpass override), delegates to it.
2. If password length > 4096, returns `'*'` (invalid sentinel — forces password reset).
3. Applies `wp_hash_password_algorithm` filter (default: `PASSWORD_BCRYPT`).
4. Applies `wp_hash_password_options` filter (default: `[]`, uses PHP defaults).
5. **For bcrypt**: pre-hashes with SHA-384 HMAC keyed with `'wp-sha384'`, then base64-encodes the result (to handle passwords > 72 bytes — bcrypt's limit). Calls `password_hash(prehashedPassword, PASSWORD_BCRYPT, options)`. Prepends `'$wp'` prefix to the result, yielding a hash like `$wp$2y$...`.
6. **For other algorithms**: calls `password_hash(password, algorithm, options)` directly (no pre-hashing needed).

**Legacy**: old hashes starting with `$P$` are phpass-format. Hashes starting with `$2y$` (no `$wp` prefix) are vanilla bcrypt. Both are supported by `wp_check_password`.

### `wp_check_password(password, hash, userId?): boolean`

Verifies a plaintext password against a stored hash. Handles all known hash formats:

| Hash format | Verification method |
|---|---|
| Length ≤ 32 | `md5(password) === hash` (legacy MD5) |
| Non-empty `$wp_hasher` global | `$wp_hasher->CheckPassword()` |
| Length > 4096 | Always `false` |
| Starts with `$wp` | Pre-hash with SHA-384 HMAC, then `password_verify(prehash, hash[3:])` |
| Starts with `$P$` | Instantiate `PasswordHash(8, true)->CheckPassword()` (phpass) |
| Any other | `password_verify(password, hash)` (vanilla bcrypt or other modern algorithm) |

Result is passed through `apply_filters('check_password', check, password, hash, userId)`.

### `wp_password_needs_rehash(hash, userId?): boolean`

Returns `true` if the hash should be transparently upgraded to the current algorithm/cost. Both `wp_authenticate_username_password` and `wp_authenticate_email_password` call this after a successful check and upgrade via `wp_set_password()` if needed.

Returns `false` if `$wp_hasher` global is set (defers to the custom hasher to manage its own versioning).

### `wp_generate_password(length?, specialChars?, extraSpecialChars?): string`

| Parameter | Default | Characters |
|---|---|---|
| `length` | `12` | Integer. |
| `specialChars` | `true` | Adds `!@#$%^&*()` to the charset. |
| `extraSpecialChars` | `false` | Adds `-_ []{}<>~\`+=,.;:/?|` to the charset. |

Base charset: `a-z A-Z 0-9`. Each character is drawn using `wp_rand()` (CSPRNG via `random_int()`). Result filtered through `random_password` filter.

**Application passwords** use `wp_generate_password(24, false)` — 24 alphanumeric characters, no special chars.

**Session tokens** use `wp_generate_password(43, false, false)` — 43 alphanumeric characters.

### `wp_set_password(password, userId): void`

Hashes the plaintext password and writes it directly to the DB (`wp_users.user_pass`). Also clears `user_activation_key`. Calls `clean_user_cache()` to invalidate the object cache. Fires `wp_set_password` action with `(password, userId, oldUserData)`.

### `wp_new_user_notification(userId, deprecated?, notify?): void`

Sends registration notification emails:
- `notify = 'admin'`: email to site admin only.
- `notify = 'user'`: email to new user only (with password reset link).
- `notify = 'both'`: both.
- Default: both.

Controlled by `wp_send_new_user_notifications` filter.

---

## 10. Session Management

### `wp_set_auth_cookie(userId, remember?, secure?, token?): void`

Sets the authentication cookies after login.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `userId` | `number` | required | The user to create a session for. |
| `remember` | `boolean` | `false` | If `true`, cookie lifetime is 14 days. If `false`, 2 days. |
| `secure` | `string \| boolean` | `''` | Whether to use a secure (HTTPS-only) cookie. Defaults to `is_ssl()`. |
| `token` | `string` | `''` | Pre-existing session token. If empty, a new one is created via `WP_Session_Tokens::create()`. |

**Expiration logic:**
- `remember = true`: `expiration = now + auth_cookie_expiration(14 * DAY_IN_SECONDS)`. The cookie `expire` attribute is set to `expiration + 12 hours` (grace period for `POST`/Ajax requests).
- `remember = false`: `expiration = now + auth_cookie_expiration(2 * DAY_IN_SECONDS)`. The cookie `expire` attribute is `0` (session cookie — expires on browser close).

**Cookies set** (three `setcookie()` calls, two paths for the auth cookie):
1. `AUTH_COOKIE` or `SECURE_AUTH_COOKIE` on `PLUGINS_COOKIE_PATH` — HttpOnly.
2. `AUTH_COOKIE` or `SECURE_AUTH_COOKIE` on `ADMIN_COOKIE_PATH` — HttpOnly.
3. `LOGGED_IN_COOKIE` on `COOKIEPATH` (and `SITECOOKIEPATH` if different) — HttpOnly.

**Filters:**
- `auth_cookie_expiration` — change duration.
- `secure_auth_cookie` — override whether the auth cookie is secure.
- `secure_logged_in_cookie` — override whether the logged-in cookie is secure.
- `send_auth_cookies` — return `false` to suppress all cookies (headless/API mode).

**Actions fired before cookies are sent:**
- `set_auth_cookie(authCookie, expire, expiration, userId, scheme, token)`
- `set_logged_in_cookie(loggedInCookie, expire, expiration, userId, 'logged_in', token)`

### Auth Cookie Format

The cookie value for all three cookie names is the same format, generated by `wp_generate_auth_cookie()`:

```
username|expiration|token|hmac
```

- `username`: the user's `user_login`.
- `expiration`: Unix timestamp.
- `token`: the 43-character session token (raw, not hashed).
- `hmac`: `hash_hmac('sha256', "username|expiration|token", key)` where `key = wp_hash("username|passFragment|expiration|token", scheme)`.
- `passFragment`: for `$wp` or `$P$` / `$2y$` prefixed hashes: chars 8–11 of the stored hash. For other hashes: the last 4 characters.

The `scheme` parameter distinguishes the three cookie contexts:
- `'auth'` — regular HTTP auth cookie.
- `'secure_auth'` — HTTPS-only auth cookie.
- `'logged_in'` — the front-end presence indicator.

### `wp_validate_auth_cookie(cookie?, scheme?): number | false`

Validates a raw cookie string and returns the user ID, or `false`.

**Validation steps:**
1. Parses the cookie string into `{ username, expiration, token, hmac, scheme }`.
2. Quick expiration check. Ajax/POST requests get a 1-hour grace period.
3. Looks up user by `username` via `get_user_by('login', ...)`.
4. Derives `passFragment` from `user.user_pass`.
5. Recomputes the HMAC and compares with `hash_equals()` (timing-safe).
6. Validates the session token via `WP_Session_Tokens::get_instance(user.ID).verify(token)`.
7. Returns `user.ID` on success.

**Failure actions fired:** `auth_cookie_malformed`, `auth_cookie_expired`, `auth_cookie_bad_username`, `auth_cookie_bad_hash`, `auth_cookie_bad_session_token`.
**Success action fired:** `auth_cookie_valid(cookieElements, user)`.

### `wp_clear_auth_cookie(): void`

Fires `clear_auth_cookie` action, then expires all known cookie names across all known paths. Also expires `wp-settings-{userId}` and `wp-settings-time-{userId}` cookies.

### WP_Session_Tokens (Abstract)

The session store abstraction. Obtained via `WP_Session_Tokens::get_instance(userId)` which applies the `session_token_manager` filter (default: `'WP_User_Meta_Session_Tokens'`).

**Session data structure** (one entry per active session):

```typescript
interface SessionData {
  expiration: number;   // Unix timestamp — when this session expires
  ip?: string;          // REMOTE_ADDR at login time
  ua?: string;          // HTTP_USER_AGENT at login time
  login: number;        // Unix timestamp of login
  // ...additional keys from 'attach_session_information' filter
}
```

Sessions are stored keyed by a **verifier** = `sha256(token)`. The raw token is only ever held in the cookie and in the return value of `create()`.

**Public final methods:**

| Method | Description |
|---|---|
| `create(expiration): string` | Generates a 43-char token, builds session data (IP, UA, login time), stores it, returns the raw token. |
| `get(token): SessionData \| null` | Retrieves the session for a raw token (hashes it internally). |
| `verify(token): boolean` | Returns true if the session for this token exists and is not expired. |
| `update(token, session): void` | Overwrites session data for a given token. |
| `destroy(token): void` | Deletes a specific session. |
| `destroy_others(tokenToKeep): void` | Destroys all sessions except the one matching `tokenToKeep`. |
| `destroy_all(): void` | Destroys all sessions for this user. |
| `get_all(): SessionData[]` | Returns all active sessions. |
| `destroy_all_for_all_users()` | Static. Calls `drop_sessions()` on the concrete manager class. |

**Abstract methods** (implemented by `WP_User_Meta_Session_Tokens`):
- `get_sessions(): Record<string, SessionData>`
- `get_session(verifier): SessionData | null`
- `update_session(verifier, session | null): void` (null = delete)
- `destroy_other_sessions(verifier): void`
- `destroy_all_sessions(): void`

### WP_User_Meta_Session_Tokens

The default concrete implementation. Stores all sessions for a user in a single user meta key: `session_tokens`, serialized as `Record<sha256_verifier, SessionData>`. No separate table.

---

## 11. Current User

### Global State

```typescript
const currentUser: WPUser;  // $current_user — the active user for this request
```

Populated by `_wp_get_current_user()` which is called lazily on the first `wp_get_current_user()` invocation. It fires `apply_filters('determine_current_user', false)` to let auth systems (cookie validation, application password validation, etc.) return a user ID. If a valid ID is returned, calls `wp_set_current_user(userId)`.

### `wp_get_current_user(): WP_User`

Always returns a `WP_User` object. If no user is logged in, returns a `WP_User` with `ID = 0` (`exists() === false`).

### `get_current_user_id(): number`

Returns `wp_get_current_user().ID`, or `0` if not logged in. Returns `0` if `wp_get_current_user` is not yet available.

### `is_user_logged_in(): boolean`

Returns `wp_get_current_user().exists()`. A user "exists" when `ID > 0`.

### `wp_set_current_user(id, name?): WP_User`

Forces the current user to the given user ID (or username if `id = 0` and `name` is provided). Short-circuits if the ID already matches the current user. Updates the `$current_user` global, calls `setup_userdata()`, and fires `set_current_user` action.

Used by:
- The auth bootstrap at the start of each request.
- Test code and CLI that needs to impersonate a user.
- `wp_signon()` does **not** call this — the caller must do so if they need `is_user_logged_in()` to return `true` before the `init` hook.

### `setup_userdata(forUserId?): void`

Populates legacy global variables from the current (or specified) user:

```typescript
let $user_ID: number;        // user.ID
let $user_login: string;     // user.user_login
let $user_email: string;     // user.user_email
let $user_url: string;       // user.user_url
let $user_level: number;     // user.user_level
let $user_identity: string;  // user.display_name
let $userdata: WPUser;       // the WP_User object itself
```

All zeroed/emptied when no user exists.

---

## 12. Application Passwords

Application passwords provide API-level authentication (REST API, XML-RPC) without requiring a session cookie. They are not usable on the standard login form.

### Structure

Each application password is stored as an element in the `_application_passwords` user meta key (an array of items):

```typescript
interface ApplicationPassword {
  uuid: string;           // UUIDv4 — unique identifier for this password entry
  app_id: string;         // UUIDv4 provided by the client application (optional)
  name: string;           // Human-readable application name
  password: string;       // One-way hash of the password (wp_fast_hash, formerly phpass)
  created: number;        // Unix timestamp of creation
  last_used: number | null; // Unix timestamp of most recent use, null if never used
  last_ip: string | null; // IP address of most recent use, null if never used
}
```

Generated passwords are 24 characters, alphanumeric only (`wp_generate_password(24, false)`). They are presented to the user **once** on creation — the plaintext is never stored.

### WP_Application_Passwords class

**Constants:**
- `USERMETA_KEY_APPLICATION_PASSWORDS = '_application_passwords'`
- `OPTION_KEY_IN_USE = 'using_application_passwords'` — network option; set to `true` when the first app password is ever created.
- `PW_LENGTH = 24`

**Key static methods:**

`create_new_application_password(userId, args): [string, ApplicationPassword] | WP_Error`
- `args.name` is required; empty name returns `WP_Error('application_password_empty_name')`.
- `args.app_id` is optional.
- If `name` already exists for this user: `WP_Error('application_password_taken')`.
- Returns `[plaintextPassword, newItem]`. The plaintext is only available here.
- Sets `OPTION_KEY_IN_USE` network option on first creation.
- Fires `wp_create_application_password(userId, newItem, newPassword, args)` action.

`get_user_application_passwords(userId): ApplicationPassword[]`
- Reads from user meta. Returns `[]` if none exist.
- Transparently backfills any entries missing a `uuid`.

`update_application_password(userId, uuid, update): true | WP_Error`
- Updates fields (e.g., `name`) on an existing entry.
- Fires `wp_update_application_password` action.

`delete_application_password(userId, uuid): true | WP_Error`
- Removes a single entry by UUID.
- Fires `wp_delete_application_password` action.

`delete_all_application_passwords(userId): number`
- Removes all app passwords for a user. Returns the count deleted.

`record_application_password_usage(userId, uuid): true | WP_Error`
- Updates `last_used` to `time()` and `last_ip` to `REMOTE_ADDR`.

`is_in_use(): boolean`
- Checks the `using_application_passwords` network option. Used as a fast short-circuit: if no app passwords have ever been created, the entire verification stack is skipped.

### Authentication Flow (`wp_authenticate_application_password`)

1. Short-circuits if `input_user` is already a `WP_User`.
2. Short-circuits if `WP_Application_Passwords::is_in_use()` is `false`.
3. Checks if the request is an API request: `REST_REQUEST === true` or `XMLRPC_REQUEST === true`, filtered by `application_password_is_api_request`. **Not available for regular form login.**
4. Looks up user by login or email.
5. Checks `wp_is_application_passwords_available()` and `wp_is_application_passwords_available_for_user()`.
6. Strips non-alphanumeric characters from the supplied password (allows copy-pasting with spaces).
7. Iterates through the user's stored application passwords; for each, calls `WP_Application_Passwords::check_password(supplied, stored.password)`.
8. On match: fires `wp_authenticate_application_password_errors` action (plugins can block). On no errors: calls `record_application_password_usage()`, fires `application_password_did_authenticate` action, returns the `WP_User`.
9. If no match found: fires `application_password_failed_authentication` action, returns `WP_Error('incorrect_password')`.

**REST Nonce exclusion**: application password authentication is registered on `determine_current_user` at priority 20 via `wp_validate_application_password`. When a valid `X-WP-Nonce` header is present (cookie-based auth), the application password path is not reached because cookie auth runs first.

---

## 13. User Meta Helpers

### `get_user_meta(userId, key?, single?): mixed`

Wrapper for `get_metadata('user', ...)`.

- `key = ''`: returns all meta as `Record<string, mixed[]>`.
- `single = false` (default): returns an array of all values for the key (even if only one exists).
- `single = true`: returns the scalar value, or empty string if not set.
- Returns `false` for an invalid (non-numeric, zero, or negative) `userId`.

**Type coercion notes:**
- `false` values are stored as `''` and returned as `''`.
- `true` is stored and returned as `'1'`.
- Integers/floats are stored and returned as strings.
- Arrays and objects are serialized on write and deserialized on read — returned as original PHP type.

### `update_user_meta(userId, metaKey, metaValue, prevValue?): number | boolean`

Wrapper for `update_metadata('user', ...)`.

- Returns the new meta ID (integer) if the key did not exist and was inserted.
- Returns `true` on successful update.
- Returns `false` on failure, or if the new value is identical to the existing value.
- `prevValue`: if provided, only updates the row matching that previous value.

### `add_user_meta(userId, metaKey, metaValue, unique?): number | false`

Wrapper for `add_metadata('user', ...)`.

- `unique = false` (default): allows multiple rows with the same key.
- `unique = true`: fails (returns `false`) if the key already exists.
- Returns the new meta ID on success.

### `delete_user_meta(userId, metaKey, metaValue?): boolean`

Wrapper for `delete_metadata('user', ...)`.

- Without `metaValue`: deletes all rows for this `userId + metaKey`.
- With `metaValue`: only deletes rows where the value matches.
- Returns `true` on success, `false` on failure.

**Note**: All four functions expect keys and values to be "slashed" on input (historical WordPress convention inherited from magic quotes era). In practice, call `wp_slash()` on values before passing to add/update.

---

## 14. Key Hooks and Filters

### Authentication Hooks

| Hook | Type | Signature | Description |
|---|---|---|---|
| `authenticate` | filter | `(user: WPUser\|WPError\|null, username: string, password: string): WPUser\|WPError\|null` | The authentication chain. Return a `WP_User` to succeed, `WP_Error` to fail, or `null` to pass through. |
| `wp_authenticate_user` | filter | `(user: WPUser\|WPError, password: string): WPUser\|WPError` | Fired inside username/email password handlers after user lookup, before password check. |
| `wp_login` | action | `(userLogin: string, user: WPUser): void` | Fires after successful login via `wp_signon()`. |
| `wp_logout` | action | `(userId: number): void` | Fires when `wp_logout()` is called. |
| `wp_login_failed` | action | `(username: string, error: WPError): void` | Fires when `wp_authenticate()` returns a `WP_Error`. |

### User Lifecycle Hooks

| Hook | Type | Signature | Description |
|---|---|---|---|
| `user_register` | action | `(userId: number, userdata: object): void` | Fires after a new user is created via `wp_insert_user()`. |
| `profile_update` | action | `(userId: number, oldUserData: WPUser, newUserData: object): void` | Fires after an existing user is updated. |
| `delete_user` | action | `(id: number, reassign: number\|null, user: WPUser): void` | Fires before a user is deleted. |
| `deleted_user` | action | `(id: number, reassign: number\|null, user: WPUser): void` | Fires after a user is deleted. |
| `set_current_user` | action | `(): void` | Fires after `wp_set_current_user()` changes the current user. |

### Registration / Password Hooks

| Hook | Type | Description |
|---|---|---|
| `illegal_user_logins` | filter | Return array of disallowed username strings. Checked in `wp_insert_user()`. |
| `check_passwords` | action | `(username, password1, password2)` — fired in admin profile update for password confirmation. |
| `wp_set_password` | action | `(password, userId, oldUserData)` — fires after password is written to DB by `wp_set_password()`. |
| `random_password` | filter | Modify the output of `wp_generate_password()`. |
| `wp_hash_password_algorithm` | filter | Override the password hashing algorithm (default `PASSWORD_BCRYPT`). |
| `wp_hash_password_options` | filter | Override the options array passed to `password_hash()`. |
| `check_password` | filter | Override the result of `wp_check_password()`. |

### Cookie / Session Hooks

| Hook | Type | Description |
|---|---|---|
| `set_auth_cookie` | action | Fires just before auth cookies are written. |
| `set_logged_in_cookie` | action | Fires just before the logged-in cookie is written. |
| `clear_auth_cookie` | action | Fires just before auth cookies are cleared in `wp_clear_auth_cookie()`. |
| `send_auth_cookies` | filter | Return `false` to suppress all cookie `setcookie()` calls. |
| `auth_cookie_expiration` | filter | `(length, userId, remember)` — override cookie lifetime in seconds. |
| `secure_auth_cookie` | filter | `(secure, userId)` — override HTTPS-only for auth cookie. |
| `secure_logged_in_cookie` | filter | `(secure, userId, authSecure)` — override HTTPS-only for logged-in cookie. |
| `auth_cookie_valid` | action | Fires when a cookie is successfully validated. |
| `auth_cookie_malformed` | action | Fires when a cookie cannot be parsed. |
| `auth_cookie_expired` | action | Fires when a cookie's expiration has passed. |
| `auth_cookie_bad_hash` | action | Fires when the HMAC does not match. |
| `auth_cookie_bad_session_token` | action | Fires when the session token is invalid. |
| `determine_current_user` | filter | `(userId: number\|false)` — each registered handler attempts to identify the user (cookie, app password, etc.). |
| `session_token_manager` | filter | Override the `WP_Session_Tokens` implementation class name. |
| `attach_session_information` | filter | Add extra data to a new session on creation. |

### Capability Hooks

| Hook | Type | Description |
|---|---|---|
| `map_meta_cap` | filter | `(caps, cap, userId, args)` — final filter on the result of `map_meta_cap()`. |
| `user_has_cap` | filter | `(allcaps, requiredCaps, args, user)` — filter `allcaps` during `WP_User::has_cap()`. |
| `role_has_cap` | filter | `(capabilities, cap, roleName)` — filter a role's capability map in `WP_Role::has_cap()`. |
| `wp_roles_init` | action | Fires after `WP_Roles::init_roles()` completes. |

### Application Password Hooks

| Hook | Type | Description |
|---|---|---|
| `wp_create_application_password` | action | Fires after a new app password is created. |
| `wp_delete_application_password` | action | Fires after an app password is deleted. |
| `wp_update_application_password` | action | Fires after an app password is updated. |
| `application_password_is_api_request` | filter | `(isApiRequest: boolean)` — override whether this request qualifies for app password auth. |
| `wp_authenticate_application_password_errors` | action | `(error, user, item, password)` — allows plugins to inject additional authentication failures. |
| `application_password_did_authenticate` | action | Fires on successful app password authentication. |
| `application_password_failed_authentication` | action | Fires on failed app password authentication. |

---

## 15. TypeScript Interface Sketch

```typescript
// ─── Core Data Types ──────────────────────────────────────────────────────────

interface WPUserData {
  ID: number;
  user_login: string;
  user_pass: string;             // hashed
  user_nicename: string;
  user_email: string;
  user_url: string;
  user_registered: string;       // 'Y-m-d H:i:s' UTC
  user_activation_key: string;
  user_status: number;
  display_name: string;
}

interface WPUserMeta {
  first_name: string;
  last_name: string;
  nickname: string;
  description: string;
  rich_editing: 'true' | 'false';
  syntax_highlighting: 'true' | 'false';
  comment_shortcuts: string;
  admin_color: string;
  use_ssl: '0' | '1';
  show_admin_bar_front: 'true' | 'false';
  locale: string;
}

interface WPUser extends WPUserData {
  // Runtime-only (not in DB row):
  caps: Record<string, boolean>;       // individual grants/denials
  cap_key: string;                     // e.g. 'wp_capabilities'
  roles: string[];                     // e.g. ['editor']
  allcaps: Record<string, boolean>;    // merged role + individual caps
  filter: string | null;

  // Methods:
  exists(): boolean;
  has_cap(cap: string, ...args: unknown[]): boolean;
  get_role_caps(): void;
  add_role(role: string): void;
  remove_role(role: string): void;
  set_role(role: string): void;
  add_cap(cap: string, grant?: boolean): void;
  remove_cap(cap: string): void;
  remove_all_caps(): void;
  to_array(): Record<string, unknown>;
  get(key: string): unknown;
  has_prop(key: string): boolean;
  for_site(siteId?: number): void;
}

// ─── Roles ────────────────────────────────────────────────────────────────────

interface WPRole {
  name: string;
  capabilities: Record<string, boolean>;
  add_cap(cap: string, grant?: boolean): void;
  remove_cap(cap: string): void;
  has_cap(cap: string): boolean;
}

interface WPRoles {
  roles: Record<string, { name: string; capabilities: Record<string, boolean> }>;
  role_objects: Record<string, WPRole>;
  role_names: Record<string, string>;
  role_key: string;
  use_db: boolean;

  add_role(role: string, displayName: string, capabilities?: Record<string, boolean>): WPRole | void;
  remove_role(role: string): void;
  get_role(role: string): WPRole | null;
  add_cap(role: string, cap: string, grant?: boolean): void;
  remove_cap(role: string, cap: string): void;
  get_names(): Record<string, string>;
  is_role(role: string): boolean;
  for_site(siteId?: number): void;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

interface WPUserQueryArgs {
  blog_id?: number;
  role?: string | string[];
  role__in?: string[];
  role__not_in?: string[];
  capability?: string | string[];
  capability__in?: string[];
  capability__not_in?: string[];
  meta_key?: string | string[];
  meta_value?: string | string[];
  meta_compare?: string;
  meta_query?: object[];
  include?: number[];
  exclude?: number[];
  search?: string;
  search_columns?: string[];
  orderby?: string | string[] | Record<string, 'ASC' | 'DESC'>;
  order?: 'ASC' | 'DESC';
  offset?: number;
  number?: number;
  paged?: number;
  count_total?: boolean;
  fields?: string | string[];
  has_published_posts?: boolean | string[];
  nicename?: string;
  nicename__in?: string[];
  nicename__not_in?: string[];
  login?: string;
  login__in?: string[];
  login__not_in?: string[];
  cache_results?: boolean;
}

interface WPUserQuery {
  query_vars: WPUserQueryArgs;
  meta_query: object | false;
  request: string;    // final SQL
  get_results(): WPUser[] | object[];
  get_total(): number;
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

interface SessionData {
  expiration: number;
  ip?: string;
  ua?: string;
  login: number;
  [key: string]: unknown;
}

interface WPSessionTokens {
  create(expiration: number): string;
  get(token: string): SessionData | null;
  verify(token: string): boolean;
  update(token: string, session: SessionData): void;
  destroy(token: string): void;
  destroy_others(tokenToKeep: string): void;
  destroy_all(): void;
  get_all(): SessionData[];
}

// ─── Application Passwords ────────────────────────────────────────────────────

interface ApplicationPassword {
  uuid: string;
  app_id: string;
  name: string;
  password: string;         // hashed
  created: number;          // Unix timestamp
  last_used: number | null;
  last_ip: string | null;
}

interface WPApplicationPasswords {
  create_new_application_password(
    userId: number,
    args: { name: string; app_id?: string }
  ): [string, ApplicationPassword] | WPError;
  get_user_application_passwords(userId: number): ApplicationPassword[];
  delete_application_password(userId: number, uuid: string): true | WPError;
  delete_all_application_passwords(userId: number): number;
  update_application_password(userId: number, uuid: string, update: object): true | WPError;
  record_application_password_usage(userId: number, uuid: string): true | WPError;
  is_in_use(): boolean;
}

// ─── Auth Functions ───────────────────────────────────────────────────────────

interface UserAuthFunctions {
  wp_signon(
    credentials: { user_login?: string; user_password?: string; remember?: boolean },
    secureCookie?: string | boolean
  ): WPUser | WPError;

  wp_authenticate(username: string, password: string): WPUser | WPError;

  wp_set_auth_cookie(
    userId: number,
    remember?: boolean,
    secure?: string | boolean,
    token?: string
  ): void;

  wp_validate_auth_cookie(cookie?: string, scheme?: string): number | false;
  wp_clear_auth_cookie(): void;

  wp_hash_password(password: string): string;
  wp_check_password(password: string, hash: string, userId?: string | number): boolean;
  wp_generate_password(length?: number, specialChars?: boolean, extraSpecialChars?: boolean): string;
  wp_set_password(password: string, userId: number): void;

  wp_get_current_user(): WPUser;
  get_current_user_id(): number;
  is_user_logged_in(): boolean;
  wp_set_current_user(id: number | null, name?: string): WPUser;

  current_user_can(capability: string, ...args: unknown[]): boolean;
  user_can(user: WPUser | number, capability: string, ...args: unknown[]): boolean;
  map_meta_cap(cap: string, userId: number, ...args: unknown[]): string[];
}

// ─── CRUD Functions ───────────────────────────────────────────────────────────

interface UserCRUDFunctions {
  wp_insert_user(userdata: Partial<WPUserData & WPUserMeta> & { role?: string }): number | WPError;
  wp_update_user(userdata: Partial<WPUserData & WPUserMeta> & { ID: number }): number | WPError;
  wp_create_user(username: string, password: string, email?: string): number | WPError;
  wp_delete_user(id: number, reassign?: number | null): boolean;
  get_userdata(userId: number): WPUser | false;
  get_user_by(field: 'id' | 'ID' | 'slug' | 'email' | 'login', value: string | number): WPUser | false;
  get_users(args?: WPUserQueryArgs): WPUser[];
}

// ─── Meta Functions ───────────────────────────────────────────────────────────

interface UserMetaFunctions {
  get_user_meta(userId: number, key?: string, single?: boolean): unknown;
  update_user_meta(userId: number, metaKey: string, metaValue: unknown, prevValue?: unknown): number | boolean;
  add_user_meta(userId: number, metaKey: string, metaValue: unknown, unique?: boolean): number | false;
  delete_user_meta(userId: number, metaKey: string, metaValue?: unknown): boolean;
}
```

---

## 16. Design Patterns to Carry Over

1. **Capabilities are the unit of authorization, not roles.** Checking `user_can(user, 'editor')` (a role name) is discouraged and unreliable. Always check for a capability (`'edit_posts'`, `'manage_options'`, etc.). Roles are just named bags of capabilities; the actual permission check is always against the flat `allcaps` map.

2. **Meta capabilities require object context.** Any capability that ends in a singular noun (`edit_post`, `delete_user`, `read_post`) requires a specific object ID as an argument. Calling `current_user_can('edit_post')` without a post ID is a programming error — WordPress logs a `_doing_it_wrong` notice. The system is designed around always passing the object ID.

3. **`do_not_allow` is the capability system's hard veto.** If `map_meta_cap` returns `['do_not_allow']` in its result array, `has_cap()` returns `false` regardless of what the user's `allcaps` contains. Plugins can use this to unconditionally deny capabilities (e.g., blocking file editing when `DISALLOW_FILE_EDIT` is defined).

4. **The `authenticate` filter chain is the extension point for auth.** Adding a handler to `authenticate` at any priority is the correct way to implement custom authentication (OAuth, SSO, API keys, etc.). Return a `WP_User` to succeed, a `WP_Error` to fail, or the received `$user` (which may be null) to pass through to the next handler. The first handler that returns a `WP_User` wins.

5. **Cookies are three, but sessions are one.** A single session token is written into both the auth cookie and the logged-in cookie on login. The auth cookie (not sent to the front end) is the high-security one; the logged-in cookie (sent everywhere) is for front-end "am I logged in?" checks. The session token in both cookies is identical — destroying it (via `wp_destroy_current_session`) invalidates both.

6. **Application passwords are API-only.** The `application_password_is_api_request` filter defaults to `REST_REQUEST || XMLRPC_REQUEST`. There is no mechanism to use an application password via the standard HTML login form — the code explicitly returns `null` for non-API requests, allowing the `authenticate` chain to continue to the username/password handler.

7. **Password hashing is transparent and auto-migrating.** Both `wp_authenticate_username_password` and `wp_authenticate_email_password` check `wp_password_needs_rehash()` after a successful login and silently re-hash the password if needed. This means upgrading the hash algorithm (from phpass to bcrypt, or adjusting bcrypt cost) is zero-downtime — each user is migrated on their next successful login.

8. **`WP_User::allcaps` is ephemeral.** It is computed and cached on the `WP_User` instance at construction time (or when `for_site()` is called). Changes to roles or capabilities in the DB are not reflected until the object is re-fetched. Code that grants a cap and then immediately checks it on the same instance must call `get_role_caps()` to refresh.

9. **The `wp_capabilities` meta key is site-scoped in multisite.** A user who is an administrator on site 1 has `wp_capabilities = {"administrator":true}`. On site 5 they may have `wp_5_capabilities = {"editor":true}`. The `WP_User::for_site()` method re-initializes `cap_key` and reloads `caps`/`allcaps` for the target site. Always initialize `WP_User` with the correct site context in multisite.

10. **User meta read/write is "slashed".** The legacy convention of escaping slashes in database values is preserved. Always pass meta values through `wp_slash()` before calling `update_user_meta()` / `add_user_meta()`, and expect `wp_unslash()` behavior when values come out through `WP_User::__get()`.

11. **Session tokens are never stored in plaintext.** The raw 43-character token lives only in the cookie and in memory during `create()`. The DB stores `sha256(token)` as the key. This means a DB breach does not expose valid session tokens.

12. **`WP_User_Query` capability filtering is DB-only.** The `capability`, `capability__in`, and `capability__not_in` parameters search the `wp_capabilities` user meta value as a serialized string. They cannot find capabilities granted dynamically via the `user_has_cap` or `map_meta_cap` filters. For reliable capability-based user lists, use role-based filtering or post-process `get_users()` results with `user_can()`.

---

## 17. Tovu Reconstruction Notes

### 17.1 Why this exists

This is the core identity and authorization substrate for WordPress. It owns credential verification, session cookies, capability resolution, user CRUD, and the bridge between coarse roles and object-specific permissions.

### 17.2 What Tovu should preserve

- Capabilities as the actual authorization unit, with object-aware resolution for contextual actions
- A pluggable authentication chain rather than one hardcoded credential verifier
- Central session issuance and invalidation, with server-side revocation support
- Separation between user identity data, session state, and permission resolution

### 17.3 What Tovu can simplify

- Tovu does not need WordPress's exact multi-cookie layout if the session model stays revocable and scoped
- Global mutable user objects and slashing rules should not be copied into a new core
- Capability storage can be normalized instead of leaning on serialized user meta conventions

### 17.4 Possible Tovu seams

- `src/features/user/` for user records and profile data
- `src/features/access/` for capabilities, policies, and object-level checks
- `src/core/ports/IdentityStorePort.ts` for user persistence
- `src/core/ports/SessionPort.ts` for session issuance, rotation, and revocation
- `src/core/ports/CapabilityResolverPort.ts` for role/policy-to-capability evaluation

### 17.5 Suggested priority

- `V1`: user CRUD, password verification, session invalidation, capability checks, auth chain seam
- `Later`: full application-password parity, multisite site-scoped capability nuance, and compatibility edge cases
