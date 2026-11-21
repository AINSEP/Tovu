DG2-01 implementation done; combine verification remains pending.

- `.dependency-cruiser.mjs`: added the nine specified public entries. Rule scope and rank direction are unchanged.
- `dependency-cruiser.test.ts`: added one test first, covering the approved leaf, private-file rejection, upward value-import rejection, JSON violations, and process signal. Before the declaration, extra deep-import violations are expected to make it red; this was not executed.
- Both coordinator-ruling importers were inspected and need no edits.
- Created `COMMIT-PLAN.md` with base, files, mutations, API delta, and Chrome check owed.
- Created `REFRESH.md` recording additional test callers and the existing test’s missing rank-table setup.

Diff review removed two incidental setup lines from the existing test. No existing assertions or argument pads changed.

Tests, builds, installs, type checks, linters, and mutations were not run, per the machine rule. No commits or git writes.
