### tovu:apps/website/src/server/inbound/admin-http/dev-auth.ts
- **Over:** `registerAuthRoutes` 185 (file 494 — would pass 500 once helpers are added, so one leaf moves out)
- **Phase:** after-move (MIXED — STAY-WIRING: `requireAdminSession`/route registration stay in Tovu) · **Batch:** size-55
- **Tests:** `apps/website/src/server/inbound/admin-http/__tests__/dev-auth.unit.test.ts`, `.../__tests__/dev-auth-failures.unit.test.ts`, `.../__tests__/dev-auth-me-rejection.unit.test.ts`, `.../__tests__/owner-mfa-login.unit.test.ts`, `.../__tests__/owner-passkey-http.integration.test.ts`, `apps/website/src/server/__tests__/admin-logout-route.test.ts`, `.../admin-boot-session-route.test.ts`, `.../admin-local-boot-session-route.test.ts`, `.../admin-password-status-route.test.ts`, `apps/website/src/server/inbound/public-http/routes/__tests__/unit/h4-plugin-auth.unit.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `SESSION_COOKIE`, `readSessionToken`, `localSessionCookieName`, `setSessionCookie`, `clearSessionCookie` | admin session cookie name/read/set/clear (leaf) |
| B | `sessionTokens`, `SESSION_TTL_MS`, `API_KEY_AUTHORIZATION_PATTERN`, credential types, `identityReposFrom`, `authServiceDepsFrom`, `apiKeyServiceDepsFrom`, `revokeRequestSessions`, `readApiKeyCredential`, `currentCredential`, `currentPrincipal`, `getAuthed*`, `rejectUnlessSessionCredential`, `requireAdminSession` | credential resolution + middleware (stay) |
| C | loopback, `mintSessionForPrincipal`, `resolveBootOwner`, `sendAuthFailure`, `redeemOwnerBootSession`, `AdminSignInPort`, `isOwnerOrBuiltinAdmin`, `signalAdminSignIn`, `sessionRequestOptions`, `mfaBodyText` | sign-in support (stay) |
| D | `registerAuthRoutes` route groups | HTTP auth routes |

- **Splits:**
  1. NEW `apps/website/src/server/inbound/admin-http/dev-auth-cookies.ts` — job: the admin session cookie — its per-port name, reading it, setting and clearing it. Moves unit A with docs (`setSessionCookie`'s "REQ-06: HttpOnly, SameSite=Strict…" and `localSessionCookieName`'s "Cookies ignore ports" comments). Exports all five. Imports only what they use (express `Request`/`Response` types, `LocalOwnerSignInPolicy` type if `readSessionToken` names it). Positional signatures stay as they are (moved, not new).
  2. HELPERS in `registerAuthRoutes` (same file, directly above it, in this order). `LoginRoutesInput = { app: Express; deps: RouteDeps; loginRateLimiter: ReturnType<typeof createRateLimiter>; onAdminSignIn?: AdminSignInPort }`:
     - `registerPasswordLoginRoutes({ app, deps, loginRateLimiter, onAdminSignIn }: RegisterPasswordLoginRoutesInput): void` ← `app.post("/api/admin/v1/auth/login", …` and `app.post("/api/admin/v1/auth/mfa/login", …` (~L617-691).
     - `registerSessionHandoffRoutes({ app, deps, localOwnerSignIn, onAdminSignIn }: RegisterSessionHandoffRoutesInput): void` ← `app.post("/api/admin/v1/auth/logout", …`, the big "Exchange a single-use boot token" doc + `app.post("/api/admin/v1/auth/boot-session", …`, and the "Desktop must present its private launch capability" comment + `app.post("/api/admin/v1/auth/local-boot-session", …` (~L693-773).
     - `registerCurrentPrincipalRoutes({ app, deps, localOwnerSignIn }: RegisterCurrentPrincipalRoutesInput): void` ← `app.get("/api/admin/v1/auth/me", …`, the "Password-banner plan (2026-09-24), Slice 2" comment, `const defaultPasswordByHash`, `const usesDefaultPasswordFor`, `app.get("/api/admin/v1/auth/me/password-status", …` (~L775-853).
     - `registerAuthRoutes` keeps its signature, the REQ-14 limiter comment + `const loginRateLimiter`, the three `registerOwner*Routes` calls, then calls the three helpers in that order (Express registration order unchanged).
- **Importers to update:** none outside — moved cookie helpers were private.
- **After:** `dev-auth.ts` ~488; `registerAuthRoutes` ~22; helpers ~68 / ~52 / ~52; `dev-auth-cookies.ts` ~28.
- **Risks / notes:** `h4-plugin-auth.unit.test.ts` `mock.module('#src/server/inbound/admin-http/dev-auth', …)` spreads the real exports; only private helpers move, so the mock covers the same names. `defaultPasswordByHash` cache must stay per `registerAuthRoutes` call — it lives inside `registerCurrentPrincipalRoutes`, called once per registration, so still per call. `localOwnerSignIn` is the defaulted value (pass it, not the raw option).
