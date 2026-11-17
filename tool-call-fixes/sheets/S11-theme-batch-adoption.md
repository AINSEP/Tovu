# S11. Theme file tools adopt chained batches; the stale-file words are fixed (C4, mechanism M6, Tovu)

Repo: Tovu. Estimate: 130k Sonnet. Prerequisites: S10 merged and built into the linked Jini.

## Read first
`apps/website/src/features/theme/file-mutation-tools.ts` (whole file, 64 lines), `features/theme/theme-files.ts`
(`readThemeFileVersion`, `withReviewedThemeFileWrite`, `assertReviewedThemeFileCurrent`),
`apps/website/src/assistant/batch-tool-inputs.ts` (theme tools are `mode: 'plan'`), the theme tool tests.

## Inventory step
`rg "changed during review"` in Tovu and Jini, sources and tests, plus admin UI and docs. At the design commit there were exactly two hits, both source. List what you find.

## Characterization (passes today)
`features/theme/__tests__/theme-edit-batch-same-file.characterization.test.ts` against a temp theme folder:
`theme_edit_file { themeId, items: [edit1(path P), edit2(path P)] }` → edit1 is on disk, edit2 is not, and the model-facing result contains `The theme file changed during review.`

## Red-first (fails with that message)
1. two and three edits to P in one call → all applied in order; file bytes equal the sequential result; outcome `completed`.
2. edits to P, Q, P → all applied.
3. edit2's `oldString` only exists **after** edit1 → applied (proves order, not just pin refresh).
4. another writer changes P between items (inject through the file port the test controls) → item 2 answers exactly `This theme file changed after it was read. Read it again and retry; this change was not applied.`; outcome `partial_failure`; item 1 stays applied and is reported as applied.
5. edit1 fails (its `oldString` is absent) → edit2 on P reports `Skipped: an earlier change to this file in the same call failed.`
6. `theme_write_file` then `theme_edit_file` cannot be mixed in one call (different tools): unchanged.
7. permission: a principal without the theme write permission is refused before any item runs (existing behaviour; must still pass).

## Change
1. Pass `chain: { targetKey: p => p.target, repin: ({ prepared }) => ({ ...prepared, ...readThemeFileVersion(prepared.file) }), targetNoun: 'file' }` to `createPreparedBatchHandler`.
2. Replace the wording at both sites with the sentence in case 4.
3. Do not touch authorization, path containment or `assertThemeFileWritable`; `prepare` still validates every item before any write.

## Acceptance
Seven cases green with exact text; existing theme tool tests pass with unchanged counts; `check:size` and `check:complexity` green.
