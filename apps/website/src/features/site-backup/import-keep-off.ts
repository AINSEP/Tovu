import type { KyselyKernel } from "@jini-ai/db/kernel";
import { keepImportedCodeOff as keepJiniImportedCodeOff, type KeepOffHost, type KeepOffStore } from "@jini-ai/devops/backup/site/import-keep-off";
import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import { NO_THEME_ID } from "#src/contracts/core/theme-ids";
import { sanitizePageHtml } from "@jini-ai/cms/widgets/html";

/**
 * @file Binds Jini's keep-imported-code-off step to Tovu's content database tables, theme ids, page
 * sanitizer and notice copy. What an imported archive may leave switched ON is decided in Jini.
 */

type Kernel = KyselyKernel<ContentDatabase>;

/** Tovu's content-database reads and writes behind Jini's {@link KeepOffStore}. */
function contentStore(db: Kernel): KeepOffStore {
  return {
    activeThemeIds: async () => (await db.run(query => query.selectFrom("presentation_settings").select("active_theme_id").execute())).map(row => row.active_theme_id),
    reassignActiveTheme: ({ from, to }) => db.run(query => query.updateTable("presentation_settings").set({ active_theme_id: to }).where("active_theme_id", "=", from).execute()).then(() => undefined),
    publishedHtmlPages: async () => (await db.run(query => query.selectFrom("posts").select(["id", "title", "body_html"]).where("body_format", "=", "html").where("status", "=", "published").execute())).map(row => ({ id: row.id, title: row.title, bodyHtml: row.body_html })),
    draftPage: ({ id }) => db.run(query => query.updateTable("posts").set({ status: "draft" }).where("id", "=", id as string).execute()).then(() => undefined),
    menus: async () => (await db.run(query => query.selectFrom("menus").select(["id", "title", "doc_json"]).execute())).map(row => ({ id: row.id, title: row.title, docJson: row.doc_json })),
    setMenuDoc: ({ id, docJson }) => db.run(query => query.updateTable("menus").set({ doc_json: docJson }).where("id", "=", id as string).execute()).then(() => undefined),
    forms: async () => (await db.run(query => query.selectFrom("form_definitions").select(["id", "name", "fields_json"]).execute())).map(row => ({ id: row.id, name: row.name, fieldsJson: row.fields_json })),
    disableForm: ({ id }) => db.run(query => query.updateTable("form_definitions").set({ status: "disabled" }).where("id", "=", id as string).execute()).then(() => undefined),
    close: () => db.close(),
  };
}

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
  return keepJiniImportedCodeOff({ ...rest, openStore: ({ filePath }) => contentStore(openContent({ filePath })), host: KEEP_OFF_HOST });
}
