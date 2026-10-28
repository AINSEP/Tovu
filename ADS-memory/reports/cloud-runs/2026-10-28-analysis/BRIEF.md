# Overnight ANALYSIS run — 2026-10-27/28 (owner: "no fixes, analysis only; we fix in the morning")

## HARD CAPS (top priority. When the first one is hit: write DONE/BLOCKED in RUN-LOG.md, push results, END)
- Model Sonnet 5.5. Max **4 hours wall clock**. Start **no new step after minute 220**. Max **~4M tokens**. **No subagents.**
- **NO CODE CHANGES.** Do not edit, fix, refactor, format or delete any source or test file in Tovu or Jini. Do not commit anything except files under `ADS-memory/reports/cloud-runs/2026-10-28-analysis/` on the RESULTS branch. Never push to `main`, `cloud/analysis-1028` or any branch except `cloud/analysis-1028-results` (Tovu repo). No PRs, no publish, no deploys.
- In your first 2 minutes, before setup: create `ADS-memory/reports/cloud-runs/2026-10-28-analysis/RUN-LOG.md` with a STARTED entry (UTC time, both HEAD SHAs), commit it, push to `cloud/analysis-1028-results`.
- Push at least every 10 minutes (heartbeat line if nothing changed). Log every failing command with exit code + first ~20 lines of stderr.
- If setup is blocked for >20 min, write BLOCKED with the reason and END.

## Code under analysis
- Tovu: branch `cloud/analysis-1028` (= merged local main, int/main-1027). Jini: branch `cloud/analysis-1028` in AINSEP/Jini (= merged local Jini main).
- Repos are pre-cloned at /home/user/Tovu and /home/user/Jini; `git fetch` + `git switch cloud/analysis-1028` in both.

## Setup (known container facts — 4 cores, 16 GB, Node 22 image, no Postgres server, no chromium)
- Node 24: `mkdir -p ~/.local && curl -fsSL https://nodejs.org/dist/v24.22.0/node-v24.22.0-linux-x64.tar.xz | tar -xJ -C ~/.local && mv ~/.local/node-v24.22.0-linux-x64 ~/.local/node24`. Prefix every command with `export PATH=$HOME/.local/node24/bin:$PATH;`, then `corepack enable --install-directory $HOME/.local/node24/bin`.
- Jini: `pnpm install --frozen-lockfile && pnpm --no-bail -r build` — log every package that fails to build (that is itself a finding).
- Tovu: `npm ci`; build `@tovu/sdk` BEFORE `npm run link:jini` (check-no-linked-jini blocks it after); desktop tests need `npm run build:preload` first.
- Known ENV-only failures (no Postgres server, chromium, IPv6): classify as ENV, don't chase them.

## Step 1 — Failing tests (report only)
- Tovu website: node:test in 8 shards, 3 at a time, `--test-concurrency=1`, each writing its own lcov (this also feeds Step 2). Admin + desktop: vitest `--maxWorkers=2 --minWorkers=1` with coverage. Jini: each package `npx vitest run --maxWorkers=2 --minWorkers=1 --coverage --coverage.reportOnFailure=true`.
- Typecheck: Jini `pnpm -r exec tsc --noEmit` (or each package's typecheck script); Tovu `npm run typecheck` (or the per-app tsc configs) — list errors per file.
- For every failing test: file, test name, first ~10 error lines, class = REAL BUG / STALE TEST / ENV / FLAKY (re-run once alone to decide), and the likely cause with `file:line` (read the test and the code it calls). Group same-cause failures.

## Step 2 — Coverage
- Tovu: `npm run coverage:all-files` (merges the shard lcovs) + `development/scripts/classify-coverage-gaps.ts`, `check-area-coverage-floor.ts`, `check-route-coverage-floor.ts` (report-only). Jini: per-package lcov from Step 1.
- Report: lines/branches/functions per package/area; the 30 largest UNCOVERED production files (by uncovered lines); files at 0%; routes/tools with no test at all. Target is 100% per file — list the gap size per file.

## Step 3 — Complexity (CCN must be ≤ 10)
- Both repos: `npm run complexity:strict` (Tovu) / `pnpm run complexity:strict` (Jini) with JSON output (`-f json -o …`). Also `development/scripts/check-src-complexity-drift.ts` + `check-admin-complexity-drift.ts` (Tovu).
- Report: count of functions over 10 (cyclomatic) and over 10 (cognitive) per package/area; the 40 worst functions (`file:line name — CCN / cognitive`); files with the most violations.

## Step 4 — Modularity, dependency injection, tangling
- Tovu: `npm run check:boundaries` (dependency-cruiser) + `development/scripts/check-architecture.ts` against its baseline — list NEW violations vs baseline separately from existing ones.
- Cycles: `npx madge --circular --extensions ts,tsx` on apps/website/src, apps/admin/src, apps/desktop/src and each Jini packages/*/src. List each cycle (shortest form) and its size.
- Cross-package: Jini packages importing each other in a cycle; Tovu importing Jini internals (deep imports past a package's exports) instead of public entry points.
- DI: find modules that construct their own dependencies instead of receiving them (direct `new` of DB/HTTP/FS/vendor clients inside business logic, module-level singletons, direct `process.env` reads outside config/composition roots, direct vendor SDK imports in core — e.g. `sharp` imported directly in apps/website/src/features/image-transform/image-ops.ts and features/media/view-image-tool.ts). Jini: run `pnpm run test:scripts` hardwiring check (`scripts/__tests__/check-hardwiring.test.ts`) and report its findings. Owner rules to judge against: vendor code lives in plugins, never core; API args are `(requiredObj, optionalObj)` with deps as ports; plugins never import each other.
- Report the 20 most tangled modules (highest fan-in × fan-out, or most cycle memberships) with one line each on why.

## Step 5 — Review of unreviewed WIP
- Jini commit `d6310d697` ("WIP for cloud check — unreviewed Codex", 10-24) is in main without review. Read its diff; report real bugs / risky code / dead code with `file:line`. Report only.

## Output (all under ADS-memory/reports/cloud-runs/2026-10-28-analysis/ on cloud/analysis-1028-results)
- `RESULTS.md`: §0 one-screen summary (counts per step + top 10 things to fix first, ranked by risk); §1 failing tests; §2 coverage; §3 complexity; §4 modularity/DI/cycles; §5 d6310d697 review; §6 NOT RUN (what the caps cut, with counts).
- Raw JSON/lcov summaries next to it (no full lcov files over 5 MB).
- Final RUN-LOG entry: DONE or BLOCKED + UTC time + total minutes.
