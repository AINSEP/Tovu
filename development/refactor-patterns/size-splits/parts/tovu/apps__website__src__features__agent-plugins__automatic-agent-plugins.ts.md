### tovu:apps/website/src/features/agent-plugins/automatic-agent-plugins.ts
- **Over:** `createAutomaticPluginRuns` 142 (file 175, under)
- **Phase:** after-move (MIXED: MOVE-AFTER(ports) `createAutomaticPluginRuns`… — label truncated in the survey) · **Batch:** size-56
- **Tests:** `apps/website/src/assistant/__tests__/automatic-agent-plugins.integration.test.ts`, `assistant/__tests__/tool-registrations.contracts.test.ts`, `server/runtime/composition/modules/__tests__/assistant-agent-plugin-preflight.integration.test.ts`, `features/agent-plugins/__tests__/unit/tool-registrations.unit.test.ts` (website runner). No mocks of the module.
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `type Entry = { … }`, `const chatKey = (context…) =>` | turn-entry shape + chat identity key |
| B | `function createEntry({ mode, context, turnId, runId })` (48 lines: controller ports `list`/`rank`/`resolve`/`ask`/`saveAuto`/`publish`) | wire one logical turn's automatic-use controller to catalog, resolver, consent card and settings |
| C | the `load_agent_plugin` handler inside `buildDomainRegistrations({ … handlers: { … } })` | load one plugin's guidance for a run, with the per-status note |
| D | `turns`/`runs`/`lateAnswers`, `releaseDetached`, `start`, `rejoin`, `preflight`, `withLateAnswer`, `prepareGuidance`, `loadRegistration` call, `forget`, return | turn/attempt bookkeeping (stays) |

- **Splits** (same file, module level, above `createAutomaticPluginRuns`, in this order):
  1. Lift `type Entry` to module level as `type AutomaticPluginEntry` (identical body); inside the function keep `type Entry = AutomaticPluginEntry;` only if needed to avoid touching every annotation — otherwise rename the 8 uses. Lift `chatKey` unchanged to module level (pure, reads nothing from the closure).
  2. HELPER `createAutomaticPluginEntry({ mode, context, turnId, runId, deps, surfaces, askAgentPluginChoice, lateAnswers }: CreateAutomaticPluginEntryInput): AutomaticPluginEntry` ← body of `createEntry` verbatim (all its comments, incl. "A retry can replace this attempt…", "Detached turns already hand late consent…", "Preflight callers keep the turn running…"; both `ToolInputError` messages byte-identical). In the function: `function createEntry(input: { mode: ChatAgentPlugins; context: AutomaticPluginRun; turnId: string; runId: string }): Entry { return createAutomaticPluginEntry({ ...input, deps, surfaces, askAgentPluginChoice, lateAnswers }); }` (keep its doc comment on the helper).
  3. HELPER `loadAgentPluginGuidance({ raw, run, principal, signal, runs, release }: LoadAgentPluginGuidanceInput): Promise<…same return type as today…>` ← the `load_agent_plugin` handler body verbatim (input checks, entry lookup, `controller.load(...).finally(() => release(entry))`, the `notes` table, maturity spread). `release: (entry: AutomaticPluginEntry) => void` = `releaseDetached`. In the registration: `handlers: { load_agent_plugin: ({ input: raw, run, principal, signal }) => loadAgentPluginGuidance({ raw, run, principal, signal, runs, release: releaseDetached }) }`. Keep `catalogModule: 'assistant/automatic-agent-plugins.ts'` byte-identical (contract test reads it).
- **Importers to update:** none (no export moves).
- **After:** `createAutomaticPluginRuns` ~74; `createAutomaticPluginEntry` ~50; `loadAgentPluginGuidance` ~24; file ~190.
- **Risks / notes:** inside `createEntry` the `let entry` / `let approvedPreferenceRevisionSeq` are assigned and read by the port closures — they move together into the helper, unchanged. `lateAnswers` is a shared `Map` passed by reference (writes in `publish` must hit the same map `withLateAnswer` reads). After-move: survey says `createAutomaticPluginRuns` moves to Jini once ports exist; the split keeps all three pieces in this one file so the move stays a single-file move.
