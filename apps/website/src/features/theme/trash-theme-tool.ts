import { toolMetadata } from '../../contracts/core/tool-metadata/theme.js';
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import type { RemoveEntity, TrashActor, TrashMarkerResult } from "@jini-ai/cms/trash";
import { nowIso } from "@jini-ai/core/primitives";
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, requireString, ToolInputError, type AgentToolDefinition, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import type { ToolContributor } from "#src/assistant/index";
import { resolveActiveThemeId } from "#src/features/presentation/index";
import type { TrashKindMover } from "#src/features/trash/index";

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

/** {@link trashTheme}'s outcome: the Trash removal's own result, or one of its two refusals. */
export type TrashThemeOutcome =
  | (Extract<TrashMarkerResult, { ok: true }> & { name: string })
  | Extract<TrashMarkerResult, { ok: false }>
  | { ok: false; reason: "unknown-theme" }
  | { ok: false; reason: "active-theme" };

/**
 * Move one whole theme to the Trash — `theme_trash`'s body after its permission check, shared with
 * the admin Trash route's `theme` mover ({@link createThemeTrashMover}) so both refuse the same
 * things. Performs no authorization; callers check `theme.edit` first.
 *
 * @returns The removal's result plus the theme's name, `unknown-theme`, or `active-theme` (nothing
 *   moved for either refusal).
 * @complexity O(t) in the discovered theme count, plus one folder rename and one rediscovery.
 */
export async function trashTheme(
  required: { routeDeps: TrashThemeToolDeps; themeId: string; actor: TrashActor },
  _optional: Record<string, never> = {}
): Promise<TrashThemeOutcome> {
  const { routeDeps, themeId, actor } = required;
  const theme = findTheme({ themes: routeDeps.themes, id: themeId });
  if (!theme) return { ok: false, reason: "unknown-theme" };
  if ((await resolveActiveThemeId(routeDeps)) === themeId) return { ok: false, reason: "active-theme" };

  const removed = await routeDeps.removeTheme({
    workspaceId: routeDeps.workspaceId,
    id: themeId,
    display: { title: theme.manifest.name, subtitle: themeId },
    at: nowIso({ clock: routeDeps.clock }),
    expectedVersion: null,
    actor,
  });
  return removed.ok ? { ...removed, name: theme.manifest.name } : removed;
}

/**
 * The admin Trash's door to themes: `POST /trash/items` with `type: "theme"` reaches
 * {@link trashTheme} through this, since a theme is a folder, not a `TRASHABLE` table row. The active
 * theme answers `blocked`/`THEME_ACTIVE`, an unknown id `not-found`.
 *
 * @complexity O(1) to build; each move is {@link trashTheme}'s.
 */
export function createThemeTrashMover(routeDeps: TrashThemeToolDeps): TrashKindMover {
  return {
    permission: THEME_WRITE_PERMISSION,
    async move({ entityId, actor }) {
      const outcome = await trashTheme({ routeDeps, themeId: entityId, actor });
      if (outcome.ok) return { ok: true, version: outcome.version };
      if (outcome.reason === "unknown-theme") return { ok: false, reason: "not-found" };
      if (outcome.reason === "active-theme") return { ok: false, reason: "blocked", code: "THEME_ACTIVE", count: 0 };
      return outcome;
    },
  };
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

      const outcome = await trashTheme({ routeDeps, themeId, actor: { principalId, pluginId: ASSISTANT_ACTOR_PLUGIN_ID } });
      if (outcome.ok) return { themeId, name: outcome.name, trashed: true };
      if (outcome.reason === "unknown-theme") {
        const valid = routeDeps.themes.map((t) => t.manifest.id).sort().join(", ");
        throw new ToolInputError({ message: `theme_trash: no theme with id '${themeId}' (valid ids: ${valid}). Nothing was changed.` });
      }
      if (outcome.reason === "active-theme") {
        throw new ToolInputError({
          message:
            `theme_trash: '${themeId}' is the active theme, so it cannot be moved to the Trash. ` +
            `Switch the site to another theme first (theme_set_active), then trash '${themeId}'. Nothing was changed.`,
        });
      }
      throw removalRefusal(themeId, outcome);
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
