import type { Insertable, Selectable } from "kysely";

import type { UUID } from "@jini-ai/core/primitives";
import type { CustomCredentialCategoryId, CustomCredentialSetRecord, CustomCredentialSetRepoPort } from "#src/features/custom-credentials/types";
import type { ContentKernel } from "../content-kernel.js";
import type { CustomCredentialSetsTable } from "../content-database.generated.js";

/**
 * @file THE `CustomCredentialSetRepoPort` adapter: one Kysely query body for every dialect (storage
 * plan §4, ADR-066) — the ADR-006 rule-of-two "second adapter" half;
 * `features/custom-credentials/repo.memory.ts`'s `InMemoryCustomCredentialSetRepo` is the first.
 * Structurally mirrors `source-control-credential-repo.ts` (this table's own composite
 * `(workspace_id, id)` primary key, same shape), minus that adapter's `isDefault` transaction —
 * this table has no group invariant to maintain (see `types.ts`'s own header), so every write here
 * is a single plain statement. `sqlite/custom-credential-repo.sqlite.ts` is the thin subclass built
 * from the content db handle.
 *
 * `sealed*` columns are read/written as an opaque group here, same discipline every sibling
 * credential repo documents — this file never inspects or validates their contents (that is
 * `AesGcmSecretSealer`'s and `custom-credentials/store.ts`'s job).
 */

/** `additional_hosts_json` is a nullable plain-text JSON array, so `toRecord`/`toRow` are the one
 *  place it is (de)serialized. `null`/empty normalizes to `[]`, matching `CustomCredentialSetRecord.
 *  additionalHosts`'s own "empty, never null" contract. */
function parseAdditionalHosts(json: string | null): readonly string[] {
  return json ? (JSON.parse(json) as string[]) : [];
}

function serializeAdditionalHosts(hosts: readonly string[]): string | null {
  return hosts.length > 0 ? JSON.stringify(hosts) : null;
}

/** `username` is a nullable plaintext column. SQL's `NULL` and the domain type's `undefined` are
 *  normalized to each other in exactly these two functions, so no caller ever has to distinguish
 *  "no username" from "null username" — see `CustomCredentialSetRecord.username`. */
function toRecord(row: Selectable<CustomCredentialSetsTable>): CustomCredentialSetRecord {
  return {
    workspaceId: row.workspace_id,
    id: row.id,
    label: row.label,
    category: row.category as CustomCredentialCategoryId,
    baseUrl: row.base_url,
    additionalHosts: parseAdditionalHosts(row.additional_hosts_json),
    ...(row.username !== null ? { username: row.username } : {}),
    sealed: { keyId: row.sealed_key_id, ciphertext: row.sealed_ciphertext, nonce: row.sealed_nonce, alg: row.sealed_alg },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(record: CustomCredentialSetRecord): Insertable<CustomCredentialSetsTable> {
  return {
    workspace_id: record.workspaceId,
    id: record.id,
    label: record.label,
    category: record.category,
    base_url: record.baseUrl,
    additional_hosts_json: serializeAdditionalHosts(record.additionalHosts),
    // Explicitly `null`, never `undefined` — `update()` below is a full-row replace, and an
    // `undefined` value is OMITTED from the generated `SET` clause, which would silently preserve a
    // stale username on a row whose connection was just replaced without one.
    username: record.username ?? null,
    sealed_key_id: record.sealed.keyId,
    sealed_ciphertext: record.sealed.ciphertext,
    sealed_nonce: record.sealed.nonce,
    sealed_alg: record.sealed.alg,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export class SqlCustomCredentialSetRepo implements CustomCredentialSetRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async insert(record: CustomCredentialSetRecord): Promise<void> {
    // A plain insert, NOT an upsert — this table's rows are caller-created with a fresh `id`
    // (`store.ts`'s `createCustomCredential` mints it via `idGen.newId()`), so a conflict here can
    // only mean the UNIQUE `(workspace_id, label)` index rejected a duplicate label — exactly the
    // error `store.ts`'s `isUniqueLabelViolation` is written to catch and translate. Letting it
    // propagate raw is deliberate.
    await this.kernel.run((db) => db.insertInto("custom_credential_sets").values(toRow(record)).execute());
  }

  async update(record: CustomCredentialSetRecord): Promise<void> {
    await this.kernel.run((db) =>
      db
        .updateTable("custom_credential_sets")
        .set(toRow(record))
        .where("workspace_id", "=", record.workspaceId)
        .where("id", "=", record.id)
        .execute()
    );
  }

  async findById(input: { workspaceId: UUID; id: UUID }): Promise<CustomCredentialSetRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("custom_credential_sets")
        .selectAll()
        .where("workspace_id", "=", input.workspaceId)
        .where("id", "=", input.id)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toRecord(row) : null;
  }

  async listByWorkspace(input: { workspaceId: UUID }): Promise<CustomCredentialSetRecord[]> {
    const rows = await this.kernel.run((db) =>
      db.selectFrom("custom_credential_sets").selectAll().where("workspace_id", "=", input.workspaceId).execute()
    );
    return rows.map(toRecord);
  }

  async delete(input: { workspaceId: UUID; id: UUID }): Promise<void> {
    // No-op (not an error) on a zero-row DELETE — same idempotent-delete posture every sibling
    // credential repo documents.
    await this.kernel.run((db) =>
      db
        .deleteFrom("custom_credential_sets")
        .where("workspace_id", "=", input.workspaceId)
        .where("id", "=", input.id)
        .execute()
    );
  }
}
