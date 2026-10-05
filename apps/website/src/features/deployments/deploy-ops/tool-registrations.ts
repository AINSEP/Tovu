import { nowIso } from "@jini-ai/core/primitives";
import { ToolInputError } from "@jini-ai/core";
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import type { ToolContributor } from "#src/assistant/index";
import { getDeployOpsAgentToolCatalog } from "./agent-tools.js";
import { MAX_WAIT_SECONDS, runDeploy, runDeployOps, waitForDeployOps, type DeployOpsToolDeps } from "./run-ops.js";
import type { DeployOpsInput, DeployOpsRegistry } from "./types.js";
export type { DeployOpsToolDeps } from "./run-ops.js";
export const deployOpsDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> gated installed registry, credential summaries, makeCredentialedRequest(GET), audit.
  ["deployment_ops_status", "none"],
  // -> same GET facade, vendor module returns bounded log lines; no writes.
  ["deployment_ops_logs", "none"],
  // -> repeated status GETs and abortable bounded sleeps; no deploy action.
  ["deployment_ops_wait", "none"],
  // -> credential summary and listTargets(GET), audit only.
  ["deployment_ops_list_targets", "none"],
  // -> same bound facade with send(POST/PATCH/PUT); starts an external deploy on the vendor platform.
  ["deployment_ops_deploy", "mutates-durable-state"],
]);
/** Read a bounded string; JSON schema alone cannot protect direct calls to the handler. */
function string(input: Record<string, unknown>, key: string, required = false): string | undefined {
  const value = input[key];
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > 200) throw new ToolInputError({ message: `${key} must be a non-empty string of at most 200 characters.` });
  return value;
}
/** Enforce integer bounds even when a caller bypasses schema validation. */
function integer(input: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  const value = input[key] === undefined ? fallback : input[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new ToolInputError({ message: `${key} must be an integer from ${min} to ${max}.` });
  return value;
}
/** Validate deploy input independently of the schema, then call the same feature function as the admin route. */
function deployHandler(deps: DeployOpsToolDeps, input: Record<string, unknown>, signal?: AbortSignal) {
  for (const key of Object.keys(input)) if (!["platform", "target", "ref", "credentialLabel"].includes(key)) throw new ToolInputError({ message: `Unexpected deployment ops input '${key}'.` });
  const ref = string(input, "ref"); const credentialLabel = string(input, "credentialLabel");
  return runDeploy({ deps, input: { platform: string(input, "platform", true)!, target: string(input, "target", true)!, ...(ref !== undefined ? { ref } : {}), ...(credentialLabel !== undefined ? { credentialLabel } : {}) } }, { signal });
}
/** Permission precedes any plugin/credential read. Handler input validation is independent of the schema. */
export function buildDeployOpsRegistrations(deps: DeployOpsToolDeps): ToolRegistration[] {
  const catalog = getDeployOpsAgentToolCatalog(deps.deployOpsRegistry);
  const handlers: Record<string, ToolHandler> = {};
  for (const tool of catalog) handlers[tool.name] = async ctx => {
    await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: tool.authorization.permission }, { entityType: "deploy-ops" });
    const input = requireInputRecord({ input: ctx.input });
    if (tool.name === "deployment_ops_deploy") return deployHandler(deps, input, ctx.signal);
    const isList = tool.name === "deployment_ops_list_targets";
    const allowed = isList ? ["platform", "credentialLabel", "org"] : ["platform", "target", "credentialLabel", "runId", "branch", ...(tool.name === "deployment_ops_logs" ? ["limit"] : []), ...(tool.name === "deployment_ops_wait" ? ["until", "timeoutSeconds"] : [])];
    for (const key of Object.keys(input)) if (!allowed.includes(key)) throw new ToolInputError({ message: `Unexpected deployment ops input '${key}'.` });
    const args: DeployOpsInput = { platform: string(input, "platform", true)!, target: isList ? "" : string(input, "target", true)!, credentialLabel: string(input, "credentialLabel"), ...(isList ? { org: string(input, "org") } : { runId: string(input, "runId"), branch: string(input, "branch") }) };
    if (tool.name === "deployment_ops_list_targets") return runDeployOps(deps, args, "listTargets", ctx.signal);
    if (tool.name === "deployment_ops_logs") return runDeployOps(deps, { ...args, limit: integer(input, "limit", 100, 1, 500) }, "logs", ctx.signal);
    if (tool.name === "deployment_ops_status") return runDeployOps(deps, args, "status", ctx.signal);
    if (input.until !== "healthy" && input.until !== "finished") throw new ToolInputError({ message: "until must be 'healthy' or 'finished'." });
    return waitForDeployOps({ status: signal => runDeployOps(deps, args, "status", signal), clock: deps.waitClock, initial: { platform: args.platform, target: args.target, state: "unknown", summary: "No status received before timeout.", items: [], checkedAt: nowIso({ clock: deps.clock }) } }, { until: input.until, timeoutSeconds: integer(input, "timeoutSeconds", 180, 10, MAX_WAIT_SECONDS), signal: ctx.signal });
  };
  return buildDomainRegistrations({ domain: "deploy-ops", catalogModule: "features/deployments/deploy-ops/agent-tools.ts", catalog: indexCatalogById({ catalog: catalog }), handlers, derivedRisk: deployOpsDerivedRisk });
}
/** Contribute four read-only tools and the deploy tool; the composition root supplies a gated registry for daemon schemas. */
export function contributeDeployOpsTools(options: { registry?: DeployOpsRegistry } = {}): ToolContributor {
  return { domain: "deploy-ops", build: deps => buildDeployOpsRegistrations({ ...deps, ...(options.registry ? { deployOpsRegistry: options.registry } : {}) }), risk: deployOpsDerivedRisk };
}
