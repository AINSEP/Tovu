# Error Protection and Recovery Mode - WordPress-to-TypeScript Rewrite Spec

**Source files analyzed:**
- `wp-includes/error-protection.php`
- `wp-includes/load.php`
- `wp-includes/class-wp-fatal-error-handler.php`
- `wp-includes/class-wp-recovery-mode.php`
- `wp-includes/class-wp-recovery-mode-cookie-service.php`
- `wp-includes/class-wp-recovery-mode-key-service.php`
- `wp-includes/class-wp-recovery-mode-link-service.php`
- `wp-includes/class-wp-recovery-mode-email-service.php`
- `wp-includes/class-wp-paused-extensions-storage.php`
- `wp-admin/includes/plugin.php`
- `wp-admin/includes/theme.php`

---

## 1. Overview

WordPress error protection is a two-part system:

1. **Fatal error handling** detects a crash at shutdown, decides whether it should be handled, and renders the correct failure template.
2. **Recovery mode** gives a trusted admin a temporary session that pauses the failing plugin or theme, allowing the site to stay usable while the root cause is investigated.

The important contract is that recovery mode is not a generic maintenance flag. It is a session-scoped state machine backed by a signed cookie, a one-time key store, and per-session paused-extension records. On protected endpoints, WordPress will suppress the offending extension instead of taking the whole site down.

---

## 2. Fatal Error Handling

### 2.1 Shutdown handler registration

`wp_register_fatal_error_handler()` installs the shutdown handler unless recovery is disabled through `WP_DISABLE_FATAL_ERROR_HANDLER` or the `wp_fatal_error_handler_enabled` filter.

If `wp-content/fatal-error-handler.php` exists and returns a valid handler object, WordPress uses that drop-in. Otherwise it instantiates `WP_Fatal_Error_Handler`.

### 2.2 Error detection and scope

`WP_Fatal_Error_Handler::handle()`:

1. Bails during sandbox scraping and maintenance mode.
2. Calls `detect_error()` and ignores requests without a fatal-class error.
3. Loads the default text domain if needed.
4. On non-multisite, forwards to `wp_recovery_mode()->handle_error( $error )` when recovery mode has already been initialized.
5. Displays the error template when running in admin or after headers have not yet been sent.

Only core fatal classes are handled by default:

- `E_ERROR`
- `E_PARSE`
- `E_USER_ERROR`
- `E_COMPILE_ERROR`
- `E_RECOVERABLE_ERROR`

`should_handle_error()` can be expanded with `wp_should_handle_php_error`, but core only adds rules, it does not remove them.

### 2.3 Protected endpoint logic

`is_protected_endpoint()` returns true for:

- `wp-login.php`
- any admin request, except admin Ajax
- protected Ajax actions from `is_protected_ajax_action()`
- anything added through the `is_protected_endpoint` filter

The protected Ajax list includes the core actions that can help recover from a failure, such as updating, activating, installing, and editing plugins/themes.

### 2.4 Error template selection

The default template varies by context:

- If Recovery Mode successfully handled the error, WordPress explains that the site is in recovery mode and points the user to Plugins and Themes.
- If the request is on a protected endpoint and recovery mode is initialized, the message is more conservative and points the user to admin email or the site administrator.
- Otherwise, WordPress shows the generic critical error message.

---

## 3. Recovery Mode State Machine

### 3.1 Core object

`wp_recovery_mode()` returns the singleton `WP_Recovery_Mode` instance.

That object owns four collaborators:

- `WP_Recovery_Mode_Cookie_Service`
- `WP_Recovery_Mode_Key_Service`
- `WP_Recovery_Mode_Link_Service`
- `WP_Recovery_Mode_Email_Service`

### 3.2 Initialization sequence

`WP_Recovery_Mode::initialize()`:

1. Marks the instance initialized.
2. Hooks `wp_logout` to exit recovery mode.
3. Hooks `login_form_exit_recovery_mode` to the exit handler.
4. Hooks `recovery_mode_clean_expired_keys` for daily cleanup.
5. Schedules the cleanup cron if it is not already scheduled.
6. If `WP_RECOVERY_MODE_SESSION_ID` is defined, marks the session active immediately.
7. If the recovery cookie exists, validates it and derives the session.
8. Otherwise, checks whether the current login request is a valid begin-link request.

The key point is that the session becomes active before normal plugin/theme loading decisions are made, so the loader can skip paused extensions early enough to avoid another crash.

### 3.3 Session identity

Recovery Mode stores a session identifier derived from the cookie key material. The session ID is not the whole cookie; it is a stable session key used to namespace paused extension storage.

`is_active()` and `get_session_id()` are read-only after initialization.

---

## 4. Recovery Lifecycle

### 4.1 Begin link flow

`WP_Recovery_Mode_Link_Service::generate_url()` creates a one-time token/key pair and returns a login URL with:

- `action=enter_recovery_mode`
- `rm_token`
- `rm_key`

`handle_begin_link()` only runs on `wp-login.php` and only when those parameters are present.

If validation succeeds:

1. the recovery cookie is set
2. the request redirects to `wp-login.php?action=entered_recovery_mode`

If validation fails, the request dies with the validation error.

### 4.2 Cookie lifecycle

`WP_Recovery_Mode_Cookie_Service`:

- creates a base64-encoded `recovery_mode|iat|rand|signature` token
- signs it with a recovery-specific HMAC
- validates the timestamp and signature before a cookie is accepted
- clears the cookie on exit

The cookie lifetime defaults to one week and is filterable through `recovery_mode_cookie_length`.

### 4.3 Error handling while active

When recovery mode is active and a new fatal error is caught:

1. the extension that caused the error is identified
2. non-plugin/theme sources are rejected
3. the error is stored in paused-extension storage
4. if headers have already been sent, the handler returns without redirecting
5. otherwise the request redirects into the protected recovery flow

This makes recovery mode sticky for the session while the problem extension remains paused.

### 4.4 Exit flow

`exit_recovery_mode()`:

- clears the email rate limit
- clears the recovery cookie
- deletes all paused plugins
- deletes all paused themes

`handle_exit_recovery_mode()` validates the nonce, falls back to a sensible referrer if none exists, and redirects back to the previous page or dashboard.

---

## 5. Paused Extension Storage

### 5.1 Storage contract

`WP_Paused_Extensions_Storage` is a session-scoped option store keyed by extension type:

- `plugin`
- `theme`

The option name is derived from the recovery session ID:

- `{$session_id}_paused_extensions`

The stored shape is:

```typescript
interface PausedExtensionsStore {
  plugin?: Record<string, PhpErrorRecord>;
  theme?: Record<string, PhpErrorRecord>;
}
```

where each record is the array returned from `error_get_last()`.

### 5.2 Storage operations

The storage API supports:

- `set( extension, error )`
- `get( extension )`
- `get_all()`
- `delete( extension )`
- `delete_all()`

It is intentionally conservative:

- it no-ops if the options API is unavailable
- it refuses to persist anything unless recovery mode is active
- it updates only when the error changes

### 5.3 Loader integration

`wp_get_active_and_valid_plugins()` and `wp_get_active_and_valid_themes()` call the skip helpers when recovery mode is active.

`wp_skip_paused_plugins()` and `wp_skip_paused_themes()`:

- remove paused extensions from the load list
- stash the paused entries in `$GLOBALS['_paused_plugins']` and `$GLOBALS['_paused_themes']`
- let the admin notice layer report what was suppressed

### 5.4 Admin notices and resume actions

The admin helpers in `wp-admin/includes/plugin.php` and `wp-admin/includes/theme.php` render notices when a paused extension exists and the user can resume it.

The resume actions are capability-gated:

- `resume_plugin()` requires `current_user_can( 'resume_plugins' )`
- `resume_theme()` requires `current_user_can( 'resume_themes' )`

The capability map grants those primitive caps from `activate_plugins` and `switch_themes` respectively.

---

## 6. Email and Key Services

### 6.1 Recovery key store

`WP_Recovery_Mode_Key_Service` keeps one stored key per recovery token in the `recovery_keys` option.

It:

- creates a random token
- creates a random key
- stores only a hashed form of the key
- consumes the key on successful validation
- removes expired keys on cron cleanup

### 6.2 Email delivery

`WP_Recovery_Mode_Email_Service` rate-limits messages with the `recovery_mode_email_last_sent` option.

If the site is outside the rate window, it sends an email to:

- `RECOVERY_MODE_EMAIL` if defined and valid
- otherwise the site `admin_email`

The email includes:

- the recovery URL
- an expiry estimate
- the likely extension cause
- optional debug details

The message content is filterable through:

- `recovery_email_support_info`
- `recovery_email_debug_info`
- `recovery_mode_email`

---

## 7. TypeScript Rewrite Notes

### 7.1 Interface sketch

```typescript
interface RecoverySession {
  active: boolean;
  sessionId: string;
  cookiePresent: boolean;
  protectedEndpoint: boolean;
}

interface PausedExtensionRecord {
  type: 'plugin' | 'theme';
  slug: string;
  error: {
    type: number;
    file: string;
    line: number;
    message: string;
  };
}
```

### 7.2 Carry-over patterns

- Keep fatal error detection in a shutdown-safe layer.
- Keep recovery session state separate from the page controller.
- Namespace paused records by recovery session, not globally.
- Preserve the one-time-key plus signed-cookie split.
- Treat resume actions as privileged admin operations, not UI affordances.

## Tovu Reconstruction Notes

### Why this exists

This subsystem exists to keep a broken site recoverable after a fatal error instead of leaving the whole application dead. The key pattern is a shutdown-safe crash handler paired with a temporary recovery session that suppresses the failing extension.

### What Tovu should preserve

- Fatal error detection that runs after the request has already failed
- Recovery state scoped to a specific session, not global maintenance mode
- Signed cookie and one-time key flows for entering and exiting recovery
- Paused-extension storage so the runtime can skip the known-bad plugin or theme

### What Tovu can simplify

- Tovu does not need WordPress's exact email, nonce, and admin UI flow if the same recovery guarantees are preserved
- The failure template can be simpler than WordPress's recovery-mode messaging
- The recovery path should focus on unblocking the site, not reproducing all historical admin screens

### Possible Tovu seams

- `src/runtime/fatal-error-handler/` for shutdown detection and error classification
- `src/runtime/recovery-session/` for cookie, key, and session state
- `src/runtime/paused-extensions/` for the storage and load-skip logic
- `src/admin/recovery/` only if a user-facing resume flow is needed

### Suggested priority

- `V1`: fatal handler, recovery session, and paused-extension suppression
- `Later`: richer admin recovery UX, email flows, and cleanup automation
