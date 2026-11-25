import type { KyselyKernel } from "@jini-ai/db/kernel";
import { createImportRestore, type ImportRestore, type ImportRestoreHost, type RestoreStagedImportOptions, type RestoreStagedImportRequest } from "@jini-ai/devops/backup/site/import-restore";
import type { VerifiedSiteImport } from "@jini-ai/devops/backup/site/import-verifier";
import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import { readTemplate } from "#src/platform/site-dir/index";
import { archiveCodeUnit, editedArchiveWarnings, keptOffArchiveWarnings, OVERRIDES_UNIT } from "./archive-paths.js";
import { keepImportedCodeOff } from "./import-keep-off.js";
import { restoreImportedPluginState, type FindSoonAgentPlugin } from "./import-plugin-state.js";
import { inspectThemeManifests, writeExclusive, type ThemePlacementChecks } from "./import-restore-placement.js";

/**
 * @file Host binding for `@jini-ai/devops`'s staged-import restore: supplies this app's archive path
 * rules (`archive-paths.ts`), its share path policy (`import-restore-placement.ts`), its agent-plugin
 * lifecycle (`import-plugin-state.ts`), its content-database keep-off step (`import-keep-off.ts`)
 * and the starter template's fallback theme id. The theme owner's placement checks and the Soon
 * policy are injected per call by the host composition root. What is staged, quarantined, kept off
 * and set aside is decided in the package.
 */
type ContentKernel = KyselyKernel<ContentDatabase>;
type HostDeps = { themeChecks: ThemePlacementChecks; findSoonAgentPlugin: FindSoonAgentPlugin };

/** A host step the calling operation never reaches (staging restores no plugin state; warnings read
 * only the stage's own state). It throws, so a future path that does reach it fails loudly. */
function unreachableHostStep(): never { throw new Error("This staged-import step does not use this host dependency"); }
const STAGING_HAS_NO_PLUGIN_RESTORE: FindSoonAgentPlugin = async () => unreachableHostStep();
const WARNINGS_READ_NO_HOST: HostDeps = { themeChecks: { checkSourceDirContainment: unreachableHostStep, loadTheme: unreachableHostStep }, findSoonAgentPlugin: STAGING_HAS_NO_PLUGIN_RESTORE };

/** One host per call, so the injected theme checks and Soon policy are never module-level state. */
function bindImportRestore(required: HostDeps): ImportRestore<ContentKernel> {
  const host: ImportRestoreHost<ContentKernel> = {
    archivePaths: { overridesUnit: OVERRIDES_UNIT, archiveCodeUnit, editedArchiveWarnings, keptOffArchiveWarnings },
    fallbackThemeId: () => readTemplate({ templateId: "starter" }).seed.presentation.activeThemeId,
    inspectThemeManifests: (input) => inspectThemeManifests({ ...input, themeChecks: required.themeChecks }),
    writeExclusive,
    restoreImportedPluginState: (input, optional) => restoreImportedPluginState({ ...input, findSoonAgentPlugin: required.findSoonAgentPlugin }, optional?.sourceRoot === undefined ? {} : { sourceRoot: optional.sourceRoot }),
    keepImportedCodeOff,
  };
  return createImportRestore<ContentKernel>({ host });
}

/** Persist only verified, freshly projected data; the stage is private and never served. */
export function stageVerifiedImport(required: { root: string; verified: VerifiedSiteImport; themeChecks: ThemePlacementChecks }, _options: Record<string, never> = {}): void {
  bindImportRestore({ themeChecks: required.themeChecks, findSoonAgentPlugin: STAGING_HAS_NO_PLUGIN_RESTORE }).stageVerifiedImport({ root: required.root, verified: required.verified });
}

/** Restore a verified stage into a fresh site with the host's theme checks and Soon policy.
 * @complexity O(files + bytes), capped by the verified inventory (see the devops module).
 */
export function restoreStagedImport(required: RestoreStagedImportRequest<ContentKernel> & HostDeps, optional: RestoreStagedImportOptions = {}): Promise<void> {
  const { themeChecks, findSoonAgentPlugin, ...request } = required;
  return bindImportRestore({ themeChecks, findSoonAgentPlugin }).restoreStagedImport(request, optional);
}

/** Plain-word notices for what the stage kept off or found edited; reads only the stage's own state. */
export function stagedImportWarnings(required: { root: string }, _options: Record<string, never> = {}): string[] {
  return bindImportRestore(WARNINGS_READ_NO_HOST).stagedImportWarnings(required);
}
