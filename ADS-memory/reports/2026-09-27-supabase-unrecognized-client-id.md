# Supabase "Unrecognized client_id" — diagnosis (2026-09-27)

Read-only. No code changed.

## Root cause

Discovery and registration are **correct**. The failure comes from a **stale client id that Tovu stored and keeps reusing**. Supabase does not know `569613e0-…` (it answers 422 with or without `resource=`). `beginConnect` never re-registers a row that already has an `oauthClientId`, and nothing ever clears that id. The row is stuck on a dead client for good.

## Evidence

1. Metadata (curl, live):
   - `mcp.supabase.com/.well-known/oauth-protected-resource/mcp`: resource `https://mcp.supabase.com/mcp`, `authorization_servers: ["https://api.supabase.com"]`. The bare path and `mcp.supabase.com/.well-known/oauth-authorization-server` both return an empty body.
   - `api.supabase.com/.well-known/oauth-authorization-server`:
     - issuer `https://api.supabase.com`
     - authorize `/v1/oauth/authorize`
     - token `/v1/oauth/token`
     - registration `/platform/oauth/apps/register`
     - `token_endpoint_auth_methods_supported: [client_secret_basic, client_secret_post]` (no `none`)
   - Registration and authorization both go to the same server. There is no hardcoded fallback.
2. Throwaway DCR with Tovu's exact metadata (same redirect URI, `token_endpoint_auth_method: none`, `application_type: web`):
   - The response is 201 with `client_id` and a `client_secret` (secret redacted). It does not echo `token_endpoint_auth_method`.
   - The authorize URL built with the **fresh** id gets a 303 to `supabase.com/dashboard/authorize`, with or without `resource`.
   - The same URL with the **reported** id `569613e0-9246-4982-a964-1d75e0b4816b` gets 422 `{"message":"Unrecognized client_id"}`, with or without `resource`.
   - So `resource` (RFC 8707) is not the problem, and a freshly minted client works immediately.
3. Code:
   - `apps/website/src/assistant/external-mcp-oauth.ts:700`: `selfConfigureConnection` returns early (zero requests) when the row has endpoints, a grant and `oauthClientId`.
   - `:720-721`: a row that has a client id but needs discovery reuses the old id and does not register.
   - `:1081` (disconnect) and `:950` / `:1106` (needs_reauth) clear **tokens only**. The client id is never cleared (the only `oauthClientId: null` is the store default at `external-mcp-store.ts:1293`).
   - The authorize and token paths (`:973-1021`, `:1025+`) never check whether the vendor still knows the client.
   - Where `569613e0` came from is **unproven**. The DB read was blocked by the permission classifier, and no text file in the repo contains that id. Candidates:
     - an earlier connect whose client Supabase later dropped or revoked;
     - a test or smoke run that used a stub DCR and wrote into the live `supabase` row (see the fixture/live-DB trap memories).

   The owner or coordinator can confirm by reading `external_mcp_servers.oauth_client_id`, `updated_at` and `oauth_endpoints_json` for serverId `supabase`.

## Second bug, which will hit right after the first is fixed (confirmed live)

- Supabase issues a `client_secret` even when Tovu asks for `none`, and it does not echo the method.
- `dynamic-registration.ts` `resolveAuthMethod` (around line 140) then falls back to the requested `"none"`.
- `external-mcp-oauth.ts:731` stores `endpoints.clientAuth = "none"` and seals the secret anyway.
- `token-endpoint.ts:64-70` sends the secret only for basic or post, so the token call carries no secret.

Live probe with a bogus code:

| Method | Response |
|---|---|
| `none` | 422 `Required parameter: client_secret` |
| `client_secret_basic` | 404 `Invalid or expired OAuth authorization` (auth passed, the code was rejected) |

Fix: when the server returns a secret and does not echo a supported method, pick one from the AS's `token_endpoint_auth_methods_supported`, preferring `client_secret_basic` then `client_secret_post`. Or send `token_endpoint_auth_method` based on that list at registration time. `discovered.server.tokenEndpointAuthMethodsSupported` already exists (`discovery.ts:81`).

## Fix locations (both generic, affecting every DCR provider)

1. **Stale client recovery**:
   - In `external-mcp-oauth.ts`, a connection whose client was **self-registered** must re-register on an explicit reconnect. One way: on `disconnect` (`:1081`), also clear `oauthClientId`/`clientSecret` when the row is self-configured (no operator-typed client id, no `oauthProviderId`).
   - Also store the registered redirect URI. `:700` should re-register when `input.redirectUri` differs: the desktop port changes on restart, and Supabase pins `redirect_uris`.
   - Also offer a "reset client" path when the vendor answers `invalid_client` or "Unrecognized client_id".
   - This needs a column or flag, e.g. `oauthClientSelfRegistered`, so an operator-typed client id is never wiped.
2. **Auth method**:
   - `dynamic-registration.ts` `resolveAuthMethod` / `registerOAuthClientDynamically`: take `authMethodsSupported` and do not fall back to `"none"` when a secret came back.
   - Also `external-mcp-oauth.ts:612-631`: pass the discovered list.

**Unblocking the owner now:** clear `oauth_client_id` (and the sealed client secret) on the `supabase` row, then reconnect. With fix 2 still missing, the callback will then fail at the token step with "Required parameter: client_secret".

## Scope

- Generic. Every self-registered connection is affected: bundled `supabase`, `composio` and `higgsfield-media` (all `tovuAuthMode: "oauth"`), plus any operator-added DCR server.
- Bug 2 hits any AS that issues confidential clients to DCR and does not echo the method.

## Proposed RED tests (`apps/website/src/assistant/__tests__/external-mcp-oauth.test.ts`)

- **A (stale client):**
  - Seed a row that was self-configured (client id `stale`, endpoints stored, grant set) and mark it disconnected via `disconnect`.
  - Call `beginConnect` with a stub fetch whose registration endpoint returns `client_id: fresh`.
  - Assert that the authorize URL has `client_id=fresh` and that registration was called once. Today this fails: `stale` is reused with zero requests.
  - Variant: `beginConnect` with a different `redirectUri` than was registered should also re-register.
- **B (auth method):**
  - Stub DCR returns `{client_id, client_secret}` with no `token_endpoint_auth_method`, and AS metadata `token_endpoint_auth_methods_supported: ["client_secret_basic","client_secret_post"]`.
  - Complete the callback.
  - Assert that the token request carries `Authorization: Basic …` (or `client_secret` in the body). Today it sends neither.

## Side effect of this diagnosis

- One throwaway client `tovu-diag-throwaway` (client_id `3736c2cf-60db-431f-b36f-ce42f7a0ae14`) now exists at Supabase.
- Supabase returned no `registration_client_uri`, so it cannot be deleted through the API. It is harmless: no authorization was completed.
- Its secret was never printed, and the scratch file holding it was deleted.
