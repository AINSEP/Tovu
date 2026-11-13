### jini:packages/user-management/src/react/members/hooks/use-members.hooks.ts
- **Over:** `useMembers` 109 (file 143)
- **Phase:** now · **Batch:** size-18
- **Tests:** `packages/user-management/src/react/members/__tests__/use-members.hooks.pins.test.ts`, `packages/user-management/src/react/members/__tests__/use-members.ported.test.ts`, `packages/user-management/src/react/members/__tests__/fqfix-disable.unit.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `expandedId`, `detailById` state, `expandedIdRef`, `detailGenerations`, `detailGeneration`, `detailRequest`, `detail`, `detailLoader`, scope-reset `useEffect` (~L132), `detailError`, `detailLoadingId`, detail-cache `useEffect` (~L147), `onToggleDetail` | expanded-row detail panel |
| B | list query, mutations, `rowState`, `confirmingDisable`, refresh subscription, row actions, return | roster + row actions (stays) |

- **Splits:**
  1. SUB-HOOK (same file, above `useMembers`, below `detailLoadingIdFor`) `useMemberDetail({ port, queryScope, scopeRef, detailRoot, translate, describeIfError, error, setRowState, setConfirmingDisable }: UseMemberDetailInput): { expandedId, detailById, setDetailById, detailError, detailLoadingId, onToggleDetail }` ← unit A in order, all comments (C7/N2 ref comment, "Entity keys own settlement…", "Only paint the failure…", "A superseded load…") move verbatim. Call it right after `const [confirmingDisable, …]` so the scope-reset effect still registers before the cache effect and the refresh subscription.
- **Importers to update:** none.
- **After:** `useMembers` ~70; file ~160.
- **Risks / notes:** `useState` order changes: `expandedId`/`detailById` are now created after `confirmingDisable` (harmless on mount). `onDisable` uses `setDetailById` → take it from the sub-hook result.
