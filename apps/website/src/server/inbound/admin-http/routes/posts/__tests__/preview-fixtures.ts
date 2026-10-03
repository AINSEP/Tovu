import { InMemoryPostRepo, type PostRecord } from "#src/features/post/index";
import { createRouteDeps } from "#src/server/runtime/composition/app";
export const barePost: PostRecord = { id: 'draft-1', workspaceId: 'w', slug: 'draft-slug', title: 'Draft title', status: 'draft', kind: 'page', bodyFormat: 'html', bodyHtml: '<!doctype html><html><body><p>Saved draft</p></body></html>', bodyJson: { type: 'doc', content: [] }, updatedAt: '2026-10-01T00:00:00Z', version: 1, templateChoice: '' };
export function bareDeps(posts: PostRecord[] = [barePost]) {
  const repo = new InMemoryPostRepo(structuredClone(posts));
  let writes = 0;
  for (const method of ['save', 'saveIfVersion', 'softDelete', 'hardDelete', 'writeAutosave', 'clearAutosave', 'appendRevision'] as const) {
    const original = repo[method];
    Object.defineProperty(repo, method, { value: (...args: unknown[]) => {
      writes++;
      return Reflect.apply(original, repo, args);
    } });
  }
  return { deps: { ...createRouteDeps(), workspaceId: 'w', postRepo: repo, authorize: async () => ({ allowed: true, reason: 'test' }), themes: [] }, repo, writes: () => writes };
}
