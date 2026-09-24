import { and, eq } from "drizzle-orm";

import {
  adminExecutionCredentials,
  apiKeys,
  identityUsers,
  outboxEvents,
  principalPolicies,
  principalRoles,
  principals,
  sessions,
  settingValuesUser,
} from "../../platform/db/schema.sqlite.js";
import { outboxRowFor } from "../../platform/db/sqlite/outbox-repo.sqlite.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import type { DomainEvent, UUID } from "@jini-ai/cms/core";
import type { PurgeCounts, UserPurgePort } from "./user-purge-types.js";

/**
 * @file `UserPurgePort`'s real adapter (delete-user plan decision 2/7) — the only one that can
 * actually delete anything, since it is backed by real SQL tables.
 */

/**
 * Hard-deletes a principal's identity rows and appends its audit event in one synchronous SQLite
 * transaction (`ContentDb.transaction()`'s callback runs synchronously against `better-sqlite3` —
 * no `await` is ever yielded between the first delete and the final outbox insert, so a concurrent
 * reader can never observe the principal half-purged, mirroring `SqliteCommerceOrderRepo.
 * placeOrder()`'s identical "header + line items in one transaction" reasoning). Any statement
 * throwing (including the outbox insert, e.g. a duplicate event id) rolls back every delete this
 * call made — see the paired RED test.
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
export class SqliteUserPurge implements UserPurgePort {
  constructor(private readonly db: ContentDb) {}

  /** @complexity O(1): eight fixed DELETE statements plus one INSERT, no loop over caller data. */
  async purgeUser(required: {
    workspaceId: UUID;
    principalId: UUID;
    buildEvent: (removed: PurgeCounts) => DomainEvent;
  }): Promise<PurgeCounts> {
    const { workspaceId, principalId, buildEvent } = required;

    return this.db.transaction((tx) => {
      const roles = tx
        .delete(principalRoles)
        .where(and(eq(principalRoles.workspaceId, workspaceId), eq(principalRoles.principalId, principalId)))
        .run().changes;
      const policies = tx
        .delete(principalPolicies)
        .where(and(eq(principalPolicies.workspaceId, workspaceId), eq(principalPolicies.principalId, principalId)))
        .run().changes;
      const sessionCount = tx
        .delete(sessions)
        .where(and(eq(sessions.workspaceId, workspaceId), eq(sessions.principalId, principalId)))
        .run().changes;
      const apiKeyCount = tx
        .delete(apiKeys)
        .where(and(eq(apiKeys.workspaceId, workspaceId), eq(apiKeys.principalId, principalId)))
        .run().changes;
      const userSettings = tx
        .delete(settingValuesUser)
        .where(and(eq(settingValuesUser.workspaceId, workspaceId), eq(settingValuesUser.principalId, principalId)))
        .run().changes;
      tx.delete(adminExecutionCredentials)
        .where(
          and(
            eq(adminExecutionCredentials.workspaceId, workspaceId),
            eq(adminExecutionCredentials.principalId, principalId)
          )
        )
        .run();
      tx.delete(identityUsers)
        .where(and(eq(identityUsers.workspaceId, workspaceId), eq(identityUsers.principalId, principalId)))
        .run();
      tx.delete(principals).where(and(eq(principals.workspaceId, workspaceId), eq(principals.id, principalId))).run();

      const removed: PurgeCounts = { roles, policies, sessions: sessionCount, apiKeys: apiKeyCount, userSettings };
      tx.insert(outboxEvents).values(outboxRowFor(buildEvent(removed))).run();

      return removed;
    });
  }
}
