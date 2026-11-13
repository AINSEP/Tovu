### jini:packages/ui/src/features/version-manager/react/hooks/useVersionManager.ts
- **Over:** `useVersionManager` 236 (file 313)
- **Phase:** now · **Batch:** size-45
- **Tests:** `packages/ui/src/features/version-manager/__tests__/react/hooks/useVersionManager.test.tsx`; smoke `packages/ui/src/features/version-manager/__tests__/react/components/VersionManagerModal.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `contentCacheRef`, `inFlightRef`, `primeVersionContent` | dedupe-primed version content cache |
| B | `describeVersion`, `visibleVersions` | searchable version labels |
| C | selection `useEffect(() => {` (~L224) | load content for the selected version |
| D | `previewDocument`, `loadedPreviewDocument` state, `frameReady`, safety-net `useEffect` (~L276) | preview iframe readiness |
| E | `restore` | restore a version |
| F | `openInNewTab` | open-in-new-tab action |
| G | state, `loadVersions` + effect, derived flags, return | state machine core (stays) |

- **Splits** (same file, above the hook, in this order):
  1. SUB-HOOK `useVersionContentCache<TVersion>({ port, fileRef }: UseVersionContentCacheInput<TVersion>): { contentCacheRef, primeVersionContent }` ← unit A (with "Primes the content cache…" comment).
  2. SUB-HOOK `useVisibleVersions<TVersion>({ versions, versionById, search, showSearch, tRef, locale }: UseVisibleVersionsInput<TVersion>): { describeVersion, visibleVersions }` ← unit B.
  3. SUB-HOOK `useSelectedVersionContent({ selectedId, contentCacheRef, primeVersionContent, preserveErrorOnNextSelectionRef, tRef, setSelectedContent, setSelectedContentVersionId, setLoadingContent, setError }: UseSelectedVersionContentInput): void` ← unit C (effect body + deps verbatim).
  4. SUB-HOOK `usePreviewFrame<TVersion>({ selectedContent, port, fileRef }: UsePreviewFrameInput<TVersion>): { previewDocument, frameReady, setLoadedPreviewDocument }` ← unit D (comment "Safety net…" moves). The `loadedPreviewDocument` `useState` moves into it.
  5. SUB-HOOK `useRestoreVersion<TVersion>({ … every name in `restore`'s uses … }: UseRestoreVersionInput<TVersion>): () => Promise<void>` ← `restore` verbatim with deps.
  6. SUB-HOOK `useOpenInNewTab<TVersion>({ port, loadingContent, selectedContentMatchesVersion, selectedContent, selectedVersion, fileRef }): <existing type>` ← unit F.
- **Importers to update:** none.
- **After:** `useVersionManager` ~85; file ~370.
- **Risks / notes:** EFFECT ORDER must stay: tRef effect → loadVersions effect → selection effect → preview safety-net effect. Call `useSelectedVersionContent` right after the loadVersions effect and `usePreviewFrame` before it only for its `useState`/`useMemo`; the safety-net effect is inside `usePreviewFrame`, so call `usePreviewFrame` AFTER `useSelectedVersionContent` and compute nothing that the earlier code reads from it — check `restoreDisabled` does not read `previewDocument` (it does not, per outline). `loadedPreviewDocument` state slot moves later (harmless).
