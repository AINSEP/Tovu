import { toolMetadata } from '../../contracts/core/tool-metadata/external-mcp.js';
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolRegistration } from "@jini-ai/core";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import { ToolInputError } from "@jini-ai/core";
import type { ToolContributor } from "#src/assistant/index";
import { createRateLimiter, OUTBOUND_CALL_PER_IP } from "../../contracts/core/rate-limit/rate-limit.js";
import { type AgentToolDefinition } from "@jini-ai/core";
import { EXTERNAL_MCP_MANAGE_PERMISSION } from "./agent-tools.js";
import type { ExternalMcpToolDeps } from "./deps.js";

/** Composition injects the same services the External MCP admin routes call. Secrets stay in those services. */
export interface ExternalMcpOperations {
  probe(deps: ExternalMcpToolDeps, serverId: string): Promise<
    { readonly ok: true; readonly body: { readonly tools: readonly unknown[]; readonly probedAt: string } }
    | { readonly ok: false; readonly status: number; readonly body: Readonly<Record<string, unknown>> }
  >;
  admissions(): Promise<
    { readonly ok: true; readonly connections: unknown; readonly configFailures?: unknown }
    | { readonly ok: false; readonly body: { readonly error: string; readonly code: "AGENT_DAEMON_UNAVAILABLE" } }
  >;
}

export const externalMcpOperationsToolCatalog: readonly AgentToolDefinition[] = [
  {
    name: "external_mcp_probe_connection",
    description: "Tests a saved, enabled hosted external MCP connection by connecting once, listing advertised tools and closing, just like the admin External MCP page's probe. Call to check live reachability and see which remote tools would be allowed or refused. Returns { tools, probedAt }; does not invoke remote tools or change the assistant's live roster. May refresh and persist an OAuth grant. Refuses unknown, disabled or local-command servers, expired authorization, unreachable endpoints and excessive attempts. Use external_mcp_test_connection for a configuration-only check without a remote connection; use external_mcp_get_admissions for the actual live roster.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: EXTERNAL_MCP_MANAGE_PERMISSION },
    inputSchema: { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string", minLength: 1, maxLength: 64, description: "A saved hosted server id from content_read.external_mcp." } } },
  },
  {
    name: "external_mcp_get_admissions",
    description: "Reads the assistant daemon's current external MCP tool admissions: the tools actually admitted, refused, missing from allowlists, and configuration failures. Call when saved tool selections differ from what the assistant can use. Returns { connections, configFailures? }, preserving the live daemon report. Read-only; does not connect to vendors, change server settings or grant tool access. An unavailable daemon produces an actionable error, never an empty roster. Use content_read.external_mcp for saved server configuration and status, external_mcp_probe_connection to test a hosted endpoint, or external_mcp_save to open the human setup form.",
    sideEffects: "none",
    authorization: { permission: EXTERNAL_MCP_MANAGE_PERMISSION },
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
  },
];

export const externalMcpOperationsDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // probeExternalMcpServer -> readEnabledExternalMcpConfigs -> OAuth token resolution may persist a refreshed grant.
  ["external_mcp_probe_connection", "mutates-durable-state"],
  // fetchDaemonAdmissions -> bounded authenticated GET to the local daemon; no writes.
  ["external_mcp_get_admissions", "none"],
]);

/** Rejects secret-bearing or unsupported arguments before any I/O, including direct delegated calls.
 * @param input - Model arguments; omitted arguments mean an empty object.
 * @param toolId - Tool name used in the recovery message.
 * @param allowedKeys - The complete non-secret field allowlist.
 * @returns The validated argument record.
 * @throws {ToolInputError} For non-object input or fields outside the allowlist.
 * @complexity O(k) time and space for input keys (allowlists contain at most one key).
 */
function readOperationInput(input: unknown, toolId: string, allowedKeys: readonly string[]): Record<string, unknown> {
  const record = requireInputRecord({ input: input ?? {} });
  if (Object.keys(record).some(key => !allowedKeys.includes(key))) throw new ToolInputError({ message: `${toolId}: unsupported input fields. Never pass credentials through tool arguments.` });
  return record;
}

/** Builds two diagnostics handlers. Permission runs before I/O; live probes share a workspace budget.
 * @param deps - Workspace, permission checker and clock shared with the setup tools.
 * @param operations - Shared admin probe and daemon admissions services, injected by composition.
 * @returns Registrations for the hosted probe and read-only live admissions tools.
 * @throws {ToolInputError} Handlers refuse invalid arguments, rate limits or unavailable services.
 * @complexity O(1) wiring; services bound their own I/O and collection costs.
 */
export function buildExternalMcpOperationsRegistrations(deps: ExternalMcpToolDeps, operations: ExternalMcpOperations): ToolRegistration[] {
  const limiter = createRateLimiter({ profile: OUTBOUND_CALL_PER_IP, clock: deps.clock });
  return buildDomainRegistrations({ metadata: toolMetadata,
    domain: "external-mcp-operations",
    catalogModule: "features/external-mcp/operations-tools.ts",
    catalog: indexCatalogById({ catalog: externalMcpOperationsToolCatalog }),
    derivedRisk: externalMcpOperationsDerivedRisk,
    handlers: {
      external_mcp_probe_connection: async ctx => {
        const input = readOperationInput(ctx.input, "external_mcp_probe_connection", ["id"]);
        if (typeof input.id !== "string" || !input.id.trim() || input.id.length > 64) throw new ToolInputError({ message: "external_mcp_probe_connection: pass a non-empty saved server id. Use content_read.external_mcp to find it." });
        const id = input.id.trim();
        await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }),
        workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: EXTERNAL_MCP_MANAGE_PERMISSION }, { entityType: "integration", entityId: id });
        const budget = await limiter.check({ key: deps.workspaceId });
        if (!budget.allowed) throw new ToolInputError({ message: `external_mcp_probe_connection: too many probe attempts. Try again in ${budget.retryAfterSeconds} seconds.` });
        const result = await operations.probe(deps, id);
        if (!result.ok) throw new ToolInputError({ message: `external_mcp_probe_connection: ${result.body.error}. Review the server in Settings → External MCP; use external_mcp_test_connection for a configuration-only check.` });
        return result.body;
      },
      external_mcp_get_admissions: async ctx => {
        readOperationInput(ctx.input, "external_mcp_get_admissions", []);
        await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }),
        workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: EXTERNAL_MCP_MANAGE_PERMISSION }, { entityType: "integration" });
        const result = await operations.admissions();
        if (!result.ok) throw new ToolInputError({ message: `external_mcp_get_admissions: ${result.body.error}. Start the assistant and try again; no live admissions report is available.` });
        return result.configFailures === undefined ? { connections: result.connections } : { connections: result.connections, configFailures: result.configFailures };
      },
    },
  });
}

/** Adds diagnostics under a distinct domain so the existing setup/OAuth contributor remains installed.
 * @param operations - Shared admin services; no credentials are exposed through tool arguments.
 * @returns The contributor installed by the composition root.
 * @example contributeExternalMcpOperationsTools({ probe: probeExternalMcpServer, admissions: fetchDaemonAdmissions })
 * @complexity O(1) time and space.
 */
export function contributeExternalMcpOperationsTools(operations: ExternalMcpOperations): ToolContributor {
  return { domain: "external-mcp-operations", build: deps => buildExternalMcpOperationsRegistrations(deps, operations), risk: externalMcpOperationsDerivedRisk };
}
