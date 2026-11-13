### jini:packages/chat/src/react/features/chat-pane/hooks/useChatPaneWorkingDirectory.hooks.ts
- **Over:** `useChatPaneWorkingDirectory` 160
- **Phase:** now · **Batch:** size-12
- **Tests:** `src/react/features/chat-pane/__tests__/hooks/useChatPaneWorkingDirectory.test.tsx`; smoke any `useChatPane` hook test that renders the pane. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | `controlled`, the 5 `useState`s, `operation`, `observedDirectoryRef`, `workingDirectory`, `reportWorkingDirectory`, `reportFailure`, `clearWorkingDirectory`, return | directory state |
| B | effect `useEffect(() => {` ~L72 (52 lines) | validate/observe the current directory and load recents |
| C | `openWorkingDirectoryPicker`, `pickWorkingDirectory`, `selectRecentDirectory` | user actions that call the native picker |

- **Splits:**
  1. SUB-HOOK `useWorkingDirectorySync({ options, workingDirectory, operation, observedDirectoryRef, reportWorkingDirectory, setWorkingDirectoryError, setWorkingDirectoryInvalid, setWorkingDirectoryPending, setRecentDirectories }: UseWorkingDirectorySyncInput): void` ← the L72 effect verbatim (pass exactly the names in its dependency array/body; the outline lists them).
  2. SUB-HOOK `useWorkingDirectoryActions({ options, operation, workingDirectory, recentDirectories, reportWorkingDirectory, reportFailure, setWorkingDirectoryError, setWorkingDirectoryPending, setWorkingDirectoryInvalid, setRecentDirectories }: UseWorkingDirectoryActionsInput): { openWorkingDirectoryPicker; pickWorkingDirectory; selectRecentDirectory }` ← the three `useCallback`s verbatim, same order and deps.
  Both module level above the main hook, called at the original positions (sync before actions).
- **Importers to update:** none.
- **After:** `useChatPaneWorkingDirectory` ~45; `useWorkingDirectorySync` ~58; `useWorkingDirectoryActions` ~70; file ~200.
- **Risks / notes:** `clearWorkingDirectory` stays in the main hook (it follows the actions; keep its position after the actions call). Setters are stable, so passing them adds no deps.
