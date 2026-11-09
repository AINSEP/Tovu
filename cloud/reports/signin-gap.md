# SIGNIN-GAP — binds MCP sign-in to the starting browser

Base: Tovu `cloud/combine` f4b2d153, Jini `cloud/combine` 60807a9c. Branch: `cloud/signin-gap` (Tovu only; see "What changed").

## Verdict

**Already fully closed on this base.** Every MCP sign-in entry (site-owned, shared, card-issued, desktop) binds sign-in to the starting browser with the existing `features/api-connections/browser-binding.ts` mechanism. Nothing was open, so per the brief no code was changed and no test was written. The binding came in with Tovu commit `e327c07c` (first commit containing `EXTERNAL_MCP_BROWSER_BINDING` and the `browser_mismatch` callback reason).

## Evidence (paths relative to `apps/website/src/` unless stated)

### The one shared mechanism
- `features/api-connections/browser-binding.ts:21-23` — `EXTERNAL_MCP_BROWSER_BINDING`: a `__Secure-` callback-scoped cookie for `/api/mcp-servers/oauth/callback`, alongside the API-connection one. Same `browserBindingCookie` / `readBrowserBinding` / `clearedBrowserBindingCookie` helpers (`:41-60`). Max-Age 600 s, `HttpOnly; Secure; SameSite=Lax`, host-only. Missing, malformed or duplicate cookies give an empty proof (`:55-60`).
- `features/api-connections/browser-binding.ts:29-32` — `hostedMcpSignInLink`: the link handed out carries no provider state and no browser proof; it points at the authenticated host route below.

### Where a browser gets its binding (start)
- `server/inbound/admin-http/routes/external-mcp/oauth.ts:155-176` — `GET …/mcp-servers/:serverId/oauth/sign-in`. Requires a session credential (`:159`), mints a fresh 32-byte binding (`:163`), passes it to `beginConnect` (`:164`), sets the cookie (`:169`) and only then redirects to the provider (`:170`).
- `features/external-mcp/external-mcp-oauth.ts:775-779` — site-owned sealed state: the binding is part of the state's authenticated data (`[workspaceId, serverId, browserBinding]`), so a state minted for one browser cannot be opened with another browser's proof.
- `features/external-mcp/external-mcp-shared-oauth.ts:121-122` — shared sealed state: same, binding included in the AAD alongside site, server, credential and generation.

### Where it is checked (finish)
- `server/inbound/public-http/routes/external-mcp/oauth-callback.ts:144-149` — the single MCP callback route reads the cookie, always clears it, and refuses with `browser_mismatch` before any service call when it is missing. It is the only caller of `completeAuthorizationCallback` (grep over `apps/` and `packages/`, tests excluded), and `server/runtime/composition/modules/external-mcp.ts:73` is its only mount.
- `features/external-mcp/external-mcp-oauth.ts:1103-1113` — site-owned completion reopens the state with the callback's binding; a different binding fails as `OAUTH_INVALID_STATE` before any token exchange, so no connection is written.
- `features/external-mcp/external-mcp-shared-oauth.ts:247-257` — shared completion does the same through `stateFor`.

### Every sign-in entry
| entry | how it starts | binding |
|---|---|---|
| Settings → External MCP (site-owned) | `POST …/oauth/connect` with `delivery: 'hosted'` (`oauth.ts:139-144`) → hosted link | set at the sign-in GET |
| Shared ("save on this Mac") | same POST with `destination: 'shared'`; `shared.beginConnect` returns the hosted link (`external-mcp-shared-oauth.ts:239-240`); the GET then routes into the shared branch (`external-mcp-oauth.ts:1032`) with the binding | set at the sign-in GET, in shared AAD |
| Chat connect card | `features/agent-plugins/connect-tool.ts:169` uses `delivery: 'hosted'` and hands the card only the link's pathname (`:178`) | set at the sign-in GET |
| Assistant tool `external_mcp_*` connect | `features/external-mcp/tool-registrations.ts:725`, `delivery: 'hosted'` | set at the sign-in GET |
| Re-auth prompt | does not mint a link; points at Settings (`assistant/external-mcp-reauth-tool.ts:33-60`) | n/a |
| Desktop (Electron) | `apps/desktop/src/main/index.ts:667-681`: a hosted MCP sign-in link from a project tab opens in a sandboxed popup on the **same session** as the tab, so the GET has the admin session and the cookie lands in the same jar the callback reads | set at the sign-in GET |

Any non-hosted `beginConnect` call without a binding would seal a state the callback cannot open (the callback always supplies a non-empty binding, `oauth-callback.ts:146`), so it fails closed rather than open (`external-mcp-oauth.ts:776-778` comment).

### Refusal copy (plain words, what to do next)
- Callback, missing cookie: `server/inbound/public-http/routes/oauth/callback-page.ts:72` — "This sign-in did not return to the browser that started it, or its cookie is missing. Close this window, return to Tovu in the same browser with cookies enabled, and start connecting again."
- Sign-in link opened without a Tovu session: `oauth.ts:159` — "Open this sign-in link from your signed-in Tovu browser, then try again."

### Existing tests that pin it (read, not run here)
- `server/__tests__/admin-external-mcp-oauth-routes.test.ts:141-175` — real routes: the hosted GET sets the cookie; the callback with no cookie or a different browser's cookie is refused and makes no token request; an old unbound link is refused even with an arbitrary cookie (`:153-161`).
- `server/inbound/public-http/routes/external-mcp/__tests__/oauth-callback.test.ts:40-44` — empty, malformed and duplicate cookies refused and cleared.
- `features/external-mcp/__tests__/external-mcp-oauth.test.ts:146-161` — wrong proof rejected, right proof completes.
- `features/external-mcp/__tests__/external-mcp-shared-oauth.test.ts:162-171` — shared: other browser's binding rejected.

## What changed
Nothing in code. One commit in Tovu adds this report. No Jini change, so no Jini branch was pushed (it would point at the unchanged base).

Touched files: `cloud/reports/signin-gap.md` (Tovu) — only.

## Red / green / mutation
Not done: there was no open path to write a failing test against. Writing a test for an already-closed path and "fixing" nothing would not be red-then-green evidence.

## Commands run
`git fetch`, `git checkout -b cloud/signin-gap origin/cloud/combine` (both repos), `git log -S`, `grep`/`sed` reads. No install, build, typecheck or test run.

## Not run
- Node 24 install, `pnpm install`/`pnpm -r build` (Jini), `npm ci` (Tovu): not needed for a read-only confirmation.
- The four test files above were read, not executed on this base.
- No Electron run of the desktop popup flow.

## Findings listed, not fixed
1. **Desktop: single-window/attach mode.** The same-session popup is only wired for project-tab `<webview>` guests (`apps/desktop/src/main/index.ts:667-681`). A hosted sign-in link opened from a plain app window (`createWindow`, `:524`, used by attach mode `:1039`) goes through the app-window policy to the OS browser, which has no Tovu session, so the GET refuses with the plain message above. Safe (fails closed, explains itself), but the user cannot finish sign-in from that mode. Same for API-connection links. Worth a follow-up so that mode also opens a same-session popup.
2. **Wrong cookie vs missing cookie copy.** A missing cookie shows `browser_mismatch`; a present-but-different cookie (e.g. two sign-ins started in parallel tabs, newest wins) fails as `OAUTH_INVALID_STATE` and shows the `state_expired` copy. Both tell the user to start again, but the second does not say "same browser". Cosmetic.
3. **Device-code grant.** Device-code connections have no browser binding by design (RFC 8628: the code is entered on any device). Polling is session-gated. Out of scope for this job.
4. **Brief vs base.** `features/agent-plugins/connect-card-ui.ts:67` on this base is the access-token form docblock, not a sign-in link; the card's link comes from `connect-tool.ts:169-178` (hosted). Parallel plugin-extraction branches may move this again.

SIGNIN-GAP DONE
