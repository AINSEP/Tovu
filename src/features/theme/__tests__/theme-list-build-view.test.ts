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
 * @file ADR-020 §5 (2026-08-12): `theme_list` surfaces `author`/`build` so an agent can learn a theme
 * is a built release BEFORE attempting a write that `theme_write_file` would reject — turning a
 * mid-turn rejection into something the agent can plan around. Trimmed to `source`/`framework`/
 * `sourceDir` (what actually decides write eligibility); `builderVersion`/`lockfileHash`/
 * `artifactHashes` are support/integrity metadata an editing agent has no use for.
 */

const SENTINEL = '<link rel="stylesheet" href="../css/styles.css" />';

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-list-build-view-"));

  const authored = path.join(root, "authored");
  fs.mkdirSync(path.join(authored, "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(authored, "theme.json"),
    JSON.stringify({ id: "authored", name: "Authored", version: "1.0.0", tier: "declarative", engine: 1 })
  );
  fs.writeFileSync(path.join(authored, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(authored, "templates", "home.json"), "{}", "utf8");
  fs.writeFileSync(path.join(authored, "templates", "entry.json"), "{}", "utf8");

  const compiled = path.join(root, "compiled");
  fs.mkdirSync(path.join(compiled, "pages"), { recursive: true });
  fs.mkdirSync(path.join(compiled, "css"), { recursive: true });
  const pageHtml = `<!doctype html><html><head>${SENTINEL}</head><body>x</body></html>`;
  const cssContent = "body{margin:0}";
  fs.writeFileSync(path.join(compiled, "pages", "index.html"), pageHtml, "utf8");
  fs.writeFileSync(path.join(compiled, "css", "styles.css"), cssContent, "utf8");
  fs.writeFileSync(path.join(compiled, "tokens.json"), "{}", "utf8");
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
        framework: "react",
        sourceDir: "src",
        builderVersion: "astro@4.15.2",
        lockfileHash: "sha256-deadbeef",
        artifactHashes: { "pages/index.html": sha256(pageHtml), "css/styles.css": sha256(cssContent) },
      },
    })
  );

  return root;
}

function fakeDeps(): ThemeToolDeps {
  const themesDir = makeThemesRoot();
  return {
    workspaceId: "ws-list-build-view",
    authorize: async () => ({ allowed: true, reason: "matched" }),
    themes: discoverAllBuiltInThemes({ dir: themesDir, source: "site" }),
    themesDir,
  };
}

function executionContext(input: Record<string, unknown>): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: "principal-1" }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function listHandler(deps: ThemeToolDeps): ToolRegistration["handler"] {
  const registration = buildThemesRegistrations(deps).find((r) => r.descriptor.id === "theme_list");
  assert.ok(registration, "theme_list must be wired");
  return registration.handler;
}

test("an authored theme (no build field) has no author/build keys in theme_list's view", async () => {
  const deps = fakeDeps();
  const result = (await listHandler(deps)(executionContext({}))) as { themes: Array<Record<string, unknown>> };
  const authored = result.themes.find((t) => t.id === "authored")!;

  assert.equal("author" in authored, false);
  assert.equal("build" in authored, false);
});

test("a compiled theme's author and trimmed build info are surfaced in theme_list", async () => {
  const deps = fakeDeps();
  const result = (await listHandler(deps)(executionContext({}))) as {
    themes: Array<{ id: string; author?: string; build?: Record<string, unknown> }>;
  };
  const compiled = result.themes.find((t) => t.id === "compiled")!;

  assert.equal(compiled.author, "Aurora Themes Co.");
  assert.deepEqual(compiled.build, { source: "compiled", framework: "react", sourceDir: "src" });
  // Integrity/support metadata an editing agent has no use for must NOT be forwarded.
  assert.equal("builderVersion" in (compiled.build ?? {}), false);
  assert.equal("lockfileHash" in (compiled.build ?? {}), false);
  assert.equal("artifactHashes" in (compiled.build ?? {}), false);
});
