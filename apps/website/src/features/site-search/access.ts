/**
 * @file The fail-closed last check before a search hit is shown (`@jini-ai/search`'s
 * `SearchAccessPort`) for the CMS's posts and pages. A provider's index may lag the database; this
 * re-reads the rows the hits name, in one query per collection, and keeps only the keys that are
 * live right now and, when member-gated, open to one of the viewer's audiences.
 *
 * Fails closed: a key of another site or workspace, of an unknown collection, of a missing,
 * draft, trashed or still-scheduled row, or with an unreadable gate is never visible.
 */
import { encodeSearchKey, type SearchAccessPort, type SearchDocumentKey } from "@jini-ai/search";

import type { ContentKernel } from "#src/platform/db/content-kernel";
import type { MemberContext } from "../members/types.js";
import type { PostKind } from "../post/post.js";
import { CMS_SEARCH_COLLECTIONS, MEMBER_AUDIENCE, cmsSearchVisibility, isRowLive, toNowIso } from "./cms-document-source.js";

/**
 * A viewer's search audiences, from their validated member context (never from request input):
 * none for an anonymous viewer, otherwise `members`, `paid` when entitled, and one token per tier.
 * Uses the same tokens `cmsSearchVisibility` writes, so the two cannot drift apart.
 * @complexity O(a) in the active tier count.
 */
export function memberSearchAudiences(required: { context: MemberContext }, _optional: Record<string, never> = {}): string[] {
  const { context } = required;
  if (!context.isAuthenticated) return [];
  return [MEMBER_AUDIENCE.members, ...(context.isPaid ? [MEMBER_AUDIENCE.paid] : []), ...context.activeTierIds.map(MEMBER_AUDIENCE.tier)];
}

/** Whether a gated row is open to any of `audiences`. @complexity O(r·a), both small. */
function audienceAllows(memberAccessJson: string | null, audiences: readonly string[]): boolean {
  const visibility = cmsSearchVisibility({ memberAccessJson });
  return visibility.kind === "public" || visibility.audiences.some(audience => audiences.includes(audience));
}

/** Keys grouped by known collection; keys of other sites and unknown collections are dropped here.
 *  @complexity O(k). */
function groupKeys(siteId: string, keys: readonly SearchDocumentKey[], collections: readonly PostKind[]): Map<PostKind, SearchDocumentKey[]> {
  const groups = new Map<PostKind, SearchDocumentKey[]>();
  for (const key of keys) {
    const collection = key.collection as PostKind;
    if (key.siteId !== siteId || !collections.includes(collection)) continue;
    groups.set(collection, [...(groups.get(collection) ?? []), key]);
  }
  return groups;
}

/**
 * The access port over one site's content database.
 * @example createCmsSearchAccessPort({ kernel, now }).visibleKeys({ siteId, keys, audiences })
 * @complexity visibleKeys: one indexed query per collection present among the keys, O(k) work.
 */
export function createCmsSearchAccessPort(
  required: { readonly kernel: ContentKernel; readonly now: () => number },
  optional: { readonly collections?: readonly PostKind[] } = {},
): SearchAccessPort {
  const { kernel, now } = required;
  const collections = optional.collections ?? CMS_SEARCH_COLLECTIONS;
  return {
    async visibleKeys({ siteId, keys, audiences }) {
      const nowIso = toNowIso(now());
      const visible = new Set<string>();
      for (const [collection, group] of groupKeys(siteId, keys, collections)) {
        const rows = await kernel.run(db => db.selectFrom("posts")
          .select(["id", "workspace_id", "status", "publish_at", "deleted_at", "member_access_json"])
          .where("kind", "=", collection).where("id", "in", group.map(key => key.documentId)).execute());
        const byId = new Map(rows.map(row => [row.id, row]));
        for (const key of group) {
          const row = byId.get(key.documentId);
          // The workspace is part of the key: a hit can never borrow another workspace's row.
          if (row?.workspace_id !== key.workspaceId || !isRowLive(row, nowIso) || !audienceAllows(row.member_access_json, audiences)) continue;
          visible.add(encodeSearchKey({ key }));
        }
      }
      return visible;
    },
  };
}
