# Cloud run 2026-11-01 — full verify + FIX (owner-approved: "go ahead and fix stuff in the cloud")

You are a cloud session with Tovu (/home/user/Tovu) and Jini (/home/user/Jini) pre-cloned. Do not read AGENTS.md / CLAUDE.md / AI-Dev-Shop; this file is your whole brief.

## HARD CAPS (iron rule: end the run when ANY cap is reached)
- **Wall clock: 2 hours** from your first command. At 1h45m stop starting new fixes; at 2h push what you have, write RESULTS, END.
- At most **3 parallel subagents/lanes**. No subagent fans out further.
- Fix only what a failing test or typecheck shows. Minor findings are LISTED in RESULTS, not fixed. No refactors, no new features, no dependency upgrades.
- If anything needs a schema migration, a production setting, a secret, or a change to CI/deploy config: list it, don't do it.

## Code under test
- Tovu: branch `cloud/verify-1101` (= main 49127c1dc + this brief). Work and push ONLY on this branch. Never push to main.
- Jini: branch `main` @ 8a4794ce0 (0.6.17, published). Make Jini fixes on a new branch `cloud/verify-1101` in Jini and push it. Never push Jini main, never publish to npm, and never tag.

## Setup (container facts measured 10-21; no Postgres, no Chromium, no IPv6)
1. Node 24: install the nodejs.org tarball into ~/.local/node24 and run `export PATH=$HOME/.local/node24/bin:$PATH` in every command. Then `corepack enable --install-directory $HOME/.local/node24/bin`, and run pnpm only inside /home/user/Jini, where it's pinned to 10.33.2.
2. Jini: `pnpm install --frozen-lockfile`, then `pnpm --no-bail -r build`. Save the output to raw/jini-build.txt.
3. Tovu: `npm ci` in the root, apps/admin, apps/desktop and apps/site-chat. Then `npm run build --workspace @tovu/sdk` BEFORE `npm run link:jini`. Then `npm run link:jini`, then `cd apps/desktop && npm run build:preload`.
4. Save raw output as `raw/<step>.txt` under `development/cloud/results-1101/`. NEVER name it `*.log`: .gitignore drops those.

## Run (full suites; this is the pre-release check for desktop 0.1.26)
- Jini: every package's vitest (`pnpm -r --no-bail test`, or per package with `--coverage.reportOnFailure=true` off), plus `scripts/__tests__`, plus each package's no-emit typecheck (`pnpm -r --no-bail typecheck` if the script exists).
- Tovu website: `node:test` in about 8 shards, 3 at a time, `--test-concurrency=1` (`TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test …`). Plus apps/site-chat tests and the development/scripts tests.
- Tovu admin: vitest (`cd apps/admin && npx vitest run --maxWorkers=2`).
- Tovu desktop: `cd apps/desktop && NODE_NO_WARNINGS=1 npm run gates` (lint + typecheck + tests).
- Typechecks: Tovu root `npx tsc -p tsconfig.json --noEmit`; admin `cd apps/admin && npx tsc --noEmit`. The 16 GB box can take it.
- Mark env-only failures (no Postgres/Chromium/IPv6/socket EPERM) as ENV, and don't fix them.

## Fix rules (owner rules; follow every one)
- Every fix starts with the failing test, shown RED. Then fix, show it GREEN, and mutation-check that the test goes red again if the fix is reverted. Name the bug class and guard the class.
- Smallest correct change. Never weaken, skip or delete a test to make it pass. No `as any`, no ts-ignore, no eslint-disable.
- Keep "why" comments; refactors move them, never delete them. Complexity ≤ 10 per function.
- **Never add a production boot refusal (process.exit) and never change passwords/credentials in code** (owner 11-01).
- Missing module = DECLARE the dependency in the package that loads it; never lazy-import it.
- Generic code belongs in Jini; vendor code goes in its plugin folder. Don't add vendor code to core.
- Commit each fix separately with a clear message ending `Co-Authored-By: Claude <noreply@anthropic.com>`, and push the branch every ~30 min so nothing is lost.

## RESULTS (owner: "every error has to be listed")
Write `development/cloud/results-1101/RESULTS.md` in Tovu, commit and push it at the end (and a partial one at the 1h mark):
- SHAs tested, timings, setup failures with exact text.
- Totals per area (files run / passed / failed / timeout).
- EVERY failure, with file, test name, exact error and class (PRODUCT / TEST DRIFT / ENV), plus FIXED (commit SHA) or NOT FIXED (why).
- Every fix commit, in both repos, with its red→green evidence.
- Anything listed but not fixed, and anything that needs the owner.
Then END the session.
