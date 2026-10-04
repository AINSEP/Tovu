import type { PurgeCounts, UserPurgePort, UserPurgeReason } from "#src/features/identity/user-purge-types";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { outboxEventValues } from "#src/platform/db/repos/outbox-repo";
import type { DomainEvent } from "@jini-ai/cms/core";

import type { TrashAdapter, TrashMarkerResult, TrashPurgeOutcome } from "@jini-ai/cms/trash";
import { lazyKernel, type MarkerStore } from "./marker-sql.js";

/**
 * @file `TrashAdapter` for users (delete-user plan v2, decision 4) — bespoke rather than a
 * `TRASHABLE` registry entry, because `hide` writes two tables (`principals` AND `sessions`) and
 * `purge` must go through `UserPurgePort.purgeUser` (`SqlUserPurge`, `identity/user-purge.ts`) for
 * its own eight-table delete, not through a single-table `compareAndDelete`. Mirrors
 * `adapters/directory.ts`'s "bespoke adapter" precedent.
 *
 * `entityVersion` is always `null`: `principals` has no version column, so `hide`/`unhide`/`purge`
 * never receive a meaningful `expectedVersion` to compare against (the trash core still passes one
 * through, per the shared `TrashAdapter` contract, but this adapter has nothing to check it against).
 *
 * One Kysely body over the content database's storage kernel, so the same statements run on SQLite,
 * PGlite and Postgres. Each method is read-then-write, so each runs in `kernel.transaction` holding
 * `kernel.lockKey` for the principal (a nested transaction joins the trash core's own). That lock
 * only orders Trash against Trash: `SqlPrincipalRepo.save` never takes it, so on Postgres a
 * re-enable or disable can commit between the read and the write. `hide`/`unhide` therefore repeat
 * the status they read in the `UPDATE`'s `WHERE`, and 0 affected rows is `version-changed` — no
 * stale `priorMarker`, no overwritten status, no event. `hide`/`unhide` insert their own
 * `identity.user.trashed` / `identity.user.restored` outbox event ({@link outboxEventValues}) in that
 * same transaction as the marker write; `purge`'s `purgeUser` joins it too, so the status check and
 * the delete cannot be split by a concurrent restore.
 */

export const USER_ENTITY_TYPE = "user";

export interface UserTrashAdapterDeps {
  /** The content kernel (or, while call sites still hold one, the `content.db` handle). */
  db: MarkerStore;
  purge: UserPurgePort;
  idGen: { next(): string };
  clock: { nowIso(): string };
}

interface PrincipalRow {
  status: string;
  displayName: string;
}

/** @complexity O(1), one indexed read. */
async function readPrincipal(kernel: ContentKernel, workspaceId: string, principalId: string): Promise<PrincipalRow | null> {
  const row = await kernel.run((db) =>
    db
      .selectFrom("principals")
      .select(["status", "display_name"])
      .where("workspace_id", "=", workspaceId)
      .where("id", "=", principalId)
      .executeTakeFirst()
  );
  return row ? { status: row.status, displayName: row.display_name } : null;
}

/** Falls back to the principal's display name for a principal with no `identity_users` row (an
 *  `api_key` principal, decision 5's "Tovu-Runner" case) — the audit event still needs a name to
 *  report even when there is no login username to give it.
 *  @complexity O(1), one indexed read. */
async function readDisplayUsername(kernel: ContentKernel, workspaceId: string, principalId: string, fallback: string): Promise<string> {
  const row = await kernel.run((db) =>
    db
      .selectFrom("identity_users")
      .select("username")
      .where("workspace_id", "=", workspaceId)
      .where("principal_id", "=", principalId)
      .executeTakeFirst()
  );
  return row?.username ?? fallback;
}

/** @complexity O(1), one insert. */
async function appendEvent(kernel: ContentKernel, event: DomainEvent): Promise<void> {
  await kernel.run((db) => db.insertInto("outbox_events").values(outboxEventValues(event)).execute());
}

/**
 * Builds the user `TrashAdapter`.
 *
 * @complexity O(1) to build; each method is O(1) plus `purge`'s delegated
 *             `UserPurgePort.purgeUser` cost (itself O(1), see that file).
 */
export function createUserTrashAdapter(deps: UserTrashAdapterDeps): TrashAdapter {
  const { purge, idGen, clock } = deps;
  const kernel = lazyKernel(deps.db);

  /** Runs `body` in one transaction holding the principal's row lock. */
  const underPrincipalLock = <T>(workspaceId: string, principalId: string, body: (k: ContentKernel) => Promise<T>): Promise<T> => {
    const k = kernel();
    return k.transaction(async () => {
      await k.lockKey(`trash:${USER_ENTITY_TYPE}:${workspaceId}:${principalId}`);
      return body(k);
    });
  };

  return {
    entityType: USER_ENTITY_TYPE,

    /**
     * Disables the principal, revokes every session and records `identity.user.trashed`.
     *
     * No idempotency branch for an already-disabled principal: re-trashing one just re-disables it
     * (a no-op write) and reports its current `status` as `priorMarker` again — the "already in the
     * Trash" short-circuit belongs to the caller (`trashUser`, delete-user plan v2 Slice 2), which
     * checks the Trash index before ever reaching this adapter.
     */
    async hide(required, optional = {}): Promise<TrashMarkerResult> {
      const { workspaceId, entityId } = required;
      return underPrincipalLock(workspaceId, entityId, async (k) => {
        const before = await readPrincipal(k, workspaceId, entityId);
        if (!before) return { ok: false, reason: "not-found" };

        const disabled = await k.run((db) =>
          db
            .updateTable("principals")
            .set({ status: "disabled", disabled_at: required.at })
            .where("workspace_id", "=", workspaceId)
            .where("id", "=", entityId)
            .where("status", "=", before.status)
            .executeTakeFirst()
        );
        if (Number(disabled.numUpdatedRows) === 0) return { ok: false, reason: "version-changed" };
        const revoked = await k.run((db) =>
          db.deleteFrom("sessions").where("workspace_id", "=", workspaceId).where("principal_id", "=", entityId).executeTakeFirst()
        );

        const username = await readDisplayUsername(k, workspaceId, entityId, before.displayName);
        await appendEvent(k, {
          id: idGen.next(),
          name: "identity.user.trashed",
          occurredAt: clock.nowIso(),
          aggregateId: entityId,
          workspaceId,
          ...(optional.actor ? { actorId: optional.actor.principalId } : {}),
          payload: { principalId: entityId, username, priorStatus: before.status, sessionsRevoked: Number(revoked.numDeletedRows) },
        });

        return { ok: true, version: null, priorMarker: before.status };
      });
    },

    /**
     * Restores the principal to `priorMarker` (decision 4: `priorMarker ?? "disabled"`) and records
     * `identity.user.restored`. Sessions are never re-created — a restore never revives an old
     * cookie (decision 2).
     */
    async unhide(required, optional = {}): Promise<TrashMarkerResult> {
      const { workspaceId, entityId } = required;
      return underPrincipalLock(workspaceId, entityId, async (k) => {
        const before = await readPrincipal(k, workspaceId, entityId);
        if (!before) return { ok: false, reason: "not-found" };

        const restoredStatus = optional.priorMarker ?? "disabled";
        const restored = await k.run((db) =>
          db
            .updateTable("principals")
            .set(restoredStatus === "active" ? { status: restoredStatus, disabled_at: null } : { status: restoredStatus })
            .where("workspace_id", "=", workspaceId)
            .where("id", "=", entityId)
            .where("status", "=", before.status)
            .executeTakeFirst()
        );
        if (Number(restored.numUpdatedRows) === 0) return { ok: false, reason: "version-changed" };

        const username = await readDisplayUsername(k, workspaceId, entityId, before.displayName);
        await appendEvent(k, {
          id: idGen.next(),
          name: "identity.user.restored",
          occurredAt: clock.nowIso(),
          aggregateId: entityId,
          workspaceId,
          ...(optional.actor ? { actorId: optional.actor.principalId } : {}),
          payload: { principalId: entityId, username, restoredStatus },
        });

        return { ok: true, version: null };
      });
    },

    /**
     * Hard-deletes the principal's identity rows via {@link UserPurgePort.purgeUser} (decision 4) —
     * never a live principal (an `active` status means it was never trashed, or was re-enabled out
     * from under an index row someone forgot to clear; either way it is not this adapter's call to
     * remove it). Reachable from both `purgeSelected` (an operator, `optional.actor` set — `reason:
     * "manual"`) and the retention sweeper (`optional.actor` absent — `reason: "retention"`,
     * `actorId` left off the event, decision 6).
     */
    async purge(required, optional = {}): Promise<TrashPurgeOutcome> {
      const { workspaceId, entityId } = required;
      return underPrincipalLock(workspaceId, entityId, async (k) => {
        const before = await readPrincipal(k, workspaceId, entityId);
        if (!before) return "already-gone";
        if (before.status === "active") return "version-changed";

        const username = await readDisplayUsername(k, workspaceId, entityId, before.displayName);
        const reason: UserPurgeReason = optional.actor ? "manual" : "retention";

        await purge.purgeUser({
          workspaceId,
          principalId: entityId,
          reason,
          buildEvent: (removed: PurgeCounts, builtReason): DomainEvent => ({
            id: idGen.next(),
            name: "identity.user.deleted",
            occurredAt: clock.nowIso(),
            aggregateId: entityId,
            workspaceId,
            ...(optional.actor ? { actorId: optional.actor.principalId } : {}),
            payload: { principalId: entityId, username, removed, reason: builtReason },
          }),
        });

        return "purged";
      });
    },
  };
}
