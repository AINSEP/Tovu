/** @file Theme reads report configured selection through the existing presentation reader. */
import assert from "node:assert/strict";
import test from "node:test";
import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import { InMemoryPresentationSettingsRepo } from "@jini-ai/cms/presentation";
import { resolveActiveThemeId } from "#src/features/presentation/index";
import { deriveContentReadRegistrations } from "#src/assistant/content-read-tool";
import { executeRegisteredTool } from "#src/assistant/__tests__/fixtures/execute-registered-tool";
import { applyActiveTheme } from "../set-active-theme-tool.js";
import { buildThemesRegistrations, type ThemeToolDeps } from "../tool-registrations.js";
import type { DiscoveredTheme } from "../theme.js";

const NOW = "2026-10-25T00:00:00.000Z";

/** Roster data only: no filesystem or renderer is involved in a selection read. */
function theme({ id }: { id: string }, { tier = "static", status = "valid" }: {
  tier?: DiscoveredTheme["manifest"]["tier"]; status?: DiscoveredTheme["status"];
} = {}): DiscoveredTheme {
  return {
    manifest: { id, name: id, version: "1.0.0", tier, engine: 1 }, dir: "/unused",
    source: "site", status, errors: [], tokens: {}, tokensLight: {}, templates: {},
    liquidTemplates: {}, handlebarsTemplates: {}, pages: {}, partials: {}, css: "",
  };
}

/** Both real read registrations share the same mutable, in-memory presentation store. */
function fixture({ activeThemeId, themes = [theme({ id: "first" }), theme({ id: "second" })] }: {
  activeThemeId: string; themes?: DiscoveredTheme[];
}, { allow = true }: { allow?: boolean } = {}) {
  const presentationRepo = new InMemoryPresentationSettingsRepo({}, { initialRows: [
    { workspaceId: "ws", activeThemeId, updatedAt: NOW },
  ] });
  const reads: string[] = [];
  const deps: ThemeToolDeps = {
    workspaceId: "ws", themes, themesDir: "/unused",
    authorize: async () => ({ allowed: allow, reason: allow ? "matched" : "insufficient_permission" }),
    resolveActiveThemeId: () => { reads.push("selection"); return resolveActiveThemeId({ presentationRepo, workspaceId: "ws" }); },
  };
  const registrations = buildThemesRegistrations(deps);
  const list = registrations.find(tool => tool.descriptor.id === "theme_list");
  const card = deriveContentReadRegistrations(registrations).find(tool => tool.descriptor.id === "content_read.theme");
  assert.ok(list);
  assert.ok(card);
  return { deps, presentationRepo, reads, list, card };
}

/** Check normalized, authorized output from the real registration. */
async function read({ registration, input = {} }: { registration: ToolRegistration; input?: Record<string, unknown> }, _options = {}) {
  const result = await executeRegisteredTool({ registration, input });
  assert.equal(result.status, "completed", JSON.stringify(result));
  return result.output as { activeThemeId: string; themes: Array<{ id: string; active: boolean }> };
}

test("theme_list and the read card observe activation immediately and preserve selection on ID lookup", async () => {
  const h = fixture({ activeThemeId: "first" });
  const before = await read({ registration: h.list });
  assert.equal(before.activeThemeId, "first");
  assert.deepEqual(before.themes.map(row => [row.id, row.active]), [["first", true], ["second", false]]);
  await applyActiveTheme({ routeDeps: {
    workspaceId: "ws", themes: h.deps.themes, authorize: h.deps.authorize,
    presentationRepo: h.presentationRepo, clock: { nowMs: () => Date.parse(NOW) },
  }, themeId: "second" });
  const after = await read({ registration: h.card, input: { id: "second" } });
  assert.equal(after.activeThemeId, "second");
  assert.deepEqual(after.themes.map(row => [row.id, row.active]), [["second", true]]);
  const inactive = await read({ registration: h.card, input: { id: "first" } });
  assert.equal(inactive.activeThemeId, "second");
  assert.equal(inactive.themes[0]?.active, false);
});

test("stored aliases use the existing resolver, filtering preserves context, and absent/disabled selections never imply a fallback", async () => {
  const themes = [theme({ id: "basic" }), theme({ id: "tovu-theme" }), theme({ id: "other" }, { tier: "declarative" })];
  const h = fixture({ activeThemeId: "basic", themes });
  const listed = await read({ registration: h.card });
  assert.equal(listed.activeThemeId, "basic", "return the stored id even when it was renamed");
  assert.deepEqual(listed.themes.filter(row => row.active).map(row => row.id), ["tovu-theme"]);
  const retired = await read({ registration: fixture({ activeThemeId: "tovu-theme", themes: [theme({ id: "basic" })] }).card });
  assert.deepEqual(retired.themes.map(row => [row.id, row.active]), [["basic", true]]);
  const filtered = await read({ registration: h.card, input: { tier: "declarative" } });
  assert.equal(filtered.activeThemeId, "basic");
  assert.deepEqual(filtered.themes.map(row => [row.id, row.active]), [["other", false]]);
  for (const activeThemeId of ["none", "missing", ""]) {
    const result = await read({ registration: fixture({ activeThemeId, themes: [theme({ id: "none" }), theme({ id: "first" })] }).card });
    assert.equal(result.activeThemeId, activeThemeId);
    assert.ok(result.themes.every(row => !row.active));
  }
  const invalid = await read({ registration: fixture({ activeThemeId: "broken", themes: [theme({ id: "broken" }, { status: "invalid" })] }).card });
  assert.equal(invalid.themes[0]?.active, true, "configured selection is independent of render eligibility");
});

test("theme read authorization precedes the selection read and genuine read failures propagate", async () => {
  const denied = fixture({ activeThemeId: "first" }, { allow: false });
  for (const input of [{}, { id: "first" }]) {
    const result = await executeRegisteredTool({ registration: denied.card, input });
    assert.notEqual(result.status, "completed");
    assert.match(result.error ?? "", /not authorized|permission|FORBIDDEN/i);
  }
  assert.deepEqual(denied.reads, []);
  const h = fixture({ activeThemeId: "first" });
  const failure = new Error("presentation store offline");
  h.presentationRepo.findByWorkspaceId = async () => { throw failure; };
  const ctx: ToolExecutionContext = { executionId: "exec", run: { id: "run" }, principal: { id: "caller" }, input: {}, signal: new AbortController().signal };
  await assert.rejects(h.list.handler(ctx), error => error === failure);
  await assert.rejects(h.card.handler(ctx), error => error === failure);
});
