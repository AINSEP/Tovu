# Cloud run 2026-11-02 — verify tonight's fixes (+ fix what fails)

## CONTEXT BUDGET — HARD PRIORITY RULE (overrides finishing the task)
Your hard ceiling is 300k tokens of context — this applies to YOU (the coordinator session) and to EVERY subagent you spawn. Stop well before it. Once you are near 250k (or, if you cannot see your usage, after ~80 tool calls or many large file reads), start no new work: bring what you are doing to a good place, commit your work by explicit paths, push, write the handoff/RESULTS, and stop. A fresh agent continues from there. Stopping early at a committed point is always correct. Running past 300k is never acceptable. Never use git stash/checkout/reset to "tidy up" before stopping.

You are a cloud session with Tovu (/home/user/Tovu) and Jini (/home/user/Jini) pre-cloned. Do not read AGENTS.md / CLAUDE.md / AI-Dev-Shop; this file is your whole brief.

## HARD CAPS (iron rule: end the run when ANY cap is reached)
- **Wall clock: 2 hours** from your first command. At 1h45m stop starting new fixes; at 2h push what you have, write RESULTS, END.
- At most **2 parallel subagents/lanes**. No subagent fans out further.
- Fix only what a failing test or typecheck shows. Minor findings are LISTED in RESULTS, not fixed. No refactors, no new features, no dependency upgrades.
- If anything needs a schema migration, a production setting, a secret, or a change to CI/deploy config: list it, don't do it.

## Code under test
- Tovu: branch `cloud/verify-1102` (= local integration branch merge-1029, 66 commits over prod main 49127c1dc, + this brief). Work and push ONLY on this branch. Never push to main.
- Jini: branch `cloud/verify-1102` (21 commits over Jini main; these become 0.6.18). Push Jini fixes to this branch only. Never push Jini main, never publish to npm, never tag.
- Base for "before" (RED) checks: Tovu `49127c1dc`, Jini `origin/main`.

## Setup (container facts: Node 22 image, no Postgres server, Playwright browsers at 1243, no IPv6)
1. Node 24: install the nodejs.org tarball into ~/.local/node24 and `export PATH=$HOME/.local/node24/bin:$PATH` in every command. Then `corepack enable --install-directory $HOME/.local/node24/bin`; run pnpm only inside /home/user/Jini (pinned 10.33.2).
2. Jini: `pnpm install --frozen-lockfile`, then `pnpm --no-bail -r build` → raw/jini-build.txt.
3. Tovu: `npm ci` in root, apps/admin, apps/desktop, apps/site-chat. Then `npm run build --workspace @tovu/sdk`, then `JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini` (without the env var it fails), then `cd apps/desktop && npm run build:preload`.
4. Playwright pin: Tovu pins chromium_headless_shell-1228, the box has 1243 → `ln -s /opt/pw-browsers/chromium_headless_shell-1243 /opt/pw-browsers/chromium_headless_shell-1228` (adjust to the real dir) BEFORE any test.
5. Save raw output as `development/cloud/results-1102/raw/<step>.txt` (NEVER `*.log`: .gitignore drops those). Do NOT commit raw logs while a run is still writing them.

## Run — TARGETED (owner rule: test only what changed; full suites only at release)
Select test files from the diff, per repo:
- every test file added or changed in `49127c1dc..HEAD` (Tovu) / `origin/main..HEAD` (Jini);
- plus every test file in the `__tests__` dir next to (or named after) each changed NON-test source file.
Runners (concurrency capped):
- Tovu website/site-chat/dev-scripts node:test: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --experimental-test-module-mocks --test --test-concurrency=1 --test-timeout=120000 <files>` (in batches).
- Tovu admin: `cd apps/admin && npx vitest run --maxWorkers=2 <files>`.
- Tovu desktop: `cd apps/desktop && NODE_NO_WARNINGS=1 npm run gates` (full gates; desktop coverage floor 96% — SAVE the lcov file and the per-file coverage table to raw/, the owner wants per-file data).
- Jini: per touched package `npx vitest run <files>` + that package's no-emit typecheck (`npm run typecheck` or `npx tsc --noEmit -p tsconfig.json`).
- Typechecks: Tovu root `npx tsc -p tsconfig.json --noEmit`; admin `cd apps/admin && npx tsc --noEmit`.
RED proof (the fixes were written without running tests): for every `fix(` commit in both repos, run that commit's new/changed tests against the PARENT commit's source (use a separate `git worktree` at the parent, never checkout in the main tree) and record RED; then GREEN at HEAD. If a new test is green on the parent, the test doesn't prove the fix — list it.
Mark env-only failures (no Postgres, sandbox, IPv6) as ENV and don't fix them.

## Fix rules (owner rules; follow every one)
- Every fix starts with the failing test, shown RED → fix → GREEN → mutation-check (revert fix → red). Name the bug class and guard the class.
- Smallest correct change. Never weaken, skip or delete a test to make it pass. No `as any`, no ts-ignore, no eslint-disable.
- Keep "why" comments. Complexity ≤ 10 per function.
- Never add a production boot refusal (process.exit); never change passwords/credentials in code.
- Missing module = DECLARE the dependency in the package that loads it; never lazy-import it.
- Generic code belongs in Jini; no vendor code in core.
- Commit each fix separately (message ends `Co-Authored-By: Claude <noreply@anthropic.com>`), push the branch every ~30 min.

## RESULTS (owner: "every error has to be listed")
Write `development/cloud/results-1102/RESULTS.md` in Tovu; commit + push it at the end (partial at the 1h mark):
- SHAs tested, timings, setup failures with exact text; test file selection (count + list in raw/).
- Totals per area; EVERY failure with file, test, exact error, class (PRODUCT / TEST DRIFT / ENV), FIXED (sha) or NOT FIXED (why).
- RED/GREEN table for every `fix(` commit.
- Desktop gates result + per-file coverage below 96%.
- Every fix commit in both repos with red→green evidence; anything that needs the owner.
Then END the session.
