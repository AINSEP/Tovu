import { withToolMetadata, type ToolContributor, type ToolRegistration } from "@jini-ai/core";
import type { AuthorizeFn } from "@jini-ai/core/contracts/events";
import { buildTrashToolRegistrations, trashDerivedRisk, type TrashPort, type TrashToolPolicy } from "@jini-ai/cms/trash";
import type { UserRepoPort } from "@jini-ai/user-management";
import { toolMetadata } from "../../contracts/core/tool-metadata/trash.js";
import { filterVisibleTrashItems, trashDaysRemaining, trashPermissionFor, TRASH_PERMISSION_BY_ENTITY_TYPE, TRASH_READ_PERMISSION } from "./permissions.js";
import type { TrashRegistry } from "./registry.js";
import { trashToolEntityTypes } from "./tool-kinds.js";

/**
 * @file This site's binding of Trash's two agent tools, `trash_list_items` and `trash_restore_item`,
 * whose catalog, handlers and authored risk map live in `@jini-ai/cms/trash`. What stays here is the
 * host's own policy: the tool metadata (search vocabulary and approval policy,
 * `contracts/core/tool-metadata/trash.ts`), the permission each kind needs (the permission that
 * kind's own delete tool required, `permissions.ts`), the per-row visibility filter, the kind lists
 * (`tool-kinds.ts`) and the contributor the composition root installs. Read `agent-tools.ts`'s
 * header in `@jini-ai/cms/trash` first — it names the separate confirmed-purge contributor, and why
 * `trash_item` is built in `trash-item-tool.ts` rather than here.
 */

/**
 * The exact slice of the route-deps bag Trash's tool handlers read. Declared structurally rather
 * than importing `server/routes/types`, so this module carries no back-edge into the composition
 * root; `RouteDeps` satisfies it as-is.
 *
 * `trash` is the whole {@link TrashPort} — including `purgeSelected`, which no handler below calls
 * while the separate `permanent-delete` contributor reaches it only after a human Confirm click.
 */
export interface TrashToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  trash: TrashPort;
  clock: { nowIso(): string };
  /** `TRASHABLE`, so `trash_restore_item` can resolve a phase-2 kind's permission the same way the
   *  admin HTTP routes do — see `permissions.ts`'s `trashPermissionFor`. */
  registry: TrashRegistry;
  /** Resolves `deletedBy` to a username instead of the raw principal id — same source the admin
   *  Trash list route reads (`routes/trash/list.ts`'s `loadUsernamesByPrincipalId`). */
  userRepo: UserRepoPort;
}

/** Binds the host's product policy: permissions, visibility, days-left and the two kind lists. */
function bindTrashPolicy(routeDeps: TrashToolDeps): TrashToolPolicy {
  return {
    permissionFor: (entityType) => trashPermissionFor(entityType, routeDeps),
    readPermission: TRASH_READ_PERMISSION,
    filterVisible: (input) => filterVisibleTrashItems(routeDeps, input),
    daysRemaining: trashDaysRemaining,
    messageKinds: () => [...TRASH_PERMISSION_BY_ENTITY_TYPE.keys(), ...routeDeps.registry.keys()],
    catalogKinds: () => trashToolEntityTypes(routeDeps.registry),
  };
}

/**
 * Builds Trash's registrations.
 *
 * @param routeDeps the structural slice above; `server/routes/*` passes its `RouteDeps` unchanged.
 * @returns the two registrations. Never a third.
 * @complexity O(1) to build.
 */
export function buildTrashRegistrations(routeDeps: TrashToolDeps): ToolRegistration[] {
  // The package registrations plus this site's tool metadata. The name and positional parameter are
  // pinned by existing callers and tests; no handler reads a surface store.
  return withToolMetadata({
    registrations: buildTrashToolRegistrations({ deps: { ...routeDeps, trashPolicy: bindTrashPolicy(routeDeps) } }),
    metadata: toolMetadata,
  });
}

/**
 * Contributes Trash's two tools to the assistant's catalog — called once by
 * `server/runtime/composition/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`.
 */
export function contributeTrashTools(): ToolContributor<TrashToolDeps, unknown> {
  return { domain: "trash", build: buildTrashRegistrations, risk: trashDerivedRisk };
}
