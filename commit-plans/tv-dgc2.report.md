V3 implemented; no STOP conditions found.

Files touched:

- `theme-file-safety.test.ts`
- `import-theme-file-tool.ts`
- `theme-file-import.ts`
- `media-import/fetch-image.ts`
- Root `COMMIT-PLAN.md` and `REFRESH.md`

Tests were written first. The held-download witness expects the same signal, original abort reason, unchanged bytes, and no revision. Before the fix, cancellation permits the replacement, so rejection is expected to fail. The committed-write control pins successful completion after cancellation.

The coordinator-listed admin importer needs no edit because the signal option is additive; recorded in `REFRESH.md`.

Diff re-read deletions: none. Existing argument pads preserved. No tests, builds, installs, type-checks, or linters run; both mutations remain owed to combine. No Git writes.
