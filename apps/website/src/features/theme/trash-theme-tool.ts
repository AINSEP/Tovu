import { toolMetadata } from '../../contracts/core/tool-metadata/theme.js';
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import type { RemoveEntity } from "@jini-ai/cms/trash";
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, requireString, ToolInputError, type AgentToolDefinition, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import type { ToolContributor } from "#src/assistant/index";
import { resolveActiveThemeId } from "#src/features/presentation/index";

import { THEME_WRITE_PERMISSION } from "./agent-tools.js";
import type { SetActiveThemeToolDeps } from "./set-active-theme-tool.js";
import { findTheme } from "./theme.js";

/**
 * @file `theme_trash` (owner-approved 2026-10-08) — moves a WHOLE theme to the Trash. Before it the
 * agent could only trash single files (`theme_trash_file`), so "delete this theme" had no tool.
 *
 * Reversible by construction: the folder is renamed into `<themes>-trash/` by the `theme` Trash
 * adapter (`theme-trash.ts`) and a Trash row is written in the same `TrashPort.trash` call, so
 * `trash_restore_item` (entityType `theme`) brings it back and only the Trash's own human-confirmed
 * purge (`trash_purge_item`/`trash_empty`) removes bytes. No confirmation card of its own — the same
 * posture every other reversible Trash move has.
 *
 * Why this reopens `agent-tools.ts`'s "no `theme_delete`" exclusion: that exclusion was about breaking
 * the LIVE site's active-theme resolution by removing the folder it resolves from. This tool refuses
 * the active theme outright, so that blast radius cannot happen; the hard-delete names
 * (`theme_delete`, `theme_delete_file`) stay unwired. It is also `trash_item`'s `theme` delegate
 * (`features/trash/trash-item-tool.ts`), so the generic delete door runs this same refusal.
 *
 * Own file and own contributor domain (`"theme-trash"`) for the reason `duplicate-theme-tool.ts`
 * gives: the active-theme check needs the presentation repo `ThemeToolDeps` does not carry.
 */

/** The deps slice: the live theme registry, the presentation repo for the active check, and the
 *  composition-bound Trash removal (`unhideIfRemoveThrows` over the `theme` adapter). */
export type TrashThemeToolDeps = SetActiveThemeToolDeps & {
  themesDir: string;
  removeTheme: RemoveEntity;
};

/** Stamped on `actor.pluginId`, like every assistant-initiated Trash write (see `trash-item-tool.ts`). */
const ASSISTANT_ACTOR_PLUGIN_ID = "assistant";

const TRASH_THEME_CATALOG: AgentToolDefinition = {
  name: "theme_trash",
  description:
    "Deletes a whole theme by moving its folder to the Trash, where it can be restored with trash_restore_item " +
    "(entityType 'theme'). Refused for the site's active theme: switch to another theme first with theme_set_active. " +
    "Use theme_trash_file to remove one file inside a theme instead. Permanent removal happens only from the Trash " +
    "(trash_purge_item / trash_empty) or automatically after the retention period.",
  sideEffects: "deletes-durable-state",
  authorization: { permission: THEME_WRITE_PERMISSION },
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["themeId"],
    properties: {
      themeId: {
        type: "string",
        minLength: 1,
        description: "Id of the theme to delete, exactly as returned by theme_list. Must not be the active theme.",
      },
    },
  },
};

/** This domain's full catalog — read by `tool-registrations.contracts.test.ts`'s `CATALOGS_BY_DOMAIN`. */
export const trashThemeAgentToolCatalog: AgentToolDefinition[] = [TRASH_THEME_CATALOG];

const CATALOG_BY_ID = indexCatalogById({ catalog: trashThemeAgentToolCatalog });

/** Moves a folder out of the site's themes directory and writes a Trash row. */
export const trashThemeDerivedRisk: DerivedRiskByToolId = new Map([["theme_trash", "deletes-durable-state"]]);

/** One non-ok removal outcome, worded for the model. @complexity O(1). */
function removalRefusal(themeId: string, outcome: { reason: string; code?: string }): ToolInputError {
  if (outcome.reason === "blocked" && outcome.code === "ALREADY_IN_TRASH") {
    return new ToolInputError({ message: `theme_trash: a theme with id '${themeId}' is already in the Trash. Restore or permanently delete that one first (trash_list_items). Nothing was changed.` });
  }
  return new ToolInputError({ message: `theme_trash: could not move '${themeId}' to the Trash (${outcome.code ?? outcome.reason}). Nothing was changed.` });
}

function buildTrashThemeHandlers(routeDeps: TrashThemeToolDeps): Record<string, ToolHandler> {
  return {
    /**
     * @returns `{ themeId, name, trashed: true }` once the folder and its Trash row both exist.
     * @throws {ToolInputError} Unknown id, the active theme, or a removal the Trash refused — nothing moved.
     * @complexity O(t) in the discovered theme count, plus one folder rename and one rediscovery.
     */
    theme_trash: async (ctx) => {
      const input = requireInputRecord({ input: ctx.input });
      const themeId = requireString({ input, key: "themeId" });
      const principalId = ctx.principal.id;
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId, permission: THEME_WRITE_PERMISSION }, { entityType: "theme", entityId: themeId });

      const theme = findTheme({ themes: routeDeps.themes, id: themeId });
      if (!theme) {
        const valid = routeDeps.themes.map((t) => t.manifest.id).sort().join(", ");
        throw new ToolInputError({ message: `theme_trash: no theme with id '${themeId}' (valid ids: ${valid}). Nothing was changed.` });
      }
      if ((await resolveActiveThemeId(routeDeps)) === themeId) {
        throw new ToolInputError({
          message:
            `theme_trash: '${themeId}' is the active theme, so it cannot be moved to the Trash. ` +
            `Switch the site to another theme first (theme_set_active), then trash '${themeId}'. Nothing was changed.`,
        });
      }

      const removed = await routeDeps.removeTheme({
        workspaceId: routeDeps.workspaceId,
        id: themeId,
        display: { title: theme.manifest.name, subtitle: themeId },
        at: routeDeps.clock.nowIso(),
        expectedVersion: null,
        actor: { principalId, pluginId: ASSISTANT_ACTOR_PLUGIN_ID },
      });
      if (!removed.ok) throw removalRefusal(themeId, removed);
      return { themeId, name: theme.manifest.name, trashed: true };
    },
  };
}

export function buildTrashThemeRegistrations(routeDeps: TrashThemeToolDeps): ToolRegistration[] {
  return buildDomainRegistrations({ metadata: toolMetadata,
    domain: "theme-trash",
    catalogModule: "features/theme/trash-theme-tool.ts",
    catalog: CATALOG_BY_ID,
    handlers: buildTrashThemeHandlers(routeDeps),
    derivedRisk: trashThemeDerivedRisk,
  });
}

/**
 * Contributes `theme_trash` — called once by
 * `server/runtime/composition/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`.
 */
export function contributeTrashThemeTools(): ToolContributor {
  return {
    domain: "theme-trash",
    build: buildTrashThemeRegistrations,
    risk: trashThemeDerivedRisk,
  };
}
