# Spec: `wp-signup.php`

**Source:** `wordpress/wp-signup.php`
**Lines:** 1054
**Multisite only**
**Role:** Front-end new user and new site registration

---

## Purpose

Provides the public-facing signup flow for WordPress multisite. Handles three scenarios:
1. A new visitor registering a username (and optionally a site)
2. A logged-in user creating an additional site
3. A visitor registering both a username and a new site in one flow

---

## Entry Conditions

- Loads `wp-load.php` and `wp-blog-header.php`
- Adds `wp_robots_no_robots` filter (no indexing)
- Sends `nocache_headers()`
- If `illegal_names` site option contains `$_GET['new']`: redirect to network home and exit
- If not multisite: redirect to `wp_registration_url()` and exit
- If not the main site: redirect to `network_site_url('wp-signup.php')` and exit

---

## `$active_signup` — Registration Mode

Read from `get_site_option('registration', 'none')`. Filterable via `wpmu_active_signup`.

| Value | Allows |
|---|---|
| `'none'` | Nobody can register |
| `'user'` | New users only (no new sites) |
| `'blog'` | New sites only (must be logged in) |
| `'all'` | Both new users and new sites |

Network admins always see a notice showing the current mode.

---

## Stage Dispatch

The main switch is driven by `$_POST['stage']`:

| Stage | Handler | Condition |
|---|---|---|
| `default` | Show initial form | (see routing below) |
| `validate-user-signup` | `validate_user_signup()` | `active_signup === 'all'` or matches `signup_for` |
| `validate-blog-signup` | `validate_blog_signup()` | `active_signup === 'all'` or `'blog'` |
| `gimmeanotherblog` | `validate_another_blog_signup()` | logged-in user adding another site |

### Default stage routing

```
if active_signup === 'none'         → show "Registration disabled"
if active_signup === 'blog' && !logged_in → show "Must log in first"
if logged_in && (all|blog)          → signup_another_blog()
if !logged_in && (all|user)         → signup_user()
if !logged_in && blog               → show "Not allowed"
if logged_in && neither             → "Already logged in"
```

If `$_GET['new']` is present and is a valid blog address, display a suggestion: "The site {address} doesn't exist, but you can create it now!"

---

## Form: New User (`signup_user()`)

Shown to unauthenticated visitors when `active_signup` is `'user'` or `'all'`.

**Fields:**
- Username (`user_name`, text, max 60, lowercase, min 4 chars, letters and numbers only)
- Email address (`user_email`, email, max 200)
- Additional fields via `signup_extra_fields` action

**If `active_signup === 'all'`:** radio buttons asking "Gimme a site!" vs "Just a username"
**If `active_signup === 'blog'`:** hidden field `signup_for=blog`
**If `active_signup === 'user'`:** hidden field `signup_for=user`

**Stage:** `validate-user-signup`

**Filters:** `signup_user_init` — can override `user_name`, `user_email`, `errors`

---

## Form: New Site (`signup_blog()`)

Shown after the user step when `signup_for=blog`.

**Fields:**
- Site name — subdirectory install: text prefix of `{network_domain}{network_path}`; subdomain install: text with `.{site_domain}` suffix. Max 60 chars.
- Site title (text)
- Site language (dropdown, if languages available)
- Privacy: "Allow search engines to index" radio (yes/no)
- Hidden: `user_name`, `user_email`

**Stage:** `validate-blog-signup`

**Filters:** `signup_blog_init` — can override all form defaults

---

## Form: Another Blog (`signup_another_blog()`)

Shown to logged-in users when `active_signup` is `'blog'` or `'all'`. Lists existing sites.

**Fields:** Same as new site form (blog name, title, language, privacy)

**Stage:** `gimmeanotherblog`

**Filters:** `signup_another_blog_init`

---

## Validation: `validate_user_signup()`

1. `wpmu_validate_user_signup($user_name, $user_email)` → returns `{ user_name, user_email, errors }`
2. If errors: re-display `signup_user()` form and return false
3. If `signup_for === 'blog'`: call `signup_blog($user_name, $user_email)` and return false (move to site step)
4. Otherwise: `wpmu_signup_user($user_name, $user_email, apply_filters('add_signup_meta', []))` — store pending signup
5. `confirm_user_signup($user_name, $user_email)` — show confirmation

---

## Validation: `validate_blog_signup()`

1. Re-validate user: `wpmu_validate_user_signup($user_name, $user_email)` — if errors, redirect to user form
2. `wpmu_validate_blog_signup($blogname, $blog_title)` → returns `{ domain, path, blogname, blog_title, errors }`
3. If errors: re-display `signup_blog()` form and return false
4. Build meta: `{ lang_id: 1, public: (int)blog_public }` + `WPLANG` if set
5. Apply `add_signup_meta` filter
6. `wpmu_signup_blog(domain, path, blog_title, user_name, user_email, meta)` — store pending signup
7. `confirm_blog_signup(...)` — show confirmation

---

## Validation: `validate_another_blog_signup()`

Only for logged-in users. Requires `is_user_logged_in()`.

1. `validate_blog_form()` → calls `wpmu_validate_blog_signup` with current user
2. If errors: re-display `signup_another_blog()` form
3. `wpmu_create_blog(domain, path, blog_title, current_user->ID, meta, network_id)` — create immediately (no email confirmation needed for existing users)
4. `confirm_another_blog_signup(...)` — show confirmation with links to new site

---

## Confirmation Screens

### `confirm_user_signup($user_name, $user_email)`

Shows:
- "{username} is your new username"
- "You must activate it" — check email at `{user_email}`, activation within 2 days

Fires `signup_finished` action.

### `confirm_blog_signup($domain, $path, $blog_title, $user_name, $user_email, $meta)`

Shows:
- "Your new site, {title}, is almost ready"
- "You must activate it" — check email, activation within 2 days
- Tips for if email doesn't arrive

Fires `signup_finished` action.

### `confirm_another_blog_signup($domain, $path, $blog_title, $user_name, $user_email, $meta, $blog_id)`

Shows:
- "The site {title} is yours."
- Links to view site and log in

Fires `signup_finished` action.

---

## Language Availability

`signup_get_available_languages()`:
- Gets installed languages via `get_available_languages()`
- Filterable via `signup_get_available_languages`
- Strips any languages returned by the filter that aren't actually installed
- Used to populate language dropdowns in both user and site forms

---

## Hooks Reference

| Hook | Type | When |
|---|---|---|
| `before_signup_header` | action | before `get_header()` |
| `signup_header` | action | inside `wp_head` |
| `before_signup_form` | action | before form container |
| `preprocess_signup_form` | action | on default stage before display |
| `signup_hidden_fields` | action | inside each `<form>`, for plugins to add hidden fields |
| `signup_extra_fields` | action | at end of user fields in `show_user_form()` |
| `signup_blogform` | action | at end of site fields in `show_blog_form()` |
| `signup_user_init` | filter | default values for user signup form |
| `signup_blog_init` | filter | default values for site signup form |
| `signup_another_blog_init` | filter | default values for another-blog form |
| `wpmu_active_signup` | filter | override registration mode |
| `wp_signup_location` | filter | override signup URL (used in wp-login.php register redirect) |
| `add_signup_meta` | filter | add/modify meta stored with signup record |
| `signup_get_available_languages` | filter | list of available languages |
| `signup_finished` | action | after each confirmation screen |
| `after_signup_form` | action | after all forms, before footer |

---

## TypeScript Interface

```typescript
type SignupMode = 'none' | 'user' | 'blog' | 'all';
type SignupStage =
  | 'default'
  | 'validate-user-signup'
  | 'validate-blog-signup'
  | 'gimmeanotherblog';

interface SignupController {
  getSignupMode(): Promise<SignupMode>;
  showUserForm(state: UserSignupState): Promise<void>;
  showBlogForm(state: BlogSignupState): Promise<void>;
  validateUserSignup(data: UserSignupInput): Promise<SignupResult>;
  validateBlogSignup(data: BlogSignupInput): Promise<SignupResult>;
  validateAnotherBlogSignup(data: BlogSignupInput, userId: number): Promise<SignupResult>;
}

interface UserSignupInput {
  userName: string;
  userEmail: string;
  signupFor: 'blog' | 'user';
}

interface BlogSignupInput {
  blogname: string;
  blogTitle: string;
  blogPublic: 0 | 1;
  WPLANG?: string;
  userName?: string;    // carried from user step
  userEmail?: string;
}

interface SignupResult {
  success: boolean;
  errors?: ValidationError[];
  userId?: number;
  blogId?: number;
}
```

---

## Tovu Reconstruction Notes

### Why this exists

This archival note preserves the earlier `wp-signup.php` decomposition. The canonical Tovu-facing treatment now lives in [auth-and-signup.md](/Users/la/Desktop/Tovu AI CMS/other-repos/wordpress_specs/wp-root/auth-and-signup.md).

### What Tovu should preserve

- The pending-signup and activation separation described in the consolidated auth/signup doc

### What Tovu can simplify

- Use the consolidated auth/signup spec as the actual planning surface for Tovu

### Possible Tovu seams

- `src/features/auth/core/`
- `src/core/ports/SignupVerificationPort.ts`

### Suggested priority

- `Reference only`; implement from the consolidated auth/signup spec
