import { createNoopTracker } from "@jini-ai/diagnostics/observability";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test, { type TestContext } from "node:test";
import express from "express";
import { InMemoryPluginActivationRepo } from "@jini-ai/plugins/host";
import type { PluginDiscoveryRecord } from "@jini-ai/plugins/host/node";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import type { PluginsRouteDeps } from "../../deps.js";
import { registerPluginFilesRoute } from "../../files.js";
import { registerPluginUninstallRoute } from "../../uninstall.js";

// Route-level tests for PLUGIN_UNINSTALL and PLUGIN_FILES arms the real-disk integration suites
// (`uninstall.integration.test.ts`, `files.integration.test.ts`) do not reach: an unmapped failure
// from the discovery/listing ports, and the `req.params.* ?? ""` guards. Those guards follow this
// repo's 2026-09-03 convention (`posts/__tests__/update.test.ts`): Express always populates a matched
// `:param`, so they are exercised with a hand-built request that omits it.
const WS = "ws-1";
const RECORD: PluginDiscoveryRecord = { id: "alpha", name: "Alpha", version: "1.0.0", source: "site", tier: "tier-2", status: "valid", errors: [] };
const UNINSTALL_PATH = "/api/admin/v1/workspaces/:workspaceId/plugins/:pluginId";
const FILES_PATH = "/api/admin/v1/workspaces/:workspaceId/plugins/:pluginId/files";

function fakeDeps(overrides: Partial<PluginsRouteDeps> = {}) {
  const calls = { discover: 0, remove: 0, readFiles: 0 };
  const deps: PluginsRouteDeps = {
    tracker: createNoopTracker({}),
    workspaceId: WS,
    authorize: async () => ({ allowed: true, reason: "ok" }),
    clock: { nowMs: () => Date.parse("2026-10-21T00:00:00.000Z"), nowIso: () => "2026-10-21T00:00:00.000Z" } as unknown as PluginsRouteDeps["clock"],
    idGen: { newId: () => "id-1" } as unknown as PluginsRouteDeps["idGen"],
    changeSets: {} as unknown as PluginsRouteDeps["changeSets"],
    pluginActivationRepo: new InMemoryPluginActivationRepo(),
    discoverPlugins: async () => {
      calls.discover++;
      return [RECORD];
    },
    onPluginEnabled: async () => {},
    onPluginDisabled: () => {},
    removePlugin: (async () => {
      calls.remove++;
      throw new Error("the fake remover is never expected to run");
    }) as unknown as PluginsRouteDeps["removePlugin"],
    readPluginPackageFiles: async () => {
      calls.readFiles++;
      return { files: [], truncated: false };
    },
    previewPluginBeforeSave: (async () => undefined) as unknown as PluginsRouteDeps["previewPluginBeforeSave"],
    ...overrides,
  };
  return { deps, calls };
}

function appWith(deps: PluginsRouteDeps) {
  const app = express();
  app.use((_req, res, next) => {
    res.locals.principal = { id: "owner" };
    next();
  });
  registerPluginUninstallRoute(app, deps);
  registerPluginFilesRoute(app, deps);
  return app;
}

async function listen(t: TestContext, app: express.Express): Promise<string> {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function direct(app: express.Express, method: "delete" | "get", path: string, params: Record<string, string>) {
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "owner" };
  await extractRouteHandler(app, method, path)({ params }, res);
  return capture;
}

test("PLUGIN_UNINSTALL: a workspace id that is not this site's is 404 before discovery or removal", async (t) => {
  const { deps, calls } = fakeDeps();
  const baseUrl = await listen(t, appWith(deps));
  const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/other-ws/plugins/alpha`, { method: "DELETE" });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "workspace was not found" });
  assert.deepEqual(calls, { discover: 0, remove: 0, readFiles: 0 });
});

test("PLUGIN_UNINSTALL: an unmapped discovery failure is the opaque 500 INTERNAL_ERROR envelope", async (t) => {
  const { deps, calls } = fakeDeps({
    discoverPlugins: async () => {
      throw new Error("install dir unreadable: /srv/secret/path");
    },
  });
  const baseUrl = await listen(t, appWith(deps));
  const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/plugins/alpha`, { method: "DELETE" });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "internal error", code: "INTERNAL_ERROR" });
  assert.equal(calls.remove, 0);
});

test("PLUGIN_UNINSTALL: `req.params.workspaceId ?? \"\"` fallback, via a hand-built request with no params, is the workspace 404", async () => {
  const { deps } = fakeDeps();
  const capture = await direct(appWith(deps), "delete", UNINSTALL_PATH, {});
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("PLUGIN_UNINSTALL: `req.params.pluginId ?? \"\"` fallback names no discovered plugin and is 404 PLUGIN_NOT_FOUND without removing anything", async () => {
  const { deps, calls } = fakeDeps();
  const capture = await direct(appWith(deps), "delete", UNINSTALL_PATH, { workspaceId: WS });
  assert.equal(capture.statusCode, 404);
  assert.equal((capture.jsonBody as { code: string }).code, "PLUGIN_NOT_FOUND");
  assert.equal(calls.remove, 0);
});

test("PLUGIN_FILES: an unmapped listing failure is the opaque 500 INTERNAL_ERROR envelope, never the raw message", async (t) => {
  const { deps } = fakeDeps({
    readPluginPackageFiles: async () => {
      throw new Error("EACCES: /srv/secret/plugins/alpha");
    },
  });
  const baseUrl = await listen(t, appWith(deps));
  const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/plugins/alpha/files`);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "internal error", code: "INTERNAL_ERROR" });
});

test("PLUGIN_FILES: `req.params.workspaceId ?? \"\"` fallback, via a hand-built request with no params, is the workspace 404", async () => {
  const { deps, calls } = fakeDeps();
  const capture = await direct(appWith(deps), "get", FILES_PATH, {});
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
  assert.equal(calls.discover, 0);
});

test("PLUGIN_FILES: `req.params.pluginId ?? \"\"` fallback matches no discovered plugin and is 404 PLUGIN_NOT_FOUND without reading files", async () => {
  const { deps, calls } = fakeDeps();
  const capture = await direct(appWith(deps), "get", FILES_PATH, { workspaceId: WS });
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "plugin was not found", code: "PLUGIN_NOT_FOUND" });
  assert.equal(calls.readFiles, 0);
});
