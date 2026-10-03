import type { Selectable } from "kysely";

import type { ContentKernel } from "../../platform/db/content-kernel.js";
import type { MenusTable, NavLocationBindingsTable } from "../../platform/db/content-database.generated.js";
import { isUniqueViolation } from "../../platform/db/kernel/dialect.js";
import { MenuConflictError } from "@jini-ai/cms/navigation";
import type {
  MenuRepoPort,
  MenuStatus,
  NavLocationBindingRepoPort,
  NavLocationBindingRow,
  NavLocationKey,
  NavMenuDoc,
  NavMenuEntry,
} from "@jini-ai/cms/navigation";

/**
 * @file THE durable `MenuRepoPort` and `NavLocationBindingRepoPort` (ADR-PIPE-012 D-5,
 * C-008a/C-008b): one Kysely query body each for every dialect the storage kernel drives (storage
 * plan §4, ADR-066). The second rule-of-two adapter for both (`repo.memory.ts` is the first);
 * `repo.sqlite.ts` keeps the `Sqlite*` names as thin subclasses the composition root builds from
 * the content db handle.
 *
 * JSON columns: `doc_json`/`locations_json` hold compact JSON text (a Postgres `jsonb`, read back as
 * compact text by the driver), always parsed on read — key order is not part of the contract, so
 * jsonb reordering object keys changes nothing a caller sees.
 *
 * `SqlNavLocationBindingRepo` adds no method beyond what its port interface declares — same
 * contract as the in-memory adapters, certified by the shared contract-test suite in
 * `__tests__/repo.sqlite.test.ts`. `SqlMenuRepo` is the one exception: it adds
 * `findByIdIncludingTrashed`, a trash-blind seam not on `MenuRepoPort`, needed by the menu trash
 * follow-up hooks (see `menu-trash-follow-ups.ts`) — same precedent as
 * `TrashAwareInMemoryEntryRepo.findAnyById`.
 *
 * Trash: a `menus` row with `status = 'trash'` is in the Trash. `findById`/`findBySlug`/`list` all
 * hide it, so every reader treats a trashed menu as missing. `save` never revives a trashed row —
 * the upsert's UPDATE branch is scoped to live rows only, mirroring the entry repo's `LIVE` guard.
 *
 * `SqlNavLocationBindingRepo.upsert` targets the composite `UNIQUE(workspace_id, location_key)`
 * index — a real strengthening of INV-02 over the in-memory adapter's single-threaded-only
 * guarantee (the DB enforces it even under a concurrent-process race).
 */

/** The status a trashed `menus` row carries; every live read excludes it. */
const TRASH = "trash";

function toMenuRecord(row: Selectable<MenusTable>): NavMenuEntry {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    slug: row.slug,
    title: row.title,
    status: row.status as MenuStatus,
    doc: JSON.parse(row.doc_json) as NavMenuDoc,
    locations: JSON.parse(row.locations_json) as string[],
    updatedAt: row.updated_at,
    version: row.version,
  };
}

function toBindingRecord(row: Selectable<NavLocationBindingsTable>): NavLocationBindingRow {
  return {
    workspaceId: row.workspace_id,
    locationKey: row.location_key,
    menuId: row.menu_id,
    boundAt: row.bound_at,
  };
}

function toBindingRow(binding: NavLocationBindingRow): NavLocationBindingsTable {
  return {
    workspace_id: binding.workspaceId,
    location_key: binding.locationKey,
    menu_id: binding.menuId,
    bound_at: binding.boundAt,
  };
}

export class SqlMenuRepo implements MenuRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  /** One `menus` row by id in the workspace, trashed rows included only when asked. */
  private async findOne(required: { workspaceId: string; id: string }, includeTrashed: boolean): Promise<NavMenuEntry | null> {
    const row = await this.kernel.run((db) => {
      let query = db.selectFrom("menus").selectAll().where("workspace_id", "=", required.workspaceId).where("id", "=", required.id);
      if (!includeTrashed) query = query.where("status", "!=", TRASH);
      return query.limit(1).executeTakeFirst();
    });
    return row ? toMenuRecord(row) : null;
  }

  async findById(required: { workspaceId: string; id: string }): Promise<NavMenuEntry | null> {
    return this.findOne(required, false);
  }

  /**
   * Trash-blind twin of `findById` — sees a trashed row too. Not part of `MenuRepoPort`; exists only
   * for the trash follow-up hooks, which run after a row's `status` has already flipped to `'trash'`.
   * @complexity O(1).
   */
  async findByIdIncludingTrashed(required: { workspaceId: string; id: string }): Promise<NavMenuEntry | null> {
    return this.findOne(required, true);
  }

  async findBySlug(required: { workspaceId: string; slug: string }): Promise<NavMenuEntry | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("menus")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("slug", "=", required.slug)
        .where("status", "!=", TRASH)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toMenuRecord(row) : null;
  }

  async list(required: { workspaceId: string }): Promise<NavMenuEntry[]> {
    const rows = await this.kernel.run((db) =>
      db.selectFrom("menus").selectAll().where("workspace_id", "=", required.workspaceId).where("status", "!=", TRASH).execute()
    );
    return rows.map(toMenuRecord);
  }

  /**
   * Upserts a `menus` row by id. A trashed row is left as it is — the upsert's UPDATE branch is
   * scoped to live rows only, so a stale save cannot revive one.
   * @throws MenuConflictError when a trashed row holds the slug: `findBySlug` above hides it, so the
   *         app-level slug check could not see it before the INSERT hit the real unique index (the
   *         only unique index left once the id conflict is absorbed by the upsert).
   * @complexity O(1).
   */
  async save(record: NavMenuEntry): Promise<void> {
    const values = {
      workspace_id: record.workspaceId,
      slug: record.slug,
      title: record.title,
      status: record.status,
      doc_json: JSON.stringify(record.doc),
      locations_json: JSON.stringify(record.locations),
      updated_at: record.updatedAt,
      version: record.version,
    };
    try {
      await this.kernel.run((db) =>
        db
          .insertInto("menus")
          .values({ id: record.id, ...values })
          .onConflict((oc) => oc.column("id").doUpdateSet(values).where("menus.status", "!=", TRASH))
          .execute()
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new MenuConflictError({ message: `a menu with slug '${record.slug}' is in the Trash — restore it, or delete it permanently from the Trash, to reuse the slug` });
      }
      throw error;
    }
  }

  async remove(required: { workspaceId: string; id: string }): Promise<void> {
    await this.kernel.run((db) =>
      db.deleteFrom("menus").where("workspace_id", "=", required.workspaceId).where("id", "=", required.id).execute()
    );
  }
}

export class SqlNavLocationBindingRepo implements NavLocationBindingRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async findByLocation(required: {
    workspaceId: string;
    locationKey: NavLocationKey;
  }): Promise<NavLocationBindingRow | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("nav_location_bindings")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("location_key", "=", required.locationKey)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toBindingRecord(row) : null;
  }

  async listByMenu(required: { workspaceId: string; menuId: string }): Promise<NavLocationBindingRow[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("nav_location_bindings")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("menu_id", "=", required.menuId)
        .execute()
    );
    return rows.map(toBindingRecord);
  }

  async listByWorkspace(required: { workspaceId: string }): Promise<NavLocationBindingRow[]> {
    const rows = await this.kernel.run((db) =>
      db.selectFrom("nav_location_bindings").selectAll().where("workspace_id", "=", required.workspaceId).execute()
    );
    return rows.map(toBindingRecord);
  }

  async upsert(required: {
    workspaceId: string;
    locationKey: NavLocationKey;
    menuId: string;
    boundAt: string;
  }): Promise<NavLocationBindingRow> {
    const row = {
      workspaceId: required.workspaceId,
      locationKey: required.locationKey,
      menuId: required.menuId,
      boundAt: required.boundAt,
    };
    await this.kernel.run((db) =>
      db
        .insertInto("nav_location_bindings")
        .values(toBindingRow(row))
        .onConflict((oc) => oc.columns(["workspace_id", "location_key"]).doUpdateSet({ menu_id: row.menuId, bound_at: row.boundAt }))
        .execute()
    );
    return row;
  }

  async remove(required: { workspaceId: string; locationKey: NavLocationKey }): Promise<void> {
    await this.kernel.run((db) =>
      db
        .deleteFrom("nav_location_bindings")
        .where("workspace_id", "=", required.workspaceId)
        .where("location_key", "=", required.locationKey)
        .execute()
    );
  }

  async removeByMenu(required: { workspaceId: string; menuId: string }): Promise<void> {
    await this.kernel.run((db) =>
      db
        .deleteFrom("nav_location_bindings")
        .where("workspace_id", "=", required.workspaceId)
        .where("menu_id", "=", required.menuId)
        .execute()
    );
  }

  /**
   * Replace-whole-workspace rebuild (ADR-029 §5/§Decision-4 — the index is derived + rebuildable).
   * Deletes every existing row for the workspace, then inserts the full replacement set in one
   * statement, both in one kernel transaction (a reader never sees the index half rebuilt).
   */
  async rebuildForWorkspace(required: {
    workspaceId: string;
    bindings: readonly NavLocationBindingRow[];
  }): Promise<void> {
    await this.kernel.transaction(async () => {
      await this.kernel.run((db) => db.deleteFrom("nav_location_bindings").where("workspace_id", "=", required.workspaceId).execute());
      if (required.bindings.length === 0) return;
      await this.kernel.run((db) => db.insertInto("nav_location_bindings").values(required.bindings.map(toBindingRow)).execute());
    });
  }
}
