SEC PLAN v2 COMPLETE

# P9-SEC v2: build the missing Security pieces in Jini, split owner auth onto K1, then swap Tovu

Planning only. No code, tests, builds or installs were run. v2 applies every numbered correction in `plans/P9-SEC-check.md` (Codex, NEEDS). **SEC-4 is unchanged from v1** (the check marked it READY). Each reference was read statically at these SHAs:

| ref | SHA | what was read |
|---|---|---|
| Tovu `integ/merge-13-2026-11-22` (pinned) | `0d7f78fa4` (the branch tip `f7185f153` adds only `cloud-results/` docs) | `apps/admin/src/features/security/**` (39 sources, 29 test files), `App.tsx`, `integrations/jini-admin/{modules.hooks.ts,AdminModulesProvider.tsx}`, `panels.tsx`, `panel-pages.ts`, `main.tsx`, `lib/owner-recovery-api.ts`, `features/{deployment,sites/api,observability}`, `apps/website/src/server/inbound/admin-http/{dev-auth.ts,routes/system/{site-key,credential-copy}.ts,routes/plugins/provider-settings.ts}`, `server/runtime/composition/__tests__/{create-app-route-table.pin.test.ts,fixtures/create-app-route-table.snapshot.json}` |
| Jini `integ/merge-13-2026-11-22` (pinned) | `7c4ee7881` | `packages/admin/src/security/**`, `packages/admin/src/react/kit.tsx`, `packages/admin/package.json`, `packages/core/src/contracts/server/json-route.ts`, `packages/http-kit/src/{adapter,types,request}.ts` |
| Jini `codex/ex2-rt-k1-0-jini` (in flight) | `66310ee7` | `packages/core/src/errors/route-refusal.ts` (`RouteRefusalError`, `rejectRoute`), `packages/cms/src/admin-http/limits.ts`. At this tip the returned-vs-thrown adapter parity is **not** present; it moved to BX-53/54. |
| Jini `codex/ex2-a-k2-0a-jini` (in flight, **not merged** into integ) | `44ee815e` | kit `Icon` slot (`kit.tsx:149,289`); `TabsProps`/`TabItem` (`:71-72`); no chip or multiselect slot |
| Tovu `plan/whats-left-1122` | (this branch) | `plans/P9-SEC-plan.md` (v1), `plans/P9-SEC-check.md`, `plans/P9-SEC-0-parity.md`, `plans/P9-extraction.md` §1 and Lane K, `plans/P9K-extraction.md` §2 K1 and batches, `plans/P9-steps/{SEC-adm-security-1,A-K2-security-1/2/3,A-K2-deployment-1/2,K4-seam-5}.md`, `plans/P9-data/{areas-and-steps.json,k2-kit-gaps.md}` |

Tovu files under `features/security`, `features/deployment`, `features/sites/api`, `dev-auth.ts`, `panels.tsx`, `panel-pages.ts`, `integrations/jini-admin`, `App.tsx` and `lib/` are byte-identical between v1's base `41e948ee4` and `0d7f78fa4`. The one exception is `lib/standing-draft-recovery-message.ts`, which is unrelated. v1's Tovu citations therefore still hold, except for those corrected below.

Path shorthand: **T:** = Tovu `apps/admin/src/features/security/`; **J:** = Jini `packages/admin/src/security/`; **UM:** = Jini `packages/user-management/src/`; **DA:** = Tovu `apps/website/src/server/inbound/admin-http/dev-auth.ts`.

---

## Changes from v1 (each check item → where v2 fixes it)

| check item | correction | fixed in v2 |
|---|---|---|
| 1 | Retire all four overlapping sheets. Repoint `A-K2-deployment-1/2`. Assign the Shared Keys stylesheet to SEC-12 and its Tovu side to SEC-T1. | **D1** (now four sheets plus the exact index lines); new docs step **SEC-IDX** (§2a); stylesheet in **SEC-12** (selector contract) and **SEC-T1b** (Tovu file, selectors, mount import) |
| 2 | U-AUTH on K1 `defineJsonRoute` with small per-route deps and a host-injected response policy. Refresh the RT-K1-0 dependency. Clear the route-table snapshot STOP. Keep the host JSON parser. Pin body, case, slash, HEAD/OPTIONS and `next(error)`. | **D8** (rewritten); **§3** U-AUTH: the K1 seam analysis, the gap table, `mountJsonRoute` mount, the thrown-only refusal rule, and the snapshot plan; **OD-1** and **OD-2** |
| 3 | Per-request session and limiter binding; ordered `Set-Cookie`; one limiter; password coercion; string MFA proofs; MFA challenge without a cookie; revoke before replace; sign-in callback; request-aware boot redemption; password-status fixtures and memo; owner-* registrations unchanged | **§3** `AuthRequest` context contract, behaviour pins B1–B22, and the U-AUTH-1/2/3/T1 test lists |
| 4 | Grants: session state and readiness carried separately; a `security.read`-only mutation; kit `TabBar`; host tests for the real TOTP and passkey mounts; root-key tab options handed into the tab description | **D6** (rewritten), **SEC-1** (TabBar, mutation, params handoff), **SEC-2**, **SEC-T1a** (`grantsReady` through `App.tsx:738` → `AdminModulesProvider` → scope key; owner-control mount tests) |
| 5 | SEC-3: keep exact-secret redaction (`secrets`); hooks as props; option pads and the single-send client; exports and repoints; full pins; size limits | **SEC-3** (rewritten) |
| 6 | SEC-4 unchanged. Server checks kept for every verb. SEC-6: optional `hex`, inactive race, private state, late-reply invalidation, private wrappers with no handles, real agent driver test. SEC-5 mutation that reaches the guard. SEC-7 preview-failure flow. Redaction of generate, reveal and recovery errors. | **SEC-4** (verbatim v1); server-check pins in **SEC-T1a**; **SEC-5** mutation; **SEC-6** (rewritten); **SEC-7** (preview-failure decision **DC-5**); redaction cases in SEC-5/6/7 |
| 7 | K4-seam-5.J is an explicit prerequisite; the shared contract sits at the core seam and each consumer is listed; the screen gets `executionMode`, verification and `worksFor`; exact W1–W10 envelopes and bodies; custom scope from `projectKeysAvailable`; server checks for copy and project-key use; denied grants and metadata-only projection; D5 resolved first; landed kit chip slot | **SEC-8** (prerequisite, consumers), **SEC-10/11/12** (bodies, scope, projection, denied grants), **D5** → **OD-3**, kit prerequisite **A-K2-0a.chip** (§5) |
| 8 | Filter `/mcp-servers` on `builtIn` in the HTTP adapter. Credited test for both rows. W12 order via a host option or a listed default change. Media replace, add, remove and siblings. Refresh resource, publication after Shared Keys, subscriptions and cleanup. No secrets in failures or captures. | **SEC-13** (filter, W12 `mediaOrder` option, cases), **SEC-14** (refresh), wire-capture rules in **SEC-T1c** |
| 9 | Name the non-import edits; 29 test files; site-key test paths; deletion gate; tests-first cutover; split SEC-T1; sequence SEC-4 → SEC-8; SEC-3 before U-AUTH-1; replace "start immediately" with the real prerequisites | **§4** split into **SEC-T0** (tests first), **SEC-T1a/b/c**; full 29-path test map; assertion ledger gate; **§5** order |

Also corrected (found while re-verifying):
- `modules.hooks.ts` lines: `createHostAdminScope` is `:32-43`, module and binding lists `:41-42`, `MODULE_PAGE_PATHS` `:58`, `onTabChange` `:73-76`. v1 had `:39-47`/`:59`.
- v1's U-AUTH-T1 "must stay green" list omitted `dev-auth-boot-owner.unit.test.ts` and `dev-auth-me-rejection.unit.test.ts`. §3.5 adds them.
- v1 said kit `Tabs` would carry icons. The kit's `TabItem` (`kit.tsx:71`) has no icon or handle; `TabBar` (`kit.tsx:93-94,243` on integ) does. See SEC-1.

---

## OWNER DECISIONS

- **OD-1. Route-table fixture, two handler names (U-AUTH-T1).**
  - `mountJsonRoute` registers one anonymous handler per route (`packages/http-kit/src/adapter.ts:39`).
  - The pin test records handler names (`create-app-route-table.pin.test.ts:36-39`). Today `/auth/me` and `/auth/me/password-status` record `[forwardRejection]` (snapshot lines 52-53 in `default`; 14 rows across the 7 variants). They would record `[<anonymous>]`.
  - The other five auth rows already record `[<anonymous>]` (snapshot lines 47-51) and stay byte-identical. So do the methods, paths, ordering, and the two gate rows `46 requirePublishTrustMiddleware` / `47 requireAdminSessionMiddleware` (snapshot lines 54-55).
  - **Smallest option:** approve exactly these 14 handler-name substitutions, regenerated with `UPDATE_ROUTE_TABLE_PIN=1`. The diff must contain no other change.
  - **Alternative (no fixture change):** leave `/auth/me` and `/auth/me/password-status` registered in Tovu (`DA:812-875`) and move only the five POST routes. U-AUTH-3 then shrinks to the memo and fixtures.
  - Until answered, U-AUTH-3's T half is held. U-AUTH-1/2 do not need this decision.
- **OD-2. Express error forwarding through the K1 error port (U-AUTH-2/3 T half).**
  - `boot-session`, `local-boot-session` (`DA:773,808`) and the two `asyncRoute` GETs (`DA:814,858`) hand an unexpected error to Express with `next(error)`.
  - http-kit's `onError` receives `{ res, error }` and no `next` (`packages/http-kit/src/types.ts:18`).
  - **Smallest option (no Jini change):** these four routes get a host `onError` that calls `res.req.next(error)`. Express 4 sets `req.next` when the router dispatches. This is Tovu host code only. It is pinned by tests that throw from the repository and compare status, body and headers with the base.
  - **Fallback if the pin fails:** add an optional `next?: (error: unknown) => void` field to http-kit `JsonRoutePorts.onError`'s required args. That is a field on an existing port argument, which K3 allows if the owner confirms.
  - Please confirm option 1, or choose the fallback.
- **OD-3. D5 port-surface additions (block SEC-6, SEC-8 verify, SEC-12 and SEC-14 until answered).** §1 says "no new port; if one is needed, STOP". Each item below is an optional field on an existing port or module option, not a new port token, except item (d).
  - (a) `RootKeyPort.reveal?` (SEC-6). It reverses the comment "No reveal operation" at `J:ports.ts:21`.
  - (b) Publish `verify` plus snapshot `executionMode` and `verification` (SEC-8). `verify` goes on a new adapter factory over the existing W1–W5 wire. The screen's existing `SecurityApiPort` publish `list` result also gains `executionMode` and per-row `lastVerification` fields, which is a type-hash change to an existing port.
  - (c) `SecurityApiPort.sharedKeys?` and `useProjectKey?` (SEC-12), and masked `tokenHint` display (`J:models.ts:10` says no hint).
  - (d) An optional `securityEventsToken` (SEC-14). This is a **new optional port token**, shaped like comments' events port.
  - **Smallest option for (d):** no token. The host passes `refreshSignal?: { subscribe({ onRefresh }): () => void }` as a field on `security()`'s existing optional args, the same mechanism as `rootKeyScopeNotice` (`J:react/index.ts:5`).
  - Please answer a, b, c and d separately: allow, or the stated alternative.
- **OD-4. SEC-T1 test edits beyond import lines.** §1 STOP 5 applies. Every edit is listed; no assertion changes.
  - (i) `apps/admin/src/__tests__/unit/access-tokens-chips-css.unit.test.ts:26-28` and `selection-ring-css.unit.test.ts:107`: three selector operand strings become the re-targeted `jini-*` selectors (DC-3).
  - (ii) `apps/admin/src/features/settings/__tests__/built-in-mcp.unit.test.tsx:7-8,25`: the harness swaps `useOtherCredentials` / `createFakeOtherCredentialsPort` for Jini `createHttpOtherCredentials` over a fake transport. The rows are the same `builtIn: true` / `builtIn: false` pair.
  - (iii) `apps/admin/src/__tests__/unit/admin-route-lazy-loading.unit.test.tsx:44`: one fixture row (module path, `moduleId` and `exports`).
  - (iv) `lib/__tests__/credential-input-autocomplete.unit.test.ts:171,211`: two allow-list entries removed. Their assertions are carried by SEC-3.
  - **Smallest option:** approve (i)–(iv) as listed. Otherwise those four tests stay pinned to Tovu files, and SEC-T1c cannot delete `RecoveryCodesCard.tsx` or re-target `access-tokens.css`.
- **OD-5. Deliberate behaviour changes DC-4 and DC-5** (UI only; listed below D8). Please confirm both, or say which to drop.

---

## 0. Decisions

**D1. One Security implementation; four sheets retired.**
- Jini `admin/security` (`J:security.module.ts:4`) is the only implementation.
- These sheets move Tovu files verbatim into `packages/admin/src/security/host/**` and are **retired**, superseded by SEC-1…14 and SEC-T0/T1a/b/c:
  - `SEC-adm-security-1`: 4 files, including `copy-keys-dialog.css`, `Security.hooks.ts`, `SiteKeyTab.hooks.tsx` and `hooks/security-permissions-port.hooks.ts`, which SEC-T1c deletes;
  - `A-K2-security-1`, `-2` and `-3`.
- **SEC-IDX** (§2a) applies the index edits.
- Downstream sheets that named a retired sheet are repointed to the SEC step that supplies their real import:
  - `A-K2-deployment-1` (`Depends on: A-K2-security-1`, sheet line 3) imports only the publish wire types. Repoint it to **SEC-8**, which supplies `AdminPublish*` at `@jini-ai/admin/security` and the host `securityApi.*Publish*` binding. Its two `access-tokens-dependencies.unit.test.ts:54,55` rewrites (sheet lines 68-69) are dropped, because SEC-T1c deletes that test.
  - `A-K2-deployment-2` (`Depends on: A-K2-security-1`, sheet line 3): repoint to **SEC-8**.
  - Every `SEC-adm-security-1` / `A-K2-security-*` dependency in other sheets: none exist beyond these five sheets (`rg` over `plans/P9-steps` at this branch).

**D2. Owner controls are injected.** Unchanged from v1:
- `@jini-ai/admin` has no `user-management` dependency (`packages/admin/package.json:455-475`).
- TOTP and passkeys exist in `UM:react/auth/`. The recovery card moves to UM in SEC-3.
- The host fills the `ownerControls` slot (SEC-2).

**D3. Tovu wire contracts are byte-identical, set through fields on existing adapter args.**
- SEC-4 is unchanged: root-key `path` and `importField`.
- SEC-13 adds `mediaOrder: 'in-place' | 'replaced-last'` on `createHttpOtherCredentials`' existing optional object (`J:adapters/http.ts:58`). The default `'in-place'` is Jini's current order; Tovu passes `'replaced-last'`.
- Jini's default does not change.

**D4. URL and tab bridge is host composition.** Unchanged in substance.
- `MODULE_PAGE_PATHS` is at `modules.hooks.ts:58`.
- `onTabChange` writes the URL at `:73-76`.
- `requestedTab` is read at `:79`.

**D5. Port-surface additions are held for OD-3.**
- SEC-6, SEC-12 and SEC-14 start only after OD-3 is answered for their item.
- SEC-8's `verify` sits on a new adapter factory over the existing wire. It is item (b), and SEC-8 also waits for (b).
- SEC-4, SEC-5, SEC-7, SEC-9, SEC-10, SEC-11 and SEC-13 add no port surface.

**D6. The host maps session state and grants; readiness is carried separately.**
- **Problem:** `App.tsx:685-687` leaves `effectivePermissions` `undefined` until it is known. `App.tsx:738` then passes `permissions ?? NO_PERMISSIONS` (`[]`) to `AdminModulesProvider`. The scope key is `JSON.stringify(permissions)` (`modules.hooks.ts:46`). So "unresolved" and "resolved to nothing" are indistinguishable.
- **Fix (SEC-T1a, Tovu host only):**
  - `AdminModulesProvider` gains `grantsReady: boolean`. `App.tsx:738` passes `grantsReady={permissions !== undefined}`.
  - `useAdminModules` keys on `JSON.stringify({ permissions, grantsReady })`.
  - `createHostAdminScope({ permissions }, { …, grantsReady = true })` gets the new field on its existing optional object (`:32`).
  - Authentication needs no flag: `App.tsx:700` renders `<Login/>` before the shell, so every scope is for a signed-in operator.
- **`securitySessionGrants({ permissions }, { grantsReady })`:**
  - `security.read`: always, so a signed-in operator sees Access Tokens and owner controls while grants load (today's `T:Security.tsx:140-162` shows Access Tokens unconditionally);
  - `admin.security.tokens.manage`: iff `grantsReady && hasPermission('admin.security.site-key.manage')`;
  - each write grant (`system.publish`, `source-control.credentials.write`, `custom-credentials.write`, `admin.assistant.manage`, `admin.integrations.manage`): iff `grantsReady && hasPermission(<same string>)`.
- **Result:** an unresolved or denied site-key grant hides the `root-key` tab, and `?tab=site-key` falls back to Access Tokens (`J:react/hooks/SecurityPage.hooks.ts:8-9`). This matches `T:Security.tsx:115-118,151-161`.
- **The server stays the boundary for every verb:**
  - site key: `routes/system/site-key.ts:239-258` checks a real session, workspace and `SITE_KEY_MANAGE_PERMISSION` before `:262-319`;
  - copy: `credential-copy.ts:12-33`;
  - project-key use: `provider-settings.ts:136-145`.

**D7. Product copy stays with the host.** Unchanged from v1: `git mv` `T:security-i18n.ts` to `integrations/jini-admin/security-i18n.ts`, plus the alias table.

**D8. Owner-auth routes become Users-owned K1 JSON routes.** This replaces v1's `ServerRoute` and `createNodeDispatcher` plan.
- All seven handlers answer JSON. Each becomes `defineJsonRoute<Input, Output, <Name>RouteDeps, AuthRequest>(…)` in `UM:admin-http/auth/`, with a small per-route deps type.
- Tovu mounts each one with http-kit `mountJsonRoute({ app, spec: { ...route, ports: authRoutePorts }, deps })` (`packages/http-kit/src/adapter.ts:37`), per K1 (`P9K-extraction.md` §2 K1 "T").
- The host injects the response policy through the **existing** ports:
  - `authenticate` binds a per-request `AuthRequest` (cookies, cache header, limiter, session, request facts) from `res.req`;
  - `onError` writes Tovu's flat bodies.
- The gap analysis and the two owner items are in §3.
- The `RT-K1-adm-owner-*` retarget recommendation stands as in v1, and is independent.

**Deliberate changes** (UI only, never the wire). v1's DC-1, DC-2 and DC-3 are unchanged. New:

| DC | change | Tovu today | why |
|---|---|---|---|
| DC-4 | A pending reveal is invalidated by hide, refresh, any write or dispose. A late reply is dropped. | `T:hooks/use-site-key.hooks.ts:109-125` sets `revealedHex` on any late reply | Check item 6: a late reply must not restore a hidden key |
| DC-5 | New Jini tab param `previewRequired` (default `true`, which is Jini's flow today: `startFresh` needs `state.preview`, `J:controllers/root-key.controller.ts:52`). Tovu passes `false` and keeps its own flow: after a failed preview the confirm step opens with the error, and confirm still needs the exact phrase. | `T:hooks/use-site-key-recovery.hooks.ts:136-146,155` (unchanged for Tovu users) | Check item 6. The two flows differ on purpose and the option records it |

---

## 1. Parity table (behaviour by behaviour)

`MISSING` means Jini Security lacks the behaviour today. "OK" means it matches and only needs a pinning test.

| # | Behaviour | Tovu file:line | Jini file:line or MISSING | Build |
|---|---|---|---|---|
| P1 | Panel id `access-tokens`, `?tab` allowed, nav "Secrets" under Operations, lazy target | `panels.tsx:1038-1048`, `panel-pages.ts:54` | `J:security.module.ts:4` (`/secrets`, group `system`), `J:react/index.ts:5-9` | SEC-T1 host bridge (D4) |
| P2 | Tab change replaces the URL | `T:Security.hooks.ts:4-6` | `J:react/hooks/SecurityPage.hooks.ts:13` → host `modules.hooks.ts:73-76` | SEC-T1 alias |
| P3 | Site-key tab hidden while grants are unresolved or absent; deep link falls back | `T:Security.tsx:115-118,151-161`, `T:hooks/use-security-permissions.hooks.ts:31-35` | `J:react/hooks/SecurityPage.hooks.ts:8-9`; tab permission `J:security.module.ts:4` | SEC-1 tests (`security.read`-only mutation); D6 `grantsReady` |
| P4 | Kicker, h1 and description copy | `T:Security.tsx:164-181` | `J:react/pages/SecurityPage.tsx:10` (h1 only) | SEC-1 |
| P5 | Owner TOTP enrol/remove | `T:Security.tsx:182`, `apps/admin/src/lib/owner-mfa-api.ts:12` | MISSING here; `UM:react/auth/TotpSettings.tsx:16` | SEC-2 slot; host fills |
| P6 | Owner passkeys | `T:Security.tsx:184`, `lib/owner-passkey-api.ts:9` | MISSING here; `UM:react/auth/Passkeys.tsx:33` | SEC-2 slot |
| P7 | Recovery kit: owner and availability gate, password + TOTP proof, ten codes, private output, download/dismiss clears | `T:RecoveryCodesCard.tsx:14-69`, `T:RecoveryCodesCard.hooks.ts:7-22`, `lib/owner-recovery-api.ts:8-35` | MISSING card; `UM:react/auth/OwnerRecovery.hooks.ts:91,115` | SEC-3 |
| P8 | Desktop owner reset | `T:RecoveryCodesCard.tsx:35,74-90`, `T:RecoveryCodesCard.hooks.ts:25-36` | MISSING card; `UM:react/auth/OwnerRecovery.hooks.ts:132` | SEC-3 |
| P9 | Session inventory, audit viewer, user API keys | none among the 39 (SEC-0 confirmed) | none | No step. API keys are `RT-K1-adm-api-keys-1/2` |
| P10 | Status fields `envVarName`, `reason` | `features/sites/api/sites-api.types.ts:132-146` | `J:models.ts:39-43` lacks them; `J:adapters/http.ts:88` drops them | SEC-4 |
| P11 | Root-key wire paths and bodies | `features/sites/api/sites-api.ts:59,66,76,82,85,90` | `J:adapters/http.ts:84,88-92` | SEC-4 |
| P12 | Badge label including env var name, fingerprint with title, badge tone | `T:hooks/site-key-status.rules.ts:5-13`, `T:SiteKeyTab.tsx:129-143,154-157` | `J:react/tabs/RootKeyTab.tsx:17` (raw state · fingerprint · source) | SEC-5 |
| P13 | Source notes (env / file path / invalid / none) | `T:SiteKeyTab.tsx:170-191` | MISSING | SEC-5 |
| P14 | Scope warning varies by runtime mode | `T:SiteKeyTab.tsx:112-124` | `J:react/hooks/RootKeyTab.hooks.ts:21` (one string), `J:react/index.ts:5` | SEC-5 |
| P15 | Load error and loading state | `T:SiteKeyTab.tsx:82-91`, `T:hooks/use-site-key.hooks.ts:94-101` | `J:controllers/root-key.controller.ts:21`, `J:react/tabs/RootKeyTab.tsx:6` | SEC-5 |
| P16 | Generate hidden in UI; create-only; typed refusals (locked / refused / already-exists / generic) | `T:SiteKeyTab.tsx:145-149,253-290`, `T:hooks/use-site-key.hooks.ts:71-90,127-141` | `J:controllers/root-key.controller.ts:36-41`, generic message `:28`; shown at `J:react/tabs/RootKeyTab.tsx:17` | SEC-5 |
| P17 | Reveal (active key only, human action, local state, error), hide, cleared on refresh | `T:hooks/use-site-key.hooks.ts:109-125,143-150`, `T:SiteKeyTab.tsx:197-243`; `hex` is optional and an inactive reply sets nothing (`T:hooks/use-site-key.hooks.ts:115`) | MISSING (`J:ports.ts:21`) | SEC-6 |
| P18 | Clipboard copy, "Copied!" for 1.5 s, silent failure | `T:SiteKeyTab.hooks.tsx:18-31` | MISSING | SEC-6 |
| P19 | Agent-private markers on reveal action, revealed value and pasted-key input | `T:SiteKeyTab.tsx:205,231-232`, `T:SiteKeyRecoveryCard.tsx:55` | `J:react/tabs/RootKeyTab.tsx:9` (input only) | SEC-6, SEC-7 |
| P20 | Locked = status or generate refusal | `T:hooks/use-site-key-recovery.hooks.ts:53-76` | `J:rules.ts:82` (status only) | SEC-7 |
| P21 | Unlock: trim, single send, clear input, resealed-count message, refresh | `T:hooks/use-site-key-recovery.hooks.ts:84-87,119-134` | `J:controllers/root-key.controller.ts:42` (no count) | SEC-7 |
| P22 | Start fresh: preview, exact phrase, receiver list, result, refresh | `T:hooks/use-site-key-recovery.hooks.ts:89-94,136-169`, `T:SiteKeyRecoveryCard.tsx:66-108` | `J:controllers/root-key.controller.ts:5-10,43-54`, `J:react/tabs/RootKeyTab.tsx:11-19` | SEC-7 (+DC-2) |
| P23 | Recovery card stays visible to show the result | `T:SiteKeyTab.tsx:95`, `T:SiteKeyRecoveryCard.tsx:20-21` | `J:react/tabs/RootKeyTab.tsx:6` (notice only) | SEC-7 |
| P24 | Server `detail` shown on refusal | `T:hooks/use-site-key-recovery.hooks.ts:79-82` | generic text `J:controllers/root-key.controller.ts:28` | SEC-7 |
| P25 | Publish store: snapshot `executionMode`, `credentialType`, `worksFor`, `tokenHint`, verification on save, `verify` op; Deployment consumes these | `T:api/security-api.ts:14-52`, `T:api/security-api.types.ts:20-92`; `features/deployment/hooks/publish-credentials-dependencies.hooks.ts:13-19` | `J:models.ts:11-16`, `J:adapters/http.ts:19-30` | SEC-8 |
| P26 | Source-control store CRUD + providers | `features/source-control/api/source-control-api.ts:16-44` via `T:hooks/access-tokens-dependencies.hooks.ts:23-28` | `J:adapters/http.ts:22,36` (same paths) | OK; SEC-8 pins it |
| P27 | Custom store: create `scope`/`worksFor`; update `worksFor`, `username: null`; snapshot `projectKeysAvailable` | `T:api/security-api.ts:71-115`, `T:api/security-api.types.ts:100-147` | `J:models.ts:17-26`, `J:adapters/http.ts:7` (projection drops them) | SEC-11, SEC-12 |
| P28 | Independent publish and source-control catalogs; empty-hosting hint | `T:hooks/use-access-tokens.hooks.ts:387-389`, `T:AccessTokensTab.tsx:190-205` | `J:adapters/http.ts:32-39` (one `Promise.all`) | SEC-9 |
| P29 | Saved rows whose plugin vanished | `T:access-token-providers.ts:130-170` | `J:rules.ts:28-31` (label only) | SEC-9 |
| P30 | Merged ordering (saved first, category rank, label) across all stores | `T:rules.ts:100-177`, `T:AccessTokensTab.hooks.tsx:106-197` | separate lists `J:react/tabs/AccessTokensTab.tsx:11-13` | SEC-9 |
| P31 | Search across provider and row facts; whole-sentence count copy | `T:access-token-rows.ts:166-187`, `T:other-credential-stores.ts:101-119,154`, `T:AccessTokensTab.tsx:260-288` | `J:rules.ts:33-37`, `J:react/hooks/AccessTokensTab.hooks.ts:30-35` | SEC-9 |
| P32 | Numbered legacy sentinel labels | `T:access-token-rows.ts:11-27` | `J:rules.ts:27-31` (single label) | SEC-9 |
| P33 | Not-connected provider rows; "Add another" | `T:AccessTokensTab.tsx:94-102,320-365` | `J:react/hooks/AccessTokensTab.hooks.ts:26-29` | SEC-9 |
| P34 | Vendor form: fields before/after the token, help, scope-guidance disclosure | `T:access-token-providers.ts:192-215`, `T:AccessTokensTab.tsx:486-666` | `J:react/components/CredentialEditor.tsx:7-8`, `J:react/hooks/CredentialEditor.hooks.ts:7` | SEC-10 |
| P35 | Ready-to-save; rename without token; replace | `T:access-token-forms.ts:25-129,157-170` | `J:rules.ts:48-60,75-81` | SEC-10 |
| P36 | Scoped duplicate-name message; classified submit errors | `T:access-token-forms.ts:131-155`, `T:hooks/use-access-tokens.hooks.ts:285-321`, `T:security-i18n.ts:2232` | `J:rules.ts:39-43` | SEC-10 (copy via SEC-14) |
| P37 | Default indicator shown only with a quorum; make default | `T:AccessTokensTab.tsx:456-484`, `T:hooks/use-access-tokens.hooks.ts:701-730` | `J:react/tabs/AccessTokensTab.tsx:12`, `J:controllers/access-tokens.controller.ts:78` | SEC-10 |
| P38 | Remove dialog: "remove from host" consequence, revoke link to `vendorLabel`, last-row note | `T:AccessTokensTab.tsx:828-881`, `T:security-i18n.ts:2243-2300` | static text `J:react/tabs/AccessTokensTab.tsx:16` | SEC-10 |
| P39 | Extra secret fields are agent-private | `T:AccessTokensTab.tsx:635-666` | `J:react/components/CredentialEditor.tsx:8` (password type, no private attr) | SEC-10 |
| P40 | `worksFor` chips that keep disabled-plugin ids | `T:AccessTokensTab.tsx:668-683`, `T:custom-credential-forms.ts:129-137`, `T:hooks/use-access-tokens.hooks.ts:400-407` | MISSING | SEC-10 (publish), SEC-11 (custom); needs kit chip slot **A-K2-0a.chip** (§5) |
| P41 | Custom: per-origin host validation, username clear, metadata-only patch, no top-level `username` on create | `T:custom-credential-forms.ts:30-187`, `T:AccessTokensTab.tsx:896-921`, `T:api/security-api.ts:74-84` | `J:rules.ts:44-47,62-73` (base URL only; `customPatchFields` sends `username` on create) | SEC-11 |
| P42 | Custom storage choice (project vs site) | `T:AccessTokensTab.tsx:923-940` | MISSING | SEC-12 |
| P43 | Shared Keys picker: owner-only metadata inventory, omissions, locked rows, grant results | `T:CopyKeysDialog.tsx:9-34`, `T:hooks/use-copy-keys.hooks.ts:15-83`, `T:api/security-api.ts:55-63` | MISSING | SEC-12 |
| P44 | Project key attach/detach, usage chips, 30-second revoke note | `T:AccessTokensTab.tsx:422-454`, `T:hooks/use-access-tokens.hooks.ts:533-552`, `features/providers/api/providers-api.ts:6-7` | MISSING | SEC-12 |
| P45 | Rotation warning for shared keys | `T:AccessTokensTab.tsx:756-759`, `T:security-i18n.ts:2167-2181` | MISSING | SEC-12 |
| P46 | Masked, server-approved token hints | `T:AccessTokensTab.tsx:399`, `T:api/security-api.types.ts:23,115`, `T:hooks/use-other-credentials.hooks.ts:1` | `J:models.ts:10` ("without a last-4 hint") | SEC-12 (D5 policy flag) |
| P47 | Other stores: placeholders, deep links, per-store consequences, per-row feedback | `T:other-credential-stores.ts:51-91`, `T:OtherCredentialsSection.tsx:49-268` | `J:react/tabs/AccessTokensTab.tsx:13` (configured rows only) | SEC-13 |
| P48 | BYOK stores (masked/hint read, `PUT {apiKey}`, DELETE) | `T:hooks/use-other-credentials.hooks.ts:111-135,388-433` | `J:adapters/http.ts:60-77` | Wire OK; SEC-13 hints |
| P49 | Media whole-map write | `T:hooks/use-other-credentials.hooks.ts:183-211` (replaced id appended last as `{ apiKey, ...kept }`) | `J:adapters/http.ts:51-57` (kept in place as `{ baseUrl, model, apiKey }`) | SEC-13, byte-identical |
| P50 | External MCP: remove-only; env-name count with plural forms | `T:hooks/use-other-credentials.hooks.ts:150-170`, `T:other-credential-stores.ts:139-143`; Tovu drops `builtIn` servers (`T:hooks/use-other-credentials.hooks.ts:152`), Jini maps every entry (`J:adapters/http.ts:66`) | `J:adapters/http.ts:66,76`, `J:react/tabs/AccessTokensTab.tsx:13` | SEC-13 (`builtIn` filter in the HTTP adapter) |
| P51 | Serialized writes | `T:hooks/use-other-credentials.hooks.ts:233` | `J:controllers/other-credentials.controller.ts:18-38` | OK (pin) |
| P52 | Host content-refresh subscription and publication | `T:hooks/use-access-tokens.hooks.ts:488-506`, `T:hooks/use-other-credentials.hooks.ts:234-245`, `T:hooks/use-copy-keys.hooks.ts:65` | MISSING (manual reload only, `J:react/hooks/AccessTokensTab.hooks.ts:58`) | SEC-14 |
| P53 | Settlement generations (stale read never wins) | `T:hooks/use-access-tokens.hooks.ts:452` | `J:controllers/access-tokens.controller.ts:16,35-37` | OK (pin in SEC-14) |
| P54 | Localized, redacted, actionable failure copy | `T:security-i18n.ts:2195-2392`, `T:hooks/use-access-tokens.hooks.ts:1-2` (`@tovu/contracts/credential-copy`, `@/lib/credential-copy`) | `J:messages.en.ts:1` (9 keys); fixed controller strings | SEC-14 |
| P55 | Tab icons | `T:security-visuals.tsx:19-66` | kit `Icon` (A-K2-0a, `44ee815e`) | SEC-1: kit `TabBar` (on integ, `packages/admin/src/react/kit.tsx:93-94,243`) carries icon/handle/handleLabel/containerHandle; kit `Icon` needs A-K2-0a (not merged) |

### Wire contracts (paths under `/workspaces/:ws`; the host passes `workspacePath`)

| # | Call | Tovu | Stock Jini | Step |
|---|---|---|---|---|
| W1 | `GET /system/publish/credentials` → `{ credentials, executionMode }` | `T:api/security-api.ts:14-15` | same path, drops `executionMode` (`J:adapters/http.ts:25`) | SEC-8 |
| W2 | `POST /system/publish/credentials` `{ label, connection, isDefault?, worksFor? }` → `{ credential, verification? }` | `:22-26` | no `worksFor`; drops `verification` | SEC-8, SEC-10 |
| W3 | `PUT …/:id` (same body family) | `:33-37` | same gaps | SEC-8 |
| W4 | `DELETE …/:id` | `:40-41` | same | OK |
| W5 | `POST …/:id/verify` → `{ verification }` | `:49-52` | MISSING | SEC-8 |
| W6 | source-control credential CRUD; `GET /system/source-control/providers` | `source-control-api.ts:16-44` | same (`J:adapters/http.ts:22,36`) | OK |
| W7 | `GET /system/publish-targets` | `deployment-api.ts:57-58` | same (`J:adapters/http.ts:35`) | SEC-9 decouples it |
| W8 | custom credential CRUD; create `{ scope?, worksFor?, label, category, baseUrl, additionalHosts?, connection }`; update adds `username?: string \| null` | `T:api/security-api.ts:71-115` | same path; create also sends top-level `username` (`J:rules.ts:71-73,80`) | SEC-11 |
| W9 | `GET` / `POST /system/credential-copy` | `T:api/security-api.ts:55-63` | MISSING | SEC-12; `GET` → `{ sources }`, `POST` `{"sourceSiteId":"shared-keys","ids":[<one id>],"overwrite":false}` → `{ results }` (`T:hooks/use-copy-keys.hooks.ts:42,63`) |
| W10 | `PUT /project-keys/:keyId/use` `{ use }` | `providers-api.ts:6-7` | MISSING | SEC-12 |
| W11 | `/assistant/site-credential`, `/assistant/execution-credential` GET / `PUT { apiKey }` / DELETE | `ai-assistant-api.ts:107-122` | same (`J:adapters/http.ts:60-77`) | OK |
| W12 | `GET` / `PUT /media/providers` | `media-api.ts:13-17` | same path; PUT key order differs | SEC-13 |
| W13 | `GET /mcp-servers`; `DELETE /mcp-servers/:id` | `integrations-api.ts:115-128` | same | SEC-13: Jini lacks the `builtIn` filter (`J:adapters/http.ts:66`) |
| W14 | `GET /system/site-key` | `sites-api.ts:59` | `/system/site-token` | SEC-4 |
| W15 | `POST /system/site-key/reveal` | `sites-api.ts:65-66` | MISSING | SEC-6; response = status fields + optional `hex` (`features/sites/api/sites-api.types.ts:204-209`) |
| W16 | `POST /system/site-key/generate` | `sites-api.ts:75-76` | path | SEC-4 |
| W17 | `POST /system/site-key/import` `{ siteKey }` | `sites-api.ts:81-82` | path + body `{ token }` | SEC-4 |
| W18 | `GET` / `POST /system/site-key/start-fresh` `{ confirm }` | `sites-api.ts:84-90` | path | SEC-4 |
| W19 | `GET /api/admin/v1/auth/me` (grants) | `T:hooks/security-permissions-dependencies.hooks.ts:11-13` | host session (`comments-ports.ts` uses `/auth/me` too) | SEC-T1, U-AUTH-3 |

---

---

## 1b. Step contract for every SEC / U-AUTH step (on top of `P9-extraction.md` §1)

- **Branches and bases.**
  - Branch `p9/sec-<n>` (or `p9/u-auth-<n>`) from the current Jini integ tip, which is `integ/merge-13-2026-11-22` `7c4ee7881` at plan time.
  - Prerequisites are named per step and in §5. There is no "start immediately" list.
- **Tests first.**
  - Write the named failing test, or port the named Tovu assertions; only the import line and the injected collaborators change. Commit it red.
  - Implement until green.
  - Apply the **named mutation**: paste the red output, revert, paste the green output.
  - Record the before and after **test counts** for the package, so a deletion cannot hide (`honest-testing` skill).
- **Per-step outputs:** the `pnpm api:update` delta (list the added or changed entries) and a changeset `.changeset/p9-sec-<n>.md`.
- **Gates:** `pnpm guard`, `typecheck`, `check:size`, `check:complexity`, `check:hooks`, `check:cross-package`, `api:check`.
  - None may get worse than baseline.
  - Package tests run as `npm --prefix packages/<pkg> run test`.
- **Owner rules:**
  - Inject everything. Hooks are props with `use…Hook = use…` defaults.
  - Keep every `_optional = {}` pad and the two-object args rule.
  - Functions warn at 50 lines and error at 80; complexity ≤ 10.
  - Why-comments move with their code. Moves are verbatim.
  - No re-export shells. `jini-*` classes. No vendor or server-framework names.
  - No runtime code under core `src/contracts`.
- **Secrets.**
  - Every step that touches a secret field adds a test that the secret is absent from snapshots, error strings and `console` output.
  - Wire fixtures use fixture values only (`HEX = "a3f9…"`, `"fixture-token"`). Saved captures never contain real credentials, session cookies or recovery codes.
- **Cadence:** one implementer per step. Commit and push every 5–10 minutes. `git pull --rebase`, never force-push. Report SHAs.
- **Extra STOP conditions.**
  - (a) An OD-3 item the step needs is unanswered or refused.
  - (b) A kit slot the step needs is absent at its base. That is a K2 gap: do not add kit names inside a SEC step.
  - (c) A Tovu assertion cannot be expressed against the Jini controller without weakening it.
  - (d) A moved function exceeds 80 lines or complexity 10 after the move (§1 STOP 7).

---

## 2a. SEC-IDX — retire the overlapping sheets (docs only, Tovu `plan/whats-left-1122`, 20 min, before any SEC dispatch)

1. **Sheets.**
   - Prepend `> SUPERSEDED by plans/P9-SEC-plan-v2.md (SEC-1…14, SEC-T0/T1a/b/c). Do not dispatch.` to `plans/P9-steps/{SEC-adm-security-1,A-K2-security-1,A-K2-security-2,A-K2-security-3}.md`.
   - In `plans/P9-steps/A-K2-deployment-1.md:3` and `A-K2-deployment-2.md:3`, replace `A-K2-security-1` with `SEC-8` in `Depends on:`.
   - In `A-K2-deployment-1.md`, delete the two rewrites of `security/hooks/__tests__/access-tokens-dependencies.unit.test.ts:54,55` (sheet lines 68-69). Delete the same file from its must-stay-green list (line 100). SEC-T1c deletes that test.
2. **Batches** in `plans/P9K-extraction.md`:
   - Remove `SEC-adm-security-1.J` from B33 (`:201`) and `SEC-adm-security-1.T` from B34 (`:202`).
   - Remove `A-K2-security-1.J` from B98 (`:266`) and `A-K2-security-1.T` from B99 (`:267`).
   - Remove `A-K2-security-2.J` from B107 (`:275`) and `A-K2-security-2.T` from B108 (`:276`).
   - Remove `A-K2-security-3.J` from B114 (`:282`) and `A-K2-security-3.T` from B116 (`:284`).
   - Leave each batch's minutes and LOC as they are, and add a footnote: "SEC sheets removed (P9-SEC-plan-v2 SEC-IDX)".
3. **Data:** in `plans/P9-data/areas-and-steps.json`, add `"superseded": "P9-SEC-plan-v2"` to the four entries (`SEC-adm-security-1` at `:2859`; the `A-K2-security-*` entries found by `rg -n '"id": "A-K2-security'`).
4. **Lane SEC table** in `plans/P9-extraction.md` (§2): replace "Delete the 39 files" with "see `plans/P9-SEC-plan-v2.md` §4 (36 deleted, 3 relocated to host)".

Gate: `rg -n "SEC-adm-security-1|A-K2-security-[123]" plans/P9-steps plans/P9K-extraction.md` shows only the four superseded sheets themselves and the B-table footnotes.

---

## 2. Jini steps SEC-1…SEC-14

All files are under `packages/admin/src/security/` unless shown with a package path. "Ports" means the Tovu tests whose assertions are copied into vitest in that step. Tovu originals are deleted only in SEC-T1c, after the ledger gate (§4).

### SEC-1 — Module shape, host translator, header, `TabBar`, root-key tab options (100 min)

- **Goal:** `security()` takes the media module's shape, `media({ ui: reactModuleUi, overlays }, …)` (`modules.hooks.ts:34`).
  - New signature: `security({ ui }, { t?, rootKeyScopeNotice?, rootKeyTab?, tabIcons? })`.
  - Today it is `security(_required, { rootKeyScopeNotice })` and calls `bindReact` directly (`J:react/index.ts:1-9`).
- **Root-key tab options (check item 4).**
  - `rootKeyTab?: { generate?: 'shown' | 'hidden'; defaultEnvVarName?: string; previewRequired?: boolean }` is merged into the `root-key` tab's `params` at `J:react/index.ts:6`, the same way `rootKeyScopeNotice` is merged today.
  - The params reach `useSecurityPage` as `active.params` (`J:react/hooks/SecurityPage.hooks.ts:11`), and from there the `RootKeyTab` view.
  - Defaults are Jini's current behaviour: `generate: 'shown'`, `previewRequired: true`, no env-var fallback.
- **Tabs (check item 4).**
  - Kit `Tabs` (`J:react/pages/SecurityPage.tsx:2,10`) is replaced by kit **`TabBar`**. `TabBarTab` carries `icon`, `handle` and `handleLabel`, and `TabBarProps` carries `containerHandle` (`packages/admin/src/react/kit.tsx:93-94`; slot `:243`, already on integ).
  - `TabItem` (`kit.tsx:71`) has no icon or handle field, so it cannot express Tovu's tabs.
  - Handles keep Tovu's values: `security-tab-access-tokens`, `security-tab-site-key`, container `security-tab-bar` (`T:Security.tsx:148,157,190`). Handle labels go through `t`.
- **Icons:** host-supplied `tabIcons?: Partial<Record<'access-tokens' | 'root-key', ReactNode>>`. This removes the dependency on the unmerged A-K2-0a kit `Icon`. The host passes Tovu's glyphs (SEC-T1a).
- **Header:** the header gains kicker and description keys (P4).
- **Translator:** the host `t` flows through a translation context. A locale change does not remount.
- **Files:**
  - `react/index.ts`
  - `messages.en.ts`: + `englishSecurity`
  - `react/hooks/SecurityPorts.hooks.ts`
  - `react/pages/SecurityPage.tsx`
  - `react/hooks/SecurityPage.hooks.ts`
- **API delta:**
  - `./security/react`: `security` signature (breaking, minor), + `SecurityTranslator`, `SecurityRootKeyTabOptions` (types)
  - `./security`: + `englishSecurity`
  - In-repo callers: `rg "@jini-ai/admin/security/react" examples packages`.
- **Tests first** (`react/__tests__/security-module.test.tsx`), each case separate:
  - grants `['security.read']` → items `[access-tokens]`, and `requestedTab: 'root-key'` renders access-tokens;
  - with `admin.security.tokens.manage` → `[access-tokens, root-key]`;
  - page denied (no `security.read`) → denied notice, no `TabBar`;
  - each tab renders its handle, `handleLabel`, icon and the container handle;
  - `rootKeyTab: { generate: 'hidden', defaultEnvVarName: 'X', previewRequired: false }` reaches the `RootKeyTab` `params`;
  - swapping `t` relabels without disposing the tab controller;
  - `onTabChange({ tab })` fires once per change.
- **Ports:**
  - the tab-visibility and deep-link cases of `T:__tests__/Security.unit.test.tsx`;
  - `T:__tests__/use-security-permissions.unit.test.tsx`.
- **Mutation:** drop `permissions: ['admin.security.tokens.manage']` from the `root-key` tab (`J:security.module.ts:4`). The `['security.read']`-only case goes red, because `root-key` appears.
- **Depends:** SEC-IDX.

### SEC-2 — Owner-controls slot (60 min)

- As v1: `ownerControls?: ReactNode` is a Provider prop that renders once, above the `TabBar`, only when the page is visible.
- **Files:** `react/index.ts`, `react/hooks/SecurityPorts.hooks.ts`, `react/hooks/SecurityPage.hooks.ts`, `react/pages/SecurityPage.tsx`.
- **Tests first** (`react/__tests__/security-owner-controls.test.tsx`):
  - rendered once, before the `TabBar`;
  - absent when the page is denied;
  - nothing rendered when not supplied;
  - survives a tab change without remounting (a child effect counter stays 1).
- **Mutation:** stop rendering `vm.ownerControls` → red.
- **Depends:** SEC-1.
- **Host side:** the real TOTP and passkey mounts are tested in SEC-T0/T1a.

### SEC-3 — Owner recovery card (Users-owned; `@jini-ai/user-management`) (110 min)

**Moves, verbatim.**
- `T:RecoveryCodesCard.tsx` (90 lines; functions `RecoveryCodesCard` `:14`, `RecoveryKit` `:42`, `RecoveryKitOutput` `:62`, `DesktopOwnerReset` `:74`) → `UM:react/auth/RecoveryCodesCard.tsx`.
- `T:RecoveryCodesCard.hooks.ts` (36 lines) → `UM:react/auth/RecoveryCodesCard.hooks.ts`.
- Type-only: `OwnerRecoveryStatus` and `OwnerRecoveryPort` (`apps/admin/src/lib/owner-recovery-api.ts:8-14`) → that hooks file, names unchanged.

**Allowed edits (each named).**
1. **Imports.**
   - `SecretInput` → `../kit.js` (UM kit).
   - The UM hooks → `./OwnerRecovery.hooks.js`, relative. These are `useRecoveryKit`, `createRecoveryKitDownload` and `useOwnerPasswordReset`, already exported at `UM:react/index.ts:34`.
2. **Renames, so they do not collide with UM's own `useRecoveryKit` / `createRecoveryKitDownload` (`UM:react/index.ts:34`).** Logged in `P9-BREAKS.md`:
   - wrapper `useRecoveryKit` → `useOwnerRecoveryKit`;
   - `createRecoveryKitDownload` → `createOwnerRecoveryKitDownload`.
   - `useDesktopOwnerReset` keeps its name.
3. **Injected, K5.**
   - `port: OwnerRecoveryPort` becomes **required** (it was defaulted to `ownerRecoveryPort` at `:14`). Tovu passes its single-send client `ownerRecoveryPort` (`lib/owner-recovery-api.ts:16-28`, `requestOnce`, `cache: 'no-store'`), unchanged.
   - `describeFailure` has **exactly** `ownerRecoveryFailure`'s signature, including `secrets`: `({ error, message, action, step, t, secrets }) => UserFacingError` (`lib/owner-recovery-api.ts:35-38`).
     - The two wrappers keep their calls verbatim. `useOwnerRecoveryKit` passes `secrets: [controller.password, controller.code]` (`RecoveryCodesCard.hooks.ts:10`). `useDesktopOwnerReset` passes `secrets: [controller.password]` (`:28`).
     - The literal message, action and step strings stay in the moved code.
     - Tovu passes `ownerRecoveryFailure`, which applies `TOVU_ERROR_REDACTION_OPTIONS` plus `exactSecrets` (`:39-40`).
   - `FailureNotice: ComponentType<{ failure; t }>`. It replaces `ErrorNotice` from `@jini-ai/ui/panel-kit` (`T:RecoveryCodesCard.tsx:2`); UM has no `ErrorNotice`.
   - The existing hook props stay as they are: `useRecoveryKitHook` (`:43-44`) and `useDesktopOwnerResetHook` (`:75-76`). `RecoveryCodesCard` gains `createDownloadHook = createOwnerRecoveryKitDownload`, which is passed to `RecoveryKitOutput`.
   - Every `_options = {}` pad stays (`RecoveryCodesCard.hooks.ts:7,16,25`).
4. **Host copy, K3:** a `filename` prop replaces `'tovu-owner-recovery-codes.txt'` (`RecoveryCodesCard.hooks.ts:17`). `saveTextFile` keeps its DOM default verbatim (`:17-21`).

**Same-package exports.**
- `UM:react/index.ts` adds `RecoveryCodesCard`, `useOwnerRecoveryKit`, `createOwnerRecoveryKitDownload` and `useDesktopOwnerReset`.
- It adds the types `OwnerRecoveryStatus`, `OwnerRecoveryPort` and `RecoveryCodesCardProps`.
- api-baseline delta and changeset: user-management, minor.

**Host type repoints** (done in SEC-T1c, listed here):
- `lib/owner-recovery-api.ts:8-14`: the interfaces are deleted and imported as types from `@jini-ai/user-management/react`. They are not re-exported.
- `features/auth/OwnerRecoverySignIn.hooks.ts:3` and `features/auth/OwnerRecoverySignIn.tsx:5`: the type specifier changes to `@jini-ai/user-management/react`. `ownerRecoveryFailure` and `ownerRecoveryPort` stay imported from `lib`.

**Tests first** (`UM:react/auth/__tests__/RecoveryCodesCard.test.tsx`). They port `T:__tests__/RecoveryCodesCard.unit.test.tsx` (104 lines) and add:
- not owner → nothing rendered; unavailable → nothing rendered;
- load failure → `FailureNotice` receives the described failure. `describeFailure` gets `secrets` equal to the typed password and code, and the rendered text contains neither;
- issue → one call with `{ password, code }`, then exactly **ten** codes rendered inside a `data-agent-private` element;
- download → `saveTextFile` gets the injected filename and the joined codes, `URL.revokeObjectURL` is called for the created URL, and the codes clear;
- dismiss clears the codes;
- `desktopOwnerReset: false` → no reset form;
- reset with mismatch → message and no `reset` call. Reset is disabled until the password and confirmation are both non-empty (proof gating). Success shows the message;
- autocomplete is `current-password` / `one-time-code` / `new-password`, and every secret input is agent-private (`T:RecoveryCodesCard.tsx:49-50,82,84`).

**Size.** Each moved function is measured with `check:size` and `check:complexity`: warn at 50, error at 80, complexity ≤ 10. The largest today is `RecoveryKit` (`:42-61`, about 20 lines). Report each function's numbers. STOP 7 applies.

- **Mutation:** pass no `dismiss` to `createJiniRecoveryKitDownload` → the "download clears codes" test goes red.
- **Depends:** none.
- **Before U-AUTH-1:** both steps edit UM `package.json` metadata and the UM api-baseline, so SEC-3 merges first.

### SEC-4 — Root-key wire parity (70 min) — **UNCHANGED from v1 (Codex READY)**

- **Goal:** the Tovu site-key wire works byte for byte (W14, W16–W18; W15 lands in SEC-6), and status keeps `envVarName` and `reason`.
- **Files:**
  - `models.ts`: `RootKeyStatus` + `envVarName?: string`, `reason?: 'empty' | 'not-hex' | 'odd-length' | 'too-short'`
  - `adapters/http.ts`: `createHttpRootKey({ transport, workspacePath }, { path = '/system/site-token', importField = 'token' } = {})`; the import body is `{ [importField]: token }`; status projection adds the two fields when present
  - `adapters/memory.ts`: accepts them
- **API delta:** `RootKeyStatus` hash; `createHttpRootKey` signature (additive optional).
- **Tests first** (`__tests__/http.test.ts`), with fixtures asserting method, path and `JSON.stringify(body)`:
  - with `{ path: '/system/site-key', importField: 'siteKey' }`: status GET, generate POST, import POST `{"siteKey":"…"}`, preview GET, start-fresh POST `{"confirm":"START FRESH"}`;
  - defaults unchanged;
  - status projection strips an injected `hex` / `token` extra.
- **Ports:** `T:hooks/__tests__/site-key-dependencies.unit.test.ts`.
- **Mutation:** hardcode `{ token }` in `importToken` → red.
- **Depends:** none.


### SEC-5 — Root-key status presentation, generate visibility, typed refusals (110 min)

- **Goal:** v1's scope (P12–P16).
  - `generate` visibility and `defaultEnvVarName` arrive through the `rootKeyTab` params from SEC-1.
  - Jini never contains `TOVU_SITE_KEY`.
- **Refusal classes:** from an injected `describeError?: ({ error }) => { code?: string; detail?: string }` on the controller's optional args:
  - `locked`: `KEY_DEPENDENT_DATA` | `KEY_MISMATCH`
  - `refused`: `KEY_INVALID` | `SITE_META_UNREADABLE`
  - `already-exists`: `ALREADY_EXISTS`
  - `generic`

  These match `T:hooks/use-site-key.hooks.ts:82-90`.
- **Redaction (check item 6):** the generate failure shown is only `describeError`'s `detail`, or a generic key. The raw `error.message` never reaches the snapshot.
- **Files:** `controllers/root-key.controller.ts`, `rules.ts` (`rootKeyBadge`, `rootKeySourceNote`), `react/hooks/RootKeyTab.hooks.ts`, `react/tabs/RootKeyTab.tsx` (split into `RootKeyStatusCard` / `RootKeyScopeNotice`).
- **Tests first** (`__tests__/root-key.controller.test.ts`, `react/__tests__/RootKeyTab.test.tsx`). Ports:
  - the status, badge and note cases of `T:__tests__/SiteKeyTab.unit.test.tsx`;
  - `T:__tests__/site-key-status.rules.unit.test.ts`;
  - `T:__tests__/site-key-generate-error.unit.test.ts`.

  New cases:
  - generate absent when `hidden`;
  - generate refused for `{ active: true, state: 'active' }` and for sources `env` / `file`;
  - `KEY_DEPENDENT_DATA` sets `locked`;
  - `KEY_INVALID` shows its detail;
  - an error whose `message` is a fixture key string never appears in any snapshot field.
- **Mutation (check item 6):** replace the whole guard at `J:controllers/root-key.controller.ts:39` with `if (!status) return Promise.resolve(false);`. That removes the effective guard, `status.active || status.state !== 'missing'`. The active-key case then calls `api.generate` and goes red.
  - v1's mutation removed only `status.active ||`. An active key has `state: 'active'`, so the remaining clause still blocked it and the mutation could not fail.
- **Depends:** SEC-1, SEC-4.

### SEC-6 — Human-only reveal and clipboard (95 min)

**Prerequisite:** OD-3 (a) answered "allow".

- **Port:** `RootKeyPort.reveal?(required: Record<string, never>, optional?: RequestOptions): Promise<{ active: boolean; hex?: string }>`. The reply is the W15 status metadata plus **optional** `hex`.
- **HTTP adapter:** `createHttpRootKey`'s existing optional object (from SEC-4) gains `reveal = false`. When it is true, the adapter adds `reveal` as `POST ${path}/reveal` and projects only `{ active, hex? }`. Every other status field is dropped.
- **Memory adapter:** optional `revealHex`.
- **Controller.** The revealed value lives in a **private view-state cell** (`createRevealCell`), never in the public snapshot. The snapshot exposes only `revealed: boolean`, `revealing` and `revealError`.
  - `reveal()` runs only when the key is active, `port.reveal` is present, and a reveal is not already running. It takes a generation ticket.
  - A reply that is inactive, or has no `hex`, sets nothing and shows no error. This matches Tovu's `if (result.hex)` (`T:hooks/use-site-key.hooks.ts:115`).
  - **DC-4:** `hide`, `load`, any successful write, and `dispose` bump the generation and clear the cell. A reply that resolves after any of them is dropped.
  - `copy()` uses an injected `clipboard?: Pick<Clipboard, 'writeText'>`. `copied` reverts after 1,500 ms. A failure is silent (`T:SiteKeyTab.hooks.tsx:18-31`).
- **Reveal errors:** routed through `describeError`, with the generic key as fallback.
- **UI.**
  - **Reveal, Copy and Hide** render only when `port.reveal` exists. Each sits inside a plain wrapper element carrying `data-agent-private`, because `KitAttrs` (`packages/admin/src/react/kit.tsx:23`) has no such key. None of them has an `agentHandle`.
  - The value element is likewise private and has no handle.
- **Files:** `ports.ts`, `adapters/http.ts`, `adapters/memory.ts`, `controllers/root-key.controller.ts`, `react/hooks/RootKeyTab.hooks.ts`, `react/tabs/RootKeyTab.tsx`.
- **Tests first.**
  - Port `T:__tests__/SiteKeyTab.agent-secrecy.unit.test.tsx`. It uses the **real** `createDomPageDriver` from `@jini-ai/agentic/dom`, which is already an admin devDependency (`packages/admin/package.json:467`). Through that driver the agent surface can neither read the value nor invoke Reveal, Copy or Hide.
  - Port the reveal cases of `T:__tests__/SiteKeyTab.unit.test.tsx` and `T:__tests__/use-site-key.unit.test.tsx`.
  - New cases:
    - no control without `reveal`, and none for an inactive key;
    - one POST per click;
    - an inactive reply after a status/reveal race shows nothing and no error;
    - hide **while pending**, then the reply resolves → nothing shown; the same for refresh, a write and dispose;
    - an error shows no value;
    - copy then revert under fake timers;
    - the fixture `HEX` never appears in the snapshot, `error`, `result` or any `console` call.
- **Mutation:** remove the generation check from the reveal reply handler → the hide-while-pending case goes red.
- **Depends:** SEC-5 and OD-3 (a).

### SEC-7 — Recovery parity (110 min)

- **Goal:** v1's scope (P20–P24).
  - Locked = status or generate refusal (`T:hooks/use-site-key-recovery.hooks.ts:53-62`).
  - The unlock message includes the count, and start-fresh lists the receivers. Both go through `t`.
  - Refusals show the server `detail` through `describeError`, with the generic text as fallback.
- **Preview failure (check item 6, DC-5).**
  - In Tovu, a failed preview still opens the confirm step and shows the error (`:136-146`). Confirm then needs only the exact phrase: `canConfirmStartFresh` (`:155`) does not require a preview.
  - Stock Jini returns `false` from `startFresh` without `state.preview && state.confirming` (`J:controllers/root-key.controller.ts:52`). Its preview `catch` leaves `confirming` false (`:48`).
  - SEC-7 adds the tab param `previewRequired` (SEC-1). When it is `false`, a preview failure sets `confirming: true, preview: null, error`, and `startFresh` requires only `isRootKeyLocked && confirming && confirm === START_FRESH_CONFIRMATION`.
  - The default `true` keeps Jini's flow, and Tovu passes `false`. The intentional difference is recorded as DC-5.
- **Redaction:** unlock and start-fresh errors pass the typed key as an exact secret to `describeError`'s caller (`secrets: [token]`). The pasted key never appears in `error`.
- **Files:** `rules.ts`, `controllers/root-key.controller.ts`, `react/hooks/RootKeyTab.hooks.ts`, `react/tabs/RootKeyTab.tsx`.
- **Tests first.**
  - Ports: `T:__tests__/use-site-key-recovery.unit.test.ts` and `T:__tests__/SiteKeyRecoveryCard.unit.test.tsx`.
  - v1 cases plus:
    - `previewRequired: false` and a preview rejection → the confirm step shows the error; confirm is disabled until the exact phrase; one POST with `{"confirm":"START FRESH"}` (fixture);
    - `previewRequired: true` and a preview rejection → no confirm step;
    - a refusal whose message echoes the typed key → the key is absent from `error`.
- **Mutation:** delete the `state.confirm !== START_FRESH_CONFIRMATION` clause → the "disabled until exact phrase" case goes red, in both modes.
- **Depends:** SEC-6.

### SEC-8 — Publish credential contract shared with Deployment (105 min)

**Prerequisites.**
- **K4-seam-5.J** is merged. It moves `CredentialTokenHint` and `CredentialConnection` from `@jini-ai/platform/secrets/credential-token` to `@jini-ai/core/contracts/site/secrets-credential-token` (`plans/P9-steps/K4-seam-5.md`, row 3). At the pinned Jini integ the type is still in platform (`packages/platform/src/secrets/credential-token.ts:65`).
- **OD-3 (b)** answered.
- **SEC-4 merged.** Both steps edit `adapters/http.ts` and `adapters/memory.ts`, so they run in sequence.

**Moves.**
- (a) **Type-only K4, verbatim.** `T:api/security-api.types.ts` (166 lines) → `J:wire.types.ts`, names unchanged. Its `CredentialTokenHint` import becomes `@jini-ai/core/contracts/site/secrets-credential-token`. Admin already depends on core.
- (b) **`createHttpPublishCredentials({ transport, workspacePath })`.** Its methods are `listPublishCredentials`, `createPublishCredential`, `updatePublishCredential`, `deletePublishCredential` and `verifyPublishCredential`.
  - Requests are byte-identical to `T:api/security-api.ts:14-52`.
  - Responses are projected to the declared wire fields, with nested `connection` and `tokenHint` copied field by field.
- (c) **The Security screen reads the new data.** `summary()` carries `credentialType` and `worksFor`. The access-tokens snapshot carries `executionMode` (from W1) and `lastVerification` per row (from the W2/W3 `verification?` and W5).
  - Path: `SecurityApiPort` `list({ kind: 'publish' })` returns `{ rows, executionMode }` through the existing store adapter (`J:adapters/http.ts:19-30`). `AccessTokensTab.hooks` reads `executionMode` from the controller snapshot.
  - Deployment keeps its own client, separate from this.

**Consumer repoints.** They are listed here and applied in SEC-T1b:
- types → `@jini-ai/admin/security`:
  - `features/deployment/StaticSiteTab.tsx:13`
  - `api/deployment-api.types.ts:1`
  - `hooks/publish-credentials-dependencies.hooks.ts:1`
  - `hooks/publish-credentials-port.hooks.ts:1`
  - `hooks/use-publish-credentials.hooks.ts:6`
  - `rules.ts:2`
- `securityApi` → host `security-ports.ts` (`publish-credentials-dependencies.hooks.ts:2`).
- `CredentialTokenHint` importers inside Tovu are K4-seam-5.T's list.

**Exact envelopes (W1–W5 fixtures).**
- W1 `GET …/system/publish/credentials` → `{ credentials, executionMode }`.
- W2 `POST` body: exactly the given `{ label, connection, isDefault?, worksFor? }`. An omitted field is absent, not `undefined`. Response `{ credential, verification? }`.
- W3 `PUT …/system/publish/credentials/<encodeURIComponent(id)>`, with `SLASH_ID` from `lib/__tests__/api-id-url-encoding.unit.test.ts:194-204`.
- W4 `DELETE`.
- W5 `POST …/<id>/verify` → `{ verification }`.

**Files:** `wire.types.ts` (new), `adapters/http.ts`, `adapters/memory.ts`, `conformance/security-api.conformance.ts`, `index.ts`.

**API delta.**
- `./security`: + the wire types
- `./security/adapters/http`: + `createHttpPublishCredentials`
- `./security/adapters/memory`: + `createMemoryPublishCredentials`

**Tests first.**
- One HTTP fixture per call, asserting method, path and `JSON.stringify(body)`.
- Projection strips `token` and `ciphertext`, including nested inside `connection`.
- Port the publish cases of `lib/__tests__/api-system-endpoints.unit.test.ts:228-268` and `api-id-url-encoding.unit.test.ts:194-204`.
- Port the publish half of `T:hooks/__tests__/access-tokens-dependencies.unit.test.ts`.
- Run conformance on the memory adapter.

**Mutation:** drop `executionMode` from the projected snapshot → red.

**Depends:** K4-seam-5.J, SEC-4, OD-3 (b).

### SEC-9 — Catalog independence, unlisted providers, merged ordering, search, count, legacy labels (110 min; may split 9a rules / 9b view model, same implementer)

- **Port:** `SecurityApiPort.providers(required: { kind?: 'publish' | 'source-control' })`. This widens the existing required arg from `Record<string, never>` (a field, not a method). The adapter serves each kind from its own endpoint; no `kind` still returns both. The controller issues two independent calls, and one failure leaves the other catalog shown (P28).
- **Rules** (`rules.ts`; verbatim logic, Jini names):
  - `providersWithSavedRows` (`T:access-token-providers.ts:130-170`), including the unlisted fallback;
  - `sortCredentialGroups` (`T:rules.ts:113-177`);
  - numbered `legacyCredentialLabel` (`T:access-token-rows.ts:11-27`);
  - `rowMatchesQuery` / `providerMatchesQuery` (`T:access-token-rows.ts:166-187`);
  - the count sentence keys (`T:other-credential-stores.ts:154-169`).
- **View model and UI:** `react/hooks/AccessTokensTab.hooks.ts` builds merged groups (`T:AccessTokensTab.hooks.tsx:106-197`). `react/tabs/AccessTokensTab.tsx` renders groups, not-connected rows and the empty-hosting hint (P33, P28).
- **Files:** `ports.ts`, `adapters/http.ts`, `adapters/memory.ts`, `rules.ts`, `controllers/access-tokens.controller.ts`, the two react files.
- **API delta:** `SecurityApiPort` hash; + 4 rules exports.
- **Tests first** (ports):
  - `T:__tests__/rules.unit.test.ts` (975 lines): the categories, sort, search and legacy-label sections
  - `T:__tests__/AccessTokensTab.unit.test.tsx`: ordering and empty hint
  - `T:hooks/__tests__/use-access-tokens.unit.test.tsx`: the catalog-failure sections
- **Mutation:** filter out saved rows whose provider descriptor is absent → red.
- **Depends:** SEC-1, SEC-8. (v2: unchanged scope; `kind` widening is a field on the existing required arg, not a port.)


### SEC-10 — Vendor token forms, default indicator, removal consequences (105 min)

**Prerequisite:** **A-K2-0a.chip**, a kit `ChipField` slot (§5).
- Tovu uses `OnboardingChipField` from `@jini-ai/ui` (`T:AccessTokensTab.tsx:4`).
- `k2-kit-gaps.md:149` misfiled it in group 0c (types), and neither integ nor `44ee815e` has a chip or multiselect slot.

**Scope.** v1's scope (P34–P40 for publish and source-control), plus:
- **Exact write bodies (W2/W3).**
  - A rename without a token sends `{ label }` only; no `connection` key.
  - `worksFor` is sent only when it changed.
  - Extra fields go inside `connection`, never at the top level.
- **Denied grants.** Without the kind's write grant there are no add, edit or remove affordances (DC-1). The test also checks that the controller refuses the call (`J:controllers/access-tokens.controller.ts:36`).

**Tests first.**
- The v1 ports.
- A W2/W3 body fixture per case.
- A denied-grant case per kind.
- Disabled-plugin `worksFor` ids are kept as chips.

**Mutation:** make `buildCredentialPatch` emit `connection` when the token is blank → red.

**Depends:** SEC-9, A-K2-0a.chip.

### SEC-11 — Custom provider forms and compatibility (110 min)

**Scope.** v1's scope (P41, P40 custom, W8), plus:
- **Scope selection (check item 7).**
  - Create sends `scope` only when the snapshot has `projectKeysAvailable`. That flag reaches the screen through the custom store's `list` result (`T:api/security-api.types.ts:100-147`).
  - Without it, no scope field is sent, matching `T:AccessTokensTab.tsx:923-940` and `T:api/security-api.ts:74-84`.
- **Exact bodies (W8 fixtures).**
  - Create: `{ scope?, worksFor?, label, category, baseUrl, additionalHosts?, connection }`. Omitted fields are absent, and there is **no top-level `username`**.
  - Update: only the changed fields, with `"username":null` to clear (`lib/__tests__/api-system-endpoints.unit.test.ts:359`).
  - Path ids are encoded (`api-id-url-encoding.unit.test.ts:219-224`).
- **Host-facing method names.** `createHttpCustomCredentials({ transport, workspacePath })` exposes Tovu's names: `listCustomCredentials`, `createCustomCredential`, `updateCustomCredential` and `deleteCustomCredential`. That way the host `securityApi` object (SEC-T1a) keeps the `lib/__tests__` call sites unchanged.

**Tests first.**
- The W8 fixtures.
- Scope present only with `projectKeysAvailable`.
- Custom sections of the credential-flows, rules and use-access-tokens tests.
- Ports of `api-system-endpoints.unit.test.ts:318-367`.
- A denied-grant case.

**Mutation:** accept a malformed additional origin → red.

**Depends:** SEC-10.

### SEC-12 — Shared Keys, project-key use, safe hints, rotation warning (120 min; may split 12a port/adapter/controller, 12b UI)

**Prerequisite:** OD-3 (c) answered.

**Port.**
- `SecurityApiPort.sharedKeys?: { list(required, optional): Promise<readonly AdminCredentialCopySource[]>; grant(required: { sourceSiteId: string; ids: readonly string[]; overwrite: boolean }, optional): Promise<readonly AdminCredentialCopyResult[]> }`.
- `useProjectKey?(required: { keyId: string; use: boolean })`.

**Exact bodies (W9/W10 fixtures).**
- The grant is `POST …/system/credential-copy` with `{"sourceSiteId":"shared-keys","ids":["<one id>"],"overwrite":false}` (`T:hooks/use-copy-keys.hooks.ts:63`). The listing is `GET …/system/credential-copy` (`:42`).
- `PUT …/project-keys/<encodeURIComponent(keyId)>/use` with `{"use":true|false}`.
- `createHttpCredentialCopy` exposes Tovu's names, `listCredentialCopySources` and `copyCredentials`, for the host `securityApi` (`lib/__tests__/api-system-endpoints.unit.test.ts:21-24`).

**Metadata-only projection.**
- Inventory rows are projected to `{ id, label, providerId, kind, locked, tokenHint? }`.
- Grant results are projected to `{ id, status }`.
- Nested `tokenHint` is copied as `{ length, last4 }` only, and is displayed exactly as the server sent it.
- Extra fields, including nested `connection`, `secret` and `ciphertext`, are dropped. A fixture with those extras at every level proves it.

**Server checks are unchanged and pinned in Tovu** (SEC-T1a keeps these route tests green):
- credential-copy:
  - seeded-owner session (`credential-copy.ts:24,27`)
  - RBAC `system.write` and instance admission (`:12-17`)
  - local admission (`:29-30`)
  - id validation (`validCopyIds`, `:34-37`)
  - per-key permission through `authorizedCopy`'s `permission` (`:12`)
  - `__tests__/credential-copy.tw4.pins.test.ts`
- project-key use:
  - owner session (`provider-settings.ts:138`)
  - `custom-credentials.read` (`:143`)
  - per-kind `permissionFor` (`:144-145`)

**Controller:** `shared-keys.controller.ts` follows v1, with the logic of `T:hooks/use-copy-keys.hooks.ts:28-77`.
- One selected id.
- A busy ref, so a second submit sends nothing.
- `onGranted` is called after a successful grant, before the results render. SEC-14 wires it to the refresh publication.

**UI.**
- The v1 items.
- **Stylesheet handoff (check item 1).** The dialog marks its parts with `data-jini-part="security.shared-keys.{source,list,overwrite,results}"`. These replace the five `.copy-keys-*` rules of `T:copy-keys-dialog.css`. SEC-T1b re-targets the Tovu copy of those rules.

**Tests first.**
- The v1 ports.
- The W9/W10 fixtures.
- A denied-grant case: no Shared Keys button without `custom-credentials.write`.
- Projection with nested extras.
- A double submit sends one POST.

**Mutation:** render "Granted to this site" for any result status → red.

**Depends:** SEC-11, OD-3 (c).

### SEC-13 — Other credential stores (110 min)

**Scope.** v1's scope (P47–P50), plus:

- **MCP built-in filter (check item 8).**
  - `createHttpOtherCredentials`' `list` for `external-mcp` filters `servers.filter(s => !s.builtIn)` **before** projection. Today `J:adapters/http.ts:66` maps every entry.
  - This matches `T:hooks/use-other-credentials.hooks.ts:152`.
  - The response type gains `builtIn?: boolean`.
  - **Credited test:** `adapters/__tests__/http-other-credentials.test.ts` "built-in MCP servers are not listed". A fake transport returns the same two rows as `features/settings/__tests__/built-in-mcp.unit.test.tsx:25` (`builtIn: true` and `serverId: "user-server", builtIn: false`), and only `user-server` is listed. The Tovu harness edit is OD-4 (ii).
- **W12 order (D3).**
  - `createHttpOtherCredentials`' existing optional object gains `mediaOrder: 'in-place' | 'replaced-last' = 'in-place'`. The default is Jini's current order (`rebuildMedia`, `J:adapters/http.ts:51-57`).
  - With `'replaced-last'`, the replaced id is removed from its position and appended last as `{ apiKey, ...kept }`, matching `T:hooks/use-other-credentials.hooks.ts:183-211`.
  - Tovu passes `'replaced-last'`. Jini's default is not changed.
- **W12 fixtures** compare `JSON.stringify(body)` for both orders and four cases:
  - replace an existing provider;
  - add a new provider (an id not in the map);
  - remove;
  - siblings with `{ baseUrl?, model? }` only. A sibling's `apiKey` / `apiKeyTail` from the GET is never echoed.

**Tests first.**
- The v1 ports.
- The filter test.
- The W12 fixtures.

**Mutation:** remove the `builtIn` filter → the credited test goes red.

**Depends:** SEC-12.

### SEC-14 — Host refresh, locale, redacted actionable failures (95 min)

**Prerequisite:** OD-3 (d) answered. The default plan uses OD-3's smallest option: a `refreshSignal` field on `security()`'s optional args, not a new token.

**Refresh (check item 8).**
- **Resource:** the host keeps its existing content-refresh resource, `'access-tokens'` (`T:rules.ts:53`, `ACCESS_TOKENS_RESOURCE`).
- **Subscribers:** both credential controllers (access-tokens and other-credentials) subscribe on start. They unsubscribe on dispose (`T:hooks/use-access-tokens.hooks.ts:488-506`, `T:hooks/use-other-credentials.hooks.ts:234-245`).
- **Publisher:** SEC-12's `onGranted` calls the host's publication callback, `publishContentRefresh([ACCESS_TOKENS_RESOURCE])` (`T:hooks/use-copy-keys.hooks.ts:65`). It is injected as `onCredentialsChanged?` on the same optional args.
- **Stale reads:** a read whose ticket is stale never wins (`J:controllers/access-tokens.controller.ts:24`).

**Copy and errors.**
- Every controller message is a key through `t`.
- `describeError` produces actionable, redacted text.
- `draftError` reproduces `credentialDraftError`.
- Submitted draft tokens are passed as exact secrets. Diagnostics never contain them.

**Files:** `security.module.ts` / `react/index.ts` (optional fields), both credential controllers, `react/hooks/AccessTokensTab.hooks.ts`, `messages.en.ts`.

**Tests first.**
- A refresh signal reloads every store, once.
- Dispose unsubscribes: the signal count after dispose is 0.
- An older overlapping read that resolves last is ignored, for both controllers.
- After a Shared Keys grant, `onCredentialsChanged` is called once.
- A locale switch relabels without disposing.
- No draft token appears in any error or diagnostic.
- A refusal's detail reaches the screen only through `describeError`.

**Mutation:** remove `isCurrent(ticket)` from the success branch at `J:controllers/access-tokens.controller.ts:24` → red.

**Depends:** SEC-13, SEC-2, OD-3 (d).

---

## 3. Users-owned owner-auth split (`dev-auth.ts`) on K1: U-AUTH-1…3, U-AUTH-T1

### 3.1 What is there today (`DA:` at `0d7f78fa4`, 876 lines)

- **Live routes (move).** Registered in this order by `registerAuthRoutes` (`DA:585-637`) after the owner recovery, MFA and passkey registrations (`DA:592-608`):

  | route | lines | wire facts to keep |
  |---|---|---|
  | `POST /auth/login` | `DA:641-692` | `identityReady` awaited first. Limiter keyed by `resolveClientIp(req)`; 429 sends `Retry-After` and `{error:"too many login attempts",code:"RATE_LIMIT_EXCEEDED",details:{retryAfterSeconds}}`. `String(req.body?.username ?? "")` / password coercion (`:660-661`). `no-store` **after** credentials succeed (`:675`). MFA challenge is sent as-is with no cookie (`:676`). Revoke, then set cookie, then signal, then `{user:{id,username}}` (`:680-683`). 401 `{error:"invalid username or password",code:"UNAUTHENTICATED"}`. Otherwise `sendAuthFailure(…,"login")` |
  | `POST /auth/mfa/login` | `DA:696-718` | `no-store` **first**, on every answer. 429 has a different message and no `details`. `mfaBodyText` gives string-only proofs (`:578-581`). Revoke, then cookie, then user lookup, then signal. 400 `{error:<message>,code:"MFA_REFUSED"}` |
  | `POST /auth/logout` | `DA:723-735` | `identityReady` awaited; revoke; `clearSessionCookie`; `{ok:true}`; `sendAuthFailure(…,"logout")` |
  | `POST /auth/boot-session` | `DA:762-775` | why-comment `:739-761`. Loopback checked **before** the token is read, else 403. Then `redeemOwnerBootSession` and `next(error)` |
  | `POST /auth/local-boot-session` | `DA:783-810` | why-comment `:779-782`. 404 when disabled or the capability is refused; 403 when not same-origin loopback. `no-store` after both checks. An existing session wins (`:799-800`). Request-local `createBootSessionTokenStore` mint/redeem pairing (`:801-804`). `next(error)` |
  | `GET /auth/me` | `DA:814-855` | `asyncRoute`, so its route-table handler name is `forwardRejection`. 401 `{error:"unauthenticated",code:"UNAUTHENTICATED"}`. Body keys `user`, `effectivePermissions`, `canManageUserTrash`, `canPublishToLive` |
  | `GET /auth/me/password-status` | `DA:858-875` | `asyncRoute`. Same 401. Missing user row gives `{usesDefaultPassword:false}`. Memo per registration (`DA:616-635`) |

- **Host policy that stays in Tovu:**
  - `readSessionToken` (`:204-208`), `revokeRequestSessions` (`:214-220`), `localSessionCookieName` from `req.socket.localPort` (`:223-225`);
  - `setSessionCookie`, which sets the ordinary cookie and **clears the local cookie** when one is present (`:228-235`), and `clearSessionCookie`, which clears both (`:237-242`);
  - `currentPrincipal` / `currentCredential`, `isLoopbackPeer`, `redeemOwnerBootSession` (`:513-545`), `signalAdminSignIn` (`:566-571`, eligibility check, never awaited, runs after the cookie is set), `sessionRequestOptions` (`req.ip`, user agent, TTL; `:574-576`), `sendAuthFailure`;
  - the single `loginRateLimiter` created per registration (`:590`) and shared with recovery, MFA and passkey (`:592-599`).

### 3.2 K1 seam analysis (check item 2)

The K1 recipe (`P9K-extraction.md` §2 K1) is `defineJsonRoute` in Jini, then `mountJsonRoute({ app, spec: { ...spec, ports }, deps })` in Tovu (`packages/http-kit/src/adapter.ts:37`). What that seam gives at the pinned Jini:

| need | seam at `7c4ee7881` | verdict |
|---|---|---|
| Host JSON parser kept; parsed body passed through | `rawInput({ req })` reads `req.body` (`packages/http-kit/src/request.ts`); the Express `app[spec.method](path, …)` mount runs after Tovu's parser (`adapter.ts:39,58`) | **expressible** |
| Per-request request facts (cookies, `req.ip`, user agent, `socket.localPort`, headers, loopback) | `ports.authenticate({ raw, res, deps })` (`types.ts:16`). The host reads `res.req` and returns a per-request `Context` | **expressible** (host-only, via `res.req`) |
| Success headers (`Set-Cookie`, `Cache-Control`) | No success-header field. `sendJson` writes `spec.successStatus ?? 200` and the body (`adapter.ts:111`). The host's `Context` methods write headers on `res` **before** `handle` returns, and `sendJson` keeps them | **expressible** through the `authenticate` context |
| Flat error bodies, 401/403/404/429/400 | A thrown `RouteRefusalError({ status, body })` (`core/src/errors/route-refusal.ts`, branch `66310ee7`) goes to the host `onError({ res, error })` (`adapter.ts:122-124`), which writes the flat body. `rejectRoute`'s `details` type is `{ permission, reason }`, so the login 429 constructs `new RouteRefusalError({ status: 429, body })` directly | **expressible** |
| `Retry-After` | Set through `context.retryAfter(seconds)` before the throw; `onError` keeps prior headers | **expressible** |
| Returned `err` from `parse` / `handle` | At `7c4ee7881` a returned `err` **bypasses** `onError` and answers Jini's `{error:{…}}` envelope (`adapter.ts:64-66,107-109`). The parity fix moved to BX-53/54 | **constraint:** `parse` is total (always `ok`), and `handle` never returns `err`; every refusal is **thrown**. A test pins this per route |
| `next(error)` to Express's error chain | `onError` has no `next` (`types.ts:18`) | **gap → OD-2** (host `res.req.next`, else one optional field) |
| Route-table handler names | `mountJsonRoute` registers one anonymous handler (`adapter.ts:39`) | 5 rows unchanged; 2 rows change name → **OD-1** |
| Case-insensitive, non-strict trailing slash, HEAD for GET, automatic OPTIONS | Express router behaviour on `app.get` / `app.post` is unchanged, because the mount is still `app[method](path)` | **expressible**; pinned below |

Core's web `jsonRoute` (`json-route.ts:169-258`) is **not** used for these routes. Its `finalAnswer` builds a fresh `Response` with no headers (`:257`), so it cannot carry success cookies. Only the http-kit mount is in scope. The owner's K1 recipe names that mount, so no exception is needed for it.

### 3.3 Destination and contracts (Jini `@jini-ai/user-management`)

**Files.** `UM:admin-http/auth/`:
- `password-login.ts`
- `mfa-login.ts`
- `logout.ts`
- `boot-session.ts`
- `local-boot-session.ts`
- `current-user.ts`
- `password-status.ts`
- `auth-request.ts` (the `AuthRequest` context type and the response policy)

**Export.** New entry `@jini-ai/user-management/admin-http/auth`, with runtime `node`, the dist triple and `jini.entries`. It imports only:
- core `contracts/server` (`defineJsonRoute`, types);
- core `errors/route-refusal` (`RouteRefusalError`; RT-K1-0.J at its **current** tip `66310ee7`, path `packages/core/src/errors/route-refusal.ts`);
- UM `server` services, relatively.

**Small per-route deps** (only the fields each handler reads):

| route | `<Name>RouteDeps` fields |
|---|---|
| password-login | `identityReady`, `workspaceId`, `mfaStore?`, `login`, `beginOwnerLogin` (UM services, pre-bound by the host with `authServiceDeps` / `ownerMfaDeps`) |
| mfa-login | `workspaceId`, `completeOwnerLogin`, `findUserByPrincipalId` |
| logout | `identityReady` |
| boot-session | none beyond the context |
| local-boot-session | none beyond the context |
| current-user | `workspaceId`, `findUserByPrincipalId`, `effectivePermissions`, `callerMayManageUserTrash`, `canPublishToLive` |
| password-status | `workspaceId`, `findUserByPrincipalId`, `verifyPassword`, `defaultOwnerPassword` (K3: was `DEFAULT_OWNER_PASSWORD`) |

**`AuthRequest`.** This is the per-request context the host's `authenticate` port returns, bound to the **original** Express request through `res.req`. It is the host-injected response policy:
- `clientKey: string`: `resolveClientIp(req)`.
- `sessionOptions(): { ip; userAgent; sessionTtlMs }`: `sessionRequestOptions`.
- `rateLimit.check(): Promise<{ allowed; retryAfterSeconds }>`: the registration's **single** `loginRateLimiter`, keyed by `clientKey`.
- `currentPrincipal(): Promise<Principal | null>`: honours `localOwnerSignIn`.
- `revokeSessions(): Promise<void>`: `revokeRequestSessions`.
- `cookies.replaceSession({ rawToken, expiresAtIso }, { name? }): readonly string[]`: runs `setSessionCookie` and returns the `Set-Cookie` values **in order**. The ordinary cookie comes first, then the local-cookie clear when that cookie was present.
- `cookies.clearSessions(): readonly string[]`: runs `clearSessionCookie`. It returns the clear of `tovu_session`, then the local clear when present.
- `noStore(): void`: `Cache-Control: no-store`.
- `retryAfter(seconds): void`: sets `Retry-After`.
- `signedIn({ principalId }): void`: `signalAdminSignIn`, fire-and-forget.
- `loopback: boolean`: `isLoopbackPeer`.
- `localOwnerSignIn: { enabled: boolean; acceptsCapability(): boolean; allowsRequest(): boolean }`: the capability is read from the host header, so its name stays in Tovu.
- `redeemBootSession({ token }, { mintLocal? }): Promise<BootRedemption>`, where `BootRedemption` is one of:
  - `{ kind: 'refused' }`: 401 `{error:"invalid or spent boot token",code:"UNAUTHENTICATED"}`;
  - `{ kind: 'mfa'; body }`: `no-store` and a 200 challenge, no cookie;
  - `{ kind: 'failure'; error }`: the host's redacted `sendAuthFailure` envelope;
  - `{ kind: 'session'; principal; setCookies: readonly string[] }`.

  This is the request-aware refactor of `DA:513-545` (check item 3), which today writes `res` directly. The redemption order stays the same: redeem, resolve the owner, mint, `validateSession` confirmation, revoke when `cookieName === SESSION_COOKIE`, set cookie. `mintLocal: true` keeps the request-local `createBootSessionTokenStore()` mint/redeem pair (`DA:801-804`).

**Host ports per mount.**
- `authenticate`: builds the `AuthRequest` above.
- `onError`: maps `RouteRefusalError` to `res.status(status).json(body)`. For login and logout, any other error goes to `sendAuthFailure` with the route's operation. For `boot-session`, `local-boot-session`, `me` and `password-status`, any other error goes to Express's error chain (OD-2).

### 3.4 Behaviour pins B1–B22 (each one is a Jini unit test with a fake `AuthRequest`, or a Tovu route test)

1. **B1** login: `identityReady` is awaited before the limiter.
2. **B2** login 429: the exact body above, and `Retry-After` equals `retryAfterSeconds`.
3. **B3** login: `username: 123` and `password: null` are coerced to `"123"` and `""`.
4. **B4** login: the MFA challenge body is passed through, with `no-store` and **no** `Set-Cookie`.
5. **B5** login success: `revokeSessions` is called before `cookies.replaceSession`; then `{user:{id,username}}`.
6. **B6** login success with a local cookie present: `set-cookie` is exactly `[tovu_session=…, tovu_session_local_<port>=; …Expires=Thu, 01 Jan 1970…]`, in that order.
7. **B7** login: `AuthInvalidCredentialsError` gives a 401 with the exact body and **no** `no-store` (it is set only after success; `DA:675`).
8. **B8** login: `signedIn` is called once, after the cookie, and never awaited. A rejected eligibility check does not change the response.
9. **B9** mfa/login: `no-store` is present on the 429, the 400, the 500 and the success answers.
10. **B10** mfa/login: an object or number `pendingToken` / `code` becomes `""`.
11. **B11** mfa/login 429: the exact body has no `details`.
12. **B12** mfa/login: `IdentityValidationError` gives a 400 `MFA_REFUSED` with the error's message.
13. **B13** logout: `{ok:true}`, `set-cookie` clears both cookies in order, and `revokeSessions` runs once.
14. **B14** boot-session: a non-loopback caller gets a 403 **before** the token is read (spy on body access).
15. **B15** boot-session: an unarmed, a wrong and a spent token all give the identical 401.
16. **B16** boot-session: the MFA challenge comes back as a 200 with `no-store` and no cookie.
17. **B17** boot-session: a failed confirmation gives the redacted `sendAuthFailure` envelope.
18. **B18** local-boot-session: disabled → 404, and a refused capability → 404, both checked before the loopback/same-origin 403.
19. **B19** local-boot-session: an existing session is answered with `{user:{id}}`, with no mint and no cookie. A non-owner is never promoted.
20. **B20** local-boot-session: `no-store` is present after both checks pass.
21. **B21** me and password-status: unauthenticated → the exact 401. The `/me` body has exactly four keys.
22. **B22** password-status:
    - a missing user row gives `false`;
    - the memo is **per registration**, so two factory calls do not share hits;
    - a new hash re-verifies;
    - the memo clears wholesale at 256;
    - why-comment `DA:616-626` moves verbatim.

### 3.5 Steps

| step | repo | content | tests first + mutation | est |
|---|---|---|---|---|
| **U-AUTH-1** | Jini UM | `auth-request.ts`; login, mfa-login, logout; export entry + api-baseline + changeset. **After SEC-3** (shared UM `package.json` and baseline) | B1–B13 as `handle` tests with a fake `AuthRequest`. Plus "every failure branch throws, never returns `err`": `parse` returns `ok` for `undefined`, `null`, a string and an object body. **Mutation:** drop `details.retryAfterSeconds` from the login 429 → B2 red | 110 |
| **U-AUTH-2** | Jini UM | boot-session, local-boot-session; why-comments verbatim | B14–B20. **Mutation:** skip the loopback check → B14 red | 90 |
| **U-AUTH-3** | Jini UM | `/me`, password-status, and the memo with its why-comment | B21–B22. **Mutation:** hoist the memo `Map` to module scope → the per-registration case of B22 red | 80 |
| **U-AUTH-T1** | Tovu | Covered below the table | Covered below the table | 110 |

**U-AUTH-T1 content.**
- `registerAuthRoutes` keeps `:585-608`: the limiter and the owner-* registrations, unchanged. The owner passkey `signedIn` callback (`:601-607`) stays inline with its single `res.json`. The recovery routes and the admin clients `lib/owner-recovery-api.ts` and `lib/owner-passkey-api.ts` are untouched.
- It then mounts the seven specs with `mountJsonRoute` **in the same order and at the same position**, before `requirePublishTrust` / `requireAdminSession` (`default` snapshot lines 47-55).
- Refactor `redeemOwnerBootSession` (`:513-545`) to return `BootRedemption`.
- Delete the seven `register…Route` functions (`:639-875`, about 237 lines).

**U-AUTH-T1 tests first.**
- **New Tovu route tests** on the real `createApp`:
  - B6 and B13 `set-cookie` order;
  - body edge cases: a missing body, a `text/plain` body, malformed JSON and an over-limit body each answer exactly as the base (the host parser's 400 / 413, unchanged);
  - `/API/ADMIN/V1/AUTH/LOGIN` and `/api/admin/v1/auth/login/` both reach login;
  - `HEAD /api/admin/v1/auth/me` → the same status as GET with an empty body;
  - `OPTIONS /api/admin/v1/auth/login` → `Allow` matches the base;
  - a repository throw in boot-session, local-boot-session, me and password-status → the same status, body and headers as the base (OD-2).
- **Must stay green with zero assertion edits:**
  - `apps/website/src/server/inbound/admin-http/__tests__/dev-auth.unit.test.ts`
  - `dev-auth-failures.unit.test.ts`
  - `dev-auth-boot-owner.unit.test.ts`
  - `dev-auth-me-rejection.unit.test.ts`
  - `routes/system/__tests__/credential-copy.tw4.pins.test.ts`
  - `runtime/composition/__tests__/create-app-route-table.pin.test.ts` (with OD-1's 14 rows approved, or OD-1's alternative)
- **Mutation:** mount the auth specs after the session gate → the login tests go red (401).

**Dependencies.**
- U-AUTH-1 needs RT-K1-0.J **at its current tip** (`66310ee7`, refusal at `core/src/errors/route-refusal.ts`) merged into Jini integ, plus SEC-3.
- BX-53/54 (returned-error parity) is **not** a prerequisite, because of the thrown-only rule.
- U-AUTH-1 → 2 → 3 run as one chain, then U-AUTH-T1, which needs OD-1 and OD-2 answered.

---

## 4. Tovu cutover: SEC-T0 (tests first), SEC-T1a, SEC-T1b, SEC-T1c

**Pre (all four):**
- SEC-1…14 merged into Jini integ and rebuilt.
- A-adm-shell-lib-3 merged.
- Linked Jini (`JINI_PACKAGES_DIR=<Jini>/packages node development/scripts/link-jini.mjs`).
- U-AUTH-T1 merged: the `/auth/me` contract (W19) that the grants read.
- OD-4 answered before SEC-T1b/c.

**Count facts (check item 9), verified at `0d7f78fa4`:**
- `features/security` has **39 sources** and **29 test files** (27 tests + 2 fixtures).
- There are **23 direct references** from outside:
  - 7 Deployment source lines;
  - 15 test lines (deployment 8, settings 3, lib 3, plugins 1);
  - the lazy target `panel-pages.ts:54`.
- **36** sources are deleted. **3** are relocated to host with `git mv`: `security-i18n.ts` (D7) and `security-visuals.tsx` (tab glyphs for SEC-1's `tabIcons`) in SEC-T1a, and `copy-keys-dialog.css` in SEC-T1b.

### SEC-T0 — host tests and baseline capture, red first (Tovu, 70 min)

The new host tests are written against the not-yet-existing host files and committed **red**.
- **`integrations/jini-admin/__tests__/security-ports.test.ts`:**
  - grants: `['*']` with `grantsReady` → all;
  - an editor without `admin.security.site-key.manage` → no `admin.security.tokens.manage`;
  - `grantsReady: false` → exactly `['security.read']`;
  - the translator alias and locale;
  - `rootKey` paths are `/system/site-key`, and the import body is `{"siteKey":…}`;
  - `mediaOrder: 'replaced-last'`;
  - the `securityApi` object exposes exactly Tovu's 11 method names (`T:api/security-api.ts:14-115`).
- **`integrations/jini-admin/__tests__/security-panel.test.tsx`** (rendered under `AdminModulesProvider`):
  - **signed-in, grants loading** (`grantsReady={false}`): Access Tokens and the owner controls render, there is no `site-key` tab, and `?tab=site-key` lands on Access Tokens;
  - **signed-in, site-key denied**: the same, after load;
  - **site-key granted**: `/access-tokens?tab=site-key` opens `root-key`, and a tab change writes `?tab=site-key` with `replace`;
  - an unknown tab → Access Tokens;
  - **denied page** (no session grant): the denied notice. The signed-out case is `App.tsx:700` `<Login/>`, tested apart;
  - **owner controls in order** `TotpSettings` → `RecoveryCodesCard` → `PasskeySettings` (`T:Security.tsx:182-184`), with their real components and stub ports:
    - TOTP: enrol shows the secret only inside a private element;
    - passkeys: `navigator.credentials` absent → the unavailable state; a stubbed `runPasskeyCeremony` resolving → one enroll and one confirm call;
    - recovery: issue → ten codes.
- **Wire baseline (sidekick, unmodified tree).**
  - Capture method, path and `JSON.stringify(body)` for W1–W19 using fixture credentials only.
  - Save the capture under `ADS-memory/.local-artifacts/` (scratch). Cookies and response bodies with secrets are redacted before saving.
- **Assertion ledger (deletion gate).** `plans/P9-SEC-T1-ledger.md` lists, for each of the 29 Tovu test files:
  - its `it(`/`test(` count;
  - each title, mapped to its Jini or host destination (file + title) and the step that landed it.

  A row without a destination blocks that file's deletion.

### SEC-T1a — host composition and mount (Tovu, 100 min)

1. **`integrations/jini-admin/security-ports.ts`.**
   - `createSecurityHostPorts({ transport }, { workspaceId = WORKSPACE_ID })` provides:
     - `securityApi` (SecurityApiPort);
     - `otherCredentials`: `createHttpOtherCredentials(…, { mediaLabels, mediaOrder: 'replaced-last' })`;
     - `rootKey`: `createHttpRootKey(…, { path: '/system/site-key', importField: 'siteKey', reveal: true })`.
   - The **host `securityApi` client object** has Tovu's 11 method names. It is composed from `createHttpPublishCredentials` (SEC-8), `createHttpCustomCredentials` (SEC-11) and `createHttpCredentialCopy` (SEC-12). That keeps every `lib/__tests__` and deployment call site, and both `vi.mock` factories (`publish-credentials-dependencies.unit.test.ts:22`, `use-publish-credentials-wired.unit.test.tsx:18`), unchanged apart from their specifiers.
   - It also provides `securitySessionGrants({ permissions }, { grantsReady })` (D6), `createSecurityTranslator`, `describeSecurityError` (`describeApiError` + `translateCredentialMessage`), `refreshSignal` (content-refresh, resource `'access-tokens'`) and `onCredentialsChanged` (`publishContentRefresh`).
2. **`integrations/jini-admin/security-module.hooks.ts`:** `createHostSecurityModule({}, { useAdminLocaleHook })`.
   - It calls `security({ ui: reactModuleUi }, { t, rootKeyTab: { generate: 'hidden', defaultEnvVarName: 'TOVU_SITE_KEY', previewRequired: false }, tabIcons: { 'access-tokens': <AccessTokensIcon size={16}/>, 'root-key': <SiteKeyIcon size={16}/> }, refreshSignal, onCredentialsChanged })`.
   - Its Provider passes `ownerControls`, in today's order:
     - `<TotpSettings port={ownerMfaPort} translate/>`
     - `<RecoveryCodesCard port={ownerRecoveryPort} describeFailure={ownerRecoveryFailure} FailureNotice={ErrorNotice} filename="tovu-owner-recovery-codes.txt" t/>`
     - `<PasskeySettings port={ownerPasskeySettingsPort} translate/>`
   - `SecurityModulePanel({ route })` uses `useModulePanel`.
3. **`modules.hooks.ts`.**
   - Register the security module and binding in `createHostAdminScope` (`:41-42`). Add `securityPorts` / `useSecurityLocaleHook` / `grantsReady` to its existing optional object (`:32`).
   - Set `MODULE_PAGE_PATHS['security.secrets'] = '/access-tokens'` (`:58`).
   - `MODULE_TAB_ALIASES = { 'security.secrets': { 'site-key': 'root-key' } }` is applied inward to `requestedTab` (`:79`) and outward in `onTabChange` (`:73-76`).
   - `useAdminModules` keys on `{ permissions, grantsReady }` (`:44-53`).
4. **`AdminModulesProvider.tsx:8`:** add the `grantsReady` prop. **`App.tsx:737-738`:** pass `grantsReady={permissions !== undefined}`.
5. **Mount.**
   - `panel-pages.ts:54` → `lazy(() => import("./integrations/jini-admin/security-module.hooks").then(m => ({ default: m.SecurityModulePanel })))`.
   - `panels.tsx:1041` → `<Security route={ctx} />`.
   - Unchanged: `id: "access-tokens"` (`:1038`), `allowedQueryParams: {"tab": null}` (`:1040`), and nav "Secrets" / Operations (`:1042-1048`).
6. **Relocations (`git mv`, verbatim).**
   - `T:security-i18n.ts` → `integrations/jini-admin/security-i18n.ts`. The only change is its type import at `:3`: `OtherCredentialStoreInfo` becomes `{ id: OtherStoreId; purposeLabel: string }` from `@jini-ai/admin/security`.
   - `T:security-visuals.tsx` → `integrations/jini-admin/security-visuals.tsx`.
7. **Server pins stay green, untouched:**
   - `routes/system/site-key.ts` (`:239-258` session/workspace/permission guard for every verb `:262-319`) and its tests;
   - `credential-copy.ts` and `__tests__/credential-copy.tw4.pins.test.ts`;
   - the provider-settings project-key-use route tests.

**Result:** SEC-T0's host tests turn green. Old `features/security` still compiles and its 29 tests still run; only the mount moved. **Mutation:** remove the `site-key` alias → `security-panel.test.tsx` goes red.

### SEC-T1b — importer repoints, fixtures, stylesheets (Tovu, 90 min)

**Source repoints (7 lines).**
- These types move to `@jini-ai/admin/security`:
  - `features/deployment/StaticSiteTab.tsx:13`
  - `api/deployment-api.types.ts:1`
  - `hooks/publish-credentials-dependencies.hooks.ts:1`
  - `hooks/publish-credentials-port.hooks.ts:1`
  - `hooks/use-publish-credentials.hooks.ts:6`
  - `rules.ts:2`
- `hooks/publish-credentials-dependencies.hooks.ts:2`: `securityApi` from `@/integrations/jini-admin/security-ports`. The binding name and the uses at `:14-18` are unchanged.

**Test import repoints (15 lines; specifier only, assertions unchanged).**
- deployment:
  - `__tests__/StaticSiteTab.unit.test.tsx:9`
  - `__tests__/rules.unit.test.ts:3`
  - `hooks/__tests__/publish-credentials-dependencies.unit.test.ts:3`, `:20` and `:21` (the `vi.mock` path and the `importOriginal<typeof import(…)>` → `@/integrations/jini-admin/security-ports`; the binding `securityApi` and the factory at `:22` are unchanged)
  - `hooks/__tests__/use-publish-credentials-wired.unit.test.tsx:16-17` (same; `:18` unchanged)
  - `hooks/__tests__/use-publish-credentials.unit.test.tsx:5`
- settings:
  - `__tests__/ai-agent-locales.unit.test.ts:5` (dictionary path)
  - `__tests__/built-in-mcp.unit.test.tsx:7-8`: harness change **OD-4 (ii)**
- lib: `lib/__tests__/api-id-url-encoding.unit.test.ts:3`, `api-request-shapes.clients.ts:24`, `api-system-endpoints.unit.test.ts:4` → `securityApi` from `security-ports`. These request-shape tests passing unchanged proves W1–W10.
- plugins: `features/plugins/__tests__/surface-copy.contract.test.ts:4` (dictionary path).

**Fixture rows and ledgers.**
- `__tests__/unit/admin-route-lazy-loading.unit.test.tsx:44`: OD-4 (iii).
- `hooks/__tests__/content-refresh-coverage.unit.test.ts:59` → `integrations/jini-admin/security-ports.ts`.
- `lib/__tests__/credential-input-autocomplete.unit.test.ts:171,211`: OD-4 (iv).
- `lib/__tests__/fixtures/admin-literal-copy.baseline.json:328-356` (5 entries).
- `development/scripts/error-gate-debt.json:173-213` (9 entries).
- `hardwiring-debt.json:34`.
- `size-debt.json:222-250` (5 entries).
- `apps/website/src/features/deployments/deploy-targets/__tests__/vendor-exceptions.json:44`: drop the `features/security/**` segment.

**Stylesheets (DC-3; check item 1).**
- `styles/access-tokens.css` and `styles/site-key.css`: re-target to the Jini `jini-*` / `data-jini-part` selectors; they are still imported at `main.tsx:29-30`.
- `T:copy-keys-dialog.css` (5 rules, imported at `T:CopyKeysDialog.tsx:6`) → `git mv` to `styles/copy-keys-dialog.css`, re-targeted to SEC-12's `data-jini-part="security.shared-keys.*"`, and imported in `main.tsx` after `:30`.
- `native-domain-dialogs.css` (`T:CopyKeysDialog.tsx:5`) stays imported by the host.
- CSS tests: the selector operands are OD-4 (i):
  - `access-tokens-chips-css.unit.test.ts:26-28` uses `.access-tokens-row > .field` and `.access-tokens-row > .save-warning`;
  - `selection-ring-css.unit.test.ts:107` uses `.access-tokens-category-filter-item[aria-selected="true"]`.
  - The file paths in `:12` and `:106` are unchanged.
- STOP if a selector has no Jini DOM equivalent.

**Path text.** These are re-pointed in the same commit:
- `features/observability/observability-i18n.ts:6`: "Same shape as `integrations/jini-admin/security-i18n.ts`".
- `features/settings/SettingsUi.tsx:52`.
- `styles/access-tokens.css:2`, `styles/site-key.css:2`.
- `apps/website/src/contracts/core/custom-credential-categories.ts:2`.
- `apps/website/src/features/custom-credentials/custom-credential-create-ui.ts:61`.
- `development/e2e/journeys/deployment.pins.journey.ts:276`.
- `development/todos.md:570`.

`development/refactor-patterns/dedupe/dedupe-04.terra-prompt.md:33,46,170` is a historical prompt and is left unchanged; note this in the report.

### SEC-T1c — ledger-gated deletion and linked verification (Tovu, 60 min)

1. **Ledger gate.** Re-run the ledger count.
   - Delete a Tovu test file only when every title has a landed destination.
   - The total of destination tests must be ≥ the deleted titles. Report both numbers.
2. **Host type repoints** (SEC-3): `lib/owner-recovery-api.ts:8-14`, `features/auth/OwnerRecoverySignIn.hooks.ts:3`, `features/auth/OwnerRecoverySignIn.tsx:5`.
3. **Delete 36 sources:**
   - `AccessTokensTab.hooks.tsx`, `AccessTokensTab.tsx`, `CopyKeysDialog.tsx`
   - `OtherCredentialsSection.hooks.tsx`, `OtherCredentialsSection.tsx`
   - `RecoveryCodesCard.hooks.ts`, `RecoveryCodesCard.tsx`
   - `Security.hooks.ts`, `Security.tsx`
   - `SiteKeyRecoveryCard.tsx`, `SiteKeyTab.hooks.tsx`, `SiteKeyTab.tsx`
   - `access-token-forms.ts`, `access-token-providers.ts`, `access-token-rows.ts`
   - `custom-credential-forms.ts`, `other-credential-stores.ts`, `rules.ts`, `index.ts`
   - `api/security-api.ts`, `api/security-api.types.ts`
   - `hooks/{access-tokens-dependencies,access-tokens-port,other-credentials-dependencies,other-credentials-port,security-permissions-dependencies,security-permissions-port,site-key-dependencies,site-key-port}.hooks.ts`
   - `hooks/site-key-status.rules.ts`
   - `hooks/{use-access-tokens,use-copy-keys,use-other-credentials,use-security-permissions,use-site-key-recovery,use-site-key}.hooks.ts`

   That is 36 deleted + 3 relocated (2 in T1a, `copy-keys-dialog.css` in T1b) = 39. No re-export shell is left.
4. **Delete 29 test files per the map below.** Relocated tests are `git mv`'d with import-line edits only.
5. **Gates and live check.**
   - Gates: the §1 T-step gates; no new boundary, size, complexity or hooks lines.
   - Live check (sidekick): linked Jini; both tabs and the owner controls render; the network capture matches SEC-T0's baseline for W1–W19 (method, path, body).

### Test map (29 files: full paths under `T:`, destination step)

| Tovu test (path under `apps/admin/src/features/security/`) | destination |
|---|---|
| `__tests__/Security.unit.test.tsx` | SEC-1 + host `security-panel.test.tsx` (SEC-T0) |
| `__tests__/use-security-permissions.unit.test.tsx` | SEC-1 + host `security-ports.test.ts` |
| `hooks/__tests__/security-permissions-dependencies.unit.test.tsx` | host `security-ports.test.ts` (`/auth/me` grants) |
| `__tests__/RecoveryCodesCard.unit.test.tsx` | SEC-3 |
| `hooks/__tests__/site-key-dependencies.unit.test.ts` | SEC-4 |
| `__tests__/SiteKeyTab.unit.test.tsx` | SEC-5 (status, badge, notes) / SEC-6 (reveal) |
| `__tests__/site-key-status.rules.unit.test.ts` | SEC-5 |
| `__tests__/site-key-generate-error.unit.test.ts` | SEC-5 |
| `__tests__/SiteKeyTab.agent-secrecy.unit.test.tsx` | SEC-6 |
| `__tests__/use-site-key.unit.test.tsx` | SEC-6 |
| `__tests__/use-site-key-recovery.unit.test.ts` | SEC-7 |
| `__tests__/SiteKeyRecoveryCard.unit.test.tsx` | SEC-7 |
| `hooks/__tests__/access-tokens-dependencies.unit.test.ts` | SEC-8 (publish) / SEC-9 (catalogs) |
| `__tests__/rules.unit.test.ts` | SEC-9 (+ SEC-10/11 sections) |
| `__tests__/AccessTokensTab.unit.test.tsx` | SEC-9 |
| `__tests__/security-visuals.unit.test.tsx` | relocated with `security-visuals.tsx` (host; import line only) |
| `__tests__/AccessTokensTab.credential-flows.unit.test.tsx` | SEC-10 / SEC-11 / SEC-12 by section |
| `__tests__/AccessTokensTab.hooks.unit.test.tsx` | SEC-10 |
| `__tests__/access-tokens-revoke-copy.unit.test.tsx` | SEC-10 |
| `__tests__/access-token-providers.fixture.ts` (fixture) | SEC-10 (copied as a Jini fixture) |
| `__tests__/CopyKeysDialog.unit.test.tsx` | SEC-12 |
| `hooks/__tests__/use-copy-keys.unit.test.tsx` | SEC-12 |
| `__tests__/copy-keys.fixture.ts` (fixture) | SEC-12 |
| `__tests__/OtherCredentialsSection.unit.test.tsx` | SEC-13 |
| `hooks/__tests__/use-other-credentials.unit.test.tsx` | SEC-13 (incl. the `builtIn` row at `:131`) |
| `hooks/__tests__/other-credentials-dependencies.unit.test.ts` | SEC-13 |
| `hooks/__tests__/use-access-tokens.unit.test.tsx` | SEC-9 / SEC-11 / SEC-12 / SEC-14 by section |
| `__tests__/security-i18n.unit.test.ts` | relocated with `security-i18n.ts` (host; import line only) |
| `__tests__/site-key-copy.i18n.unit.test.tsx` | host translator test if it imports only the dictionary; otherwise its rendering assertions go to SEC-5 (ledger decides) |

---

## 5. Order, prerequisites and parallelism

**Prerequisites that are not SEC steps.** There is no "start immediately" list. Each step starts when its row is satisfied.

| prerequisite | needed by | state at plan time |
|---|---|---|
| SEC-IDX (docs) | all SEC dispatch | this plan |
| OD-3 (a) / (b) / (c) / (d) | SEC-6 / SEC-8 / SEC-12 / SEC-14 | open |
| OD-1, OD-2 | U-AUTH-T1 | open |
| OD-4, OD-5 | SEC-T1b/c; SEC-6/7 | open |
| **K4-seam-5.J** (`CredentialTokenHint` → core) | SEC-8 | sheet exists (`plans/P9-steps/K4-seam-5.md`), not landed |
| **RT-K1-0.J at `66310ee7`** merged into Jini integ | U-AUTH-1 | on its branch, not in integ `7c4ee7881` |
| **A-K2-0a.chip**: kit `ChipField` slot (props mirror Tovu's `OnboardingChipField` use at `T:AccessTokensTab.tsx:668-683`), facade in `kit.tsx`, Tovu `jini-kits.ts` implementation | SEC-10, SEC-11 | **missing**: not on integ or `44ee815e`; misfiled as 0c at `k2-kit-gaps.md:149`. Owner of the A-K2 lane adds it |
| A-adm-shell-lib-3 | SEC-T1a | per P9 |

**Lanes.**
```
Lane A root key   : SEC-4 ──► SEC-5 ──► SEC-6 [OD-3a] ──► SEC-7
Lane B credentials: (SEC-4) ──► SEC-8 [K4-seam-5.J, OD-3b] ──► SEC-9 ──► SEC-10 [chip] ──► SEC-11 ──► SEC-12 [OD-3c] ──► SEC-13 ──┐
Lane C page       : SEC-IDX ──► SEC-1 ──► SEC-2 ─────────────────────────────────────────────────── SEC-14 [OD-3d] ──► SEC-T0 ► T1a ► T1b ► T1c
Lane D users      : SEC-3 ──► U-AUTH-1 [RT-K1-0.J] ──► U-AUTH-2 ──► U-AUTH-3 ──► U-AUTH-T1 [OD-1, OD-2] ──────────────────────┘
SEC-5 and SEC-9 also wait for SEC-1.
```

- **The only step ready with no open prerequisite is SEC-4** (Codex READY).
  - SEC-IDX is docs.
  - SEC-1 follows SEC-IDX.
  - SEC-3 has no dependency.
- **Serialisation added in v2:**
  - SEC-4 → SEC-8: both edit `adapters/http.ts` and `adapters/memory.ts`.
  - SEC-3 → U-AUTH-1: both edit UM `package.json` metadata and the api-baseline.
- **Critical path** (lane B from SEC-8, then SEC-14 and the T steps): 105 + 110 + 105 + 110 + 120 + 110 + 95 + 70 + 100 + 90 + 60 ≈ **1,065 min**, plus external waits for K4-seam-5.J, the chip slot and the OD answers.

## 6. Files left after each step

| after | Tovu `features/security` sources / tests | Tovu `dev-auth.ts` lines | new Jini files |
|---|---|---|---|
| SEC-1…14, U-AUTH-1…3 | 39 / 29 | 876 | as v1, plus SEC-8 `wire.types.ts`, SEC-12's three files, SEC-13 `OtherCredentialRow.tsx`, UM `admin-http/auth/*.ts` (8), UM `react/auth/RecoveryCodesCard{,.hooks}.ts(x)` |
| U-AUTH-T1 | 39 / 29 | ≈ 640 | — |
| SEC-T0, SEC-T1a | 37 / 29 (2 relocated to `integrations/jini-admin/`) | ≈ 640 | — |
| SEC-T1b | 36 / 29 (`copy-keys-dialog.css` → `styles/`) | ≈ 640 | — |
| **SEC-T1c** | **0 / 0** | ≈ 640 | — |

## 7. Codex verification checklist (v2)

1. Each OWNER DECISION is the smallest option, and no step past its gate needs an unanswered OD.
2. §3.2: does `authenticate` → `AuthRequest` through `res.req` express every header and cookie need without a Jini change? Is the thrown-only rule enough at `7c4ee7881`?
3. The B1–B22 pins against `DA:641-875`.
4. The D6 `grantsReady` path: `App.tsx:738` → `AdminModulesProvider.tsx:8` → `modules.hooks.ts:44-53`.
5. The 23 references, 29 test paths, 36 + 3 source accounting and the OD-4 list.
6. Every v1 step not restated in v2 (SEC-4, SEC-9) is unchanged, and its dependencies are updated in §5.
