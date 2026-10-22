import { InMemoryPostRepo, type PostRecord } from "#src/features/post/index";
import { InMemoryPresentationSettingsRepo } from "#src/features/presentation/index";
import type { DiscoveredTheme } from "#src/features/theme/index";
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
  const themes: DiscoveredTheme[] = [];
  return { deps: { ...createRouteDeps(), workspaceId: 'w', postRepo: repo, authorize: async () => ({ allowed: true, reason: 'test' }), themes }, repo, writes: () => writes };
}

/** A draft page and date-ordered published posts, backed by DI repositories with write tracking. */
export function postListPreviewDeps({ count, slug }: { count: number; slug: string }, _options = {}) {
  const post = { ...barePost, slug, templateChoice: "page.html" };
  const posts = Array.from({ length: count }, (_, i): PostRecord => ({
    ...barePost, id: `listed-${i}`, slug: `listed-${i}`, title: `Listed post ${i}`,
    kind: "post", status: "published", bodyHtml: null, bodyFormat: "doc",
    publishAt: new Date(Date.UTC(2026, 0, 30 - i)).toISOString(),
  }));
  const fixture = bareDeps([post, ...posts]);
  const theme: DiscoveredTheme = {
    manifest: { id: "listing-preview", name: "Listing preview", version: "1", tier: "static", engine: 1, templates: ["page.html"] },
    dir: "/unused", tokens: {}, tokensLight: {}, templates: {}, liquidTemplates: {}, handlebarsTemplates: {},
    pages: { page: `<html><body><main data-embed-config='{"type":"content"}'></main></body></html>` },
    partials: {}, css: "", source: "site", status: "valid", errors: [],
  };
  fixture.deps.themes = [theme];
  fixture.deps.presentationRepo = new InMemoryPresentationSettingsRepo({}, {
    initialRows: [{ workspaceId: "w", activeThemeId: theme.manifest.id, updatedAt: post.updatedAt }],
  });
  return { ...fixture, post, posts, theme };
}
