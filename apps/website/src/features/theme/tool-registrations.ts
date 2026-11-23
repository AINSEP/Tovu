/**
 * @file Themes' half of ADR-049 Decision 4: maps every one of `agent-tools.ts`'s catalog entries
 * onto real filesystem reads/writes inside one theme's own folder, as `ToolRegistration`s
 * (`theme_list`/`theme_list_files`/`theme_read_file`/`theme_write_file`/`theme_edit_file`/
 * `theme_reset_file`/`theme_rename_file`/`theme_copy_file`/`theme_trash_file`/
 * `theme_restore_trashed_file` as of 2026-09-12, when `theme_reset_file`/`theme_copy_file` closed
 * the last two gaps a read-only survey found against the human Explore screen's own file
 * operations — see `ADS-memory/reports/2026-09-12-theme-agent-tools-survey.md`). The catalog is
 * wired in full — there is no `unwiredToolIds` set here, which means the kit treats ANY future
 * catalog entry added without a handler as a build failure. See `agent-tools.ts`'s own file header
 * for the operations deliberately never put in the catalog at all (hard file-delete,
 * rename/create/delete a whole theme's folder) and why.
 *
 * Authorization shape: nothing in `theme.ts`/`theme-files.ts` accepts an `authorize` dependency —
 * they are pure discovery/filesystem functions with no notion of a principal, exactly like
 * `redirects.ts`'s write chokepoint. The admin routes over this surface
 * (`apps/website/src/server/inbound/admin-http/routes/presentation/patch-active-theme.ts`, `apps/website/src/server/inbound/admin-http/routes/themes/list.ts`)
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
import { type ThemeToolDeps } from "./asset-operations.js";
import { toolMetadata } from "../../contracts/core/tool-metadata/theme.js";
import { syncThemeRoster } from "@jini-ai/cms/themes/preview/roster";
import { themeRosterPorts } from "./theme-roster-ports.js";
import { normalizeThemeReadInput } from "./theme-read-content.js";
import { buildDomainRegistrations, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import type { ToolContributor } from "@jini-ai/core";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/platform/system";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { protectThemeFileTools } from "./file-mutation-tools.js";
import { preview_reload, theme_rescan, theme_list, theme_list_page_publications, theme_list_files, theme_read_file } from "./theme-read-tools.js";
import { theme_write_file, theme_edit_file } from "./theme-write-tools.js";
import { theme_reset_file } from "./theme-reset-file-tool.js";
import { theme_rename_file, theme_copy_file } from "./theme-file-identity-tools.js";
import { theme_trash_file, theme_restore_trashed_file } from "./theme-file-trash-tools.js";
import { CATALOG_BY_ID } from "./theme-tool-catalog.js";


const MUTATES_DURABLE_STATE = "mutates-durable-state";

const THEME_TRASH_TOOL_ID = "theme_trash_file";

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually does.
 * See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own `sideEffects`
 * declaration.
 */
export const themesDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  ["preview_reload", MUTATES_DURABLE_STATE],
  // -> rescanThemes(): replaces the live discovered-theme registry in place.
  ["theme_rescan", MUTATES_DURABLE_STATE],
  // -> routeDeps.themes.map(): reads already-discovered in-memory state, no I/O at all.
  ["theme_list", "none"],
  // Reload and shared publication predicates: files read, no state changes.
  ["theme_list_page_publications", "none"],
  // -> listThemeFiles(): readdir under one theme folder, no writes.
  ["theme_list_files", "none"],
  // -> readThemeFile(): one readFileSync under one theme folder, plus a stat for selection metadata; no writes.
  ["theme_read_file", "none"],
  // -> writeThemeFile(): mkdir + writeFileSync on disk, then loadTheme() + in-place replacement of
  //    the live routeDeps.themes entry. Durable on both counts.
  ["theme_write_file", MUTATES_DURABLE_STATE],
  // -> readThemeFile() + writeThemeFile(): same durable write as theme_write_file, just computed
  //    from a read instead of taking the whole content as input.
  ["theme_edit_file", MUTATES_DURABLE_STATE],
  // -> resetThemeFileToOriginal(): a byte compare against the catalog copy, then copyFileSync to a
  //    temp file renamed over the live file when the bytes differ, then loadTheme() + in-place
  //    replacement. Same durable write as theme_write_file, just sourced from the theme's own stored
  //    original instead of caller-supplied content. An already-pristine file is not written.
  ["theme_reset_file", MUTATES_DURABLE_STATE],
  // -> renameThemeFile(): renameSync on disk, then loadTheme() + in-place replacement. Durable.
  ["theme_rename_file", MUTATES_DURABLE_STATE],
  // -> copyThemeFile(): copyFileSync creating a NEW file on disk, then loadTheme() + in-place
  //    replacement. Durable, same class as theme_write_file's own create-or-overwrite.
  ["theme_copy_file", MUTATES_DURABLE_STATE],
  // -> renameThemeFile() into .trash/: same durable move as theme_rename_file, just to a
  //    system-computed destination. Reversible (theme_restore_trashed_file), but still a disk write.
  ["theme_trash_file", MUTATES_DURABLE_STATE],
  // -> renameThemeFile() out of .trash/: the mirror-image move. Durable.
  ["theme_restore_trashed_file", MUTATES_DURABLE_STATE],
]);

export function buildThemesRegistrations(
  routeDeps: ThemeToolDeps,
  surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) },
): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    preview_reload: preview_reload.bind(undefined, routeDeps),
    theme_rescan: theme_rescan.bind(undefined, routeDeps),
    theme_list: theme_list.bind(undefined, routeDeps),
    theme_list_page_publications: theme_list_page_publications.bind(undefined, routeDeps),
    theme_list_files: theme_list_files.bind(undefined, routeDeps),
    theme_read_file: theme_read_file.bind(undefined, routeDeps),
    theme_write_file: theme_write_file.bind(undefined, routeDeps),
    theme_edit_file: theme_edit_file.bind(undefined, routeDeps),
    theme_reset_file: theme_reset_file.bind(undefined, routeDeps),
    theme_rename_file: theme_rename_file.bind(undefined, routeDeps),
    theme_copy_file: theme_copy_file.bind(undefined, routeDeps),
    theme_trash_file: theme_trash_file.bind(undefined, routeDeps),
    theme_restore_trashed_file: theme_restore_trashed_file.bind(undefined, routeDeps),
  };

  // Every handler here reads the roster, and another process (the web server's admin Duplicate or
  // Trash, a second daemon, a CLI) may have changed the themes folder since this one last looked —
  // so each call syncs first: an id created elsewhere is found, an id trashed elsewhere is not.
  // No-op when nothing changed. See `@jini-ai/cms/themes/preview/roster`.
  const syncedHandlers = Object.fromEntries(Object.entries(handlers).map(([id, handler]): [string, ToolHandler] => [id, (ctx, options) => {
    syncThemeRoster({ ...themeRosterPorts, themes: routeDeps.themes, themesDir: routeDeps.themesDir });
    return handler(ctx, options);
  }]));

  return protectThemeFileTools({ deps: routeDeps, catalog: CATALOG_BY_ID, registrations: buildDomainRegistrations({ metadata: toolMetadata,
    domain: "themes",
    catalogModule: "features/theme/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers: syncedHandlers,
    derivedRisk: themesDerivedRisk,
    inputNormalizers: { theme_read_file: normalizeThemeReadInput },
  }) });
}

/**
 * Contributes Themes's AI tools; called once by the composition root's
 * `installFirstPartyToolContributors()`, never as an import side effect.
 * Registration is a composition-root effect; feature imports must not reach back into the assistant.
 */
export function contributeThemesTools(): ToolContributor<ThemeToolDeps, AssistantSurfaceDeps> {
  return { domain: "themes", build: buildThemesRegistrations, risk: themesDerivedRisk };
}
