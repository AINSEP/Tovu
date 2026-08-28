/**
 * @file Themes' half of ADR-049 Decision 4: maps all 4 of `agent-tools.ts`'s catalog entries onto
 * real filesystem reads/writes inside one theme's own folder, as `ToolRegistration`s. The catalog is
 * wired in full — there is no `unwiredToolIds` set here, which means the kit treats ANY future
 * catalog entry added without a handler as a build failure. See `agent-tools.ts`'s own file header
 * for the operations deliberately never put in the catalog at all (delete-file, rename/create/delete
 * theme) and why.
 *
 * Authorization shape: nothing in `theme.ts`/`theme-files.ts` accepts an `authorize` dependency —
 * they are pure discovery/filesystem functions with no notion of a principal, exactly like
 * `redirects.ts`'s write chokepoint. The admin routes over this surface
 * (`server/routes/admin/presentation/patch-active-theme.ts`, `server/routes/admin/themes/list.ts`)
 * therefore call `authorize()` inline as their own first line, and every handler below does the same
 * via the kit's `requireToolPermission` — ADR-021 §2's single evaluator, located at the handler
 * rather than inside the domain function.
 *
 * Live-state coupling, stated explicitly because it is the one thing here that is not a pure
 * function: a successful `theme_write_file` re-runs `loadTheme()` and REPLACES that theme's entry in
 * `routeDeps.themes` — the same array `routes/site/pages.ts` resolves the active theme out of. That
 * is deliberate and is what makes this domain a usable edit loop rather than a write-and-wait-for-
 * restart one: an agent writes a template, the next page view renders it. It is also why the write
 * tool returns `status`/`errors` in its response — if the edit did not validate, the agent has to
 * learn that in the same turn, because the live site has already started serving the fallback body
 * for that theme.
 */
import {
  type AuthorizeFn,
  buildDomainRegistrations,
  indexCatalogById,
  optionalString,
  requireInputRecord,
  requireString,
  requireToolPermission,
  withSchemaOnRejection,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";
import type { ToolContributor } from "#src/assistant/index";
import {
  getThemesAgentToolCatalog,
  THEME_READ_PERMISSION,
  THEME_WRITE_PERMISSION,
} from "./agent-tools.js";
import {
  isGeneratedThemePath,
  listThemeFiles,
  readThemeFile,
  resolveThemeFileWriteScope,
  ThemePathError,
  writeThemeFile,
} from "./theme-files.js";
import { loadTheme, type DiscoveredTheme } from "./theme.js";

const CATALOG_BY_ID = indexCatalogById(getThemesAgentToolCatalog());

/**
 * The exact slice of the route-deps bag Themes' tool handlers read. Declared structurally (rather
 * than importing `server/routes/types`'s `RouteDeps`) so this module carries no back-edge into the
 * composition root — the same reason `core/tools/registration-kit.ts`'s `requireToolPermission`
 * takes a bare `{ authorize, workspaceId }` shape instead of the whole deps bag. `server/routes/*`
 * satisfies this structurally by passing its existing `RouteDeps` object; nothing there changes.
 */
export interface ThemeToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  /**
   * Boot-discovered themes (built-in + site `themes/` dir). Mutated in place by
   * `theme_write_file` — see that handler's own comment — so this is `DiscoveredTheme[]`, not a
   * readonly array, mirroring `RouteDeps.themes`'s identical mutable-array contract.
   */
  themes: DiscoveredTheme[];
  themesDir: string;
}

/** Raised when `themeId` names no discovered theme. Its own class so the handler layer can decorate
 * it with the published schema — a wrong id is a shape problem a different input fixes. */
class ThemeNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThemeNotFoundError";
  }
}

/** Raised when `theme_write_file` targets a BUILT theme's generated tree — ADR-020 §5's "editor-
 * read-only" half of the lifecycle split. A different `path` (inside `build.sourceDir`, or
 * `theme.json`) is exactly what would fix this, so it is a shape rejection like {@link ThemePathError}. */
class ThemeFileReadOnlyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThemeFileReadOnlyError";
  }
}

/** Errors a DIFFERENT input would fix, and therefore worth publishing the schema back with. A
 * genuine I/O failure (a permission-denied disk, a full volume) is not one of these and propagates
 * undecorated, because retrying with different arguments would not help. */
function isShapeRejection(error: unknown): boolean {
  return error instanceof ThemePathError || error instanceof ThemeNotFoundError || error instanceof ThemeFileReadOnlyError;
}

/**
 * Model-facing theme view. Drops `templates`/`liquidTemplates`/`handlebarsTemplates`/`css` (whole
 * file bodies — an agent asks for those one at a time through `theme_read_file`, and dumping every
 * template of every theme into a list response would swamp a context window for no gain) and `dir`
 * (an absolute host path; the agent addresses themes by id, and leaking the server's filesystem
 * layout into a model response serves nothing). Keeps `errors` in full: it is the entire feedback
 * signal this domain exists to deliver.
 *
 * `author`/`build` (ADR-020 §5, 2026-08-12) surface WHETHER a theme is a built release before the
 * agent ever tries to write into it — trimmed to `source`/`framework`/`sourceDir` (the fields that
 * actually decide what `theme_write_file` will accept, per `resolveThemeFileWriteScope`), dropping
 * `builderVersion`/`lockfileHash`/`artifactHashes` as support/integrity metadata an editing agent has
 * no use for. Without this an agent only learns a theme is built by having a write rejected mid-turn;
 * with it, `theme_list` turns that into something it can plan around up front. Absent for every theme
 * on disk today (authored, unchanged).
 */
function toThemeToolView(theme: DiscoveredTheme) {
  return {
    id: theme.manifest.id,
    name: theme.manifest.name,
    version: theme.manifest.version,
    tier: theme.manifest.tier,
    description: theme.manifest.description,
    ...(theme.manifest.author !== undefined ? { author: theme.manifest.author } : {}),
    ...(theme.manifest.build !== undefined
      ? {
          build: {
            source: theme.manifest.build.source,
            ...(theme.manifest.build.framework ? { framework: theme.manifest.build.framework } : {}),
            ...(theme.manifest.build.sourceDir ? { sourceDir: theme.manifest.build.sourceDir } : {}),
          },
        }
      : {}),
    source: theme.source,
    status: theme.status,
    errors: theme.errors,
  };
}

function findThemeOrThrow(routeDeps: ThemeToolDeps, themeId: string): DiscoveredTheme {
  const theme = routeDeps.themes.find((t) => t.manifest.id === themeId);
  if (!theme) {
    const known = routeDeps.themes.map((t) => t.manifest.id).join(", ") || "(none discovered)";
    throw new ThemeNotFoundError(`theme '${themeId}' was not found — discovered themes are: ${known}`);
  }
  return theme;
}

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually does.
 * See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own `sideEffects`
 * declaration.
 */
export const themesDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> routeDeps.themes.map(): reads already-discovered in-memory state, no I/O at all.
  ["theme_list", "none"],
  // -> listThemeFiles(): readdir under one theme folder, no writes.
  ["theme_list_files", "none"],
  // -> readThemeFile(): one readFileSync under one theme folder, no writes.
  ["theme_read_file", "none"],
  // -> writeThemeFile(): mkdir + writeFileSync on disk, then loadTheme() + in-place replacement of
  //    the live routeDeps.themes entry. Durable on both counts.
  ["theme_write_file", "mutates-durable-state"],
]);

export function buildThemesRegistrations(routeDeps: ThemeToolDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    theme_list: async (ctx) => {
      const input = requireInputRecord(ctx.input ?? {});
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: THEME_READ_PERMISSION,
        entityType: "theme",
      });

      const tier = optionalString(input, "tier");
      const status = optionalString(input, "status");
      const themes = routeDeps.themes
        .filter((t) => (tier ? t.manifest.tier === tier : true))
        .filter((t) => (status ? t.status === status : true))
        .map(toThemeToolView);
      return { themes };
    },

    theme_list_files: async (ctx) => {
      const themeId = requireString(requireInputRecord(ctx.input), "themeId");
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: THEME_READ_PERMISSION,
        entityType: "theme",
        entityId: themeId,
      });

      return withSchemaOnRejection({ toolId: "theme_list_files", catalog: CATALOG_BY_ID, isShapeRejection }, async () => {
        const theme = findThemeOrThrow(routeDeps, themeId);
        return { themeId, files: listThemeFiles({ themeDir: theme.dir, themesRoot: routeDeps.themesDir }) };
      });
    },

    theme_read_file: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const themeId = requireString(input, "themeId");
      const relativePath = requireString(input, "path");
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: THEME_READ_PERMISSION,
        entityType: "theme",
        entityId: themeId,
      });

      return withSchemaOnRejection({ toolId: "theme_read_file", catalog: CATALOG_BY_ID, isShapeRejection }, async () => {
        const theme = findThemeOrThrow(routeDeps, themeId);
        const content = readThemeFile({ themeDir: theme.dir, themesRoot: routeDeps.themesDir, relativePath });
        return { themeId, path: relativePath, content };
      });
    },

    theme_write_file: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const themeId = requireString(input, "themeId");
      const relativePath = requireString(input, "path");
      const content = requireString(input, "content");
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: THEME_WRITE_PERMISSION,
        entityType: "theme",
        entityId: themeId,
      });

      return withSchemaOnRejection({ toolId: "theme_write_file", catalog: CATALOG_BY_ID, isShapeRejection }, async () => {
        const theme = findThemeOrThrow(routeDeps, themeId);

        // ADR-020 §5: a built theme's generated tree is read-only from every per-file surface,
        // this AI tool included — see `resolveThemeFileWriteScope`'s own doc for why. Checked BEFORE
        // any filesystem write, so a rejected write never touches disk.
        const writeScope = resolveThemeFileWriteScope({ manifest: theme.manifest, relativePath });
        if (writeScope.kind === "generated-readonly") {
          throw new ThemeFileReadOnlyError(`'${relativePath}' is read-only: ${writeScope.reason}`);
        }

        // Security parity fix (2026-08-18): `explore.ts`'s PUT route has always refused a write into
        // `preview/` (`isGeneratedThemePath` — `build-preview.mjs`'s own output, a DIFFERENT question
        // than the ADR-020 `writeScope` check above, see that function's own doc) but this tool never
        // called it, so an agent could write straight into `preview/` where the next preview build
        // silently overwrites the change. Matches the human-editor surface's refusal shape.
        if (isGeneratedThemePath(relativePath)) {
          throw new ThemeFileReadOnlyError(
            `'${relativePath}' is read-only: this file is generated output (build-preview.mjs's own preview tree); it is not real theme source and is silently overwritten on the next preview build — edit the file it derives from instead`
          );
        }

        writeThemeFile({ themeDir: theme.dir, themesRoot: routeDeps.themesDir, relativePath, content });

        // Re-validate through the SAME `loadTheme()` a boot-time discovery uses — the whole point of
        // this domain's safety argument is that an agent-authored file is validated identically to a
        // human-authored one, so re-running the real loader (rather than a bespoke "check what we
        // just wrote" path) is what makes that true rather than merely claimed.
        const reloaded = loadTheme({ themeDir: theme.dir, id: themeId, source: theme.source });
        const index = routeDeps.themes.findIndex((t) => t.manifest.id === themeId);
        if (index >= 0) routeDeps.themes[index] = reloaded;

        return {
          themeId,
          path: relativePath,
          bytesWritten: Buffer.byteLength(content, "utf8"),
          status: reloaded.status,
          errors: reloaded.errors,
          theme: toThemeToolView(reloaded),
        };
      });
    },
  };

  return buildDomainRegistrations({
    domain: "themes",
    catalogModule: "features/theme/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: themesDerivedRisk,
  });
}

/**
 * Contributes Themes' AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module.
 *
 * 2026-08-17: Themes was briefly converted to the tool-contribution registry (`contributeThemesTools`,
 * registered via `#src/assistant/index`'s `registerToolContributor`) alongside identity/members/
 * taxonomy/redirects in the same Stage 2 batch, then reverted the same night — `check:architecture`
 * showed it opened a NEW module cycle: `export/route-manifest.ts` imports `#src/features/theme/index`
 * (a `#src/*` subpath import, not a relative one — the reason a plain relative-path grep for this
 * domain's importers missed it beforehand), and `assistant` already reached `export` transitively
 * through its still-static `deployments`/`source-control` `DOMAIN_SLICES` entries. Adding
 * `themes -> assistant` closed a 6-module SCC: `assistant, export, features/deployments,
 * features/source-control, features/theme, features/vendor-credentials`.
 *
 * RETRIED 2026-08-17 (same day, later pass) after `source-control` converted cleanly — `deployments`
 * did NOT convert yet (reverted again on a different edge). Empirically wired `registerToolContributor`
 * here and ran `check:architecture --list`: `source-control` leaving `DOMAIN_SLICES` alone was NOT
 * enough — `deployments` staying static (plus the SAME previously-undocumented
 * `vendor-credentials/store.ts` `extractGitHubLogin` edge that blocked `deployments`/`static-publish`
 * themselves) still gave `assistant` a path into this cluster. Largest strongly-connected component
 * grew 0 -> 5 — `[assistant, export, features/deployments, features/theme,
 * features/vendor-credentials]`. Reverted cleanly instead.
 *
 * RETRIED AND LANDED HERE (2026-08-17, same session) after `deployments`/`static-publish` both
 * converted (see `features/deployments/tool-registrations.ts`'s own header for the
 * `vendor-credentials/store.ts` `extractGitHubLogin` fix that unblocked them). With `deployments`
 * off `DOMAIN_SLICES` too, `assistant` no longer reaches `export` transitively through any
 * still-static `DOMAIN_SLICES` entry — `check:architecture` confirms 0 module cycles / largest SCC
 * 0 with Themes wired this way. `export/route-manifest.ts`'s own `#src/features/theme/index` import
 * is untouched and still real; it simply no longer closes a cycle back to `assistant` now that
 * nothing reachable from `assistant` reaches `export`.
 */
export function contributeThemesTools(): ToolContributor {
  return { domain: "themes", build: buildThemesRegistrations, risk: themesDerivedRisk };
}
