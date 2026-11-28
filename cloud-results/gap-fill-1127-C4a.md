IN PROGRESS run C4a | jobs 0/3 | tests added 0 | files 100% 0/? | bugs 0 | left: job 9 ~15 rows, job 11 ~6 rows + unmeasured composition files, job 12 ~35 rows (C3a counts, being worked)

# Gap fill 2026-11-27, round 4, run C4a (Tovu website; jobs tv-w62-cov-web-9, -11, -12)

- Start 2026-11-28 03:11 UTC. Cut-off for new subagents: 05:41 UTC. Report final by 06:06 UTC.
- Setup: Node 24.22.3 (/opt/node24); Jini integ/merge-28 d1ced6c5 (`pnpm install --frozen-lockfile` + `pnpm -r build`, both green); Tovu `npm ci --ignore-scripts` (root + site-chat), `link:jini`, then `tsc -p` contracts + sdk. Worktrees at /home/user/wt/<job>.
- Coverage helper: node:test `--enable-source-maps --experimental-test-coverage` with explicit `--test-coverage-include` per source file, under a global flock. All lcov SF records for a source are merged (avoids the C2 multi-SF trap). Smoke check: credentials-host-ports reproduces C3a's 100/100/100.
- Round 1 dispatched 03:17 UTC: job 9, job 11, job 12 slice A (rows 1-55, /home/user/wt/web-12), job 12 slice B (rows 56-90, local branch c4a/web-12-b, cherry-picked onto the job branch; not pushed).
