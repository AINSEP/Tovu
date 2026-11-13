### jini:packages/chat/src/react/hooks/useRunStream.ts
- **Over:** `useRunStream` 117
- **Phase:** now (JINI 117) · **Batch:** size-28
- **Tests:** `src/react/hooks/__tests__/useRunStream.test.ts`, `useRunStream.checkpoint.cov-j2.test.ts`, `useConversation.test.ts`, `durable-run-hooks.test.ts`, `src/react/__tests__/index.test.ts`, `src/core/__tests__/durable-run-subscription.paths.unit.test.ts` (package `@jini-ai/chat`). No test mocks the module.
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | state, refs, `teardownSubscription`, unmount effect | lifecycle (stays) |
| B | `const makeHandlers = useCallback((generation: number): RunHandlers => { … }, [])` body | turn transport callbacks into stream-state updates for one generation |
| C | `start`, `reattach`, `cancel`, `reset`, `return` | run controls (stays) |

- **Splits:**
  1. HELPER in the same file, module level, directly above `useRunStream`: `function runHandlersFor({ generation, generationRef, runIdRef, setState }: RunHandlersForInput): RunHandlers`, with `interface RunHandlersForInput { generation: number; generationRef: { current: number }; runIdRef: { current: string | null }; setState: Dispatch<SetStateAction<RunStreamState>> }`. Body = the current `makeHandlers` callback body verbatim (`const isStale = …` through the returned object with `onCheckpoint`, `onEvent`, `onToolInputDelta`, `onError`, `onDone`).
  2. `makeHandlers` becomes `const makeHandlers = useCallback((generation: number): RunHandlers => runHandlersFor({ generation, generationRef, runIdRef, setState }), []);` (deps stay `[]`).
  - Add `type Dispatch, type SetStateAction` to the react import.
- **Importers to update:** none.
- **After:** `useRunStream` ~85; `runHandlersFor` ~32; file ~165 counted.
- **Risks / notes:** the refs are passed by object, never by `.current` value, because `isStale` has to read `generationRef.current` when the callback fires. `setState` from `useState` is stable, so `[]` deps stay correct. The long `canceledGenerations` doc comment and the other ref comments stay where they are.
