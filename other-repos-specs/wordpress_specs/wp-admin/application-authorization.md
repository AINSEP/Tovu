# Application Authorization - WordPress-to-TypeScript Rewrite Spec

**Source files analyzed:**
- `wp-admin/authorize-application.php`
- `wp-admin/js/auth-app.js`
- `wp-admin/user-edit.php`
- `wp-admin/includes/user.php`
- `wp-includes/class-wp-application-passwords.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-application-passwords-controller.php`
- `wp-includes/capabilities.php`
- `wp-includes/user.php`

---

## 1. Overview

Application authorization is the browser-facing consent flow for creating an application password. It is not the password system itself. The flow bridges three things:

1. the request validation layer
2. the consent UI in `wp-admin`
3. the REST endpoint that actually creates the password

The key contract is that the user approves a specific application identity, the system validates the redirect URLs and UUID, and then WordPress creates exactly one password value that is shown once and never retrievable again.

---

## 2. Capability and Availability Gates

### 2.1 Meta-capability mapping

`map_meta_cap()` maps the application-password meta caps to `edit_user` for the target user ID:

- `create_app_password`
- `list_app_passwords`
- `read_app_password`
- `edit_app_password`
- `delete_app_passwords`
- `delete_app_password`

That means the real permission boundary is the target user edit permission, not a separate application-password role.

### 2.2 Feature availability

Application passwords are only usable when all of these are satisfied:

- the feature is supported by the site runtime
- the feature is available for the user
- the site is not protected by incompatible front-end Basic Auth
- HTTPS requirements are met unless the environment explicitly allows insecure local development

The user-edit screen and the authorization screen both check these gates and stop with a clear notice or `wp_die()` response when they fail.

### 2.3 Redirect safety

`wp_is_authorize_application_password_request_valid()` validates:

- `success_url`
- `reject_url`
- `app_id`

`wp_is_authorize_application_redirect_url_valid()` rejects:

- malformed URLs
- `javascript:` and `data:` schemes
- non-local `http` URLs

`app_id` must be a UUID.

---

## 3. Admin Entry Flow

### 3.1 Page bootstrap

`wp-admin/authorize-application.php` loads the normal admin bootstrap, then branches into a no-JS POST handler or the interactive consent screen.

The file resolves:

- `app_name`
- `app_id`
- `success_url`
- `reject_url`

and validates them against the current user before rendering anything meaningful.

### 3.2 POST handler

If the form posts `action=authorize_application_password`:

1. `check_admin_referer( 'authorize_application_password' )` validates the nonce.
2. Reject clicks redirect to the reject URL or back to `admin_url()`.
3. Approve clicks call `WP_Application_Passwords::create_new_application_password()`.
4. On success, the new password is either:
   - appended to the success redirect as query args, or
   - rendered inline in the admin notice for the no-JS flow.

The redirect uses `wp_redirect()`, not `wp_safe_redirect()`, because the target may be an arbitrary application domain.

### 3.3 Consent UI

The consent screen explains:

- which application is requesting access
- whether the current user is granting access to one site or multiple sites on multisite
- what happens if the user approves
- what happens if the user rejects

The page is localized by `auth-app.js` so the JS path and the no-JS path stay aligned.

---

## 4. JavaScript Consent Flow

### 4.1 Approval path

`wp-admin/js/auth-app.js` intercepts the approve button and sends:

- `POST /wp/v2/users/me/application-passwords?_locale=user`

The request includes:

- `name`
- optional `app_id`

On success, the script either:

- redirects to the app’s success URL with `site_url`, `user_login`, and `password`
- or replaces the form with an inline success notice if there is no redirect URL

### 4.2 Rejection path

Reject simply triggers the custom hook and then navigates to the reject URL.

### 4.3 JS hooks

The script exposes three integration hooks:

- `wp_application_passwords_approve_app_request`
- `wp_application_passwords_approve_app_request_success`
- `wp_application_passwords_approve_app_request_error`
- `wp_application_passwords_reject_app`

That means the browser flow is extensible without modifying the PHP page controller.

---

## 5. Storage and REST Backend

### 5.1 Application password storage

`WP_Application_Passwords` stores password rows in user meta under:

- `_application_passwords`

It also tracks site-wide usage in the network option:

- `using_application_passwords`

Password rows contain:

- UUID
- optional `app_id`
- name
- hashed password
- created timestamp
- last used timestamp
- last IP

The plaintext password is returned only at creation time.

### 5.2 REST controller inventory

`WP_REST_Application_Passwords_Controller` exposes:

- `GET /wp/v2/users/{user_id}/application-passwords`
- `POST /wp/v2/users/{user_id}/application-passwords`
- `DELETE /wp/v2/users/{user_id}/application-passwords`
- `GET /wp/v2/users/{user_id}/application-passwords/{uuid}`
- `PUT/PATCH /wp/v2/users/{user_id}/application-passwords/{uuid}`
- `DELETE /wp/v2/users/{user_id}/application-passwords/{uuid}`
- `GET /wp/v2/users/{user_id}/application-passwords/introspect`

### 5.3 REST permissions

The controller enforces the same capability family used by the admin page:

- `list_app_passwords`
- `read_app_password`
- `create_app_password`
- `edit_app_password`
- `delete_app_passwords`
- `delete_app_password`

The current-user introspection endpoint is restricted to the password currently used for authentication.

---

## 6. `wp-admin/user-edit.php` Integration

The user profile / edit-user screen embeds the application-password workflow directly in the user profile page.

The section only appears when:

- the feature is available for that user, or
- the feature is unsupported site-wide and the fallback explanation should be shown

When enabled, the UI provides:

- a create-new-password input
- the list table of existing passwords
- a revoke-all control
- warnings for Basic Auth incompatibility
- warnings for HTTPS-disabled sites

This is the primary admin surface for day-to-day management, while `authorize-application.php` is the consent screen for the create handshake.

---

## 7. TypeScript Rewrite Notes

### 7.1 Interface sketch

```typescript
interface ApplicationPasswordRequest {
  app_name: string;
  app_id?: string;
  success_url?: string | null;
  reject_url?: string | null;
}

interface ApplicationPasswordRecord {
  uuid: string;
  app_id: string;
  name: string;
  created: number;
  last_used: number | null;
  last_ip: string | null;
}
```

### 7.2 Carry-over patterns

- Keep consent, validation, and password creation separated.
- Never expose the raw password outside the one-time creation response.
- Treat redirect validation as a security boundary, not UI cleanup.
- Keep REST permissions aligned with the admin capability map.

---

## 8. Tovu Reconstruction Notes

### 8.1 Why this exists

This subsystem exists so users can create machine credentials without giving away their primary login password. WordPress couples a consent screen, one-time secret reveal, and revocation-capable storage into a single API credential flow.

### 8.2 What Tovu should preserve

- A dedicated personal/API credential flow separate from interactive login
- One-time secret reveal semantics with no later plaintext recovery
- Capability-aligned permission checks across both UI and API surfaces
- Redirect validation and consent confirmation as first-class security boundaries

### 8.3 What Tovu can simplify

- Tovu does not need to preserve WordPress's Basic Auth-oriented application-password shape if bearer tokens or scoped API keys are a better fit
- The consent UI can be more modern as long as the create/approve/reject/revoke lifecycle remains explicit
- REST endpoint shape can differ as long as the credential contract stays auditable and revocable

### 8.4 Possible Tovu seams

- `src/features/api-credentials/` for issuance, listing, revocation, and introspection
- `src/core/ports/CredentialIssuerPort.ts` for generating and hashing secrets
- `src/core/ports/CredentialAuditPort.ts` for last-used metadata and revoke-all behavior
- `src/core/ports/ConsentFlowPort.ts` for approval/rejection redirect handling

### 8.5 Suggested priority

- `V1`: personal/API credentials, one-time reveal, revoke/rotate, audit metadata
- `Later`: richer consent UX and compatibility affordances for older clients
