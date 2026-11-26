import { buildMailStatusRegistrations as build, mailStatusDerivedRisk, type MailStatusToolDeps as Deps } from "@jini-ai/user-management/mail/status/tool-registrations";
import type { ToolContributor } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import { approvalToolHandler } from "#src/contracts/core/human-confirm";
import { isMailDeliveryAvailable, MAIL_DELIVERY_UNAVAILABLE_NOTE } from "../../platform/mail/index.js";
import { planMailTestSend, readTestRecipient, runMailTestSend } from "@jini-ai/platform/mail/test-send";

export type MailStatusToolDeps = Omit<Deps, "approvalToolHandler" | "isMailDeliveryAvailable" | "unavailableNote" | "planMailTestSend" | "readTestRecipient" | "runMailTestSend">;

export function buildMailStatusRegistrations(deps: MailStatusToolDeps, surfaces: AssistantSurfaceDeps) {
  return build({ ...deps, approvalToolHandler, isMailDeliveryAvailable, unavailableNote: MAIL_DELIVERY_UNAVAILABLE_NOTE, planMailTestSend, readTestRecipient, runMailTestSend }, surfaces);
}

export function contributeMailStatusTools(): ToolContributor<MailStatusToolDeps, AssistantSurfaceDeps> {
  return { domain: "system-mail", build: buildMailStatusRegistrations, risk: mailStatusDerivedRisk };
}
