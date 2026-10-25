# Full coverage + failure run — 2026-10-21 (Tovu 44b619d6, Jini a8c73796; branch cloud/coverage-2026-10-20)
Env: 4 cores / 16 GB, Node 24.22.0, pnpm 10.33.2. Start 02:10Z, stopped 04:55Z (2h45m cap). Peak RAM sampled: 7.5 GB used.
Setup: Jini install+build OK (only known packages/admin tsc error ProvidersTab.hooks.ts:181; dist emitted). Tovu npm ci x3 OK, sdk built, link:jini OK (symlinks verified).

## Suites
| suite | tests | pass | fail | skip | wall |
|---|---|---|---|---|---|
| Jini vitest (35 pkgs, summed) | 53,974 | 53,829 | 130 | 15 | ~2,000 s sequential (ui 404, chat 393, cms 113, desktop-host 121, db 90, daemon 81) |
| Tovu apps/admin vitest | 12,522 | 12,513 | 7 | 2 | 1,154 s |
| Tovu desktop node:test (2 runs) | 1,376 | 1,305 | 60 | 11 | ~2 min |
| Tovu website+plugins+packages+site-chat node:test | NOT FINISHED | ≥22.4k ✔ | 250 unique failing tests + ≥1 failed files | ? | killed at cap after 2h42m (concurrency=1) |
Jini failing by package: ui 25, admin 22, agent-runtime 21, platform 13, mcp 10, devops 6, charts-recharts 6, agent-plugins 5, chat 4, daemon 4, oauth 3, cms 2, server 1, ui-kit 1 (all other packages green).
Full list: failures.md (grouped by repo/package). No Postgres-ENV classification possible automatically (log has no 5432 refusals); ENV count 0 recorded.

## TRUE vs RUNNER coverage (coverage-all-files)
- Tovu: TRUE lines 31430/102363 (30.7%), branches 27.34%, functions 31.53%; RUNNER-only lines 31,430/32,607 (96.39%); never-loaded 1,811/2,647 files.
  WEBSITE LCOV MISSING: node:test writes lcov only at run end; run was interrupted, lcov.info empty. So apps/website (1,651 files, 58k lines), content/agent-plugins, site-chat, packages/sdk all counted 0% — Tovu TRUE total is a large UNDERestimate. Only apps/admin (98.4% lines, 728 files) and apps/desktop (155 files, 45 never-loaded, 7.7k uncovered lines) have real data.
- Jini: TRUE lines 35148/111570 (31.5%), branches 24.14%, functions 16.07%; RUNNER-only 35,148/37,972 (92.56%); never-loaded 2,072/2,705 files.
  JINI UNDERESTIMATE: vitest does not write a coverage report when a package has failing tests. The 14 packages with failures (list above) have NO coverage-final.json, so ALL their files count as never-loaded (0%). Only 21 packages produced coverage. Rerun those 14 with --coverage.reportOnFailure=true (~17 min total) for an honest Jini number.

## Top areas by uncovered lines (mostly artefacts of the two gaps above)
Jini: ui 17.6k (648 files, no report), chat 9.0k, cms 8.8k, agent-runtime 8.6k, admin 7.0k, daemon 6.1k, platform 4.4k, agent-plugins 3.2k, mcp 2.2k, plugins 1.7k, commerce 1.7k (24 files, 1 never loaded — genuine), devops 1.7k, oauth 1.3k, db 0.7k (81 files, 7 never loaded), server 0.7k.
Tovu: apps/website 58.3k (no lcov), apps/desktop 7.7k (real), content 4.0k (no lcov), site-chat 0.7k (no lcov), apps/admin 281 (real), sdk 12.
Detail per file: jini/ and tovu/ coverage-all-files.{md,json}.

## Not run / surprises
- Website lane not completed (see above); a rerun needs a split (server/** tiered scripts: test:cov:server:unit/integration) and >3h at concurrency 1, or higher concurrency.
- Desktop ran fine after npm ci (58+2 failures; 11 skipped).
- Jini packages/plugins has no vitest config run listed (counted only via all-files).
- Raw lcov/coverage-final not committed.
