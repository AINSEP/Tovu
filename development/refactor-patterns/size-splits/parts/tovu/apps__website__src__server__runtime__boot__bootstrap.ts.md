### tovu:apps/website/src/server/runtime/boot/bootstrap.ts
- **Over:** `buildBootModules` 105 (file 253, under)
- **Phase:** after-move (MOVE — the survey moves this boot composition as a whole; split below executes only if that move slips, and travels with the file if it doesn't) · **Batch:** size-55
- **Tests:** `apps/website/src/server/runtime/boot/__tests__/bootstrap-modules.unit.test.ts`, `.../boot/__tests__/bootstrap-reporting.unit.test.ts`, `.../boot/__tests__/plugin-activation-poll-boot.unit.test.ts`, `.../boot/__tests__/agent-plugin-update-recovery-boot.unit.test.ts`, `apps/website/src/cli/__tests__/unit/serve-command-wiring.unit.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `consoleLogger`, `noop`, `bootLog`, `syncProviderFacesAtBoot`, `lockSoonAgentPluginsAtBoot`, token-import steps, retirements, bundled warnings, `BuildBootModulesOptions`, `logCriticalBootFailures` | boot step helpers (stay) |
| B | `let pluginActivationPoll` + the `{ name: "plugin-runtime-attach", …}` element (with its "P0a fix (2026-09-23)" comment block) | attach enabled plugins + activation polling |
| C | element `{ name: "agent-plugin-update-recovery", …}` (with its "Finishes or rolls back an Agent Plugin update" comment) | recover interrupted plugin updates |
| D | element `{ name: "bundled-agent-plugins", …}` (with its "Installs the Agent Plugins that ship with Tovu" comment) | seed bundled plugins, then faces/soon-lock/tokens |
| E | `database-migration-reconciliation`, `settings`, `seo`, `newsletter`, `comments` elements | simple readiness modules (stay inline) |

- **Splits:**
  1. HELPERS (module level, above `buildBootModules`, in array order). Input `{ deps: NewsletterRouteDeps; options: BuildBootModulesOptions }` (`BootModuleInput`, plan-named, shared):
     - `pluginRuntimeAttachModule({ deps, options }: BootModuleInput): BootModule` ← first statement `let pluginActivationPoll: { stop: () => void } | undefined;` (moved from the top of `buildBootModules`), then `return {` the `plugin-runtime-attach` element `}` with its leading comment block moved above the `return`.
     - `agentPluginUpdateRecoveryModule({ deps }: Pick<BootModuleInput, "deps">): BootModule` ← the `agent-plugin-update-recovery` element.
     - `bundledAgentPluginsModule({ deps, options }: BootModuleInput): BootModule` ← the `bundled-agent-plugins` element.
  2. `buildBootModules` returns `[ …E elements unchanged…, pluginRuntimeAttachModule({ deps, options }), agentPluginUpdateRecoveryModule({ deps }), bundledAgentPluginsModule({ deps, options }) ]` in exactly the current array order (check the element order in source — keep it).
- **Importers to update:** none.
- **After:** file ~262; `buildBootModules` ~32; helpers ~32 / ~22 / ~55.
- **Risks / notes:** Array ORDER is behaviour (the update-recovery comment says "in array order: before the bundled seed"). `pluginActivationPoll` must be one variable shared by that element's `start` and `stop` — it is, inside the helper's closure, and the helper is called once per `buildBootModules` call as before. `bootstrap-reporting.unit.test.ts` mocks agent-plugin modules, not this file — unaffected. Drop `options` from a helper whose element never reads it (rg).
