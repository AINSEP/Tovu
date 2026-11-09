import type { ChatDeleteSurfaceDeps } from '#src/contracts/core/chat-delete-grant';
import { toolMetadata } from '../../../contracts/core/tool-metadata/deploy-ops.js';
import { bindDeploySecretCards } from './typed-secret-card.js';
import { adaptLegacyAuthorize, requireToolPermission, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolContributor, type ToolExecutionContext, type ToolExecutionOptions } from '@jini-ai/core';
import { notConfirmedResult, approvalToolHandler } from '#src/contracts/core/human-confirm';
import { SITE_KEY_MANAGE_PERMISSION } from '#src/features/identity/site-key-permission';
import type { SecretConfirmRequest, SecretConfirm } from './secrets.js';
import { getDeployOpsAgentToolCatalog } from './agent-tools.js';
import { bindDeployOpsRuntime, type DeployOpsToolDeps } from './run-ops.js';
import type { DeployOpsRegistry } from './types.js';
import { buildDeployOpsRegistrations as build } from '@jini-ai/devops/deploy';
export type { DeployOpsToolDeps } from './run-ops.js';
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
type Permit = (permission: string) => Promise<void>;
const TAKES_EFFECT: Record<SecretConfirmRequest["appliesOn"], string> = { "next-deploy": "on the next deploy", "vendor-restart": "after the platform restarts the app", immediately: "immediately" };
/** The card names exactly what runs; the permission is re-checked after the human answers. Literal tool ids keep the MCP-UI allowlist scan exact. */
function secretConfirm(ctx: ToolExecutionContext, surfaces: ChatDeleteSurfaceDeps | undefined, options: ToolExecutionOptions | undefined, permit: Permit): SecretConfirm | undefined {
  if (!surfaces) return undefined;
  const details = (request: SecretConfirmRequest) => [
    { label: "Count", value: "1" }, { label: "Platform", value: request.platform }, { label: "Target", value: request.target }, { label: "Secret", value: request.name },
    ...(request.source ? [{ label: "New value from", value: request.source }, { label: "Current value", value: request.comparison === "different" ? "different from the new value" : "could not be read to compare" }] : []),
    { label: "Takes effect", value: TAKES_EFFECT[request.appliesOn] },
  ];
  return async request => {
    // Only public target/name/source metadata enters the generic description. Values remain
    // inside the secret-card/provider engine; a create still needs no replacement approval.
    return approvalToolHandler({ surfaces,
      prepare: async () => request,
      describe: ({ prepared }) => prepared.action === "remove"
        ? { toolId: "deployment_ops_unset_secret", errorCode: "DEPLOY_OPS", title: `Remove secret ${prepared.name} from ${prepared.target}?`, description: "The platform deletes this environment variable. Tovu cannot restore its value.", details: details(prepared), warning: "An app that still reads this variable may fail to boot after the next deploy.", danger: true, confirmLabel: "Remove secret" }
        : { toolId: "deployment_ops_set_secret", errorCode: "DEPLOY_OPS", title: `Replace secret ${prepared.name} on ${prepared.target}?`, description: "The current value is overwritten. Tovu cannot restore it.", details: details(prepared), danger: true, confirmLabel: "Replace secret" },
      run: async ({ ctx: snapshot }) => {
        await permit("custom-credentials.write");
        return snapshot.signal.aborted ? { confirmed: false, result: notConfirmedResult({ confirmed: false, reason: "abandoned" }) } : { confirmed: true };
      },
    }, { declined: ({ reason }) => ({ confirmed: false, result: notConfirmedResult({ confirmed: false, reason }) }) })(ctx, options) as ReturnType<SecretConfirm>;
  };
}

export function buildDeployOpsRegistrations(deps:DeployOpsToolDeps,surfaces?:ChatDeleteSurfaceDeps) {
 return build({deps:bindDeployOpsRuntime(deps),host:{catalog:getDeployOpsAgentToolCatalog(deps.deployOpsRegistry),metadata:toolMetadata,derivedRisk:deployOpsDerivedRisk,domain:'deploy-ops',catalogModule:'features/deployments/deploy-ops/agent-tools.ts',permissions:{write:'custom-credentials.write',siteKey:SITE_KEY_MANAGE_PERMISSION},
 permit:({ctx,permission})=>requireToolPermission({authorize:adaptLegacyAuthorize({authorize:deps.authorize}),workspaceId:deps.workspaceId,principalId:ctx.principal.id,permission},{entityType:'deploy-ops'}),
 approvals:{confirmFor:({ctx,permit},options)=>secretConfirm(ctx,surfaces,options,permit)},cards:bindDeploySecretCards(deps,surfaces)}},{});
}
/** Contribute five read-only tools, the deploy tool and the secret writers; the composition root supplies a gated registry for daemon schemas. */
export function contributeDeployOpsTools(options: { registry?: DeployOpsRegistry } = {}): ToolContributor<DeployOpsToolDeps, ChatDeleteSurfaceDeps> {
  return { domain: "deploy-ops", build: (deps, surfaces) => buildDeployOpsRegistrations({ ...deps, ...(options.registry ? { deployOpsRegistry: options.registry } : {}) }, surfaces), risk: deployOpsDerivedRisk };
}
