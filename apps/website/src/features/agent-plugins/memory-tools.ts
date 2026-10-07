import { withExtensionApprovalPolicy } from '../../contracts/headless/assistant-tool-approval-policy.js';
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, requireString,
  type AgentToolDefinition, type AgentToolSideEffect, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { pluginMemory } from "./memory.js";

interface Identity { readonly id: string; readonly pluginId: string; readonly archiveDigest: string; }
/** Every capability closes over its owning plugin. Caller-controlled ids/kinds are rejected. */
export function buildPluginMemoryRegistrations(required: {
  sources: readonly Identity[]; workspaceId: string;
  gate: { isCallable(plugin: { pluginId: string; archiveDigest: string }): Promise<boolean> };
}, _optional: {} = {}): ToolRegistration[] {
  const catalog: AgentToolDefinition[] = [];
  const handlers: Record<string, ToolHandler> = {};
  const risk = new Map<string, AgentToolSideEffect>();
  const owners = new Map<string, Identity>();
  const approvalFamilies = new Map<string, 'plugin-memory-read' | 'plugin-memory-write'>();
  for (const source of required.sources) {
    for (const operation of ["read", "write"] as const) {
      const id = `${source.id}__memory_${operation}`;
      const sideEffects = operation === "read" ? "none" : "mutates-durable-state";
      catalog.push({ name: id, description: `${operation === "read" ? "Read" : "Refresh"} ${source.pluginId}'s learned account knowledge. UTF-8 text only. Never credentials or permissions.`,
        sideEffects, authorization: { permission: "admin.assistant.use" },
        inputSchema: { type: "object", additionalProperties: false, required: operation === "read" ? ["entryPath"] : ["entryPath", "text"],
          properties: { entryPath: { type: "string" }, ...(operation === "write" ? { text: { type: "string" } } : {}) } },
      });
      owners.set(id, source); risk.set(id, sideEffects);
      approvalFamilies.set(id, operation === "read" ? 'plugin-memory-read' : 'plugin-memory-write');
      handlers[id] = async ctx => {
        const input = requireInputRecord({ input: ctx.input });
        const allowed = operation === "read" ? ["entryPath"] : ["entryPath", "text"];
        if (Object.keys(input).some(key => !allowed.includes(key))) throw new Error("Memory tool accepts no plugin id, kind, or other fields");
        const entryPath = requireString({ input, key: "entryPath" });
        const memory = pluginMemory({ workspaceId: required.workspaceId, pluginId: source.pluginId });
        if (operation === "read") return { pluginId: source.pluginId, entryPath, text: await memory.learned.read({ entryPath }) };
        return memory.learned.write({ entryPath, text: requireString({ input, key: "text" }) });
      };
    }
  }
  return buildDomainRegistrations({ domain: "agent-plugin-memory", catalogModule: "features/agent-plugins/memory-tools.ts",
    catalog: indexCatalogById({ catalog }), handlers, derivedRisk: risk,
  }).map(registration => {
    const owner = owners.get(registration.descriptor.id)!;
    const policy = registration.policy;
    return withExtensionApprovalPolicy({ registration: { ...registration, policy: { authorize: async ctx =>
      (await required.gate.isCallable(owner)) ? policy.authorize(ctx) : "deny" } },
      family: approvalFamilies.get(registration.descriptor.id)! });
  });
}
