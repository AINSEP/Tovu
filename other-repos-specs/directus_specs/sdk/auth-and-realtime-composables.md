# Directus SDK Auth And Realtime Composables

**Source files analyzed:**
- `other-repos/directus/sdk/src/index.ts`
- `other-repos/directus/sdk/src/client.ts`
- `other-repos/directus/sdk/src/auth/index.ts`
- `other-repos/directus/sdk/src/auth/composable.ts`
- `other-repos/directus/sdk/src/auth/static.ts`
- `other-repos/directus/sdk/src/auth/types.ts`
- `other-repos/directus/sdk/src/auth/utils/memory-storage.ts`
- `other-repos/directus/sdk/src/rest/utils/get-auth-endpoint.ts`
- `other-repos/directus/sdk/src/realtime/index.ts`
- `other-repos/directus/sdk/src/realtime/composable.ts`
- `other-repos/directus/sdk/src/realtime/types.ts`
- `other-repos/directus/sdk/src/realtime/commands/auth.ts`
- `other-repos/directus/sdk/src/realtime/commands/pong.ts`
- `other-repos/directus/sdk/src/realtime/utils/generate-uid.ts`
- `other-repos/directus/sdk/src/realtime/utils/message-callback.ts`
- `other-repos/directus/sdk/src/realtime/utils/sleep.ts`

---

## 1. Overview

The Directus SDK keeps authentication and realtime as optional client extensions. Neither behavior exists on the base client returned by `createDirectus(url)` until the consumer adds it through `.with(...)`.

This doc covers the two composable families that add stateful session behavior:

- `authentication(...)` and `staticToken(...)`
- `realtime(...)`

The important boundary is that auth owns token acquisition and persistence, while realtime owns websocket connectivity and can optionally depend on auth when token-aware behavior is available.

---

## 2. Authentication Extension Model

`authentication(mode, config)` returns an extension that adds these methods:

- `login(...)`
- `refresh(...)`
- `logout(...)`
- `stopRefreshing()`
- `getToken()`
- `setToken(...)`

The supported auth modes are:

- `json`
- `cookie`
- `session`

Default config values are:

- `msRefreshBeforeExpires: 30000`
- `autoRefresh: true`

If the caller does not provide a storage implementation, the extension uses `memoryStorage()`.

---

## 3. Credential Storage Contract

The auth layer persists `AuthenticationData`:

- `access_token`
- `refresh_token`
- `expires`
- `expires_at`

The storage interface is intentionally simple:

- `get()`
- `set(value)`

That lets consumers swap in browser storage, server-side stores, or custom secure storage while keeping the extension logic unchanged.

The built-in `memoryStorage()` is transient and process-local. It is suitable for ephemeral SDK clients but does not survive reloads or multi-instance environments.

---

## 4. Login, Refresh, And Logout Flow

### 4.1 Login

`login(...)`:

- accepts local email/password or LDAP identifier/password payloads
- optionally adds MFA OTP
- optionally targets a named auth provider
- posts to a path resolved by `getAuthEndpoint(...)`
- writes returned credentials into storage
- schedules automatic refresh when enabled

Provider-aware login is supported only for direct credential POST flows, not browser-redirect SSO.

### 4.2 Refresh

`refresh(...)`:

- posts to `/auth/refresh`
- includes `refresh_token` only for `json` mode when available
- reuses one active refresh promise to avoid overlapping refresh storms
- resets storage before writing the new credential bundle

Refresh scheduling is bounded by `MAX_INT32` to avoid `setTimeout` overflow for very long-lived tokens.

### 4.3 Logout

`logout(...)`:

- posts to `/auth/logout`
- includes `refresh_token` only for `json` mode when available
- stops scheduled refresh work
- clears stored credentials

The extension therefore treats logout as both a server-side and local-state cleanup operation.

---

## 5. Token Access Semantics

`getToken()` is not a simple getter.

Before reading storage, it calls `refreshIfExpired()` which:

- checks the stored `expires_at`
- starts a refresh when the token is near expiry
- quietly ignores refresh failures so consumers can fail gracefully

`setToken(...)` is the manual escape hatch. It stores an access token while clearing refresh-related fields.

That makes `authentication(...)` usable both as a full session client and as a manually-managed bearer token client.

---

## 6. Static Token Variant

`staticToken(access_token)` is the minimal auth extension.

It only adds:

- `getToken()`
- `setToken(...)`

It has:

- no refresh logic
- no login/logout API calls
- no storage abstraction beyond an in-memory variable

Use it when the caller already owns token issuance and just needs the SDK to attach a stable token.

---

## 7. Realtime Extension Model

`realtime(config)` adds websocket behavior through a separate extension.

Default websocket config is:

- `authMode: 'handshake'`
- `heartbeat: true`
- `debug: false`
- `connect.timeout: 10000`
- `reconnect.delay: 1000`
- `reconnect.retries: 10`

The returned client exposes:

- `isConnected()`
- `connect()`
- `disconnect()`
- `onWebSocket(...)`
- `sendMessage(...)`
- `subscribe(...)`

This layer owns connection state, event handler registration, reconnect state, and subscription replay.

---

## 8. WebSocket URL And Auth Modes

The websocket URL is resolved in priority order:

1. explicit `config.url`
2. the main client URL if it already uses `ws:` or `wss:`
3. the main client URL rewritten to `/websocket`

Three auth modes are supported:

- `public`
- `handshake`
- `strict`

`strict` appends the access token to the websocket URL as `access_token`.

`handshake` expects an established connection and then sends an auth command over the socket.

`public` opens the socket without immediate auth and is mainly useful for public feeds or servers that do not require authenticated subscriptions.

---

## 9. Connection Lifecycle And Event Handling

The realtime extension tracks connection state as one of:

- `closed`
- `connecting`
- `open`
- `error`

During `connect()` it:

- prevents duplicate concurrent connects
- opens the websocket
- handles optional auth behavior
- installs message handling
- exposes low-level websocket events through `onWebSocket(...)`

`sendMessage(...)` can send either raw strings or JSON objects. Object messages are stringified before transmission.

`messageCallback(...)` is the low-level helper that awaits one websocket message and parses JSON when possible.

---

## 10. Reconnect, Heartbeat, And Subscriptions

The realtime layer keeps a `subscriptions` set so reconnect can replay prior subscriptions automatically.

Reconnect behavior:

- is disabled after manual disconnect
- respects configured delay and retry count
- replays saved subscriptions after the socket reconnects

Heartbeat behavior:

- watches for incoming `ping` messages
- automatically replies with `pong()`

`subscribe(...)` returns:

- an async generator of subscription events
- an `unsubscribe()` function

Subscription payload typing is query-aware and event-aware, which is why the type layer carries `SubscriptionOutput<...>` and `ApplyQueryFields<...>` generics rather than a single flat message type.

---

## 11. Auth Error Handling Over WebSockets

The realtime layer handles three notable auth error codes:

- `TOKEN_EXPIRED`
- `AUTH_TIMEOUT`
- `AUTH_FAILED`

Behavior is mode-sensitive:

- on `TOKEN_EXPIRED`, a token-aware client attempts re-authentication with the latest access token
- on `AUTH_TIMEOUT` or `AUTH_FAILED` during first-message handling in `public` mode, the client logs a likely misconfiguration warning and disables reconnect

This is an important design choice: the SDK does not silently loop forever on a bad auth mode.

---

## 12. Edge Cases And Constraints

- Refresh timers are clamped to avoid 32-bit timeout overflow.
- `getToken()` swallows refresh failures intentionally, so callers must still handle null tokens.
- Manual disconnect disables reconnect logic.
- Realtime connect rejects invalid state transitions rather than trying to self-heal every case.
- Non-JSON websocket messages are surfaced as raw message events.
- Realtime benefits from auth composables when present, but it is not hard-coupled to them at the type boundary.

---

## 13. Tovu Reconstruction Notes

### 13.1 Why this exists

These composables exist because client auth and realtime behavior are cross-cutting client capabilities, not one-off HTTP helpers. Directus keeps them as opt-in extensions so consumers can compose only the session and websocket behavior they actually need.

### 13.2 What Tovu should preserve

- Client auth/session behavior should stay composable rather than welded to one client implementation
- Realtime should be able to benefit from auth without becoming inseparable from it
- Token refresh, reconnect, and heartbeat policies need explicit lifecycle ownership

### 13.3 What Tovu can simplify

- V1 can ship simpler auth and realtime client features than Directus
- A smaller client surface is fine if composition stays possible
- Public-mode sockets or every transport mode can come later

### 13.4 Possible Tovu seams

- shared frontend client layer in `src/headless/` or a future client package
- `src/core/ports/ClientSessionPort.ts` if Tovu later formalizes client auth/session adapters
- `src/core/ports/ClientRealtimePort.ts` if multiple realtime transports emerge

### 13.5 Suggested priority

- `V1`: minimal typed client with explicit session and realtime lifecycle choices
- `Later`: broader composable client packages, richer transport modes and recovery policies
