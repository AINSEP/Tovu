import assert from "node:assert/strict";
import test from "node:test";
import { toSiteCapabilitiesDeps, toSiteProfileDeps, type SiteInspectionToolDeps } from "../deps.js";

// F2.5/F3.6: strict ports reject lost workspace or namespace/key arguments.
function source() {
  const calls: string[] = [];
  let active: { activeThemeId: string } | null = { activeThemeId: "custom-theme" };
  const settingsRepo = {};
  const deps = {
    workspaceId: "ws-adapter", clock: { nowIso: () => "2026-09-29T12:00:00Z" },
    authorize: async () => ({ allowed: true, reason: "matched" }),
    postRepo: { list: async (p: unknown) => { assert.deepEqual(p, { workspaceId: "ws-adapter" }); calls.push("posts"); return [{ id: "post-8" }]; } },
    themes: [{ id: "custom-theme" }],
    presentationRepo: { findByWorkspaceId: async (required: { workspaceId: string }) => { assert.deepEqual(required, { workspaceId: "ws-adapter" }); calls.push("theme"); return active; } },
    settingsRepo,
    getEffective: async (d: unknown, p: unknown) => {
      assert.deepEqual(d, { repo: settingsRepo });
      const params = p as { namespace: string; key: string };
      if (params.namespace === "theme") {
        assert.deepEqual(p, { namespace: "theme", key: "enabled", scopeContext: { workspaceId: "ws-adapter" } });
        calls.push("setting");
        return { value: "theme-enabled" };
      }
      assert.deepEqual(p, { namespace: "site", key: params.key, scopeContext: { workspaceId: "ws-adapter" } });
      calls.push("setting");
      if (params.key === "broken") throw new Error("setting read failed");
      return params.key === "absent" ? undefined : { value: { enabled: false, count: 0, title: "" }[params.key] };
    },
    contentTypeRepo: { listByWorkspace: async (p: unknown) => { assert.deepEqual(p, { workspaceId: "ws-adapter" }); calls.push("types"); return [{ key: "recipe" }]; } },
    pluginActivationRepo: { listAll: async () => { calls.push("activations"); return [{ pluginId: "forms" }]; } },
    discoverPlugins: async () => { calls.push("plugins"); return [{ id: "forms" }]; },
    createSiteApp: () => { throw new Error("not used"); },
  } as unknown as SiteInspectionToolDeps;
  return { deps, calls, clearActive: () => { active = null; } };
}

test("profile adapter is lazy, routes every read, and returns the live theme rather than a captured id", async () => {
  const h = source();
  const p = toSiteProfileDeps(h.deps);
  assert.deepEqual(h.calls, []);
  assert.equal(p.workspaceId, "ws-adapter");
  assert.equal(p.authorize, h.deps.authorize);
  assert.equal(p.clock, h.deps.clock);
  assert.deepEqual(await p.listPosts(), [{ id: "post-8" }]);
  assert.deepEqual(await p.listThemes(), [{ id: "custom-theme" }]);
  assert.equal(await p.readActiveThemeId(), "custom-theme");
  h.clearActive();
  assert.equal(await p.readActiveThemeId(), null);
  assert.deepEqual(await p.listPlugins(), [{ id: "forms" }]);
  assert.deepEqual(await p.listPluginActivations(), [{ pluginId: "forms" }]);
  assert.deepEqual(await p.listContentTypes(), [{ key: "recipe" }]);
  assert.deepEqual(h.calls, ["posts", "theme", "theme", "plugins", "activations", "types"]);
});

test("settings preserve namespace and false, zero and empty string values, distinguish missing values, and recover after failures", async () => {
  const p = toSiteProfileDeps(source().deps);
  assert.equal(await p.readSetting({ namespace: "site", key: "enabled" }), false);
  assert.equal(await p.readSetting({ namespace: "site", key: "count" }), 0);
  assert.equal(await p.readSetting({ namespace: "site", key: "title" }), "");
  assert.equal(await p.readSetting({ namespace: "theme", key: "enabled" }), "theme-enabled");
  assert.equal(await p.readSetting({ namespace: "site", key: "absent" }), null);
  await assert.rejects(p.readSetting({ namespace: "site", key: "broken" }), { message: "setting read failed" });
  assert.equal(await p.readSetting({ namespace: "site", key: "enabled" }), false);
});

test("capabilities keep an unwired tool reader absent and pass a wired live reader through", async () => {
  const h = source();
  assert.equal(toSiteCapabilitiesDeps(h.deps).listCatalogTools, undefined);
  const reader = () => [{ id: "read_recipe" }];
  const p = toSiteCapabilitiesDeps({ ...h.deps, listCatalogTools: reader } as SiteInspectionToolDeps);
  assert.deepEqual(h.calls, []);
  assert.equal(p.listCatalogTools, reader);
  assert.deepEqual(p.listCatalogTools?.(), [{ id: "read_recipe" }]);
  assert.deepEqual(await p.listContentTypes(), [{ key: "recipe" }]);
  assert.deepEqual(h.calls, ["types"]);
});
