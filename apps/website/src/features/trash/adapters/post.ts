/**
 * @file `TrashAdapter` for posts and pages. Marker: `posts.deleted_at`.
 *
 * Column-only, by contract — `posts.body_json` is never read here, so a post whose body JSON is
 * unparseable is still trashable and restorable.
 */
import type Database from "better-sqlite3";

import type { TrashAdapter, TrashMarkerResult, TrashPurgeOutcome } from "../ports.js";
import { compareAndDelete, flipMarker } from "./marker-sql.js";

export const POST_ENTITY_TYPE = "post";

const POSTS_TABLE = "posts";
const POST_REVISIONS_TABLE = "post_revisions";
/** Ordinary projection table behind the FTS5 index; its triggers keep `post_search_fts` in step. */
const POST_SEARCH_DOCUMENT_TABLE = "post_search_document";

/**
 * Builds the post adapter over the shared `content.db` connection.
 *
 * @param client the raw better-sqlite3 handle (`ContentDb`'s `$client`), so these statements join
 *        whatever transaction the caller opened.
 * @complexity O(1) to build.
 */
export function createPostTrashAdapter(client: Database.Database): TrashAdapter {
  return {
    entityType: POST_ENTITY_TYPE,

    async hide(required): Promise<TrashMarkerResult> {
      return flipMarker({
        client,
        table: POSTS_TABLE,
        setSql: "deleted_at = ?, updated_at = ?",
        setParams: [required.at, required.at],
        fromPredicate: "deleted_at IS NULL",
        workspaceId: required.workspaceId,
        entityId: required.entityId,
        expectedVersion: required.expectedVersion,
      });
    },

    async unhide(required): Promise<TrashMarkerResult> {
      return flipMarker({
        client,
        table: POSTS_TABLE,
        setSql: "deleted_at = NULL, updated_at = ?",
        setParams: [required.at],
        fromPredicate: "deleted_at IS NOT NULL",
        workspaceId: required.workspaceId,
        entityId: required.entityId,
        expectedVersion: required.expectedVersion,
      });
    },

    /**
     * The revision ledger and the search projection go WITH the row.
     *
     * Deliberate, and the opposite of the comments plugin's `moderation_log` rule: `post_revisions`
     * holds a full copy of every version of the post, so retaining it after a purge would make
     * "removed after 60 days" false and would grow the file forever with rows pointing at nothing.
     * The `moderation_log` is an audit of MODERATOR ACTIONS, not of content, which is why that one
     * is kept and this one is not.
     *
     * @complexity O(r) for r revisions of the one post.
     */
    async purge(required): Promise<TrashPurgeOutcome> {
      return compareAndDelete({
        client,
        table: POSTS_TABLE,
        workspaceId: required.workspaceId,
        entityId: required.entityId,
        expectedVersion: required.expectedVersion,
        cascade: ({ workspaceId, entityId }) => {
          client
            .prepare(`DELETE FROM "${POST_REVISIONS_TABLE}" WHERE workspace_id = ? AND post_id = ?`)
            .run(workspaceId, entityId);
          client.prepare(`DELETE FROM "${POST_SEARCH_DOCUMENT_TABLE}" WHERE post_id = ?`).run(entityId);
        },
      });
    },
  };
}
