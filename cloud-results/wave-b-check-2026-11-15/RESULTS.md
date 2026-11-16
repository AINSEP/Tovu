# Wave-B cloud verification — 2026-11-15/16 (REPORT ONLY, no source edited)

**Overall: FAIL on every gate. Nothing in this report is green except where stated.** Total wall clock ≈ 2h (started 05:09 UTC).

## HEADs / setup
- Jini `integ/wave-b` = 6cfcc471d (expected ✔). Tovu `integ/wave-b` = 9ec4ad4a4 (expected ✔). Both checked out via `git checkout -B`.
- Node v24.22.3 in ~/.local/node24 (image was v22.23.4); pnpm 10.33.2 via corepack.
- Jini `pnpm install --frozen-lockfile`: **OK** (16s; no lockfile drift; build scripts of esbuild/argon2/@parcel/watcher/core-js ignored; WARNs `jini-mcp` bin missing because dist not built yet).
- Jini `pnpm --no-bail -r build`: **FAIL**, 2m12s, 11 packages failed (see Step 0 below). Build continued (--no-bail) so many dists exist, but the failed ones are possibly incomplete (e.g. ui css exports missing → many Tovu failures).
- Tovu `npm ci` (root): OK, no lockfile drift reported, 1m17s. better-sqlite3/argon2/esbuild install scripts not run (npm allowScripts) — native-dep tests might be ENV.
- `@tovu/sdk` build BEFORE linking: **FAIL** — `src/index.ts(138,8): TS2307 Cannot find module '@jini-ai/core/contracts/plugin-sdk'` (registry @jini-ai/core ^0.7.0 lacks that subpath → this is the expected "@tovu/sdk deps changed" drift). After `link:jini` (JINI_PACKAGES_DIR=/home/user/Jini/packages) sdk builds clean.
- apps/admin and apps/desktop have their own lockfiles and were **not** installed by the root `npm ci`; my first typecheck pass (raw/tovu-tc-*.txt, 5502 admin errors) was therefore a setup artifact. I ran `npm ci --ignore-scripts` (ELECTRON_SKIP_BINARY_DOWNLOAD=1) in both, re-linked, and re-ran → raw/tovu-tc2-*.txt (the authoritative ones).
- No Postgres server, no chromium, no IPv6 → psql-based tests = ENV.
- Baseline comparison against `origin/refactor/terra` was **NOT performed** (would need a full Jini rebuild + reinstall for each side; not cheap). All failures are therefore classified NEW?/unverified unless clearly ENV; treat "NEW?" as "fails on integ/wave-b, baseline unknown".

## Step 0 — Jini build (pnpm -r build) — FAIL (2m12s)
Failed packages: desktop-host, capability-providers, http-kit, plugins, cms, ui, provider-plugins, chat, daemon, admin, user-management (+ cascading). Errors counts: http-kit 31, plugins 24, cms 11, daemon 9, ui 9, provider-plugins 6, chat 5, admin 4, desktop-host 2, capability-providers 1, user-management 1. They are the same errors as Step 1 typecheck (tsc build includes test files); see Appendix A (every error, file:line).

## Step 1 — Jini typecheck + gates (2m05s typecheck)
| gate | result |
|---|---|
| `pnpm -r typecheck` | **FAIL** 13 packages: desktop-host, capability-providers, http-kit, db, plugins, cms, ui, provider-plugins, chat, daemon, admin, user-management, examples/neutral-host — 105 errors (Appendix A) |
| `tsc -p scripts/tsconfig.json` | **FAIL** 3 errors: scripts/gen-host-ports.ts(40,82) TS2352; (67,25) TS2550 `Map.groupBy` (needs lib es2024); (67,51) TS7006 |
| guard | **FAIL** exit 1, 153 violations: N1-consumer-identity 52 + N2-consumer-path 50 (the word "Tovu"/"apps/website"/"apps/admin" in comments of packages/{cms,admin,chat}/src/** — 26 files), L3-undeclared-edge 17 (provider-plugins→@jini-ai/core/contracts/{plugin-sdk,charts,forms}, sqlite→@jini-ai/core/contracts/storage: not declared in package.json deps/peers), SI-domain 16 (e.g. core/src/primitives/logger.ts: ./gated-mutations reaches src/model-facing-tool-errors.ts), HW3-module-state 14, R13-model-fallback-freshness 7 (agent-runtime/src/defs/claude.ts fallbackModels missing claude-fable-5-2; codex/agy MF3 skipped, binaries absent = ENV), HW1 1 (platform/src/command.ts:56), R10-chatpane-public-surface 1, injection-debt-stale 1 (222 allowances to remove). Full: raw/jini-gate-guard.txt |
| package layers (incl. injection gate) | PASS (exit 0; note guard.ts itself reports injection-debt-stale + L3) |
| complexity (check-complexity) | PASS |
| size | **FAIL** — new violation `[max-lines-per-function] provider-plugins/src/observability-opentelemetry/otel-port.ts:73 createOtelObservabilityPort (97)`; worsened `[max-lines] plugins/src/host/node/runtime-core.ts` 560→561 and `server/src/builtin-features.ts` 566→567; ratchet-down needed for admin SeoPage.tsx (588→587), cms taxonomy/write-service.ts (712→711); stale entry diagnostics/src/observability/otel.ts:105 |
| log-safety | PASS |
| subpath isolation | PASS |
| hardwiring | **FAIL** — 15 new (HW3-module-state 14: agent-runtime defs/amp/index.ts:34, executables.ts:274-275, launch.ts:21, model-discovery-config.ts:57; chat A2uiSurfaceCard.hooks.ts:23; daemon agent-executor/launch.ts:117-119, mcp-bridge.ts:166,229; platform mail/email-template.ts:35; ui sketch-editor/react/dependencies-fake.hooks.ts:4; user-management server/agent-tool-input.ts:30. HW1: platform command.ts:56) + 4 stale debt occurrences |

Root-cause groups for typecheck (Appendix A): (a) `exactOptionalPropertyTypes` violations (desktop-host logging.ts:76,79; daemon http/xai.ts:796-801, tool-execution-routes.ts:235); (b) `StorageKernel` vs `KyselyKernel` (missing `query`,`execute`) in cms forms fixtures/test and chat store (chat run-ledger.ts:193, chat-history-store.ts:57); (c) plugins/src/host: unresolved names PluginRouteContribution/PluginToolContribution/PluginWidgetContribution/HookPoints/DefinedPlugin/PluginSdk/PLUGIN_PROVIDER_CAPABILITY (contributions.ts, ports.ts, provider-contributions.ts:171) + import-seam.ts implicit any (looks like missing imports/types after the contract move) ; (d) http-kit tests import symbols no longer exported (guardSameOrigin, validationError, statusForError, DEFAULT_MAX_QUEUED_SSE_EVENTS, SseEvent, `opaqueCursor`) — 31 errs; (e) ui panel-kit tests import non-existent `use-bounded-status-poll.hooks.js`, `use-optimistic-stored-value.hooks.js`; use-standing-draft-autosave returns `{discarded}` vs `void`; (f) provider-plugins observability-opentelemetry/opentelemetry.ts:39 imports non-exported ExporterFactory/TracerProviderFactory from ./otel-port.js; (g) admin seo hooks: MediaRefField.hooks.ts:30, SeoPage.hooks.ts:12-14 (`handle` not in TabBarTab); (h) misc: db copy-order.test.ts:65, capability-providers blob-storage test:28 (Uint8Array vs Buffer), user-management members.list-cursor.test.ts:28, daemon routines.test.ts:787,809 (`cursor` required), neutral-host credential-tools.test.ts:87,91.

## Step 2 — Jini package tests (changed packages, full suites; 33 packages changed; 27 run to completion, 1 partial, wall ≈ 24 min total, vitest --maxWorkers=2)
PASS: protocol 264, sqlite 9, sidecar 339, registry 391, capability-providers 198, integrations 2051, server 472, ui-kit 224, commerce (node:test part skipped by runner; vitest 10 pass).
FAIL (files failed / tests failed):
- cli 1/1 — prompt.limits.test.ts
- desktop-host 1/1 — electron/updates/__tests__/framework-adapters.test.ts
- infra 1/1 — shim-surface.test.ts
- diagnostics 2/3 — api-convention.test.ts, sources-error-shape.test.ts
- mcp 1/2 — federation/mcp-federation.registrations.test.ts
- agent-plugins 3/3 — lifecycle activation-corrupt-file-writes, lifecycle-reconciliation, plugin-identity
- http-kit 6/12 — adapter, http-error-log-redaction, origin, request, response, sse (symbols not exported; same as typecheck group d)
- agent-runtime 3/6 — index.test.ts, defs/amr.test.ts, providers/oauth-tokens.test.ts
- agentic 1/1 — core/dom/visitor-publication.test.ts
- plugins 4/6 — host-entry-purity, provider-contributions, provider-schema-w2g, provider-settings-migrations
- provider-plugins 3/10 — artifact.integration, observability-opentelemetry, observability-sentry
- user-management 13/114 — 53× "@jini-ai/admin screens need <AdminKitProvider kit>" + 5× UiKitProvider in react/** tests (Login, mfa, Members.*, Users.*, screens…), plus server/authorization-regressions, public-args, Passkeys.hooks usePasskeySignIn undefined
- db 2/8 — loads-without-driver.test.ts, security-defaults.source.test.ts (109s)
- platform 2/2 — integration-contracts.test.ts, secrets/exports.test.ts
- core 2/2 — settings-subpath-isolation.contract.test.ts, source-neutrality.test.ts (the latter likely the same N1/N2 "Tovu"/"apps/website" comments found by guard)
- chat 21/147 (344s) — UiKitProvider missing, peerDependency-shape deep-equal, "cannot send: A reply is still running" vs /streaming/
- daemon 23/381 (81s) — 34× `spy` not called with args, 9× call-count mismatch, 8× undefined property, 7× missing text_delta events, 6× deep-equal result
- ui (TIMED OUT at 420s, PARTIAL, summary not printed): ~614 failing/❯ lines; failing files include a2ui provider-actions, admin-widgets Select*, execution/** (ByokProviderForm.*, ExecutionTab.*, LocalCliAgentCard…), external-mcp ExternalMcpTab…; see raw/jini-test-packages-ui.txt
- examples/minimal-host 1/1 — health-boot.test.ts (packed tarballs) — ENV-or-NEW? (needs pack of built dists; build failed)
- examples/neutral-host 2/2 — connect-plugin-host.test.ts, credential-tools.test.ts
NOT RUN: admin, cms, examples/notes-app, examples/reference-web (vitest + node e2e), and ui/cms/admin full suites (time + context budget). cms and admin are the two largest changed packages (152 files each) — **unverified**. Classification: ENV for none confirmed; all NEW? (no baseline run). Several (core source-neutrality, hardwiring) are plausibly the same root cause as guard N1/N2.

## Step 3 — Tovu typecheck (linked to Jini integ/wave-b)
| project | result |
|---|---|
| packages/sdk | PASS (after link) |
| website (root tsconfig.json) | **FAIL** 46 errors (Appendix B) |
| apps/admin tsconfig.json | **FAIL** 30 errors (Appendix B) |
| apps/desktop main | **FAIL** 67 errors (≈ the same website errors pulled in via ../website plus desktop-agent.ts TS2740, *.test.ts IPC arg shapes) ; `electron`/`@electron/asar` types absent because install ran with ELECTRON_SKIP_BINARY_DOWNLOAD/--ignore-scripts = partly ENV |
| apps/desktop preload / renderer | PASS / PASS |
| tsconfig.tests.json | **FAIL** 260 errors (TS2345 118, TS2322 46, TS2741 19, TS2353 18; + `Cannot find module '@jini-ai/provider-plugins/observability-opentelemetry/port'`) |
Dominant root cause (website/admin/tests): Jini wave-B changed many APIs to `(required: {…}, optional?)` object-args, `ListPositionShape` `size` removed, `{discarded:boolean}` returns, `plugin-host` contract types, etc., and Tovu call-sites still use the old positional shapes, e.g. website `fetch-image.ts(177,72)`, `members/repo.ts(189,81)`, `newsletter/repo*.ts`, `composition/commerce.ts(214,107)`, `composition/app.ts(979,1289,1727,2573)`, `plugin-host.ts(70,82)`; admin `AgentPluginDetailsModal.tsx(41,44)`, `use-page-editor.hooks.ts(1136)`, `use-post-editor.hooks.ts(1006)`, `AssistantDock.tsx(382,22)`. Caveat: Jini dists of the 11 failing-build packages may be partial, which can add noise.

## Step 4 — Tovu tests (≈ 57 min of compute; time-box of 60 min was exceeded by node:test overhead — importers only partly run)
Test sets: 438 changed test files (425 website/packages, 12 admin, 1 sdk) + 1107 importers (887 website side, 220 admin side) found by `rg`-equivalent import resolution (list: raw/website-importers-list.txt; script logic = relative-import resolution of changed non-test files).
- **website changed tests (425 files): all reached** (3 runs, node:test --test-concurrency=1): ~58 failed files, ≈ 126 failed subtests. Breakdown: ENV-postgres 19 files (psql socket missing: tovu_*_contract / pg_fixture DBs), ENV-native/browser 2, IMPORT-ERROR 3 (`@jini-ai/provider-plugins/plugins/{google-forms,payments-stripe}/0.7.1/jini.plugin.json` missing — plugin manifest not emitted because provider-plugins build failed), NEW? 34 (Appendix D: moved-tools.golden catalog, outbox-retry-policies/jini-outbox-parity deep-equal, agent-plugins tool-registrations `toLowerCase` of undefined (supabase), `Invalid URL` ×4, `mintRunCredential is not a function`, model-facing-errors regex mismatches ×4, plugin-host.integration, cost-counters.baseline, form-delivery.* , external-mcp-oauth-loopback-wiring, assistant-byok/proxy-routes, workspace create.test, seo put-entry.test, trash member-adapter `.map is not a function` etc.).
- **website importers: PARTIAL** — one 590 s run reached ≈198 of 887 files: 40 failed tests (15 files OTHER, 8 ENV-postgres). **~689 importer files NOT RUN.** raw/tovu-web-importers-1.txt.
- **admin (vitest)**: full-suite attempt hit the 560 s cap with no summary (raw/tovu-admin-vitest-full-partial.txt, 5 failing files visible incl. PageEditor.interactive-flush). Targeted changed+importers run (231 files, 451 s): **115 files failed | 116 passed; 1166 tests failed | 2604 passed**. Root causes: 167× "@jini-ai/admin screens need <AdminKitProvider kit={...}>" and 60× "@jini-ai/ui … need <UiKitProvider kit>" (provider now mandatory in Jini wave-B; Tovu test harness/app root not providing it → NEW? , same error shows up inside Jini's own user-management/chat tests), ≈20× `Failed to resolve import "@jini-ai/ui/settings-dialog.css" | "@jini-ai/ui/interactive-ui.css" | "@jini-ai/chat/react/styles/chat-settings.css"` (CSS subpath exports absent in the built Jini dist — Jini ui/chat build failed; ENV-from-build-failure), 1× ENOENT typescript.js.map. Failed-file list: raw/admin-failfiles.txt.
- **admin named set** (app-session*, app-shell-chrome*, app-chat-dock*, app-logout-confirm*, app-hooks*; 14 files): 6 failed files / 6 failed tests, 77 pass: app-chat-dock-seam, app-logout-confirm, app-session-boot-token, app-session-seam, app-session-unauthenticated-kickback, app-shell-chrome — causes: 6× UiKitProvider missing, 2× chat-settings.css unresolved.
- **desktop**: `npm run build:preload` OK. `npm test` part 1 (node:test): 2297 tests, 2265 pass, **22 fail** in 19 files (Appendix E): ENV: e2e-harness-import (downloads Electron binary), 2× IMPORT: `@jini-ai/desktop-host/dist/speech/macos/speech-helper.swift` missing (non-ts asset not copied by failed desktop-host build), NEW?: source-grep wiring tests (find-menu, zoom-menu, site-history-menu, main-shutdown-wiring, main-agent-runtime-wiring, main-theme-preview-wiring, main-updater-wiring), site-dir-store, tracked-sites, site-process-registry, project-ipc(-dispatch), workspace-chat-ipc, workspace-conversation-gaps, auto-update-controller, jini-mcp-peers. Part 2 (renderer/contracts, run by me separately because the `&&` skips it after part 1 fails): 917 tests, 915 pass, 2 fail (renderer/site-card-actions-wiring, renderer/websites-width).
NOT RUN: ~689 website importer test files; apps/site-chat & development/* tests; e2e/playwright; admin full suite; website tests needing Postgres.

## Step 5 — Classification summary
- ENV (confirmed): psql/Postgres tests (≈27 website files), Electron binary download (desktop e2e-harness-import), codex/agy binaries (guard MF3 skipped), native module scripts not run.
- ENV-from-build-failure (real in the sense that Jini wave-B does not build): missing CSS subpath exports/`jini.plugin.json`/`speech-helper.swift` in dist. Needs Jini build green first.
- NEW? (fails on integ/wave-b; terra baseline not checked): everything else listed above — Jini typecheck/guard/size/hardwiring/test failures, Tovu typecheck signature mismatches, AdminKitProvider/UiKitProvider-required test failures.
- PRE-EXISTING: none established (no baseline run).

## Wall clock
setup+installs ≈ 3 min; Jini build 2m12; Jini typecheck 2m05; Jini gates ≈ 2 min; Jini tests ≈ 24 min (ui timed out 7 min); Tovu installs+link ≈ 4 min; Tovu typechecks ≈ 3 min; Tovu admin tests ≈ 28 min (incl. 9 min full run that timed out); Tovu website tests ≈ 38 min; desktop ≈ 3 min. Total ≈ 2 h.

Raw output: raw/ (jini-* = Jini, tovu-* = Tovu; `tovu-tc-*` = first-pass typechecks before admin/desktop installs — superseded by `tovu-tc2-*` except root/tests/sdk).
## Appendix A — Jini typecheck errors (every one; raw/jini-typecheck.txt)
```
packages/desktop-host src/logging.ts(76,32): error TS2379: Argument of type '{ meta: Record<string, unknown> | undefined; error: unknown; }' is not assignable to parameter of type '{ meta?: Record<string, unknown>; error?: unknown; }' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefin
packages/desktop-host src/logging.ts(79,63): error TS2379: Argument of type '{ diagnostics: LogDiagnosticsSink; level: LogLevel; message: string; meta: Record<string, unknown> | undefined; error: unknown; }' is not assignable to parameter of type '{ diagnostics: LogDiagnosticsSink; level: LogLevel; 
packages/capability-providers src/adapters/blob-storage/__tests__/index.test.ts(28,46): error TS2740: Type 'Uint8Array<ArrayBufferLike>' is missing the following properties from type 'Buffer<ArrayBufferLike>': write, toJSON, equals, compare, and 66 more.
packages/http-kit src/__tests__/origin.test.ts(2,10): error TS2459: Module '"../origin.js"' declares 'guardSameOrigin' locally, but it is not exported.
packages/http-kit src/__tests__/request.test.ts(2,20): error TS2305: Module '"../request.js"' has no exported member 'validationError'.
packages/http-kit src/__tests__/response.test.ts(2,34): error TS2305: Module '"../response.js"' has no exported member 'statusForError'.
packages/http-kit src/__tests__/sse.test.ts(4,67): error TS2459: Module '"../sse.js"' declares 'DEFAULT_MAX_QUEUED_SSE_EVENTS' locally, but it is not exported.
packages/http-kit src/__tests__/sse.test.ts(4,103): error TS2459: Module '"../sse.js"' declares 'SseEvent' locally, but it is not exported.
packages/http-kit src/__tests__/sse.test.ts(39,29): error TS2353: Object literal may only specify known properties, and 'opaqueCursor' does not exist in type 'TestEvent'.
packages/http-kit src/__tests__/sse.test.ts(39,54): error TS2353: Object literal may only specify known properties, and 'opaqueCursor' does not exist in type 'TestEvent'.
packages/http-kit src/__tests__/sse.test.ts(44,38): error TS2344: Type 'TestEvent' does not satisfy the constraint 'SseEvent'.
packages/http-kit src/__tests__/sse.test.ts(63,38): error TS2344: Type 'TestEvent' does not satisfy the constraint 'SseEvent'.
packages/http-kit src/__tests__/sse.test.ts(71,38): error TS2344: Type 'TestEvent' does not satisfy the constraint 'SseEvent'.
packages/http-kit src/__tests__/sse.test.ts(80,38): error TS2344: Type 'TestEvent' does not satisfy the constraint 'SseEvent'.
packages/http-kit src/__tests__/sse.test.ts(80,120): error TS2339: Property 'opaqueCursor' does not exist on type 'TestEvent'.
packages/http-kit src/__tests__/sse.test.ts(90,40): error TS2344: Type 'TestEvent' does not satisfy the constraint 'SseEvent'.
packages/http-kit src/__tests__/sse.test.ts(105,40): error TS2344: Type 'TestEvent' does not satisfy the constraint 'SseEvent'.
packages/http-kit src/__tests__/sse.test.ts(121,40): error TS2344: Type 'TestEvent' does not satisfy the constraint 'SseEvent'.
packages/http-kit src/__tests__/sse.test.ts(133,40): error TS2344: Type 'TestEvent' does not satisfy the constraint 'SseEvent'.
packages/http-kit src/__tests__/sse.test.ts(133,111): error TS2339: Property 'kind' does not exist on type 'TestEvent'.
packages/http-kit src/__tests__/sse.test.ts(144,40): error TS2344: Type 'TestEvent' does not satisfy the constraint 'SseEvent'.
packages/http-kit src/__tests__/sse.test.ts(159,40): error TS2344: Type 'TestEvent' does not satisfy the constraint 'SseEvent'.
packages/http-kit src/__tests__/sse.test.ts(172,40): error TS2344: Type 'TestEvent' does not satisfy the constraint 'SseEvent'.
packages/http-kit src/__tests__/sse.test.ts(181,40): error TS2344: Type 'TestEvent' does not satisfy the constraint 'SseEvent'.
packages/http-kit src/__tests__/sse.test.ts(189,40): error TS2344: Type 'TestEvent' does not satisfy the constraint 'SseEvent'.
packages/http-kit src/__tests__/sse.test.ts(199,40): error TS2344: Type 'TestEvent' does not satisfy the constraint 'SseEvent'.
packages/http-kit src/__tests__/sse.test.ts(211,40): error TS2344: Type 'TestEvent' does not satisfy the constraint 'SseEvent'.
packages/http-kit src/__tests__/sse.test.ts(221,40): error TS2344: Type 'TestEvent' does not satisfy the constraint 'SseEvent'.
packages/http-kit src/__tests__/sse.test.ts(233,40): error TS2344: Type 'TestEvent' does not satisfy the constraint 'SseEvent'.
packages/http-kit src/__tests__/sse.test.ts(253,40): error TS2344: Type 'TestEvent' does not satisfy the constraint 'SseEvent'.
packages/http-kit src/__tests__/sse.test.ts(262,40): error TS2344: Type 'TestEvent' does not satisfy the constraint 'SseEvent'.
packages/http-kit src/__tests__/sse.test.ts(274,40): error TS2344: Type 'TestEvent' does not satisfy the constraint 'SseEvent'.
packages/http-kit src/__tests__/sse.test.ts(287,40): error TS2344: Type 'TestEvent' does not satisfy the constraint 'SseEvent'.
packages/http-kit src/__tests__/sse.test.ts(296,40): error TS2344: Type 'TestEvent' does not satisfy the constraint 'SseEvent'.
packages/db src/transfer/__tests__/copy-order.test.ts(65,88): error TS2322: Type '{ fromExportName: string | undefined; fromSqlTableName: string | undefined; toExportName: string | undefined; toSqlTableName: string | undefined; selfReferencing: boolean; }' is not assignable to type 'TableCopyDepende
packages/plugins src/host/__tests__/unit/contribution-sdk.unit.test.ts(56,151): error TS7031: Binding element 'auth' implicitly has an 'any' type.
packages/plugins src/host/__tests__/unit/tool-contributions.characterization.unit.test.ts(24,101): error TS7006: Parameter 'ctx' implicitly has an 'any' type.
packages/plugins src/host/contributions.ts(20,29): error TS2304: Cannot find name 'PluginRouteContribution'.
packages/plugins src/host/contributions.ts(21,28): error TS2304: Cannot find name 'PluginToolContribution'.
packages/plugins src/host/contributions.ts(22,30): error TS2304: Cannot find name 'PluginWidgetContribution'.
packages/plugins src/host/contributions.ts(64,17): error TS2304: Cannot find name 'PluginRouteContribution'.
packages/plugins src/host/contributions.ts(64,56): error TS2304: Cannot find name 'PluginToolContribution'.
packages/plugins src/host/contributions.ts(64,96): error TS2304: Cannot find name 'PluginWidgetContribution'.
packages/plugins src/host/contributions.ts(86,26): error TS2304: Cannot find name 'PluginRouteContribution'.
packages/plugins src/host/contributions.ts(95,25): error TS2304: Cannot find name 'PluginToolContribution'.
packages/plugins src/host/contributions.ts(104,27): error TS2304: Cannot find name 'PluginWidgetContribution'.
packages/plugins src/host/ports.ts(9,45): error TS2304: Cannot find name 'HookPoints'.
packages/plugins src/host/ports.ts(9,58): error TS2304: Cannot find name 'HookPoints'.
packages/plugins src/host/ports.ts(14,105): error TS2304: Cannot find name 'DefinedPlugin'.
packages/plugins src/host/ports.ts(15,40): error TS2304: Cannot find name 'PluginSdk'.
packages/plugins src/host/ports.ts(15,93): error TS2304: Cannot find name 'PluginSdk'.
packages/plugins src/host/ports.ts(17,37): error TS2304: Cannot find name 'DefinedPlugin'.
packages/plugins src/host/ports.ts(17,106): error TS2304: Cannot find name 'DefinedPlugin'.
packages/plugins src/host/ports.ts(34,46): error TS2304: Cannot find name 'HookPoints'.
packages/plugins src/host/ports.ts(34,59): error TS2304: Cannot find name 'HookPoints'.
packages/plugins src/host/provider-contributions.ts(171,62): error TS2304: Cannot find name 'PLUGIN_PROVIDER_CAPABILITY'.
packages/plugins src/host/worker/import-seam.ts(79,15): error TS7006: Parameter 'sdk' implicitly has an 'any' type.
packages/plugins src/host/worker/import-seam.ts(81,64): error TS7006: Parameter 'entry' implicitly has an 'any' type.
packages/plugins src/host/worker/import-seam.ts(81,71): error TS7006: Parameter 'ctx' implicitly has an 'any' type.
packages/cms src/forms/__tests__/submission-ip-retention.dialects.test.ts(67,16): error TS2339: Property 'execute' does not exist on type 'ContentKernel'.
packages/cms src/forms/__tests__/submission-ip-retention.dialects.test.ts(69,18): error TS2339: Property 'execute' does not exist on type 'ContentKernel'.
packages/cms src/forms/__tests__/submission-ip-retention.dialects.test.ts(72,16): error TS2339: Property 'execute' does not exist on type 'ContentKernel'.
packages/cms src/forms/__tests__/submission-ip-retention.dialects.test.ts(73,16): error TS2339: Property 'execute' does not exist on type 'ContentKernel'.
packages/cms src/forms/__tests__/submission-ip-retention.dialects.test.ts(79,18): error TS2339: Property 'execute' does not exist on type 'ContentKernel'.
packages/cms src/forms/__tests__/submission-ip-retention.dialects.test.ts(82,16): error TS2339: Property 'execute' does not exist on type 'ContentKernel'.
packages/cms src/forms/__tests__/submission-ip-retention.dialects.test.ts(83,16): error TS2339: Property 'execute' does not exist on type 'ContentKernel'.
packages/cms src/forms/__tests__/submission-ip-retention.dialects.test.ts(84,16): error TS2339: Property 'execute' does not exist on type 'ContentKernel'.
packages/cms src/forms/__tests__/submission-ip-retention.dialects.test.ts(85,16): error TS2339: Property 'execute' does not exist on type 'ContentKernel'.
packages/cms src/forms/__tests__/support/forms-tables.fixture.ts(15,29): error TS2741: Property 'execute' is missing in type 'StorageKernel<Kysely<DB>, DB>' but required in type 'FormsTablesKernel'.
packages/cms src/forms/__tests__/support/repo-ports.fixture.ts(39,29): error TS2739: Type 'StorageKernel<Kysely<DB>, DB>' is missing the following properties from type 'KyselyKernel<DB>': query, execute
packages/ui src/features/charts/__tests__/provider-edges.test.tsx(18,20): error TS2345: Argument of type '{ element: HTMLDivElement; spec: ChartSpec; theme: { mode: "light"; tokens: {}; }; }' is not assignable to parameter of type 'ChartRenderInput & { readonly element: HTMLElement; readonly applyTh
packages/ui src/features/panel-kit/hooks/__tests__/use-bounded-status-poll.hooks.test.tsx(10,38): error TS2307: Cannot find module '../use-bounded-status-poll.hooks.js' or its corresponding type declarations.
packages/ui src/features/panel-kit/hooks/__tests__/use-bounded-status-poll.hooks.test.tsx(37,26): error TS7031: Binding element 'status' implicitly has an 'any' type.
packages/ui src/features/panel-kit/hooks/__tests__/use-optimistic-stored-value.hooks.test.tsx(11,64): error TS2307: Cannot find module '../use-optimistic-stored-value.hooks.js' or its corresponding type declarations.
packages/ui src/features/panel-kit/hooks/__tests__/use-optimistic-stored-value.hooks.test.tsx(71,30): error TS7006: Parameter 'previous' implicitly has an 'any' type.
packages/ui src/features/panel-kit/hooks/__tests__/use-optimistic-stored-value.hooks.test.tsx(72,30): error TS7006: Parameter 'previous' implicitly has an 'any' type.
packages/ui src/features/panel-kit/hooks/__tests__/use-standing-draft-autosave.hooks.test.tsx(215,17): error TS2322: Type 'Promise<{ discarded: boolean; }>' is not assignable to type 'Promise<void>'.
packages/ui src/features/panel-kit/hooks/__tests__/use-standing-draft-autosave.hooks.test.tsx(231,17): error TS2322: Type 'Promise<{ discarded: boolean; }>' is not assignable to type 'Promise<void>'.
packages/provider-plugins src/observability-opentelemetry/opentelemetry.ts(39,44): error TS2459: Module '"./otel-port.js"' declares 'ExporterFactory' locally, but it is not exported.
packages/provider-plugins src/observability-opentelemetry/opentelemetry.ts(39,103): error TS2459: Module '"./otel-port.js"' declares 'TracerProviderFactory' locally, but it is not exported.
packages/provider-plugins src/observability-opentelemetry/opentelemetry.ts(186,18): error TS7031: Binding element 'endpoint' implicitly has an 'any' type.
packages/provider-plugins src/observability-opentelemetry/opentelemetry.ts(195,18): error TS7031: Binding element 'serviceName' implicitly has an 'any' type.
packages/provider-plugins src/observability-opentelemetry/opentelemetry.ts(195,31): error TS7031: Binding element 'exporter' implicitly has an 'any' type.
packages/provider-plugins src/observability-opentelemetry/opentelemetry.ts(209,32): error TS7031: Binding element 'name' implicitly has an 'any' type.
packages/chat src/store/__tests__/types.fixture.ts(22,69): error TS2739: Type 'StorageKernel<Kysely<ChatDatabase>, ChatDatabase>' is missing the following properties from type 'KyselyKernel<ChatDatabase>': query, execute
packages/chat src/store/__tests__/types.fixture.ts(23,50): error TS2739: Type 'StorageKernel<Kysely<ChatDatabase>, ChatDatabase>' is missing the following properties from type 'KyselyKernel<ChatDatabase>': query, execute
packages/chat src/store/runtime/__tests__/chat-expiry-sweep.cov-j2.test.ts(21,40): error TS2739: Type 'StorageKernel<Kysely<ChatDatabase>, ChatDatabase>' is missing the following properties from type 'KyselyKernel<ChatDatabase>': query, execute
packages/chat src/store/runtime/chat-history-store.ts(57,29): error TS2345: Argument of type '{ kernel: StorageKernel<Kysely<ChatDatabase>, ChatDatabase>; scope: ChatOwnerScope; clock: { nowMs: () => number; }; }' is not assignable to parameter of type '{ kernel: KyselyKernel<ChatDatabase>; scope: C
packages/chat src/store/runtime/run-ledger.ts(193,23): error TS2339: Property 'query' does not exist on type 'StorageKernel<Kysely<ChatDatabase>, ChatDatabase>'.
packages/daemon src/http/__tests__/routines.test.ts(787,56): error TS2741: Property 'cursor' is missing in type '{ id: string; limit: number; }' but required in type 'RoutineRunsQuery'.
packages/daemon src/http/__tests__/routines.test.ts(809,56): error TS2741: Property 'cursor' is missing in type '{ id: string; limit: number; }' but required in type 'RoutineRunsQuery'.
packages/daemon src/http/tool-execution-routes.ts(235,87): error TS2379: Argument of type '{ onInternalError: RouteInternalErrorSink | undefined; }' is not assignable to parameter of type 'Pick<ToolExecutionRoutesOptional, "onInternalError">' with 'exactOptionalPropertyTypes: true'. Consider adding 
packages/daemon src/http/xai.ts(796,51): error TS2375: Type 'ResolvedXaiHttpDeps' is not assignable to type 'XaiHttpDeps' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
packages/daemon src/http/xai.ts(797,54): error TS2375: Type 'ResolvedXaiHttpDeps' is not assignable to type 'XaiHttpDeps' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
packages/daemon src/http/xai.ts(798,52): error TS2375: Type 'ResolvedXaiHttpDeps' is not assignable to type 'XaiHttpDeps' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
packages/daemon src/http/xai.ts(799,51): error TS2375: Type 'ResolvedXaiHttpDeps' is not assignable to type 'XaiHttpDeps' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
packages/daemon src/http/xai.ts(800,56): error TS2375: Type 'ResolvedXaiHttpDeps' is not assignable to type 'XaiHttpDeps' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
packages/daemon src/http/xai.ts(801,47): error TS2375: Type 'ResolvedXaiHttpDeps' is not assignable to type 'XaiHttpDeps' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
packages/admin src/seo/react/hooks/MediaRefField.hooks.ts(30,107): error TS2322: Type '({ mimeType }: { mimeType: string; }, _optional?: Record<string, never> | undefined) => string' is not assignable to type '(contentType: string) => string'.
packages/admin src/seo/react/hooks/SeoPage.hooks.ts(12,88): error TS2353: Object literal may only specify known properties, and 'handle' does not exist in type 'TabBarTab'.
packages/admin src/seo/react/hooks/SeoPage.hooks.ts(13,80): error TS2353: Object literal may only specify known properties, and 'handle' does not exist in type 'TabBarTab'.
packages/admin src/seo/react/hooks/SeoPage.hooks.ts(14,86): error TS2353: Object literal may only specify known properties, and 'handle' does not exist in type 'TabBarTab'.
packages/user-management src/admin/__tests__/members.list-cursor.test.ts(28,12): error TS2532: Object is possibly 'undefined'.
examples/neutral-host src/credential-tools.test.ts(87,5): error TS2739: Type '{ ownerOnly: string; instanceRefused: string; unexpectedField: string; notOffered: string; inputNotEmpty: string; keysUnavailable: string; needsInteractive: string; cardTitle: string; siteLabel: string; ... 6 more ...; can
examples/neutral-host src/credential-tools.test.ts(91,173): error TS2322: Type '({ keyId }: { keyId: string; use: boolean; }) => Promise<void>' is not assignable to type '(required: { keyId: string; use: boolean; }, optional?: Record<string, never> | undefined) => Promise<{ readonly keyId: string; }
```
## Appendix B — Tovu typecheck after installing apps/admin + apps/desktop deps and linking
### apps/admin (30)
```
src/__tests__/fqfix-actions.unit.test.tsx(97,49): error TS2345: Argument of type 'string' is not assignable to parameter of type '{ value: string; }'.
src/__tests__/fqfix-actions.unit.test.tsx(208,49): error TS2345: Argument of type 'string' is not assignable to parameter of type '{ value: string; }'.
src/__tests__/fqfix-editor-reopen.unit.test.tsx(115,31): error TS2345: Argument of type 'string' is not assignable to parameter of type '{ text: string; }'.
src/components/AssistantDock/AssistantDock.tsx(382,22): error TS2774: This condition will always return true since this function is always defined. Did you mean to call it instead?
src/components/AssistantDock/__tests__/resolve-composer-discovery-outcome.unit.test.ts(47,96): error TS2322: Type '(argument: string | null | undefined) => ComposerHostBinding' is not assignable to type '(required: { argument: string | null | undefined; }, optional?: Record<string, never> | undefine
src/components/AssistantDock/__tests__/use-routed-a2ui-surface-card.hooks.unit.test.tsx(101,66): error TS2345: Argument of type '{ onAgentAction: Mock<Procedure>; name: string; events: never[]; runStreaming: boolean; runSucceeded: boolean; runId: string; }' is not assignable to parameter of type 'A2
src/components/AssistantDock/__tests__/use-routed-a2ui-surface-card.hooks.unit.test.tsx(111,66): error TS2345: Argument of type '{ onAgentAction: Mock<Procedure>; name: string; events: never[]; runStreaming: boolean; runSucceeded: boolean; runId: string; }' is not assignable to parameter of type 'A2
src/components/AssistantDock/__tests__/use-routed-a2ui-surface-card.hooks.unit.test.tsx(120,66): error TS2345: Argument of type '{ name: string; events: never[]; runStreaming: boolean; runSucceeded: boolean; runId: string; }' is not assignable to parameter of type 'A2uiSurfaceCardProps'.
src/components/AssistantDock/__tests__/use-routed-a2ui-surface-card.hooks.unit.test.tsx(127,66): error TS2345: Argument of type '{ onAgentAction: (_runId: string | undefined, action: unknown) => void; name: string; events: never[]; runStreaming: boolean; runSucceeded: boolean; runId: string; }' is n
src/components/AssistantDock/__tests__/use-routed-a2ui-surface-card.hooks.unit.test.tsx(145,81): error TS2345: Argument of type '{ events: unknown[]; name: string; runStreaming: boolean; runSucceeded: boolean; runId: string; }' is not assignable to parameter of type 'A2uiSurfaceCardProps'.
src/components/AssistantDock/__tests__/use-routed-a2ui-surface-card.hooks.unit.test.tsx(157,81): error TS2345: Argument of type '{ events: unknown[]; name: string; runStreaming: boolean; runSucceeded: boolean; runId: string; }' is not assignable to parameter of type 'A2uiSurfaceCardProps'.
src/components/AssistantDock/__tests__/use-routed-a2ui-surface-card.hooks.unit.test.tsx(168,66): error TS2345: Argument of type '{ events: { createSurface: { surfaceId: string; }; }[]; name: string; runStreaming: boolean; runSucceeded: boolean; runId: string; }' is not assignable to parameter of typ
src/components/__tests__/AssistantDock.chat-settings.unit.test.tsx(140,64): error TS2345: Argument of type '{ load: () => Promise<{ toolCalls: ChatToolCallDisplay; showUsageLine: boolean; showThinking: boolean; }>; save: (next: ChatDisplayPreferences) => Promise<...>; subscribeToSettingsRefresh: () 
src/components/__tests__/AssistantDock.unit.test.tsx(893,19): error TS18046: 'element.props.clock' is of type 'unknown'.
src/features/pages/__tests__/editor-html-jump.unit.test.ts(122,97): error TS2345: Argument of type '{} | undefined' is not assignable to parameter of type 'number'.
src/features/pages/hooks/__tests__/theme-canvas-dependencies.unit.test.ts(37,58): error TS2345: Argument of type 'string' is not assignable to parameter of type '{ url: string; }'.
src/features/pages/hooks/__tests__/theme-canvas-dependencies.unit.test.ts(38,58): error TS2345: Argument of type 'string' is not assignable to parameter of type '{ url: string; }'.
src/features/pages/hooks/__tests__/theme-canvas-dependencies.unit.test.ts(62,61): error TS2345: Argument of type 'string' is not assignable to parameter of type '{ url: string; }'.
src/features/pages/hooks/__tests__/theme-canvas-dependencies.unit.test.ts(63,61): error TS2345: Argument of type 'string' is not assignable to parameter of type '{ url: string; }'.
src/features/pages/hooks/use-page-editor.hooks.ts(1136,5): error TS2322: Type '() => Promise<{ discarded: boolean; }>' is not assignable to type '() => Promise<void>'.
src/features/plugins/AgentPluginDetailsModal.tsx(41,63): error TS2322: Type '({ pluginId }: { pluginId: string; }, _optional?: {}) => PluginPackageFilesController' is not assignable to type '(pluginId: string) => AgentPluginDetailsModalController'.
src/features/plugins/AgentPluginDetailsModal.tsx(44,92): error TS2345: Argument of type '{ pluginId: string; }' is not assignable to parameter of type 'string'.
src/features/posts/__tests__/posts-i18n.unit.test.ts(158,54): error TS2769: No overload matches this call.
src/features/posts/__tests__/posts-i18n.unit.test.ts(176,54): error TS2769: No overload matches this call.
src/features/posts/__tests__/posts-i18n.unit.test.ts(196,42): error TS2769: No overload matches this call.
src/features/posts/__tests__/posts-i18n.unit.test.ts(240,54): error TS2769: No overload matches this call.
src/features/posts/hooks/use-post-editor.hooks.ts(1006,5): error TS2322: Type '() => Promise<{ discarded: boolean; }>' is not assignable to type '() => Promise<void>'.
src/hooks/__tests__/use-standing-draft-autosave.unit.test.ts(131,17): error TS2322: Type 'Promise<{ discarded: boolean; }>' is not assignable to type 'Promise<void>'.
src/lib/__tests__/browser-stream.unit.test.ts(149,18): error TS2345: Argument of type 'string' is not assignable to parameter of type '{ frame: string; }'.
src/lib/__tests__/browser-stream.unit.test.ts(149,41): error TS2345: Argument of type 'string' is not assignable to parameter of type '{ frame: string; }'.
```
### apps/desktop tsconfig.main (67)
```
src/desktop-agent.ts(482,73): error TS2740: Type 'Pick<ConversationStore, "appendToolGap" | "listToolGaps">' is missing the following properties from type 'ConversationStore': list, create, rename, remove, and 2 more.
src/desktop-agent.ts(487,89): error TS2740: Type 'Pick<ConversationStore, "appendToolGap" | "listToolGaps">' is missing the following properties from type 'ConversationStore': list, create, rename, remove, and 2 more.
src/desktop-agent.ts(487,125): error TS2739: Type 'Pick<AgentExecutor, "run">' is missing the following properties from type 'AgentExecutor': sendUserMessage, claimUserMessages
src/import-handoff-ipc.test.ts(36,16): error TS2322: Type '(channel: string, handler: Handler) => void' is not assignable to type '(channel: string, handler: (event: Pick<IpcMainInvokeEvent, "senderFrame">, raw: unknown) => ImportHandoffResult) => void'.
src/import-handoff-ipc.test.ts(77,16): error TS2322: Type '(channel: string, handler: Handler) => void' is not assignable to type '(channel: string, handler: (event: Pick<IpcMainInvokeEvent, "senderFrame">, raw: unknown) => ImportHandoffResult) => void'.
src/main-shutdown-wiring.test.ts(273,16): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
src/main-shutdown-wiring.test.ts(274,16): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
src/project-ipc-dispatch.test.ts(360,48): error TS2345: Argument of type '{ siteDir: string; }' is not assignable to parameter of type 'string'.
src/project-ipc.test.ts(1030,3): error TS2322: Type '(siteDir: string) => Promise<void>' is not assignable to type '(required: { siteDir: string; ctx: unknown; }) => Promise<unknown>'.
src/project-ipc.test.ts(1143,30): error TS2345: Argument of type '{ siteDir: string; ctx: unknown; }' is not assignable to parameter of type 'PathLike'.
src/project-ipc.test.ts(1144,24): error TS2345: Argument of type '{ siteDir: string; ctx: unknown; }' is not assignable to parameter of type 'string'.
src/workspace-chat-ipc.test.ts(88,26): error TS7031: Binding element 'siteDir' implicitly has an 'any' type.
src/workspace-chat-ipc.test.ts(115,117): error TS2345: Argument of type '(siteDir: string) => null' is not assignable to parameter of type '(input: { siteDir: string; }, options?: Record<string, never> | undefined) => TurnAddressee | null'.
src/workspace-chat-ipc.test.ts(116,109): error TS2345: Argument of type '(siteDir: string) => null' is not assignable to parameter of type '(input: { siteDir: string; }, options?: Record<string, never> | undefined) => TurnAddressee | null'.
src/workspace-conversation-gaps.test.ts(10,132): error TS2349: This expression is not callable.
src/workspace-conversation-gaps.test.ts(10,132): error TS2722: Cannot invoke an object which is possibly 'undefined'.
../website/src/features/agent-plugins/apply-connect-defaults.ts(68,140): error TS2322: Type 'import("/home/user/Tovu/apps/website/src/contracts/headless/plugin-host", { with: { "resolution-mode": "import" } }).AgentPluginLayout' is not assignable to type 'import("/home/user/Jini/packages/agent-plugi
../website/src/features/agent-plugins/host-plugin-guidance.ts(137,32): error TS2532: Object is possibly 'undefined'.
../website/src/features/agent-plugins/host-plugin-guidance.ts(165,16): error TS18048: 'markerFence' is possibly 'undefined'.
../website/src/features/agent-plugins/host-plugin-guidance.ts(165,47): error TS18048: 'markerFence' is possibly 'undefined'.
../website/src/features/agent-plugins/host-plugin-guidance.ts(165,85): error TS18048: 'markerSuffix' is possibly 'undefined'.
../website/src/features/custom-credentials/card-token.ts(30,40): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
../website/src/features/custom-credentials/card-token.ts(31,40): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
../website/src/features/deployments/publish-credentials/store.ts(676,3): error TS2322: Type '{ [x: string]: string | undefined; providerId: string; }' is not assignable to type 'PublishConnectionInput'.
../website/src/features/media-import/fetch-image.ts(177,72): error TS2345: Argument of type 'string' is not assignable to parameter of type '{ value: string; }'.
../website/src/features/members/repo.memory.ts(194,26): error TS2345: Argument of type '{ rows: MemberRecord[]; limit: number; cursor: string | null; positionOf: (member: MemberRecord) => string[]; }' is not assignable to parameter of type '{ rows: readonly MemberRecord[]; limit: number; cursor: str
../website/src/features/members/repo.ts(189,81): error TS2353: Object literal may only specify known properties, and 'size' does not exist in type '{ cursor: string; shape: ListPositionShape; }'.
../website/src/features/pages/hidden-until-script.ts(45,20): error TS2532: Object is possibly 'undefined'.
../website/src/features/pages/hidden-until-script.ts(72,41): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
../website/src/features/pages/hidden-until-script.ts(77,23): error TS2532: Object is possibly 'undefined'.
../website/src/features/pages/hidden-until-script.ts(87,22): error TS2532: Object is possibly 'undefined'.
../website/src/features/pages/hidden-until-script.ts(88,40): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
../website/src/features/pages/hidden-until-script.ts(97,17): error TS2532: Object is possibly 'undefined'.
../website/src/features/post/cover-image.ts(56,21): error TS2345: Argument of type 'T | undefined' is not assignable to parameter of type 'T'.
../website/src/features/publish-content/media-references.ts(46,34): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
../website/src/features/publish-content/media-references.ts(48,15): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
../website/src/features/publish-content/peer-transport.ts(529,30): error TS2345: Argument of type '{ value: { value: unknown; what: string; baseUrl: string; }; }' is not assignable to parameter of type '{ value: unknown; what: string; baseUrl: string; }'.
../website/src/features/site-backup/archive-extensions.ts(46,42): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
../website/src/features/site-backup/archive-extensions.ts(56,87): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
../website/src/features/site-backup/archive-extensions.ts(105,32): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
../website/src/features/site-backup/archive-extensions.ts(108,17): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
../website/src/features/site-backup/archive-extensions.ts(109,36): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
../website/src/features/site-backup/archive-extensions.ts(109,60): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
../website/src/features/site-backup/archive-paths.ts(77,25): error TS2538: Type 'undefined' cannot be used as an index type.
../website/src/features/site-backup/bundled-export-file-policy.ts(40,40): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
../website/src/features/site-backup/bundled-export-file-policy.ts(40,60): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
../website/src/features/site-backup/credential-warnings.ts(24,27): error TS2538: Type 'undefined' cannot be used as an index type.
../website/src/features/site-backup/import-keep-off.ts(35,44): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
../website/src/features/site-backup/import-keep-off.ts(35,74): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
../website/src/features/site-backup/import-keep-off.ts(36,118): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
../website/src/features/site-backup/import-plugin-state.ts(76,43): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
../website/src/features/site-backup/import-plugin-state.ts(77,60): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
../website/src/features/site-backup/import-plugin-state.ts(79,101): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
../website/src/features/site-backup/import-restore-placement.ts(44,71): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
../website/src/features/site-backup/import-restore-placement.ts(44,87): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
../website/src/features/site-backup/import-restore-placement.ts(88,147): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
../website/src/features/site-export/export-html-policy.ts(135,79): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
../website/src/features/site-export/export-html-policy.ts(246,29): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
../website/src/features/site-export/export-html-policy.ts(247,15): error TS2532: Object is possibly 'undefined'.
../website/src/features/site-export/media-original-urls.ts(35,36): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
../website/src/features/site-inspection/live-url.ts(102,21): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
../website/src/features/site-inspection/live-url.ts(102,27): error TS18048: 'rawPath' is possibly 'undefined'.
../website/src/features/site-inspection/page-body.ts(75,22): error TS2532: Object is possibly 'undefined'.
../website/src/features/theme/file-identity-lock.ts(207,80): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
../website/src/features/theme/tool-registrations.ts(562,32): error TS2532: Object is possibly 'undefined'.
../website/src/features/theme/tool-registrations.ts(567,33): error TS2532: Object is possibly 'undefined'.
../website/src/server/runtime/composition/commerce.ts(214,107): error TS2322: Type '(message: string) => void' is not assignable to type '(required: { readonly message: string; }, optional?: { readonly error?: unknown; } | undefined) => void'.
```
### root tsconfig.json = website (46)
```
apps/website/src/assistant/external-mcp-connection-source.ts(157,108): error TS2345: Argument of type '{ readonly agentPluginLayout: AgentPluginLayout; readonly workspaceId: string; readonly pluginId: string; readonly serverId: string; readonly url: string; }' is not assignable to parameter of type 
apps/website/src/features/agent-plugins/apply-connect-defaults.ts(68,140): error TS2322: Type 'import("/home/user/Tovu/apps/website/src/contracts/headless/plugin-host", { with: { "resolution-mode": "import" } }).AgentPluginLayout' is not assignable to type 'import("/home/user/Jini/packages/agent-plu
apps/website/src/features/agent-plugins/grant-signed-in-defaults.ts(36,116): error TS2322: Type 'import("/home/user/Tovu/apps/website/src/contracts/headless/plugin-host", { with: { "resolution-mode": "import" } }).AgentPluginLayout' is not assignable to type 'import("/home/user/Jini/packages/agent-p
apps/website/src/features/agent-plugins/update-effects.ts(32,46): error TS2322: Type 'import("/home/user/Tovu/apps/website/src/contracts/headless/plugin-host", { with: { "resolution-mode": "import" } }).AgentPluginLayout' is not assignable to type 'import("/home/user/Jini/packages/agent-plugins/dist
apps/website/src/features/media-generation/media-provider-registry.ts(148,3): error TS2322: Type '{ label?: {} | null | undefined; id: string; module: string; }' is not assignable to type 'string | ProviderContributionDescriptor'.
apps/website/src/features/media-import/fetch-image.ts(177,72): error TS2345: Argument of type 'string' is not assignable to parameter of type '{ value: string; }'.
apps/website/src/features/members/repo.memory.ts(194,26): error TS2345: Argument of type '{ rows: MemberRecord[]; limit: number; cursor: string | null; positionOf: (member: MemberRecord) => string[]; }' is not assignable to parameter of type '{ rows: readonly MemberRecord[]; limit: number; cursor: s
apps/website/src/features/members/repo.ts(189,81): error TS2353: Object literal may only specify known properties, and 'size' does not exist in type '{ cursor: string; shape: ListPositionShape; }'.
apps/website/src/features/newsletter/repo.memory.ts(59,78): error TS2353: Object literal may only specify known properties, and 'size' does not exist in type '{ cursor: string; shape: ListPositionShape; }'.
apps/website/src/features/newsletter/repo.memory.ts(60,26): error TS2345: Argument of type '{ rows: CampaignRecord[]; limit: number; cursor: string | null; positionOf: (campaign: CampaignRecord) => string[]; }' is not assignable to parameter of type '{ rows: readonly CampaignRecord[]; limit: number;
apps/website/src/features/newsletter/repo.memory.ts(163,78): error TS2353: Object literal may only specify known properties, and 'size' does not exist in type '{ cursor: string; shape: ListPositionShape; }'.
apps/website/src/features/newsletter/repo.memory.ts(164,26): error TS2345: Argument of type '{ rows: SubscriptionRow[]; limit: number; cursor: string | null; positionOf: (row: SubscriptionRow) => string[]; }' is not assignable to parameter of type '{ rows: readonly SubscriptionRow[]; limit: number; 
apps/website/src/features/newsletter/repo.ts(105,89): error TS2353: Object literal may only specify known properties, and 'size' does not exist in type '{ cursor: string; shape: ListPositionShape; }'.
apps/website/src/features/newsletter/repo.ts(311,89): error TS2353: Object literal may only specify known properties, and 'size' does not exist in type '{ cursor: string; shape: ListPositionShape; }'.
apps/website/src/features/publish-content/peer-transport.ts(529,30): error TS2345: Argument of type '{ value: { value: unknown; what: string; baseUrl: string; }; }' is not assignable to parameter of type '{ value: unknown; what: string; baseUrl: string; }'.
apps/website/src/platform/site-dir/local-site-child.ts(128,28): error TS2345: Argument of type 'WatchdogHandle' is not assignable to parameter of type '{ handle: WatchdogHandle; }'.
apps/website/src/server/inbound/admin-http/routes/agent-plugins/set-enabled.ts(148,58): error TS2322: Type 'import("/home/user/Tovu/apps/website/src/contracts/headless/plugin-host", { with: { "resolution-mode": "import" } }).AgentPluginLayout' is not assignable to type 'import("/home/user/Jini/packa
apps/website/src/server/inbound/admin-http/routes/email-templates/routes.ts(80,18): error TS2345: Argument of type 'unknown' is not assignable to parameter of type 'number'.
apps/website/src/server/inbound/admin-http/routes/media/delete.ts(35,9): error TS2322: Type '{ mediaRepo: VersionedMediaRepoPort; entryRefsRepo: EntryRefsRepoPort; postRepo: PostRepoPort; blobRepo: AssetBlobRepoPort; renditionRepo: AssetRenditionRepoPort; blobStore: BlobStorePort; }' is not assignab
apps/website/src/server/inbound/admin-http/routes/publish-content/peers.ts(75,11): error TS18048: 'deps' is possibly 'undefined'.
apps/website/src/server/inbound/admin-http/routes/publish-content/peers.ts(76,13): error TS18048: 'deps' is possibly 'undefined'.
apps/website/src/server/inbound/admin-http/routes/publish-content/peers.ts(77,14): error TS18048: 'deps' is possibly 'undefined'.
apps/website/src/server/inbound/admin-http/routes/publish-content/peers.ts(78,12): error TS18048: 'deps' is possibly 'undefined'.
apps/website/src/server/inbound/admin-http/routes/publish-content/peers.ts(79,12): error TS18048: 'deps' is possibly 'undefined'.
apps/website/src/server/inbound/admin-http/routes/publish-content/peers.ts(112,63): error TS2345: Argument of type 'PublishContentRouteDeps' is not assignable to parameter of type 'Record<string, never>'.
apps/website/src/server/inbound/admin-http/routes/publish-content/peers.ts(129,63): error TS2345: Argument of type 'PublishContentRouteDeps' is not assignable to parameter of type 'Record<string, never>'.
apps/website/src/server/inbound/admin-http/routes/widgets/preview.ts(25,7): error TS2339: Property 'post' does not exist on type '{ app: Express; deps: RouteDeps; }'.
apps/website/src/server/inbound/admin-http/routes/widgets/preview.ts(25,76): error TS7006: Parameter 'req' implicitly has an 'any' type.
apps/website/src/server/inbound/admin-http/routes/widgets/preview.ts(25,81): error TS7006: Parameter 'res' implicitly has an 'any' type.
apps/website/src/server/inbound/public-http/routes/content/posts/get-by-slug.ts(1,10): error TS2300: Duplicate identifier 'rejectForeignWorkspace'.
apps/website/src/server/inbound/public-http/routes/content/posts/get-by-slug.ts(12,10): error TS2300: Duplicate identifier 'rejectForeignWorkspace'.
apps/website/src/server/inbound/public-http/routes/plugin-contributions.ts(126,65): error TS7053: Element implicitly has an 'any' type because expression of type 'any' can't be used to index type 'PluginRouteAuthPorts'.
apps/website/src/server/runtime/boot/mail-provider-catalog.ts(81,155): error TS2345: Argument of type '{ createSmtpTransport: (config: CreateNodemailerSmtpTransportConfig) => SmtpTransport; workspaceId: UUID; customCredentialRepo: CustomCredentialSetRepoPort; sealer: SecretSealerPort; httpClient: Ht
apps/website/src/server/runtime/boot/mail-provider-catalog.ts(83,212): error TS2322: Type '{ createSmtpTransport: (config: CreateNodemailerSmtpTransportConfig) => SmtpTransport; workspaceId: UUID; customCredentialRepo: CustomCredentialSetRepoPort; sealer: SecretSealerPort; httpClient: HttpClientPort
apps/website/src/server/runtime/composition/app.ts(979,21): error TS2345: Argument of type '{ siteTimeZone: SiteTimeZonePort; galleryMedia: ({ refs, context }: { refs: readonly PageHtmlEmbedRef[]; } & { context: WidgetResolveContext; }) => Promise<...>; ... 6 more ...; contentTypes: InMemoryContentT
apps/website/src/server/runtime/composition/app.ts(1289,5): error TS2322: Type '(scope: { workspaceId: string; postId: string; } | PagesHtmlDocumentStoreScope, options?: { allowedKinds?: ReadonlySet<PostKind> | undefined; }) => InMemoryPagesHtmlDocumentStore' is not assignable to type 'PagesHtmlDocu
apps/website/src/server/runtime/composition/app.ts(1727,49): error TS2322: Type 'NewsletterRouteDeps & Omit<AssistantToolRegistryDeps, "magicLinkPerEmailLimiter" | "listCatalogTools"> & { readonly federatedMcpPresetRegistry?: FederatedMcpPresetRegistry | undefined; }' is not assignable to type 'Tovu
apps/website/src/server/runtime/composition/app.ts(2573,5): error TS2741: Property 'crypto' is missing in type '{ definitionRepo: FormDefinitionRepoPort; submissionRepo: FormSubmissionRepoPort; outbox: OutboxPort; bus: EventBusPort; ... 5 more ...; files: FormFileStorage; }' but required in type 'Su
apps/website/src/server/runtime/composition/commerce.ts(214,107): error TS2322: Type '(message: string) => void' is not assignable to type '(required: { readonly message: string; }, optional?: { readonly error?: unknown; } | undefined) => void'.
apps/website/src/server/runtime/composition/deps.ts(1783,21): error TS2345: Argument of type '{ siteTimeZone: SiteTimeZonePort; galleryMedia: ({ refs, context }: { refs: readonly PageHtmlEmbedRef[]; } & { context: WidgetResolveContext; }) => Promise<...>; ... 8 more ...; contentTypes: SqliteContentT
apps/website/src/server/runtime/composition/deps.ts(2327,5): error TS2322: Type '(scope: { workspaceId: string; postId: string; } | PagesHtmlDocumentStoreScope, options?: { allowedKinds?: ReadonlySet<PostKind> | undefined; }) => PagesHtmlDocumentStore' is not assignable to type 'PagesHtmlDocumentSto
apps/website/src/server/runtime/composition/deps.ts(2949,49): error TS2322: Type 'NewsletterRouteDeps & Omit<AssistantToolRegistryDeps, "magicLinkPerEmailLimiter" | "listCatalogTools"> & { readonly federatedMcpPresetRegistry?: FederatedMcpPresetRegistry | undefined; }' is not assignable to type 'Tov
apps/website/src/server/runtime/composition/form-submissions.ts(53,5): error TS2322: Type '(required: { workspaceId: string; }, optional?: Record<string, never> | undefined) => Promise<FormDestinationRegistry>' is not assignable to type '(workspaceId: string) => Promise<FormDestinationRegistry>'.
apps/website/src/server/runtime/composition/modules/widgets.ts(39,41): error TS2739: Type 'Express' is missing the following properties from type '{ app: Express; deps: RouteDeps; }': app, deps
apps/website/src/server/runtime/composition/plugin-host.ts(70,82): error TS2344: Type 'import("/home/user/Tovu/apps/website/src/contracts/headless/plugin-host", { with: { "resolution-mode": "import" } }).AgentPluginLayout' does not satisfy the constraint 'import("/home/user/Jini/packages/agent-plugi
apps/website/src/server/runtime/composition/tool-catalog-manifest.ts(475,59): error TS2322: Type '{ mcp: { notifyRosterChanged: () => Promise<void>; repo: AgentPluginMcpRepo; classifyError: (input: { error: unknown; }, options?: Record<string, never>) => "validation" | "unconfigured" | "other"; save
```
### tsconfig.tests.json (260; root cause listing = see raw/tovu-tc-tests.txt)
```
     11 apps/website/src/features/post/__tests__/publish-content.test.ts
      7 apps/website/src/server/inbound/admin-http/routes/publish-content/peers.ts
      7 apps/website/src/server/inbound/admin-http/routes/media/__tests__/delete-route.unit.test.ts
      7 apps/website/src/platform/observability/__tests__/fixtures/otel-sdk.ts
      7 apps/website/src/features/widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts
      7 apps/website/src/features/settings/__tests__/publish-content.round-trip.test.ts
      6 apps/website/src/server/inbound/admin-http/routes/media/__tests__/text-route.unit.test.ts
      6 apps/website/src/server/inbound/admin-http/routes/entries/__tests__/entries-route-failures.unit.test.ts
      6 apps/website/src/server/inbound/admin-http/routes/assistant/__tests__/detect-agents-route.test.ts
      6 apps/website/src/features/widgets/__tests__/unit/publish-content.test.ts
      6 apps/website/src/features/members/__tests__/repo.contract.test.ts
      5 apps/website/src/server/inbound/admin-http/routes/fs-files/__tests__/fs-files-route-failures.unit.test.ts
      5 apps/website/src/features/post/__tests__/repo.postgres.test.ts
      5 apps/website/src/features/agent-plugins/__tests__/unit/federate-mcp.unit.test.ts
      5 apps/website/src/assistant/__tests__/external-mcp-connection-source.operator-read-only.test.ts
      4 apps/website/src/server/runtime/composition/app.ts
      4 apps/website/src/features/site-guide/__tests__/facts-profile.test.ts
      4 apps/website/src/features/newsletter/repo.memory.ts
      4 apps/website/src/features/forms/__tests__/repo.dialects.test.ts
      4 apps/website/src/features/agent-plugins/__tests__/unit/bundled-github-activation.unit.test.ts
      3 apps/website/src/server/runtime/composition/deps.ts
      3 apps/website/src/server/inbound/admin-http/routes/widgets/preview.ts
      3 apps/website/src/server/inbound/admin-http/routes/plugins/__tests__/unit/provider-settings-route.unit.test.ts
      3 apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/unit/install-response.unit.test.ts
      3 apps/website/src/server/__tests__/routes/member-oidc-auth.test.ts
      3 apps/website/src/server/__tests__/routes/forms-webhook-fanout.test.ts
      3 apps/website/src/server/__tests__/routes/forms-submit.test.ts
      3 apps/website/src/features/trash/__tests__/trash-item-outcome-errors.test.ts
      3 apps/website/src/features/site-export/__tests__/static-security-headers.test.ts
      3 apps/website/src/features/settings/__tests__/site-title.test.ts
      3 apps/website/src/features/navigation/__tests__/publish-content.test.ts
      3 apps/website/src/features/media/__tests__/mediawidget-where-used.test.ts
      2 apps/website/src/server/runtime/composition/__tests__/commerce-worker.unit.test.ts
      2 apps/website/src/server/runtime/boot/mail-provider-catalog.ts
      2 apps/website/src/server/inbound/public-http/routes/site/__tests__/member-pages.route.test.ts
      2 apps/website/src/server/inbound/public-http/routes/content/posts/get-by-slug.ts
      2 apps/website/src/server/inbound/public-http/routes/__tests__/integration/plugin-contributions.auth.integration.test.ts
      2 apps/website/src/server/inbound/admin-http/routes/media/__tests__/replace-route.unit.test.ts
      2 apps/website/src/server/inbound/admin-http/routes/assistant/__tests__/connection-probe-ssrf.test.ts
      2 apps/website/src/features/widgets/__tests__/unit/create-core-resolvers.unit.test.ts
```
## Appendix C — Jini guard output: see raw/jini-gate-*.txt (153 guard violations: N1 52, N2 50, L3 17, SI-domain 16, HW3 14, R13 7, HW1 1, R10 1, injection-debt-stale 1)
## Appendix D — Tovu website changed-test failures (all runs)
```
ENV-native/browser	apps/website/src/features/site-evidence/__tests__/integration/playwright-browser.integration.test.ts	
ENV-native/browser	apps/website/src/platform/db/sqlite/__tests__/content-db-readonly.unit.test.ts	AssertionError [ERR_ASSERTION]: Got unwanted exception.
ENV-postgres	apps/website/src/cli/__tests__/integration/storage-move.postgres.test.ts	Error: failed to drop fixture database "tovu_storage_move_cli_test": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory
ENV-postgres	apps/website/src/features/database-transfer/__tests__/tool-registrations.postgres.test.ts	Error: postgres: psql request failed
ENV-postgres	apps/website/src/features/entries/__tests__/integration/repo.compare-and-set.postgres.test.ts	Error: failed to drop fixture database "tovu_entry_cas_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory
ENV-postgres	apps/website/src/features/entries/__tests__/integration/unreadable-owner-entries-repair.postgres.test.ts	Error: failed to drop fixture database "tovu_unreadable_owner_entries_repair_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or dir
ENV-postgres	apps/website/src/features/external-mcp/__tests__/access-choice.postgres.test.ts	Error: failed to drop fixture database "tovu_external_mcp_choice_test": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory
ENV-postgres	apps/website/src/features/external-mcp/__tests__/external-mcp-frozen-db.postgres.test.ts	Error: failed to drop fixture database "tovu_external_mcp_frozen_test": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory
ENV-postgres	apps/website/src/features/identity/__tests__/passkeys.real-postgres.test.ts	Error: failed to drop fixture database "tovu_passkeys_6513": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory
ENV-postgres	apps/website/src/features/members/__tests__/member-external-identities.contract.ts	Error: failed to drop fixture database "tovu_member_external_identities_contract": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory
ENV-postgres	apps/website/src/features/members/__tests__/member-external-identities.postgres.test.ts	Error: failed to drop fixture database "tovu_member_external_identities_contract": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory
ENV-postgres	apps/website/src/features/navigation/__tests__/repo.compare-and-set.postgres.test.ts	Error: failed to drop fixture database "tovu_menu_cas_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory
ENV-postgres	apps/website/src/platform/db/__tests__/seed-content-store.postgres.test.ts	
ENV-postgres	apps/website/src/platform/db/kernel/__tests__/kernel.postgres.test.ts	
ENV-postgres	apps/website/src/platform/db/kernel/__tests__/ops.postgres.test.ts	
ENV-postgres	apps/website/src/platform/db/kernel/__tests__/postgres-pool-error.postgres.test.ts	✖ apps/website/src/platform/db/kernel/__tests__/postgres-pool-error.postgres.test.ts
ENV-postgres	apps/website/src/platform/db/migrations/__tests__/archive-legacy-commerce.postgres.test.ts	
ENV-postgres	apps/website/src/platform/db/migrations/__tests__/commerce-catalog-step.test.ts	Error: connect ENOENT /tmp/.s.PGSQL.5432
ENV-postgres	apps/website/src/platform/db/migrations/__tests__/postgres-baseline.test.ts	
ENV-postgres	apps/website/src/platform/db/migrations/__tests__/runner.postgres.test.ts	
ENV-postgres	apps/website/src/server/runtime/composition/__tests__/move-site-storage.postgres.test.ts	
IMPORT-ERROR	apps/website/src/features/site-export/__tests__/hosted-forms-static.unit.test.ts	Error: Cannot find module '/home/user/Tovu/node_modules/@jini-ai/provider-plugins/plugins/google-forms/0.7.1/jini.plugin.json'
IMPORT-ERROR	apps/website/src/server/runtime/composition/__tests__/commerce.integration.test.ts	Error: Cannot find module '/home/user/Tovu/node_modules/@jini-ai/provider-plugins/plugins/payments-stripe/0.7.1/jini.plugin.json'
IMPORT-ERROR+ENV-postgres	apps/website/src/server/inbound/public-http/routes/commerce/__tests__/settlement.integration.test.ts	Error: Cannot find module '/home/user/Tovu/node_modules/@jini-ai/provider-plugins/plugins/payments-stripe/0.7.1/jini.plugin.json'
OTHER	apps/website/src/assistant/__tests__/moved-tools.golden.test.ts	AssertionError [ERR_ASSERTION]: catalog
OTHER	apps/website/src/assistant/__tests__/tool-registrations.plugins-set-enabled-families.test.ts	AssertionError [ERR_ASSERTION]: The input did not match the regular expression /confirmation/i. Input:
OTHER	apps/website/src/contracts/core/events/__tests__/jini-outbox-parity.test.ts	AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
OTHER	apps/website/src/contracts/core/events/__tests__/outbox-retry-policies.unit.test.ts	AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
OTHER	apps/website/src/features/agent-plugins/__tests__/unit/a10d-remaining-seams.unit.test.ts	AssertionError [ERR_ASSERTION]: The input did not match the regular expression /storage failed/. Input:
OTHER	apps/website/src/features/agent-plugins/__tests__/unit/activation-lock-busy.unit.test.ts	AssertionError [ERR_ASSERTION]: The input did not match the regular expression /write lock/. Input:
OTHER	apps/website/src/features/agent-plugins/__tests__/unit/connect-tool.api-connections.unit.test.ts	TypeError [Error]: Invalid URL
OTHER	apps/website/src/features/agent-plugins/__tests__/unit/mcp-projection-seam.distinct-ports.unit.test.ts	TypeError [Error]: Cannot read properties of undefined (reading 'toLowerCase')
OTHER	apps/website/src/features/agent-plugins/__tests__/unit/tool-registrations.unit.test.ts	Error [ToolInputError]: The plugin is on, but 'supabase' could not load its approved tools. Request plugins_set_enabled again to retry. Details: Cannot read properties of undefined (reading 'toLowerCa
OTHER	apps/website/src/features/custom-credentials/__tests__/form-save-errors.model-facing.test.ts	AssertionError [ERR_ASSERTION]: The input did not match the regular expression /credential_save: save failed .*error=CustomCredentialSecretStoreUnconfiguredError/. Input:
OTHER	apps/website/src/features/custom-credentials/__tests__/tool-registrations.model-facing-errors.test.ts	✖ a transport failure stays redacted — its message can carry an internal address (27.68224ms)
OTHER	apps/website/src/features/media-generation/__tests__/providers-tools.test.ts	AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
OTHER	apps/website/src/features/origin/__tests__/configured-origin.test.ts	AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
OTHER	apps/website/src/features/post/__tests__/tool-registrations.model-facing-errors.test.ts	AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
OTHER	apps/website/src/features/source-control/__tests__/tool-registrations.unit.test.ts	
OTHER	apps/website/src/features/trash/__tests__/member-adapter.test.ts	TypeError [Error]: (intermediate value).map is not a function
OTHER	apps/website/src/platform/db/migrations/__tests__/migrated-copy.test.ts	AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
OTHER	apps/website/src/platform/db/sqlite/__tests__/share-database.integration.test.ts	AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
OTHER	apps/website/src/server/__tests__/assistant-byok-routes.test.ts	
OTHER	apps/website/src/server/__tests__/assistant-proxy-routes.test.ts	
OTHER	apps/website/src/server/inbound/admin-http/routes/seo/__tests__/put-entry.test.ts	AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
OTHER	apps/website/src/server/inbound/admin-http/routes/workspace/__tests__/create.test.ts	AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
OTHER	apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.page-navigate-error-rewrap.unit.test.ts	AssertionError [ERR_ASSERTION]: The input did not match the regular expression /const bound = lostFrontendBindings\.wrap\(registration\)/. Input:
OTHER	apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.typed-tools.integration.test.ts	TypeError [Error]: mintRunCredential is not a function
OTHER	apps/website/src/server/runtime/composition/__tests__/agent-plugin-connections.vertical-slice.test.ts	TypeError [Error]: Invalid URL
OTHER	apps/website/src/server/runtime/composition/__tests__/browser-provider.integration.test.ts	AssertionError [ERR_ASSERTION]: the reviewed bundled provider initializes without integrity warnings
OTHER	apps/website/src/server/runtime/composition/__tests__/cost-counters.baseline.test.ts	TypeError [Error]: Invalid URL
OTHER	apps/website/src/server/runtime/composition/__tests__/external-mcp-oauth-loopback-wiring.unit.test.ts	AssertionError [ERR_ASSERTION]: ../../../inbound/assistant/agent-daemon-server.ts must have one OAuth ports call
OTHER	apps/website/src/server/runtime/composition/__tests__/form-delivery-vertical-slice.integration.test.ts	✖ drain 1: A completes, B is retrying with its next retry time and safe error code (50.5182ms)
OTHER	apps/website/src/server/runtime/composition/__tests__/form-delivery.security.test.ts	AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
OTHER	apps/website/src/server/runtime/composition/__tests__/plugin-host.integration.test.ts	AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
OTHER	apps/website/src/server/runtime/composition/__tests__/sqlite-create-site-app-module-identity.integration.test.ts	AssertionError [ERR_ASSERTION]: sanity: forms analytics, forms notify and webhook fan-out each subscribe once
OTHER	apps/website/src/server/runtime/composition/__tests__/vault-l005-characterization.test.ts	AssertionError [ERR_ASSERTION]: The input did not match the regular expression /VAULT_CATALOG_UNAVAILABLE/. Input:
OTHER+ENV-postgres	apps/website/src/contracts/core/events/__tests__/forms-notification-restart.integration.test.ts	AssertionError [ERR_ASSERTION]: The input did not match the regular expression /outcome is unknown/. Input:
```
## Appendix E — Tovu desktop node:test failures
```
ENV-native/browser	src/e2e-harness-import.test.ts	AssertionError [ERR_ASSERTION]: Downloading Electron binary...
IMPORT-ERROR	src/speech/mac-on-device-transcriber.test.ts	Error: Cannot find module '/home/user/Tovu/apps/desktop/node_modules/@jini-ai/desktop-host/dist/speech/macos/speech-helper.swift'
IMPORT-ERROR	src/speech/native-speech-adapter.test.ts	Error: Cannot find module '/home/user/Tovu/apps/desktop/node_modules/@jini-ai/desktop-host/dist/speech/macos/speech-helper.swift'
OTHER	src/auto-update-controller.test.ts	AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
OTHER	src/find-menu.test.ts	AssertionError [ERR_ASSERTION]: The input did not match the regular expression /onFindToggle:[^\n]*\n?\s*subscribe[^\n]*FIND_TOGGLE_CHANNEL, listener\)/. Input:
OTHER	src/jini-mcp-peers.test.ts	AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
OTHER	src/main-agent-runtime-wiring.test.ts	.catch((error: unknown) => console.error(`[tovu-desktop] agent service shutdown failed: ${error instanceof Error ? error.message : String(error)}`))
OTHER	src/main-shutdown-wiring.test.ts	.catch((error: unknown) => console.error(`[tovu-desktop] agent service shutdown failed: ${error instanceof Error ? error.message : String(error)}`))
OTHER	src/main-theme-preview-wiring.test.ts	AssertionError [ERR_ASSERTION]: the theme-preview IPC must have a sender guard
OTHER	src/main-updater-wiring.test.ts	AssertionError [ERR_ASSERTION]: The input was expected to not match the regular expression /^import .*electron-updater/m. Input:
OTHER	src/project-ipc-dispatch.test.ts	TypeError [ERR_INVALID_ARG_TYPE]: The "path" argument must be of type string. Received an instance of Object
OTHER	src/project-ipc.test.ts	AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
OTHER	src/site-dir-store.test.ts	AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
OTHER	src/site-history-menu.test.ts	AssertionError [ERR_ASSERTION]: The input did not match the regular expression /onSiteHistory:[^\n]*\n?\s*subscribe\(SITE_HISTORY_CHANNEL, listener\)/. Input:
OTHER	src/site-process-registry.test.ts	AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
OTHER	src/tracked-sites.test.ts	AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
OTHER	src/workspace-chat-ipc.test.ts	AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
OTHER	src/workspace-conversation-gaps.test.ts	✖ desktop gap revisions persist with conversations and survive later message saves (1.498111ms)
OTHER	src/zoom-menu.test.ts	AssertionError [ERR_ASSERTION]: The input did not match the regular expression /onZoomCommand:[^\n]*\n?\s*subscribe[^\n]*ZOOM_COMMAND_CHANNEL, listener\)/. Input:
OTHER	src/renderer/site-card-actions-wiring.test.ts	
OTHER	src/renderer/websites-width.test.ts	
```
## Appendix F — admin vitest failed files (targeted run, 115): raw/admin-failfiles.txt
