# Spec: `wp-activate.php`

**Source:** `wordpress/wp-activate.php`
**Lines:** 215
**Multisite only**
**Role:** Activate a pending multisite signup via email key

---

## Purpose

Handles the activation link sent to users/sites after submitting the multisite signup form (`wp-signup.php`). Accepts the activation key, calls `wpmu_activate_signup()`, and displays the result.

---

## Entry Conditions

- Defines `WP_INSTALLING = true` before loading
- Loads `wp-load.php` and `wp-blog-header.php`
- If not multisite: redirect to `wp_registration_url()` and exit

---

## Key Acquisition

The activation key can arrive three ways:

1. **`$_GET['key']` and `$_POST['key']` both present but different** → die with 400 "key value mismatch"
2. **`$_GET['key']` present** → sanitize and use as `$key`
3. **`$_POST['key']` present** → sanitize and use as `$key`

### Cookie relay

If a key was found in GET/POST:
- Remove `key` from the current URL
- If the cleaned URL is different from current (i.e. the key was in the query string):
  - Set cookie `wp-activate-{COOKIEHASH}` = `$key` (session cookie, `HttpOnly`, `SameSite=Strict`)
  - Redirect to URL without `key` in query string
  - This prevents the activation key appearing in browser history/server logs
- If already on the clean URL: call `wpmu_activate_signup($key)` directly

If no key in GET/POST but cookie `wp-activate-{COOKIEHASH}` is set:
- Use cookie value as `$key`
- Call `wpmu_activate_signup($key)`
- Immediately expire the cookie (set to `time() - YEAR_IN_SECONDS`)

---

## `wpmu_activate_signup($key)` — Possible Return Values

| Return | Meaning |
|---|---|
| `WP_Error` with code `invalid_key` | Key doesn't exist in signups table |
| `WP_Error` with code `already_active` | Signup already activated |
| `WP_Error` with code `blog_taken` | Blog domain/path already taken |
| `array { user_id, password, blog_id? }` | Success |

---

## HTTP Status Codes

- `invalid_key` → 404
- `null` (no key at all) → 404
- `already_active`, `blog_taken` → 200 (these are "success" states — show "already active" message)
- Other errors → 400
- Success → 200

---

## UI Screens

All screens use the theme header/footer via `get_header('wp-activate')` / `get_footer('wp-activate')`.

Additional head hook: `do_action('activate_wp_head')` inside `wp_head`.

### Screen: No key provided

Shows a manual activation form:
- Text input for activation key
- Submit button "Activate"
- POST to `network_site_url({path}/wp-activate.php)`

### Screen: `already_active` or `blog_taken` error

Shows: "Your account is now active!"

Message text:
- If it's a user-only signup (no blog domain/path): "Your account has been activated. You may now log in..."
- If it includes a blog: "Your site at {domain} is active. You may now log in..."

Both include links to log in and a note to check email for password instructions, plus a "reset your password" link.

### Screen: Other errors (`null` or non-allowlisted error code)

Shows: "An error occurred during the activation"
If a `WP_Error` was returned: shows the error message.

### Screen: Success (`array` returned)

Shows: "Your account is now active!"

Displays:
- Username
- Password (in plain text — this is the generated password from `wpmu_activate_signup`)

If `blog_id` is in the result AND the blog URL differs from network home:
- "View your site" link
- "Log in" link (via `switch_to_blog` → `wp_login_url()` → `restore_current_blog()`)

If no blog or blog is network home:
- "Log in" link
- "Go back to homepage" link

---

## Hooks

| Hook | Type | When |
|---|---|---|
| `activate_header` | action | before `get_header()` |
| `activate_wp_head` | action | inside `wp_head` |

---

## Security Notes

- `WP_INSTALLING = true` suppresses some cron and other init-time operations
- The activation key is transferred to a cookie and removed from the URL to avoid key leakage in logs and referrer headers
- Cookie is `HttpOnly` and path-scoped to the activation URL path
- Cookie is cleared immediately after use

---

## TypeScript Interface

```typescript
interface ActivationResult {
  status: 'success' | 'already_active' | 'blog_taken' | 'invalid_key' | 'error';
  userId?: number;
  blogId?: number;
  password?: string;           // shown to user on first activation
  errorMessage?: string;
  signup?: {
    userLogin: string;
    userEmail: string;
    domain: string;
    path: string;
  };
}

interface ActivationController {
  activate(key: string): Promise<ActivationResult>;
  render(result: ActivationResult | null, keyProvided: boolean): Promise<void>;
}
```

### Cookie pattern

```typescript
// On GET with key: move key to cookie and redirect
if (req.query.key) {
  const cleanUrl = removeQueryParam(req.url, 'key');
  res.cookie('wp-activate', req.query.key, { httpOnly: true, sameSite: 'strict' });
  res.redirect(cleanUrl);
  return;
}

// On clean URL: read from cookie
const key = req.cookies['wp-activate'];
if (key) {
  const result = await activate(key);
  res.clearCookie('wp-activate');
  render(result, true);
}
```

---

## Tovu Reconstruction Notes

### Why this exists

This archival note preserves the original per-file `wp-activate.php` decomposition. The canonical Tovu-facing treatment now lives in [auth-and-signup.md](/Users/la/Desktop/Tovu AI CMS/other-repos/wordpress_specs/wp-root/auth-and-signup.md).

### What Tovu should preserve

- The activation handshake and URL-key-to-cookie redirect pattern described in the consolidated auth doc

### What Tovu can simplify

- Use the consolidated auth/signup spec instead of treating this file as a separate planning surface

### Possible Tovu seams

- `src/features/auth/core/`
- `src/core/ports/SignupVerificationPort.ts`

### Suggested priority

- `Reference only`; implement from the consolidated auth/signup spec
