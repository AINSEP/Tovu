# Handoff: mutlanes-d4 → successor (2026-10-16 ~13:10)

Read first: ADS-memory/.local-artifacts/handoffs/DAY-BRIEF-HEADER-tovu-d4-2026-10-16.md, then ADS-memory/reports/2026-10-16-mutlanes-d4/STATUS.md.

## Lanes (running, nohup, independent)
- Main run: out ADS-memory/reports/2026-10-16-mutlanes-d4/run/ (pid in run/runner.pid; lanes-status.json; nohup.log; results.tsv; SURVIVORS.md; INCONCLUSIVE.md; logs/<row>.log/.err/.progress.jsonl). Copies: run/lanes → scratchpad/mutlanes-d4/lanes (deleted on exit).
- At 13:10: 92/548 rows touched, 88 swept, 218 survivors. Pace ~40 rows/h when load allows (gate 14 holds often). ETA all rows ~01:00.
- Control: `echo 3 > run/lanes.target` (count), `echo > run/STOP` (drain) / `echo now > run/STOP` (kill now). Exit reason in run/lanes-exit.txt.
- Resume (if it died — check `kill -0 $(cat run/runner.pid)`), from /Users/la/Programming/Tovu:
  `rm -f run/STOP run/lanes-exit.txt; nohup node development/scripts/mutation-lanes.mjs --targets=ADS-memory/reports/2026-10-15-mutation-46/TARGETS.md --out=ADS-memory/reports/2026-10-16-mutlanes-d4/run --lanes=3 --limit=15 --mutant-timeout=180 --file-timeout=2700 --max-load=14 --start-row=18 --done=ADS-memory/reports/2026-10-15-mutation-46/run/results.tsv >> ADS-memory/reports/2026-10-16-mutlanes-d4/run/nohup.log 2>&1 &` (done rows skipped; run/lanes symlink must exist).
- Re-mutate after tests land: mini run with explicit tests per row (see remut-r1ab/TARGETS.md for the format: backticked test paths after the file cell), own --out dir, --lanes=1 --start-row=1.

## Done
1. Tooling commits: 88b36138e, 9f0b1b3a8, c072d7f36, 9469f4ae6, b33dd7517 (Codex r0..r0g, r1f).
2. r1 a+b → 57f0ee959; re-mutation: handshake.ts 15/0, handshake-client.ts 8/0, grant.ts 15/0, provisioning.ts 15/0, connect.ts 1 survivor (:79 equivalent).
3. r1 d + desktop → fda996e7f (GREEN 144/145 with the site-key file; re-mutation NOT yet run).

## Remaining (numbered)
1. admin-site-key-routes.test.ts (r1 c, uncommitted): new test "generate refuses unreadable site metadata without writing a key" FAILS on HEAD: `500 !== 409` at admin-site-key-routes.test.ts:694. Either the test's setup is wrong or site-key.ts:437 `refusal("SITE_META_UNREADABLE")` is not reached (possible real bug: unreadable meta → 500 instead of 409). Send a Codex follow-up pasting this failure (RED→GREEN if a source fix). Log: scratchpad/mutlanes-d4/r1cd-green.log.
2. r1 e admin tests + all r2 tests are UNCOMMITTED, not yet run: list in ADS-memory/reports/2026-10-16-mutlanes-d4/uncommitted-r1e-r2.txt (all pure additions by my Codex rounds; verified no overlap with other agents' Codex scopes). Run GREEN under the lock: one node command for apps/website + apps/desktop files (desktop src tests normally run from apps/desktop with `--import ./scripts/resolve-ts-ext.ts`; tsx from root worked for webview-guest-policy), one vitest command in apps/admin (`--maxWorkers=2`, no --minWorkers). Commit by explicit paths, then re-mutate rows in a mini lane run. r2 reports: ADS-memory/.local-artifacts/codex/2026-10-16-mutlanes-d4-r2/out/s0*.md (no BUG items; tables give TEST/EXISTING/EQUIVALENT per line; EXISTING tests go into the re-mutation TARGETS rows).
3. Re-mutate r1 d/e rows (25,24,22,27,29,44,20,38,36) and 34 (site-key.ts with admin-site-key-routes.test.ts) after item 1.
4. Next survivor rounds: `python3 ADS-memory/reports/2026-10-16-mutlanes-d4/mkround.py <new-round-dir> ADS-memory/reports/2026-10-16-mutlanes-d4/sent-rows.txt 14` (skips sent + dirty rows; appends sent rows), launch with run-codex-shards.sh (CODEX_EFFORT=high, keep machine total ≤4). Rows sent so far: sent-rows.txt (r1+r2 up to row 96; 75/76 skipped as dirty).
5. Report the "Test home isolation required" suite class to whoever owns test failures (sent to tovu-d4 at ~11:30; no answer yet). Lanes preload the helper, so mutation is not blocked.
6. Env-limited rows (record, don't fix): 48 secret-scan-guard, 64 sync-originals (tests need a git repo; copy is none), 86 credential-copy (website source tested by admin vitest).

## Warnings
- The machine lock queue is long (5+ agents); one GREEN run waited ~40 min. One lock request at a time.
- The REAL-HOME check: names luvira, order-pinch, plannie, tovu-dev; site-keys 859; Documents/Tovu 4 — unchanged at 13:10 (sites.json md5 changes from the desktop app, names don't).
- Codex jobs running: none of mine.
