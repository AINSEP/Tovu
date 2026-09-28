import type { Insertable, Selectable } from "kysely";

import type { UUID } from "@jini-ai/cms/core";
import type { PublishCredentialSetRecord, PublishCredentialSetRepoPort, PublishProviderId } from "#src/features/deployments/publish-credentials/types";
import type { ContentKernel } from "../content-kernel.js";
import type { PublishCredentialSetsTable } from "../content-database.generated.js";
import { toBool } from "../kernel/dialect.js";

/**
 * @file THE `PublishCredentialSetRepoPort` adapter (2026-08-15): one Kysely query body for every
 * dialect (storage plan §4, ADR-066) — the ADR-006 rule-of-two "second adapter" half;
 * `features/deployments/publish-credentials/repo.memory.ts`'s `InMemoryPublishCredentialSetRepo` is
 * the first. Composite `(workspace_id, id)` primary key. `sqlite/publish-credential-repo.sqlite.ts`
 * is the thin subclass built from the content db handle.
 *
 * `sealed*` columns are read/written as an opaque group here, same discipline
 * `site-credential-repo.ts`'s own header documents — this file never inspects or validates their
 * contents (that is `AesGcmSecretSealer`'s and `publish-credentials/store.ts`'s job).
 *
 * `insert`/`update`/`delete` keep the group invariant (Contract v2 Correction B — see
 * `PublishCredentialSetRepoPort`'s own header: at most one default per `(workspace_id, provider_id)`)
 * in one kernel transaction each, holding `lockKey` on the workspace's publish credentials: two
 * defaults must never be observable, even transiently, and on Postgres (READ COMMITTED) two
 * concurrent default writes would otherwise each miss the other's uncommitted row.
 */

function toRecord(row: Selectable<PublishCredentialSetsTable>): PublishCredentialSetRecord {
  return {
    workspaceId: row.workspace_id,
    id: row.id,
    providerId: row.provider_id as PublishProviderId,
    label: row.label,
    sealed: { keyId: row.sealed_key_id, ciphertext: row.sealed_ciphertext, nonce: row.sealed_nonce, alg: row.sealed_alg },
    isDefault: toBool(row.is_default) ?? false,
    accountLabel: row.account_label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(record: PublishCredentialSetRecord): Insertable<PublishCredentialSetsTable> {
  return {
    workspace_id: record.workspaceId,
    id: record.id,
    provider_id: record.providerId,
    label: record.label,
    sealed_key_id: record.sealed.keyId,
    sealed_ciphertext: record.sealed.ciphertext,
    sealed_nonce: record.sealed.nonce,
    sealed_alg: record.sealed.alg,
    is_default: record.isDefault,
    account_label: record.accountLabel,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export class SqlPublishCredentialSetRepo implements PublishCredentialSetRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async insert(record: PublishCredentialSetRecord): Promise<void> {
    await this.inGroupTransaction(record.workspaceId, async () => {
      // A plain insert, NOT an upsert — unlike the site assistant credential's
      // single-row-per-workspace upsert, this table's rows are caller-created with a fresh `id`
      // (`store.ts`'s `createPublishCredential` mints it via `idGen.newId()`), so a conflict here can
      // only mean the UNIQUE `(workspace_id, provider_id, label)` index rejected a duplicate label —
      // exactly the error `store.ts`'s `isUniqueLabelViolation` is written to catch and translate.
      // Letting it propagate raw (rather than swallowing it into a silent upsert) is deliberate.
      await this.kernel.run((db) => db.insertInto("publish_credential_sets").values(toRow(record)).execute());
      if (record.isDefault) await this.clearOtherDefaults(record.workspaceId, record.providerId, record.id);
    });
  }

  async update(record: PublishCredentialSetRecord): Promise<void> {
    await this.inGroupTransaction(record.workspaceId, async () => {
      await this.kernel.run((db) =>
        db
          .updateTable("publish_credential_sets")
          .set(toRow(record))
          .where("workspace_id", "=", record.workspaceId)
          .where("id", "=", record.id)
          .execute()
      );
      if (record.isDefault) await this.clearOtherDefaults(record.workspaceId, record.providerId, record.id);
    });
  }

  async findById(input: { workspaceId: UUID; id: UUID }): Promise<PublishCredentialSetRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("publish_credential_sets")
        .selectAll()
        .where("workspace_id", "=", input.workspaceId)
        .where("id", "=", input.id)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toRecord(row) : null;
  }

  async findDefaultByProvider(input: { workspaceId: UUID; providerId: PublishProviderId }): Promise<PublishCredentialSetRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("publish_credential_sets")
        .selectAll()
        .where("workspace_id", "=", input.workspaceId)
        .where("provider_id", "=", input.providerId)
        .where("is_default", "=", true)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toRecord(row) : null;
  }

  async listByProvider(input: { workspaceId: UUID; providerId: PublishProviderId }): Promise<PublishCredentialSetRecord[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("publish_credential_sets")
        .selectAll()
        .where("workspace_id", "=", input.workspaceId)
        .where("provider_id", "=", input.providerId)
        .execute()
    );
    return rows.map(toRecord);
  }

  async listByWorkspace(input: { workspaceId: UUID }): Promise<PublishCredentialSetRecord[]> {
    const rows = await this.kernel.run((db) =>
      db.selectFrom("publish_credential_sets").selectAll().where("workspace_id", "=", input.workspaceId).execute()
    );
    return rows.map(toRecord);
  }

  async delete(input: { workspaceId: UUID; id: UUID }): Promise<void> {
    await this.inGroupTransaction(input.workspaceId, async () => {
      const removed = await this.findById(input);

      // No-op (not an error) on a zero-row DELETE — same idempotent-delete posture
      // `SqlSiteAssistantCredentialRepo.clearKey` documents for its UPDATE.
      await this.kernel.run((db) =>
        db
          .deleteFrom("publish_credential_sets")
          .where("workspace_id", "=", input.workspaceId)
          .where("id", "=", input.id)
          .execute()
      );

      if (!removed?.isDefault) return;

      // Promote the group's most-recently-updated remaining row — see `PublishCredentialSetRepoPort`'s
      // own header for why "most recently updated" is the tie-break rule.
      const promoted = await this.kernel.run((db) =>
        db
          .selectFrom("publish_credential_sets")
          .select("id")
          .where("workspace_id", "=", removed.workspaceId)
          .where("provider_id", "=", removed.providerId)
          .orderBy("updated_at", "desc")
          .limit(1)
          .executeTakeFirst()
      );
      if (!promoted) return;

      await this.kernel.run((db) =>
        db
          .updateTable("publish_credential_sets")
          .set({ is_default: true })
          .where("workspace_id", "=", removed.workspaceId)
          .where("id", "=", promoted.id)
          .execute()
      );
    });
  }

  /** A targeted single-column `UPDATE` — see `PublishCredentialSetRepoPort.updateAccountLabel`'s own
   *  doc for why this must never be `update()`'s full-row replace. No-op (not an error) if the row
   *  vanished — matches this same class's `delete()` idempotent posture; a raw `UPDATE ... WHERE`
   *  simply affects zero rows in that case, so no existence check is needed first. */
  async updateAccountLabel(input: { workspaceId: UUID; id: UUID; accountLabel: string }): Promise<void> {
    await this.kernel.run((db) =>
      db
        .updateTable("publish_credential_sets")
        .set({ account_label: input.accountLabel })
        .where("workspace_id", "=", input.workspaceId)
        .where("id", "=", input.id)
        .execute()
    );
  }

  /** One transaction holding the workspace's publish-credential lock (see the file header). */
  private inGroupTransaction(workspaceId: UUID, body: () => Promise<void>): Promise<void> {
    return this.kernel.transaction(async () => {
      await this.kernel.lockKey(`publish_credential_sets:${workspaceId}`);
      await body();
    });
  }

  /** Clears `isDefault` on every OTHER row sharing `(workspaceId, providerId)` — the group-invariant
   *  half of `insert`/`update`'s contract. Called only inside the caller's own group transaction. */
  private async clearOtherDefaults(workspaceId: UUID, providerId: PublishProviderId, keepId: UUID): Promise<void> {
    await this.kernel.run((db) =>
      db
        .updateTable("publish_credential_sets")
        .set({ is_default: false })
        .where("workspace_id", "=", workspaceId)
        .where("provider_id", "=", providerId)
        .where("id", "!=", keepId)
        .where("is_default", "=", true)
        .execute()
    );
  }
}
