/**
 * @file `TrashAdapter` for comments. Marker: the plugin table's `status` column (`"pending" |
 * "approved" | "spam" | "trash"`).
 *
 * The comments table is NOT in the core schema — it is created by the ADR-023 dataModule engine as
 * the comments plugin table, so this adapter addresses it by the same derived name
 * `Jini/packages/cms/src/comments/sql/repo.ts` uses, over the same content kernel.
 *
 * Restore goes back to `"pending"`, not to whatever the comment was before. Deliberate: the
 * original status is not recorded anywhere the no-parse rule allows this adapter to read, and of
 * the two guesses available, sending a restored comment back through moderation is the one that
 * cannot accidentally republish spam onto a public page.
 */
// Jini's public comments entry owns the plugin id, the ONE thing this adapter takes from that domain —
// re-deriving the table name here instead would put the same string in two files.
import { COMMENTS_PLUGIN_ID } from "@jini-ai/cms/comments";
import type { TrashAdapter, TrashMarkerResult, TrashPurgeOutcome } from "@jini-ai/cms/trash";
import { compareAndDelete, flipMarker, lazyKernel, type MarkerStore } from "./marker-sql.js";

export const COMMENT_ENTITY_TYPE = "comment";

const COMMENTS_TABLE = `p_${COMMENTS_PLUGIN_ID}__comments`;

const COMMENT_HIDDEN_STATUS = "trash";
const COMMENT_RESTORED_STATUS = "pending";

/** @complexity O(1) to build. */
export function createCommentTrashAdapter(store: MarkerStore): TrashAdapter {
  const kernel = lazyKernel(store);
  return {
    entityType: COMMENT_ENTITY_TYPE,

    async hide(required): Promise<TrashMarkerResult> {
      return flipMarker({
        kernel: kernel(),
        table: COMMENTS_TABLE,
        set: { status: COMMENT_HIDDEN_STATUS, updated_at: required.at },
        from: { column: "status", op: "<>", value: COMMENT_HIDDEN_STATUS },
        workspaceId: required.workspaceId,
        entityId: required.entityId,
        expectedVersion: required.expectedVersion,
      });
    },

    async unhide(required): Promise<TrashMarkerResult> {
      return flipMarker({
        kernel: kernel(),
        table: COMMENTS_TABLE,
        set: { status: COMMENT_RESTORED_STATUS, updated_at: required.at },
        from: { column: "status", op: "=", value: COMMENT_HIDDEN_STATUS },
        workspaceId: required.workspaceId,
        entityId: required.entityId,
        expectedVersion: required.expectedVersion,
      });
    },

    /**
     * The `moderation_log` rows are RETAINED after the comment row is gone — `CommentRepoPort.purge`
     * documents that as the intended permanent audit trail of a purge, not a dangling reference to
     * clean up. Unlike `post_revisions`, that log holds moderator actions, not content.
     *
     * @complexity O(1).
     */
    async purge(required): Promise<TrashPurgeOutcome> {
      return compareAndDelete({
        kernel: kernel(),
        table: COMMENTS_TABLE,
        workspaceId: required.workspaceId,
        entityId: required.entityId,
        expectedVersion: required.expectedVersion,
      });
    },
  };
}
