import { SqlUserPurge as JiniSqlUserPurge } from "@jini-ai/user-management/identity/user-purge";
import type { ContentKernel } from "../../platform/db/content-kernel.js";
import type { outboxEventValues } from "@jini-ai/db/events";
/**
 * @file `UserPurgePort`'s real adapter (delete-user plan decision 2/7) — the only one that can
 * actually delete anything, since it is backed by real SQL tables. One Kysely query body for every
 * dialect (storage plan §4, ADR-066); `user-purge.sqlite.ts` is the thin subclass built from the
 * content db handle.
 */

export class SqlUserPurge extends JiniSqlUserPurge {
  constructor({ kernel, eventValues }: { kernel: ContentKernel; eventValues: typeof outboxEventValues }, _optional = {}) {
    super({ ports: {
      transaction: ({ run }) => kernel.transaction(run),
      deleteCounted: async ({ table, workspaceId, principalId }) => {
        const result = await kernel.run((db) =>
          db
            .deleteFrom(table)
            .where("workspace_id", "=", workspaceId)
            .where("principal_id", "=", principalId)
            .executeTakeFirst()
        );
        return Number(result.numDeletedRows);
      },
      deletePrincipalVault: async ({ workspaceId, principalId }) => {
        await kernel.run(db => db.deleteFrom("secrets_vault").where("workspace_id", "=", workspaceId).where("principal_id", "=", principalId).execute());
      },
      deleteIdentityUser: async ({ workspaceId, principalId }) => {
        await kernel.run(db => db.deleteFrom("identity_users").where("workspace_id", "=", workspaceId).where("principal_id", "=", principalId).execute());
      },
      deletePrincipal: async ({ workspaceId, principalId }) => {
        await kernel.run(db => db.deleteFrom("principals").where("workspace_id", "=", workspaceId).where("id", "=", principalId).execute());
      },
      appendOutbox: async ({ event }) => {
        await kernel.run(db => db.insertInto("outbox_events").values(eventValues(event)).execute());
      },
    } });
  }

  override purgeUser(required: Parameters<JiniSqlUserPurge["purgeUser"]>[0], _optional = {}) {
    return super.purgeUser({ ...required, buildEvent: (input, optional) => required.buildEvent(input, { reason: optional?.reason }) });
  }
}
