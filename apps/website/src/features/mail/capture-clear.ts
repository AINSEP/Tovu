import { MailActivityForbiddenError } from "@jini-ai/platform/mail";
import type { MailCaptureRepo } from "@jini-ai/platform/mail/sql";
import { MAIL_CAPTURE_CLEAR_PERMISSION, type MailCaptureClearPlan, type MailCaptureClearResult } from "@jini-ai/core/contracts/mail";

/**
 * @file "Clear all" captured test emails (owner decision 2026-11-23, bt2-todos G7-7/848): the plan
 * the `POST system/mail-capture/clear` preview answers and the confirmed clear bound to it. The
 * route (`@jini-ai/cms/admin-http/routes/system/mail-activity`) only clears when the request is
 * confirmed with the revision of this plan. The revision names the exact reviewed set of captures
 * (not its count and newest time), and the clear deletes only those ids: a capture that arrived
 * after the review is never deleted unseen.
 */

/** What `planMailCaptureClear` reads and deletes through, and how it asks for the owner grant. */
export interface MailCaptureClearDeps {
  capture: Pick<MailCaptureRepo, "reviewCaptured" | "clearReviewedCaptures">;
  checkPermission: (required: { principalId: string; permission: string }) => Promise<{ allowed: boolean; reason: string }>;
}

/**
 * Plans clearing the captured test emails of `workspaceId` as `principalId`.
 * @returns `{ plan: { count, newestAt }, revision, clear }`; `clear` deletes only the reviewed
 *   captures of this workspace and answers `{ cleared: true, deleted }`.
 * @throws MailActivityForbiddenError without `mail.capture.clear`, before anything is read.
 * @complexity One permission check and one indexed id read; `clear` is one id-bound delete transaction.
 */
export async function planMailCaptureClear(
  required: { principalId: string; workspaceId: string },
  deps: MailCaptureClearDeps,
): Promise<{ plan: MailCaptureClearPlan; revision: string; clear: () => Promise<MailCaptureClearResult> }> {
  const { principalId, workspaceId } = required;
  const grant = await deps.checkPermission({ principalId, permission: MAIL_CAPTURE_CLEAR_PERMISSION });
  if (!grant.allowed) {
    throw new MailActivityForbiddenError({ permission: MAIL_CAPTURE_CLEAR_PERMISSION, message: "Only the site owner can clear captured test emails." });
  }
  const { plan, captureIds, revision } = await deps.capture.reviewCaptured({ workspaceId });
  return {
    plan,
    revision,
    clear: async () => ({ cleared: true, deleted: (await deps.capture.clearReviewedCaptures({ workspaceId, captureIds })).deleted }),
  };
}
