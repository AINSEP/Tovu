# COMMIT-PLAN

## T-ABORT-08 — done; execution verification owed

- Base: Tovu `0973a5fdc8`, branch `codex/tv-abort`.
- Files: `apps/website/src/features/consent/{__tests__/tools.test.ts,service.ts,revisions.ts,revisions.repo.ts,tool-registrations.ts}`; shared handoff files `COMMIT-PLAN.md`, `REFRESH.md`.
- Tests first: added `confirmed draft aborts before the first SQL write` before production edits. The real SQLite kernel acquires its lock, then aborts with the fixed reason. Before the change, no signal reaches the SQL write, so the call saves a draft instead of rejecting. RED/GREEN not executed under the machine rule.
- Implementation: optional signal passes from the approved tool through the service and store contract. The repository checks it after locked reads and size validation, immediately before the first INSERT. Both writes retain their transaction and order.
- Mutation owed to combine: remove only the draft `signal?.throwIfAborted();`; run the named test and confirm it fails, then restore the check.
- API-baseline delta: none; no baseline artifact edits. Only the sheet's optional first-argument signal field was added; existing second-argument pads remain verbatim. No exports, dependencies, manifests, lockfiles, or import repoints changed.
- Look owed: after combine, confirm “Save draft” in the assistant UI; verify the draft changes while the published revision stays fixed.
- Review: targeted diff re-read; no out-of-sheet additions found and no extra deletions needed. No file exceeds 500 lines. Changed functions remain within 50 lines and complexity 10 by source inspection; no metrics tool was run.

## T-ABORT-09 — done; execution verification owed

- Base: Tovu `0973a5fdc8`, after T-ABORT-08 on `codex/tv-abort`; shared test-fixture dependency satisfied.
- Files: `apps/website/src/features/consent/{__tests__/tools.test.ts,service.ts,revisions.ts,revisions.repo.ts,tool-registrations.ts}`; shared handoff files `COMMIT-PLAN.md`, `REFRESH.md`.
- Tests first: added `confirmed publication aborts before changing the public pointer` before publication production edits. Seeded a real draft before replacing the store; abort occurs after the real lock. Assertions cover the abort reason, preserved draft ID, null published pointer, and no refresh callback. Before the change, publication commits and refreshes instead of rejecting. RED/GREEN not executed under the machine rule.
- Implementation: approved-tool signal passes through the service and store contract to the check immediately before the public-pointer UPDATE, after the locked revision checks. Existing post-commit refresh remains in place.
- Mutation owed to combine: remove only the publication `signal?.throwIfAborted();`; run the named test and confirm it fails, then restore the check.
- API-baseline delta: none; no baseline artifact edits. Only the sheet's optional first-argument signal field was added; existing second-argument pads remain verbatim. No additional imports, exports, dependencies, manifests, lockfiles, or import repoints changed.
- Look owed: after combine, confirm “Publish policy” in the assistant UI; verify the reviewed draft becomes the public revision.
- Review: targeted diff re-read; no out-of-sheet additions found and no extra deletions needed. No file exceeds 500 lines. Changed functions remain within 50 lines and complexity 10 by source inspection; no metrics tool was run.
