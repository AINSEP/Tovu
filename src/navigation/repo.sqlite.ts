import { and, eq } from "drizzle-orm";

import { menus, navLocationBindings } from "../db/schema";
import type { ContentDb } from "../db/sqlite/content-db";
import { findOneBy } from "../db/sqlite/repo-helpers";
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
 * @file Drizzle/SQLite adapters for `MenuRepoPort` and
 * `NavLocationBindingRepoPort` (ADR-PIPE-012 D-5, C-008a/C-008b) — the second
 * rule-of-two adapter for both, mirroring `SqlitePostRepo`'s `ContentDb`
 * pattern and JSON-text-column convention (`doc`/`locations` stored as
 * `doc_json`/`locations_json` text, parsed on read).
 *
 * Neither class adds any method beyond what its port interface already
 * declares — same contract as the in-memory adapters (`repo.memory.ts`),
 * certified by the shared contract-test suite in
 * `__tests__/repo.sqlite.test.ts` (the exact suite `InMemoryMenuRepo`/
 * `InMemoryNavLocationBindingRepo` already pass, re-run against these).
 *
 * `SqliteNavLocationBindingRepo.upsert` uses `onConflictDoUpdate` targeting
 * the composite `UNIQUE(workspace_id, location_key)` index — this is a real
 * strengthening of INV-02 over the in-memory adapter's single-threaded-only
 * guarantee (the DB enforces it even under a concurrent-process race against
 * the same SQLite file).
 */

type MenuRow = typeof menus.$inferSelect;
type BindingRow = typeof navLocationBindings.$inferSelect;

function toMenuRecord(row: MenuRow): NavMenuEntry {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    slug: row.slug,
    title: row.title,
    status: row.status as MenuStatus,
    doc: JSON.parse(row.docJson) as NavMenuDoc,
    locations: JSON.parse(row.locationsJson) as string[],
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function toBindingRecord(row: BindingRow): NavLocationBindingRow {
  return {
    workspaceId: row.workspaceId,
    locationKey: row.locationKey,
    menuId: row.menuId,
    boundAt: row.boundAt,
  };
}

export class SqliteMenuRepo implements MenuRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findById(required: { workspaceId: string; id: string }): Promise<NavMenuEntry | null> {
    return findOneBy(
      this.db,
      menus,
      [eq(menus.workspaceId, required.workspaceId), eq(menus.id, required.id)],
      toMenuRecord
    );
  }

  async findBySlug(required: { workspaceId: string; slug: string }): Promise<NavMenuEntry | null> {
    return findOneBy(
      this.db,
      menus,
      [eq(menus.workspaceId, required.workspaceId), eq(menus.slug, required.slug)],
      toMenuRecord
    );
  }

  async list(required: { workspaceId: string }): Promise<NavMenuEntry[]> {
    const rows = this.db.select().from(menus).where(eq(menus.workspaceId, required.workspaceId)).all();
    return rows.map(toMenuRecord);
  }

  async save(record: NavMenuEntry): Promise<void> {
    const row = {
      id: record.id,
      workspaceId: record.workspaceId,
      slug: record.slug,
      title: record.title,
      status: record.status,
      docJson: JSON.stringify(record.doc),
      locationsJson: JSON.stringify(record.locations),
      updatedAt: record.updatedAt,
      version: record.version,
    };
    this.db
      .insert(menus)
      .values(row)
      .onConflictDoUpdate({
        target: menus.id,
        set: {
          workspaceId: row.workspaceId,
          slug: row.slug,
          title: row.title,
          status: row.status,
          docJson: row.docJson,
          locationsJson: row.locationsJson,
          updatedAt: row.updatedAt,
          version: row.version,
        },
      })
      .run();
  }

  async remove(required: { workspaceId: string; id: string }): Promise<void> {
    this.db
      .delete(menus)
      .where(and(eq(menus.workspaceId, required.workspaceId), eq(menus.id, required.id)))
      .run();
  }
}

export class SqliteNavLocationBindingRepo implements NavLocationBindingRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findByLocation(required: {
    workspaceId: string;
    locationKey: NavLocationKey;
  }): Promise<NavLocationBindingRow | null> {
    return findOneBy(
      this.db,
      navLocationBindings,
      [
        eq(navLocationBindings.workspaceId, required.workspaceId),
        eq(navLocationBindings.locationKey, required.locationKey),
      ],
      toBindingRecord
    );
  }

  async listByMenu(required: { workspaceId: string; menuId: string }): Promise<NavLocationBindingRow[]> {
    const rows = this.db
      .select()
      .from(navLocationBindings)
      .where(
        and(
          eq(navLocationBindings.workspaceId, required.workspaceId),
          eq(navLocationBindings.menuId, required.menuId)
        )
      )
      .all();
    return rows.map(toBindingRecord);
  }

  async listByWorkspace(required: { workspaceId: string }): Promise<NavLocationBindingRow[]> {
    const rows = this.db
      .select()
      .from(navLocationBindings)
      .where(eq(navLocationBindings.workspaceId, required.workspaceId))
      .all();
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
    this.db
      .insert(navLocationBindings)
      .values(row)
      .onConflictDoUpdate({
        target: [navLocationBindings.workspaceId, navLocationBindings.locationKey],
        set: { menuId: row.menuId, boundAt: row.boundAt },
      })
      .run();
    return row;
  }

  async remove(required: { workspaceId: string; locationKey: NavLocationKey }): Promise<void> {
    this.db
      .delete(navLocationBindings)
      .where(
        and(
          eq(navLocationBindings.workspaceId, required.workspaceId),
          eq(navLocationBindings.locationKey, required.locationKey)
        )
      )
      .run();
  }

  async removeByMenu(required: { workspaceId: string; menuId: string }): Promise<void> {
    this.db
      .delete(navLocationBindings)
      .where(
        and(
          eq(navLocationBindings.workspaceId, required.workspaceId),
          eq(navLocationBindings.menuId, required.menuId)
        )
      )
      .run();
  }

  /**
   * Replace-whole-workspace rebuild (ADR-029 §5/§Decision-4 — the index is
   * derived + rebuildable). Deletes every existing row for the workspace,
   * then inserts the full replacement set in one statement (no per-row
   * write-then-read race window).
   */
  async rebuildForWorkspace(required: {
    workspaceId: string;
    bindings: readonly NavLocationBindingRow[];
  }): Promise<void> {
    this.db.delete(navLocationBindings).where(eq(navLocationBindings.workspaceId, required.workspaceId)).run();
    if (required.bindings.length === 0) return;
    this.db
      .insert(navLocationBindings)
      .values(
        required.bindings.map((binding) => ({
          workspaceId: binding.workspaceId,
          locationKey: binding.locationKey,
          menuId: binding.menuId,
          boundAt: binding.boundAt,
        }))
      )
      .run();
  }
}
