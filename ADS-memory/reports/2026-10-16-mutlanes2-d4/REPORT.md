# Handoff: mutlanes2-d4 → successor (2026-10-16 ~17:30, context 250k)

Read first: ADS-memory/.local-artifacts/handoffs/DAY-BRIEF-HEADER-tovu-d4-2026-10-16.md, then ADS-memory/reports/2026-10-16-mutlanes-d4/STATUS.md (sections from "Successor mutlanes2-d4").

## Done (all committed, nothing of mine uncommitted)
1. 32bf29255 fix(site-key): unreadable .site-meta.json → 409 SITE_META_UNREADABLE (was 500). RED 500≠409 on HEAD → GREEN.
2. 5bdc3e4c9 isolation import in 8 known-red suites (test-home isolation class). Full static list not actionable: 914/1917 node tests reach sites-home.ts by import closure (tool: scratchpad/mutlanes2-d4/tools/homeiso.py).
3. 9b3154338 (39 files, r1e/r2/r4/r5 website+desktop), 649720023 (8 admin), 809d73c60 (17 website, r6/r7), 55ed187a6 (3 admin incl. r7b fixes), f253a540f (8 website, r6/r8/r9). All GREEN. No BUG items besides #1.
4. Codex rounds r3..r9 + r7b: ADS-memory/.local-artifacts/codex/2026-10-16-mutlanes2-d4-r*/out. Sent rows through 200 (ADS-memory/reports/2026-10-16-mutlanes-d4/sent-rows.txt).

## Running
- remut4 re-mutation runner (1 lane, 108 rows = all rows fixed today with explicit tests, --mutant-timeout=420, gate load 14): ADS-memory/reports/2026-10-16-mutlanes-d4/remut4/ (runner.pid, results.tsv, SURVIVORS.md). It is mostly GATED (load 45-70). Control: echo N > remut4/lanes.target; echo > remut4/STOP.
- Main run STOPPED at 16:29 by someone ("STOP now", load 260, RAM exhausted — not mine). 193/548 rows done. I reported it to tovu-d4; I'm waiting to hear whether to resume. Resume command: see the mutlanes-d4 handoff (remove run/STOP + run/lanes-exit.txt first).
- No Codex jobs running. No test processes of mine left running.

## Remaining (numbered)
1. When the main run resumes: run rounds with `python3 ADS-memory/reports/2026-10-16-mutlanes-d4/mkround.py <new-dir> ADS-memory/reports/2026-10-16-mutlanes-d4/sent-rows.txt 14`, then add to each prompt the lines "never edit dirty files" and "no nested node --test child process" (see r8 prompts). Launch 3 at a time.
2. Read remut4 results as they come in. Survivors go to the next Codex round. BASELINE-RED rows have so far been baseline TIMEOUTS under load (25, 34, 35, 39: the suites pass, just slowly). Retry them at low load; for row 25, narrow the tests to taxonomy-routes.test.ts.
3. Rows 27 and 37 (remut2 survivors :96 :102 / :154) are in remut4 with the EXISTING test files Codex named. They should come out killed. :39 is equivalent.
4. Recorded EQUIVALENT: theme-static-assets.ts :152 (a comment in its test explains why).
5. Env-limited rows from the predecessor: 48, 64, 86.

## Verify recipe (worked today)
- website/desktop renderer: `env -u TOVU_ADMIN_PASSWORD node --import tsx --test --test-concurrency=1 <files>`; desktop top-level from apps/desktop with `--experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts`; admin from apps/admin `npx vitest run --maxWorkers=2 <files>`. One lock acquire per batch. Scripts: scratchpad/mutlanes2-d4/green*.sh.
- Real home unchanged at every check (4 sites names, 859 site-keys, 4 dirs).

## Warnings
- Lock queue waits 20-60 min. The machine was RAM-starved at 16:30 (load 260).
- Codex can fail with a 503 (r7 s00): rerun it in a new prompt dir and tell it to check `git diff` for partial edits.
