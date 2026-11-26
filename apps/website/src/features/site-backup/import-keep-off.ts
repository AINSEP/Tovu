import { contentStore } from "@jini-ai/cms/site/keep-off-content-store";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import { keepImportedCodeOff as keepJiniImportedCodeOff, type KeepOffHost } from "@jini-ai/devops/backup/site/import-keep-off";
import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import { NO_THEME_ID } from "#src/contracts/core/theme-ids";
import { sanitizePageHtml } from "@jini-ai/cms/widgets/html";

/**
 * @file Binds Jini's keep-imported-code-off step to Tovu's content database tables, theme ids, page
 * sanitizer and notice copy. What an imported archive may leave switched ON is decided in Jini.
 */

type Kernel = KyselyKernel<ContentDatabase>;

/** Tovu's page sanitizer, no-theme id and plain-word notices for the keep-off step. */
const KEEP_OFF_HOST: KeepOffHost = {
  sanitizePageHtml,
  noThemeId: NO_THEME_ID,
  notices: {
    setAside: ({ fallback }) => `The imported file's copy of '${fallback}' differs from this site's own, so the site kept its own and the imported copy was set aside.`,
    themeKeptOff: ({ themeId }) => `Theme '${themeId}' came from the imported file, so it was kept switched off. Turn it on from Themes if you trust this file.`,
    pageDrafted: ({ title }) => `Page '${title}' holds its own code, so it was imported as a draft. Publish it if you trust this file.`,
    morePagesDrafted: ({ count }) => `${count} more ${count === 1 ? "page holds its" : "pages hold their"} own code and ${count === 1 ? "was" : "were"} imported as ${count === 1 ? "a draft" : "drafts"}.`,
    menuKeptOff: ({ title, id }) => `Menu '${title}' (ID ${id}) holds its own code, so its HTML was kept switched off. Choose HTML mode in Menus if you trust this file.`,
    moreMenusKeptOff: ({ count }) => `${count} more menus hold their own code and their HTML was kept switched off.`,
    formDisabled: ({ name, id }) => `Form '${name}' (ID ${id}) holds its own code, so it was imported disabled. Enable it in Forms if you trust this file.`,
    moreFormsDisabled: ({ count }) => `${count} more forms hold their own code and were imported disabled.`,
  },
};

/**
 * Restore's one step that decides what stays on in the new database.
 * @returns Notices for the person importing, in plain words.
 * @throws Whatever the database throws; the caller's restore then fails and cleans up.
 */
export function keepImportedCodeOff(required: { dbPath: string; fallback: string; liveThemes: ReadonlySet<string>; unrecognised: ReadonlySet<string>; setAside: boolean; openContent: (required: { filePath: string }) => Kernel }): Promise<string[]> {
  const { openContent, ...rest } = required;
  return keepJiniImportedCodeOff({ ...rest, openStore: ({ filePath }) => contentStore({ db: openContent({ filePath }) }), host: KEEP_OFF_HOST });
}
