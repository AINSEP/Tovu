### jini:packages/chat/src/react/hooks/useConversation.ts
- **Over:** `useConversation` 145
- **Phase:** now (JINI 145) · **Batch:** size-28
- **Tests:** `src/react/hooks/__tests__/useConversation.test.ts`, `useConversation.retry-race.cov-j2.test.ts`, `secret-redaction.test.tsx`, `durable-run-hooks.test.ts`, `src/react/features/chat-pane/__tests__/hooks/useChatPane.refresh.test.tsx`, `src/react/components/__tests__/MessageList.test.tsx`, `src/react/__tests__/index.test.ts` (package `@jini-ai/chat`). No test mocks the module.
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | destructure, `useState`s, `run`, refs, `setMessages` | state (stays) |
| B | `useEffect(() => { const source = options.refreshSignal; …` | refresh from saved messages on focus/visibility |
| C | `const initialMessagesRef = …` + `useEffect(() => { const last = initialMessagesRef.current?.at(-1); …` | resume an interrupted run on mount |
| D | `const applyRunToAssistantMessage = useCallback(…)` + `useEffect(() => { applyRunToAssistantMessage(); }, …)` | reconcile live run events onto the assistant bubble |
| E | `sendMessage`, `retry`, `cancel`, `acknowledgeScroll`, `suppressScroll`, `return useMemo(…)` | actions + result (stays) |

- **Splits** (SUB-HOOKS in the same file, module level, above `useConversation`, in this order; each is called from `useConversation` at the exact spot its statements were, so hook call order is unchanged):
  1. `function useSavedMessagesRefresh({ refreshSignal, isStreaming, setMessagesState }: UseSavedMessagesRefreshInput): void` ← unit B with its `// Map upserts preserve order …` comment. Input type: `{ refreshSignal: UseConversationOptions['refreshSignal']; isStreaming: boolean; setMessagesState: Dispatch<SetStateAction<ChatMessage[]>> }`. Body: `const source = refreshSignal; if (!source || isStreaming) return undefined;` …, deps `[refreshSignal, isStreaming]`. Call: `useSavedMessagesRefresh({ refreshSignal: options.refreshSignal, isStreaming: run.isStreaming, setMessagesState });`.
  2. `function useResumeInterruptedRun({ initialMessages, activeAssistantIdRef, run }: UseResumeInterruptedRunInput): void` ← unit C: `const initialMessagesRef = useRef(initialMessages);` plus the mount-only effect. Move both long doc comments word for word (the `initialMessagesRef` one and the "Resumes an interrupted run on mount…" one), and the in-effect "Mount-only: see this effect's own doc…" comment. Deps stay `[]`. Input type: `{ initialMessages: UseConversationOptions['initialMessages']; activeAssistantIdRef: { current: string | null }; run: UseRunStreamResult }`.
  3. `function useAssistantRunReconciliation({ run, activeAssistantIdRef, setMessagesState, setScrollIntent }: UseAssistantRunReconciliationInput): void` ← unit D: the `applyRunToAssistantMessage` callback (deps `[run.events, run.runId, run.status]`, with its coverage "plain if/else chain" comment) and its effect (with the "Reconcile the live run's events…" comment, deps `[run.events, run.status, run.runId]`). `setScrollIntent: Dispatch<SetStateAction<boolean>>`.
  - Add `type Dispatch, type SetStateAction` to the react import and `type UseRunStreamResult` to the `./useRunStream.js` import.
- **Importers to update:** none (nothing new is exported).
- **After:** `useConversation` ~88; sub-hooks ~20 / ~12 / ~32; file ~250 counted.
- **Risks / notes:** the dependency arrays have to stay exactly as they are, including the deliberately omitted `run` in the mount effect and `setMessagesState`, which isn't listed (it's stable). Don't "fix" these for lint. `activeAssistantIdRef` is the same ref object passed down; the reattach effect must still set `.current` before calling `run.reattach`. The existing `m.runStatus!` and `messagesRef.current[idx]!` are moved code, so they stay as they are.
