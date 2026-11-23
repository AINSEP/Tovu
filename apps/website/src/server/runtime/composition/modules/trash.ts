import type { Express } from "express";

import { trashMoveRoute, type TrashMoveFn } from "@jini-ai/cms/admin-http/routes/trash/items";
import { trashListRoute, type TrashPostDisplayKindsFn } from "@jini-ai/cms/admin-http/routes/trash/list";
import { trashPurgeRoute } from "@jini-ai/cms/admin-http/routes/trash/purge";
import { trashRestoreRoute } from "@jini-ai/cms/admin-http/routes/trash/restore";
import type { TrashEntryGateFn, TrashKindGateFn } from "@jini-ai/cms/admin-http/routes/trash/shared";
import type { TrashPort, TrashRegistry } from "@jini-ai/cms/trash";
import type { UserRepoPort } from "@jini-ai/user-management";
import {
  filterVisibleTrashItems, mayActOnEntityType, moveToTrash, TRASH_READ_PERMISSION,
  type TrashAuthorizeFn, type TrashDb, type TrashKindMover,
} from "#src/features/trash/index";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file The `trash` server module — the local admin Trash screen's routes (list, restore,
 * permanently delete) plus the generic `POST .../trash/items` move-to-trash entry point
 * (`ADS-memory/.local-artifacts/handoffs/2026-09-21-t8f-trash-more-plan.md` §3). Design of record for
 * the first three: `ADS-memory/reports/2026-09-20-trash-delete-architecture.md`.
 *
 * K1 (RT-K1-adm-trash-1): all four routes are Jini route specs (`@jini-ai/cms/admin-http/routes/trash/*`)
 * mounted behind the admin ports. `TrashRouteDeps` is read only here, at registration: each mount
 * builds that route's own small deps object. The Tovu-owned policy the specs need is injected here:
 * the Trash entry permission (`TRASH_READ_PERMISSION`), the per-kind permission lookup
 * (`mayActOnEntityType`/`filterVisibleTrashItems`), the generic move (`moveToTrash`) and the
 * column-only post-subtype read (the one step that touches `db`).
 *
 * All four paths sit under `/api/admin/v1/workspaces/:workspaceId/trash`, so registration order
 * against the rest of `app.ts` does not matter — no other module claims that prefix and none of
 * these is a catch-all. Order WITHIN the module is read-before-write purely for readability.
 *
 * This module is the only composition that hands `TrashPort` to an HTTP surface, which is what
 * makes `purgeSelected` reachable at all: permanent deletion is human-only, so its one caller is an
 * authenticated admin route behind the screen's confirm modal. No tool registration can reach it —
 * `features/trash/__tests__/tool-registrations.purge-ban.test.ts` proves that three ways.
 */

/**
 * The narrow dependency slice the four Trash admin routes read, and the registrar shape this module
 * composes them with — the same convention `routes/media/deps.ts` established.
 *
 * `trash` is the whole {@link TrashPort}, including `purgeSelected`. That is deliberate and it is
 * the ONLY place in the product that holds it (see the file header).
 *
 * `registry` and `db` are read by the move (`moveToTrash`) and by `permissions.ts`'s
 * `trashPermissionFor`/`mayActOnEntityType`/`filterVisibleTrashItems`, which the list/restore/purge
 * bindings below call with this same `deps` object — one field serving both concerns (plan §8/§9).
 *
 * `userRepo` is read only by the list, to resolve each row's `actorPrincipalId` to a username for
 * the "Deleted by" column (2026-09-21) — the admin screen must never show a raw principal UUID.
 */
export interface TrashRouteDeps {
  workspaceId: string;
  authorize: TrashAuthorizeFn;
  clock: { nowIso(): string };
  trash: TrashPort;
  registry: TrashRegistry;
  db: TrashDb;
  userRepo: UserRepoPort;
  /** Kinds outside `registry` that move themselves (a theme folder) — the move reaches them through
   *  `moveToTrash`. Absent: only registry kinds can be trashed here. */
  movers?: ReadonlyMap<string, TrashKindMover>;
}

export type TrashRouteRegistrar = (required: { app: Express; deps: TrashRouteDeps }, optional?: Record<string, never>) => void;

/** The unexpected-failure copy key (`sendAdminFailure`'s operation). Every trash route called
 *  `authorizeDirectOrRespond` (or no port authorizer at all), never the publishing-credential
 *  override, so all four mount `"direct"`. */
function mountOptions(operation: string) {
  return { authorization: "direct" as const, failure: { operation, code: "INTERNAL_ERROR" } };
}

/** One mount's deps: the port fields, the trash port and clock, plus the route's `own` fields. The
 *  trash port and clock are getters defined on the returned object itself (never spread, which would
 *  read them once): the hand-written routes read `deps.*` per request, tests reassign fields after
 *  registration, and a harness may expose an unused field as a throwing getter. */
function trashMountDeps<Own extends object>({ deps, own }: { deps: TrashRouteDeps; own: Own }, _optional: Record<string, never> = {}) {
  const port: AdminJsonRoutePortDeps = { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
  return { ...port, get trash() { return deps.trash; }, get clock() { return deps.clock; }, ...own };
}

/** The entry gate onto the Trash surface: the host's RBAC with exactly the hand-written params
 *  (`{ principalId, permission, workspaceId }`, no entity type). */
function trashEntryGate({ deps }: { deps: TrashRouteDeps }, _optional: Record<string, never> = {}): TrashEntryGateFn {
  return async ({ principalId }) => {
    const permission = TRASH_READ_PERMISSION;
    const { allowed, reason } = await deps.authorize({ principalId, permission, workspaceId: deps.workspaceId });
    return { permission, allowed, reason };
  };
}

/** The per-kind gate the restore/purge specs ask per row. */
function trashKindGate({ deps }: { deps: TrashRouteDeps }, _optional: Record<string, never> = {}): TrashKindGateFn {
  return (input) => mayActOnEntityType(deps, input);
}

/**
 * Resolve post/page subtypes without parsing entity payloads or changing trash identity.
 * Authorization has already filtered the input; missing rows leave the additive field absent.
 * @complexity O(p) results for at most one page of visible posts, one column-only query.
 */
function postDisplayKinds({ deps }: { deps: TrashRouteDeps }, _optional: Record<string, never> = {}): TrashPostDisplayKindsFn {
  return async ({ items }) => {
    const ids = items.filter((item) => item.entityType === "post").map((item) => item.entityId);
    if (ids.length === 0) return new Map();
    // Only the two subtypes the admin contract names (`AdminTrashItem.displayKind`) are emitted.
    const posts = await deps.db.run((db) => db.selectFrom("posts")
      .select(["id", "kind"])
      .where("workspace_id", "=", deps.workspaceId)
      .where("id", "in", ids)
      .where("kind", "in", ["page", "post"])
      .execute());
    return new Map(posts.map((post) => [post.id, post.kind]));
  };
}

export const registerAdminTrashListRoute: TrashRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: trashListRoute, deps: trashMountDeps({ deps, own: {
    authorizeEntry: trashEntryGate({ deps }), loadPostDisplayKinds: postDisplayKinds({ deps }),
    filterVisible: ({ principalId, items }: Parameters<typeof filterVisibleTrashItems>[1]) => filterVisibleTrashItems(deps, { principalId, items }),
    userRepo: { list: (required: { workspaceId: string }) => deps.userRepo.list(required) },
  } }) }, mountOptions("routes/trash/list"));
};

export const registerAdminTrashRestoreRoute: TrashRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: trashRestoreRoute, deps: trashMountDeps({ deps, own: {
    authorizeEntry: trashEntryGate({ deps }), mayActOn: trashKindGate({ deps }),
  } }) }, mountOptions("routes/trash/restore"));
};

export const registerAdminTrashPurgeRoute: TrashRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: trashPurgeRoute, deps: trashMountDeps({ deps, own: {
    authorizeEntry: trashEntryGate({ deps }), mayActOn: trashKindGate({ deps }),
  } }) }, mountOptions("routes/trash/purge"));
};

export const registerAdminTrashMoveToTrashRoute: TrashRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: trashMoveRoute, deps: trashMountDeps({ deps, own: {
    moveToTrash: (input: Parameters<TrashMoveFn>[0]) => moveToTrash(input, {
      registry: deps.registry, trash: deps.trash, db: deps.db, authorize: deps.authorize, clock: deps.clock, movers: deps.movers,
    }),
  } }) }, mountOptions("routes/trash/items"));
};

export function createTrashModule(deps: TrashRouteDeps): ServerModuleHandle {
  return {
    name: "trash",
    registerRoutes: ({ app }, _options = {}) => {
      registerAdminTrashListRoute({ app, deps });
      registerAdminTrashRestoreRoute({ app, deps });
      registerAdminTrashPurgeRoute({ app, deps });
      registerAdminTrashMoveToTrashRoute({ app, deps });
    },
  };
}
