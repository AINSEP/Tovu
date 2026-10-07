import { collectTypedDeploySecret } from "./typed-secret-card.js";
import { nowIso } from "@jini-ai/core/primitives";
import { ToolInputError } from "@jini-ai/core";
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import type { ToolContributor } from "#src/assistant/index";
import { notConfirmedResult, requireHumanConfirm } from "#src/contracts/core/human-confirm";
import type { AssistantSurfaceDeps } from "#src/contracts/core/tool-surface-exchanges";
import { SITE_KEY_MANAGE_PERMISSION } from "#src/features/identity/site-key-permission";
import type { ToolExecutionContext, ToolExecutionOptions } from "@jini-ai/core";
import { runListSecrets, runSetSecret, runUnsetSecret, type SecretConfirm, type SecretConfirmRequest, type SecretValueSource } from "./secrets.js";
import { getDeployOpsAgentToolCatalog } from "./agent-tools.js";
import { DeployCredentialSetupRequired, MAX_WAIT_SECONDS, runDeploy, runDeployOps, waitForDeployOps, type DeployOpsToolDeps } from "./run-ops.js";
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
  // -> same GET facade, adapter listSecrets: names/digests only; no writes.
  ["deployment_ops_list_secrets", "none"],
  // -> send(POST) through the adapter's setSecret; replacing an existing value asks a human first.
  ["deployment_ops_set_secret", "mutates-durable-state"],
  // -> send(DELETE) through the adapter's unsetSecret, only after a human confirms.
  ["deployment_ops_unset_secret", "deletes-durable-state"],
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
function onlyKeys(input: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(input)) if (!allowed.includes(key)) throw new ToolInputError({ message: `Unexpected deployment ops input '${key}'.` });
}
/** `source` is a closed shape: a value can never ride in on it. O(1). */
function valueSource(raw: unknown): SecretValueSource {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new ToolInputError({ message: "source must be {kind:'typed'}, {kind:'site-key'} or {kind:'secret', name}." });
  const record = raw as Record<string, unknown>;
  if (record.kind === "typed" && Object.keys(record).length === 1) return { kind: "typed" };
  if (record.kind === "site-key" && Object.keys(record).length === 1) return { kind: "site-key" };
  if (record.kind === "secret" && typeof record.name === "string" && Object.keys(record).length === 2) return { kind: "secret", name: record.name };
  throw new ToolInputError({ message: "source must be {kind:'typed'}, {kind:'site-key'} or {kind:'secret', name}." });
}
type Permit = (permission: string) => Promise<void>;
const TAKES_EFFECT: Record<SecretConfirmRequest["appliesOn"], string> = { "next-deploy": "on the next deploy", "vendor-restart": "after the platform restarts the app", immediately: "immediately" };
/** The card names exactly what runs; the permission is re-checked after the human answers. Literal tool ids keep the MCP-UI allowlist scan exact. */
function secretConfirm(ctx: ToolExecutionContext, surfaces: AssistantSurfaceDeps | undefined, options: ToolExecutionOptions | undefined, permit: Permit): SecretConfirm | undefined {
  if (!surfaces) return undefined;
  const details = (request: SecretConfirmRequest) => [
    { label: "Platform", value: request.platform }, { label: "Target", value: request.target }, { label: "Secret", value: request.name },
    ...(request.source ? [{ label: "New value from", value: request.source }, { label: "Current value", value: request.comparison === "different" ? "different from the new value" : "could not be read to compare" }] : []),
    { label: "Takes effect", value: TAKES_EFFECT[request.appliesOn] },
  ];
  return async request => {
    const outcome = request.action === "remove"
      ? await requireHumanConfirm({ ctx, surfaces, spec: { toolId: "deployment_ops_unset_secret", errorCode: "DEPLOY_OPS", title: `Remove secret ${request.name} from ${request.target}?`, description: "The platform deletes this environment variable. Tovu cannot restore its value.", details: details(request), warning: "An app that still reads this variable may fail to boot after the next deploy.", danger: true, confirmLabel: "Remove secret" } }, options)
      : await requireHumanConfirm({ ctx, surfaces, spec: { toolId: "deployment_ops_set_secret", errorCode: "DEPLOY_OPS", title: `Replace secret ${request.name} on ${request.target}?`, description: "The current value is overwritten. Tovu cannot restore it.", details: details(request), danger: true, confirmLabel: "Replace secret" } }, options);
    if (!outcome.confirmed) return { confirmed: false, result: notConfirmedResult(outcome) };
    await permit("custom-credentials.write");
    return { confirmed: true };
  };
}
const SECRET_KEYS: Record<string, readonly string[]> = {
  deployment_ops_list_secrets: ["platform", "target", "credentialLabel"],
  deployment_ops_unset_secret: ["platform", "target", "credentialLabel", "name"],
  deployment_ops_set_secret: ["platform", "target", "credentialLabel", "name", "source", "dryRun"],
};
/** Secrets handlers: validation independent of the schema; copying the site key also needs the site-key permission. */
function secretsHandler(deps: DeployOpsToolDeps, surfaces: AssistantSurfaceDeps | undefined, name: string, permit: Permit): ToolHandler {
  return async (ctx, options) => {
    const input = requireInputRecord({ input: ctx.input });
    onlyKeys(input, SECRET_KEYS[name]!);
    const target = { platform: string(input, "platform", true)!, target: string(input, "target", true)!, credentialLabel: string(input, "credentialLabel") };
    if (name === "deployment_ops_list_secrets") return runListSecrets({ deps, input: target }, { signal: ctx.signal });
    const optional = { signal: ctx.signal, confirm: secretConfirm(ctx, surfaces, options, permit) };
    if (name === "deployment_ops_unset_secret") return runUnsetSecret({ deps, input: { ...target, name: string(input, "name", true)! } }, optional);
    const source = valueSource(input.source);
    if (input.dryRun !== undefined && typeof input.dryRun !== "boolean") throw new ToolInputError({ message: "dryRun must be a boolean." });
    if (source.kind === "site-key") await permit(SITE_KEY_MANAGE_PERMISSION);
    const setInput = { ...target, name: string(input, "name", true)!, source, dryRun: input.dryRun === true };
    if (source.kind === "typed") return collectTypedDeploySecret({ ctx, deps, surfaces, input: setInput, permit: () => permit("custom-credentials.write") }, { ...options, confirm: optional.confirm });
    return runSetSecret({ deps, input: setInput }, optional);
  };
}
const SECRET_TOOLS = ["deployment_ops_list_secrets", "deployment_ops_set_secret", "deployment_ops_unset_secret"];
/** Permission precedes any plugin/credential read. Handler input validation is independent of the schema. */
export function buildDeployOpsRegistrations(deps: DeployOpsToolDeps, surfaces?: AssistantSurfaceDeps): ToolRegistration[] {
  const catalog = getDeployOpsAgentToolCatalog(deps.deployOpsRegistry);
  const handlers: Record<string, ToolHandler> = {};
  for (const tool of catalog) handlers[tool.name] = async (ctx, options) => {
    try {
      const permit: Permit = permission => requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission }, { entityType: "deploy-ops" });
      await permit(tool.authorization.permission);
      if (SECRET_TOOLS.includes(tool.name)) return await secretsHandler(deps, surfaces, tool.name, permit)(ctx, options);
      const input = requireInputRecord({ input: ctx.input });
      if (tool.name === "deployment_ops_deploy") return await deployHandler(deps, input, ctx.signal);
      const isList = tool.name === "deployment_ops_list_targets";
      const allowed = isList ? ["platform", "credentialLabel", "org"] : ["platform", "target", "credentialLabel", "runId", "branch", ...(tool.name === "deployment_ops_logs" ? ["limit"] : []), ...(tool.name === "deployment_ops_wait" ? ["until", "timeoutSeconds"] : [])];
      for (const key of Object.keys(input)) if (!allowed.includes(key)) throw new ToolInputError({ message: `Unexpected deployment ops input '${key}'.` });
      const args: DeployOpsInput = { platform: string(input, "platform", true)!, target: isList ? "" : string(input, "target", true)!, credentialLabel: string(input, "credentialLabel"), ...(isList ? { org: string(input, "org") } : { runId: string(input, "runId"), branch: string(input, "branch") }) };
      if (tool.name === "deployment_ops_list_targets") return await runDeployOps(deps, args, "listTargets", ctx.signal);
      if (tool.name === "deployment_ops_logs") return await runDeployOps(deps, { ...args, limit: integer(input, "limit", 100, 1, 500) }, "logs", ctx.signal);
      if (tool.name === "deployment_ops_status") return await runDeployOps(deps, args, "status", ctx.signal);
      if (input.until !== "healthy" && input.until !== "finished") throw new ToolInputError({ message: "until must be 'healthy' or 'finished'." });
      return await waitForDeployOps({ status: signal => runDeployOps(deps, args, "status", signal), clock: deps.waitClock, initial: { platform: args.platform, target: args.target, state: "unknown", summary: "No status received before timeout.", items: [], checkedAt: nowIso({ clock: deps.clock }) } }, { until: input.until, timeoutSeconds: integer(input, "timeoutSeconds", 180, 10, MAX_WAIT_SECONDS), signal: ctx.signal });
    } catch (error) {
      if (error instanceof DeployCredentialSetupRequired) return { executed: false, credentialSetup: error.credentialSetup };
      throw error;
    }
  };
  return buildDomainRegistrations({ domain: "deploy-ops", catalogModule: "features/deployments/deploy-ops/agent-tools.ts", catalog: indexCatalogById({ catalog: catalog }), handlers, derivedRisk: deployOpsDerivedRisk });
}
/** Contribute five read-only tools, the deploy tool and the secret writers; the composition root supplies a gated registry for daemon schemas. */
export function contributeDeployOpsTools(options: { registry?: DeployOpsRegistry } = {}): ToolContributor {
  return { domain: "deploy-ops", build: (deps, surfaces) => buildDeployOpsRegistrations({ ...deps, ...(options.registry ? { deployOpsRegistry: options.registry } : {}) }, surfaces), risk: deployOpsDerivedRisk };
}
