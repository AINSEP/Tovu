### jini:packages/chat/src/react/hooks/assistant-chats.ts
- **Over:** `createAssistantChatsClient` 382 · nested `useAssistantChats` 279 (file 397, not over)
- **Phase:** now · **Batch:** size-12 · **Executor:** Fable/Opus suggested (hook order + ~15 refs shared across callbacks)
- **Package entry:** `src/react/index.ts` re-exports `createAssistantChatsClient` — stays in this file; returned `AssistantChatsClient` shape unchanged.
- **Tests:** `src/react/hooks/__tests__/assistant-chats.pure.cov-j2.test.ts`, every test using `src/react/hooks/__tests__/assistant-chats.fixtures.ts` (`rg -l assistant-chats.fixtures src`). No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements (inside the factory) | job |
|---|---|---|
| A save retry | `SAVE_RETRY_DELAYS_MS`, `isTransient`, `isPermanent`, `SaveOutcome`, `AttemptResult`, `giveUpOutcome`, `handleSaveFailure`, `attemptSave`, `saveWithRetry` | write one message with bounded retry (needs `ports`) |
| B pure | `summarizeFlushOutcomes`, `resolveRememberedConversation`, `forgetRemembered` | pure decisions (no `ports`) |
| C list | `conversations` state, `listSeqRef`, `pendingRenamesRef`, `renameVersionRef`, `conversationsRef` + its effect, `refresh`, `markListMutated` | the conversation list and stale-snapshot guard |
| D persistence | `writtenRef`, `messagePendingRef`, `runStubWrittenRef`, `runStubPendingRef`, `saveTrackedMessage`, `flush`, `persistUserTurn`, `persistRunStub` | write messages/run stubs once, in order |
| E adoption | `adoptingRef`, `adoptionGenRef`, `resetAdoption` | invalidate an in-flight lazy creation (`ensureConversationId` stays in F: it needs `markListMutated`/`commitActiveId`, declared later) |
| F hook core (stays) | refs `portRef`…`disposedRef`, active/pane state, `commitActiveId`, `select`, mount effect, `create`, `remove`, `rename`, `onMessagesChange`, `actions`, return | which chat is open |

- **Splits** (all in this file, module level, above the factory, in this order):
  1. Move `type SaveOutcome`, `type AttemptResult` and unit B to module level verbatim (they read no factory locals). The factory's `@file` doc block moves to the top of the file as the file header.
  2. `createSaveRetry({ ports }: CreateSaveRetryInput): { giveUpOutcome; handleSaveFailure; attemptSave; saveWithRetry }` ← unit A verbatim (inner functions keep their positional signatures; `SAVE_RETRY_DELAYS_MS` and its long "why" doc move inside it). Factory: `const { giveUpOutcome, handleSaveFailure, attemptSave, saveWithRetry } = createSaveRetry({ ports });`.
  3. Hook body → module-level `useAssistantChatsState({ port, ports, saveWithRetry }: UseAssistantChatsStateInput, { lastConversation }: UseAssistantChatsStateOptions = {}): AssistantChatsState`; the factory's inner `useAssistantChats(port, { lastConversation })` becomes a one-line call (keep its `@param` doc on it). Use the existing return type of the inner hook (`ReturnType` of the returned `useAssistantChats` in `AssistantChatsClient`; export that type from where it lives if needed, never loosen).
  4. SUB-HOOKS called from `useAssistantChatsState` at the position of their first statement:
     - `useConversationList({ portRef }: UseConversationListInput): { conversations; setConversations; conversationsRef; pendingRenamesRef; renameVersionRef; refresh; markListMutated }` ← unit C (the `useState` and the two refs move, comments with them).
     - `useMessagePersistence({ portRef, ports, saveWithRetry, disposedRef, activeIdRef, refresh }: UseMessagePersistenceInput): { writtenRef; messagePendingRef; saveTrackedMessage; flush; persistUserTurn; persistRunStub }` ← unit D refs + the four callbacks (verbatim deps).
     - `useAdoptionGuard(): { adoptingRef; adoptionGenRef; resetAdoption }` ← unit E (the two refs with their comments + `resetAdoption`), called where `adoptingRef` was declared (~L398), before `select` and the mount effect use them. No inputs.
     - `useConversationMutations({ portRef, activeIdRef, switchSeqRef, paneNonceRef, writtenRef, conversations, conversationsRef, pendingRenamesRef, renameVersionRef, setConversations, setInitialMessages, setPaneKey, commitActiveId, resetAdoption, markListMutated, refresh }: UseConversationMutationsInput): { create; remove; rename }` ← the `create`, `remove`, `rename` `useCallback`s verbatim (pass exactly the names their bodies use per the outline), called where `create` stood (after the mount effect).
- **Importers to update:** none (only the factory is exported).
- **After:** `createAssistantChatsClient` ~25; `useAssistantChatsState` ~95; `createSaveRetry` ~75; sub-hooks list ~35 / persistence ~80 / adoption ~12 / mutations ~65; file ~440.
- **Risks / notes:** React hook call order changes (refs/state move into sub-hooks) — harmless across a code change, but every `useEffect` must still run in the original relative order: `disposedRef` effect → `conversationsRef` mirror → mount list read. Callbacks that `useCallback` over a ref keep identical dependency arrays. Refs declared before use: `activeIdRef`, `disposedRef`, `portRef` stay in the core and are created before the sub-hooks that take them are called (`useMessagePersistence` is called after `refresh` exists, i.e. right after `useConversationList`).
