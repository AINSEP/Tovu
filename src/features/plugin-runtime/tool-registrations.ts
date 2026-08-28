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
 *
 * ---------------------------------------------------------------------------
 * `plugins_list` also reports installed Agent Plugins (2026-08-23 fix)
 * ---------------------------------------------------------------------------
 * `plugins_list` used to claim it lists "every discovered plugin" while only ever calling
 * `routeDeps.discoverPlugins()` — the site/runtime plugin family (`.tovu-plugin` built-ins plus
 * site-installed). It never mentioned Agent Plugins (Jini's separate `packages/agent-plugins/`
 * family, installed under a digest-keyed dir and enumerated by `listInstalledPlugins()` in
 * `features/agent-plugins/resolve-agent-plugin-refs.js`), so an operator asking "what plugins do I
 * have installed" got a confidently incomplete answer with no signal that anything was missing.
 *
 * The merge happens HERE, in the `plugins_list` handler, not inside `discoverPlugins()` — deliberately.
 * `discoverPlugins()` has a second caller below, `plugins_set_enabled`, which needs an activation
 * record and a trust/validation lifecycle (`pluginActivationRepo`, discovery `status`/`tier`) that
 * Agent Plugins have none of. Folding Agent Plugins into `discoverPlugins()` would make
 * `plugins_set_enabled` offer to enable/disable something with no activation concept to flip — a real
 * bug, not a refactor. `discoverPlugins()` and `plugins_set_enabled` are untouched by this fix.
 *
 * Response shape: `{ plugins: [...unchanged...], agentPlugins: [...] }` — two arrays, never flattened
 * into one, so a caller cannot mistake one family's row shape for the other's (site rows carry
 * `enabled`/`trustTier`/`validationStatus`; Agent Plugin rows carry none of that — see
 * `AgentPluginListRow` below, which reports only what `InstalledAgentPlugin` genuinely has).
 *
 * Permission: reuses `admin.plugins.read` for both halves rather than adding a second gate. Both are
 * "list what is installed" reads with no mutation and no distinct sensitivity from each other — the
 * same operator who may see site plugin ids/versions/status has no lesser standing to see Agent
 * Plugin ids/skill names. A separate `admin.agent-plugins.read` permission would be defensible too,
 * but would be new-permission-for-its-own-sake with no threat model this handler's callers describe.
 *
 * Workspace scoping: Agent Plugins are resolved for `routeDeps.workspaceId` — the SAME workspace this
 * handler already scopes `pluginActivationRepo.getActivation` to — via
 * `resolveAgentPluginLayout().forWorkspace(routeDeps.workspaceId)`, matching every other caller of
 * `listInstalledPlugins` (`resolve-agent-plugin-refs.ts`, `features/agent-plugins/
 * tool-registrations.ts`). Anything else would leak one workspace's installed Agent Plugins into
 * another's `plugins_list` response, which `layout.ts`'s own tenant-isolation header treats as the
 * primary threat this whole subtree defends against.
 *
 * Failure isolation: `listAgentPluginsForResponse()` below wraps the whole Agent Plugin read in a
 * `try/catch` — a failure there (a misconfigured `TOVU_AGENT_PLUGINS_DIR`, or anything else) degrades
 * to an empty `agentPlugins` array rather than failing the tool call outright, so a problem in the
 * newer, less-exercised half of this tool can never take down the site-plugin half that already
 * worked. `listInstalledPlugins` itself already returns `[]` on `ENOENT` (no packages dir yet — the
 * common "nothing installed" case) and silently skips any single digest that fails to index; the
 * `try/catch` here only guards the remaining outer failure surface (layout resolution itself).
 *
 * No absolute host path (`InstalledAgentPlugin.packageRoot`, or a skill's `skillPath` resolved
 * against it) is ever put on the response — `toAgentPluginListRow()` below reads only `pluginId`,
 * `version`, `archiveDigest`, and skill NAMES, the same "no `handle`-shaped value ever serializes"
 * rule `features/agent-plugins/tool-registrations.ts`'s own header states for its tools.
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
import { executeCommand, type AuthorizeFn, type ChangeSetRepoPort } from "../../contracts/core/commands/index.js";
import type { ToolContributor } from "#src/assistant/index";
// Now sourced from this same module — `toAdminPluginResponse` moved to
// `features/plugin-runtime/admin-response.ts` (this domain's own projection), closing the back-edge
// into `server/http/admin` this file used to carry. `server/http/admin/plugins.ts` re-exports the
// same symbol so its own HTTP-route consumers are unaffected.
import { toAdminPluginResponse } from "./admin-response.js";
import {
  setPluginEnabled,
  type PluginActivationRecord,
  type PluginActivationRepoPort,
} from "./activation.js";
import { pluginAgentToolCatalog } from "./agent-tools.js";
import type { PluginDiscoveryRecord } from "./discovery.js";
// The Agent Plugins half of `plugins_list` (see this file's header) — a deliberate, disclosed
// cross-domain read. `resolve-agent-plugin-refs.ts`/`layout.ts` only, never
// `features/agent-plugins/tool-registrations.ts` (a separate workstream's file; not touched here).
import { resolveAgentPluginLayout } from "../agent-plugins/layout.js";
import { listInstalledPlugins } from "../agent-plugins/resolve-agent-plugin-refs.js";
import type { InstalledAgentPlugin } from "../agent-plugins/install.js";

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
export function contributePluginsTools(): ToolContributor {
  return { domain: "plugins", build: buildPluginsRegistrations, risk: pluginsDerivedRisk };
}
