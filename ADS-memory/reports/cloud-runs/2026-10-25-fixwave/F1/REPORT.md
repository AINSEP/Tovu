# F1 — Jini security (L1) + daemon (L8) fix wave — INTERIM
Started 21:34 UTC. Jini branch `cloud/fixwave-1025-F1` (from `origin/cloud/overnight-1024-jini` @ 3e2fbae8). Baseline: daemon 153 files / 3562 tests green on the unmodified tree (Node 24.22, vitest 2.1.9).

## Progress (step 1 — security guards, negative tests first)
- daemon `http/remote-run-events.ts:93` bearer gate: 12-row deny table + null-literal-token kill + exact parse-refusal bodies. Re-score so far: 77.32 % (44 surv) — re-run in progress.
- daemon `run-credentials.ts:219` owner-known-but-run-missing → 404 (and runExists never consulted); fail-closed lookup; route-policy /g,/y; one-clause-broken gate table. Stryker: **99.59 %** (243 killed, 1 survivor = `exemptPaths=[]` default array → `["Stryker was here"]`, equivalent in practice).
- user-management: seeded-owner password reset by a SECOND OWNER refused (verified load-bearing: guard→false makes the new test fail); `*` scoped/constrained rows not the wildcard (authorize, principalHoldsOwnerWildcard, assertGrantClamp); `*` registration refused.
- oauth authorization-code: ≥2 redirect URIs (first/middle/last), state ""/MAX/MAX+1 (shape check before store), empty/missing code.
- platform: guarded client userinfo (user-only / password-only / both) refused before DNS; cap 99/100/101; IPv6/embedded-IPv4 grammar table.
- `store/event-log/sqlite.ts` "0 % no-coverage": vitest coverage is **100 % lines/branches** already (42 tests). Stryker anomaly REPRODUCED (112 NoCoverage); root cause under investigation (hypothesis: `vitest.config.ts` computes sibling-package aliases via `new URL('../', import.meta.url)`, which points outside the package from inside `.stryker-tmp/sandbox-*`, so vitest's `related` graph cannot resolve `@jini-ai/db/sqlite` and drops the sqlite tests).
