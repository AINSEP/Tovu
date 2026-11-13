### tovu:apps/admin/src/features/media/hooks/use-media.hooks.ts
- **Over:** `useMedia` 156 (file 208, under)
- **Phase:** now (?) · **Batch:** size-02
- **Tests:** `apps/admin/src/features/media/__tests__/use-media.hooks.unit.test.tsx`, `media-screen-states.unit.test.tsx`, `media-agent-drive.unit.test.tsx`, `Media.unit.test.tsx` (same folder), `apps/admin/src/hooks/__tests__/content-refresh-coverage.unit.test.ts`
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `uploadMutation`, `trashMutation`, `purgeMutation`, `restoreFallback`, `restoreMutation`, `writes`, `clearOtherWriteErrors` | the four write mutations + "clear the others' errors" |
| B | `altDraft`, `fileInputRef`, `uploadInFlight`, `uploading`, `selectedFileName`, `uploadOpen`, `readError`, `onFileChange`, `upload`, `openUpload`, `uploadFailure`, `uploadError` | upload dialog flow |
| C | `pendingPurge`, `rowSavingId`, `trash`, `restore`, `purge` | per-row trash/restore/purge |
| D | `list`, `invalidate*`, refresh subscription, `editingId`, `lightboxIndex`, `orderBy`, `toggleEditing`, `onMetadataSaved`, `media`, `error`, return | list + screen state (stays) |

- **Splits** (same file, module level, above `useMedia`, in run order):
  1. SUB-HOOK `useMediaWrites({ port, list, locale }: UseMediaWritesInput): { uploadMutation; trashMutation; purgeMutation; restoreMutation; restoreFallback: string; clearOtherWriteErrors: (active: { reset: () => void }) => void }` ← `const uploadMutation = useFetchMutation({` through `function clearOtherWriteErrors(` (keep its "Clears the OTHER writes' failures" comment). Types: mutation types are whatever `useFetchMutation` infers — return them via `ReturnType` of the existing calls only if inference fails; prefer an inferred return type (no explicit annotation) for this sub-hook.
  2. SUB-HOOK `useMediaUpload({ uploadMutation, clearOtherWriteErrors, locale }: UseMediaUploadInput): { altDraft; setAltDraft; fileInputRef; uploading; selectedFileName; uploadOpen; setUploadOpen; onFileChange; upload; openUpload; uploadError }` ← the `altDraft`, `fileInputRef`, `uploadInFlight`, `uploading`, `selectedFileName`, `uploadOpen`, `readError` declarations (with the FileReader comment), `const onFileChange = useCallback(`, `async function upload(`, `function openUpload(`, `const uploadFailure =`, `const uploadError =` (with its comment).
  3. SUB-HOOK `useMediaRowActions({ trashMutation, restoreMutation, purgeMutation, clearOtherWriteErrors }: UseMediaRowActionsInput): { pendingPurge; setPendingPurge; rowSavingId; trash; restore; purge }` ← `const [pendingPurge, …`, `const [rowSavingId, …`, `async function trash(`, `async function restore(`, `async function purge(`.
  4. `useMedia` keeps: `list`, `invalidate`, `invalidateList` (+comment), `useContentRefreshSubscription`, `editingId`, `lightboxIndex`, `orderBy` (+comment), the three sub-hook calls (writes → upload → row actions), `toggleEditing`, `onMetadataSaved`, `media`, `error = visibleMediaError({…})`, return.
- **Importers to update:** none (no export moves).
- **After:** file ~225; `useMedia` ~70; `useMediaUpload` ~55; others ≤ 45.
- **Risks / notes:** `useMediaWrites` must be called before `useMediaUpload`/`useMediaRowActions` (they take its outputs); state hook order changes by grouping only. `upload`'s synchronous `uploadInFlight` guard and its comment move intact.
