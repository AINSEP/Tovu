/**
 * @file Tovu SEO policy and port bindings (SPEC-008, ADR-PIPE-008; CMS design Rev 3).
 * INV-09: persisted SEO is read through @jini-ai/cms/seo or @jini-ai/cms/seo/site/settings,
 * never directly from posts.seo_ext_json/site.seo.* by routes, renderers, or tools.
 */
import type {
  SeoFeaturedImagePort, SeoPostListPort, SeoPostWritePort, SeoSitemapDeps,
  SitemapInvalidationDeps,
} from "@jini-ai/cms/seo";
import { extractPlainTextFromHtml } from "@jini-ai/cms/seo";
import type { OriginRegistryPort } from "@jini-ai/core/contracts/server/verified-origin";
import { createPublicPostReader } from "../post/index.js";
import { withoutHeldAgentSchedule, type AgentHoldReader } from "../post/agent-hold.js";
import { resolveFeaturedImageRef, type FeaturedImageDeps } from "@jini-ai/cms/posts/featured-image";
import { ROOT_SLUG, type PostRecord, type PostRepoPort } from "@jini-ai/cms/posts/post";
import { isTrashed } from "@jini-ai/core/contracts/site/soft-delete";
import { findMediaByIdOrSlug, type TransformDefinitionRepoPort } from "../media/index.js";
import { mediaPublicPath, mediaUrlKey } from "@jini-ai/cms/media/site/public-path";
import { resolvePostMemberAccess } from "@jini-ai/user-management/members/access-resolver";
import { createSettingsPrincipalLookup, ensureSettingDefinitions, getEffective, set, type SettingsRepoPort } from "../settings/index.js";
import { normalizeSiteTitle, SITE_TITLE_KEY, SITE_TITLE_NAMESPACE } from "@jini-ai/cms/settings/site/site-title";
import { postPublicPath, urlFor } from "#src/platform/routing/index";
import { isScheduledAt, isLiveAt, postDisplayDateIso } from "@jini-ai/core/scheduled-publish";
import { resolveRuntimeMode } from "../../contracts/core/runtime-mode.js";
import { getSeoSettings, isDefaultRobotsNoindexExplicitlySet, type SeoSettingsLedgerBindings } from "@jini-ai/cms/seo/site/settings";
import { processOutbox } from "../../contracts/core/events/outbox-worker.js";

/**
 * This host's settings ledger, bound once for every `@jini-ai/cms/seo/site/settings` call site
 * (boot registration, the admin routes, the SEO tools): the package registrar and reader, this
 * host's policy-wrapped chokepoint `set` (the same function behind its site-title bounds), and its
 * active-principal policy (missing, disabled and foreign-workspace records never become targets).
 */
export const seoSettingsHostBindings: SeoSettingsLedgerBindings = {
  ensureSettingDefinitions,
  getEffective,
  set,
  createPrincipalLookup: createSettingsPrincipalLookup,
};

/** Bind the host post/page reader without projecting away content fields needed by CAS/revisions.
 * Email templates remain solely with their authoring owner, even if incorrectly marked published.
 * @example createSeoPostPort({ postRepo }, {})
 * @complexity O(1) wiring; reads/writes retain the host repository's costs and errors.
 */
export function createSeoPostPort({ postRepo }: { postRepo: PostRepoPort }, { agentHold }: { agentHold?: AgentHoldReader } = {}): SeoPostListPort & SeoPostWritePort {
  const reader = createPublicPostReader({ repo: postRepo });
  return {
    // Call through the receiver so prototype methods keep `this` and fault-injection remains live.
    findById: reader.findById,
    // H4: the sitemap reads here, so an agent post held by the pause is not listed (see `withoutHeldAgentSchedule`).
    list: async (input) => withoutHeldAgentSchedule({ workspaceId: input.workspaceId, rows: await reader.list(input), agentHold }),
    extractPlainText: ({ html }) => extractPlainTextFromHtml({ html }),
    isTrashed: ({ post }) => isTrashed(post),
    transaction: ({ fn }) => postRepo.transaction({ fn }),
    // The read port returns the COMPLETE PostRecord; Jini spreads it rather than projecting it.
    // These casts restore the host type at storage boundaries, never manufacture missing fields.
    saveIfVersion: ({ record, ifVersion }) => postRepo.saveIfVersion({ record: record as PostRecord, ifVersion }),
    appendRevision: ({ stateJson, ...input }) => postRepo.appendRevision({ ...input, stateJson: stateJson as PostRecord }),
  };
}

/** Bind media/post owners, retaining id-first/slug-history lookup and non-image refusal.
 * @example createSeoFeaturedImagePort({ deps: mediaDeps }, {})
 * @complexity O(1) wiring; lookups retain the owners' bounded reads and errors.
 */
export function createSeoFeaturedImagePort({ deps }: { deps: Omit<FeaturedImageDeps, "findMediaByIdOrSlug"> }, _optional: Record<string, never> = {}): SeoFeaturedImagePort {
  return {
    findMediaByIdOrSlug: (input) => findMediaByIdOrSlug({ deps, input }),
    mediaUrlKey: ({ asset }) => mediaUrlKey(asset),
    mediaPublicPath: (input) => mediaPublicPath(input),
    resolveFeaturedImageRef: (input) => resolveFeaturedImageRef({ deps: { ...deps, findMediaByIdOrSlug }, input }),
  };
}

/** Host bindings shared by the head producer, evaluator, sitemap service, routes and tools. */
export interface SeoHostBindings extends SeoSitemapDeps {
  postRepo: SeoPostListPort & SeoPostWritePort;
  shareImageTransform: string;
  rootSlug: string;
  siteTitle: (required: { workspaceId: string }, optional?: Record<string, never>) => Promise<string | undefined>;
  dispatch: SitemapInvalidationDeps["dispatch"];
}

/** Build SEO ports once alongside the composed site's sitemap service.
 * @example createSeoDeps({ deps: routeOwners }, {})
 * @complexity O(1) wiring; effects/errors belong to the bound owners.
 */
export function createSeoDeps({ deps }: { deps: Omit<FeaturedImageDeps, "findMediaByIdOrSlug"> & {
  postRepo: PostRepoPort;
  settingsRepo: SettingsRepoPort;
  transformDefinitionRepo: TransformDefinitionRepoPort;
  originRegistry: OriginRegistryPort;
  clock: { nowIso(): string };
} }, { agentHold }: { agentHold?: AgentHoldReader } = {}): SeoHostBindings {
  return {
    originRegistry: deps.originRegistry,
    // Messaging/social crawlers receive the JPEG variant registered by media bootstrap.
    shareImageTransform: "og",
    postRepo: createSeoPostPort({ postRepo: deps.postRepo }, { agentHold }),
    settings: {
      getSeoSettings: (input) => getSeoSettings({ settingsRepo: deps.settingsRepo, getEffective }, input),
      isDefaultRobotsNoindexExplicitlySet: (input) => isDefaultRobotsNoindexExplicitlySet({ deps: { settingsRepo: deps.settingsRepo, getEffective }, input }, {}),
    },
    urls: {
      postPublicPath: ({ slug }) => postPublicPath({ slug: slug }),
      urlFor: ({ target, ctx }) => urlFor({ deps: { postRepo: deps.postRepo }, target, ctx }),
    },
    liveness: {
      isScheduledAt: ({ post, nowIso }) => isScheduledAt({ record: post, nowIso }),
      isLiveAt: ({ post, nowIso }) => isLiveAt({ record: post, nowIso }),
      postDisplayDateIso: ({ post }) => postDisplayDateIso(post),
    },
    clock: { nowIso: deps.clock.nowIso.bind(deps.clock) },
    media: {
      featuredImage: createSeoFeaturedImagePort({ deps }, {}),
      transformDefinitionRepo: { listByName: deps.transformDefinitionRepo.listByName.bind(deps.transformDefinitionRepo) },
    },
    // A sitemap has no visitor session: only the member owner's anonymous/public decision
    // applies. Members/paid/tiers and malformed/unknown visibility fail closed (ADR-030 §4).
    isPubliclyAccessible: ({ post }) => resolvePostMemberAccess({ raw: post.memberAccessJson }).visibility === "public",
    runtimeMode: resolveRuntimeMode(),
    rootSlug: ROOT_SLUG,
    // Only an explicit workspace title counts for the root entry, not the default/display fallback.
    siteTitle: async ({ workspaceId }) => {
      const setting = await getEffective(
        { deps: { repo: deps.settingsRepo }, namespace: SITE_TITLE_NAMESPACE, key: SITE_TITLE_KEY, scopeContext: { workspaceId } },
      );
      return setting?.sourceLayer === "workspace" ? normalizeSiteTitle({ value: setting.value }) : undefined;
    },
    // The daemon outbox is enqueue-only; the existing host owner controls actual delivery.
    dispatch: (input) => processOutbox(input),
  };
}
