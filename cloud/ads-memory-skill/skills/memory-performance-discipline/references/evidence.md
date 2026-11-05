# Evidence for the seven checks

Immutable commit/path anchors below support the lessons; they do not certify current performance. Open source at the cited revision before generalizing an incident. Repository numbers and retention counts are local policy, not defaults for other products.

| Checks | Repository evidence | Supported lesson |
|---|---|---|
| 1, 2 | Tovu [`6331ff2ea`, newsletter repository](https://github.com/AINSEP/Tovu/blob/6331ff2ea/apps/website/src/features/newsletter/repo.ts), [`campaign-write-service.ts`](https://github.com/AINSEP/Tovu/blob/6331ff2ea/apps/website/src/features/newsletter/campaign-write-service.ts) | List projections omit bodies; revision scans on save still need accounting. A smaller response does not establish bounded storage work. |
| 2, 5, 6 | Tovu [`27ba3c762`](https://github.com/AINSEP/Tovu/commit/27ba3c762): `apps/website/src/server/runtime/composition/modules/assistant-run-finalizer.ts`, `runtime/lifecycle/site-idle-park.ts`, chat migration `0003_active_run_index.ts` | Checkpoint cadence, final writes, timers, request holds/background work, and indexed busy probes are distinct costs and lifetimes. Check both migration and fresh-bootstrap paths. |
| 3, 4 | Jini [`efe7777f1`, run ledger](https://github.com/AINSEP/Jini/blob/efe7777f1/packages/chat/src/store/runtime/run-ledger.ts), [`read-version.ts`](https://github.com/AINSEP/Jini/blob/efe7777f1/packages/chat/src/store/sql/read-version.ts) | Growing text tails and saved-only barriers prevent blind append; CAS misses require authoritative merge. Receipts follow commit. Connection-wide invalidation can erase savings under unrelated writes. |
| 1, 4 | Jini [`4ec60b882`, publish jobs](https://github.com/AINSEP/Jini/blob/4ec60b882/packages/devops/src/deploy/publish-jobs.ts), [`line stream`](https://github.com/AINSEP/Jini/blob/4ec60b882/packages/daemon/src/agent-executor/sanitized-line-stream.ts), [`redactor`](https://github.com/AINSEP/Jini/blob/4ec60b882/packages/core/src/redact.ts) | Terminal job retention and stream carry require bounds. Forward scanning avoids repeated suffix searches; security semantics must survive the optimization. |
| 7 | Tovu [`27ba3c762`, measurement harness](https://github.com/AINSEP/Tovu/blob/27ba3c762/development/scripts/measure-site-memory.mjs) | Exercise the real finalizer/ledger and terminal completeness. Harness source and declared budgets are not completed measurements. |
| 6, 7 | [Electron incidents and official API documentation](electron.md) | Attribute process mode and lifecycle before assigning memory cost; preserve metric identity and measurement limits. |

## Limits

These are historical implementation/comment anchors, checked read-only; no application, Electron runtime, workload benchmark, or memory measurement was executed for this draft. Earlier reports about intermediate regressions do not prove a current production defect. A historical comment's timing is not a benchmark rerun.

The supplied historical RSS buckets total approximately 3.28 GB against a stated 3.23 GB total; raw samples and the discrepancy are unverified. They cannot establish how much memory Electron itself caused. Omit them from savings claims. Current packaged-runtime behavior and concurrent cache hit rates require measurement on that runtime.

Use **ESTIMATED** for a model, **MEASURED** only with comparable executed samples and budget results, and **UNVERIFIED** for missing execution or attribution. Keep full-work fallback and correctness costs visible even when a fast path is tested.
