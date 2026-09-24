import type { ClockPort, DomainEvent, IdGeneratorPort, OutboxPort, UUID } from "@jini-ai/cms/core";

import {
  MenuConflictError,
  MenuNotFoundError,
  validateAndCloneTree,
  type MenuRepoPort,
  type NavLocationBindingRepoPort,
  type NavMenuEntry,
} from "./index.js";

/**
 * @file S3 of `ADS-memory/.local-artifacts/publish-types-plan-2026-09-24.md` — the host-local
 * "replicate one menu from another instance, preserving its id" chokepoint
 * `features/navigation/publish-content.ts`'s `apply()` writes through. Mirrors
 * `features/post/post.ts`'s `importPostEntity` (id-preserving, OCC-gated, refuses a
 * destination-destroying overwrite) — see that function's own doc for why this is a THIRD write path
 * alongside Jini's `createMenu`/`updateMenuTree` rather than a widening of either: `createMenu` mints
 * its own id (`menu-service.ts:337-352`, "unusable here" per the design record in
 * `ADS-memory/.local-artifacts/handoffs/2026-09-24-c7-publish-types-build.md`), and `updateMenuTree`
 * cannot create a row that does not exist yet at the destination.
 *
 * ## Location rebinding — reimplements `assignLocation`'s binding-index half, does not call it
 *
 * Jini's own `assignLocation` (`menu-service.ts:541-616`) both (a) upserts the derived binding index
 * and (b) RE-SAVES the whole menu with one location key added — a second, redundant `MenuRepoPort
 * .save()` beyond the one write this function already issues for the FULL incoming `locations` array
 * at once (below). Calling `assignLocation` once per location in `record.locations` would re-save the
 * menu N additional times, bumping `version` and firing an outbox event once per location for no real
 * content change on top of the content save. This function instead performs step (a) directly —
 * {@link rebindLocation} — for each location the incoming record claims. The OUTCOME (the binding
 * index ends up pointing at this menu; whatever previously held a claimed location is displaced and
 * revisioned) is identical to calling `assignLocation` per key, without the redundant resaves — a
 * disclosed, narrow deviation from the design record's literal wording.
 *
 * ## Trash: not special-cased here
 *
 * See `features/navigation/publish-content.ts`'s own header for why a trashed DESTINATION row is not
 * detected explicitly (an interface limitation, not an oversight) and why that is still safe: every
 * real `MenuRepoPort.save()` adapter already refuses to revive a trashed row at the storage layer.
 */

export interface ImportMenuEntityDeps {
  clock: ClockPort;
  idGen: IdGeneratorPort;
  repo: MenuRepoPort;
  bindingRepo: NavLocationBindingRepoPort;
  outbox: OutboxPort;
}

export interface ImportMenuEntityInput {
  workspaceId: UUID;
  /** The SOURCE instance's own `NavMenuEntry`, carried verbatim — `id` is preserved (S3's whole
   *  point: menu ids are shared across instances seeded from the same `content.seed.db`).
   *  `version`/`updatedAt`/`workspaceId` are destination-local write bookkeeping and are recomputed
   *  here, never copied from the wire. */
  record: NavMenuEntry;
  /** Optimistic-concurrency basis, same contract as `UpdateMenuTreeServiceInput.expectedVersion`:
   *  `undefined` means the caller believes no row exists here yet (a create), a number means it read
   *  that version and expects to still be writing over it. */
  expectedVersion?: number;
}

const NAV_MENU_CREATED_EVENT = "navigation.menu.created";
const NAV_MENU_UPDATED_EVENT = "navigation.menu.updated";
const NAV_LOCATION_ASSIGNED_EVENT = "navigation.location.assigned";
const NAV_LOCATION_UNASSIGNED_EVENT = "navigation.location.unassigned";

/** Same shape as `menu-service.ts`'s own module-private `buildEvent` — duplicated rather than
 *  imported (that function is not exported), the identical precedent `menu-trash-follow-ups.ts`'s
 *  own local `buildEvent` already establishes for a host-local integration against this library.
 *  @complexity O(1). */
function buildEvent(
  deps: ImportMenuEntityDeps,
  name: string,
  workspaceId: UUID,
  aggregateId: UUID,
  payload: Record<string, unknown>
): DomainEvent {
  return {
    id: deps.idGen.newId(),
    name,
    occurredAt: deps.clock.nowIso(),
    aggregateId,
    workspaceId,
    payload,
  };
}

/**
 * Assigns ONE location to `menu` in the derived binding index only — `menu`'s own `locations` field
 * was already written, in full, by the one `repo.save()` call in {@link importMenuEntity} below, so
 * this never touches `MenuRepoPort` for `menu` itself. Displaces whatever OTHER menu previously held
 * the location, exactly like `assignLocation`'s own last-writer-wins displacement rule — see this
 * file's header for why this reimplements that half of `assignLocation` rather than calling it.
 * @complexity O(1) repo calls.
 */
async function rebindLocation(
  deps: ImportMenuEntityDeps,
  workspaceId: UUID,
  menu: NavMenuEntry,
  locationKey: string,
  now: string
): Promise<NavMenuEntry | null> {
  const existingBinding = await deps.bindingRepo.findByLocation({ workspaceId, locationKey });
  let displacedMenu: NavMenuEntry | null = null;

  if (existingBinding && existingBinding.menuId !== menu.id) {
    const displaced = await deps.repo.findById({ workspaceId, id: existingBinding.menuId });
    if (displaced) {
      displacedMenu = {
        ...displaced,
        locations: displaced.locations.filter((key) => key !== locationKey),
        updatedAt: now,
        version: displaced.version + 1,
      };
      await deps.repo.save(displacedMenu);
      await deps.outbox.enqueue(
        buildEvent(deps, NAV_LOCATION_UNASSIGNED_EVENT, workspaceId, displacedMenu.id, {
          locationKey,
          menuId: displacedMenu.id,
        })
      );
    }
  }

  await deps.bindingRepo.upsert({ workspaceId, locationKey, menuId: menu.id, boundAt: now });
  await deps.outbox.enqueue(
    buildEvent(deps, NAV_LOCATION_ASSIGNED_EVENT, workspaceId, menu.id, { locationKey, menuId: menu.id })
  );

  return displacedMenu;
}

/**
 * Replicates ONE menu from another instance, preserving its id, and rebinds every theme location it
 * claims — the write `features/navigation/publish-content.ts`'s `apply()` calls through.
 *
 * Refuses (`MenuConflictError`) a create whose id already exists at the destination
 * (`expectedVersion === undefined` with an existing row) — mirrors `importPostEntity`'s identical
 * "caller's basis and destination reality must agree before anything is written" guard — and an
 * update whose `expectedVersion` no longer matches. Refuses (`MenuNotFoundError`) an update whose
 * basis has nothing to update. Refuses (`MenuConflictError`) a slug already held by a different menu.
 *
 * @complexity O(n) in the incoming tree size for `validateAndCloneTree`, plus O(k) location repo
 * calls where k = `record.locations.length` plus however many locations this update DROPS relative
 * to the destination's prior `locations` — both bounded by `DEFAULT_MAX_ITEM_COUNT`/registered-
 * location counts, never a user-scale collection.
 */
export async function importMenuEntity(required: {
  deps: ImportMenuEntityDeps;
  input: ImportMenuEntityInput;
}): Promise<{ menu: NavMenuEntry; displacedMenus: readonly NavMenuEntry[] }> {
  const { deps, input } = required;
  const { workspaceId, record } = input;

  const existing = await deps.repo.findById({ workspaceId, id: record.id });

  if (input.expectedVersion === undefined && existing) {
    throw new MenuConflictError(
      `menu '${record.id}' already exists at this destination (version ${existing.version}) but was published as new`
    );
  }
  if (input.expectedVersion !== undefined && !existing) {
    throw new MenuNotFoundError(`menu '${record.id}' was not found at this destination`);
  }
  if (existing && input.expectedVersion !== undefined && existing.version !== input.expectedVersion) {
    throw new MenuConflictError(
      `menu '${record.id}' was modified concurrently (expected version ${input.expectedVersion}, found ${existing.version})`
    );
  }

  if (record.slug !== existing?.slug) {
    const slugHolder = await deps.repo.findBySlug({ workspaceId, slug: record.slug });
    if (slugHolder && slugHolder.id !== record.id) {
      throw new MenuConflictError(`slug '${record.slug}' already exists at this destination`);
    }
  }

  const items = validateAndCloneTree(record.doc.items);
  const now = deps.clock.nowIso();
  const menu: NavMenuEntry = {
    ...record,
    workspaceId,
    doc: { ...record.doc, items },
    updatedAt: now,
    version: (existing?.version ?? 0) + 1,
  };

  await deps.repo.save(menu);
  await deps.outbox.enqueue(
    buildEvent(deps, existing ? NAV_MENU_UPDATED_EVENT : NAV_MENU_CREATED_EVENT, workspaceId, menu.id, {
      menuId: menu.id,
      slug: menu.slug,
    })
  );

  const displacedMenus: NavMenuEntry[] = [];
  for (const locationKey of menu.locations) {
    const displaced = await rebindLocation(deps, workspaceId, menu, locationKey, now);
    if (displaced) displacedMenus.push(displaced);
  }

  // Locations the destination previously had bound to this menu, but the incoming record no longer
  // claims — unassign, but only if the binding still actually points at THIS menu (never clobber a
  // location this run already reassigned elsewhere, or one another writer holds).
  const droppedLocations = (existing?.locations ?? []).filter((key) => !menu.locations.includes(key));
  for (const locationKey of droppedLocations) {
    const binding = await deps.bindingRepo.findByLocation({ workspaceId, locationKey });
    if (binding && binding.menuId === menu.id) {
      await deps.bindingRepo.remove({ workspaceId, locationKey });
    }
  }

  return { menu, displacedMenus };
}
