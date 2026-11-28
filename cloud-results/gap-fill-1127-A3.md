PARTIAL run A3 | IN PROGRESS | started 00:02Z 2026-11-28

# gap-fill-1127 run A3 (round 3), draft
- Setup: Node 24.22.3 (/opt/node24), pnpm 10.33.2; Jini install + `pnpm -r build` at merge-28 green; one worktree per job with `pnpm install --offline` + built dist copied.
- gitleaks is NOT installed in this container; per the round-3 brief it was not downloaded. Every staged diff is reviewed by eye before commit.
- Subagents dispatched so far: 4 (cms-3, misc-1, ui-1, admin-8). plugins-1 queued.
