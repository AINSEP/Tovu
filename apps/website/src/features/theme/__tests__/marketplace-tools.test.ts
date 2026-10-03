import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ToolInputError, type ToolExecutionContext } from "@jini-ai/core";
import { buildThemesRegistrations, contributeThemesTools, type ThemeToolDeps } from "../tool-registrations.js";
import { discoverAllBuiltInThemes } from "../index.js";
import { InMemoryPresentationSettingsRepo, resolveActiveThemeId } from "../../presentation/index.js";

/** t11: real local marketplace copies, independent filesystem/registry reads, and refusals. */
function fixture(t: test.TestContext, allowed = true) {
  const root = mkdtempSync(join(tmpdir(), "t11-marketplace-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, "__marketplace__", "static", "aurora");
  mkdirSync(join(source, "pages"), { recursive: true });
  writeFileSync(join(source, "theme.json"), JSON.stringify({ id: "aurora", name: "Aurora", description: "Quiet storefront", tags: ["minimal", "shop"], version: "1.0.0", tier: "static", engine: 1 }));
  writeFileSync(join(source, "tokens.json"), "{}");
  writeFileSync(join(source, "pages", "index.html"), "<h1>Aurora fixture</h1>");
  const calls: unknown[] = [];
  const deps: ThemeToolDeps = { themesDir: root, themes: [], workspaceId: "ws-t11", authorize: async (input) => {
    calls.push(input);
    return { allowed, reason: allowed ? "matched" : "no_grant" };
  } };
  const registrations = buildThemesRegistrations(deps);
  const invoke = (id: string, input: Record<string, unknown> = {}) => {
    const registration = registrations.find((r) => r.descriptor.id === id);
    assert.ok(registration, `missing tool ${id}`);
    return registration.handler({ executionId: "exec-t11", principal: { id: "owner" }, run: { id: "run-t11" }, signal: new AbortController().signal, input } as ToolExecutionContext);
  };
  return { root, source, deps, registrations, invoke, calls };
}
const entry = { id: "aurora", name: "Aurora", description: "Quiet storefront", tier: "static", tags: ["minimal", "shop"], installed: false };

test("marketplace list filters name, description and tags without changing disk, then reports installed lineage", async (t) => {
  const f = fixture(t);
  assert.deepEqual(await f.invoke("marketplace_list_themes"), { themes: [entry] });
  for (const query of ["AURORA", "STOREfront", "MINIMAL"]) {
    assert.deepEqual(await f.invoke("marketplace_list_themes", { query }), { themes: [entry] });
  }
  assert.deepEqual(await f.invoke("marketplace_list_themes", { query: "no match" }), { themes: [] });
  assert.deepEqual(readdirSync(f.root), ["__marketplace__"]);
  await f.invoke("theme_install_from_marketplace", { marketplaceId: "aurora" });
  assert.deepEqual(await f.invoke("marketplace_list_themes"), { themes: [{ ...entry, installed: true, installedAs: "aurora" }] });
  // Remove the exact-id copy so only a suffixed lineage match remains.
  await f.invoke("theme_install_from_marketplace", { marketplaceId: "aurora" });
  rmSync(join(f.root, "static", "aurora"), { recursive: true });
  f.deps.themes.splice(0, f.deps.themes.length, ...discoverAllBuiltInThemes({ dir: f.root }));
  assert.deepEqual(await f.invoke("marketplace_list_themes"), { themes: [{ ...entry, installed: true, installedAs: "aurora-1" }] });
});

test("marketplace install copies real bytes, rescans and suffixes a repeat without changing active selection", async (t) => {
  const f = fixture(t);
  const activeDir = join(f.root, "static", "old-theme");
  cpSync(f.source, activeDir, { recursive: true });
  const activeManifest = JSON.parse(readFileSync(join(activeDir, "theme.json"), "utf8"));
  writeFileSync(join(activeDir, "theme.json"), JSON.stringify({ ...activeManifest, id: "old-theme" }));
  f.deps.themes.push(...discoverAllBuiltInThemes({ dir: f.root }));
  const presentationRepo = new InMemoryPresentationSettingsRepo({}, { initialRows: [
    { workspaceId: "ws-t11", activeThemeId: "old-theme", updatedAt: "2026-10-01T00:00:00.000Z" },
  ] });
  const activeDeps = { ...f.deps, presentationRepo, clock: { nowIso: () => "2026-10-01T01:00:00.000Z" } };
  Object.assign(f.deps, activeDeps);
  assert.equal(await resolveActiveThemeId(activeDeps), "old-theme");
  assert.deepEqual(await f.invoke("theme_install_from_marketplace", { marketplaceId: "aurora" }), {
    themeId: "aurora", suffixed: false, tier: "static", status: { status: "valid", errors: [] },
  });
  assert.equal(readFileSync(join(f.root, "static", "aurora", "pages", "index.html"), "utf8"), "<h1>Aurora fixture</h1>");
  assert.equal(readFileSync(join(f.root, "__original-themes__", "static", "aurora", "pages", "index.html"), "utf8"), "<h1>Aurora fixture</h1>");
  writeFileSync(join(f.root, "static", "aurora", "pages", "index.html"), "<h1>Edited by owner</h1>");
  assert.deepEqual(await f.invoke("theme_install_from_marketplace", { marketplaceId: "aurora" }), {
    themeId: "aurora-1", suffixed: true, tier: "static", status: { status: "valid", errors: [] },
  });
  assert.equal(JSON.parse(readFileSync(join(f.root, "static", "aurora-1", "theme.json"), "utf8")).id, "aurora-1");
  assert.equal(readFileSync(join(f.root, "static", "aurora", "pages", "index.html"), "utf8"), "<h1>Edited by owner</h1>");
  assert.equal(readFileSync(join(f.root, "static", "aurora-1", "pages", "index.html"), "utf8"), "<h1>Aurora fixture</h1>");
  assert.deepEqual(f.deps.themes.map((theme) => [theme.manifest.id, theme.status]), [["aurora", "valid"], ["aurora-1", "valid"], ["old-theme", "valid"]]);
  assert.equal(await resolveActiveThemeId(activeDeps), "old-theme");
  assert.deepEqual(await presentationRepo.findByWorkspaceId({ workspaceId: "ws-t11" }), {
    workspaceId: "ws-t11", activeThemeId: "old-theme", updatedAt: "2026-10-01T00:00:00.000Z",
  });
  assert.deepEqual(f.calls, Array(2).fill({ principalId: "owner", permission: "theme.set", workspaceId: "ws-t11", entityType: "presentation", entityId: undefined }));
});

for (const [marketplaceId, message] of [["missing", "marketplace theme 'missing' was not found"], ["../escape", "theme id '../escape' is not a valid theme id"]]) {
  test(`marketplace install refuses ${marketplaceId} with the domain message and no writes`, async (t) => {
    const f = fixture(t);
    await assert.rejects(() => f.invoke("theme_install_from_marketplace", { marketplaceId }), (error: unknown) => {
      assert.ok(error instanceof ToolInputError);
      assert.equal(error.message, message);
      return true;
    });
    assert.deepEqual(readdirSync(f.root), ["__marketplace__"]);
    assert.deepEqual(f.deps.themes, []);
  });
}

test("marketplace install refuses an invalid package without copying it", async (t) => {
  const f = fixture(t);
  rmSync(join(f.source, "pages", "index.html"));
  await assert.rejects(() => f.invoke("theme_install_from_marketplace", { marketplaceId: "aurora" }), (error: unknown) => {
    assert.ok(error instanceof ToolInputError);
    assert.equal(error.message, "marketplace theme 'aurora' failed install validation: pages/index.html is required");
    return true;
  });
  assert.deepEqual(readdirSync(f.root), ["__marketplace__"]);
});

for (const id of ["marketplace_list_themes", "theme_install_from_marketplace"]) {
  test(`${id} denies permission before accessing marketplace files`, async (t) => {
    const f = fixture(t, false);
    f.deps.themesDir = "/nonexistent/t11-denied";
    await assert.rejects(() => f.invoke(id, id === "theme_install_from_marketplace" ? { marketplaceId: "aurora" } : {}), {
      message: "principal 'owner' is not authorized for 'theme.set' (no_grant)",
    });
    assert.deepEqual(f.calls, [{ principalId: "owner", permission: "theme.set", workspaceId: "ws-t11", entityType: "presentation", entityId: undefined }]);
    assert.deepEqual(readdirSync(f.root), ["__marketplace__"]);
  });
}

test("marketplace registrations expose read-only browse and durable install without replacing the contributor", (t) => {
  const f = fixture(t);
  assert.equal(contributeThemesTools().domain, "themes");
  for (const [id, risk, readOnly] of [["marketplace_list_themes", "none", true], ["theme_install_from_marketplace", "mutates-durable-state", false]] as const) {
    const registration = f.registrations.find((r) => r.descriptor.id === id);
    assert.ok(registration, `missing tool ${id}`);
    assert.equal(registration.descriptor.readOnly, readOnly);
    assert.equal(contributeThemesTools().risk.get(id), risk);
    assert.equal(registration.descriptor.inputSchema?.additionalProperties, false);
  }
});

test("marketplace list defaults missing description and ignores malformed tag values", async (t) => {
  const f = fixture(t);
  writeFileSync(join(f.source, "theme.json"), JSON.stringify({ id: "aurora", name: "Aurora", tags: ["clean", 7], version: "1.0.0", tier: "static", engine: 1 }));
  assert.deepEqual(await f.invoke("marketplace_list_themes", { query: "CLEAN" }), {
    themes: [{ id: "aurora", name: "Aurora", description: "", tier: "static", tags: ["clean"], installed: false }],
  });
  writeFileSync(join(f.source, "theme.json"), JSON.stringify({ id: "aurora", name: "Aurora", version: "1.0.0", tier: "static", engine: 1 }));
  assert.deepEqual(await f.invoke("marketplace_list_themes"), {
    themes: [{ id: "aurora", name: "Aurora", description: "", tier: "static", installed: false }],
  });
});

test("marketplace input readers reject wrong query types and missing install ids", async (t) => {
  const f = fixture(t);
  await assert.rejects(() => f.invoke("marketplace_list_themes", { query: 1 }), { message: "'query' must be a string" });
  await assert.rejects(() => f.invoke("theme_install_from_marketplace"), { message: "'marketplaceId' (non-empty string) is required" });
  assert.deepEqual(readdirSync(f.root), ["__marketplace__"]);
});

test("marketplace list still shows a fixture with malformed JSON and no usable tags", async (t) => {
  const f = fixture(t);
  writeFileSync(join(f.source, "theme.json"), "{ broken json");
  assert.deepEqual(await f.invoke("marketplace_list_themes"), {
    themes: [{ id: "aurora", name: "aurora", description: "", tier: "static", installed: false }],
  });
});


test("marketplace list keeps a package with a missing manifest visible without tags", async (t) => {
  const f = fixture(t);
  rmSync(join(f.source, "theme.json"));
  assert.deepEqual(await f.invoke("marketplace_list_themes"), {
    themes: [{ id: "aurora", name: "aurora", description: "", tier: "static", installed: false }],
  });
});

test("marketplace list distinguishes reserved originals from installed copies", async (t) => {
  const f = fixture(t);
  cpSync(f.source, join(f.root, "__original-themes__", "static", "aurora"), { recursive: true });
  assert.deepEqual(await f.invoke("marketplace_list_themes"), { themes: [entry] });
  assert.deepEqual(await f.invoke("theme_install_from_marketplace", { marketplaceId: "aurora" }), {
    themeId: "aurora-1", suffixed: true, tier: "static", status: { status: "valid", errors: [] },
  });
  assert.deepEqual(await f.invoke("marketplace_list_themes"), {
    themes: [{ ...entry, installed: true, installedAs: "aurora-1" }],
  });
});

test("marketplace install succeeds on retry after a refused package is repaired", async (t) => {
  const f = fixture(t);
  rmSync(join(f.source, "pages", "index.html"));
  await assert.rejects(() => f.invoke("theme_install_from_marketplace", { marketplaceId: "aurora" }), {
    message: "marketplace theme 'aurora' failed install validation: pages/index.html is required",
  });
  assert.deepEqual(f.deps.themes, []);
  writeFileSync(join(f.source, "pages", "index.html"), "<h1>Repaired</h1>");
  assert.deepEqual(await f.invoke("theme_install_from_marketplace", { marketplaceId: "aurora" }), {
    themeId: "aurora", suffixed: false, tier: "static", status: { status: "valid", errors: [] },
  });
  assert.equal(readFileSync(join(f.root, "static", "aurora", "pages", "index.html"), "utf8"), "<h1>Repaired</h1>");
});
