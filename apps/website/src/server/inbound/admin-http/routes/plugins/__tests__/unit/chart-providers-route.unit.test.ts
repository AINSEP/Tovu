import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test, { type TestContext } from "node:test";
import express from "express";
import { ADMIN_ASSISTANT_PERMISSION } from "#src/assistant/index";
import { createCapturingResponse } from "#src/server/__tests__/helpers/http-test-server";
import type { RouteDeps } from "#src/server/routes/types";
import { registerChartProviderRoutes } from "../../chart-providers.js";

// Route-level tests for the admin chart-provider bootstrap and asset routes with hand-written
// ports: the shared guard's refusal and failure arms, and the two optional ports being absent
// (a host that composes no chart runtime). The real admitted-provider path is pinned by
// `__tests__/integration/browser-provider.integration.test.ts`.
const WS = "ws-1";
const BASE = `/api/admin/v1/workspaces/${WS}/chart-providers`;
type ChartDeps = Parameters<typeof registerChartProviderRoutes>[0]["deps"];

function chartDeps(overrides: Partial<ChartDeps> = {}) {
  const authorizations: { permission: string }[] = [];
  const deps = {
    workspaceId: WS,
    authorize: async (request: { permission: string }) => {
      authorizations.push(request);
      return { allowed: true, reason: "ok" };
    },
    pluginRuntimeReady: Promise.resolve(),
    siteTitleReady: Promise.resolve(),
    ...overrides,
  } as unknown as ChartDeps;
  return { deps, authorizations };
}

async function boot(t: TestContext, deps: ChartDeps) {
  const app = express();
  app.use((_req, res, next) => {
    res.locals.principal = { id: "owner" };
    next();
  });
  registerChartProviderRoutes({ app, deps });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { app, get: (path: string) => fetch(origin + path) };
}

test("chart providers: a principal without the assistant permission is 403 and no metadata is produced", async (t) => {
  let snapshots = 0;
  const asked: string[] = [];
  const { deps } = chartDeps({
    authorize: async (request: { permission: string }) => {
      asked.push(request.permission);
      return { allowed: false, reason: "no_grant" };
    },
    chartProviderSnapshot: async () => {
      snapshots++;
      return { generation: "g1", siteProvider: "plugin.recharts", providers: [] } as unknown as Awaited<ReturnType<NonNullable<RouteDeps["chartProviderSnapshot"]>>>;
    },
  } as Partial<ChartDeps>);
  const { get } = await boot(t, deps);
  const response = await get(BASE);
  assert.equal(response.status, 403);
  const body = (await response.json()) as { code: string; details: { permission: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, ADMIN_ASSISTANT_PERMISSION);
  assert.equal(snapshots, 0);
  assert.deepEqual(asked, [ADMIN_ASSISTANT_PERMISSION]);
});

test("chart providers: a runtime that failed to become ready is the fixed 500 envelope for both metadata and assets", async (t) => {
  const failed = Promise.reject(new Error("plugin runtime boot failed"));
  failed.catch(() => undefined);
  const { deps } = chartDeps({ pluginRuntimeReady: failed });
  const { get } = await boot(t, deps);
  for (const path of [BASE, `${BASE}/assets/p/1.0.0/sha256-x/index.js`]) {
    const response = await get(path);
    assert.equal(response.status, 500, path);
    assert.deepEqual(await response.json(), { error: "internal error", code: "INTERNAL_ERROR" });
  }
});

test("chart providers: with no chart snapshot port composed, metadata is the core default (Recharts, no providers)", async (t) => {
  const { deps } = chartDeps();
  const { get } = await boot(t, deps);
  const response = await get(BASE);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { data: { generation: "core", siteProvider: "plugin.recharts", providers: [] } });
});

test("chart providers: a snapshot port that throws is the fixed 500 envelope, not its message", async (t) => {
  const { deps } = chartDeps({
    chartProviderSnapshot: async () => {
      throw new Error("ledger read failed at /srv/secret");
    },
  } as Partial<ChartDeps>);
  const { get } = await boot(t, deps);
  const response = await get(BASE);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "internal error", code: "INTERNAL_ERROR" });
});

test("chart providers: with no browser-provider port composed, every asset URL is 404", async (t) => {
  const { deps } = chartDeps();
  const { get } = await boot(t, deps);
  const response = await get(`${BASE}/assets/charts-recharts/1.0.0/sha256-abc/index.js`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "chart asset was not found" });
});

test("chart providers: `req.params.workspaceId ?? \"\"` guard fallback, via a hand-built request with no params, is the workspace 404", async (t) => {
  const { deps, authorizations } = chartDeps();
  const { app } = await boot(t, deps);
  // The shared guard is an `app.use(base, …)` layer (not a route), keyed on `:workspaceId`.
  type UseLayer = { route?: unknown; keys?: { name: string }[]; handle: (req: unknown, res: unknown, next: () => void) => unknown };
  const guard = (app as unknown as { _router: { stack: UseLayer[] } })._router.stack.find(
    (layer) => !layer.route && layer.keys?.some((key) => key.name === "workspaceId")
  );
  assert.ok(guard, "the chart-provider guard layer is registered");
  const { res, capture } = createCapturingResponse();
  let nextCalled = false;
  await guard.handle({ params: {} }, res, () => {
    nextCalled = true;
  });
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
  assert.equal(nextCalled, false);
  assert.deepEqual(authorizations, []);
});
