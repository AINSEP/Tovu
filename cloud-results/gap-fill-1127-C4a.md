IN PROGRESS run C4a | jobs 0/3 | tests added 0 | files 100% 0/? | bugs 0 | left: job 9 ~15 rows, job 11 ~6 rows + unmeasured composition files, job 12 ~35 rows (C3a counts, being worked)

# Gap fill 2026-11-27, round 4, run C4a (Tovu website; jobs tv-w62-cov-web-9, -11, -12)

- Start 2026-11-28 03:11 UTC. Cut-off for new subagents: 05:41 UTC. Report final by 06:06 UTC.
- Setup: Node 24.22.3 (/opt/node24); Jini integ/merge-28 d1ced6c5 (`pnpm install --frozen-lockfile` + `pnpm -r build`, both green); Tovu `npm ci --ignore-scripts` (root + site-chat), `link:jini`, then `tsc -p` contracts + sdk. Worktrees at /home/user/wt/<job>.
- Coverage helper: node:test `--enable-source-maps --experimental-test-coverage` with explicit `--test-coverage-include` per source file, under a global flock. All lcov SF records for a source are merged (avoids the C2 multi-SF trap). Smoke check: credentials-host-ports reproduces C3a's 100/100/100.
- Round 1 dispatched 03:17 UTC: job 9, job 11, job 12 slice A (rows 1-55, /home/user/wt/web-12), job 12 slice B (rows 56-90, local branch c4a/web-12-b, cherry-picked onto the job branch; not pushed).
- **Container restart at ~03:45 UTC** killed all 4 round-1 subagents mid-work. Commits already made survived: job 11 fdd1b08bf8, dbf169a016; job 12 282d8d9413 + 2 (all pushed). Uncommitted test edits survived on disk in web-9, web-11 and web-12-b. web-9 also held a half-finished mutation of production `agent-daemon-scope.ts:124` (`|| !token` dropped); the coordinator restored it with `git checkout` and checked every worktree for other production diffs (none).
- Round 2 dispatched 03:52 UTC: the same 4 slices. Each was told to verify, finish and commit the leftover edits first. The brief now asks for a commit after every file.
- 04:26 job 11 round 2 returned (7 tests, publish-apply 100/100/100; details in the per-round section). Job 11 round 3 dispatched right away.
- 04:45 job 12 slice B round 2 returned (15 tests, peer-site-reads 100/100/100); slice B round 3 dispatched. 04:46 job 9 round 2 returned (28 tests); job 9 round 3 dispatched.
- 05:01 job 12 slice A round 2 returned (8 tests + 1 extended; run-finalizer entry/watch-state 100/100/100). Incident: shared-scratchpad mut.sh clash between slice A and slice B (~04:28-04:35); production files clean afterwards; slice B asked to re-verify its round-2 mutants; brief now requires per-agent scratch dirs. Slice B commits (6) cherry-picked onto codex/tv-w62-cov-web-12 -> cbf7329985. 05:02 slice A round 3 dispatched.
