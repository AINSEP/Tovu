import { toolMetadata } from '@jini-ai/core/tool-metadata/trash';
/**
 * @file `trash_item` — one generic "move this to the Trash" tool, built as a fifth DOOR onto the four
 * per-domain delete tools rather than a fifth PATH around them.
 *
 * Read this before touching it. The tool was first rejected (see `agent-tools.ts`'s header history)
 * because a generic `trash_item(entityType, entityId)` looked like a way past the four gates
 * `content_post_delete`, `comments_trash_comment`, `media_trash_asset` and `redirects_tombstone`
 * each carry. The owner asked for it anyway, so it is built so that none of those gates can be
 * skipped:
 *
 *  - **It writes nothing itself.** After resolving the row it invokes that kind's own, ALREADY-BUILT
 *    delete handler, unchanged — so the domain's own permission check
 *    and its own write path all run exactly as they do when the model calls that tool by name.
 *    Calling `TrashPort.trash` directly instead would have looked equivalent and been a regression:
 *    the domain paths also append the post revision, write the comment moderation log, run comment
 *    status hooks and emit `entry.unpublished` (SEO's sitemap invalidation) in the same transaction
 *    as the marker and the index row. A direct call would silently skip all of that.
 *  - **The permission comes from the delegate, never from a Trash-wide map.**
 *    `TRASH_PERMISSION_BY_ENTITY_TYPE` gates *restoring* a comment on `comments.moderate`, but
 *    *trashing* one needs `comments.delete`. Reusing that map here would have made this tool weaker
 *    than the one it sits beside.
 *  - **Kind and table cannot diverge.** The model-supplied `entityType` selects ONE delegate, and
 *    both the permission pre-checked here and every read and write after it are that delegate's,
 *    against that kind's own table. Naming `comment` for a post's id reads the comments table,
 *    finds nothing, and stops, so there is no row whose real kind differs from the one that was
 *    authorized. The purge route needs `authorizeItem` because it addresses a trash row by its OWN
 *    id, and the stored row carries a kind the request never states. Here the request names the
 *    kind, and it is the only kind ever touched.
 *
 * Why this is a post-processing pass (like `assistant/content-read-tool.ts`) and not a
 * `ToolContributor`: it needs the four delegates' built handlers, which exist only once every
 * contributor has run. `buildAssistantToolRegistrations` calls {@link deriveTrashItemRegistrations}
 * after that loop.
 *
 * It holds no `TrashPort` at all, so it has no route to the Trash's permanent-delete operation. The
 * test file proves that behaviorally rather than leaving it to this sentence.
 */

import type { AuthorizeFn } from "@jini-ai/core/contracts/events";
import {
  bindTrashItemTool,
  type TrashEntityType, type TrashPort, type TrashRegistry,
} from "@jini-ai/cms/trash";

import { COMMENT_ENTITY_TYPE } from "./adapters/comment.js";
import { MEDIA_ENTITY_TYPE } from "@jini-ai/cms/trash/site/adapters/media";
import { POST_ENTITY_TYPE } from "@jini-ai/cms/trash/site/adapters/post";
import { REDIRECT_ENTITY_TYPE } from "@jini-ai/cms/trash/site/adapters/redirect";
import { THEME_ENTITY_TYPE } from "@jini-ai/cms/trash/site/adapters/theme";
import { USER_ENTITY_TYPE } from "./adapters/user.js";
import type { TrashDb } from "./db-port.js";
import { moveToTrash } from "@jini-ai/cms/trash/site/move-to-trash";
import { readLiveSnapshot } from "@jini-ai/cms/trash/sql";

/** Matches `registry.ts`'s own `entityType: "widget"` literal — kept as a local literal, not an
 *  import from `features/widgets`, the same "duplicate the tiny thing" convention every OTHER
 *  delegate's entity-type constant in this file already follows (each lives in `./adapters/*.js`,
 *  a trash-owned copy, never the domain's own module). */
const WIDGET_ENTITY_TYPE: TrashEntityType = "widget";

/**
 * The AI marker every assistant-initiated Trash write stamps onto `actor.pluginId` (2026-09-21,
 * trash T4c owner ask: "admin + AI"). `actor.principalId` always stays the human's own principal —
 * an agent never acts as nobody, some principal's grant let it run — this constant only says THAT
 * call came through the assistant, not the admin screen's own delete button.
 *
 * Duplicated locally in each of the five delegate tool files rather than imported from here, the
 * same "duplicate the tiny thing" convention {@link WIDGET_ENTITY_TYPE} already documents: those
 * files structurally type their actor/remove seams and import nothing from `features/trash` (see
 * e.g. `Jini/packages/cms/src/comments/write-service.ts`'s own header), and this constant is small enough that keeping it
 * a plain literal in each file costs less than a cross-feature import would.
 */
const ASSISTANT_ACTOR_PLUGIN_ID = "assistant";

/**
 * The slice of the route-deps bag `trash_item` reads. Structural, like `TrashToolDeps`, so this
 * module has no back-edge into the composition root.
 */
export interface TrashItemToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  /** Membership in the live Trash adapter map, read on every call. See `TrashDeps`. */
  isTrashableEntityType(required: { entityType: TrashEntityType }, optional?: Record<string, never>): boolean;
  postRepo: { findById(required: { workspaceId: string; id: string }): Promise<{ kind: string } | null> };
  commentRepo: { findById(required: { workspaceId: string; id: string }): Promise<{ version: number } | null> };
  commentsReady: Promise<unknown>;
  /**
   * The four fields below back the GENERIC path (2026-09-21, trash T4): a `TRASHABLE` registry type
   * with no bespoke delegate below (`form`, `form_submission`, and whatever T5/T6 add — `menu`,
   * `term`, `taxonomy`) has no per-domain tool to route into, so `trash_item` reads and confirms it
   * itself, then calls `moveToTrash` directly — the same function `POST /trash/items`
   * (`routes/trash/items.ts`) calls. All four are already present on `RouteDeps`/`TrashToolDeps`
   * (`tool-registrations.ts` in this same feature); declared again here (structurally identical)
   * because this interface, not that one, is what `deriveTrashItemRegistrations` is typed against.
   */
  registry: TrashRegistry;
  trash: TrashPort;
  db: TrashDb;
  clock: { nowIso(): string };
}

/**
 * One kind `trash_item` accepts, and the delete tool it routes to.
 *
 * `permission` is that tool's declared gate, checked HERE before any read, so a principal who could
 * not call the delegate learns nothing about whether the row exists and never has a dialog raised
 * for them. The delegate checks again itself (the same redundant-but-harmless pre-check
 * `media_trash_asset`'s wrapper makes). `assistant/__tests__/tool-registrations.trash-item.test.ts`
 * pins every entry to its delegate's own catalog declaration.
 */
export interface TrashItemDelegate {
  readonly entityType: TrashEntityType;
  readonly toolId: string;
  readonly permission: string;
  /**
   * Builds the delegate's own input from the entity id, reading that kind's OWN table where the
   * delegate needs a field the model does not hold. `null` = no such row of this kind.
   */
  toDelegateInput(required: { deps: TrashItemToolDeps; entityId: string }): Promise<Record<string, unknown> | null>;
}

const TRASH_ITEM_PRESENTATION = {
    description:
      "Waits for human approval, then moves one item to Trash with {entityType, entityId}. The entityType enum lists supported kinds. Runs the kind's existing permission and version checks through its own delete tool, moveToTrash, or (for a user) the Users screen's own delete. Returns {entityType, entityId, via, outcome}, where via names the delegate, 'moveToTrash' or 'trashUser' and outcome reports the reversible removal. A trashed user is disabled and signed out; only the owner or an admin may trash one, never themselves or the owner. Refuses unsupported kinds, missing items, denied permissions, and version conflicts. Recover with trash_restore_item. For permanent deletion use trash_purge_item or trash_empty if available to you; otherwise link /admin/trash. Secrets, credentials and MCP connections have no Trash screen. The 30-day retention backstop still removes expired items.",
  entityTypeDescription: "Which kind of thing to trash. page uses the existing post adapter and content_post_delete; the stored Trash entityType is post.",
  entityIdDescription: "That thing's own id.",
  // The floor only, like `trash_restore_item`: the real gate is the delegate's own permission,
  // pre-checked at the handler per kind.
  floorPermission: "content.read",
  // Pages already use the post delete service/adapter. Keep one stored Trash kind so list,
  // restore, revisions and publication hooks all retain their existing owner.
  aliases: new Map([["page", POST_ENTITY_TYPE]]),
};

export const { TRASH_ITEM_DELEGATES, getTrashItemAgentToolCatalog, deriveTrashItemRegistrations } = bindTrashItemTool({
  kinds: { post: POST_ENTITY_TYPE, comment: COMMENT_ENTITY_TYPE, media: MEDIA_ENTITY_TYPE, redirect: REDIRECT_ENTITY_TYPE, widget: WIDGET_ENTITY_TYPE, theme: THEME_ENTITY_TYPE, user: USER_ENTITY_TYPE },
  delegates: new Map([
    [POST_ENTITY_TYPE, { entityType: POST_ENTITY_TYPE, toolId: "content_post_delete", permission: "content.write" }],
    [COMMENT_ENTITY_TYPE, { entityType: COMMENT_ENTITY_TYPE, toolId: "comments_trash_comment", permission: "comments.delete" }],
    [MEDIA_ENTITY_TYPE, { entityType: MEDIA_ENTITY_TYPE, toolId: "media_trash_asset", permission: "media.delete" }],
    [REDIRECT_ENTITY_TYPE, { entityType: REDIRECT_ENTITY_TYPE, toolId: "redirects_tombstone", permission: "admin.redirects.manage" }],
    [WIDGET_ENTITY_TYPE, { entityType: WIDGET_ENTITY_TYPE, toolId: "widgets_trash_instance", permission: "widgets.delete" }],
    [THEME_ENTITY_TYPE, { entityType: THEME_ENTITY_TYPE, toolId: "theme_trash", permission: "theme.edit" }],
  ]),
  actorPluginId: ASSISTANT_ACTOR_PLUGIN_ID, presentation: TRASH_ITEM_PRESENTATION, metadata: toolMetadata,
  readLiveSnapshot, moveToTrash,
});
