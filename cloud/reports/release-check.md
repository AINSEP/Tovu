# RELEASE-CHECK — `cloud/combine` (Tovu `f4b2d1531`, Jini `60807a9ca`)

Run 2026-11-09, 05:35–07:56 UTC, cloud container: 4 cores, 16 GB, no swap, **no Postgres, no IPv6, no Chromium headless shell** (Playwright looks for `/opt/pw-browsers/chromium_headless_shell-1228`, which is not installed), running as **root**. Node v24.22.2, pnpm 10.33.2. Tovu ran with Jini **linked** (`npm run link:jini` → 79 symlinks to the Jini checkout at `60807a9ca`, freshly built). Report only — nothing was fixed.

Raw output and per-lane digests: `cloud/reports/raw/` (`*-digest.md` hold each lane's own write-up; `tovu-web-shard<N>.tap.txt` are the TAP streams the appendix below was generated from).

## Verdict

- **Jini**: 52,046 tests pass, **3 fail** (all stale tests); tsc clean in all 39 packages + root scripts; **`pnpm guard` fails 1 rule** (R10, `ChatPane.tsx` imports an `Icon` not in the public barrel). None of these were introduced by the merge.
- **Tovu**: type-check (root + e2e) **passes with Jini linked**, as expected. Website suite 34,203 pass / **188 fail** / 19 cancelled; ~151 of the failures are environment (no Postgres / no Chromium / missing generated dirs). That leaves **58 non-environment website rows (9 gate/ratchet product bugs, 18 stale tests, 31 unclear), 1 admin, 6 desktop**, plus the static-gate results below. Nearly all are stale tests or ratchet gates catching drift; several are **unclear** and need a human look (list in §4).
- **Previous commit**: every merge here is tiny vs. its first parent — Tovu `f4b2d1531` changes only `apps/website/src/assistant/batch-tool-inputs.ts`, `features/media-import/__tests__/import-local-file.test.ts` (passes) and a report; Jini `60807a9ca` changes only `packages/daemon/src/{tool-executor.ts,tool-recovery/*}` + their tests (pass). No failing test touches those files, so **every failure below is inferred to fail on the previous commit as well**. That inference was not confirmed by re-running on the parents (not cheap: it needs a second full install + Jini build); the guard violation and the three Jini failures were confirmed by `git show`/`git log` on the parent.

## 1. Suites

| # | suite | command (capped) | pass | fail | skip | other | duration |
|---|---|---|---|---|---|---|---|
| 1 | Jini tests, lane J1 (19 pkgs: ui, cms, core, mcp, integrations, commerce, plugins, vibecoding, search, sidecar, sqlite, registry, protocol, analytics, artifacts, infra, plugin-catalog, plugin-fixture-provider, memory) | per pkg `vitest run --maxWorkers=2 --minWorkers=1` (commerce: its 3 parts) | 22,865 | 0 | 3 | — | ~780 s (sum) |
| 2 | Jini tests, lane J2 (21 pkgs: chat, admin, daemon, agent-runtime, platform, db, user-management, desktop-host, agentic, devops, diagnostics, provider-plugins, oauth, http-kit, server, ui-kit, capability-providers, cookie-consent, sandbox, agent-plugins, cli) | same | 29,181 | 3 | 12 | — | ~1,352 s (sum) |
| 3 | Jini type-check | each pkg's `typecheck` + `tsc -p scripts/tsconfig.json` | 40/40 configs clean | 0 errors | 2 pkgs have no typecheck script (plugin-catalog, plugin-fixture-provider) | — | ~5 min |
| 4 | Jini `pnpm guard` | — | — | **1 violation** | — | — | <1 min |
| 5 | Tovu website node:test, shard 1/8 | `--test-concurrency=1 --test-timeout=300000`, 384 files | 4,065 | 27 | 7 | 0 cancelled | 2,473 s |
| 6 | shard 2/8 | 384 files | 4,095 | 19 | 0 | 19 cancelled | 1,878 s |
| 7 | shard 3/8 | 384 files | 4,291 | 36 | 8 | 0 | 1,866 s |
| 8 | shard 4/8 | 383 files | 4,821 | 21 | 3 | 0 | 1,880 s |
| 9 | shard 5/8 | 383 files | 3,907 | 9 | 2 | 0 | 1,722 s |
| 10 | shard 6/8 | 383 files | 4,279 | 7 | 5 | 0 | 1,709 s |
| 11 | shard 7/8 | 383 files | 4,239 | 48 | 6 | 0 | 1,849 s |
| 12 | shard 8/8 | 383 files | 4,506 | 21 | 5 | 0 | 2,251 s |
| | **website total** (3,067 files = the `npm test` globs) | | **34,203** | **188** | **36** | **19 cancelled** | |
| 13 | Tovu admin vitest | `vitest run --maxWorkers=2` (vitest 4.1.11), 883 files | 14,341 | 1 | 2 | — | 1,290 s |
| 14 | Tovu desktop `build:preload` | — | ok | — | — | — | ~1 s |
| 15 | Tovu desktop tests, main process | `--test-concurrency=2` | 2,216 | 4 | 10 | 0 | 98 s |
| 16 | Tovu desktop tests, renderer + contracts | `--test-concurrency=2` | 906 | 3 | 0 | 0 | 118 s |

## 2. Jini failures (all also fail on the previous commit — the merge does not touch these packages)

| test | first error line | class | evidence |
|---|---|---|---|
| `packages/chat/src/react/features/chat-pane/__tests__/hooks/useChatPaneAgentControl.test.tsx` › useChatPaneAgentControl — chat.send_message goes through the pane guard › refuses to send while a run is streaming, with a reason instead of a silent bypass | `AssertionError: expected [Function] to throw error matching /streaming/ but got 'cannot send: A reply is still running…'` | stale test | copy deliberately changed in `3b6f5ed8` (rules.ts:204 "A reply is still running. Stop it first."); refusal still happens |
| `packages/platform/src/__tests__/source-boundaries.test.ts` › platform source never references host source paths or aliases | `AssertionError: expected [ Array(1) ] to deeply equal []` (offender `src/__tests__/fetch-with-timeout.test.ts`) | product bug (neutrality leak in a test fixture) | `fetch-with-timeout.test.ts:139` fixture URL `archive.tovu.zip` contains the forbidden host token; added in `5b8d747a` |
| `packages/agent-plugins/src/lifecycle/__tests__/unit/load-supporting-files.unit.test.ts` › enable, load and supporting reads share admission after loading, including revocation and refused files | `AssertionError: expected { status: 'loaded', … } to deeply equal { status: 'already-loaded', … }` | stale test | `already-loaded` removed on purpose in `7f730e4b` "return complete guidance on every explicit read" |
| `pnpm guard` R10-chatpane-public-surface | `packages/chat/src/react/features/chat-pane/components/ChatPane.tsx: imports "Icon" from "../../../components/Icon.js" … but "Icon" is not in the public barrel's export list (packages/chat/src/react/index.ts)` | product bug (gate) | import present on the parent commit too (`git show 60807a9c^:…ChatPane.tsx`), last touched in `3b6f5ed8` |

Jini skips (15) are environment-gated by design: commerce `postgres.vitest.test.ts` (`COMMERCE_PG_URL` unset), sidecar ×2 `skipIf(isRoot)`, and package-level skips in chat, daemon, agent-runtime, platform ×6, desktop-host, server, agent-plugins ×2 (reasons not inspected). Guard also printed "R13 MF3 skipped for codex/agy: binaries missing" (environment).

## 3. Tovu admin + desktop failures

| test | first error line | class | evidence |
|---|---|---|---|
| `apps/admin/src/__tests__/unit/chat-fab-z-order-css.unit.test.ts` › chat FAB z-order › sits above every in-page layer; only blocking modals and their popovers go higher | `AssertionError: expected [ Array(1) ] to deeply equal []` — `admin-failure-notice.css .admin-failure-notice z-index: 1000` | stale test (or product bug — owner decision) | new `AdminFailureNotice` layer at z-index 1000 is not in the test's ABOVE_FAB allowlist (test lines 20–28) |
| `apps/desktop/src/main-agent-runtime-wiring.test.ts` › quit waits for owned runtime disposal even without sites and disposes once across repeated quits | `ReferenceError: stopRunningImports is not defined` | stale test | `main/index.ts:1098` now calls `stopRunningImports()` in before-quit; the test's `vm.runInNewContext` sandbox does not provide it (added by `e80fe81a5`) |
| `apps/desktop/src/main-shutdown-wiring.test.ts` › before-quit waits on in-flight teardowns, not only on openSites | `ReferenceError: stopRunningImports is not defined` | stale test | same |
| `apps/desktop/src/main-shutdown-wiring.test.ts` › Quit during a card Stop waits for its tracked teardown after openSites becomes empty | `ReferenceError: stopRunningImports is not defined` | stale test | same |
| `apps/desktop/src/runner-ipc-stubs.test.ts` › every channel the contracts declare has a stub or a real handler | `Expected values to be strictly deep-equal` — missing `runner:sites:import-archive`, `runner:sites:cancel-import` | stale test | both declared in `contracts/project.ts:229,231` and handled in `project-ipc.ts:66-67`; missing from the test's IMPLEMENTED_CHANNELS (line 66) |
| `apps/desktop/src/renderer/sites-home-view.test.ts` › an open tab on Projects shows that site's workspace, in tab order | `Expected values to be strictly deep-equal` — extra `showImportPage: false` | stale test | view state gained `showImportPage` with the import page feature |
| `apps/desktop/src/renderer/websites-width.test.ts` › Websites fits at 375px with every nav control and header action inside the page | `browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1228/…` | environment (no Chromium headless shell) | — |
| `apps/desktop/src/renderer/websites-width.test.ts` › narrow collapsed multi-tab content fills the dialog, and the desktop single-tab dialog uses its one column | same | environment | — |

## 4. Tovu website failures — non-environment, grouped by cause

Every failing website test is listed individually, with its first error line and class, in the **Appendix**. This section gives the evidence per cause for the ones that are not environment.

**Product bug — a gate/ratchet catches real drift (9)**
- `worker-import-graph.test.ts` ×4 (handlebars-worker / liquid-worker: "no @jini-ai package roots" and "loads no database, blob-store or agent packages") — `@jini-ai/cms` dist `core/form-collection.js` imports the `@jini-ai/core` root barrel. A Jini-side regression seen through Tovu.
- `no-raw-sqlite.boundary.test.ts` — new raw SQLite JSON in `features/project-keys/attachments.ts` (0→2) and `server/runtime/composition/project-store.ts` (0→3).
- `vendor-neutrality.test.ts` › no generic seam file names the first provider — `features/agent-plugins/bundled-catalog.ts:43,44`, `features/api-connections/shared-owner.ts:81`.
- `no-vendor-in-core.boundary.test.ts` — uncovered vendor counts (e.g. `apps/admin/src/lib/admin-nav-i18n.ts` commerce 22, `bundled-catalog.ts` commerce/composio/formspree/charts-recharts; anthropic 100→121, google 13→159). Could equally be an un-updated reviewed-exceptions list.
- `mcp-ui-allowlist-completeness.test.ts` — `cli/commands/import-local.ts:151` calls `surfaceExchanges.open(...)` with a toolId the scan cannot resolve.
- `check-idle-motion.test.ts` — bare `setInterval(` at `apps/desktop/src/main/index.ts:994`, and a stale allowlist entry `.card.is-starting .state__dot` in `apps/desktop/src/renderer/app.css`.

**Stale test (18)**
- `agent-daemon-site-tools.unit.test.ts` › plugin preflight… — `ZodError pluginIds Required`: the fake response (test line 139) lacks the now-required `pluginIds` (`agent-daemon-site-tools.ts:23`).
- `process-root-parity.test.ts` › daemon dev mode passes bypass… — `ReferenceError: pluginIds is not defined`: evaluated daemon source now references `pluginIds` (same change).
- `assistant-tool-exec.integration.test.ts` › a committed write whose response is dropped is OUTCOME UNKNOWN… — `TypeError: lifecycle.waitForTerminal is not a function`: the test's hand-built `RunLifecycle` fake (line 213) lacks `waitForTerminal`, which Jini's `createDelegatedToolBridge` now calls (not changed by this merge).
- `introspect-command.integration.test.ts` ×2 — new `import-local` command not in the expected list.
- `af-cli-characterization.unit.test.ts` ×2 — `ERR_MODULE_NOT_FOUND …/development/scripts/compose-bundled-agent-plugins.mjs`: the test copies a fixed script subset into a temp dir; `dev.mjs` now imports one more.
- `bundled-agent-plugin-selection.test.ts` — pinned id set gained `commerce`, `formspree`, `google-forms`, `stripe`.
- `bundled-automatic-relevance.unit.test.ts` ×5 — expected `ui-ux-design` (etc.) no longer auto-suggested; actual `['tovu-theme']`. Could be a product regression in relevance — treat as unclear if unsure.
- `assistant-byok.inputs-pin.test.ts` — prompt no longer contains `Relevant agent plugins for this request:` (same family as above).
- `external-mcp-oauth-loopback-wiring.unit.test.ts` — "must have one OAuth ports call; 0 !== 1": source scan of `agent-daemon-server.ts` finds the call moved.
- `route-modules.unit.test.ts` › module 'forms-admin' — extra `GET …/forms/_providers` (exists in `routes/forms/providers.ts`).
- `webhook-delivery-worker.shutdown.test.ts` — timeout message now `fetch timed out after 60ms: https://example.com` (origin only; Jini `5b8d747a` "identify only origins in timeout diagnostics"), test expects the path.
- `packages/sdk/src/__tests__/unit/sdk-public-api.unit.test.ts` — `'^0.6.22' !== '^0.6.17'`: sdk `package.json` pins `@jini-ai/plugins ^0.6.17`, root has `^0.6.22`; the manifests are out of sync.

**Unclear — needs a human look (31 rows)**
- api-connections `Invalid URL` family (15): `agent-plugin-connections.vertical-slice.test.ts` ×8, `surface-adapters.security.test.ts` ×1, `connect-tool.api-connections.unit.test.ts` ×4, `api-connection-slice.test.ts` ×2 — all throw in `new URL(...)` in test support (`__tests__/support/starting-browser.ts:34` / test `showSignIn`), i.e. the sign-in link handed over is not absolute. Either the helper is stale or the product's sign-in handoff link shape changed. Not network-related.
- `dev-auth-boot-owner.unit.test.ts` ×4 (boot redemption rejects missing / disabled / member owner, and an unvalidatable session) — responses are now a generic `INTERNAL_ERROR` instead of `details.failure {step:'auth-boot-session'}`. Looks like a real error-mapping regression rather than copy drift.
- `assistant-daemon-client.unit.test.ts` ×2 — `agent daemon origin requested before ensure() resolved a self-allocated port`.
- `component-catalog-routes.integration.test.ts` — daemon exits: `standalone daemon requires its site binding`.
- `agent-daemon-core-rpc.integration.test.ts` › memory-mode answer reaches CLI launch — `null` vs `'cli-session'`.
- `assistant-byok-routes.test.ts` › byok-turn sends a metadata note then loads guidance — `stub provider respond() threw`.
- `app-federation-reload.observability.test.ts` — no span recorded (`[]` vs `['POST /api/federation/reload']`).
- `sqlite-create-site-app-module-identity.integration.test.ts` — subscription sanity `2 !== 3`.
- `storage-secret.unit.test.ts` › new-site sealing… — child process `no site key: none of the configured sources resolved`.
- `deps-provider-plugin-boot.integration.test.ts` › project store that can't open (EACCES) — expected warning absent; may be root bypassing the permission failure (environment).
- `forms-submit.test.ts` › AC-13 honeypot — expected `FormRateLimitExceededError` not raised; possibly shared limiter state / timing under load.
- `site-title-preservation.integration.test.ts` › AC-12 — in-process Express request timed out; possibly load (3 lanes on 4 cores).
- `serve-export-teardown.integration.test.ts` (file) — child died with `SIGTRAP`.

**Environment (151 rows)**: no Postgres — every `*.postgres.test.ts` / `[postgres]` case, `pg-fixture.unit.test.ts`, `commerce-catalog-step`, `settlement.integration`, `forms-notification-restart`, and the 19 cancelled subtests of `vault-read-parity.postgres` (all `psql … /tmp/.s.PGSQL.5432 … No such file or directory` or `connect ENOENT`); no Chromium headless shell — `playwright-browser.integration`, `render-form-layout` ×3, `preview-switcher-layout` ×7, `owner-passkey-browser`, `owner-passkey-http`; missing generated dirs — `dead-path-sweep.test.ts` ×2 (`development/coverage/`, `ADS-memory/.local-artifacts/` absent in a fresh clone).

**Test pollution found**: the website run wrote untracked files into the working tree — `chat.db` (repo root), `sites/tovu-dev/.form-files-protected-v1`, `sites/tovu-dev/agent-plugins/ws/`. Not committed; some test writes outside its temp dir.

## 5. Tovu static checks

| step | exit | result | duration |
|---|---|---|---|
| type-check root (`tsc -p tsconfig.json`) | 0 | **0 errors — passes with Jini linked** | 38 s |
| type-check e2e (`development/tsconfig.e2e.json`) | 0 | 0 errors | 30 s |
| test type-check (`tsconfig.tests.json`, 6 GB heap) | 2 | **10 errors** | 78 s |
| lint (`biome lint .`) | 1 | **607 errors**, 10,222 warnings, 996 infos (6,979 files) | 12 s |
| architecture (`check:architecture`, module cycles + ratchets) | 1 | **4 hard metrics regressed** | 29 s |
| boundaries + file cycles (`check:boundaries`, dependency-cruiser) | 15 | **15 errors**, 83 warnings (incl. 12 file-level cycles) | 31 s |

None of these touch the files the merge changed (0 hits for `batch-tool-inputs.ts` in every output), so all are inferred to exist on the previous commit as well. In `ci.yml`, `check:boundaries` is `continue-on-error`/report-only and lint is non-blocking; `check:architecture` is the blocking one.

**Test type-check — all 10 errors** (class: stale test — test code lags source types; one line of evidence each):
- apps/website/src/cli/__tests__/integration/import-local.integration.test.ts(27,16): error TS18047: 'result' is possibly 'null'.
- apps/website/src/cli/__tests__/integration/import-local.integration.test.ts(28,32): error TS18047: 'result' is possibly 'null'.
- apps/website/src/cli/__tests__/integration/import-local.integration.test.ts(30,40): error TS18047: 'result' is possibly 'null'.
- apps/website/src/cli/__tests__/integration/import-local.integration.test.ts(31,40): error TS18047: 'result' is possibly 'null'.
- apps/website/src/cli/__tests__/integration/import-local.integration.test.ts(33,35): error TS18047: 'result' is possibly 'null'.
- apps/website/src/cli/__tests__/integration/import-local.integration.test.ts(35,13): error TS18047: 'result' is possibly 'null'.
- apps/website/src/cli/__tests__/integration/import-local.integration.test.ts(35,119): error TS18047: 'result' is possibly 'null'.
- apps/website/src/cli/__tests__/integration/import-local.integration.test.ts(45,30): error TS18047: 'result' is possibly 'null'.
- apps/website/src/features/plugin-runtime/__tests__/unit/set-enabled-confirmation-ui.unit.test.ts(41,266): error TS2353: Object literal may only specify known properties, and 'scope' does not exist in type 'Omit<AccessApprovalResource, "scope">'.
- apps/website/src/server/inbound/admin-http/routes/system/site-imports.integration.test.ts(70,9): error TS2741: Property 'tidy' is missing in type '{ list: (input: { principalId: string; }) => Promise<{ importId: string; source: { url: string; }; newSiteId: null; newSiteName: null; state: "needs-owne
- Evidence: `import-local` result became nullable and the test never narrows (8×); `AccessApprovalResource` no longer takes `scope` (TS2353); `SiteImportBackend` gained `tidy`, missing from the stub (TS2741).

**Architecture — regressed vs `development/scripts/check-architecture.baseline.json`** (class: product bug — structural regression; evidence is the metric diff):
- back-edges into the composition root: 0 → 5 (hard)
- module API surface (files exposed): 821 → 868 (hard)
- **module cycles** (runtime-only mutual pairs, now 6): new `assistant ↔ server`, `features/site-backup ↔ features/source-control`, `platform ↔ server`; removed `assistant ↔ features/agent-plugins`, `features/agent-plugins ↔ features/api-connections`; largest SCC 22 → 61 (hard)
- warnings only: propagation cost runtime-only 3.06 → 3.16; bidirectional hubs 335 → 372. Improved: propagation cost all-import 15.52 → 12.60.
- 118 new cross-feature edges — full list in `raw/tovu-static-digest.md` (check-architecture section).

**Boundaries — all 15 errors** (rule `no-deep-imports:<target>`: from → to; class: product bug — deep import past a module's public seam):
- no-deep-imports:platform/site-dir:^apps/website/src/server/runtime/lifecycle/local-site-process\.ts$: apps/website/src/server/runtime/lifecycle/local-site-process.ts → apps/website/src/platform/site-dir/local-admin-bundle.ts
- no-deep-imports:platform/site-dir: apps/website/src/server/runtime/lifecycle/warm-site-agent.ts → apps/website/src/platform/site-dir/local-site-supervisor.ts
- no-deep-imports:platform/site-dir: apps/website/src/features/site-backup/archive-manifest.ts → apps/website/src/platform/site-dir/schema-guard.ts
- no-deep-imports:features/theme: apps/website/src/server/inbound/public-http/middleware/published-webmcp.ts → apps/website/src/features/theme/visitor-publication.ts
- no-deep-imports:features/theme: apps/website/src/assistant/site/visitor-page-tools.ts → apps/website/src/features/theme/visitor-publication.ts
- no-deep-imports:features/theme: apps/website/src/assistant/site/visitor-frontend-control.ts → apps/website/src/features/theme/visitor-publication.ts
- no-deep-imports:features/theme: apps/website/src/assistant/site/visitor-confirmation-gate.ts → apps/website/src/features/theme/visitor-publication.ts
- no-deep-imports:features/seo: apps/website/src/server/inbound/public-http/routes/site/pages.ts → apps/website/src/features/seo/page-head-contributor.ts
- no-deep-imports:features/post: apps/website/src/features/site-backup/static-download-landing.ts → apps/website/src/features/post/html-plain-text.ts
- no-deep-imports:features/media: apps/website/src/server/inbound/public-http/routes/site/media-rendition.ts → apps/website/src/features/media/access-evidence.ts
- no-deep-imports:features/media: apps/website/src/features/post/repo.ts → apps/website/src/features/media/access-evidence.ts
- no-deep-imports:features/media: apps/website/src/features/post/repo.memory.ts → apps/website/src/features/media/access-evidence.ts
- no-deep-imports:features/media: apps/website/src/features/forms/form-file-maintenance.ts → apps/website/src/features/media/purge-media.ts
- no-deep-imports:features/media: apps/website/src/features/entries/trash-aware-memory-repo.ts → apps/website/src/features/media/access-evidence.ts
- no-deep-imports:features/media: apps/website/src/features/entries/repo.ts → apps/website/src/features/media/access-evidence.ts

**File-level cycles (dependency-cruiser `no-circular`, 12, all warnings)** — four clusters: (a) `features/external-mcp/contracts.ts ↔ external-mcp-shared-oauth.ts`; (b) ring `api-connections/{host,shared-api,contribution,connect,hook-http,byo-client}` ↔ `agent-plugins/{lifecycle,layout,service-ports,supersession,memory}` (8 reported cycles); (c) `agent-plugins/customize-tool.ts ↔ install-tool.ts`; (d) `agent-plugins/connect-sign-in-wait.ts ↔ connect-tool.ts`. Full chains in `raw/tovu-static-digest.md`. Warnings by rule: no-deep-imports:assistant 40, no-circular 12, contracts/headless 11, platform/mail 4, only-composition-constructs-concrete-adapters 3, features/settings 3, taxonomy 2, entries 2, analytics 2, and 1 each of tool-registration-caller:platform/http, tool-registration-caller:assistant, webhooks, navigation.

**Lint — 607 errors**, every one in Appendix B (class: product code-quality debt, not environment; biome's default 20-diagnostic cap truncates `npm run lint` output, so the list was regenerated with `--max-diagnostics=none --diagnostic-level=error`). Top rules: useExhaustiveDependencies 109, useButtonType 70, noAssignInExpressions 64, noSvgWithoutTitle 57, useIterableCallbackReturn 49, useHookAtTopLevel 38, noControlCharactersInRegex 29, noImplicitAnyLet 25, noUnsafeOptionalChaining 24, useKeyWithClickEvents 23, others ≤19. Warnings are counts only: noNonNullAssertion 9,069, noExplicitAny 427, rest in the digest.

## 6. What did not run / caveats

- **No Postgres**: every Postgres-backed test failed at fixture setup rather than being skipped (~136 website rows + 19 cancelled subtests); commerce's Postgres suite in Jini was skipped. The Postgres paths are **untested** by this run.
- **No Chromium headless shell** (`chromium_headless_shell-1228`): 13 website + 2 desktop browser tests failed at launch; browser-rendered behaviour is **untested**.
- **Running as root**: chmod/EACCES-based tests self-skip (~20 skips across suites); `deps-provider-plugin-boot` EACCES case may be affected.
- **Not run at all**: Playwright e2e/journey suites (`e2e:journeys*`), soak/visual suites, `test:cov*` coverage gates and the other `check:*` scripts (inventory, complexity drift, seed-content drift, test-safety, openapi, route coverage…), admin type-check and `admin:build`, Tovu `build` (blocked by design while Jini is linked), Jini `examples/*` tests, `@tovu/contracts`/`@tovu/sdk` beyond what the website globs cover, `npm run complexity` (eslint).
- **Previous-commit status** is inferred from the merge diffs, not re-run (see Verdict).
- **Load**: three lanes shared 4 cores; `site-title-preservation` (timeout) and `forms-submit` AC-13 may be load-sensitive — rerun alone before treating them as bugs.
- My first Jini test run was invalid (runner flag `--maxWorkers` without `--minWorkers` on vitest 2.1.9 crashed every package in <1 s); it was discarded and fully re-run, and only the re-run is reported.

## Appendix A — every failing Tovu website test (generated from the TAP files)

`shard | file | test | class | first error line`. Rows whose test name is a file path are the file-level failure node:test emits for that file. 209 rows; the runner totals are 188 fail + 19 cancelled, and the row count differs slightly because file-level wrapper entries are counted differently.

| shard | file | test | class | first error line |
|---|---|---|---|---|
| 1 | apps/website/src/features/external-mcp/__tests__/access-choice.postgres.test.ts | independent connections cannot both apply an access decision from the same snapshot | environment (no Postgres) | failed to drop fixture database "tovu_external_mcp_choice_test": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 1 | apps/website/src/features/external-mcp/__tests__/access-choice.postgres.test.ts | /home/user/Tovu/apps/website/src/features/external-mcp/__tests__/access-choice.postgres.test.ts | environment (no Postgres) | failed to drop fixture database "tovu_external_mcp_choice_test": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 1 | apps/website/src/features/members/__tests__/member-external-identities.contract.ts | [postgres] identity round-trip is scoped and independent of email or tokens | environment (no Postgres) | failed to drop fixture database "tovu_member_external_identities_contract": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 1 | apps/website/src/features/members/__tests__/member-external-identities.contract.ts | [postgres] both natural keys reserve ownership, including unlinked rows | environment (no Postgres) | failed to drop fixture database "tovu_member_external_identities_contract": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 1 | apps/website/src/features/members/__tests__/member-external-identities.contract.ts | [postgres] an id cannot move ownership, even during explicit reconnect | environment (no Postgres) | failed to drop fixture database "tovu_member_external_identities_contract": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 1 | apps/website/src/features/members/__tests__/member-external-identities.contract.ts | [postgres] unlink survives stale callbacks and is idempotent and workspace-scoped | environment (no Postgres) | failed to drop fixture database "tovu_member_external_identities_contract": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 1 | apps/website/src/features/members/__tests__/member-external-identities.contract.ts | [postgres] explicit connect reuses the marker row and can change the subject | environment (no Postgres) | failed to drop fixture database "tovu_member_external_identities_contract": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 1 | apps/website/src/features/members/__tests__/member-external-identities.contract.ts | [postgres] conflicting concurrent inserts produce exactly one owner | environment (no Postgres) | failed to drop fixture database "tovu_member_external_identities_contract": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 1 | apps/website/src/features/members/__tests__/member-external-identities.contract.ts | [postgres] listing orders multiple providers and active upserts retain a single row | environment (no Postgres) | failed to drop fixture database "tovu_member_external_identities_contract": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 1 | apps/website/src/features/members/__tests__/member-external-identities.contract.ts | [postgres] records cannot mutate storage through input or output references | environment (no Postgres) | failed to drop fixture database "tovu_member_external_identities_contract": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 1 | apps/website/src/features/members/__tests__/member-external-identities.postgres.test.ts | /home/user/Tovu/apps/website/src/features/members/__tests__/member-external-identities.postgres.test.ts | environment (no Postgres) | failed to drop fixture database "tovu_member_external_identities_contract": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 1 | apps/website/src/features/site-evidence/__tests__/integration/playwright-browser.integration.test.ts | observes real rendered evidence from a real page | environment (no Chromium headless shell) | browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell |
| 1 | apps/website/src/platform/db/__tests__/seed-content-store.postgres.test.ts | runner-to-head, then prepare twice: one watermark row, one seeded workspace with its posts and presentation | environment (no Postgres) | failed to drop fixture database "tovu_seed_content_store_pg_fixture_twice": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 1 | apps/website/src/platform/db/__tests__/seed-content-store.postgres.test.ts | a restart never overwrites operator edits: edited, deleted and re-themed rows survive a second prepare byte for byte | environment (no Postgres) | failed to drop fixture database "tovu_seed_content_store_pg_fixture_edits": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 1 | apps/website/src/platform/db/__tests__/seed-content-store.postgres.test.ts | an existing workspace with the seed's SLUG but a different id is never seeded over: no second workspace, no demo posts | environment (no Postgres) | failed to drop fixture database "tovu_seed_content_store_pg_fixture_same_slug": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 1 | apps/website/src/platform/db/__tests__/seed-content-store.postgres.test.ts | two processes booting at once: the second prepare WAITS on the seed lock the first holds, then seeds nothing twice | environment (no Postgres) | failed to drop fixture database "tovu_seed_content_store_pg_fixture_concurrent": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 1 | apps/website/src/platform/site-dir/__tests__/unit/site-key-dependent-data.postgres.test.ts | findSiteKeyDependentData: Postgres (env) site — a clean database is no data; a sealed row is data | environment (no Postgres) | failed to drop fixture database "tovu_site_key_dependent_data_test": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 1 | apps/website/src/platform/site-dir/__tests__/unit/site-key-dependent-data.postgres.test.ts | /home/user/Tovu/apps/website/src/platform/site-dir/__tests__/unit/site-key-dependent-data.postgres.test.ts | environment (no Postgres) | failed to drop fixture database "tovu_site_key_dependent_data_test": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 1 | apps/website/src/server/inbound/assistant/__tests__/agent-daemon-site-tools.unit.test.ts | plugin preflight sends only the live run id and closes after receiving its prepared prefix | stale test | [ |
| 1 | apps/website/src/server/runtime/composition/__tests__/agent-plugin-connections.vertical-slice.test.ts | vertical slice: connect -> public callback -> executable tool call -> admin-surface action, all through the composition | unclear | Invalid URL |
| 1 | apps/website/src/server/runtime/composition/__tests__/agent-plugin-connections.vertical-slice.test.ts | vertical slice: a surface reads status, starts a pick sign-in, takes its callback field once, saves state, and a tool reads it | unclear | Invalid URL |
| 1 | apps/website/src/server/runtime/composition/__tests__/agent-plugin-connections.vertical-slice.test.ts | security: the shared connection port refuses another workspace's target and reads no account for it | unclear | Invalid URL |
| 1 | apps/website/src/server/runtime/composition/__tests__/agent-plugin-connections.vertical-slice.test.ts | security: a token a plugin kept in module scope is withheld in a LATER tool call, surface call and state write (one memory per generation) | unclear | Invalid URL |
| 1 | apps/website/src/server/runtime/composition/__tests__/agent-plugin-connections.vertical-slice.test.ts | security: one token memory across seams: a token a TOOL obtained is withheld from a surface answer | unclear | Invalid URL |
| 1 | apps/website/src/server/runtime/composition/__tests__/agent-plugin-connections.vertical-slice.test.ts | security: one token memory across seams: a token a SURFACE handler obtained is withheld from a tool's output | unclear | Invalid URL |
| 1 | apps/website/src/server/runtime/composition/__tests__/agent-plugin-connections.vertical-slice.test.ts | vendor neutrality end to end: a second provider plugin connects, stores sealed tokens, runs a confirmed write tool, a surface action and a push form delivery | unclear | Invalid URL |
| 1 | apps/website/src/server/runtime/composition/__tests__/agent-plugin-connections.vertical-slice.test.ts | security: the composition gives the assistant's tool registrar and the admin screen's connections ONE frozen-account map, so an admin action the assistant runs is pinned | unclear | Invalid URL |
| 2 | apps/website/src/cli/__tests__/integration/serve-export-teardown.integration.test.ts | apps/website/src/cli/__tests__/integration/serve-export-teardown.integration.test.ts | unclear | test failed |
| 2 | apps/website/src/features/api-connections/__tests__/shared-bindings.postgres.test.ts | PostgreSQL persists only the consumer reference across pools; a copied reference cannot grant access | environment (no Postgres) | failed to drop fixture database "tovu_shared_oauth_binding_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 2 | apps/website/src/features/database-transfer/__tests__/tool-registrations.postgres.test.ts | first copy runs headlessly; replacement waits for Copy; the password never shows | environment (no Postgres) | postgres: psql request failed |
| 2 | apps/website/src/features/database-transfer/__tests__/tool-registrations.postgres.test.ts | Cancel writes nothing, and a used planId is gone | environment (no Postgres) | postgres: psql request failed |
| 2 | apps/website/src/features/database-transfer/__tests__/tool-registrations.postgres.test.ts | the model never passes a connection string: no tool takes one, and the plan asks for the private form first | environment (no Postgres) | postgres: psql request failed |
| 2 | apps/website/src/features/database-transfer/__tests__/tool-registrations.postgres.test.ts | the private form saves a reachable destination, and neither the form, its result nor the log shows the password | environment (no Postgres) | postgres: psql request failed |
| 2 | apps/website/src/features/database-transfer/__tests__/tool-registrations.postgres.test.ts | a malformed or unreachable address is refused in the form, nothing is saved, and the password is never quoted | environment (no Postgres) | postgres: psql request failed |
| 2 | apps/website/src/features/database-transfer/__tests__/tool-registrations.postgres.test.ts | database_transfer_status reports the saved destination, this process's last run and the copy found there | environment (no Postgres) | postgres: psql request failed |
| 2 | apps/website/src/features/database-transfer/__tests__/tool-registrations.postgres.test.ts | /home/user/Tovu/apps/website/src/features/database-transfer/__tests__/tool-registrations.postgres.test.ts | environment (no Postgres) | postgres: psql request failed |
| 2 | apps/website/src/features/navigation/__tests__/repo.compare-and-set.postgres.test.ts | postgres: two writers on the same base version, B blocked on A's row lock — A lands, B gets the version conflict | environment (no Postgres) | failed to drop fixture database "tovu_menu_cas_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 2 | apps/website/src/features/navigation/__tests__/repo.compare-and-set.postgres.test.ts | postgres: two creates of one id, B blocked on A's uncommitted insert — A lands, B gets the version conflict | environment (no Postgres) | failed to drop fixture database "tovu_menu_cas_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 2 | apps/website/src/platform/db/__tests__/parity/vault-read-parity.postgres.test.ts | the transcript covers every golden key and nothing else | environment (no Postgres) | test did not finish before its parent and was cancelled |
| 2 | apps/website/src/platform/db/__tests__/parity/vault-read-parity.postgres.test.ts | site-assistant | environment (no Postgres) | test did not finish before its parent and was cancelled |
| 2 | apps/website/src/platform/db/__tests__/parity/vault-read-parity.postgres.test.ts | personal-execution | environment (no Postgres) | test did not finish before its parent and was cancelled |
| 2 | apps/website/src/platform/db/__tests__/parity/vault-read-parity.postgres.test.ts | media-provider | environment (no Postgres) | test did not finish before its parent and was cancelled |
| 2 | apps/website/src/platform/db/__tests__/parity/vault-read-parity.postgres.test.ts | custom | environment (no Postgres) | test did not finish before its parent and was cancelled |
| 2 | apps/website/src/platform/db/__tests__/parity/vault-read-parity.postgres.test.ts | publish-peer | environment (no Postgres) | test did not finish before its parent and was cancelled |
| 2 | apps/website/src/platform/db/__tests__/parity/vault-read-parity.postgres.test.ts | database-destination | environment (no Postgres) | test did not finish before its parent and was cancelled |
| 2 | apps/website/src/platform/db/__tests__/parity/vault-read-parity.postgres.test.ts | vendor (with the folded publish_credential_sets) | environment (no Postgres) | test did not finish before its parent and was cancelled |
| 2 | apps/website/src/platform/db/__tests__/parity/vault-read-parity.postgres.test.ts | source-control | environment (no Postgres) | test did not finish before its parent and was cancelled |
| 2 | apps/website/src/platform/db/__tests__/parity/vault-read-parity.postgres.test.ts | mcp-env (enabled configs) | environment (no Postgres) | test did not finish before its parent and was cancelled |
| 2 | apps/website/src/platform/db/__tests__/parity/vault-read-parity.postgres.test.ts | mcp-auth (server views) | environment (no Postgres) | test did not finish before its parent and was cancelled |
| 2 | apps/website/src/platform/db/__tests__/parity/vault-read-parity.postgres.test.ts | isolation: a second and an empty workspace see only their own rows | environment (no Postgres) | test did not finish before its parent and was cancelled |
| 2 | apps/website/src/platform/db/__tests__/parity/vault-read-parity.postgres.test.ts | isolation: personal keys stay per principal and per workspace | environment (no Postgres) | test did not finish before its parent and was cancelled |
| 2 | apps/website/src/platform/db/__tests__/parity/vault-read-parity.postgres.test.ts | order: custom-credential and peer lists | environment (no Postgres) | test did not finish before its parent and was cancelled |
| 2 | apps/website/src/platform/db/__tests__/parity/vault-read-parity.postgres.test.ts | order: vendor and source-control lists, defaults first-class | environment (no Postgres) | test did not finish before its parent and was cancelled |
| 2 | apps/website/src/platform/db/__tests__/parity/vault-read-parity.postgres.test.ts | order: MCP server views and enabled configs | environment (no Postgres) | test did not finish before its parent and was cancelled |
| 2 | apps/website/src/platform/db/__tests__/parity/vault-read-parity.postgres.test.ts | vault read parity [postgres] | environment (no Postgres) | failed to drop fixture database "tovu_vault_parity": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 2 | apps/website/src/platform/db/__tests__/parity/vault-read-parity.postgres.test.ts | vendor group default repository lookup: one LIMIT 1 read on the default index, no group scan | environment (no Postgres) | test did not finish before its parent and was cancelled |
| 2 | apps/website/src/platform/db/__tests__/parity/vault-read-parity.postgres.test.ts | publish compatibility selection: one inventory per kind and one selected row read | environment (no Postgres) | test did not finish before its parent and was cancelled |
| 2 | apps/website/src/platform/db/__tests__/parity/vault-read-parity.postgres.test.ts | MCP server list: statement count does not grow with the number of servers | environment (no Postgres) | test did not finish before its parent and was cancelled |
| 2 | apps/website/src/platform/db/__tests__/parity/vault-read-parity.postgres.test.ts | vault hot paths [postgres] | environment (no Postgres) | failed to drop fixture database "tovu_vault_parity": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 2 | apps/website/src/platform/db/__tests__/parity/vault-read-parity.postgres.test.ts | /home/user/Tovu/apps/website/src/platform/db/__tests__/parity/vault-read-parity.postgres.test.ts | environment (no Postgres) | failed to drop fixture database "tovu_vault_parity": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 2 | apps/website/src/platform/site-dir/__tests__/integration/init-site.postgres.test.ts | a Postgres database holding one foreign table is refused by name, before any folder is made | environment (no Postgres) | failed to drop fixture database "tovu_init_site_occupied": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 2 | apps/website/src/platform/site-dir/__tests__/integration/init-site.postgres.test.ts | /home/user/Tovu/apps/website/src/platform/site-dir/__tests__/integration/init-site.postgres.test.ts | environment (no Postgres) | failed to drop fixture database "tovu_init_site_occupied": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 2 | apps/website/src/server/__tests__/assistant-byok-routes.test.ts | /api/admin/v1/assistant/byok-turn sends a metadata note then loads guidance through the real delegated tool surface | unclear | Expected values to be strictly deep-equal: |
| 2 | apps/website/src/server/__tests__/routes/forms-submit.test.ts | POST /forms/:slug/submit: AC-13 — a honeypot-tripped request returns the identical 201 accepted response | unclear | Missing expected rejection (FormRateLimitExceededError). |
| 2 | apps/website/src/server/runtime/composition/__tests__/open-site-store.postgres.test.ts | a failed preparation closes the pool: no session on the site's database survives the rejection | environment (no Postgres) | failed to drop fixture database "tovu_open_site_store_failure": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 2 | apps/website/src/server/runtime/composition/__tests__/open-site-store.postgres.test.ts | /home/user/Tovu/apps/website/src/server/runtime/composition/__tests__/open-site-store.postgres.test.ts | environment (no Postgres) | The "path" argument must be of type string or an instance of Buffer or URL. Received undefined |
| 2 | apps/website/src/server/runtime/composition/modules/__tests__/route-modules.unit.test.ts | module 'forms-admin': registers exactly its routes, in order, and nothing else | stale test | Expected values to be strictly deep-equal: |
| 3 | apps/website/src/cli/__tests__/integration/init-storage.postgres.test.ts | --storage-env: the site names the variable, keeps no secret, and its database is at head with the template | environment (no Postgres) | failed to drop fixture database "tovu_r1f2_init_env": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/cli/__tests__/integration/init-storage.postgres.test.ts | sealed: the connection string is sealed in the site folder (0600, no plaintext) and the site reopens from its meta | environment (no Postgres) | failed to drop fixture database "tovu_r1f2_init_sealed": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/cli/__tests__/integration/init-storage.postgres.test.ts | a database that already holds a Tovu site is refused, before any folder, secret or key is made | environment (no Postgres) | failed to drop fixture database "tovu_r1f2_init_taken": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/cli/__tests__/integration/storage-move.postgres.test.ts | refuses a target other than postgres, and a --storage-env that is not set | environment (no Postgres) | failed to drop fixture database "tovu_storage_move_cli_test": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/cli/__tests__/integration/storage-move.postgres.test.ts | the program routes `storage move` to the command | environment (no Postgres) | failed to drop fixture database "tovu_storage_move_cli_test": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/cli/__tests__/integration/storage-move.postgres.test.ts | --storage-env moves the site and leaves the connection string in that variable | environment (no Postgres) | failed to drop fixture database "tovu_storage_move_cli_test": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/cli/__tests__/integration/storage-move.postgres.test.ts | /home/user/Tovu/apps/website/src/cli/__tests__/integration/storage-move.postgres.test.ts | environment (no Postgres) | failed to drop fixture database "tovu_storage_move_cli_test": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/features/entries/__tests__/integration/unreadable-owner-entries-repair.postgres.test.ts | two processes booting at once: the mismatched rows go exactly once, one marker, readable rows survive | environment (no Postgres) | failed to drop fixture database "tovu_unreadable_owner_entries_repair_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/features/entries/__tests__/integration/unreadable-owner-entries-repair.postgres.test.ts | /home/user/Tovu/apps/website/src/features/entries/__tests__/integration/unreadable-owner-entries-repair.postgres.test.ts | environment (no Postgres) | failed to drop fixture database "tovu_unreadable_owner_entries_repair_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/features/identity/__tests__/passkeys.real-postgres.test.ts | real PostgreSQL passkey completion has one winner, atomic session rollback, and recovery clears credentials | environment (no Postgres) | failed to drop fixture database "tovu_passkeys_10799": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/platform/db/__tests__/migration-manifest-postgres.test.ts | FIXTURE_DB is namespaced by this run's own process.pid — two different pids can never compute the same fixture database name, which is the entire fix for the collision | environment (no Postgres) | failed to list databases for the stale fixture-database sweep: psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/platform/db/__tests__/migration-manifest-postgres.test.ts | sweepStaleFixtureDatabases: reclaims a fixture database whose owning pid has died, and leaves one whose pid is still alive completely untouched | environment (no Postgres) | failed to list databases for the stale fixture-database sweep: psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/platform/db/__tests__/migration-manifest-postgres.test.ts | sweepStaleFixtureDatabases: a non-canonical suffix Number() would coerce into a plausible dead pid is never touched, even though the pre-fix Number()-based guard would have dropped it | environment (no Postgres) | failed to list databases for the stale fixture-database sweep: psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/platform/db/__tests__/migration-manifest-postgres.test.ts | CANONICAL_PID_SUFFIX: matches only a bare decimal pid shape; rejects every adversarial suffix Number() would otherwise coerce | environment (no Postgres) | failed to list databases for the stale fixture-database sweep: psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/platform/db/__tests__/migration-manifest-postgres.test.ts | int4 rejects 2147483648 on a live server; int8 accepts the identical value | environment (no Postgres) | failed to list databases for the stale fixture-database sweep: psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/platform/db/__tests__/migration-manifest-postgres.test.ts | reseedSequenceSql, executed after a copy that preserved original ids, makes the next plain insert land at max+1 with no collision | environment (no Postgres) | failed to list databases for the stale fixture-database sweep: psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/platform/db/__tests__/migration-manifest-postgres.test.ts | reseedSequenceSql handles the empty-table edge case: reseeding an empty table still starts identity at 1 | environment (no Postgres) | failed to list databases for the stale fixture-database sweep: psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/platform/db/__tests__/migration-manifest-postgres.test.ts | reseedSequenceSql: a table containing ONLY non-positive copied ids (0 and -1) reseeds to 1, not a collision and not a jump to 2 | environment (no Postgres) | failed to list databases for the stale fixture-database sweep: psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/platform/db/__tests__/migration-manifest-postgres.test.ts | reseedSequenceSql: a mixed-sign table (some non-positive, some positive ids) still reseeds to max+1 — the non-positive-id fix does not regress the ordinary case | environment (no Postgres) | failed to list databases for the stale fixture-database sweep: psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/platform/db/__tests__/migration-manifest-postgres.test.ts | a plain INSERT naming an explicit identity-column value fails WITHOUT OVERRIDING SYSTEM VALUE, and succeeds WITH it | environment (no Postgres) | failed to list databases for the stale fixture-database sweep: psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/platform/db/__tests__/migration-manifest-postgres.test.ts | COPY accepts an explicit identity-column value with NO override syntax at all — the override clause this manifest exports must never be prepended to a COPY statement | environment (no Postgres) | failed to list databases for the stale fixture-database sweep: psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/platform/db/__tests__/migration-manifest-postgres.test.ts | a naive-local timestamp string casts to a DIFFERENT instant depending on the reading session's timezone; a UTC-offset string does not | environment (no Postgres) | failed to list databases for the stale fixture-database sweep: psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/platform/db/__tests__/migration-manifest-postgres.test.ts | string-collation ORDER BY on a text timestamp column disagrees with chronological ORDER BY when Z and offset forms mix — the concrete mechanism TIMESTAMP_ORDERING_REQUIRES_CANONICAL_Z documents | environment (no Postgres) | failed to list databases for the stale fixture-database sweep: psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/platform/db/__tests__/migration-manifest-postgres.test.ts | Postgres accepts a UTC offset up to and including ±15:59 and rejects ±16:00 and beyond, in both directions — the bound a UTC-offset check must enforce, not the ±23:59 Date.parse allows | environment (no Postgres) | failed to list databases for the stale fixture-database sweep: psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/platform/db/__tests__/migration-manifest-postgres.test.ts | a plain Postgres text column silently accepts malformed JSON — proving a json-text column needs a semantic check beyond either dialect's type system | environment (no Postgres) | failed to list databases for the stale fixture-database sweep: psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/platform/db/__tests__/migration-manifest-postgres.test.ts | publish backstop audit is workspace-scoped core data included once in the Postgres copy catalog | environment (no Postgres) | failed to list databases for the stale fixture-database sweep: psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/platform/db/__tests__/migration-manifest-postgres.test.ts | /home/user/Tovu/apps/website/src/platform/db/__tests__/migration-manifest-postgres.test.ts | environment (no Postgres) | failed to drop fixture database "tovu_migration_fixture_20032": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/server/runtime/composition/__tests__/deps-provider-plugin-boot.integration.test.ts | a project store that can't open (EACCES on its folder): the site boots, warns, and a settings save is refused, never sent to the site vault | unclear |  |
| 3 | apps/website/src/server/runtime/composition/__tests__/move-site-storage.postgres.test.ts | a running site is refused; nothing changes | environment (no Postgres) | failed to drop fixture database "tovu_move_site_test": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/server/runtime/composition/__tests__/move-site-storage.postgres.test.ts | a target that already holds data is refused; nothing changes | environment (no Postgres) | failed to drop fixture database "tovu_move_site_test": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/server/runtime/composition/__tests__/move-site-storage.postgres.test.ts | a row written to the target after the emptiness check refuses the copy; nothing is truncated | environment (no Postgres) | failed to drop fixture database "tovu_move_site_test": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/server/runtime/composition/__tests__/move-site-storage.postgres.test.ts | a failure after the copy rolls the target back and leaves the site on PGlite | environment (no Postgres) | failed to drop fixture database "tovu_move_site_test": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/server/runtime/composition/__tests__/move-site-storage.postgres.test.ts | the move copies every table, seals the secret, switches the meta last, and the site boots on Postgres | environment (no Postgres) | failed to drop fixture database "tovu_move_site_test": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/server/runtime/composition/__tests__/move-site-storage.postgres.test.ts | /home/user/Tovu/apps/website/src/server/runtime/composition/__tests__/move-site-storage.postgres.test.ts | environment (no Postgres) | failed to drop fixture database "tovu_move_site_test": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 3 | apps/website/src/server/runtime/composition/__tests__/storage-secret.unit.test.ts | new-site sealing prepares its identified key file and the default reader reopens it | unclear | /home/user/Tovu/apps/website/src/features/webhooks/keyring.env.ts:149 |
| 3 | packages/sdk/src/__tests__/unit/sdk-public-api.unit.test.ts | SDK external type contracts are declared package dependencies for standalone consumers | stale test | Expected values to be strictly equal: |
| 4 | apps/website/src/cli/__tests__/integration/introspect-command.integration.test.ts | tovu introspect: exits 0 and prints valid JSON describing init/serve/export — matches the live CLI, not a hand-maintained doc | stale test | introspect must list the real registered commands (nested subcommands flattened to their full invocation path), and exclude itself/help |
| 4 | apps/website/src/cli/__tests__/integration/introspect-command.integration.test.ts | tovu introspect --format mcp: exits 0 and prints valid MCP tool definitions | stale test | Expected values to be strictly deep-equal: |
| 4 | apps/website/src/features/api-connections/__tests__/surface-adapters.security.test.ts | workspace: every connection-ref operation names the port's workspace (connect, confirm, cancel, disconnect) | unclear | Invalid URL |
| 4 | apps/website/src/platform/db/kernel/__tests__/kernel.postgres.test.ts | postgres: transactions commit, roll back and nest on a pooled connection | environment (no Postgres) | failed to drop fixture database "tovu_kernel_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 4 | apps/website/src/platform/db/kernel/__tests__/kernel.postgres.test.ts | two connections WITHOUT lockKey: both appends read the same latest row (the hazard is real) | environment (no Postgres) | failed to drop fixture database "tovu_kernel_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 4 | apps/website/src/platform/db/kernel/__tests__/kernel.postgres.test.ts | two connections WITH lockKey: the second append waits and chains after the first | environment (no Postgres) | failed to drop fixture database "tovu_kernel_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 4 | apps/website/src/platform/db/kernel/__tests__/postgres-pool-error.postgres.test.ts | apps/website/src/platform/db/kernel/__tests__/postgres-pool-error.postgres.test.ts | environment (no Postgres) | test failed |
| 4 | apps/website/src/platform/db/repos/__tests__/form-delivery-repo.postgres.test.ts | postgres: two pulls racing for one receiver admit exactly one; the other is already-running | environment (no Postgres) | failed to drop fixture database "tovu_form_delivery_repo_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 4 | apps/website/src/platform/db/repos/__tests__/form-delivery-repo.postgres.test.ts | postgres: a purge during an in-flight attempt is final; the attempt's outcome neither revives nor resends the job | environment (no Postgres) | failed to drop fixture database "tovu_form_delivery_repo_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 4 | apps/website/src/platform/db/repos/__tests__/form-delivery-repo.postgres.test.ts | /home/user/Tovu/apps/website/src/platform/db/repos/__tests__/form-delivery-repo.postgres.test.ts | environment (no Postgres) | failed to drop fixture database "tovu_form_delivery_repo_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 4 | apps/website/src/platform/site-dir/__tests__/unit/resolve-workspace.postgres.test.ts | resolves the one workspace row and rejects an unknown explicit id | environment (no Postgres) | failed to drop fixture database "tovu_resolve_workspace_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 4 | apps/website/src/server/inbound/public-http/http/site/__tests__/render-form-layout.test.ts | a successful contact form is hidden by the emitted stylesheet in a browser | environment (no Chromium headless shell) | browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell |
| 4 | apps/website/src/server/inbound/public-http/http/site/__tests__/render-form-layout.test.ts | contact form fallback error and success colors apply in both modes without theme tokens | environment (no Chromium headless shell) | browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell |
| 4 | apps/website/src/server/inbound/public-http/http/site/__tests__/render-form-layout.test.ts | checkbox fields render inline before their label with only the emitted stylesheet | environment (no Chromium headless shell) | browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell |
| 4 | apps/website/src/server/inbound/public-http/http/site/__tests__/worker-import-graph.test.ts | handlebars-worker.ts source graph contains no @jini-ai package roots, including deferred imports | product bug (gate/ratchet catches real drift) | handlebars-worker.ts names @jini-ai root barrels; use narrow export subpaths: |
| 4 | apps/website/src/server/inbound/public-http/http/site/__tests__/worker-import-graph.test.ts | handlebars-worker.ts loads no database, blob-store or agent packages | product bug (gate/ratchet catches real drift) | handlebars-worker.ts loaded @jini-ai root barrels; use narrow export subpaths: |
| 4 | apps/website/src/server/inbound/public-http/http/site/__tests__/worker-import-graph.test.ts | liquid-worker.ts source graph contains no @jini-ai package roots, including deferred imports | product bug (gate/ratchet catches real drift) | liquid-worker.ts names @jini-ai root barrels; use narrow export subpaths: |
| 4 | apps/website/src/server/inbound/public-http/http/site/__tests__/worker-import-graph.test.ts | liquid-worker.ts loads no database, blob-store or agent packages | product bug (gate/ratchet catches real drift) | liquid-worker.ts loaded @jini-ai root barrels; use narrow export subpaths: |
| 4 | development/scripts/__tests__/check-idle-motion.test.ts | the live tree has no idle-CPU offenders and no stale allowlist entries | product bug (gate/ratchet catches real drift) | Expected values to be strictly deep-equal: |
| 4 | development/scripts/__tests__/dead-path-sweep.test.ts | dead-path sweep: no path reference outside the known-broken register resolves to nothing | environment (no generated coverage / ADS-memory/.local-artifacts dirs) | a path reference under development/scripts or the db tooling points at a file that does not exist |
| 4 | development/scripts/__tests__/dead-path-sweep.test.ts | generated coverage artifacts are not reported as dead paths | environment (no generated coverage / ADS-memory/.local-artifacts dirs) | "development/coverage/lcov.unit.info's parent directory should exist" |
| 5 | apps/website/src/assistant/__tests__/mcp-ui-allowlist-completeness.test.ts | every surfaceExchanges.open(...) call names a toolId constant this scan can resolve | product bug (gate/ratchet catches real drift) | Expected values to be strictly deep-equal: |
| 5 | apps/website/src/features/deployments/deploy-targets/__tests__/no-vendor-in-core.boundary.test.ts | real core tree has only reviewed pattern exceptions, each with its exact current total | product bug (gate/ratchet catches real drift) | Vendor knowledge belongs in its plugin. Uncovered file/vendor/count pairs: |
| 5 | apps/website/src/platform/db/migrations/__tests__/commerce-catalog-step.test.ts | [postgres] activation creates exactly the borrowed catalog once without importing historical rows | environment (no Postgres) | connect ENOENT /tmp/.s.PGSQL.5432 |
| 5 | apps/website/src/platform/db/migrations/__tests__/runner.postgres.test.ts | two connections migrating at once apply a step exactly once | environment (no Postgres) | failed to drop fixture database "tovu_migrations_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 5 | apps/website/src/platform/db/migrations/__tests__/runner.postgres.test.ts | the content history through the current head applies on real Postgres | environment (no Postgres) | failed to drop fixture database "tovu_migrations_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 5 | apps/website/src/platform/db/migrations/__tests__/runner.postgres.test.ts | the chat history lands in ai_chat with its own ledger there; public gets no chat table | environment (no Postgres) | failed to drop fixture database "tovu_migrations_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 5 | apps/website/src/platform/db/migrations/__tests__/runner.postgres.test.ts | /home/user/Tovu/apps/website/src/platform/db/migrations/__tests__/runner.postgres.test.ts | environment (no Postgres) | failed to drop fixture database "tovu_migrations_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 5 | apps/website/src/server/inbound/public-http/routes/commerce/__tests__/settlement.integration.test.ts | [postgres] member purchase settles only from signed paid evidence and survives relay redelivery | environment (no Postgres) | connect ENOENT /tmp/.s.PGSQL.5432 |
| 5 | apps/website/src/server/runtime/composition/__tests__/webhook-delivery-worker.shutdown.test.ts | a receiver trickling bytes forever is cut off by the total deadline through the guarded client | stale test | Expected values to be strictly equal: |
| 6 | apps/website/src/features/entries/__tests__/integration/repo.compare-and-set.postgres.test.ts | postgres: two writers on the same base version, B blocked on A's row lock — A lands, B gets the version conflict | environment (no Postgres) | failed to drop fixture database "tovu_entry_cas_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 6 | apps/website/src/features/entries/__tests__/integration/repo.compare-and-set.postgres.test.ts | postgres: two import-as-creates of one id, B blocked on A's uncommitted insert — one row, one revision, one event; B is a version conflict | environment (no Postgres) | failed to drop fixture database "tovu_entry_cas_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 6 | apps/website/src/features/forms/__tests__/repo.postgres.test.ts | postgres: racing creates of one slug persist one winner and give the loser FormSlugConflictError | environment (no Postgres) | failed to drop fixture database "tovu_forms_repo_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 6 | apps/website/src/platform/db/kernel/__tests__/no-raw-sqlite.boundary.test.ts | no new raw SQLite outside the storage kernel (ratchet: the baseline only shrinks) | product bug (gate/ratchet catches real drift) | New raw SQLite outside platform/db/kernel. Use the storage kernel (run/transaction + Drizzle, dialect.ts helpers) instead. |
| 6 | apps/website/src/server/runtime/composition/__tests__/app-federation-reload.observability.test.ts | a roster change after createApp traces the agent daemon's federation reload with RouteDeps.observability | unclear | Expected values to be strictly deep-equal: |
| 6 | apps/website/src/server/runtime/composition/modules/__tests__/assistant-daemon-client.unit.test.ts | a refused parked mutation waits for replacement and is dispatched once | unclear | agent daemon origin requested before ensure() resolved a self-allocated port — call ensure() before createApp() |
| 6 | apps/website/src/server/runtime/composition/modules/__tests__/assistant-daemon-client.unit.test.ts | a passive frontend stream cannot wake a daemon racing park | unclear | agent daemon origin requested before ensure() resolved a self-allocated port — call ensure() before createApp() |
| 7 | apps/website/src/features/agent-plugins/__tests__/unit/connect-tool.api-connections.unit.test.ts | a declared API connection connects through the real host: waiting card, then connected card, status and connectionRef only | unclear | Invalid URL |
| 7 | apps/website/src/features/agent-plugins/__tests__/unit/connect-tool.api-connections.unit.test.ts | API sign-in displays only the declaring plugin oauth card copy | unclear | Invalid URL |
| 7 | apps/website/src/features/agent-plugins/__tests__/unit/connect-tool.api-connections.unit.test.ts | a failed connected-card update never turns a real connection into a tool failure | unclear | Invalid URL |
| 7 | apps/website/src/features/agent-plugins/__tests__/unit/connect-tool.api-connections.unit.test.ts | with no poll interval or wait bound configured, the built-in defaults still let a finished sign-in connect | unclear | Invalid URL |
| 7 | apps/website/src/features/api-connections/__tests__/vendor-neutrality.test.ts | no generic seam file names the first provider | product bug (gate/ratchet catches real drift) | Expected values to be strictly deep-equal: |
| 7 | apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts | the first site's copy lands in `tovu` with the same row count as SQLite for every copied core table, and leaves out logins and saved keys | environment (no Postgres) | postgres: psql request failed |
| 7 | apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts | a re-copy replaces the site's own copy and never appends | environment (no Postgres) | postgres: psql request failed |
| 7 | apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts | cross-site wipe regression: a copy aimed at a schema holding ANOTHER site's copy is refused inside the transaction | environment (no Postgres) | postgres: psql request failed |
| 7 | apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts | a schema someone else made (no marker) is refused and left untouched, and a new site is given its own schema instead | environment (no Postgres) | postgres: psql request failed |
| 7 | apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts | two sites share one database: the second gets `tovu_<site>`, each re-copy replaces only its own, and a site keeps its schema after `tovu` frees up | environment (no Postgres) | postgres: psql request failed |
| 7 | apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts | a row Postgres rejects rolls the whole copy back and names only the table | environment (no Postgres) | postgres: psql request failed |
| 7 | apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts | a count mismatch or rejected replacement preserves the earlier rows and marker | environment (no Postgres) | postgres: psql request failed |
| 7 | apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts | a setting marked secret stays behind (values at every scope and its history); ordinary settings are copied | environment (no Postgres) | postgres: psql request failed |
| 7 | apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts | T1: the copy carries the schema's indexes, foreign keys, checks, defaults and identity columns, and new rows number after the copied ones | environment (no Postgres) | postgres: psql request failed |
| 7 | apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts | T1: a source row whose parent is missing does not stop the copy; that foreign key is kept unvalidated and named in the result | environment (no Postgres) | postgres: psql request failed |
| 7 | apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts | T2: every table in the snapshot is copied or left out with a reason; a plugin's tables are copied from the snapshot's own layout | environment (no Postgres) | postgres: psql request failed |
| 7 | apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts | an unconfirmed first-copy plan cannot overwrite a copy created since planning | environment (no Postgres) | postgres: psql request failed |
| 7 | apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts | a Postgres site copy preserves publish backstop audit rows and their undo inverses | environment (no Postgres) | postgres: psql request failed |
| 7 | apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts | /home/user/Tovu/apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts | environment (no Postgres) | postgres: psql request failed |
| 7 | apps/website/src/features/theme/__tests__/preview-switcher-layout.test.ts | preview tag under the "sticky" theme at 1440px: pinned at the very top, centred, no gap, nothing hidden under it | environment (no Chromium headless shell) | browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell |
| 7 | apps/website/src/features/theme/__tests__/preview-switcher-layout.test.ts | preview tag under the "sticky" theme at 390px: pinned at the very top, centred, no gap, nothing hidden under it | environment (no Chromium headless shell) | browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell |
| 7 | apps/website/src/features/theme/__tests__/preview-switcher-layout.test.ts | preview tag under the "fixed" theme at 1440px: pinned at the very top, centred, no gap, nothing hidden under it | environment (no Chromium headless shell) | browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell |
| 7 | apps/website/src/features/theme/__tests__/preview-switcher-layout.test.ts | preview tag under the "fixed" theme at 390px: pinned at the very top, centred, no gap, nothing hidden under it | environment (no Chromium headless shell) | browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell |
| 7 | apps/website/src/features/theme/__tests__/preview-switcher-layout.test.ts | preview tag under the "hostile" theme at 1440px: pinned at the very top, centred, no gap, nothing hidden under it | environment (no Chromium headless shell) | browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell |
| 7 | apps/website/src/features/theme/__tests__/preview-switcher-layout.test.ts | preview tag under the "hostile" theme at 390px: pinned at the very top, centred, no gap, nothing hidden under it | environment (no Chromium headless shell) | browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell |
| 7 | apps/website/src/features/theme/__tests__/preview-switcher-layout.test.ts | preview tag with more choices than fit a phone scrolls from the start instead of clipping the label | environment (no Chromium headless shell) | browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell |
| 7 | apps/website/src/platform/db/__tests__/pg-fixture.unit.test.ts | psql() returns ok:true with stdout for a successful query | environment (no Postgres) | Expected values to be strictly equal: |
| 7 | apps/website/src/platform/db/__tests__/pg-fixture.unit.test.ts | psql() returns ok:false with stderr populated, never throwing, for a failing statement | environment (no Postgres) | The input did not match the regular expression /this_table_does_not_exist_xyz/. Input: |
| 7 | apps/website/src/platform/db/__tests__/pg-fixture.unit.test.ts | recreateDatabase() throws the exact wrapped DROP message and never attempts CREATE when DROP fails | environment (no Postgres) | Expected values to be strictly equal: |
| 7 | apps/website/src/platform/db/__tests__/pg-fixture.unit.test.ts | recreateDatabase() + dropDatabase() happy path round-trips a real throwaway database | environment (no Postgres) | failed to drop fixture database "tovu_pg_fixture_unit_2985": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 7 | apps/website/src/platform/db/kernel/__tests__/ops.postgres.test.ts | Postgres copyTo is refused with what to do instead | environment (no Postgres) | failed to drop fixture database "tovu_kernel_ops_test": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 7 | apps/website/src/platform/db/kernel/__tests__/ops.postgres.test.ts | Postgres compactAndVerify refuses a missing ledger, then passes once it has a step | environment (no Postgres) | failed to drop fixture database "tovu_kernel_ops_test": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 7 | apps/website/src/platform/db/kernel/__tests__/ops.postgres.test.ts | /home/user/Tovu/apps/website/src/platform/db/kernel/__tests__/ops.postgres.test.ts | environment (no Postgres) | "Cannot read properties of undefined (reading 'close')" |
| 7 | apps/website/src/platform/db/migrations/__tests__/archive-legacy-commerce.postgres.test.ts | Postgres: concurrent upgrades archive once with stable relation identities; dumps restore all rows | environment (no Postgres) | failed to drop fixture database "tovu_commerce_archive_pg": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 7 | apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.postgres.test.ts | bootSiteDir on a postgres site opens the store (migrated, workspace resolved) without a content.db | environment (no Postgres) | failed to drop fixture database "tovu_r1f_boot_site_dir": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 7 | apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.postgres.test.ts | bootSiteDir honors an explicit Postgres workspace instead of the oldest | environment (no Postgres) | failed to drop fixture database "tovu_r1f_boot_site_dir": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 7 | apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.postgres.test.ts | createSiteRouteDeps reuses the store bootSiteDir opened (serve/export pass it as overrides.store) | environment (no Postgres) | failed to drop fixture database "tovu_r1f_boot_site_dir": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 7 | apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.postgres.test.ts | bootSiteDir on a postgres site rejects an unknown --workspace and closes the store it opened | environment (no Postgres) | failed to drop fixture database "tovu_r1f_boot_site_dir": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 7 | apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.postgres.test.ts | createSiteRouteDeps refuses overrides.store without workspaceId (the pair rule covers the store too) | environment (no Postgres) | failed to drop fixture database "tovu_r1f_boot_site_dir": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 7 | apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.postgres.test.ts | /home/user/Tovu/apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.postgres.test.ts | environment (no Postgres) | The "path" argument must be of type string or an instance of Buffer or URL. Received undefined |
| 7 | apps/website/src/server/inbound/admin-http/__tests__/owner-passkey-browser.integration.test.ts | browser virtual authenticator verifies registration, assertions, UV, signatures, counters and local port changes | environment (no Chromium headless shell) | browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell |
| 7 | apps/website/src/server/runtime/composition/__tests__/create-site-route-deps.postgres.test.ts | Postgres composition boot sequence preserves data across env, sealed-secret and wrong-key boots | environment (no Postgres) | failed to drop fixture database "tovu_r1f_create_site_route_deps": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 7 | apps/website/src/server/runtime/composition/__tests__/create-site-route-deps.postgres.test.ts | /home/user/Tovu/apps/website/src/server/runtime/composition/__tests__/create-site-route-deps.postgres.test.ts | environment (no Postgres) | The "path" argument must be of type string or an instance of Buffer or URL. Received undefined |
| 7 | apps/website/src/server/runtime/composition/__tests__/sqlite-create-site-app-module-identity.integration.test.ts | createSiteApp() on a SQLite composition adds no second copy of the serving app's event handlers | unclear | sanity: forms analytics, forms notify and webhook fan-out each subscribe once |
| 7 | apps/website/src/server/runtime/composition/modules/__tests__/assistant-tool-exec.integration.test.ts | a committed write whose response is dropped is OUTCOME UNKNOWN, ran once, and blocks a blind repeat | stale test | The validation function is expected to return "true". Received false |
| 7 | development/scripts/__tests__/bundled-agent-plugin-selection.test.ts | the composed bundled id set is pinned, and no id ships from both content and a package | stale test | Expected values to be strictly deep-equal: |
| 7 | development/scripts/__tests__/unit/af-cli-characterization.unit.test.ts | web dev CLI attaches to the selected running site and opens its admin URL | stale test | node:internal/modules/esm/resolve:272 |
| 7 | development/scripts/__tests__/unit/af-cli-characterization.unit.test.ts | desktop dev CLI builds preload before watching and forwards Electron flags on normal exit | stale test | node:internal/modules/esm/resolve:272 |
| 8 | apps/website/src/contracts/core/events/__tests__/forms-notification-restart.integration.test.ts | postgres: persisted notifications survive restart, honour 429 delay and stop uncertain resend | environment (no Postgres) | failed to drop fixture database "tovu_mail_restart_outcomes": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 8 | apps/website/src/contracts/core/events/__tests__/forms-notification-restart.integration.test.ts | postgres: restart after acceptance before ledger mark does not send twice | environment (no Postgres) | failed to drop fixture database "tovu_mail_restart_acceptance": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 8 | apps/website/src/features/agent-plugins/__tests__/unit/bundled-automatic-relevance.unit.test.ts | Auto suggests only relevant bundled plugins: Design a new theme for this site | stale test | Expected values to be strictly deep-equal: |
| 8 | apps/website/src/features/agent-plugins/__tests__/unit/bundled-automatic-relevance.unit.test.ts | Auto suggests only relevant bundled plugins: Design a new theme for this site — just tell me which plugins you'd load, don't change anything. | stale test | Expected values to be strictly deep-equal: |
| 8 | apps/website/src/features/agent-plugins/__tests__/unit/bundled-automatic-relevance.unit.test.ts | Auto suggests only relevant bundled plugins: Deploy this site to Vercel | stale test | Expected values to be strictly deep-equal: |
| 8 | apps/website/src/features/agent-plugins/__tests__/unit/bundled-automatic-relevance.unit.test.ts | Auto suggests only relevant bundled plugins: Import my old WordPress site | stale test | Expected values to be strictly deep-equal: |
| 8 | apps/website/src/features/agent-plugins/__tests__/unit/bundled-automatic-relevance.unit.test.ts | Auto suggests only relevant bundled plugins: Design a theme inspired by Vercel | stale test | Expected values to be strictly deep-equal: |
| 8 | apps/website/src/features/api-connections/__tests__/api-connection-slice.test.ts | vertical slice: connect -> public callback -> plugin access token -> form-delivery credential | unclear | Invalid URL |
| 8 | apps/website/src/features/api-connections/__tests__/api-connection-slice.test.ts | security: a form-delivery credential stays on the job's frozen account, for the attempt and for every later request | unclear | Invalid URL |
| 8 | apps/website/src/features/post/__tests__/repo.postgres.test.ts | two connections: a concurrent appendRevision waits for the open one and chains after it | environment (no Postgres) | failed to drop fixture database "tovu_post_repo_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory |
| 8 | apps/website/src/server/inbound/admin-http/__tests__/dev-auth-boot-owner.unit.test.ts | boot redemption rejects a missing owner before minting a session | unclear | Expected values to be partially and strictly deep-equal: |
| 8 | apps/website/src/server/inbound/admin-http/__tests__/dev-auth-boot-owner.unit.test.ts | boot redemption rejects a disabled owner before minting a session | unclear | Expected values to be partially and strictly deep-equal: |
| 8 | apps/website/src/server/inbound/admin-http/__tests__/dev-auth-boot-owner.unit.test.ts | boot redemption rejects a member owner before minting a session | unclear | Expected values to be partially and strictly deep-equal: |
| 8 | apps/website/src/server/inbound/admin-http/__tests__/dev-auth-boot-owner.unit.test.ts | boot redemption refuses a minted session that Jini cannot validate before setting a cookie | unclear | Expected values to be partially and strictly deep-equal: |
| 8 | apps/website/src/server/inbound/admin-http/__tests__/owner-passkey-http.integration.test.ts | real HTTP/browser TOTP enrollment and passkey registration/login withhold cookies until factor completion | environment (no Chromium headless shell) | browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell |
| 8 | apps/website/src/server/inbound/assistant/__tests__/integration/component-catalog-routes.integration.test.ts | the real daemon answers component-catalog search, describe, and a 404 over real HTTP | unclear | expected the daemon to start listening, but it exited: |
| 8 | apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/site-title-preservation.integration.test.ts | AC-12 (REQ-07, T-W3): with the definition registered and the pin held open, a pre-existing site renders Tovu Demo Site, never its display name | unclear | Express request did not finish |
| 8 | apps/website/src/server/runtime/composition/__tests__/external-mcp-oauth-loopback-wiring.unit.test.ts | ../../../inbound/assistant/agent-daemon-server.ts: desktop accepts a loopback OAuth callback; hosted requires HTTPS | stale test | ../../../inbound/assistant/agent-daemon-server.ts must have one OAuth ports call |
| 8 | apps/website/src/server/runtime/composition/__tests__/process-root-parity.test.ts | daemon dev mode passes bypass in the executor's options bag | stale test | pluginIds is not defined |
| 8 | apps/website/src/server/runtime/composition/modules/__tests__/agent-daemon-core-rpc.integration.test.ts | an accepted memory-mode answer reaches CLI launch through the site's attempt authority | unclear | Expected values to be strictly equal: |
| 8 | apps/website/src/server/runtime/composition/modules/__tests__/assistant-byok.inputs-pin.test.ts | BYOK repeats pinned guidance while retaining good picks around failures (reported, not fixed) | stale test | The input did not match the regular expression /Relevant agent plugins for this request:/. Input: |

## Appendix B — every biome lint error (607)

`file:line:col rule message`

```
apps/admin/src/App.hooks.ts:132:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on location.
apps/admin/src/App.hooks.ts:132:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on sessionApi.me.
apps/admin/src/App.hooks.ts:132:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on sessionApi.redeemBootSession.
apps/admin/src/App.hooks.ts:132:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on sessionApi.
apps/admin/src/App.hooks.ts:132:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on history.
apps/admin/src/App.hooks.ts:132:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on location.hostname.
apps/admin/src/App.hooks.ts:171:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on subscribeUnauthenticated.
apps/admin/src/App.hooks.ts:198:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on subscribeSettingsChanges.
apps/admin/src/App.hooks.ts:649:3 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: routePath.
apps/admin/src/App.hooks.ts:1164:3 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: routeLocation.
apps/admin/src/App.hooks.ts:132:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on acceptSession.
apps/admin/src/App.tsx:782:24 lint/a11y/useKeyWithClickEvents Enforce to have the onClick mouse event with the onKeyUp, the onKeyDown, or the onKeyPress keyboard event.
apps/admin/src/App.tsx:782:24 lint/a11y/noStaticElementInteractions Unexpected event handler on static element.
apps/admin/src/App.tsx:269:7 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/__tests__/fetch-query-render.tsx:10:48 lint/correctness/noChildrenProp Avoid passing children using a prop
apps/admin/src/__tests__/unit/sidebar-labels.unit.test.tsx:32:5 lint/a11y/useValidAnchor Provide a href attribute for the a element.
apps/admin/src/admin-themes/__tests__/admin-themes.unit.test.ts:168:49 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/admin/src/admin-themes/__tests__/use-admin-theme.hooks.unit.test.tsx:46:15 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/components/AssistantDock/AgentFailureCard.tsx:11:21 lint/correctness/useExhaustiveDependencies This hook specifies a dependency more specific than its captures: failure?.details
apps/admin/src/components/AssistantDock/AgentFailureCard.tsx:11:21 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on failure.
apps/admin/src/components/AssistantDock/DockSettingsMenu.tsx:96:18 lint/a11y/useFocusableInteractive The HTML element with the interactive role "separator" is not focusable.
apps/admin/src/components/AssistantDock/DockSettingsMenu.tsx:96:23 lint/a11y/useSemanticElements The elements with this role can be changed to the following elements:%0A<hr>
apps/admin/src/components/AssistantDock/DockSettingsMenu.tsx:96:23 lint/a11y/useAriaPropsForRole The element with the separator ARIA role does not have the required ARIA attributes.
apps/admin/src/components/AssistantDock/DockSettingsMenu.tsx:97:10 lint/a11y/useSemanticElements The elements with this role can be changed to the following elements:%0A<fieldset>
apps/admin/src/components/AssistantDock/DockSettingsMenu.tsx:125:5 lint/a11y/useAriaPropsSupportedByRole The ARIA attribute 'aria-checked' is not supported by this element.
apps/admin/src/components/AssistantDock/MessageOverflowModal.tsx:60:5 lint/a11y/useKeyWithClickEvents Enforce to have the onClick mouse event with the onKeyUp, the onKeyDown, or the onKeyPress keyboard event.
apps/admin/src/components/AssistantDock/__tests__/agent-failure.unit.test.ts:8:1 lint/suspicious/noExportsInTest Do not export from a test file.
apps/admin/src/components/AssistantDock/__tests__/agent-plugins-setting.unit.test.tsx:123:30 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/components/AssistantDock/__tests__/chat-settings-tooltips.unit.test.tsx:77:12 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/components/AssistantDock/__tests__/chat-settings-tooltips.unit.test.tsx:128:11 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/components/AssistantDock/__tests__/composer-selected-skills.unit.test.tsx:100:24 lint/correctness/noUnsafeOptionalChaining Unsafe usage of optional chaining.
apps/admin/src/components/AssistantDock/__tests__/composer-skills.typing-renders.unit.test.tsx:138:7 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/components/AssistantDock/__tests__/composer-skills.typing-renders.unit.test.tsx:142:22 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/components/AssistantDock/__tests__/unit/commit-approval.integration.test.tsx:14:5 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/components/AssistantDock/__tests__/unit/commit-approval.integration.test.tsx:15:5 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/components/AssistantDock/__tests__/use-assistant-runtime-preferences.hooks.unit.test.ts:21:15 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/components/AssistantDock/__tests__/use-assistant-runtime-preferences.hooks.unit.test.ts:79:35 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/components/AssistantDock/__tests__/use-chat-display-preferences.hooks.unit.test.ts:57:30 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/components/AssistantDock/__tests__/use-chat-display-preferences.hooks.unit.test.ts:123:37 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/components/AssistantDock/__tests__/use-composer-send-stop-guard.hooks.unit.test.tsx:13:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/components/AssistantDock/__tests__/use-composer-send-stop-guard.hooks.unit.test.tsx:14:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/components/AssistantDock/__tests__/use-composer-send-stop-guard.hooks.unit.test.tsx:15:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/components/AssistantDock/__tests__/use-composer-send-stop-guard.hooks.unit.test.tsx:18:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/components/AssistantDock/__tests__/use-composer-send-stop-guard.hooks.unit.test.tsx:20:7 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/components/AssistantDock/__tests__/use-dock-renderer-registry.hooks.unit.test.tsx:55:25 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx:635:3 lint/correctness/useExhaustiveDependencies This hook specifies a dependency more specific than its captures: executionConfig.localCli
apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx:635:3 lint/correctness/useExhaustiveDependencies This hook specifies a dependency more specific than its captures: executionConfig.localCli
apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx:635:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on executionConfig.
apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx:1943:34 lint/correctness/useHookAtTopLevel This hook is being called conditionally, but all hooks must be called in the exact same order in every component render.
apps/admin/src/components/AssistantDock/hooks/composer-skills.hooks.ts:73:3 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: prompt.
apps/admin/src/components/AssistantDock/hooks/use-dock-renderer-registry.hooks.ts:160:29 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/components/AssistantDock/hooks/use-selected-agent-auth-warning.hooks.ts:56:3 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: agentId.
apps/admin/src/components/CodeView/CodeView.tsx:24:24 lint/suspicious/noArrayIndexKey Avoid using the index of an array as key property in an element.
apps/admin/src/components/DevicePreview/DevicePreviewToggle.tsx:30:32 lint/a11y/useSemanticElements The elements with this role can be changed to the following elements:%0A<fieldset>
apps/admin/src/components/InstallTabCard/InstallTabCard.tsx:147:7 lint/a11y/noStaticElementInteractions Unexpected event handler on static element.
apps/admin/src/components/MediaEditDialog/MediaEditDialog.tsx:125:30 lint/a11y/useSemanticElements The elements with this role can be changed to the following elements:%0A<fieldset>
apps/admin/src/components/MediaPickerDialog/MediaPickerDialog.tsx:148:14 lint/correctness/useHookAtTopLevel This hook is being called from within a function or method that is not a hook or component.
apps/admin/src/components/PlainTextBlocks.tsx:17:20 lint/suspicious/noArrayIndexKey Avoid using the index of an array as key property in an element.
apps/admin/src/components/PlainTextBlocks.tsx:18:60 lint/suspicious/noArrayIndexKey Avoid using the index of an array as key property in an element.
apps/admin/src/components/PlainTextBlocks.tsx:21:19 lint/suspicious/noArrayIndexKey Avoid using the index of an array as key property in an element.
apps/admin/src/components/PlainTextBlocks.tsx:23:30 lint/suspicious/noArrayIndexKey Avoid using the index of an array as key property in an element.
apps/admin/src/components/Select/Select.tsx:15:36 lint/correctness/useHookAtTopLevel This hook is being called from a nested function, but all hooks must be called unconditionally from the top-level component.
apps/admin/src/components/TemplateSource/TemplateSourceModal.tsx:113:7 lint/suspicious/noImplicitAnyLet This variable implicitly has the any type.
apps/admin/src/components/WidgetConfigFields/HtmlAttributeRows.tsx:32:19 lint/suspicious/noArrayIndexKey Avoid using the index of an array as key property in an element.
apps/admin/src/components/WidgetConfigFields/MediaContentEditor.tsx:151:50 lint/a11y/useSemanticElements The elements with this role can be changed to the following elements:%0A<input type="radio">
apps/admin/src/components/WidgetConfigFields/MediaContentEditor.tsx:182:63 lint/suspicious/noArrayIndexKey Avoid using the index of an array as key property in an element.
apps/admin/src/components/WidgetConfigFields/WidgetConfigFields.tsx:116:24 lint/suspicious/noArrayIndexKey Avoid using the index of an array as key property in an element.
apps/admin/src/components/WidgetPickerDialog/WidgetPickerDialog.tsx:289:14 lint/correctness/useHookAtTopLevel This hook is being called from within a function or method that is not a hook or component.
apps/admin/src/components/__tests__/AssistantDock.chat-settings.unit.test.tsx:81:36 lint/correctness/useHookAtTopLevel This hook is being called from a nested function, but all hooks must be called unconditionally from the top-level component.
apps/admin/src/components/__tests__/AssistantDock.runtime-access.unit.test.tsx:46:36 lint/correctness/useHookAtTopLevel This hook is being called from a nested function, but all hooks must be called unconditionally from the top-level component.
apps/admin/src/components/__tests__/AssistantDock.unit.test.tsx:57:36 lint/correctness/useHookAtTopLevel This hook is being called from a nested function, but all hooks must be called unconditionally from the top-level component.
apps/admin/src/components/__tests__/ComingSoonPanel.unit.test.tsx:9:85 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/components/device-preview-icons.tsx:40:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/components/device-preview-icons.tsx:51:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/components/device-preview-icons.tsx:61:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/admin-themes/AdminThemes.tsx:75:15 lint/a11y/useSemanticElements The elements with this role can be changed to the following elements:%0A<input type="radio">
apps/admin/src/features/admin-themes/AdminThemes.tsx:124:15 lint/a11y/useSemanticElements The elements with this role can be changed to the following elements:%0A<input type="radio">
apps/admin/src/features/ai-assistant/AiAssistant.tsx:132:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/ai-assistant/__tests__/AdminExecutionMode.unit.test.tsx:13:65 lint/correctness/useHookAtTopLevel This hook is being called from a nested function, but all hooks must be called unconditionally from the top-level component.
apps/admin/src/features/ai-assistant/__tests__/AssistantDaemonRestart.unit.test.tsx:11:69 lint/correctness/useHookAtTopLevel This hook is being called from a nested function, but all hooks must be called unconditionally from the top-level component.
apps/admin/src/features/ai-assistant/hooks/use-assistant-daemon-restart.hooks.ts:90:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on checkStatus.
apps/admin/src/features/auth/Login.tsx:40:191 lint/a11y/noAutofocus Avoid the autoFocus attribute.
apps/admin/src/features/auth/Login.tsx:44:105 lint/a11y/noAutofocus Avoid the autoFocus attribute.
apps/admin/src/features/auth/Login.tsx:53:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/auth/OwnerRecoverySignIn.tsx:36:7 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/authentication/Authentication.tsx:54:9 lint/a11y/useAriaPropsSupportedByRole The ARIA attribute 'aria-label' is not supported by this element.
apps/admin/src/features/collections/Collections.tsx:165:5 lint/correctness/useHookAtTopLevel This hook is being called from within a function or method that is not a hook or component.
apps/admin/src/features/collections/Collections.tsx:283:89 lint/correctness/useHookAtTopLevel This hook is being called from within a function or method that is not a hook or component.
apps/admin/src/features/collections/Collections.tsx:382:37 lint/correctness/useHookAtTopLevel This hook is being called from within a function or method that is not a hook or component.
apps/admin/src/features/collections/hooks/use-collection-entry-editor.hooks.ts:194:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on navigate.
apps/admin/src/features/collections/hooks/use-collection-entry-editor.hooks.ts:194:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on seedExistingWorkingCopy.
apps/admin/src/features/comments/index.ts:15:10 lint/correctness/useHookAtTopLevel This hook is being called from within a function or method that is not a hook or component.
apps/admin/src/features/consent/ConsentOverviewTab.tsx:63:84 lint/suspicious/noArrayIndexKey Avoid using the index of an array as key property in an element.
apps/admin/src/features/consent/ConsentOverviewTab.tsx:76:83 lint/suspicious/noArrayIndexKey Avoid using the index of an array as key property in an element.
apps/admin/src/features/consent/CookieConsent.tsx:100:71 lint/suspicious/noArrayIndexKey Avoid using the index of an array as key property in an element.
apps/admin/src/features/consent/use-consent-page.hooks.ts:147:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on t.
apps/admin/src/features/consent/use-consent-page.hooks.ts:182:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on t.
apps/admin/src/features/consent/use-consent-page.hooks.ts:182:3 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: refresh.
apps/admin/src/features/consent/use-consent-page.hooks.ts:69:3 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: loadNonce.
apps/admin/src/features/consent/use-consent-page.hooks.ts:69:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on t.
apps/admin/src/features/consent/use-consent-page.hooks.ts:69:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on delayMs.
apps/admin/src/features/consent/use-consent-page.hooks.ts:69:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on timers.
apps/admin/src/features/database/database-visuals.tsx:28:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/database/database-visuals.tsx:42:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/deployment/StaticSiteTab.tsx:280:59 lint/suspicious/noArrayIndexKey Avoid using the index of an array as key property in an element.
apps/admin/src/features/deployment/StaticSiteTab.tsx:292:42 lint/suspicious/noArrayIndexKey Avoid using the index of an array as key property in an element.
apps/admin/src/features/deployment/deployment-visuals.tsx:40:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/deployment/deployment-visuals.tsx:52:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/deployment/deployment-visuals.tsx:63:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/deployment/deployment-visuals.tsx:74:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/deployment/deployment-visuals.tsx:84:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/email/EmailActivityTab.tsx:102:68 lint/suspicious/noArrayIndexKey Avoid using the index of an array as key property in an element.
apps/admin/src/features/email/EmailTemplateEditor.tsx:74:55 lint/a11y/useSemanticElements The elements with this role can be changed to the following elements:%0A<fieldset>
apps/admin/src/features/email/hooks/email-load.hooks.ts:35:3 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: attempt.
apps/admin/src/features/email/hooks/use-email-activity.hooks.ts:137:24 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on refusal.
apps/admin/src/features/email/hooks/use-email-activity.hooks.ts:152:25 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on refusal.
apps/admin/src/features/email/hooks/use-email-provider.hooks.ts:48:3 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: attempt.
apps/admin/src/features/email/hooks/use-email-template-editor.hooks.ts:82:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on detail.
apps/admin/src/features/email/hooks/use-email-template-editor.hooks.ts:82:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on detail.html.
apps/admin/src/features/email/hooks/use-email-template-editor.hooks.ts:82:3 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: loadedId.
apps/admin/src/features/email/hooks/use-email-template-editor.hooks.ts:82:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on detail.fields.map.
apps/admin/src/features/email/hooks/use-email-template-editor.hooks.ts:82:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on detail.name.
apps/admin/src/features/email/hooks/use-email.hooks.ts:62:3 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: attempt.
apps/admin/src/features/forms/index.ts:18:10 lint/correctness/useHookAtTopLevel This hook is being called from within a function or method that is not a hook or component.
apps/admin/src/features/forms/index.ts:24:10 lint/correctness/useHookAtTopLevel This hook is being called from within a function or method that is not a hook or component.
apps/admin/src/features/import-export/import-export-tabs.tsx:27:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/library/Library.hooks.tsx:24:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/library/Library.hooks.tsx:33:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/library/Library.tsx:216:11 lint/a11y/noAutofocus Avoid the autoFocus attribute.
apps/admin/src/features/library/Library.tsx:347:5 lint/a11y/useKeyWithClickEvents Enforce to have the onClick mouse event with the onKeyUp, the onKeyDown, or the onKeyPress keyboard event.
apps/admin/src/features/library/Library.tsx:347:5 lint/a11y/noStaticElementInteractions Unexpected event handler on static element.
apps/admin/src/features/library/Library.tsx:366:124 lint/a11y/noAutofocus Avoid the autoFocus attribute.
apps/admin/src/features/library/rules.ts:99:42 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/admin/src/features/library/rules.ts:99:49 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/admin/src/features/media/Media.hooks.tsx:75:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/media/Media.hooks.tsx:84:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/media/Media.hooks.tsx:37:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/media/Media.hooks.tsx:49:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/media/Media.hooks.tsx:60:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/media/Media.tsx:283:11 lint/a11y/useMediaCaption Provide a track for captions when using audio or video elements.
apps/admin/src/features/media/Media.tsx:713:5 lint/a11y/useKeyWithClickEvents Enforce to have the onClick mouse event with the onKeyUp, the onKeyDown, or the onKeyPress keyboard event.
apps/admin/src/features/media/__tests__/use-edit-media-modal.hooks.unit.test.tsx:16:10 lint/a11y/useKeyWithClickEvents Enforce to have the onClick mouse event with the onKeyUp, the onKeyDown, or the onKeyPress keyboard event.
apps/admin/src/features/media/__tests__/use-edit-media-modal.hooks.unit.test.tsx:35:5 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/menus/MenuEditor.tsx:275:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/menus/MenuEditor.tsx:278:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/menus/MenuEditor.tsx:281:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/menus/MenuEditor.tsx:284:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/menus/Menus.tsx:62:29 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/menus/__tests__/MenuEditor.unit.test.tsx:481:44 lint/correctness/noUnsafeOptionalChaining Unsafe usage of optional chaining.
apps/admin/src/features/observability/observability-visuals.tsx:67:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/observability/observability-visuals.tsx:56:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/observability/observability-visuals.tsx:27:10 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/observability/observability-visuals.tsx:76:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/observability/observability-visuals.tsx:86:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/observability/observability-visuals.tsx:36:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/observability/observability-visuals.tsx:45:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/observability/recent-errors-panel.tsx:137:26 lint/suspicious/noArrayIndexKey Avoid using the index of an array as key property in an element.
apps/admin/src/features/pages/ThemePageDetailsModal.tsx:241:5 lint/a11y/useKeyWithClickEvents Enforce to have the onClick mouse event with the onKeyUp, the onKeyDown, or the onKeyPress keyboard event.
apps/admin/src/features/pages/__tests__/editor-html-jump.unit.test.ts:7:23 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts:706:24 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on t.
apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts:706:24 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: routeSlug.
apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts:945:19 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on write.mutate.
apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts:1044:35 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on readPage.
apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts:1044:35 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: port.
apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts:1063:18 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on write.mutate.
apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts:1146:27 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on interactiveEditorRef.current.
apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts:1183:3 lint/correctness/useExhaustiveDependencies This hook specifies a dependency more specific than its captures: page?.id
apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts:1183:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on previewMatchesLive.
apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts:1183:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on page.
apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts:1183:3 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: status, contentDirty, templateChoice, savedTemplateChoice, html, contentRevision.
apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts:1233:29 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on interactiveEditorRef.current.
apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts:1246:39 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on interactiveEditorRef.current.
apps/admin/src/features/plugins/AgentPluginDisableConfirmDialog.tsx:78:5 lint/a11y/useKeyWithClickEvents Enforce to have the onClick mouse event with the onKeyUp, the onKeyDown, or the onKeyPress keyboard event.
apps/admin/src/features/plugins/AgentPluginDisableConfirmDialog.tsx:96:13 lint/a11y/noAutofocus Avoid the autoFocus attribute.
apps/admin/src/features/plugins/AgentPluginDisableConfirmDialog.tsx:79:7 lint/a11y/useKeyWithClickEvents Enforce to have the onClick mouse event with the onKeyUp, the onKeyDown, or the onKeyPress keyboard event.
apps/admin/src/features/plugins/AgentPluginDisableConfirmDialog.tsx:78:5 lint/a11y/noStaticElementInteractions Unexpected event handler on static element.
apps/admin/src/features/plugins/AgentPluginRow.tsx:249:19 lint/a11y/useKeyWithClickEvents Enforce to have the onClick mouse event with the onKeyUp, the onKeyDown, or the onKeyPress keyboard event.
apps/admin/src/features/plugins/AgentPluginRow.tsx:249:19 lint/a11y/noStaticElementInteractions Unexpected event handler on static element.
apps/admin/src/features/plugins/PackageFilesModal.tsx:139:11 lint/a11y/useKeyWithClickEvents Enforce to have the onClick mouse event with the onKeyUp, the onKeyDown, or the onKeyPress keyboard event.
apps/admin/src/features/plugins/PackageFilesModal.tsx:65:20 lint/suspicious/noArrayIndexKey Avoid using the index of an array as key property in an element.
apps/admin/src/features/plugins/PluginProviderSettingsDialog.tsx:106:35 lint/correctness/useHookAtTopLevel This hook is being called from a nested function, but all hooks must be called unconditionally from the top-level component.
apps/admin/src/features/plugins/PluginRemoveConfirmDialog.tsx:37:5 lint/a11y/noStaticElementInteractions Unexpected event handler on static element.
apps/admin/src/features/plugins/PluginRemoveConfirmDialog.tsx:37:5 lint/a11y/useKeyWithClickEvents Enforce to have the onClick mouse event with the onKeyUp, the onKeyDown, or the onKeyPress keyboard event.
apps/admin/src/features/plugins/PluginRemoveConfirmDialog.tsx:38:7 lint/a11y/useKeyWithClickEvents Enforce to have the onClick mouse event with the onKeyUp, the onKeyDown, or the onKeyPress keyboard event.
apps/admin/src/features/plugins/PluginRemoveConfirmDialog.tsx:53:13 lint/a11y/noAutofocus Avoid the autoFocus attribute.
apps/admin/src/features/plugins/PluginRow.tsx:64:5 lint/a11y/noInteractiveElementToNoninteractiveRole Interactive elements should not be assigned non-interactive roles.
apps/admin/src/features/plugins/PluginRow.tsx:64:38 lint/a11y/useSemanticElements The elements with this role can be changed to the following elements:%0A<fieldset>
apps/admin/src/features/plugins/__tests__/b15-row-panel-ownership.unit.test.tsx:54:13 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/plugins/__tests__/confirm-dialogs-focus-trap.unit.test.tsx:24:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/plugins/__tests__/confirm-dialogs-focus-trap.unit.test.tsx:43:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/plugins/__tests__/confirm-dialogs-focus-trap.unit.test.tsx:72:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/plugins/__tests__/confirm-dialogs-focus-trap.unit.test.tsx:92:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/plugins/__tests__/plugin-zip-install.unit.test.tsx:103:20 lint/correctness/noUnsafeOptionalChaining Unsafe usage of optional chaining.
apps/admin/src/features/plugins/__tests__/use-agent-plugins.hooks.unit.test.ts:165:27 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/features/plugins/__tests__/use-agent-plugins.hooks.unit.test.ts:228:27 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/features/plugins/agent-plugins-visuals.tsx:65:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/plugins/agent-plugins-visuals.tsx:75:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/plugins/agent-plugins-visuals.tsx:86:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/plugins/agent-plugins-visuals.tsx:98:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/plugins/agent-plugins-visuals.tsx:109:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/plugins/agent-plugins-visuals.tsx:131:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/plugins/agent-plugins-visuals.tsx:141:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/plugins/agent-plugins-visuals.tsx:52:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/plugins/hooks/use-agent-plugin-memory.hooks.ts:38:3 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: pluginId, port.
apps/admin/src/features/plugins/hooks/use-package-file-tree.hooks.ts:71:16 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on paths.
apps/admin/src/features/plugins/hooks/use-package-file-tree.hooks.ts:71:16 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: pathsKey.
apps/admin/src/features/plugins/hooks/use-plugin-provider-settings.hooks.ts:77:27 lint/correctness/useHookAtTopLevel This hook is being called conditionally, but all hooks must be called in the exact same order in every component render.
apps/admin/src/features/plugins/hooks/use-plugins.hooks.ts:143:22 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on t.
apps/admin/src/features/plugins/plugins-visuals.tsx:44:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/posts/PostEditor.tsx:264:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/PostEditor.tsx:236:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/PostEditor.tsx:237:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/PostEditor.tsx:238:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/PostEditor.tsx:239:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/PostEditor.tsx:258:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/PostEditor.tsx:260:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/PostEditor.tsx:265:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/PostEditor.tsx:266:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/PostEditor.tsx:267:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/PostEditor.tsx:285:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/PostEditor.tsx:290:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/PostEditor.tsx:310:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/PostEditor.tsx:321:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/PostEditor.tsx:332:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/PostEditor.tsx:343:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/PostEditor.tsx:356:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/PostEditor.tsx:357:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/PostEditor.tsx:388:11 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/PostEditor.tsx:399:11 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/PostEditor.tsx:488:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/PostEditor.tsx:500:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/PostEditor.tsx:536:7 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/PostEditor.tsx:621:7 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/PostEditor.tsx:622:7 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/PostEditor.tsx:623:7 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/PostEditor.tsx:624:7 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/PostEditor.tsx:625:7 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/PostEditor.tsx:1304:13 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/posts/PostEditor.tsx:234:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/__tests__/PostUrlDialog.chromecheck.unit.test.tsx:22:14 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/__tests__/post-author.unit.test.tsx:90:66 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/posts/__tests__/use-post-editor-ui.hooks.unit.test.tsx:6:77 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/features/posts/hooks/use-post-editor-ui.hooks.ts:189:58 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/features/posts/hooks/use-post-editor-ui.hooks.ts:194:3 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: shown, open.
apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:879:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on applyLoadedPost.
apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:879:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on port.getPost.
apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:879:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on t.
apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:879:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on navigate.
apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:879:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on port.getPresentation.
apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:1053:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on post?.id.
apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:1053:3 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: loadedId, bodyJson, templateChoice.
apps/admin/src/features/providers/Providers.tsx:109:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/providers/hooks/use-always-allow.hooks.ts:60:3 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: list.data.
apps/admin/src/features/publish-content/hooks/use-publish-content-confirm.hooks.ts:986:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on applyOverwriteKeys.
apps/admin/src/features/publish-content/hooks/use-publish-content-confirm.hooks.ts:1003:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on peers.find.
apps/admin/src/features/publish-content/hooks/use-publish-content-confirm.hooks.ts:1003:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on props.onPlanned.
apps/admin/src/features/publish-content/hooks/use-publish-content-confirm.hooks.ts:1003:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on selectedPeerId.
apps/admin/src/features/publish-content/hooks/use-publish-content-confirm.hooks.ts:986:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on props.criteria.
apps/admin/src/features/publish-content/hooks/use-publish-content-confirm.hooks.ts:569:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on t.
apps/admin/src/features/recovery/hooks/use-restore-flow.hooks.ts:85:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on locale.
apps/admin/src/features/redirects/index.ts:15:10 lint/correctness/useHookAtTopLevel This hook is being called from within a function or method that is not a hook or component.
apps/admin/src/features/redirects/redirects-i18n.tsx:739:7 lint/a11y/noStaticElementInteractions Unexpected event handler on static element.
apps/admin/src/features/redirects/redirects-i18n.tsx:739:7 lint/a11y/useKeyWithClickEvents Enforce to have the onClick mouse event with the onKeyUp, the onKeyDown, or the onKeyPress keyboard event.
apps/admin/src/features/roles/Roles.hooks.tsx:60:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/roles/Roles.hooks.tsx:70:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/roles/hooks/use-roles.hooks.ts:448:60 lint/correctness/noUnsafeFinally Unsafe usage of 'return'.
apps/admin/src/features/security/AccessTokensTab.tsx:688:33 lint/a11y/useSemanticElements The elements with this role can be changed to the following elements:%0A<fieldset>
apps/admin/src/features/security/AccessTokensTab.tsx:890:5 lint/a11y/useAriaPropsSupportedByRole The ARIA attribute 'aria-label' is not supported by this element.
apps/admin/src/features/security/OtherCredentialsSection.tsx:124:11 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/security/RecoveryCodesCard.tsx:55:7 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/security/RecoveryCodesCard.tsx:101:7 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/security/__tests__/CopyKeysDialog.unit.test.tsx:9:12 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/security/hooks/use-access-tokens.hooks.ts:496:27 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on settlement.isCurrent.
apps/admin/src/features/security/hooks/use-access-tokens.hooks.ts:496:27 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on settlement.next.
apps/admin/src/features/security/hooks/use-access-tokens.hooks.ts:552:13 lint/correctness/useHookAtTopLevel This hook is being called conditionally, but all hooks must be called in the exact same order in every component render.
apps/admin/src/features/security/security-visuals.tsx:28:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/security/security-visuals.tsx:39:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/security/security-visuals.tsx:50:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/seo/index.ts:17:10 lint/correctness/useHookAtTopLevel This hook is being called from within a function or method that is not a hook or component.
apps/admin/src/features/settings/AdminAppearance.tsx:70:15 lint/a11y/useSemanticElements The elements with this role can be changed to the following elements:%0A<input type="radio">
apps/admin/src/features/settings/ExternalMcpRemoveConfirmDialog.tsx:77:13 lint/a11y/noAutofocus Avoid the autoFocus attribute.
apps/admin/src/features/settings/ExternalMcpRemoveConfirmDialog.tsx:59:5 lint/a11y/noStaticElementInteractions Unexpected event handler on static element.
apps/admin/src/features/settings/ExternalMcpRemoveConfirmDialog.tsx:60:7 lint/a11y/useKeyWithClickEvents Enforce to have the onClick mouse event with the onKeyUp, the onKeyDown, or the onKeyPress keyboard event.
apps/admin/src/features/settings/ExternalMcpRemoveConfirmDialog.tsx:59:5 lint/a11y/useKeyWithClickEvents Enforce to have the onClick mouse event with the onKeyUp, the onKeyDown, or the onKeyPress keyboard event.
apps/admin/src/features/settings/ExternalMcpSettingsPanel.tsx:206:74 lint/a11y/useSemanticElements The elements with this role can be changed to the following elements:%0A<section>
apps/admin/src/features/settings/ExternalMcpSharedChoice.tsx:22:17 lint/correctness/useHookAtTopLevel This hook is being called conditionally, but all hooks must be called in the exact same order in every component render.
apps/admin/src/features/settings/ExternalMcpSharedChoice.tsx:34:17 lint/correctness/useHookAtTopLevel This hook is being called conditionally, but all hooks must be called in the exact same order in every component render.
apps/admin/src/features/settings/ExternalMcpSharedChoice.tsx:40:106 lint/correctness/useHookAtTopLevel This hook is being called from a nested function, but all hooks must be called unconditionally from the top-level component.
apps/admin/src/features/settings/ExternalMcpSharedChoice.tsx:40:184 lint/correctness/useHookAtTopLevel This hook is being called from a nested function, but all hooks must be called unconditionally from the top-level component.
apps/admin/src/features/settings/ExternalMcpSharedChoice.tsx:50:131 lint/correctness/useHookAtTopLevel This hook is being called from a nested function, but all hooks must be called unconditionally from the top-level component.
apps/admin/src/features/settings/ExternalMcpToolPicker.hooks.tsx:45:10 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on names.
apps/admin/src/features/settings/ExternalMcpToolPicker.hooks.tsx:45:10 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: names.join(" ").
apps/admin/src/features/settings/ExternalMcpToolsModal.tsx:72:5 lint/a11y/noStaticElementInteractions Unexpected event handler on static element.
apps/admin/src/features/settings/ExternalMcpToolsModal.tsx:72:5 lint/a11y/useKeyWithClickEvents Enforce to have the onClick mouse event with the onKeyUp, the onKeyDown, or the onKeyPress keyboard event.
apps/admin/src/features/settings/ExternalMcpToolsModal.tsx:73:7 lint/a11y/useKeyWithClickEvents Enforce to have the onClick mouse event with the onKeyUp, the onKeyDown, or the onKeyPress keyboard event.
apps/admin/src/features/settings/SettingsUi.tsx:154:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/settings/__tests__/SettingsUi.unit.test.tsx:20:57 lint/correctness/useHookAtTopLevel This hook is being called from a nested function, but all hooks must be called unconditionally from the top-level component.
apps/admin/src/features/settings/__tests__/use-external-mcp-remove-confirm.hooks.unit.test.tsx:38:7 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/settings/__tests__/use-settings-active-tab-scroll.hooks.unit.test.tsx:11:5 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/settings/__tests__/use-settings-active-tab-scroll.hooks.unit.test.tsx:12:5 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/settings/ai-agent-presentation.ts:15:3 lint/correctness/noEmptyPattern Unexpected empty object pattern.
apps/admin/src/features/settings/hooks/__tests__/use-external-mcp.unit.test.ts:409:9 lint/suspicious/noImplicitAnyLet This variable implicitly has the any type.
apps/admin/src/features/settings/hooks/__tests__/use-external-mcp.unit.test.ts:463:9 lint/suspicious/noImplicitAnyLet This variable implicitly has the any type.
apps/admin/src/features/settings/hooks/__tests__/use-settings-ui.unit.test.ts:36:35 lint/correctness/useHookAtTopLevel This hook is being called conditionally, but all hooks must be called in the exact same order in every component render.
apps/admin/src/features/settings/hooks/use-external-mcp-admissions.hooks.ts:155:3 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: attempts.
apps/admin/src/features/settings/hooks/use-external-mcp-tool-picker.hooks.ts:147:3 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: signature.
apps/admin/src/features/settings/hooks/use-external-mcp-tool-picker.hooks.ts:157:3 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: declarations.
apps/admin/src/features/settings/hooks/use-settings-active-tab-scroll.hooks.ts:19:3 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: tabId.
apps/admin/src/features/settings/hooks/use-settings-ui.hooks.ts:164:5 lint/correctness/useExhaustiveDependencies This dependencies list is not an array literal.
apps/admin/src/features/sites/AllSitesTab.tsx:315:35 lint/a11y/useSemanticElements The elements with this role can be changed to the following elements:%0A<fieldset>
apps/admin/src/features/sites/CreateSiteOnboarding.tsx:123:54 lint/a11y/noAutofocus Avoid the autoFocus attribute.
apps/admin/src/features/sites/CreateSiteOnboarding.tsx:150:7 lint/a11y/useAriaPropsSupportedByRole The ARIA attribute 'aria-expanded' is not supported by this element.
apps/admin/src/features/sites/SiteTrashTab.tsx:15:38 lint/a11y/useSemanticElements The elements with this role can be changed to the following elements:%0A<fieldset>
apps/admin/src/features/sites/SitesHomeSetting.tsx:130:15 lint/a11y/noAutofocus Avoid the autoFocus attribute.
apps/admin/src/features/sites/SitesHomeSetting.tsx:37:102 lint/correctness/useHookAtTopLevel This hook is being called from a nested function, but all hooks must be called unconditionally from the top-level component.
apps/admin/src/features/sites/SitesHomeSetting.tsx:38:144 lint/correctness/useHookAtTopLevel This hook is being called from a nested function, but all hooks must be called unconditionally from the top-level component.
apps/admin/src/features/sites/SitesHomeSetting.tsx:128:20 lint/suspicious/noArrayIndexKey Avoid using the index of an array as key property in an element.
apps/admin/src/features/sites/StaticExportPicker.tsx:51:15 lint/a11y/useSemanticElements The elements with this role can be changed to the following elements:%0A<fieldset>
apps/admin/src/features/sites/__tests__/site-card-view.unit.test.tsx:156:105 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/features/sites/__tests__/site-card-view.unit.test.tsx:153:11 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/features/sites/__tests__/sites-idle-requests.unit.test.tsx:35:14 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/sites/hooks/use-local-sites.hooks.ts:95:15 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on handleSwitchResult.
apps/admin/src/features/sites/hooks/use-site-transfer.hooks.ts:92:3 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: identity, canManageSavedKeys.
apps/admin/src/features/sites/sites-visuals.tsx:30:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/sites/sites-visuals.tsx:39:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/sites/sites-visuals.tsx:49:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/sites/sites-visuals.tsx:59:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/sites/sites-visuals.tsx:72:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/skills/SkillInstallConfirmation.tsx:23:5 lint/a11y/noStaticElementInteractions Unexpected event handler on static element.
apps/admin/src/features/skills/SkillInstallConfirmation.tsx:23:5 lint/a11y/useKeyWithClickEvents Enforce to have the onClick mouse event with the onKeyUp, the onKeyDown, or the onKeyPress keyboard event.
apps/admin/src/features/skills/SkillInstallConfirmation.tsx:24:7 lint/a11y/useKeyWithClickEvents Enforce to have the onClick mouse event with the onKeyUp, the onKeyDown, or the onKeyPress keyboard event.
apps/admin/src/features/skills/SkillRemoveConfirmDialog.tsx:7:5 lint/a11y/noStaticElementInteractions Unexpected event handler on static element.
apps/admin/src/features/skills/SkillRemoveConfirmDialog.tsx:7:5 lint/a11y/useKeyWithClickEvents Enforce to have the onClick mouse event with the onKeyUp, the onKeyDown, or the onKeyPress keyboard event.
apps/admin/src/features/skills/SkillRemoveConfirmDialog.tsx:8:7 lint/a11y/useKeyWithClickEvents Enforce to have the onClick mouse event with the onKeyUp, the onKeyDown, or the onKeyPress keyboard event.
apps/admin/src/features/skills/__tests__/skill-dialogs-and-row.unit.test.tsx:106:16 lint/a11y/noStaticElementInteractions Unexpected event handler on static element.
apps/admin/src/features/source-control/source-control-visuals.tsx:38:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/taxonomy/Taxonomy.tsx:134:11 lint/a11y/noAutofocus Avoid the autoFocus attribute.
apps/admin/src/features/taxonomy/Taxonomy.tsx:821:23 lint/a11y/useSemanticElements The elements with this role can be changed to the following elements:%0A<button>
apps/admin/src/features/taxonomy/Taxonomy.tsx:821:23 lint/a11y/noNoninteractiveElementToInteractiveRole The HTML element li is non-interactive and should not have an interactive role.
apps/admin/src/features/taxonomy/Taxonomy.tsx:868:23 lint/a11y/noStaticElementInteractions Unexpected event handler on static element.
apps/admin/src/features/taxonomy/Taxonomy.tsx:868:23 lint/a11y/useKeyWithClickEvents Enforce to have the onClick mouse event with the onKeyUp, the onKeyDown, or the onKeyPress keyboard event.
apps/admin/src/features/taxonomy/TaxonomyRowMenu.hooks.ts:60:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on close.
apps/admin/src/features/taxonomy/__tests__/TaxonomyRowMenu.hooks.unit.test.tsx:96:11 lint/suspicious/noShadowRestrictedNames Do not shadow the global "escape" property.
apps/admin/src/features/taxonomy/hooks/use-term-picker.hooks.ts:145:3 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: props.contentType, props.contentId.
apps/admin/src/features/themes/ThemeExplore.tsx:360:11 lint/a11y/noAutofocus Avoid the autoFocus attribute.
apps/admin/src/features/themes/ThemeExplore.tsx:1077:48 lint/a11y/useSemanticElements The elements with this role can be changed to the following elements:%0A<section>
apps/admin/src/features/themes/ThemeExplore.tsx:1122:5 lint/a11y/useKeyWithClickEvents Enforce to have the onClick mouse event with the onKeyUp, the onKeyDown, or the onKeyPress keyboard event.
apps/admin/src/features/themes/ThemeExplore.tsx:836:9 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/features/themes/Themes.tsx:102:11 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/themes/Themes.tsx:434:35 lint/a11y/useSemanticElements The elements with this role can be changed to the following elements:%0A<fieldset>
apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts:1099:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on textLoader.load.
apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts:1379:58 lint/correctness/noUnsafeFinally Unsafe usage of 'return'.
apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts:1008:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on listingLoader.load.
apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts:1008:3 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: port.
apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts:1099:3 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: port, fileReadNonce.
apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts:1162:32 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on listingLoader.load.
apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts:1162:32 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: port.
apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts:1208:31 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on cachedReads.getThemeFile.
apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts:1208:31 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: port.
apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts:1235:16 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on write.mutate.
apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts:1266:17 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on write.mutate.
apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts:1304:24 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on cachedReads.
apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts:1304:24 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on write.mutate.
apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts:1341:25 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on cachedReads.
apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts:1341:25 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on write.mutate.
apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts:1469:20 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on cachedReads.
apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts:1469:20 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on write.mutate.
apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts:1538:25 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on cachedReads.
apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts:1538:25 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on write.mutate.
apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts:1616:28 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on write.mutate.
apps/admin/src/features/themes/hooks/use-themes.hooks.ts:253:60 lint/correctness/noUnsafeFinally Unsafe usage of 'return'.
apps/admin/src/features/themes/themes-visuals.tsx:27:5 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/voice-input/PushToTalkMicButton.tsx:76:9 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/features/voice-input/__tests__/mic-capture.unit.test.ts:22:57 lint/correctness/noConstructorReturn The constructor should not return a value.
apps/admin/src/features/voice-input/hooks/mic-capture.ts:76:27 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/features/voice-input/hooks/mic-capture.ts:88:25 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/features/webmcp/BrowserAgentSettingsPanel.tsx:15:11 lint/a11y/useSemanticElements The elements with this role can be changed to the following elements:%0A<input type="checkbox">
apps/admin/src/features/widgets/index.ts:15:10 lint/correctness/useHookAtTopLevel This hook is being called from within a function or method that is not a hook or component.
apps/admin/src/features/widgets/index.ts:20:10 lint/correctness/useHookAtTopLevel This hook is being called from within a function or method that is not a hook or component.
apps/admin/src/features/widgets/index.ts:25:10 lint/correctness/useHookAtTopLevel This hook is being called from within a function or method that is not a hook or component.
apps/admin/src/features/widgets/index.ts:32:10 lint/correctness/useHookAtTopLevel This hook is being called from within a function or method that is not a hook or component.
apps/admin/src/hooks/__tests__/use-dock-auto-rail.hooks.test.tsx:30:17 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/hooks/__tests__/use-focus-trap.hooks.test.tsx:186:35 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/hooks/__tests__/use-focus-trap.hooks.test.tsx:180:5 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/hooks/__tests__/use-focus-trap.hooks.test.tsx:216:22 lint/a11y/noNoninteractiveTabindex The HTML element span is non-interactive. Do not use tabIndex.
apps/admin/src/hooks/__tests__/use-focus-trap.hooks.test.tsx:199:24 lint/correctness/useJsxKeyInIterable Missing key property for this element in iterable.
apps/admin/src/hooks/__tests__/use-focus-trap.hooks.test.tsx:199:24 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/hooks/__tests__/use-focus-trap.hooks.test.tsx:200:20 lint/correctness/useJsxKeyInIterable Missing key property for this element in iterable.
apps/admin/src/hooks/__tests__/use-focus-trap.hooks.test.tsx:200:54 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/hooks/__tests__/use-focus-trap.hooks.test.tsx:201:25 lint/correctness/useJsxKeyInIterable Missing key property for this element in iterable.
apps/admin/src/hooks/__tests__/use-focus-trap.hooks.test.tsx:201:25 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/hooks/__tests__/use-focus-trap.hooks.test.tsx:202:22 lint/correctness/useJsxKeyInIterable Missing key property for this element in iterable.
apps/admin/src/hooks/__tests__/use-focus-trap.hooks.test.tsx:202:34 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/hooks/__tests__/use-focus-trap.hooks.test.tsx:213:12 lint/correctness/useJsxKeyInIterable Missing key property for this element in iterable.
apps/admin/src/hooks/__tests__/use-focus-trap.hooks.test.tsx:214:14 lint/correctness/useJsxKeyInIterable Missing key property for this element in iterable.
apps/admin/src/hooks/__tests__/use-focus-trap.hooks.test.tsx:215:16 lint/correctness/useJsxKeyInIterable Missing key property for this element in iterable.
apps/admin/src/hooks/__tests__/use-focus-trap.hooks.test.tsx:216:16 lint/correctness/useJsxKeyInIterable Missing key property for this element in iterable.
apps/admin/src/hooks/__tests__/use-focus-trap.hooks.test.tsx:179:5 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/hooks/__tests__/use-interface-preferences.hooks.test.ts:37:30 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/hooks/__tests__/use-sidebar-empty-click-toggle.hooks.test.tsx:26:11 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/hooks/__tests__/use-sidebar-empty-click-toggle.hooks.test.tsx:32:11 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/hooks/__tests__/use-sidebar-empty-click-toggle.hooks.test.tsx:41:11 lint/a11y/noSvgWithoutTitle Alternative text title element cannot be empty
apps/admin/src/hooks/use-admin-appearance.hooks.ts:60:3 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: root.
apps/admin/src/hooks/use-list-table-cell-labels.hooks.ts:26:8 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/hooks/use-sites-sidebar-nav.hooks.ts:84:3 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: target, siteName, collapsed.
apps/admin/src/integrations/chart-providers/use-chart-registry.hooks.ts:37:10 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on query.data.
apps/admin/src/integrations/chart-providers/use-chart-registry.hooks.ts:37:10 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: generation.
apps/admin/src/integrations/jini-admin/AdminModulesProvider.tsx:4:19 lint/correctness/useHookAtTopLevel This hook is being called from within a function or method that is not a hook or component.
apps/admin/src/integrations/jini-admin/AdminModulesProvider.tsx:5:19 lint/correctness/useHookAtTopLevel This hook is being called from within a function or method that is not a hook or component.
apps/admin/src/integrations/jini-admin/ModulePanel.tsx:3:14 lint/correctness/useHookAtTopLevel This hook is being called from within a function or method that is not a hook or component.
apps/admin/src/integrations/jini-admin/__tests__/kit.unit.test.tsx:45:55 lint/correctness/noChildrenProp Avoid passing children using a prop
apps/admin/src/integrations/jini-admin/__tests__/kit.unit.test.tsx:22:104 lint/correctness/noChildrenProp Avoid passing children using a prop
apps/admin/src/integrations/jini-admin/__tests__/kit.unit.test.tsx:46:67 lint/correctness/noChildrenProp Avoid passing children using a prop
apps/admin/src/integrations/jini-admin/__tests__/kit.unit.test.tsx:54:55 lint/correctness/noChildrenProp Avoid passing children using a prop
apps/admin/src/integrations/jini-admin/__tests__/kit.unit.test.tsx:79:82 lint/correctness/noChildrenProp Avoid passing children using a prop
apps/admin/src/integrations/jini-admin/__tests__/media-swap.unit.test.tsx:130:16 lint/a11y/useButtonType Provide an explicit type prop for the button element.
apps/admin/src/integrations/jini-admin/modules.hooks.ts:44:3 lint/correctness/useExhaustiveDependencies This hook does not specify its dependency on permissions.
apps/admin/src/integrations/jini-admin/modules.hooks.ts:44:3 lint/correctness/useExhaustiveDependencies This hook specifies more dependencies than necessary: key.
apps/admin/src/integrations/jini-admin/modules.hooks.ts:74:77 lint/correctness/noChildrenProp Avoid passing children using a prop
apps/admin/src/integrations/jini-admin/widgets-module.hooks.ts:17:22 lint/correctness/useHookAtTopLevel This hook is being called from within a function or method that is not a hook or component.
apps/admin/src/integrations/jini-admin/widgets-module.hooks.ts:49:18 lint/correctness/useHookAtTopLevel This hook is being called from within a function or method that is not a hook or component.
apps/admin/src/lib/__tests__/admin-literal-copy.test-helper.ts:42:61 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/lib/__tests__/assistant-transport.run-status.unit.test.ts:120:27 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/lib/__tests__/block-atom-insert.unit.test.ts:42:20 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/lib/__tests__/escape-owned-by-inner-layer.unit.test.ts:18:7 lint/suspicious/noShadowRestrictedNames Do not shadow the global "escape" property.
apps/admin/src/lib/__tests__/server-reconnect.unit.test.ts:13:63 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/admin/src/lib/__tests__/shared-stream-adapters.unit.test.ts:79:11 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/lib/__tests__/shared-stream-adapters.unit.test.ts:96:13 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/lib/__tests__/shared-stream-adapters.unit.test.ts:100:13 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/lib/__tests__/visible-interval.unit.test.ts:36:36 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/admin/src/lib/media-embed-extension.tsx:112:5 lint/a11y/useMediaCaption Provide a track for captions when using audio or video elements.
apps/admin/src/styles/__tests__/external-mcp-tool-picker-css.unit.test.ts:57:11 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/__tests__/no-first-party-require.boundary.test.ts:262:11 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/website/src/assistant/__tests__/content-read-post-filters.test.ts:73:45 lint/correctness/noUnsafeOptionalChaining Unsafe usage of optional chaining.
apps/website/src/assistant/__tests__/run-scoped-credential.test.ts:414:30 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/website/src/assistant/__tests__/tool-registrations.trash-item.test.ts:146:37 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/assistant/__tests__/tool-registrations.widgets-contracts.test.ts:428:26 lint/correctness/noUnsafeOptionalChaining Unsafe usage of optional chaining.
apps/website/src/assistant/agents.ts:266:10 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/assistant/site/__tests__/visitor-confirmation-gate.unit.test.ts:125:72 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/website/src/assistant/site/__tests__/visitor-confirmation-gate.unit.test.ts:125:79 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/website/src/assistant/site/__tests__/visitor-frontend-control.unit.test.ts:160:29 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/website/src/contracts/core/__tests__/tool-surface-exchanges.test.ts:568:27 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/website/src/contracts/core/commands/revert.ts:103:8 lint/suspicious/noEmptyInterface An empty interface is equivalent to {}.
apps/website/src/features/agent-plugins/__tests__/unit/bundled-tovu-theme-package.unit.test.ts:133:57 lint/correctness/noEmptyCharacterClassInRegex The regular expression includes this negated empty character class.
apps/website/src/features/agent-plugins/__tests__/unit/bundled-tovu-theme-package.unit.test.ts:133:88 lint/correctness/noEmptyCharacterClassInRegex The regular expression includes this negated empty character class.
apps/website/src/features/agent-plugins/__tests__/unit/bundled-tovu-theme-package.unit.test.ts:135:73 lint/correctness/noEmptyCharacterClassInRegex The regular expression includes this negated empty character class.
apps/website/src/features/agent-plugins/__tests__/unit/bundled-tovu-theme-package.unit.test.ts:210:72 lint/correctness/noEmptyCharacterClassInRegex The regular expression includes this negated empty character class.
apps/website/src/features/agent-plugins/__tests__/unit/bundled-tovu-theme-package.unit.test.ts:279:43 lint/correctness/noEmptyCharacterClassInRegex The regular expression includes this negated empty character class.
apps/website/src/features/agent-plugins/__tests__/unit/install-upload.unit.test.ts:143:27 lint/correctness/useYield This generator function doesn't contain yield.
apps/website/src/features/agent-plugins/__tests__/unit/memory-tools.unit.test.ts:28:17 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/website/src/features/agent-plugins/__tests__/unit/uninstall-dwell.unit.test.ts:33:56 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/website/src/features/agent-plugins/admin-surfaces/__tests__/unit/delivery-bindings.unit.test.ts:58:58 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/agent-plugins/automatic-agent-plugins.ts:93:12 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/agent-plugins/connect-tool.ts:167:7 lint/suspicious/noImplicitAnyLet This variable implicitly has the any type.
apps/website/src/features/agent-plugins/credential-cards.ts:194:47 lint/correctness/noVoidTypeReturn The function should not return a value because its return type is void.
apps/website/src/features/agent-plugins/host-signals.ts:14:93 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/website/src/features/agent-plugins/host-signals.ts:14:98 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/website/src/features/consent/config.ts:74:41 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/website/src/features/deployments/__tests__/dockerignore-security.unit.test.ts:67:30 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/website/src/features/deployments/__tests__/dockerignore-security.unit.test.ts:67:51 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/website/src/features/deployments/__tests__/dockerignore-security.unit.test.ts:68:30 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/website/src/features/deployments/__tests__/dockerignore-security.unit.test.ts:68:46 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/website/src/features/deployments/deploy-ops/run-ops.ts:138:9 lint/suspicious/noImplicitAnyLet This variable implicitly has the any type.
apps/website/src/features/deployments/publish-credentials/__tests__/account-label-heal-scheduler.unit.test.ts:105:79 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/deployments/publish-credentials/__tests__/store.unit.test.ts:69:36 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/deployments/static-publish/__tests__/adapter.plugin-targets.unit.test.ts:192:33 lint/correctness/noUnsafeOptionalChaining Unsafe usage of optional chaining.
apps/website/src/features/deployments/static-publish/__tests__/credentials.unit.test.ts:36:36 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/deployments/static-publish/__tests__/verify.unit.test.ts:41:36 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/email-templates/render.ts:183:38 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/website/src/features/external-mcp/__tests__/external-mcp-aad-writer-sync.test.ts:50:81 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/form-destinations/registry.ts:110:12 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/website/src/features/fs-files/__tests__/write-files.test.ts:146:26 lint/correctness/noUnsafeOptionalChaining Unsafe usage of optional chaining.
apps/website/src/features/media/__tests__/library-tools.test.ts:84:12 lint/correctness/noConstantCondition This condition always evaluates to the same value.
apps/website/src/features/media/__tests__/view-video-tool.test.ts:273:19 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/website/src/features/media/promote-chat-attachment.ts:87:7 lint/suspicious/noImplicitAnyLet This variable implicitly has the any type.
apps/website/src/features/members/__tests__/mailer.console.test.ts:43:7 lint/suspicious/noImplicitAnyLet This variable implicitly has the any type.
apps/website/src/features/members/__tests__/mailer.console.test.ts:156:7 lint/suspicious/noImplicitAnyLet This variable implicitly has the any type.
apps/website/src/features/members/__tests__/mailer.console.test.ts:188:7 lint/suspicious/noImplicitAnyLet This variable implicitly has the any type.
apps/website/src/features/members/__tests__/mailer.console.test.ts:223:7 lint/suspicious/noImplicitAnyLet This variable implicitly has the any type.
apps/website/src/features/members/write-service.ts:263:49 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/website/src/features/members/write-service.ts:263:54 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/website/src/features/navigation/__tests__/publish-content.test.ts:431:37 lint/correctness/noUnsafeOptionalChaining Unsafe usage of optional chaining.
apps/website/src/features/navigation/__tests__/publish-content.test.ts:463:37 lint/correctness/noUnsafeOptionalChaining Unsafe usage of optional chaining.
apps/website/src/features/navigation/__tests__/publish-content.test.ts:499:37 lint/correctness/noUnsafeOptionalChaining Unsafe usage of optional chaining.
apps/website/src/features/navigation/__tests__/reverters.test.ts:87:49 lint/correctness/noUnsafeOptionalChaining Unsafe usage of optional chaining.
apps/website/src/features/navigation/__tests__/reverters.test.ts:102:39 lint/correctness/noUnsafeOptionalChaining Unsafe usage of optional chaining.
apps/website/src/features/navigation/render-entry.ts:26:35 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/website/src/features/pages/__tests__/tool-registrations.test.ts:116:11 lint/suspicious/noShadowRestrictedNames Do not shadow the global "escape" property.
apps/website/src/features/pages/tool-registrations.ts:530:11 lint/suspicious/noImplicitAnyLet This variable implicitly has the any type.
apps/website/src/features/plugin-runtime/__tests__/unit/install-archive.unit.test.ts:174:50 lint/correctness/useYield This generator function doesn't contain yield.
apps/website/src/features/plugin-runtime/__tests__/unit/install-archive.unit.test.ts:179:52 lint/correctness/useYield This generator function doesn't contain yield.
apps/website/src/features/post/__tests__/post.trashed-slug-release.test.ts:188:37 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/post/__tests__/tool-registrations.schedule-featured.test.ts:206:30 lint/correctness/noUnsafeOptionalChaining Unsafe usage of optional chaining.
apps/website/src/features/post/post.ts:593:8 lint/suspicious/noEmptyInterface An empty interface is equivalent to {}.
apps/website/src/features/post/post.ts:694:8 lint/suspicious/noEmptyInterface An empty interface is equivalent to {}.
apps/website/src/features/post/post.ts:752:8 lint/suspicious/noEmptyInterface An empty interface is equivalent to {}.
apps/website/src/features/post/post.ts:856:8 lint/suspicious/noEmptyInterface An empty interface is equivalent to {}.
apps/website/src/features/post/post.ts:2048:8 lint/suspicious/noEmptyInterface An empty interface is equivalent to {}.
apps/website/src/features/post/search.ts:224:8 lint/suspicious/noEmptyInterface An empty interface is equivalent to {}.
apps/website/src/features/publish-content/__tests__/apply-loop.test.ts:1519:35 lint/correctness/noUnsafeOptionalChaining Unsafe usage of optional chaining.
apps/website/src/features/publish-content/__tests__/apply-loop.test.ts:1520:35 lint/correctness/noUnsafeOptionalChaining Unsafe usage of optional chaining.
apps/website/src/features/publish-content/__tests__/apply-loop.test.ts:1555:35 lint/correctness/noUnsafeOptionalChaining Unsafe usage of optional chaining.
apps/website/src/features/publish-content/__tests__/apply-loop.test.ts:1470:35 lint/correctness/noUnsafeOptionalChaining Unsafe usage of optional chaining.
apps/website/src/features/publish-content/__tests__/no-dead-apply-stub.boundary.test.ts:30:9 lint/suspicious/noImplicitAnyLet This variable implicitly has the any type.
apps/website/src/features/publish-content/backstop-policy.ts:51:11 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/website/src/features/publish-content/backstop-policy.ts:51:16 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/website/src/features/publish-content/peer-transport.ts:245:7 lint/suspicious/noImplicitAnyLet This variable implicitly has the any type.
apps/website/src/features/publish-content/publish-backstop-file.ts:121:71 lint/correctness/noUnsafeFinally Unsafe usage of 'throw'.
apps/website/src/features/server-logs/tool-registrations.ts:36:11 lint/suspicious/noImplicitAnyLet This variable implicitly has the any type.
apps/website/src/features/settings/__tests__/form-delivery.security.test.ts:113:51 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/settings/__tests__/form-delivery.unit.test.ts:44:53 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/site-backup/__tests__/import-verifier-refusals.unit.test.ts:210:86 lint/correctness/useYield This generator function doesn't contain yield.
apps/website/src/features/site-backup/__tests__/import-verifier-refusals.unit.test.ts:242:120 lint/correctness/useYield This generator function doesn't contain yield.
apps/website/src/features/site-backup/__tests__/import.fixture.ts:96:14 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/site-backup/__tests__/library-share.integration.test.ts:239:7 lint/suspicious/noImplicitAnyLet This variable implicitly has the any type.
apps/website/src/features/site-backup/backup-service.ts:351:7 lint/suspicious/noImplicitAnyLet This variable implicitly has the any type.
apps/website/src/features/site-backup/share-database/repo.sqlite.ts:41:18 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/website/src/features/site-backup/share-database/repo.sqlite.ts:40:19 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/website/src/features/site-backup/share-file-policy.ts:84:16 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/website/src/features/site-backup/share-file-policy.ts:84:11 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/website/src/features/site-backup/sources.ts:182:7 lint/suspicious/noImplicitAnyLet This variable implicitly has the any type.
apps/website/src/features/site-backup/sources.ts:320:7 lint/suspicious/noImplicitAnyLet This variable implicitly has the any type.
apps/website/src/features/skills/__tests__/integration/skill-tool-search-ranking.integration.test.ts:147:8 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/website/src/features/skills/tool-registrations.ts:173:7 lint/suspicious/noImplicitAnyLet This variable implicitly has the any type.
apps/website/src/features/skills/tool-registrations.ts:299:7 lint/suspicious/noImplicitAnyLet This variable implicitly has the any type.
apps/website/src/features/source-control/__tests__/store.resolve.unit.test.ts:53:40 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/source-control/__tests__/store.unit.test.ts:72:36 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/taxonomy/__tests__/repo.dialects.test.ts:60:30 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/taxonomy/__tests__/repo.dialects.test.ts:160:30 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/taxonomy/__tests__/repo.dialects.test.ts:305:30 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/taxonomy/__tests__/repo.dialects.test.ts:425:30 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/theme/__tests__/heading-phone-overflow.test.ts:23:21 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/website/src/features/theme/__tests__/theme-compiled-load-gate.test.ts:98:7 lint/suspicious/noImplicitAnyLet This variable implicitly has the any type.
apps/website/src/features/theme/__tests__/theme-read-file-window.test.ts:80:12 lint/correctness/noConstantCondition This condition always evaluates to the same value.
apps/website/src/features/theme/__tests__/theme-trash.test.ts:72:37 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/theme/duplicate-theme.ts:123:9 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/website/src/features/theme/duplicate-theme.ts:123:16 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/website/src/features/theme/preview-refresh.ts:20:61 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/website/src/features/theme/validation/webmcp-markup.ts:28:113 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/website/src/features/trash/__tests__/directory-adapter.test.ts:150:58 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/trash/__tests__/directory-adapter.test.ts:190:37 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/trash/__tests__/follow-ups.test.ts:81:37 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/trash/__tests__/form-adapter.test.ts:217:37 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/trash/__tests__/form-trash-flow.test.ts:54:37 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/trash/__tests__/menu-trash-flow.test.ts:70:40 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/trash/__tests__/move-to-trash.test.ts:52:37 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/trash/__tests__/on-changed.contract.test.ts:58:37 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/trash/__tests__/post-delete-undo-index.test.ts:82:37 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/trash/__tests__/prior-marker.contract.test.ts:56:37 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/trash/__tests__/table-adapter.test.ts:368:37 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/trash/__tests__/table-adapter.test.ts:452:37 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/trash/__tests__/term-trash-flow.test.ts:121:37 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/trash/__tests__/trash.contract.test.ts:65:39 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/trash/__tests__/widget-trash-flow.test.ts:74:37 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/web-screenshot/web-screenshot.ts:149:77 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/website/src/features/web-screenshot/web-screenshot.ts:149:84 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/website/src/features/webhooks/__tests__/delivery.test.ts:331:7 lint/suspicious/noImplicitAnyLet This variable implicitly has the any type.
apps/website/src/features/webhooks/secret-scan-guard.ts:187:13 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/features/widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts:1306:23 lint/correctness/noUnsafeOptionalChaining Unsafe usage of optional chaining.
apps/website/src/features/widgets/media-html.ts:134:23 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/website/src/platform/db/repos/__tests__/form-delivery-repo.dialects.test.ts:44:38 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/platform/db/repos/__tests__/form-delivery-repo.postgres.test.ts:92:67 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/platform/db/sqlite/__tests__/import-database.unit.test.ts:43:49 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/website/src/platform/html/slug.ts:22:27 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/website/src/server/__tests__/admin-post-update-rollback-ledger.test.ts:85:56 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/server/__tests__/admin-trash-items-blocker.test.ts:62:37 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/server/__tests__/admin-trash-routes.test.ts:205:37 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/server/__tests__/admin-widgets-routes.test.ts:666:26 lint/correctness/noUnsafeOptionalChaining Unsafe usage of optional chaining.
apps/website/src/server/__tests__/assistant-byok-routes.test.ts:239:11 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/server/__tests__/assistant-run-finalizer.observability.test.ts:313:40 lint/correctness/noUnsafeOptionalChaining Unsafe usage of optional chaining.
apps/website/src/server/__tests__/assistant-run-finalizer.test.ts:50:69 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/server/__tests__/routes/site-profile-route.test.ts:317:25 lint/correctness/noUnsafeOptionalChaining Unsafe usage of optional chaining.
apps/website/src/server/__tests__/site-assistant-routes.test.ts:224:25 lint/correctness/noUnsafeOptionalChaining Unsafe usage of optional chaining.
apps/website/src/server/inbound/admin-http/routes/newsletter/__tests__/admin-route-gates.test.ts:122:9 lint/suspicious/noThenProperty This object defines a then property.
apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/destination.routes.test.ts:96:36 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/server/inbound/admin-http/routes/settings/__tests__/preview-feed-access.test.ts:119:17 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/website/src/server/inbound/admin-http/routes/system/credential-copy.ts:37:98 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/website/src/server/inbound/admin-http/routes/system/credential-copy.ts:37:103 lint/suspicious/noControlCharactersInRegex Unexpected control character in a regular expression.
apps/website/src/server/inbound/assistant/__tests__/agent-daemon-consent-protocol.unit.test.ts:24:23 lint/correctness/noUnsafeOptionalChaining Unsafe usage of optional chaining.
apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.typed-tools.integration.test.ts:44:13 lint/suspicious/noImplicitAnyLet This variable implicitly has the any type.
apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.typed-tools.integration.test.ts:45:17 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/server/inbound/public-http/middleware/__tests__/integration/theme-static-assets.integration.test.ts:179:50 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/website/src/server/inbound/public-http/routes/site/__tests__/capture-commerce-strip-golden.ts:32:4 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/server/inbound/public-http/routes/site/__tests__/commerce-strip-parity.test.ts:239:8 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/server/runtime/boot/__tests__/site-boot-readiness.unit.test.ts:24:33 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/website/src/server/runtime/composition/__tests__/agent-plugin-search-discovery.integration.test.ts:73:8 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/website/src/server/runtime/composition/__tests__/agent-plugin-tool-search-ranking.integration.test.ts:193:8 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/website/src/server/runtime/composition/__tests__/form-delivery-oauth.fixture.ts:160:39 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/server/runtime/composition/__tests__/form-delivery-subscribers.test.ts:28:42 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/server/runtime/composition/__tests__/form-delivery-subscribers.test.ts:51:39 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/server/runtime/composition/__tests__/form-delivery-subscribers.test.ts:84:39 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/server/runtime/composition/__tests__/form-delivery.security.test.ts:62:42 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/server/runtime/composition/__tests__/form-delivery.security.test.ts:88:116 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/server/runtime/composition/__tests__/form-delivery.test.ts:26:42 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/server/runtime/composition/__tests__/form-delivery.test.ts:59:89 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/server/runtime/composition/__tests__/form-submissions.test.ts:61:60 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/server/runtime/composition/__tests__/provider-revision-watch.unit.test.ts:69:25 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/website/src/server/runtime/composition/__tests__/publish-content-seed-hash.test.ts:59:14 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/server/runtime/composition/app.ts:443:23 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/server/runtime/composition/commerce.ts:253:64 lint/suspicious/useIterableCallbackReturn This callback passed to forEach() iterable method should not return a value.
apps/website/src/server/runtime/composition/domain-dns-adapters.ts:149:7 lint/suspicious/noImplicitAnyLet This variable implicitly has the any type.
apps/website/src/server/runtime/composition/modules/__tests__/assistant-tool-access-lowering.unit.test.ts:11:26 lint/correctness/noUnsafeOptionalChaining Unsafe usage of optional chaining.
apps/website/src/server/runtime/composition/modules/site-assistant.ts:761:15 lint/correctness/noSwitchDeclarations Other switch clauses can erroneously access this declaration.%0AWrap the declaration in a block to restrict its access to the switch clause.
apps/website/src/server/runtime/composition/site-consent.ts:68:7 lint/suspicious/noImplicitAnyLet This variable implicitly has the any type.
apps/website/src/server/runtime/lifecycle/__tests__/close-store-on-shutdown-boot-work.test.ts:93:65 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/server/runtime/lifecycle/__tests__/close-store-on-shutdown-boot-work.test.ts:77:46 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
apps/website/src/server/runtime/lifecycle/daemon-supervisor.ts:577:14 lint/suspicious/noAssignInExpressions The assignment should not be in an expression.
```

RELEASE-CHECK DONE
