# L10 run log (append-only)
## 2026-10-25T16:24Z — STARTED
Tovu @ stryker branch; Jini cloud/overnight-1024-jini cloned+built (/root/Jini). 4 cores. Stryker 9 + vitest-runner, concurrency 3, incremental, StringLiteral excluded.
Mutant counts (dry run): analytics 642; cli 1635; desktop-host 3040 (dry 3m27s); vibecoding 2260; diagnostics 3675; admin non-react/non-browser 10748 (dry ~4m); artifacts TBD.
Setup deviations (untracked, not committed, in Jini clone): `vitest.stryker.config.ts` per package excluding tests that fail under the Stryker sandbox: admin `draft-rules.test.ts` (TZ-forcing assertion "actually running in a non-UTC zone" fails in sandbox), vibecoding `session-exports.test.ts` (packs dist to /tmp, ERR_MODULE_NOT_FOUND @jini-ai/core — also fails standalone), diagnostics `page-performance.test.ts` (stringifies the instrumented function → `stryMutAct is not defined`; source `page-performance-script.ts` + `page-structure-script.ts` removed from mutate for the same reason). admin: `**/react/**` and `src/browser/**` excluded from mutate (UI/hook code needs jsdom).
Runs go sequentially in order admin, cli, desktop-host, vibecoding, diagnostics, artifacts, analytics.
