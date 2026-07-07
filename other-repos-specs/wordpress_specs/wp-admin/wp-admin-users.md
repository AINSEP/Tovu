# WP Admin: User Management — Specification

**Source files analyzed:**
- `wp-admin/users.php`
- `wp-admin/user-edit.php`
- `wp-admin/user-new.php`
- `wp-admin/ms-users.php`
- `wp-admin/user/admin.php`
- `wp-admin/user/index.php`
- `wp-admin/user/profile.php`
- `wp-admin/user/user-edit.php`
- `wp-admin/user/menu.php`
- `wp-admin/user/about.php`, `credits.php`, `freedoms.php`, `privacy.php`, `contribute.php`

---

## 1. Routes

| Route | Purpose | Required Capability |
|---|---|---|
| `GET /wp-admin/users.php` | List all users | `list_users` |
| `POST /wp-admin/users.php?action=promote` | Bulk change roles | `promote_users` |
| `POST /wp-admin/users.php?action=delete` | Show delete confirmation | `delete_users` |
| `POST /wp-admin/users.php?action=dodelete` | Execute user deletion (single-site only) | `delete_users` |
| `POST /wp-admin/users.php?action=remove` | Show remove-from-site confirmation (multisite) | `remove_users` |
| `POST /wp-admin/users.php?action=doremove` | Execute user removal from site (multisite) | `remove_users` |
| `POST /wp-admin/users.php?action=resetpassword` | Send password reset emails | `edit_users` |
| `GET /wp-admin/user-edit.php?user_id=:id` | Edit another user's profile | `edit_user` (per-user) |
| `GET /wp-admin/profile.php` | Edit own profile | authenticated |
| `POST /wp-admin/user-edit.php?action=update` | Save user/profile changes | `edit_user` (per-user) |
| `GET /wp-admin/user-new.php` | Show add user form | `create_users` OR (`promote_users` on multisite) |
| `POST /wp-admin/user-new.php?action=createuser` | Create new user | `create_users` |
| `POST /wp-admin/user-new.php?action=adduser` | Add existing network user to site (multisite) | `promote_users` |
| `GET /wp-admin/ms-users.php` | Redirect to network admin users | any (redirect) |
| `GET /wp-admin/user/*` | User-context admin panel (multisite) | authenticated |

---

## 2. Authorization Model

### Capabilities Used

```typescript
type UserCapability =
  | 'list_users'           // view the users list
  | 'create_users'         // create brand new users
  | 'edit_users'           // edit any user (implies edit_user per-user)
  | 'edit_user'            // edit a specific user (checked with user ID)
  | 'delete_users'         // delete users
  | 'delete_user'          // delete a specific user (checked with user ID)
  | 'promote_users'        // change user roles
  | 'promote_user'         // promote a specific user (checked with user ID)
  | 'remove_users'         // remove users from site (multisite)
  | 'remove_user'          // remove a specific user (checked with user ID)
  | 'manage_network_users' // network admin: manage users across all sites
  | 'manage_network_options' // grant/revoke super admin
  | 'install_languages';   // install language packs
```

### Authorization Rules

- A user **cannot** delete or demote themselves (their own user ID is excluded from bulk delete/promote actions with specific error codes).
- A user **cannot** promote themselves to a role that lacks the `promote_users` capability unless they are a multisite super admin.
- On multisite, deletion is blocked at the site level; only removal from a blog is allowed. Deletion happens at the network admin level.
- On multisite, a non-network-admin can only add existing users by email (not username). Network admins can also look up by login.
- The `IS_PROFILE_PAGE` flag is `true` when `user_id === currentUser.id`.

---

## 3. Data Types

### User (core fields)

```typescript
interface WPUser {
  ID: number;
  user_login: string;        // immutable after creation
  user_email: string;
  user_url: string;
  display_name: string;
  first_name: string;
  last_name: string;
  nickname: string;
  description: string;       // biographical info
  locale: string;            // '' means site default, 'en_US' stored as ''
  roles: string[];           // e.g. ['administrator'], ['editor']
  caps: Record<string, boolean>; // individual capability grants/denials beyond roles
  rich_editing: 'true' | 'false';
  syntax_highlighting: 'true' | 'false';
  comment_shortcuts: 'true' | 'false';
  admin_bar_front: boolean;  // show toolbar on front end
  user_registered: string;   // datetime
}
```

### Role

```typescript
interface WPRole {
  name: string;              // display name, translatable
  capabilities: Record<string, boolean>;
}
```

### Standard Roles

```typescript
type WPRoleSlug = 'administrator' | 'editor' | 'author' | 'contributor' | 'subscriber';
```

Role hierarchy (capabilities, not inheritance):
- **Subscriber**: read-only, can comment, receive newsletters
- **Contributor**: write/manage own posts, cannot publish or upload media
- **Author**: publish own posts, upload media
- **Editor**: manage all posts, moderate comments
- **Administrator**: full site admin access

### Application Password

```typescript
interface ApplicationPassword {
  uuid: string;
  app_id: string;
  name: string;
  password: string;          // hashed; shown once in plaintext on creation
  created: string;           // datetime
  last_used: string | null;
  last_ip: string | null;
}
```

### Session Token

```typescript
interface SessionToken {
  expiration: number;        // unix timestamp
  ip: string;
  ua: string;                // user agent
  login: number;             // unix timestamp
}
```

---

## 4. Screens and Their Behavior

### 4.1 User List (`users.php` default action)

**Purpose:** Paginated, filterable, searchable table of all users.

**Query parameters:**
- `role` — filter by role slug
- `s` — search query (searches login, name, email)
- `paged` — page number
- `orderby` — column to sort
- `order` — `asc` | `desc`

**Displayed columns (configurable via Screen Options):**
- Username (link to edit)
- Name
- Email
- Role
- Posts (count, links to post list filtered by author)

**Row actions (on hover):**
- **Edit** — go to `user-edit.php?user_id=:id`
- **Delete** (single-site) — go to `users.php?action=delete&user=:id`
- **Remove** (multisite) — go to `users.php?action=remove&user=:id`
- **View** — go to public author archive
- **Send password reset** — only if current user has `edit_users`

**Bulk actions:**
- Change Role To — dropdown of editable roles + "No role for this site"
- Delete (single-site only)
- Remove (multisite only)
- Send Password Reset

**Flash messages (via `?update=` query param):**

| `update` value | Message type | Text |
|---|---|---|
| `del` / `del_many` | success | "{n} user(s) deleted." |
| `add` | success | "New user created." + optional edit link |
| `resetpassword` | success | "Password reset link(s) sent to {n} user(s)." |
| `promote` | success | "Changed roles." |
| `err_admin_role` | error | "Current user's role must have user editing capabilities." |
| `err_admin_del` | error | "You cannot delete the current user." |
| `remove` | success | "User removed from this site." |
| `err_admin_remove` | error | "You cannot remove the current user." |

---

### 4.2 Delete Confirmation (`users.php?action=delete`)

**Single-site only.** Multisite returns 400.

**Behavior:**
1. Lists all selected users. If a user is the current user, they are shown with a note "will not be deleted" and excluded from the `users[]` hidden inputs.
2. Checks if any of the targeted users have content (posts in `wp_posts` where `post_author IN (ids)`, or links in `wp_links` where `link_owner IN (ids)`). Also fires `users_have_additional_content` filter.
3. If users have content, shows a content disposition fieldset:
   - Radio: "Delete all content."
   - Radio: "Attribute all content to: [user dropdown excluding target users]"
4. If users have no content, a hidden field `delete_option=delete` is submitted automatically.
5. Fires `delete_user_form` action before the confirm button.
6. Submit posts to `action=dodelete`.

**Redirect on no valid users:** back to `users.php`.

---

### 4.3 Execute Delete (`users.php?action=dodelete`)

**Inputs:** `users[]` (array of IDs), `delete_option` (`delete` | `reassign`), `reassign_user` (user ID, when reassigning).

**Rules:**
- Requires nonce `delete-users`.
- Skips current user (sets `update=err_admin_del`).
- For each user: calls `wp_delete_user(id)` or `wp_delete_user(id, reassign_user_id)`.
- Redirects to `users.php?update=del&delete_count={n}`.

---

### 4.4 Remove from Site (`users.php?action=remove` / `doremove`) — Multisite only

**Behavior mirrors delete confirmation** but uses `remove_user_from_blog(id, blog_id)` instead of deletion. No content reassignment step.

---

### 4.5 Bulk Role Change (`users.php?action=promote`)

**Inputs:** `users[]` (array of IDs), `new_role` (role slug or `'none'`).

**Rules:**
- `'none'` is treated as empty string — removes role assignment.
- Current user cannot demote themselves to a role without `promote_users` (unless multisite super admin).
- On multisite, user must be a member of the blog.

---

### 4.6 Bulk Password Reset (`users.php?action=resetpassword`)

**Inputs:** `users[]` (array of IDs).

**Rules:**
- Skips current user (sets `update=err_admin_reset`).
- Calls `retrieve_password(user_login)` for each user — sends the reset email.
- Redirects to `users.php?update=resetpassword&reset_count={n}`.

---

### 4.7 Edit User / Profile (`user-edit.php`)

**Dual-purpose:** editing own profile (`IS_PROFILE_PAGE = true`) or another user's profile.

**Form sections:**

#### Personal Options
| Field | Type | Condition |
|---|---|---|
| Visual Editor | checkbox (disable) | shown only if currently disabled (`rich_editing === 'false'`) |
| Syntax Highlighting | checkbox (disable) | shown if user has `edit_theme_options`, `edit_plugins`, or `edit_themes` |
| Admin Color Scheme | custom picker | shown if >1 color scheme registered and `admin_color_scheme_picker` action has listeners |
| Keyboard Shortcuts | checkbox (enable) | shown unless profile page with no edit permission |
| Toolbar | checkbox (show on front end) | always shown |
| Language | dropdown | shown if languages available or user can install languages |

#### Name
| Field | Type | Notes |
|---|---|---|
| Username | text (readonly) | never editable |
| Role | select | shown if not profile page, not network admin, and current user has `promote_user` for this user |
| Super Admin | checkbox | multisite network admin only; not shown if `$super_admins` global is set |
| First Name | text | autocomplete="given-name" on own profile |
| Last Name | text | autocomplete="family-name" on own profile |
| Nickname | text (required) | autocomplete="nickname" on own profile |
| Display Name | select | computed from available combinations of first/last/nickname/login/display_name |

#### Contact Info
| Field | Type | Notes |
|---|---|---|
| Email | email (required) | on own profile: changing sends confirmation email; new address inactive until confirmed |
| Website | url | |
| Additional contact methods | text | dynamic via `wp_get_user_contact_methods()` |

#### About
| Field | Type | Notes |
|---|---|---|
| Biographical Info | textarea | |
| Profile Picture | display only | shown if `show_avatars` option is on; links to Gravatar on own profile |

#### Account Management (shown if `show_password_fields` filter returns true)
| Field | Type | Notes |
|---|---|---|
| New Password | password | auto-generated suggestion; JS-powered strength meter |
| Repeat New Password | password | only visible without JS |
| Confirm weak password | checkbox | shown when strength meter detects weak password |
| Send Reset Link | button | shown if not own profile and `wp_is_password_reset_allowed_for_user()` returns true |
| Sessions | button "Log Out Everywhere Else" / "Log Out Everywhere" | shown if sessions exist |

#### Application Passwords
Shown if `wp_is_application_passwords_available_for_user(user_id)` OR HTTPS is not enabled.
- Requires HTTPS (or `WP_ENVIRONMENT_TYPE` workaround).
- Not shown if site is protected by HTTP Basic Auth.
- On multisite: displays count/scope of sites the password grants access to.
- Form: text input for app name + "Add Application Password" button.
- List table of existing passwords with revoke action.
- New password shown **once** in a dismissible notice after creation.

#### Additional Capabilities
Shown if the user has individual capability grants/denials beyond what their role provides.
Read-only display of cap name or "Denied: cap_name".

**Email confirmation flow (own profile only):**
- After changing email: `_new_email` user meta is set; confirmation email sent.
- Visiting `profile.php?newuseremail={hash}` confirms the change.
- Visiting `profile.php?dismiss={user_id}_new_email` cancels the pending change.
- A notice with a cancel link is shown while a change is pending.

**Update action:**
- Nonce: `update-user_{user_id}`
- Calls `edit_user(user_id)`
- On multisite network admin: optionally grants/revokes super admin based on `super_admin` checkbox
- On success: redirects to `user-edit.php?user_id={id}&updated=true` (plus optional `wp_http_referer`)
- On error: re-renders form with `WP_Error` messages

**Hooks fired:**
- `personal_options_update` (before save, own profile)
- `edit_user_profile_update` (before save, other user)
- `personal_options` (in Personal Options table, after standard fields)
- `profile_personal_options` (after Personal Options table, own profile)
- `show_user_profile` (after Application Passwords section, own profile)
- `edit_user_profile` (after Application Passwords section, other user)
- `user_edit_form_tag` (inside `<form>` tag)
- `admin_color_scheme_picker` (color scheme row)
- `wp_create_application_password_form` (inside app password creation form)

**Filters:**
- `enable_edit_any_user_configuration` — multisite: allow admin to edit any user (default true)
- `show_password_fields` — whether to show password section (default true)
- `additional_capabilities_display` — whether to show additional caps section (default true)
- `user_profile_picture_description` — description under Gravatar
- `user_{name}_label` — label for each contact method

---

### 4.8 Add New User (`user-new.php`)

Two forms may be present simultaneously if the user has both `create_users` and `promote_users` on multisite (`$do_both = true`).

#### Form A: Add Existing User (multisite only, requires `promote_users`)

| Field | Type | Notes |
|---|---|---|
| Email or Username | text or email | network admins can use username; others email only |
| Role | select | defaults to `default_role` option |
| Skip Confirmation Email | checkbox | network admins only |

**Processing (`action=adduser`):**
1. Look up user by email (or login if network admin).
2. If user not found → redirect `?update=does_not_exist`.
3. If user already a member of this blog → redirect `?update=addexisting`.
4. If `noconfirmation` set and network admin: call `add_existing_user_to_blog({user_id, role})` directly.
5. Otherwise: generate 20-char token, store in `new_user_{token}` option, send invitation email, redirect `?update=add`.

**Invitation email content:**
- To: user's email
- Subject: `[{site_title}] Joining Confirmation`
- Body: invitation message with link to `home_url(/newbloguser/{token}/)`
- Filterable via `invited_user_email` filter
- Sent in the invitee's locale (uses `switch_to_user_locale`)

#### Form B: Create New User (requires `create_users`)

| Field | Type | Condition |
|---|---|---|
| Username | text (required, max 60) | always |
| Email | email (required) | always |
| First Name | text | single-site only |
| Last Name | text | single-site only |
| Website | url | single-site only |
| Language | select | single-site only, if languages available |
| Password | password (required) | single-site only; auto-generated |
| Repeat Password | password | single-site only, hidden without JS |
| Confirm weak password | checkbox | single-site only |
| Send User Notification | checkbox (default on) | single-site only |
| Role | select | if `promote_users` |
| Skip Confirmation Email | checkbox | multisite network admin only |

**Processing (`action=createuser`):**

*Single-site:*
1. Call `edit_user()` (creates user).
2. On success: redirect to `users.php?update=add&id={user_id}` (or `user-new.php?update=add` if can't list users).
3. On error: re-render form with errors.

*Multisite:*
1. Validate via `wpmu_validate_user_signup(login, email)`.
2. If `noconfirmation` (network admin): disable notification emails, call `wpmu_signup_user()`, then immediately `wpmu_activate_signup(key)`.
3. Otherwise: call `wpmu_signup_user()`, redirect `?update=newuserconfirmation`.

**Hooks fired:**
- `user_new_form_tag` — inside `<form>` tag (both forms)
- `user_new_form` — at end of form, with context string `'add-existing-user'` or `'add-new-user'`
- `invite_user` — after existing user is invited, before notification is sent

**Flash messages on `?update=`:**

| `update` value | Message |
|---|---|
| `newuserconfirmation` | "Invitation email sent to new user. A confirmation link must be clicked before their account is created." |
| `add` | "Invitation email sent to user. A confirmation link must be clicked for them to be added to your site." (multisite) / "User added." (single-site) |
| `addnoconfirmation` | "User has been added to your site." + optional edit link |
| `addexisting` | "That user is already a member of this site." |
| `could_not_add` | Error: "That user could not be added to this site." |
| `created_could_not_add` | Error: "User has been created, but could not be added to this site." |
| `does_not_exist` | Error: "The requested user does not exist." |
| `enter_email` | Error: "Please enter a valid email address." |

---

## 5. Multisite: User Admin Panel (`wp-admin/user/`)

### `user/admin.php` — Bootstrap

Sets `WP_USER_ADMIN = true`. Only active on multisite.

On non-primary sites (domain/path differs from root site), redirects to `user_admin_url()`. This can be overridden with the `redirect_user_admin_request` filter.

On single-site, redirects to `admin_url()`.

### `user/menu.php` — Navigation Menu

Defines a minimal menu for the user-context admin:

```
[2]  Dashboard   → index.php
[4]  (separator)
[70] Profile     → profile.php
[99] (separator)
```

Maps `users.php` parent file to `profile.php` for breadcrumb purposes.

### Other files in `user/`

These are thin wrappers that just load the corresponding root admin file:

| File | Loads |
|---|---|
| `user/index.php` | `wp-admin/index.php` |
| `user/profile.php` | `wp-admin/profile.php` |
| `user/user-edit.php` | `wp-admin/user-edit.php` |
| `user/about.php` | `wp-admin/about.php` |
| `user/credits.php` | `wp-admin/credits.php` |
| `user/freedoms.php` | `wp-admin/freedoms.php` |
| `user/privacy.php` | `wp-admin/privacy.php` |
| `user/contribute.php` | `wp-admin/contribute.php` |

### `ms-users.php`

A simple redirect: immediately sends the browser to `network_admin_url('users.php')`. No logic.

---

## 6. Security

- **CSRF**: Every mutation uses `check_admin_referer(nonce)`. Nonces are action-scoped (e.g. `bulk-users`, `delete-users`, `remove-users`, `update-user_{id}`, `create-user`, `add-user`).
- **Input sanitization**:
  - User IDs: `absint()` / `intval()`
  - Text: `sanitize_text_field()`
  - URLs: `sanitize_url()`
  - Email: `is_email()` validation
- **Output escaping**: `esc_attr()`, `esc_html()`, `esc_url()` throughout HTML output.
- **Capability checks**: performed before every action, both at the bulk level and per-user in loops.
- **Self-protection**: current user is excluded from delete/remove/demote operations.
- **Email confirmation**: email changes require a hash-verified confirmation link before taking effect.
- **Application passwords**: disabled on sites with HTTP Basic Auth; requires HTTPS (except development environments).
- **Password visibility**: `data-pw` attribute holds the auto-generated password; `type="password"` field by default.

---

## 7. TypeScript Interface Sketch

```typescript
// Service interface for a TypeScript rewrite

interface UserService {
  listUsers(query: UserListQuery): Promise<PaginatedResult<WPUser>>;
  getUser(id: number): Promise<WPUser>;
  createUser(data: CreateUserInput): Promise<WPUser>;
  updateUser(id: number, data: UpdateUserInput): Promise<WPUser>;
  deleteUser(id: number, options: DeleteUserOptions): Promise<void>;
  removeUserFromSite(userId: number, siteId: number): Promise<void>;
  setUserRole(userId: number, role: string | null): Promise<void>;
  sendPasswordReset(userId: number): Promise<boolean>;
  destroyUserSessions(userId: number): Promise<void>;
  confirmEmailChange(userId: number, hash: string): Promise<void>;
  cancelEmailChange(userId: number): Promise<void>;
  addExistingUserToSite(userId: number, role: string, skipConfirmation: boolean): Promise<void>;
  inviteUserToSite(emailOrLogin: string, role: string): Promise<void>;
  createApplicationPassword(userId: number, appName: string): Promise<{ password: string; item: ApplicationPassword }>;
  revokeApplicationPassword(userId: number, uuid: string): Promise<void>;
  listApplicationPasswords(userId: number): Promise<ApplicationPassword[]>;
}

interface UserListQuery {
  role?: string;
  search?: string;
  page?: number;
  perPage?: number;
  orderBy?: 'login' | 'name' | 'email' | 'registered' | 'post_count';
  order?: 'asc' | 'desc';
}

interface CreateUserInput {
  username: string;           // immutable
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  url?: string;
  role?: string;
  locale?: string;
  sendNotification?: boolean;
}

interface UpdateUserInput {
  email?: string;
  firstName?: string;
  lastName?: string;
  nickname?: string;
  displayName?: string;
  url?: string;
  description?: string;
  locale?: string;
  role?: string;
  richEditing?: boolean;
  syntaxHighlighting?: boolean;
  commentShortcuts?: boolean;
  showAdminBarFront?: boolean;
  adminColorScheme?: string;
  password?: string;
  superAdmin?: boolean;       // multisite network admin only
}

interface DeleteUserOptions {
  contentAction: 'delete' | 'reassign';
  reassignTo?: number;        // user ID; required if contentAction === 'reassign'
}

interface PaginatedResult<T> {
  items: T[];
  total: number;
  totalPages: number;
  page: number;
}
```

---

## 8. Notable Design Patterns to Carry Over

1. **Capability-per-action-per-user**: Authorization is checked both at the bulk level AND per-user inside loops. A partial failure should not abort the whole batch.
2. **Soft self-protection**: The current user is skipped (not errored out) in bulk delete/remove, with a secondary error code in the redirect.
3. **PRG pattern**: All POST mutations redirect to GET with `?update=` to display flash messages, preventing re-submission on refresh.
4. **Dual form**: The add-user screen can present both "Add Existing" and "Create New" forms simultaneously on multisite.
5. **Deferred email confirmation**: Email changes are not applied immediately; a confirmation step via email link is required.
6. **Content orphan handling**: Deleting a user requires resolving ownership of their posts/links before proceeding.
7. **Locale-aware emails**: Invitation/notification emails are sent in the recipient's locale.

---

## Tovu Reconstruction Notes

### Why this exists

This surface exists to let operators manage the user lifecycle safely: create, invite, edit, role-change, credential-manage, and delete users without corrupting ownership or bypassing notification rules.

### What Tovu should preserve

- Per-action and per-user authorization checks, especially inside bulk operations
- Content reassignment/deletion decisions as part of destructive user workflows
- Deferred confirmation for sensitive identity changes like email updates
- Clear separation between operator-facing user management and end-user self-service

### What Tovu can simplify

- Tovu can use cleaner modern forms and workflows instead of carrying forward every admin-screen nuance
- Dual-form multisite add-user flows are only necessary if Tovu exposes the same tenant model

### Possible Tovu seams

- `src/admin/users/`
- `src/features/user/`
- `src/core/ports/IdentityStorePort.ts`
- `src/core/ports/UserOwnershipTransferPort.ts`

### Suggested priority

- `V1`: operator user CRUD, role assignment, invite/create flows, ownership transfer on delete
- `Later`: multisite-specific form parity and deeper application-password management UI
