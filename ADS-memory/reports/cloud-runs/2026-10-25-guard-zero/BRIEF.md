<<SUBAGENT_DISPATCH>>
# Jini guard → 0 (owner 2026-10-25: "for the Jini guard violations, can we also do that in the cloud? Yeah, sure")
Unattended: verify by measuring, never ask. Read first: `git show origin/cloud/check-1024-tovu-fu-wip:ADS-memory/reports/cloud-runs/2026-10-24-checks-2/REPORT.md` (item 3 guard-2) and `git show origin/cloud/check-1024-tovu-lane-wip:ADS-memory/reports/cloud-runs/2026-10-24-checks/REPORT.md` (item 6 guard pass 1, incl. the 3 reverted regressions — do NOT reintroduce them).

## State
- Jini `cloud/check-1024-jini-guard2-wip` b14d522d (on guard pass 1 f819689f): `pnpm guard` = **11 violations, all in packages/db/src/owner-store** (7 × L1 db→@jini-ai/platform; 4 × SI-domain relative reaches into kernel/sqlite, migrate, sqlite, secrets-vault). Kept on purpose: Tovu's owner-store CLI imports `@jini-ai/db/owner-store` (`apps/website/src/cli/commands/owner-store.ts:7-8`), and a db→server facade would be a build cycle.
- The decided path (owner OK'd doing it): **move the owner-store implementation to `@jini-ai/server/owner-store`** (as Codex's f3107709 did), and **migrate Tovu** to import from `@jini-ai/server/owner-store` (add the `@jini-ai/server` dependency). Check Open Marketing-style hosts: grep this Jini repo's docs/READMEs for other consumers of `@jini-ai/db/owner-store`; note the breaking change in a changeset (+ migration line in the README). Also note the two other host-API breaks from guard pass 2 (vibecoding `filesystem: ProjectFilesystemPort`, saved-requests `executeCredentialedRequest`) — give them a default or a changelog line.

## Work
1. Jini: branch `cloud/guard-zero-1025-jini` from `origin/cloud/overnight-1024-jini` (current integration, 3e2fbae8) and merge `origin/cloud/check-1024-jini-guard2-wip` into it (resolve conflicts; the overnight branch holds newer chat/cms/consent work — keep both). Then do the owner-store move. Goal `pnpm guard` = **0** by fixing code, never weakening/allow-listing rules (documented escape hatch only with a one-line why, listed in the report). Changesets for every touched package.
2. Tovu: branch `cloud/guard-zero-1025-tovu` from `origin/cloud/overnight-1024-tovu`; switch the owner-store CLI (and any other `@jini-ai/db/owner-store` import) to `@jini-ai/server/owner-store`; add the dependency (version range the next Jini release will satisfy). With Jini linked (`JINI_PACKAGES_DIR=/root/Jini/packages npm run link:jini`), owner-store integration tests must pass (5/5 baseline).
3. Verify: `pnpm guard` 0; `pnpm -r build`; `tsc --noEmit -p` for every touched Jini package (+ tsconfig.tests.json where present); touched packages' tests for touched files (vitest `--maxWorkers=2 --minWorkers=1`); Tovu root `tsc -p tsconfig.json` + owner-store tests (node --test `--test-concurrency=1 --experimental-test-module-mocks`). CCN ≤ 10. Behaviour unchanged.

## Setup
`hostname && nproc`. Node 24 + Tovu setup per `git show origin/cloud/overnight-1024-tovu:ADS-memory/reports/cloud-runs/2026-10-25-overnight/COMMON.md`. Jini: `git clone https://github.com/AINSEP/Jini.git /root/Jini`.

## HARD CAPS (first hit → stop, report, push, END)
2 h 30 m wall (at 2 h 10 m write up). ~1.2M tokens. No subagents. Never push main, never force-push, never npm publish, never create/update/run any RemoteTrigger, never self-reschedule. Push only to `cloud/guard-zero-1025-jini` and `cloud/guard-zero-1025-tovu`. Commit + push after each step.

## Report
`ADS-memory/reports/cloud-runs/2026-10-25-guard-zero/REPORT.md` on `cloud/guard-zero-1025-tovu`: guard before → after, commits, test/tsc numbers, breaking changes + changesets, anything not done. End "GUARD DONE <UTC>", wall, rough tokens.
