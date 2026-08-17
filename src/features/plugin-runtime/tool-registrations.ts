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
  type OutboxPort,
} from "@jini-ai/cms/core";
import { executeCommand, type AuthorizeFn, type ChangeSetRepoPort } from "../../core/commands";
import { registerToolContributor } from "#src/assistant/index";
// Now sourced from this same module — `toAdminPluginResponse` moved to
// `features/plugin-runtime/admin-response.ts` (this domain's own projection), closing the back-edge
// into `server/http/admin` this file used to carry. `server/http/admin/plugins.ts` re-exports the
// same symbol so its own HTTP-route consumers are unaffected.
import { toAdminPluginResponse } from "./admin-response";
import {
  setPluginEnabled,
  type PluginActivationRecord,
  type PluginActivationRepoPort,
} from "./activation";
import { pluginAgentToolCatalog } from "./agent-tools";
import type { PluginDiscoveryRecord } from "./discovery";

const CATALOG_BY_ID = indexCatalogById(pluginAgentToolCatalog);

/**
 * The exact slice of the route-deps bag Plugins' tool handlers read. Declared structurally (rather
 * than importing `server/routes/types`'s `RouteDeps`) so this module carries no back-edge into the
 * composition root for the `RouteDeps` god type specifically — the `toAdminPluginResponse` import
 * above is a separate, already-disclosed back-edge (`server/http/admin/plugins`) left untouched per
 * the dispatch's explicit out-of-scope list. `server/routes/*` satisfies this structurally by
 * passing its existing `RouteDeps` object; nothing there changes.
 */
export interface PluginsToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  clock: { nowIso(): string };
  idGen: { newId(): string };
  changeSets: ChangeSetRepoPort;
  outbox: OutboxPort;
  pluginActivationRepo: PluginActivationRepoPort;
  discoverPlugins: () => Promise<readonly PluginDiscoveryRecord[]>;
  onPluginEnabled: (pluginId: string) => Promise<void>;
  onPluginDisabled: (pluginId: string) => void;
}

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

export function buildPluginsRegistrations(routeDeps: PluginsToolDeps): ToolRegistration[] {
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
              deps: {
                clock: routeDeps.clock,
                repo: routeDeps.pluginActivationRepo,
                discovery,
                onEnabled: routeDeps.onPluginEnabled,
                onDisabled: routeDeps.onPluginDisabled,
              },
              input: { workspaceId: routeDeps.workspaceId, pluginId, enabled },
            }),
          rollback: async () => {
            if (priorActivation) {
              await routeDeps.pluginActivationRepo.save(priorActivation);
            } else {
              await routeDeps.pluginActivationRepo.deleteActivation({ workspaceId: routeDeps.workspaceId, pluginId });
            }
            if (priorActivation?.enabled) {
              await routeDeps.onPluginEnabled(pluginId);
            } else {
              routeDeps.onPluginDisabled(pluginId);
            }
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

/**
 * Contributes Plugins' AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildPluginsRegistrations`/
 * `pluginsDerivedRisk` by name; this is the seam that replaced it (2026-08-17, Stage 2 batch 2).
 * Unlike `database` (tried and reverted earlier in this batch), this domain's own imports are all
 * `core/commands` plus its own sibling files (`admin-response.ts`, `activation.ts`, `agent-tools.ts`,
 * `discovery.ts`) — it does not reach `features/database`/`db` at all, so it does not carry that
 * domain's round-trip risk. Every importer outside `server/*` is none — nothing else imports this
 * domain by name.
 */
export function contributePluginsTools(): void {
  registerToolContributor({ domain: "plugins", build: buildPluginsRegistrations, risk: pluginsDerivedRisk });
}
