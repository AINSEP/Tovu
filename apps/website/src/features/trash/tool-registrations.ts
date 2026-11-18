import { toolMetadata } from '../../contracts/core/tool-metadata/trash.js';
/**
 * @file Trash's agent-tool wiring: `trash_list_items` and `trash_restore_item`, and nothing else.
 *
 * Read `agent-tools.ts`'s header first — it names the separate confirmed-purge contributor, and why
 * `trash_item` is built in `trash-item-tool.ts` rather than here.
 *
 * Authorization shape: `TrashService` takes no `authorize` dependency at all, so, like Redirects,
 * this is the layer that gates (ADR-021 §2's single evaluator, located at the handler). The
 * permission is not one Trash permission but **the permission that domain's own delete tool
 * already required**, resolved per row. Restoring a post is undoing `content_post_delete`;
 * anything weaker than the gate on the delete would make the Trash a way around it.
 */
import {
  buildDomainRegistrations,
  indexCatalogById,
  optionalString,
  readToolLimit,
  requireInputRecord,
  requireString,
  withToolMetadata,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/core";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import { type AuthorizeFn } from "@jini-ai/core/contracts/events";
// `ToolInputError` specifically — the marker `@jini-ai/daemon`'s `ToolExecutor` reads to tag a
// rejection `errorKind: 'validation'` rather than the redacted-500 `'internal'` bucket a bare
// `Error` gets. Same reasoning as `features/database/tool-registrations.ts`'s identical import.
import { ToolInputError } from "@jini-ai/core";
import type { UserRepoPort } from "@jini-ai/user-management";
import type { ToolContributor } from "@jini-ai/core";
import { buildTrashAgentToolCatalog } from "./agent-tools.js";
import {
  filterVisibleTrashItems,
  trashDaysRemaining,
  trashPermissionFor,
  TRASH_PERMISSION_BY_ENTITY_TYPE,
  TRASH_READ_PERMISSION,
} from "./permissions.js";
import type { TrashEntityType, TrashItem, TrashPort } from "@jini-ai/cms/trash";
import type { TrashRegistry } from "./registry.js";
import { trashToolEntityTypes } from "./tool-kinds.js";

const DEFAULT_LIST_LIMIT = 25;
const MAX_LIST_LIMIT = 100;

/** The principal id the boot-time widget adoption writes as its actor
 *  (`Jini/packages/cms/src/widgets/write-service.ts`'s `ADOPTION_ACTOR`) — duplicated from
 *  `server/inbound/admin-http/routes/trash/list.ts`'s constant of the same name/value rather than
 *  imported, so this domain-facing tool file carries no back-edge into the admin HTTP layer. */
const SYSTEM_ACTOR_PRINCIPAL_ID = "system";

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

/** The user listing `trash_list_items` reads, structurally: only the members the handler calls. */
interface TrashUserLister {
  list(required: { workspaceId: string }): Promise<readonly { principalId: string; username: string }[]>;
}

/**
 * The product policy the Trash tools need and do not own: which permission each kind requires, the
 * entry permission, the per-row visibility filter, the days-left rule and the two kind lists (one
 * for the unknown-kind message, one for the published enum). The host binds every member.
 */
export interface TrashToolPolicy {
  permissionFor(entityType: TrashEntityType): string | null;
  readPermission: string;
  filterVisible(input: { principalId: string; items: readonly TrashItem[] }): Promise<readonly TrashItem[]>;
  daysRemaining(input: { now: string; until: string }): number;
  /** The kinds the unknown-kind refusal names: not de-duplicated, in the host's order. */
  messageKinds(): readonly TrashEntityType[];
  /** The kinds the catalog's entityType enum publishes: de-duplicated, in the host's order. */
  catalogKinds(): readonly TrashEntityType[];
}

/** The exact slice of dependencies Trash's tool handlers read; the host supplies the policy. */
export interface TrashPackageToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  trash: TrashPort;
  clock: { nowIso(): string };
  userRepo: TrashUserLister;
  trashPolicy: TrashToolPolicy;
}

/**
 * The human-facing text for who deleted an item, in priority order: the account's username, else
 * `"system"` for the boot-time adoption actor, else a plain fallback for a removed/unknown account
 * — never the raw principal id. `" + AI"` is appended when a plugin acted, mirroring the admin
 * frontend's `rules.ts` `actorLabel()` separator (owner-approved in `ed210c740`), but literal rather
 * than localized: this is a model-facing JSON field, not UI copy.
 *
 * @complexity O(1) — one map lookup.
 */
function resolveActorDisplay(item: TrashItem, usernameByPrincipalId: ReadonlyMap<string, string>): string {
  const username = usernameByPrincipalId.get(item.actorPrincipalId);
  const human = username ?? (item.actorPrincipalId === SYSTEM_ACTOR_PRINCIPAL_ID ? "system" : "deleted user");
  return item.actorPluginId != null ? `${human} + AI` : human;
}

/**
 * One `userRepo.list` call per `trash_list_items` invocation, not one lookup per row — mirrors
 * `routes/trash/list.ts`'s `loadUsernamesByPrincipalId` exactly (same "workspace's user count is
 * already assumed small enough for one in-memory pass" reasoning).
 *
 * @complexity O(u) in the workspace's user count, once per call.
 */
async function loadUsernamesByPrincipalId(deps: TrashPackageToolDeps): Promise<ReadonlyMap<string, string>> {
  const users = await deps.userRepo.list({ workspaceId: deps.workspaceId });
  return new Map(users.map((user) => [user.principalId, user.username]));
}

/** Model-facing row. Drops `workspaceId` because every call is already scoped to one.
 *  Exposes the row's id as `trashItemId` for `trash_purge_item`; `trash_restore_item` still takes
 *  the entity's id as `entityId`. */
function toTrashToolView({ item, now, usernameByPrincipalId, daysRemaining }: { item: TrashItem; now: string; usernameByPrincipalId: ReadonlyMap<string, string>; daysRemaining: TrashToolPolicy["daysRemaining"] }, _optional = {}) {
  return {
    trashItemId: item.id,
    entityType: item.entityType,
    entityId: item.entityId,
    title: item.displayTitle,
    subtitle: item.displaySubtitle,
    deletedAt: item.trashedAt,
    deletedBy: resolveActorDisplay(item, usernameByPrincipalId),
    permanentlyRemovedAfter: item.purgeAfter,
    daysRemaining: daysRemaining({ now, until: item.purgeAfter }),
  };
}

/**
 * Trash's independent classification of what its own handlers do, compared for equality against
 * the catalog's self-declaration at build time (`assertToolIsWirable`).
 *
 * `purgeSelected` appears in neither map in this listing/restoration contributor, so no id an edit could
 * add here that would wire it by accident — it would have to add a catalog entry and a handler too.
 */
export const trashDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // `TrashPort.list` is a single indexed read of `trashed_items`. It touches no entity at all.
  ["trash_list_items", "none"],
  // Clears the domain marker and drops the index row. Reversible by deleting the item again, so
  // `mutates-durable-state` rather than `deletes-durable-state`: nothing is removed.
  ["trash_restore_item", "mutates-durable-state"],
]);

/** What each handler factory receives (neither handler opens a dialog, so no surface store). */
interface TrashHandlerArgs {
  deps: TrashPackageToolDeps;
}

/**
 * One page of the Trash, filtered to the kinds this principal could restore.
 *
 * The filter runs AFTER the page is fetched rather than as a narrowed `entityTypes` argument,
 * so a page can come back short. That is the honest shape: `nextCursor` still points at the
 * next row in the real keyset, and hiding rows by shrinking the query would make the cursor
 * skip rows the caller IS allowed to see when their permissions change mid-scan.
 */
const trashListItemsHandler = ({ deps }: TrashHandlerArgs): ToolHandler => async (ctx) => {
  const input = ctx.input === undefined ? {} : requireInputRecord({ input: ctx.input });
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: deps.trashPolicy.readPermission });

  const requested = readEntityTypes(input);
  const limit = readToolLimit({ input, max: MAX_LIST_LIMIT, fallback: DEFAULT_LIST_LIMIT });
  const now = deps.clock.nowIso();

  const page = await deps.trash.list({
    workspaceId: deps.workspaceId,
    now,
    limit      }, {
    entityTypes: requested,
    cursor: optionalString({ input: input, key: "cursor" }) ?? null      });

  const visible = await deps.trashPolicy.filterVisible({ principalId: ctx.principal.id, items: page.items });
  // Skip the lookup on an empty page — nothing visible to this principal, or the Trash truly is
  // empty — same as `routes/trash/list.ts`.
  const usernameByPrincipalId =
    visible.length > 0 ? await loadUsernamesByPrincipalId(deps) : new Map<string, string>();
  return {
    items: visible.map((item) => toTrashToolView({ item, now, usernameByPrincipalId, daysRemaining: deps.trashPolicy.daysRemaining })),
    nextCursor: page.nextCursor,
  };
};

/**
 * Undoes one delete.
 *
 * No confirmation dialog, deliberately: unlike every delete tool, restoring destroys nothing
 * and is itself undone by deleting the item again. Gating it behind a human dialog would make
 * recovering from a mistaken delete harder than making one.
 */
const trashRestoreItemHandler = ({ deps }: TrashHandlerArgs): ToolHandler => async (ctx) => {
  const input = requireInputRecord({ input: ctx.input });
  const entityType = requireString({ input: input, key: "entityType" });
  const entityId = requireString({ input: input, key: "entityId" });

  const permission = deps.trashPolicy.permissionFor(entityType);
  if (!permission) {
    throw new ToolInputError({ message: `trash_restore_item: '${entityType}' is not a kind the Trash can restore. Expected one of: ` +
      `${deps.trashPolicy.messageKinds().join(", ") }.` });
  }
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission }, { entityType, entityId });

  ctx.signal.throwIfAborted();
  const outcome = await deps.trash.restore({
    workspaceId: deps.workspaceId,
    entityType,
    entityId,
    at: deps.clock.nowIso()      }, {
    // Same `principalId` shape the admin restore route passes (`routes/trash/restore.ts`), plus
    // `pluginId`: this call always came in through an agent tool, not a human clicking Restore,
    // so whatever an adapter's `restore` records as the actor should say so — same "+ AI"
    // convention `resolveActorDisplay` (above) applies to a trash-side `actorPluginId`.
    actor: { principalId: ctx.principal.id, pluginId: "assistant" }      });
  return outcome === "restored"
    ? { restored: true, entityType, entityId }
    : { restored: false, reason: outcome, entityType, entityId, note: RESTORE_FAILURE_NOTES[outcome] };
};

/**
 * Builds Trash's registrations without the host's tool metadata.
 *
 * @param deps the package-side slice above, policy included.
 * @returns the two registrations. Never a third.
 * @complexity O(k) in the kind count, to build the catalog's enum.
 */
export function buildTrashToolRegistrations({ deps }: { deps: TrashPackageToolDeps }, _optional = {}): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    trash_list_items: trashListItemsHandler({ deps }),
    trash_restore_item: trashRestoreItemHandler({ deps }),
  };

  // Built per call, from the kinds this call's registry actually holds (F6) — a module-level
  // catalog would freeze the published entityType enum at whatever `TRASHABLE` held when this file
  // first loaded, before a later-registered phase-2 kind (`registry.ts`'s own "resolved at call
  // time" rule) could ever reach it.
  const catalog = indexCatalogById({ catalog: buildTrashAgentToolCatalog(deps.trashPolicy.catalogKinds()) });

  return buildDomainRegistrations({
    domain: "trash",
    catalogModule: "trash/agent-tools.ts",
    catalog,
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
    throw new ToolInputError({ message: "trash_list_items: 'entityTypes' must be an array of strings when it is given." });
  }
  return raw as TrashEntityType[];
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
 * The host builder: the package registrations plus this site's tool metadata. Its name and
 * positional parameter are pinned by existing callers and tests; no handler reads a surface store.
 *
 * @param routeDeps the structural slice above; `server/routes/*` passes its `RouteDeps` unchanged.
 */
export function buildTrashRegistrations(routeDeps: TrashToolDeps): ToolRegistration[] {
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
