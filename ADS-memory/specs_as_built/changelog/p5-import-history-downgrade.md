# P5 import history: downgrade release note

- Feature: P5 Import history (`plans/P5-import-history.md`, design `plans/ALGO-P5-import-history.md`, build sheets `plans/sheets-1124/rev-p5.md` T4.J / T4.T).
- Wiring decision: ADR-071 "Tovu owns product wiring" (draft at `origin/plan/whats-left-1122:plans/P12-adr-drafts.md:5` until the standalone ADR lands).
- Date: 2026-11-25.

## Owner decision (Q5)

The owner accepted the old-build downgrade limitation **with this release note and no freeze**. The desktop app updates itself, and a freeze could not be enforced on a binary that predates it.

## What ships

- This release ships with `cutoverPolicy: "rollback"`. No workspace moves its import history into the new index (`<workspace>/site-imports.db`) yet. Imports keep using the existing history files.
- Enabling the index is a separate one-line change (`cutoverPolicy: "enable"` in `apps/website/src/server/runtime/composition/site-import-backend.ts`). It lands only after the copied-legacy-folder check passes in Chrome and in the packaged Electron app.
- Import history shows the last 30 days. Request replay records (which stop the same import from creating a second site) are kept for 1 year.
- Restoring import history from a backup is out of scope (Q2).

## Two kinds of "going back"

1. **Index-aware rollback (supported).** A build that understands the index can be switched back to `rollback`:
   - Before the first import is written to the index, it returns to the old history files. Pending owner setups still finish.
   - After the first indexed write, it keeps using the index and logs that rollback is no longer possible. A missing or swapped index then pauses imports with "Import history is missing, so imports are paused to avoid creating the same site twice. Nothing was changed. Contact support with this error ID." It never falls back to the old files, because that could create the same site twice.
2. **Downgrade to a build from before P5 (accepted limitation).** An older build does not know the index exists:
   - It cannot see replay records written after cutover. Repeating such a request on the old build can create a second site.
   - It cannot find upload and stage files that P5 moved into `payloads/`. Its pending uploads and owner setups fail as "not found", which fails closed.
   - 30 days after cutover, a tidy pass removes old history files that were written at or before cutover. After that, the old build shows no earlier history. History files written later (which can only come from an older build after a downgrade) are never removed, because they may be the only copy.

## Limits that are not detected

- Restoring an older copy of the index that has the same database ID.
- Losing committed data in the index's write-ahead log (`-wal`) file.
- Losing every authority file at once (the state file, the witness file `.history-indexed-v1`, and the index).

In these cases recent replay records can be lost without warning.
