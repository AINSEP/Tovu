import type { ContentKernel } from "../../platform/db/content-kernel.js";
import type { ContentTypeListPort, ContentTypeRecord, ContentTypeRepoPort, ContentTypeRevisionInput } from "./index.js";
import { toRecord, toRevisionRow, toRow, updatableColumns } from "./repo.rows.js";

/**
 * @file THE content-type repository: one Kysely query body for every database the storage kernel
 * drives (SQLite, PGlite, Postgres). Satisfies the same certified ports `repo.memory.ts` does; `id`
 * is a synthetic `${workspaceId}::${key}` key so `save()` can upsert by primary key. Every
 * statement goes through `kernel.run` and is awaited; `transaction` delegates to the kernel, which
 * joins the caller's transaction when there is one.
 */
export class SqlContentTypeRepo implements ContentTypeRepoPort, ContentTypeListPort {
  constructor(protected readonly kernel: ContentKernel) {}

  /**
   * Upserts a `content_types` row by its synthetic `(workspaceId, key)` id — full-replace
   * semantics, matching `InMemoryContentTypeRepo.save`'s `Map.set` behavior exactly.
   *
   * @complexity O(1).
   */
  async save(record: ContentTypeRecord): Promise<void> {
    const row = toRow(record);
    await this.kernel.run((db) =>
      db
        .insertInto("content_types")
        .values(row)
        .onConflict((oc) => oc.column("id").doUpdateSet(updatableColumns(row)))
        .execute()
    );
  }

  async appendRevision(revision: ContentTypeRevisionInput): Promise<void> {
    await this.kernel.run((db) => db.insertInto("content_type_revisions").values(toRevisionRow(revision)).execute());
  }

  async findByKey(params: { workspaceId: string; key: string }): Promise<ContentTypeRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("content_types")
        .selectAll()
        .where("workspace_id", "=", params.workspaceId)
        .where("key", "=", params.key)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toRecord(row) : null;
  }

  async listByWorkspace(params: { workspaceId: string }): Promise<ContentTypeRecord[]> {
    const rows = await this.kernel.run((db) =>
      db.selectFrom("content_types").selectAll().where("workspace_id", "=", params.workspaceId).execute()
    );
    return rows.map(toRecord);
  }

  /** Callback repo calls join ONE transaction; nested calls join the outer one. */
  async transaction<T>({ fn }: { fn: () => Promise<T> }): Promise<T> {
    return this.kernel.transaction(fn);
  }
}

/** The content-type repo for `kernel`. */
export function contentTypeRepoFor(kernel: ContentKernel): SqlContentTypeRepo {
  return new SqlContentTypeRepo(kernel);
}
