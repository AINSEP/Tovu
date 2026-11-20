Implemented all four sheets in order: B13-T1, B13-T2, B30-T, B06-T.

- Deleted three forwarding files and repointed callers to Jini.
- Added the exact Tovu-only `captureSqliteBackupBytes` helper.
- Removed only the archive-limit re-export; ZIP guard, refusal text, and assertions remain unchanged.
- Added one entry per sheet in [COMMIT-PLAN.md](COMMIT-PLAN.md), listing deletions and combine checks.

No unlisted importers or sheet blockers found. `git diff --check` passed. Tests and other prohibited checks were not run. No dependency or lockfile edits, commits, or pushes.
