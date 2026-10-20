# google-workspace cloud build — progress

Status: CANCELLED by the owner (2026-10-20, during G16). All subagents stopped; nothing further dispatched; no further tests run.

## Step 0 / base
- cloud-proof: `4db891f3 cloud-proof: Linux vm /home/user/Tovu google-workspace` (Linux vm 6.18.44, 2026-10-20 05:16 UTC)
- Base check OK: form-destinations/registry.ts + agent-plugins/connect-tool.ts present on origin/restructure/apps-website-phased.
- `origin/cloud/forms-multidest`: does NOT exist (ls-remote empty) at start. G14 will build against the brief contract unless it appears.
- Jini proof pushed on `cloud/google-workspace` (from origin/general-work).

## Resume log
- 2026-10-20 06:18Z: fresh coordinator resumed (previous coordinator + subagents died at 05:46Z on account usage limit). Container is new: Node 24.22.0 re-installed to ~/.local/node24, AI-Dev-Shop re-cloned, Jini + Tovu re-installed/built, worktrees recreated. Coordinator re-loaded software-architect, code-inspection, security skills.md.
- Pushed lot work found at resume: Jini `cloud/google-workspace-G6` 00b05e13 (platform `api-connection` vault kind); Tovu `cloud/google-workspace-G8` 3cd9d157 (AgentPluginDetailsModal characterization pins); G7: nothing pushed. Fresh subagents continue from those branches.

## Personas
- Coordinator loaded: software-architect, code-inspection, security skills.md (all three).

## Setup (timings)
- Node: container had v22.22.0; installed v24.22.0 tarball into ~/.local/node24 (4 s). PATH must be exported per command (profile edits blocked).
- Jini: pnpm install 16 s; `pnpm --no-bail -r build` 95 s, only integrations' own test files fail tsc (known), dist emitted for all packages. Push to AINSEP/Jini works.
- Tovu: npm ci root 17 s, admin + site-chat ci OK; link:jini OK (57 links); @tovu/sdk build 1 s.
- Jini worktrees ../wt-j-G1..G5 created (install offline OK, dist copied).

## Seams reused (coordinator recon)
- `@jini-ai/oauth`: beginAuthorizationCode/completeAuthorizationCode (PKCE, extra params), createTokenRefresher (lease-aware), OAuthTokenStore port.
- Contract between G1 and G2 (parallel): G1 token storage port = `OAuthTokenStore & { delete({key}) }` keyed by opaque connection key; G1 owns a connection-record port holding status/account/credential generation; G2's vault store takes an injected fence reader (generation) and refuses stale persists.

## Lots
| Lot | Status | Branch | Merged SHA | Notes |
|---|---|---|---|---|
| G1 | MERGED | cloud/google-workspace-G1 (Jini) | merge + 1 coord test-typing fix (pushed) | api-connections service; 44 tests; cx ≤9; package.json conflict with G2 resolved; token-store re-exported from entry |
| G2 | MERGED | cloud/google-workspace-G2 (Jini) | 70145356 | vault token store in integrations/api-connections/token-store; 17 tests; cx max 9; tsc clean (excl. known integrations test errors); guard 26 = base |
| G3 | MERGED | cloud/google-workspace-G3 (Jini) | 00a1b4cb | @jini-ai/oauth/loopback-receiver; oauth suite 313/313; cx max 9; 1 RED survivor (!consumed gap guard) → phase C |
| G4 | MERGED | cloud/google-workspace-G4 (Jini) | pushed | agent-plugins/lifecycle/tools; 16 tests + 7 char pins; cx ≤9; plugins suite 442/443 — the 1 failure (install.unit 'lock creation rethrows faults') is env (runs as root), untouched file |
| G5 | MERGED | cloud/google-workspace-G5 (Jini) | pushed | agent-plugins/admin-surfaces (+/client); 70 tests; 31 RED checks; cx ≤9 |
| G6 | MERGED bd7911055 (incl. G6b wiring) | cloud/google-workspace-G6 (6ed229ec7) | bd7911055 | G6b: clientKind, fenced install (workaround removed), unique vault labels, desktop loopback http allowed desktop-only (real bug found), composition in deps/app/agent-plugin-connections.ts, callback GET /api/agent-plugins/connections/oauth/callback, executable-tool host ports + G5b handler host wired; one 240/min limiter profile (plugin budgets TODO). Coord verify: 94 tests pass (forms-admin base fail only), root tsc/typecheck:tests 0, inventory OK, boundaries 1070 (=post-G8), cx unchanged vs base on touched fns, vendor clean. Coverage (subagent): handlers 100/71/80, agent-plugin-connections 100/64/100, host 99/78/95 (phase C). G6b subagent hit 307k tokens (over the 300k ceiling — recorded). Untracked test artifacts (chat.db, sites/tovu-dev/agent-plugins/) left in wt-G6. |
| G7 | MERGED 3987044d4 | cloud/google-workspace-G7 (c951d4204 fix: daemon-catalog test harness binds surfaceExchanges) | 3987044d4 | importers 643/643, root tsc 0, typecheck:tests 0, inventory OK, boundaries 1069=base, architecture same 3 hard fails as base (API surface 660→661). Coord coverage: register 87.7/80/87.5, approval 79.7/66.7/100, host-capabilities 78.5/90/90 (phase C). cx: new ≤9; touched pre-existing fns unchanged vs base. |
| G8 | MERGED 02c8b43ce | cloud/google-workspace-G8 (fixes f64cf5e3c route pin, d8cc64d43 i18n 21 locales, ec280be35 non-array listing) | 02c8b43ce | website importers 104/105 (forms-admin route pin = base failure), admin plugins+assistant 396/396, AgentPlugins 12/12, root+admin tsc 0, cx ≤7, vendor clean; boundaries 1070 (+1: new test deep-imports platform/site-dir test helper, same as existing tests — phase B), architecture API surface →663. |
| G1b | MERGED (Jini 3f0cfe90) | cloud/google-workspace-G1b (549d7d87) | 3f0cfe90 | fenced token-store install() (no lease) for install/stageSwitch; explicit clientKind dep; vault label=key (fixed G2 bug: staged switch always collided). api-connections 60 tests pass, tsc no new errors, guard 26, cx clean. |
| G5b | MERGED (Jini b633dd94) | cloud/google-workspace-G5b (ca28a268) | b633dd94 | createAdminSurfaceHandlerHost + defineAdminSurfaceHandlerContribution (same trust gate as G4). agent-plugins 49 files pass, tsc 0, guard 26; added lifecycle/contribution-loader.ts + tools/capabilities.ts to jini.isolation.shared (no runtime imports; accepted, phase B review). Jini integrations + agent-plugins rebuilt 07:20. |
| G7fix | MERGED | cloud/google-workspace-G7fix (40d03af7f) | merged | daemon tool-surface harness binds the real confirmation-card store; process-root-parity + federation wiring 17/17 |
| G9 | MERGED (Jini + Tovu) | cloud/google-workspace-G9 (Jini 7dc81d61; Tovu 0af7bd9e7) | merged | ZERO non-test edits, no seam bug: acme-office e2e connect→fake OAuth→callback→vault (sealed)→approved write tool→surface action→push form delivery via OAuth connectionRef. Grep tests: Jini 137 files 0 hits; Tovu 6 folders + 10 files, 2 allowlisted lines federate-mcp.ts:20,:99 ('picker' = MCP tool list). Coord: Jini test 2/2, guard 26; Tovu 19/19, typecheck:tests 0. Gap: Tovu FormDestinationModule.deliver lacks binding/idempotencyKey + returns void (G14/forms-multidest F4). |
| G10 | MERGED | cloud/google-workspace-G10 (44c4c6377) | merged | plugin skeleton seeded DISABLED (not in BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED; gating test updated). Coord: 21/21 oauth pins, 74 plugin/bundled suites 1140/1140, cx clean, no secret-shaped literals. Hosted redirectOrigins left empty on purpose (owner registers). Coverage (subagent): auth 100/100, request-policy 35/75 … phase C. Subagent 289k tokens. |
| G11 | done, merged into G12 branch | cloud/google-workspace-G11 (dc344e37d) | via G12 | 15 tools + lib/sheets-client.mjs; 20 security pins + 16 char pins; cx ≤7. Direct merge into coordinator conflicted with G13 (README, drive-files) → integration on G12 branch. Findings: USER_ENTERED selectable (formula injection if assistant picks it); card lines carry caller text (G12 confirmed card escapes); sheets_copy no source MIME check. |
| G12 | MERGED with G11 336badb3f | cloud/google-workspace-G12 (0c4c1797e) | 336badb3f | integration: deduped DRIVE_FILES_URL/SHEETS_API/SPREADSHEET_MIME_TYPE, pathSegment everywhere ids enter paths, wrong-file-type folded into not-a-spreadsheet; budget refusal → quota-delay (retryAfterMs, not-applied, capRetryAfterMs) + 6 pins; neutrality allowlist for gating test lines. Coord: plugin 132/132 (tsx), website plugin/bundled/api-connections suites 1136/1136, cx clean, no secret-shaped literals, no plugin→Tovu imports outside tests. |
| G13 | PARTIAL MERGED (selection verification only) | cloud/google-workspace-G13 (988b28b37) | merged | lib/picker-selection.mjs (server-side verification: id safety, account match, MIME, real Sheets access; 27 security pins), +2 safe codes. Panel + Picker BLOCKED on seams (a) no connection status/actions in handler capabilities, (b) no connection ids in handler context, (c) Tovu connect.ts drops startParams + callbackFields, (d) no plugin state, (e) no public config → G5c (Jini ports) → G6d (Tovu adapters) → G13b (UI). Coord: plugin tests 64/64, cx clean. |
| G5c | MERGED (Jini d8ac6c49, not yet in dist) | cloud/google-workspace-G5c (993276f5) | d8ac6c49 | AdminSurfaceCapabilitiesPort: connections {getAccessToken({connectionId}), status, begin→authorizationUrl, confirm/cancelSwitch, disconnect→revocation, takeCallbackFields once-only}, state (caps, token scan), publicConfig (declared names, secret-name denylist); context.connectionIds. BREAKING: surface getAccessToken takes connectionId. Coord: agent-plugins 52 files 596 pass/2 skipped (skips pre-existing), tsc 0, guard 26, cx ≤9. Host duties: open authorizationUrl from host page (frame has no allow-popups); attemptId from OAuth-state digest; key state by plugin+workspace; inbox in-process only. |
| G5d | MERGED (Jini 394b7134; dist rebuilt 09:54Z with G1c+G5c) | cloud/google-workspace-G5d (6873d082) | 394b7134 | tools get read-only state.get (same store/scope as surface state); 612 pass, tsc 0, guard 26. Note: b8235fde (pins-first commit) does not typecheck on its own. |
| G6d | MERGED | cloud/google-workspace-G6d (412b84023) | merged | surface capability port (connections/state/publicConfig), plugin state store on api-connection vault kind (no migration), public-config allowlist (only …_APP_ID/_CLIENT_ID/_BROWSER_KEY/_PUBLIC_KEY), startParams + callback-field inbox deposit, per-request issued sign-in link registry + host-page opening (hosted new tab / desktop system browser), apiOrigins on connections, revoke pin flipped + invalid_token treated as revoked. Coord: root/tests/admin tsc 0, 4566 importer tests pass — 10 fails all Postgres-only or base (vault-hot-path 2 also fail on base), plugin 158/158, admin plugins 398/398, cx ≤9 (2 recorded debt). Subagent 347k tokens (OVER ceiling). Needs Chrome: 'Continue to sign-in' link hosted + desktop. |
| B2 | MERGED 3e342ab50 | cloud/google-workspace-B2 (98a43d845) | 3e342ab50 | start.state for loopback, Jini attemptId for callback fields, workspaceId on ref ops, vocabulary pass-through, per-generation token memory wired, desktop cancel-previous listener, expired staged switch label hidden, account-unchanged callback copy; plugin tovu-connections.json scopeSets/apiOrigins/publicConfig. Findings: (i) token memory per projection/per surface not per plugin → B1b; (ii) begin() URL carries OAuth state (Jini contract); (iii) desktop surface sign-in failure after browser opens only logged → B3. |
| B3p | MERGED | cloud/google-workspace-B3p (86293541c) | merged | H2 product gating (off until products.sheets===true), M2 CSV ' prefix, M5 developer-metadata column markers + duplicate-id review note, M6 plugin limiter removed, M7 sortSpecs dropped from basic_filter, L1–L4/L6/L7 trims. Coord (B2+B3p): plugin 177/177, website suites 1127/1127, tsc + typecheck:tests 0, cx clean. M5 marker lookup needs one live Sheets API check (owner). Subagent 337k tokens (over ceiling). |
| B1b | MERGED (Jini; dist NOT rebuilt yet — breaking) | cloud/google-workspace-B1b (23ef939c) | merged | createIssuedTokenMemories per pluginId (not per generation: Node module cache outlives re-sync) shared by tools+surfaces; L4 options removed (loopback path, contribution, expectedOrigin, inbox/bootstrap ttl); explicit barrels. Tovu must pass ONE issuedTokens to projection + surface host (register.ts:89, admin-surfaces/handlers.ts:45, plugin sheets-tools.security test). Coord: oauth 314, integrations 948, agent-plugins 624; tsc 0; guard 26. |
| G6c | MERGED 72ee3106e | cloud/google-workspace-G6c (47c7f06d6) | 72ee3106e | budgets on tovu-connections.json connections, charged in host accessTokensFor after ownership check (one token read per request) via real limiter; clamp to host max; refusal rate-limited/retryable/retryAfterMs/not-applied; per-process (documented). Plugin: 45/min per account, 240/min instance. Coord: api-connections tests 27/28 (only the G10 vendor-neutrality allowlist gap), plugin 64/64, tsc + typecheck:tests 0, cx unchanged (2 recorded debt fns at 10). |
| G1c | MERGED (Jini, not yet rebuilt into dist) | cloud/google-workspace-G1c (170bcb53) | merged | fence → tokens.loadForRevocation (generation-agnostic, owner-checked, hook-only) → revoke hook → delete only after success; failure = revocation-pending + disabled credential kept, disconnect again retries; staged slot revoked too; new start refused while switch staged (switch-in-progress); confirmed switch does NOT revoke old account's grant (previousAccountRevocation 'not-attempted'). Coord: 78/78, tsc no new errors, guard 26, cx ≤9. Tovu follow-up (G6d): flip plugin oauth.contract.test.mjs:266-267 pin to confirmed + /revoke called; plugin revoke hook must treat 'already revoked' as success. |
| G14 | MERGED | cloud/google-workspace-G14 (19e4a99b9) | merged | sheets/mapping/dedupe/delivery-result; 24 contract pins, 28 RED; cx ≤8; plugin 156/156. Choices: product off → adapter-unavailable retryable (bounded by outbox 8 attempts); reconnect → authorization-required not retryable (no manual redeliver in forms-multidest → reconnect doesn't resume); adapter doesn't create tabs (config names sheetId). Findings: sheet editors can plant a submission id to suppress delivery (inherent, documented); no 1 MiB append check; OAuth port baseUrl '' → G6d. G14b owed. |
| B1 | MERGED (Jini 1a541945; oauth rebuilt, integrations/agent-plugins NOT yet rebuilt — breaking for Tovu; rebuild after G6d) | cloud/google-workspace-B1 (b7629649) | 1a541945 | H1, M1–M7, L1–L3, L5–L12 fixed with pins; L4 + explicit-barrel export trim NOT done (→ B1b). Shape changes for Tovu (B2): start.state+attemptId, complete.attemptId; ref ops take {connectionRef, workspaceId}; no service.connectionRefFor/readGeneration (use deriveApiConnectionKey/createApiConnectionGenerationReader); switch result = status view; codes account-unchanged, offline-access-required; surface status.state→status, revocation confirmed|pending|not-needed, ADMIN_SURFACE_ACTION_INTENTS; capability sessions take required `issued`; oauth ./loopback-receiver subpath removed. Coord: oauth 314, integrations 947/948 → 105/105 api-connections after oauth rebuild, agent-plugins 618; tsc 0 new; guard 26; cx unchanged vs base (authorization-code begin 15 / complete 10 pre-existing). Subagent 333k tokens (over ceiling). |
| B3 | MERGED | cloud/google-workspace-B3 (e1fa2fc51) | merged | H1 connect returns {status, connectionRef}; H4 hosted sign-in fails closed unless origin in TOVU_API_CONNECTION_CALLBACK_ORIGINS or client redirectOrigins; M1 plugin tool+surface HTTP limited to declared apiOrigins; M4 form port expectedAccountId + per-request getAccessToken (unwired); L5/L6 trims. Coord: plugin 221/221, website suites 1192/1192, tsc + typecheck:tests 0, cx unchanged. Not done (Jini needed → B5j items 3–4): M3 artifacts optional, B2(iii) lastSignInAttempt. Open: (a) connection HOOKS still get unscoped guarded HTTP (→ B4); (b) hosted without callback origins also refuses token reads (documented); coverage recipe not run (phase C). |
| G13b | MERGED | cloud/google-workspace-G13b (6e7b0a3ce) | merged | 3 surfaces (connection panel, picker, destination panel) + handler modules + lib/{surface-actions,picker-flow,form-destination-settings}; 44 surface pins; CSP pinned by exact equality; no allow-same-origin/unsafe-inline. Coord: plugin 221/221, website plugin suites 1102/1102, cx clean. Findings → B5: (a) surface context lacks hosted/desktop runtime signal (panel infers from Picker config); (b) frame cannot open the account-access page (needs host link opener for declared origins); (c) HIGH-RISK unverified: JS Picker inside opaque-origin sandbox may need setOrigin + inline styles blocked by CSP (Chrome check); (d) desktop Picker re-consent requests only Sheets scope set (future products would drop scopes); (e) frozen-job account freeze must be enforced by host forms ledger (G14b/B3 M4); (f) withSurfaceFailures passes host error messages through. Subagent 311k tokens (over ceiling). |
| B5j | MERGED (Jini; dist rebuilt) | cloud/google-workspace-B5j (18dcf002) | merged | hostKind (host-required), linkOrigins + open-link protocol + openAdminSurfaceLink, artifacts optional, lastSignInAttempt in status. Coord: agent-plugins 671 pass, tsc 0, guard 26, cx clean. |
| B6 | MERGED | cloud/google-workspace-B6 (643844b23) | merged | one issued-token memory at the composition root for tools+surfaces; hostKind from api-connection runtime; lastSignInAttempts; artifacts omitted → export_csv refuses up front (export-unavailable); admin mount open-link (noopener,noreferrer; desktop → system browser); panel 'Open Google Account page'; Picker mode from hostKind (+ picker-not-configured). Needs Chrome: account-page button/open-link hosted + desktop. |
| B4 | MERGED 0aed1073b (coord resolved host.ts union conflict with B6) | cloud/google-workspace-B4 (01128c76b) | 0aed1073b | BYO client = custom credential labelled '<pluginId>/<connectionId> OAuth client' via existing secure capture (Access Tokens / chat custom_credential_create card); base URL must be the token-endpoint origin; client change → reconnect-required (durable, CAS); no fallback to Tovu client when BYO unusable; hook HTTP limited to apiOrigins + token endpoint origin. Finding: BYO secret is a normal custom credential so the agent's credentialed-request tool could send it — only to the token endpoint origin (Medium-Low, G15). Coord (B6+B4): plugin 224/224, website suites 2208/2208, admin plugins 402/402, root/tests/admin tsc 0, cx clean. |
| C1 | MERGED (Jini) | cloud/google-workspace-C1 (02ff476d) | merged | tests 106→282, no prod change; coord coverage run over src/api-connections: All files 100/100/100/100 (281 tests in dir). 178 RED mutants, 176 killed; 1 survivor = observeLoad 60 s memory filter (duplicate of takeRecentLoads filter, memory only). Platform changed lines covered. |
| C2 | MERGED (Jini) | cloud/google-workspace-C2 (aa74049c) | merged | oauth 314→365, agent-plugins scope 254→486; coord coverage: agent-plugins admin-surfaces + lifecycle/tools All 100/100/100/100 (903 pass), oauth loopback-* All 100/100/100/100 (365 pass). ~200 RED; 2 unobservable breaks noted. Prod: dropped unreachable `|| '#'` (projection) and resolveReady placeholder (surface-client), pinned. authorization-code begin/complete 15/10 pre-existing. Subagent 330k tokens (over ceiling). |
| C3 | MERGED | cloud/google-workspace-C3 (b89869156) | merged | tests 100→204; coord coverage: every api-connections/*.ts file 100 branch / 100 func (159 tests via all importers); artifact lines listed in report. 148 RED all killed. REAL BUG fixed test-first: hosted connect built the service before start → raw ApiConnectionError escaped ToolInputError mapping. Unreachable `?? Promise.resolve(null)` removed (pinned). Subagent 354k tokens (over ceiling). |
| C5b | MERGED | cloud/google-workspace-C5b (0141dc822) | merged | init*Panel({window,document}) exports; 4 REAL UI bugs fixed test-first (stale sign-in notice; cached failed Picker script; unhandled list-picked rejection; destination panel without bootstrap); 2 unreachable fallbacks removed (pinned). Coord: plugin 574/574, all 5 ui scripts 100/100/100, cx clean. Reported (not fixed): destination-panel overwrites 'link expired' text; picker-flow promise never settles if onload without gapi; buttons enabled during sign-in poll → parallel poll. |
| C4 | PARTIAL MERGED | cloud/google-workspace-C4 (868133dab) | merged | +79 tests; executable-tools approval/host-capabilities 100/100, register 95.45 (unreachable !owner approval guard kept), admin-surfaces capabilities/handlers/issued-sign-ins/public-config/same-origin/surfaces + routes admin-surfaces/files/modules 100/100; 52 RED (51 killed; same-origin !host redundant, kept). Prod: dropped unreachable `?? ""` on route params + `req.body ?? {}` (Express/requireAdminSession guarantees, pinned). Coord: 117/118 (forms-admin base), tsc 0. Finding: Jini pluginToolIdFor '-'→'_' collision ('a-b' vs 'a_b') → G15. Subagent 279k tokens. |
| C4b | done (merged via C4c) | cloud/google-workspace-C4b (9fd6273d4) | via C4c | +~30 tests: connect-tool API branch, executable-tools composition, approval-policy, daemon wiring pin, byok/mcp-ui/assistant-policy; changed lines fully covered (tool-approval-policy:48 suspected v8 artifact, both arms RED-proven); no-timeout security test. Its '(reported, not fixed)' connect.ts pin is obsolete (C3 fixed the bug) → flipped in C4c. |
| C4c | MERGED | cloud/google-workspace-C4c (6b7601c4e) | merged | C4b merged in; obsolete pin flipped to the fixed ToolInputError; admin UI: AgentPluginSurfaceFrame, use-admin-surface-frame, use-agent-plugin-surfaces, deps hooks, DetailsModal diff all 100/100/100/100; 36 RED all killed (12 security). Tool-id collision UNREACHABLE (Jini plugin id rule ^[a-z0-9]+(?:[-.][a-z0-9]+)*$ has no '_'), id rule pinned. Note: ids may contain '.' and reach 132 chars → provider tool-name rules (^[a-zA-Z0-9_-]{1,64}$) may reject (G15). Coord: website 134/134, admin plugins 423/423, typecheck:tests 0. |
| G14b | MERGED 83444526a | cloud/google-workspace-G14b (00b08005d) | 83444526a | forms-multidest merged into Tovu (3 migration-registration conflicts, 0019 then 0020, checksums unchanged); additive changes to forms-multidest files (port optional {binding}, credential getAccessToken?, deliver optional {state}, FormDestinationPluginState); composition/form-delivery-deliverer.ts (OAuth port first, custom-credential fallback); frozen account = binding.config.accountId; REAL BUG fixed: additionalHosts were bare hosts vs kit exact-origin compare. e2e acme 6/6 + Google 4/4 (append, dedupe on replay, product-off pause then deliver, invalid_grant → authorization-required kept, account switch refused). Coord: 4976 tests in 300+ affected files → only failures are 9 `.postgres.test.ts` files (no Postgres server); plugin 578/578; root/tests tsc 0; inventory OK; boundaries merged 1073 (+4 all isolated-catalog-home test imports, G14b adds 0). Subagent 370k tokens (over ceiling). Seam gap → G14cj (Jini deliveryBindings port) + G14c (Tovu adapter + panel). |
| G14cj | MERGED (Jini; dist rebuilt) | cloud/google-workspace-G14cj (bea74cb0) | merged | deliveryBindings port (list/save/remove; surfaces declare deliveryAdapters); coord: admin-surfaces 100/100/100/100 (953 pass), tsc 0, guard 26, Tovu tsc 0. Host duties: refuse foreign adapters, map connectionId→ref, re-check ownership in write (TOCTOU), delivery-time plugin enablement. |
| G14c | MERGED | cloud/google-workspace-G14c (e4922fcfc) | merged | admin-surfaces/delivery-bindings.ts host adapter over forms-multidest readFormDeliveryBindings/writeFormDeliveryBindings (no second store): own-adapter + own-connection filter, connectionId→ref, slug→form row id, ownership re-check inside write; disabled plugin → adapter-unavailable retryable (active-only registry per attempt). Plugin destination panel saves real bindings (copy-config workaround removed). Coord: 429 website + 584 plugin pass, tsc 0. Reported: core.forms/deliveryBindings whole-list RMW without CAS (forms-multidest-owned; race can drop/resurrect a binding). Subagent 367k tokens (over ceiling). |
| G16j | MERGED (Jini; dist rebuild pending until G15 Tovu half finishes) | cloud/google-workspace-G16j (434e56aa) | merged | F1 browserBinding (start returns host-only value; attempt stores hash; complete compares constant-time; Tovu must set HttpOnly Secure SameSite=Lax cookie on the callback path), F2 renewability both client kinds + forceConsentParams, F4 re-read after token, F5 fail-closed deep error scan, F6 affected-resources scanned, F7 surface token needs principal, F8 loopback slot consumed only on state match (16 wrong → end), F10 revocationFailure codes, F11 bindings need formIds or allForms:true. Coord: oauth 368, integrations 1155, agent-plugins 978; tsc 0; guard 26; cx clean. |
| C5 | MERGED | cloud/google-workspace-C5 (816c024c8) | merged | tests 224→485 (sheets.contract 173 for 26 tools; form-delivery 33→59; surfaces.contract; ui-views; google-client; products-catalog). Coord coverage (lib + form-destinations, all 15 test files): every file 100/100/100 except http.mjs branch 98.53 (artifact: :143 closing brace of for(;;)). 81 RED (25 security). Prod: readCatalog exported for testability; unreachable sheetId ?? 0 label fallback removed (schema-required, pinned). Note: sheets_format frozen-rows request declared write though inventory rates updateSheetProperties destructive (G15). Subagent 365k tokens (OVER ceiling). |
| G15 (Jini half) | DONE (read-only) | — | — | findings .cloud-coord/google-workspace-G15-jini.md: HIGH F1 hosted callback has no browser binding (attempt compared with itself) → cross-account login-CSRF: attacker workspace can capture victim's Google grant; MEDIUM F2 hosted connect without refresh token accepted (no prompt=consent), F3 disconnect revokes grant for every workspace on the shared client; LOW F4 account-switch race on token read, F5 error token scan misses AggregateError/deep causes, F6 affected-resources text unscanned, F7 surface session hands token without signed-in admin + token valid ~1h after disable, F8 wrong-state request consumes loopback slot, F9 ref vs id naming, F10 revocation failures undiagnosed, F11 binding without formIds = every form (fail-open), F12 action aliases. Verified fixed: phase-B H1, M1–M7. Coordinator: accept F1, F2, F4–F8, F10, F11 for G16; F3 = owner decision (revoke behaviour per OWNER DECISIONS; add to owner follow-ups); F9/F12 leave. |
| G15 (Tovu half) | DONE (read-only) | — | — | .cloud-coord/google-workspace-G15-tovu.md: no Critical/High; MEDIUM T1 account switch has no reassign step (destinations stop for good; copy wrong), T2 'pause'/'never dropped on quota' only ~1 day (forms retry cap 8) + auth failures terminal (OWNER DECISION on hold semantics); LOW T3 bindings RMW no CAS (forms-multidest-owned), T4 attempt row id = raw state, T5 plugin may name any TOVU_*_CLIENT_SECRET, T6 public surface-files unthrottled, T7 Origin vs Host behind proxy (fails closed), T8 single 401 → reconnect-required, T9 trims/docs. Red-team: no working abuse path beyond these. Verified fixed: phase-B H1–H4, M1–M4, M6, M7, L7; M5 partly. |
| G16t1 | STOPPED (owner cancel) — NOT merged | cloud/google-workspace-G16t1 (f04a6c23d tsc adaptation; dc611e05d WIP of the killed subagent: browser-binding cookie + explicit binding forms, UNVERIFIED) | — | 3 untracked new test files left uncommitted in /home/user/wt-G16t1 (browser-binding.security/unit tests, support/starting-browser.ts) |
| G16t2 | done, NOT merged (owner cancel) | cloud/google-workspace-G16t2 (03e7860c5) | — | T1 switch reassign, T2 copy, F10 revoke codes, T8 401 retry, T9 trims, M5 docs; plugin 601 tests with the same 21 G16j-baseline failures |

## Coverage / RED / complexity debt / removed checks
(phase C)

## Vendor-neutrality proof
PASS (G9): acme-office fixture end to end through real Jini + Tovu seams with zero production edits; grep tests in Jini (packages/agent-plugins/src/__tests__/vendor-neutrality.test.ts) and Tovu (api-connections vertical-slice dir vendor-neutrality.test.ts). Outside scanned sets: Jini agent-plugins README.md:7-8 + manifest.ts:4 credit the spec steering committee (names the provider; pre-existing), folder-zip.ts:57 'folder picker'.

## Bugs + security findings pinned
- G1c owner decisions needed: (a) tokens from a REFUSED completion (account-mismatch, scope-not-granted, superseded, switch-in-progress) are dropped without remote revocation (revoking could cut another workspace's grant); (b) connect attempt started before a switch staged + completed after orphans the staged credential (disconnect still revokes it); (c) disconnect revokes the whole (account, client) grant → same account in other workspaces gets 'Reconnect required' (owner-decided behaviour, documented).
- G10 HIGH (Jini): revoke over the vault token store never reaches the provider and reports not-needed (pinned in plugin oauth.contract test '(reported, not fixed)'); G1c fixing.
- G10: per-account 45/min budget not enforceable with one host limiter profile → G6c.
- G1b: oauth/src/token-endpoint.ts:55 puts provider `error` string unbounded into OAuthError.message → ApiConnectionError text (Low). G2 label=connectionId collision (fixed in G1b).
- G5b: bootstrap data deliberately not token-scanned (hosted Picker needs a short-lived access token; schema-checked, no-store) — matches owner decision; it is the connection's own token, not down-scoped. Handler/bootstrap calls have no deadline/signal (phase B fix). Per-call token scan cannot catch a token cached across calls (pinned, reported). trusted-plugin-files.ts:146 raw import error text in refusal line (may hold abs paths). Node module cache: changed module at same path not re-imported until restart.
- G6 fix: 0020 SQLite rebuild had dropped the secrets_vault_mcp_identity trigger (fixed + pinned before merge).
- G7 (a) Jini plugins/host tool-contributions.ts:21 sets requiresConfirmation for destructive/non-direct tools but Tovu executor has no confirm delegate → park forever; hits existing site executable plugin tools (capability-tool-registrations.ts:503) and their 30 s timeoutMs would cut a human confirmation (reported, not fixed). G7 adapter strips the flag and uses approval cards. (b) no per-plugin outbound host allow-list for plugin HTTP (phase B decision). (c) executable tools gated on admin.assistant.use (phase B decision). Gated-mutation owner (watermarked local DB mutations) fits no v1 op → not used (phase B confirm).
- G6: hosted callback rebuilds redirect URI from resolvePublicOrigin(req) — mismatched proxy/Host fails closed. runAgentPluginConnect 18/15 unchanged vs base.
- G8: public surface-files route reveals active plugins + their static surface files (by design: sandboxed scripts send no cookie); CSRF compares Origin to Host (proxy rewriting Host fails closed).
- Jini `pnpm guard` has 26 violations on base general-work (311851df); lots add none.
- G2: no vault kind fits OAuth rows (Tovu secrets_vault_kind CHECK) → Tovu migration 0020 + platform VAULT_KINDS edit needed (G6). refresh.ts markNeedsReauthBestEffort swallows refused stale mark (reported). Lease 30s must exceed token timeout 15s.
- G3: agent-runtime/src/providers/oauth-callback-server.ts:134 non-constant-time state, :198 any host bind, :239 echoes provider error (reported). oauth endpoint-safety.ts:40 allowLoopbackHttp also allows http loopback token endpoints (reported). Wrong-state request consumes the one callback (by design, DoS of one attempt).
- G1: getAccessToken checks plugin ownership only — host must authorize workspace (G6). Confirmed switch overwrites old tokens without remote revocation. PKCE verifier in record store: never log/export. startParams added (phase B review).
- G4: connectionRef ownership enforced by host capabilities port (G7); token scan 2 levels of cause; abort cooperative. agent-plugins vitest.config aliases @jini-ai/plugins/host to source (phase B: remove now main dist is fresh).
- G5: host must post init only on first load; surface scripts served ACAO:* must be public static; frame-ancestors 'self' assumes same origin.

## Needs Chrome visual check locally
- G13b: hosted Picker selection/cancel/wrong account/wrong file type/blocked script+popup (HIGH RISK: opaque-origin sandbox + CSP may break the Google Picker); desktop 'Continue to sign-in' + loopback completion, polling, Stop waiting, expiry; connection panel states (disconnected, connected, reconnect-required, revocation-pending+retry, staged switch confirm/cancel); products toggle + Grant permission; destination save/remove + 'same account' warning; dark mode, keyboard focus.
- G6d: 'Continue to sign-in' link: hosted new tab; desktop system browser + loopback completion.
- G8: plugin surface frame tab, CSP 'self' module scripts inside sandboxed frame, frame height, both status messages.

## Problems
- Known base failures (also fail on origin/restructure/apps-website-phased): route-modules 'forms-admin'; commerce-strip-parity (2); postgres-baseline publish_history text-vs-jsonb; real-Postgres tests not runnable in the container.
- Several subagents ran past the 200k hand-off point (G6 280k, G7 276k, G6b 307k > ceiling).
- Resume: `git pull --rebase` flattened the Jini G6 merge commit into a linear commit (7846710b); coordinator now uses `git pull --rebase=merges` and so do subagents.

## Next
Verify + merge G1–G5 as they finish; then G6/G7/G8.

## forms-multidest relation
- 14:30Z: forms-multidest COMPLETE (end-of-build results committed 13:11Z, 022e3c9d5; Tovu suite 45 fail vs 48 base). Jini origin/cloud/forms-multidest (01bc4a22) MERGED into Jini cloud/google-workspace (d468614d; guard 26, cms/infra tsc 0). Tovu merge + real fan-out wiring = lot G14b (after C4b, before G15).
- 11:00Z: forms-multidest F1–F9 merged on its branches, its phase C (C1–C4) still running → NOT complete → no merge; G14 builds against the ratified contract; G14b (wire fan-out) follows when forms-multidest finishes.
- 08:00Z: origin/cloud/forms-multidest exists; F9 not done; `.cloud-coord/forms-multidest-contract.md` EXISTS (copied to /tmp/forms-multidest-contract.md) → G14 builds against that contract; OAuth FormDeliveryConnectionPort stays unwired; follow-up G14b expected. G9 found Tovu FormDestinationModule.deliver still lacks binding/idempotencyKey (base type, forms-multidest-owned).

## Phase B — Tovu review decisions (coordinator, 2026-10-20; owner may override)
Findings: .cloud-coord/google-workspace-phaseB-tovu.md (4 High, 7 Medium, 7 Low). All accepted. Owner-flagged items decided fail-closed, listed for owner review:
- H2 product default: a product is OFF until enabled in the connection panel (owner: enabling a product and granting scopes are separate steps); tools refuse `product-disabled`, form delivery pauses (retryable adapter-unavailable, as G14).
- H4 origins: apiOrigins = the two Google API origins the plugin calls; redirectOrigins = config placeholder list (TOVU_… names), empty → hosted sign-in refused with a configuration message (fail closed) instead of accepting any origin.
- M2 CSV export: prefix `'` on text cells starting with = + - @ (OWASP CSV-injection guidance); documented as a fidelity trade-off.
- M6 quotas: host budgets are the single limiter layer (plugin limiter layer removed); 'instance' = per Tovu site instance (not per workspace).
- L6 BYO OAuth client: NOT deferrable — OWNER DECISIONS require it as an advanced option via existing secure credential capture → lot B4.
Planned lots: B3 (Tovu generic: H1, M1, M3, M4, L5, L7 generic parts), B3p (plugin: H2, H4, M2, M5, M6, M7, L1–L4, L6, L7 fields=*), B4 (BYO client), then G13b (connection panel + Picker + destination panel).

## End of build — Jini (2026-10-20, Jini cloud/google-workspace @ 381583e6)
- platform 1170 pass / 7 fail / 6 skip — the 7 (fs verified-directory-move ×6, verified-file-relocation ×1, EXDEV cross-device) FAIL IDENTICALLY on base origin/general-work (container fs); oauth 368/368; integrations 1155/1155; agent-plugins 978 pass / 2 skipped (pre-existing skips); cms 2667/2668 (video-frames.ffmpeg chmod-as-root, same as forms-multidest end-of-build); infra 64/64; pnpm guard 26 (= base).

## CANCELLED — state at stop (owner instruction, 2026-10-20)
- Coordinator branches as pushed: Tovu `cloud/google-workspace`, Jini `cloud/google-workspace` @ 381583e6 (includes G16j).
- **The Tovu coordinator branch does NOT typecheck against the current Jini branch's dist.** Jini G16j changed shapes: `browserBinding` is required on complete, binding forms must be stated explicitly, and surface tokens need a principal. That gives 3 root tsc errors (delivery-bindings.ts:82, connect.ts:155, oauth-callback.ts:107), and the adaptation lives only on the unmerged G16t1 branch. With the G16j dist, the plugin suite shows 21 failing tests.
- The **HIGH G15 F1** finding (hosted OAuth callback has no browser binding, so a cross-account sign-in hijack is possible) is fixed in Jini only. The Tovu cookie side is unmerged WIP on G16t1, so hosted sign-in is still vulnerable on the Tovu branch.
- Not run: the Tovu whole suite (build + base), admin whole suite, repo checks at the final head, desktop gates (owed for 910e7f8ed).
- Jini end-of-build was run (see the section above).


## G16 finish (Codex, local)

Branch: `codex/gw-finish`, scratch clone only. Programmer and Security personas loaded. This is a
static-only handoff: the owner explicitly prohibited tests, typechecks, builds, installs and Git
mutations. No such commands were run; no processes were started. Jini reference clone was read only.
The earlier CANCELLED section records the previous run; this section records the newly authorized local finish.

### Per-step status

1. **Done in source; execution unverified.** Read Jini's exported service/authorization/attempt,
   surface handler/capability/binding and CMS delivery types and the requested READMEs. Every real
   API-connection `complete` call in Tovu and the plugin tests supplies `browserBinding`.
   Kept the merged G16t1 `connect.ts`, callback and `delivery-bindings.ts` adaptations: desktop
   retains the host-only binding in memory; surface bindings explicitly state `formIds` or
   `allForms: true`, including the stored absent-formIds -> allForms conversion. Added the missing
   `browser-binding.ts`, `connection-sign-in.ts` and `support/starting-browser.ts` which the WIP
   imported but never committed. Surface access-token reads now require a principal in Tovu's
   `surface-connections.ts` as well as Jini's session gate.
2. **Done in source; execution unverified.** Hosted starts return an actor-bound one-use host link.
   The existing admin-session middleware authenticates the opener; API-key and different-actor
   requests cannot get the binding. Jini's existing pending-authorization cache owns expiry,
   capacity and consumption (256 entries, no timers); no parallel lifecycle/store was invented.
   The host response sets `__Secure-tovu_api_connection_binding`, with no Domain, Max-Age=600,
   HttpOnly, Secure, SameSite=Lax and the exact callback Path. The existing WIP callback reads
   only that cookie, passes an empty string if absent/invalid, and clears it on a routed attempt's
   completion or refusal. Jini consumes/checks the attempt and refuses missing/wrong proof before
   exchange. Duplicate binding cookies fail closed. Unrelated/unknown callbacks leave the cookie
   alone, preserving the existing security pin. Two simultaneous sign-ins use newest-cookie-wins
   and fail closed across attempts. Cookie serialization uses the installed `cookie` package;
   updated the exact clear-header assertion only for its attribute order, retaining every attribute.
3. **Partial: contracts repaired, the reported 21 failures NOT rerun.** Plugin OAuth tests pass the
   actual started binding while retaining PKCE, state/replay, scopes, denial and redaction assertions.
   The all-forms host fixture now states allForms:true; a separate new pin refuses a missing forms
   declaration. The plugin declares forceConsentParams.prompt=consent for unrenewable hosted
   sign-ins and pins first-consent vs renewable reconnect behavior. G1c/G6d was already implemented:
   the vault test pins confirmed + /revoke called + grant cleared, and the hook treats only HTTP
   400 invalid_token as already revoked; preserved all of those pins and the refusal cases.
4. **Done in source; execution unverified.** T4: attempt row addresses use the full SHA-256 state
   digest for put/peek/take, retaining CAS and existing sealed payloads. Transient in-flight rows
   using old addresses expire naturally (at most ten minutes); no persisted-data migration.
   T5: loader admits only the exact full-plugin-id and runtime client-setting names before any env
   lookup: TOVU_<FULL_PLUGIN_ID>_OAUTH_<WEB|DESKTOP>_CLIENT_<ID|SECRET>. Hyphens map to `_`, dots
   to `__` to avoid id collisions. Prefix matching alone was rejected because a shorter plugin
   could then name a longer plugin's secret. Google/Acme declarations, env fixtures and docs now
   use GOOGLE_WORKSPACE/ACME_OFFICE. Operators must rename old abbreviated settings; no fallback.
   T6: public static surface files use the existing rate-limit factory/IP resolver/http-kit owner,
   before contribution lookup or file reads. Profile: 240 + 60 burst per IP per 60 seconds, one
   instance per route registration/process; denied calls return 429 + Retry-After + no-store.
   Limiter faults cannot fall through to contribution loading. T3 and T7 intentionally left below.
5. **Done: decisions listed, none resolved by this patch.** Recommendations below remain proposals.

### New/changed tests

- New `browser-binding.unit.test.ts`: cache expiry/capacity, consumed wrong actor, replay, exact
  host-only cookie attributes on set/clear, missing/malformed/duplicate cookie refusal, host-link shape.
- New `connection-sign-in.security.integration.test.ts`: real authenticated admin session, no-session
  and API-key denial, wrong actor, one-use handoff, exact Secure/HttpOnly/Lax/callback-Path cookie,
  public callback with missing/other proof, success/clear, refused replay and no exchange on mismatch.
- New `files.security.test.ts`: existing fixed-window limiter before any contribution I/O, threshold,
  unknown paths, spoofed forwarded IP, reset boundary and limiter-fault refusal.
- Updated `oauth.contract.test.mjs`: correct binding on every completion; hosted forced consent;
  added both-runtime wrong-browser/replay and first-grant-without-refresh-token pins, plus renewable
  hosted reconnect without an unnecessary consent prompt. Existing remote-revoke assertions retained.
- Updated `surfaces.contract.test.mjs` and `surface-harness.mjs`: explicit all-forms fixture; missing
  forms fails closed; principal-less Picker bootstrap refuses before its host token port is called.
- Updated vault-store tests: seed digest-addressed rows; pin no state in listed ids/labels/metadata and
  concurrent consume-once behavior. Updated contribution tests: both runtimes reject foreign,
  extra-namespace and cross-runtime secret names; own names admitted; foreign client id refused.
- Updated surface-connections tests: direct token read without a principal refused; signed-in owner works.
- Remaining test-file changes are complete fixture/env-name propagation and missing-browser-helper
  adoption; no tests removed, no guard/auth/validation deleted, no security assertion weakened.

### Static evidence, architecture and remaining risk

- `git diff --check` clean. Source call-site searches inspected all API-connection completions,
  typed surface-binding uses and surface bootstrap contexts; no remaining known G16j contract mismatch.
- Runtime/typecheck/coverage/self-validation status: **PARTIAL / NOT RUN**, explicitly prohibited by
  this dispatch and no node_modules here. No claim that the branch typechecks or that the 21 failures
  now pass. Owner must run root/tests/admin typechecks and plugin/affected website suites in cloud.
- Architecture audit: **PASS (static scope)**: Jini still owns OAuth/PKCE/browser-binding comparison,
  single-use storage and rate-limit algorithm; Tovu adds only its route/cookie/config/vault adapters;
  provider-specific consent stays in content/agent-plugins/google-workspace. No new dependency or
  provider vocabulary in core. Chapters 13/14 and project memory were absent from this scratch clone;
  read their /Users/la/Programming/Tovu/ADS-memory copies as read-only references. Graph tools were
  unavailable, so fresh targeted rg/source reads supplied discovery evidence.
- Function quality: handoff issue/take, link/cookie helpers, namespace validation, digest addressing,
  principal-gated token port and public-files admission: **NO_RECORDED_FINDINGS after static review**;
  direct seams and assertions listed above, no unbounded per-item external I/O. Handoff cache is bounded
  to 256 entries; header parsing is linear in the server-bounded header; namespace checks cover at most
  two clients; digest hashing is linear in bounded state; token port adds one existing actor check;
  static files retain their existing allowed-request contribution scan. Skepticism pass checked naming,
  wrong-browser/retry paths, cache capacity and namespace collisions: the prefix-only namespace bypass
  was identified and replaced with exact per-runtime names before handoff. Execution evidence remains
  the stated limitation, not an assertion of green coverage.
- T3 remains OPEN (forms-multidest-owned whole-list bindings RMW/CAS); T7 remains OPEN (Origin/Host
  behind a rewriting proxy fails closed). No hold/retry semantics changed. Hosted Picker Chrome/CSP
  checks, real browser cookie navigation, desktop gates, and live Sheets metadata checks remain owed.
- Trusted plugin hooks still run in-process; the client-name allowlist is a host capability boundary,
  not process isolation. Provider access tokens already issued to a frame retain their provider TTL.

### Reuse decisions

- Reuse: hosted one-use handoff; searched Tovu connection/inbox paths and Jini OAuth/core/agent-plugins
  for handoff, pending, single-use, consume-once; inspected pending-authorizations.ts and callback-field-inbox.ts;
  used @jini-ai/oauth createPendingAuthorizationStore<T> cache mode (the callback inbox owns completed
  provider fields, not pre-consent proof). Tovu wrapper only maps actor/link/expiry and injects entropy into Jini generateOAuthState; owner: Jini OAuth README.
- Reuse: cookie serialization; searched existing admin/member cookie writers, consent cookie parser and
  Jini http-kit/oauth/user-management cookie exports; used installed cookie.serialize for a pure header
  adapter (keeps Express out of features); retained strict duplicate-proof refusal which cookie.parse
  alone does not enforce. Owner: Jini browser-binding host contract; cookie names/path are Tovu policy.
- Reuse: attempt-address digest; reused native node:crypto createHash already used by the vault label,
  through the existing attemptId function shared by all attempt reads/writes; no alternate store.
- Reuse: client-setting ownership; inspected contribution parser/loader and host resolveClient/configured;
  extended the declaration loader before environment access with exact Tovu setting names, keeping
  all existing parser checks. No provider-specific owner in core.
- Reuse: public-files admission; searched callback/public rate-limit routes and contracts/rate-limit,
  inspected createRateLimiter/resolveClientIp and Jini http-kit counter ownership; used that factory,
  adding only Tovu's route profile. No custom counting/eviction algorithm.

### Owner decisions (recommendations only)

- G1c(a), refused completion grants: retain no automatic remote revoke; propose explicit cleanup guidance because revoking can affect a live shared grant.
- G1c(b), completion after a switch staged: propose an atomic staged-slot recheck/refusal in Jini so the staged credential cannot be orphaned.
- G1c(c), disconnect impact across workspaces: preserve current behavior pending owner confirmation and disclose its shared-grant blast radius explicitly.
- T2, hold semantics: propose a durable held outcome for product-off/quota/auth recovery, resumed explicitly without spending the finite failure-attempt budget.
- F3, revoke scope: propose an explicit grant-wide revoke choice and warning, with local disconnect separately defined by the owner; no behavior changed here.
- B4, BYO OAuth client: keep the existing secure-capture flow pending owner decision; propose a dedicated OAuth-client credential capability to avoid general agent credential access.
- Tovu-owned Google OAuth client: owner must provision/register web and installed clients and approve consent/callback configuration before enabling the plugin.

### Complete file list (this local finish; inherited merged files are described above)

- `.cloud-coord/google-workspace-progress.md`
- `apps/website/src/contracts/core/rate-limit/rate-limit.ts`
- `apps/website/src/features/agent-plugins/admin-surfaces/issued-sign-ins.ts`
- `apps/website/src/features/api-connections/README.md`
- `apps/website/src/features/api-connections/__tests__/api-connection-budgets.test.ts`
- `apps/website/src/features/api-connections/__tests__/api-connection-slice.test.ts`
- `apps/website/src/features/api-connections/__tests__/browser-binding.unit.test.ts`
- `apps/website/src/features/api-connections/__tests__/contribution.unit.test.ts`
- `apps/website/src/features/api-connections/__tests__/fixtures/acme-office/tovu-connections.json`
- `apps/website/src/features/api-connections/__tests__/host.unit.test.ts`
- `apps/website/src/features/api-connections/__tests__/support/acme-harness.ts`
- `apps/website/src/features/api-connections/__tests__/support/starting-browser.ts`
- `apps/website/src/features/api-connections/__tests__/surface-adapters.security.test.ts`
- `apps/website/src/features/api-connections/__tests__/surface-connections.unit.test.ts`
- `apps/website/src/features/api-connections/__tests__/vault-stores.unit.test.ts`
- `apps/website/src/features/api-connections/browser-binding.ts`
- `apps/website/src/features/api-connections/contribution.ts`
- `apps/website/src/features/api-connections/host.ts`
- `apps/website/src/features/api-connections/surface-connections.ts`
- `apps/website/src/features/api-connections/vault-stores.ts`
- `apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/integration/connection-sign-in.security.integration.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/agent-plugins/connection-sign-in.ts`
- `apps/website/src/server/inbound/public-http/routes/agent-plugin-surfaces/__tests__/files.security.test.ts`
- `apps/website/src/server/inbound/public-http/routes/agent-plugin-surfaces/files.ts`
- `apps/website/src/server/inbound/public-http/routes/api-connections/__tests__/oauth-callback.unit.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/agent-plugin-connections.vertical-slice.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/fixtures/acme-provider.ts`
- `apps/website/src/server/runtime/composition/__tests__/form-delivery-oauth.integration.test.ts`
- `apps/website/src/server/runtime/composition/modules/agent-plugins.ts`
- `content/agent-plugins/google-workspace/README.md`
- `content/agent-plugins/google-workspace/__tests__/form-delivery.e2e.test.mjs`
- `content/agent-plugins/google-workspace/__tests__/oauth.contract.test.mjs`
- `content/agent-plugins/google-workspace/__tests__/surface-harness.mjs`
- `content/agent-plugins/google-workspace/__tests__/surfaces.contract.test.mjs`
- `content/agent-plugins/google-workspace/tovu-connections.json`
