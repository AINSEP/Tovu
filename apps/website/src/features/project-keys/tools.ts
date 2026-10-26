import { buildDomainRegistrations, indexCatalogById, requireInputRecord, ToolInputError, type AgentToolDefinition, type ToolExecutionContext, type DerivedRiskByToolId } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import { requireHumanConfirm } from "../../contracts/core/human-confirm.js";
import { toolMetadata } from "../../contracts/core/tool-metadata/custom-credentials.js";
import type { DevRestartPort } from "../../platform/dev-supervisor/dev-restart.js";
import type { PluginCredentialCard } from "../custom-credentials/plugin-credential-card.js";
import type { ProjectKeysPort } from "./service.js";

export const projectKeysCatalog: AgentToolDefinition[] = [
  { name: "project_keys_list", description: "List keys saved in this project, their keyId, name, kind, usedByThisSite and usedBy sites. Never returns a key value. Ask before using a saved key on this site.", sideEffects: "none", authorization: { permission: "custom-credentials.read" }, inputSchema: { type: "object", additionalProperties: false, properties: {} } },
  { name: "project_key_use", description: "Use or stop using a saved project key on this site. Call after the person answers the apply question. Credentials apply now; providers apply now or report restart. No additional confirmation dialog.", sideEffects: "mutates-durable-state", authorization: { permission: "resolved-per-kind" }, inputSchema: { type: "object", additionalProperties: false, required: ["keyId", "use"], properties: { keyId: { type: "string", minLength: 1 }, use: { type: "boolean" } } } },
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
        return { keys: await available().list({ cards: await loadCards() }) };
      },
      project_key_use: async ctx => {
        const input = requireInputRecord({ input: ctx.input });
        if (Object.keys(input).some(key => key !== "keyId" && key !== "use") || typeof input.keyId !== "string" || !input.keyId || typeof input.use !== "boolean") throw new ToolInputError({ message: "project_key_use requires keyId and use (true or false)." });
        const keyId = input.keyId;
        await authorize({ ctx, permission: "custom-credentials.read" });
        // Attachment uses exactly the permission of the domain that owns saving this key.
        await authorize({ ctx, permission: await available().permissionFor({ keyId }) });
        ctx.signal.throwIfAborted();
        return available().use({ keyId, use: input.use });
      },
      site_restart: async (ctx, options = {}) => {
        empty(ctx.input);
        await authorize({ ctx, permission: "admin.plugins.enable" });
        if (!restart) return { restarted: false, message: "Restart the site from the Sites list" };
        const answer = await requireHumanConfirm({ ctx, surfaces, spec: { toolId: "site_restart", errorCode: "SITE_RESTART", title: "Restart this site?", warning: "Unsaved work and running chats will be lost.", details: [], confirmLabel: "Restart this site" } }, options);
        if (!answer.confirmed) return { restarted: false, reason: answer.reason };
        ctx.signal.throwIfAborted();
        await authorize({ ctx, permission: "admin.plugins.enable" });
        const decision = await restart.requestRestart({ reason: "provider-settings-live-apply" }, { awaitAcceptance: true });
        if (!decision) return { restarted: false, reason: "The dev supervisor did not confirm the restart request." };
        if (!decision.accepted) return { restarted: false, reason: decision.reason };
        return { restartRequested: true, message: "The dev supervisor accepted the restart request." };
      },
    } });
}
