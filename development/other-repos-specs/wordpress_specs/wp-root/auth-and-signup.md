# Auth and Signup — Specification

**Source files analyzed:**
- `wordpress/wp-login.php` (1652 lines)
- `wordpress/wp-signup.php` (1054 lines)
- `wordpress/wp-activate.php` (215 lines)

---

## 1. Overview

Three files together form the complete WordPress authentication, registration, and multisite signup surface. They are distinct entry points, not shared controllers.

**`wp-login.php`** serves every authentication-related screen for every site on a WordPress install — single-site or multisite. It handles: logging in, logging out, single-site user registration, lost password requests, password reset, post-password unlocking, admin email confirmation, and GDPR data request confirmation. It is the only file that issues and validates authentication cookies.

**`wp-signup.php`** is a multisite-only front-end signup page. It handles new visitor user registration and new site creation. It stores pending signups in the `wp_signups` database table and sends activation emails. It does not create users or sites directly — it only enqueues them for activation. It is only reachable on the main site of a network.

**`wp-activate.php`** is a multisite-only activation handler. It accepts the activation key delivered by email, calls `wpmu_activate_signup()` to actually create the user and/or site, then displays the result. It defines `WP_INSTALLING = true` before loading WordPress to suppress certain init-time operations.

Relationship between the three files:

```
Visitor → wp-signup.php  →  wpmu_signup_user() / wpmu_signup_blog()
                          →  email with key
          wp-activate.php →  wpmu_activate_signup(key)
                          →  user + site created
          wp-login.php    →  login / logout / reset password
```

---

## 2. Routes

Complete route table. All three files are dispatched by URL path, not by a router.

### wp-login.php

The `action` parameter (`$_REQUEST['action']`) drives a `switch` statement. Two overrides apply before the switch:
- `$_GET['key']` present → forces `action = 'resetpass'`
- `$_GET['checkemail']` present → forces `action = 'checkemail'`

| Action | Method | Key Parameters | Guard |
|---|---|---|---|
| `login` (default) | GET | `redirect_to`, `reauth`, `interim-login`, `customize-login`, `loggedout`, `registration`, `wp_lang` | none |
| `login` | POST | `log`, `pwd`, `rememberme`, `redirect_to`, `testcookie`, `interim-login` | TEST_COOKIE check |
| `logout` | GET | `redirect_to` | nonce: `log-out` via `check_admin_referer` |
| `lostpassword` / `retrievepassword` | GET | `redirect_to`, `error` | none |
| `lostpassword` / `retrievepassword` | POST | `user_login`, `redirect_to` | none |
| `resetpass` / `rp` | GET | `key`, `login` (first hit) or cookie `wp-resetpass-{COOKIEHASH}` | valid reset key |
| `resetpass` / `rp` | POST | `pass1`, `pass2`, `rp_key` | valid reset key + key match |
| `register` | GET | `redirect_to` | single-site only; `users_can_register` option on |
| `register` | POST | `user_login`, `user_email`, `redirect_to` | single-site only; `users_can_register` option on |
| `checkemail` | GET | `checkemail` (`confirm` or `registered`) | none |
| `postpass` | POST | `post_password`, `redirect_to` | none |
| `confirm_admin_email` | GET | `redirect_to`, `remind_me_later` (nonce) | logged in + `manage_options` |
| `confirm_admin_email` | POST | `correct-admin-email`, `redirect_to`, `confirm_admin_email_nonce` | logged in + `manage_options` |
| `confirmaction` | GET | `request_id`, `confirm_key` | valid request key |
| `entered_recovery_mode` | GET | (recovery mode token in URL) | valid recovery link |

Any action value not in the above list and not having a registered `login_form_{action}` filter is silently mapped to `login`.

### wp-signup.php

Dispatched by the `$_POST['stage']` field. GET requests always fall through to `stage = 'default'`.

| Stage | Method | Key Parameters | Guard |
|---|---|---|---|
| `default` | GET/POST | `new` (optional blog suggestion), `user_email` | multisite; main site; registration enabled |
| `validate-user-signup` | POST | `user_name`, `user_email`, `signup_for` | `active_signup` allows user registration |
| `validate-blog-signup` | POST | `user_name`, `user_email`, `blogname`, `blog_title`, `blog_public`, `WPLANG` | `active_signup` allows site registration |
| `gimmeanotherblog` | POST | `blogname`, `blog_title`, `blog_public`, `WPLANG` | logged in; `active_signup` allows site registration |

### wp-activate.php

No action dispatch. Single behavior only.

| Method | Key Parameters | Guard |
|---|---|---|
| GET | `key` | multisite only |
| POST | `key` | multisite only |
| GET (clean URL) | cookie `wp-activate-{COOKIEHASH}` | key moved to cookie on prior request |

---

## 3. wp-login.php: Login Action

### Bootstrap sequence (all actions)

Before the action switch runs, wp-login.php performs these steps in order:

1. `require wp-load.php`
2. If `force_ssl_admin()` and not HTTPS: `wp_safe_redirect` to HTTPS equivalent and exit
3. Determine `$action` from `$_REQUEST['action']` (default: `'login'`)
4. Override `$action = 'resetpass'` if `$_GET['key']` is set
5. Override `$action = 'checkemail'` if `$_GET['checkemail']` is set
6. Validate `$action` against whitelist; default to `'login'` if unknown and no `login_form_{action}` filter
7. `nocache_headers()`
8. `header('Content-Type: ...')`
9. If `RELOCATE` constant defined: auto-update `siteurl` option from current server path
10. Set `TEST_COOKIE` (both `COOKIEPATH` and `SITECOOKIEPATH` if different)
11. If `$_GET['wp_lang']` set: set `wp_lang` cookie
12. `do_action('login_init')`
13. `do_action("login_form_{$action}")`
14. Set `$http_post = ($_SERVER['REQUEST_METHOD'] === 'POST')`
15. Set `$interim_login = isset($_REQUEST['interim-login'])`
16. Apply `login_link_separator` filter (default `' | '`)

### GET: Display Login Form

Parameters read from `$_REQUEST`:
- `redirect_to` — destination after login; defaults to `admin_url()`
- `reauth` — if truthy, clear auth cookies and show fresh form
- `interim-login` — if present, render compact modal form (no back-link, no language switcher, all links open `_blank`)
- `customize-login` — if present, enqueue `customize-base` script

Flash messages shown on GET (added to the error object with severity `'message'`):

| Condition | Message |
|---|---|
| `$_GET['loggedout']` is set | "You are now logged out." |
| `$_GET['registration'] === 'disabled'` | "User registration is currently not allowed." (as error) |
| `$redirect_to` contains `about.php?updated` | "You have successfully updated WordPress! Please log back in..." |
| `$action === 'entered_recovery_mode'` | "Recovery Mode Initialized. Please log in to continue." |
| `$redirect_to` contains `authorize-application.php` and `app_name` param present | "Please log in to {site} to authorize {app_name} to connect to your account." |
| `$redirect_to` contains `authorize-application.php` and no `app_name` | "Please log in to {site} to proceed with authorization." |

Interim login extra behavior:
- If no errors present: add `'expired'` message: "Your session has expired. Please log in to continue where you left off."
- All links in the page have `target="_blank"` forced by inline JS

Form fields:
- `log` (username or email address)
- `pwd` (password)
- `rememberme` (checkbox, value `"forever"`)
- `redirect_to` (hidden, omitted if interim-login)
- `interim-login` (hidden `value="1"` if interim-login)
- `customize-login` (hidden `value="1"` if customize-login)
- `testcookie` (hidden `value="1"`)

Auto-focus logic via `wp_attempt_focus()`:
- If a prior username was submitted and error is `incorrect_password` or `empty_password`: focus `user_pass`, clear its value
- If error is `invalid_username`: focus `user_login`, clear its value
- Otherwise: focus `user_login`

Navigation links (not shown in interim mode):
- "Register" link (if `users_can_register` option on), via `register` filter
- "Lost your password?" link, via `lost_password_html_link` filter

### POST: Process Login

1. If `$_POST['log']` is set and `force_ssl_admin()` is false:
   - Look up user by login; if not found and contains `@`, look up by email
   - If user has `use_ssl` meta option: set `$secure_cookie = true` and `force_ssl_admin(true)`
2. Determine `$redirect_to`:
   - From `$_REQUEST['redirect_to']` if set
   - If `$secure_cookie` and redirect contains `wp-admin`: upgrade `http://` to `https://`
   - Default: `admin_url()`
3. Set `$reauth` from `$_REQUEST['reauth']`
4. Call `wp_signon([], $secure_cookie)` — returns `WP_User` on success, `WP_Error` on failure
5. Cookie check — if `LOGGED_IN_COOKIE` is absent after signon:
   - If headers already sent: set `test_cookie` error (unexpected output blocked cookies)
   - Else if `$_POST['testcookie']` was sent but `TEST_COOKIE` not received: set `test_cookie` error (browser has cookies disabled)
6. Apply `login_redirect` filter to `$redirect_to` (receives redirect URL, requested redirect URL, user)
7. On success (`!is_wp_error($user)` and `!$reauth`):
   - If interim-login: display "logged in successfully" message, fire `login_footer` action, exit
   - Check admin email confirmation: if user has `manage_options`, `admin_email_check_interval > 0`, and `time() > admin_email_lifespan`: prepend `confirm_admin_email` action to redirect chain
   - Determine final destination:
     - If multisite and user has no active blog and is not super admin: `user_admin_url()`
     - Else if multisite and user cannot `read`: `get_dashboard_url($user->ID)`
     - Else if user cannot `edit_posts` but can `read`: `admin_url('profile.php')`
     - Else if user cannot `read`: `home_url()`
     - Otherwise: `$redirect_to`
   - `wp_redirect()` (internal) or `wp_safe_redirect()` (external redirect_to) and exit
8. On failure: re-display form with errors from `$user`

### Error Codes and Shake Behavior

The following error codes trigger the CSS `shake` animation on the form:

```typescript
const shakeErrorCodes = [
  'empty_password',
  'empty_email',
  'invalid_email',
  'invalidcombo',
  'empty_username',
  'invalid_username',
  'incorrect_password',
  'retrieve_password_email_failure',
];
// Filterable via 'shake_error_codes'
```

Error severity: errors stored with severity `'message'` are rendered as informational notices; all others are rendered as error notices.

On GET with no POST data, if the only errors are `['empty_username', 'empty_password']`, the error object is replaced with an empty error (no visible error shown on fresh page load).

### Interim Login Mode

Interim login is used when WordPress needs to re-authenticate inside an iframe (e.g., the Customizer). Triggered by `interim-login=1` in the request.

Differences from normal login:
- Body class `interim-login` added
- No "back to site" link in footer
- No language switcher
- All `<a>` links get `target="_blank"` via inline JS
- On success: `$interim_login = 'success'`; body class `interim-login-success` added; shows brief success message; if `customize-login` flag present, sends `postMessage` to parent frame via `wp.customize.Messenger`; exits immediately without redirect
- `redirect_to` hidden field is omitted; `interim-login=1` hidden field is included instead

---

## 4. wp-login.php: Logout Action

**CSRF protection:** `check_admin_referer('log-out')` — verifies nonce in `$_REQUEST['_wpnonce']`. On failure, WordPress dies with an invalid nonce message.

**Steps:**

1. `check_admin_referer('log-out')` — aborts on invalid nonce
2. `$user = wp_get_current_user()` — capture user before clearing session
3. `wp_logout()` — clears all auth cookies, destroys session tokens for this session, fires `wp_logout` action
4. Determine redirect:
   - If `$_REQUEST['redirect_to']` is set: use it as `$redirect_to`; set `$requested_redirect_to` to same value
   - Otherwise: `$redirect_to = wp_login_url() + ?loggedout=true&wp_lang={user_locale}`; `$requested_redirect_to = ''`
5. Apply `logout_redirect` filter (receives: final redirect URL, requested redirect URL, WP_User object)
6. `wp_safe_redirect($redirect_to)` and exit

The `wp_logout_url()` function generates the logout URL with a `log-out` nonce embedded: `wp-login.php?action=logout&_wpnonce={nonce}`.

---

## 5. wp-login.php: Register Action

**Multisite guard:** If `is_multisite()`, redirect immediately to `apply_filters('wp_signup_location', network_site_url('wp-signup.php'))` and exit. No registration happens in wp-login.php on multisite.

**Single-site guard:** If `!get_option('users_can_register')`, redirect to `wp-login.php?registration=disabled` and exit.

### GET: Display Registration Form

Parameters:
- `redirect_to` (optional, stored in hidden field)

Form fields:
- `user_login` (username, text)
- `user_email` (email)
- Hidden `redirect_to`
- `do_action('register_form')` fires inside the form for plugin extra fields

Navigation links:
- "Log in" — `wp_login_url()`
- "Lost your password?" — `wp_lostpassword_url()`, via `lost_password_html_link` filter

### POST: Process Registration

1. Read `user_login` and `user_email` from `$_POST`
2. `register_new_user($user_login, $user_email)` — validates username and email, creates user as Subscriber role, sends registration email with login credentials
3. On success (returns user ID, not WP_Error):
   - Redirect to `$_POST['redirect_to']` if set, else `wp-login.php?checkemail=registered`
   - `wp_safe_redirect()` and exit
4. On failure: re-display form with errors in `$errors`

The `registration_redirect` filter is applied to the redirect URL (receives: redirect URL, WP_Error or user ID).

---

## 6. wp-login.php: Lost Password Action

**Aliases:** `lostpassword` and `retrievepassword` are identical — the switch has both labels for the same case block.

### GET: Display Lost Password Form

Pre-display error injection from `$_GET['error']`:
- `invalidkey` → adds error: "Your password reset link appears to be invalid. Please request a new link below."
- `expiredkey` → adds error: "Your password reset link has expired. Please request a new link below."

`do_action('lost_password', $errors)` fires before rendering.

The `lostpassword_redirect` filter is applied to the redirect URL (from `$_REQUEST['redirect_to']`).

Form fields:
- `user_login` (username or email address, required)
- Hidden `redirect_to`

Navigation links:
- "Log in" — `wp_login_url()`
- "Register" (if `users_can_register`), via `register` filter

`do_action('lostpassword_form')` fires inside the form for plugin extra fields.

### POST: Process Lost Password

1. `retrieve_password()` — performs:
   - Look up user by `$_POST['user_login']` as username; if not found, try as email address
   - If not found: return `WP_Error('invalid_email', ...)`
   - Generate reset key: `get_password_reset_key($user)` — stores hashed key in `user_meta` key `_user_pass` with expiry, returns raw key
   - Construct reset link: `wp-login.php?action=rp&key={key}&login={urlencode(login)}&wp_lang={locale}`
   - Send email with reset link via `wp_mail()`
2. On success (returns `true`):
   - Redirect to `$_REQUEST['redirect_to']` or `wp-login.php?checkemail=confirm`
   - `wp_safe_redirect()` and exit
3. On error (returns `WP_Error`): re-display form with errors

---

## 7. wp-login.php: Reset Password Action

**Aliases:** `resetpass` and `rp` are identical — both labels handled in the same case block.

### Key Transport via Cookie

The reset key arrives in the URL (`?key=...&login=...`) but is immediately moved to a session cookie to prevent the key from appearing in server logs, browser history, and referrer headers.

**Step 1 — Move key to cookie (first GET with key in URL):**

1. If `$_GET['key']` and `$_GET['login']` are both present:
   - Store `"{login}:{key}"` as a session cookie named `wp-resetpass-{COOKIEHASH}`
   - Cookie attributes: `HttpOnly = true`, scoped to the path of `REQUEST_URI` (no domain), `Secure = is_ssl()`
   - `wp_safe_redirect(remove_query_arg(['key', 'login']))` — redirect to same URL without those params
   - exit

**Step 2 — Read key from cookie (subsequent GET/POST):**

1. Read cookie `wp-resetpass-{COOKIEHASH}`
2. Split on first `:` → `[$rp_login, $rp_key]`
3. `check_password_reset_key($rp_key, $rp_login)` → returns `WP_User` on valid key, `WP_Error` on invalid/expired
4. If POST and `$_POST['rp_key'] !== $rp_key` (HMAC mismatch): set `$user = false`

**Invalid/expired key handling:**

- Clear the cookie (set `time() - YEAR_IN_SECONDS`)
- If error code is `expired_key`: `wp_redirect('wp-login.php?action=lostpassword&error=expiredkey')` and exit
- Otherwise: `wp_redirect('wp-login.php?action=lostpassword&error=invalidkey')` and exit

### GET: Display Reset Password Form

Form fields:
- `pass1` (new password, `type="password"`, `data-reveal="1"`, `data-pw="{wp_generate_password(16)}"`)
- `pass2` (confirm new password, `type="password"`)
- `pw_weak` (checkbox: "Confirm use of weak password")
- Hidden read-only `user_login` (for password manager context)
- Hidden `rp_key` (the raw key, echoed back in POST for HMAC verification)
- "Generate Password" button (JS-powered)
- Strength indicator div (populated by `user-profile` script)

Scripts enqueued: `utils`, `user-profile`

`do_action('resetpass_form', $user)` fires inside the form.

Navigation links:
- "Log in" — `wp_login_url()`
- "Register" (if `users_can_register`)

### POST: Process Password Reset

Validation sequence:

1. If `$_POST['pass1']` is set: `trim()` it; if empty after trim → error `password_reset_empty_space`
2. If `pass1` and `pass2` do not match → error `password_reset_mismatch`
3. `do_action('validate_password_reset', $errors, $user)` — plugins may add more errors
4. If no errors and `pass1` is not empty:
   - `reset_password($user, $_POST['pass1'])` — sets new password, destroys all other sessions for the user, fires `password_reset` action
   - Clear cookie `wp-resetpass-{COOKIEHASH}` (set `time() - YEAR_IN_SECONDS`)
   - Display "Password Reset" confirmation page with link to log in
   - exit
5. If errors: re-display form with errors

---

## 8. wp-login.php: Confirm Admin Email Action

This action fires periodically to remind the site administrator to verify the admin email address is still correct.

**Trigger condition:** After a successful login, if the logged-in user has `manage_options` capability and `time() > get_option('admin_email_lifespan')` and `admin_email_check_interval > 0`, the login redirect is replaced with a redirect to `wp-login.php?action=confirm_admin_email&...`.

**Guards:**
- Must be logged in (`is_user_logged_in()`); if not, redirect to `wp_login_url()`
- Must have `manage_options` capability; if not, redirect to `$redirect_to`

**`admin_email_check_interval` filter:** default `6 * MONTH_IN_SECONDS`. If filtered to `0`, the confirmation screen is disabled entirely.

**`admin_email_remind_interval` filter:** default `3 * DAY_IN_SECONDS`. If filtered to `0`, the "Remind me later" link is not shown.

### GET: Display Confirmation Screen

Fires `do_action('admin_email_confirm', $errors)` before rendering form.
Fires `do_action('admin_email_confirm_form')` inside the form for extra hidden fields.

The form displays:
- Current `admin_email` option value
- "Update" link → `admin-url/options-general.php?highlight=confirm_admin_email`
- "The email is correct" submit button (name: `correct-admin-email`)
- "Remind me later" link (GET, with nonce `remind_me_later_nonce`) — only shown if `$remind_interval > 0`

Hidden fields: `redirect_to`, nonce for `confirm_admin_email`.

### "Remind me later" GET

1. Verify nonce `remind_me_later_nonce` in `$_GET['remind_me_later']`; on failure redirect to `wp_login_url()`
2. If `$remind_interval > 0`: `update_option('admin_email_lifespan', time() + $remind_interval)`
3. Add `admin_email_remind_later=1` to redirect URL
4. `wp_safe_redirect()` and exit

### "The email is correct" POST

1. `check_admin_referer('confirm_admin_email', 'confirm_admin_email_nonce')`; on failure redirect to `wp_login_url()`
2. If `$admin_email_check_interval > 0`: `update_option('admin_email_lifespan', time() + $admin_email_check_interval)`
3. `wp_safe_redirect($redirect_to)` and exit

---

## 9. wp-login.php: Post-Password Action

Handles form submission from a password-protected post's password prompt.

**Method:** POST only (no GET handler — invalid GETs receive no special handling, the cookie is simply not set)

**Steps:**

1. Read `$_POST['redirect_to']`; fallback to `wp_get_referer()`
2. If `$_POST['post_password']` is not set or not a string: `wp_safe_redirect($redirect_to)` and exit (no-op)
3. Instantiate `PasswordHash(8, true)` (8 iterations, portable/MD5-based mode)
4. Apply `post_password_expires` filter to compute cookie expiry (default: `time() + 10 * DAY_IN_SECONDS`; returning `0` makes it a session cookie)
5. Determine `$secure`: `true` if redirect URL scheme is `https`
6. Set cookie `wp-postpass_{COOKIEHASH}` = `$hasher->HashPassword($post_password)`, with computed expiry, `COOKIEPATH`, `COOKIE_DOMAIN`, `$secure` (no `HttpOnly` flag — WordPress does not set it here)
7. `wp_safe_redirect($redirect_to)` and exit

The `wp-postpass_` cookie is checked by `post_password_required()` when rendering password-protected posts.

---

## 10. wp-login.php: Privacy Policy Confirmaction

This action processes the confirmation link sent to users for GDPR personal data export and erasure requests.

**Method:** GET only

**Required parameters:** `request_id` (integer), `confirm_key` (string)

**Steps:**

1. If `request_id` not in `$_GET`: `wp_die('Missing request ID.')`
2. If `confirm_key` not in `$_GET`: `wp_die('Missing confirm key.')`
3. Cast `request_id` to `int`; sanitize `confirm_key` via `sanitize_text_field(wp_unslash(...))`
4. `wp_validate_user_request_key($request_id, $key)` — verifies the key against the stored post meta and checks expiry
5. On error (`WP_Error`): `wp_die($result)` — renders WordPress error page
6. On success: `do_action('user_request_action_confirmed', $request_id)` — action handlers (registered by WordPress core) perform the actual data export or erasure based on the request type
7. `$message = _wp_privacy_account_request_confirmed_message($request_id)` — generates a human-readable confirmation message
8. `login_header('User action confirmed.', $message)` + `login_footer()` — renders the confirmation screen
9. exit

The request type (`export_personal_data` or `remove_personal_data`) determines which hook handlers respond to `user_request_action_confirmed`. The action itself is recorded as confirmed in the `wp_privacy_requests` post.

---

## 11. wp-login.php: Security and Shared Behaviors

### CSRF Protection Per Action

| Action | Protection Mechanism |
|---|---|
| `logout` | `check_admin_referer('log-out')` — nonce in `$_REQUEST['_wpnonce']` |
| `confirm_admin_email` — "correct" POST | `check_admin_referer('confirm_admin_email', 'confirm_admin_email_nonce')` |
| `confirm_admin_email` — "remind me" GET | `wp_verify_nonce($_GET['remind_me_later'], 'remind_me_later_nonce')` |
| `login` POST | TEST_COOKIE check (detects cookie support); no CSRF nonce |
| `lostpassword` POST | no nonce (user identification is the guard) |
| `resetpass` POST | HMAC comparison: `hash_equals($rp_key, $_POST['rp_key'])`; key in `HttpOnly` cookie |
| `register` POST | no nonce |
| `confirmaction` GET | `wp_validate_user_request_key()` — key from email link |
| `postpass` POST | no nonce (redirect URL is validated by `wp_safe_redirect`) |

### Redirect Safety

All final redirects in wp-login.php use `wp_safe_redirect()` which validates the destination against an allowlist of trusted hosts. The allowlist includes:

- The current site's host
- Hosts added via the `allowed_redirect_hosts` filter

Internal redirects within the same flow (e.g., from `resetpass` GET with key to clean URL) use `wp_safe_redirect()`. Redirects to known-good internal URLs (e.g., `admin_url()`, `user_admin_url()`) use `wp_redirect()` directly.

### Cookie Names and Formats

| Cookie | Name Pattern | Value | Purpose |
|---|---|---|---|
| Auth cookie | `wordpress_{md5(siteurl)}` | WP authentication token | Sent on authenticated requests to `/wp-admin/` |
| Logged-in cookie | `wordpress_logged_in_{md5(siteurl)}` | WP authentication token | Sent on all pages; used to determine if user is logged in |
| Test cookie | `wordpress_test_cookie` | `"WP Cookie check"` | Presence checked to verify browser accepts cookies |
| Reset password | `wp-resetpass-{COOKIEHASH}` | `"{login}:{key}"` | Carries password reset key from URL to form submission |
| Post password | `wp-postpass_{COOKIEHASH}` | phpass hash of entered password | Grants access to password-protected post |
| Activate (multisite) | `wp-activate-{COOKIEHASH}` | activation key | Carries activation key from email URL to clean URL |
| Language | `wp_lang` | locale code | Stores UI language preference |
| User settings | `wp-settings-{user_id}` | URL-encoded key=value pairs | Stores admin UI preferences |
| User settings time | `wp-settings-time-{user_id}` | Unix timestamp | Tracks last settings update |

`COOKIEHASH` = `md5(siteurl option value)`

Auth cookies use `HttpOnly = true`. The `Secure` flag is set when `force_ssl_admin()` returns true or when the login URL scheme is HTTPS.

### SSL Forced Login

`FORCE_SSL_ADMIN` constant (or the `force_ssl_admin()` function which checks both the constant and a global flag): if true and request is not HTTPS, wp-login.php immediately redirects to the HTTPS equivalent of the current URL before any other processing.

The per-user `use_ssl` option (set via `update_user_option($id, 'use_ssl', 1)`) forces SSL cookie setting for that specific user even if FORCE_SSL_ADMIN is not globally set.

### Login Page Filters

| Filter | Default | Purpose |
|---|---|---|
| `login_headerurl` | `https://wordpress.org/` | URL of the logo link above the form |
| `login_headertext` | `"Powered by WordPress"` | Text of the logo link above the form |
| `login_headertitle` | `''` | Deprecated since 5.2.0; use `login_headertext` |
| `login_title` | `"{screen} ‹ {site} — WordPress"` | `<title>` element content |
| `login_body_class` | `['login-action-{action}', 'wp-core-ui', ...]` | CSS classes on `<body>` |
| `login_message` | (empty) | Message rendered above the form |
| `login_errors` | (error HTML) | Rendered error block |
| `login_messages` | (message HTML) | Rendered info message block |
| `login_link_separator` | `' | '` | Separator between nav links |
| `login_site_html_link` | `'<a href="/">← Go to {site}</a>'` | Footer "back to site" link |
| `login_display_language_dropdown` | `true` | Whether to show language switcher |
| `login_language_dropdown_args` | (args array) | Arguments passed to `wp_dropdown_languages()` |
| `enable_login_autofocus` | `true` | Whether to call `wp_attempt_focus()` |
| `shake_error_codes` | (array of codes) | Which error codes trigger form shake animation |

### URL Generation Functions

| Function | Returns |
|---|---|
| `wp_login_url($redirect, $force_reauth)` | `wp-login.php` with optional `redirect_to` and `reauth` params |
| `wp_logout_url($redirect)` | `wp-login.php?action=logout&_wpnonce={nonce}` with optional `redirect_to` |
| `wp_registration_url()` | `wp-login.php?action=register` (or filtered) |
| `wp_lostpassword_url($redirect)` | `wp-login.php?action=lostpassword` with optional `redirect_to` |

All four are filterable: `login_url`, `logout_url`, `register_url`, `lostpassword_url` respectively.

### Rate Limiting

WordPress core has no built-in login rate limiting or account lockout. Failed login attempts are not counted or throttled by default. The `authenticate` filter chain (called by `wp_signon`) is the extension point for adding rate limiting in plugins.

---

## 12. wp-signup.php (Multisite Only)

### Entry Conditions and Guards

wp-signup.php loads `wp-load.php` and then `wp-blog-header.php` (which initializes the full theme/query stack). It adds a `wp_robots_no_robots` filter immediately on load, ensuring the page is never indexed.

**Hard redirects that terminate execution:**

- `get_site_option('illegal_names')` is an array and `$_GET['new']` is in that list → redirect to `network_home_url()` and `die()`
- `!is_multisite()` → redirect to `wp_registration_url()` and `die()`
- `!is_main_site()` → redirect to `network_site_url('wp-signup.php')` and `die()`

After guards: `$wp_query->is_404 = false` (prevents theme 404 template).

### Registration Mode

`$active_signup = get_site_option('registration', 'none')`, then filtered by `wpmu_active_signup`.

| Value | Effect |
|---|---|
| `'none'` | Display "Registration has been disabled." and stop |
| `'blog'` | Existing users can create new sites; anonymous visitors see "must log in first" |
| `'user'` | New user registrations only; no site creation |
| `'all'` | Both new users and new sites |

Network admins always see an informational banner showing the current mode and a link to network settings.

### Default Stage (GET / initial POST)

`do_action('preprocess_signup_form')` fires before routing.

Routing logic:

```
if active_signup === 'none'
  → display "Registration has been disabled."
else if active_signup === 'blog' && !logged_in
  → display "You must first log in..."
else if logged_in && (active_signup === 'all' || 'blog')
  → signup_another_blog($newblogname)
else if !logged_in && (active_signup === 'all' || 'user')
  → signup_user($newblogname, $user_email)
else if !logged_in && active_signup === 'blog'
  → display "Sorry, new registrations are not allowed at this time."
else (logged_in, no applicable mode)
  → display "You are logged in already. No need to register again!"
```

If `$_GET['new']` is present (sanitized: lowercase, strip non-alphanumeric except `-`):
- Passed as first argument to `signup_another_blog()` or `signup_user()` to pre-fill the blog name
- After the form, a message is shown:
  - If `active_signup` allows blogs: "The site you were looking for, {address}, does not exist, but you can create it now!"
  - Otherwise: "The site you were looking for, {address}, does not exist."

### New User Form (`signup_user()`)

`signup_user_init` filter applied to defaults `{ user_name, user_email, errors }` before rendering.

Form field `stage = 'validate-user-signup'`.

Fields:
- `user_name` (text, `maxlength="60"`, `autocapitalize="none"`, `autocorrect="off"`)
  - Description: "Must be at least 4 characters, lowercase letters and numbers only."
- `user_email` (email, `maxlength="200"`)

Signup choice field (based on `active_signup`):
- `active_signup === 'blog'`: hidden `signup_for = 'blog'`
- `active_signup === 'user'`: hidden `signup_for = 'user'`
- `active_signup === 'all'`: radio buttons — "Gimme a site!" (`value="blog"`) vs "Just a username, please." (`value="user"`), defaulting to `'blog'`

`do_action('signup_hidden_fields', 'validate-user')` fires inside form.
`do_action('signup_extra_fields', $errors)` fires after email field for plugin extras.

### New Site Form (`signup_blog()`)

`signup_blog_init` filter applied to defaults `{ user_name, user_email, blogname, blog_title, errors }`.

Form field `stage = 'validate-blog-signup'`. Hidden fields carry `user_name` and `user_email` from the user step.

Fields:
- `blogname` (text, `maxlength="60"`)
  - Subdirectory install: text field preceded by `{network_domain}{network_path}` prefix
  - Subdomain install: text field followed by `.{site_domain}` suffix
  - Address note: "Must be at least 4 characters, letters and numbers only. It cannot be changed, so choose carefully!"
- `blog_title` (text)
- `WPLANG` (dropdown, only shown if installed languages exist, defaults to network `WPLANG` option)
- `blog_public` (radio: `1` = "Yes, allow search engines" / `0` = "No")

`do_action('signup_hidden_fields', 'validate-site')` fires inside form.
`do_action('signup_blogform', $errors)` fires after privacy field.

### Another Blog Form (`signup_another_blog()`)

Only for logged-in users. `signup_another_blog_init` filter applied to defaults `{ blogname, blog_title, errors }`.

Shows existing sites list (`get_blogs_of_user($current_user->ID)`).
Form field `stage = 'gimmeanotherblog'`.
Same site fields as the new site form (blogname, blog_title, WPLANG, blog_public).
`do_action('signup_hidden_fields', 'create-another-site')` fires inside form.

### Validation: New User (`validate_user_signup()`)

Stage: `validate-user-signup`

1. `wpmu_validate_user_signup($_POST['user_name'], $_POST['user_email'])` → `{ user_name, user_email, errors }`
2. If `$errors->has_errors()`: re-display `signup_user()` form and `return false`
3. If `$_POST['signup_for'] === 'blog'`: call `signup_blog($user_name, $user_email)` and `return false` (transition to site step, no DB write yet)
4. `wpmu_signup_user($user_name, $user_email, apply_filters('add_signup_meta', []))` — writes row to `wp_signups` table with hashed activation key
5. `confirm_user_signup($user_name, $user_email)` — display confirmation screen
6. `return true`

### Validation: New Site (`validate_blog_signup()`)

Stage: `validate-blog-signup`

1. Re-validate user: `wpmu_validate_user_signup($_POST['user_name'], $_POST['user_email'])`; if errors, re-display user form and `return false`
2. `wpmu_validate_blog_signup($_POST['blogname'], $_POST['blog_title'])` → `{ domain, path, blogname, blog_title, errors }`
3. If errors: re-display `signup_blog()` form and `return false`
4. Build `$signup_meta = { lang_id: 1, public: (int)$_POST['blog_public'] }`
5. If `$_POST['WPLANG']` is set and is in the installed languages list: add `WPLANG` to meta
6. `apply_filters('add_signup_meta', $signup_meta)` — plugins add extra meta
7. `wpmu_signup_blog($domain, $path, $blog_title, $user_name, $user_email, $meta)` — writes row to `wp_signups`
8. `confirm_blog_signup($domain, $path, $blog_title, $user_name, $user_email, $meta)` — display confirmation
9. `return true`

### Validation: Another Blog (`validate_another_blog_signup()`)

Stage: `gimmeanotherblog`

1. `if (!is_user_logged_in()) die()` — hard stop
2. `validate_blog_form()` — calls `wpmu_validate_blog_signup` with current user as WP_User argument
3. Extract `domain`, `path`, `blogname`, `blog_title`, `errors` from result
4. If errors: re-display `signup_another_blog()` form and `return false`
5. Build meta with `lang_id`, `public`, optionally `WPLANG`
6. Apply deprecated `signup_create_blog_meta` filter, then `add_signup_meta` filter
7. `wpmu_create_blog($domain, $path, $blog_title, $current_user->ID, $meta, get_current_network_id())` — **creates blog immediately** (no activation email, user is already authenticated)
8. On `WP_Error` from create: `return false`
9. `confirm_another_blog_signup(...)` and `return true`

### Confirmation Screens

**`confirm_user_signup($user_name, $user_email)`:**
- "{username} is your new username"
- "Before you can start using your new username, you must activate it."
- "Check your inbox at {email} and click on the given link."
- "If you do not activate your username within two days, you will have to sign up again."
- Fires `signup_finished` action

**`confirm_blog_signup($domain, $path, $blog_title, $user_name, $user_email, $meta)`:**
- "Congratulations! Your new site, {title}, is almost ready."
- "Before you can start using your site, you must activate it."
- "Check your inbox at {email} and click on the given link."
- "If you do not activate your site within two days, you will have to sign up again."
- Section: "Still waiting for your email?" with troubleshooting tips
- Fires `signup_finished` action

**`confirm_another_blog_signup($domain, $path, $blog_title, $user_name, $user_email, $meta, $blog_id)`:**
- "The site {title} is yours."
- Uses `switch_to_blog($blog_id)` to get the correct `home_url()` and `wp_login_url()`, then `restore_current_blog()`
- "{domain/path} is your new site. Log in as '{username}' using your existing password."
- Fires `signup_finished` action

### Language Availability

`signup_get_available_languages()`:

1. `get_available_languages()` — reads installed `.mo` files
2. Apply `signup_get_available_languages` filter — plugins may alter the list
3. `array_intersect_assoc()` against a fresh `get_available_languages()` call — strips any languages added by the filter that are not actually installed on disk

Empty result: language dropdown is not shown; site uses network default language.

---

## 13. wp-activate.php (Multisite Only)

### Entry Conditions

1. `define('WP_INSTALLING', true)` — set before `wp-load.php`, suppresses cron scheduling and some init operations
2. `require wp-load.php`
3. `require wp-blog-header.php`
4. `if (!is_multisite())`: redirect to `wp_registration_url()` and `die()`

`$wp_query->is_404 = false` — prevents 404 template from being used.

### Key Acquisition

```
if $_GET['key'] and $_POST['key'] both set and differ
  → wp_die('key value mismatch', 400)
else if $_GET['key'] is set
  → $key = sanitize_text_field($_GET['key'])
else if $_POST['key'] is set
  → $key = sanitize_text_field($_POST['key'])
else
  → $key = '' (no key provided)
```

### Cookie Relay Pattern

If a key was obtained from GET/POST:

1. `$redirect_url = remove_query_arg('key')` — URL with `key` param stripped
2. `if remove_query_arg(false) !== $redirect_url` — the current URL had a `key` param:
   - Set session cookie `wp-activate-{COOKIEHASH}` = `$key`
   - Cookie: `HttpOnly = true`, `SameSite = Strict`, `Secure = is_ssl()`, path = path portion of `REQUEST_URI`
   - `wp_safe_redirect($redirect_url)` and exit
3. Else (key was in POST body, URL is already clean):
   - `$result = wpmu_activate_signup($key)` — activate immediately

If no key in GET/POST but cookie `wp-activate-{COOKIEHASH}` is set:

1. `$key = $_COOKIE[$activate_cookie]`
2. `$result = wpmu_activate_signup($key)`
3. Expire the cookie: set to `time() - YEAR_IN_SECONDS`

### `wpmu_activate_signup($key)` Return Values

| Return | Meaning |
|---|---|
| `WP_Error('invalid_key')` | Key not found in `wp_signups` table |
| `WP_Error('already_active')` | Signup row has `active = 1`; includes `$signup` object in error data |
| `WP_Error('blog_taken')` | Blog domain/path already in use; includes `$signup` object in error data |
| `array { user_id, password, blog_id? }` | Success — user (and optionally blog) created |

On success, `wpmu_activate_signup` creates the user account, sets the initial password, optionally creates the blog, marks the signup row as active, and sends a welcome email.

### HTTP Status Codes

| Condition | HTTP Status |
|---|---|
| `$result === null` (no key provided at all) | 404 |
| `WP_Error('invalid_key')` | 404 |
| `WP_Error('already_active')` | 200 (treated as success state) |
| `WP_Error('blog_taken')` | 200 (treated as success state) |
| Any other `WP_Error` | 400 |
| Success array | 200 |

### UI Screens

All screens use `get_header('wp-activate')` and `get_footer('wp-activate')` — the active theme renders the page frame.

`do_action('activate_header')` fires before `get_header()`.
`do_action('activate_wp_head')` fires inside `wp_head`.
`add_filter('wp_robots', 'wp_robots_sensitive_page')` — no indexing.

**Screen: No key provided (`$key` is empty)**

Manual entry form:
- Text input `name="key"` with `autofocus`
- Submit button "Activate"
- Form POSTs to `network_site_url($blog_details->path . 'wp-activate.php')`

**Screen: `already_active` or `blog_taken` error**

`$signup = $result->get_error_data()` — the signup row object.

Heading: "Your account is now active!"

Message variants:
- If `$signup->domain . $signup->path === ''` (user-only signup, no blog):
  "Your account has been activated. You may now log in to the site using your chosen username of '{login}'. Please check your email inbox at {email} for your password and login instructions. ... you can reset your password."
- If signup includes a blog domain/path:
  "Your site at {domain} is active. You may now log in to your site using your chosen username of '{login}'. Please check your email inbox at {email} for your password and login instructions. ... you can reset your password."

**Screen: Other errors or null result**

Heading: "An error occurred during the activation"

If `$result` is a `WP_Error` (and not `already_active` or `blog_taken`): display error message text.

**Screen: Success (array returned)**

```
$url  = isset($result['blog_id']) ? get_home_url((int)$result['blog_id']) : ''
$user = get_userdata((int)$result['user_id'])
```

Heading: "Your account is now active!"

Displays:
- Username: `$user->user_login`
- Password: `$result['password']` (plain text — this is a generated password, shown once)

If `$url` is set and differs from `network_home_url('', 'http')`:
- `switch_to_blog($result['blog_id'])` → get `wp_login_url()` → `restore_current_blog()`
- "Your account is now activated. View your site | Log in"

Else (user-only or blog is network home):
- "Your account is now activated. Log in | go back to the homepage"

---

## 14. Key Hooks and Filters

### wp-login.php Hooks

| Hook | Type | When |
|---|---|---|
| `login_init` | action | After headers, before action dispatch |
| `login_form_{action}` | action | Just before action dispatch, for the specific action |
| `login_enqueue_scripts` | action | Inside `<head>`, for enqueuing scripts/styles |
| `login_head` | action | Inside `<head>`, after scripts |
| `login_header` | action | After `<body>` opens, before `<div id="login">` |
| `login_footer` | action | After `</div>` (login), before `</body>` |
| `login_form` | action | Inside login form, after password field |
| `lostpassword_form` | action | Inside lost password form, before submit |
| `lost_password` | action | Before rendering the lost password form |
| `validate_password_reset` | action | Before setting new password (plugins can add errors) |
| `resetpass_form` | action | Inside reset password form, after strength indicator |
| `register_form` | action | Inside registration form, after email field |
| `admin_email_confirm` | action | Before rendering admin email confirm form |
| `admin_email_confirm_form` | action | Inside admin email confirm form |
| `user_request_action_confirmed` | action | After GDPR request key validated |
| `login_redirect` | filter | Final redirect URL after successful login |
| `logout_redirect` | filter | Final redirect URL after logout |
| `lostpassword_redirect` | filter | Redirect URL after submitting lost password form |
| `registration_redirect` | filter | Redirect URL after successful registration |
| `wp_login_errors` | filter | Error/message object shown on login screen |
| `login_message` | filter | Message HTML shown above login form |
| `login_errors` | filter | Error HTML shown on login page |
| `login_messages` | filter | Info message HTML shown on login page |
| `shake_error_codes` | filter | Array of error codes that trigger form shake |
| `login_title` | filter | `<title>` element content |
| `login_body_class` | filter | Array of body CSS classes |
| `login_headerurl` | filter | Logo link URL |
| `login_headertext` | filter | Logo link text |
| `login_headertitle` | filter (deprecated 5.2) | Logo title attribute |
| `login_link_separator` | filter | Separator string between nav links |
| `login_site_html_link` | filter | "← Go to site" footer link HTML |
| `login_display_language_dropdown` | filter | Whether to show language switcher |
| `login_language_dropdown_args` | filter | Args for `wp_dropdown_languages()` |
| `enable_login_autofocus` | filter | Whether to auto-focus form field |
| `lost_password_html_link` | filter | "Lost your password?" link HTML |
| `register` | filter | Registration link HTML |
| `admin_email_check_interval` | filter | Seconds between admin email confirmations (default 6 months) |
| `admin_email_remind_interval` | filter | Seconds to defer after "remind me later" (default 3 days) |
| `post_password_expires` | filter | Expiry timestamp for `wp-postpass_` cookie |
| `wp_signup_location` | filter | URL of signup page (used in register redirect on multisite) |

### wp-signup.php Hooks

| Hook | Type | When |
|---|---|---|
| `before_signup_header` | action | Before `get_header()` |
| `signup_header` | action | Inside `wp_head` |
| `before_signup_form` | action | Before form container |
| `preprocess_signup_form` | action | On default stage before routing |
| `signup_hidden_fields` | action | Inside each `<form>` — context arg: `'validate-user'`, `'validate-site'`, `'create-another-site'` |
| `signup_extra_fields` | action | After email field in user form |
| `signup_blogform` | action | After privacy field in site form |
| `signup_finished` | action | After each confirmation screen |
| `after_signup_form` | action | After all content, before `get_footer()` |
| `wpmu_active_signup` | filter | Registration mode string |
| `signup_user_init` | filter | Default values `{ user_name, user_email, errors }` for user form |
| `signup_blog_init` | filter | Default values `{ user_name, user_email, blogname, blog_title, errors }` for site form |
| `signup_another_blog_init` | filter | Default values `{ blogname, blog_title, errors }` for another-blog form |
| `add_signup_meta` | filter | Meta array stored in `wp_signups` row |
| `signup_get_available_languages` | filter | Array of available language codes |
| `signup_create_blog_meta` | filter (deprecated 3.0) | Use `add_signup_meta` instead |

### wp-activate.php Hooks

| Hook | Type | When |
|---|---|---|
| `activate_header` | action | Before `get_header()` |
| `activate_wp_head` | action | Inside `wp_head` |

---

## 15. TypeScript Interface Sketch

```typescript
// ─── wp-login.php types ──────────────────────────────────────────────────────

type LoginAction =
  | 'login'
  | 'logout'
  | 'lostpassword'
  | 'retrievepassword'
  | 'resetpass'
  | 'rp'
  | 'register'
  | 'checkemail'
  | 'postpass'
  | 'confirm_admin_email'
  | 'confirmaction'
  | 'entered_recovery_mode';

interface LoginRequest {
  log: string;              // username or email address
  pwd: string;
  rememberme?: 'forever';
  redirect_to?: string;
  testcookie?: '1';
  'interim-login'?: '1';
  'customize-login'?: '1';
  reauth?: string;
}

interface LoginResponse {
  success: true;
  redirectTo: string;
  interimLogin: boolean;
} | {
  success: false;
  errors: AuthError[];
}

interface AuthError {
  code: string;
  message: string;
  severity: 'error' | 'message';
}

interface LogoutRequest {
  _wpnonce: string;   // nonce for 'log-out'
  redirect_to?: string;
}

interface PasswordResetRequest {
  // GET (initiate)
  user_login: string;
  redirect_to?: string;
}

interface PasswordSetRequest {
  // POST (complete reset)
  pass1: string;
  pass2: string;
  rp_key: string;   // echoed back from hidden field for HMAC check
}

interface RegistrationRequest {
  user_login: string;
  user_email: string;
  redirect_to?: string;
}

interface RegistrationResponse {
  success: true;
  redirectTo: string;
} | {
  success: false;
  errors: AuthError[];
}

interface PostPassRequest {
  post_password: string;
  redirect_to?: string;
}

interface AdminEmailConfirmRequest {
  // GET — remind
  remind_me_later?: string;   // nonce value
  redirect_to?: string;
  // POST — confirm
  'correct-admin-email'?: string;
  confirm_admin_email_nonce?: string;
}

interface ConfirmActionRequest {
  request_id: number;
  confirm_key: string;
}

interface ResetKeyCookie {
  login: string;
  key: string;
}

// ─── wp-signup.php types (multisite) ─────────────────────────────────────────

type SignupMode = 'none' | 'user' | 'blog' | 'all';

type SignupStage =
  | 'default'
  | 'validate-user-signup'
  | 'validate-blog-signup'
  | 'gimmeanotherblog';

interface UserSignupRequest {
  stage: 'validate-user-signup';
  user_name: string;
  user_email: string;
  signup_for: 'blog' | 'user';
}

interface BlogSignupRequest {
  stage: 'validate-blog-signup';
  user_name: string;
  user_email: string;
  blogname: string;
  blog_title: string;
  blog_public: '0' | '1';
  WPLANG?: string;
}

interface AnotherBlogSignupRequest {
  stage: 'gimmeanotherblog';
  blogname: string;
  blog_title: string;
  blog_public: '0' | '1';
  WPLANG?: string;
}

type SignupRequest = UserSignupRequest | BlogSignupRequest | AnotherBlogSignupRequest;

interface SignupMeta {
  lang_id: number;
  public: 0 | 1;
  WPLANG?: string;
  [key: string]: unknown;   // extensible via add_signup_meta filter
}

interface PendingSignup {
  domain: string;
  path: string;
  title: string;
  user_login: string;
  user_email: string;
  registered: Date;
  activationKey: string;
  meta: SignupMeta;
  active: false;
}

interface SignupResult {
  type: 'user_confirmed' | 'blog_confirmed' | 'blog_created';
  userName: string;
  userEmail: string;
  domain?: string;
  path?: string;
  blogTitle?: string;
  blogId?: number;
}

interface SignupValidationError {
  field: 'user_name' | 'user_email' | 'blogname' | 'blog_title' | 'generic';
  message: string;
}

// ─── wp-activate.php types (multisite) ───────────────────────────────────────

interface ActivationRequest {
  key?: string;   // from GET, POST, or cookie
}

type ActivationStatus =
  | 'success'
  | 'already_active'
  | 'blog_taken'
  | 'invalid_key'
  | 'error'
  | 'no_key';

interface ActivationResult {
  status: ActivationStatus;
  httpStatus: 200 | 400 | 404;
  // On success:
  userId?: number;
  blogId?: number;
  password?: string;       // generated password, shown to user once
  userLogin?: string;
  // On already_active / blog_taken:
  signup?: {
    userLogin: string;
    userEmail: string;
    domain: string;
    path: string;
  };
  // On error:
  errorMessage?: string;
}

// ─── Unified AuthController interface ────────────────────────────────────────

interface AuthController {
  // wp-login.php actions
  handleLogin(req: LoginRequest, context: RequestContext): Promise<LoginResponse>;
  handleLogout(nonce: string, redirectTo?: string, context: RequestContext): Promise<void>;
  handleRegister(req: RegistrationRequest, context: RequestContext): Promise<RegistrationResponse>;
  handleLostPassword(req: PasswordResetRequest, context: RequestContext): Promise<void>;
  handleResetPassword(req: PasswordSetRequest, context: RequestContext): Promise<void>;
  handlePostPass(req: PostPassRequest, context: RequestContext): Promise<void>;
  handleConfirmAdminEmail(req: AdminEmailConfirmRequest, context: RequestContext): Promise<void>;
  handleConfirmAction(req: ConfirmActionRequest, context: RequestContext): Promise<void>;

  // wp-signup.php (multisite)
  getSignupMode(): Promise<SignupMode>;
  handleUserSignup(req: UserSignupRequest, context: RequestContext): Promise<SignupResult>;
  handleBlogSignup(req: BlogSignupRequest, context: RequestContext): Promise<SignupResult>;
  handleAnotherBlogSignup(req: AnotherBlogSignupRequest, context: RequestContext): Promise<SignupResult>;

  // wp-activate.php (multisite)
  handleActivation(key: string, context: RequestContext): Promise<ActivationResult>;
}

interface RequestContext {
  cookies: Record<string, string>;
  setCookie(name: string, value: string, options: CookieOptions): void;
  clearCookie(name: string): void;
  redirect(url: string, status?: 301 | 302 | 303): never;
  isSSL: boolean;
  siteUrl: string;
  cookieHash: string;   // md5(siteUrl)
}

interface CookieOptions {
  expires?: Date | number;
  path?: string;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}
```

---

## 16. Design Patterns to Carry Over

1. **Single action-dispatch file.** wp-login.php's architecture — one file, one `switch` on `$action` — is intentional. All auth flows share pre-dispatch setup (SSL redirect, nocache headers, cookie test, action hooks). In TypeScript, this maps to a single `AuthController` class whose public methods map to action cases, all sharing a common `preDispatch()` lifecycle.

2. **Overridable action before dispatch.** `do_action("login_form_{$action}")` fires before the switch, allowing plugins to intercept or redirect any action before it runs. In TypeScript, each action method should be preceded by an `onBeforeAction(action, context)` hook invocation.

3. **Cookie-based key transport.** Both `resetpass` and `wp-activate.php` use the same pattern: receive a sensitive key in the URL, move it to an `HttpOnly` session cookie, redirect to the clean URL, then read from the cookie. The key never remains in the URL after the first redirect. This pattern must be reproduced exactly — the redirect is not optional.

4. **Two-phase multisite signup.** wp-signup.php never creates users or sites directly. It only writes to `wp_signups`. wp-activate.php reads from `wp_signups` and performs the actual creation. These two operations must remain separate, because pending signups have a 2-day TTL and the activation email is the trust handshake.

5. **Immediate blog creation for authenticated users.** `validate_another_blog_signup()` skips the activation step entirely — `wpmu_create_blog()` is called directly. Logged-in users have already proven identity. Unauthenticated signups must go through email activation. This distinction is structural, not a configuration option.

6. **Error severity determines rendering.** WordPress's `WP_Error` system attaches severity data to each error. On the login page, errors with severity `'message'` are rendered as blue info notices; all others are rendered as red error notices. The `WP_Error` data field carries this metadata. TypeScript error objects must carry a `severity: 'error' | 'message'` field.

7. **Empty error suppression on fresh GET.** On a fresh GET to the login page (no POST data), if the only errors would be `empty_username` and `empty_password`, the error object is replaced with an empty error. This prevents showing "username required" errors on a page the user just navigated to. Implement this as a post-processing step: if method is GET and errors are only field-empty errors, suppress them.

8. **Admin email confirmation intercepts the redirect chain.** After a successful login, the redirect URL is conditionally replaced with `wp-login.php?action=confirm_admin_email&redirect_to={original}`. The original destination is preserved as a nested `redirect_to` parameter. The confirmation action then redirects to it. This must be a post-authentication middleware step, not a separate route.

9. **The `active_signup` mode is the single source of truth for wp-signup.php.** Every routing decision — which forms to show, which POST stages to accept, what error messages to display — derives from `active_signup`. It is read from the database once per request and then filtered. Never read `get_site_option('registration')` multiple times per request.

10. **`WP_INSTALLING` suppresses side effects in wp-activate.php.** Defining this constant before `wp-load.php` prevents WordPress from scheduling cron jobs, running update routines, and other operations that should not happen during an activation flow. In TypeScript, this pattern maps to a request-scoped "installing mode" flag passed through the context object.

11. **Language switcher is a GET form, not a cookie.** The language switcher on the login page is a `method="get"` form that reloads the page with `?wp_lang=...`. The selected language is set as a cookie only by the server, not by the form itself. The form preserves `redirect_to` and `action` as hidden fields. This means language selection is a full page reload, not an AJAX request.

12. **`wp_safe_redirect` vs `wp_redirect` is intentional.** Internal redirects to known-good URLs (e.g., `admin_url()`, `user_admin_url()`) use `wp_redirect()`. Redirects to user-supplied `redirect_to` values use `wp_safe_redirect()` which enforces the allowed-hosts allowlist. Do not normalize these to a single redirect function.

---

## 17. Tovu Reconstruction Notes

### 17.1 Why this exists

This subsystem exists because identity entry points are more than a login form. WordPress centralizes login, logout, password reset, multisite signup, activation, and admin-email confirmation so they all share the same trust boundaries, redirect rules, and session behavior.

### 17.2 What Tovu should preserve

- One coherent auth surface that owns login, logout, reset, verification, and redirect safety
- Separation between pending signup state and final account/site activation
- The "move sensitive key from URL into short-lived cookie, then redirect" pattern for one-time secrets
- Post-auth redirect handling as a security boundary, not just UI flow

### 17.3 What Tovu can simplify

- Tovu does not need WordPress's single PHP-file action switch to preserve the behavior
- Legacy slashing conventions and HTML-form quirks should not be copied forward
- If Tovu does not need multisite signup on day one, the pending-activation flow can start narrower as long as the verification seam exists

### 17.4 Possible Tovu seams

- `src/features/auth/web/` for request entry points and redirects
- `src/features/auth/core/` for login, recovery, verification, and activation rules
- `src/core/ports/SessionPort.ts` for cookie/session lifecycle
- `src/core/ports/SignupVerificationPort.ts` for pending signup and activation handshakes
- `src/core/ports/RedirectSafetyPort.ts` for allowed-host and post-login redirect policy

### 17.5 Suggested priority

- `V1`: login/logout, password reset, session cookies, safe redirects, verified signup
- `Later`: multisite-style site activation, admin-email confirmation intercepts, legacy-form compatibility
