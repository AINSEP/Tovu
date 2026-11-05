# shared-oauth — in progress

Started 2026-11-05 around 19:02 UTC; hard stop by 21:02 UTC.
Branch: `cloud/shared-oauth` in Jini and Tovu. Never push main.
Jini base: `origin/cloud/oauth-refresh` = `2d2af2652` (includes refresh lease reload fix).
Tovu has no `cloud/oauth-refresh`; default pinned base `e327c07c8fc220fa8612ba1eb60c81c28b8a900f` used.

Scope: OA steps 1,3,4,5,6 with TRIM: explicit sharing only; local connections untouched; no boot migration; HTTP MCP only, stdio gated.
Loaded current Software Architect, Programmer and TDD personas from `/workspace/cloud/ai-dev-shop`.

Setup: requested fetch succeeded with command-level network permission. Explicit refspec was needed because the checkout's fetch mapping did not populate the remote tracking branch. Jini rebuild in progress before Tovu relink. No implementation validation claimed yet.

Implementation and focused integration verification are in progress. Final report will record all pushed commits, exact commands, failures and remaining scope.

## Checkpoint — in progress

Implemented shared consumer checks, exact issuing identity, site UUID bindings, explicit API destination, owner storage, HTTP MCP supplier, owner global stop and native confirmation. API/MCP stale-completion ordering is under adversarial review; no completion claim yet.

Focused evidence so far: Jini shared/account/access tests 66 pass; real owner SQLite/process tests 2 pass; API host/connect/surface tests 28 pass; real PostgreSQL bindings 1 pass; real ZIP export/import OAuth exclusion 3 pass; destination/skip tests 9 pass plus connect-flow tests 3 pass. Desktop focused IPC/preload/transport/render/hooks tests pass.

Measured fixture acquisition: 11 selected reads / 9,983 serialized boundary bytes, zero writes/scans. This measures an unexpired owner token acquisition through fixture ports, not a full host/provider refresh; excludes SQLite/WAL framing. Added work is per request, with no new background poll.

Setup baseline: `pnpm -r build` stopped at provider-plugins because its existing test import lacks jsdom. Required runtime packages were rebuilt individually and Tovu relinked. Root tsc then isolated a preexisting optional publish credential id type error, corrected narrowly (two internal input types, no runtime change) to unblock required desktop pre-push compilation.

Pushing uses clean detached worktrees so `git pull --rebase` cannot stash concurrent writers' changes. Jini pushes succeeded through b82642437; Tovu initial push succeeded through a860cbf74. Later Tovu checkpoint push is running its mandatory desktop gates; the snapshot predates the narrow baseline type correction and has reported that error. No hook/rule/test has been bypassed.

Open existing failures: two owner CLI subprocess cases timed out twice (normal and network-enabled container); retries stopped. They are separate from the passing real owner lifecycle proof.

## Delivery checkpoint — in progress; desktop exception pending

All shared OAuth implementation is committed through source snapshot `844135075` in Tovu and `fc972bfab` in Jini. Final website tsc and focused shared-module strict complexity checks pass. Latest owner/SQLite/process/PostgreSQL/archive batch: 19/19 passing. Admin typecheck retains three errors in unchanged Security/API-test files.

This checkpoint deliberately restores `apps/desktop` to pinned base while publishing the backend/admin implementation. The complete desktop work remains in reachable parent commits (source snapshot `844135075`); it is held from active source because the mandatory desktop pre-push gate is red. No test/check/policy was disabled or bypassed. User approval was requested before any `--no-verify` push of the full desktop snapshot; no answer has been assumed.

Desktop gate blockers include unchanged `desktopCopy` complexity10 and `siteRssOverTime` complexity11 against ceiling9, plus suite/coverage failures under investigation. Main website tsc and desktop pre-push typecheck are now green. Root reran the old owner CLI suite on pinned Tovu source: 10/11 pass, stale-import child times out30s; registered-stdin child passes near deadline29.4s. The current branch's earlier CLI run had two child timeouts; that second timing failure is not conclusively classified.
