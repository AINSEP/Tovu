import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, ToolInputError,
  type AgentToolDefinition, type DerivedRiskByToolId, type ToolRegistration } from "@jini-ai/core";
import { ValueValidationFailedError, type SettingsToolDeps } from "@jini-ai/core/settings";
import type { ToolContributor } from "@jini-ai/core";
import type { set } from "#src/features/settings/site-title-write";
import { resolveActiveThemeId } from "#src/features/presentation/index";
import { toolMetadata } from "../../contracts/core/tool-metadata/theme.js";
import { readPreviewSwitcher, parsePreviewSwitcher, PREVIEW_SWITCHER_NAMESPACE, PREVIEW_SWITCHER_KEY } from "./preview-switcher.js";
import type { SetActiveThemeToolDeps } from "./set-active-theme-tool.js";
import { syncThemeRoster } from "./theme-roster-sync.js";

export type PreviewSwitcherToolDeps = SetActiveThemeToolDeps & Pick<SettingsToolDeps, "settingsRepo" | "idGen" | "principalRepo"> & {
  set: typeof set; siteTitleReady?: Promise<void>;
};

export const previewSwitcherAgentToolCatalog: AgentToolDefinition[] = [
  { name: "theme_get_preview_switcher", description: "Read the live/static site's theme preview banner configuration and installed theme choices.",
    sideEffects: "none", authorization: { permission: "theme.read" }, inputSchema: { type: "object", additionalProperties: false, properties: {} } },
  { name: "theme_update_preview_switcher", description: "Configure the built-in theme preview banner for live and static sites. Uses installed theme ids as preview keys. Does not change the active theme. Enabled configurations must include it and contain 2..8 themes.",
    sideEffects: "mutates-durable-state", authorization: { permission: "theme.set" },
    inputSchema: { type: "object", additionalProperties: false, required: ["enabled", "themes", "position"], properties: {
      enabled: { type: "boolean" }, position: { type: "string", enum: ["top"] },
      themes: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, required: ["themeId", "label"],
        properties: { themeId: { type: "string" }, label: { type: "string", minLength: 1, maxLength: 80 } } } },
    } } },
];
const risk: DerivedRiskByToolId = new Map([
  ["theme_get_preview_switcher", "none"], ["theme_update_preview_switcher", "mutates-durable-state"],
]);

/** Extend the theme tool surface through its standard contributor and settings write chokepoint. */
export function buildPreviewSwitcherRegistrations({ deps }: { deps: PreviewSwitcherToolDeps }, _options = {}): ToolRegistration[] {
  const ready = async () => {
    await deps.siteTitleReady;
    if (deps.themesDir) syncThemeRoster({ themes: deps.themes, themesDir: deps.themesDir });
    return resolveActiveThemeId(deps);
  };
  return buildDomainRegistrations({ metadata: toolMetadata, domain: "theme-preview-switcher", catalogModule: "features/theme/preview-switcher-tools.ts",
    catalog: indexCatalogById({ catalog: previewSwitcherAgentToolCatalog }), derivedRisk: risk,
    handlers: {
      theme_get_preview_switcher: async ctx => {
        await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "theme.read" }, { entityType: "presentation" });
        return readPreviewSwitcher({ ...deps, activeThemeId: await ready() });
      },
      theme_update_preview_switcher: async ctx => {
        await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "theme.set" }, { entityType: "presentation" });
        await ready();
        try {
          const value = parsePreviewSwitcher({ value: requireInputRecord({ input: ctx.input }) });
          return await deps.set({ deps: { repo: deps.settingsRepo, clock: deps.clock, ids: deps.idGen, authorize: deps.authorize, principals: deps.principalRepo },
            input: { namespace: PREVIEW_SWITCHER_NAMESPACE, key: PREVIEW_SWITCHER_KEY, scope: "workspace", workspaceId: deps.workspaceId,
              callerPrincipalId: ctx.principal.id, value: { ...value, themes: value.themes.map(theme => ({ ...theme })) } } });
        } catch (error) {
          if (error instanceof ValueValidationFailedError) throw new ToolInputError({ message: error.message });
          throw error;
        }
      },
    } });
}

/** Separate contributor key preserves the theme file and activation tools. */
export function contributePreviewSwitcherTools(_required = {}, _options = {}): ToolContributor<PreviewSwitcherToolDeps, unknown> {
  return { domain: "theme-preview-switcher", build: deps => buildPreviewSwitcherRegistrations({ deps }), risk };
}
