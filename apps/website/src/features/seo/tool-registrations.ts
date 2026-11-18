import { toolMetadata } from '../../contracts/core/tool-metadata/seo.js';
/**
 * @file SEO's half of ADR-049 Decision 4: maps `agent-tools.ts`'s 6 catalog entries onto the
 * per-entry meta/analyze/override and site-wide settings/sitemap operations `server/routes/admin/
 * seo/*.ts` expose, as `ToolRegistration`s. The entire catalog is wired — see `agent-tools.ts`'s own
 * file header for why nothing in this domain is withheld.
 *
 * Authorization shape is genuinely mixed within this one domain, and each handler below states
 * which half it is:
 *  - `getEntryMeta`/`analyzeEntry`/`getSeoSettings`/`regenerateSitemapCache` carry no `authorize()`
 *    call of their own (their `Deps` types don't even accept an `authorize` function) — the admin
 *    routes gate inline (`get-entry.ts`/`get-entry-analyze.ts`/`get-settings.ts`/
 *    `post-sitemap-regenerate.ts`), so the 4 matching handlers below call the kit's
 *    `requireToolPermission` themselves, mirroring those routes' identical check.
 *  - `setEntrySeoOverrides` (`write-service.ts`) and `setSeoSettings` (`settings.ts`, via the
 *    settings write-service's own `set()`) ARE self-enforcing chokepoints — each calls
 *    `authorize()` internally. Per ADR-021 §2's single-evaluator rule, the 2 matching handlers below
 *    do NOT also call `requireToolPermission` — that would be a second evaluation of the same
 *    permission. Exception: `seo_set_settings` does gate first (2026-10-05), because
 *    `setSeoSettings`' `defaultOgImage` image check reads the media library ahead of its own
 *    `set()` authorization — see that handler. `put-entry.ts`/`put-settings.ts`'s own inline route-layer check is redundant
 *    belt-and-braces at the HTTP layer (their own comments say so); the tool path reaches the
 *    chokepoint directly instead, the same shape Forms/Identity/content-types' self-enforcing
 *    tools already use (contrast `features/workspace/tool-registrations.ts`'s `workspace_update`,
 *    which self-enforces nothing and is checked only at the handler).
 */
import { buildDomainRegistrations, indexCatalogById, withToolMetadata, requireInputRecord, requireNoInput, requireString, withSchemaOnRejection, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { requireExpectedVersion, versionConflictRule } from "@jini-ai/core/optimistic-concurrency";
import { withModelFacingErrors } from "@jini-ai/core/model-facing-tool-errors";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import { type AuthorizeFn, type EventBusPort, type OutboxPort } from "@jini-ai/core/contracts/events";
import type { ToolContributor } from "@jini-ai/core";
import type { PostRepoPort } from "../post/index.js";
import type { SettingsRepoPort } from "../settings/index.js";
import type { PrincipalRepoPort } from "@jini-ai/user-management";
import type { AssetRenditionRepoPort, MediaContentTypeStorePort, MediaRepoPort, TransformDefinitionRepoPort } from "../media/index.js";
import type { OriginRegistryPort } from "@jini-ai/core/contracts/server/verified-origin";
import { getSeoAgentToolCatalog } from "./agent-tools.js";
import {
  SeoFieldValidationError,
  SeoInvalidCanonicalUrlError,
  SeoSettingsValidationError,
} from "@jini-ai/cms/seo";
import { getEntryMeta, analyzeEntry, setEntrySeoOverrides, type createSitemapService, type GetEntryMetaDeps, type SeoExtFieldsPatch, type SeoSettings, type SetEntrySeoOverridesRequired, type SitemapInvalidationDeps } from "@jini-ai/cms/seo";
import { getSeoSettings, setSeoSettings } from "./settings.js";
import type { SeoHostBindings } from "./index.js";

const MANAGE_SEO_PERMISSION = "admin.seo.manage";

const CATALOG_BY_ID = indexCatalogById({ catalog: getSeoAgentToolCatalog() });

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
 * Builds `setEntrySeoOverrides`'s `patch` from `ctx.input` by dropping only `entryId` (the one key
 * that is NOT part of the patch itself). Deliberately NOT an allowlist of known `SeoExtFields`
 * keys: `setEntrySeoOverrides`'s own `validateSeoExtFieldsPatch` already rejects any key outside
 * its `REGISTERED_KEYS` array (`SeoFieldValidationError`, decorated with the published schema by
 * `withSchemaOnRejection` below) — silently DROPPING an unrecognized key here instead of letting
 * the chokepoint reject it would teach a model that a field it sent was applied when it silently
 * wasn't, the same failure mode `Jini packages/core/src/registration-kit.ts`'s `requireNoInput` doc comment warns
 * against for a no-input tool.
 *
 * A `null` value for any field passes through unchanged — that is this catalog's clear sentinel
 * (see `SeoExtFieldsPatch`'s doc comment in `types.ts`); the chokepoint interprets it, this mapping
 * layer does not need to.
 */
function seoOverridesPatchFromInput(input: Record<string, unknown>): SeoExtFieldsPatch {
  const patch: Record<string, unknown> = { ...input };
  delete patch.entryId;
  delete patch.expectedVersion;
  return patch as SeoExtFieldsPatch;
}

/**
 * Builds `setSeoSettings`'s `patch` from `ctx.input` verbatim. `setSeoSettings`'s own
 * `validateSeoSettingsPatch` rejects both an empty patch and any key outside `SeoSettings`' own
 * 7 fields, the same "unrecognized/empty input must be rejected, not silently accepted" reasoning
 * `seoOverridesPatchFromInput`'s chokepoint (`validateSeoExtFieldsPatch`) already applies — passed
 * through as-is here either way, for the "let the chokepoint be the one validator" reason.
 */
function seoSettingsPatchFromInput(input: Record<string, unknown>): Partial<SeoSettings> {
  return { ...input } as Partial<SeoSettings>;
}

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls. See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration.
 */
export const seoDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> getEntryMeta (seo.ts): read-only precedence resolution over postRepo/settingsRepo/media.
  ["seo_get_entry_meta", "none"],
  // -> analyzeEntry (seo.ts): read-only, itself calls getEntryMeta.
  ["seo_analyze_entry", "none"],
  // -> setEntrySeoOverrides (write-service.ts): postRepo.save (merge + version bump) + conditional
  //    sitemap-cache invalidation.
  ["seo_set_entry_overrides", "mutates-durable-state"],
  // -> getSeoSettings (settings.ts): read-only, resolves 8 site.seo.* ledger keys.
  ["seo_get_settings", "none"],
  // -> setSeoSettings (settings.ts): N settings-ledger set() writes, all-or-nothing.
  ["seo_set_settings", "mutates-durable-state"],
  // -> regenerateSitemapCache (sitemap.ts): recomputes and overwrites the in-process sitemap cache
  //    entry — no DB write, but a real effect the next public sitemap/robots read observes (see
  //    agent-tools.ts's file header for why this is classified 'mutates-durable-state' rather than
  //    'none').
  ["seo_regenerate_sitemap", "mutates-durable-state"],
]);

/** The settings operations the SEO tools call; the host binds them to its settings ledger. */
export interface SeoSettingsPort {
  get(input: { workspaceId: string }): Promise<SeoSettings>;
  set(input: { workspaceId: string; patch: Partial<SeoSettings>; callerPrincipalId: string }): Promise<SeoSettings>;
}

/**
 * The host bindings the SEO tools read, as the members they use: the entry-meta producer's ports,
 * the post repo that also takes the override write, and the outbox dispatcher.
 */
export interface SeoToolHostBindings extends GetEntryMetaDeps {
  postRepo: GetEntryMetaDeps["postRepo"] & SetEntrySeoOverridesRequired["deps"]["postRepo"];
  dispatch: SitemapInvalidationDeps["dispatch"];
}

/** Everything the SEO tool handlers read, as ports: the host supplies the settings operations. */
export interface SeoPackageToolDeps {
  readonly outbox: OutboxPort;
  readonly bus: EventBusPort;
  readonly authorize: AuthorizeFn;
  readonly workspaceId: string;
  readonly clock: { nowIso(): string };
  readonly idGen: { newId(): string };
  readonly seoReady: Promise<void>;
  readonly seoDeps: SeoToolHostBindings;
  readonly sitemapService: ReturnType<typeof createSitemapService>;
  readonly seoSettings: SeoSettingsPort;
}

/** What every handler factory reads: the package deps and the sitemap invalidation they share. */
interface SeoHandlerArgs {
  deps: SeoPackageToolDeps;
  requestInvalidation: (input: { workspaceId: string }) => Promise<void>;
}

const seoGetEntryMetaHandler = ({ deps }: SeoHandlerArgs): ToolHandler => async (ctx) => {
  const entryId = requireString({ input: requireInputRecord({ input: ctx.input }), key: "entryId" });
  await deps.seoReady;
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: MANAGE_SEO_PERMISSION }, { entityType: "seo-entry", entityId: entryId });

  const meta = await getEntryMeta({ deps: deps.seoDeps, input: { workspaceId: deps.workspaceId, entryId } }, {});
  return { meta };
};

const seoAnalyzeEntryHandler = ({ deps }: SeoHandlerArgs): ToolHandler => async (ctx) => {
  const entryId = requireString({ input: requireInputRecord({ input: ctx.input }), key: "entryId" });
  await deps.seoReady;
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: MANAGE_SEO_PERMISSION }, { entityType: "seo-entry", entityId: entryId });

  const analysis = await analyzeEntry({ deps: deps.seoDeps, input: { workspaceId: deps.workspaceId, entryId } }, {});
  return { analysis };
};

const seoSetEntryOverridesHandler = ({ deps, requestInvalidation }: SeoHandlerArgs): ToolHandler => async (ctx) => {
  const input = requireInputRecord({ input: ctx.input });
  const entryId = requireString({ input: input, key: "entryId" });
  const expectedVersion = requireExpectedVersion({ value: input.expectedVersion, readToolId: "content_read.seo_entry_meta" });
  await deps.seoReady;

  // Self-enforcing chokepoint (see file header) — no requireToolPermission call here.
  ctx.signal.throwIfAborted();
  const { overrides } = await withSchemaOnRejection({
      toolId: "seo_set_entry_overrides",
      catalog: CATALOG_BY_ID,
      isShapeRejection: ({ error }) => error instanceof SeoFieldValidationError || error instanceof SeoInvalidCanonicalUrlError,
      fn: () =>
      setEntrySeoOverrides({
        deps: { postRepo: deps.seoDeps.postRepo, authorize: deps.authorize, invalidateSitemapCache: requestInvalidation, clock: { nowMs: () => Date.parse(deps.clock.nowIso()) }, media: deps.seoDeps.media },
        input: {
          workspaceId: deps.workspaceId,
          entryId,
          patch: seoOverridesPatchFromInput(input),
          callerPrincipalId: ctx.principal.id,
        },
      }, { expectedVersion }) });
  return { overrides };
};

const seoGetSettingsHandler = ({ deps }: SeoHandlerArgs): ToolHandler => async (ctx) => {
  requireNoInput({ input: ctx.input });
  await deps.seoReady;
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: MANAGE_SEO_PERMISSION }, { entityType: "seo-settings" });

  const settings = await deps.seoSettings.get({ workspaceId: deps.workspaceId });
  return { settings };
};

const seoSetSettingsHandler = ({ deps, requestInvalidation }: SeoHandlerArgs): ToolHandler => async (ctx) => {
  const input = requireInputRecord({ input: ctx.input });
  await deps.seoReady;
  // The one exception to the single-evaluator rule in the file header (2026-10-05):
  // `setSeoSettings` checks `defaultOgImage` against the media library BEFORE its own per-write
  // `set()` authorizes, so without this gate a denied caller could learn whether an asset it
  // names is a non-image. Same order as `put-settings.ts`: authorize, then the chokepoint.
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: MANAGE_SEO_PERMISSION }, { entityType: "seo-settings" });

  ctx.signal.throwIfAborted();
  const settings = await withSchemaOnRejection({ toolId: "seo_set_settings", catalog: CATALOG_BY_ID, isShapeRejection: ({ error }) => error instanceof SeoSettingsValidationError, fn: () =>
      deps.seoSettings.set({ workspaceId: deps.workspaceId, patch: seoSettingsPatchFromInput(input), callerPrincipalId: ctx.principal.id }) });
  return { settings };
};

const seoRegenerateSitemapHandler = ({ deps, requestInvalidation }: SeoHandlerArgs): ToolHandler => async (ctx) => {
  requireNoInput({ input: ctx.input });
  await deps.seoReady;
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: MANAGE_SEO_PERMISSION }, { entityType: "seo-sitemap" });

  await deps.sitemapService.regenerateSitemapCache({ workspaceId: deps.workspaceId }, {});
  await requestInvalidation({ workspaceId: deps.workspaceId });
  return { accepted: true };
};

/**
 * The package-side builder: the id -> handler table over the SEO catalog. It takes no host metadata
 * (search vocabulary, approval policy); the host binding adds it.
 */
export function buildSeoToolRegistrations({ deps }: { deps: SeoPackageToolDeps }, _optional = {}): ToolRegistration[] {
  // Bind delivery to the existing outbox owner; the same service handles local invalidation.
  const invalidationDeps = {
    outbox: deps.outbox, bus: deps.bus, clock: deps.clock,
    idGen: deps.idGen, dispatch: deps.seoDeps.dispatch,
  };
  const requestInvalidation = (input: { workspaceId: string }) =>
    deps.sitemapService.requestSitemapInvalidation({ deps: invalidationDeps, input }, {});
  const args: SeoHandlerArgs = { deps, requestInvalidation };
  const handlers: Record<string, ToolHandler> = {
    seo_get_entry_meta: seoGetEntryMetaHandler(args),
    seo_analyze_entry: seoAnalyzeEntryHandler(args),
    seo_set_entry_overrides: seoSetEntryOverridesHandler(args),
    seo_get_settings: seoGetSettingsHandler(args),
    seo_set_settings: seoSetSettingsHandler(args),
    seo_regenerate_sitemap: seoRegenerateSitemapHandler(args),
  };

  return buildDomainRegistrations({
    domain: "seo",
    catalogModule: "seo/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers: withModelFacingErrors({ handlers, rules: [versionConflictRule({ readToolId: "content_read.seo_entry_meta" })] }),
    derivedRisk: seoDerivedRisk,
  });
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
  return withToolMetadata({ registrations: buildSeoToolRegistrations({ deps: toPackageDeps({ routeDeps }) }), metadata: toolMetadata });
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
