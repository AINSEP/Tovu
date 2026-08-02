# Spec: `wp-login.php`

**Source:** `wordpress/wp-login.php`
**Lines:** 1652
**Role:** All authentication-related screens and actions

---

## Purpose

Single file handling every authentication user-facing flow: login, logout, self-registration, password reset, post-password unlock, admin email verification, and GDPR data request confirmation.

---

## Entry Conditions

- Loads `wp-load.php` first
- If `FORCE_SSL_ADMIN` is true and request is not HTTPS: redirect to HTTPS equivalent and exit

---

## Action Dispatch

The `$action` request parameter (from `$_REQUEST['action']`) drives a `switch` statement. The action is validated against a whitelist; unknown actions default to `'login'`.

```
$action = $_REQUEST['action'] ?? 'login'
```

Overrides:
- `$_GET['key']` is present → force `$action = 'resetpass'`
- `$_GET['checkemail']` is present → force `$action = 'checkemail'`

### Allowed actions

```typescript
type LoginAction =
  | 'confirm_admin_email'
  | 'postpass'
  | 'logout'
  | 'lostpassword'
  | 'retrievepassword'   // alias for lostpassword
  | 'resetpass'
  | 'rp'                 // alias for resetpass
  | 'register'
  | 'checkemail'
  | 'confirmaction'
  | 'login'              // default
  | 'entered_recovery_mode' // WP_Recovery_Mode_Link_Service::LOGIN_ACTION_ENTERED
```

Any action not in this list and without a `login_form_{action}` filter → defaulted to `'login'`.

---

## Pre-dispatch Setup

1. Send no-cache headers
2. Set `Content-Type` header
3. If `RELOCATE` constant is defined: auto-update `siteurl` to match current server location
4. Set test cookie (`TEST_COOKIE`) to detect cookie support
5. If `$_GET['wp_lang']` is set: set `wp_lang` cookie
6. `do_action('login_init')`
7. `do_action("login_form_{$action}")`
8. Determine if request is `POST` (`$http_post`)
9. Determine if this is an interim login (`$interim_login = isset($_REQUEST['interim-login'])`)

---

## HTML Functions

### `login_header($title, $message, $wp_error)`

Outputs full `<!DOCTYPE html>` through to `<div id="login">`. Responsibilities:
- Set `robots: noindex` meta
- Enqueue `login` stylesheet
- If `$action` error code is in `$shake_error_codes`: register `wp_shake_js` on `login_footer` hook
- Set page title: `"{screen_name} ‹ {site_name} — WordPress"`
- In recovery mode: prefix title with "Recovery Mode"
- Add body classes: `login-action-{action}`, `wp-core-ui`, `rtl` if RTL, `interim-login` if interim, `locale-{locale}`
- Render error list or message notices from `WP_Error`
- Fire hooks: `login_enqueue_scripts`, `login_head`, `login_header`

### `login_footer($input_id)`

Outputs from closing `</div>` through `</html>`. Responsibilities:
- If not interim: show "← Go to {site}" link and privacy policy link
- Language switcher form (if not interim and languages available): GET form with `wp_lang` select, preserves `redirect_to` and `action`
- If `$input_id` provided: inline JS to focus that input
- Fire `login_footer` hook

### `wp_shake_js()`

Adds CSS class `shake` to the form via inline script.

### `wp_login_viewport_meta()`

Outputs `<meta name="viewport">` tag.

---

## Action: `login` (default)

**Trigger:** GET or POST to `wp-login.php` with no action, or `action=login`

**GET (display form):**
- Determine `$redirect_to` from `$_REQUEST['redirect_to']` or `admin_url()`
- Display login form with:
  - Username or email field (`name="log"`)
  - Password field (`name="pwd"`)
  - Remember Me checkbox (`name="rememberme"`)
  - Hidden: `redirect_to`, `testcookie=1`
  - If interim: hidden `interim-login=1` instead of redirect_to
  - If customize-login: hidden `customize-login=1`
  - Navigation links: Register (if enabled), Lost password
- JS: `wp_attempt_focus()` — auto-focus appropriate field

**POST (process login):**
1. Check if user has `use_ssl` option set → force SSL cookie if so
2. `wp_signon([], $secure_cookie)` — authenticate
3. Cookie check: if `LOGGED_IN_COOKIE` is absent after signin, detect if cookies are blocked
4. Apply `login_redirect` filter to redirect URL
5. On success:
   - If interim: show "logged in successfully" message and exit
   - If user has `manage_options` and `admin_email_lifespan` has expired: redirect to `confirm_admin_email` action
   - Redirect to:
     - `user_admin_url()` if multisite and user has no active blog
     - `get_dashboard_url()` if multisite and user can't `read`
     - `profile.php` if user can't `edit_posts` but can `read`
     - `home_url()` if user can't `read`
     - Otherwise: `$redirect_to`
6. On failure: re-display form with errors

**Flash messages shown on GET (via `$_GET` params):**
- `loggedout=true` → "You are now logged out."
- `registration=disabled` → "User registration is currently not allowed."
- `redirect_to` contains `about.php?updated` → "You have successfully updated WordPress!"
- `action=entered_recovery_mode` → "Recovery Mode Initialized."
- `redirect_to` contains `authorize-application.php` → app authorization message

---

## Action: `logout`

**Requires:** nonce `log-out` (via `check_admin_referer`)

**Steps:**
1. Get current user
2. `wp_logout()` — clears auth cookies and session
3. Redirect to `$_REQUEST['redirect_to']` if present, else `wp-login.php?loggedout=true&wp_lang={user_locale}`
4. Apply `logout_redirect` filter

---

## Action: `lostpassword` / `retrievepassword`

**GET:** Show form with username/email input field.
- Navigation: Log in | Register (if enabled)
- Fire `lost_password` action

**POST:**
1. `retrieve_password()` — look up user by login or email, generate and email reset link
2. On success: redirect to `$_REQUEST['redirect_to']` or `wp-login.php?checkemail=confirm`
3. On error: re-display form with errors

**Error codes displayed:**
- `invalidkey` → "password reset link appears to be invalid"
- `expiredkey` → "password reset link has expired"

---

## Action: `resetpass` / `rp`

**Key exchange via cookie:**
1. If `$_GET['key']` and `$_GET['login']` present:
   - Store `login:key` in session cookie `wp-resetpass-{COOKIEHASH}`
   - Redirect to same URL without query params
2. Read key from cookie; split into `$rp_login` and `$rp_key`
3. `check_password_reset_key($rp_key, $rp_login)` → validate key
4. If key mismatch with posted `rp_key`: invalidate
5. On invalid/expired key: clear cookie, redirect to `lostpassword` with `error=invalidkey` or `error=expiredkey`

**GET (display form):**
- New password field (`name="pass1"`, `data-pw="{generated_suggestion}"`)
- Confirm password field (`name="pass2"`)
- Weak password confirmation checkbox
- Strength indicator div
- Hidden `rp_key`
- Navigation: Log in | Register

**POST (process reset):**
1. Check `pass1` is not all spaces
2. Check `pass1 === pass2`
3. Fire `validate_password_reset` action
4. If no errors and `pass1` present: `reset_password($user, $pass1)` → clear cookie → show "Password Reset" confirmation → exit
5. On errors: re-display form

---

## Action: `register`

**Multisite:** redirect to `apply_filters('wp_signup_location', network_site_url('wp-signup.php'))` and exit.

**Single-site, registration disabled:** redirect to `wp-login.php?registration=disabled` and exit.

**GET:** Show registration form:
- Username field (`name="user_login"`)
- Email field (`name="user_email"`)
- `do_action('register_form')` — extra fields
- Navigation: Log in | Lost password

**POST:**
1. `register_new_user($user_login, $user_email)` — validate, create user (as subscriber), send registration email
2. On success: redirect to `$_REQUEST['redirect_to']` or `wp-login.php?checkemail=registered`
3. On error: re-display form with errors

---

## Action: `checkemail`

Display-only screen with a message based on `$_GET['checkemail']`:

| `checkemail` | Message |
|---|---|
| `confirm` | "Check your email for the confirmation link, then visit the login page." |
| `registered` | "Registration complete. Please check your email, then visit the login page." |

---

## Action: `postpass`

**Handles password-protected post access.**

1. Get `post_password` from `$_POST`
2. Hash it with `PasswordHash` (8 iterations, portable)
3. Set cookie `wp-postpass_{COOKIEHASH}` with hashed value (default: 10 days, filterable via `post_password_expires`)
4. Redirect to `$_POST['redirect_to']` or HTTP referer

---

## Action: `confirm_admin_email`

Shown periodically (default: every 6 months) to admins to verify the site admin email address is still correct.

**Requires:** user is logged in and has `manage_options`

**GET:**
- Show the current `admin_email` option value
- Three options:
  - "Update" → links to `options-general.php?highlight=confirm_admin_email`
  - "The email is correct" (POST)
  - "Remind me later" link (GET with nonce `remind_me_later_nonce`)
- Fire `admin_email_confirm` and `admin_email_confirm_form` actions

**"Remind me later" GET:**
1. Verify nonce
2. Set `admin_email_lifespan = time() + remind_interval` (default 3 days, filterable)
3. Redirect with `admin_email_remind_later=1` appended

**"The email is correct" POST:**
1. Verify nonce `confirm_admin_email`
2. Set `admin_email_lifespan = time() + check_interval` (default 6 months, filterable)
3. Redirect to `redirect_to`

---

## Action: `confirmaction`

**GDPR data request confirmation.**

Handles clicking the link in a data export/erasure request email.

**Inputs:** `request_id` (int), `confirm_key` (string)

**Steps:**
1. Validate both params are present
2. `wp_validate_user_request_key($request_id, $key)`
3. On error: `wp_die()`
4. On success: `do_action('user_request_action_confirmed', $request_id)` — the actual action (export or erase) is handled by hook callbacks
5. Display confirmation message from `_wp_privacy_account_request_confirmed_message()`

---

## Security

- Cookies are tested on every page load (`TEST_COOKIE`)
- Password reset key stored in a `HttpOnly`, `SameSite=Strict` cookie, not the URL, after initial redirect
- All redirects use `wp_safe_redirect()` except internal redirects within the same flow
- CSRF via `check_admin_referer()` on logout and admin email confirmation
- Password strength enforcement via client-side strength meter + "confirm weak" checkbox

---

## TypeScript Interface

```typescript
type LoginAction =
  | 'login' | 'logout' | 'register' | 'lostpassword' | 'resetpass'
  | 'postpass' | 'checkemail' | 'confirm_admin_email' | 'confirmaction';

interface LoginController {
  handleLogin(req: Request, res: Response): Promise<void>;
  handleLogout(req: Request, res: Response): Promise<void>;
  handleRegister(req: Request, res: Response): Promise<void>;
  handleLostPassword(req: Request, res: Response): Promise<void>;
  handleResetPassword(req: Request, res: Response): Promise<void>;
  handlePostPass(req: Request, res: Response): Promise<void>;
  handleConfirmAdminEmail(req: Request, res: Response): Promise<void>;
  handleConfirmAction(req: Request, res: Response): Promise<void>;
}
```

---

## Tovu Reconstruction Notes

### Why this exists

This archival note preserves the earlier `wp-login.php` decomposition. The canonical Tovu-facing treatment now lives in [auth-and-signup.md](/Users/la/Desktop/Tovu AI CMS/other-repos/wordpress_specs/wp-root/auth-and-signup.md).

### What Tovu should preserve

- The shared auth entry point and action family described in the consolidated auth/signup doc

### What Tovu can simplify

- Use the consolidated auth/signup spec rather than this per-file note as the primary reconstruction surface

### Possible Tovu seams

- `src/features/auth/web/`
- `src/features/auth/core/`

### Suggested priority

- `Reference only`; implement from the consolidated auth/signup spec
