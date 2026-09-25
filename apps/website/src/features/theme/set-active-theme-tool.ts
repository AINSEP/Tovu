import { ToolInputError } from "@jini-ai/core";
import {
  buildDomainRegistrations,
  indexCatalogById,
  requireInputRecord,
  requireString,
  requireToolPermission,
  type AuthorizeFn,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
  type WirableToolDefinition,
} from "@jini-ai/cms/core";

import type { ToolContributor } from "#src/assistant/index";
import {
  resolveActiveThemeId,
  setActiveTheme,
  PresentationSettingsValidationError,
  type PresentationSettingsRepoPort,
} from "#src/features/presentation/index";

import { writableThemeIds } from "./active-theme.js";
import type { DiscoveredTheme } from "./theme.js";

/**
 * @file `theme_set_active` (F7a, 2026-09-24) — the agent-callable half of "which theme does the
 * live site use", wired directly onto Jini's `setActiveTheme`/`resolveActiveThemeId` the same way
 * `server/inbound/admin-http/routes/presentation/patch-active-theme.ts`'s human route already is.
 *
 * Deliberately its OWN file, not an entry in `features/theme/agent-tools.ts` /
 * `tool-registrations.ts` (that domain's file-level catalog): this tool shares no validator with
 * `theme_read_file`/`theme_write_file` and the rest — it never touches a theme's files at all, only
 * `presentation_settings.active_theme_id` — so folding it into that 1000+-line file would mix two
 * unrelated write surfaces for no shared code. See `agent-tools.ts`'s own header, "Nothing here
 * touches the ACTIVE theme selection", for the boundary this keeps.
 *
 * Reversible (switching back is calling this again with the id this call returns as
 * `previousThemeId`), so per the owner's standing rule it gets no confirm — same posture
 * `patch-active-theme.ts`'s own PATCH route already has.
 *
 * `writableThemeIds` (moved to `features/theme/active-theme.ts` this same slice) is the ONE
 * allowlist this tool and the admin PATCH route both validate against — see that function's own doc
 * for why a second, private copy would have been the real risk here.
 */

/** The narrow slice this tool needs off the full assistant deps bag. */
export interface SetActiveThemeToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  clock: { nowIso(): string };
  /** Boot-discovered themes — the same mutable array `ThemeToolDeps.themes` reads, only ever read
   *  here (never mutated) to compute {@link writableThemeIds}. */
  themes: DiscoveredTheme[];
  presentationRepo: PresentationSettingsRepoPort;
}

const SET_ACTIVE_THEME_CATALOG: WirableToolDefinition = {
  name: "theme_set_active",
  description:
    "Switches which theme the live site uses. Pass 'none' to turn the theme off. Returns the " +
    "previous theme id, so the switch can be undone by calling this again with it.",
  sideEffects: "mutates-durable-state",
  authorization: { permission: "theme.set" },
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["themeId"],
    properties: {
      themeId: {
        type: "string",
        minLength: 1,
        description: "A discovered theme's id to activate, or 'none' to turn the theme off.",
      },
    },
  },
};

const CATALOG_BY_ID = indexCatalogById([SET_ACTIVE_THEME_CATALOG]);

/** This wiring layer's own risk classification — `setActiveTheme` writes
 *  `presentation_settings.active_theme_id`, a real, disk-affecting durable-state mutation. */
export const setActiveThemeDerivedRisk: DerivedRiskByToolId = new Map([["theme_set_active", "mutates-durable-state"]]);

function buildSetActiveThemeHandlers(routeDeps: SetActiveThemeToolDeps): Record<string, ToolHandler> {
  return {
    theme_set_active: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const themeId = requireString(input, "themeId");

      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: "theme.set",
        entityType: "presentation",
      });

      const previousThemeId = await resolveActiveThemeId(routeDeps);

      try {
        const result = await setActiveTheme({
          deps: {
            repo: routeDeps.presentationRepo,
            clock: routeDeps.clock,
            availableThemeIds: writableThemeIds(routeDeps),
          },
          input: { workspaceId: routeDeps.workspaceId, activeThemeId: themeId },
        });
        return { previousThemeId, activeThemeId: result.settings.activeThemeId };
      } catch (err) {
        // Re-thrown as a `ToolInputError` (a DIFFERENT themeId would fix this) with the valid ids
        // appended to the SAME message `setActiveTheme` raised — see this file's own header.
        if (err instanceof PresentationSettingsValidationError) {
          throw new ToolInputError(`${err.message} (valid ids: ${writableThemeIds(routeDeps).join(", ")})`);
        }
        throw err;
      }
    },
  };
}

export function buildSetActiveThemeRegistrations(routeDeps: SetActiveThemeToolDeps): ToolRegistration[] {
  return buildDomainRegistrations({
    domain: "theme-set-active",
    catalogModule: "features/theme/set-active-theme-tool.ts",
    catalog: CATALOG_BY_ID,
    handlers: buildSetActiveThemeHandlers(routeDeps),
    derivedRisk: setActiveThemeDerivedRisk,
  });
}

/**
 * Contributes `theme_set_active` to the assistant's catalog — called once by
 * `server/runtime/composition/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`.
 * Domain key `"theme-set-active"`, deliberately distinct from `"theme"`
 * (`contributeThemesTools()`) — the tool-contribution registry replaces a domain's ENTIRE
 * contribution on re-registration by that key, so sharing the theme domain's own key here would
 * make one of the two contributors silently vanish rather than adding a fifth tool alongside it.
 */
export function contributeSetActiveThemeTools(): ToolContributor {
  return {
    domain: "theme-set-active",
    build: buildSetActiveThemeRegistrations,
    risk: setActiveThemeDerivedRisk,
  };
}
