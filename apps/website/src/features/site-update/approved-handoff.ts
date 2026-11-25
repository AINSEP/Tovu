/**
 * @file The shared approved hand-off: after the owner's click and under the operation lock, the website prepares the
 * update (backup and readiness only) and hands the prepared operation to the host's update supervisor. The website
 * never installs, deploys or restarts anything itself. The update survives a restart because the supervisor owns it
 * independently of chat and of the replaced process: once accepted, the caller's cancellation no longer reaches it.
 */
import type { SiteUpdateStatusReply } from "@jini-ai/core/contracts/site/devops-deploy";
import { prepareSiteUpdate, type PreparedSiteUpdate, type SiteUpdateCallOptions, type SiteUpdatePlan, type SiteUpdatePorts } from "@jini-ai/devops/deploy";

/** The managed supervisor's ports. Site identity comes from the bound capability, never from tool input. */
export interface ApprovedHandoffPorts {
  /** Durably accepts the prepared operation; repeating it for the same prepared operation returns the same id. */
  submitPrepared(required: { prepared: PreparedSiteUpdate }, optional?: SiteUpdateCallOptions): Promise<{ operationId: string }>;
  /** Read-only safe projection of the last attempt, for the status read after a reconnect. */
  readLastAttempt(required: Record<string, never>, optional?: SiteUpdateCallOptions): Promise<SiteUpdateStatusReply["lastAttempt"]>;
}

export interface HandOffApprovedRequired {
  ports: Pick<SiteUpdatePorts, "backup" | "readiness" | "ids">;
  handoff: ApprovedHandoffPorts;
  plan: SiteUpdatePlan;
  approvedBy: string;
}

const CANCELLED = { applied: false, outcome: "cancelled", message: "The update was cancelled before it started. Nothing was changed." } as const;

/**
 * -> `updating` with the supervisor's opaque operation id once it durably accepted the update; the stopped
 *   preparation's own result otherwise. A cancelled or stopped preparation never enqueues an update.
 * Call only after the owner check and inside the operation lock (the preparation lease that fences writers).
 * @complexity One preparation plus at most one submit.
 */
export async function handOffApproved({ ports, handoff, plan, approvedBy }: HandOffApprovedRequired, { signal }: SiteUpdateCallOptions = {}) {
  if (signal?.aborted) return CANCELLED;
  const preparation = await prepareSiteUpdate({ ports, plan, approval: { kind: "owner-approval", approvedBy, toVersion: plan.toVersion } }, { signal });
  if (preparation.status === "stopped") {
    const { result } = preparation;
    return { applied: false, outcome: result.outcome, message: result.summary, ...(result.backupId ? { backupId: result.backupId } : {}), ...(result.errorId ? { errorId: result.errorId } : {}) };
  }
  // Cancelled after preparation but before acceptance: leaving releases the lease without submitting anything.
  if (signal?.aborted) return CANCELLED;
  // No caller signal: once submitted, acceptance and the operation belong to the supervisor, not to this chat turn.
  const { operationId } = await handoff.submitPrepared({ prepared: preparation.prepared });
  return { applied: false, outcome: "updating", operationId, message: `Updating to ${plan.toVersion}. The site restarts on the new version and is put back on ${plan.fromVersion} if it does not work.` };
}
