import { MailActivityForbiddenError } from "@jini-ai/platform/mail";
import type { MailCaptureRepo } from "@jini-ai/platform/mail/sql";
import { MAIL_CAPTURE_CLEAR_PERMISSION } from "@jini-ai/user-management/mail/status/permissions";

/**
 * @file "Clear all" captured test emails (owner decision 2026-11-23, bt2-todos G7-7/848): the plan
 * the `POST system/mail-capture/clear` preview answers and the confirmed clear bound to it. The
 * route (`@jini-ai/cms/admin-http/routes/system/mail-activity`) only clears when the request is
 * confirmed with the revision of this plan, so a capture that arrived after the preview makes the
 * owner review again instead of being deleted unseen.
 */

/** What `planMailCaptureClear` reads and deletes through, and how it asks for the owner grant. */
export interface MailCaptureClearDeps {
  capture: Pick<MailCaptureRepo, "summarizeCaptured" | "clearCaptured">;
  checkPermission: (required: { principalId: string; permission: string }) => Promise<{ allowed: boolean; reason: string }>;
}

/**
 * Plans clearing every captured test email of `workspaceId` as `principalId`.
 * @returns `{ plan: { count, newestAt }, revision, clear }`; `clear` deletes only this workspace's
 *   `mail_capture` rows and answers `{ cleared: true, deleted }`.
 * @throws MailActivityForbiddenError without `mail.capture.clear`, before anything is read.
 * @complexity One permission check and one indexed count; `clear` is one indexed delete.
 */
export async function planMailCaptureClear(
  required: { principalId: string; workspaceId: string },
  deps: MailCaptureClearDeps,
) {
  const { principalId, workspaceId } = required;
  const grant = await deps.checkPermission({ principalId, permission: MAIL_CAPTURE_CLEAR_PERMISSION });
  if (!grant.allowed) {
    throw new MailActivityForbiddenError({ permission: MAIL_CAPTURE_CLEAR_PERMISSION, message: "Only the site owner can clear captured test emails." });
  }
  const plan = await deps.capture.summarizeCaptured({ workspaceId });
  return {
    plan,
    revision: `${plan.count}:${plan.newestAt ?? ""}`,
    clear: async () => ({ cleared: true as const, deleted: (await deps.capture.clearCaptured({ workspaceId })).deleted }),
  };
}
