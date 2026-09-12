import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { discoverAllBuiltInThemes } from "../../features/theme/index.js";
import type { RouteDeps } from "../../server/routes/types.js";
import { buildAssistantToolRegistrations } from "../tool-registrations.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { contributeThemesTools } from "../../features/theme/tool-registrations.js";
import { registerToolContributor } from "../tool-contribution-registry.js";

resetToolContributorsForTests();
registerToolContributor(contributeThemesTools());

/**
 * @file `theme_copy_file` — one of the two gaps
 * `ADS-memory/reports/2026-09-12-theme-agent-tools-survey.md` found between the human Explore
 * screen's per-file operations and this domain's agent-tool catalog (`theme_reset_file`, the other
 * gap, is covered in its own commit added right after this one). `theme_write_file`/
 * `theme_edit_file`/`theme_rename_file` already have their own suites; this file covers only what
 * is NEW here:
 *
 * - The server-computed destination naming (including the collision LOOP running more than once),
 *   a missing source, and the generated-tree/trash refusals shared with every other write-shaped
 *   tool in this domain via `assertThemeFileWritable`.
 * - A `../` containment refusal proving the tool cannot reach a SIBLING theme's files — the
 *   per-call half of this domain's site-scoping argument (the other half, one `themesDir` per
 *   server process, cannot be exercised from inside one process; see the survey's own Section D).
 */

const WORKSPACE_ID = "ws-themes-reset-copy";
const PRINCIPAL_ID = "principal-under-test";

const PLAIN_MANIFEST = JSON.stringify({ id: "plain", name: "Plain", version: "1.0.0", tier: "static", engine: 1 });
const COMPILED_MANIFEST = JSON.stringify({
  id: "compiled",
  name: "Compiled",
  version: "1.0.0",
  tier: "static",
  engine: 1,
  build: { source: "compiled", sourceDir: "src", artifactHashes: {} },
});

/**
 * Two themes under one root:
 * - `plain`: `pages/about.html` and `pages/about-1.html` both already exist, so copying
 *   `pages/about.html` must land on `-2`. It also carries a previously-trashed file, used to prove
 *   copy refuses `.trash/...` the same way `theme_write_file`/`theme_edit_file` already do.
 * - `compiled`: a built theme (ADR-020 §5) whose `pages/index.html` is generated-readonly (proving
 *   copy refuses a built theme's generated tree rather than duplicating into it).
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
  // A previously-trashed file, exactly as `theme_trash_file` would leave one — used to prove copy
  // refuses it the same way `theme_write_file`/`theme_edit_file` already do.
  fs.mkdirSync(path.join(plain, ".trash", "1700000000000"), { recursive: true });
  fs.writeFileSync(path.join(plain, ".trash", "1700000000000", "old.css"), "body{color:red}", "utf8");

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
