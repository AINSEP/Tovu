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
 * own aggregate, never from a page. Only the newest-first order is paged here: no dialect collation
 * reproduces the admin's `trim().toLocaleLowerCase().localeCompare()` title order.
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

/** The grid read only pages newest-first; alphabetical needs a persisted sort key to be paged. @complexity O(1). */
function assertCreatedOrder({ orderBy }: { orderBy: MediaGridOrder }, _optional: Record<string, never> = {}): void {
  if (orderBy !== "created") throw new Error("alphabetical media grid pages are not supported by this store");
}


/**
 * One grid page: up to `limit + 1` rows of the tab, newest first then id descending, strictly after
 * `after`, plus the workspace-wide summary. Workspace, ordinary-media, status and MIME filters all run
 * in SQL before the limit; this never calls `list()`.
 * @complexity One bounded indexed read of `limit + 1` rows plus one aggregate summary read.
 */
export async function readMediaGridPage(
  required: GridReadPorts & MediaGridPageQuery,
  optional: MediaGridAfter = {},
): Promise<MediaGridSummary & { rows: MediaRecord[] }> {
  assertCreatedOrder({ orderBy: required.orderBy });
  const { after } = optional;
  // Why-comment — sorting or filtering one fetched page cannot reproduce a globally ordered, filtered list.
  return required.kernel.run(async (db) => {
    let page = gridScope({ db, workspaceId: required.workspaceId }).where(gridTabPredicate({ tab: required.tab })).selectAll("media");
    if (after) {
      // Same-instant rows are only totally ordered by id, so the boundary must compare the pair.
      page = page.where((eb) => eb.or([
        eb("media.created_at", "<", after.sortValue),
        eb.and([eb("media.created_at", "=", after.sortValue), eb("media.id", "<", after.id)]),
      ]));
    }
    const rows = await page.orderBy("media.created_at", "desc").orderBy("media.id", "desc").limit(required.limit + 1).execute();
    return { rows: rows.map((row) => toMediaRecord(row)), ...(await readGridSummary({ db, workspaceId: required.workspaceId })) };
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
