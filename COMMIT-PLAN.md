# r62t-rev-p3 Tovu handoff

Branch: `codex/tv-f-p3`
Verified HEAD: `7c87b3c3f95301d59f55041bf163b723bbab5d79`

## Completed design commits

None. No sheet implementation or characterization tests were added. The prerequisite checks stopped all three Tovu SOL sheets before edits to source or tests.

## Stopped sheets, in dispatch order

1. **P3-T2.T — Routine runs use normal owner-chat acceptance**
   - Missing T1a.T host contract: `apps/website/src/features/routines/routine-commands.ts`, `routine-host.ts`, `routines-paths.ts`, `README.md`, `apps/website/src/server/runtime/composition/modules/assistant-routines.ts`, and `packages/contracts/src/routines.ts` do not exist.
   - Jini P3-T2.J is reported written but unverified. Its `ChatRunRecoveryOptions.admit` contract is present in the read-only `codex/f-p3j` source. This does not supply the missing Tovu host contract.
   - Source/test files touched: none.
2. **P3-T4.T — Routine tools over the serving-site federation**
   - Missing T1a.T serving-site commands, owner gate, and shared release binding contract. The named host files above are absent; no substitute command instance or rollout binding was invented.
   - Source/test files touched: none. Executor metadata verification is deferred until the prerequisite is available.
3. **P3-T5.T — Tovu Routines screen and authorized conversation deep link**
   - Missing T1a.T routes and shared release binding contract. The named host files and `apps/website/src/platform/db/sqlite/routines-db.ts` are absent.
   - T3.T deep-link integration verification remains pending with its OPUS owner.
   - Source/test files touched: none.

All three depend on T1a.T. The supplied Jini handoff at `../o-f-p3j/f-p3j.md` explicitly marks **P3-J2.J stopped**, with its draft retained, and directs the Tovu handoff to wait for completed J2 and P7-J2. It reports the HTTP route module at 516 lines, an SQLite binding factory above 80 lines, and unfinished schedule-type movement and manual missing-row refusal. No consumable J2/P7-J2 handoff was established by that report.

## Tests and named mutations

No tests were added or executed; no red/green or mutation proof is claimed. These sheet mutations remain pending with their characterization tests:

| Sheet | Pending named mutations |
| --- | --- |
| P3-T2.T | Skip interruption cancellation/admission; retain the browser routine marker; invoke the executor directly. |
| P3-T4.T | Save before the create card; delete before the delete card (separate mutations). |
| P3-T5.T | Omit approval projection; link without selecting the conversation. |

## OPUS sheets left

- P3-T1a.T — verified serving-site host, routes, sidecar, and beacon.
- P3-T1b.T — registered desktop boot, wake IPC, and sleep-safe takeover.
- P3-T3.J — authoritative surface approval receipts (Jini, read-only in this dispatch).
- P3-T3.T — observe federated approval without redeeming it.

## Working-tree handoff

- Created: `COMMIT-PLAN.md` only.
- Changed/deleted source or test files: none.
- Diff-review deletions: none; no implementation was drafted.
- No tests, builds, installs, type-checks, linters, generators, commits, pushes, or subagents. `.git` was used read-only. Coordinator owns commits after prerequisite resolution and implementation.
