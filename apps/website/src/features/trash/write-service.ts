/**
 * @file The Trash write chokepoint (design §2.2).
 *
 * The one thing to understand before editing: **`trash` performs BOTH writes — the domain's marker
 * flip and the `trashed_items` index insert — inside a single transaction.** The design as first
 * written had the caller do two writes (`port.trash()` then `adapter.hide()`), and nothing made
 * them atomic; a failure between them leaves an item that is in the Trash *and still live on the
 * site*, or hidden with no Trash row, which is unrecoverable through the UI. Removing that seam is
 * the point of this module, so there is deliberately no exported way to perform half of it.
 *
 * Domains do not import this file. They receive {@link RemoveEntity} through their own dependency
 * object, pre-bound at the composition root with their `entityType` — see `bindRemoveEntity`.
 */
import { TRASH_RETENTION_DAYS } from "./ports.js";
import type {
  ForgetRemovedEntity,
  PurgeItemOutcome,
  PurgeReport,
  RemoveEntity,
  RestoreOutcome,
  TrashAdapter,
  TrashEntityType,
  TrashItem,
  TrashMarkerResult,
  TrashPage,
  TrashPort,
  TrashRepoPort,
  TransactionRunner,
} from "./ports.js";

/** What {@link TrashServiceDeps.onChanged} receives. One event per state change — a no-op outcome
 *  (`not-found`, `version-changed`, `already-gone`, `forbidden`, `adapter-unavailable`) never fires
 *  it, because nothing changed. */
export interface TrashChangeEvent {
  workspaceId: string;
  entityType: TrashEntityType;
  entityId: string;
  change: "trash" | "restore" | "purge";
}

export interface TrashServiceDeps {
  repo: TrashRepoPort;
  /**
   * Plain `Map`, built at the composition root, resolved on EVERY call — never a module-level
   * registry. This codebase's registries are append-only with no unregister, so any filtering done
   * at registration time runs exactly once (two real bugs already).
   */
  adapters: ReadonlyMap<TrashEntityType, TrashAdapter>;
  idGen: { next(): string };
  transaction: TransactionRunner;
  /**
   * Fires once, INSIDE the same transaction, after every trash/restore/purge that actually changed
   * something. Composition wires this to the SPEC-016 recovery watermark and a `trash.item_changed`
   * outbox event; per-type side effects (a menu/taxonomy revision + event) are a separate concern,
   * not this hook's job.
   *
   * A failure inside it — a thrown error or a rejected promise — is logged and swallowed: the state
   * change already committed and MUST NOT be undone because a side effect failed to fire. See
   * {@link notifyChanged}.
   */
  onChanged?: (event: TrashChangeEvent) => void | Promise<void>;
}

/**
 * Calls `deps.onChanged`, if present, and never lets it throw. See
 * {@link TrashServiceDeps.onChanged} for why a failure here must not propagate.
 *
 * @complexity O(1) beyond the hook itself.
 */
async function notifyChanged(deps: TrashServiceDeps, event: TrashChangeEvent): Promise<void> {
  if (!deps.onChanged) return;
  try {
    await deps.onChanged(event);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[trash] onChanged hook failed; the trash/restore/purge it followed already committed", error);
  }
}

/** Thrown when a domain's delete path is wired to an `entityType` with no adapter. A composition
 *  bug, not a runtime condition — fail fast rather than trash an entity that can never be restored. */
export class TrashAdapterMissingError extends Error {}

/**
 * `at` + {@link TRASH_RETENTION_DAYS}, as an ISO timestamp.
 *
 * Stamped at trash time, not computed at read time, so changing the constant later never
 * retroactively purges what a user was already promised.
 *
 * @complexity O(1).
 */
export function computePurgeAfter(at: string, retentionDays: number = TRASH_RETENTION_DAYS): string {
  const base = new Date(at);
  if (Number.isNaN(base.getTime())) {
    throw new RangeError(`trash: 'at' is not a parseable timestamp (received ${JSON.stringify(at)})`);
  }
  return new Date(base.getTime() + retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Builds the Trash service.
 *
 * @param deps repo, the call-time adapter map, an id generator and a reentrant transaction runner.
 * @returns the {@link TrashPort} surface. `purgeSelected` is human-only — it is never registered
 *          as an agent tool (enforced by a registry test, not by prompt wording).
 * @complexity O(1) to build.
 */
export function createTrashService(deps: TrashServiceDeps): TrashPort {
  /** Resolved on every call — see {@link TrashServiceDeps.adapters}. @complexity O(1). */
  function requireAdapter(entityType: TrashEntityType): TrashAdapter {
    const adapter = deps.adapters.get(entityType);
    if (!adapter) {
      throw new TrashAdapterMissingError(`trash: no adapter is registered for entity type '${entityType}'`);
    }
    return adapter;
  }

  return {
    /**
     * Hides the entity and indexes it as one unit.
     *
     * @complexity O(1) — one marker UPDATE plus one index INSERT, both inside one transaction.
     */
    async trash(required): Promise<TrashMarkerResult> {
      const adapter = requireAdapter(required.entityType);
      return deps.transaction(async () => {
        const marker = await adapter.hide({
          workspaceId: required.workspaceId,
          entityId: required.entityId,
          at: required.at,
          expectedVersion: required.expectedVersion,
        });
        if (!marker.ok) return marker;

        const row: TrashItem = {
          id: deps.idGen.next(),
          workspaceId: required.workspaceId,
          entityType: required.entityType,
          entityId: required.entityId,
          trashedAt: required.at,
          purgeAfter: computePurgeAfter(required.at),
          actorPrincipalId: required.actor.principalId,
          actorPluginId: required.actor.pluginId ?? null,
          displayTitle: required.display.title,
          displaySubtitle: required.display.subtitle ?? null,
          entityVersion: marker.version,
          priorMarker: marker.priorMarker ?? null,
        };
        await deps.repo.insert(row);
        await notifyChanged(deps, {
          workspaceId: required.workspaceId,
          entityType: required.entityType,
          entityId: required.entityId,
          change: "trash",
        });
        return marker;
      });
    },

    /**
     * Clears the domain marker and removes the index row, as one unit.
     *
     * An entity whose row was deleted out from under the index returns `"not-found"` and the index
     * row is LEFT IN PLACE — purge is the only path that removes an index row, and the user can
     * still select it there. One deletion path, not two.
     *
     * @complexity O(1).
     */
    async restore(required): Promise<RestoreOutcome> {
      const row = await deps.repo.findByEntity(required);
      if (!row) return "not-found";
      const adapter = deps.adapters.get(required.entityType);
      if (!adapter) return "adapter-unavailable";

      return deps.transaction(async () => {
        const marker = await adapter.unhide({
          workspaceId: required.workspaceId,
          entityId: required.entityId,
          at: required.at,
          expectedVersion: row.entityVersion,
          priorMarker: row.priorMarker,
        });
        if (!marker.ok) return marker.reason === "not-found" ? "not-found" : "version-changed";
        await deps.repo.deleteById({ workspaceId: required.workspaceId, id: row.id });
        await notifyChanged(deps, {
          workspaceId: required.workspaceId,
          entityType: required.entityType,
          entityId: required.entityId,
          change: "restore",
        });
        return "restored";
      });
    },

    /** @complexity one indexed keyset read; see `TrashRepoPort.list`. */
    async list(required): Promise<TrashPage> {
      return deps.repo.list(required);
    },

    /**
     * Permanent deletion of the selected rows. Reachable only from the Trash screen's confirm
     * modal — there is no agent tool for it.
     *
     * Per item, and per item only: one unavailable adapter, one stale version or one row the caller
     * may not touch must not abort the rest of the selection, so each row gets its own permission
     * check, its own transaction and its own recorded outcome.
     *
     * The gate runs on the row this method looked up, BEFORE the adapter is resolved: a caller who
     * may not destroy a row must not learn from the outcome whether its domain is still installed.
     *
     * @complexity O(k) authorization calls and at most O(k) transactions for k selected ids.
     */
    async purgeSelected(required): Promise<PurgeReport> {
      const rows = await deps.repo.findByIds({ workspaceId: required.workspaceId, ids: required.ids });
      const byId = new Map(rows.map((row) => [row.id, row]));
      const results: { id: string; outcome: PurgeItemOutcome }[] = [];

      for (const id of required.ids) {
        const row = byId.get(id);
        if (!row) {
          results.push({ id, outcome: "not-found" });
          continue;
        }
        if (!(await required.authorizeItem(row))) {
          results.push({ id, outcome: "forbidden" });
          continue;
        }
        const adapter = deps.adapters.get(row.entityType);
        if (!adapter) {
          results.push({ id, outcome: "adapter-unavailable" });
          continue;
        }
        const outcome = await deps.transaction(async (): Promise<PurgeItemOutcome> => {
          const result = await adapter.purge({
            workspaceId: row.workspaceId,
            entityId: row.entityId,
            expectedVersion: row.entityVersion,
          });
          // `version-changed` means someone restored or edited it since; leave the index row alone
          // so the safe outcome (the item survives) is what a race produces.
          if (result === "purged" || result === "already-gone") {
            await deps.repo.deleteById({ workspaceId: row.workspaceId, id: row.id });
          }
          // `already-gone` means the row was already gone before this call — nothing changed here,
          // so the hook does not fire for it, same as every other no-op outcome.
          if (result === "purged") {
            await notifyChanged(deps, {
              workspaceId: row.workspaceId,
              entityType: row.entityType,
              entityId: row.entityId,
              change: "purge",
            });
          }
          return result;
        });
        results.push({ id, outcome });
      }

      return { purged: results.filter((r) => r.outcome === "purged").length, results };
    },
  };
}

/**
 * Pre-binds {@link TrashPort.trash} to one `entityType`, producing the function a domain's delete
 * path receives as `deps.remove`.
 *
 * This is what keeps `post.ts`, `redirects.ts`, the comments write-service and the media route free
 * of any trash import: they call `deps.remove(...)` and never learn that a Trash exists.
 *
 * @complexity O(1).
 */
/**
 * Pre-binds an index-row drop to one `entityType`, producing the function a domain receives as
 * `deps.forgetRemoved` (see {@link ForgetRemovedEntity} for when a domain needs one).
 *
 * Binds against the repo rather than the service on purpose: there is no marker to move here, and
 * routing it through `TrashPort` would put a method on that port which does half of a `trash`.
 *
 * @complexity O(1).
 */
export function bindForgetRemovedEntity(repo: TrashRepoPort, entityType: TrashEntityType): ForgetRemovedEntity {
  return (required) =>
    repo.deleteByEntity({ workspaceId: required.workspaceId, entityType, entityId: required.id });
}

export function bindRemoveEntity(trash: TrashPort, entityType: TrashEntityType): RemoveEntity {
  return (required) =>
    trash.trash({
      workspaceId: required.workspaceId,
      entityType,
      entityId: required.id,
      actor: required.actor,
      display: required.display,
      at: required.at,
      expectedVersion: required.expectedVersion,
    });
}
