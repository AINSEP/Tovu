import type { ChatDeleteSurfaceDeps } from '@jini-ai/core/contracts/site/daemon-surface-exchanges';
import { deployOpsToolMetadata as toolMetadata } from '../../../contracts/core/tool-metadata/index.js';
import { bindDeploySecretCards } from './typed-secret-card.js';
import { adaptLegacyAuthorize, requireToolPermission, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolContributor } from '@jini-ai/core';
import { approvalToolHandler } from '#src/contracts/core/human-confirm';
import { notConfirmedResult } from '@jini-ai/daemon/surface-exchanges/human-confirm';
import { SITE_KEY_MANAGE_PERMISSION } from "@jini-ai/user-management/identity/site-key-permission";
import { secretConfirm } from '@jini-ai/devops/deploy/site/deploy-ops/secret-confirm';
import { getDeployOpsAgentToolCatalog } from './agent-tools.js';
import { bindDeployOpsRuntime, type DeployOpsToolDeps } from './run-ops.js';
import type { DeployOpsRegistry } from '@jini-ai/devops/deploy';
import { buildDeployOpsRegistrations as build } from '@jini-ai/devops/deploy';
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
export function buildDeployOpsRegistrations(deps:DeployOpsToolDeps,surfaces?:ChatDeleteSurfaceDeps) {
 return build({deps:bindDeployOpsRuntime(deps),host:{catalog:getDeployOpsAgentToolCatalog(deps.deployOpsRegistry),metadata:toolMetadata,derivedRisk:deployOpsDerivedRisk,domain:'deploy-ops',catalogModule:'features/deployments/deploy-ops/agent-tools.ts',permissions:{write:'custom-credentials.write',siteKey:SITE_KEY_MANAGE_PERMISSION},
 permit:({ctx,permission})=>requireToolPermission({authorize:adaptLegacyAuthorize({authorize:deps.authorize}),workspaceId:deps.workspaceId,principalId:ctx.principal.id,permission},{entityType:'deploy-ops'}),
 approvals:{confirmFor:({ctx,permit},options)=>secretConfirm({ ctx,surfaces,options,permit, deps: { approvalToolHandler, notConfirmedResult,
 removeDescription: "The platform deletes this environment variable. Tovu cannot restore its value.",
 replaceDescription: "The current value is overwritten. Tovu cannot restore it.",
 } })},cards:bindDeploySecretCards(deps,surfaces)}},{});
}
/** Contribute five read-only tools, the deploy tool and the secret writers; the composition root supplies a gated registry for daemon schemas. */
export function contributeDeployOpsTools(options: { registry?: DeployOpsRegistry } = {}): ToolContributor<DeployOpsToolDeps, ChatDeleteSurfaceDeps> {
  return { domain: "deploy-ops", build: (deps, surfaces) => buildDeployOpsRegistrations({ ...deps, ...(options.registry ? { deployOpsRegistry: options.registry } : {}) }, surfaces), risk: deployOpsDerivedRisk };
}
