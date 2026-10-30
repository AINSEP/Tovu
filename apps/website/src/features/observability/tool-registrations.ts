import { buildDomainRegistrations, indexCatalogById, requireInputRecord, ToolInputError, type DerivedRiskByToolId, type AgentToolDefinition, type ToolRegistration } from "@jini-ai/core";
import { adaptLegacyAuthorize, requireToolPermission, ForbiddenError } from "@jini-ai/cms/core";
import { forbiddenRule, withModelFacingErrors } from "@jini-ai/core/model-facing-tool-errors";
import type { TelemetryTestResult } from "@jini-ai/diagnostics/observability";
import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import type { ToolContributor } from "@jini-ai/core";
import { toolMetadata } from "../../contracts/core/tool-metadata/observability.js";

export interface ObservabilityToolDeps {
  workspaceId: string;
  authorize: AuthorizeFn;
  sendTelemetryTest?: (required: Record<string, never>, optional?: Record<string, never>) => Promise<TelemetryTestResult>;
}
export const observabilityAgentToolCatalog: AgentToolDefinition[] = [{
  name: "observability_send_test_error",
  description: "Send the fixed diagnostic 'Tovu test error — safe to ignore', one test span and one telemetry_test analytics event through this site's tracker. Requires admin system.write. No confirmation needed. Returns provider ids and signals accepted locally; this is not proof of remote delivery. Analytics still requires telemetry consent. Takes no arguments.",
  sideEffects: "mutates-durable-state", authorization: { permission: "system.write" },
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
}];
export const observabilityDerivedRisk: DerivedRiskByToolId = new Map([["observability_send_test_error", "mutates-durable-state"]]);

/** Thin admin adapter over the same diagnostic action as the HTTP surface.
 * @returns One registration. @throws ToolInputError for unavailable service or extra input.
 * @complexity O(1) excluding the injected authorization and diagnostic action.
 */
export function buildObservabilityRegistrations(deps: ObservabilityToolDeps, _options = {}): ToolRegistration[] {
  return buildDomainRegistrations({ metadata: toolMetadata, domain: "observability",
    catalogModule: "features/observability/tool-registrations.ts", catalog: indexCatalogById({ catalog: observabilityAgentToolCatalog }), derivedRisk: observabilityDerivedRisk,
    handlers: withModelFacingErrors({ handlers: {
      observability_send_test_error: async ctx => {
        const input = ctx.input === undefined ? {} : requireInputRecord({ input: ctx.input });
        if (Object.keys(input).length) throw new ToolInputError({ message: "observability_send_test_error takes no arguments." });
        await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId,
          principalId: ctx.principal.id, permission: "system.write" }, { entityType: "observability" });
        if (!deps.sendTelemetryTest) throw new ToolInputError({ message: "Telemetry test is unavailable on this server." });
        return deps.sendTelemetryTest({});
      },
    }, rules: [forbiddenRule({ domainPrefix: "OBSERVABILITY", error: ForbiddenError })] }),
  });
}
export function contributeObservabilityTools(_required: Record<string, never>, _options = {}): ToolContributor<ObservabilityToolDeps, object> {
  return { domain: "observability", build: buildObservabilityRegistrations, risk: observabilityDerivedRisk };
}
