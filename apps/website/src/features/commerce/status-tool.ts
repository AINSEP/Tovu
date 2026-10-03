import { buildDomainRegistrations, indexCatalogById, type DerivedRiskByToolId, type ToolRegistration, type AgentToolDefinition } from "@jini-ai/core";
import { adaptLegacyAuthorize, requireToolPermission, type AuthorizeFn } from "@jini-ai/cms/core";
import type { ToolContributor } from "#src/assistant/index";
import { readCommerceStatus } from "./status.js";
import type { CommercePaymentRuntimePort } from "./contracts.js";

/** Narrow provider-discovery port; no payment, refund or credential operations. */
export interface Deps { workspaceId: string; authorize: AuthorizeFn; lipay?: CommercePaymentRuntimePort; }

/** Catalog for the admin service exposed through this standalone contributor. */
export const catalog: AgentToolDefinition[] = [{
  name: "commerce_get_status",
  description: "Checks store and commerce setup status and available payment providers. Call to ask whether checkout, subscriptions, webhooks or revenue reporting are supported yet. Returns {contractVersion, workspaceId, paymentRuntime, providers, configuration, capabilities}, with unavailable capabilities explicitly marked. Read-only: no payments or credentials are read or changed. Provider discovery alone does not mean checkout is configured.",
  sideEffects: "none",
  authorization: { permission: "admin.integrations.manage" },
  inputSchema: { type: "object", additionalProperties: false, properties: {} },
}];
/** Independently derived from the service calls below. */
export const derivedRisk: DerivedRiskByToolId = new Map([
  // readCommerceStatus -> lipay.listProviders: reads the runtime provider catalog only.
  ["commerce_get_status", "none"],
]);
/**
 * Builds the handler with injectable admin-service dependencies.
 * @param deps - Workspace, authorization and service ports.
 * @returns One registration; readOnly follows the independently checked risk.
 * @throws Authorization and service failures propagate; absence is returned as a read model.
 * @complexity O(1) wiring; handler cost follows the wrapped service.
 */
export function buildRegistrations(deps: Deps): ToolRegistration[] {
  return buildDomainRegistrations({
    domain: "commerce-get-status", catalogModule: "features/commerce/status-tool.ts",
    catalog: indexCatalogById({ catalog }), derivedRisk,
    handlers: { commerce_get_status: async ctx => {
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "admin.integrations.manage" }, { entityType: "integration" });
      return readCommerceStatus({ workspaceId: deps.workspaceId, resolvePaymentRuntime: () => deps.lipay ?? null });
    } },
  });
}
/** Installs this distinct domain without replacing its existing sibling tools. */
export function contributeCommerceGetStatusTools(): ToolContributor {
  return { domain: "commerce-get-status", build: buildRegistrations, risk: derivedRisk };
}
