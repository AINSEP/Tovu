/** Slug-aware media usage over the existing reference index and post body scanner. Ordinary post
 * saves do not maintain entry_refs; read those current bodies instead of claiming a stale index
 * is complete. This is a host adapter over Tovu's separate post store, with no new persisted data. */
import type { EntryRefsRepoPort } from '#src/contracts/core/entry-refs/ports';
import type { EntryRefRow } from '#src/contracts/core/entry-refs/types';
import type { PostRepoPort } from '#src/features/post/post';
import { collectReferencedMediaKeys } from '#src/features/publish-content/media-references';

/** O(n) in current post body bytes plus two indexed lookups; read-only and workspace-scoped. */
export async function findMediaWhereUsed(
  { deps, input }: { deps: { entryRefsRepo: Pick<EntryRefsRepoPort, 'findByTarget'>; postRepo: Pick<PostRepoPort, 'list'> }; input: { workspaceId: string; mediaId: string; slug: string } },
  _optional: Record<string, never> = {},
): Promise<{ count: number; references: readonly EntryRefRow[] }> {
  const keys = new Set([input.mediaId, input.slug].filter(Boolean));
  const [indexed, posts] = await Promise.all([
    Promise.all([...keys].map(targetId => deps.entryRefsRepo.findByTarget({ workspaceId: input.workspaceId, targetKind: 'asset', targetId }))),
    deps.postRepo.list({ workspaceId: input.workspaceId }),
  ]);
  const postIds = new Set(posts.map(post => post.id));
  const references = new Map<string, EntryRefRow>();
  for (const row of indexed.flat()) {
    if (!postIds.has(row.sourceEntryId)) references.set(`${row.sourceEntryId}:${row.fieldPath}`, row);
  }
  for (const post of posts) {
    if (post.deletedAt != null) continue;
    const refs = collectReferencedMediaKeys({ bodyJson: post.bodyJson, bodyHtml: post.bodyHtml, seoExtJson: post.seoExtJson });
    if (![...keys].some(key => refs.has(key))) continue;
    const row: EntryRefRow = { workspaceId: input.workspaceId, sourceEntryId: post.id, sourceKind: 'config-field', fieldPath: post.bodyFormat === 'html' ? 'bodyHtml' : 'bodyJson', targetKind: 'asset', targetId: input.mediaId };
    references.set(`${post.id}:${row.fieldPath}`, row);
  }
  return { count: references.size, references: [...references.values()] };
}
