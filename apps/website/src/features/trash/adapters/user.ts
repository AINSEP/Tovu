import { and, eq } from "drizzle-orm";

import { identityUsers, outboxEvents, principals, sessions } from "#src/platform/db/schema.sqlite";
import { outboxRowFor } from "#src/platform/db/sqlite/outbox-repo.sqlite";
import type { ContentDb } from "#src/platform/db/sqlite/content-db";
import type { PurgeCounts, UserPurgePort, UserPurgeReason } from "#src/features/identity/user-purge-types";
import type { DomainEvent } from "@jini-ai/cms/core";

import type { TrashAdapter, TrashMarkerResult, TrashPurgeOutcome } from "../ports.js";

/**
 * @file `TrashAdapter` for users (delete-user plan v2, decision 4) — bespoke rather than a
 * `TRASHABLE` registry entry, because `hide` writes two tables (`principals` AND `sessions`) and
 * `purge` must go through `SqliteUserPurge` for its own eight-table atomic delete, not through a
 * single-table `compareAndDelete`. Mirrors `adapters/directory.ts`'s "bespoke adapter" precedent.
 *
 * `entityVersion` is always `null`: `principals` has no version column, so `hide`/`unhide`/`purge`
 * never receive a meaningful `expectedVersion` to compare against (the trash core still passes one
 * through, per the shared `TrashAdapter` contract, but this adapter has nothing to check it against).
 *
 * `hide`/`unhide` insert their own `identity.user.trashed` / `identity.user.restored` outbox event
 * with {@link outboxRowFor}, in the SAME transaction as the marker write — the trash core always
 * calls `hide`/`unhide` from inside `deps.transaction(...)` (`write-service.ts`), so a plain
 * synchronous `db.insert(...).run()` here is exactly as atomic as `SqliteUserPurge.purgeUser`'s own
 * transaction is for `purge`.
 */

export const USER_ENTITY_TYPE = "user";

export interface UserTrashAdapterDeps {
  db: ContentDb;
  purge: UserPurgePort;
  idGen: { next(): string };
  clock: { nowIso(): string };
}

interface PrincipalRow {
  status: string;
  displayName: string;
}

/** @complexity O(1), one indexed read. */
function readPrincipal(db: ContentDb, workspaceId: string, principalId: string): PrincipalRow | null {
  const row = db
    .select({ status: principals.status, displayName: principals.displayName })
    .from(principals)
    .where(and(eq(principals.workspaceId, workspaceId), eq(principals.id, principalId)))
    .get();
  return row ?? null;
}

/** Falls back to the principal's display name for a principal with no `identity_users` row (an
 *  `api_key` principal, decision 5's "Tovu-Runner" case) — the audit event still needs a name to
 *  report even when there is no login username to give it.
 *  @complexity O(1), one indexed read. */
function readDisplayUsername(db: ContentDb, workspaceId: string, principalId: string, fallback: string): string {
  const row = db
    .select({ username: identityUsers.username })
    .from(identityUsers)
    .where(and(eq(identityUsers.workspaceId, workspaceId), eq(identityUsers.principalId, principalId)))
    .get();
  return row?.username ?? fallback;
}

/** @complexity O(1), one insert. */
function appendEvent(db: ContentDb, event: DomainEvent): void {
  db.insert(outboxEvents).values(outboxRowFor(event)).run();
}

/**
 * Builds the user `TrashAdapter`.
 *
 * @complexity O(1) to build; each method is O(1) plus `purge`'s delegated
 *             `UserPurgePort.purgeUser` cost (itself O(1), see that file).
 */
export function createUserTrashAdapter(deps: UserTrashAdapterDeps): TrashAdapter {
  const { db, purge, idGen, clock } = deps;

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
    async hide(required): Promise<TrashMarkerResult> {
      const before = readPrincipal(db, required.workspaceId, required.entityId);
      if (!before) return { ok: false, reason: "not-found" };

      db.update(principals)
        .set({ status: "disabled", disabledAt: required.at })
        .where(and(eq(principals.workspaceId, required.workspaceId), eq(principals.id, required.entityId)))
        .run();
      const sessionsRevoked = db
        .delete(sessions)
        .where(and(eq(sessions.workspaceId, required.workspaceId), eq(sessions.principalId, required.entityId)))
        .run().changes;

      const username = readDisplayUsername(db, required.workspaceId, required.entityId, before.displayName);
      appendEvent(db, {
        id: idGen.next(),
        name: "identity.user.trashed",
        occurredAt: clock.nowIso(),
        aggregateId: required.entityId,
        workspaceId: required.workspaceId,
        ...(required.actor ? { actorId: required.actor.principalId } : {}),
        payload: { principalId: required.entityId, username, priorStatus: before.status, sessionsRevoked },
      });

      return { ok: true, version: null, priorMarker: before.status };
    },

    /**
     * Restores the principal to `priorMarker` (decision 4: `priorMarker ?? "disabled"`) and records
     * `identity.user.restored`. Sessions are never re-created — a restore never revives an old
     * cookie (decision 2).
     */
    async unhide(required): Promise<TrashMarkerResult> {
      const before = readPrincipal(db, required.workspaceId, required.entityId);
      if (!before) return { ok: false, reason: "not-found" };

      const restoredStatus = required.priorMarker ?? "disabled";
      db.update(principals)
        .set(restoredStatus === "active" ? { status: restoredStatus, disabledAt: null } : { status: restoredStatus })
        .where(and(eq(principals.workspaceId, required.workspaceId), eq(principals.id, required.entityId)))
        .run();

      const username = readDisplayUsername(db, required.workspaceId, required.entityId, before.displayName);
      appendEvent(db, {
        id: idGen.next(),
        name: "identity.user.restored",
        occurredAt: clock.nowIso(),
        aggregateId: required.entityId,
        workspaceId: required.workspaceId,
        ...(required.actor ? { actorId: required.actor.principalId } : {}),
        payload: { principalId: required.entityId, username, restoredStatus },
      });

      return { ok: true, version: null };
    },

    /**
     * Hard-deletes the principal's identity rows via {@link UserPurgePort.purgeUser} (decision 4) —
     * never a live principal (an `active` status means it was never trashed, or was re-enabled out
     * from under an index row someone forgot to clear; either way it is not this adapter's call to
     * remove it). Reachable from both `purgeSelected` (an operator, `required.actor` set — `reason:
     * "manual"`) and the retention sweeper (`required.actor` absent — `reason: "retention"`,
     * `actorId` left off the event, decision 6).
     */
    async purge(required): Promise<TrashPurgeOutcome> {
      const before = readPrincipal(db, required.workspaceId, required.entityId);
      if (!before) return "already-gone";
      if (before.status === "active") return "version-changed";

      const username = readDisplayUsername(db, required.workspaceId, required.entityId, before.displayName);
      const reason: UserPurgeReason = required.actor ? "manual" : "retention";

      await purge.purgeUser({
        workspaceId: required.workspaceId,
        principalId: required.entityId,
        reason,
        buildEvent: (removed: PurgeCounts, builtReason): DomainEvent => ({
          id: idGen.next(),
          name: "identity.user.deleted",
          occurredAt: clock.nowIso(),
          aggregateId: required.entityId,
          workspaceId: required.workspaceId,
          ...(required.actor ? { actorId: required.actor.principalId } : {}),
          payload: { principalId: required.entityId, username, removed, reason: builtReason },
        }),
      });

      return "purged";
    },
  };
}
