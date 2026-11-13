### jini:packages/chat/src/react/features/chat-pane/components/AgentRuntimePicker.tsx
- **Over:** file 516 lines (no function over 100)
- **Phase:** now · **Batch:** size-12
- **Package entry:** not an exports target. `features/chat-pane/index.ts` re-exports `AgentRuntimePicker` (stays here). The L29 `export { runtimeOptionLabel, runtimePopoverPosition… } from '../hooks/useAgentRuntimePicker.hooks.js'` re-export stays as is (existing, "public surface unchanged" comment).
- **Tests:** `src/react/features/chat-pane/__tests__/components/AgentRuntimePicker.test.tsx` (imports `runtimeAgentStatus` → path edit), `AgentRuntimePicker.native-policy.unit.test.tsx`, `AgentRuntimePicker.agent-handles.test.tsx`, `AgentRuntimePicker.access-note-icon.unit.test.tsx`, `__tests__/composer-action-hit-targets.test.tsx`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A agents | `runtimeAgentStatus`, `FullAccessNoteTip`, `NativeToolPolicyWarning`, `RuntimeAgentListProps`, `RuntimeAgentList`, `RuntimeAgentRowProps`, `RuntimeAgentRow` | agent rows, status and access warnings |
| B popover | `RuntimeModeButtonsProps`, `RuntimeModeButtons`, `RuntimeByokDetailsProps`, `resolveByokModel`, `RuntimeByokDetails`, `RuntimeRescanFooterProps`, `RuntimeRescanFooter`, `RuntimePopoverProps`, `runtimePortalBinding`, `RuntimePopover` | the portaled picker popover body |
| C (stays) | L29 re-export, `RuntimeBarMenusProps`, `RuntimeBarMenus`, `RuntimeTriggerProps`, `RuntimeTriggerIcon`, `RuntimeTrigger`, `AgentRuntimePicker` | trigger, bar menus, composition |

- **Splits:**
  1. NEW `AgentRuntimePicker-agents.tsx` — unit A verbatim (the `FullAccessNoteTip` and preflight "why" comments move). Exports `runtimeAgentStatus`, `NativeToolPolicyWarning`, `RuntimeAgentList`.
  2. NEW `AgentRuntimePicker-popover.tsx` — unit B verbatim (the `resolveByokModel` and `runtimePortalBinding` comments move). Imports `RuntimeAgentList` from `./AgentRuntimePicker-agents.js`. Exports `RuntimePopover`.
  3. AgentRuntimePicker.tsx imports `NativeToolPolicyWarning` and `RuntimePopover`; does NOT re-export `runtimeAgentStatus`.
- **Importers to update:** `__tests__/components/AgentRuntimePicker.test.tsx` (`runtimeAgentStatus` → `../../components/AgentRuntimePicker-agents.js`).
- **After:** AgentRuntimePicker.tsx ~165; -agents ~120; -popover ~235.
- **Risks / notes:** sub-components already take plain props and use only `useT`/`useId`/`useOverlayContainer`; moving them verbatim keeps behavior. `runtimeAgentStatus` was a public name of this module but not of any package entry (chat-pane `index.ts` does not export it) — confirm with `rg -n runtimeAgentStatus src` before dropping it here.
