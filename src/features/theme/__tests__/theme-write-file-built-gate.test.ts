import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/cms/core";

import { discoverAllBuiltInThemes } from "../theme";
import { buildThemesRegistrations, type ThemeToolDeps } from "../tool-registrations";

/**
 * @file ADR-020 §5 (2026-08-12), the AI-authorability half: `theme_write_file` must refuse a write
 * into a BUILT theme's generated tree (`resolveThemeFileWriteScope`, `theme-files.ts`) while leaving
 * every authored theme's behavior — and a compiled theme's `sourceDir`/`theme.json` writes — exactly as
 * before. Exercised through the real tool handler (not the bare pure function) so this proves the wire,
 * not just the policy.
 *
 * The human-editor half — `src/server/routes/admin/themes/explore.ts`'s PUT/reset/copy/rename routes —
 * is covered separately in `src/server/routes/admin/themes/__tests__/explore-built-theme-gate.test.ts`.
 */

const SENTINEL = '<link rel="stylesheet" href="../css/styles.css" />';

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-write-gate-"));

  // An ordinary authored theme — every theme on disk today.
  const authored = path.join(root, "authored");
  fs.mkdirSync(path.join(authored, "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(authored, "theme.json"),
    JSON.stringify({ id: "authored", name: "Authored", version: "1.0.0", tier: "declarative", engine: 1 })
  );
  fs.writeFileSync(path.join(authored, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(authored, "templates", "home.json"), "{}", "utf8");
  fs.writeFileSync(path.join(authored, "templates", "entry.json"), "{}", "utf8");

  // A compiled/built theme: theme.json + src/ (editable), pages/+css/ (generated, read-only).
  const compiled = path.join(root, "compiled");
  fs.mkdirSync(path.join(compiled, "pages"), { recursive: true });
  fs.mkdirSync(path.join(compiled, "css"), { recursive: true });
  fs.mkdirSync(path.join(compiled, "src"), { recursive: true });
  const pageHtml = `<!doctype html><html><head>${SENTINEL}</head><body>Compiled</body></html>`;
  const cssContent = "body{margin:0}";
  fs.writeFileSync(path.join(compiled, "pages", "index.html"), pageHtml, "utf8");
  fs.writeFileSync(path.join(compiled, "css", "styles.css"), cssContent, "utf8");
  fs.writeFileSync(path.join(compiled, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(compiled, "src", "Header.tsx"), "export const Header = () => null;", "utf8");
  fs.writeFileSync(
    path.join(compiled, "theme.json"),
    JSON.stringify({
      id: "compiled",
      name: "Compiled",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      author: "Aurora Themes Co.",
      build: {
        source: "compiled",
        sourceDir: "src",
        artifactHashes: { "pages/index.html": sha256(pageHtml), "css/styles.css": sha256(cssContent) },
      },
    })
  );

  return root;
}

function fakeDeps(): { deps: ThemeToolDeps; themesDir: string } {
  const themesDir = makeThemesRoot();
  const deps: ThemeToolDeps = {
    workspaceId: "ws-write-gate",
    authorize: async () => ({ allowed: true, reason: "matched" }),
    themes: discoverAllBuiltInThemes({ dir: themesDir, source: "site" }),
    themesDir,
  };
  return { deps, themesDir };
}

function executionContext(input: Record<string, unknown>): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: "principal-1" }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function writeFileHandler(deps: ThemeToolDeps): ToolRegistration["handler"] {
  const registration = buildThemesRegistrations(deps).find((r) => r.descriptor.id === "theme_write_file");
  assert.ok(registration, "theme_write_file must be wired");
  return registration.handler;
}

test("sanity: the compiled fixture loads valid before any write is attempted", () => {
  const { deps } = fakeDeps();
  const compiled = deps.themes.find((t) => t.manifest.id === "compiled");
  assert.equal(compiled?.status, "valid", `expected valid, got: ${JSON.stringify(compiled?.errors)}`);
});

test("writing to a compiled theme's generated output is refused, and the file is left untouched", async () => {
  const { deps, themesDir } = fakeDeps();
  const target = path.join(themesDir, "compiled", "css", "styles.css");
  const before = fs.readFileSync(target, "utf8");

  await assert.rejects(
    () => writeFileHandler(deps)(executionContext({ themeId: "compiled", path: "css/styles.css", content: "HACKED" })),
    /read-only.*versioned and restored only as one complete release/s
  );

  assert.equal(fs.readFileSync(target, "utf8"), before, "a refused write must not touch disk");
});

test("writing a NEW file into the compiled theme's generated tree (outside sourceDir) is also refused", async () => {
  const { deps, themesDir } = fakeDeps();
  await assert.rejects(
    () => writeFileHandler(deps)(executionContext({ themeId: "compiled", path: "pages/extra.html", content: "<p>x</p>" })),
    /read-only/
  );
  assert.equal(fs.existsSync(path.join(themesDir, "compiled", "pages", "extra.html")), false);
});

test("writing inside a compiled theme's declared sourceDir is still allowed", async () => {
  const { deps, themesDir } = fakeDeps();
  const result = (await writeFileHandler(deps)(
    executionContext({ themeId: "compiled", path: "src/Header.tsx", content: "export const Header = () => 'x';" })
  )) as { status: string };

  assert.equal(result.status, "valid");
  assert.equal(
    fs.readFileSync(path.join(themesDir, "compiled", "src", "Header.tsx"), "utf8"),
    "export const Header = () => 'x';"
  );
});

test("writing a compiled theme's own theme.json is still allowed", async () => {
  const { deps } = fakeDeps();
  const updated = JSON.stringify({
    id: "compiled",
    name: "Renamed",
    version: "1.0.1",
    tier: "static",
    engine: 1,
    author: "Aurora Themes Co.",
    build: {
      source: "compiled",
      sourceDir: "src",
      artifactHashes: (deps.themes.find((t) => t.manifest.id === "compiled")!.manifest.build!.artifactHashes),
    },
  });

  const result = (await writeFileHandler(deps)(
    executionContext({ themeId: "compiled", path: "theme.json", content: updated })
  )) as { status: string };

  assert.equal(result.status, "valid", "renaming via theme.json must still succeed for a compiled theme");
});

test("an authored theme's write behavior is completely unaffected — every path stays writable", async () => {
  const { deps, themesDir } = fakeDeps();
  const result = (await writeFileHandler(deps)(
    executionContext({ themeId: "authored", path: "tokens.json", content: '{"--ink":"#111"}' })
  )) as { status: string };

  assert.equal(result.status, "valid");
  assert.equal(fs.readFileSync(path.join(themesDir, "authored", "tokens.json"), "utf8"), '{"--ink":"#111"}');
});
