import { toolMetadata } from '../../contracts/core/tool-metadata/theme.js';
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, requireString, withSchemaOnRejection, type AgentToolDefinition, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import type { ToolContributor } from "#src/assistant/index";

import { isImportShapeRejection, withCallerSafeEgressRefusal, type MediaImportToolDeps } from "../media-import/tool-registrations.js";
import { THEME_WRITE_PERMISSION } from "./agent-tools.js";
import { importThemeFileFromUrl, THEME_IMPORT_MAX_BYTES } from "./theme-file-import.js";
import { assertThemeFileWritable, findThemeOrThrow, isShapeRejection, reloadThemeInPlace, type ThemeToolDeps } from "./tool-registrations.js";

/**
 * @file `theme_import_file_from_url` (2026-10-08) — the only agent tool that puts a NEW binary
 * (a font, an image) into a theme. Before it, theme tools were UTF-8 only and
 * `media_import_from_url` refused fonts, so a theme matching a reference site could only hotlink
 * the source's font files.
 *
 * Calls {@link importThemeFileFromUrl} (fetch, sniff, write) after the same gates
 * `theme_write_file` runs, imported from `tool-registrations.ts` rather than copied: `theme.edit`,
 * {@link findThemeOrThrow}, {@link assertThemeFileWritable} (generated / trash / compiled-sourceDir
 * refusals), then {@link reloadThemeInPlace} so the live site sees the file. Like
 * `theme_write_file`, the active theme is not refused. Egress refusals are narrowed to their
 * caller-safe form exactly as `media_import_from_url` does.
 *
 * Own file and own contributor domain (`"theme-import-file"`), like `duplicate-theme-tool.ts`: it
 * needs the guarded `mediaImportHttpClient` that `ThemeToolDeps` does not carry, and registering
 * under `"themes"` would replace that domain's tools instead of adding one.
 */

/** Theme registry plus the guarded client; the assistant deps bag satisfies it structurally. */
export type ImportThemeFileToolDeps = ThemeToolDeps &
  Pick<MediaImportToolDeps, "mediaImportHttpClient" | "outboundTestOrigins" | "mediaImportEgressRefusalLog">;

const IMPORT_THEME_FILE_CATALOG: AgentToolDefinition = {
  name: "theme_import_file_from_url",
  description:
    "Downloads a font (woff2, woff, ttf, otf) or image (png, jpg, gif, webp, avif, ico) from an https URL and saves it, byte for byte, " +
    "into a theme's folder at the given path, e.g. assets/fonts/display.woff2 — then reference it from the theme's CSS " +
    "(`@font-face { src: url(\"../assets/fonts/display.woff2\") }`) or markup. The file's type is read from its bytes and must match the " +
    `path's extension. Replaces a file already at that path. Max ${THEME_IMPORT_MAX_BYTES / 1_000_000} MB. ` +
    "SVG and other text files: use web_fetch_page + theme_write_file. To put an image in the media library instead, use media_import_from_url.",
  sideEffects: "mutates-durable-state",
  authorization: { permission: THEME_WRITE_PERMISSION },
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["themeId", "path", "url"],
    properties: {
      themeId: {
        type: "string",
        minLength: 1,
        description: "Id of the theme to write into, exactly as returned by theme_list.",
      },
      path: {
        type: "string",
        minLength: 1,
        description: "Where to save the file, relative to the theme folder, ending in the file type's extension (e.g. assets/fonts/display.woff2, assets/hero.jpg).",
      },
      url: {
        type: "string",
        minLength: 1,
        description: "The https URL of the font or image file itself (e.g. a src from the source site's @font-face rule), not a stylesheet or page.",
      },
    },
  },
};

/** This domain's full catalog — read by `tool-registrations.contracts.test.ts`'s `CATALOGS_BY_DOMAIN`. */
export const importThemeFileAgentToolCatalog: AgentToolDefinition[] = [IMPORT_THEME_FILE_CATALOG];

const CATALOG_BY_ID = indexCatalogById({ catalog: importThemeFileAgentToolCatalog });

/** One guarded outbound GET, then a new or replaced file in a theme folder and a theme reload. */
export const importThemeFileDerivedRisk: DerivedRiskByToolId = new Map([["theme_import_file_from_url", "mutates-durable-state"]]);

function buildImportThemeFileHandlers(routeDeps: ImportThemeFileToolDeps): Record<string, ToolHandler> {
  return {
    /**
     * @returns What was written (path, sniffed type, byte count, final source URL) and the reloaded
     * theme's `status`/`errors`.
     * @throws Decorated input error for theme/path/write-gate refusals, URL/byte refusals and egress
     * refusals (caller-safe text); permission failures and transport errors propagate.
     * @complexity One bounded GET plus redirects, an O(s) write, one theme reload.
     */
    theme_import_file_from_url: async (ctx) => {
      const input = requireInputRecord({ input: ctx.input });
      const themeId = requireString({ input, key: "themeId" });
      const relativePath = requireString({ input, key: "path" });
      const url = requireString({ input, key: "url" });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: THEME_WRITE_PERMISSION }, { entityType: "theme", entityId: themeId });

      const logEgressRefusal = routeDeps.mediaImportEgressRefusalLog ?? ((line: string) => console.warn(line));
      return withSchemaOnRejection({
        toolId: "theme_import_file_from_url",
        catalog: CATALOG_BY_ID,
        isShapeRejection: ({ error }) => isShapeRejection(error) || isImportShapeRejection({ error }),
        fn: () => withCallerSafeEgressRefusal(logEgressRefusal, async () => {
          const theme = findThemeOrThrow(routeDeps, themeId);
          assertThemeFileWritable(theme, relativePath);
          const imported = await importThemeFileFromUrl(
            { httpClient: routeDeps.mediaImportHttpClient, themeDir: theme.dir, themesRoot: routeDeps.themesDir, relativePath, url },
            { plainHttpTestOrigins: routeDeps.outboundTestOrigins },
          );
          const reloaded = reloadThemeInPlace(routeDeps, theme, themeId);
          return { themeId, ...imported, status: reloaded.status, errors: reloaded.errors };
        }, { toolId: "theme_import_file_from_url" }),
      });
    },
  };
}

export function buildImportThemeFileRegistrations(routeDeps: ImportThemeFileToolDeps): ToolRegistration[] {
  return buildDomainRegistrations({ metadata: toolMetadata,
    domain: "theme-import-file",
    catalogModule: "features/theme/import-theme-file-tool.ts",
    catalog: CATALOG_BY_ID,
    handlers: buildImportThemeFileHandlers(routeDeps),
    derivedRisk: importThemeFileDerivedRisk,
  });
}

/**
 * Contributes `theme_import_file_from_url` — called once by
 * `server/runtime/composition/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`.
 * Own domain key for the same reason `contributeDuplicateThemeTools()` has one (see this file's header).
 */
export function contributeImportThemeFileTools(): ToolContributor {
  return {
    domain: "theme-import-file",
    build: buildImportThemeFileRegistrations,
    risk: importThemeFileDerivedRisk,
  };
}
