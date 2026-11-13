### jini:packages/chat/src/react/features/chat-pane/hooks/useAgentRuntimePicker.hooks.ts
- **Over:** `useAgentRuntimePicker` 103
- **Phase:** now · **Batch:** size-12
- **Tests:** `src/react/features/chat-pane/__tests__/hooks/useAgentRuntimePicker.cov-j2.test.ts`, `src/react/features/chat-pane/__tests__/components/AgentRuntimePicker.test.tsx` (smoke). No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | pure exports `runtimeOptionLabel` … `byokSummaryText`, option/result interfaces | labels, position math, key routing |
| B | `const [position, setPosition]`, effect `useEffect(() => {` L302 (uses open,triggerRef,setPosition,placement), effect L319 (uses open,position,popoverRef) | place the open popover and move focus into it |
| C (stays) | ids/refs, derived labels, `focusTrigger`, `toggleOpen`, dismiss effect L270, `handlePopoverKeyDown`, return | picker state |

- **Splits:**
  1. SUB-HOOK `usePopoverPlacement({ open, triggerRef, popoverRef, placement }: UsePopoverPlacementInput): CSSProperties | undefined` — module level above `useAgentRuntimePicker` ← `const [position, setPosition] = useState<CSSProperties>();` + the two effects at ~L302 and ~L319 (with their comments), same order. Call it where the L302 effect stood (after the dismiss effect), so effect order is unchanged; its `useState` moves with it (hook slot order changes, which is harmless across a code change).
- **Importers to update:** none.
- **After:** `useAgentRuntimePicker` ~82; `usePopoverPlacement` ~26; file ~225.
- **Risks / notes:** effect run order must stay: dismiss (L270) → position (L302) → focus (L319). `setPosition` is only used by the moved effect (per outline), so nothing else needs it.
