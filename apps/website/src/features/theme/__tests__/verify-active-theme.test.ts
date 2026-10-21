import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ToolInputError } from "@jini-ai/core";

import { InMemoryPresentationSettingsRepo, resolveActiveThemeId } from "#src/features/presentation/index";
import { createFakeClock } from "#src/__tests__/support/fake-clock";

import { NO_THEME_ID } from "../active-theme.js";
import { discoverAllBuiltInThemes, type DiscoveredTheme } from "../theme.js";
import { verifyActiveThemeResolves, type ActiveThemeVerificationDeps } from "../verify-active-theme.js";

/**
 * @file `verifyActiveThemeResolves` directly: the four outcomes of "would the public render of /
 * resolve the stored id itself" — the no-theme sentinel (nothing to resolve), a valid theme (no
 * write), a theme the roster no longer holds, and an invalid theme (with and without recorded
 * errors). On every miss the previous theme must be restored before the `ToolInputError` is thrown.
 * The roster is a real discovery of a real temp themes folder; only the theme objects for the
 * invalid cases are swapped in memory, which is what a roster holding a theme that failed
 * validation looks like to this check (the first roster sync of an array records its fingerprint
 * without rescanning, so the swapped objects are what the check sees).
 */

const WORKSPACE_ID = "ws-verify-active-theme";
const SEEDED_AT = "2026-10-08T00:00:00.000Z";

function writeThemeFolder(root: string, id: string): void {
  const dir = path.join(root, id);
  fs.mkdirSync(path.join(dir, "templates"), { recursive: true });
  fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify({ id, name: id, version: "1.0.0", tier: "declarative", engine: 1 }), "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), '{"--ink":"#000"}', "utf8");
  fs.writeFileSync(path.join(dir, "styles.css"), "body{margin:0}", "utf8");
  fs.writeFileSync(path.join(dir, "templates", "home.json"), '{"type":"doc","content":[]}', "utf8");
  fs.writeFileSync(path.join(dir, "templates", "entry.json"), '{"type":"doc","content":[]}', "utf8");
}

/** Deps whose stored active theme is `stored`, over a real two-theme folder. */
function makeDeps(stored: string): ActiveThemeVerificationDeps {
  const themesDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-verify-active-theme-"));
  writeThemeFolder(themesDir, "basic");
  writeThemeFolder(themesDir, "aurora");
  return {
    themes: discoverAllBuiltInThemes({ dir: themesDir, source: "built-in" }),
    themesDir,
    presentationRepo: new InMemoryPresentationSettingsRepo({}, { initialRows: [{ workspaceId: WORKSPACE_ID, activeThemeId: stored, updatedAt: SEEDED_AT }] }),
    clock: createFakeClock({ startIso: "2026-10-08T01:00:00.000Z" }),
    workspaceId: WORKSPACE_ID,
  };
}

/** Replace the roster entry for `id` with an invalid copy carrying `errors`. */
function markInvalid(deps: ActiveThemeVerificationDeps, id: string, errors: string[]): void {
  const index = deps.themes.findIndex((theme) => theme.manifest.id === id);
  assert.ok(index >= 0, `fixture roster must hold '${id}'`);
  const invalid: DiscoveredTheme = { ...deps.themes[index]!, status: "invalid", errors };
  deps.themes[index] = invalid;
}

const storedId = (deps: ActiveThemeVerificationDeps) => resolveActiveThemeId({ presentationRepo: deps.presentationRepo, workspaceId: deps.workspaceId });

test("the no-theme sentinel has nothing to resolve: no error and no write, even with an empty roster", async () => {
  const deps = { ...makeDeps(NO_THEME_ID), themes: [] };
  await verifyActiveThemeResolves({ deps, activeThemeId: NO_THEME_ID, previousThemeId: "basic" });
  assert.equal(await storedId(deps), NO_THEME_ID);
});

test("a theme the next render resolves itself passes without touching the stored setting", async () => {
  const deps = makeDeps("aurora");
  await verifyActiveThemeResolves({ deps, activeThemeId: "aurora", previousThemeId: "basic" });
  assert.equal(await storedId(deps), "aurora");
});

test("a theme missing from the roster restores the previous theme and says its folder is gone", async () => {
  const deps = makeDeps("ghost");
  await assert.rejects(
    () => verifyActiveThemeResolves({ deps, activeThemeId: "ghost", previousThemeId: "basic" }),
    (err: unknown) =>
      err instanceof ToolInputError &&
      err.message.includes("theme 'ghost' was not activated") &&
      err.message.includes("its folder is no longer in the site's themes") &&
      err.message.includes("The previous theme 'basic' was restored")
  );
  assert.equal(await storedId(deps), "basic");
});

test("an invalid theme restores the previous theme and quotes every validation error", async () => {
  const deps = makeDeps("aurora");
  markInvalid(deps, "aurora", ["theme.json: bad version", "styles.css missing"]);
  await assert.rejects(
    () => verifyActiveThemeResolves({ deps, activeThemeId: "aurora", previousThemeId: "basic" }),
    (err: unknown) =>
      err instanceof ToolInputError &&
      err.message.includes("it fails validation: theme.json: bad version; styles.css missing") &&
      err.message.includes("fall back to the default theme")
  );
  assert.equal(await storedId(deps), "basic");
});

test("an invalid theme with no recorded errors still fails, naming the absence of detail", async () => {
  const deps = makeDeps("aurora");
  markInvalid(deps, "aurora", []);
  await assert.rejects(
    () => verifyActiveThemeResolves({ deps, activeThemeId: "aurora", previousThemeId: "basic" }),
    (err: unknown) => err instanceof ToolInputError && err.message.includes("it fails validation: no detail recorded")
  );
  assert.equal(await storedId(deps), "basic");
});
