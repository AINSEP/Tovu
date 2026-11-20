Refactor(Execution): Completed all six requested sheets in order. Changes remain uncommitted on `codex/tv-ext-rs-c`.

- **A05-T — done.** Delegated rendering to Jini; retained local registration callers and all ten characterization cases. No files deleted or tests added.
- **a52 — done.** Replaced local permission implementations with Jini calls while retaining Tovu import paths. Added map-identity coverage and strengthened error/read assertions. No files deleted.
- **a50 — done.** Repointed CSP and predicate callers; deleted `admin-surfaces/same-origin.ts`. Repointed existing tests, preserving all seven origin cases. No new cases.
- **S6c — done.** Added the host delivery factory and repointed constructors/types. Deleted `form-delivery-repo.ts` and `form-submission-receipt-repo.ts`. Added limit, rollback, and mapper-order cases. B12-T wiring remains intact.
- **T-PO-02-T — done; cloud gate pending.** Repointed eight importers and reshaped calls; deleted `contracts/core/cover-image.ts`. Existing assertions retained. Jini’s entry remains `node`.
- **a13 — done.** Repointed TabStrip, Settings, SiteGrid, and tests; removed the approved barrel exports and deleted `use-tab-strip.hooks.ts`. Added capture/IME assertions and real-document listener tracking.

No sheet stopped. Held a57 remains untouched. No tests, builds, installs, typechecks, or linters ran.

Per-sheet files, mutations, debt constraints, and cloud follow-ups are in [COMMIT-PLAN.md](SCR/c-tv-ext-rs-c/COMMIT-PLAN.md). Importer findings are in [REFRESH.md](SCR/c-tv-ext-rs-c/REFRESH.md). Both unchanged worker deny-list and module-budget gates must pass before merging the cover-image deletion.
