/**
 * @file `TrashAdapter` for comments. Marker: the plugin table's `status` column (`"pending" |
 * "approved" | "spam" | "trash"`).
 *
 * The comments table is NOT in `schema.ts` — it is created by the ADR-023 dataModule engine as
 * `p_comments__comments`, so this adapter addresses it by the same derived name
 * `features/comments/repo.sqlite.ts` uses, over the same raw connection.
 *
 * Restore goes back to `"pending"`, not to whatever the comment was before. Deliberate: the
 * original status is not recorded anywhere the no-parse rule allows this adapter to read, and of
 * the two guesses available, sending a restored comment back through moderation is the one that
 * cannot accidentally republish spam onto a public page.
 */
import type Database from "better-sqlite3";

import { COMMENTS_PLUGIN_ID } from "../../comments/types.js";
import type { TrashAdapter, TrashMarkerResult, TrashPurgeOutcome } from "../ports.js";
import { compareAndDelete, flipMarker } from "./marker-sql.js";

export const COMMENT_ENTITY_TYPE = "comment";

const COMMENTS_TABLE = `p_${COMMENTS_PLUGIN_ID}__comments`;

const COMMENT_HIDDEN_STATUS = "trash";
const COMMENT_RESTORED_STATUS = "pending";

/** @complexity O(1) to build. */
export function createCommentTrashAdapter(client: Database.Database): TrashAdapter {
  return {
    entityType: COMMENT_ENTITY_TYPE,

    async hide(required): Promise<TrashMarkerResult> {
      return flipMarker({
        client,
        table: COMMENTS_TABLE,
        setSql: "status = ?, updated_at = ?",
        setParams: [COMMENT_HIDDEN_STATUS, required.at],
        fromPredicate: "status <> ?",
        fromParams: [COMMENT_HIDDEN_STATUS],
        workspaceId: required.workspaceId,
        entityId: required.entityId,
        expectedVersion: required.expectedVersion,
      });
    },

    async unhide(required): Promise<TrashMarkerResult> {
      return flipMarker({
        client,
        table: COMMENTS_TABLE,
        setSql: "status = ?, updated_at = ?",
        setParams: [COMMENT_RESTORED_STATUS, required.at],
        fromPredicate: "status = ?",
        fromParams: [COMMENT_HIDDEN_STATUS],
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
        client,
        table: COMMENTS_TABLE,
        workspaceId: required.workspaceId,
        entityId: required.entityId,
        expectedVersion: required.expectedVersion,
      });
    },
  };
}
