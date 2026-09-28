import type { Selectable } from "kysely";

import type { WorkspaceRecord, WorkspaceRepoPort } from "@jini-ai/cms/workspace";

import type { ContentKernel } from "../../platform/db/content-kernel.js";
import type { WorkspacesTable } from "../../platform/db/content-database.generated.js";

/**
 * @file THE workspace repository: one Kysely query body for every dialect the storage kernel
 * drives (storage plan §4, ADR-066). Satisfies the same `WorkspaceRepoPort` as `repo.memory.ts`
 * (ADR-006 ports/adapters); `repo.sqlite.ts` is the thin subclass the composition root builds.
 */

function toRecord(row: Selectable<WorkspacesTable>): WorkspaceRecord {
  return { id: row.id, name: row.name, slug: row.slug, createdAt: row.created_at };
}

export class SqlWorkspaceRepo implements WorkspaceRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async insert(record: WorkspaceRecord): Promise<void> {
    await this.kernel.run((db) =>
      db
        .insertInto("workspaces")
        .values({ id: record.id, name: record.name, slug: record.slug, created_at: record.createdAt })
        .execute()
    );
  }

  async findBySlug(slug: string): Promise<WorkspaceRecord | null> {
    const row = await this.kernel.run((db) =>
      db.selectFrom("workspaces").selectAll().where("slug", "=", slug).limit(1).executeTakeFirst()
    );
    return row ? toRecord(row) : null;
  }

  /** SPEC-044 REQ-08. */
  async findById(id: string): Promise<WorkspaceRecord | null> {
    const row = await this.kernel.run((db) =>
      db.selectFrom("workspaces").selectAll().where("id", "=", id).limit(1).executeTakeFirst()
    );
    return row ? toRecord(row) : null;
  }

  /** SPEC-044 REQ-08. All workspace rows (v1 always has exactly one — see `delete.ts`'s header). */
  async list(): Promise<WorkspaceRecord[]> {
    const rows = await this.kernel.run((db) => db.selectFrom("workspaces").selectAll().execute());
    return rows.map(toRecord);
  }

  /** SPEC-044 REQ-08. */
  async update(record: WorkspaceRecord): Promise<void> {
    await this.kernel.run((db) =>
      db
        .updateTable("workspaces")
        .set({ name: record.name, slug: record.slug })
        .where("id", "=", record.id)
        .execute()
    );
  }

  /** SPEC-044 REQ-08. */
  async delete(id: string): Promise<void> {
    await this.kernel.run((db) => db.deleteFrom("workspaces").where("id", "=", id).execute());
  }
}

/** The workspace repo on `kernel`'s database, whichever dialect. */
export function workspaceRepoFor(kernel: ContentKernel): WorkspaceRepoPort {
  return new SqlWorkspaceRepo(kernel);
}
