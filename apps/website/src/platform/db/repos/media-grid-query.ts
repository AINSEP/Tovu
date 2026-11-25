import { sql, type Expression, type Kysely, type SqlBool } from "kysely";

import type { ContentDatabase } from "../content-database.generated.js";
import type { ContentKernel } from "../content-kernel.js";
import { toMediaRecord } from "./media-record-row.js";
import type { MediaRecord } from "@jini-ai/cms/media";
import type { UUID } from "@jini-ai/core/primitives";
import type { MediaGridOrder, MediaGridTab } from "@jini-ai/core/contracts/site/cms-admin-media";
import type { MediaGridPosition, MediaGridSummary } from "@jini-ai/cms/admin-http/routes/media/grid";

/**
 * @file The bounded media grid reads behind `SqlMediaRepo.listGridPage`/`findGridItem`: one Kysely
 * body per read for every dialect the content kernel drives. Every filter (workspace, ordinary media,
 * status, recorded MIME) runs in SQL before the `limit + 1` read, and the tab counts come from their
 * own aggregate, never from a page. Newest-first pages straight off the `(created_at, id)` index.
 * Alphabetical cannot: no dialect collation reproduces the admin's `trim().toLocaleLowerCase().localeCompare()`
 * title order (SQL `LOWER` is ASCII-only in SQLite and collation-dependent in Postgres), so that order is
 * decided in JS over a bounded key set (id + title of the filtered rows only, never full rows and never
 * `list()`), and only the page's own rows are then read by id. No persisted sort key is needed for that.
 */

type ContentQueries = Kysely<ContentDatabase>;

/** The grid page request a host binds to the grid route's `readPage`. */
export interface MediaGridPageQuery { workspaceId: UUID; tab: MediaGridTab; orderBy: MediaGridOrder; limit: number }

/** The exact-lookup request a host binds to the grid route's `findItem`. */
export interface MediaGridItemQuery { workspaceId: UUID; tab: MediaGridTab; id: UUID }

/** The optional position a page starts strictly after. */
export interface MediaGridAfter { after?: MediaGridPosition }

/** The content kernel the grid reads run on. */
interface GridReadPorts { kernel: ContentKernel }

/** The recorded MIME of a media row's blob, joined by workspace and SHA like `SqlMediaContentTypeStore.getMany`. */
const RECORDED_CONTENT_TYPE = sql.ref("asset_blobs.content_type");
const NOT_TRASHED = sql<SqlBool>`${sql.ref("media.status")} <> 'trashed'`;

/** The admin tab rule as SQL: Trash is trashed rows; the other tabs are untrashed rows of the recorded MIME family. @complexity O(1). */
function gridTabPredicate({ tab }: { tab: MediaGridTab }, _optional: Record<string, never> = {}): Expression<SqlBool> {
  if (tab === "trash") return sql<SqlBool>`${sql.ref("media.status")} = 'trashed'`;
  if (tab === "all") return NOT_TRASHED;
  const family = tab === "images" ? "image/" : "video/";
  return sql<SqlBool>`(${NOT_TRASHED} and substr(${RECORDED_CONTENT_TYPE}, 1, 6) = ${family})`;
}

/** Ordinary media of one workspace joined to its recorded MIME; documents never enter the grid. @complexity O(1) to build. */
function gridScope({ db, workspaceId }: { db: ContentQueries; workspaceId: UUID }, _optional: Record<string, never> = {}) {
  return db.selectFrom("media")
    .leftJoin("asset_blobs", (join) => join.onRef("asset_blobs.workspace_id", "=", "media.workspace_id").onRef("asset_blobs.sha256", "=", "media.source_sha256"))
    .where("media.workspace_id", "=", workspaceId)
    .where("media.kind", "<>", "document");
}

/** Conditional count of the rows matching `predicate`. @complexity O(1) to build. */
function countWhere({ predicate }: { predicate: Expression<SqlBool> }, _optional: Record<string, never> = {}) {
  return sql<number | string | null>`sum(case when ${predicate} then 1 else 0 end)`;
}

/**
 * Counts every matching row per tab and whether an untrashed row still lacks a recorded MIME, in one
 * aggregate read separate from any page. Untyped rows are repaired by the list route's content-type
 * backfill; the grid never sniffs bytes.
 * @complexity One aggregate scan of the workspace's media.
 */
async function readGridSummary({ db, workspaceId }: { db: ContentQueries; workspaceId: UUID }, _optional: Record<string, never> = {}): Promise<MediaGridSummary> {
  const row = await gridScope({ db, workspaceId }).select([
    countWhere({ predicate: gridTabPredicate({ tab: "all" }) }).as("all_count"),
    countWhere({ predicate: gridTabPredicate({ tab: "images" }) }).as("image_count"),
    countWhere({ predicate: gridTabPredicate({ tab: "videos" }) }).as("video_count"),
    countWhere({ predicate: gridTabPredicate({ tab: "trash" }) }).as("trash_count"),
    countWhere({ predicate: sql<SqlBool>`(${NOT_TRASHED} and ${RECORDED_CONTENT_TYPE} is null)` }).as("untyped_count"),
  ]).executeTakeFirst();
  const read = (value: number | string | null | undefined): number => Number(value ?? 0);
  return {
    counts: { all: read(row?.all_count), images: read(row?.image_count), videos: read(row?.video_count), trash: read(row?.trash_count) },
    hasUntypedActive: read(row?.untyped_count) > 0,
  };
}

/** The admin comparator's title key: trimmed, then locale-lower-cased (never ASCII `LOWER`). @complexity O(n) in the title length. */
function titleSortKey({ title }: { title: string }, _optional: Record<string, never> = {}): string {
  return title.trim().toLocaleLowerCase();
}

/** The admin comparator: by title key, then id ascending, so equal titles still order totally. @complexity O(n) in the title length. */
function compareAlphabetical(required: { left: { id: string; title: string }; right: { id: string; title: string } }, _optional: Record<string, never> = {}): number {
  const { left, right } = required;
  const byTitle = titleSortKey({ title: left.title }).localeCompare(titleSortKey({ title: right.title }));
  if (byTitle !== 0) return byTitle;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

/**
 * One alphabetical page: the filtered rows' `(id, title)` keys sorted with the admin comparator, cut
 * strictly after the cursor's `(title, id)` position, then only the `limit + 1` page rows read by id.
 * The cursor holds a title, not a rank, so it still means the same boundary after the row that
 * supplied it is renamed or deleted.
 * @complexity O(n log n) over the filtered rows' short keys (never row bodies) plus one `limit + 1` read by id.
 */
async function readAlphabeticalRows(
  required: { db: ContentQueries; workspaceId: UUID; tab: MediaGridTab; limit: number },
  optional: MediaGridAfter = {},
): Promise<MediaRecord[]> {
  const { db, workspaceId, tab, limit } = required;
  const { after } = optional;
  const keys = await gridScope({ db, workspaceId }).where(gridTabPredicate({ tab })).select(["media.id", "media.title"]).execute();
  const boundary = after ? { id: after.id, title: after.sortValue } : null;
  const ids = keys
    .filter((key) => boundary === null || compareAlphabetical({ left: key, right: boundary }) > 0)
    .sort((left, right) => compareAlphabetical({ left, right }))
    .slice(0, limit + 1)
    .map((key) => key.id);
  if (ids.length === 0) return [];
  const rows = await db.selectFrom("media").selectAll("media").where("media.workspace_id", "=", workspaceId).where("media.id", "in", ids).execute();
  const place = new Map(ids.map((id, index) => [id, index] as const));
  return rows.sort((left, right) => (place.get(left.id) ?? 0) - (place.get(right.id) ?? 0)).map((row) => toMediaRecord(row));
}

/** One newest-first page: SQL-ordered `(created_at, id)` descending, strictly after the cursor's pair. @complexity One indexed read of `limit + 1` rows. */
async function readCreatedRows(
  required: { db: ContentQueries; workspaceId: UUID; tab: MediaGridTab; limit: number },
  optional: MediaGridAfter = {},
): Promise<MediaRecord[]> {
  const { db, workspaceId, tab, limit } = required;
  const { after } = optional;
  let page = gridScope({ db, workspaceId }).where(gridTabPredicate({ tab })).selectAll("media");
  if (after) {
    // Same-instant rows are only totally ordered by id, so the boundary must compare the pair.
    page = page.where((eb) => eb.or([
      eb("media.created_at", "<", after.sortValue),
      eb.and([eb("media.created_at", "=", after.sortValue), eb("media.id", "<", after.id)]),
    ]));
  }
  const rows = await page.orderBy("media.created_at", "desc").orderBy("media.id", "desc").limit(limit + 1).execute();
  return rows.map((row) => toMediaRecord(row));
}

/**
 * One grid page: up to `limit + 1` rows of the tab in the requested order, strictly after
 * `after`, plus the workspace-wide summary. Workspace, ordinary-media, status and MIME filters all run
 * in SQL before the limit; this never calls `list()`.
 * @complexity One bounded indexed read of `limit + 1` rows plus one aggregate summary read.
 */
export async function readMediaGridPage(
  required: GridReadPorts & MediaGridPageQuery,
  optional: MediaGridAfter = {},
): Promise<MediaGridSummary & { rows: MediaRecord[] }> {
  // Why-comment — sorting or filtering one fetched page cannot reproduce a globally ordered, filtered list.
  return required.kernel.run(async (db) => {
    const { workspaceId, tab, limit } = required;
    const read = required.orderBy === "alphabetical" ? readAlphabeticalRows : readCreatedRows;
    const rows = await read({ db, workspaceId, tab, limit }, optional);
    return { rows, ...(await readGridSummary({ db, workspaceId })) };
  });
}

/** The one ordinary asset with `id` inside `tab`, or `null`, plus the workspace-wide summary; never a page scan.
 *  @complexity One primary-key read plus one aggregate summary read. */
export async function readMediaGridItem(
  required: GridReadPorts & MediaGridItemQuery,
  _optional: Record<string, never> = {},
): Promise<MediaGridSummary & { row: MediaRecord | null }> {
  return required.kernel.run(async (db) => {
    const row = await gridScope({ db, workspaceId: required.workspaceId }).where(gridTabPredicate({ tab: required.tab }))
      .where("media.id", "=", required.id).selectAll("media").limit(1).executeTakeFirst();
    return { row: row ? toMediaRecord(row) : null, ...(await readGridSummary({ db, workspaceId: required.workspaceId })) };
  });
}
