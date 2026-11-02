# Cloud run 2026-11-02 — desktop coverage investigation (READ + MEASURE only)

## CONTEXT BUDGET — HARD PRIORITY RULE (overrides finishing the task)
Your hard ceiling is 300k tokens of context — this applies to YOU and to any subagent you spawn. Stop well before it (~250k): commit + push what you have, write the report, stop. Never use git stash/checkout/reset to "tidy up".

Do not read AGENTS.md / CLAUDE.md / AI-Dev-Shop; this file is your whole brief.

## HARD CAPS
- 1 hour wall clock from your first command. At 50 min stop measuring and write the report.
- At most 1 subagent. No product or test code changes, no fixes.
- Push ONLY to a new branch `cloud/desktop-coverage-1102` in Tovu. Never push main. Jini is read-only.

## Setup
1. Node 24: nodejs.org tarball into ~/.local/node24; `export PATH=$HOME/.local/node24/bin:$PATH` in every command; `corepack enable --install-directory $HOME/.local/node24/bin`.
2. Jini (/home/user/Jini, main = 0.6.17): `pnpm install --frozen-lockfile && pnpm --no-bail -r build`.
3. Tovu (/home/user/Tovu, this branch): `npm ci` in root, apps/admin, apps/desktop, apps/site-chat; `npm run build --workspace @tovu/sdk`; `JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini`; `cd apps/desktop && npm run build:preload`.
4. Playwright pin: symlink the box's chromium_headless_shell-1243 dir as chromium_headless_shell-1228 before tests.
Save outputs under `development/cloud/results-desktop-cov-1102/raw/` (never `*.log` names).

## Questions (the owner suspects the CODE SHAPE causes the testing gap, and that the coverage numbers are misleading)
1. Run desktop coverage (the coverage / gates script in apps/desktop/package.json). Save the full output, the lcov file, and a PER-FILE table (lines AND branches, sorted by uncovered branches).
2. A static pre-read claimed: main.ts (2,040 lines, Electron entry) is in NO coverage area; renderer .tsx (3,447 lines), preload.mts and 4 paused agent/chat files (755 lines) are outside every denominator; floors are per-area, not per-file; Node line % counts comments/blank lines as covered (branch % is the honest number); 17 tests read source as TEXT and ~20 run cut-out code via `new Function`, giving the real file 0 coverage; knownUnmeasured lists stale preload-speech.cjs while preload-speech.cts isn't counted. CONFIRM or REFUTE each with the real lcov. Compute what the numbers become if main.ts, .tsx and preloads are included, and if gated on branch % per file.
3. Top 10 files by uncovered branches: one short sample each (≤15 lines, file:line) of the untested code and WHY it is hard to test (Electron / fs / child_process / timers / process.env called directly, import-time side effects, singletons, long functions).
4. Module import diagram (text), cycles, where logic lives (main.ts vs pure modules).
5. Estimate tests needed to reach 96% per-file branch coverage as-is vs after moving main.ts decisions into small pure modules with injected ports (thin wiring shell). Show ONE before/after (≤30 lines). Say which exclusions are legitimate (thin shell, preload one-liners, dist, tests) vs cheating.

## Output
`development/cloud/results-desktop-cov-1102/REPORT.md` in plain language for a non-specialist owner (short sections, numbers first). Commit + push branch `cloud/desktop-coverage-1102`. Then END the session.
