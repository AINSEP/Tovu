# tests-tovu-apps

Status: in progress. Started 2026-11-06 19:49 UTC; hard cap 21:49 UTC.

Branch: `cloud/tests-tovu-apps` in Tovu and Jini.
Base: Tovu `b34b9cb7ada1783698eea8ec83bb3d6913fc63c4`; Jini `3a41ec5b678e7445dce1f23d5fe08735cdd4e2b8` (`origin/cloud/combine`).

Fresh Jini frozen install, core build, recursive build, and Tovu relink succeeded. Contracts, SDK, and desktop preload builds succeeded. Logs: `/workspace/work/tests-tovu-apps/`.
Assigned suites: admin tests/typecheck/full coverage against 98% floors; standalone site-chat; desktop gates (tests/typecheck/coverage/complexity).

## Results so far

- Standalone site-chat: `source /workspace/.tovu-build/env.sh; npm --prefix apps/site-chat test` — 188 passed, 0 failed, 0 skipped; 17 suites. Exit 0.
- Standalone site-chat typecheck: `source /workspace/.tovu-build/env.sh; npm --prefix apps/site-chat run typecheck` — exit 0.
- Logs: `site-chat-tests-1.log`, `site-chat-typecheck-1.log` under the log directory above.
- Admin typecheck passed. Initial admin test run hit container OOM (exit 137); retry will bound workers without changing tests or thresholds. Desktop gates running.
- Updated stale tests for private secret controls, automatic Select handles, provider discovery requests, lazy Library routes, and the required access-approver fixture. Focused verification so far: StaticSiteTab 105/105; Select + request volume 59/59; Library + execution settings 180/180; plugin provider + MCP 34/34. The only production edit normalizes module-initialization Warning dictionary assignment to the existing Object.assign assembly idiom; behavior and request costs are unchanged.

## Further focused results

- Dictionary guard, theme cascade, Sites and Skills translations: 179/179 tests passed. Skills assembly false positive now has a regression test proven red first and negative runtime-bypass probes; the guard still rejects runtime fragment access. The theme test now includes the existing SeeMore stylesheet before the same exact theme cascade.
- Desktop stale fixtures: IPC inventory 8/8 passed; App rendering/start-panel 17/17 passed. Exact Keep-running IPC assertion added. Full desktop typecheck/complexity and final tests pending.
- Fresh admin typecheck passed after all admin edits.
- Admin full coverage is running with `--maxWorkers=2`, full source scope and unchanged 98% floors.
- Chromium download was blocked by environment network policy (`cdn.playwright.dev`, HTTP 403 Domain forbidden). Electron installed successfully using its package installer and a workspace cache; harness import recheck pending.

## Bugs found

- Admin expectations drifted from intentional secret privacy/default handle/provider discovery/lazy route changes; refreshed without dropping behavior checks.
- Execution settings integration fixture omitted the newly required access-approver port; fixed with strict caller/tool assertions.
- Dictionary guard rejected valid owner initialization in Skills; added exact assembly recognition with negative bypass checks.
- Desktop IPC inventory and renderer bridge fixture omitted the implemented Keep-running capability; refreshed and retained existing lifecycle checks.
- Container process descendants can remain zombies under PID 1, failing liveness assertions; environment finding, tests unchanged.

