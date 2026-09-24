import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { discoverAllBuiltInThemes } from "../theme.js";
import { buildThemesRegistrations, type ThemeToolDeps } from "../tool-registrations.js";

/**
 * @file Security parity fix (2026-08-18): `src/server/routes/admin/themes/explore.ts`'s PUT route has
 * always refused a write into `preview/` (`isGeneratedThemePath`, `theme-files.ts` — `build-preview.mjs`'s
 * own generated output, never real theme source, silently overwritten on the next preview build). The
 * `theme_write_file` AGENT tool exercised here never called that check, so an agent could write straight
 * into `preview/` where the admin editor already refuses to. This proves the tool now refuses it too,
 * through the real handler (not the bare `isGeneratedThemePath` predicate, already covered in
 * `theme-files.test.ts`).
 *
 * Companion to `theme-write-file-built-gate.test.ts` (the ADR-020 §5 compiled-tree refusal, a DIFFERENT
 * question `resolveThemeFileWriteScope` answers) and the human-editor half in
 * `src/server/routes/admin/themes/__tests__/explore-built-theme-gate.test.ts`.
 */

function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-write-gate-preview-"));

  // An ordinary authored theme that also carries a generated `preview/` tree, exactly as
  // `build-preview.mjs` would leave one behind.
  const authored = path.join(root, "authored");
  fs.mkdirSync(path.join(authored, "templates"), { recursive: true });
  fs.mkdirSync(path.join(authored, "preview", "dark"), { recursive: true });
  fs.writeFileSync(
    path.join(authored, "theme.json"),
    JSON.stringify({ id: "authored", name: "Authored", version: "1.0.0", tier: "declarative", engine: 1 })
  );
  fs.writeFileSync(path.join(authored, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(authored, "templates", "home.json"), "{}", "utf8");
  fs.writeFileSync(path.join(authored, "templates", "entry.json"), "{}", "utf8");
  fs.writeFileSync(path.join(authored, "preview", "dark", "app.css"), "GENERATED-BY-BUILD-PREVIEW", "utf8");

  return root;
}

function fakeDeps(): { deps: ThemeToolDeps; themesDir: string } {
  const themesDir = makeThemesRoot();
  const deps: ThemeToolDeps = {
    workspaceId: "ws-write-gate-preview",
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

test("sanity: the authored+preview fixture loads valid before any write is attempted", () => {
  const { deps } = fakeDeps();
  const authored = deps.themes.find((t) => t.manifest.id === "authored");
  assert.equal(authored?.status, "valid", `expected valid, got: ${JSON.stringify(authored?.errors)}`);
});

test("theme_write_file refuses a write into preview/, matching explore.ts's PUT route", async () => {
  const { deps, themesDir } = fakeDeps();
  const target = path.join(themesDir, "authored", "preview", "dark", "app.css");
  const before = fs.readFileSync(target, "utf8");

  await assert.rejects(
    () => writeFileHandler(deps)(executionContext({ themeId: "authored", path: "preview/dark/app.css", content: "HACKED" })),
    /read-only.*generated output/s
  );

  assert.equal(fs.readFileSync(target, "utf8"), before, "a refused write must not touch disk");
});

test("theme_write_file refuses creating a NEW file inside preview/", async () => {
  const { deps, themesDir } = fakeDeps();
  await assert.rejects(
    () => writeFileHandler(deps)(executionContext({ themeId: "authored", path: "preview/light/app.css", content: "HACKED" })),
    /read-only/
  );
  assert.equal(fs.existsSync(path.join(themesDir, "authored", "preview", "light", "app.css")), false);
});

test("theme_write_file cannot reach preview/ through a traversal segment", async () => {
  const { deps, themesDir } = fakeDeps();
  const target = path.join(themesDir, "authored", "preview", "dark", "app.css");
  const before = fs.readFileSync(target, "utf8");

  await assert.rejects(
    () =>
      writeFileHandler(deps)(
        executionContext({ themeId: "authored", path: "templates/../preview/dark/app.css", content: "HACKED" })
      ),
    /read-only/
  );

  assert.equal(fs.readFileSync(target, "utf8"), before, "a traversal into preview/ must not be accepted either");
});

test("theme_write_file still allows an ordinary path outside preview/ on the same theme", async () => {
  const { deps, themesDir } = fakeDeps();
  const result = (await writeFileHandler(deps)(
    executionContext({ themeId: "authored", path: "tokens.json", content: '{"--ink":"#111"}' })
  )) as { status: string };

  assert.equal(result.status, "valid");
  assert.equal(fs.readFileSync(path.join(themesDir, "authored", "tokens.json"), "utf8"), '{"--ink":"#111"}');
});
