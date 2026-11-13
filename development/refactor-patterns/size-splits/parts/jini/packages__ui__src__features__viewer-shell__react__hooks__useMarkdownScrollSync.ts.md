### jini:packages/ui/src/features/viewer-shell/react/hooks/useMarkdownScrollSync.ts
- **Over:** `useMarkdownScrollSync` 126 (file 147)
- **Phase:** now · **Batch:** size-40
- **Tests:** `packages/ui/src/features/viewer-shell/__tests__/react/hooks/useMarkdownScrollSync.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `clearProgrammaticScrollSoon`, `getEditorBlockOffsets`, `applyScrollSync`, `scheduleScrollSync` | compute and apply one frame-batched pane sync |
| B | refs, `blockLines`, invalidation/cleanup effects, `shouldIgnoreScroll`, scroll handlers, `activatePane`, resync effect | pane event wiring (stays) |

- **Splits:**
  1. SUB-HOOK (same file, above) `useScrollSyncScheduler({ mode, sourceText, editorRef, previewRef, previewSelector, blockLines, editorBlockOffsetsRef, scrollSyncFrameRef, programmaticScrollClearFrameRef, pendingScrollSyncRef, programmaticScrollRef }: UseScrollSyncSchedulerInput): (sourcePane: MarkdownScrollPane, targetPane: MarkdownScrollPane) => void` (use `scheduleScrollSync`'s exact existing parameter list) ← the four `useCallback`s of unit A in order, with deps verbatim; returns `scheduleScrollSync`.
- **Importers to update:** none.
- **After:** `useMarkdownScrollSync` ~62; file ~165.
- **Risks / notes:** refs stay declared in the main hook (the cleanup and resync effects need them) and are passed in. useCallback slot order unchanged (the four were contiguous).
