# Wave-B merge re-check — 2026-11-16 (REPORT ONLY, no source edited)

**Verdict: NOT ready to merge into `refactor/terra`.** Huge improvement over the 11-15 check, but Jini `@jini-ai/daemon` still does not build/typecheck, guard/size gates fail, and ~85 website test files + 8 admin + 19 desktop tests still fail (non-ENV).

## Merge log (no conflicts anywhere; no source edits)
- Jini `integ/wave-b-fixed` = `origin/integ/wave-b` + `--no-ff` merges of `fix/wave-b-jini-runtime`, `fix/wave-b-chat-daemon`, `fix/wave-b-jini-tests-ui`; all clean. Pushed, HEAD `1fd7c076`.
- Tovu `integ/wave-b-fixed` = `origin/integ/wave-b` + `--no-ff` `fix/wave-b-tovu`; clean. Pushed (pre-push hook did not block). Report commit goes on top.
- Setup: Node v24.11.1 (~/.local/node24), pnpm 10.33.2. Jini `pnpm install --frozen-lockfile` OK. Tovu `npm ci` OK in root, apps/admin, apps/desktop (`--ignore-scripts`, ELECTRON_SKIP_BINARY_DOWNLOAD=1), apps/site-chat; `link-jini.mjs` linked 79 pkgs to /home/user/Jini. `terra` baseline NOT run (not cheap).

## Jini gates — before (check 11-15) → now
| gate | before | now |
|---|---|---|
| `pnpm -r build` | 11 pkgs failed | **1 pkg: daemon (9 TS errors)** |
| `pnpm -r typecheck` | 105 errors / 13 pkgs | **10 errors / 2 pkgs**: daemon 9, examples/neutral-host 1 |
| `tsc -p scripts/tsconfig.json` | 3 errors | 3 errors (unchanged) |
| guard | 153 violations | **79**: N1 35, N2 34 (comment words "Tovu"/"apps/website"/"apps/admin" in packages/{ui,user-management,chat,…}), HW3 8, R13 6 (agent-runtime fallbackModels), R10 1, injection-debt-stale 1. L3/SI/HW1 gone |
| check:size | FAIL | FAIL: new otel-port.ts:73 (97 lines); worsened chat A2uiSurfaceCard.hooks.ts:57, run-ledger.ts:126, plugins runtime-core.ts, server builtin-features.ts; ratchet-down admin SeoPage.tsx, cms write-service.ts; stale diagnostics otel.ts:105 |
| complexity / log-safety | PASS | PASS |

Remaining Jini typecheck/build errors (NEW? — same files as before, exactOptionalPropertyTypes + test arg shapes):
- `packages/daemon/src/http/xai.ts:796-801` (6× TS2375, ResolvedXaiHttpDeps vs XaiHttpDeps)
- `packages/daemon/src/http/tool-execution-routes.ts:235` (TS2379 onInternalError undefined)
- `packages/daemon/src/http/__tests__/routines.test.ts:788,810` (TS2741 `cursor` required in RoutineRunsQuery)
- `examples/neutral-host/src/connect-plugin-host.test.ts:28` (TS2322 old `(id:string)` vs `(required:{workspaceId}, optional?)` signature)

## Jini vitest (`--maxWorkers=2`, split by folder for ui/admin/cms) — failed/total tests
Before (only changed pkgs, many partial) → now:
- ALL ZERO failures: agent-plugins 2165, agentic 1136, analytics 224, artifacts 242, capability-providers 198, cli 583, commerce 10, core 2713, db 861, desktop-host 700, devops 1214, diagnostics 958, http-kit 539, infra 145, integrations 2051, mcp 1741, memory 409, platform 3102, plugins 1011, protocol 793, provider-plugins 873, registry 391, sandbox 179, search 356, server 473, sidecar 341, ui-kit 224, ui (all folders; only 3 failures, below), cms 3/4210.
- Failures (before → now): chat 21/147 → **5/4382**; daemon 23/381 → **12/4368**; user-management 13 files/114 → **3/1233**; admin (not run) → **27/3060** (36 of 710 files); agent-runtime 3 files → **1/4490**; sqlite 1/9; vibecoding 1/363; cookie-consent 1/178; ui 2+1 (previously timed out, ~614 lines); examples neutral-host 1/79, minimal-host 1/3; examples notes-app + reference-web: "no test suite found" (node:test files, not vitest → not run).
- Failure locations (all NEW? — no terra baseline):
  - daemon: `agent-executor/__tests__/mid-run-user-message.test.ts` (warn spy), `http/__tests__/routines.test.ts` (8, limit/cursor shape), `store/agent-sessions/__tests__/{pglite,pglite.socket,sqlite}.test.ts` (FK error now "agent session store unavailable")
  - chat: `__tests__/dbpkg-chat-manifest.test.ts`, `dbpkg-chat-neutrality.test.ts` (consumer identity in comments, = guard N1/N2), `store/__tests__/{loads-without-driver,manifest}.test.ts` (peer-dep shape), `react/features/chat-pane/__tests__/hooks/useChatPaneAgentControl.test.tsx` (message wording "still running" vs /streaming/)
  - user-management: `__tests__/public-args.test.ts` (`usePasskeySignIn` in react/auth/Passkeys.hooks.ts), `server/__tests__/authorization-regressions.test.ts` (2; minLength `integers: {}`)
  - admin (27): error-message fallback text assertions in comments/, forms/, redirects/, widgets/ (e.g. `comments/react/__tests__/use-comment-queue.unit.test.tsx`: got 'failed to load the moderation queue', expected 'network down') — error-cause propagation regressed or tests stale
  - cms: `forms/__tests__/repo.dialects.test.ts` (2), `seo/__tests__/seo.analyze.test.ts` (1)
  - ui: `features/execution/__tests__/index.test.ts` (DEFAULT_PROVIDER_PRESETS claude ids), `features/mcp-ui/__tests__/sign-in-card.unit.test.ts`
  - agent-runtime `providers/__tests__/connection-guard.test.ts` (EINVAL vs socket hang up — likely ENV/network); cookie-consent `bundle.smoke.test.ts` (gzip headroom 23 B < 32 B, size budget); sqlite `__tests__/surface.test.ts`; vibecoding `html/node/__tests__/parse5-region-parser.test.ts`; minimal-host `health-boot.test.ts` (fails because `pnpm --filter daemon build` fails → derived from daemon build); neutral-host `connect-plugin-host.test.ts` (same arg-shape as typecheck).

## Tovu
| gate | before | now |
|---|---|---|
| `@tovu/sdk` build (linked) | PASS | PASS (contracts: dist present) |
| website root tsconfig | 46 errors | **1**: `apps/website/src/server/runtime/composition/form-submissions.ts:53` (TS2322 `(required:{workspaceId}, …)` vs `(workspaceId:string)`) |
| apps/admin tsc | 30 | **0** |
| apps/site-chat tsc | — | 0 |
| apps/desktop main / preload / renderer | 67 / 0 / 0 | **61** / 0 / 0 (mostly `../website/**` pulled in plus `src/desktop-agent.ts:482,487` TS2740/TS2739 (Pick<ConversationStore>/Pick<AgentExecutor>), `import-handoff-ipc.test.ts`, `project-ipc.test.ts`, `workspace-chat-ipc.test.ts` IPC handler arg types) |
| tsconfig.tests.json | 260 | **142** (TS2345 74, TS2322 18, TS2353 13; worst files: features/post/__tests__/publish-content.test.ts 11, media delete-route.unit.test.ts 7, settings publish-content.round-trip.test.ts 7) |
| apps/admin vitest (FULL suite, vs 1166 failed of a 231-file subset before) | 1166 failed | **8 failed / 14472 tests; 12 of 3485 files** |
| apps/site-chat `npm test` | not run | **189/189 pass** |
| desktop `npm test` part1 / part2 | 22/2297, 2/917 | **19/2297, 2/923** |
| website node:test (446 changed test files + 877 importers from the 11-15 list, `--test-concurrency=1`, 27 batches) | changed-only ≈126 failed subtests/58 files; importers 198/887 reached | **all 1323 files run: 16949 pass / 333 fail subtests; 112 failing files (27 ENV-postgres/psql, 85 non-ENV)**. Changed-tests-only batches: 142 failed / 6253 |

Tovu admin remaining 8 (NEW?): `src/__tests__/admin-boot-readers.test.tsx`, `src/__tests__/unit/chat-fab-z-order-css.unit.test.ts:82`, `src/components/__tests__/AssistantDock.chat-settings.unit.test.tsx` (2), `src/lib/__tests__/admin-literal-copy.unit.test.ts` (features/sites/SiteImportTab.tsx:225 untranslated placeholder), `src/features/ai-assistant/__tests__/VisitorCredentialForm.unit.test.tsx` (Jini ui `execution/rules` reads `.trim` of undefined), `src/features/trash/__tests__/use-trash.unit.test.tsx` (cursor-2 expected, got null), `src/features/users/__tests__/users-agent-drive.unit.test.tsx` (deleteUser now called with an object, not 'u-bob'), `src/integrations/chart-providers/__tests__/recharts-bundle-integer-ticks.unit.test.ts` (missing `@jini-ai/provider-plugins/plugins/charts-recharts/0.7.0/client/provider.js` — plugin client asset not in dist → ENV-from-build/needs asset).
Desktop remaining (19+2): source-grep wiring tests (main shutdown/quit teardown, before-quit, electron-updater module scope), project/recent-sites torn-file handling, `site-process-registry` (starting vs stopped), `workspace-conversation-gaps` (gap revisions), preload subscribe-channel ×3, "packaged desktop can load its shared agent daemon supervisor", theme-preview webview guest; renderer `site-card-actions-wiring`/`websites-width` (375px). Some may be ENV (Electron binary skipped). Full list in /tmp transcript only; rerun `cd apps/desktop && npm test`.
Website non-ENV failing files: list in `cloud-results/web-fail-files.txt` (112 lines: class, file, #failed, first message). Dominant NEW? patterns (cross-repo contract mismatch Tovu↔Jini): `Cannot destructure property 'errorType' of 'helpers'` ×27 (assistant-byok-routes, assistant-proxy-routes, source-control tool-registrations…), `Invalid URL` ×15 (agent-plugin-connections.vertical-slice, connect-tool.api-connections, cost-counters.baseline), `mintRunCredential is not a function` ×11 (`server/inbound/assistant/__tests__/agent-daemon-server.typed-tools.integration.test.ts`), `.map is not a function` ×5 (`features/trash/__tests__/member-adapter.test.ts`), outbox/form-delivery deep-equals (`contracts/core/events/__tests__/{jini-outbox-parity,outbox-retry-policies}`, `form-delivery*`), moved-tools.golden catalog, configured-origin.test.ts (11).

## Classification
- ENV: Postgres/psql tests (27 website files; postgres-baseline), playwright-browser, Electron binary/e2e, node:test-only examples not run, agent-runtime connection-guard (network).
- PRE-EXISTING: none established (no terra baseline). 
- NEW?: everything else above.

## Blockers for merge into refactor/terra
1. Jini daemon build/typecheck (xai.ts, tool-execution-routes.ts, routines.test.ts) — also breaks minimal-host health-boot.
2. Jini guard (79: comment-text neutrality N1/N2, HW3, R13) and check:size ratchet.
3. Tovu: 1 website tsc error + 142 test-tsc errors + 61 desktop-main errors; Tovu↔Jini contract drift producing ~85 failing website test files (`helpers.errorType`, `mintRunCredential`, `Invalid URL`, outbox/form-delivery).
4. Jini admin (27) / chat (5) / daemon (12) / user-management (3) test failures: error-message propagation and arg-shape drift.
