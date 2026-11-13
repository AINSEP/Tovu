### tovu:apps/website/src/features/agent-plugins/lifecycle.ts
- **Over:** `createTovuAgentPluginLifecycle` 111 (file 228, under)
- **Phase:** now (STAY-WIRING; survey also marks its positional compatibility exports for DELETE — separate job) · **Batch:** size-03
- **Tests:** `apps/website/src/features/agent-plugins/__tests__/unit/trusted-plugin-files.unit.test.ts`, `apps/website/src/features/agent-plugins/__tests__/unit/bundled-ui-ux-design-package.unit.test.ts`, `apps/website/src/server/runtime/composition/__tests__/site-guide-tools.test.ts`, `apps/website/src/server/runtime/composition/__tests__/wiring-identity.test.ts`, `apps/website/src/server/runtime/boot/__tests__/bootstrap-reporting.unit.test.ts`, `apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugin-set-enabled.integration.test.ts`, `apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugins-http.integration.test.ts`
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `policy.onEvent` body, `policy.formatBundledUninstallRecovery` | host log/dedupe of lifecycle events; recovery sentence |
| B | `async function resolveHostPluginRefs(` (+ its JSDoc) | host guidance: maturity notices + overlays around Jini's refs |
| C | return's `loadPluginContributions` | supersession-aware contribution loading |
| D | return's `createBundledSourceArchiveReader` | adapt Jini's reader to the host port shape |
| E | `unbound`, `policy` (rest), `owner`, `manifests`, `soonCatalog`, the rest of the return | wiring (stays) |

- **Splits** (same file, module level, after `reportedIdentityWarnings`, above `createTovuAgentPluginLifecycle`). Add `type TovuLifecycleOwner = ReturnType<typeof createAgentPluginLifecycle>;`.
  1. `reportAgentPluginLifecycleEvent({ event, message, pluginId }: ReportAgentPluginLifecycleEventInput): void` ← the body of `policy.onEvent` (reads module-level `reportedIdentityWarnings`). `policy.onEvent: reportAgentPluginLifecycleEvent`. Input type = the parameter type of `AgentPluginLifecycleOptional["onEvent"]` (use `Parameters<NonNullable<AgentPluginLifecycleOptional["onEvent"]>>[0]`).
  2. `bundledUninstallRecoveryText({ pluginId }: { pluginId: string }): string` ← the template string of `formatBundledUninstallRecovery` (exact text, both lines).
  3. `createHostPluginRefResolver({ owner, hostOverlaysDir }: CreateHostPluginRefResolverInput): (input, options?) => ReturnType<TovuLifecycleOwner["resolveAgentPluginRefs"]>` ← `resolveHostPluginRefs` with its JSDoc moved above the factory; inside, `optional.hostOverlaysDir` → `hostOverlaysDir`. In the main function: `const resolveHostPluginRefs = createHostPluginRefResolver({ owner, hostOverlaysDir: optional.hostOverlaysDir });` placed where the function declaration was (after `manifests`).
  4. `createSupersessionAwareContributionLoader({ owner, manifests }: CreateSupersessionAwareContributionLoaderInput)` returning the generic `async <D, T>(input, options) => …` arrow exactly as written in the return; return key becomes `loadPluginContributions: createSupersessionAwareContributionLoader({ owner, manifests })`.
  5. `adaptBundledSourceArchiveReader({ owner }: { owner: TovuLifecycleOwner }): AgentPluginArchiveReaderPort` ← the body of `createBundledSourceArchiveReader`; return key becomes `createBundledSourceArchiveReader: () => adaptBundledSourceArchiveReader({ owner })`.
- **Importers to update:** none (no export moves).
- **After:** file ~250; `createTovuAgentPluginLifecycle` ~70; helpers ≤ 25.
- **Risks / notes:** `policy.migrateBeforeSeed` closes over `owner` declared AFTER `policy` (called later, so TDZ-safe) — leave it inline; do not reorder `policy`/`owner`. `bootstrap-reporting.unit.test.ts` `mock.module`s this file with `...lifecycle` spread — unaffected since no export moves. `TovuAgentPluginLifecycle` is `ReturnType<typeof createTovuAgentPluginLifecycle>`: keep return member types identical (generic loader must stay generic).
