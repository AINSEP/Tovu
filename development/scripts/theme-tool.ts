/**
 * @file Copy-and-edit workflow for static themes — the operator side of the "no inheritance, copy the
 * original" model.
 *
 * The model this implements: `src/themes/__original-themes__/<tier>/<id>/` holds pristine shipped
 * themes that are never discovered, never runnable, and never edited. You COPY one into a real tier
 * folder and then go wild on the copy. The original stays byte-identical forever, so "what did I
 * change?" and "reset this back" are plain directory operations rather than tooling nobody built yet.
 *
 * Why a script rather than hand-editing: three of these operations have to touch `theme.json` and a
 * file in the same breath, and doing that by hand is exactly how a theme ends up declaring a slot
 * whose file does not exist (or shipping a file no slot names, which renders as nothing with no error
 * anywhere). The manifest and the filesystem are one unit here; this keeps them that way.
 *
 * Usage:
 *   npm run theme -- copy <catalog-id> <new-id> [--tier static]
 *   npm run theme -- page:duplicate <theme> <src-page> <new-page>
 *   npm run theme -- page:delete <theme> <page>
 *   npm run theme -- slot:add <theme> <slot-id> [source.html]
 *   npm run theme -- page:slot:add <theme> <page> <slot-id> [--before <slot>|--after <slot>]
 *   npm run theme -- page:slot:remove <theme> <page> <slot-id>
 *   npm run theme -- list
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const THEMES_ROOT = process.env.TOVU_THEMES_DIR ?? resolve(process.cwd(), "src/themes");
const CATALOG_DIR = "__original-themes__";
const ENGINE_SUBFOLDERS = ["declarative", "templated", "handlebars", "static"] as const;

type Json = Record<string, unknown>;

class ThemeToolError extends Error {}

function fail(message: string): never {
  throw new ThemeToolError(message);
}

function readManifest(themeDir: string): Json {
  const path = join(themeDir, "theme.json");
  if (!existsSync(path)) fail(`no theme.json at ${path}`);
  return JSON.parse(readFileSync(path, "utf8")) as Json;
}

/** Write `theme.json` back with the 2-space indent + trailing newline every in-repo manifest uses. */
function writeManifest(themeDir: string, manifest: Json): void {
  writeFileSync(join(themeDir, "theme.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

/**
 * Resolve an INSTALLED theme's folder — the editable side. Deliberately refuses to resolve into the
 * catalog: every write path in this file goes through here, so "originals are read-only" is enforced
 * by the one function that hands out paths rather than by remembering it at six call sites.
 */
function installedThemeDir(themeId: string): string {
  if (themeId.startsWith("__")) fail(`'${themeId}' is a catalog path — originals are read-only`);
  for (const tier of ENGINE_SUBFOLDERS) {
    const dir = join(THEMES_ROOT, tier, themeId);
    if (existsSync(dir)) return dir;
  }
  const topLevel = join(THEMES_ROOT, themeId);
  if (existsSync(topLevel)) return topLevel;
  return fail(`installed theme '${themeId}' not found under ${THEMES_ROOT}`);
}

function catalogThemeDir(themeId: string, tier: string): string {
  const dir = join(THEMES_ROOT, CATALOG_DIR, tier, themeId);
  if (!existsSync(dir)) fail(`catalog theme '${themeId}' not found at ${dir}`);
  return dir;
}

function pagePath(themeDir: string, page: string): string {
  return join(themeDir, "pages", `${page.replace(/\.html$/, "")}.html`);
}

// ---------------------------------------------------------------------------
// Slot markers
// ---------------------------------------------------------------------------

/**
 * Match one `{"type":"partial","id":"<slot>"}` marker element, whatever else its config carries
 * (`current`, `variant`) and whichever quote style wraps the attribute.
 *
 * Built per-slot rather than parsed generically because both callers want "the marker for THIS slot",
 * and a real HTML parse would be a heavier dependency than this earns — the markers are written by
 * this same tool and by hand in a known shape, not by arbitrary upstream authors.
 */
function slotMarkerPattern(slotId: string): RegExp {
  const id = slotId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`[ \\t]*<div[^>]*data-embed-config=(['"])\\{[^>]*?"id"\\s*:\\s*"${id}"[^>]*?\\1[^>]*>\\s*</div>\\n?`, "g");
}

function slotMarkerHtml(slotId: string): string {
  return `<div data-embed-config='{"type":"partial","id":"${slotId}"}'></div>`;
}

/**
 * Insert `marker` relative to an anchor slot's marker, or before `</body>` when no anchor is given.
 *
 * Anchoring on another slot rather than on a line number is what makes this survive the page being
 * edited by hand in between — "put the sidebar before the footer" stays true after the author moves
 * everything else around.
 */
function insertMarker(
  html: string,
  marker: string,
  anchor: { slot: string; position: "before" | "after" } | null
): string {
  if (anchor) {
    const match = slotMarkerPattern(anchor.slot).exec(html);
    if (!match) fail(`anchor slot '${anchor.slot}' has no marker on this page`);
    const at = anchor.position === "before" ? match.index : match.index + match[0].length;
    const indent = /[ \t]*$/.exec(html.slice(0, match.index))?.[0] ?? "";
    return `${html.slice(0, at)}${anchor.position === "before" ? `${marker}\n${indent}` : `\n${indent}${marker}`}${html.slice(at)}`;
  }
  const bodyClose = html.lastIndexOf("</body>");
  if (bodyClose === -1) return `${html}\n${marker}\n`;
  return `${html.slice(0, bodyClose)}${marker}\n`.concat(html.slice(bodyClose));
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * Copy a pristine catalog theme into an editable tier folder.
 *
 * Records `lineage` in the copy's manifest. That is METADATA, not resolution: nothing at runtime
 * reads it, no bytes fall through from the original, and deleting the original does not change how
 * the copy renders. It exists so a later tool can answer "what did I change since I forked this",
 * which is answerable precisely because the original is still sitting there untouched.
 */
function cmdCopy(catalogId: string, newId: string, tier: string): void {
  const from = catalogThemeDir(catalogId, tier);
  const to = join(THEMES_ROOT, tier, newId);
  if (existsSync(to)) fail(`'${newId}' already exists at ${to} — pick another id or delete it first`);

  cpSync(from, to, { recursive: true });

  const manifest = readManifest(to);
  const sourceVersion = String(manifest.version ?? "0.0.0");
  manifest.id = newId;
  manifest.name = `${String(manifest.name ?? catalogId)} (${newId})`;
  manifest.lineage = { from: catalogId, tier, version: sourceVersion, catalog: `${CATALOG_DIR}/${tier}/${catalogId}` };
  writeManifest(to, manifest);

  console.log(`copied ${CATALOG_DIR}/${tier}/${catalogId} → ${tier}/${newId}`);
  console.log(`  lineage: from '${catalogId}' v${sourceVersion} (metadata only — no runtime link)`);
}

function cmdPageDuplicate(themeId: string, srcPage: string, newPage: string): void {
  const dir = installedThemeDir(themeId);
  const src = pagePath(dir, srcPage);
  const dest = pagePath(dir, newPage);
  if (!existsSync(src)) fail(`page '${srcPage}' not found at ${src}`);
  if (existsSync(dest)) fail(`page '${newPage}' already exists at ${dest}`);

  writeFileSync(dest, readFileSync(src, "utf8"), "utf8");
  syncManifestPages(dir);
  console.log(`duplicated ${srcPage} → ${newPage} in '${themeId}'`);
}

function cmdPageDelete(themeId: string, page: string): void {
  const dir = installedThemeDir(themeId);
  const path = pagePath(dir, page);
  if (!existsSync(path)) fail(`page '${page}' not found at ${path}`);
  if (page.replace(/\.html$/, "") === "index") fail("pages/index.html is required — a theme without it loads 'invalid'");

  rmSync(path);
  syncManifestPages(dir);
  console.log(`deleted page '${page}' from '${themeId}'`);
}

/**
 * Rewrite `theme.json`'s `pages` array from what is actually on disk.
 *
 * The loader scans `pages/*.html` and never reads this array (checked: every consumer goes through
 * `Object.keys(theme.pages)`), so it is documentation rather than configuration — but documentation
 * that silently drifts from the folder is worse than none, and keeping it true costs one readdir.
 */
function syncManifestPages(themeDir: string): void {
  const pagesDir = join(themeDir, "pages");
  if (!existsSync(pagesDir)) return;
  const manifest = readManifest(themeDir);
  if (!Array.isArray(manifest.pages)) return;
  manifest.pages = readdirSync(pagesDir)
    .filter((f) => f.endsWith(".html"))
    .map((f) => f.slice(0, -".html".length))
    .sort();
  writeManifest(themeDir, manifest);
}

/**
 * Declare a new slot and create its partial file together.
 *
 * These are one operation, not two, because either half alone is a silent failure: a declared slot
 * with no file resolves to nothing, and a file no slot names is never loaded at all.
 */
function cmdSlotAdd(themeId: string, slotId: string, sourceFile: string | undefined): void {
  const dir = installedThemeDir(themeId);
  const source = sourceFile ?? `${slotId}.html`;
  const manifest = readManifest(dir);
  const slots = (manifest.slots as Json | undefined) ?? {};
  if (slots[slotId]) fail(`slot '${slotId}' is already declared in ${themeId}/theme.json`);

  slots[slotId] = { source };
  manifest.slots = slots;
  writeManifest(dir, manifest);

  const partialPath = join(dir, source);
  if (!existsSync(partialPath)) {
    writeFileSync(partialPath, `<!-- ${slotId} partial for ${themeId} — edit freely -->\n`, "utf8");
    console.log(`created ${source}`);
  }
  console.log(`declared slot '${slotId}' → ${source} in '${themeId}'`);
  console.log(`  embed it with: npm run theme -- page:slot:add ${themeId} <page> ${slotId}`);
}

function cmdPageSlotAdd(
  themeId: string,
  page: string,
  slotId: string,
  anchor: { slot: string; position: "before" | "after" } | null
): void {
  const dir = installedThemeDir(themeId);
  const path = pagePath(dir, page);
  if (!existsSync(path)) fail(`page '${page}' not found at ${path}`);

  const manifest = readManifest(dir);
  const slots = (manifest.slots as Json | undefined) ?? {};
  if (!slots[slotId]) fail(`slot '${slotId}' is not declared in ${themeId}/theme.json — run slot:add first`);

  const html = readFileSync(path, "utf8");
  if (slotMarkerPattern(slotId).test(html)) fail(`page '${page}' already embeds slot '${slotId}'`);

  writeFileSync(path, insertMarker(html, slotMarkerHtml(slotId), anchor), "utf8");
  console.log(`embedded slot '${slotId}' in ${themeId}/pages/${page}`);
}

function cmdPageSlotRemove(themeId: string, page: string, slotId: string): void {
  const dir = installedThemeDir(themeId);
  const path = pagePath(dir, page);
  if (!existsSync(path)) fail(`page '${page}' not found at ${path}`);

  const html = readFileSync(path, "utf8");
  const next = html.replace(slotMarkerPattern(slotId), "");
  if (next === html) fail(`page '${page}' does not embed slot '${slotId}'`);

  writeFileSync(path, next, "utf8");
  console.log(`removed slot '${slotId}' from ${themeId}/pages/${page}`);
}

function cmdList(): void {
  const catalogRoot = join(THEMES_ROOT, CATALOG_DIR);
  console.log(`catalog (${CATALOG_DIR}/ — pristine, read-only):`);
  for (const tier of ENGINE_SUBFOLDERS) {
    const dir = join(catalogRoot, tier);
    if (!existsSync(dir)) continue;
    for (const id of readdirSync(dir)) console.log(`  ${tier}/${id}`);
  }
  console.log(`\ninstalled (editable):`);
  for (const tier of ENGINE_SUBFOLDERS) {
    const dir = join(THEMES_ROOT, tier);
    if (!existsSync(dir)) continue;
    for (const id of readdirSync(dir)) {
      const manifest = existsSync(join(dir, id, "theme.json")) ? readManifest(join(dir, id)) : {};
      const lineage = manifest.lineage as { from?: string } | undefined;
      console.log(`  ${tier}/${id}${lineage?.from ? `  ← copied from '${lineage.from}'` : ""}`);
    }
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function flag(argv: string[], name: string): string | undefined {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? undefined : argv[at + 1];
}

function parseAnchor(argv: string[]): { slot: string; position: "before" | "after" } | null {
  const before = flag(argv, "before");
  const after = flag(argv, "after");
  if (before && after) fail("pass --before or --after, not both");
  if (before) return { slot: before, position: "before" };
  if (after) return { slot: after, position: "after" };
  return null;
}

const USAGE = `theme-tool — copy a pristine original, then edit the copy

  copy <catalog-id> <new-id> [--tier static]     copy an original into an editable theme
  page:duplicate <theme> <src-page> <new-page>   duplicate a page within a theme
  page:delete <theme> <page>                     delete a page
  slot:add <theme> <slot-id> [source.html]       declare a region + create its partial
  page:slot:add <theme> <page> <slot-id>         embed a declared slot on a page
                 [--before <slot>|--after <slot>]
  page:slot:remove <theme> <page> <slot-id>      remove a slot's marker from a page
  list                                           show catalog + installed themes
`;

function main(argv: string[]): void {
  const [command, ...rest] = argv;
  const tier = flag(argv, "tier") ?? "static";

  switch (command) {
    case "copy":
      if (rest.length < 2) fail("usage: copy <catalog-id> <new-id> [--tier static]");
      return cmdCopy(rest[0], rest[1], tier);
    case "page:duplicate":
      if (rest.length < 3) fail("usage: page:duplicate <theme> <src-page> <new-page>");
      return cmdPageDuplicate(rest[0], rest[1], rest[2]);
    case "page:delete":
      if (rest.length < 2) fail("usage: page:delete <theme> <page>");
      return cmdPageDelete(rest[0], rest[1]);
    case "slot:add":
      if (rest.length < 2) fail("usage: slot:add <theme> <slot-id> [source.html]");
      return cmdSlotAdd(rest[0], rest[1], rest[2]?.startsWith("--") ? undefined : rest[2]);
    case "page:slot:add":
      if (rest.length < 3) fail("usage: page:slot:add <theme> <page> <slot-id> [--before <slot>|--after <slot>]");
      return cmdPageSlotAdd(rest[0], rest[1], rest[2], parseAnchor(argv));
    case "page:slot:remove":
      if (rest.length < 3) fail("usage: page:slot:remove <theme> <page> <slot-id>");
      return cmdPageSlotRemove(rest[0], rest[1], rest[2]);
    case "list":
      return cmdList();
    default:
      console.log(USAGE);
      if (command !== undefined && command !== "--help") process.exitCode = 1;
  }
}

try {
  main(process.argv.slice(2));
} catch (err) {
  if (err instanceof ThemeToolError) {
    console.error(`theme-tool: ${err.message}`);
    process.exitCode = 1;
  } else {
    throw err;
  }
}
