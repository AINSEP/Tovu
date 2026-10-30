# FINAL VERIFY 2 — 2026-10-30 — RESULTS (PARTIAL: cap hit; worker restart killed the node:test shards at ~08:57Z)
Tovu `cloud/verify2-1030` (51ce554a), Jini `cloud/verify2-1030` (1bff178a). Sonnet 5.5, no subagents. Start 07:36Z, end ~09:00Z.
ENV (counted, not listed): `file:` rewrite -> ~1200 kysely-duplicate TS errors; release-manifests / product-telemetry / sdk-public-api semver; Windows taskkill on Linux; Chromium not set up (browser-rendering tests).
Postgres 16 was installed first and ran for all shards.

## §0 One screen (delta vs cloud/verify-1030-results)
| Area | Now | Prev |
|---|---|---|
| Jini install / `pnpm -r build` / typecheck / guard | all exit 0 | 0/0/0/0 |
| Jini test:scripts | **3 fail** (infra-retirement, §1) | 1 fail |
| Jini vitest agent-runtime 4296, daemon 3837, db, mcp, ui, user-management, provider-plugins, plugin-catalog | pass | db had 1 fail -> now passes |
| Jini vitest chat | **1 fail** (MessageRow, fails solo) | pass |
| Jini vitest cms | **1 fail** (navigation alias, fails solo) | pass |
| Tovu tsc root / e2e / desktop-main non-kysely | 6 / 6 / 6 — all `ExpressionBuilder` kysely-copy = ENV (real = 0) | 21 / 21 / 1 |
| Tovu tsc tests non-kysely | 8 = 6 ENV + **2 REAL** (§1) | 62 |
| Tovu admin tsc, desktop preload/renderer/live-verify | 0 | 0 |
| Tovu admin vitest (components, ai-assistant, skills) | 147 files, 2022 tests pass | 775 pass |
| Tovu desktop `npm test` | 1850 tests, 1839 pass, 10 skip, 1 fail = Windows taskkill (ENV) | not run |
| Tovu complexity:strict | **2 errors** -> 1 after my fix | 0 |
| Tovu check:boundaries | 0 errors, 35 warnings | 2 errors |
| Tovu node:test shards | 1,2,3 complete; 0 complete after 0b-rerun partial; 4,5,6,7,0b INCOMPLETE (killed) | 65 failing files |

## §1 Failing tests
Raw: `raw/*.txt`; solo re-runs `raw/rerun/`.
| Test | Class | Cause / first error |
|---|---|---|
| Jini scripts/__tests__/integration/infra-retirement.integration.test.ts (3: Tovu imports, Tovu manifest dep, j05 final state) | REAL (cross-repo, retirement not finished) | Tovu `apps/website/src/contracts/core/events/*outbox*.ts` still import `@jini-ai/infra/events/outbox`; Tovu `package.json` dependencies still has it (raw/jini-test-scripts.txt:150-270) |
| Jini chat MessageRow.test.tsx:120 "keeps one ticking activity line…" | REAL (fails solo) | after queued rerender the activity line shows `Thinking… 0 s`, expected `3 s` (clock restarts); raw/solo-jini-chat-MessageRow.txt |
| Jini cms navigation/__tests__/tool-registrations.test.ts:170 "alias collisions (id, menuId)" (two cases share the name) | REAL/STALE | core `normalizeToolInput` now throws `ToolInputNormalizationError` (test expects `ToolInputError`), and `{id:X, menuId:X}` (equal values) no longer conflicts -> reaches handler (`MenuNotFoundError`); handler's own check at tool-registrations.ts:151 never reached |
| Tovu tsc tests: assistant/__tests__/tool-registrations.plugins-uninstall.test.ts(91) missing `providerFaces`; features/agent-plugins/__tests__/unit/install-tool.unit.test.ts(38) missing `pluginInstallSource` | REAL | `testSiteLayoutContext<T>` (`__tests__/fixtures/site-layout-context.ts:49`) infers T from the return-type context. Tried `NoInfer<T>`: worse (more errors) -> reverted, not pushed |
| Tovu complexity `server/inbound/assistant/agent-daemon-server.ts:1353 launchAgentRun` = 18 | REAL, not small | |
| Tovu byok-tool-surface.test.ts "describe_tool returns a real tool's input schema…" and "…executeMetaTool is recorded…"; tool-catalog-query.test.ts "describe content_read lists only registered cards"; tool-catalog-live-query.test.ts "daemon describe route…" (solo: 2/1/1 fail) | REAL (the known RED set: content_read namespace describe falls back to family, `content_read.workspace_but_invented` found:true, route 200 not 404) | tool-catalog-query.ts:58-75 `describeContentReadFamily` |
| Tovu every-cli-default-settings.contract.test.ts (solo fail) | REAL | `runLifecycle.emit is not a function` (agent-daemon-server.ts:1400/1332 use `runLifecycle.emit`; test fake lacks it) |
| Tovu process-root-parity.test.ts "daemon dev mode passes bypass…" (solo fail) | REAL/STALE | `ReferenceError: policy is not defined` from `evaluateDaemonExpression` (helpers/daemon-source.ts:53); `policy` defined at agent-daemon-server.ts:1364 |
| Tovu shard 6: six "runtime: cold and resumed CLI cwd / session…" tests | REAL (unverified; same `launchAgentRun`/lifecycle family; not solo re-run — file not located) | |
| Tovu shard 7: cloudflare-pages / deploy retained after failed retirement (x4), "receiver trickling bytes forever", sheets_tab_modify vertical slice | UNVERIFIED (no solo re-run, out of time) | see raw/tests-shard-7.txt |
| Tovu shard 6: 3 contact-form stylesheet "in a browser" tests | ENV (no Chromium) | |
| Tovu no-vendor-in-core.boundary.test.ts (stale exception counts) | STALE | **Fixed** 36547797 |
| Tovu release-manifests, product-telemetry "declares no production vendor plugins" | ENV (semver) | |
| Tovu desktop tovu-server-failures.test.ts:97 Windows taskkill | ENV | |

## §2 Fixes pushed — Tovu `cloud/verify2-1030-fixes`
- 36547797 no-vendor-in-core.boundary.test.ts — lowered 3 stale counts in vendor-exceptions.json (solo: 15/15 pass).
- 5909ee3d `projectAssistantAgent` complexity 11 -> <10 (split optional fields helper); eslint clean, agents.test.ts + agents-owned-runtime.test.ts 25/25 pass, tsc: no errors in agents.ts. complexity:strict full re-run NOT done.
No Jini fixes pushed.

## §3 NOT RUN / unfinished
- Tovu node:test shards 4, 5, 6, 7 and the 0b rerun (shard 0 hit my own 3000 s timeout; its ~111 files from `cli/` onward were cancelled, re-run as 0b) were killed mid-run by the worker restart; 0 failures seen in 4/5/0b before the kill, but their completion is unknown. Re-run them. Shard 3: 4861 tests, 0 fail. Shard 1: 1 fail (fixed). Shard 2: 0 fail.
- Solo re-runs not done for shard 6/7 failures listed above; no FLAKY determination for them.
- Fix pass limited by cap; no full re-run after fixes.
- Concerns: the DI/R2 refactor still leaves daemon-lifecycle test fixtures (runLifecycle.emit, policy extraction) and test-fixture typing broken.

RELEASE BLOCKERS: Jini chat MessageRow ticking (REAL); Jini cms alias-collision (REAL); Jini infra-retirement x3 (Tovu still depends on @jini-ai/infra); Tovu content_read describe/catalog tests (byok-tool-surface x2, tool-catalog-query, tool-catalog-live-query); every-cli-default-settings; process-root-parity dev-mode bypass; launchAgentRun complexity 18; 2 test-tsc fixture errors; plus UNVERIFIED shard 6/7 failures and unfinished shards 4-7.
