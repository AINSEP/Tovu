# 05 — Tovu `apps/admin/src/features/posts/PostEditor.tsx`

Measured at `origin/integ/wave-b-fixed`: 2,106 lines (1,590 code), 33 imports, 19 components in one module.
Components are exempt from the 50-line target but not from the 80-line error. Over 80: `Toolbar` 207-558 (**345**), `PostEditor` 1513-1797 (**271**), `PostEditorActions` 943-1063 (116), `PostEditorHeader` 651-769 (112), `PostPreview` 1872-2015 (83).

## 1. Current shape

| lines | component / data | concern |
|---|---|---|
| 102-186 | `TOOLBAR_PROBES`, `TOOLBAR_DEFAULTS` | toolbar state probes (pinned by `PostEditor.toolbar-probes.unit.test.ts`) |
| 207-558 | `Toolbar`: 4-line editor-state subscription (223-226) + one 325-line JSX return. Groups by comment: icon formatting (231-360), text/background colour (361-403), font family/size/line-height (404-533), phone overflow (534-548), character count (549-557) | toolbar |
| 614-637 | `BubbleFormattingMenu` | toolbar |
| 651-769 | `PostEditorHeader` | header |
| 780-925 | `PostAutosaveRecoveryBanner`, `PostAutosaveStaleBanner`, `PostVersionConflictBanner` | notices |
| 943-1085 | `PostEditorActions`, `PostEditorToolbarEnd` | header actions |
| 1119-1192, 1343-1375 | `PostEditorTemplatePicker`, `PostEditorTemplateModalGate` | template |
| 1215-1261, 1459-1511 | `PostEditorSlugCollisionWarning`, `PostEditorNotices` | notices |
| 1272-1330 | `PostEditorBody` | body |
| 1382-1421 | `PostDeleteConfirmDialog` | dialogs |
| 1513-1797 | `PostEditor`: 69 lines of hook wiring (1514-1582) + a 194-line JSX return (1596-1796) | screen root |
| 1872-2106 | `PostPreview`, `PostPreviewFrame` | preview |

The state already lives in hooks (`hooks/use-post-editor.hooks.ts`, `use-post-editor-ui.hooks.ts`, port + dependency hooks). The `.tsx` is view code that was never divided.

## 2. Target shape

```
features/posts/
  PostEditor.tsx                          screen root: usePostEditorScreen() + 4 section components       ~110
  hooks/
    use-post-editor-screen.hooks.ts       the 69 wiring lines → returns { header, workspace, notices,
                                          dialogs, preview } prop bundles                                  ~130
  editor/
    PostEditorChrome.tsx                  header + actions + toolbar-end row (JSX 1596-…)                  ~90
    PostEditorWorkspace.tsx               toolbar + bubble menu + body + template picker + preview tabs    ~110
    PostEditorDialogs.tsx                 delete confirm, template modal gate, settings/url dialogs        ~80
    PostEditorBody.tsx                    1272-1330                                                        ~80
    PostDeleteConfirmDialog.tsx           1382-1421                                                        ~60
    toolbar/
      toolbar-probes.ts                   102-186 (data + comments, no JSX)                                ~100
      Toolbar.tsx                         subscription + overflow container + the five groups              ~90
      ToolbarFormattingGroup.tsx          231-360 → two components (inline marks / block + list + align)   ~170
      ToolbarColorGroup.tsx               361-403                                                          ~70
      ToolbarTypographyGroup.tsx          404-533 → FontFamilySelect, FontSizeSelect, LineHeightSelect     ~170
      ToolbarOverflowMenu.tsx             534-548                                                          ~40
      ToolbarCharacterCount.tsx           549-557                                                          ~30
      BubbleFormattingMenu.tsx            614-637                                                          ~50
    header/
      PostEditorHeader.tsx                651-769 → PostEditorTitleRow + PostEditorStatusRow               ~150
      PostEditorActions.tsx               943-1063 → SaveActions + PublishActions + ActionsMenu            ~160
      PostEditorToolbarEnd.tsx            1073-1085                                                        ~30
    notices/
      PostAutosaveRecoveryBanner.tsx      780-820                                                          ~60
      PostAutosaveStaleBanner.tsx         851-865                                                          ~40
      PostVersionConflictBanner.tsx       881-925                                                          ~70
      PostEditorSlugCollisionWarning.tsx  1215-1261                                                        ~70
      PostEditorNotices.tsx               1459-1511                                                        ~80
    template/
      PostEditorTemplatePicker.tsx        1119-1192                                                        ~100
      PostEditorTemplateModalGate.tsx     1343-1375                                                        ~50
    preview/
      PostPreview.tsx                     1872-2015 → component + usePostPreviewSource hook                ~150
      PostPreviewFrame.tsx                2027-2106                                                        ~100
```

27 files, largest ~170; every component ≤80 lines. `PostEditor.tsx` keeps its path and its single export, so the router, `index.ts` and the 10 external references do not change.

### Rules for the split (these are what make it safe)

1. **No new DOM nodes.** Every extracted group returns a fragment (`<>…</>`) or the exact element it had. The toolbar's overflow logic measures the children of `overflow.toolbarRef`; a wrapper `<div>` per group changes what overflows. Verified by the DOM snapshot in step 0.
2. **One editor-state subscription.** `Toolbar` keeps lines 223-226 and passes `s` down. Group components take `{ editor, state, t }` (+ the handlers they call) and hold no subscription of their own — otherwise each group re-subscribes to TipTap transactions.
3. **Prop bundles, not 40 props.** `usePostEditorScreen` returns one object per section; each section component takes that one object: `PostEditorChrome({ header }: { header: PostEditorHeaderBundle })`. Bundle types live beside the hook. Optional props use `= {}` defaults in the destructuring; no `?: Record<string, never>`.
4. **Sub-splits follow responsibility**, named in the tree (`SaveActions`/`PublishActions`/`ActionsMenu`; `FontFamilySelect`/`FontSizeSelect`/`LineHeightSelect`). The executor does not invent other seams; if a named seam does not exist in the JSX (e.g. there is no separate menu), keep the component whole if it is ≤80, otherwise stop and report.
5. Owner-quote comments (`{/* … (owner, 2026-08-11: "…") */}` at 300, 361, 404, 534, 549) move with the JSX they precede.

### Signatures

```ts
// hooks/use-post-editor-screen.hooks.ts (hook: exempt from 50, must stay ≤80)
export function usePostEditorScreen(props: PostEditorProps): PostEditorScreen
export interface PostEditorScreen { header: PostEditorHeaderBundle; workspace: PostEditorWorkspaceBundle;
  notices: PostEditorNoticesBundle; dialogs: PostEditorDialogsBundle }

// editor/toolbar/Toolbar.tsx
export function Toolbar({ editor, t, overflow }: ToolbarProps): JSX.Element
// editor/toolbar/ToolbarColorGroup.tsx
export function ToolbarColorGroup({ editor, state, t }: ToolbarGroupProps): JSX.Element
```

Direction: `PostEditor.tsx → editor/* → editor/{toolbar,header,notices,template,preview}/*`; nothing under `editor/` imports `PostEditor.tsx`; `toolbar-probes.ts` imports nothing from React.

## 3. Step order

0. **Characterization (no source change)**: `__tests__/PostEditor.dom.characterization.unit.test.tsx`, using the existing fake port (`createFakePostEditorPort` pattern in `post-editor-dependencies.unit.test.ts`). Snapshot normalised `container.innerHTML` (strip generated ids) for: new post · loaded draft · dirty · autosave recovery banner · stale banner · version conflict · slug collision · template picker open · delete dialog open · preview tab · toolbar at phone width (overflow menu) · toolbar with each probe active (loop `TOOLBAR_PROBES`). 12+ states.
1. `toolbar-probes.ts` (repoint the probes test's import).
2. Leaf components that are already ≤80, one file per commit, move-only: the five notices, template picker + gate, body, delete dialog, toolbar-end, bubble menu, preview frame.
3. `Toolbar`: extract groups bottom-up (character count, overflow, colour, typography, formatting), then move `Toolbar.tsx`.
4. `PostEditorHeader`, `PostEditorActions`, `PostPreview` with their named sub-splits.
5. `usePostEditorScreen`; then the three section components; `PostEditor.tsx` becomes the root.
6. Remove `PostEditor.tsx` file entry and the `Toolbar#1`, `PostEditor#1`, `PostEditorActions#1`, `PostEditorHeader#1`, `PostPreview#1` function entries from `size-debt.json`.

Gate per commit: admin `tsc`, the DOM snapshot, `PostEditor.unit.test.tsx`, `PostEditor.toolbar-probes.unit.test.ts`, `post-editor-agent-drive`, `post-editor-external-refresh`, `post-editor-new-posts-navigation`, `post-schedule-featured`, `post-settings-dialog`.

## 4. Tests

The feature has 20+ test files that render through the port fake — they are the behaviour pin and need no edit except import paths for names that move (`TOOLBAR_PROBES`, `TOOLBAR_DEFAULTS`). New: the DOM characterization; `use-post-editor-screen.hooks.unit.test.tsx` (bundles are stable references when inputs do not change; uses the same fake port). Note for the baseline: `refactor/size-tovu` recorded admin suites with pre-existing failures (pages 190, themes 183); record the posts baseline before step 0 and compare failing test **names**, not counts.

## 5. Risks

| risk | de-risk |
|---|---|
| wrapper element breaks toolbar overflow / probe mapping | rule 1; phone-width + per-probe snapshots |
| extra TipTap subscriptions, toolbar re-render storms | rule 2 |
| focus loss: a component defined *inside* another during the split remounts on every render | every new component is module-level; eslint `react/no-unstable-nested-components` on the folder |
| stale closure after moving handlers into `usePostEditorScreen` | handlers are not rewritten, only relocated; dependency arrays unchanged; `react-hooks/exhaustive-deps` clean |
| executor "aligns" PostEditor with `PageEditor.tsx` | out of scope; move-only |

## 6. Interaction with planned work

- `CLASSIFY-files.tsv` row: MIXED → the three autosave/conflict banners go to `@jini-ai/ui/panel-kit` (host contract `t`, `handlePrefix` "post"/"page", conflict actions). `editor/notices/*` is cut one-file-per-banner for that move. **Do this design first, then the move** — otherwise the move has to carve the banners out of a 2,106-line file.
- `features/pages/PageEditor.tsx` (1,427 lines) is this file's twin with the same notices; it should reuse this tree's names when it is split (not designed here).
- Untangle lane R1 (admin `.tsx`, wave D) is Jini-side only; no conflict.
- Flag, not done here: `editor/toolbar/*` is a generic TipTap toolbar with no post vocabulary — candidate for `@jini-ai/ui` (it would add `@tiptap/react` as a new dependency there: owner decision). `hooks/use-post-editor.hooks.ts` is 1,399 lines and needs its own design.

## 7. Estimate

≈30 commits. Sonnet executor **≈340k tokens** (DOM characterization 60k; 27 files × 9k; screen hook + root 35k). Risk: **medium-low** (view code behind an existing port fake; main hazard is DOM shape).
