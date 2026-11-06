/** Admin assistant adapter; no public executor or generic settings path enters these handlers. */
import { buildDomainRegistrations, indexCatalogById, ToolInputError, type AccessApprovalResource, type DerivedRiskByToolId, type ToolRegistration } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import type { ToolContributor } from "@jini-ai/core";
import { approvalToolHandler } from "../../contracts/core/human-confirm.js";
import { toolMetadata } from "../../contracts/core/tool-metadata/visitor-tools.js";
import { visitorToolsObject, VisitorToolPolicyValidationError } from "../../contracts/site-assistant/visitor-tools.js";
import type { VisitorToolsManagementPort, PreparedVisitorToolsChange } from "../../contracts/site-assistant/visitor-tools-management.js";
import { visitorToolsAgentCatalog } from "./visitor-tools-agent-tools.js";
import { VisitorToolsRevisionConflictError } from "./visitor-tools-write.js";

export interface VisitorToolsToolDeps { readonly workspaceId: string; readonly visitorToolsManagement?: VisitorToolsManagementPort }
/** Derived from current handlers: only configure writes. T4 must change save/delete risk with its implementation. */
export const visitorToolsDerivedRisk: DerivedRiskByToolId = new Map([
  ["visitor_tools_list", "none"], ["visitor_tool_configure", "mutates-durable-state"], ["visitor_tool_save", "none"], ["visitor_tool_delete", "none"],
]);

/** Give the model actionable revision/input guidance; infrastructure/auth faults stay failures. */
async function toolResult({ run }: { run: () => Promise<unknown> }, _options = {}): Promise<unknown> {
  try { return await run(); } catch (error) {
    if (error instanceof VisitorToolsRevisionConflictError) return { changed: false, code: "VISITOR_TOOLS_REVISION_CONFLICT", reload: true, note: error.message };
    if (error instanceof VisitorToolPolicyValidationError) throw new ToolInputError({ message: error.message });
    throw error;
  }
}

/** Source publication disclosures stay attached to the fixed proposal, outside editable grants. */
function publicationDetails({ tool }: PreparedVisitorToolsChange["changes"][number], _options = {}) {
  return tool.publication ? [
    { label: "Sends requests to", value: tool.publication.endpoint },
    { label: "Uses credential", value: tool.publication.credentialId },
    { label: "Shares fields", value: tool.publication.returnedFields.join(", ") },
  ] : [];
}

/** Human labels keep policy implementation fields out of the approval display. */
function accessValue({ choice }: { choice: PreparedVisitorToolsChange["changes"][number]["next"] }, _options = {}) {
  const names = { off: "Off", ask: "Ask", auto: "Auto" };
  return { Mode: names[choice.mode], "Per visitor": `${choice.limits.perIpPerHour.toLocaleString("en-US")}/hour`,
    "Whole site": `${choice.limits.perSitePerDay.toLocaleString("en-US")}/day` };
}

/** Both the settings revision and source-owned contract remain bound by apply's comparison. */
function accessResource({ change, prepared, personId, siteId }: {
  change: PreparedVisitorToolsChange["changes"][number]; prepared: PreparedVisitorToolsChange; personId: string; siteId: string;
}, _options = {}): AccessApprovalResource {
  return { id: change.tool.id, label: change.tool.title, scope: { personId, siteId },
    previous: accessValue({ choice: change.previous }), proposed: accessValue({ choice: change.next }),
    revision: `${prepared.revisionSeq}:${change.tool.sourceRevision}` };
}

/** Build the reviewed four-tool catalog with the shared approval engine and an always-fresh card.
 * @throws ToolInputError for invalid input/uncomposed roots; permission/storage errors propagate.
 * @complexity O(1) registration; service operations are bounded to 128 tools.
 * @example buildVisitorToolsRegistrations({ deps: {workspaceId, visitorToolsManagement}, surfaces: {surfaceExchanges} });
 */
export function buildVisitorToolsRegistrations({ deps, surfaces }: {
  deps: VisitorToolsToolDeps; surfaces: AssistantSurfaceDeps;
}, _options = {}): ToolRegistration[] {
  const service = (): VisitorToolsManagementPort => {
    if (!deps.visitorToolsManagement) throw new ToolInputError({ message: "Visitor-tools management is unavailable in this server." });
    return deps.visitorToolsManagement;
  };
  const configure = approvalToolHandler({ surfaces,
    prepare: ({ ctx }) => service().prepare({ callerPrincipalId: ctx.principal.id, input: ctx.input }),
    describe: ({ ctx, prepared }) => ({ toolId: "visitor_tool_configure", errorCode: "VISITOR_TOOLS", title: "Change public visitor tool access?",
      description: "This changes what anonymous visitors may access. Your confirmation applies only to these changes and is never remembered.",
      details: prepared.changes.flatMap(change => publicationDetails(change)), confirmLabel: "Confirm public access",
      ...(prepared.requiresApproval ? { access: { resources: prepared.changes.map(change => accessResource({ change, prepared, personId: ctx.principal.id, siteId: deps.workspaceId })) } } : {}),
    }),
    run: ({ ctx, prepared }) => service().apply({ callerPrincipalId: ctx.principal.id, prepared }),
  }, { ask: ({ prepared }) => prepared.requiresApproval, remembered: undefined, flag: "changed" });
  return buildDomainRegistrations({ domain: "visitor-tools", catalogModule: "features/settings/visitor-tools-agent-tools.ts", metadata: toolMetadata,
    catalog: indexCatalogById({ catalog: visitorToolsAgentCatalog }), derivedRisk: visitorToolsDerivedRisk,
    handlers: {
      visitor_tools_list: ctx => toolResult({ run: async () => {
        visitorToolsObject({ value: ctx.input, keys: [] });
        return service().list({ callerPrincipalId: ctx.principal.id });
      } }),
      visitor_tool_configure: (ctx, options) => toolResult({ run: () => configure(ctx, options) }),
      visitor_tool_save: ctx => toolResult({ run: async () => {
        visitorToolsObject({ value: ctx.input, keys: [] });
        await service().list({ callerPrincipalId: ctx.principal.id });
        return { available: false, code: "VISITOR_TOOLS_T4_REQUIRED" };
      } }),
      visitor_tool_delete: ctx => toolResult({ run: async () => {
        const input = visitorToolsObject({ value: ctx.input, keys: ["toolId"] });
        if (typeof input.toolId !== "string" || !input.toolId.trim()) throw new ToolInputError({ message: "Supply a created toolId. Deletion is deferred to T4." });
        await service().list({ callerPrincipalId: ctx.principal.id });
        return { available: false, code: "VISITOR_TOOLS_T4_REQUIRED" };
      } }),
    } });
}

/** Explicit composition registration, with no import-time mutation. */
export function contributeVisitorTools(_required: Record<string, never> = {}, _options = {}): ToolContributor<VisitorToolsToolDeps, AssistantSurfaceDeps> {
  return { domain: "visitor-tools", build: (deps, surfaces) => buildVisitorToolsRegistrations({ deps, surfaces }), risk: visitorToolsDerivedRisk };
}
