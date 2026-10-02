import { ToolInputError } from "@jini-ai/core";
import {
  buildDomainRegistrations,
  indexCatalogById,
  requireNoInput,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolRegistration,
} from "@jini-ai/cms/core";
import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import { ADMIN_LOCALES } from "../../contracts/core/admin-locales.js";
import type { ToolContributor } from "#src/assistant/index";

/** Host-local catalog shape, matching the existing native feature-tool catalogs. */
interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema: Readonly<Record<string, unknown>>;
}

/** n05's real gap: supported admin language codes were only discoverable by shell reads. */
export const uiLocalesAgentToolCatalog: AgentToolDefinition[] = [{
  name: "settings_list_ui_locales",
  description:
    "Lists the languages and exact locale codes offered by the admin interface language selector. " +
    "Call before switching your admin language to Spanish, Portuguese, Italian, Polish, German, or English, " +
    "or to check which UI languages are supported; Portuguese uses pt-BR, not pt. " +
    "Returns {locales:[{code,label}],setting:'core.language.locale',scope:'user',writeTool:'settings_set_ui_preference'}. " +
    "Then read settings_get_effective (namespace core.language) and use settings_set_ui_preference with " +
    "setting core.language.locale and value equal to a returned code. This list is read-only and takes no arguments; " +
    "access requires settings.read. Offered options do not guarantee complete translation coverage. " +
    "The preference changes only the calling operator's admin menus and labels; it does not translate public site content, " +
    "set a visitor-facing site language, or change the language of assistant replies.",
  sideEffects: "none",
  authorization: { permission: "settings.read" },
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
}];

export const uiLocalesDerivedRisk: DerivedRiskByToolId = new Map([
  // -> requireToolPermission + a copy of ADMIN_LOCALES; no setting or other durable state is written.
  ["settings_list_ui_locales", "none"],
]);

interface UiLocalesToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
}

/**
 * Builds a permission-gated, read-only language-option registration.
 * @param deps - The existing workspace authorization port; no repository access is needed.
 * @returns One registration returning selector options and existing preference-write coordinates.
 * @throws {ToolInputError} For supplied arguments; {ForbiddenError} when settings.read is denied.
 * @complexity O(n) time and space to copy n offered locale options, with one authorization call.
 * @example buildUiLocalesRegistrations({ authorize, workspaceId: "ws-main" })
 */
export function buildUiLocalesRegistrations(deps: UiLocalesToolDeps): ToolRegistration[] {
  return buildDomainRegistrations({
    domain: "settings-ui-locales",
    catalogModule: "features/settings/ui-locales-tool.ts",
    catalog: indexCatalogById(uiLocalesAgentToolCatalog),
    derivedRisk: uiLocalesDerivedRisk,
    handlers: {
      settings_list_ui_locales: async (ctx) => {
        // The shared no-input reader treats an empty array as a record; this schema accepts objects only.
        if (Array.isArray(ctx.input)) throw new ToolInputError("this tool accepts no input — omit 'input' or pass {}");
        requireNoInput(ctx.input);
        await requireToolPermission(deps, { principalId: ctx.principal.id, permission: "settings.read", entityType: "setting-value" });
        return {
          locales: ADMIN_LOCALES.map((locale) => ({ ...locale })),
          setting: "core.language.locale",
          scope: "user",
          writeTool: "settings_set_ui_preference",
        };
      },
    },
  });
}

/**
 * Supplies locale discovery under its own domain, preserving the package-owned settings tools.
 * @returns A contributor installed at both assistant composition roots.
 * @complexity O(1).
 * @example registerToolContributor(contributeUiLocalesTools())
 */
export function contributeUiLocalesTools(): ToolContributor {
  return { domain: "settings-ui-locales", build: buildUiLocalesRegistrations, risk: uiLocalesDerivedRisk };
}
