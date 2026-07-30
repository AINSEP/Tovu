/**
 * @file Plugins' half of ADR-049 Decision 4 (SPEC-005/ADR-005-ARCH): maps `agent-tools.ts`'s two
 * catalog entries onto the two operations `routes/admin/plugins/` exposes, as `ToolRegistration`s.
 * The entire catalog is wired.
 *
 * Authorization shape: `admin.plugins.read` is checked by the list handler itself via the kit's
 * `requireToolPermission` (`discoverPlugins` is a pure read with no gate to inherit);
 * `admin.plugins.enable` is enforced by the SAME `executeCommand` composition
 * `routes/admin/plugins/set-enabled.ts` itself uses — plugin activation has no domain-layer
 * chokepoint of its own to defer to, so this handler IS that route's composition (see
 * `setPluginEnabled`'s file header). One evaluator either way, per ADR-021 §2.
 */
import {
  AGENT_TOOL_PRINCIPAL_KIND,
  buildDomainRegistrations,
  indexCatalogById,
  requireInputRecord,
  requireNoInput,
  requireString,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "../../assistant/tool-registration-kit";
import { executeCommand } from "../../core/commands";
import { toAdminPluginResponse } from "../../server/http/admin/plugins";
import type { RouteDeps } from "../../server/routes/types";
import { setPluginEnabled, type PluginActivationRecord } from "./activation";
import { pluginAgentToolCatalog } from "./agent-tools";

const CATALOG_BY_ID = indexCatalogById(pluginAgentToolCatalog);

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls. See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration.
 */
export const pluginsDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> discoverPlugins() + pluginActivationRepo.getActivation() per record: reads only.
  ["plugins_list", "none"],
  // -> executeCommand(...) -> setPluginEnabled (activation.ts): pluginActivationRepo.save() plus
  //    (on enable) the injected onEnabled hook, which can run ADR-023 schema DDL against the live
  //    database. Genuinely mutating, not a metadata-only flip.
  ["plugins_set_enabled", "mutates-durable-state"],
]);

export function buildPluginsRegistrations(routeDeps: RouteDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    plugins_list: async (ctx) => {
      requireNoInput(ctx.input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "admin.plugins.read" });

      const discovery = await routeDeps.discoverPlugins();
      const plugins = await Promise.all(
        discovery.map(async (record) => {
          const activation = await routeDeps.pluginActivationRepo.getActivation({ workspaceId: routeDeps.workspaceId, pluginId: record.id });
          return toAdminPluginResponse(record, activation);
        }),
      );
      return { plugins };
    },

    plugins_set_enabled: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const pluginId = requireString(input, "pluginId");
      const enabledRaw = input.enabled;
      if (typeof enabledRaw !== "boolean") throw new Error("'enabled' (boolean) is required");
      const enabled = enabledRaw;

      const discovery = await routeDeps.discoverPlugins();
      // Captured by `captureInverse` below, reused verbatim by `rollback` — mirrors
      // `routes/admin/plugins/set-enabled.ts`'s identical `priorActivation` shape exactly, since
      // this handler IS that route's own `executeCommand` composition.
      let priorActivation: PluginActivationRecord | null = null;

      const { result } = await executeCommand<{ activation: PluginActivationRecord }>({
        deps: {
          clock: routeDeps.clock,
          idGen: routeDeps.idGen,
          changeSets: routeDeps.changeSets,
          outbox: routeDeps.outbox,
          authorize: routeDeps.authorize,
        },
        command: {
          workspaceId: routeDeps.workspaceId,
          actor: { id: ctx.principal.id, kind: AGENT_TOOL_PRINCIPAL_KIND },
          summary: `Agent set plugin '${pluginId}' enabled=${enabled}`,
          permission: "admin.plugins.enable",
        },
        mutation: {
          entityType: "plugin-activation",
          entityId: pluginId,
          operation: "update",
          captureInverse: async () => {
            priorActivation = await routeDeps.pluginActivationRepo.getActivation({ workspaceId: routeDeps.workspaceId, pluginId });
            return { enabled: priorActivation?.enabled ?? false };
          },
          execute: () =>
            setPluginEnabled({
              deps: { clock: routeDeps.clock, repo: routeDeps.pluginActivationRepo, discovery },
              input: { workspaceId: routeDeps.workspaceId, pluginId, enabled },
            }),
          rollback: async () => {
            if (priorActivation) await routeDeps.pluginActivationRepo.save(priorActivation);
          },
        },
      });

      const record = discovery.find((r) => r.id === pluginId);
      if (!record) throw new Error(`plugin '${pluginId}' was not found in the current discovery snapshot`);
      return { plugin: toAdminPluginResponse(record, result.activation) };
    },
  };

  // No `unwiredToolIds`: Plugins wires its ENTIRE catalog, same tripwire discipline as Forms.
  return buildDomainRegistrations({
    domain: "plugins",
    catalogModule: "features/plugin-runtime/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: pluginsDerivedRisk,
  });
}
