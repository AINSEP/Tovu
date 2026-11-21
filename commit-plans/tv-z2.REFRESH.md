# tv-z2 refresh notes

- A01–A07 are in-place catch-to-idiom swaps against merge-6 (`776ce6d0f0`).
- No caller or test imports require repointing; no incidental test importers recorded.
- No tests were added, changed, or run. No builds, installs, type checks, linters, graph queries, browser checks, or error-gate runs were performed, per dispatch.
- No STOP conditions encountered at the named catches. No new casts, non-null assertions, helpers, or state-changing observers were introduced. Existing casts in the moved bodies remain verbatim.
- `lib/execution-settings.ts` remains over 500 lines (548); detailed in `COMMIT-PLAN.md`.
- Gate counts and restore-the-catch mutations remain owed to the combine; the expected reduction is 22 `catch-reads-error` findings across 15 files.
- Final diff re-read found no unrelated edits to delete; only the named catch replacements and imports remain in source.
