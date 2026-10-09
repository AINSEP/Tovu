import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { RETIRED_READ_TOOL_TO_CARD } from "../../../../assistant/content-read-tool.js";
import { nativeToolMetadata } from "../../../../contracts/core/tool-metadata/index.js";

/**
 * @file The `tovu-theme` bundled Agent Plugin owns "make a theme that matches a reference site", and
 * `site-import` hands its theme step to it (owner-approved design, 2026-10-08).
 *
 * Why pinned: the Luvira import duplicated the starter theme, recoloured it, and never looked at its
 * own page — the starter's header, narrow container and fonts won. The fix is prose (a skill), and
 * prose erodes during unrelated edits, so the load-bearing rules each get an assertion:
 * - every tool the skills cite exists (a renamed tool would leave agents calling nothing);
 * - the compare loop is mandatory and captures THIS site's page, desktop and mobile;
 * - the theme is rebuilt (container, header partial, page shell, fonts), not recoloured;
 * - site-import delegates instead of carrying its own duplicate-and-tweak recipe;
 * - no ownership / right-to-copy gate anywhere (owner order: copy anything).
 */

const PLUGINS_ROOT = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins");
const THEME_SKILL_DIR = path.join(PLUGINS_ROOT, "tovu-theme", "skills", "tovu-theme");
const IMPORT_SKILL_DIR = path.join(PLUGINS_ROOT, "site-import", "skills", "site-import");

async function readSkillTree(dir: string): Promise<Array<{ name: string; text: string }>> {
  const references = (await readdir(path.join(dir, "references"))).filter((name) => name.endsWith(".md"));
  return [
    { name: "SKILL.md", text: await readFile(path.join(dir, "SKILL.md"), "utf8") },
    ...(await Promise.all(references.map(async (name) => ({ name, text: await readFile(path.join(dir, "references", name), "utf8") })))),
  ];
}

/** Snake_case identifiers (and `content_read.<resource>` cards) opening a backtick span, alone or
 *  as a `tool_name {` call, plus the same call shapes inside fenced examples. */
function citedToolIds(markdown: string): Set<string> {
  const ids = new Set<string>();
  const toolId = String.raw`[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?:\.[a-z0-9_]+)?`;
  for (const match of markdown.matchAll(new RegExp(String.raw`\`(${toolId})(?=\`| \{)`, "g"))) ids.add(match[1]!);
  for (const match of markdown.matchAll(new RegExp(String.raw`^\s*(${toolId}) \{`, "gm"))) ids.add(match[1]!);
  return ids;
}

/**
 * The ids a running server actually serves. `nativeToolMetadata` is the PRE-collapse table: it
 * still declares the 09-08 retired read tools (`content_post_list`, `menus_list_menus`, ...) because
 * their handlers live on inside the `content_read.<resource>` cards — but the ids themselves 404.
 * Checking against that table alone let skills keep citing them, so a retired id is refused here and
 * the card that replaced it is named in the failure.
 */
function unknownToolIds(name: string, ids: Iterable<string>, declared: ReadonlySet<string>): string[] {
  const unknown: string[] = [];
  for (const id of ids) {
    const replacement = RETIRED_READ_TOOL_TO_CARD.get(id);
    if (replacement) unknown.push(`${name}: ${id} (retired — use ${replacement})`);
    else if (!declared.has(id) && !/^agent_plugin_[a-z0-9_]+$/.test(id)) unknown.push(`${name}: ${id}`);
  }
  return unknown;
}

const themeSkill = () => readFile(path.join(THEME_SKILL_DIR, "SKILL.md"), "utf8");

test("Part C discovers the active theme through the site profile, rather than treating the theme list as an active id", async () => {
  const skill = await themeSkill();
  assert.ok(skill.slice(skill.indexOf('1. **Pick the source.**'), skill.indexOf('2. **Duplicate it:**')).includes('`site_get_profile { sections: ["theme"] }`'));
  const scaffold = skill.slice(skill.indexOf("## C1"), skill.indexOf("## C2"));
  for (const contract of [
    '`site_get_profile { sections: ["theme"] }`', 'sections.theme.status',
    'sections.theme.data.activeThemeId', 'sections.theme.data.active',
    '`content_read.theme` returns `{ themes: [...] }`',
  ]) assert.ok(scaffold.includes(contract), `C1 must state ${contract}`);
  assert.ok(scaffold.includes('themeDisabled'));
  assert.ok(scaffold.includes('"forbidden"'));
  assert.ok(scaffold.includes('"unavailable"'));
  assert.ok(scaffold.includes('valid static theme'));
  assert.equal(scaffold.includes('`content_read.theme` → the active theme id'), false);
});

test("every tool tovu-theme's skill and references cite is a real native tool or a per-plugin tool", async () => {
  const declared = new Set(Object.keys(nativeToolMetadata.byId));
  const unknown: string[] = [];
  for (const { name, text } of await readSkillTree(THEME_SKILL_DIR)) {
    unknown.push(...unknownToolIds(name, citedToolIds(text), declared));
  }
  assert.deepEqual(unknown, [], "the skill tells agents to call tools that do not exist");
});

test("matching a reference site uses theme_duplicate only as a scaffold and rebuilds layout, not just colours", async () => {
  const skill = await themeSkill();
  assert.match(skill, /# Part C — Match a reference site/);
  assert.match(skill, /`theme_duplicate`[^.]*scaffold/i);
  for (const rebuilt of ["render/partials/nav.html", "render/pages/pages-default.html", "--container", "--font-display", "css/theme.css"]) {
    assert.ok(skill.includes(rebuilt), `Part C must name ${rebuilt} as something it rewrites`);
  }
  assert.match(skill, /web_fetch_page[^\n]*format: "raw"/);
});

test("the compare loop is mandatory: source and own page, desktop and mobile, capped rounds, never done without a capture", async () => {
  const skill = await themeSkill();
  assert.match(skill, /`web_screenshot_page \{ url[^`]*viewport: "desktop"/);
  assert.match(skill, /`web_screenshot_page \{ sitePath[^`]*viewport: "mobile"/);
  assert.match(skill, /up to 3 rounds/i);
  assert.match(skill, /Never report the theme done without a capture of its own page/);
});

test("the header menu is wired by the menu marker's id, the way static themes resolve menus", async () => {
  const skill = await themeSkill();
  assert.match(skill, /"type":"menu","id":"<menu id>"/);
  assert.match(skill, /`menus_assign_location` does not place a menu in a static theme/);
});

test("site-import hands its theme step to tovu-theme and keeps no duplicate-and-tweak recipe", async () => {
  const skill = await readFile(path.join(IMPORT_SKILL_DIR, "SKILL.md"), "utf8");
  const extraction = await readFile(path.join(IMPORT_SKILL_DIR, "references", "theme-extraction.md"), "utf8");
  assert.match(skill, /`agent_plugin_tovu_theme`/);
  assert.match(skill, /content\/agent-plugins\/tovu-theme\/skills\/tovu-theme\/SKILL\.md/);
  assert.match(extraction, /Part C/);
  assert.doesNotMatch(extraction, /Restyle only the copy/);
  assert.doesNotMatch(extraction, /font files with `media_import_from_url`/, "media_import_from_url refuses font files");
});

test("importing the homepage also imports the main menu and the header call-to-action", async () => {
  const skill = await readFile(path.join(IMPORT_SKILL_DIR, "SKILL.md"), "utf8");
  const mapping = await readFile(path.join(IMPORT_SKILL_DIR, "references", "content-mapping.md"), "utf8");
  assert.match(skill, /homepage[^.]*main menu[^.]*header call-to-action/i);
  assert.match(mapping, /"type":"menu","id":"<menu id>"/);
});

test("neither skill gates copying on ownership or the right to copy", async () => {
  for (const dir of [THEME_SKILL_DIR, IMPORT_SKILL_DIR]) {
    for (const { name, text } of await readSkillTree(dir)) {
      assert.doesNotMatch(text, /ownership|right to copy|own the site|permission to copy|never by copying/i, `${dir}/${name}`);
    }
  }
});

test("Part C copies the source's real text, images, logo, brand names and fonts verbatim, never placeholder copy", async () => {
  // Luvira trial (2026-10-08): "The wording, logo and brand belong to Luvira, so I'll fill the
  // layout with fresh text instead of their copy." Owner order: copy verbatim, no rights talk.
  const skill = await themeSkill();
  const partC = skill.slice(skill.indexOf("# Part C"));
  const rule = partC.indexOf("**Copy the source verbatim.**");
  assert.ok(rule >= 0 && rule < partC.indexOf("## C1"), "the verbatim rule must open Part C");
  const ruleText = partC.slice(rule, partC.indexOf("\n\n", rule));
  for (const copied of ["text", "images", "logo", "brand names", "fonts"]) {
    assert.match(ruleText, new RegExp(`\\b${copied.replace(" ", "\\s+")}\\b`), `Part C's verbatim rule must name ${copied}`);
  }
  assert.match(ruleText, /never\s+substitute\s+placeholder/i);
  assert.match(ruleText, /never\s+(comment\s+on|mention)\s+who\s+owns/i);
  assert.match(ruleText, /never\s+ask\s+about\s+rights/i);
  const gate = /(placeholder|dummy|filler|neutral|generic|fresh|original) (text|copy|wording)|lorem ipsum|belongs? to (the source|them|its owner|the site's owner)|their (text|copy|wording|brand)|trademark|copyright|intellectual property|\brights? to\b/i;
  assert.doesNotMatch(partC.replace(/\*\*Copy the source verbatim\.\*\*[^]*?\n\n/, ""), gate);
});

test("fonts are imported into the theme with theme_import_file_from_url; linking the source's font URLs is only the fallback", async () => {
  const skill = await themeSkill();
  const partC = skill.slice(skill.indexOf("# Part C"));
  assert.match(partC, /`theme_import_file_from_url \{[^`]*assets\/fonts\/[^`]*\.woff2/, "C3 must show the font import call");
  assert.match(partC, /@font-face[^\n]*\.\.\/assets\/fonts\//, "the imported file is referenced relative to css/theme.css");
  assert.match(partC, /fall back[^.]*(link|absolute)/i, "linking the source's URLs stays as the fallback");
  assert.doesNotMatch(skill, /no agent-tool\s+path in this product that can move a binary asset/, "URL binaries can now be imported");
});

test("the compare loop sees the theme copy through themeId, never by activating it, and reports cite the saved capture paths", async () => {
  const skill = await themeSkill();
  const partC = skill.slice(skill.indexOf("# Part C"));
  const compareLoop = partC.slice(partC.indexOf("## C4"), partC.indexOf("## C5"));
  for (const viewport of ["desktop", "mobile"]) {
    assert.match(compareLoop, new RegExp(`\`web_screenshot_page \\{ sitePath[^\`]*themeId: <copy id>[^\`]*viewport: "${viewport}"`), `C4 captures the copy at ${viewport} via themeId`);
  }
  assert.doesNotMatch(partC, /needs the copy active|Switch the site to the new theme while I compare|kept the copy inactive/, "activating the copy is no longer how Part C sees it");
  assert.match(partC.slice(partC.indexOf("## C5")), /`savedFiles`/, "C5 cites the saved capture paths");
  const importSkill = await readFile(path.join(IMPORT_SKILL_DIR, "SKILL.md"), "utf8");
  assert.match(importSkill, /`web_screenshot_page` with `themeId`/);
  assert.match(importSkill, /savedFiles/);
});

/**
 * Luvira import (2026-10-08): the copied theme's `footer.html` hard-coded its "Explore" and "Legal"
 * link lists, so the footer never appeared in Admin → Menus. Owner: copying a site means breaking it
 * into modular parts — header and footer partials, every link list a menu rendered through a menu
 * marker, page sections reusing templates.
 */
test("copying a site is modular: every header and footer link list is a menu rendered through a marker, never hard-coded", async () => {
  const skill = await themeSkill();
  const partC = skill.slice(skill.indexOf("# Part C"));
  const rule = partC.indexOf("**Modular, not a flat copy.**");
  assert.ok(rule >= 0 && rule < partC.indexOf("## C1"), "the modular rule must sit above C1");
  const ruleText = partC.slice(rule, partC.indexOf("\n\n", rule));
  for (const part of ["render/partials/nav.html", "render/partials/footer.html", "header nav", "footer column", "legal"]) {
    assert.ok(ruleText.includes(part), `the modular rule must name ${part}`);
  }
  assert.match(ruleText, /every link list[^.]*is a menu/i);
  assert.match(ruleText, /`menus_create_menu`/);
  assert.match(ruleText, /never hard-code a list of links/i);
  assert.match(ruleText, /site name, tagline and contact/i, "brand fields are named, with where they live");
  assert.match(ruleText, /page sections reuse/i);

  const footerStep = partC.slice(partC.indexOf("5. **Footer**"), partC.indexOf("6. **Page shell**"));
  assert.match(footerStep, /`menus_create_menu \{[^`]*slug: "footer-/, "each footer column becomes its own menu");
  assert.match(footerStep, /data-embed-config='\{"type":"menu","id":"footer-/, "the column renders that menu through a marker");
  assert.match(footerStep, /`theme_write_file`[^.]*`theme_edit_file`[^.]*`warning`/, "the write tools' guard is named");
});

test("site-import builds the footer link columns as menus too and hands their slugs to the theme step", async () => {
  const skill = await readFile(path.join(IMPORT_SKILL_DIR, "SKILL.md"), "utf8");
  const mapping = await readFile(path.join(IMPORT_SKILL_DIR, "references", "content-mapping.md"), "utf8");
  const extraction = await readFile(path.join(IMPORT_SKILL_DIR, "references", "theme-extraction.md"), "utf8");
  assert.match(skill, /footer link column[^.]*menu/i);
  const menuSection = mapping.slice(mapping.indexOf("## 9. Menu"), mapping.indexOf("## 10."));
  assert.match(menuSection, /menus_create_menu \{\s*title: "Footer — [^"]+", slug: "footer-/, "a footer column example");
  assert.match(menuSection, /never hard-code/i);
  assert.match(extraction, /footer menus'? slugs/i);
});
