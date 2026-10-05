import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test, { type TestContext } from "node:test";
import express from "express";
import type { ContentEntryDraft } from "@tovu/sdk";
import { PluginHookFailedError } from "#src/features/plugin-runtime/hook-registry";
import type { PluginDiscoveryRecord } from "#src/features/plugin-runtime/discovery";
import { registerPluginPreviewRoute } from "../../preview.js";
import type { PluginsRouteDeps } from "../../deps.js";

// Route-level tests for PLUGIN_PREVIEW (AW-7 Tier 2): every response mapping, with the preview
// binding as a recording fake. The real worker path is pinned by
// `server/runtime/plugin-tier2/__tests__/tier2-runtime.integration.test.ts`.
const WS = "ws-1";
const RECORD = { id: "content-analyzer", source: "built-in" } as PluginDiscoveryRecord;
type Preview = PluginsRouteDeps["previewPluginBeforeSave"];

async function boot(
  t: TestContext,
  options: { preview?: Preview; allowed?: boolean; discover?: () => Promise<readonly PluginDiscoveryRecord[]>; activation?: PluginsRouteDeps["pluginActivationRepo"]["getActivation"] } = {}
) {
  const calls: Array<{ pluginId: string; entry: ContentEntryDraft }> = [];
  const authorizations: unknown[] = [];
  const preview: Preview = options.preview ?? (async () => ({ score: 84, report: "{}" }));
  const deps = {
    workspaceId: WS,
    authorize: async (request: unknown) => {
      authorizations.push(request);
      return options.allowed === false ? { allowed: false, reason: "denied" } : { allowed: true };
    },
    discoverPlugins: options.discover ?? (async () => [RECORD]),
    pluginActivationRepo: { getActivation: options.activation ?? (async () => ({ enabled: true })) },
    previewPluginBeforeSave: async (pluginId: string, entry: ContentEntryDraft) => {
      calls.push({ pluginId, entry });
      return preview(pluginId, entry);
    },
  } as unknown as PluginsRouteDeps;
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
  app.use(express.json());
  registerPluginPreviewRoute(app, deps);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const port = (server.address() as AddressInfo).port;
  const post = async (body: unknown, path = `/api/admin/v1/workspaces/${WS}/plugins/content-analyzer/preview`) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const get = async (path = `/api/admin/v1/workspaces/${WS}/plugins/content-analyzer/preview`) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    return { status: response.status, body: await response.json() };
  };
  return { calls, authorizations, post, get };
}

const DRAFT = { title: "Hello", bodyJson: { type: "doc", content: [] } };

test("a draft is previewed through the one plugin and its validated fields come back unsaved", async (t) => {
  const h = await boot(t);
  assert.deepEqual(await h.post({ ...DRAFT, postId: "post-1", slug: "hello", metaDescription: "ignored today" }), {
    status: 200,
    body: { pluginId: "content-analyzer", fields: { score: 84, report: "{}" } },
  });
  assert.deepEqual(h.authorizations, [{ principalId: "owner", permission: "content.write", workspaceId: WS }]);
  assert.deepEqual(h.calls, [{
    pluginId: "content-analyzer",
    entry: { id: "post-1", workspaceId: WS, title: "Hello", slug: "hello", status: "draft", bodyJson: DRAFT.bodyJson, ext: {} },
  }]);
});

test("a draft with no postId or slug previews as an unsaved draft", async (t) => {
  const h = await boot(t);
  assert.equal((await h.post(DRAFT)).status, 200);
  assert.deepEqual(h.calls.map((call) => [call.entry.id, call.entry.slug]), [["preview", ""]]);
});

test("another workspace's path is 404 and runs nothing", async (t) => {
  const h = await boot(t);
  assert.deepEqual(await h.post(DRAFT, "/api/admin/v1/workspaces/other/plugins/content-analyzer/preview"), { status: 404, body: { error: "workspace was not found" } });
  assert.deepEqual(h.authorizations, []);
});

test("a caller without content.write is refused before the plugin id is looked up", async (t) => {
  let discovered = 0;
  const h = await boot(t, { allowed: false, discover: async () => { discovered += 1; return [RECORD]; } });
  assert.equal((await h.post(DRAFT)).status, 403);
  assert.equal(discovered, 0);
  assert.deepEqual(h.calls, []);
});

test("an invalid draft is 400 VALIDATION_ERROR and runs nothing", async (t) => {
  const h = await boot(t);
  // A bare `null` never reaches the route: express.json()'s strict mode refuses it first.
  const invalid = [
    [],
    { bodyJson: DRAFT.bodyJson },
    { title: 7, bodyJson: DRAFT.bodyJson },
    { title: "x" },
    { title: "x", bodyJson: [] },
    { title: "x", bodyJson: null },
    { ...DRAFT, postId: 1 },
    { ...DRAFT, slug: false },
    { ...DRAFT, metaDescription: {} },
  ];
  for (const body of invalid) {
    assert.deepEqual(await h.post(body), {
      status: 400,
      body: { error: "title (string) and bodyJson (object) are required; postId, slug and metaDescription must be strings", code: "VALIDATION_ERROR" },
    }, JSON.stringify(body));
  }
  assert.deepEqual(h.calls, []);
});

test("an unknown plugin id is 404 PLUGIN_NOT_FOUND", async (t) => {
  const h = await boot(t, { discover: async () => [] });
  assert.deepEqual(await h.post(DRAFT), { status: 404, body: { error: "plugin was not found", code: "PLUGIN_NOT_FOUND" } });
  assert.deepEqual(h.calls, []);
});

test("a plugin with no attached beforeSave filter is 409 PLUGIN_NOT_ENABLED", async (t) => {
  const h = await boot(t, { preview: async () => null });
  assert.deepEqual(await h.post(DRAFT), { status: 409, body: { error: "plugin is not enabled", code: "PLUGIN_NOT_ENABLED" } });
});

test("a failing filter is 422 PLUGIN_HOOK_FAILED with fixed text, never the plugin's own error", async (t) => {
  const h = await boot(t, { preview: async () => { throw new PluginHookFailedError("content-analyzer", "plugin 'content-analyzer' content.entry.beforeSave filter failed: token=sk-live-123"); } });
  assert.deepEqual(await h.post(DRAFT), {
    status: 422,
    body: { error: "a site plugin (content-analyzer) failed on this draft; nothing was saved", code: "PLUGIN_HOOK_FAILED", pluginId: "content-analyzer" },
  });
});

test("any other failure is a 500 that names no internals", async (t) => {
  const h = await boot(t, { discover: async () => { throw new Error("EACCES /srv/plugins"); } });
  assert.deepEqual(await h.post(DRAFT), { status: 500, body: { error: "internal error", code: "INTERNAL_ERROR" } });
});

// PLUGIN_PREVIEW_STATUS (2026-10-05): the post editor's Content analysis card asks this, not the
// admin plugin list, whether to show — so anyone the preview admits (content.write) can see it.
test("GET reports whether the plugin is enabled under the preview's own content.write gate", async (t) => {
  const asked: unknown[] = [];
  const h = await boot(t, { activation: async (request) => { asked.push(request); return { enabled: true } as never; } });
  assert.deepEqual(await h.get(), { status: 200, body: { pluginId: "content-analyzer", enabled: true } });
  assert.deepEqual(h.authorizations, [{ principalId: "owner", permission: "content.write", workspaceId: WS }]);
  assert.deepEqual(asked, [{ workspaceId: WS, pluginId: "content-analyzer" }]);
  assert.deepEqual(h.calls, []);
});

test("GET reports a disabled or never-enabled plugin as enabled: false", async (t) => {
  for (const activation of [{ enabled: false }, null]) {
    const h = await boot(t, { activation: async () => activation as never });
    assert.deepEqual(await h.get(), { status: 200, body: { pluginId: "content-analyzer", enabled: false } }, JSON.stringify(activation));
  }
});

test("GET without content.write is 403 before the plugin id is looked up", async (t) => {
  let discovered = 0;
  const h = await boot(t, { allowed: false, discover: async () => { discovered += 1; return [RECORD]; } });
  assert.equal((await h.get()).status, 403);
  assert.equal(discovered, 0);
});

test("GET for another workspace is 404 and for an unknown plugin is 404 PLUGIN_NOT_FOUND", async (t) => {
  const h = await boot(t, { discover: async () => [] });
  assert.deepEqual(await h.get("/api/admin/v1/workspaces/other/plugins/content-analyzer/preview"), { status: 404, body: { error: "workspace was not found" } });
  assert.deepEqual(await h.get(), { status: 404, body: { error: "plugin was not found", code: "PLUGIN_NOT_FOUND" } });
});

test("GET's other failures are a 500 that names no internals", async (t) => {
  const h = await boot(t, { activation: async () => { throw new Error("SQLITE_CANTOPEN /srv/site.db"); } });
  assert.deepEqual(await h.get(), { status: 500, body: { error: "internal error", code: "INTERNAL_ERROR" } });
});
