### jini:packages/ui/src/features/viewer-shell/react/components/CommentSidePanel.tsx
- **Over:** `CommentSidePanel` 104 (file 490 — near the limit)
- **Phase:** now · **Batch:** size-45
- **Tests:** `packages/ui/src/features/viewer-shell/__tests__/react/components/CommentSidePanel.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `ToggleFocusTarget`, `useCollapseToggleFocus`, `useCommentTimestampFormatter`, and in the component `const t`…`useCollapseToggleFocus(...)` (~L92-104) | panel state/hooks |
| B | `CommentSidePanel` collapsed branch + JSX | render (stays) |
| C | `CommentSideRail`, `CommentSideHeader`, `CommentSideItem` (+ class helpers, attachments), `CommentSideSelectBar`, `CommentSideCreateForm` | sub-components (stay) |

- **Splits:**
  1. NEW `CommentSidePanel.hooks.ts` (same folder) — job: panel state. Moves `ToggleFocusTarget`, `useCollapseToggleFocus` (with its "Moves focus onto whichever…" comment), `useCommentTimestampFormatter`; adds `useCommentSidePanel({ comments, selectedIds, onReorder, formatTimestamp, collapsed, onCollapsedChange, useCommentReorderHook }: UseCommentSidePanelInput): { t, newCommentDraft, setNewCommentDraft, reorder, visibleSelectedIds, selectedCount, commentsLabel, panelId, formatTs, collapsedRailRef, expandedToggleRef, handleCollapsedChange }` ← statements `const t = useT();` through the `useCollapseToggleFocus` destructure (orderedIds stays internal). None of the moved hooks are exported today → no importers.
- **Importers to update:** none.
- **After:** `CommentSidePanel` ~88; file ~440; hooks file ~70.
- **Risks / notes:** `useCommentReorderHook` is a prop seam — pass the prop value in; keep hook call order identical (`useT`, `useState`, reorder, `useId`, formatter, collapse focus).
