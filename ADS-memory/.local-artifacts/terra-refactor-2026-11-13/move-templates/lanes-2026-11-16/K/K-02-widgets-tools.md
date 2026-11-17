# K-02 widgets agent tools -> `@jini-ai/cms/widgets` (one run, est 230k; hand off at 200k after a pushed step)
files: `K-02.files.tsv` (`widgets/agent-tools.ts` 335, `widgets/tool-registrations.ts` 518). tools: `K-02.tools.tsv` = 12, all `inline`, longest 25. pkg: cms. THIRD_PARTY_ALLOWED: none. tests: `apps/website/src/features/widgets/**/*.test.ts`.
over the limit: `buildWidgetsRegistrations` 213; FILE 518 > 500. Target partition (S1 creates it in Tovu): `tool-registrations.ts` (deps type, risk, table, about 150) + `tool-handlers.instances.ts` (instance list/get/create/update/trash handlers + their view mappers) + `tool-handlers.areas.ts` (area + embed handlers). Rule for the cut: a helper used by both groups stays in `tool-registrations.ts`; `wc -l` of each <= 400.
target: `packages/cms/src/widgets/{agent-tools,tool-registrations,tool-handlers.instances,tool-handlers.areas}.ts`.
BINDINGS:
| import | class | action |
|---|---|---|
| `toolMetadata` (`tool-metadata/widgets.js`) | host | `withToolMetadata` |
| `withPluginHookRefusals` (`contracts/core/plugin-hook-failed-error.js`) | port | `deps.wrapHookRefusals: (handlers: Record<string, ToolHandler>) => Record<string, ToolHandler>`; write the type from the real signature (read it first; a different shape = use the real one, same call site) |
| `buildWidgetsDeps`, `buildWidgetsRegionDeps`, `WidgetsRouteDeps` (`./deps.js`) | host | `deps.ts` STAYS; the contributor calls both builders and passes the BUILT objects as `deps.widgets`, `deps.regions`; Jini declares those two field types structurally from what the handlers read |
| `@jini-ai/cms/widgets` | own | leaf files |
| `@jini-ai/core*` | core | as is |
| daemon/platform default surfaces | delete | handlers never read `surfaces` |
S0 extra: (f) a plugin-hook refusal thrown inside a handler reaches the model as the same refusal object (V3: remove the wrapper call -> RED).
changeset: cms minor.
