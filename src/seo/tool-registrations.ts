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
 *    permission. `put-entry.ts`/`put-settings.ts`'s own inline route-layer check is redundant
 *    belt-and-braces at the HTTP layer (their own comments say so); the tool path reaches the
 *    chokepoint directly instead, the same shape Forms/Identity/content-types' self-enforcing
 *    tools already use (contrast `features/workspace/tool-registrations.ts`'s `workspace_update`,
 *    which self-enforces nothing and is checked only at the handler).
 */
import type { AuthorizeFn } from "../core/commands/command";
import type { PostRepoPort } from "../features/post";
import type { SettingsRepoPort } from "../features/settings";
import type { PrincipalRepoPort } from "../identity";
import type { AssetRenditionRepoPort, MediaRepoPort, TransformDefinitionRepoPort } from "../media";
import {
  buildDomainRegistrations,
  indexCatalogById,
  requireInputRecord,
  requireNoInput,
  requireString,
  requireToolPermission,
  withSchemaOnRejection,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "../core/tools/registration-kit";
import { getSeoAgentToolCatalog } from "./agent-tools";
import { SeoFieldValidationError, SeoInvalidCanonicalUrlError, SeoSettingsValidationError } from "./errors";
import { getEntryMeta, analyzeEntry } from "./seo";
import { getSeoSettings, setSeoSettings } from "./settings";
import { regenerateSitemapCache, invalidateSitemapCache } from "./sitemap";
import type { SeoExtFields, SeoSettings } from "./types";
import { setEntrySeoOverrides } from "./write-service";

const CATALOG_BY_ID = indexCatalogById(getSeoAgentToolCatalog());

/**
 * The exact slice of the route-deps bag SEO's tool handlers read. Declared structurally (rather
 * than importing `server/routes/types`'s `RouteDeps`) so this module carries no back-edge into the
 * composition root. `server/routes/*` satisfies this structurally by passing its existing
 * `RouteDeps` object; nothing there changes.
 *
 * Also satisfies `./media.ts`'s `ResolveSeoImageRefDeps` structurally (via the three media fields
 * below) — every handler that calls `getEntryMeta`/`analyzeEntry`/`regenerateSitemapCache` passes
 * this same object as their `media` dependency, exactly as `RouteDeps` does today.
 */
export interface SeoToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  clock: { nowIso(): string };
  idGen: { newId(): string };
  seoReady: Promise<void>;
  postRepo: PostRepoPort;
  settingsRepo: SettingsRepoPort;
  principalRepo: PrincipalRepoPort;
  mediaRepo: MediaRepoPort;
  assetRenditionRepo: AssetRenditionRepoPort;
  transformDefinitionRepo: TransformDefinitionRepoPort;
}

/**
 * Builds `setEntrySeoOverrides`'s `patch` from `ctx.input` by dropping only `entryId` (the one key
 * that is NOT part of the patch itself). Deliberately NOT an allowlist of known `SeoExtFields`
 * keys: `setEntrySeoOverrides`'s own `validateSeoExtFieldsPatch` already rejects any key outside
 * its `REGISTERED_KEYS` set (`SeoFieldValidationError`, decorated with the published schema by
 * `withSchemaOnRejection` below) — silently DROPPING an unrecognized key here instead of letting
 * the chokepoint reject it would teach a model that a field it sent was applied when it silently
 * wasn't, the same failure mode `tool-registration-kit.ts`'s `requireNoInput` doc comment warns
 * against for a no-input tool.
 */
function seoOverridesPatchFromInput(input: Record<string, unknown>): Partial<SeoExtFields> {
  const patch: Record<string, unknown> = { ...input };
  delete patch.entryId;
  return patch as Partial<SeoExtFields>;
}

/**
 * Builds `setSeoSettings`'s `patch` from `ctx.input` verbatim. Unlike the overrides patch above,
 * `setSeoSettings`'s own `validateSeoSettingsPatch` does not reject an unrecognized key (it only
 * inspects the 7 fields it knows about and ignores the rest) — so, unlike
 * `seoOverridesPatchFromInput`, there is no rejection to preserve either way; passed through as-is
 * for the same "let the chokepoint be the one validator" reason.
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

export function buildSeoRegistrations(routeDeps: SeoToolDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    seo_get_entry_meta: async (ctx) => {
      const entryId = requireString(requireInputRecord(ctx.input), "entryId");
      await routeDeps.seoReady;
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: "admin.seo.manage",
        entityType: "seo-entry",
        entityId: entryId,
      });

      const meta = await getEntryMeta(
        { postRepo: routeDeps.postRepo, settingsRepo: routeDeps.settingsRepo, media: routeDeps },
        { workspaceId: routeDeps.workspaceId, entryId },
      );
      return { meta };
    },

    seo_analyze_entry: async (ctx) => {
      const entryId = requireString(requireInputRecord(ctx.input), "entryId");
      await routeDeps.seoReady;
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: "admin.seo.manage",
        entityType: "seo-entry",
        entityId: entryId,
      });

      const analysis = await analyzeEntry(
        { postRepo: routeDeps.postRepo, settingsRepo: routeDeps.settingsRepo, media: routeDeps },
        { workspaceId: routeDeps.workspaceId, entryId },
      );
      return { analysis };
    },

    seo_set_entry_overrides: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const entryId = requireString(input, "entryId");
      await routeDeps.seoReady;

      // Self-enforcing chokepoint (see file header) — no requireToolPermission call here.
      const { overrides } = await withSchemaOnRejection(
        {
          toolId: "seo_set_entry_overrides",
          catalog: CATALOG_BY_ID,
          isShapeRejection: (error) => error instanceof SeoFieldValidationError || error instanceof SeoInvalidCanonicalUrlError,
        },
        () =>
          setEntrySeoOverrides({
            deps: { postRepo: routeDeps.postRepo, authorize: routeDeps.authorize, invalidateSitemapCache },
            input: {
              workspaceId: routeDeps.workspaceId,
              entryId,
              patch: seoOverridesPatchFromInput(input),
              callerPrincipalId: ctx.principal.id,
            },
          }),
      );
      return { overrides };
    },

    seo_get_settings: async (ctx) => {
      requireNoInput(ctx.input);
      await routeDeps.seoReady;
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "admin.seo.manage", entityType: "seo-settings" });

      const settings = await getSeoSettings({ settingsRepo: routeDeps.settingsRepo }, { workspaceId: routeDeps.workspaceId });
      return { settings };
    },

    seo_set_settings: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      await routeDeps.seoReady;

      // Self-enforcing chokepoint (see file header) — no requireToolPermission call here.
      const settings = await withSchemaOnRejection(
        { toolId: "seo_set_settings", catalog: CATALOG_BY_ID, isShapeRejection: (error) => error instanceof SeoSettingsValidationError },
        () =>
          setSeoSettings(
            {
              settingsRepo: routeDeps.settingsRepo,
              clock: routeDeps.clock,
              ids: routeDeps.idGen,
              authorize: routeDeps.authorize,
              principals: routeDeps.principalRepo,
            },
            { workspaceId: routeDeps.workspaceId, patch: seoSettingsPatchFromInput(input), callerPrincipalId: ctx.principal.id },
          ),
      );
      return { settings };
    },

    seo_regenerate_sitemap: async (ctx) => {
      requireNoInput(ctx.input);
      await routeDeps.seoReady;
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "admin.seo.manage", entityType: "seo-sitemap" });

      await regenerateSitemapCache(
        { postRepo: routeDeps.postRepo, settingsRepo: routeDeps.settingsRepo, media: routeDeps },
        { workspaceId: routeDeps.workspaceId },
      );
      return { accepted: true };
    },
  };

  return buildDomainRegistrations({
    domain: "seo",
    catalogModule: "seo/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: seoDerivedRisk,
  });
}
