/**
 * @file The CMS's posts and pages as `@jini-ai/search` document sources (collections `post` and
 * `page`, the two `kind`s of the bespoke `posts` table). The generic indexer never trusts an event:
 * it asks {@link SearchDocumentSource.load} for the row's current truth, and this file is that truth.
 *
 * What may be indexed is exactly what the public site shows: `isLiveAt` (published, not trashed,
 * past its go-live time — `contracts/core/scheduled-publish.ts`). Everything else loads as
 * `document: null`, which the indexer turns into a tombstone.
 *
 * Known gap: a bespoke HTML page edit (`SqlPagesHtmlDocumentStore.write`) emits no outbox event, so
 * it reaches the index only through a backfill/reindex `scan`, never through `load` on an event.
 */
import type { Selectable } from "kysely";
import type { SearchDocument, SearchDocumentSource, SearchSourceEvent, SearchSourceRecord, SearchVisibility } from "@jini-ai/search";

import type { ContentKernel } from "#src/platform/db/content-kernel";
import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import { isLiveAt } from "#src/contracts/core/scheduled-publish";
import { postPublicPath } from "#src/platform/routing/adapter";
import type { PostKind } from "../post/post.js";
import { toRecord } from "../post/repo.rows.js";
import { toPostSearchDocument } from "../post/search.js";
import { resolvePostMemberAccess } from "../members/access-resolver.js";

type PostRow = Selectable<ContentDatabase["posts"]>;

/** The events `post.ts` emits on a public-facing status transition (`classifyStatusTransition`).
 *  Trashing a published row emits `entry.unpublished`, so trash needs no event of its own. */
export const CMS_SEARCH_EVENTS = ["entry.published", "entry.updated", "entry.unpublished"] as const;

export const CMS_SEARCH_COLLECTIONS: readonly PostKind[] = ["post", "page"];

/**
 * Audience tokens for member-gated entries. A viewer's audiences are built from the same tokens by
 * `memberSearchAudiences` (`access.ts`); prefixed so a tier id can never spell `members` or `paid`.
 */
export const MEMBER_AUDIENCE = { members: "members", paid: "paid", tier: (tierId: string) => `tier:${tierId}` } as const;

/**
 * Who may see an entry, from its raw `member_access_json`. Mirrors `DefaultMemberAccessResolver.decide`:
 * a never-gated row is public; `tiers` with no tier ids and any malformed/unknown visibility become
 * restricted to no audience at all (fail closed, never public).
 * @complexity O(t) in the tier-id count.
 */
export function cmsSearchVisibility(required: { memberAccessJson: string | null }, _optional: Record<string, never> = {}): SearchVisibility {
  const access = resolvePostMemberAccess(required.memberAccessJson);
  switch (access.visibility) {
    case "public": return { kind: "public" };
    case "members": return { kind: "restricted", audiences: [MEMBER_AUDIENCE.members] };
    case "paid": return { kind: "restricted", audiences: [MEMBER_AUDIENCE.paid] };
    case "tiers": return { kind: "restricted", audiences: (Array.isArray(access.tierIds) ? access.tierIds : []).map(MEMBER_AUDIENCE.tier) };
    default: return { kind: "restricted", audiences: [] };
  }
}

/** The ISO instant `isLiveAt` compares `publishAt` against. */
export const toNowIso = (nowMs: number): string => new Date(nowMs).toISOString();

/** Whether a stored row is publicly visible right now (`isLiveAt` on its raw columns). @complexity O(1). */
export function isRowLive(row: Pick<PostRow, "status" | "publish_at" | "deleted_at">, nowIso: string): boolean {
  return isLiveAt({ status: row.status, publishAt: row.publish_at, deletedAt: row.deleted_at }, nowIso);
}

/**
 * Search revisions. Every write the indexer makes must carry a revision strictly greater than the
 * last one for its key, tombstones included, or the provider ignores it as stale. Hence:
 *
 * - The instant is epoch ms, scaled by 1000 with `version % 1000` added: `version` grows on every
 *   save (reverts too, INV-04), so two saves in the same millisecond still order. 1000 saves of one
 *   row inside one millisecond cannot happen, and the result stays a safe integer until ~2255.
 * - A LIVE row's instant is `max(updatedAt, publishAt)`. A scheduled post was tombstoned while
 *   embargoed (its `entry.published` fires at go-live, owned by the go-live fix), and that
 *   tombstone's instant is at most the event time, which precedes `publishAt`; so going live
 *   outranks it with no new save. A live revision depends on the row alone: a replayed event
 *   re-derives the same number and is harmlessly stale.
 * - A NOT-LIVE row's instant is `max(updatedAt, occurredAt)`, so the tombstone outranks the last
 *   indexed revision even when the event that removed it is newer than the row's own timestamp.
 * - A MISSING row (permanently deleted) uses `occurredAt` with the top tie-break, outranking every
 *   revision of that millisecond.
 */
const scaled = (instantMs: number, tieBreak: number) => instantMs * 1000 + tieBreak;
const ms = (iso: string | null) => (iso === null ? 0 : Date.parse(iso));

/** @complexity O(1). */
export function cmsSearchRevision(
  required: { row: Pick<PostRow, "updated_at" | "publish_at" | "version"> | null; live: boolean; occurredAtMs: number },
  _optional: Record<string, never> = {},
): number {
  const { row, live, occurredAtMs } = required;
  if (row === null) return scaled(occurredAtMs, 999);
  const instant = Math.max(ms(row.updated_at), live ? ms(row.publish_at) : occurredAtMs);
  return scaled(instant, row.version % 1000);
}

/** The indexable document for a live row. Title and body are plain text (the post FTS projection's
 *  own extraction, TipTap and bespoke-HTML alike); the URL is the one the public site routes. */
function toDocument(required: { siteId: string; collection: PostKind; row: PostRow; revision: number }): SearchDocument {
  const { siteId, collection, row, revision } = required;
  const text = toPostSearchDocument(toRecord(row));
  return {
    key: { siteId, workspaceId: row.workspace_id, collection, documentId: row.id },
    revision,
    url: postPublicPath({ slug: row.slug }),
    title: text.title,
    body: text.bodyText,
    visibility: cmsSearchVisibility({ memberAccessJson: row.member_access_json }),
  };
}

/** A row's current truth for the index. @complexity O(body size) for the text extraction. */
function toSourceRecord(required: { siteId: string; workspaceId: string; collection: PostKind; documentId: string; row: PostRow | null; nowMs: number; occurredAtMs: number }): SearchSourceRecord {
  const { siteId, workspaceId, collection, documentId, nowMs, occurredAtMs } = required;
  // A row of the other kind is not a document of this collection: treat it as missing here.
  const row = required.row?.kind === collection ? required.row : null;
  const live = row !== null && isRowLive(row, toNowIso(nowMs));
  const revision = cmsSearchRevision({ row, live, occurredAtMs });
  const key = { siteId, workspaceId, collection, documentId };
  return { key, revision, document: live ? toDocument({ siteId, collection, row, revision }) : null };
}

/** The document id an event names for `collection`: post.ts's payload `{ entryId, contentType }`.
 *  Generic `entries` emit the same event names without `contentType`, so they are never claimed. */
function documentIdFor(event: SearchSourceEvent, collection: PostKind): string | null {
  if (!(CMS_SEARCH_EVENTS as readonly string[]).includes(event.name)) return null;
  const payload = (typeof event.payload === "object" && event.payload !== null ? event.payload : {}) as { entryId?: unknown; contentType?: unknown };
  return payload.contentType === collection && typeof payload.entryId === "string" ? payload.entryId : null;
}

/** One collection's source. @complexity load: one primary-key read; scan: one keyset page. */
function createSource(required: { kernel: ContentKernel; now: () => number; collection: PostKind }): SearchDocumentSource {
  const { kernel, now, collection } = required;
  return {
    collection,
    events: CMS_SEARCH_EVENTS,
    documentIdOf: ({ event }) => documentIdFor(event, collection),
    async load({ siteId, workspaceId, documentId, occurredAtMs }) {
      const row = await kernel.run(db => db.selectFrom("posts").selectAll()
        .where("workspace_id", "=", workspaceId).where("id", "=", documentId).executeTakeFirst());
      return toSourceRecord({ siteId, workspaceId, collection, documentId, row: row ?? null, nowMs: now(), occurredAtMs });
    },
    async scan({ siteId, workspaceId, limit }, optional = {}) {
      const nowMs = now();
      const nowIso = toNowIso(nowMs);
      const rows = await kernel.run(db => {
        let query = db.selectFrom("posts").selectAll()
          .where("workspace_id", "=", workspaceId).where("kind", "=", collection)
          .where("status", "=", "published").where("deleted_at", "is", null)
          // Same rule as `isLiveAt`: ISO UTC strings compare in time order.
          .where(eb => eb.or([eb("publish_at", "is", null), eb("publish_at", "<=", nowIso)]));
        if (optional.cursor !== undefined) query = query.where("id", ">", optional.cursor);
        // Keyset on the primary key: stable under concurrent writes, never repeats or skips a row.
        return query.orderBy("id", "asc").limit(limit).execute();
      });
      const records = rows.map(row => toSourceRecord({ siteId, workspaceId, collection, documentId: row.id, row, nowMs, occurredAtMs: nowMs }));
      const last = rows.at(-1);
      // A short (or empty) page is the last one; a full page may have more after its last id.
      return last === undefined || rows.length < limit ? { records } : { records, nextCursor: last.id };
    },
  };
}

/**
 * The `post` and `page` sources over one site's content database (one workspace per content.db).
 * @example registerMany(SEARCH_DOCUMENT_SOURCES, createCmsSearchDocumentSources({ kernel, now }))
 * @complexity O(1) to build.
 */
export function createCmsSearchDocumentSources(
  required: { readonly kernel: ContentKernel; readonly now: () => number },
  optional: { readonly collections?: readonly PostKind[] } = {},
): SearchDocumentSource[] {
  return (optional.collections ?? CMS_SEARCH_COLLECTIONS).map(collection => createSource({ ...required, collection }));
}
