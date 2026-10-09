import { toolMetadata } from '../../contracts/core/tool-metadata/theme.js';
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import { buildDomainRegistrations, indexCatalogById, optionalString, requireInputRecord, requireString, withSchemaOnRejection, type AgentToolDefinition, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import type { ToolContributor } from "#src/assistant/index";

import { THEME_WRITE_PERMISSION } from "./agent-tools.js";
import { DuplicateThemeError, duplicateDiscoveredTheme } from "./duplicate-theme.js";
import { requestThemePreviewRefresh } from "./preview-refresh.js";
import { applyActiveTheme, type SetActiveThemeToolDeps } from "./set-active-theme-tool.js";

/**
 * @file `theme_duplicate` (owner-approved 2026-10-08) — the only agent tool that creates a theme.
 * Before it, `theme_write_file` could only edit a theme that already existed, so "make a new theme
 * from X" had no tool at all.
 *
 * Calls {@link duplicateDiscoveredTheme}, the same service the admin Themes screen's Duplicate action
 * calls (`server/inbound/admin-http/routes/themes/duplicate.ts`). Own file and own contributor domain
 * (`"theme-duplicate"`), like `set-active-theme-tool.ts`: `activate: true` needs the presentation
 * repo that `ThemeToolDeps` (`tool-registrations.ts`) deliberately does not carry, and re-registering
 * under the `"themes"` key would replace that domain's tools instead of adding one.
 *
 * Why this does not reopen `agent-tools.ts`'s "no `theme_create`" exclusion: that exclusion is about
 * renaming or removing a folder the live site may resolve its active theme from. A duplicate only
 * ever ADDS a fresh folder under an id nothing references yet; the source is read, never written, and
 * the live site is untouched unless the caller also passes `activate: true` — which is then checked
 * against `theme.set`, the same permission `theme_set_active` requires.
 */

/** The deps slice: the theme registry plus what activation needs. Satisfied structurally by the
 *  assistant deps bag, which already carries both `ThemeToolDeps` and `SetActiveThemeToolDeps`. */
export type DuplicateThemeToolDeps = SetActiveThemeToolDeps & { themesDir: string };

const DUPLICATE_THEME_CATALOG: AgentToolDefinition = {
  name: "theme_duplicate",
  description:
    "Creates a NEW theme by copying every file of an existing one (including a bundled stock theme) into a new theme folder, " +
    "then renames the copy's theme.json (new id and display name, version reset to 1.0.0, `lineage.from` records the source). " +
    "The source is never modified. Use this to start a new theme or a redesign: duplicate, then edit the COPY with " +
    "theme_write_file/theme_edit_file, and only switch the live site to it once the owner approves (theme_set_active, or activate: true here). " +
    "Refused if the source id is unknown, newId is malformed or already taken, or the source contains a symbolic link or exceeds the theme size limits.",
  sideEffects: "mutates-durable-state",
  authorization: { permission: THEME_WRITE_PERMISSION },
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["sourceThemeId", "newName"],
    properties: {
      sourceThemeId: {
        type: "string",
        minLength: 1,
        description: "Id of the theme to copy, exactly as returned by theme_list (e.g. the active theme's id).",
      },
      newName: {
        type: "string",
        minLength: 1,
        maxLength: 120,
        description: "Display name for the new theme, e.g. 'Roastery'.",
      },
      newId: {
        type: "string",
        minLength: 1,
        maxLength: 64,
        pattern: "^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$",
        description:
          "Optional folder id for the new theme (lowercase letters, digits, hyphens). Omit it to derive one from newName, suffixed -1, -2, … until free. A given id that is already taken is refused, not suffixed.",
      },
      activate: {
        type: "boolean",
        default: false,
        description: "Also make the copy the live site's active theme. Default false — leave it false until the owner has approved the new design.",
      },
    },
  },
};

/** This domain's full catalog — read by `tool-registrations.contracts.test.ts`'s `CATALOGS_BY_DOMAIN`. */
export const duplicateThemeAgentToolCatalog: AgentToolDefinition[] = [DUPLICATE_THEME_CATALOG];

const CATALOG_BY_ID = indexCatalogById({ catalog: duplicateThemeAgentToolCatalog });

/** Writes a new folder under the site's themes directory (and, with `activate`, the active-theme setting). */
export const duplicateThemeDerivedRisk: DerivedRiskByToolId = new Map([["theme_duplicate", "mutates-durable-state"]]);

function buildDuplicateThemeHandlers(routeDeps: DuplicateThemeToolDeps): Record<string, ToolHandler> {
  return {
    /**
     * @returns The new theme's id/name/tier, its load `status`/`errors`, how much was copied, and —
     * when `activate` was set — the previous active theme id, so the switch can be undone.
     * @throws Decorated input error for every {@link DuplicateThemeError}; permission failures propagate.
     * @complexity O(n + b) in the source's file count and bytes, plus one theme rediscovery.
     */
    theme_duplicate: async (ctx) => {
      const input = requireInputRecord({ input: ctx.input });
      const sourceThemeId = requireString({ input, key: "sourceThemeId" });
      const newName = requireString({ input, key: "newName" });
      const newId = optionalString({ input, key: "newId" });
      const activate = input.activate === true;
      const authorize = adaptLegacyAuthorize({ authorize: routeDeps.authorize });
      const principalId = ctx.principal.id;

      await requireToolPermission({ authorize, workspaceId: routeDeps.workspaceId, principalId, permission: THEME_WRITE_PERMISSION }, { entityType: "theme", entityId: sourceThemeId });
      // Checked BEFORE copying, so a caller who may not switch the live theme gets nothing half-done.
      if (activate) {
        await requireToolPermission({ authorize, workspaceId: routeDeps.workspaceId, principalId, permission: "theme.set" }, { entityType: "presentation" });
      }

      const { result, theme } = await withSchemaOnRejection({
        toolId: "theme_duplicate",
        catalog: CATALOG_BY_ID,
        isShapeRejection: ({ error }) => error instanceof DuplicateThemeError,
        fn: async () => duplicateDiscoveredTheme({ themes: routeDeps.themes, themesDir: routeDeps.themesDir, sourceThemeId, newName }, { newId }),
      });
      requestThemePreviewRefresh({ themesDir: routeDeps.themesDir });

      const activation = activate ? await applyActiveTheme({ routeDeps, themeId: result.id }) : undefined;
      return {
        themeId: result.id,
        name: result.name,
        tier: result.tier,
        sourceThemeId: result.sourceThemeId,
        files: result.files,
        bytes: result.bytes,
        status: theme?.status ?? "invalid",
        errors: theme?.errors ?? [`the copy was written but not discovered as '${result.id}'`],
        activated: activation !== undefined,
        ...(activation ? { previousThemeId: activation.previousThemeId } : {}),
      };
    },
  };
}

export function buildDuplicateThemeRegistrations(routeDeps: DuplicateThemeToolDeps): ToolRegistration[] {
  return buildDomainRegistrations({ metadata: toolMetadata,
    domain: "theme-duplicate",
    catalogModule: "features/theme/duplicate-theme-tool.ts",
    catalog: CATALOG_BY_ID,
    handlers: buildDuplicateThemeHandlers(routeDeps),
    derivedRisk: duplicateThemeDerivedRisk,
  });
}

/**
 * Contributes `theme_duplicate` — called once by
 * `server/runtime/composition/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`.
 * Own domain key for the same reason `contributeSetActiveThemeTools()` has one (see this file's header).
 */
export function contributeDuplicateThemeTools(): ToolContributor {
  return {
    domain: "theme-duplicate",
    build: buildDuplicateThemeRegistrations,
    risk: duplicateThemeDerivedRisk,
  };
}
