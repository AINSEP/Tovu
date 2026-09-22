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
import { and, eq, type AnyColumn } from "drizzle-orm";

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
import { buildConfirmationSurface, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

import {
  resolveConfirmationDecision,
  SURFACE_EXCHANGE_ID_PARAM,
  type AssistantSurfaceDeps,
  type SurfaceExchange,
} from "../../contracts/core/tool-surface-exchanges.js";

import { COMMENT_ENTITY_TYPE } from "./adapters/comment.js";
import { MEDIA_ENTITY_TYPE } from "./adapters/media.js";
import { POST_ENTITY_TYPE } from "./adapters/post.js";
import { REDIRECT_ENTITY_TYPE } from "./adapters/redirect.js";
import type { TrashDb } from "./db-port.js";
import { moveToTrash, type MoveToTrashOutcome } from "./move-to-trash.js";
import { notTrashed } from "./not-trashed.js";
import type { TrashActor, TrashEntityType, TrashPort } from "./ports.js";
import type { TrashEntry, TrashRegistry } from "./registry.js";

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
 * e.g. `comments/write-service.ts`'s own header), and this constant is small enough that keeping it
 * a plain literal in each file costs less than a cross-feature import would.
 */
const ASSISTANT_ACTOR_PLUGIN_ID = "assistant";

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
  [
    WIDGET_ENTITY_TYPE,
    {
      entityType: WIDGET_ENTITY_TYPE,
      toolId: "widgets_trash_instance",
      permission: "widgets.delete",
      // No resolve needed, same as media/redirect above — `widgets_trash_instance`'s own read
      // (a raw `entryRepo.findById`, no payload parse) resolves not-found itself.
      async toDelegateInput(_deps, entityId) {
        return { widgetInstanceId: entityId };
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
      "Moves one item of any kind the Trash holds to the Trash, named by entityType and entityId (see entityType's own " +
      "enum for the full list — posts/pages, comments, media assets and redirect rules today, plus forms, form " +
      "submissions, widgets and other Trash-registered kinds). HUMAN-GATED: it always shows a confirmation dialog and " +
      "WAITS for the human's answer before writing anything — there is no second call to make. For a kind with its own " +
      "delete tool (post, comment, media, redirect, widget), it runs that tool's own permission check and shows that " +
      "tool's own dialog, so the result is identical to calling that tool directly. For every other kind it checks the " +
      "same permission that kind's Trash entry declares and shows the standard Trash confirmation. Returns " +
      "{ entityType, entityId, via, outcome }: `via` names the tool (or 'moveToTrash' for a generic kind) whose gates ran, " +
      "and `outcome` says whether the human confirmed, cancelled, or let the dialog expire. Rejected, with nothing " +
      "changed, when entityType is not a kind the Trash can hold or no such item of that kind exists. Anything trashed " +
      "can be brought back with trash_restore_item. There is deliberately NO tool for deleting something permanently: " +
      "that is done by a human, from the Trash screen.",
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

/** The column-only snapshot {@link readGenericEntityDisplay} reads for a GENERIC kind's confirmation
 *  dialog — mirrors `move-to-trash.ts`'s identical local `EntitySnapshotRow`, duplicated rather than
 *  imported (that file is T1-owned; see this file's own header for the "no type-specific code, no
 *  reach into T1's files" rule). */
interface GenericEntitySnapshotRow {
  title: string;
  subtitle?: string | null;
  version?: number | null;
}

/**
 * Reads the live display + version for one GENERIC `TRASHABLE` entity (no bespoke delegate) — the
 * SAME column-only query `moveToTrash` (`move-to-trash.ts`) runs right before it calls
 * `TrashPort.trash`, duplicated here because this is an earlier READ this tool needs in order to
 * raise its own confirmation dialog, one step before `moveToTrash` performs the equivalent read for
 * real. `notTrashed` excludes a row already in the Trash, same as `moveToTrash`'s own not-found
 * reading — a caller cannot re-trash what already looks gone from its own point of view.
 *
 * @complexity O(1): one indexed row read.
 */
async function readGenericEntityDisplay(
  deps: Pick<TrashItemToolDeps, "db" | "registry" | "workspaceId">,
  entry: TrashEntry,
  entityId: string
): Promise<GenericEntitySnapshotRow | null> {
  const columns: Record<string, AnyColumn> = { title: entry.display.title };
  if (entry.display.subtitle) columns.subtitle = entry.display.subtitle;
  if (entry.versionColumn) columns.version = entry.versionColumn;
  return (await deps.db.selectOne({
    table: entry.table,
    columns,
    join: entry.display.join,
    where: and(
      eq(entry.workspaceColumn, deps.workspaceId),
      eq(entry.idColumn, entityId),
      entry.scope,
      notTrashed({ entityType: entry.entityType }, { registry: deps.registry })
    )!,
  })) as GenericEntitySnapshotRow | null;
}

/** The `ui://` URI for one `trash_item` generic-confirmation instance — mirrors every sibling
 *  domain's identical `<domain>TrashConfirmationUri` (`media/tool-registrations.ts`,
 *  `widgets/tool-registrations.ts`), keyed by the exchange id. */
function genericTrashConfirmationUri(exchangeId: string): UIResourceUri {
  return `ui://tovu/trash-item/${exchangeId}` as UIResourceUri;
}

/**
 * Renders the STANDARD confirmation dialog for a GENERIC `TRASHABLE` kind — one shape for every
 * type with no bespoke delegate, built from the registry entry's own `label` and the row's own
 * display snapshot, so a new registry entry (T5's `menu`, T6's `term`/`taxonomy`) needs no new
 * dialog-building code here.
 *
 * @complexity O(1).
 */
function buildGenericTrashConfirmationResource(spec: { label: string; display: { title: string; subtitle?: string | null }; exchangeId: string }): UIResource {
  const { label, display, exchangeId } = spec;
  const details = [{ label: "Title", value: display.title }];
  if (display.subtitle) details.push({ label: "Subtitle", value: display.subtitle });
  return buildConfirmationSurface({
    uri: genericTrashConfirmationUri(exchangeId),
    title: `Move this ${label.toLowerCase()} to the Trash?`,
    description: "It moves to the Trash, restorable for 60 days. There is no purge tool an agent can call.",
    details,
    danger: true,
    confirm: { label: "Move to trash", toolName: TRASH_ITEM_TOOL_ID, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" } },
    cancel: { label: "Cancel", toolName: TRASH_ITEM_TOOL_ID, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "cancel" } },
    app: { appName: "tovu-trash-item", appVersion: "1" },
    preferredFrameSize: ["100%", "320px"],
  });
}

/**
 * Maps one non-ok {@link MoveToTrashOutcome} to the `ToolInputError` the generic path throws.
 *
 * `default` stays reachable at the type level even though `move-to-trash.ts` names only four reasons
 * today: T1 (plan §T1 step 2) is adding a `blocked` reason carrying a `code`/`count` for a term with
 * children, and this branch is what makes that addition surface a real message here — with no edit
 * to this file needed when it lands — instead of an `undefined` one. `outcome` narrows to `never` in
 * this branch under today's `MoveToTrashOutcome`; the cast is only ever exercised once a new reason
 * exists, and `never` is assignable to anything, so it costs nothing today.
 *
 * @complexity O(1).
 */
function moveToTrashOutcomeToError(entityType: TrashEntityType, entityId: string, outcome: Extract<MoveToTrashOutcome, { ok: false }>): ToolInputError {
  switch (outcome.reason) {
    case "not-found":
      return new ToolInputError(`trash_item: ${entityType} '${entityId}' was not found. Nothing was changed.`);
    case "forbidden":
      return new ToolInputError(`trash_item: not authorized for '${outcome.permission}'. Nothing was changed.`);
    case "version-changed":
      return new ToolInputError(
        `trash_item: ${entityType} '${entityId}' changed while the confirmation was open. Reload and try again. Nothing was changed.`
      );
    case "unknown-type":
      return new ToolInputError(`trash_item: '${entityType}' is not a kind of thing the Trash can hold. Nothing was changed.`);
    default: {
      const fallback = outcome as { reason: string; code?: string };
      const code = fallback.code ? ` (${fallback.code})` : "";
      return new ToolInputError(`trash_item: could not move ${entityType} '${entityId}' to the Trash: ${fallback.reason}${code}. Nothing was changed.`);
    }
  }
}

/**
 * Builds the ONE handler for a GENERIC `TRASHABLE` kind (no bespoke delegate): pre-checks the
 * registry entry's own permission, reads its live display (not-found -> `ToolInputError`, no
 * dialog), raises the standard confirmation, and on confirm calls `moveToTrash` — never
 * `TrashPort.trash` directly, so this stays the same single chokepoint `POST /trash/items` calls.
 *
 * @complexity O(1) plus whatever the confirmation exchange's own wait costs.
 */
function buildGenericTrashHandler(spec: { entityType: TrashEntityType; entry: TrashEntry; routeDeps: TrashItemToolDeps; surfaces: AssistantSurfaceDeps }): ToolHandler {
  const { entityType, entry, routeDeps, surfaces } = spec;
  return async (ctx) => {
    const input = requireInputRecord(ctx.input);
    const entityId = requireString(input, "entityId");

    await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: entry.permission, entityType, entityId });

    const snapshot = await readGenericEntityDisplay(routeDeps, entry, entityId);
    if (!snapshot) {
      throw new ToolInputError(`trash_item: ${entityType} '${entityId}' was not found. Nothing was changed.`);
    }

    if (!ctx.emitSurface) {
      throw new Error(
        "trash_item: this execution context has no interactive confirmation channel (no emitSurface), " +
          "so a destructive trash cannot be gated here. Nothing was trashed."
      );
    }

    const exchange: SurfaceExchange = surfaces.surfaceExchanges.open({ toolId: TRASH_ITEM_TOOL_ID, principalId: ctx.principal.id }, ctx.emitSurface);
    const ui = buildGenericTrashConfirmationResource({
      label: entry.label,
      display: { title: snapshot.title, subtitle: snapshot.subtitle ?? null },
      exchangeId: exchange.id,
    });

    const closeOnAbort = () => exchange.close();
    ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
    try {
      const outcome = await resolveConfirmationDecision(exchange, { channel: "mcp-ui", payload: { resource: ui } });
      if (!outcome.confirmed) {
        if (outcome.reason === "declined") {
          return { entityType, entityId, via: "moveToTrash", outcome: { trashed: false, cancelled: true } };
        }
        return {
          entityType,
          entityId,
          via: "moveToTrash",
          outcome: {
            trashed: false,
            cancelled: false,
            reason: outcome.reason,
            note:
              outcome.reason === "expired"
                ? "The user did not respond to the confirmation dialog before it expired. Nothing was trashed."
                : "The confirmation dialog was closed because the run ended. Nothing was trashed.",
          },
        };
      }

      const actor: TrashActor = { principalId: ctx.principal.id, pluginId: ASSISTANT_ACTOR_PLUGIN_ID };
      const moved = await moveToTrash(
        { workspaceId: routeDeps.workspaceId, entityType, entityId, actor },
        { registry: routeDeps.registry, trash: routeDeps.trash, db: routeDeps.db, authorize: routeDeps.authorize, clock: routeDeps.clock }
      );
      if (!moved.ok) throw moveToTrashOutcomeToError(entityType, entityId, moved);
      return { entityType, entityId, via: "moveToTrash", outcome: { trashed: true, cancelled: false, version: moved.version } };
    } finally {
      ctx.signal.removeEventListener("abort", closeOnAbort);
    }
  };
}

/**
 * Builds the `trash_item` registration over the already-built registration list.
 *
 * @param required.registrations every registration `buildAssistantToolRegistrations`' contributor
 *        loop produced. Each delegate's handler is taken from here and reused unchanged.
 * @param required.routeDeps the same route-deps bag those registrations were built from.
 * @param required.surfaces the assistant's surface-exchange store — needed now (2026-09-21, trash
 *        T4) because a GENERIC kind (no bespoke delegate) opens ITS OWN confirmation exchange here,
 *        rather than reusing a delegate's already-open one.
 * @param optional.delegates test seam; defaults to {@link TRASH_ITEM_DELEGATES}.
 * @returns one registration, or none when neither a delegate's tool nor any registry entry is
 *          reachable. A list so the caller appends it the way it appends
 *          `deriveContentReadRegistrations`' output.
 * @complexity O(r + k) to index the registrations and the registry; each call is O(1) plus one row
 *             read for a delegate kind that resolves, or one row read plus the confirmation wait for
 *             a generic kind.
 *
 * A kind whose delete tool is not in `registrations`, or a registry kind whose adapter is not (yet)
 * live in `routeDeps.isTrashableEntityType`, is simply not accepted — its name is left out of the
 * schema and out of the refusal's "Expected one of". Deliberately not a throw: many compositions
 * (and most tests) build a catalog without every domain, and failing the whole assistant catalog
 * because one domain is absent would take every other tool down with it.
 */
export function deriveTrashItemRegistrations(
  required: { registrations: readonly ToolRegistration[]; routeDeps: TrashItemToolDeps; surfaces: AssistantSurfaceDeps },
  optional: { delegates?: ReadonlyMap<TrashEntityType, TrashItemDelegate> } = {}
): ToolRegistration[] {
  const { routeDeps, surfaces } = required;
  const delegates = optional.delegates ?? TRASH_ITEM_DELEGATES;
  const registered = new Map(required.registrations.map((registration) => [registration.descriptor.id, registration.handler]));

  const delegateHandlerByEntityType = new Map<TrashEntityType, ToolHandler>();
  for (const delegate of delegates.values()) {
    const handler = registered.get(delegate.toolId);
    if (handler) delegateHandlerByEntityType.set(delegate.entityType, handler);
  }

  // GENERIC kinds: every `TRASHABLE` registry entry with no bespoke delegate above (`widget` DOES
  // have one, added to `TRASH_ITEM_DELEGATES`, so it never lands here) — read fresh from the live
  // registry every time this function runs (composition/test build time), never cached in a
  // module-level list (append-only registries memory: `registry.ts`'s own Map is rebuilt only at
  // composition, but reading it here rather than hardcoding a kind list is what lets a NEW registry
  // entry (T5's `menu`, T6's `term`/`taxonomy`) reach `trash_item` with zero edits to this file).
  // `?? []`: `registry` is typed as required, but plenty of existing test fixtures build a
  // `RouteDeps` double with `as unknown as RouteDeps` and never set it — same "many compositions
  // build a catalog without every domain" reality the comment above already accepts for
  // `isTrashableEntityType`. A missing registry degrades to "no generic kinds," not a crash that
  // takes the whole assistant catalog down with it.
  const genericEntryByEntityType = new Map<TrashEntityType, TrashEntry>();
  for (const [entityType, entry] of routeDeps.registry ?? []) {
    if (!delegateHandlerByEntityType.has(entityType)) genericEntryByEntityType.set(entityType, entry);
  }

  if (delegateHandlerByEntityType.size === 0 && genericEntryByEntityType.size === 0) return [];

  const reachableKinds = [...delegateHandlerByEntityType.keys(), ...genericEntryByEntityType.keys()];

  const handlers: Record<string, ToolHandler> = {
    trash_item: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const entityType = requireString(input, "entityType");
      const entityId = requireString(input, "entityId");

      // Against the live adapter map, on every call — never a list captured when this was built.
      const delegate = delegates.get(entityType);
      const delegateHandler = delegateHandlerByEntityType.get(entityType);
      if (delegate && delegateHandler && routeDeps.isTrashableEntityType(entityType)) {
        await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: delegate.permission, entityType, entityId });

        const delegateInput = await delegate.toDelegateInput(routeDeps, entityId);
        if (!delegateInput) {
          throw new ToolInputError(`trash_item: ${entityType} '${entityId}' was not found. Nothing was changed.`);
        }

        // The same `ctx` — so the delegate's dialog goes out on THIS call's surface channel and this
        // call parks on the human's answer — with only the input swapped for the delegate's own shape.
        const outcome = await delegateHandler({ ...ctx, input: delegateInput });
        return { entityType, entityId, via: delegate.toolId, outcome };
      }

      const genericEntry = genericEntryByEntityType.get(entityType);
      if (genericEntry && routeDeps.isTrashableEntityType(entityType)) {
        return buildGenericTrashHandler({ entityType, entry: genericEntry, routeDeps, surfaces })(ctx);
      }

      const accepted = reachableKinds.filter((kind) => routeDeps.isTrashableEntityType(kind));
      throw new ToolInputError(
        `trash_item: '${entityType}' is not a kind of thing the Trash can hold. Expected one of: ${accepted.join(", ")}. ` +
          "Nothing was changed."
      );
    },
  };

  return buildDomainRegistrations({
    domain: "trash-item",
    catalogModule: "trash/trash-item-tool.ts",
    catalog: indexCatalogById([trashItemToolDefinition(reachableKinds)]),
    handlers,
    derivedRisk: trashItemDerivedRisk,
  });
}
