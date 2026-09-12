import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { discoverAllBuiltInThemes, THEME_CATALOG_DIR } from "../../features/theme/index.js";
import type { RouteDeps } from "../../server/routes/types.js";
import { buildAssistantToolRegistrations } from "../tool-registrations.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { contributeThemesTools } from "../../features/theme/tool-registrations.js";
import { registerToolContributor } from "../tool-contribution-registry.js";

resetToolContributorsForTests();
registerToolContributor(contributeThemesTools());

/**
 * @file `theme_reset_file` and `theme_copy_file` — the last two gaps
 * `ADS-memory/reports/2026-09-12-theme-agent-tools-survey.md` found between the human Explore
 * screen's per-file operations and this domain's agent-tool catalog. `theme_write_file`/
 * `theme_edit_file`/`theme_rename_file` already have their own suites; this file covers only what
 * is NEW here:
 *
 * - `theme_reset_file`'s two DISTINCT "nothing to reset from" refusals (no catalog at all vs. a
 *   catalog that exists but never had this file), a successful reset overwriting the live file with
 *   the catalog's bytes exactly, and that it shares `theme_write_file`'s own generated-tree/trash
 *   refusals via `assertThemeFileWritable` rather than re-deriving them.
 * - `theme_copy_file`'s server-computed destination naming (including the collision LOOP running
 *   more than once), a missing source, and the identical generated-tree/trash refusals.
 * - Both tools' `../` containment refusal, proving neither can reach a SIBLING theme's files —
 *   the per-call half of this domain's site-scoping argument (the other half, one `themesDir` per
 *   server process, cannot be exercised from inside one process; see the survey's own Section D).
 */

const WORKSPACE_ID = "ws-themes-reset-copy";
const PRINCIPAL_ID = "principal-under-test";

const PLAIN_MANIFEST = JSON.stringify({ id: "plain", name: "Plain", version: "1.0.0", tier: "static", engine: 1 });
const NO_ORIGINAL_MANIFEST = JSON.stringify({ id: "no-original", name: "No Original", version: "1.0.0", tier: "static", engine: 1 });
const COMPILED_MANIFEST = JSON.stringify({
  id: "compiled",
  name: "Compiled",
  version: "1.0.0",
  tier: "static",
  engine: 1,
  build: { source: "compiled", sourceDir: "src", artifactHashes: {} },
});

/**
 * Four themes under one root:
 * - `plain`: has a catalog original. Its live `tokens.json` has DIVERGED from that original (proving
 *   reset overwrites rather than no-ops), and it carries an `author-added.txt` with no catalog
 *   counterpart (proving the per-file "not in original" refusal). `pages/about.html` and
 *   `pages/about-1.html` both already exist, so copying `pages/about.html` must land on `-2`.
 * - `no-original`: has NO catalog directory at all (proving the whole-theme "no stored original"
 *   refusal).
 * - `compiled`: a built theme (ADR-020 §5) whose `pages/index.html` is generated-readonly (proving
 *   both tools refuse a built theme's generated tree rather than attempting anything with it).
 */
function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-themes-reset-copy-"));

  const plain = path.join(root, "static", "plain");
  fs.mkdirSync(path.join(plain, "pages"), { recursive: true });
  fs.writeFileSync(path.join(plain, "theme.json"), PLAIN_MANIFEST, "utf8");
  fs.writeFileSync(path.join(plain, "tokens.json"), '{"--ink":"#111"}', "utf8");
  fs.writeFileSync(path.join(plain, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
  fs.writeFileSync(path.join(plain, "pages", "about.html"), "<html><body>about</body></html>", "utf8");
  fs.writeFileSync(path.join(plain, "pages", "about-1.html"), "<html><body>already taken</body></html>", "utf8");
  fs.writeFileSync(path.join(plain, "author-added.txt"), "added after install, not in the original", "utf8");
  // A previously-trashed file, exactly as `theme_trash_file` would leave one — used to prove reset
  // and copy both refuse it the same way `theme_write_file`/`theme_edit_file` already do.
  fs.mkdirSync(path.join(plain, ".trash", "1700000000000"), { recursive: true });
  fs.writeFileSync(path.join(plain, ".trash", "1700000000000", "old.css"), "body{color:red}", "utf8");

  const plainCatalog = path.join(root, THEME_CATALOG_DIR, "static", "plain");
  fs.mkdirSync(path.join(plainCatalog, "pages"), { recursive: true });
  fs.writeFileSync(path.join(plainCatalog, "theme.json"), PLAIN_MANIFEST, "utf8");
  fs.writeFileSync(path.join(plainCatalog, "tokens.json"), '{"--ink":"#000"}', "utf8");
  fs.writeFileSync(path.join(plainCatalog, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
  // Deliberately no `author-added.txt` and no `pages/about-1.html` in the catalog.

  const noOriginal = path.join(root, "static", "no-original");
  fs.mkdirSync(path.join(noOriginal, "pages"), { recursive: true });
  fs.writeFileSync(path.join(noOriginal, "theme.json"), NO_ORIGINAL_MANIFEST, "utf8");
  fs.writeFileSync(path.join(noOriginal, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(noOriginal, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
  // No `__original-themes__/static/no-original` directory at all.

  const compiled = path.join(root, "static", "compiled");
  fs.mkdirSync(path.join(compiled, "pages"), { recursive: true });
  fs.mkdirSync(path.join(compiled, "src"), { recursive: true });
  fs.writeFileSync(path.join(compiled, "theme.json"), COMPILED_MANIFEST, "utf8");
  fs.writeFileSync(path.join(compiled, "pages", "index.html"), "<html><body>generated</body></html>", "utf8");
  fs.writeFileSync(path.join(compiled, "src", "Header.tsx"), "source", "utf8");

  return root;
}

function fakeRouteDeps(options: { allow?: boolean } = {}) {
  const allow = options.allow ?? true;
  const themesDir = makeThemesRoot();
  const authorize = async () => (allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" });
  const deps = {
    workspaceId: WORKSPACE_ID,
    themes: discoverAllBuiltInThemes({ dir: themesDir, source: "built-in" }),
    themesDir,
    authorize,
  };
  return { deps: deps as unknown as RouteDeps, themesDir };
}

function executionContext(input: Record<string, unknown> | undefined): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function wired(deps: RouteDeps, toolId: string): ToolRegistration {
  const found = buildAssistantToolRegistrations(deps).find((r) => r.descriptor.id === toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

function readFile(themesDir: string, themeId: string, relativePath: string): string {
  return fs.readFileSync(path.join(themesDir, "static", themeId, relativePath), "utf8");
}

// ---------------------------------------------------------------------------
// theme_reset_file
// ---------------------------------------------------------------------------

test("theme_reset_file: overwrites a diverged live file with the catalog's original bytes", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const result = (await wired(deps, "theme_reset_file").handler(
    executionContext({ themeId: "plain", path: "tokens.json" })
  )) as { path: string; content: string; bytesWritten: number; status: string };

  assert.equal(result.path, "tokens.json");
  assert.equal(result.content, '{"--ink":"#000"}', "the ORIGINAL bytes, not the diverged live ones");
  assert.equal(result.bytesWritten, '{"--ink":"#000"}'.length);
  assert.equal(readFile(themesDir, "plain", "tokens.json"), '{"--ink":"#000"}');
});

test("theme_reset_file: a theme with no stored original at all is refused, and nothing is touched", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const before = readFile(themesDir, "no-original", "tokens.json");
  await assert.rejects(
    () => wired(deps, "theme_reset_file").handler(executionContext({ themeId: "no-original", path: "tokens.json" })),
    /has no stored original/
  );
  assert.equal(readFile(themesDir, "no-original", "tokens.json"), before);
});

test("theme_reset_file: a file the author added after install has no catalog counterpart and is refused", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const before = readFile(themesDir, "plain", "author-added.txt");
  await assert.rejects(
    () => wired(deps, "theme_reset_file").handler(executionContext({ themeId: "plain", path: "author-added.txt" })),
    /is not in this theme's original/
  );
  assert.equal(readFile(themesDir, "plain", "author-added.txt"), before, "a refused reset must not touch disk");
});

test("theme_reset_file: a built theme's generated-readonly file is refused outright — no whole-tree revert is offered here", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const before = readFile(themesDir, "compiled", "pages/index.html");
  await assert.rejects(
    () => wired(deps, "theme_reset_file").handler(executionContext({ themeId: "compiled", path: "pages/index.html" })),
    /read-only/
  );
  assert.equal(readFile(themesDir, "compiled", "pages/index.html"), before);
});

test("theme_reset_file: a path inside .trash/ is refused — restore it first", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const trashedPath = ".trash/1700000000000/old.css";
  await assert.rejects(
    () => wired(deps, "theme_reset_file").handler(executionContext({ themeId: "plain", path: trashedPath })),
    /inside the trash/
  );
  assert.equal(fs.existsSync(path.join(themesDir, "static", "plain", trashedPath)), true);
});

test("theme_reset_file refuses when authorize() denies, and never touches disk", async () => {
  const { deps, themesDir } = fakeRouteDeps({ allow: false });
  const before = readFile(themesDir, "plain", "tokens.json");
  await assert.rejects(
    () => wired(deps, "theme_reset_file").handler(executionContext({ themeId: "plain", path: "tokens.json" })),
    /not authorized/
  );
  assert.equal(readFile(themesDir, "plain", "tokens.json"), before);
});

test("theme_reset_file refuses a ../ escape into a sibling theme's folder, leaving it untouched", async () => {
  // The catalog READ this handler does first (`readOriginalForToolReset`) resolves `path` against the
  // CATALOG copy of `plain`, through the identical `resolveThemeFilePath` containment check every
  // other path in this domain goes through — so `../compiled/theme.json` is refused there, before
  // `writeThemeFile`'s own (separately contained) live-theme write is ever reached. The refusal
  // surfaces as "not in this theme's original", not "outside the theme folder": this handler maps
  // ANY containment failure from the catalog read the same way, matching `explore.ts`'s own
  // `readOriginalForReset` (its NOT_IN_ORIGINAL branch does the identical catch-all). The wording
  // differs from the read/write tools' own escape message; the safety property — nothing outside
  // `plain`'s own folder is ever read or written — is the same.
  const { deps, themesDir } = fakeRouteDeps();
  const victim = path.join(themesDir, "static", "compiled", "theme.json");
  const before = fs.readFileSync(victim, "utf8");
  await assert.rejects(
    () => wired(deps, "theme_reset_file").handler(executionContext({ themeId: "plain", path: "../compiled/theme.json" })),
    /is not in this theme's original/
  );
  assert.equal(fs.readFileSync(victim, "utf8"), before, "the sibling theme's file must be untouched");
});

test("theme_reset_file refreshes the live routeDeps.themes entry, matching theme_write_file's live-state coupling", async () => {
  const { deps } = fakeRouteDeps();
  await wired(deps, "theme_reset_file").handler(executionContext({ themeId: "plain", path: "tokens.json" }));
  const live = deps.themes.find((t) => t.manifest.id === "plain");
  assert.equal(live?.status, "valid");
});

// ---------------------------------------------------------------------------
// theme_copy_file
// ---------------------------------------------------------------------------

test("theme_copy_file: duplicates a file under the next available name, byte-for-byte", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const result = (await wired(deps, "theme_copy_file").handler(
    executionContext({ themeId: "plain", path: "tokens.json" })
  )) as { path: string; copiedFrom: string };

  assert.equal(result.path, "tokens-1.json");
  assert.equal(result.copiedFrom, "tokens.json");
  assert.equal(readFile(themesDir, "plain", "tokens-1.json"), '{"--ink":"#111"}');
  // The original is untouched by its own copy.
  assert.equal(readFile(themesDir, "plain", "tokens.json"), '{"--ink":"#111"}');
});

test("theme_copy_file: when 'name-1' is already taken, the collision loop runs again and lands on '-2'", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const result = (await wired(deps, "theme_copy_file").handler(
    executionContext({ themeId: "plain", path: "pages/about.html" })
  )) as { path: string };
  assert.equal(result.path, "pages/about-2.html", "about.html and about-1.html both already exist, so the next free suffix is -2");
  assert.equal(readFile(themesDir, "plain", "pages/about-2.html"), "<html><body>about</body></html>");
});

test("theme_copy_file: a source path that does not exist in the theme is refused", async () => {
  const { deps } = fakeRouteDeps();
  await assert.rejects(
    () => wired(deps, "theme_copy_file").handler(executionContext({ themeId: "plain", path: "pages/nope.html" })),
    /was not found in this theme/
  );
});

test("theme_copy_file: a built theme's generated-readonly file is refused", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  await assert.rejects(
    () => wired(deps, "theme_copy_file").handler(executionContext({ themeId: "compiled", path: "pages/index.html" })),
    /read-only/
  );
  assert.equal(fs.existsSync(path.join(themesDir, "static", "compiled", "pages", "index-1.html")), false);
});

test("theme_copy_file: a path inside .trash/ is refused — copying a trashed file would be a second, unaudited way out of the trash", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  await assert.rejects(
    () => wired(deps, "theme_copy_file").handler(executionContext({ themeId: "plain", path: ".trash/1700000000000/old.css" })),
    /inside the trash/
  );
  assert.equal(fs.existsSync(path.join(themesDir, "static", "plain", "old.css")), false);
});

test("theme_copy_file refuses when authorize() denies, and never touches disk", async () => {
  const { deps, themesDir } = fakeRouteDeps({ allow: false });
  await assert.rejects(
    () => wired(deps, "theme_copy_file").handler(executionContext({ themeId: "plain", path: "tokens.json" })),
    /not authorized/
  );
  assert.equal(fs.existsSync(path.join(themesDir, "static", "plain", "tokens-1.json")), false);
});

test("theme_copy_file refuses a ../ escape into a sibling theme's folder, and creates nothing there", async () => {
  // `existingPaths` comes from `listThemeFiles`, a bounded walk of `plain`'s OWN folder that never
  // descends outside it (theme-files.test.ts's own escape/symlink suite proves that walk directly) —
  // so `"../compiled/theme.json"` is simply never a member of that set, and the source-existence
  // check refuses it before `copyThemeFile`'s own (separately contained) filesystem resolution is
  // ever reached. Different refusal message than the read/write tools' direct escape check
  // ("outside the theme folder"), same guarantee: nothing outside `plain`'s own folder is read,
  // and nothing is created in the sibling theme's folder.
  const { deps, themesDir } = fakeRouteDeps();
  await assert.rejects(
    () => wired(deps, "theme_copy_file").handler(executionContext({ themeId: "plain", path: "../compiled/theme.json" })),
    /was not found in this theme/
  );
  assert.equal(fs.existsSync(path.join(themesDir, "static", "compiled", "theme-1.json")), false);
});

test("theme_copy_file refreshes the live routeDeps.themes entry, and the copy shows up in a subsequent listing", async () => {
  const { deps } = fakeRouteDeps();
  await wired(deps, "theme_copy_file").handler(executionContext({ themeId: "plain", path: "tokens.json" }));
  const filesAfter = (await wired(deps, "theme_list_files").handler(executionContext({ themeId: "plain" }))) as { files: string[] };
  assert.ok(filesAfter.files.includes("tokens-1.json"));
});
