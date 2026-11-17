import type { MailActivityDeps } from "./activity.js";
import { MAIL_PERMISSION_IDS } from "./permissions.js";
import type { MailSuppressionDeps } from "./suppressions.js";

/** What the host's deps bag supplies to the activity and suppression operations. */
export type MailHostActivityDeps = Omit<MailActivityDeps, "permissions"> & Omit<MailSuppressionDeps, "permissions">;

/**
 * Binds this site's permission ids to the host deps for ONE call of an activity or suppression
 * operation. Read per call, never captured at registration: `ownerPrincipalId` and the repos are
 * read from the bag at the moment of the call, exactly as the operations did before they took
 * their permission ids as input.
 *
 * @param required.deps - The host deps bag (route deps in production).
 * @returns The deps object the operations take.
 * @complexity O(1).
 */
export function mailDomainDepsFrom({ deps }: { deps: MailHostActivityDeps }, _optional = {}): MailActivityDeps & MailSuppressionDeps {
  return {
    workspaceId: deps.workspaceId,
    authorize: deps.authorize,
    permissions: MAIL_PERMISSION_IDS,
    ownerPrincipalId: deps.ownerPrincipalId,
    mailActivity: deps.mailActivity,
    mailSuppressionAdmin: deps.mailSuppressionAdmin,
  };
}
