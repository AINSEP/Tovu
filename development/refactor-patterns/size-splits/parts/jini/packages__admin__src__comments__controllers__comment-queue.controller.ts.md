### jini:packages/admin/src/comments/controllers/comment-queue.controller.ts
- **Over:** `createCommentQueueController` 146
- **Phase:** now · **Batch:** size-38
- **Tests:** `packages/admin/src/comments/__tests__/comment-queue.controller.unit.test.ts`, `packages/admin/src/comments/__tests__/comments-surface.unit.test.ts` (pkg `@jini-ai/admin`)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `let firstPage`, `let morePages`, `let firstError`, `let moreError`, `let pageGeneration`, `let loadingMore`, `publishPages`, `resetMorePages`, `setStatus`, `settleFirstPage`, `isCurrentRead`, `readMorePage`, `loadMore` | page one + cursor-page accumulation (all six `let`s are read only by these) |
| B | `store`, `let permissions`, `busyRowIds`, `patchRowState`, `reloadAfterAction`, `stateFor`, `configure`, `onModerate`, `setPendingPurge`, `onPurge`, `dispose`, return | controller shell + row actions |

- **Splits:**
  1. HELPER `createQueuePaging({ store, api, getT }: CreateQueuePagingInput, { loadPage }: CreateQueuePagingOptions = {}): { publishPages(): void; resetMorePages(): void; setStatus: typeof setStatus; settleFirstPage: typeof settleFirstPage; loadMore: typeof loadMore; supersedeReads(): void }` — module level, above `createCommentQueueController`. Body = unit A statements verbatim, from `let firstPage: AdminCommentsQueuePage | null = null;` through `async function loadMore(` (keep the `resetMorePages` and `isCurrentRead` why-comments). Every read of `t` inside becomes `getT()` (because `configure` reassigns `t`). `supersedeReads()` = `pageGeneration++;` (the line `dispose` uses). `store` type: the `createControllerStore<CommentQueueState>` return type (use `ReturnType<typeof createControllerStore<CommentQueueState>>` only if no exported store type exists; check `createControllerStore`'s module for an exported `ControllerStore<T>` type first). `loadPage` type copied from the controller's optional param.
  2. In `createCommentQueueController`: after `let permissions = initialPermissions;` add `const paging = createQueuePaging({ store, api, getT: () => t }, { loadPage });` and destructure `{ publishPages, resetMorePages, setStatus, settleFirstPage, loadMore }`. `dispose` replaces `pageGeneration++;` with `paging.supersedeReads();`. Return object unchanged.
- **Importers to update:** none (no export moves).
- **After:** file ~160; `createCommentQueueController` ~65; `createQueuePaging` ~85.
- **Risks / notes:** statement order inside unit A must stay (closure `let`s initialised before functions run). `t` must be read through `getT()` everywhere in A (publishPages, loadMore catch) or a locale switch publishes stale copy. `busyRowIds` lock comment stays with `busyRowIds` in the controller.
