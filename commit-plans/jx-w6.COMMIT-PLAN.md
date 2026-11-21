# COMMIT-PLAN

## J-RATCHET — done; runtime verification owed to combine

- Base: Jini merge-10 `de4e555b9`, dispatched branch `codex/jx-w6`. The starting script matched the base bytes.
- Files: `scripts/check-error-gate.mjs`, `scripts/__tests__/check-error-gate.test.ts`, `COMMIT-PLAN.md`, `REFRESH.md`.
- Change: add script-local `updateErrorGateDebt`, refuse scoped updates and full debt growth before writing, permit full shrink and first baseline. Move regular reporting statements verbatim into private `reportErrorGateDebt`. Preserve `--list` precedence and normal WARN/strict behavior.
- Tests first: four added cases; no existing tests removed or changed. Each uses its own temporary ledger and test-context cleanup. Every added assertion has a plain-words message. Expected initial red for all four: the imported update function did not exist. Behavioral witnesses: growth and scoped shrink previously overwrote the ledger and returned 0. The full-shrink and absent-file cases preserve existing successful behavior through the new seam.
- Mutation owed to combine: write before growth refusal; remove scoped refusal; reject a legitimate shrink; assume the ledger exists. Run red/green and each mutation separately. No tests, builds, installs, type-checks, or linters run here, per dispatch.
- API-baseline delta: none. One script-local export only; no package exports, manifests, dependencies, or ledger changes.
- Look owed: none; no UI changes.
- Importers: named targeted production searches found no existing callers of either new function. The update function is called only by this module's `main` and the named test file.
- Limits: update function 16 lines, reporting function 12, main 11; manual review found each within complexity 10. Neither touched code file exceeds 500 lines. Existing optional pads are unchanged.
- Reuse: use existing `compareErrorGateDebt`, serialization, and success copy; the sheet fixes the existing script's ledger boundary.
- Diff reread deletions: none outside the sheet. The unguarded inline update arm was replaced as required; reporting statements were moved verbatim. No unrelated edits retained.
- Refresh: unavailable pushed merge ref and combine verification are recorded in `REFRESH.md`.

BREAKS: `--update --files` and full updates that grow the ledger now return failure and leave the ledger intact.
