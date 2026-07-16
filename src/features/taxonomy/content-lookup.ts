import type { PostRepoPort } from "../post/post";
import type { ContentLookupPort } from "./write-service";

/**
 * ADR-041/043/044/045 re-audit (2026-07-16, TM-adr041-043-044-045-audit-001, Finding 1 fix) —
 * the real `ContentLookupPort` adapter. `TAXONOMY_ALLOWED_CONTENT_TYPES` (write-service.ts) is
 * exactly `{post, page}` today, and both live in the SAME `posts` table (`kind` column
 * distinguishes them) — so this adapter only ever needs `PostRepoPort`, not the newer `entries`
 * table. A future ADR extending the allow-list to an ADR-043 content type would extend this
 * adapter (or add a sibling), not replace it.
 */
export function createPostBackedContentLookup(deps: { postRepo: PostRepoPort; workspaceId: string }): ContentLookupPort {
  return {
    async resolve({ contentId }) {
      const post = await deps.postRepo.findById({ workspaceId: deps.workspaceId, id: contentId });
      return post ? { workspaceId: post.workspaceId, kind: post.kind } : null;
    },
  };
}
