# FULL VERIFY — 2026-10-29 (everything since 10-28 evening: Codex r24–r34 + cloud lint fixes) (REPORT ONLY)

## HARD CAPS (first one hit: push RESULTS.md, write DONE/BLOCKED in RUN-LOG.md, END)
- Sonnet 5.5, 2h45m wall clock, no new step after minute 150 (shared cloud credit is low), no subagents.
- NO edits/commits of product code, tests, configs or lockfiles (local uncommitted setup edits only where stated). Commit + push ONLY files under ADS-memory/reports/cloud-runs/2026-10-29-verify/ and ONLY to Tovu branch cloud/verify-1029-results. Never push any other branch, never force-push, no PRs, no npm publish, no deploy, never create/run a RemoteTrigger.
- RUN-LOG.md: STARTED entry in the first 2 minutes, push at least every 15 min. Setup blocked > 25 min → BLOCKED + reason, END.

## Code
Tovu: branch cloud/verify-1029 (this branch = cloud/fixes-1029-work + this brief). Jini: branch cloud/fixes-1029-work in AINSEP/Jini. Use the checkouts the session gives you (or clone those branches).

## Setup (container facts from today's runs)
- Node 24: `mkdir -p ~/.local && curl -fsSL https://nodejs.org/dist/v24.22.0/node-v24.22.0-linux-x64.tar.xz | tar -xJ -C ~/.local && mv ~/.local/node-v24.22.0-linux-x64 ~/.local/node24`; prefix every command with `export PATH=$HOME/.local/node24/bin:$PATH;`; `corepack enable --install-directory $HOME/.local/node24/bin`.
- Jini: `pnpm install --frozen-lockfile && pnpm --no-bail -r build` (log failures).
- Tovu: Jini 0.6.15-rc.1 is published on npm (dist-tag next) but Tovu's manifests may still pin older ranges — for this run point every @jini-ai dependency at the local Jini (`npm run link:jini` with JINI_PACKAGES_DIR=/home/user/Jini/packages, after building @tovu/sdk); if `npm ci` fails on unpublished ranges, do a local uncommitted `file:` override as the morning runs did. Desktop tests need `npm run build:preload` first.
- Postgres: `apt-get install -y postgresql`, start on socket /tmp/.s.PGSQL.5432 + TCP 5432, trust auth, superuser role `la`. Do NOT export PGHOST.
- Chromium: playwright CDN is blocked; symlink /opt/pw-browsers/*-1243 dirs to the -1228 names the repo expects.

## Steps (record every command's exit code; group failures by cause)
1. Jini: `pnpm -r typecheck` (or tsc per package); `pnpm guard`; `pnpm run test:scripts`; every package `npx vitest run --maxWorkers=2 --minWorkers=1 --coverage --coverage.reportOnFailure=true` (save each json-summary).
2. Tovu typecheck: `npm run typecheck` + the admin, desktop and site-chat tsc configs + typecheck:tests if present.
3. Tovu tests: website/plugins/sdk node:test in 8 shards (3 at a time, `--test-concurrency=1`, 600 s per-file guard), each writing lcov; admin `npx vitest run --maxWorkers=2 --coverage`; desktop `npm test` in apps/desktop.
4. Coverage: `npm run coverage:all-files`, then `npx tsx development/scripts/classify-coverage-gaps.ts > raw/classify-coverage-gaps.log`, `check-route-coverage-floor.ts` (floor is now 99% lines — it is expected to fail; record the numbers), and a per-file route coverage table → raw/route-coverage-per-file.json (file, lines%, branches%, funcs%, uncovered line count). Jini: list every production file under 100% lines/branches/functions → raw/jini-files-under-100.json (exclude examples/ and built provider-plugins/plugins/*/ bundles).
5. Complexity: `npm run complexity:strict -- -f json -o raw/tovu-complexity.json` and `pnpm run complexity:strict -- -f json -o raw/jini-complexity.json`; report counts (expected ~0 outside old migrations).
6. Architecture: `npm run check:boundaries` (dependency-cruiser) and `npx tsx development/scripts/check-architecture.ts`; madge --circular on apps/website/src, apps/admin/src, apps/desktop/src → counts + the largest SCC members.

## Output → ADS-memory/reports/cloud-runs/2026-10-29-verify/RESULTS.md (+ raw/)
§0 one screen: pass/fail counts per suite, typecheck errors, coverage headline numbers (Tovu route lines/branches/funcs, Jini per package), complexity counts, architecture counts. §1 every failing test: file, test name, first ~15 error lines, re-run alone once (FLAKY if it passes), class REAL/STALE/ENV, likely cause with file:line. §2 coverage gaps (top 50 route files by uncovered lines; Jini files under 100). §3 complexity. §4 architecture. §5 NOT RUN (what the caps cut).

## Output rules (NEW — owner rule)
- Save EVERY tool's full stdout+stderr as raw/<step>.txt (NOT .log — Tovu .gitignore drops *.log, which lost the lists last time). Commit raw/ with RESULTS.md.
- RESULTS.md must LIST EVERY ERROR (every typecheck error line, every boundary error pair, every failing test, every guard violation, every complexity message) — never counts only. Put long lists in raw/*.txt and link them; §0 still shows counts.

## Extra measurements this pass
- madge: for apps/admin/src and apps/desktop/src split cycles into (a) own-code only, (b) only website files pulled in, (c) Jini dist, (d) mixed; list the members of every own-code cycle. List every website file imported by admin and desktop (production files only).
- `npm run check:boundaries -- --output-type err-long` full list; plus counts by rule for errors AND warnings.
- Jini: `pnpm guard` full output; Jini `pnpm run complexity:strict` (should no longer abort) full output.
- Jini commerce: `cd packages/commerce && pnpm test:coverage` if the script exists.

## Context for this pass
- Since the 10-28 evening verify (Tovu 129 failing tests in 63 files, typecheck:tests 56, boundaries 167 errors, madge 28/97/90): Codex fixed the 63 files, the 72 typecheck:tests errors, all 19 Jini guard violations, Jini coverage tests for ~157 files, route-coverage tests, Node-24-fragile tests, 164 boundary errors (entries + 24 exact exceptions), 18 cycle groups, a generic ToolContributor contract in @jini-ai/core adopted by 81 Tovu files, composition relocations; then a cloud session fixed sonarjs lint (Tovu 324→5, Jini 1810→620) incl. 4 ReDoS regexes. NONE of it has been tested — expect real breakage; report it precisely (REAL vs STALE vs ENV, likely cause file:line).
- Compare every number with the 10-28 evening pass in a delta column.
