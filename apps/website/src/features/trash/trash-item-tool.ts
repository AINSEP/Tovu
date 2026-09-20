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
 *    delete handler, unchanged — so the domain's own permission check, its own confirmation dialog
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
import {
  type AuthorizeFn,
  buildDomainRegistrations,
  indexCatalogById,
  requireInputRecord,
  requireString,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
  type WirableToolDefinition,
} from "@jini-ai/cms/core";
// `ToolInputError` so a refusal reaches the model with its message intact rather than as a redacted
// 500 — see `features/comments/tool-registrations.ts`'s identical import.
import { ToolInputError } from "@jini-ai/core";

import { COMMENT_ENTITY_TYPE } from "./adapters/comment.js";
import { MEDIA_ENTITY_TYPE } from "./adapters/media.js";
import { POST_ENTITY_TYPE } from "./adapters/post.js";
import { REDIRECT_ENTITY_TYPE } from "./adapters/redirect.js";
import type { TrashEntityType } from "./ports.js";

export const TRASH_ITEM_TOOL_ID = "trash_item";

/**
 * The slice of the route-deps bag `trash_item` reads. Structural, like `TrashToolDeps`, so this
 * module has no back-edge into the composition root.
 */
export interface TrashItemToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  /** Membership in the live Trash adapter map, read on every call. See `TrashDeps`. */
  isTrashableEntityType(entityType: TrashEntityType): boolean;
  postRepo: { findById(required: { workspaceId: string; id: string }): Promise<{ kind: string } | null> };
  commentRepo: { findById(required: { workspaceId: string; id: string }): Promise<{ version: number } | null> };
  commentsReady: Promise<unknown>;
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
  toDelegateInput(deps: TrashItemToolDeps, entityId: string): Promise<Record<string, unknown> | null>;
}

/** Insertion order is the order the model is told the kinds in. */
export const TRASH_ITEM_DELEGATES: ReadonlyMap<TrashEntityType, TrashItemDelegate> = new Map<TrashEntityType, TrashItemDelegate>([
  [
    POST_ENTITY_TYPE,
    {
      entityType: POST_ENTITY_TYPE,
      toolId: "content_post_delete",
      permission: "content.write",
      // The row's own `kind`, so a page is deleted as a page and the delegate's kind guard applies.
      async toDelegateInput(deps, entityId) {
        const row = await deps.postRepo.findById({ workspaceId: deps.workspaceId, id: entityId });
        return row ? { id: entityId, kind: row.kind } : null;
      },
    },
  ],
  [
    COMMENT_ENTITY_TYPE,
    {
      entityType: COMMENT_ENTITY_TYPE,
      toolId: "comments_trash_comment",
      permission: "comments.delete",
      // The delegate requires `expectedVersion`. The version read here is the one the dialog is shown
      // against; if the comment moves before the human confirms, `applyModeration` refuses.
      async toDelegateInput(deps, entityId) {
        await deps.commentsReady;
        const row = await deps.commentRepo.findById({ workspaceId: deps.workspaceId, id: entityId });
        return row ? { commentId: entityId, expectedVersion: row.version } : null;
      },
    },
  ],
  [
    MEDIA_ENTITY_TYPE,
    {
      entityType: MEDIA_ENTITY_TYPE,
      toolId: "media_trash_asset",
      permission: "media.delete",
      // The delegate reads the row itself (after its own permission check), so there is nothing to
      // resolve here.
      async toDelegateInput(_deps, entityId) {
        return { mediaId: entityId };
      },
    },
  ],
  [
    REDIRECT_ENTITY_TYPE,
    {
      entityType: REDIRECT_ENTITY_TYPE,
      toolId: "redirects_tombstone",
      permission: "admin.redirects.manage",
      async toDelegateInput(_deps, entityId) {
        return { id: entityId };
      },
    },
  ],
]);

/**
 * `trash_item`'s catalog entry, with `entityType`'s enum limited to `reachableKinds`.
 *
 * The one source of the entry: {@link getTrashItemAgentToolCatalog} (the declared side the assistant
 * contract tests compare against) and {@link deriveTrashItemRegistrations} (the published descriptor)
 * both build it here, so the two cannot drift apart.
 *
 * @complexity O(k) in the reachable kinds.
 */
function trashItemToolDefinition(reachableKinds: readonly TrashEntityType[]): WirableToolDefinition {
  return {
    name: TRASH_ITEM_TOOL_ID,
    description:
      "Moves one post or page, comment, media asset or redirect rule to the Trash, named by entityType and entityId. " +
      "HUMAN-GATED: this shows the SAME confirmation dialog that kind's own delete tool shows and WAITS for the human's " +
      "answer — there is no second call to make. It runs that tool's own permission check and writes through that tool's own " +
      "path, so the result is identical to calling content_post_delete, comments_trash_comment, media_trash_asset or " +
      "redirects_tombstone directly. Returns { entityType, entityId, via, outcome }: `via` names the tool whose gates ran and " +
      "`outcome` is exactly that tool's result (it says whether the human confirmed, cancelled, or let the dialog expire). " +
      "Rejected, with nothing changed, when entityType is not a kind the Trash can hold or no such item of that kind exists. " +
      "Anything trashed can be brought back with trash_restore_item. There is deliberately NO tool for deleting something " +
      "permanently: that is done by a human, from the Trash screen.",
    // The strongest of the four delegates' declarations (`content_post_delete`'s), because this tool
    // can reach every one of them.
    sideEffects: "deletes-durable-state",
    // The floor only, like `trash_restore_item`: the real gate is the delegate's own permission,
    // pre-checked at the handler per kind.
    authorization: { permission: "content.read" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["entityType", "entityId"],
      properties: {
        entityType: {
          type: "string",
          enum: [...reachableKinds],
          description: "Which kind of thing to trash.",
        },
        entityId: { type: "string", minLength: 1, description: "That thing's own id." },
      },
    },
  };
}

/**
 * `trash_item`'s declared catalog: one entry, every kind in {@link TRASH_ITEM_DELEGATES}.
 *
 * Deliberately NOT part of `getTrashAgentToolCatalog()`. That catalog is proven to hold exactly two
 * tools by `__tests__/tool-registrations.purge-ban.test.ts`, and this tool is built by a
 * post-processing pass, not by the trash contributor.
 *
 * @complexity O(k) in the delegate kinds.
 */
export function getTrashItemAgentToolCatalog(): readonly WirableToolDefinition[] {
  return [trashItemToolDefinition([...TRASH_ITEM_DELEGATES.keys()])];
}

/**
 * The wiring layer's own classification of `trash_item`, separate from its catalog entry's
 * `sideEffects`. Exported so `assistant/tool-registrations.ts` can fold it into the assistant-wide
 * risk map as well: without that, the whole-surface cross-check (`assertRiskMetadataIsWirable`) would
 * treat this wired tool as unclassified.
 */
export const trashItemDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // Routes into `content_post_delete` (`deletes-durable-state`) among others; see the catalog entry.
  [TRASH_ITEM_TOOL_ID, "deletes-durable-state"],
]);

/**
 * Builds the `trash_item` registration over the already-built registration list.
 *
 * @param required.registrations every registration `buildAssistantToolRegistrations`' contributor
 *        loop produced. Each delegate's handler is taken from here and reused unchanged.
 * @param required.routeDeps the same route-deps bag those registrations were built from.
 * @param optional.delegates test seam; defaults to {@link TRASH_ITEM_DELEGATES}.
 * @returns one registration, or none when not one delegate's tool is registered. A list so the
 *          caller appends it the way it appends `deriveContentReadRegistrations`' output.
 * @complexity O(r) to index the registrations; each call is O(1) plus one row read for post/comment.
 *
 * A kind whose delete tool is not in `registrations` is simply not accepted — its name is left out of
 * the schema and out of the refusal's "Expected one of". Deliberately not a throw: many compositions
 * (and most tests) build a catalog without every domain, and failing the whole assistant catalog
 * because one domain is absent would take every other tool down with it. What stops a real
 * composition from silently losing a kind is
 * `assistant/__tests__/tool-registrations.trash-item.test.ts`, which requires all four in the
 * production catalog.
 */
export function deriveTrashItemRegistrations(
  required: { registrations: readonly ToolRegistration[]; routeDeps: TrashItemToolDeps },
  optional: { delegates?: ReadonlyMap<TrashEntityType, TrashItemDelegate> } = {}
): ToolRegistration[] {
  const { routeDeps } = required;
  const delegates = optional.delegates ?? TRASH_ITEM_DELEGATES;
  const registered = new Map(required.registrations.map((registration) => [registration.descriptor.id, registration.handler]));

  const handlerByEntityType = new Map<TrashEntityType, ToolHandler>();
  for (const delegate of delegates.values()) {
    const handler = registered.get(delegate.toolId);
    if (handler) handlerByEntityType.set(delegate.entityType, handler);
  }
  if (handlerByEntityType.size === 0) return [];

  const handlers: Record<string, ToolHandler> = {
    trash_item: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const entityType = requireString(input, "entityType");
      const entityId = requireString(input, "entityId");

      // Against the live adapter map, on every call — never a list captured when this was built.
      const delegate = delegates.get(entityType);
      const handler = handlerByEntityType.get(entityType);
      if (!delegate || !handler || !routeDeps.isTrashableEntityType(entityType)) {
        const accepted = [...handlerByEntityType.keys()].filter((kind) => routeDeps.isTrashableEntityType(kind));
        throw new ToolInputError(
          `trash_item: '${entityType}' is not a kind of thing the Trash can hold. Expected one of: ${accepted.join(", ")}. ` +
            "Nothing was changed."
        );
      }

      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: delegate.permission,
        entityType,
        entityId,
      });

      const delegateInput = await delegate.toDelegateInput(routeDeps, entityId);
      if (!delegateInput) {
        throw new ToolInputError(`trash_item: ${entityType} '${entityId}' was not found. Nothing was changed.`);
      }

      // The same `ctx` — so the delegate's dialog goes out on THIS call's surface channel and this
      // call parks on the human's answer — with only the input swapped for the delegate's own shape.
      const outcome = await handler({ ...ctx, input: delegateInput });
      return { entityType, entityId, via: delegate.toolId, outcome };
    },
  };

  return buildDomainRegistrations({
    domain: "trash-item",
    catalogModule: "trash/trash-item-tool.ts",
    catalog: indexCatalogById([trashItemToolDefinition([...handlerByEntityType.keys()])]),
    handlers,
    derivedRisk: trashItemDerivedRisk,
  });
}
