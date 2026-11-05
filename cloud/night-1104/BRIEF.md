# Cloud verify: 11-04 night Codex round (HARD CAP 60 MIN, report-only, no code fixes)
Repos are pre-cloned at /home/user/Tovu and /home/user/Jini.
1. `git -C /home/user/Tovu fetch origin night-1104 && git -C /home/user/Tovu checkout -B night-1104 origin/night-1104`; `git -C /home/user/Jini fetch origin integ/night-1104 && git -C /home/user/Jini checkout -B night-1104 origin/integ/night-1104`.
2. Node 24: download the nodejs.org tarball into ~/.local/node24 and put it first on PATH for EVERY command; `corepack enable --install-directory $HOME/.local/node24/bin`.
3. Jini: `pnpm install --frozen-lockfile && pnpm --no-bail -r build` (core before mcp).
4. Tovu: `npm ci` in root, apps/admin, apps/desktop and apps/site-chat. Build @tovu/sdk BEFORE linking. Then `npm run link:jini` pointing at /home/user/Jini (read package.json/scripts for the env var), and `npm run build:preload` in apps/desktop.
5. Read cloud/night-1104/night-test-commands.sh and K-test-commands.sh. SKIP their clone/snapshot/checkout steps; the code is already on these branches. Map $TOVU_REPO → /home/user/Tovu and $JINI_REPO → /home/user/Jini, then run every TEST section, Linux unit phase only (skip the macOS packaged-app gate). Use node:test --test-concurrency=2 --test-timeout=60000, vitest --maxWorkers=2, and wrap each section in `timeout 900`.
6. Also run `npx tsc --noEmit -p apps/website` and the desktop typecheck, now that Jini is linked.
7. Report:
   - write cloud/night-1104/RESULTS.md: per section pass/fail/total and duration, and EVERY failing test (file + name + first 20 error lines) and every tsc error
   - save raw output as cloud/night-1104/raw/<section>.txt (not .log)
   - commit to a NEW branch `cloud/night-1104-results` and push it
   - stop at 60 min no matter what, and write what you have
