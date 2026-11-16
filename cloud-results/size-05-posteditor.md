# Size design 05 — Tovu admin `PostEditor.tsx` split (cloud run, 2026-11-16)

Branch `refactor/size-05-posteditor` (from `origin/refactor/terra`), pushed. Design: `size-designs/05-tovu-admin-post-editor.md` on `plan/size-designs-2026-11-16` (Revision 2 + Judge response override revision 1).

## Result

**Steps 0-8 done.** `PostEditor.tsx` went 2,106 → 101 lines and is now the root composition over `usePostEditorScreen`. It keeps its path and its two exports (`PostEditor`, `PostEditorProps`); nothing outside `features/posts/` changed except two path-keyed data files (below). All six `PostEditor.tsx` entries in `size-debt.json` were removed (`Toolbar#1`, `PostEditorHeader#1`, `<file>`, `PostEditorActions#1`, `PostEditor#1`, `PostPreview#1`). Banners that the design marks for `@jini-ai/ui/panel-kit` stay in Tovu under `editor/notices/`, one file per banner.

New tree under `apps/admin/src/features/posts/`: `editor/{toolbar,bubble-menu,header,notices,template,preview,view-bar}/*`, `editor/{PostEditorBody,PostDeleteConfirmDialog,PostSavedPanels}.tsx`, `hooks/use-post-editor-screen.hooks.ts` (29 files under `editor/` plus the hook; largest is the hook at 256 lines, then `PostPreview.tsx` 247, all others ≤189).

## Commits (all pushed; `git log origin/refactor/terra..HEAD`)

| step | SHA | what |
|---|---|---|
| 0 | `051b141b` | characterization pins (see below), no source change, green on the unmodified tree |
| 1 | `19286b75` | `toolbar/toolbar-state.ts` (probes + defaults + `probeToolbar`), `bubble-menu/bubble-menu-state.ts`; probes test + characterization import repointed |
| 3 | `6c3e31bb` | `ToolbarCharacterCount` |
| 3 | `b7390b88` **RED** | `ToolbarOverflowMenu`, cut with stale line numbers: does not compile |
| 3 | `f5843858` | fix-forward of `b7390b88`; green |
| 2 | `a04360ae` | `toolbar/insert-controls.tsx` (`ToolbarInsertControls`: embed, image/YouTube by URL, mention) |
| 2 | `206920a0` | `ToolbarTypographyGroup` + `FontFamilySelect` / `FontSizeSelect` / `LineHeightSelect` |
| 3 | `ec1852b6` | `ToolbarColorGroup` |
| 3 | `6c0dbe2e`, `5da5b87c` | formatting groups (`ToolbarFormattingGroup.tsx`); drop `Toolbar#1` debt |
| 3 | `12fa0ee9` | `Toolbar.tsx` (one `useEditorState`, one `useToolbarOverflow`) |
| 3 | `f93c2806` | `BubbleFormattingMenu` |
| 4 | `907131c7` | `PostEditorHeader` → `PostEditorBackLink` + `PostEditorTitleSlugFields`; drop `PostEditorHeader#1` |
| 4 | `507fbe40` | `PostEditorActions` → `PostStatusControl` + `PostActionButtons` + `PostSaveFeedback`; drop `PostEditorActions#1` |
| leaf | `e6ecb38a` `eae05ba5` `148b6f07` `e2d97a66` `7bf89bc9` `a08a82be` `7e368666` `d5f5d37e` `7103928e` `3c49376e` | one-file-per-commit moves: three banners, `PostEditorNotices`, slug-collision warning, template picker, toolbar-end, template-modal gate, body, delete dialog |
| — | `a9a71d15` | drop `PostEditor.tsx <file>` debt |
| 5 | `fd0b2e9d` | `PostPreviewFrame` |
| 5 | `52b399b4`, `a3072a27`, `171cbad0` | `PostPreview` split in place (`usePostPreviewSource`, `PostPreviewFab`), moved, orphaned why-comment moved back next to `PostPreviewFab`; drop `PostPreview#1` |
| 6 | `6728b97e` `3d8b3a7c` `7eaebc9e` | `view-tabs.ts`, `PostEditorViewBar`, `PostSavedPanels` |
| 7 | `47c8a0cd` | `usePostEditorScreen` + region bundles (no JSX) |
| 8 | `c45b067b` | root composition; drop `PostEditor#1` |
| 7 | `683ade02` | `use-post-editor-screen.hooks.unit.test.tsx` (10 tests) |
| — | `c1ede624` | re-key `admin-literal-copy.baseline.json` for the moved sites (see Deviations) |

## Pins (step 0) and proof they can fail

`__tests__/PostEditor.dom.characterization.unit.test.tsx` (+ `__snapshots__/…snap`, 76 tests): normalised `innerHTML` snapshots (generated ids renamed in first-seen order, per-mount preview uuid masked, `Date` pinned) for new post, loaded draft/published/page, dirty, save message+error, recovery / stale / conflict / outside-change banners, slug collision, template picker, template modal, delete + unchanged-save dialogs, settings dialog, five preview states; asserted DOM order of the 11 regions (saved post edit view, preview view, new post); loading/error contract and loading→ready→error hook-order stability; URL dialog open → preview → edit comes back closed and empty; toolbar overflow with controlled geometry (stubbed `offsetWidth`/`clientWidth`/computed gap + fake `ResizeObserver`: primaries at three widths, "More" fits, one observer, observation order); one toolbar snapshot per probe (30). Baseline was 23 files / 602 tests green; now 25 files / 688 tests green (`602 + 76 + 10`).

Deliberate local mutations (each reverted; failing test names in parentheses), all caught: actions row moved after slug warning (order tests); wrapper `<div>` around the colour group (49 snapshots); italic given rank 2 (geometry tests); hooks after the early return (hook-order tests); body kept mounted in preview (URL-dialog lifetime + preview tests); bold/italic probe swapped (probe tests); two banners swapped (notice-order test); template modal gate dropping the `activeThemeId` check (**not caught at first** → added the four-case `it.each`, now caught); toolbar-end children swapped (preview snapshots); wrong `notices.serverUpdatedAt` in the hook (hook test + recovery snapshot); hooks after early return in `usePostEditorScreen` (hook-order test).

## Gates

Per commit: `npx tsc -p apps/admin --noEmit` = 0, the design's gate list (characterization, `PostEditor.unit`, toolbar-probes, agent-drive, external-refresh, new-posts-navigation, schedule-featured, settings-dialog) via `--maxWorkers=2`, and `check:size` / `check:complexity` diffed against the unmodified tree (no new or worsened entries; the repo already fails both scripts on unrelated files at the base commit, recorded and compared by name). Final: all of `src/features/posts` (25 files, 688 tests), `src/lib` + `src/__tests__` + `src/components` (317 files, 4,068 tests) and every other `src/features/**` suite (481 files, 9,021 tests) green. ESLint on the folder: 0 errors in touched/new source; warnings are components over the 50-line target (exempt) and three style warnings in my own test. Pre-existing and untouched: `use-post-editor.hooks.ts` (636 lines, own design), `createFakePostEditorPort.updatePost` complexity 10. `check:architecture` fails on the base tree's `apps/website` metrics; its output contains no `apps/admin` path, not caused by this work (not re-run on the base to prove it).

## Deviations from the design (recorded, none redesign)

1. **`b7390b88` is red.** I cut the overflow button with line numbers made stale by the previous commit's new import and chained the commit after a gate that did not abort. Fixed forward in `f5843858` (never force-pushed). Gate scripts now abort on failure and ranges are located by text anchors.
2. **`admin-literal-copy.unit.test.ts` is red on every intermediate commit that moved JSX out of `PostEditor.tsx`** (from `a04360ae`, the first commit that moved a literal site, `YouTube`; not re-run commit by commit), green again at `c1ede624`. It keys by file; I did not have it in the gate list. Same 19 sites (kind + text multiset unchanged), re-keyed in the baseline. Lesson 10 applies: add `src/lib/__tests__/admin-literal-copy.unit.test.ts` to any split's per-commit gate.
3. **Formatting group is five components, not two** (`ToolbarMarksGroup`, `ToolbarHeadingGroup`, `ToolbarBlockGroup`, `ToolbarAlignGroup`, `ToolbarHistoryGroup`, one per existing `div.grp`, in `ToolbarFormattingGroup.tsx`): the design's "block + list + align" as one component is ~85 code lines, over the 80 error limit.
4. **`PostPreviewFab` added** next to the named `usePostPreviewSource`; the hook alone leaves `PostPreview` at 82 lines.
5. Groups take `{ editor, state, t }` per rule 2 and each makes its own `createFocusedEditorChain({ editor })` (a closure over `editor`, no subscription); marks/heading/block groups also take `overflow`, marks also `urlDialog`.
6. Header, actions, `PostEditorViewBar`, `PostSavedPanels` were split and moved in one commit each rather than in place first. `PostPreview` was split in place first, as designed.
7. **Bundles are not memoised**, so the design's "bundles are stable references" test is not written (no component is `memo`'d, so identity is unobservable); `use-post-editor-screen.hooks.unit.test.tsx` pins the contract instead (statuses, region keys, kind label, wiring, hook order). `usePostEditorScreen` takes its own `PostEditorScreenInput` rather than `PostEditorProps` to avoid a hook→root import.
8. The root spreads bundles (`<PostEditorHeader {...screen.header} />`), so section components keep their flat prop signatures; the "one object per section component" form of rule 3 was not applied.
9. `usePostUrlDialog` stays in `PostEditorBody`; pinned by the lifetime test.
10. Doc comments written as JSX comments before a moved group became block comments above its component; two cross-references in moved comments were repointed (`bubble-menu-state.ts`). Not changed: `features/pages/PageEditor.tsx`, `pages/rules.ts`, `components/TemplateSource/*` and `development/e2e/journeys/posts.journey.ts` still name `features/posts/PostEditor.tsx` (and its former `PostVersionConflictBanner`, `PostEditorNotices`) in comments.

## Next

- Repoint those stale comments, and cut `PageEditor.tsx` with this tree's names; then the three banners → `@jini-ai/ui/panel-kit` (host contract `t`, `handlePrefix`, conflict actions).
- `hooks/use-post-editor.hooks.ts` (636 lines, `usePostEditor` 400 lines): its own design.
- Owner decision 05-a (a generic TipTap toolbar in `@jini-ai/ui`) is unchanged: nothing moved to Jini.
