import type { KyselyKernel } from "@jini-ai/db/kernel";
import { createImportRestore } from "@jini-ai/devops/backup/site/import-restore";
import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import { readTemplate } from "#src/platform/site-dir/index";
import { archiveCodeUnit, editedArchiveWarnings, keptOffArchiveWarnings, OVERRIDES_UNIT } from "./archive-paths.js";
import { keepImportedCodeOff } from "./import-keep-off.js";
import { restoreImportedPluginState } from "./import-plugin-state.js";
import { inspectThemeManifests, writeExclusive } from "./import-restore-placement.js";

/**
 * @file Host binding for `@jini-ai/devops`'s staged-import restore: supplies this app's archive path
 * rules (`archive-paths.ts`), its theme validation and share path policy (`import-restore-placement.ts`),
 * its agent-plugin lifecycle (`import-plugin-state.ts`), its content-database keep-off step
 * (`import-keep-off.ts`) and the starter template's fallback theme id. What is staged, quarantined,
 * kept off and set aside is decided in the package.
 */
export const { stageVerifiedImport, restoreStagedImport, stagedImportWarnings } = createImportRestore<KyselyKernel<ContentDatabase>>({
  host: {
    archivePaths: { overridesUnit: OVERRIDES_UNIT, archiveCodeUnit, editedArchiveWarnings, keptOffArchiveWarnings },
    fallbackThemeId: () => readTemplate({ templateId: "starter" }).seed.presentation.activeThemeId,
    inspectThemeManifests,
    writeExclusive,
    restoreImportedPluginState,
    keepImportedCodeOff,
  },
});
