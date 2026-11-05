import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import type { SurfaceEmission, ToolExecutionContext } from "@jini-ai/core";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";

import { discoverAllBuiltInThemes } from "../theme.js";
import { buildThemesRegistrations, type ThemeToolDeps } from "../tool-registrations.js";

/**
 * @file Demo 2026-11-02 exposed theme overwrites with no undo; the retained revision fixes that.
 * Owner rule 2026-11-04: reversible overwrites run directly; only permanent deletes confirm.
 * Exercise the real handler with and without the surface transport, retaining restorable bytes
 * in the bounded `.trash/revisions` store without opening a confirmation exchange.
 */

const ORIGINAL_CSS = "body{color:#123456}\n";

function themesFixture(t: TestContext): { deps: ThemeToolDeps; themesDir: string } {
  const themesDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-theme-overwrite-"));
  t.after(() => fs.rmSync(themesDir, { recursive: true, force: true }));
  const dir = path.join(themesDir, "ground");
  fs.mkdirSync(path.join(dir, "templates"), { recursive: true });
  fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify({ id: "ground", name: "Ground", version: "1.0.0", tier: "declarative", engine: 1 }));
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(dir, "templates", "home.json"), "{}", "utf8");
  fs.writeFileSync(path.join(dir, "templates", "entry.json"), "{}", "utf8");
  fs.writeFileSync(path.join(dir, "theme.css"), ORIGINAL_CSS, "utf8");
  const deps: ThemeToolDeps = {
    workspaceId: "ws-theme-overwrite",
    resolveActiveThemeId: async () => "",
    authorize: async () => ({ allowed: true, reason: "matched" }),
    themes: discoverAllBuiltInThemes({ dir: themesDir, source: "site" }),
    themesDir,
  };
  return { deps, themesDir };
}

/** One registration bound to a deterministic exchange store; any confirmation emission fails. */
function harness(deps: ThemeToolDeps) {
  let exchanges = 0;
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: { schedule: () => () => {} },
    clock: { nowMs: () => 1_000_000 }, idGenerator: { newId: () => `theme-write-card-${++exchanges}` }, defaultChannel: "mcp-ui" });
  const registrations = buildThemesRegistrations(deps, { surfaceExchanges });
  const handler = (id: string) => registrations.find((r) => r.descriptor.id === id)!.handler;
  const cards: SurfaceEmission[] = [];
  const call = (id: string, input: Record<string, unknown>, { withSurface = true }: { withSurface?: boolean } = {}) => {
    const ctx: ToolExecutionContext = { executionId: "exec-1", principal: { id: "owner-1" }, run: { id: "run-1" }, input, signal: new AbortController().signal };
    return handler(id)(ctx, withSurface ? { emitSurface: async (emission: SurfaceEmission) => {
      cards.push(emission);
      assert.fail('a reversible theme overwrite must not emit a confirmation surface');
    } } : {});
  };
  return { call, cards };
}

test("overwriting an existing theme file without a confirmation channel runs directly and saves a revision", async (t) => {
  const { deps, themesDir } = themesFixture(t);
  const h = harness(deps);
  const result = await h.call("theme_write_file", { themeId: "ground", path: "theme.css", content: "/* placeholder */" }, { withSurface: false }) as { previousRevision: { trashedPath: string } };
  assert.equal(h.cards.length, 0);
  assert.equal(fs.readFileSync(path.join(themesDir, "ground", "theme.css"), "utf8"), "/* placeholder */");
  assert.equal(fs.readFileSync(path.join(themesDir, "ground", result.previousRevision.trashedPath), "utf8"), ORIGINAL_CSS);
});

test("overwriting an existing theme file emits no confirmation surface and saves the prior bytes", async (t) => {
  const { deps, themesDir } = themesFixture(t);
  const h = harness(deps);
  const result = await h.call("theme_write_file", { themeId: "ground", path: "theme.css", content: "/* placeholder */" }) as { previousRevision: { trashedPath: string } };
  assert.equal(h.cards.length, 0);
  assert.equal(fs.readFileSync(path.join(themesDir, "ground", "theme.css"), "utf8"), "/* placeholder */");
  assert.equal(fs.readFileSync(path.join(themesDir, "ground", result.previousRevision.trashedPath), "utf8"), ORIGINAL_CSS);
});

test("creating a brand-new theme file needs no confirmation and keeps no revision", async (t) => {
  const { deps, themesDir } = themesFixture(t);
  const h = harness(deps);
  const result = await h.call("theme_write_file", { themeId: "ground", path: "assets/new.css", content: "a{}" }, { withSurface: false }) as { bytesWritten: number; previousRevision?: unknown };
  assert.equal(result.bytesWritten, 3);
  assert.equal(result.previousRevision, undefined);
  assert.equal(h.cards.length, 0);
  assert.equal(fs.readFileSync(path.join(themesDir, "ground", "assets", "new.css"), "utf8"), "a{}");
});

test("rewriting a file with its identical bytes changes nothing, so it does not ask", async (t) => {
  const { deps } = themesFixture(t);
  const h = harness(deps);
  await h.call("theme_write_file", { themeId: "ground", path: "theme.css", content: ORIGINAL_CSS }, { withSurface: false });
  assert.equal(h.cards.length, 0);
});

test("a direct overwrite keeps the prior bytes as a revision that restores the file", async (t) => {
  const { deps, themesDir } = themesFixture(t);
  const h = harness(deps);
  const written = await h.call("theme_write_file", { themeId: "ground", path: "theme.css", content: "/* placeholder */" }) as { bytesWritten: number; previousRevision: { trashedPath: string; note: string } };
  assert.equal(h.cards.length, 0);
  assert.equal(fs.readFileSync(path.join(themesDir, "ground", "theme.css"), "utf8"), "/* placeholder */");
  const { trashedPath } = written.previousRevision;
  assert.match(trashedPath, /^\.trash\/revisions\/\d+\/theme\.css$/);
  assert.match(written.previousRevision.note, /theme_read_file/);

  // The revision is an ordinary theme-trash entry: listed with includeTrash and readable.
  const listed = await h.call("theme_list_files", { themeId: "ground", includeTrash: true }) as { files: string[] };
  assert.ok(listed.files.includes(trashedPath), "the revision is listed with the theme's trash");
  const revision = await h.call("theme_read_file", { themeId: "ground", path: trashedPath }) as { content: string };
  assert.equal(revision.content, ORIGINAL_CSS);

  // Restoring it is one more reversible, direct write of the revision's bytes.
  await h.call("theme_write_file", { themeId: "ground", path: "theme.css", content: revision.content });
  assert.equal(h.cards.length, 0);
  assert.equal(fs.readFileSync(path.join(themesDir, "ground", "theme.css"), "utf8"), ORIGINAL_CSS);
});
