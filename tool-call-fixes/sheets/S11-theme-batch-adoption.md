# S11. Theme file tools adopt chained batches; the stale-file words are fixed (C4, mechanism M6, Tovu)

Repo: Tovu. Estimate: 150k Sonnet. Prerequisites: S10.
Blocking decision: none.
Landed check: `rg -n "export function createChainedBatchHandler" ../Jini/packages/core/src/approval-batch-chain.ts`.

## Lane order (judge finding 17)
`theme-files.ts` (1,344 lines) is lane T's **T-TH-05** (size split, design level, not started) and
`file-mutation-tools.ts` is in **T-TH-08**'s move list. This sheet lands **before** both (INDEX §3). Check:
`git ls-files --error-unmatch apps/website/src/features/theme/theme-files.ts apps/website/src/features/theme/file-mutation-tools.ts`.
If either is gone, a T lane landed first: find `readThemeFileVersion`, `writeFileAtomically` and
`protectThemeFileTools` with `rg`, apply there, and say so. `theme-files.ts` is on the size-debt list: net growth in
that file ≤ 12 lines; anything more goes into the new sibling below. Report the touched blobs so T-TH-05 / T-TH-08
refresh their `*.files.tsv`.

## Read first
`apps/website/src/features/theme/file-mutation-tools.ts` (whole file, 64 lines) ·
`rg -n "readThemeFileVersion|withReviewedThemeFileWrite|assertReviewedThemeFileCurrent|function writeFileAtomically|reviewedThemeWrite" apps/website/src/features/theme/theme-files.ts` ·
`rg -n "THEME_CONTENT_REPLACEMENT_TOOL_IDS" apps/website/src` · `apps/website/src/assistant/batch-tool-inputs.ts` (theme tools are `mode: 'plan'`).

How the committed version is known without re-reading the target: `writeFileAtomically` fills a temp file, checks the
pin (`assertReviewedThemeFileCurrent`), then renames, with no `await` between check and rename. The digest of the
**temp file**, taken before the rename, is the version this write commits.

## Inventory step
`rg -n "changed during review" . ../Jini/packages` (sources, tests, admin UI, docs). At the plan's base: two hits, both
source (`file-mutation-tools.ts`, `theme-files.ts`). List what you find.

## Characterization (passes today)
`features/theme/__tests__/theme-edit-batch-same-file.characterization.test.ts`, temp theme folder:
`theme_edit_file { themeId, items: [edit1(path P), edit2(path P)] }` → edit1 is on disk, edit2 is not, and the
model-facing result contains `The theme file changed during review.`

## Red-first (fails with that message)
1. two and three edits to P in one call → all applied in order; bytes equal the sequential result; outcome `completed`.
2. edits to P, Q, P → all applied. `targetKey` gives P and Q different keys (two paths that resolve to the same real
   file give the **same** key: the key is the resolved `target`).
3. edit2's `oldString` exists only **after** edit1 → applied (proves order, not just the pin).
4. foreign writer, three windows, each its own test, injected through a test-only file port the test controls
   (create the seam first if `theme-files.ts` has none: an optional `afterCommit` hook parameter on the internal
   writer, defaulted to nothing, is enough; no module mock):
   a. right after item 1's rename, before item 2 starts; b. after item 2's pin was set, before its write;
   c. while item 2's `prepare` awaits (before any write).
   In a and b item 2 answers exactly `This theme file changed after it was read. Read it again and retry; this change was not applied.`,
   outcome `partial_failure`, item 1 stays applied and is reported applied, and the foreign bytes are **not** overwritten.
   In c item 1 refuses with the same sentence and item 2 is skipped.
5. edit1 fails (its `oldString` is absent) → edit2 on P reports `Skipped: an earlier change to this file in the same call failed.`
6. a byte-identical write as item 1 (nothing committed) → item 2 runs against the unchanged pin.
7. permission: a principal without the theme write permission is refused before any item runs (existing; must still pass).
8. single (non-batch) calls: result shape and text byte-identical to today except the reworded stale sentence.

## Change (one gated commit per item)
1. `theme-files.ts`: the reviewed-write scope records what the write committed. `withReviewedThemeFileWrite` becomes
   able to return it: new sibling `features/theme/reviewed-write-commit.ts` exports
   `runReviewedThemeFileWrite({ prepared, run }, {})` → `{ result, committedVersion: string | undefined }`; inside
   `writeFileAtomically`, compute `fileDigest({ path: tempPath })` before `renameSync` and store it in the scope after
   the rename succeeds. Move no comment away from the code it explains.
2. `file-mutation-tools.ts`: build the handler with `createChainedBatchHandler` (import
   `@jini-ai/core/approval-batch-chain`): `targetKey: ({ prepared }) => prepared.target`;
   `successor: ({ prepared, committed, previous }) => ({ ...prepared, version: committed ?? previous.version })`;
   `run` returns `{ output, committed: committedVersion }`; `targetNoun: 'file'`. `prepare` is unchanged.
3. Replace the wording at both sites with the sentence in case 4.
4. Do not touch authorization, path containment or `assertThemeFileWritable`; `prepare` still validates every item before any write.

## Acceptance
All cases green with exact text; existing theme tool tests pass with unchanged counts; `check:size` shows
`theme-files.ts` within the stated growth; gate green; changed sentence listed old → new.
