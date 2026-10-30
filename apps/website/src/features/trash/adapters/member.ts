/**
 * @file Member-specific credential revocation around the existing table adapter. Status, version,
 * prior-marker restoration and purge remain owned by createTableTrashAdapter; this wrapper only
 * prevents a pre-trash session or sign-in link from becoming usable again after restoration.
 */
import type { TrashAdapter } from "@jini-ai/cms/trash";
import type { TrashDb } from "../db-port.js";

/**
 * Revokes sessions and consumes outstanding links in the marker/index transaction. Restoration
 * restores the prior member status but never restores credentials. A failed revocation rolls back
 * the move. No member payload is read or parsed.
 * @complexity O(s + t) affected credentials; three bulk updates on hide, one on restore.
 * s sessions and t sign-in links. The marker adapter holds the shared member lock.
 */
export function createMemberTrashAdapter(
  required: { adapter: TrashAdapter; db: TrashDb },
  _optional: Record<string, never> = {},
): TrashAdapter {
  const { adapter, db } = required;
  return {
    ...adapter,
    async hide(input, options = {}) {
      return db.transaction(async () => {
        const result = await adapter.hide(input, options);
        if (result.ok && !result.noop) {
          await revokeMemberCredentials({ db, input });
          await db.run(query => query.updateTable("member_sessions")
            .set({ revoked_at: input.at })
            .where("workspace_id", "=", input.workspaceId)
            .where("member_id", "=", input.entityId)
            .where("revoked_at", "is", null).execute());
          await db.run(query => query.updateTable("member_magic_tokens")
            .set({ consumed_at: input.at })
            .where("workspace_id", "=", input.workspaceId)
            .where("member_id", "=", input.entityId)
            .where("consumed_at", "is", null).execute());
        }
        return result;
      });
    },
    async unhide(input, options = {}) {
      return db.transaction(async () => {
        const result = await adapter.unhide(input, options);
        if (result.ok && !result.noop) {
          // A delayed request may mint a link while hidden; restoring never revives that link.
          await revokeMemberCredentials({ db, input });
        }
        return result;
      });
    },
  };
}

async function revokeMemberCredentials({ db, input }: {
  db: TrashDb; input: Parameters<TrashAdapter["hide"]>[0];
}, _options = {}): Promise<void> {
  await db.run(query => query.updateTable("members")
    .set({ credentials_revoked_at: input.at })
    .where("workspace_id", "=", input.workspaceId).where("id", "=", input.entityId)
    .where(eb => eb.or([eb("credentials_revoked_at", "is", null),
      eb("credentials_revoked_at", "<", input.at)]))
    .execute());
}
