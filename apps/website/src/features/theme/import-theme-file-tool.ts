import { toolMetadata } from '../../contracts/core/tool-metadata/theme.js';
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, requireString, withSchemaOnRejection, type AgentToolDefinition, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import type { ToolContributor } from "#src/assistant/index";

import { isImportShapeRejection, resolveLocalImportRequest, withCallerSafeEgressRefusal, type MediaImportToolDeps } from "../media-import/tool-registrations.js";
import { FsFilePathError } from "../fs-files/fs-files.js";
import { FS_ROOT_IDS } from "../fs-files/layout.js";
import { THEME_WRITE_PERMISSION } from "./agent-tools.js";
import { importThemeFileFromLocalFile, importThemeFileFromUrl, THEME_IMPORT_MAX_BYTES } from "./theme-file-import.js";
import { assertThemeFileWritable, findThemeOrThrow, isShapeRejection, reloadThemeInPlace, type ThemeToolDeps } from "./tool-registrations.js";

/**
 * @file `theme_import_file_from_url` (2026-10-08) and `theme_import_local_file` share the binary
 * import path (a font, an image) into a theme. Before URL import, theme tools were UTF-8 only and
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
  Pick<MediaImportToolDeps, "mediaImportHttpClient" | "outboundTestOrigins" | "mediaImportEgressRefusalLog" | "siteBinding" | "resolveRoots">;

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
export const importThemeFileAgentToolCatalog: AgentToolDefinition[] = [IMPORT_THEME_FILE_CATALOG, {
  name: "theme_import_local_file",
  description: "Copy a local font (woff2, woff, ttf, otf) or image (png, jpg, gif, webp, avif, ico) into a theme. " +
    "Find it with fs_list_files; pass root and sourcePath relative to that root, plus themeId and destination path. " +
    "Uses the same owner-selected roots and denied-file rules as fs_read_file. The tool cannot choose or widen a root. " +
    "Requires theme.edit; refuses generated/trash/compiled output, unsafe paths, unsupported or mismatched bytes. " +
    "Replaces the destination atomically and reloads the theme. Max 10 MB. " +
    "Returns {themeId,path,contentType,bytes,sourcePath,status,errors}. For editable content images use media_import_local_file. " +
    "SVG/text: fs_read_file then theme_write_file. For an https source use theme_import_file_from_url.",
  sideEffects: "mutates-durable-state",
  authorization: { permission: THEME_WRITE_PERMISSION },
  inputSchema: {
    type: "object", additionalProperties: false, required: ["themeId", "path", "root", "sourcePath"],
    properties: {
      themeId: { type: "string", minLength: 1, description: "Target theme id from theme_list." },
      path: { type: "string", minLength: 1, description: "Destination relative to the theme folder, e.g. assets/fonts/display.woff2." },
      root: { type: "string", enum: FS_ROOT_IDS, description: "Existing fs-files root: repo, site, or the owner's configured custom folder." },
      sourcePath: { type: "string", minLength: 1, description: "Source file relative to root, as found with fs_list_files. Secrets and escapes are refused. If custom is unset, ask the owner to choose the folder in the chat composer." },
    },
  },
}];

const CATALOG_BY_ID = indexCatalogById({ catalog: importThemeFileAgentToolCatalog });

/** One guarded source read, then a new or replaced theme file and a theme reload. */
export const importThemeFileDerivedRisk: DerivedRiskByToolId = new Map([["theme_import_file_from_url", "mutates-durable-state"], ["theme_import_local_file", "mutates-durable-state"]]);

/** Preserve the theme import contract while the shared reader keeps the site as its I/O root. */
function localThemeSource({ routeDeps, input }: { routeDeps: ImportThemeFileToolDeps; input: Record<string, unknown> }, _optional = {}) {
  const request = resolveLocalImportRequest({ routeDeps, root: requireString({ input, key: "root" }),
    relativePath: requireString({ input, key: "sourcePath" }) }, {});
  return { rootPath: request.rootPath, sourcePath: request.relativePath };
}

/**
 * Builds either source adapter over one permission/write-gate/import/reload lifecycle.
 * @returns A handler reporting asset metadata and reloaded theme status/errors.
 * @throws Decorated input errors for source/destination refusals; permission and I/O errors propagate.
 * @complexity One bounded source read, O(s) persistence, one theme reload.
 */
function buildImportThemeFileHandler(
  { routeDeps, toolId }: { routeDeps: ImportThemeFileToolDeps; toolId: "theme_import_file_from_url" | "theme_import_local_file" },
  _optional: Record<string, never> = {},
): ToolHandler {
  return async (ctx) => {
    const input = requireInputRecord({ input: ctx.input });
    const themeId = requireString({ input, key: "themeId" });
    const relativePath = requireString({ input, key: "path" });
    await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: THEME_WRITE_PERMISSION }, { entityType: "theme", entityId: themeId });

    const logEgressRefusal = routeDeps.mediaImportEgressRefusalLog ?? ((line: string) => console.warn(line));
    return withSchemaOnRejection({
      toolId,
      catalog: CATALOG_BY_ID,
      isShapeRejection: ({ error }) => isShapeRejection(error) || isImportShapeRejection({ error }) || error instanceof FsFilePathError,
      fn: () => withCallerSafeEgressRefusal(logEgressRefusal, async () => {
        const theme = findThemeOrThrow(routeDeps, themeId);
        assertThemeFileWritable(theme, relativePath);
        const destination = { themeDir: theme.dir, themesRoot: routeDeps.themesDir, relativePath };
        const imported = toolId === "theme_import_local_file"
          ? await importThemeFileFromLocalFile({
              ...destination,
              ...localThemeSource({ routeDeps, input }, {}),
            })
          : await importThemeFileFromUrl(
              { ...destination, httpClient: routeDeps.mediaImportHttpClient, url: requireString({ input, key: "url" }) },
              { plainHttpTestOrigins: routeDeps.outboundTestOrigins },
            );
        const reloaded = reloadThemeInPlace(routeDeps, theme, themeId);
        return { themeId, ...imported,
          ...(toolId === "theme_import_local_file" ? { sourcePath: requireString({ input, key: "sourcePath" }) } : {}),
          status: reloaded.status, errors: reloaded.errors };
      }, { toolId }),
    });
  };
}

export function buildImportThemeFileRegistrations(routeDeps: ImportThemeFileToolDeps): ToolRegistration[] {
  return buildDomainRegistrations({ metadata: toolMetadata,
    domain: "theme-import-file",
    catalogModule: "features/theme/import-theme-file-tool.ts",
    catalog: CATALOG_BY_ID,
    handlers: {
      theme_import_file_from_url: buildImportThemeFileHandler({ routeDeps, toolId: "theme_import_file_from_url" }),
      theme_import_local_file: buildImportThemeFileHandler({ routeDeps, toolId: "theme_import_local_file" }),
    },
    derivedRisk: importThemeFileDerivedRisk,
  });
}

/**
 * Contributes both theme binary import tools — called once by
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
