# RED run 2026-10-26 night — Sonnet 5.5, REPORT ONLY (owner approved 10-26)

## HARD CAPS (top priority; the first one hit → write DONE/BLOCKED in RUN-LOG.md, push RESULTS.md, END)
- Model Sonnet 5.5. Max **75 min wall clock** (stop starting new batches at 65 min). Max **~1.2M tokens**. **At most 2 subagents**, ever.
- **REPORT ONLY**: never edit product code or tests, never fix anything. The only files you write are RUN-LOG.md and RESULTS.md in this folder (plus logs you copy here).
- Push ONLY to Tovu branch `cloud/red-1026-night-results` (create it from `cloud/red-1026-night`). Never push `cloud/red-1026-night` itself, never Jini, never main, never force-push, never npm publish, never create/update/run any RemoteTrigger, never self-reschedule.
- Minor findings (setup quirks, odd warnings, flaky timing) are LISTED in RESULTS.md, never acted on.

## Protocol
Read `ADS-memory/reports/cloud-runs/RUN-PROTOCOL.md` first (run log + push rules); its branch section is outdated — use the branches here.
- In your first 2 minutes, before setup: create `ADS-memory/reports/cloud-runs/2026-10-26-red-night/RUN-LOG.md` with a STARTED entry (UTC time, both HEAD shas), commit, push to `cloud/red-1026-night-results`.
- Push at least every 5 minutes (heartbeat entry if nothing changed). Log every failing command with exit code + first ~20 lines of stderr.
- Update RESULTS.md and push after every batch. A run that dies must leave its partial results pushed.

## Setup (same as RUN 2, with RUN 2's measured fixes)
- Node 24: `mkdir -p ~/.local && curl -fsSL https://nodejs.org/dist/v24.22.0/node-v24.22.0-linux-x64.tar.xz | tar -xJ -C ~/.local && mv ~/.local/node-v24.22.0-linux-x64 ~/.local/node24`; prefix every command with `export PATH=$HOME/.local/node24/bin:$PATH;`; `corepack enable --install-directory $HOME/.local/node24/bin`.
- Jini: `git clone --branch cloud/red-1026-night https://github.com/AINSEP/Jini.git /root/Jini && cd /root/Jini && pnpm install --frozen-lockfile && pnpm --no-bail -r build` (builds every package incl. `@jini-ai/sidecar`; confirm `packages/sidecar/dist` exists; log tsc failures per package and continue — dist is still emitted).
- Tovu at /home/user/Tovu: `git fetch origin cloud/red-1026-night && git checkout -B results origin/cloud/red-1026-night`.
  - `npm ci` 404s on `@jini-ai/cookie-consent@^0.6.12` (not on npm). RUN 2 workaround, do NOT commit it: point that one root dependency at `file:/root/Jini/packages/cookie-consent`, run `npm install`, then `git checkout -- package.json package-lock.json` after linking. `(cd apps/admin && npm ci)` is not needed for this run.
  - Build `@tovu/sdk` BEFORE linking: `npm run build --workspace @tovu/sdk`. If it fails (RUN 2: registry `@jini-ai/plugins` lacks exports), run `JINI_PACKAGES_DIR=/root/Jini/packages npm run link:jini`, build the sdk, then run link:jini again. Log which path you took.
  - Link Jini source: `JINI_PACKAGES_DIR=/root/Jini/packages npm run link:jini`.
  - Desktop: `(cd apps/desktop && npm ci && npm run build:preload)`, then symlink every `apps/desktop/node_modules/@jini-ai/<pkg>` to `/root/Jini/packages/<pkg>` (link:jini does not cover apps/desktop; RUN 2 got load failures without this). Env fix only, not committed.
  - If argon2/better-sqlite3/esbuild fail to load: `npm rebuild argon2 better-sqlite3 esbuild` at root.
- No Postgres server, no browser, no display, no IPv6 → those failures are ENV: list them, don't fix.

## What to run — ONLY the files in INVENTORY.md (57 files, all node:test)
One file per command (or shards of ≤5 files). Always `timeout 600`. Never more than 2 test processes at once. Log to /tmp/<file>.log; grep/tail, never cat whole logs. Kill by pid only; leave no process running at the end.
- `website` files (53), from repo root: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json timeout 600 node --import tsx --test --test-concurrency=1 --experimental-test-module-mocks <file>`
- `desktop` files (2), from apps/desktop: `timeout 600 node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test --test-concurrency=1 <path relative to apps/desktop>`
- `desktop-renderer` files (2), from apps/desktop: `timeout 600 node --import tsx --test --test-concurrency=1 <path relative to apps/desktop>`
- No vitest file is in the list. If you ever need vitest, use `--maxWorkers=2 --minWorkers=1` (`--maxWorkers=2` alone crashed in RUN 2).
- Order: lots in INVENTORY order. If time runs short, finish the file in progress, then report the rest as NOT RUN.
- A listed file that is missing → MISSING, skip.

## Deliverable: RESULTS.md in this folder
1. Summary table: files run / files LOAD-FAIL / RED names confirmed / GREEN-unexpected / other failures / NOT RUN.
2. Per file, **every test name the file executed**, one row each, classified:
   - `RED-as-predicted` — a name marked RED in INVENTORY.md that failed.
   - `GREEN-unexpected` — a RED name that passed (most important finding after LOAD-FAIL).
   - `LOAD-FAIL` — the file failed to import/compile; paste the first ~15 error lines.
   - `other-failure` — a `touched` or pre-existing test in the file that failed; paste the first ~15 error lines and say ENV / REGRESSION / UNSURE.
   - `pass` — touched/pre-existing tests that passed (count them per file; no need to list each).
   For every failing test give the first ~10 lines of the assertion error (expected vs actual).
3. "Minor findings" list (setup quirks, warnings) — not acted on.
4. "Not tested" list: anything skipped, ENV-blocked, or cut for time.
Counts must be tests EXECUTED, not names listed. A file that didn't run is not a pass.

End with a DONE (or BLOCKED) entry in RUN-LOG.md, commit, push, and quote the pushed sha in the final entry.
