import { toolMetadata } from "../../contracts/core/tool-metadata/mail-status.js";
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, ToolInputError, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import { adaptLegacyAuthorize, ForbiddenError, requireToolPermission } from "@jini-ai/cms/core";
import { forbiddenRule, withModelFacingErrors } from "@jini-ai/core/model-facing-tool-errors";
import type { ToolContributor } from "#src/assistant/index";
import { mailDeliveryAgentToolCatalog } from "./delivery-agent-tools.js";
import { getMailActivity, listMailActivity, MailActivityForbiddenError, MailActivityUnavailableError, readMailActivityId, readMailActivityQuery, type MailActivityDeps } from "./activity.js";
import { MAIL_STATUS_PERMISSION } from "./permissions.js";
import { mailUseReadinessDepsFrom, readMailUseReadiness, type MailUseReadinessHostDeps } from "./use-readiness.js";

/**
 * @file Assistant adapters for the delivery visibility operations (`./use-readiness.ts`,
 * `./activity.ts`), the same ones the admin `system/mail-uses` and `system/mail-activity` routes
 * call. Kept apart from the status and provider slices so each evolves independently.
 */

export type MailDeliveryToolDeps = MailActivityDeps & MailUseReadinessHostDeps;

export const mailDeliveryDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> owner checks (sender read, launch gate, form list, gate probe that sends nothing) + one activity row per use.
  ["mail_get_readiness", "none"],
  // -> one ledger page read joined with feedback.
  ["mail_list_activity", "none"],
  // -> one ledger row and its feedback events.
  ["mail_get_activity", "none"],
]);

function permission(deps: MailDeliveryToolDeps, ctx: ToolExecutionContext, name: string): Promise<unknown> {
  return requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: name }, { entityType: "mail" });
}

/**
 * `mail_get_readiness`, `mail_list_activity`, `mail_get_activity`.
 * @param deps - Site scope, authorization, the activity repo and the readiness inputs.
 * @returns The three registrations.
 * @throws {ToolInputError} For malformed input, a refusal or a missing activity record.
 * @complexity One readiness pass or one activity read per call.
 */
export function buildMailDeliveryRegistrations(deps: MailDeliveryToolDeps): ToolRegistration[] {
  return buildDomainRegistrations({ metadata: toolMetadata, domain: "system-mail-delivery", catalogModule: "features/mail-status/delivery-agent-tools.ts", catalog: indexCatalogById({ catalog: mailDeliveryAgentToolCatalog }), derivedRisk: mailDeliveryDerivedRisk, handlers: withModelFacingErrors({ handlers: {
    mail_get_readiness: async (ctx) => {
      requireInputRecord({ input: ctx.input });
      await permission(deps, ctx, MAIL_STATUS_PERMISSION);
      return readMailUseReadiness(mailUseReadinessDepsFrom(deps));
    },
    mail_list_activity: async (ctx) => {
      const query = readMailActivityQuery({ input: requireInputRecord({ input: ctx.input }) });
      return listMailActivity({ principalId: ctx.principal.id, query }, deps);
    },
    mail_get_activity: async (ctx) => {
      const activityId = readMailActivityId({ value: requireInputRecord({ input: ctx.input }).activityId });
      const found = await getMailActivity({ principalId: ctx.principal.id, activityId }, deps);
      if (!found) throw new ToolInputError({ message: "No email send with that id exists on this site. List them with mail_list_activity." });
      return found;
    },
  }, rules: [
    forbiddenRule({ domainPrefix: "MAIL_DELIVERY", error: ForbiddenError }),
    { error: MailActivityForbiddenError, code: "MAIL_DELIVERY_FORBIDDEN" },
    { error: MailActivityUnavailableError, code: "MAIL_DELIVERY_UNAVAILABLE" },
  ] }) });
}

/** Registers the delivery visibility tools under their own contributor domain. */
export function contributeMailDeliveryTools(): ToolContributor {
  return { domain: "system-mail-delivery", build: buildMailDeliveryRegistrations, risk: mailDeliveryDerivedRisk };
}
