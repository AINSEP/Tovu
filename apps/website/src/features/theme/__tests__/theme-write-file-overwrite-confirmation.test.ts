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
 * @file Demo 2026-11-02: the chat rebuilt an existing theme IN PLACE (theme.css overwritten with a
 * placeholder mid-run) with no card and no undo. `theme_write_file` now asks before replacing an
 * existing file's bytes, keeps the old bytes as a restorable revision in the theme's `.trash/`, and
 * still creates brand-new files without asking. Exercised through the real handler and the real
 * held-open surface exchange — the same path every agent CLI's tool call takes.
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

/** One registration bound to a deterministic exchange store; `decision` answers the card if one is drawn. */
function harness(deps: ThemeToolDeps) {
  let exchanges = 0;
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: { schedule: () => () => {} },
    clock: { nowMs: () => 1_000_000 }, idGenerator: { newId: () => `theme-write-card-${++exchanges}` }, defaultChannel: "mcp-ui" });
  const registrations = buildThemesRegistrations(deps, { surfaceExchanges });
  const handler = (id: string) => registrations.find((r) => r.descriptor.id === id)!.handler;
  const cards: SurfaceEmission[] = [];
  const call = (id: string, input: Record<string, unknown>, { decision, withSurface = true }: { decision?: "confirm" | "cancel"; withSurface?: boolean } = {}) => {
    const ctx: ToolExecutionContext = { executionId: "exec-1", principal: { id: "owner-1" }, run: { id: "run-1" }, input, signal: new AbortController().signal };
    return handler(id)(ctx, withSurface ? { emitSurface: async (emission: SurfaceEmission) => {
      cards.push(emission);
      if (decision) surfaceExchanges.deliver({ exchangeId: `theme-write-card-${exchanges}`, principalId: "owner-1", params: { decision } }, { toolId: "theme_write_file" });
    } } : {});
  };
  return { call, cards };
}

test("overwriting an existing theme file without a confirmation channel is refused and nothing changes", async (t) => {
  const { deps, themesDir } = themesFixture(t);
  const h = harness(deps);
  await assert.rejects(
    () => h.call("theme_write_file", { themeId: "ground", path: "theme.css", content: "/* placeholder */" }, { withSurface: false }),
    /NO_CONFIRMATION_CHANNEL/,
  );
  assert.equal(fs.readFileSync(path.join(themesDir, "ground", "theme.css"), "utf8"), ORIGINAL_CSS);
  assert.equal(fs.existsSync(path.join(themesDir, "ground", ".trash")), false, "a refused write keeps no revision either");
});

test("overwriting an existing theme file shows the confirmation card; cancel changes nothing", async (t) => {
  const { deps, themesDir } = themesFixture(t);
  const h = harness(deps);
  const result = await h.call("theme_write_file", { themeId: "ground", path: "theme.css", content: "/* placeholder */" }, { decision: "cancel" }) as { written: boolean; cancelled: boolean };
  assert.equal(h.cards.length, 1, "exactly one card is drawn");
  const cardText = JSON.stringify(h.cards[0]!.payload);
  assert.match(cardText, /theme\.css/);
  assert.match(cardText, /Ground/);
  assert.deepEqual([result.written, result.cancelled], [false, true]);
  assert.equal(fs.readFileSync(path.join(themesDir, "ground", "theme.css"), "utf8"), ORIGINAL_CSS);
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

test("a confirmed overwrite keeps the prior bytes as a revision that restores the file", async (t) => {
  const { deps, themesDir } = themesFixture(t);
  const h = harness(deps);
  const written = await h.call("theme_write_file", { themeId: "ground", path: "theme.css", content: "/* placeholder */" }, { decision: "confirm" }) as { bytesWritten: number; previousRevision: { trashedPath: string; note: string } };
  assert.equal(h.cards.length, 1, "the shared replacement guard asks once");
  assert.equal(fs.readFileSync(path.join(themesDir, "ground", "theme.css"), "utf8"), "/* placeholder */");
  const { trashedPath } = written.previousRevision;
  assert.match(trashedPath, /^\.trash\/revisions\/\d+\/theme\.css$/);
  assert.match(written.previousRevision.note, /theme_read_file/);

  // The revision is an ordinary theme-trash entry: listed with includeTrash and readable.
  const listed = await h.call("theme_list_files", { themeId: "ground", includeTrash: true }) as { files: string[] };
  assert.ok(listed.files.includes(trashedPath), "the revision is listed with the theme's trash");
  const revision = await h.call("theme_read_file", { themeId: "ground", path: trashedPath }) as { content: string };
  assert.equal(revision.content, ORIGINAL_CSS);

  // Restoring it is one more confirmed write of the revision's bytes.
  await h.call("theme_write_file", { themeId: "ground", path: "theme.css", content: revision.content }, { decision: "confirm" });
  assert.equal(fs.readFileSync(path.join(themesDir, "ground", "theme.css"), "utf8"), ORIGINAL_CSS);
});
