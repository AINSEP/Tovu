# jy-pads refresh handoff

Base: merge-6 `d3e78b387`. No sheet stopped in full. Runtime verification and named mutations remain for combine.

## J10 stopped anchors

- `packages/admin/src/comments/PORT.md:150`: historical artifact path locators retained; original line retained.
- `packages/admin/src/forms/PORT.md:33`: retained compatibility class literal; original line retained.
- `packages/admin/src/seo/PORT.md:25`: retained compatibility class literal; original line retained.

## J-PADS skipped items

- `packages/admin/src/comments/react/components/SettingsFields.tsx:35` `CommentsLimitFields`: hard limit: 68 lines, complexity 2.
- `packages/admin/src/forms/react/components/FormFieldRow.tsx:8` `FieldIdCell`: parallel ownership exclusion.
- `packages/admin/src/forms/react/components/FormFieldRow.tsx:26` `FieldLabelCell`: parallel ownership exclusion.
- `packages/admin/src/forms/react/components/FormFieldRow.tsx:40` `FieldTypeCell`: parallel ownership exclusion.
- `packages/admin/src/forms/react/components/FormFieldRow.tsx:67` `FieldRequiredCell`: parallel ownership exclusion.
- `packages/admin/src/forms/react/components/FormFieldRow.tsx:85` `FieldMaxLengthCell`: parallel ownership exclusion.
- `packages/admin/src/forms/react/components/FormFieldRow.tsx:107` `FieldSettingsCell`: parallel ownership exclusion.
- `packages/admin/src/forms/react/components/FormFieldRow.tsx:136` `FieldRemoveCell`: parallel ownership exclusion.
- `packages/admin/src/forms/react/components/FormFieldRow.tsx:156` `FormFieldRow`: parallel ownership exclusion.
- `packages/admin/src/forms/react/components/FormFieldsTableParts.tsx:3` `FormFieldsTableHead`: hard limit: 54 lines, complexity 1.
- `packages/admin/src/forms/react/components/FormSubmissionDetail.tsx:21` `FormSubmissionDetail`: hard limit: 86 lines, complexity 4.
- `packages/admin/src/forms/react/components/FormsListParts.tsx:12` `FormsListHeader`: parallel ownership exclusion.
- `packages/admin/src/forms/react/components/FormsListParts.tsx:92` `FormsListDeleteDialog`: parallel ownership exclusion.
- `packages/admin/src/react/components/ConfirmDialog/ConfirmDialog.tsx:129` `ConfirmDialog`: hard limit: 60 lines, complexity 3.
- `packages/admin/src/seo/react/components/SitemapModal.tsx:201` `SitemapModal`: hard limit: 56 lines, complexity 1.
- `packages/admin/src/widgets/react/components/RegionPlacementRow.tsx:7` `RegionPlacementRow`: hard limit: 63 lines, complexity 3.
- `packages/admin/src/widgets/react/components/WidgetPageHeaders.tsx:12` `WidgetRegionsHeader`: hard limit: 62 lines, complexity 3.
- `packages/admin/src/widgets/react/components/WidgetPageHeaders.tsx:119` `WidgetInstanceEditorHeader`: hard limit: 56 lines, complexity 5.
- `packages/user-management/src/admin/react/components/UserRow.tsx:4` `UserRow`: parameter spelling outside named deletion variants.
- `packages/user-management/src/admin/react/tabs/UsersTab.tsx:4` `UsersTab`: parameter spelling outside named deletion variants.

## J-ARGS skipped items

- `createBackupPusher` (`packages/agent-plugins/github/source-control/backup-push.mjs`): declaration hard limit: 160 lines (single scalar plus an existing optional pad).
- `createFileWriter` (`packages/agent-plugins/github/source-control/write-files.mjs`): declaration hard limit: 206 lines (single scalar plus an existing optional pad).
- `packagedAmrExecutable` (`packages/agent-runtime/src/defs/amr/executable-resolution.ts`): table-bound or callback/reference: packages/agent-runtime/src/executables.ts:274: ['amr', packagedAmrExecutable].
- `handleCodexEvent` (`packages/agent-runtime/src/defs/codex/event-stream.ts`): table-bound or callback/reference: packages/agent-runtime/src/json-event-stream.ts:32: ['codex', handleCodexEvent].
- `resolveCodexLaunch` (`packages/agent-runtime/src/defs/codex/launch.ts`): table-bound or callback/reference: packages/agent-runtime/src/launch.ts:13: ['codex', resolveCodexLaunch].
- `handleCursorEvent` (`packages/agent-runtime/src/defs/cursor-agent/event-stream.ts`): table-bound or callback/reference: packages/agent-runtime/src/json-event-stream.ts:31: ['cursor-agent', handleCursorEvent].
- `handleLegacyGoogleStreamEvent` (`packages/agent-runtime/src/defs/gemini/event-stream.ts`): table-bound or callback/reference: packages/agent-runtime/src/json-event-stream.ts:29: ['legacy-google-stream-json', handleLegacyGoogleStreamEvent].
- `handleKimiEvent` (`packages/agent-runtime/src/defs/kimi/event-stream.ts`): table-bound or callback/reference: packages/agent-runtime/src/json-event-stream.ts:30: ['kimi', handleKimiEvent].
- `handleOpenCodeEvent` (`packages/agent-runtime/src/defs/opencode/event-stream.ts`): table-bound or callback/reference: packages/agent-runtime/src/json-event-stream.ts:28: ['opencode', handleOpenCodeEvent].
- `parsePiDefaultModel` (`packages/agent-runtime/src/defs/pi/model-discovery.ts`): table-bound or callback/reference: packages/agent-runtime/src/model-discovery-config.ts:59: ['defaultModel', parsePiDefaultModel].
- `resolveFormTypeEmbeds` (`packages/cms/src/widgets/html-widget-embeds.ts`): table-bound or callback/reference: packages/cms/src/widgets/resolver-service.ts:33: form: resolveFormTypeEmbeds.
- `useSettingsSliceSubscription` (`packages/ui/src/features/panel-kit/hooks/use-settings-slice-refresh.hooks.ts`): table-bound or callback/reference: packages/ui/src/features/panel-kit/hooks/use-settings-slice.hooks.ts:67: useSettingsSliceSubscription = useSettingsSliceSubscriptionDefault.
- `useSettingsSliceChange` (`packages/ui/src/features/panel-kit/hooks/use-settings-slice-save.hooks.ts`): table-bound or callback/reference: packages/ui/src/features/panel-kit/hooks/use-settings-slice.hooks.ts:67: useSettingsSliceChange = useSettingsSliceChangeDefault.
- `useStandingDraftWriter` (`packages/ui/src/features/panel-kit/hooks/use-standing-draft-writes.hooks.ts`): table-bound or callback/reference: packages/ui/src/features/panel-kit/hooks/use-standing-draft-autosave.hooks.ts:178: useStandingDraftWriter: useStandingDraftWriterDefault; packages/ui/src/features/panel-kit/hooks/use-standing-draft-autosave.hooks.ts:185: useStandingDraftWriter.
- `useStandingDraftSchedule` (`packages/ui/src/features/panel-kit/hooks/use-standing-draft-writes.hooks.ts`): table-bound or callback/reference: packages/ui/src/features/panel-kit/hooks/use-standing-draft-autosave.hooks.ts:179: useStandingDraftSchedule: useStandingDraftScheduleDefault; packages/ui/src/features/panel-kit/hooks/use-standing-draft-autosave.hooks.ts:185: useStandingDraftSchedule.
- `useStandingDraftDiscard` (`packages/ui/src/features/panel-kit/hooks/use-standing-draft-writes.hooks.ts`): table-bound or callback/reference: packages/ui/src/features/panel-kit/hooks/use-standing-draft-autosave.hooks.ts:181: useStandingDraftDiscard: useStandingDraftDiscardDefault; packages/ui/src/features/panel-kit/hooks/use-standing-draft-autosave.hooks.ts:185: useStandingDraftDiscard.
- `readSavedWidth` and `saveWidth`: explicit ownership exclusion; not inspected or edited.

## J-ARGS test callers reached by named greps

The function roster did not enumerate test caller files. These existing callers received only the same object-argument conversion; no test cases were added or deleted.

- `packages/ui/src/features/asset-tree-browser/__tests__/react/hooks/useAssetTreeBatchActions.test.ts`
- `packages/ui/src/features/browser-chrome/__tests__/react/hooks/useBrowserBridgeRegistration.test.ts`
- `packages/ui/src/features/browser-chrome/__tests__/react/hooks/useBrowserHistory.test.ts`
- `packages/ui/src/react/__tests__/components/CustomSelect.test.tsx`
- `packages/ui/src/react/__tests__/components/HeaderActionsMenu.test.tsx`
- `packages/ui/src/react/__tests__/components/Toast.test.tsx`

## Combine work

- Run the named cloud mutations, package tests, builds/typechecks and owner-rules-audit; none ran in this job.
- Reconcile API fingerprints for the public UI object signatures and component signatures; the chart symbol deletion is already applied as the single permitted baseline edit.
- Adopt paired host form/preview selectors and perform the named Chrome looks (form narrow width/panels; preview open/backdrop/Escape; chart auto mode).
- Regenerate catalogs only in the coordinator job if needed; this job did not edit catalog.json.
- All Tier-1 roster files and excluded pad files remain untouched.
