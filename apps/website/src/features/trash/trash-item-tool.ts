import { toolMetadata } from '../../contracts/core/tool-metadata/trash.js';
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

import type { ToolRegistration, AgentToolDefinition } from "@jini-ai/core";
import type { AuthorizeFn } from "@jini-ai/core/contracts/events";
import {
  buildTrashItemAgentToolCatalog,
  deriveTrashItemRegistrations as deriveCmsTrashItemRegistrations,
  type TrashEntityType, type TrashPort, type TrashRegistry, type TrashUserPort,
} from "@jini-ai/cms/trash";

import { COMMENT_ENTITY_TYPE } from "./adapters/comment.js";
import { MEDIA_ENTITY_TYPE } from "./adapters/media.js";
import { POST_ENTITY_TYPE } from "./adapters/post.js";
import { REDIRECT_ENTITY_TYPE } from "./adapters/redirect.js";
import { THEME_ENTITY_TYPE } from "./adapters/theme.js";
import { USER_ENTITY_TYPE } from "./adapters/user.js";
import type { TrashDb } from "./db-port.js";
import { moveToTrash } from "./move-to-trash.js";
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

/** Insertion order is the order the model is told the kinds in. */
export const TRASH_ITEM_DELEGATES: ReadonlyMap<TrashEntityType, TrashItemDelegate> = new Map<TrashEntityType, TrashItemDelegate>([
  [
    POST_ENTITY_TYPE,
    {
      entityType: POST_ENTITY_TYPE,
      toolId: "content_post_delete",
      permission: "content.write",
      // The row's own `kind`, so a page is deleted as a page and the delegate's kind guard applies.
      async toDelegateInput({ deps, entityId }) {
        const row = await deps.postRepo.findById({ workspaceId: deps.workspaceId, id: entityId });
        // Templates use the Post storage/trash owner; never hand an unsupported editor kind to its tool.
        return row ? { id: entityId, kind: row.kind === "email-template" ? "post" : row.kind } : null;
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
      async toDelegateInput({ deps, entityId }) {
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
      async toDelegateInput({ deps: _deps, entityId }) {
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
      async toDelegateInput({ deps: _deps, entityId }) {
        return { id: entityId };
      },
    },
  ],
  [
    WIDGET_ENTITY_TYPE,
    {
      entityType: WIDGET_ENTITY_TYPE,
      toolId: "widgets_trash_instance",
      permission: "widgets.delete",
      // No resolve needed, same as media/redirect above — `widgets_trash_instance`'s own read
      // (a raw `entryRepo.findById`, no payload parse) resolves not-found itself.
      async toDelegateInput({ deps: _deps, entityId }) {
        return { widgetInstanceId: entityId };
      },
    },
  ],
  [
    THEME_ENTITY_TYPE,
    {
      entityType: THEME_ENTITY_TYPE,
      toolId: "theme_trash",
      permission: "theme.edit",
      // The theme id IS the entity id; `theme_trash` resolves it against the live registry and owns
      // the active-theme refusal, so nothing is read here.
      async toDelegateInput({ deps: _deps, entityId }) {
        return { themeId: entityId };
      },
    },
  ],
]);

const TRASH_ITEM_PRESENTATION = {
    description:
      "Waits for human approval, then moves one item to Trash with {entityType, entityId}. The entityType enum lists supported kinds. Runs the kind's existing permission and version checks through its own delete tool, moveToTrash, or (for a user) the Users screen's own delete. Returns {entityType, entityId, via, outcome}, where via names the delegate, 'moveToTrash' or 'trashUser' and outcome reports the reversible removal. A trashed user is disabled and signed out; only the owner or an admin may trash one, never themselves or the owner. Refuses unsupported kinds, missing items, denied permissions, and version conflicts. Recover with trash_restore_item. For permanent deletion use trash_purge_item or trash_empty if available to you; otherwise link /admin/trash. Secrets, credentials and MCP connections have no Trash screen. The 60-day retention backstop still removes expired items.",
  entityTypeDescription: "Which kind of thing to trash. page uses the existing post adapter and content_post_delete; the stored Trash entityType is post.",
  entityIdDescription: "That thing's own id.",
  floorPermission: "content.read",
  aliases: new Map([["page", POST_ENTITY_TYPE]]),
};

/**
 * `trash_item`'s declared catalog: one entry, every kind in {@link TRASH_ITEM_DELEGATES}, then `user`
 * (the composition root always binds {@link TrashUserPort}; generic registry kinds are absent here
 * because they come from the live registry, not from a static list).
 *
 * Deliberately NOT part of the listing/restoration catalog. That catalog is proven to hold exactly two
 * tools by `__tests__/tool-registrations.purge-ban.test.ts`, and this tool is built by a
 * post-processing pass, not by the trash contributor.
 *
 * @complexity O(k) in the delegate kinds.
 */
export function getTrashItemAgentToolCatalog(): readonly AgentToolDefinition[] {
  return buildTrashItemAgentToolCatalog({ kinds: [...TRASH_ITEM_DELEGATES.keys(), USER_ENTITY_TYPE], presentation: TRASH_ITEM_PRESENTATION });
}

/**
 * Builds the `trash_item` registration over the already-built registration list.
 *
 * @param required.registrations every registration `buildAssistantToolRegistrations`' contributor
 *        loop produced. Each delegate's handler is taken from here and reused unchanged.
 * @param required.routeDeps the same route-deps bag those registrations were built from.
 * @param optional.delegates test seam; defaults to {@link TRASH_ITEM_DELEGATES}.
 * @param optional.trashUser makes `user` an accepted kind; absent = `user` is not accepted.
 * @returns one registration, or none when neither a delegate's tool nor any registry entry is
 *          reachable. A list so the caller appends it the way it appends
 *          `deriveContentReadRegistrations`' output.
 * @complexity O(r + k) to index the registrations and the registry; each call is O(1) plus one row
 *             read for a delegate kind that resolves, or one row read and removal for a generic kind.
 *
 * A kind whose delete tool is not in `registrations`, or a registry kind whose adapter is not (yet)
 * live in `routeDeps.isTrashableEntityType`, is simply not accepted — its name is left out of the
 * schema and out of the refusal's "Expected one of". Deliberately not a throw: many compositions
 * (and most tests) build a catalog without every domain, and failing the whole assistant catalog
 * because one domain is absent would take every other tool down with it.
 */
export function deriveTrashItemRegistrations(
  required: { registrations: readonly ToolRegistration[]; routeDeps: TrashItemToolDeps },
  optional: { delegates?: ReadonlyMap<TrashEntityType, TrashItemDelegate>; trashUser?: TrashUserPort } = {}
): ToolRegistration[] {
  const { routeDeps } = required;
  // `?? []`: `registry` is typed as required, but plenty of existing test fixtures build a
  // `RouteDeps` double with `as unknown as RouteDeps` and never set it — same "many compositions
  // build a catalog without every domain" reality the comment above already accepts for
  // `isTrashableEntityType`. A missing registry degrades to "no generic kinds," not a crash that
  // takes the whole assistant catalog down with it.
  return deriveCmsTrashItemRegistrations({
    registrations: required.registrations,
    deps: {
      authorize: (input) => routeDeps.authorize(input),
      workspaceId: routeDeps.workspaceId,
      isTrashableEntityType: (input) => routeDeps.isTrashableEntityType(input),
      registry: routeDeps.registry ?? new Map(),
      delegates: new Map([...(optional.delegates ?? TRASH_ITEM_DELEGATES)].map(([entityType, delegate]) => [entityType, {
        ...delegate,
        toDelegateInput: ({ entityId }: { entityId: string }) => delegate.toDelegateInput({ deps: routeDeps, entityId }),
      }])),
      // The snapshot's `version` is optional (entries without one); the port wants it explicit.
      readLiveVersion: async (input) => {
        const row = await readLiveSnapshot(input, { kernel: routeDeps.db, registry: routeDeps.registry });
        return row && { version: row.version ?? null };
      },
      moveToTrash: (input) => moveToTrash(input, {
        registry: routeDeps.registry, trash: routeDeps.trash, db: routeDeps.db, authorize: routeDeps.authorize, clock: routeDeps.clock,
      }),
      actorPluginId: ASSISTANT_ACTOR_PLUGIN_ID,
      userKind: USER_ENTITY_TYPE,
      presentation: TRASH_ITEM_PRESENTATION,
      metadata: toolMetadata,
    },
  }, { trashUser: optional.trashUser });
}
