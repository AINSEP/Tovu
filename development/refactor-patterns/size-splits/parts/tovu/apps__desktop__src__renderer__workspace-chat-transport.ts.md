### tovu:apps/desktop/src/renderer/workspace-chat-transport.ts
- **Over:** `createWorkspaceChatTransport` 101 (file 303, under)
- **Phase:** after-move (MIXED) · **Batch:** size-49
- **Tests:** `apps/desktop/src/renderer/workspace-chat-transport.test.ts`, `use-workspace-chat-transport.hooks.render.test.ts`, `App.hooks.test.ts`, `use-site-actions.hooks.test.ts` (renderer runner). No mocks of the module.
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | body of the `bridge.onChatEvent((message) => { … })` callback | route one pushed chat message to its subscription (event → `applyRunEvent`; non-terminal close → error; close → settle + forget) |
| B | `records`, `offChatEvent` registration, `open`, `detach`, returned `startRun` / `reattachRun` / `fetchRunStatus` / `stopRun` / `dispose` | the transport (stays) |

- **Splits:**
  1. HELPER (same file, module level, directly above `createWorkspaceChatTransport`, below `wireCancelSignal`): `routeChatEventMessage({ records, message }: RouteChatEventMessageInput): void` ← the callback body verbatim (both error strings byte-identical; early `return`s unchanged). `RouteChatEventMessageInput = { records: Map<string, SubscriptionRecord>; message: WorkspaceChatEventMessage }`. In the function: `const offChatEvent = bridge.onChatEvent((message: WorkspaceChatEventMessage) => routeChatEventMessage({ records, message }));` — the "One listener per transport instance" comment stays above it.
- **Importers to update:** none (no export moves).
- **After:** `createWorkspaceChatTransport` ~84; `routeChatEventMessage` ~20; file ~306.
- **Risks / notes:** the callback must still return `undefined` (the arrow returns the helper's `void`). After-move: survey says MIXED — the payload translators (`translate*`, `payloadTranslators`, `applyRunEvent`) are the generic `@jini-ai/protocol` → `@jini-ai/chat` mapping likely to move; this split touches only the transport factory, so it still holds after that move.
