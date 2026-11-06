import { buildDomainRegistrations, indexCatalogById, requireInputRecord, ToolInputError, type AgentToolDefinition, type ToolExecutionContext, type DerivedRiskByToolId } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import { approvalToolHandler } from "../../contracts/core/human-confirm.js";
import { toolMetadata } from "../../contracts/core/tool-metadata/custom-credentials.js";
import type { DevRestartPort } from "../../platform/dev-supervisor/dev-restart.js";
import type { PluginCredentialCard } from "../../contracts/core/plugin-credential-card.js";
import type { ProjectKeysPort } from "./service.js";

export const projectKeysCatalog: AgentToolDefinition[] = [
  { name: "project_keys_list", description: "List only saved keys already granted to this site. To choose another saved key, open credential_copy_from_project; its owner card keeps ungranted keys private.", sideEffects: "none", authorization: { permission: "custom-credentials.read" }, inputSchema: { type: "object", additionalProperties: false, properties: {} } },
  { name: "project_key_use", description: "Stop using a granted shared key on this site. Use credential_copy_from_project to approve a new grant in the owner card. Revocation applies immediately to future reads.", sideEffects: "mutates-durable-state", authorization: { permission: "resolved-per-kind" }, inputSchema: { type: "object", additionalProperties: false, required: ["keyId", "use"], properties: { keyId: { type: "string", minLength: 1 }, use: { type: "boolean", const: false } } } },
  { name: "site_restart", description: "Offer a confirmation card before restarting this site when live provider apply reports restart. Unsaved work and running chats will be lost. Without a dev supervisor returns instructions for the Sites list.", sideEffects: "mutates-durable-state", authorization: { permission: "admin.plugins.enable" }, inputSchema: { type: "object", additionalProperties: false, properties: {} } },
];
export const projectKeysRisk: DerivedRiskByToolId = new Map([["project_keys_list", "none"], ["project_key_use", "mutates-durable-state"], ["site_restart", "mutates-durable-state"]]);

export function buildProjectKeyRegistrations({ keys, authorize, loadCards, surfaces, restart }: {
  keys?: ProjectKeysPort; authorize: (input: { ctx: ToolExecutionContext; permission: string }) => Promise<void>;
  loadCards: () => Promise<readonly PluginCredentialCard[]>; surfaces: AssistantSurfaceDeps; restart: DevRestartPort | null;
}, _optional = {}) {
  const available = () => {
    if (!keys) throw new ToolInputError({ message: "This site has no project key store; keys saved here are used by this site at once." });
    return keys;
  };
  const empty = (input: unknown) => {
    const value = input === undefined ? {} : requireInputRecord({ input });
    if (Object.keys(value).length) throw new ToolInputError({ message: "This tool takes no arguments." });
  };
  return buildDomainRegistrations({ metadata: toolMetadata, domain: "project-keys", catalogModule: "features/project-keys/tools.ts",
    catalog: indexCatalogById({ catalog: projectKeysCatalog }), derivedRisk: projectKeysRisk, handlers: {
      project_keys_list: async ctx => {
        empty(ctx.input);
        await authorize({ ctx, permission: "custom-credentials.read" });
        return { keys: await available().listGranted({ cards: await loadCards() }) };
      },
      project_key_use: async ctx => {
        const input = requireInputRecord({ input: ctx.input });
        if (Object.keys(input).some(key => key !== "keyId" && key !== "use") || typeof input.keyId !== "string" || !input.keyId || input.use !== false) throw new ToolInputError({ message: "To revoke a grant, provide keyId and use:false. To grant a saved key, open credential_copy_from_project." });
        await authorize({ ctx, permission: "custom-credentials.read" });
        const row = (await available().listGranted({})).find(row => row.keyId === input.keyId);
        if (!row) throw new ToolInputError({ message: "This key is not granted to this site. Open Use a saved key to choose it in the owner's card." });
        await authorize({ ctx, permission: await available().permissionFor({ keyId: row.keyId }) });
        ctx.signal.throwIfAborted();
        return { ...await available().use({ keyId: row.keyId, use: false }), usedBy: [] };
      },
      // The shared Jini approval lifecycle freezes the call and binds the actor; no supervisor = no card.
      site_restart: approvalToolHandler({ surfaces,
        prepare: async ({ ctx }) => {
          empty(ctx.input);
          await authorize({ ctx, permission: "admin.plugins.enable" });
          return { restart };
        },
        describe: () => ({ toolId: "site_restart", errorCode: "SITE_RESTART", title: "Restart this site?", warning: "Unsaved work and running chats will be lost.", details: [], confirmLabel: "Restart this site" }),
        run: async ({ ctx, prepared }) => {
          if (!prepared.restart) return { restarted: false, message: "Restart the site from the Sites list" };
          ctx.signal.throwIfAborted();
          await authorize({ ctx, permission: "admin.plugins.enable" });
          const decision = await prepared.restart.requestRestart({ reason: "provider-settings-live-apply" }, { awaitAcceptance: true });
          if (!decision) return { restarted: false, reason: "The dev supervisor did not confirm the restart request." };
          if (!decision.accepted) return { restarted: false, reason: decision.reason };
          return { restartRequested: true, message: "The dev supervisor accepted the restart request." };
        },
      }, { ask: ({ prepared }) => prepared.restart !== null, declined: ({ reason }) => ({ restarted: false, reason }) }),
    } });
}
