/** Cut #7 (P12): the HTML escapers and the site slug have one owner each, in Jini.
 * `escapeHtml`/`escapeXml` live in `@jini-ai/core/text` and `toSlug` in `@jini-ai/cms/html/site/slug`.
 * The host copies under `platform/html/` were byte-identical forwarders, so they are deleted, not
 * shimmed. This test keeps a forwarding file from coming back under any of the four specifier forms
 * the copies were reached by: `#src/…`, relative with and without `.js`, and Admin's cross-app path.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../../..");
const HTML_DIR = path.join(REPO_ROOT, "apps", "website", "src", "platform", "html");
const SCANNED_ROOTS = ["apps/website/src", "apps/admin/src", "apps/desktop/src", "apps/site-chat/src", "packages"]
  .map(dir => path.join(REPO_ROOT, dir));
const SKIP_DIR_NAMES = new Set(["node_modules", "dist", "build", "coverage"]);
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;
/** Any quoted specifier ending in `platform/html/{escape,slug}` (with or without `.js`), however it is prefixed. */
const OWNER_PATH = /["'`][^"'`\n]*platform\/html\/(?:escape|slug)(?:\.js)?["'`]/;
/** Sibling forms (`./slug.js`, `../escape`) only mean the deleted files inside the platform HTML folder. */
const SIBLING_PATH = /["'`]\.{1,2}\/(?:escape|slug)(?:\.js)?["'`]/;
const SELF = path.resolve(import.meta.filename);

function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return SKIP_DIR_NAMES.has(entry.name) ? [] : sourceFiles(full);
    return SOURCE_FILE.test(entry.name) && full !== SELF ? [full] : [];
  });
}

/** Repo-relative files whose text still names one of the deleted host owners. */
function staleImporters(): string[] {
  return SCANNED_ROOTS.flatMap(root => sourceFiles(root)).filter(file => {
    const text = fs.readFileSync(file, "utf8");
    return OWNER_PATH.test(text) || (file.startsWith(HTML_DIR + path.sep) && SIBLING_PATH.test(text));
  }).map(file => path.relative(REPO_ROOT, file)).sort();
}

test("cut7-no-host-copy: platform/html keeps no escape or slug file", () => {
  for (const name of ["escape.ts", "slug.ts", "escape.js", "slug.js"]) {
    assert.equal(fs.existsSync(path.join(HTML_DIR, name)), false, `platform/html/${name} must stay deleted`);
  }
});

test("cut7-no-stale-specifier: no source reaches the deleted owners by any specifier form", () => {
  assert.deepEqual(staleImporters(), []);
});

test("cut7-scan-sees-all-four-forms: the matcher catches #src, relative, .js and cross-app forms", () => {
  for (const specifier of [
    `"#src/platform/html/escape"`,
    `'../../platform/html/slug.js'`,
    `"../../platform/html/escape"`,
    `"../../../../../website/src/platform/html/slug"`,
  ]) assert.ok(OWNER_PATH.test(`import { x } from ${specifier};`), specifier);
  assert.ok(SIBLING_PATH.test(`import { toSlug } from "../slug.js";`));
  assert.equal(OWNER_PATH.test(`import { toSlug } from "@jini-ai/cms/html/site/slug";`), false);
  assert.equal(OWNER_PATH.test(`import { toSlug } from "./slug.js";`), false);
});
