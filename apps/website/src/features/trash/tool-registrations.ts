/**
 * @file Trash's agent-tool wiring: `trash_list_items` and `trash_restore_item`, and nothing else.
 *
 * Read `agent-tools.ts`'s header first — it carries the two deliberate absences (no purge tool, no
 * generic trash tool) and why each is an absence rather than an oversight.
 *
 * Authorization shape: `TrashService` takes no `authorize` dependency at all, so, like Redirects,
 * this is the layer that gates (ADR-021 §2's single evaluator, located at the handler). The
 * permission is not one Trash permission but **the permission that domain's own delete tool
 * already required**, resolved per row. Restoring a post is undoing `content_post_delete`;
 * anything weaker than the gate on the delete would make the Trash a way around it.
 */
import {
  type AuthorizeFn,
  buildDomainRegistrations,
  indexCatalogById,
  optionalNumber,
  optionalString,
  requireInputRecord,
  requireString,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";
import type { ToolContributor } from "#src/assistant/index";
import { COMMENT_ENTITY_TYPE } from "./adapters/comment.js";
import { MEDIA_ENTITY_TYPE } from "./adapters/media.js";
import { POST_ENTITY_TYPE } from "./adapters/post.js";
import { REDIRECT_ENTITY_TYPE } from "./adapters/redirect.js";
import { getTrashAgentToolCatalog } from "./agent-tools.js";
import type { TrashEntityType, TrashItem, TrashPort } from "./ports.js";

const CATALOG_BY_ID = indexCatalogById(getTrashAgentToolCatalog());

const DEFAULT_LIST_LIMIT = 25;
const MAX_LIST_LIMIT = 100;

/**
 * Per-kind restore gate: **the same permission that kind's own delete tool required.**
 *
 * `content_post_delete` gates on `content.write`, `comments_trash_comment` on `comments.delete`
 * (its restore sibling on `comments.moderate`, which is the one used here — restoring is a
 * moderation action), `media_trash_asset` on `media.delete`, `redirects_tombstone` on
 * `admin.redirects.manage`. A kind absent from this map is not restorable and not listable, which
 * is the conservative default a phase-2 domain should have to opt out of deliberately.
 */
const RESTORE_PERMISSION_BY_ENTITY_TYPE: ReadonlyMap<TrashEntityType, string> = new Map([
  [POST_ENTITY_TYPE, "content.write"],
  [COMMENT_ENTITY_TYPE, "comments.moderate"],
  [MEDIA_ENTITY_TYPE, "media.delete"],
  [REDIRECT_ENTITY_TYPE, "admin.redirects.manage"],
]);

/**
 * The exact slice of the route-deps bag Trash's tool handlers read. Declared structurally rather
 * than importing `server/routes/types`, so this module carries no back-edge into the composition
 * root; `RouteDeps` satisfies it as-is.
 *
 * `trash` is the whole {@link TrashPort} — including `purgeSelected`, which no handler below calls
 * and which `__tests__/tool-registrations.purge-ban.test.ts` proves no handler anywhere reaches.
 */
export interface TrashToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  trash: TrashPort;
  clock: { nowIso(): string };
}

/** Model-facing row. Drops `workspaceId` (every call is already scoped to one) and the trash row's
 *  own id, which addresses nothing a tool can call — `trash_restore_item` takes the entity's id. */
function toTrashToolView(item: TrashItem, now: string) {
  return {
    entityType: item.entityType,
    entityId: item.entityId,
    title: item.displayTitle,
    subtitle: item.displaySubtitle,
    deletedAt: item.trashedAt,
    deletedBy: item.actorPluginId ? `${item.actorPrincipalId} (via ${item.actorPluginId})` : item.actorPrincipalId,
    permanentlyRemovedAfter: item.purgeAfter,
    daysRemaining: daysBetween(now, item.purgeAfter),
  };
}

/**
 * Whole days from `now` until `until`, floored at 0.
 *
 * Floored rather than allowed to go negative because the list already excludes expired rows: a
 * negative number here could only come from a clock skew, and "-3 days remaining" reads as a bug
 * to a model that then has to guess what it means.
 *
 * @complexity O(1).
 */
function daysBetween(now: string, until: string): number {
  const ms = new Date(until).getTime() - new Date(now).getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/**
 * Trash's independent classification of what its own handlers do, compared for equality against
 * the catalog's self-declaration at build time (`assertToolIsWirable`).
 *
 * `purgeSelected` appears in neither map and in no catalog, so there is no id a future edit could
 * add here that would wire it by accident — it would have to add a catalog entry and a handler too.
 */
export const trashDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // `TrashPort.list` is a single indexed read of `trashed_items`. It touches no entity at all.
  ["trash_list_items", "none"],
  // Clears the domain marker and drops the index row. Reversible by deleting the item again, so
  // `mutates-durable-state` rather than `deletes-durable-state`: nothing is removed.
  ["trash_restore_item", "mutates-durable-state"],
]);

/**
 * Builds Trash's registrations.
 *
 * @param routeDeps the structural slice above; `server/routes/*` passes its `RouteDeps` unchanged.
 * @returns the two registrations. Never a third.
 * @complexity O(1) to build.
 */
export function buildTrashRegistrations(routeDeps: TrashToolDeps): ToolRegistration[] {
  /**
   * True when `principalId` may restore rows of this kind. Uses `authorize` directly rather than
   * `requireToolPermission` because the list path must SKIP a row it cannot show, not fail.
   *
   * @complexity O(1) per distinct entity type, memoised per call by the caller's own `Map`.
   */
  async function mayRestore(principalId: string, entityType: TrashEntityType): Promise<boolean> {
    const permission = RESTORE_PERMISSION_BY_ENTITY_TYPE.get(entityType);
    if (!permission) return false;
    const decision = await routeDeps.authorize({
      principalId,
      permission,
      workspaceId: routeDeps.workspaceId,
      entityType,
    });
    return decision.allowed;
  }

  const handlers: Record<string, ToolHandler> = {
    /**
     * One page of the Trash, filtered to the kinds this principal could restore.
     *
     * The filter runs AFTER the page is fetched rather than as a narrowed `entityTypes` argument,
     * so a page can come back short. That is the honest shape: `nextCursor` still points at the
     * next row in the real keyset, and hiding rows by shrinking the query would make the cursor
     * skip rows the caller IS allowed to see when their permissions change mid-scan.
     */
    trash_list_items: async (ctx) => {
      const input = ctx.input === undefined ? {} : requireInputRecord(ctx.input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "content.read" });

      const requested = readEntityTypes(input);
      const limit = Math.min(optionalNumber(input, "limit") ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
      const now = routeDeps.clock.nowIso();

      const page = await routeDeps.trash.list({
        workspaceId: routeDeps.workspaceId,
        now,
        entityTypes: requested,
        limit,
        cursor: optionalString(input, "cursor") ?? null,
      });

      const allowedByType = new Map<TrashEntityType, boolean>();
      const items: ReturnType<typeof toTrashToolView>[] = [];
      for (const item of page.items) {
        let allowed = allowedByType.get(item.entityType);
        if (allowed === undefined) {
          allowed = await mayRestore(ctx.principal.id, item.entityType);
          allowedByType.set(item.entityType, allowed);
        }
        if (allowed) items.push(toTrashToolView(item, now));
      }

      return { items, nextCursor: page.nextCursor };
    },

    /**
     * Undoes one delete.
     *
     * No confirmation dialog, deliberately: unlike every delete tool, restoring destroys nothing
     * and is itself undone by deleting the item again. Gating it behind a human dialog would make
     * recovering from a mistaken delete harder than making one.
     */
    trash_restore_item: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const entityType = requireString(input, "entityType");
      const entityId = requireString(input, "entityId");

      const permission = RESTORE_PERMISSION_BY_ENTITY_TYPE.get(entityType);
      if (!permission) {
        throw new Error(
          `trash_restore_item: '${entityType}' is not a kind the Trash can restore. Expected one of: ` +
            `${[...RESTORE_PERMISSION_BY_ENTITY_TYPE.keys()].join(", ")}.`
        );
      }
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission, entityType, entityId });

      const outcome = await routeDeps.trash.restore({
        workspaceId: routeDeps.workspaceId,
        entityType,
        entityId,
        at: routeDeps.clock.nowIso(),
      });
      return outcome === "restored"
        ? { restored: true, entityType, entityId }
        : { restored: false, reason: outcome, entityType, entityId, note: RESTORE_FAILURE_NOTES[outcome] };
    },
  };

  return buildDomainRegistrations({
    domain: "trash",
    catalogModule: "trash/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: trashDerivedRisk,
  });
}

/** What each non-`restored` outcome means, in the words a model should relay rather than re-guess. */
const RESTORE_FAILURE_NOTES: Record<string, string> = {
  "not-found": "That item is not in the Trash. It may have been restored already, or permanently removed.",
  "version-changed": "The item changed since it was deleted, so nothing was touched. Read it again and retry.",
  "adapter-unavailable":
    "The plugin that owns this kind of item is no longer installed, so it cannot be restored until it is reinstalled. It is still listed.",
};

/** Reads and validates the optional `entityTypes` filter. @complexity O(n) in the filter's length. */
function readEntityTypes(input: Record<string, unknown>): TrashEntityType[] | undefined {
  const raw = input.entityTypes;
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.some((value) => typeof value !== "string")) {
    throw new Error("trash_list_items: 'entityTypes' must be an array of strings when it is given.");
  }
  return raw as TrashEntityType[];
}

/**
 * Contributes Trash's two tools to the assistant's catalog — called once by
 * `server/runtime/composition/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`.
 */
export function contributeTrashTools(): ToolContributor {
  return { domain: "trash", build: buildTrashRegistrations, risk: trashDerivedRisk };
}
