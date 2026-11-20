# jy-cls commit plan

## J11 — refactor: neutralize analytics and host rationale

Done: 30 audited prose anchors in 13 files (analytics forwarding, ingest, product/index, repo.memory, types; core provider-registry docs, plugin-sdk, format-timestamp, resolve-active-tab-id; platform directory-delete-guard; sidecar child-entries; UI execution/http-adapter and panel-kit/helpers/permissions). Removed upstream design IDs while preserving the stated reasons. Behaviour identical; executable content unchanged. No changeset or tests. No stopped anchors. Comment-stripped diff review found zero executable change across all 12 source files. `packages/analytics/src/ingest.ts` is 535 lines; continued as instructed. Diff-review deletions: none.

## J-CLS-UI — refactor(ui): prefix eligible Tier 1 classes

Done with item skips: 319 distinct tokens; 358 source class literals, 163 CSS selectors, 70 existing test literals; 100 files. 170 tokens skipped under cross-package/function-limit rules (REFRESH.md). Behaviour identical except the named class API break. Changeset: `.changeset/jy-cls-j-cls-ui.md` (`@jini-ai/ui` minor): "BREAKING: unprefixed classes renamed to `jini-*`; no host selector used them." No new tests. Diff-review deletions: none.

Files touched:

- `packages/ui/src/features/admin-widgets/components/ComingSoonNotice.tsx`
- `packages/ui/src/features/admin-widgets/components/ComingSoonPanel.tsx`
- `packages/ui/src/features/asset-grid/react/components/AssetCard.tsx`
- `packages/ui/src/features/asset-grid/react/components/AssetGrid.tsx`
- `packages/ui/src/features/asset-grid/react/components/AssetGridBody.tsx`
- `packages/ui/src/features/asset-grid/react/components/AssetGridToolbar.tsx`
- `packages/ui/src/features/asset-grid/react/components/DeleteConfirmDialog.tsx`
- `packages/ui/src/features/asset-grid/react/components/SelectionActionBar.tsx`
- `packages/ui/src/features/asset-grid/react/components/SelectionBand.tsx`
- `packages/ui/src/features/asset-grid/react/components/__tests__/AssetCard.l161.characterization.test.tsx`
- `packages/ui/src/features/asset-grid/react/components/__tests__/AssetGrid.l161.characterization.test.tsx`
- `packages/ui/src/features/asset-tree-browser/__tests__/react/components/AssetTreeBrowser.test.tsx`
- `packages/ui/src/features/asset-tree-browser/react/components/AssetTreeBreadcrumbs.tsx`
- `packages/ui/src/features/asset-tree-browser/react/components/AssetTreeBrowserParts.tsx`
- `packages/ui/src/features/asset-tree-browser/react/components/AssetTreeEmptyState.tsx`
- `packages/ui/src/features/asset-tree-browser/react/components/AssetTreeFileRow.tsx`
- `packages/ui/src/features/asset-tree-browser/react/components/AssetTreeFolderRow.tsx`
- `packages/ui/src/features/asset-tree-browser/react/components/AssetTreeRowMenu.tsx`
- `packages/ui/src/features/asset-tree-browser/react/components/AssetTreeSelectionBar.tsx`
- `packages/ui/src/features/asset-tree-browser/react/components/AssetTreeToolbar.tsx`
- `packages/ui/src/features/asset-tree-browser/react/components/AssetTreeUploadErrorBanner.tsx`
- `packages/ui/src/features/connectors/__tests__/components/ConnectorDetailDrawer.test.tsx`
- `packages/ui/src/features/connectors/__tests__/components/ConnectorGrid.test.tsx`
- `packages/ui/src/features/connectors/__tests__/components/ConnectorLogo.test.tsx`
- `packages/ui/src/features/connectors/components/ConnectorAlertList.tsx`
- `packages/ui/src/features/connectors/components/ConnectorCard.tsx`
- `packages/ui/src/features/connectors/components/ConnectorDetailDrawer.tsx`
- `packages/ui/src/features/connectors/components/ConnectorGate.tsx`
- `packages/ui/src/features/connectors/components/ConnectorGrid.tsx`
- `packages/ui/src/features/connectors/components/ConnectorLogo.tsx`
- `packages/ui/src/features/connectors/components/ProviderTabBar.tsx`
- `packages/ui/src/features/iframe-pool/react/components/IframeKeepAliveProvider.test.tsx`
- `packages/ui/src/features/iframe-pool/react/components/IframeKeepAliveProvider.tsx`
- `packages/ui/src/features/iframe-pool/react/components/PooledIframe.ssr.test.tsx`
- `packages/ui/src/features/iframe-pool/react/components/PooledIframe.tsx`
- `packages/ui/src/features/memory/__tests__/react/components/MemoryAdvancedModal.test.tsx`
- `packages/ui/src/features/memory/__tests__/react/components/MemoryConnectedPanel.test.tsx`
- `packages/ui/src/features/memory/__tests__/react/components/MemoryExtractionCard.test.tsx`
- `packages/ui/src/features/memory/__tests__/react/components/MemoryList.test.tsx`
- `packages/ui/src/features/memory/__tests__/react/render-markdown.test.tsx`
- `packages/ui/src/features/memory/react/components/MemoryAdvancedModal.tsx`
- `packages/ui/src/features/memory/react/components/MemoryConnectedPanel.tsx`
- `packages/ui/src/features/memory/react/components/MemoryHowPanel.tsx`
- `packages/ui/src/features/memory/react/components/MemoryList.tsx`
- `packages/ui/src/features/memory/react/components/MemoryManualEditor.tsx`
- `packages/ui/src/features/memory/react/components/MemorySuggestionPanel.tsx`
- `packages/ui/src/features/memory/react/render-markdown.tsx`
- `packages/ui/src/features/progress-card/__tests__/components/ProgressCard.characterization.test.tsx`
- `packages/ui/src/features/progress-card/__tests__/components/ProgressCard.test.tsx`
- `packages/ui/src/features/progress-card/__tests__/components/ProgressCard.w5-pin.test.tsx`
- `packages/ui/src/features/progress-card/components/ProgressCard.tsx`
- `packages/ui/src/features/resource-dashboard/__tests__/ResourceBoardView.test.tsx`
- `packages/ui/src/features/resource-dashboard/__tests__/ResourceCard.test.tsx`
- `packages/ui/src/features/resource-dashboard/__tests__/ResourceRowListItem.test.tsx`
- `packages/ui/src/features/resource-dashboard/react/components/ResourceBoardToolbar.tsx`
- `packages/ui/src/features/resource-dashboard/react/components/ResourceBoardViewParts.tsx`
- `packages/ui/src/features/resource-dashboard/react/components/ResourceCardParts.tsx`
- `packages/ui/src/features/resource-dashboard/react/components/ResourceMetrics.tsx`
- `packages/ui/src/features/resource-dashboard/react/components/ResourceRowListItem.tsx`
- `packages/ui/src/features/resource-dashboard/react/components/ResourceRowListItemParts.tsx`
- `packages/ui/src/features/resource-dashboard/react/components/ResourceRowListView.tsx`
- `packages/ui/src/features/resource-dashboard/react/components/ResourceRowListViewParts.tsx`
- `packages/ui/src/features/settings/dialog/styles/settings-dialog.css`
- `packages/ui/src/features/sketch-editor/react/components/SketchSaveStateBadge.tsx`
- `packages/ui/src/features/source-config-list/__tests__/SourceConfigItemCard.test.tsx`
- `packages/ui/src/features/source-config-list/react/components/SourceConfigAddForm.tsx`
- `packages/ui/src/features/source-config-list/react/components/SourceConfigField.tsx`
- `packages/ui/src/features/source-config-list/react/components/SourceConfigItemCard.tsx`
- `packages/ui/src/features/source-config-list/react/components/SourceConfigList.test.tsx`
- `packages/ui/src/features/source-config-list/react/components/SourceConfigListView.tsx`
- `packages/ui/src/features/source-config-list/react/components/SourceConfigTestControl.tsx`
- `packages/ui/src/features/viewer-shell/__tests__/react/components/CommentSidePanel.test.tsx`
- `packages/ui/src/features/viewer-shell/__tests__/react/components/MarkdownSplitPane.test.tsx`
- `packages/ui/src/features/viewer-shell/__tests__/react/components/ViewerShell.test.tsx`
- `packages/ui/src/features/viewer-shell/react/components/AudioViewerBody.tsx`
- `packages/ui/src/features/viewer-shell/react/components/CommentSidePanel.tsx`
- `packages/ui/src/features/viewer-shell/react/components/CommentSideParts.tsx`
- `packages/ui/src/features/viewer-shell/react/components/JsonPanel.tsx`
- `packages/ui/src/features/viewer-shell/react/components/MarkdownSplitPane.tsx`
- `packages/ui/src/features/viewer-shell/react/components/SvgSourcePane.tsx`
- `packages/ui/src/features/viewer-shell/react/components/ViewerFileActions.tsx`
- `packages/ui/src/features/viewer-shell/react/components/ViewerShell.tsx`
- `packages/ui/src/features/viewer-shell/react/components/ViewportToggleGroup.tsx`
- `packages/ui/src/react/__tests__/components/AppChromeHeader.test.tsx`
- `packages/ui/src/react/__tests__/components/Loading.test.tsx`
- `packages/ui/src/react/__tests__/components/Notice.test.tsx`
- `packages/ui/src/react/components/AppChromeHeader.tsx`
- `packages/ui/src/react/components/CompactToggle.tsx`
- `packages/ui/src/react/components/EditorIcon.test.tsx`
- `packages/ui/src/react/components/EditorIcon.tsx`
- `packages/ui/src/react/components/ExportDiagnosticsButton.tsx`
- `packages/ui/src/react/components/FileImportPanel.tsx`
- `packages/ui/src/react/components/ImportChoice.tsx`
- `packages/ui/src/react/components/Loading.tsx`
- `packages/ui/src/react/components/Notice.tsx`
- `packages/ui/src/react/components/OnboardingDropdown.tsx`
- `packages/ui/src/react/components/OptionCards.tsx`
- `packages/ui/src/react/components/StatCard.tsx`
- `packages/ui/src/react/components/ToggleRow.tsx`
- `packages/ui/src/styles/admin.css`

Over 500 lines (existing sizes; continued as instructed):

- `packages/ui/src/features/connectors/components/ConnectorDetailDrawer.tsx`: 501 lines.
- `packages/ui/src/react/components/OnboardingDropdown.tsx`: 574 lines.
- `packages/ui/src/features/connectors/__tests__/components/ConnectorDetailDrawer.test.tsx`: 586 lines.
- `packages/ui/src/features/settings/dialog/styles/settings-dialog.css`: 4617 lines.
- `packages/ui/src/features/viewer-shell/__tests__/react/components/CommentSidePanel.test.tsx`: 508 lines.
- `packages/ui/src/features/asset-tree-browser/__tests__/react/components/AssetTreeBrowser.test.tsx`: 627 lines.
- `packages/ui/src/features/memory/__tests__/react/components/MemoryConnectedPanel.test.tsx`: 545 lines.
- `packages/ui/src/features/source-config-list/react/components/SourceConfigList.test.tsx`: 521 lines.

## J-ARGS-UI2 — refactor(ui): convert seven named functions to object arguments

Done: 7 functions converted, 23 calls repointed across 6 files; 15 existing test calls updated, no test cases or test literals added. Existing bodies preserved apart from repointing named calls. All seven functions are reachable from the root entry through existing wildcard exports. Changeset: `.changeset/jy-cls-j-args-ui2.md` (`@jini-ai/ui` minor). BREAKING: `resolveActiveLocaleLabel`, `languageMenuPopoverClassName`, `useActiveLocaleLabel`, `resolvePalettePreview`, `nextPaletteSelection`, `readSavedWidth`, `saveWidth` take one object. API spec docs are not callers and were not edited; the coordinator owns baseline regeneration. No skipped functions. Diff-review deletions: none.

Changed signatures (all retain `_optional = {}` as the second parameter):

- `resolveActiveLocaleLabel({ locales, locale }: { locales: LocaleOption[]; locale: string }, _optional = {})`
- `languageMenuPopoverClassName({ placement, compact, align }: { placement: 'up' | 'down'; compact: boolean; align: 'start' | 'end' }, _optional = {})`
- `useActiveLocaleLabel({ locales, locale }: { locales: LocaleOption[]; locale: string }, _optional = {})`
- `resolvePalettePreview({ target, selected }: { target: PaletteHoverTarget; selected: PaletteId | null }, _optional = {})`
- `nextPaletteSelection({ selected, id }: { selected: PaletteId | null; id: PaletteId }, _optional = {})`
- `readSavedWidth({ storageKey, defaultWidth, min, max }: { storageKey: string; defaultWidth: number; min: number; max: number }, _optional = {})`
- `saveWidth({ storageKey, width, min, max }: { storageKey: string; width: number; min: number; max: number }, _optional = {})`

Files touched:

- `packages/ui/src/react/__tests__/components/LanguageMenu.test.tsx`
- `packages/ui/src/react/components/LanguageMenu.tsx`
- `packages/ui/src/react/__tests__/components/PaletteTweaks.test.tsx`
- `packages/ui/src/react/components/PaletteTweaks.tsx`
- `packages/ui/src/react/hooks/__tests__/useResizableSplitPane.test.tsx`
- `packages/ui/src/react/hooks/useResizableSplitPane.ts`

Over 500 lines: `packages/ui/src/react/hooks/__tests__/useResizableSplitPane.test.tsx` (615). Continued as instructed.

## J-CLS-CA — refactor(chat, admin): prefix eligible Tier 1 classes; remove named component pads

Done with item skips: 82 distinct tokens, 103 source class literals, 15 CSS selectors, 95 existing test literals and 2 snapshot class attributes in 22 files. 24 tokens skipped (REFRESH.md). Removed 10 unused component pads across the 2 admin overlap files. The named chat file has no component `_optional` pad: its `forwardRef` ref parameter and lowercase helpers remain unchanged. Behaviour identical except the named class API break. Changesets: `.changeset/jy-cls-j-cls-ca.md` (`@jini-ai/chat` + `@jini-ai/admin` minor), "BREAKING: unprefixed classes renamed to `jini-*`; no host selector used them." `.changeset/jy-cls-j-pads.md`: `@jini-ai/admin` patch, "components take props only" (no chat pad changed, so no chat patch). No new tests. Diff-review deletions: none.

Files touched:

- `packages/admin/src/forms/react/components/FormFieldRow.tsx`
- `packages/admin/src/forms/react/components/FormsListParts.tsx`
- `packages/admin/src/react/shell/AdminShell.tsx`
- `packages/admin/src/react/shell/__tests__/AdminShell.slots.test.tsx`
- `packages/admin/src/react/shell/__tests__/__snapshots__/AdminShell.markup.test.tsx.snap`
- `packages/admin/src/widgets/react/components/WidgetInstanceNotices.tsx`
- `packages/chat/src/react/components/A2uiSurfaceCard.tsx`
- `packages/chat/src/react/components/AttachmentTray.tsx`
- `packages/chat/src/react/components/NextStepActions.tsx`
- `packages/chat/src/react/components/QuestionForm.tsx`
- `packages/chat/src/react/components/QuestionFormField.tsx`
- `packages/chat/src/react/components/QuestionsPanel.tsx`
- `packages/chat/src/react/components/TodoCard.tsx`
- `packages/chat/src/react/components/ToolCard.tsx`
- `packages/chat/src/react/components/__tests__/MessageRow.display.test.tsx`
- `packages/chat/src/react/components/__tests__/QuestionForm.test.tsx`
- `packages/chat/src/react/components/__tests__/TodoCard.l199.characterization.test.tsx`
- `packages/chat/src/react/components/__tests__/TodoCard.test.tsx`
- `packages/chat/src/react/components/__tests__/ToolCard.long-chat-memory.test.tsx`
- `packages/chat/src/react/components/__tests__/ToolCard.test.tsx`
- `packages/chat/src/react/features/chat-pane/__tests__/styles-tool-row-chevron.test.ts`
- `packages/chat/src/react/features/chat-pane/styles.ts`

Pads removed:

- `packages/admin/src/forms/react/components/FormFieldRow.tsx`: `FieldIdCell`, `FieldLabelCell`, `FieldTypeCell`, `FieldRequiredCell`, `FieldMaxLengthCell`, `FieldSettingsCell`, `FieldRemoveCell`, `FormFieldRow`.
- `packages/admin/src/forms/react/components/FormsListParts.tsx`: `FormsListHeader`, `FormsListDeleteDialog`.
- `packages/chat/src/react/components/QuestionForm.tsx`: none; framework ref and lowercase pads retained.

Over 500 lines (continued):

- `packages/chat/src/react/components/ToolCard.tsx`: 576 lines.
- `packages/chat/src/react/components/__tests__/ToolCard.test.tsx`: 1165 lines.
- `packages/chat/src/react/features/chat-pane/styles.ts`: 2035 lines.
- `packages/chat/src/react/components/__tests__/QuestionForm.test.tsx`: 764 lines.

## J-ARGS-CHAT — refactor(chat): convert three question-value functions

Done: 3 functions converted, 8 calls updated in 3 source files. No tests or test literals changed. These exports are internal to `QuestionForm.values.ts`, with no re-export through the explicit React entry; changeset `.changeset/jy-cls-j-args-chat.md` is `@jini-ai/chat` patch. No public API break. No skipped functions. Diff-review deletions: none.

Signatures (bodies unchanged except named call repoints):

- `canonicalizeQuestionValue({ q, value }: { q: QuestionFormType['questions'][number]; value: string | string[] }, _optional = {})`
- `questionValueIsKnown({ q, value }: { q: QuestionFormType['questions'][number]; value: string }, _optional = {})`
- `customInputCharCount({ value, placeholder }: { value: string; placeholder: string }, _optional = {})`

Files touched:

- `packages/chat/src/react/components/QuestionForm.answers.hooks.ts`
- `packages/chat/src/react/components/QuestionForm.values.ts`
- `packages/chat/src/react/components/QuestionFormField.tsx`

## J-01 — refactor(ui): unexport InfoTip internals

Done: removed 4 export keywords (`ABOVE_HEADROOM_PX`, `MAX_BUBBLE_WIDTH_PX`, `EDGE_MARGIN_PX`, `InfoTipLine`) in `packages/ui/src/features/admin-widgets/components/InfoTip.rules.ts`. Behaviour identical. Named greps show only local code uses; external test mentions of the headroom name are comments, as the sheet anticipates. None appears in the UI API baseline. No tests, changeset or public signature change. Diff-review deletions: none.

## J-02 — refactor(ui): keep annotation drawing constants local

Done: removed 3 export keywords (`TEXT_FONT_FRACTION`, `TEXT_LINE_HEIGHT`, `TEXT_MIN_FONT_PX`) and deleted the unused `TEXT_FONT_FAMILY` declaration in `packages/ui/src/renderers/annotation-canvas/drawing.ts`. Retained the theme import and the existing doc comment. Behaviour identical. Named greps show only local uses; no names appear in the UI API baseline. No tests, changeset or public signature change. Diff-review deletions: none beyond the sheet-required unused declaration.

## Final diff review

All 145 changed tracked files belong to the seven sheets or their exact-grep caller/selector closure. The 119 files containing only class changes match the reviewed literal/selector substitutions exactly. The remaining diffs were reviewed for only the named prose, argument/call conversions, component-pad removal and internal-export edits. No out-of-scope tracked edits, new helpers, dependencies, types, casts, suppressions, tests, package manifests, API baselines, catalog or history edits. Diff-review deletions: none beyond the sheet-required unused `TEXT_FONT_FAMILY` line. Five job-prefixed changesets plus these two root reports are new. No tests, builds, type checks, linters, installs, generation or git mutations were run.
