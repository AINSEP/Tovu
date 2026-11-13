### jini:packages/chat/src/react/features/chat-pane/hooks/useChatPaneRuntimeInventory.hooks.ts
- **Over:** `useChatPaneRuntimeInventory` 134
- **Phase:** now · **Batch:** size-12
- **Tests:** `src/react/features/chat-pane/__tests__/hooks/useChatPaneRuntimeInventory.test.tsx`; smoke `src/react/features/chat-pane/__tests__/components/AgentRuntimePicker.test.tsx`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | constants, interfaces, `useInventoryRetry`, `pendingRetryDelayMs` | retry bookkeeping |
| B (stays) | state, `inventory`/`health`/`retry`, reset effect L79, `loadAgents`, `reloadIfUnanswered`, `refreshStatus`, `rescanAgents`, return | load + expose the inventory |
| C | effect `useEffect(() => {` ~L144 (uses access,retry,loadAgents,refreshStatus,pollIntervalMs,inventory,health) and effect ~L187 (uses access,refreshStatus,reloadIfUnanswered) | poll status/inventory and re-check on wake/visibility |

- **Splits:**
  1. SUB-HOOK `useInventoryPolling({ access, retry, loadAgents, refreshStatus, reloadIfUnanswered, pollIntervalMs, inventory, health }: UseInventoryPollingInput): void` — module level above `useChatPaneRuntimeInventory` (below the constants) ← the two effects verbatim, same order, same dependency arrays, comments with them. Called at the old position (after `refreshStatus`, before `rescanAgents`).
- **Importers to update:** none.
- **After:** `useChatPaneRuntimeInventory` ~78; `useInventoryPolling` ~62; file ~245.
- **Risks / notes:** `inventory`/`health` are `useLatestOperation` results — pass the objects, not their fields, so cleanup cancels the same instances. Effect order is preserved because the sub-hook is called exactly where the effects stood.
