import { resolveThemeOriginalSource } from "@jini-ai/cms/themes/files/original-source";
import { prepareArchiveExtensions as prepareExtensions, type ArchiveExtensionsDeps } from "@jini-ai/devops/backup/site/archive-extensions";
import type { ArchivePlugin } from "@jini-ai/devops/backup/site/archive-manifest";
import type { PlannedDiskFile } from "@jini-ai/devops/backup/site/sources";
import { createTovuAgentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";
import { TOVU_SITE_PLUGIN_MANIFEST_FILENAMES } from "#src/features/plugin-runtime/site-plugin-vocabulary";
import { runtimeToArchivePath } from "./archive-paths.js";
import { collectSiteBackupFiles, readPlannedFile, type SiteBackupSources } from "./sources.js";

/** Tovu's plugin lifecycle, theme originals, archive path map and manifest names, handed to the engine's extension preparation. */
const EXTENSION_DEPS: ArchiveExtensionsDeps = {
  collectSiteBackupFiles,
  readPlannedFile: file => readPlannedFile(file),
  createLifecycle: ({ layout }) => createTovuAgentPluginLifecycle({ layout }),
  resolveThemeOriginalSource,
  runtimeToArchivePath,
  pluginManifestFilenames: TOVU_SITE_PLUGIN_MANIFEST_FILENAMES,
};

/** Selects installed package versions through the lifecycle owner; includes reset baselines.
 * @throws SiteShareRefusal for multiple workspaces, unsafe originals or stale planned files.
 * @complexity O(files × (themes + plugins) + package bytes), bounded by share caps.
 */
export function prepareArchiveExtensions(required: { sources: SiteBackupSources; files: readonly PlannedDiskFile[] }, optional: { packageThemesRoot?: string } = {}): Promise<{ files: PlannedDiskFile[]; plugins: ArchivePlugin[]; notices?: readonly string[] }> {
  return prepareExtensions({ ...required, deps: EXTENSION_DEPS }, optional);
}
