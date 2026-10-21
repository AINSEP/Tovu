# cov-T3 progress (tovu lots 038..055)
Started 2026-10-21 15:37 UTC. Base Tovu e0c935bb5, Jini b3c4144b (cloud/integration-2026-10-21).
Setup: node 24.22.0, Jini install+build OK, Tovu npm ci (root/admin/site-chat/desktop+preload) OK, sdk build OK, link:jini OK.
Postgres/Playwright: not installed (owner override) — such tests listed as LOCAL-RUN NEEDED.

| lot | status | subagent branch | merged |
|---|---|---|---|
| 038 | merged 16:44 (46e2908a1). Subagent: 23/25 at 100%; publish-backstop-row br 61/62 (SQL-quoting guard kept), import-database-worker 124/125 32/35 16/18 (hostile-DB branches). Coordinator REVERTED its vault-credential-recovery source change (dc6070aa5): it swapped 3 fail-safe fallbacks for non-null assertions in credential recovery; guards kept for owner review, file now 100/94.59/100 with the new tests (26 pass). Spot-verified gated-mutation-token-repo + publish-trust-revocations 100/100/100 (61 tests). Review note: lazy-browser test t.mock.module('playwright') — third-party boundary mock, flag for owner. | cloud/cov-T3-038 @ac19d14e1 | 46e2908a1 |
| 039 | merged 16:20; 635 tests 0 fail; all 100% except init-site 99.59/96.88 (Postgres), local-site-child br 97.06 (subprocess merge), site-key-dependent-data br96/fn83 (Postgres), site-root fn80 (required empty port) | cloud/cov-T3-039 @0ebbc0918 | 22d3ba57c |
| 040 | merged 16:28 (9ac5262ec). Subagent reports 25/25 files at 100%. Coordinator re-verified on merged branch with the subagent's scoped test set: 8 assistant credential routes 100/100/100, 63 tests 0 fail. Other 17 files NOT yet re-verified on merged branch. Note: a broad 306-file rerun showed lower numbers (e.g. widgets fn 5%, dev-auth br 74%) because it included tests that t.mock.module these units, which splits lcov records; that run is not a valid measurement. | cloud/cov-T3-040 @3fd80d706 | 9ac5262ec |
| 041 | dispatched 16:18 | cloud/cov-T3-041 | |
| 042 | dispatched 16:22 | cloud/cov-T3-042 | |
| 043 | dispatched 16:41 | cloud/cov-T3-043 | |
Sessions used: 6/15 (an earlier ledger version said 4/15 — undercount, corrected).

Process fix 16:41: subagents shared one scratch folder; lot 038 found its measuring script overwritten ~16:23. Brief now requires /home/user/wt/scratch-T3-NNN/; lots 041/042 told to re-measure. Lot 039 was fully re-measured by the coordinator; lot 040 only 8/25 files re-measured so far.
