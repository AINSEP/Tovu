/**
 * @file The Marketplace nav entry's wiring, checked as source text — this repo has no DOM runner
 * for `.tsx` (see `use-add-site.hooks.test.ts`'s own header). Marketplace has no bespoke JSX of its
 * own: the top nav renders every `visibleSections()` entry through the existing `NavLink`, and
 * `NavLink` already disables (`aria-disabled` + `tabIndex={-1}`, never the native `disabled`
 * attribute, per its own doc) every section but `projects`. So the only wiring worth a regression
 * guard is the DATA: that `marketplace` exists in the registry as a visible, tool-less section, that
 * it has its own icon, and that the generic disable rule in `App.tsx` still covers every id but
 * `projects` — i.e. nobody special-cased Marketplace into being clickable.
 *
 * Every assertion runs against COMMENT-STRIPPED source, same discipline `site-card-menu-wiring.test.ts`
 * uses — this file's own doc comments discuss `aria-disabled`, `NavLink` and `tabIndex` by name, and
 * a naive substring match would pass on the prose instead of the code.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function withoutComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const sectionsSource = fs.readFileSync(path.join(here, "..", "contracts", "sections.ts"), "utf8");
const sections = withoutComments(sectionsSource);

const iconsSource = fs.readFileSync(path.join(here, "icons.tsx"), "utf8");
const icons = withoutComments(iconsSource);

const appSource = fs.readFileSync(path.join(here, "App.tsx"), "utf8");
const app = withoutComments(appSource);

/** The `marketplace` entry's own object literal within `RUNNER_SECTIONS`, so a match cannot be
 *  satisfied by a sibling section that happens to share a field value. */
function marketplaceEntry() {
  const start = sections.indexOf("id: 'marketplace'");
  assert.notEqual(start, -1, "no 'marketplace' entry in RUNNER_SECTIONS");
  const objectStart = sections.lastIndexOf("{", start);
  const objectEnd = sections.indexOf("},", start);
  return sections.slice(objectStart, objectEnd);
}

test("marketplace is a registered RunnerSectionId", () => {
  assert.match(sections, /export type RunnerSectionId =[\s\S]*?\|\s*'marketplace'/);
});

test("marketplace is visible (not hidden) and grants no tools yet", () => {
  const entry = marketplaceEntry();
  assert.doesNotMatch(entry, /hidden:\s*true/, "Marketplace must render in the nav, not be parked hidden");
  assert.match(entry, /tools:\s*\[\s*\]/, "Marketplace has nothing built yet, so it must own zero desktop.* tools");
  assert.match(entry, /label:\s*'Marketplace'/);
});

test("marketplace has its own nav icon, not a reused one", () => {
  assert.match(icons, /marketplace:\s*\(/, "icons.tsx must key an icon under 'marketplace'");
});

test("the generic disable rule still covers every section but projects — no Marketplace special-case", () => {
  // This is the line that actually grays Marketplace out. If someone ever rewrites it as an
  // allowlist or adds an `id === 'marketplace' ? false :` carve-out, this must fail.
  assert.match(app, /disabled=\{section\.id !== 'projects'\}/);
});

test("NavLink never fires onSelectSection for a disabled entry", () => {
  const start = app.indexOf("function NavLink(");
  assert.notEqual(start, -1, "NavLink is gone");
  const rest = app.slice(start);
  const end = rest.indexOf("\nfunction ");
  const body = end === -1 ? rest : rest.slice(0, end);
  assert.match(body, /onClick=\{\(\) => \{\s*if \(disabled\) return;\s*onSelectSection\(section\.id\);\s*\}\}/);
  // Disabled state must use aria-disabled + tabIndex, never the native `disabled` attribute — the
  // native one would also kill the hover/focus tooltip that is the ONLY place an unbuilt section's
  // name is written (see NavLink's own doc comment).
  assert.match(body, /aria-disabled=\{disabled \|\| undefined\}/);
  assert.match(body, /tabIndex=\{disabled \? -1 : undefined\}/);
  assert.doesNotMatch(body, /<button\s+type="button"\s+disabled(?!=)/, "must not use the native disabled attribute");
});
