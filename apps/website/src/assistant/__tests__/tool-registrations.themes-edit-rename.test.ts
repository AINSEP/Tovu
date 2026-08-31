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
 * @file `theme_edit_file` and `theme_rename_file` — the two new agent tools closing the
 * theme-catalog gap that pushed the assistant to raw shell commands for a one-line CSS edit and a
 * file rename (see this task's own brief). `theme_write_file` already has its own full suite
 * (`tool-registrations.themes.test.ts`); this file covers only what is NEW here:
 *
 * - `theme_edit_file`'s old-string/new-string contract: zero matches refused, an ambiguous match
 *   refused unless `replaceAll`, a successful edit leaving the REST of the file byte-identical.
 * - `theme_rename_file` sharing `validateFileIdentityChange` with `explore.ts`'s HTTP rename
 *   route — the required-file lock, the `script`/`other` identity lock, and the
 *   extension-change refusal, proven the SAME way that gate is proven elsewhere: by outcome, not
 *   by asserting the shared function was called.
 */

const WORKSPACE_ID = "ws-themes-edit-rename";
const PRINCIPAL_ID = "principal-under-test";

const STATIC_MANIFEST = JSON.stringify({ id: "plain", name: "Plain", version: "1.0.0", tier: "static", engine: 1 }, null, 2);

/** A v1-layout static theme (`pagesDir: "pages"`, `stylesheetFilename: "styles.css"` — see
 *  `theme-layout.ts`'s `V1_LAYOUT`) with one page, one style, one script, and one `.md`
 *  ("other"-group) file — enough surface to exercise both tools' full range of refusal reasons. */
function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-themes-edit-rename-"));
  const dir = path.join(root, "plain");
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.writeFileSync(path.join(dir, "theme.json"), STATIC_MANIFEST, "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), '{"--ink":"#000"}', "utf8");
  fs.writeFileSync(path.join(dir, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
  fs.writeFileSync(
    path.join(dir, "styles.css"),
    "body{padding:0}\n.card{padding:0}\n",
    "utf8"
  );
  fs.writeFileSync(path.join(dir, "main.js"), "console.log('hi')", "utf8");
  fs.writeFileSync(path.join(dir, "NOTES.md"), "# notes", "utf8");
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

function readFile(themesDir: string, relativePath: string): string {
  return fs.readFileSync(path.join(themesDir, "plain", relativePath), "utf8");
}

// ---------------------------------------------------------------------------
// theme_edit_file
// ---------------------------------------------------------------------------

test("theme_edit_file: zero matches is refused, and the file is left untouched", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const before = readFile(themesDir, "styles.css");
  await assert.rejects(
    () => wired(deps, "theme_edit_file").handler(executionContext({ themeId: "plain", path: "styles.css", oldString: "does-not-exist", newString: "x" })),
    /oldString was not found/
  );
  assert.equal(readFile(themesDir, "styles.css"), before);
});

test("theme_edit_file: an ambiguous match (2+ occurrences) is refused when replaceAll is left false", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const before = readFile(themesDir, "styles.css");
  await assert.rejects(
    () => wired(deps, "theme_edit_file").handler(executionContext({ themeId: "plain", path: "styles.css", oldString: "padding:0", newString: "padding:1px" })),
    /matches 2 times/
  );
  assert.equal(readFile(themesDir, "styles.css"), before, "an ambiguous match must not write anything");
});

test("theme_edit_file: replaceAll changes every occurrence of an ambiguous match", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const result = (await wired(deps, "theme_edit_file").handler(
    executionContext({ themeId: "plain", path: "styles.css", oldString: "padding:0", newString: "padding:1px", replaceAll: true })
  )) as { occurrencesReplaced: number; status: string };
  assert.equal(result.occurrencesReplaced, 2);
  assert.equal(result.status, "valid");
  assert.equal(readFile(themesDir, "styles.css"), "body{padding:1px}\n.card{padding:1px}\n");
});

test("theme_edit_file: a unique match is replaced, leaving the rest of the file byte-identical", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const result = (await wired(deps, "theme_edit_file").handler(
    executionContext({ themeId: "plain", path: "styles.css", oldString: ".card{padding:0}", newString: ".card{padding:8px}" })
  )) as { occurrencesReplaced: number };
  assert.equal(result.occurrencesReplaced, 1);
  assert.equal(readFile(themesDir, "styles.css"), "body{padding:0}\n.card{padding:8px}\n", "only the matched substring changes, everything else is byte-identical");
});

test("theme_edit_file: writing invalid JSON via an edit reports status 'invalid', same as theme_write_file", async () => {
  const { deps } = fakeRouteDeps();
  const result = (await wired(deps, "theme_edit_file").handler(
    executionContext({ themeId: "plain", path: "tokens.json", oldString: '{"--ink":"#000"}', newString: "{ not json" })
  )) as { status: string; errors: string[] };
  assert.equal(result.status, "invalid");
  assert.ok(result.errors.some((e) => e.startsWith("tokens.json:")), JSON.stringify(result.errors));
});

test("theme_edit_file: a script (.js) file is editable — content editability has no group-based restriction, matching theme_write_file", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const result = (await wired(deps, "theme_edit_file").handler(
    executionContext({ themeId: "plain", path: "main.js", oldString: "'hi'", newString: "'bye'" })
  )) as { occurrencesReplaced: number };
  assert.equal(result.occurrencesReplaced, 1);
  assert.equal(readFile(themesDir, "main.js"), "console.log('bye')");
});

test("theme_edit_file refuses when authorize() denies, and never reads or writes", async () => {
  const { deps, themesDir } = fakeRouteDeps({ allow: false });
  const before = readFile(themesDir, "styles.css");
  await assert.rejects(
    () => wired(deps, "theme_edit_file").handler(executionContext({ themeId: "plain", path: "styles.css", oldString: "x", newString: "y" })),
    /not authorized/
  );
  assert.equal(readFile(themesDir, "styles.css"), before);
});

// ---------------------------------------------------------------------------
// theme_rename_file
// ---------------------------------------------------------------------------

test("theme_rename_file: renames an ordinary style file within the same folder", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const result = (await wired(deps, "theme_rename_file").handler(
    executionContext({ themeId: "plain", path: "styles.css", name: "main.css" })
  )) as { path: string; renamedFrom: string };
  assert.equal(result.path, "main.css");
  assert.equal(result.renamedFrom, "styles.css");
  assert.equal(fs.existsSync(path.join(themesDir, "plain", "styles.css")), false);
  assert.equal(readFile(themesDir, "main.css"), "body{padding:0}\n.card{padding:0}\n");
});

test("theme_rename_file: renaming to the same name is a no-op, not a NAME_TAKEN collision against itself", async () => {
  const { deps } = fakeRouteDeps();
  const result = (await wired(deps, "theme_rename_file").handler(
    executionContext({ themeId: "plain", path: "styles.css", name: "styles.css" })
  )) as { path: string; renamedFrom: string };
  assert.equal(result.path, "styles.css");
  assert.equal(result.renamedFrom, "styles.css");
});

test("theme_rename_file: a required file (theme.json) is refused — renaming it would invalidate the theme", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  await assert.rejects(
    () => wired(deps, "theme_rename_file").handler(executionContext({ themeId: "plain", path: "theme.json", name: "config.json" })),
    /cannot be renamed/
  );
  assert.equal(fs.existsSync(path.join(themesDir, "plain", "theme.json")), true);
});

test("theme_rename_file: a script (.js) file is refused — content is editable but identity is locked", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  await assert.rejects(
    () => wired(deps, "theme_rename_file").handler(executionContext({ themeId: "plain", path: "main.js", name: "app.js" })),
    /read-only in Explore and cannot be renamed/
  );
  assert.equal(fs.existsSync(path.join(themesDir, "plain", "main.js")), true);
});

test("theme_rename_file: an 'other'-group file (.md) is refused", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  await assert.rejects(
    () => wired(deps, "theme_rename_file").handler(executionContext({ themeId: "plain", path: "NOTES.md", name: "README.md" })),
    /read-only in Explore and cannot be renamed/
  );
  assert.equal(fs.existsSync(path.join(themesDir, "plain", "NOTES.md")), true);
});

test("theme_rename_file: changing the extension is refused even for an otherwise-writable file", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  await assert.rejects(
    () => wired(deps, "theme_rename_file").handler(executionContext({ themeId: "plain", path: "styles.css", name: "styles.html" })),
    /would change its extension/
  );
  assert.equal(fs.existsSync(path.join(themesDir, "plain", "styles.css")), true);
});

test("theme_rename_file: a name that already exists in the folder is refused (checked before the extension rule)", async () => {
  const { deps } = fakeRouteDeps();
  await assert.rejects(
    () => wired(deps, "theme_rename_file").handler(executionContext({ themeId: "plain", path: "styles.css", name: "tokens.json" })),
    /already exists in this theme/
  );
});

test("theme_rename_file: a path-shaped name (containing '/') is refused as a shape error, not attempted as a move", async () => {
  const { deps } = fakeRouteDeps();
  await assert.rejects(
    () => wired(deps, "theme_rename_file").handler(executionContext({ themeId: "plain", path: "styles.css", name: "sub/styles.css" })),
    /must be a plain filename/
  );
});

test("theme_rename_file refuses when authorize() denies, and never touches disk", async () => {
  const { deps, themesDir } = fakeRouteDeps({ allow: false });
  await assert.rejects(
    () => wired(deps, "theme_rename_file").handler(executionContext({ themeId: "plain", path: "styles.css", name: "main.css" })),
    /not authorized/
  );
  assert.equal(fs.existsSync(path.join(themesDir, "plain", "styles.css")), true);
});

test("theme_rename_file refreshes the live routeDeps.themes entry, matching theme_write_file's live-state coupling", async () => {
  const { deps } = fakeRouteDeps();
  await wired(deps, "theme_rename_file").handler(executionContext({ themeId: "plain", path: "styles.css", name: "main.css" }));
  const live = deps.themes.find((t) => t.manifest.id === "plain");
  assert.equal(live?.status, "valid");
});
