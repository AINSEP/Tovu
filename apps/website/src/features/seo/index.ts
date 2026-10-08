/**
 * @file Tovu SEO policy and port bindings (SPEC-008, ADR-PIPE-008; CMS design Rev 3).
 * INV-09: persisted SEO is read through @jini-ai/cms/seo or these host settings functions,
 * never directly from posts.seo_ext_json/site.seo.* by routes, renderers, or tools.
 */
import type {
  SeoFeaturedImagePort, SeoPostListPort, SeoPostWritePort, SeoSitemapDeps,
  SitemapInvalidationDeps,
} from "@jini-ai/cms/seo";
import type { OriginRegistryPort } from "@jini-ai/http-kit/verified-origin";
import {
  extractPlainTextFromHtml, isTrashed, resolveFeaturedImageRef, ROOT_SLUG,
  type FeaturedImageDeps, type PostRecord, type PostRepoPort,
} from "../post/index.js";
import { findMediaByIdOrSlug, mediaPublicPath, mediaUrlKey, type TransformDefinitionRepoPort } from "../media/index.js";
import { resolvePostMemberAccess } from "../members/index.js";
import { getEffective, type SettingsRepoPort } from "../settings/index.js";
import { normalizeSiteTitle, SITE_TITLE_KEY, SITE_TITLE_NAMESPACE } from "../settings/site-title.js";
import { postPublicPath, urlFor } from "../../platform/routing/index.js";
import { isScheduledAt, isLiveAt, postDisplayDateIso } from "../../contracts/core/scheduled-publish.js";
import { resolveRuntimeMode } from "../../contracts/core/runtime-mode.js";
import { processOutbox } from "../../contracts/core/events/index.js";
import { getSeoSettings, isDefaultRobotsNoindexExplicitlySet } from "./settings.js";

export {
  ensureSeoSettingDefinitions, getSeoSettings, setSeoSettings, isDefaultRobotsNoindexExplicitlySet,
  type EnsureSeoSettingDefinitionsDeps, type EnsureSeoSettingDefinitionsInput,
  type GetSeoSettingsDeps, type SeoSettingsWriteDeps, type SeoSettingsPatch, type SetSeoSettingsInput,
} from "./settings.js";

/** Bind the host row owner without projecting away content fields needed by CAS/revisions.
 * @example createSeoPostPort({ postRepo }, {})
 * @complexity O(1) wiring; reads/writes retain the host repository's costs and errors.
 */
export function createSeoPostPort({ postRepo }: { postRepo: PostRepoPort }, _optional: Record<string, never> = {}): SeoPostListPort & SeoPostWritePort {
  return {
    // Call through the receiver so prototype methods keep `this` and fault-injection remains live.
    findById: (input) => postRepo.findById(input),
    list: (input) => postRepo.list(input),
    extractPlainText: ({ html }) => extractPlainTextFromHtml(html),
    isTrashed: ({ post }) => isTrashed(post),
    transaction: ({ fn }) => postRepo.transaction(fn),
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
export function createSeoFeaturedImagePort({ deps }: { deps: FeaturedImageDeps }, _optional: Record<string, never> = {}): SeoFeaturedImagePort {
  return {
    findMediaByIdOrSlug: (input) => findMediaByIdOrSlug({ deps, input }),
    mediaUrlKey: ({ asset }) => mediaUrlKey(asset),
    mediaPublicPath: ({ key, variant }) => mediaPublicPath(key, variant),
    resolveFeaturedImageRef: (input) => resolveFeaturedImageRef({ deps, input }),
  };
}

/** Host bindings shared by the head producer, evaluator, sitemap service, routes and tools. */
export interface SeoHostBindings extends SeoSitemapDeps {
  postRepo: SeoPostListPort & SeoPostWritePort;
  rootSlug: string;
  siteTitle: (required: { workspaceId: string }, optional?: Record<string, never>) => Promise<string | undefined>;
  dispatch: SitemapInvalidationDeps["dispatch"];
}

/** Build SEO ports once alongside the composed site's sitemap service.
 * @example createSeoDeps({ deps: routeOwners }, {})
 * @complexity O(1) wiring; effects/errors belong to the bound owners.
 */
export function createSeoDeps({ deps }: { deps: FeaturedImageDeps & {
  postRepo: PostRepoPort;
  settingsRepo: SettingsRepoPort;
  transformDefinitionRepo: TransformDefinitionRepoPort;
  originRegistry: OriginRegistryPort;
  clock: { nowIso(): string };
} }, _optional: Record<string, never> = {}): SeoHostBindings {
  return {
    originRegistry: deps.originRegistry,
    postRepo: createSeoPostPort({ postRepo: deps.postRepo }, {}),
    settings: {
      getSeoSettings: (input) => getSeoSettings({ settingsRepo: deps.settingsRepo }, input),
      isDefaultRobotsNoindexExplicitlySet: (input) => isDefaultRobotsNoindexExplicitlySet({ deps: { settingsRepo: deps.settingsRepo }, input }, {}),
    },
    urls: {
      postPublicPath: ({ slug }) => postPublicPath(slug),
      urlFor: ({ target, ctx }) => urlFor({ deps: { postRepo: deps.postRepo }, target, ctx }),
    },
    liveness: {
      isScheduledAt: ({ post, nowIso }) => isScheduledAt(post, nowIso),
      isLiveAt: ({ post, nowIso }) => isLiveAt(post, nowIso),
      postDisplayDateIso: ({ post }) => postDisplayDateIso(post),
    },
    clock: { nowIso: deps.clock.nowIso.bind(deps.clock) },
    media: {
      featuredImage: createSeoFeaturedImagePort({ deps }, {}),
      transformDefinitionRepo: { listByName: deps.transformDefinitionRepo.listByName.bind(deps.transformDefinitionRepo) },
    },
    // A sitemap has no visitor session: only the member owner's anonymous/public decision
    // applies. Members/paid/tiers and malformed/unknown visibility fail closed (ADR-030 §4).
    isPubliclyAccessible: ({ post }) => resolvePostMemberAccess(post.memberAccessJson).visibility === "public",
    runtimeMode: resolveRuntimeMode(),
    rootSlug: ROOT_SLUG,
    // Only an explicit workspace title counts for the root entry, not the default/display fallback.
    siteTitle: async ({ workspaceId }) => {
      const setting = await getEffective(
        { repo: deps.settingsRepo },
        { namespace: SITE_TITLE_NAMESPACE, key: SITE_TITLE_KEY, scopeContext: { workspaceId } },
      );
      return setting?.sourceLayer === "workspace" ? normalizeSiteTitle(setting.value) : undefined;
    },
    // The daemon outbox is enqueue-only; the existing host owner controls actual delivery.
    dispatch: (input) => processOutbox(input),
  };
}
