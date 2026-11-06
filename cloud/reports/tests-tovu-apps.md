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
- Updated stale tests for private secret controls, automatic Select handles, provider discovery requests, lazy Library routes, and the required access-approver fixture. Focused verification so far: StaticSiteTab 105/105; Select + request volume 59/59; Library + execution settings 180/180; plugin provider + MCP 34/34. No production changes so far.

## Bugs found

Pending suite execution.
