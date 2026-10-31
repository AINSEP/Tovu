/** Public route metadata composed from the existing publication, membership, theme and redirect owners. */
import { DefaultMemberAccessResolver, resolvePostMemberAccess } from '#src/features/members/index';
import { listPublishedPosts } from '#src/features/post/index';
import { resolveActiveTheme, isStandaloneThemePage } from '#src/features/theme/index';
import { resolveActiveThemeId } from '#src/features/presentation/index';
import { postPublicPath, checkSiteRelativeTarget, RESERVED_SEGMENTS } from '#src/platform/routing/index';
import { readAnonymousPublishedPosts } from '#src/assistant/site/public-content';
import { RedirectPhaseHandlerResolver, redirectMatcher } from '@jini-ai/cms/redirects';
import type { RouteDeps } from '#src/server/routes/types';

export interface VisitorPageTarget { readonly id: string; readonly label: string; readonly path: string }
export function createVisitorPageTargets({ deps }: { deps: RouteDeps }, _options = {}) {
  const member = new DefaultMemberAccessResolver({ sessions: deps.memberSessionRepo, subscriptions: deps.memberSubscriptionRepo, tiers: deps.memberTierRepo });
  const content = { postRepo: deps.postRepo, workspaceId: deps.workspaceId, listPublishedPosts,
    memberAccess: { resolvePostMemberAccess, decide: member.decide.bind(member) } };
  const redirects = new RedirectPhaseHandlerResolver({ repo: deps.redirectRepo, matcher: redirectMatcher,
    originRegistry: deps.originRegistry, reservedSegments: RESERVED_SEGMENTS });
  return {
    /** One bulk publication read; theme routes cannot override a member-gated published row. */
    async list(_required = {}, _optional = {}): Promise<readonly VisitorPageTarget[]> {
      const all = await listPublishedPosts({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId } });
      // Reuse this authoritative publication snapshot for anonymous membership decisions and
      // occupied slugs. A second DB read costs a full list and can disagree during a publish.
      const publicPosts = await readAnonymousPublishedPosts({ deps: { ...content, listPublishedPosts: async () => all } });
      const occupied = new Set(all.posts.map(post => post.slug));
      const theme = resolveActiveTheme(deps, await resolveActiveThemeId(deps));
      const themePages = !theme || theme === 'none' || theme.manifest.tier !== 'static' ? [] : Object.keys(theme.pages)
        .filter(id => isStandaloneThemePage(theme, id) && !occupied.has(id) && !['signin', 'signup'].includes(id))
        .map(id => ({ id: `theme:${id}`, label: id === 'index' ? 'Home' : id, path: id === 'index' ? '/' : `/${id}` }));
      return [...publicPosts.map(post => ({ id: post.id, label: post.title, path: postPublicPath({ slug: post.slug }) })), ...themePages]
        .filter(page => checkSiteRelativeTarget(page.path).kind === 'ok' && !/[?#]/.test(page.path));
    },
    /** Refuse any redirect rather than following a chain into an unreviewed destination. */
    async assertPath({ path }: { path: string }, _optional = {}): Promise<void> {
      if (checkSiteRelativeTarget(path).kind !== 'ok') throw new Error('Reserved route');
      const report = await redirects.resolveWithRefusals({ workspaceId: deps.workspaceId, path, phase: 'pre_content' });
      if (report.resolution.matched || report.refused.length) throw new Error('Redirect navigation refused');
    },
  };
}
