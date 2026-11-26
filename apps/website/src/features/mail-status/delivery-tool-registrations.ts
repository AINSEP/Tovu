import { buildMailDeliveryRegistrations as build, mailDeliveryDerivedRisk, type MailDeliveryToolDeps as Deps } from "@jini-ai/user-management/mail/status/delivery-tool-registrations";
import type { ToolContributor } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import type { ContentKernel } from "../../platform/db/content-kernel.js";
import { approvalToolHandler } from "#src/contracts/core/human-confirm";

import { getMailActivity, listMailActivity, listMailSuppressions, MailActivityForbiddenError, MailActivityUnavailableError, MailSuppressionsUnavailableError, planMailSuppressionRemoval, readMailActivityId, readMailActivityQuery, readMailSuppressionQuery, readMailSuppressionRemoval, runMailSuppressionRemoval } from "@jini-ai/platform/mail";
import { readMailFeedbackSetup } from "@jini-ai/platform/mail/feedback-setup";
import { mailUseReadinessDepsFrom, readMailUseReadiness } from "@jini-ai/platform/mail/use-readiness";

export type MailDeliveryToolDeps = Deps & { contentKernel?: ContentKernel };
export type MailCaptureClearPlanner = (args: { deps: MailDeliveryToolDeps; ctx: import("@jini-ai/core").ToolExecutionContext }, _optional?: Record<string, never>) => Promise<import("@jini-ai/user-management/mail/status/delivery-tool-registrations").CaptureClearPlan>;
export interface MailDeliveryToolCollaborators { planCaptureClear: MailCaptureClearPlanner }

export function buildMailDeliveryRegistrations(deps: MailDeliveryToolDeps, surfaces: AssistantSurfaceDeps, collaborators: MailDeliveryToolCollaborators) {
  return build(deps, surfaces, { ...collaborators, approvalToolHandler, deps: { getMailActivity, listMailActivity, listMailSuppressions, MailActivityForbiddenError, MailActivityUnavailableError, MailSuppressionsUnavailableError, planMailSuppressionRemoval, readMailActivityId, readMailActivityQuery, readMailSuppressionQuery, readMailSuppressionRemoval, runMailSuppressionRemoval, readMailFeedbackSetup, mailUseReadinessDepsFrom, readMailUseReadiness } });
}

export function contributeMailDeliveryTools(collaborators: MailDeliveryToolCollaborators, _optional = {}): ToolContributor<MailDeliveryToolDeps, AssistantSurfaceDeps> {
  return { domain: "system-mail-delivery", build: (deps, surfaces) => buildMailDeliveryRegistrations(deps, surfaces, collaborators), risk: mailDeliveryDerivedRisk };
}
