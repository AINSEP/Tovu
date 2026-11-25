import path from "node:path";
import { openSqliteFileKernel } from "#src/platform/db/kernel/drivers/sqlite";
import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import { sanitizeShareDatabase as sanitizeWithModules } from "#src/features/site-backup/share-database/repo.sqlite";
import { rebuildImportDatabase as rebuildWithWorker, type RebuildImportDatabaseOptions as WorkerOptions } from "#src/features/site-backup/import-database";
import { FIRST_PARTY_DATA_MODULES } from "./data-modules.js";
import { POST_SEARCH_HOST } from "#src/features/post/search-host-config";
import { restoreStagedImport as restoreWithLayout } from "#src/features/site-backup/import-restore";
import { THEME_PLACEMENT_CHECKS } from "./theme-placement-checks.js";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import { findSoonAgentPlugin } from "#src/features/agent-plugins/soon-lock";
import type { SecretSealerPort } from "@jini-ai/core/contracts/vault";
import { createSiteSavedKeys } from "@jini-ai/devops/backup/site/saved-keys";
import { recordHeldBackChoice } from "#src/features/theme/held-back-choice";
/**
 * Bind the newly allocated destination, never the requesting site's layout or ambient overrides,
 * plus this build's Soon policy so a locked plugin stays off through the archive path.
 * Also binds A452's held-back marker: the archive's chosen theme is read from the staged database
 * BEFORE restore (restore may switch it to the fallback), and `recordHeldBackChoice` decides.
 * @complexity O(restore) plus two single-row reads.
 */
export async function restoreStagedImport(required: Omit<Parameters<typeof restoreWithLayout>[0], "pluginLayout" | "openContent" | "themeChecks" | "findSoonAgentPlugin">, optional: Parameters<typeof restoreWithLayout>[1] = {}): Promise<void> {
  const chosen = await readActiveThemeId({ filePath: path.join(required.root, "database/content.db") }).then(value => ({ value }), (error: unknown) => ({ error }));
  await restoreWithLayout({ ...required, themeChecks: THEME_PLACEMENT_CHECKS, openContent: ({ filePath }) => openSqliteFileKernel<ContentDatabase>({ filePath }), pluginLayout: resolveAgentPluginLayout({ siteDir: required.dir }, { env: {} }), findSoonAgentPlugin }, optional);
  // Restore copies and reads this same database, so it fails first, at its own point and with its
  // own cleanup, whenever the early read did; this rethrow only guards that assumption.
  if ("error" in chosen) throw chosen.error;
  recordHeldBackChoice({ siteDir: required.dir, chosenThemeId: chosen.value, finalThemeId: await readActiveThemeId({ filePath: required.dbPath }) });
}

/**
 * The first presentation row's active theme id, or `null` when there is none. A read fault is not
 * swallowed: both databases were just built by import itself, so a failure here is a real fault that
 * restore's own keep-off step would hit too.
 * @complexity O(1) — one single-row read.
 */
async function readActiveThemeId(required: { filePath: string }): Promise<string | null> {
  const db = openSqliteFileKernel<ContentDatabase>({ filePath: required.filePath }, { readOnly: true });
  try {
    const row = await db.run(query => query.selectFrom("presentation_settings").select("active_theme_id").executeTakeFirst());
    return row?.active_theme_id ?? null;
  } finally { await db.close(); }
}

export { rewriteArchiveMedia } from "#src/features/site-backup/share-database/repo.sqlite";
export { importWorkerLaunch } from "#src/features/site-backup/import-database";
export type RebuildImportDatabaseOptions = WorkerOptions & {
  /** This module's own URL: a `.ts` source run starts the helper through tsx, a build runs its `.js`. */
  moduleUrl?: string;
};

/** Bind this build's trusted declarations, never an archive's catalogue, and the post-search host binding. @complexity O(1) binding. */
export function sanitizeShareDatabase(required: { snapshot: Buffer }, optional: Parameters<typeof sanitizeWithModules>[1] = {}) {
  return sanitizeWithModules({ ...required, modules: FIRST_PARTY_DATA_MODULES, searchHost: POST_SEARCH_HOST }, optional);
}

/** Select the trusted isolated worker shipped beside this composition root. @complexity O(1) binding. */
export function rebuildImportDatabase(required: { snapshot: Buffer }, optional: RebuildImportDatabaseOptions = {}) {
  return rebuildWithWorker({ ...required, moduleUrl: optional.moduleUrl ?? import.meta.url }, optional);
}

/** Persisted inside every sealed share password's AAD: changing it makes existing exports unrevealable. */
const SHARE_PASSWORD_AAD_DOMAIN = "tovu-share-password";

/** Portable sites cannot inherit owner authority. Historical password reveal needs the site
 * sealer only; restore intentionally opens no recipient database and copies no credential.
 * @complexity O(1) composition, no I/O.
 */
export function composeSiteSavedKeys(required: { workspaceId: string; sealer: SecretSealerPort }, _optional = {}) {
  return createSiteSavedKeys({ ...required, passwordAadDomain: SHARE_PASSWORD_AAD_DOMAIN });
}
