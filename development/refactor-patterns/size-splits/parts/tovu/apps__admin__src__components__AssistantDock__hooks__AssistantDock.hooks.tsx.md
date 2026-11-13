### tovu:apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx
- **Over:** file 1033 lines · `useExecutionConfig` 134
- **Phase:** after-move (MIXED) · **Batch:** size-46
- **Tests:** `apps/admin/src/components/AssistantDock/__tests__/AssistantDock.hooks.unit.test.tsx`, `apps/admin/src/components/__tests__/AssistantDock.hooks.unit.test.tsx`, `apps/admin/src/components/__tests__/AssistantDock.unit.test.tsx`, `apps/admin/src/components/__tests__/AssistantDock.execution-refresh.unit.test.tsx`, `apps/admin/src/components/__tests__/AssistantDock.runtime-access.unit.test.tsx`, `apps/admin/src/components/AssistantDock/__tests__/agents-loader.unit.test.ts`, `apps/admin/src/components/AssistantDock/__tests__/use-messages-change-handler.unit.test.tsx`, `apps/admin/src/components/AssistantDock/__tests__/skill-composer-routing.unit.test.tsx`, `apps/admin/src/components/AssistantDock/__tests__/daemon-prewarm-error.unit.test.tsx`, `apps/admin/src/lib/__tests__/execution-settings.test.ts`, `apps/admin/src/hooks/__tests__/use-tovu-execution-adapters.unit.test.tsx`
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A | `UseExecutionConfig`, `DockExecutionConfigPort`, `defaultDockExecutionConfigPort`, `EXECUTION_CONFIG_MAX_AGE_MS`, `useExecutionConfig` | runtime picker execution config |
| B | `useByokRuntime`, `BYOK_PRESET_ICON_IDS`, `useLocalCliSelection`, `useComposerCapabilities`, `useSelectedAgentPlugins`, `useChatI18n`, `useSelectedPluginChips` | composer/runtime picker state (stays) |
| C | `useAssistantTransport`, `useLocalCliDaemonPrewarm`, `pageBindToken`, `withLatestLocalCliSelection` | chat transport + daemon prewarm |
| D | `CHAT_ATTACHMENT_*`, `useAttachmentUploader`, `useSkillAwareAttachmentUploader`, `resolveSkillsAvailable`, `useAttachmentValidator` | attachments |
| E | `AGENTS_URL` … `useAgentsPlaceholder` (agents fetch/cache/deadlines, resume-capable set, `readDaemonOnline`, `useRuntimeAccess`) | agents inventory + runtime access |
| F | `useWorkingDirectoryAccess`, re-export, `useComposerDiscoverySelect` | composer discovery (stays) |
| G | `shouldPublishOnMessagesChange`, `ToolProgressMark`, `shouldPublishContentOnToolProgress`, `useMessagesChangeHandler` | content-refresh announcements |
| H | `includeIfDefined`, `includeIfNonEmptyString`, `includeIfNonEmptyArray`, `resolveRunContext`, `useRunContext` | per-call run context |
| I | `buildAssistantMcpUiSandboxProxyUrl`, `openMcpUiLink` | MCP-UI host glue |
| J | `useChatsSeam` … `useFolderDropBridge` | seam layer (stays) |

- **Splits** (all new files in `components/AssistantDock/hooks/`; names plan-given):
  1. NEW `AssistantDock-agents.hooks.ts` — Moves unit E with its comments (incl. the module-scoped `resumeCapableAgentIds` and `agentsDeadlines` state — must move together). Exports `extractResumeCapableAgentIds`, `resetResumeCapableAgentIds`, `getResumeCapableAgentIds`, `AgentsLoader`, `replaceAgents`, `createAgentsLoader`, `useRuntimeAccess`, `useAgentsPlaceholder`.
  2. NEW `AssistantDock-transport.hooks.ts` — Moves unit C; imports `getResumeCapableAgentIds` from step 1. Exports `useAssistantTransport`, `useLocalCliDaemonPrewarm`.
  3. NEW `AssistantDock-attachments.hooks.ts` — Moves unit D. Exports the 4 functions.
  4. NEW `AssistantDock-messages-change.hooks.ts` — Moves unit G (+ its long rationale comments). Exports all four.
  5. NEW `AssistantDock-run-context.hooks.ts` — Moves unit H. Exports `resolveRunContext`, `useRunContext`.
  6. NEW `AssistantDock-mcp-ui.ts` — Moves unit I. Exports both.
  7. NEW `AssistantDock-execution-config.hooks.ts` — Moves unit A. Inside it, SUB-HOOKS above `useExecutionConfig`: `useExecutionConfigRefresh({ io, configKey, configLoader, invalidate, executionConfigRef, localWriteRef, setExecutionConfigState, setConfigLoaded }: UseExecutionConfigRefreshInput): { refreshExecutionConfig: () => Promise<ExecutionConfig>; readExecutionConfigForSend: () => Promise<ExecutionConfig> }` ← from `const lifecycleRef = useRef<AbortController | null>(null);` through the `useEffect(() => {` that uses `lifecycleRef,refreshExecutionConfig` (~L255–331); `useStoredAdminKeyPresence({ credentialLoader, invalidate, credentialKey }): boolean | null` ← `const [hasStoredAdminKey, …] = useState` + its `useEffect` (~L347–373). Keep hook call order: refresh sub-hook where the refs were, key-presence after.
  Original keeps B, F, J; seams import from the new files (no new file imports `AssistantDock.hooks.tsx`).
- **Importers to update** (rg each name; `AssistantDock.tsx` and `hooks/use-tovu-execution-adapters.hooks.ts`, `hooks/use-dock-renderer-registry.hooks.ts`, `lib/assistant-transport.ts`, `lib/agent-screen-context.ts`, `features/taxonomy/hooks/use-taxonomy.hooks.ts`, `components/AssistantDock/execution-config-write.ts`, plus ~20 tests listed by `rg -l "AssistantDock\.hooks" apps/admin/src`): repoint each moved name to its new module.
- **After:** original ~415; `useExecutionConfig` ~50; new files ~140 / ~120 / ~40 / ~70 / ~75 / ~25 / ~160.
- **Risks / notes:** no `vi.mock` of this module found. Module-level mutable state (`resumeCapableAgentIds`, `agentsDeadlines`) must live in exactly one module — tests call `resetResumeCapableAgentIds` and must import from the new file. `useExecutionConfigRefresh` closes over refs only — pass refs, not `.current`.
