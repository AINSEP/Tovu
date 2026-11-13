### jini:packages/chat/src/react/components/A2uiSurfaceCard.tsx
- **Over:** `A2uiSurfaceCard` 130 (`RenderComponent` 99 — at the limit, untouched)
- **Phase:** now · **Batch:** size-11
- **Tests:** `src/react/components/__tests__/A2uiSurfaceCard.test.tsx`, `src/react/components/__tests__/A2uiSurfaceCard.delivery.test.tsx`, `src/react/components/__tests__/A2uiSurfaceCard.registry.test.tsx`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | `RenderComponent`, `A2uiSurfaceCardProps`, `A2uiSurfaceCard` (`t`, `formatLocalActionValue`, `!root` branch, JSX) | render the surface |
| B interpreter | `actionIdCounter` (module `let`), `catalog` memo, `interpreterRef` + init block, `forceRender` + subscribe effect | one interpreter per card, re-render on change |
| C apply events | `SURFACE_ID_KEYS`, `extractSurfaceId`, `appliedCountRef`, `surfaceIdRef`, `refusalNotice` state, the events-apply effect (~L278-315) | feed new agent messages, relay validation refusals |
| D actions | `A2uiAgentActionOutcome`, `isThenable`, `agentActionAttemptRef`, `pendingAgentAction`/`localActionResult`/`deliveryFailureNotice` state, `handleAction` | build + deliver a user action |

- **Splits:**
  1. NEW `A2uiSurfaceCard.hooks.ts` — job: interpreter state + action delivery for the card. Moves `SURFACE_ID_KEYS`, `actionIdCounter` (with its "Preserve the interpreter's former module-wide sequence…" comment), `extractSurfaceId`, type `A2uiAgentActionOutcome` (export; its doc moves), `isThenable` (doc moves). Hooks (all comments move with their statements):
     - `useA2uiInterpreter({ registry }: UseA2uiInterpreterInput): A2uiInterpreter` ← unit B (the "Merges the host registry…" comment moves).
     - `useA2uiSurfaceEvents({ interpreter, events, runId, onAgentAction }: UseA2uiSurfaceEventsInput): { surfaceId: string | undefined; refusalNotice: string | null; setRefusalNotice: Dispatch<SetStateAction<string | null>> }` ← unit C (both long comments in the effect move; dependency array identical).
     - `useA2uiActionHandler({ interpreter, surfaceId, runId, onAgentAction, setRefusalNotice }: UseA2uiActionHandlerInput): { handleAction(componentId: string): void; pendingAgentAction: string | null; localActionResult: { componentId: string; value: unknown } | null; deliveryFailureNotice: string | null }` ← unit D (`handleAction` verbatim, plain function as today, not `useCallback`).
     `onAgentAction` typed `A2uiSurfaceCardProps['onAgentAction']` would need the component file — instead declare the prop type in the hooks file as `type A2uiAgentActionHandler = (runId: string, message: RendererToAgentMessage) => A2uiAgentActionOutcome | Promise<A2uiAgentActionOutcome> | void` copied exactly from the current prop declaration, and make `A2uiSurfaceCardProps.onAgentAction?: A2uiAgentActionHandler`.
  2. `A2uiSurfaceCard` calls the three hooks in that order (interpreter → events → actions), then keeps `root`, `formatLocalActionValue`, the `!root` branch and the JSX unchanged.
- **Importers to update:** `src/react/index.ts` (`export type { A2uiAgentActionOutcome }` → `./components/A2uiSurfaceCard.hooks.js`; keep the comment above it; `A2uiSurfaceCardProps` stays). Tests import only `A2uiSurfaceCard` — no change.
- **After:** `A2uiSurfaceCard` ~42; `useA2uiActionHandler` ~42; `useA2uiSurfaceEvents` ~30; `useA2uiInterpreter` ~20; component file ~175; hooks file ~115.
- **Risks / notes:** hook call order must equal today's hook order (memo, ref, state, effects) — interpreter hook first so its `useEffect` (subscribe) still runs before the events effect. `surfaceId!` in `handleAction` is existing code moved verbatim with its justification comment. `actionIdCounter` must stay a single module-level `let` (shared across cards).
