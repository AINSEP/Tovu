/**
 * @file Theme agent tools — the edges no feature-specific suite reaches: handlers called with no
 * input at all, refusals for a missing rename source / empty rename name / non-static publish
 * listing, a compiled release's unparsable `theme.json` write and trash attempt, and the
 * composition-root contributor. Every case runs through the real registration handler.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { ToolInputError, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";

import { discoverAllBuiltInThemes } from "../theme.js";
import { buildThemesRegistrations, contributeThemesTools, themesDerivedRisk, type ThemeToolDeps } from "../tool-registrations.js";

const SENTINEL = '<link rel="stylesheet" href="../css/styles.css" />';

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Scratch themes root (removed when the test ends): an authored declarative theme and a compiled static release. */
function makeDeps(t: TestContext): { deps: ThemeToolDeps; themesDir: string } {
  const themesDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-theme-tool-edges-"));
  t.after(() => fs.rmSync(themesDir, { recursive: true, force: true }));

  const authored = path.join(themesDir, "authored");
  fs.mkdirSync(path.join(authored, "templates"), { recursive: true });
  fs.writeFileSync(path.join(authored, "theme.json"), JSON.stringify({ id: "authored", name: "Authored", version: "1.0.0", tier: "declarative", engine: 1 }));
  fs.writeFileSync(path.join(authored, "tokens.json"), "{}");
  fs.writeFileSync(path.join(authored, "styles.css"), "body{}");
  for (const name of ["home", "entry"]) fs.writeFileSync(path.join(authored, "templates", `${name}.json`), "{}");

  const compiled = path.join(themesDir, "compiled");
  for (const dir of ["pages", "css", "src"]) fs.mkdirSync(path.join(compiled, dir), { recursive: true });
  const pageHtml = `<!doctype html><html><head>${SENTINEL}</head><body>Compiled</body></html>`;
  const cssContent = "body{margin:0}";
  fs.writeFileSync(path.join(compiled, "pages", "index.html"), pageHtml);
  fs.writeFileSync(path.join(compiled, "css", "styles.css"), cssContent);
  fs.writeFileSync(path.join(compiled, "tokens.json"), "{}");
  fs.writeFileSync(path.join(compiled, "src", "styles.css"), "a{}");
  fs.writeFileSync(
    path.join(compiled, "theme.json"),
    JSON.stringify({
      id: "compiled", name: "Compiled", version: "1.0.0", tier: "static", engine: 1, author: "Aurora Themes Co.",
      build: {
        source: "compiled", sourceDir: "src",
        artifactHashes: { "pages/index.html": sha256(pageHtml), "css/styles.css": sha256(cssContent), "tokens.json": sha256("{}") },
      },
    })
  );

  const deps: ThemeToolDeps = {
    workspaceId: "ws-edges",
    resolveActiveThemeId: async () => "",
    authorize: async () => ({ allowed: true, reason: "matched" }),
    themes: discoverAllBuiltInThemes({ dir: themesDir, source: "site" }),
    themesDir,
  };
  return { deps, themesDir };
}

function handler(deps: ThemeToolDeps, toolId: string): ToolRegistration["handler"] {
  const registration = buildThemesRegistrations(deps).find((r) => r.descriptor.id === toolId);
  assert.ok(registration, `${toolId} must be wired`);
  return registration.handler;
}

function ctx(input: Record<string, unknown> | undefined): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: "principal-1" }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

test("sanity: both fixture themes load valid", (t) => {
  const { deps } = makeDeps(t);
  assert.deepEqual(deps.themes.map((theme) => [theme.manifest.id, theme.status, theme.errors]).sort(), [
    ["authored", "valid", []],
    ["compiled", "valid", []],
  ]);
});

test("preview_reload with no input at all refreshes the whole preview", async (t) => {
  const { deps } = makeDeps(t);
  const result = (await handler(deps, "preview_reload")(ctx(undefined))) as { reloaded: boolean; path?: string; revision: string };
  assert.equal(result.reloaded, true);
  assert.equal(result.path, undefined);
  assert.equal(typeof result.revision, "string");
});

test("theme_rescan with no input at all rescans and reports no changes", async (t) => {
  const { deps } = makeDeps(t);
  assert.deepEqual(await handler(deps, "theme_rescan")(ctx(undefined)), { added: [], removed: [], invalid: [] });
});

test("theme_list with no input at all lists every theme unfiltered", async (t) => {
  const { deps } = makeDeps(t);
  const result = (await handler(deps, "theme_list")(ctx(undefined))) as { themes: Array<{ id: string }> };
  assert.deepEqual(result.themes.map((theme) => theme.id).sort(), ["authored", "compiled"]);
});

test("theme_list_page_publications refuses a non-static theme with its tier named", async (t) => {
  const { deps } = makeDeps(t);
  await assert.rejects(
    () => handler(deps, "theme_list_page_publications")(ctx({ themeId: "authored" })),
    (error: unknown) =>
      error instanceof ToolInputError &&
      error.message === "theme 'authored' is tier 'declarative' — publish state only applies to static-tier themes"
  );
});

test("theme_rename_file refuses an empty name as a missing input before touching disk", async (t) => {
  const { deps, themesDir } = makeDeps(t);
  await assert.rejects(
    () => handler(deps, "theme_rename_file")(ctx({ themeId: "authored", path: "styles.css", name: "" })),
    (error: unknown) => error instanceof ToolInputError && error.message === "'name' (non-empty string) is required"
  );
  assert.equal(fs.existsSync(path.join(themesDir, "authored", "styles.css")), true);
});

test("theme_rename_file refuses a source file that does not exist", async (t) => {
  const { deps, themesDir } = makeDeps(t);
  await assert.rejects(
    () => handler(deps, "theme_rename_file")(ctx({ themeId: "authored", path: "missing.css", name: "other.css" })),
    /file 'missing\.css' does not exist in this theme/
  );
  assert.equal(fs.existsSync(path.join(themesDir, "authored", "other.css")), false);
});

test("theme_write_file refuses an unparsable theme.json for a compiled release and leaves it untouched", async (t) => {
  const { deps, themesDir } = makeDeps(t);
  const target = path.join(themesDir, "compiled", "theme.json");
  const before = fs.readFileSync(target, "utf8");
  await assert.rejects(
    () => handler(deps, "theme_write_file")(ctx({ themeId: "compiled", path: "theme.json", content: "{ not json" })),
    /a compiled release's write boundary is read-only and requires a valid theme\.json/
  );
  assert.equal(fs.readFileSync(target, "utf8"), before);
});

test("theme_trash_file refuses a compiled release's source file: there is no writable trash location", async (t) => {
  const { deps, themesDir } = makeDeps(t);
  await assert.rejects(
    () => handler(deps, "theme_trash_file")(ctx({ themeId: "compiled", path: "src/styles.css" })),
    /'src\/styles\.css' cannot be trashed: this theme is a built release with no writable location outside build\.sourceDir\/theme\.json to move a trashed file into/
  );
  assert.equal(fs.existsSync(path.join(themesDir, "compiled", "src", "styles.css")), true);
  assert.equal(fs.existsSync(path.join(themesDir, "compiled", ".trash")), false);
});

test("contributeThemesTools hands the composition root the themes builder and its derived risk", () => {
  assert.deepEqual(contributeThemesTools(), { domain: "themes", build: buildThemesRegistrations, risk: themesDerivedRisk });
});

test("theme_rename_file keeps a nested file in its own folder", async (t) => {
  const { deps, themesDir } = makeDeps(t);
  fs.mkdirSync(path.join(themesDir, "authored", "css"));
  fs.writeFileSync(path.join(themesDir, "authored", "css", "extra.css"), "p{}");
  await handler(deps, "theme_rename_file")(ctx({ themeId: "authored", path: "css/extra.css", name: "renamed.css" }));
  assert.equal(fs.readFileSync(path.join(themesDir, "authored", "css", "renamed.css"), "utf8"), "p{}");
  assert.equal(fs.existsSync(path.join(themesDir, "authored", "css", "extra.css")), false);
});
