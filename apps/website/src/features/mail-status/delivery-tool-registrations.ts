import { buildMailDeliveryRegistrations as build, mailDeliveryDerivedRisk, type MailDeliveryToolDeps as Deps } from "@jini-ai/user-management/mail/status/delivery-tool-registrations";
import type { ToolContributor } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import type { ContentKernel } from "../../platform/db/content-kernel.js";
import { approvalToolHandler } from "#src/contracts/core/human-confirm";

export type MailDeliveryToolDeps = Deps & { contentKernel?: ContentKernel };
export type MailCaptureClearPlanner = (args: { deps: MailDeliveryToolDeps; ctx: import("@jini-ai/core").ToolExecutionContext }, _optional?: Record<string, never>) => Promise<import("@jini-ai/user-management/mail/status/delivery-tool-registrations").CaptureClearPlan>;
export interface MailDeliveryToolCollaborators { planCaptureClear: MailCaptureClearPlanner }

export function buildMailDeliveryRegistrations(deps: MailDeliveryToolDeps, surfaces: AssistantSurfaceDeps, collaborators: MailDeliveryToolCollaborators) {
  return build(deps, surfaces, { ...collaborators, approvalToolHandler });
}

export function contributeMailDeliveryTools(collaborators: MailDeliveryToolCollaborators, _optional = {}): ToolContributor<MailDeliveryToolDeps, AssistantSurfaceDeps> {
  return { domain: "system-mail-delivery", build: (deps, surfaces) => buildMailDeliveryRegistrations(deps, surfaces, collaborators), risk: mailDeliveryDerivedRisk };
}
