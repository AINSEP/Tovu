import { ToolInputError } from "@jini-ai/core";
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, requireToolPermission, type AuthorizeFn, type DerivedRiskByToolId, type ToolRegistration, type WirableToolDefinition } from "@jini-ai/cms/core";
import type { ToolContributor } from "#src/assistant/index";
import type { PolicyRepoPort, PolicyPermissionRepoPort } from "@jini-ai/cms/identity";

/** Read ports only; no permission grants or user credentials. */
export interface Deps { workspaceId: string; authorize: AuthorizeFn; policyRepo: Pick<PolicyRepoPort, "findById">; policyPermissionRepo: Pick<PolicyPermissionRepoPort, "listByPolicyId">; }

/** Catalog for the admin service exposed through this standalone contributor. */
export const catalog: WirableToolDefinition[] = [{
  name: "identity_policy_list_permissions",
  description: "Reads the permissions and resource constraints granted by one policy. Call to explain what a role can do after finding its policy id with content_read.identity_policy. Returns {policyPermissions}, an empty array when nothing is granted. Read-only: no grants or revocations. Unknown policies are refused with lookup guidance.",
  sideEffects: "none",
  authorization: { permission: "role.manage" },
  inputSchema: { type: "object", additionalProperties: false, required: ["policyId"], properties: { policyId: { type: "string", minLength: 1 } } },
}];
/** Independently derived from the service calls below. */
export const derivedRisk: DerivedRiskByToolId = new Map([
  // policyRepo.findById + policyPermissionRepo.listByPolicyId: reads only.
  ["identity_policy_list_permissions", "none"],
]);
/**
 * Builds the handler with injectable admin-service dependencies.
 * @param deps - Workspace, authorization and service ports.
 * @returns One registration; readOnly follows the independently checked risk.
 * @throws ToolInputError for actionable input refusals; authorization and service failures propagate.
 * @complexity O(1) wiring; handler cost follows the wrapped service.
 */
export function buildRegistrations(deps: Deps): ToolRegistration[] {
  return buildDomainRegistrations({
    domain: "identity-policy-list-permissions", catalogModule: "features/identity/permission-list-tool.ts",
    catalog: indexCatalogById(catalog), derivedRisk,
    handlers: { identity_policy_list_permissions: async ctx => {
      await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "role.manage" });
      const input = requireInputRecord(ctx.input);
      const policyId = input.policyId;
      if (typeof policyId !== "string" || policyId.trim() === "") throw new ToolInputError("policyId must be a non-empty string.");
      const policy = await deps.policyRepo.findById({ workspaceId: deps.workspaceId, id: policyId });
      if (!policy) throw new ToolInputError(`policy '${policyId}' was not found. Use content_read.identity_policy to find a policy id.`);
      return { policyPermissions: await deps.policyPermissionRepo.listByPolicyId({ workspaceId: deps.workspaceId, policyId }) };
    } },
  });
}
/** Installs this distinct domain without replacing its existing sibling tools. */
export function contributeIdentityPolicyListPermissionsTools(): ToolContributor {
  return { domain: "identity-policy-list-permissions", build: buildRegistrations, risk: derivedRisk };
}
