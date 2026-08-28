# Spec: Auth And Sessions

## Goal

Define the server-side authentication surfaces needed for browser admin flows, machine-to-machine access, preview access, and recovery links without coupling the system to one provider or one UI framework.

This spec replaces responsibilities that WordPress splits across cookies, login flows, application passwords, nonce-protected admin actions, and recovery links, while also covering the more API- and service-oriented expectations seen in Directus.

## Auth Surface Types

The server must support these auth modes:

1. browser session auth
2. service or application credentials
3. preview access tokens
4. recovery / one-time action tokens
5. webhook or protocol-surface credentials where applicable

## Browser Sessions

Browser sessions must support:

- secure session issuance on login
- rotation on login, password change, and privilege change
- logout and revocation
- httpOnly cookie storage
- secure cookie transport in non-local environments
- same-site policy chosen to protect admin mutation flows
- session metadata for audit and revocation

## Browser Mutation Protection

Browser-originated mutations must require a CSRF defense such as:

- anti-CSRF token
- same-site protected cookie strategy
- explicit origin checks

The exact transport mechanism is adapter-specific, but mutation protection is not optional.

## Service Credentials

Service or application credentials must be:

- separately issued from browser sessions
- scope-limited
- rotatable
- revocable
- auditable
- stored server-side in hashed or otherwise protected form

These credentials are the Tovu equivalent of WordPress application passwords, but must be richer in scope and auditability.

## Preview Tokens

Preview access must use short-lived, resource-scoped credentials that:

- grant access to unpublished or draft preview data
- do not create full admin sessions
- can be revoked or expire automatically

## Recovery And One-Time Tokens

Password reset, account activation, recovery mode, or similar flows must use one-time or short-lived credentials and must not rely on permanent bearer tokens in URLs.

## Rate Limiting

Auth-sensitive routes must support first-class rate limiting for:

- login attempts
- password reset requests
- service credential abuse
- preview token abuse

## Acceptance Checks

- Browser session auth and service auth are distinct and independently revocable.
- Browser mutations cannot rely on cookies alone without CSRF protection.
- Preview access can expose drafts without granting admin control.
- Recovery links are time-bounded and auditable.

## Non-goals (current)

- Selecting the final auth provider
- Defining every login and reset endpoint in detail
