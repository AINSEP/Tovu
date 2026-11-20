import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, ToolInputError,
  type AgentToolDefinition, type DerivedRiskByToolId, type ToolRegistration } from "@jini-ai/core";
import { ValueValidationFailedError, type SettingsToolDeps, type SetValueRequired, type SettingsValueWriteOptions } from "@jini-ai/core/settings";
import type { JsonValue } from "@jini-ai/core/primitives";
import { fromSettingsRevisionConflict, requireExpectedVersion, versionConflictRule } from "@jini-ai/core/optimistic-concurrency";
import { withModelFacingRegistrationErrors } from "@jini-ai/core/model-facing-tool-errors";
import type { ToolContributor } from "@jini-ai/core";
import { resolveActiveThemeId } from "#src/features/presentation/index";
import { toolMetadata } from "../../contracts/core/tool-metadata/theme.js";
import { readPreviewSwitcherWithRevision, parsePreviewSwitcher, PREVIEW_SWITCHER_NAMESPACE, PREVIEW_SWITCHER_KEY } from "./preview-switcher.js";
import type { SetActiveThemeToolDeps } from "./set-active-theme-tool.js";
import { syncThemeRoster } from "@jini-ai/cms/themes/preview/roster";
import { themeRosterPorts } from "./theme-roster-ports.js";

/** The host settings write this tool calls (`:57`), with the revision guard as its second argument. */
export type PreviewSwitcherSetSetting = (
  required: SetValueRequired,
  optional: Pick<SettingsValueWriteOptions, "expectedRevisionSeq">,
) => Promise<{ value: JsonValue; revisionSeq: number }>;

export type PreviewSwitcherToolDeps = SetActiveThemeToolDeps & Pick<SettingsToolDeps, "settingsRepo" | "idGen" | "principalRepo"> & {
  set: PreviewSwitcherSetSetting; siteTitleReady?: Promise<void>;
};

export const previewSwitcherAgentToolCatalog: AgentToolDefinition[] = [
  { name: "theme_get_preview_switcher", description: "Read the live/static site's theme preview banner configuration and installed theme choices.",
    sideEffects: "none", authorization: { permission: "theme.read" }, inputSchema: { type: "object", additionalProperties: false, properties: {} } },
  { name: "theme_update_preview_switcher", description: "Configure the built-in theme preview banner for live and static sites. Uses installed theme ids as preview keys. Does not change the active theme. Enabled configurations must include it and contain 2..8 themes. Pass expectedRevisionSeq from theme_get_preview_switcher; if someone changed it since, nothing is saved and you must re-read.",
    sideEffects: "mutates-durable-state", authorization: { permission: "theme.set" },
    inputSchema: { type: "object", additionalProperties: false, required: ["enabled", "themes", "position", "expectedRevisionSeq"], properties: {
      expectedRevisionSeq: { type: "integer", minimum: 0, description: "The revisionSeq from theme_get_preview_switcher. Required." },
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
    if (deps.themesDir) syncThemeRoster({ ...themeRosterPorts, themes: deps.themes, themesDir: deps.themesDir });
    return resolveActiveThemeId(deps);
  };
  return buildDomainRegistrations({ metadata: toolMetadata, domain: "theme-preview-switcher", catalogModule: "features/theme/preview-switcher-tools.ts",
    catalog: indexCatalogById({ catalog: previewSwitcherAgentToolCatalog }), derivedRisk: risk,
    handlers: {
      theme_get_preview_switcher: async ctx => {
        await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "theme.read" }, { entityType: "presentation" });
        return readPreviewSwitcherWithRevision({ ...deps, activeThemeId: await ready() });
      },
      theme_update_preview_switcher: async ctx => {
        await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "theme.set" }, { entityType: "presentation" });
        await ready();
        try {
          const input = requireInputRecord({ input: ctx.input });
          const expectedRevisionSeq = requireExpectedVersion({ value: input.expectedRevisionSeq, readToolId: "theme_get_preview_switcher" }, { field: "expectedRevisionSeq" });
          const { expectedRevisionSeq: _expectedRevisionSeq, ...config } = input;
          const value = parsePreviewSwitcher({ value: config });
          return await deps.set({ deps: { repo: deps.settingsRepo, clock: deps.clock, ids: deps.idGen, authorize: deps.authorize, principals: deps.principalRepo },
            input: { namespace: PREVIEW_SWITCHER_NAMESPACE, key: PREVIEW_SWITCHER_KEY, scope: "workspace", workspaceId: deps.workspaceId,
              callerPrincipalId: ctx.principal.id, value: { ...value, themes: value.themes.map(theme => ({ ...theme })) } } }, { expectedRevisionSeq });
        } catch (error) {
          if (error instanceof ValueValidationFailedError) throw new ToolInputError({ message: error.message });
          throw fromSettingsRevisionConflict({ error, setting: `${PREVIEW_SWITCHER_NAMESPACE}.${PREVIEW_SWITCHER_KEY}` });
        }
      },
    } });
}

/** Separate contributor key preserves the theme file and activation tools. */
export function contributePreviewSwitcherTools(_required = {}, _options = {}): ToolContributor<PreviewSwitcherToolDeps, unknown> {
  return { domain: "theme-preview-switcher", build: deps => withModelFacingRegistrationErrors({
    registrations: buildPreviewSwitcherRegistrations({ deps }), rules: [{ ...versionConflictRule({ readToolId: "theme_get_preview_switcher" }),
      guidance: "Your change was NOT applied and nothing was overwritten. Call theme_get_preview_switcher again, reapply the change, and use its revisionSeq as expectedRevisionSeq. Do not resend the stale call unchanged." }],
  }), risk };
}
