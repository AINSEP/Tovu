import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ToolExecutionContext } from "@jini-ai/core";
import { buildThemesRegistrations, contributeThemesTools, type ThemeToolDeps } from "../tool-registrations.js";
import { discoverAllBuiltInThemes } from "../index.js";

/** t11: rescan refreshes the actual array page rendering resolves, after an out-of-band write. */
function addTheme(root: string, id: string) {
  const dir = join(root, "static", id);
  mkdirSync(join(dir, "pages"), { recursive: true });
  writeFileSync(join(dir, "theme.json"), JSON.stringify({ id, name: id, version: "1.0.0", tier: "static", engine: 1 }));
  writeFileSync(join(dir, "tokens.json"), "{}");
  writeFileSync(join(dir, "pages", "index.html"), `<h1>${id}</h1>`);
}
function fixture(t: test.TestContext, allowed = true) {
  const root = mkdtempSync(join(tmpdir(), "t11-rescan-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  addTheme(root, "old");
  const calls: unknown[] = [];
  const deps: ThemeToolDeps = { themesDir: root, themes: discoverAllBuiltInThemes({ dir: root, source: "built-in" }), workspaceId: "ws-t11", authorize: async (input) => {
    calls.push(input);
    return { allowed, reason: allowed ? "matched" : "no_grant" };
  } };
  const registration = buildThemesRegistrations(deps).find((r) => r.descriptor.id === "theme_rescan");
  assert.ok(registration, "missing tool theme_rescan");
  const invoke = () => registration.handler({ executionId: "exec-t11", principal: { id: "owner" }, run: { id: "run-t11" }, input: {}, signal: new AbortController().signal } as ToolExecutionContext);
  return { root, deps, registration, invoke, calls };
}

test("theme_rescan discovers a folder written after boot, removes vanished themes, and is stable on a second call", async (t) => {
  const f = fixture(t);
  const live = f.deps.themes;
  addTheme(f.root, "new");
  rmSync(join(f.root, "static", "old"), { recursive: true });
  assert.deepEqual(f.deps.themes.map((theme) => theme.manifest.id), ["old"]);
  assert.deepEqual(await f.invoke(), { added: ["new"], removed: ["old"], invalid: [] });
  assert.equal(f.deps.themes, live);
  assert.deepEqual(f.deps.themes.map((theme) => [theme.manifest.id, theme.status]), [["new", "valid"]]);
  assert.deepEqual(await f.invoke(), { added: [], removed: [], invalid: [] });
  assert.deepEqual(f.calls, Array(2).fill({ principalId: "owner", permission: "theme.set", workspaceId: "ws-t11", entityType: "presentation" }));
});

test("theme_rescan reports invalid themes alongside valid additions", async (t) => {
  const f = fixture(t);
  addTheme(f.root, "broken");
  rmSync(join(f.root, "static", "broken", "pages", "index.html"));
  assert.deepEqual(await f.invoke(), { added: ["broken"], removed: [], invalid: [{ themeId: "broken", errors: ["pages/index.html is required"] }] });
  assert.deepEqual(f.deps.themes.map((theme) => [theme.manifest.id, theme.status]), [["broken", "invalid"], ["old", "valid"]]);
});

test("theme_rescan denies permission before discovery or registry mutation", async (t) => {
  const f = fixture(t, false);
  f.deps.themesDir = "/nonexistent/t11-denied";
  await assert.rejects(f.invoke, { message: "principal 'owner' is not authorized for 'theme.set' (no_grant)" });
  assert.deepEqual(f.deps.themes.map((theme) => theme.manifest.id), ["old"]);
});

test("theme_rescan publishes durable risk and a closed empty-input schema", (t) => {
  const f = fixture(t);
  assert.equal(f.registration.descriptor.readOnly, false);
  assert.equal(contributeThemesTools().risk.get("theme_rescan"), "mutates-durable-state");
  assert.deepEqual(f.registration.descriptor.inputSchema, { type: "object", additionalProperties: false, properties: {}, required: [] });
});
