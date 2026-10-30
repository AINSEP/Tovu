# FINAL VERIFY 2 — 2026-10-30 night (release candidate for Jini 0.6.15 + desktop 0.1.25)

## HARD CAPS (first one hit: push, write DONE/BLOCKED in RUN-LOG.md, END)
- Sonnet 5.5, no subagents. **1h30 wall clock total; no new step after minute 75.** Owner cap $15 of shared cloud credit.
- Fix ONLY failures that are small and obvious (≤ ~30 lines each) and caused by commits after f7c5d6e3d (Tovu) / 722547e4b (Jini). Everything else: LIST it. Push fixes ONLY to branch `cloud/verify2-1030-fixes` in each repo (create from `cloud/verify2-1030`); one commit per fix naming the test. Push results ONLY to Tovu branch `cloud/verify2-1030-results` (files under ADS-memory/reports/cloud-runs/2026-10-30-verify2/ only). Never push any other branch, never force-push, no PRs, no npm publish, no deploy, never create/run a RemoteTrigger.
- Fix rules: no eslint-disable, @ts-ignore, @ts-expect-error, .skip/.only, casts to any, new lint/boundary/budget exceptions or allow-list entries; never weaken an assertion or safety gate; complexity ≤ 10; agent-plugins files must not import src/assistant at all; agent-plugins/plugin-runtime must not value-import other features (ports from the composition root).
- RUN-LOG.md in the results dir: STARTED within 2 minutes, push at least every 15 min. Setup blocked > 20 min → BLOCKED + reason, END.

## Code
Tovu: branch `cloud/verify2-1030` (this brief on top of 6a67a8426). Jini: branch `cloud/verify2-1030` in AINSEP/Jini (1bff178ab). Previous run: `cloud/verify-1030-results` (compare every number in a delta column).

## Setup (container facts from the 10-29 runs)
- Node 24: `mkdir -p ~/.local && curl -fsSL https://nodejs.org/dist/v24.22.0/node-v24.22.0-linux-x64.tar.xz | tar -xJ -C ~/.local && mv ~/.local/node-v24.22.0-linux-x64 ~/.local/node24`; prefix every command with `export PATH=$HOME/.local/node24/bin:$PATH;`; `corepack enable --install-directory $HOME/.local/node24/bin`.
- Jini: `pnpm install --frozen-lockfile && pnpm --no-bail -r build` (log failures).
- Tovu: `npm ci` fails (ETARGET @jini-ai/cookie-consent@^0.6.13, unpublished). Do what the 10-29 runs did: local UNCOMMITTED rewrite of every @jini-ai dep to `file:/home/user/Jini/packages/<pkg>` + remove @jini-ai overrides in the 6 package.json files, `npm install --no-package-lock --ignore-scripts` at root, apps/admin, apps/desktop, apps/site-chat; build `@tovu/contracts` + `@tovu/sdk` before tests; restore package.json files with git checkout before committing any fix. This causes ~1200 "two kysely copies" TS errors and release-manifests / product-telemetry / sdk-public-api semver failures: those are ENV — count them, don't list them, don't fix them.
- Postgres only if a test needs it (`apt-get install -y postgresql`, socket /tmp/.s.PGSQL.5432 + TCP 5432, trust auth, superuser `la`; do NOT export PGHOST). Chromium: playwright CDN is blocked; symlink /opt/pw-browsers/*-1243 dirs to the names the repo expects.
- Postgres: install it FIRST this time (apt-get update && apt-get install -y postgresql; socket /tmp/.s.PGSQL.5432 + TCP 5432, trust auth, superuser `la`; do NOT export PGHOST) so *.postgres.* tests run in the shards.

## Steps, in this order (exit code for every command; full stdout+stderr as raw/<step>.txt — NOT .log)
1. Tovu website/plugins/sdk node:test in 8 shards (3 at a time, `--test-concurrency=1`, 600 s per-file guard), no coverage. Re-run each failing file alone once (FLAKY if it passes).
2. In parallel with 1: Jini `pnpm -r typecheck`; `pnpm guard`; `pnpm run test:scripts`; `npx vitest run --maxWorkers=2 --minWorkers=1` in agent-runtime, daemon, chat, db, cms, mcp, ui, user-management, provider-plugins, plugin-catalog.
3. Tovu typecheck root, typecheck:e2e, typecheck:tests, admin tsc, desktop tsc configs → list only NON-kysely errors (raw/*-nonkysely.txt).
4. Tovu admin `npx vitest run --maxWorkers=2 src/components src/features/ai-assistant src/features/skills`; Tovu desktop `npm run build:preload && npm test` in apps/desktop (classify every failure; Windows-only taskkill on Linux = ENV).
5. `npm run complexity:strict` (Tovu) and `npm run check:boundaries` → list every error.
6. Fix pass (only before minute 75), then re-run each fixed file alone.

## Output → ADS-memory/reports/cloud-runs/2026-10-30-verify2/RESULTS.md (+ raw/)
§0 one screen with delta vs cloud/verify-1030-results; §1 every failing test (file, name, first ~15 error lines, solo re-run, class REAL/STALE/ENV/FLAKY, cause file:line); §2 fixes pushed (sha → test); §3 NOT RUN / left unfixed. LIST EVERY ERROR (long lists in raw/*.txt, linked). Final line of RESULTS.md: "RELEASE BLOCKERS:" followed by the REAL failures that are not ENV/FLAKY (or "none").
