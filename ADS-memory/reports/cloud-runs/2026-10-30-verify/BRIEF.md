# VERIFY + FIX — 2026-10-30 (after Codex round R1 + the agent-plugin DI refactor)

## HARD CAPS (first one hit: push, write DONE/BLOCKED in RUN-LOG.md, END)
- Sonnet 5.5, no subagents. **2h00 wall clock total; no new step after minute 105.** Shared cloud credit is low (owner cap $20).
- Fix ONLY failures caused by the two new commits (R1 = Tovu ad8a49c74 / Jini 722547e4b, DI = Tovu 561bba06a) and only when the fix is small and obvious (≤ ~30 lines per failure). Everything else: LIST it, don't fix it. Minor findings are listed, never fixed.
- Push fixes ONLY to branch `cloud/verify-1030-fixes` in each repo (create it from `cloud/verify-1030`); one commit per fix, message says which failing test it fixes. Push results ONLY to Tovu branch `cloud/verify-1030-results` (files under ADS-memory/reports/cloud-runs/2026-10-30-verify/ only). Never push any other branch, never force-push, no PRs, no npm publish, no deploy, never create/run a RemoteTrigger.
- Rules for any fix: never add eslint-disable, @ts-ignore, @ts-expect-error, .skip/.only, casts to any, or new lint/boundary/budget exceptions or allow-list entries; never weaken an assertion or safety gate; cyclomatic complexity ≤ 10; behaviour unchanged (the DI commit is a pure refactor); agent-plugins files must not import src/assistant at all and agent-plugins/plugin-runtime must not value-import other features (ports from the composition root instead).
- RUN-LOG.md (in the results dir): STARTED entry in the first 2 minutes, push at least every 15 min. Setup blocked > 20 min → BLOCKED + reason, END.

## Code
Tovu: branch `cloud/verify-1030` (= integration snapshot + this brief). Jini: branch `cloud/verify-1030` in AINSEP/Jini.

## Setup (container facts from the 10-29 runs)
- Node 24: `mkdir -p ~/.local && curl -fsSL https://nodejs.org/dist/v24.22.0/node-v24.22.0-linux-x64.tar.xz | tar -xJ -C ~/.local && mv ~/.local/node-v24.22.0-linux-x64 ~/.local/node24`; prefix every command with `export PATH=$HOME/.local/node24/bin:$PATH;`; `corepack enable --install-directory $HOME/.local/node24/bin`.
- Jini: `pnpm install --frozen-lockfile && pnpm --no-bail -r build` (log failures).
- Tovu: `npm ci` fails (ETARGET @jini-ai/cookie-consent@^0.6.13, unpublished). Do what the 10-29 runs did: local UNCOMMITTED rewrite of every @jini-ai dep to `file:/home/user/Jini/packages/<pkg>` + remove @jini-ai overrides in the 6 package.json files, `npm install --no-package-lock --ignore-scripts` at root, apps/admin, apps/desktop, apps/site-chat; build `@tovu/contracts` + `@tovu/sdk` before tests; restore package.json files with git checkout before committing any fix. This causes ~1200 "two kysely copies" TS errors and release-manifests / product-telemetry / sdk-public-api semver failures: those are ENV — count them, don't list them, don't fix them.
- Postgres only if a test needs it (`apt-get install -y postgresql`, socket /tmp/.s.PGSQL.5432 + TCP 5432, trust auth, superuser `la`; do NOT export PGHOST). Chromium: playwright CDN is blocked; symlink /opt/pw-browsers/*-1243 dirs to the names the repo expects.

## Steps, in this order (record every command's exit code; save full stdout+stderr as raw/<step>.txt — NOT .log)
1. Tovu website/plugins/sdk node:test in 8 shards (3 at a time, `--test-concurrency=1`, 600 s per-file guard), no coverage. Re-run each failing file alone once (FLAKY if it passes).
2. In parallel with 1: Jini `pnpm -r typecheck`; `pnpm guard`; `pnpm run test:scripts`; `npx vitest run --maxWorkers=2 --minWorkers=1` in packages agent-runtime, daemon, chat, db, plugin-catalog, user-management, ui, provider-plugins and every packages/plugin-*.
3. Tovu `npm run typecheck`, admin tsc, desktop tsc configs, `typecheck:tests` → list only NON-kysely errors (save raw/*-nonkysely.txt).
4. Tovu admin `npx vitest run --maxWorkers=2 src/components/AssistantDock src/features/skills`.
5. `npm run complexity:strict` (Tovu) and `npm run check:boundaries` → list every error.
6. RED check for 7 new failing tests (no fix exists yet — they MUST fail): `apps/website/src/features/theme/__tests__/discover-themes-staging-exclusion.test.ts` (dot-folder cases), `apps/website/src/assistant/__tests__/tool-catalog-query.entries.test.ts` (describe_tool content_read sub-reads), `apps/website/src/assistant/__tests__/tool-registrations.themes.test.ts` (theme_write_file missing theme names theme_duplicate). For each: record that it fails and why; then mutation check WITHOUT committing — apply the obvious one-line fix at theme.ts:~901 (skip dot-folders), tool-catalog-query.ts:~140 (sub-read describe fallback), asset-operations.ts:~133 (message names theme_duplicate) in a scratch copy, show the test goes green, revert. Report RED → GREEN per test. Do not commit these fixes.
7. Fix pass (only if time remains before minute 105): REAL failures from steps 1–5 that trace to the R1/DI commits, smallest first, within the caps above. Re-run each fixed file alone.

## Output → ADS-memory/reports/cloud-runs/2026-10-30-verify/RESULTS.md (+ raw/)
§0 one screen: pass/fail per suite, non-kysely typecheck errors, complexity, boundaries, delta vs `cloud/final-1029-results` and `cloud/fixtest-1029-results`. §1 every failing test: file, test name, first ~15 error lines, solo re-run, class REAL/STALE/ENV, likely cause file:line, and whether it traces to R1, DI, or earlier. §2 the 7 RED tests + mutation results. §3 fixes pushed (commit sha → test). §4 NOT RUN / left unfixed (with reason). LIST EVERY ERROR (long lists in raw/*.txt, linked).
