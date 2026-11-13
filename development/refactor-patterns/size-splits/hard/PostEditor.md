# Split plan — apps/admin/src/features/posts/PostEditor.tsx (+ hooks/use-post-editor.hooks.ts)

## 1. Header
- `apps/admin/src/features/posts/PostEditor.tsx` — 1590 counted (2106 raw). Over: file; `Toolbar` 345, `PostEditor` 271, `PostEditorActions` 116, `PostEditorHeader` 112.
- `apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts` — 635 counted (1398 raw). Over: file; `usePostEditor` 400. They move together (rule 9: the screen is markup, logic is in the hook).
- Phase: **NOW**. Survey (claude u0xx rows for posts): use-post-editor.hooks is MIXED — the "session shell" (save/settlement, persistWorkingPost, conflict/overwrite, remove, external refresh, autosave scheduling, preview-expand+Escape) is DEDUPE-later with `use-page-editor.hooks.ts` into a shared Tovu hook, then maybe `@jini-ai/ui/panel-kit`; blocked on features/pages. This split puts exactly those shell pieces into named sub-hooks/files (`use-post-editor-save.hooks.ts`, the load/refresh hooks), which is the shape that later dedupe needs. PostEditor.tsx is not in the move. Nothing here waits for the move.
- Executor: Fable/Opus. Two commits (one per file pair below), hooks file first.

## 2. Decisions
- **Component file names**: PascalCase siblings in `features/posts/` (`PostEditorToolbar.tsx`, …) — the plan-given names (rule 3 allows), matching the folder's convention (`PostSettingsDialog.tsx`, `PostCoverImage.tsx`). Hook siblings in `features/posts/hooks/` as `use-post-editor-<job>.hooks.ts`, matching `use-post-editor-ui.hooks.ts`.
- **Rule-9 exception (documented)**: the five new *region* components in PostEditor.tsx take `controller: PostEditorController` (the injected hook's typed result) plus the narrowed `post: AdminPost`, instead of re-listing ~60 fields as props. Reason: `PostEditor` destructures 69 fields and passes them on; without this the screen cannot get under 100 lines (measured: still ~130 with every block extracted as plain-prop components). Leaf components (`PostEditorHeader`, `PostEditorActions`, banners, `Toolbar`, `PostPreview`, …) keep their existing plain props, unchanged.
- **Hook-order note**: sub-hooks reorder some `useState` calls (e.g. theme state no longer interleaved with form state). React needs only a stable order across renders, which holds; no behaviour change.

## 3. Responsibility map
### PostEditor.tsx (every top-level declaration)
| Declaration | → module | job |
|---|---|---|
| `VIEWS`, `VIEW_TABS` | PostEditorViewBar.tsx (export `VIEW_TABS`) | Edit/Preview tab data |
| `TOOLBAR_PROBES`, `ToolbarState`, `TOOLBAR_DEFAULTS`, `probeToolbar`, `BUBBLE_MENU_PROBES`, `BubbleMenuState`, `BUBBLE_MENU_DEFAULTS`, `probeBubbleMenu` | post-editor-toolbar-probes.ts | pure editor-state probes (non-JSX) |
| `Toolbar`, `BubbleFormattingMenu` | PostEditorToolbar.tsx (both exported) | formatting toolbar + bubble menu |
| `PostEditorHeader`, `PostEditorActions` | PostEditorHeader.tsx (both exported) | header row and action row |
| `PostAutosaveRecoveryBanner`, `PostAutosaveStaleBanner`, `PostVersionConflictBanner`, `PostEditorNotices`, `PostEditorSlugCollisionWarning` | PostEditorBanners.tsx (export `PostEditorNotices`, `PostEditorSlugCollisionWarning`) | work-at-risk notices |
| `PostEditorToolbarEnd`, `PostEditorTemplatePicker` | PostEditorViewBar.tsx | view bar's right group |
| `PostPreview`, `PostPreviewFrame` | PostPreview.tsx (export `PostPreview`) | Preview tab |
| `PostEditorBody`, `PostEditorTemplateModalGate`, `PostDeleteConfirmDialog`, `PostEditorProps`, `PostEditor` | stay | screen composition |

### Statement groups of long functions
**`Toolbar`** (anchors = outline jsx anchors; each new group component takes one props object and renders exactly that `<div className="grp">` with the JSX comment above it):
- L222 `const s = useEditorState(` / L227 `const chain =` / L228 `const overflow =` — stay in `Toolbar`.
- L232 `<div className="grp">` (marks + Link) → `ToolbarMarkButtons({ s, chain, overflow, urlDialog, t })`.
- the H1-H3 `<div className="grp">` (~L258-262) → `ToolbarHeadingButtons({ s, chain, overflow, t })`.
- L263 `<div className="grp">` (lists, quote, code block + language, divider, table) → `ToolbarBlockButtons({ s, chain, overflow, t })`.
- L299 comment + L310 `<div className="grp">` (align) → `ToolbarAlignButtons({ s, chain, t })`.
- undo/redo `<div className="grp">` (~L356-359) → stays inline (4 lines).
- L360 comment + L379 `<div className="grp">` (colors) → `ToolbarColorControls({ s, chain, t })`.
- L403 comment + L415 `<div className="grp">` (font/size/line) → `ToolbarTypographySelects({ s, chain, t })`.
- L459 `<div className="grp">` (Embed, image URL, YouTube, mention) → `ToolbarInsertControls({ editor, chain, urlDialog, mentionablePosts, currentPostId, t })`.
- L533 comment + L537 `<button` (More) and the count `<span>` — stay.
Shared prop types in PostEditorToolbar.tsx: `interface ToolbarGroupProps { s: ToolbarState; chain: ReturnType<typeof createFocusedEditorChain>; t: Translate; }`, `overflow: ToolbarOverflowController` (exported from `hooks/use-post-editor-ui.hooks.ts`), `urlDialog: PostUrlDialogController`. Group components are module-level, directly above `Toolbar`, in render order.

**`PostEditorHeader`**: L685 comment + L706 `<a` (back link) → `PostEditorBackLink({ kindLabel, confirmLeave, t })`; L718 comment + L725 `<label …title-wrap` → `PostEditorTitleField({ title, setTitle, t })`; L739 `<div className="editor-slug">` (+ its trailing comment) → `PostEditorSlugField({ slug, setSlug, post, t })`. Header keeps the wrapper, its leading comment, and the `<h1 className="visually-hidden">`.
**`PostEditorActions`**: L983 comment + `<div className="content-action-group">` → `PostEditorSaveControls({ status, setStatus, saving, onPublish, onSave, onDeleteClick, t })` (keeps the `saving` field doc on its props type). Actions keeps wrapper, message/error spans, settings button.
**`PostEditor`** (L1513 destructure is replaced by `const controller = usePostEditorHook(postId); const { post, error, t, view, setView } = controller;`):
- L1584 `useTabBarKeyboard`, L1587 `useDevicePreviewDevice`, L1588 `usePostSettingsDialog`, L1590/L1591 early returns, L1593 `kindLabel` — stay (hooks above early returns, unchanged).
- L1597 `<PostEditorHeader` + L1608 `<PostEditorNotices` → `PostEditorTop({ controller, post, kindLabel })`.
- L1622 comment + L1632 `<div className="page-editor-toolbar">` → `PostEditorViewBar({ controller, post, onViewTabsKeyDown, device, setDevice })` in PostEditorViewBar.tsx.
- actions comment + L1675 `<PostEditorActions` + settings comment + L1691 `<PostSettingsDialog` + slug comment + `<PostEditorSlugCollisionWarning` → `PostEditorActionArea({ controller, kindLabel, settingsDialog })`.
- L1711 `{view === "preview" ? (` + the analysis/terms comments + `{post.id ? <>…</> : null}` → `PostEditorMainPane({ controller, post, kindLabel, previewWidth })`.
- unchanged-save comment + L1763 `<ConfirmDialog` + L1773 `<PostDeleteConfirmDialog` + gate comment + L1784 `<PostEditorTemplateModalGate` → `PostEditorDialogs({ controller, post, kindLabel })`.
Each region returns a fragment `<>…</>` (no new DOM), destructures the controller fields it reads (same names as today), and moves the JSX + JSX comments verbatim. `settingsDialog: PostSettingsDialogController` (exported from use-post-editor-ui.hooks.ts); `device`/`setDevice` types from `useDevicePreviewDevice`'s return (use `ReturnType<typeof useDevicePreviewDevice>["device"]` etc.).

### use-post-editor.hooks.ts (every top-level declaration)
| Declaration | → | job |
|---|---|---|
| `SaveStatusOverride`, `formatSaveSuccessMessage`, `formatSaveErrorMessage` | hooks/use-post-editor-save.hooks.ts | save copy |
| `lowlight`, `FILE_HANDLER_ALLOWED_MIME_TYPES`, `uploadDroppedFile`, `handleFileDrop`, `handleFilePaste` | hooks/use-post-editor-tiptap.hooks.ts | TipTap setup + file drop/paste |
| `formatOutsideChangeMessage` | hooks/use-post-editor-state.hooks.ts | outside-change copy |
| `PostFormState` re-export, `PostEditorView`, `PostEditorController`, `PostEditorDependencies`, `computeContentDirty`, `schedulePendingContentPreviewSubmit`, `persistedPost`, `usePostEditor`, `useWiredPostEditor` | stay | the controller |

**`usePostEditor`** statement groups (anchors from the outline) → sub-hook / helper:
- L577 `const { port, navigate, t } = deps;` — stays.
- L578 `post` … L583 `function setSlug`, L584 `status`, L585 `templateChoice`, L599 `overridesThemePage`, L600 `publishAtInput`, L601 `featuredMediaId`, L602 `author`, L603 `showAuthor`, L604 `hideCoverImageInBody`, L633 `original` → `usePostFormFields()` (state file). Returns all those values + setters + `followsTitle`, `slug`, `setSlug`.
- L590 `availableTemplates`, L594 `activeThemeId`, L595 `activeThemeTier`, L596 `activeThemeApiVersion`, L607 `staticPageIds`, L844 `const loadedTemplates = useRef` → `useActiveThemeFacts()` (state file).
- L614 `message`, L615 `error`, L619 `saveConflict`, L623 `saving`, L638 `confirmingDelete`, L640 `confirmingUnchangedSave`, L641 `deleting`, L654 `showTemplateModal` → `usePostEditorFlags()` (state file).
- L646 `const [view, setView]` — stays (keeps `PostEditorView` in this file; no type move).
- L613 `mentionablePosts` + L928 `mentionPort` + L929 effect → `useMentionablePosts({ port })` (this file) → `AdminPost[]`.
- L650 `previewExpanded` + L941 effect + L953 effect + L962 `togglePreviewExpanded` → `usePreviewExpansion({ view })` (this file) → `{ previewExpanded, togglePreviewExpanded }`.
- L628 `setBodyVersion` + L683 `const editor = useEditor({` + L1303 `setTitleAndSyncEditor` → `useTipTapPostEditor({ t, port, setTitle })` (tiptap file) → `{ editor, setTitleAndSyncEditor }`. (`view` inside `handleDrop` is ProseMirror's param, not React state.)
- L663 `settlement`, L671 `loadedPostHandles`, L674 `savedPost`, L675 `autosave`, L678 `savedRouteSlug`, L681 `firstSaveRequest` — stay.
- L847 `function applyLoadedPost` + L879 `loadInputs` + L880 + L881 load `useEffect` → `usePostEditorLoad({ postId, port, navigate, t, editor, form, theme, flags, savedRouteSlug, firstSaveRequest })` (state file) → `{ applyLoadedPost }`. Keep the `loadInputs.current` pattern and `[postId]` deps verbatim.
- L966 `hasSlugCollision` (reads `theme.staticPageIds` — destructure `staticPageIds` from `theme`, text unchanged), L974 `bodyJson`, L978 `useAgentScreenEntry`, L980 `publishAt`, L981 `useDirtyGuard`, L992 `contentDirty` — stay.
- L999 `externalRefresh` + L1009 subscription + L1011 `pendingExternalVersion` + L1012 effect + L1018 `function applyExternalPost` → `usePostExternalRefresh({ postId, port, navigate, t, savedPost, isDirty, flags, autosave, applyLoadedPost, loadedTemplates, savedRouteSlug })` (state file) → `externalRefresh`. `applyExternalPost` stays a hoisted function declaration below its first use, as today.
- L1034 autosave scheduling effect, L1047 `templatePreviewUrl` — stay.
- L658 `previewForm` + L1055 `canShowPendingContentPreview` + L1056 effect → `usePendingContentPreview({ view, post, status, scheduled, isDirty, contentDirty, loadedId, bodyJson, templateChoice })` (this file) → `previewFormRef`.
- L1080 `runSave`, L1146 `applySavedPost`, L1178 `applySaveFailure`, L1198 `save`, L1210 `saveOverwritingConflict`, L1222 `dismissSaveConflict` → `usePostEditorSave({ postId, port, navigate, t, form, flags, editor, settlement, entryId, firstSaveRequest, savedRouteSlug, autosave, publishAt })` (save file) → `{ save, saveOverwritingConflict, dismissSaveConflict }`.
- L1119 `persistWorkingPost` → module-level `persistWorkingPost({ patch, generation, entryId, port, firstSaveRequest, settlement, title }: PersistWorkingPostInput): Promise<{ post: AdminPost }>` directly above `usePostEditorSave` (save file); `runSave` calls it with those fields.
- L1252 `remove`, L1275 `restoreRecoveredDraft`, L1287 `discardRecoveredDraft` — stay (read setters from `form`/`flags` via destructuring).
- L1311 `const ui = usePostEditorUi(` — stays.
- L1313 `return {` (65 lines) → module-level `toPostEditorController({ ui, form, theme, flags, view, setView, editor, setTitleAndSyncEditor, mentionablePosts, previewExpanded, togglePreviewExpanded, scheduled, hasSlugCollision, isDirty, confirmLeave, contentDirty, templatePreviewUrl, bodyJson, previewFormRef, previewFormTarget, save, saveOverwritingConflict, dismissSaveConflict, remove, restoreRecoveredDraft, discardRecoveredDraft, autosave, externalRefresh, t }: PostEditorControllerParts): PostEditorController` directly above `usePostEditor`: destructures the group objects, then the SAME return literal verbatim (same keys, same order; `setTitle: setTitleAndSyncEditor`, `dirty: isDirty`, `recoverableDraft: autosave.recoverableDraft`, …). `usePostEditor` ends `return toPostEditorController({ … });`.

## 4. Target layout
Exports / imports (no cycles: the four hook siblings never import `use-post-editor.hooks.ts`; save imports only *types* from state; tiptap imports neither; components import hooks, never the reverse):
- `hooks/use-post-editor-state.hooks.ts` — exports `usePostFormFields`, `useActiveThemeFacts`, `usePostEditorFlags`, `usePostEditorLoad`, `usePostExternalRefresh`, types `PostFormFields = ReturnType<typeof usePostFormFields>`, `ActiveThemeFacts`, `PostEditorFlags`. Imports: react; `AdminPost`, `ThemeTier` (`@/lib/api` or `@/lib/api-posts`/`api-themes` if api.md landed first); `PostSaveConflict`, `isoToLocalDateTimeInput`, `withTitleNode`, `POSTS_RESOURCE` (../rules); `loadedPostForm`, `postFormSnapshot`, `resolveActivePostTheme`, `resolveEditorSlug`, `PostFormState` (./post-editor-state.rules); `editorTemplateOptions`, `slugRedirectPath`, `rememberPostEditorRouteRename`, `useExternalEntryRefresh`, `useContentRefreshSubscription`, `interpolate`, `Translate`, `PostEditorPort`, `Editor` (type).
- `hooks/use-post-editor-tiptap.hooks.ts` — exports `FILE_HANDLER_ALLOWED_MIME_TYPES`, `uploadDroppedFile`, `handleFileDrop`, `handleFilePaste`, `useTipTapPostEditor`. Imports the 17 TipTap/lowlight imports (L2-18), `MediaImage`, `Media`, `WidgetEmbed`, `PostTitleDocument`, `PostTitle`, `handleImageDrop`, `readFileAsDataUrl`, `titleNodeText`, `PostEditorPort`, `Translate`. Copy the "Registers lowlight's `common` grammar set…" comment.
- `hooks/use-post-editor-save.hooks.ts` — exports `usePostEditorSave`, `persistWorkingPost`. Imports `interpolate`, `Translate`, `isUnexpectedServerFailure`, `isScheduledPost`, `isoToLocalDateTimeInput`, `buildPostAutosaveDraft`, `readPostVersionConflict`, `buildPostUpdatePatch`, `keepNewerEdit`, `savedPostFields`, `withEverPublished`, `rememberPostEditorRouteRename`, types `PostFormFields`, `PostEditorFlags` (./use-post-editor-state.hooks), `useSettlementGeneration`/`useStandingDraftAutosave` (type-only via `ReturnType`), `Editor`, `AdminPost`, `PostEditorPort`.
- `use-post-editor.hooks.ts` keeps its exports minus the four moved ones; imports the sub-hooks.
- `post-editor-toolbar-probes.ts` — exports `TOOLBAR_PROBES`? (no: module-private), `ToolbarState`, `TOOLBAR_DEFAULTS`, `probeToolbar`, `BubbleMenuState`, `BUBBLE_MENU_DEFAULTS`, `probeBubbleMenu`. Imports `Editor` (type).
- `PostEditorToolbar.tsx` — exports `Toolbar`, `BubbleFormattingMenu`. Imports per declimports scan: `useEditorState`, `Editor`, `BubbleMenu`, `createFocusedEditorChain`, `useToolbarOverflow` + `ToolbarOverflowController`, `toolbarBtnClass`, `hexOrDefault`, `CODE_LANGUAGE_OPTIONS`, `FONT_*`/`LINE_HEIGHT_OPTIONS`, `EmbedInsertControl`, `AdminPost`, `PostUrlDialogController`, `Translate`, probes module.
- `PostEditorHeader.tsx` — exports `PostEditorHeader`, `PostEditorActions`. Imports `agentHandle`, `Icon`, `siteUrl`, `AdminPost`, `Translate`.
- `PostEditorBanners.tsx` — exports `PostEditorNotices`, `PostEditorSlugCollisionWarning`. Imports `agentHandle`, `standingDraftRecoveryMessage`, `PageExternalChangeBanner`, `postAutosaveStaleBasisMessage`, `postVersionConflictMessage`, `overridesThemePageSelectValue`, `overridesThemePageFromSelectValue`, `PostSaveConflict`, `StandingDraftAutosaveSnapshot`, `StandingDraftStaleBasis`, `Translate`.
- `PostEditorViewBar.tsx` — exports `VIEW_TABS`, `PostEditorViewBar`. Imports `PostEditorView`, `PostEditorController` (types), `AdminPost`, `resolveTabBarTabIndex`, `agentHandle`, `DevicePreviewToggle`, `WiredThemePreviewReloadButton`, `ViewTemplateButton`, `Translate`.
- `PostPreview.tsx` — exports `PostPreview`. Imports `resolvePostPreviewBranches`, `usePreviewPaneWidth`, `DevicePreviewFrame`, `agentHandle`, `usePostPreviewIframeEscape`, `useThemePreviewFrame`, `PAGE_PREVIEW_IFRAME_SANDBOX`, `Translate`.
- `PostEditor.tsx` keeps header paragraph; copy into each new file the header sentence that explains its part (e.g. "What stays: `Toolbar`, which is a genuinely inert render…" → PostEditorToolbar.tsx).

## 5. Steps
Run tests with `cd apps/admin && npx vitest run <path> --maxWorkers=2`, one file at a time.
1. **Hooks** (commit A: use-post-editor.hooks.ts + 3 new hook files + test import paths). Order inside the step: (a) create sub-hooks in-file above `usePostEditor` and `toPostEditorController`, run tests; (b) move to the three sibling files. Importer change: `src/features/posts/__tests__/use-post-editor.hooks.unit.test.tsx:6-13` — `FILE_HANDLER_ALLOWED_MIME_TYPES, handleFileDrop, handleFilePaste, uploadDroppedFile` → `../hooks/use-post-editor-tiptap.hooks` (path-only). No `vi.mock` targets these files (checked). Tests: `features/posts/__tests__/use-post-editor.hooks.unit.test.tsx`, `post-editor-external-refresh.unit.test.tsx`, `post-editor-new-posts-navigation.unit.test.tsx`, `post-author.unit.test.tsx`, `post-cover-image.unit.test.tsx`, `post-schedule-featured.unit.test.tsx`, `posts-i18n.unit.test.ts`, `PostEditor.unit.test.tsx`, `src/hooks/__tests__/editor-session-expiry.unit.test.ts`.
2. **Components** (commit B: PostEditor.tsx + 6 new files + 1 test path). (a) leaf splits in place (`Toolbar` groups, Header/Actions subs), (b) region components + `PostEditor` rewrite, (c) move to siblings. Importer change: `src/features/posts/__tests__/PostEditor.toolbar-probes.unit.test.ts:4` → `../post-editor-toolbar-probes` (path-only). `features/posts/index.ts:10` keeps `export { PostEditor } from "./PostEditor"` (unchanged). Tests: `PostEditor.toolbar-probes.unit.test.ts`, `PostEditor.unit.test.tsx`, `post-editor-agent-drive.unit.test.tsx`, `posts-i18n.unit.test.ts`, `PostUrlDialog.chromecheck.unit.test.tsx`, `post-settings-dialog.unit.test.tsx`. Then LOOK at the editor in the owner's running admin (Claude in Chrome): toolbar, phone overflow, preview tab, banners — markup must be identical.
3. `outline.mjs --check` on all 11 files; `npx eslint` on them.

## 6. After (counted, ±15)
PostEditor.tsx ~300 (PostEditor ~25, regions 25-55 each, PostEditorBody 58) · PostEditorToolbar.tsx ~440 (Toolbar ~35, largest group `ToolbarInsertControls` ~76, `ToolbarAlignButtons` ~48) · post-editor-toolbar-probes.ts ~100 · PostEditorHeader.tsx ~250 (Header ~30, Actions ~45, SaveControls ~65) · PostEditorBanners.tsx ~210 · PostEditorViewBar.tsx ~170 · PostPreview.tsx ~170 (PostPreview 83, PostPreviewFrame 76).
use-post-editor.hooks.ts ~345 (usePostEditor ~85, toPostEditorController ~75) · -state ~165 · -tiptap ~125 (useTipTapPostEditor ~56) · -save ~140 (usePostEditorSave ~80). No exception candidates. PostEditorToolbar.tsx is the tightest file (~440): if over 500 after step 2, move `ToolbarInsertControls` to `PostEditorToolbarInsert.tsx` (pre-approved fallback, no other change).

## 7. Risks
- Mocks: posts tests mock `../../taxonomy/TermPicker`, `../../content-analysis/ContentAnalysisCard`, `@/components/EmbedInsertControl/EmbedInsertControl`, `@/hooks/use-admin-locale.hooks`, `../../../lib/router` by module path — they keep applying wherever those modules are imported from. No test mocks PostEditor.tsx or the hooks file.
- Closures over render state: every moved function (`runSave`, `applySavedPost`, `remove`, …) still closes over THIS render's values because the sub-hooks are called every render; never memoize them.
- `loadInputs.current` / `[postId]` load effect and `mentionPort` ref: keep the "ref so the effect runs once per postId" pattern verbatim.
- `applyExternalPost` is referenced before its declaration (hoisting) — keep it a `function` declaration inside `usePostExternalRefresh`.
- `useTabBarKeyboard` must stay above the early returns in `PostEditor`.
- `post` must be passed narrowed (non-null) to regions; do not use `controller.post!` (banned).
- `ToolbarState`/`BubbleMenuState` probes keep ONE `useEditorState` selector each (batching note in `probeToolbar`'s doc).
- If api.md's split lands first, `AdminPost`/`ThemeTier` imports come from `@/lib/api-posts`/`@/lib/api-themes` (its codemod rewrites them automatically when run after this).
