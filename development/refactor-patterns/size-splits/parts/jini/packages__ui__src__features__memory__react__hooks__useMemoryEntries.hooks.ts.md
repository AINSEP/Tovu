### jini:packages/ui/src/features/memory/react/hooks/useMemoryEntries.hooks.ts
- **Over:** `useMemoryEntries` 254 (file 319, fine)
- **Phase:** now · **Batch:** size-35
- **Tests:** `src/features/memory/__tests__/react/hooks/useMemoryEntries.test.tsx`, `src/features/memory/__tests__/react/hooks/useMemoryConfig.test.ts`, `src/features/memory/__tests__/dependencies.test.ts`, `src/features/memory/__tests__/index.test.ts`, `src/features/memory/__tests__/react/components/MemoryManualEditor.test.tsx`
- **Responsibility map** (all inside `useMemoryEntries`):

| unit | statements | job |
|---|---|---|
| A | `busy`, `busyOperationCountRef` (+comment), `beginBusy`, `endBusy` | overlapping-write busy counter |
| B | `rootDir`, `index`, `entries`, `loadError`, `memoryTree`, `reloadCommitGuardRef` (+comment), `reload`, `filter`, `filtered`, `treeFolders`, `treeChildren` | list/tree load + filtering |
| C | `previewId`, `previewBody`, `previewRequestTokenRef` (+comment), `openPreview` | entry preview |
| D | `editing`/`setEditingState`, `editingRevisionRef` (+comment), `setEditing`, `entrySaveInFlightRef`, `editorRef`, `editorNameRef`, `editingTarget`, `editRequestTokenRef`, the focus `useEffect` on `editingTarget`, `startEdit`, `startNew`, `cancelEdit`, `onSave` | create/edit draft + save |
| E | `indexDraft`, `indexSaveInFlightRef`, `onSaveIndex` | MEMORY.md index draft + save |
| F | `deletingEntryIdsRef`, `onDelete`, `onCopyPath` | stay in `useMemoryEntries` |

- **Splits** (same file, sub-hooks at module level above `useMemoryEntries`, in this order; statements verbatim with their comments; each `useCallback` keeps its exact deps array):
  1. SUB-HOOK `useBusyCounter(): { busy: boolean; beginBusy: () => void; endBusy: () => void }` ← unit A (no input — it takes none, so no input object).
  2. SUB-HOOK `useMemoryEntryList({ port, captureConfigHydrationRevision, hydrateConfig }: UseMemoryEntryListInput): MemoryEntryList` ← unit B. `MemoryEntryList = Pick<MemoryEntriesController, 'entries' | 'filtered' | 'memoryTree' | 'treeFolders' | 'treeChildren' | 'rootDir' | 'index' | 'filter' | 'setFilter' | 'reload'> & { loadError: string | null; setLoadError: Dispatch<SetStateAction<string | null>>; setIndex: Dispatch<SetStateAction<string>> }`. Input types from `MemoryEntriesPort` and `MemoryEntriesCoordination['captureConfigHydrationRevision' | 'hydrateConfig']`.
  3. SUB-HOOK `useMemoryEntryPreview({ port, setLoadError }: UseMemoryEntryPreviewInput): Pick<MemoryEntriesController, 'previewId' | 'previewBody' | 'openPreview'>` ← unit C.
  4. SUB-HOOK `useMemoryEntryEditor({ port, openEditor, closeEditor, fireFlash, setLoadError, reload, beginBusy, endBusy }: UseMemoryEntryEditorInput): Pick<MemoryEntriesController, 'editing' | 'setEditing' | 'editorRef' | 'editorNameRef' | 'startEdit' | 'startNew' | 'cancelEdit' | 'onSave'>` ← unit D.
  5. SUB-HOOK `useMemoryIndexDraft({ port, setIndex, setLoadError, fireFlash, beginBusy, endBusy }: UseMemoryIndexDraftInput): Pick<MemoryEntriesController, 'indexDraft' | 'setIndexDraft' | 'onSaveIndex'>` ← unit E.
  6. `useMemoryEntries` keeps: `coord` destructure; calls in order `useBusyCounter()`, `useMemoryEntryList(...)`, `useMemoryEntryPreview(...)`, `useMemoryEntryEditor(...)`, `useMemoryIndexDraft(...)` (destructure each result into the same local names used today); then `deletingEntryIdsRef`, `onCopyPath`, `onDelete` verbatim; then the same `return { … }` (same 28 keys, same order).
- **Importers to update:** none (no exports move).
- **After:** file ~385; `useMemoryEntries` ~80; `useMemoryEntryEditor` ~90; `useMemoryEntryList` ~60; others ≤ 35.
- **Risks / notes:** hook/state declaration order changes (e.g. `editing` now declared after the list state) — no behavior effect. The focus effect must stay in the same sub-hook as `editorRef`/`editorNameRef`/`editingTarget`. `reload` must be the same stable callback passed to `useMemoryEntryEditor` (it is: defined in the list sub-hook with unchanged deps). If `useMemoryEntryEditor` lands over 100 in `--check`, move `onSave` and `entrySaveInFlightRef` back into `useMemoryEntries` (sub-hook then also returns `editingRevisionRef`) — main stays < 100. No `vi.mock` of this file.
