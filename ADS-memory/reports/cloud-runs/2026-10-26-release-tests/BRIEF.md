# Release tests 2026-10-26 — Sonnet 5.5, REPORT ONLY (owner approved 10-26 ~4:10 PM PT)

Read ADS-memory/reports/cloud-runs/RUN-PROTOCOL.md first (run log + push-every-step rules), but its branch section is outdated; use the branches below.

## HARD CAPS (first one hit → write DONE/BLOCKED entry, push, END)
- 90 min wall clock (stop starting new batches at 75 min). ~1.5M tokens. NO subagents.
- REPORT ONLY: never edit product code or tests. Never push main, never force-push, never npm publish, never create/update/run any RemoteTrigger, never self-reschedule.
- Push ONLY to Tovu branch `cloud/release-1026-results` (create it from cloud/release-1026). Never push to cloud/release-1026 itself, nor to Jini.

## Setup (measured on this image)
- Node 24: `mkdir -p ~/.local && curl -fsSL https://nodejs.org/dist/v24.22.0/node-v24.22.0-linux-x64.tar.xz | tar -xJ -C ~/.local && mv ~/.local/node-v24.22.0-linux-x64 ~/.local/node24`; prefix every command with `export PATH=$HOME/.local/node24/bin:$PATH;`; `corepack enable --install-directory $HOME/.local/node24/bin`.
- Jini: `git clone --branch cloud/release-1026 https://github.com/AINSEP/Jini.git /root/Jini && cd /root/Jini && pnpm install --frozen-lockfile && pnpm --no-bail -r build` (log build failures per package; continue).
- Tovu at /home/user/Tovu: `git fetch origin cloud/release-1026 && git checkout -B results origin/cloud/release-1026 && npm ci && (cd apps/admin && npm ci) && npm run build --workspace @tovu/sdk && JINI_PACKAGES_DIR=/root/Jini/packages npm run link:jini`. Desktop: `(cd apps/desktop && npm ci && npm run build:preload)`.
- If argon2/better-sqlite3/esbuild tests fail to load: `npm rebuild argon2 better-sqlite3 esbuild` at root.
- No Postgres server, no Playwright Chromium, no IPv6, no display → those failures are ENV: list them, don't fix.

## What to run (lists in this folder)
1. Jini `jini-tests.txt` (315 files): group by package, `cd /root/Jini/packages/<pkg> && timeout 600 npx vitest run --maxWorkers=2 <files…>` (packages using node:test: run with `--test-concurrency=1`).
2. Tovu `tovu-tests.txt` (308 files): website node:test files: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --test-concurrency=1 --experimental-test-module-mocks <files…>` in batches of ~30; website vitest files (check the file's imports) with vitest `--maxWorkers=2`; apps/admin: `cd apps/admin && npx vitest run --maxWorkers=2 <files…>` (no --minWorkers); apps/desktop per its package.json test runner; development/scripts with node --test.
3. Server memory soak (after the lists): `npm run build && npm run admin:build && TOVU_SOAK_RECORD_ONLY=1 npm run test:soak:server` — record the floor numbers from development/test-results/memory-soak/. Skip the desktop soak (needs a display; runs on the owner's Mac).
- Never more than 3 heavy test processes at once. Use `timeout`. Log to /tmp/<step>.log; tail/grep, never cat whole logs. Kill by pid only.
- Files deleted on the branch (listed but missing) → note as MISSING, skip.

## Priority if time runs short
Memory/observability/analytics first: Jini packages diagnostics, provider-plugins, cookie-consent, desktop-host, devops, plugins, chat; Tovu apps/desktop, provider-plugins/telemetry/consent/skills files, admin plugins. Then the rest.

## Known pre-existing failures (confirm, don't chase)
Tovu purpose-scoped-mailer-call-sites "real call sites…", site-exporter "live site … never-store", mcp-ui-tool-calls-route.ask-choice "real round trip"; Jini cms subpath-isolation (plugin-export → consent); Sentry SpanStreaming integration test; telemetry-reporter "Invalid URL" on a bad DSN.

## Deliverable: RESULTS.md in this folder (push after each package/batch)
- Table per repo: package/area, files run, tests passed/failed/skipped, files that failed to LOAD (import/build errors) — loading failures are the most important signal.
- Every failing test: file, test name, first ~15 lines of the error, and your one-line classification: REGRESSION (code on this branch) / ENV (missing Postgres/browser/display/network) / PRE-EXISTING (list above) / UNSURE.
- Server soak numbers (warm-up floor, final floor, % change) or why it couldn't run.
- "What this did NOT test" section: desktop Electron soak, real PostHog/Sentry/Grafana delivery, UI looks, anything skipped for time.
- Counts must be tests EXECUTED, not files listed. A suite that didn't run is not a pass.
