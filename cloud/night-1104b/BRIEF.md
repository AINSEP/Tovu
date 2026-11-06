# Cloud verify 2: 11-04 late round (HARD CAP 35 MIN, report-only, no code fixes)
Repos are pre-cloned at /home/user/Tovu and /home/user/Jini.
1. `git -C /home/user/Tovu fetch origin night-1104 && git -C /home/user/Tovu checkout -B night-1104 origin/night-1104`; `git -C /home/user/Jini fetch origin integ/night-1104 && git -C /home/user/Jini checkout -B night-1104 origin/integ/night-1104`.
2. Node 24 from the nodejs.org tarball into ~/.local/node24, first on PATH for EVERY command; `corepack enable --install-directory $HOME/.local/node24/bin`.
3. Jini: `pnpm install --frozen-lockfile`, build core first, then `pnpm --no-bail -r build`.
4. Tovu: `npm ci` in root, apps/admin, apps/desktop and apps/site-chat; build contracts+sdk; `JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini`; `npm run build:preload` in apps/desktop.
5. Run the test sections from cloud/night-1104b/cloud-rerun-2.sh, O-rerun.sh and Q-rerun.sh (skip clone/snapshot steps; TOVU_REPO=/home/user/Tovu, JINI_REPO=/home/user/Jini). Also run the test commands listed in cloud/night-1104b/*-result.md. Linux only (skip the macOS packaged gate). node:test --test-concurrency=2 --test-timeout=60000; vitest --maxWorkers=2 (admin rejects --minWorkers); wrap each section in `timeout 600`.
6. Run the root `tsc --noEmit` (tsconfig.json) and each desktop tsconfig on its own, and Jini `pnpm exec eslint` complexity if time remains.
7. Write cloud/night-1104b/RESULTS.md: per section pass/fail/total, EVERY failing test (file + name + first 20 error lines), every tsc error. Save raw output as raw/<section>.txt. Commit to a NEW branch `cloud/night-1104b-results` and push by minute 30, even if incomplete, then stop.
