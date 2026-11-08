import fs from "node:fs";
import path from "node:path";
import { parseFragment, serialize, type DefaultTreeAdapterMap } from "parse5";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import { NO_THEME_ID } from "#src/features/theme/active-theme";
import { sanitizePageHtml } from "#src/features/widgets/media-html";

/**
 * @file What an imported archive may leave switched ON. Imported themes and HTML pages count as
 * code, so they stay installed and a person turns them on. Never a refusal: an owner's own exported
 * site still imports whole.
 *
 * Themes are judged by byte identity with this site's own copy. Pages keep their look when the shared page
 * sanitizer's allow-list would leave them untouched, since most real HTML pages hold no code.
 */

const LIVE_THEME_FILE = /^themes\/((?:static|declarative)\/([^/]+))\/(.+)$/;
/** Outside the page sanitizer's allow-list but plain text styling. The generated privacy page uses it. */
const INERT_DROPS: ReadonlySet<string> = new Set(["mark"]);
const MAX_PAGE_NOTICES = 20;
const MAX_NOTICE_TITLE = 80;

type Kernel = StorageKernel<ContentDatabase>;

/**
 * Ids of live theme trees that are not byte-identical to the copy this new site already holds.
 * Must run before restore replaces those trees.
 * @complexity O(staged theme files + their bytes), bounded by the 300 MiB import cap.
 */
export function unrecognisedThemes(required: { root: string; dir: string; files: readonly string[]; liveThemes: ReadonlySet<string> }): Set<string> {
  const unrecognised = new Set<string>();
  for (const file of required.files) {
    const match = LIVE_THEME_FILE.exec(file);
    if (!match || !required.liveThemes.has(match[1]!) || unrecognised.has(match[2]!)) continue;
    if (!sameBytes(path.join(required.root, file), path.join(required.dir, file))) unrecognised.add(match[2]!);
  }
  return unrecognised;
}

function sameBytes(left: string, right: string): boolean {
  return fs.existsSync(right) && fs.readFileSync(left).equals(fs.readFileSync(right));
}

/**
 * Whether a page body counts as code: `true` unless the allow-list keeps every element and
 * attribute and no attribute value holds markup or an escape.
 * @complexity O(html length).
 */
export function pageBodyMayRunScript(required: { html: string }): boolean {
  let dropped = false;
  sanitizePageHtml({ html: required.html }, { reportDrops: ({ dropped: drops }) => { dropped ||= Object.keys(drops).some(drop => !INERT_DROPS.has(drop)); } });
  return dropped || attributeHoldsMarkup(parseFragment(required.html));
}

/** Native form grouping and input hints are inert; check behavior without changing stored HTML. */
function formBodyMayRunScript(required: { html: string }, _optional = {}): boolean {
  const root = parseFragment(required.html);
  const pending = root.childNodes.map(node => ({ node, depth: 0 }));
  const tags = new Set(["fieldset", "legend", "optgroup"]);
  const attrs = new Set(["maxlength", "pattern", "accept", "inputmode", "spellcheck", "autocapitalize", "readonly", "label"]);
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (!("tagName" in node)) continue;
    if (depth >= 128) return true;
    if (node.namespaceURI === "http://www.w3.org/1999/xhtml") {
      // Keep option grouping valid inside select so reparsing preserves its attributes.
      if (tags.has(node.tagName)) node.tagName = node.nodeName = node.tagName === "optgroup" ? "option" : "div";
      node.attrs = node.attrs.filter(attr => attr.namespace || attr.prefix || !attrs.has(attr.name));
    }
    pending.push(...[...node.childNodes, ...("content" in node ? node.content.childNodes : [])].map(node => ({ node, depth: depth + 1 })));
  }
  return pageBodyMayRunScript({ html: serialize(root) });
}

function attributeHoldsMarkup(root: DefaultTreeAdapterMap["documentFragment"]): boolean {
  // Depth is bounded by the sanitizer above: anything deeper than its limit counts as a drop.
  const pending: DefaultTreeAdapterMap["childNode"][] = [...root.childNodes];
  while (pending.length) {
    const node = pending.pop()!;
    if (!("tagName" in node)) continue;
    if (node.attrs.some(attr => /[<>\\]/.test(attr.value))) return true;
    pending.push(...node.childNodes, ...("content" in node ? node.content.childNodes : []));
  }
  return false;
}

/**
 * Leaves an active theme on only when it is this site's own, and moves every other one to the
 * fallback, which the archive can never replace.
 * @returns One notice per imported theme that was active.
 * @complexity O(workspaces), one update per changed row.
 */
async function keepThemesOff(required: { db: Kernel; fallback: string; liveThemeIds: ReadonlySet<string>; unrecognised: ReadonlySet<string> }): Promise<string[]> {
  const { db, fallback, liveThemeIds, unrecognised } = required;
  const rows = await db.run(query => query.selectFrom("presentation_settings").select("active_theme_id").execute());
  const notices = new Set<string>();
  for (const { active_theme_id: active } of rows) {
    const own = active === fallback || liveThemeIds.has(active);
    if (active === NO_THEME_ID || (own && !unrecognised.has(active))) continue;
    if (unrecognised.has(active)) notices.add(`Theme '${active}' came from the imported file, so it was kept switched off. Turn it on from Themes if you trust this file.`);
    await db.run(query => query.updateTable("presentation_settings").set({ active_theme_id: fallback }).where("active_theme_id", "=", active).execute());
  }
  return [...notices];
}

/**
 * Turns every published HTML page that could run script into a draft.
 * @returns At most {@link MAX_PAGE_NOTICES} page notices plus one summary line.
 * @complexity O(published HTML pages + their bytes) once per import; one update per kept-off page.
 */
async function keepPagesOff(required: { db: Kernel }): Promise<string[]> {
  const { db } = required;
  const pages = await db.run(query => query.selectFrom("posts").select(["id", "title", "body_html"]).where("body_format", "=", "html").where("status", "=", "published").execute());
  const kept = pages.filter(page => pageBodyMayRunScript({ html: page.body_html ?? "" }));
  for (const page of kept) await db.run(query => query.updateTable("posts").set({ status: "draft" }).where("id", "=", page.id).execute());
  const notices = kept.slice(0, MAX_PAGE_NOTICES).map(page => `Page '${String(page.title).slice(0, MAX_NOTICE_TITLE)}' holds its own code, so it was imported as a draft. Publish it if you trust this file.`);
  const more = kept.length - MAX_PAGE_NOTICES;
  return more > 0 ? [...notices, `${more} more ${more === 1 ? "page holds its" : "pages hold their"} own code and ${more === 1 ? "was" : "were"} imported as ${more === 1 ? "a draft" : "drafts"}.`] : notices;
}

/**
 * Restore's one step that decides what stays on in the new database.
 * @returns Notices for the person importing, in plain words.
 * @throws Whatever the database throws; the caller's restore then fails and cleans up.
 */
export async function keepImportedCodeOff(required: { dbPath: string; fallback: string; liveThemes: ReadonlySet<string>; unrecognised: ReadonlySet<string>; setAside: boolean; openContent: (required: { filePath: string }) => Kernel }): Promise<string[]> {
  const db = required.openContent({ filePath: required.dbPath });
  try {
    const liveThemeIds = new Set([...required.liveThemes].flatMap(id => id.startsWith("__") ? [] : [id.split("/").at(-1)!]));
    const setAside = required.setAside ? [`The imported file's copy of '${required.fallback}' differs from this site's own, so the site kept its own and the imported copy was set aside.`] : [];
    const notices = [...setAside, ...await keepThemesOff({ db, fallback: required.fallback, liveThemeIds, unrecognised: required.unrecognised }), ...await keepPagesOff({ db })];
    const menuNotices: string[] = [];
    const menus = await db.run(query => query.selectFrom("menus").select(["id", "title", "doc_json"]).execute());
    for (const menu of menus) {
      let doc: { mode?: unknown; html?: unknown } | null;
      try { doc = JSON.parse(menu.doc_json); } catch { continue; }
      if (!doc || doc.mode !== "html" || typeof doc.html !== "string" || !pageBodyMayRunScript({ html: doc.html })) continue;
      // Draft menus still resolve at markers; items mode keeps the original HTML without serving it.
      await db.run(query => query.updateTable("menus").set({ doc_json: JSON.stringify({ ...doc, mode: "items" }) }).where("id", "=", menu.id).execute());
      menuNotices.push(`Menu '${String(menu.title).slice(0, MAX_NOTICE_TITLE)}' (ID ${menu.id}) holds its own code, so its HTML was kept switched off. Choose HTML mode in Menus if you trust this file.`);
    }
    const moreMenus = menuNotices.length - MAX_PAGE_NOTICES;
    notices.push(...menuNotices.slice(0, MAX_PAGE_NOTICES));
    if (moreMenus > 0) notices.push(`${moreMenus} more menus hold their own code and their HTML was kept switched off.`);
    const formNotices: string[] = [];
    const forms = await db.run(query => query.selectFrom("form_definitions").select(["id", "name", "fields_json"]).execute());
    for (const form of forms) {
      let fields: { mode?: unknown; html?: unknown } | null;
      try { fields = JSON.parse(form.fields_json); } catch { continue; }
      if (!fields || fields.mode !== "html" || typeof fields.html !== "string" || !formBodyMayRunScript({ html: fields.html })) continue;
      // Disabled forms do not resolve at markers; keep the authored envelope byte-for-byte.
      await db.run(query => query.updateTable("form_definitions").set({ status: "disabled" }).where("id", "=", form.id).execute());
      formNotices.push(`Form '${String(form.name).slice(0, MAX_NOTICE_TITLE)}' (ID ${form.id}) holds its own code, so it was imported disabled. Enable it in Forms if you trust this file.`);
    }
    const moreForms = formNotices.length - MAX_PAGE_NOTICES;
    notices.push(...formNotices.slice(0, MAX_PAGE_NOTICES));
    if (moreForms > 0) notices.push(`${moreForms} more forms hold their own code and were imported disabled.`);
    return notices;
  } finally { await db.close(); }
}
