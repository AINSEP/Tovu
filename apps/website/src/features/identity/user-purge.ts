import type { ContentKernel } from "../../platform/db/content-kernel.js";
import { outboxEventValues } from "../../platform/db/repos/outbox-repo.js";
import type { DomainEvent, UUID } from "@jini-ai/cms/core";
import type { PurgeCounts, UserPurgePort, UserPurgeReason } from "./user-purge-types.js";

/**
 * @file `UserPurgePort`'s real adapter (delete-user plan decision 2/7) — the only one that can
 * actually delete anything, since it is backed by real SQL tables. One Kysely query body for every
 * dialect (storage plan §4, ADR-066); `user-purge.sqlite.ts` is the thin subclass built from the
 * content db handle.
 */

/** The principal-scoped tables whose deleted-row counts the purge reports, in delete order. */
type CountedTable = "principal_roles" | "principal_policies" | "sessions" | "api_keys" | "setting_values_user";

/**
 * Hard-deletes a principal's identity rows and appends its audit event in ONE storage-kernel
 * transaction, so a concurrent reader can never observe the principal half-purged (the kernel's
 * transaction holds the SQLite write lock from `BEGIN IMMEDIATE`, and on Postgres nothing is
 * visible before COMMIT) — mirroring `SqliteCommerceOrderRepo.placeOrder()`'s identical "header +
 * line items in one transaction" reasoning. Any statement throwing (including the outbox insert,
 * e.g. a duplicate event id) rolls back every delete this call made — see the paired RED test.
 * Called from inside a caller's transaction (the trash core's `purgeSelected`), it joins that one.
 *
 * Deletes, in decision 2's order: `principal_roles`, `principal_policies`, `sessions`, `api_keys`
 * (only keys bound to this principal — a key an agent/api_key principal ISSUED has its own,
 * different `principalId` and is untouched), `setting_values_user`,
 * `admin_execution_credentials` (its FK already cascades with `principals` below; deleted
 * explicitly anyway so this method's own behavior does not depend on cascade ordering for a
 * credential row), `identity_users`, `principals`.
 *
 * Deliberately does NOT touch any FK-less "created by"/"actor" attribution column
 * (`posts.created_by_principal_id`, `*_revisions.actor_id`, `redirects.created_by_principal`, …) —
 * `schema.sqlite.ts`'s own header note on those columns explains why an attribution fact must
 * survive the principal it names being deleted; this method purges IDENTITY, never CONTENT.
 */
export class SqlUserPurge implements UserPurgePort {
  constructor(protected readonly kernel: ContentKernel) {}

  /** @complexity O(1): eight fixed DELETE statements plus one INSERT, no loop over caller data. */
  async purgeUser(required: {
    workspaceId: UUID;
    principalId: UUID;
    buildEvent: (removed: PurgeCounts, reason?: UserPurgeReason) => DomainEvent;
    reason?: UserPurgeReason;
  }): Promise<PurgeCounts> {
    const { workspaceId, principalId, buildEvent, reason } = required;
    const deleteCounted = async (table: CountedTable): Promise<number> => {
      const result = await this.kernel.run((db) =>
        db
          .deleteFrom(table)
          .where("workspace_id", "=", workspaceId)
          .where("principal_id", "=", principalId)
          .executeTakeFirst()
      );
      return Number(result.numDeletedRows);
    };

    return this.kernel.transaction(async () => {
      const roles = await deleteCounted("principal_roles");
      const policies = await deleteCounted("principal_policies");
      const sessionCount = await deleteCounted("sessions");
      const apiKeyCount = await deleteCounted("api_keys");
      const userSettings = await deleteCounted("setting_values_user");
      await this.kernel.run(async (db) => {
        await db
          .deleteFrom("admin_execution_credentials")
          .where("workspace_id", "=", workspaceId)
          .where("principal_id", "=", principalId)
          .execute();
        await db
          .deleteFrom("identity_users")
          .where("workspace_id", "=", workspaceId)
          .where("principal_id", "=", principalId)
          .execute();
        await db.deleteFrom("principals").where("workspace_id", "=", workspaceId).where("id", "=", principalId).execute();
      });

      const removed: PurgeCounts = { roles, policies, sessions: sessionCount, apiKeys: apiKeyCount, userSettings };
      const event = buildEvent(removed, reason);
      await this.kernel.run((db) => db.insertInto("outbox_events").values(outboxEventValues(event)).execute());

      return removed;
    });
  }
}
