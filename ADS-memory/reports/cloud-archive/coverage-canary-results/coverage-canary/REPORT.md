# Coverage canary report (2026-10-21, started 01:58Z, ~12 min total)
ENV: 4 cores, 16GB RAM, no swap, 30GB disk free, Linux 6.18 (hostname vm), cwd /home/user; Tovu=/home/user/Tovu, Jini=/home/user/Jini (both pre-cloned). No /usr/bin/time (peak mem = polled `free -m` used, includes baseline ~0.5GB). psql only at /usr/bin/psql; no pg_ctl/postgres.
CHECKOUT: both `canary` branches OK. Tovu e5a189d78, Jini 9d6abdbeb.
SETUP
1. Node: image has v22.22.0. Tarball from nodejs.org -> ~/.local/node24 (v24.22.0), 4s. Use `export PATH=$HOME/.local/node24/bin:$PATH` per command.
2. Jini: `corepack enable --install-directory $HOME/.local/node24/bin && pnpm install --frozen-lockfile` 21s OK (plain `corepack enable` untested; used install-dir). `pnpm --no-bail -r build` 2m00s: 2 pkgs fail tsc but still emit dist: packages/oauth (TS2379 exactOptionalPropertyTypes, authorization-code.ts:121, errors.ts:72), packages/admin (TS2345 ProvidersTab.hooks.ts:181). 36 dist dirs of 37 pkgs.
3. Tovu: `npm ci` + admin + site-chat ci: 42s total OK. `JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini`: OK, symlinks ../../../Jini/packages/* verified. `npm run build --workspace @tovu/sdk` -> BLOCKED by check-no-linked-jini.mjs ("run unlink:jini before building"). packages/sdk/dist already existed (hooks.js), so tests ran anyway. Fix for full run: build sdk BEFORE link:jini.
4. Postgres: only psql client; no server.
SCOPES
A. Jini core vitest coverage (2 workers): 38s wall, peak ~1.1GB. 85 files/1209 tests pass. Exit 1 only because global threshold 99% not met (lines 95.85, br 97.41, fn 96.5). coverage-final.json has 106 files incl. 14 zero-hit files => coverage include/all IS in effect (never-imported files appear). One test (settings-subpath-isolation) takes 25s.
B. Tovu consent node:test (7 files): 11s, peak ~1.0GB, 0 failures (dot output; no summary count). lcov 42k lines — it covers EVERYTHING loaded, including linked ../Jini/packages/* via symlinks.
C. Admin observability vitest4 (2 workers): 18s, peak ~1.6GB, 12 files/110 tests pass.
D. All-files (coverage-all-files.ts, ~1s each):
 - jcore: TRUE lines 4751/4965 95.69% vs RUNNER 95.84%; branches 97.74/97.74; funcs 96.04 vs 96.47; 1/88 never-loaded.
 - admin-obs: TRUE lines 171/174 98.28% vs RUNNER 98.84%; br 96.15; fn 93.85; 1/15 never-loaded.
 - consent: FAILED: "Coverage report unavailable: LCOV LH does not match detail records in ../Jini/packages/agentic/src/core/a2ui/agent-to-renderer.ts" — script chokes on a linked-Jini record outside --root. Needs a fix/skip in the script (or filter lcov to the root before passing), otherwise node:test full run can't be post-processed.
ESTIMATES (test-file counts: Tovu 3307 = website 2240, admin 764, site-chat 17; Jini 2621 across 37 pkgs; biggest ui 590, cms 263, chat 208, admin 176, agent-runtime 150, daemon 135)
 - Jini all pkgs with coverage, sequential: ~25-45 min (core ~0.45s/file; ui is jsdom, heavier). Per-package thresholds will exit 1 — don't gate on exit code.
 - Tovu website node:test cov, concurrency 1: consent ~1.5s/file incl. startup => 2240 files ~35-60 min; coverage of 2240 files in one process likely 3-6GB; unproven.
 - Admin vitest cov: 764 files, ~1.5s/file at 2 workers => ~20-40 min, ~2-4GB.
 - site-chat: 17 files, ~1-2 min.
 PARALLEL: 4 cores/16GB: run website(1 core) + admin(2 workers) + Jini(2 workers) concurrently is ~5 procs — tight; suggest two lanes: [website node:test] || [Jini pkgs then admin then site-chat], each <=2 cores, mem peak est <10GB. Wall ~45-70 min.
RECOMMENDED FULL-RUN COMMANDS (per command: export PATH=$HOME/.local/node24/bin:$PATH)
 1. Jini: corepack enable --install-directory $HOME/.local/node24/bin; pnpm install --frozen-lockfile; pnpm --no-bail -r build (ignore oauth/admin tsc errors)
 2. Tovu: npm ci; (cd apps/admin&&npm ci); (cd apps/site-chat&&npm ci); npm run build --workspace @tovu/sdk (BEFORE link); JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini
 3. Jini per pkg: cd packages/<p> && npx vitest run --maxWorkers=2 --coverage --coverage.reporter=json --coverage.reportsDirectory=/tmp/cov-j-<p>  (|| true)
 4. Website: npm run test:cov shape (TEST_CONCURRENCY=1), lcov reporter; admin: vitest run --maxWorkers=2 --coverage; then coverage-all-files.ts per root.
SURPRISES: node image is v22 (needs 24 install, 4s); sdk build blocked when linked; coverage-all-files fails on node:test lcov that includes symlinked Jini files; no time(1); Jini core threshold 99% fails at 95.85%; repos were pre-cloned.
