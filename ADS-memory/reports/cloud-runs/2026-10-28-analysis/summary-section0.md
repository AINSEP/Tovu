## §0 Summary (one screen)

| Step | Result |
|---|---|
| 1 Tests — Jini | 48,751 tests; **16 fail** (12 files, 8 pkgs, all deterministic on re-run); 8 more pkgs red only on coverage thresholds; `test:scripts` 3 + 3 (infra-retirement gates) fail; typecheck: 26 errors (provider-plugins); `pnpm guard` 41 violations; build 0 failures |
| 1 Tests — Tovu | website/plugins/sdk node:test **32,833 tests, 247 fail** (≈60 ENV: no Postgres/chromium; rest triaged in §1) + **1 hanging test file**; admin vitest 13,724 tests / **32 fail**; desktop 2,538 tests / **2 fail**; root tsc exit 0 |
| 2 Coverage | Tovu website-side lcov 89.2 % lines / 75.4 % br / 63.2 % fn, **1,044 files never loaded**; route floor FAIL (82.9 % vs 88 %); admin 99.4 % lines. Jini: 102 production files at 0 %; per-package in §1 table |
| 3 Complexity (>10) | Jini 88 prod functions (54 cyclomatic / 34 cognitive); Tovu 169 (94 / 75); both `complexity:strict` scripts are broken as written (sonarjs plugin missing from CLI rule object) |
| 4 Architecture | Tovu check:architecture FAIL: 31 new module cycle pairs, SCC 0→61, back-edges to composition root 0→12; dependency-cruiser 1,334 errors; madge 212/183/172 file cycles (website/admin/desktop); Jini cycles small; direct vendor imports (sharp, better-sqlite3) in website core |
| 5 d6310d697 | 7 findings (1 high-risk URI-reuse issue), 3 dead/unverified |

**Top 10 to fix first (risk-ranked)**
1. **Tovu clean install is broken**: `npm ci` E404 — `@jini-ai/cookie-consent` is not on npm (package.json:134). CI/Docker builds depending on the registry fail; also `@tovu/sdk` typecheck fails against registry `@jini-ai/plugins@0.6.10`.
2. **Hanging test** `apps/website/src/server/__tests__/assistant-chat-recovery-bounds.unit.test.ts` — 2 subtests fail and the process never exits (a full `npm test` shard stalls until killed). Likely leaked timer in durable-run recovery.
3. **Architecture regression**: 31 new mutual module pairs, one 61-module SCC, 12 back-edges into the composition root (`platform`↔everything, `assistant`↔features). Verify whether the committed baseline is stale, then fix top edges.
4. **Jini `@jini-ai/db` peer conflict**: `@jini-ai/infra ^0.3.4` vs other packages' `^0.6.10` — no common version (scripts test `peer-range-compatibility`); breaks consumers' installs.
5. **Jini↔Tovu UI contract drift**: password-reveal button no longer "Show password" (Jini ui/user-management tests + 3 Tovu admin files); AG-UI boundary markers now emit status events (admin ×4 + Jini agentic/chat).
6. **`page.highlight` NaN/Infinity durationMs now throws instead of clamping** (agentic `page-capabilities.ts:60` vs executor clamp; 5 failing tests) — behavioural regression.
7. **Desktop renderer `ResourcesChip is not defined`** (websites-width test) — runtime ReferenceError candidate in apps/desktop renderer.
8. **Rendered pages now contain `jini-consent` markup / worker graph pulls forms services** (≈9 Tovu route tests, `worker-import-graph`) — Jini cms/cookie-consent changes leaking into public pages and the handlebars worker.
9. **d6310d697**: `surfaceUri`-keyed receipts can close a later card re-emitted under the same `ui://` URI (outcome-after-confirmation, retries); receipts over all history with no ordering; changeset says patch for a breaking template-URL change.
10. **Theme drift** `content/themes/__original-themes__/static/tovu-theme` ≠ shipped theme (2 canaries) + `identity` policy / `fs_write_files` batch opt-out / `s3` blob store env mismatch — small, high-confidence drifts. (Also: `complexity:strict` broken in both repos; `area-coverage-floors.json` missing; Jini guard N1 "Tovu" strings in cookie-consent.)
