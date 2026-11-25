import { MailActivityUnavailableError } from "@jini-ai/platform/mail";
import { createMailCaptureRepo } from "@jini-ai/platform/mail/sql";
import { planMailCaptureClear } from "#src/features/mail/capture-clear";
import type { CaptureClearPlan, MailCaptureClearPlanner } from "#src/features/mail-status/delivery-tool-registrations";

/**
 * @file The host binding of `mail_clear_captured`'s planner: the capture repo over the site's
 * content kernel and the owner-grant check, supplied to `contributeMailDeliveryTools` at the tool
 * catalog manifest. Planning only reviews; the delete happens in the plan's `clear`, which the tool
 * calls only after the person approved the card.
 */

/** Plans "clear all" for this workspace as the caller; re-run at the write to catch a stale card. */
export function planMailDeliveryCaptureClear({ deps, ctx }: Parameters<MailCaptureClearPlanner>[0], _optional: Record<string, never> = {}): Promise<CaptureClearPlan> {
  if (!deps.contentKernel) throw new MailActivityUnavailableError();
  const checkPermission = ({ principalId, permission: name }: { principalId: string; permission: string }) => deps.authorize({ principalId, permission: name, workspaceId: deps.workspaceId, entityType: "mail" });
  return planMailCaptureClear({ principalId: ctx.principal.id, workspaceId: deps.workspaceId }, { capture: createMailCaptureRepo({ db: deps.contentKernel }), checkPermission });
}
