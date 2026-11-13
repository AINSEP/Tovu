### jini:packages/ui/src/react/mcp-ui/useMcpUiHost.ts
- **Over:** `useMcpUiHost` 116 (file 155)
- **Phase:** now · **Batch:** size-40
- **Tests:** `packages/ui/src/react/mcp-ui/__tests__/useMcpUiHost.test.tsx`, `packages/ui/src/react/mcp-ui/__tests__/McpUiHost.height.test.tsx` (vi.mocks `../useMcpUiHost.js` with `importOriginal` and overrides `useMcpUiHost` — new helpers stay in the same module and are not exported, so the mock still covers the hook)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `handleCallTool`, `handleOpenLink` | answer the View's tool-call and open-link requests |
| B | rest (state, watchdog, size/error handlers, teardown, `rendererProps`) | host protocol core (stays) |

- **Splits:**
  1. SUB-HOOK (same file, above) `useViewRequestHandlers({ optionsRef, emit }: UseViewRequestHandlersInput): { handleCallTool, handleOpenLink }` ← both `useCallback`s verbatim (typed `NonNullable<AppRendererProps['onCallTool']>` / `['onOpenLink']`). Called where `handleCallTool` was.
- **Importers to update:** none.
- **After:** `useMcpUiHost` ~80; file ~165.
- **Risks / notes:** file header comments are long; none move.
