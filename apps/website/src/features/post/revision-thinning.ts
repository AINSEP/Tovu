import type { ToolHandler } from "@jini-ai/core";
import type { HumanConfirmSpec } from "@jini-ai/core/contracts/site/human-confirm";
import { bindRevisionThinning as bind, revisionThinningApprovalHandler as approval, type RevisionThinningScope } from "@jini-ai/cms/posts/sql/revision-thinning";

import { approvalToolHandler } from "#src/contracts/core/human-confirm";
import type { ContentKernel } from "../../platform/db/content-kernel.js";
import { postRevisionLockKey } from "@jini-ai/core/contracts/site/post-revision-lock";

/**
 * @file Host adapter for Jini's revision-thinning engine over `post_revisions`: a date-only
 * preview of ONE post or page, then an owner-confirmed apply that deletes at most the contiguous,
 * unprotected oldest run of snapshots under the post's revision fence ({@link postRevisionLockKey}).
 *
 * DISABLED (STOP 6): nothing registers this on a schedule or in the agent catalog. The pieces here
 * are only reachable through an explicit owner preview + confirm (route) or approval card (tool).
 * Activation waits until every reference writer (publish, restore, undo/change-set items) shares the
 * fence or has transactionally equivalent protection.
 *
 * `previousId` is NOT a column: `appendRevision` computes it at append time from the latest row by
 * `seq` and hands it to the change-set item, so thinning has no survivor row to "relink" — and must
 * not invent one. Survivors read exactly as before; the gap is visible as missing `seq` values.
 */

export interface RevisionThinningRequired extends Omit<Parameters<typeof bind>[0], "kernel" | "postRevisionLockKey"> { kernel: ContentKernel }

export function bindRevisionThinning(required: RevisionThinningRequired, _optional: Record<string, never> = {}) {
  return bind({ ...required, postRevisionLockKey });
}

export type RevisionThinningBinding = ReturnType<typeof bindRevisionThinning>;
type Prepared = { scope: RevisionThinningScope; count: number; previewToken: string };

function thinningCard({ prepared }: { prepared: Prepared }): HumanConfirmSpec {
  return { toolId: "post_thin_revisions", errorCode: "POST", title: `Delete up to ${prepared.count} old revision${prepared.count === 1 ? "" : "s"} of this ${prepared.scope.kind}?`,
    details: [{ label: "Revisions in preview", value: String(prepared.count) }],
    warning: "This cannot be undone. The newest revision and any revision that is published, restorable or needed for undo is kept, and thinning stops there.",
    confirmLabel: "Delete old revisions" };
}

/**
 * The agent tool body: explicit preview in `prepare`, an owner approval card, then apply with the
 * previewed token. No `rememberKey`: every thinning permanently deletes history, so it always asks.
 * Not registered in the catalog while thinning is disabled (STOP 6).
 */
export function revisionThinningApprovalHandler(
  { binding, surfaces, workspaceId }: { binding: RevisionThinningBinding; surfaces: Parameters<typeof approvalToolHandler>[0]["surfaces"]; workspaceId: string },
  _optional: Record<string, never> = {},
): ToolHandler {
  return approval({ binding, surfaces, workspaceId, approvalToolHandler, thinningCard });
}
