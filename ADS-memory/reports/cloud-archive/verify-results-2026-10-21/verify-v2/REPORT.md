# Overnight verify v2 — 2026-10-21 (report-only, no source edits)
Start 05:36Z, tests finished ~07:25Z (≈1h50m; cap 4h not hit). Tovu HEAD 0c5698d44, Jini HEAD 52964993 (both confirmed).
## Env / setup
- 4 cores/16 GB, Node v24.22.0, no Postgres, no Playwright chromium for desktop width tests. Peak RAM 8.8 GB (all lanes + admin concurrently; sampled /20s).
- Jini `pnpm install` OK; `pnpm -r build` errors: **@jini-ai/mcp** (tsc exit 2) and **@jini-ai/admin** (tsc exit 2); other packages built. Tovu `npm ci` x4 OK, sdk built, link:jini -> 58 symlinks into /home/user/Jini/packages verified.
## Suites (files / tests / pass / fail / skip / wall)
- Jini vitest, 35 pkgs: 2,562 files / 41,692 tests / 41,621 / **58** / 13; wall ≈1h06m serial (largest: ui 956s, chat 660s, admin 305s, cms 232s, db 190s, daemon 184s; per-package times in j-times.txt). ALL 35 wrote coverage (last night: 14 missing).
- Many Jini pkgs exit 1 with 0 failing tests = vitest coverage-threshold failures (agent-runtime, core, devops, http-kit, mcp, memory, platform, ...), not test failures.
- Tovu admin vitest: 763 files / 12,510 / 12,498 / **10** / 2; 1403s.
- Tovu desktop node:test: run1 1,452 tests (1,435 pass / 6 fail / 11 skip, 74s); run2 (renderer+contracts) 530 (528 / 2 / 0, 77s).
- Tovu website+plugins+packages+site-chat node:test, 2,301 files in 8 shards (3 at a time): 27,543 tests / 27,286 pass / **204 fail** / 19 cancelled (shard 5) / 34 skipped. Shard wall 1468–2400s, all 8 wrote lcov (last night: none).
## Failures (detail: failures.md; NEW/STILL by test name)
| suite | entries | NEW | STILL | ENV | FIXED vs last night |
|---|---|---|---|---|---|
| Jini | 58 | 3 | 55 | 0 | 68 |
| Tovu admin | 10 | 9 | 1 | 0 | 6 |
| Tovu desktop | 8 | 4 | 2 | 2 | 57 |
| Tovu website etc. | 225 (parents+subtests) | 44 | 59 | 122 | 102 |
- ENV = *.postgres.test.ts / psql connection refused (website) and missing chromium (desktop websites-width). Last night's website list was incomplete (killed run) and desktop/website lists were name-only, so their NEW/FIXED are approximate.
- Likely cross-repo: Tovu admin NEW (media card/lightbox/tab-count tests, 9) and Jini NEW (admin qa-fixes lightbox, ui theme boundaries `lightbox.css` palette literal, cms navigation menu-html-mode) point at the recent Jini lightbox/media/menu changes.
- Desktop NEW (4): home-path/redaction asserts (smoke-bridge x2, smoke-native, tovu-server) — may depend on cwd /home/user; speech/preload-speech.test.ts file-level fail; check-gates-exit-code home-path assert.
## TRUE coverage (denominator = all source files; out/*/coverage-all-files.{md,json})
| repo | TRUE lines | RUNNER lines | TRUE branches | RUNNER branches | TRUE funcs | RUNNER funcs | files | never-loaded |
|---|---|---|---|---|---|---|---|---|
| Jini | 89.40% (153599/171818) | 96.51% | 86.84% | 97.83% | 80.01% | 96.82% | 2713 | 305 |
| Tovu | 97.24% (290011/298228) | 99.19% | 92.01% | 95.33% | 90.52% | 94.95% | 2652 | 44 |
## Per-area (top 20 by uncovered lines; full in area-tables.md)
Jini: chat 6804 uncov (35.4%, 138/192 files never loaded), plugins 1746 (0%, 41/41 never loaded), agent-runtime 1734 (87.9%), commerce 1706 (9.0%), devops 1517 (15.3%, 33/41 never), cms 1188 (93.0%), db 716 (80.6%), admin 555 (96.0%), ui 394 (99.1%), artifacts 390 (0%, 10/10 never), agent-plugins 351 (92.4%), core 276 (94.6%), daemon 214 (98.0%), oauth 156, user-management 153, platform 58, ui-kit 40, charts-recharts 38, capability-providers 33, diagnostics 24.
Tovu: apps/desktop 5803 uncov (79.5%, 18 never-loaded; vendor kuinetic.js alone 3,123), apps/website 1811 (99.25%, branches 94.75%), apps/admin 281 (98.35%), apps/site-chat 196 (87.9%), content/agent-plugins 123 (98.7%), packages/sdk 3 (99%).
## 100% per file
- No package/app has every file at 100% lines+branches+functions. Closest (files at 100%/files): ui 574/654, cli 15/17, integrations 69/77, agentic 37/45, daemon 83/101, core 74/91, platform 58/72, apps/admin 554/727, apps/website 962/1657, content 52/87, apps/desktop 61/155, site-chat 6/24, sdk 0/2.
## 0%-covered files
- Jini 398 files at 0% lines (305 never-loaded; the rest are loaded but unexecuted e.g. commerce lipay-plugin.ts 603 lines, lipay-gateway.ts 263, catalog/repo.ts 233). Tovu 45 (44 never-loaded; desktop scripts/, main.ts 467, website agent-daemon-server.ts 444, index.ts 150). Top 30 each: zero-files-top30.md.
## NOT RUN / caveats
- Raw lcov/coverage-final not committed (size). Admin ran after 6/8 website shards finished (≤2 shards running) as instructed.
- website shard 5 has 19 cancelled tests (see web-5 spec log, not published). Desktop "failures" list includes file-level ✖ entries only once failing-tests section parsed.
- Jini mcp/admin tsc errors at build did not block vitest (both ran).
