/**
 * @file The site-search indexer's bookkeeping on the content database (migration 0023): one Kysely
 * body for SQLite, PGlite and Postgres, behind `@jini-ai/search`'s `SearchIndexStatePort` and
 * `SearchTargetPort`. No search logic here: the generic indexer decides, this only stores.
 *
 * The two ports are returned as two objects because both name a `get` with different inputs.
 */
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { encodeSearchKey } from "@jini-ai/search";
import type {
  SearchIndexStatePort, SearchIndexStateRow, SearchIndexStatus, SearchSiteTargets,
  SearchStatusCounts, SearchTarget, SearchTargetPort,
} from "@jini-ai/search";

/** Numbers stored as `bigint` come back as a number (SQLite), a string or a bigint (Postgres drivers). */
type Big = number | string | bigint;

interface StateTable {
  site_id: string; provider_id: string; generation: number; doc_key: string;
  workspace_id: string; collection: string; document_id: string;
  revision: Big; deleted: number; status: string; attempts: number;
  task_id: string | null; last_error: string | null; updated_at_ms: Big;
}
interface WatermarkTable { site_id: string; provider_id: string; generation: number; collection: string; cursor: string | null; done: number }
interface TargetTable {
  site_id: string; active_provider_id: string | null; active_generation: number | null;
  building_provider_id: string | null; building_generation: number | null; updated_at_ms: Big;
}

/** The three tables 0023 owns. They are raw-SQL managed (no Drizzle declaration), so the generated
 *  `ContentDatabase` type never holds them; this local shape is what the queries are typed against. */
export interface SearchIndexDatabase {
  search_index_state: StateTable;
  search_index_watermarks: WatermarkTable;
  search_index_targets: TargetTable;
}

export interface SqlSearchIndexStore {
  readonly indexState: SearchIndexStatePort;
  readonly targets: SearchTargetPort;
}

const STATUSES: readonly SearchIndexStatus[] = ["pending", "indexed", "unknown", "failed"];

/** Row → port shape; optional fields are omitted rather than `undefined`. @complexity O(1). */
function toStateRow(row: StateTable): SearchIndexStateRow {
  return {
    target: { siteId: row.site_id, providerId: row.provider_id, generation: Number(row.generation) },
    key: { siteId: row.site_id, workspaceId: row.workspace_id, collection: row.collection, documentId: row.document_id },
    revision: Number(row.revision),
    deleted: Number(row.deleted) === 1,
    status: row.status as SearchIndexStatus,
    attempts: Number(row.attempts),
    ...(row.task_id === null ? {} : { taskId: row.task_id }),
    ...(row.last_error === null ? {} : { lastError: row.last_error }),
    updatedAtMs: Number(row.updated_at_ms),
  };
}

/** Port row → columns. The key's own `siteId` is the target's (one site per target). @complexity O(key length). */
function toStateColumns(row: SearchIndexStateRow): StateTable {
  return {
    site_id: row.target.siteId, provider_id: row.target.providerId, generation: row.target.generation,
    doc_key: encodeSearchKey({ key: row.key }),
    workspace_id: row.key.workspaceId, collection: row.key.collection, document_id: row.key.documentId,
    revision: row.revision, deleted: row.deleted ? 1 : 0, status: row.status, attempts: row.attempts,
    task_id: row.taskId ?? null, last_error: row.lastError ?? null, updated_at_ms: row.updatedAtMs,
  };
}

/** A stored pointer pair, or `null` when that half is empty (the CHECK keeps both columns in step). */
function toTarget(siteId: string, providerId: string | null, generation: number | null): SearchTarget | null {
  return providerId === null || generation === null ? null : { siteId, providerId, generation: Number(generation) };
}

/** The bookkeeping half. @complexity each method is one indexed statement (deleteTarget: two). */
function createIndexState(kernel: StorageKernel<SearchIndexDatabase>): SearchIndexStatePort {
  const scoped = (target: SearchTarget) => ({ site_id: target.siteId, provider_id: target.providerId, generation: target.generation });
  return {
    async get({ target, key }) {
      const row = await kernel.run(db => db.selectFrom("search_index_state").selectAll()
        .where("site_id", "=", target.siteId).where("provider_id", "=", target.providerId)
        .where("generation", "=", target.generation).where("doc_key", "=", encodeSearchKey({ key }))
        .executeTakeFirst());
      return row ? toStateRow(row) : null;
    },
    async put({ row }) {
      const values = toStateColumns(row);
      const { site_id: _s, provider_id: _p, generation: _g, doc_key: _k, ...updatable } = values;
      await kernel.run(db => db.insertInto("search_index_state").values(values)
        .onConflict(oc => oc.columns(["site_id", "provider_id", "generation", "doc_key"]).doUpdateSet(updatable))
        .execute());
    },
    async listByStatus({ target, statuses, limit }) {
      // `IN ()` is not valid SQL; asking for no status matches no row.
      if (statuses.length === 0) return [];
      const rows = await kernel.run(db => db.selectFrom("search_index_state").selectAll()
        .where("site_id", "=", target.siteId).where("provider_id", "=", target.providerId)
        .where("generation", "=", target.generation).where("status", "in", [...statuses])
        // Oldest first so a retry sweep reaches every row, with the key breaking ties stably.
        .orderBy("updated_at_ms", "asc").orderBy("doc_key", "asc")
        .limit(limit).execute());
      return rows.map(toStateRow);
    },
    async counts({ target }) {
      const rows = await kernel.run(db => db.selectFrom("search_index_state")
        .select(eb => ["status", eb.fn.countAll<Big>().as("n")])
        .where("site_id", "=", target.siteId).where("provider_id", "=", target.providerId)
        .where("generation", "=", target.generation).groupBy("status").execute());
      const counts = Object.fromEntries(STATUSES.map(status => [status, 0])) as Record<SearchIndexStatus, number>;
      for (const row of rows) counts[row.status as SearchIndexStatus] = Number(row.n);
      return counts as SearchStatusCounts;
    },
    async getWatermark({ target, collection }) {
      const row = await kernel.run(db => db.selectFrom("search_index_watermarks").select(["cursor", "done"])
        .where("site_id", "=", target.siteId).where("provider_id", "=", target.providerId)
        .where("generation", "=", target.generation).where("collection", "=", collection)
        .executeTakeFirst());
      if (!row) return null;
      return { ...(row.cursor === null ? {} : { cursor: row.cursor }), done: Number(row.done) === 1 };
    },
    async putWatermark({ target, collection, cursor, done }) {
      const changes = { cursor: cursor ?? null, done: done ? 1 : 0 };
      await kernel.run(db => db.insertInto("search_index_watermarks").values({ ...scoped(target), collection, ...changes })
        .onConflict(oc => oc.columns(["site_id", "provider_id", "generation", "collection"]).doUpdateSet(changes))
        .execute());
    },
    async deleteTarget({ target }) {
      await kernel.transaction(async () => {
        for (const table of ["search_index_state", "search_index_watermarks"] as const) {
          await kernel.run(db => db.deleteFrom(table).where("site_id", "=", target.siteId)
            .where("provider_id", "=", target.providerId).where("generation", "=", target.generation).execute());
        }
      });
    },
  };
}

/** The pointer half. `promote` is the atomic generation switch. @complexity O(1) per call. */
function createTargets(kernel: StorageKernel<SearchIndexDatabase>, now: () => number): SearchTargetPort {
  const read = async (siteId: string): Promise<SearchSiteTargets> => {
    const row = await kernel.run(db => db.selectFrom("search_index_targets").selectAll().where("site_id", "=", siteId).executeTakeFirst());
    if (!row) return { active: null, building: null };
    return {
      active: toTarget(siteId, row.active_provider_id, row.active_generation),
      building: toTarget(siteId, row.building_provider_id, row.building_generation),
    };
  };
  return {
    get: ({ siteId }) => read(siteId),
    async setBuilding({ target }) {
      const building = { building_provider_id: target.providerId, building_generation: target.generation, updated_at_ms: now() };
      await kernel.run(db => db.insertInto("search_index_targets")
        .values({ site_id: target.siteId, active_provider_id: null, active_generation: null, ...building })
        .onConflict(oc => oc.column("site_id").doUpdateSet(building)).execute());
    },
    promote: ({ siteId, expected }) => kernel.transaction(async () => {
      const { active } = await read(siteId);
      // ONE compare-and-swap statement: the building pointer must still be `expected` AND the active
      // pointer still the one read above, so `replaced` is exactly what this switch displaced. A
      // concurrent promote, rebuild or clear changes one of them first and this updates no row.
      const result = await kernel.run(db => db.updateTable("search_index_targets")
        .set(eb => ({
          active_provider_id: eb.ref("building_provider_id"), active_generation: eb.ref("building_generation"),
          building_provider_id: null, building_generation: null, updated_at_ms: now(),
        }))
        .where("site_id", "=", siteId)
        .where("building_provider_id", "=", expected.providerId).where("building_generation", "=", expected.generation)
        .where(eb => active === null
          ? eb("active_provider_id", "is", null)
          : eb.and([eb("active_provider_id", "=", active.providerId), eb("active_generation", "=", active.generation)]))
        .executeTakeFirst());
      return Number(result.numUpdatedRows) === 1 ? { replaced: active } : false;
    }),
    async clearBuilding({ siteId }) {
      await kernel.run(db => db.updateTable("search_index_targets")
        .set({ building_provider_id: null, building_generation: null, updated_at_ms: now() })
        .where("site_id", "=", siteId).execute());
    },
  };
}

/**
 * The SQL search-index store on one content database.
 * @example const { indexState, targets } = createSqlSearchIndexStore({ kernel, now: clock.nowMs });
 * @complexity O(1) to build; see each half for per-call cost.
 */
export function createSqlSearchIndexStore<DB>(
  required: { readonly kernel: StorageKernel<DB>; readonly now: () => number },
  _optional: Record<string, never> = {},
): SqlSearchIndexStore {
  // The content kernel is typed against the generated schema, which never lists 0023's raw-SQL
  // tables; the same kernel is re-typed for them (Kysely types are compile-time only).
  const kernel = required.kernel as unknown as StorageKernel<SearchIndexDatabase>;
  return { indexState: createIndexState(kernel), targets: createTargets(kernel, required.now) };
}
