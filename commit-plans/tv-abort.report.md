- **T-ABORT-08: done.** Added `confirmed draft aborts before the first SQL write` before production edits. Previously, cancellation after lock acquisition would still save the draft, so rejection would fail.
- **T-ABORT-09: done.** Added `confirmed publication aborts before changing the public pointer` before production edits. Previously, publication would commit and refresh despite cancellation.

Both sheets touched `tools.test.ts`, `service.ts`, `revisions.ts`, `revisions.repo.ts`, and `tool-registrations.ts` under `apps/website/src/features/consent/`. Existing optional-argument pads remain unchanged.

Created root `COMMIT-PLAN.md` and `REFRESH.md` with per-sheet records and outstanding test, mutation, and Chrome checks. No importer repoints or API-baseline edits.

Diff re-read complete; no extra deletions needed. Verification was source inspection only. Tests, builds, installs, type-checks, linters, commits, and pushes were not run, per dispatch.
