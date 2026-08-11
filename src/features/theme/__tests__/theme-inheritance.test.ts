import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadTheme } from "../theme";

/**
 * @file Single-level theme inheritance — `theme.json`'s `parent`.
 *
 * Run against the REAL `basic-child` theme on disk, not fixtures. The whole claim being made is
 * "a child ships almost nothing and still renders like its parent", and a fixture child built by
 * the same author as the test proves only that the merge does what its author expected. The real
 * child's value is that it ships exactly two files.
 */

const THEMES = path.resolve(import.meta.dirname, "../../../themes/static");

function load(id: string) {
  return loadTheme({ themeDir: path.join(THEMES, id), id, source: "built-in" });
}

test("a child theme loads valid while shipping only a manifest and one layout", () => {
  const child = load("basic-child");
  assert.deepEqual(child.errors, []);
  assert.equal(child.status, "valid");
});

test("the child inherits every page it did not override", () => {
  const parent = load("basic");
  const child = load("basic-child");

  for (const pageId of Object.keys(parent.pages)) {
    assert.ok(child.pages[pageId] !== undefined, `child must inherit page '${pageId}'`);
  }
  // And its own layout is additive, not a replacement for the set.
  assert.ok(child.pages["page-shell"] !== undefined, "the child's own layout must be present");
  assert.equal(parent.pages["page-shell"], undefined, "and must NOT leak back into the parent");
});

test("the child inherits the parent's partials — this is what keeps the fork small", () => {
  // The argument for forking a layout at all rests on this: the forked file is structure, and the
  // nav/footer CONTENT still arrives from the parent and keeps updating.
  const parent = load("basic");
  const child = load("basic-child");
  assert.deepEqual(Object.keys(child.partials).sort(), Object.keys(parent.partials).sort());
  assert.equal(child.partials.nav, parent.partials.nav);
});

test("tokens and slots fall through, so a child restating nothing still themes correctly", () => {
  const parent = load("basic");
  const child = load("basic-child");
  assert.deepEqual(child.tokens, parent.tokens);
  assert.deepEqual(child.manifest.slots, parent.manifest.slots);
  assert.equal(child.manifest.defaultMode, parent.manifest.defaultMode);
});

test("css is APPENDED to the parent's, never replaced", () => {
  // A child overriding via the cascade must not pay for it with the parent's entire stylesheet —
  // that would make `.site-footer { display: none }` cost more than forking the layout did.
  const parent = load("basic");
  const child = load("basic-child");
  assert.ok(child.css.startsWith(parent.css), "the parent's stylesheet must come first and intact");
});

test("the child's own postTemplate wins over the parent's", () => {
  const child = load("basic-child");
  assert.equal(child.manifest.postTemplate?.[0], "page-shell.html");
});

/** Build a throwaway theme tree under `os.tmpdir()` and hand back its child dir. Real directories
 * rather than mocks, because `loadTheme` resolves a parent off the filesystem by sibling path —
 * mocking that away would test the mock. */
function scratchChild(manifest: Record<string, unknown>, siblings: Record<string, unknown> = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-theme-inherit-"));
  const childDir = path.join(root, "kid");
  fs.mkdirSync(path.join(childDir, "pages"), { recursive: true });
  fs.writeFileSync(path.join(childDir, "theme.json"), JSON.stringify({ id: "kid", tier: "static", ...manifest }));
  fs.writeFileSync(path.join(childDir, "pages", "index.html"), "<!doctype html><html><body>kid</body></html>");
  fs.writeFileSync(path.join(childDir, "tokens.json"), "{}");

  for (const [id, sibling] of Object.entries(siblings)) {
    const dir = path.join(root, id);
    fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
    fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify({ id, tier: "static", ...(sibling as object) }));
    fs.writeFileSync(path.join(dir, "pages", "index.html"), `<!doctype html><html><body>${id}</body></html>`);
    fs.writeFileSync(path.join(dir, "tokens.json"), "{}");
  }
  return childDir;
}

test("a missing parent fails the theme loudly rather than silently rendering unstyled", () => {
  // The failure that must never be quiet: a child whose parent is absent has no nav, no footer, no
  // CSS and no tokens. Degrading would serve an unstyled page that still returns 200.
  const dir = scratchChild({ parent: "nope" });
  const theme = loadTheme({ themeDir: dir, id: "kid", source: "built-in" });

  assert.equal(theme.status, "invalid");
  assert.ok(
    theme.errors.some((e) => e.includes("nope") && e.includes("not found")),
    `error must name the missing parent — got ${JSON.stringify(theme.errors)}`
  );
});

test("a chain is refused — inheritance is exactly one level", () => {
  const dir = scratchChild({ parent: "mid" }, { mid: { parent: "top" }, top: {} });
  const theme = loadTheme({ themeDir: dir, id: "kid", source: "built-in" });

  assert.equal(theme.status, "invalid");
  assert.ok(
    theme.errors.some((e) => e.includes("one level")),
    `error must say why, not just fail — got ${JSON.stringify(theme.errors)}`
  );
});

test("a broken parent invalidates the child, attributed to the parent", () => {
  // Otherwise the child reports errors about files it does not contain, and an author edits the
  // wrong theme looking for them.
  const dir = scratchChild({ parent: "busted" }, { busted: { defaultMode: "dark", modes: ["light"] } });
  const theme = loadTheme({ themeDir: dir, id: "kid", source: "built-in" });

  assert.equal(theme.status, "invalid");
  assert.ok(
    theme.errors.some((e) => e.startsWith("parent 'busted':")),
    `error must be attributed to the parent — got ${JSON.stringify(theme.errors)}`
  );
});
