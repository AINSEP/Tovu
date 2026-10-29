import { toolMetadata } from "../../contracts/core/tool-metadata/mail-status.js";
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, ToolInputError, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import { adaptLegacyAuthorize, ForbiddenError, requireToolPermission } from "@jini-ai/cms/core";
import { forbiddenRule, withModelFacingErrors } from "@jini-ai/core/model-facing-tool-errors";
import type { AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import type { ToolContributor } from "@jini-ai/core";
import { approvalToolHandler } from "#src/contracts/core/human-confirm";
import { mailDeliveryAgentToolCatalog } from "./delivery-agent-tools.js";
import { getMailActivity, listMailActivity, MailActivityForbiddenError, MailActivityUnavailableError, readMailActivityId, readMailActivityQuery, type MailActivityDeps } from "./activity.js";
import { readMailFeedbackSetup, type MailFeedbackSetupDeps } from "./feedback-setup.js";
import { MAIL_STATUS_PERMISSION } from "./permissions.js";
import {
  listMailSuppressions, MailSuppressionsUnavailableError, planMailSuppressionRemoval, readMailSuppressionQuery, readMailSuppressionRemoval, runMailSuppressionRemoval,
  type MailSuppressionDeps, type MailSuppressionRemovalPlan,
} from "./suppressions.js";
import { mailUseReadinessDepsFrom, readMailUseReadiness, type MailUseReadinessHostDeps } from "./use-readiness.js";

/**
 * @file Assistant adapters for the delivery visibility operations (`./use-readiness.ts`,
 * `./activity.ts`, `./suppressions.ts`, `./feedback-setup.ts`), the same ones the admin
 * `system/mail-uses`, `system/mail-activity`, `system/mail-suppressions` and `system/mail-feedback`
 * routes call. Kept apart from the status and provider slices so each evolves independently.
 */

export type MailDeliveryToolDeps = MailActivityDeps & MailUseReadinessHostDeps & MailSuppressionDeps & MailFeedbackSetupDeps;

export const mailDeliveryDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> owner checks (sender read, launch gate, form list, gate probe that sends nothing) + one activity row per use.
  ["mail_get_readiness", "none"],
  // -> one ledger page read joined with feedback.
  ["mail_list_activity", "none"],
  // -> one ledger row and its feedback events.
  ["mail_get_activity", "none"],
  // -> one suppression page read.
  ["mail_list_suppressions", "none"],
  // -> one suppression delete plus its audit row, after a fresh confirmation.
  ["mail_remove_suppression", "mutates-durable-state"],
  // -> provider describe, credential list (labels only, no decrypt), origin read, inbox probe.
  ["mail_get_feedback_setup", "none"],
]);

/** The card: what was blocked and why, the recorded reason, and what removal does not mean. */
function removalCard({ prepared }: { prepared: MailSuppressionRemovalPlan }) {
  return { toolId: "mail_remove_suppression", errorCode: "MAIL", title: `Allow email to ${prepared.address} again?`,
    details: [{ label: "Address", value: prepared.address }, { label: "Scope", value: prepared.scope === "all" ? "All email" : "Newsletters (bulk mail)" },
      { label: "Blocked because", value: `${prepared.suppressionReason} (${prepared.suppressedAt})` }, { label: "Your reason (recorded)", value: prepared.reason }],
    warning: prepared.warnings.join(" "), confirmLabel: "Remove from do-not-send list" };
}

function permission(deps: MailDeliveryToolDeps, ctx: ToolExecutionContext, name: string): Promise<unknown> {
  return requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: name }, { entityType: "mail" });
}

/**
 * `mail_get_readiness`, `mail_list_activity`, `mail_get_activity`, `mail_list_suppressions`,
 * `mail_remove_suppression` (approval-gated, never remembered), `mail_get_feedback_setup`.
 * @param deps - Site scope, authorization, the mail repos and the readiness/feedback inputs.
 * @param surfaces - The authenticated card transport for the removal card.
 * @returns The six registrations.
 * @throws {ToolInputError} For malformed input, a refusal or a missing activity record.
 * @complexity One readiness pass or one activity read per call.
 */
export function buildMailDeliveryRegistrations(deps: MailDeliveryToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  return buildDomainRegistrations({ metadata: toolMetadata, domain: "system-mail-delivery", catalogModule: "features/mail-status/delivery-agent-tools.ts", catalog: indexCatalogById({ catalog: mailDeliveryAgentToolCatalog }), derivedRisk: mailDeliveryDerivedRisk, handlers: withModelFacingErrors({ handlers: {
    mail_get_readiness: async (ctx) => {
      requireInputRecord({ input: ctx.input });
      await permission(deps, ctx, MAIL_STATUS_PERMISSION);
      return readMailUseReadiness(mailUseReadinessDepsFrom(deps));
    },
    mail_list_activity: async (ctx) => {
      const query = readMailActivityQuery({ input: requireInputRecord({ input: ctx.input }) });
      return listMailActivity({ ...{ principalId: ctx.principal.id, query }, deps: deps });
    },
    mail_get_activity: async (ctx) => {
      const activityId = readMailActivityId({ value: requireInputRecord({ input: ctx.input }).activityId });
      const found = await getMailActivity({ ...{ principalId: ctx.principal.id, activityId }, deps: deps });
      if (!found) throw new ToolInputError({ message: "No email send with that id exists on this site. List them with mail_list_activity." });
      return found;
    },
    mail_list_suppressions: async (ctx) => listMailSuppressions({ ...{ principalId: ctx.principal.id, query: readMailSuppressionQuery({ input: requireInputRecord({ input: ctx.input }) }) }, deps: deps }),
    // No rememberKey: each removal lets mail reach someone who bounced or complained, so it always asks.
    mail_remove_suppression: approvalToolHandler({ surfaces,
      prepare: async ({ ctx }) => planMailSuppressionRemoval({ ...{ principalId: ctx.principal.id, input: readMailSuppressionRemoval({ input: requireInputRecord({ input: ctx.input }) }) }, deps: deps }),
      describe: removalCard,
      // The card may sit open for minutes: the run re-checks the grant at the moment of the write.
      run: async ({ ctx, prepared }) => runMailSuppressionRemoval({ ...{ principalId: ctx.principal.id, plan: prepared }, deps: deps }),
    }, { flag: "removed" }),
    mail_get_feedback_setup: async (ctx) => {
      requireInputRecord({ input: ctx.input });
      await permission(deps, ctx, MAIL_STATUS_PERMISSION);
      return readMailFeedbackSetup(deps);
    },
  }, rules: [
    forbiddenRule({ domainPrefix: "MAIL_DELIVERY", error: ForbiddenError }),
    { error: MailActivityForbiddenError, code: "MAIL_DELIVERY_FORBIDDEN" },
    { error: MailActivityUnavailableError, code: "MAIL_DELIVERY_UNAVAILABLE" },
    { error: MailSuppressionsUnavailableError, code: "MAIL_DELIVERY_UNAVAILABLE" },
  ] }) });
}

/** Registers the delivery visibility tools under their own contributor domain. */
export function contributeMailDeliveryTools(): ToolContributor<MailDeliveryToolDeps, AssistantSurfaceDeps> {
  return { domain: "system-mail-delivery", build: buildMailDeliveryRegistrations, risk: mailDeliveryDerivedRisk };
}
