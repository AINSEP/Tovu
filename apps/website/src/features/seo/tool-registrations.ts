import { toolMetadata } from '../../contracts/core/tool-metadata/seo.js';
/**
 * @file SEO's half of ADR-049 Decision 4, the host binding: the catalog, the six handlers, the
 * authored risk map and the typed-error mapping live in `@jini-ai/cms/seo`
 * (`buildSeoToolRegistrations`). This file supplies what is Tovu's: the settings ledger read and
 * write, the search vocabulary and approval policy (`toolMetadata`), and the route deps the
 * handlers read.
 */
import { withToolMetadata, type ToolContributor, type ToolRegistration } from "@jini-ai/core";
import { type AuthorizeFn } from "@jini-ai/core/contracts/events";
import type { OriginRegistryPort } from "@jini-ai/core/contracts/server/verified-origin";
import { contentReadVocabulary } from "../../contracts/core/tool-metadata/content-read.js";
import { buildSeoToolRegistrations, seoDerivedRisk, type createSitemapService, type SeoPackageToolDeps } from "@jini-ai/cms/seo";
import type { PrincipalRepoPort } from "@jini-ai/core/contracts/site/user-management";
import type { AssetRenditionRepoPort, MediaRepoPort, TransformDefinitionRepoPort } from "../media/index.js";
import type { MediaContentTypeStorePort } from "@jini-ai/cms/media/site/content-type-store";
import type { PostRepoPort } from "../post/index.js";
import type { SettingsRepoPort } from "../settings/index.js";
import type { SeoHostBindings } from "./index.js";
import { getSeoSettings, setSeoSettings } from "./settings.js";

/**
 * The exact slice of the route-deps bag SEO's tool handlers read. Declared structurally (rather
 * than importing `server/routes/types`'s `RouteDeps`) so this module carries no back-edge into the
 * composition root. `server/routes/*` satisfies this structurally by passing its existing
 * `RouteDeps` object; nothing there changes.
 *
 * `seoDeps` binds Jini/packages/cms/src/seo/media.ts's narrow media port to the same host repos
 * that routes use. `sitemapService` is shared with those routes and their bus subscriptions so
 * a tool invalidates the serving app's workspace cache, not a disconnected second cache.
 */
export interface SeoToolDeps {
  outbox: import("@jini-ai/core/contracts/events").OutboxPort;
  bus: import("@jini-ai/core/contracts/events").EventBusPort;
  authorize: AuthorizeFn;
  workspaceId: string;
  clock: { nowIso(): string };
  idGen: { newId(): string };
  seoReady: Promise<void>;
  seoDeps: SeoHostBindings;
  sitemapService: ReturnType<typeof createSitemapService>;
  postRepo: PostRepoPort;
  settingsRepo: SettingsRepoPort;
  principalRepo: PrincipalRepoPort;
  mediaRepo: MediaRepoPort;
  /** The share-image writes' content-type check (`seoImageRefRefusal`, 2026-10-05). */
  mediaContentTypeStore: Pick<MediaContentTypeStorePort, "getMany">;
  assetRenditionRepo: AssetRenditionRepoPort;
  transformDefinitionRepo: TransformDefinitionRepoPort;
  originRegistry: OriginRegistryPort;
}

/**
 * The route deps as the package-side ports. Every field reads the route deps at call time (a getter,
 * not a copy) because the route deps bag is mutable. The settings write closes over the same
 * sitemap invalidation the tool handlers build and the host's settings ledger.
 */
function toPackageDeps({ routeDeps }: { routeDeps: SeoToolDeps }, _optional = {}): SeoPackageToolDeps {
  const requestInvalidation = (input: { workspaceId: string }) =>
    routeDeps.sitemapService.requestSitemapInvalidation({
      deps: { outbox: routeDeps.outbox, bus: routeDeps.bus, clock: routeDeps.clock, idGen: routeDeps.idGen, dispatch: routeDeps.seoDeps.dispatch },
      input,
    }, {});
  return {
    get outbox() { return routeDeps.outbox; },
    get bus() { return routeDeps.bus; },
    get authorize() { return routeDeps.authorize; },
    get workspaceId() { return routeDeps.workspaceId; },
    get clock() { return routeDeps.clock; },
    get idGen() { return routeDeps.idGen; },
    get seoReady() { return routeDeps.seoReady; },
    get seoDeps() { return routeDeps.seoDeps; },
    get sitemapService() { return routeDeps.sitemapService; },
    seoSettings: {
      get: (input) => getSeoSettings({ settingsRepo: routeDeps.settingsRepo }, input),
      set: (input) => setSeoSettings(
        {
          settingsRepo: routeDeps.settingsRepo,
          clock: routeDeps.clock,
          ids: routeDeps.idGen,
          authorize: routeDeps.authorize,
          principals: routeDeps.principalRepo,
          invalidateSitemap: requestInvalidation,
          media: routeDeps.seoDeps.media,
        },
        input,
      ),
    },
  };
}

export function buildSeoRegistrations(routeDeps: SeoToolDeps): ToolRegistration[] {
  return withToolMetadata({ registrations: buildSeoToolRegistrations({ deps: toPackageDeps({ routeDeps }) }, { hostReads: contentReadVocabulary }), metadata: toolMetadata });
}

/**
 * Contributes SEO's AI tools to the assistant's catalog — called once by
 * `apps/website/src/server/runtime/composition/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildSeoRegistrations`/
 * `seoDerivedRisk` by name; this is the seam that replaced it (Stage 2 batch 2). Safe: the only
 * importer of `seo/tool-registrations` (relative or `#src/*` subpath) is
 * `assistant/tool-registrations.ts` itself, every other importer of `src/seo` at large is `server/*`
 * (never reachable from `assistant`), and this file's own cross-domain imports (`../features/post`,
 * `../features/settings`, `../media`, `@jini-ai/user-management`) are all `import type` only — erased
 * at compile time, so none creates a runtime edge back toward `assistant`.
 */
export function contributeSeoTools(): ToolContributor<SeoToolDeps, unknown> {
  return { domain: "seo", build: buildSeoRegistrations, risk: seoDerivedRisk };
}
