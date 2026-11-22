import { VISITOR_TOOL_PRESENTATION } from './visitor-tool-presentation.js';
/** CMS policy over Jini's frontend registrations; no second page executor. */
import { PAGE_CAPABILITIES, findCapabilityInputError, normalizeAgentLabel, pageActionNeedsConfirmation, type PagePublication, type CapabilityDef } from '@jini-ai/agentic';
import type { ToolRegistration } from '@jini-ai/core';
import { readAnonymousPublishedPosts, type AnonymousPublishedPostDeps } from './public-content.js';
import { postPublicPath, checkSiteRelativeTarget } from '#src/platform/routing/index';
import type { VisitorCapabilityContract } from './visitor-executor.js';
import { readVisitorPagePublication } from '#src/features/theme/visitor-publication';

export interface VisitorPageTools {
  readonly publication: PagePublication & { readonly path?: string };
  readonly listPages?: () => Promise<readonly { id: string; label: string; path: string }[]>;
  readonly assertPath?: (args: { path: string }) => Promise<void>;
  readonly registrations: readonly ToolRegistration[];
}

/** Published post/page IDs only, using the same anonymous read owner as public content tools.
 * A trashed post may still have status=published: deletedAt, membership and live publish state
 * must come from the post/members owners, never a local status-only test. Published content can
 * contain prompt injection, so this server-side target resolution (not prompt wording) keeps a
 * hijacked model inside this site's public routes. No model-supplied URL, path, query or redirect
 * reaches the browser. O(n) one published-content read. */
export async function resolveVisitorPageTarget({ deps, input }: { deps: AnonymousPublishedPostDeps; input: Record<string, unknown> },
  { pages, assertPath }: Pick<VisitorPageTools, 'assertPath'> & { pages?: readonly VisitorPageTarget[] } = {},
): Promise<VisitorPageTarget> {
  const matches = visitorNavigationMatch({ input });
  const targets = pages ?? await publicTargets({ deps });
  const target = targets.find(matches);
  if (!target) throw new Error('Unpublished page');
  assertVisitorPath({ path: target.path });
  await assertPath?.({ path: target.path });
  return target;
}
type VisitorPageTarget = { readonly id: string; readonly label: string; readonly path: string };
async function publicTargets({ deps }: { deps: AnonymousPublishedPostDeps }): Promise<readonly VisitorPageTarget[]> {
  return (await readAnonymousPublishedPosts({ deps })).map(post => ({ id: post.id, label: post.title, path: postPublicPath({ slug: post.slug }) }));
}
/** A slug (what search_published_entries returns) matches only a published target's own path,
 * so it can never name a route the server did not list; ids stay for direct callers. */
function visitorNavigationMatch({ input }: { input: Record<string, unknown> }): (target: VisitorPageTarget) => boolean {
  if (input.query && Object.keys(input.query).length) throw new Error('Visitor query refused');
  if (typeof input.slug === 'string') {
    const path = postPublicPath({ slug: input.slug });
    return target => target.path === path;
  }
  const entity = input.entity as { type: string; id: string } | undefined;
  if (entity && !['post', 'page', 'entry'].includes(entity.type)) throw new Error('Unpublished entity type');
  const id = entity?.id ?? input.page;
  return target => target.id === id;
}

/** Visitors address pages by slug (owner 2026-11-13: restore slug navigation). Jini's admin
 * page.navigate text names data-agent-page ids from page.find_elements, a tool visitors lack. */
const VISITOR_NAVIGATE = {
  description: "Open one of this site's published public pages or posts in the visitor's browser tab. Address it by slug, " +
    "as returned by search_published_entries (for example 'contact'); '/' is the home page. Search first when unsure of the slug.",
  inputSchema: { type: 'object', properties: { slug: { type: 'string', description: "The page or post's URL slug, from search_published_entries." } },
    required: ['slug'], additionalProperties: false },
} as const;
/** The page capabilities as visitors see them: model schemas and input checks both read this. */
export const VISITOR_PAGE_CAPABILITIES: readonly CapabilityDef[] = PAGE_CAPABILITIES.map(capability =>
  capability.id === 'page.navigate' ? { ...capability, ...VISITOR_NAVIGATE } : capability);
function assertVisitorPath({ path }: { path: string }): void {
  if (checkSiteRelativeTarget(path).kind !== 'ok' || /[?#]/.test(path)) throw new Error('Reserved page');
}

/** Server-issued action classes determine both eligibility and forced confirmation. */
export function visitorPageNeedsConfirmation({ toolId, input, publication }: { toolId: string; input: unknown; publication: PagePublication }, _options = {}): boolean {
  const handle = (input as Record<string, unknown> | null)?.handle;
  return pageActionNeedsConfirmation({ capabilityId: toolId, element: publication.elements.find(element => element.handle === handle) });
}

/** Recheck publication immediately before delegation; live DOM checks stay in Jini.
 * The registration handler receives only this detached server-bound plan, never a browser grant.
 * O(p) in <=256 reviewed handles plus the content owner's navigation read. */
export function createVisitorPageCapabilities({ deps, page }: { deps: AnonymousPublishedPostDeps; page: VisitorPageTools }, _options = {}): readonly VisitorCapabilityContract[] {
  return VISITOR_PAGE_CAPABILITIES.map(capability => {
    const registration = page.registrations.find(tool => tool.descriptor.id === capability.id)!;
    return { name: capability.id, visitorOfferable: true as const, ...VISITOR_TOOL_PRESENTATION[capability.id as keyof typeof VISITOR_TOOL_PRESENTATION], readOnly: capability.risk === 'read',
      acceptsInput: ({ input }) => validVisitorPageInput({ capability, input, publication: page.publication }),
      requiresConfirmation: ({ input }: { input: unknown }) => visitorPageNeedsConfirmation({ toolId: capability.id, input, publication: page.publication }),
      async execute({ input, context }) {
        if (!context || !readVisitorPagePublication({ revision: page.publication.revision, workspaceId: deps.workspaceId })) throw new Error('Page publication expired');
        const args = structuredClone(input) as Record<string, unknown>;
        const target = page.publication.elements.find(element => element.handle === args.handle);
        if (!publishedAction({ toolId: capability.id, target })) throw new Error('Unpublished page action');
        const pages = page.listPages ? await page.listPages() : await publicTargets({ deps });
        if (page.publication.path && !pages.some(target => target.path === page.publication.path)) throw new Error('Page no longer public');
        const navigation = capability.id === 'page.navigate' ? await resolveVisitorPageTarget({ deps, input: args }, { pages, assertPath: page.assertPath }) : undefined;
        if (navigation) { args.page = navigation.id; delete args.slug; delete args.entity; delete args.query; }
        const wire = { ...args, __visitorPage: { revision: page.publication.revision, approved: true, pages: pageTargetSummaries({ pages, navigation }), ...(navigation ? { path: navigation.path } : {}) } };
        return { result: await registration.handler({ ...context, input: wire }, {}) };
      },
    };
  });
}

/** Automatic clicks are reviewed UI operations; anchors must use validated navigation. */
function publishedAction({ toolId, target }: { toolId: string; target?: PagePublication['elements'][number] }): boolean {
  if (['page.navigate', 'page.find_elements'].includes(toolId)) return true;
  if (!target) return false;
  const allowed: Readonly<Record<string, readonly string[]>> = {
    'page.fill': ['fill'], 'page.select_option': ['select'], 'page.click': ['menu', 'tab', 'accordion', 'carousel', 'media', 'submit'],
  };
  return !allowed[toolId] || allowed[toolId]!.includes(target.action);
}
function validVisitorPageInput({ capability, input, publication }: { capability: CapabilityDef; input: unknown; publication: PagePublication }): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const args = input as Record<string, unknown>;
  if (findCapabilityInputError({ capability, input: args })) return false;
  return publishedAction({ toolId: capability.id, target: publication.elements.find(element => element.handle === args.handle) });
}

/** Bound discovery metadata without limiting direct navigation to an already-known public ID. */
function pageTargetSummaries({ pages, navigation }: { pages: readonly VisitorPageTarget[]; navigation?: VisitorPageTarget }): readonly { id: string; label: string }[] {
  const candidates = navigation ? [navigation, ...pages.filter(page => page.id !== navigation.id)] : pages;
  return candidates.slice(0, 128).map(page => ({ id: page.id, label: normalizeAgentLabel({ raw: page.label }).text }));
}
