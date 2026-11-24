import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test, { type TestContext } from "node:test";
import express from "express";
import type { RouteDeps } from "#src/server/routes/types";
import { registerChartProviderRoutes } from "../../chart-providers.js";

/**
 * Wire pin for the chart-provider routes (w5-routes): status, body and every header the metadata and
 * asset replies carry, plus the shared `app.use(base, guard)` answering unmatched sub-paths with the
 * guard's own refusal (401 with no session, 403 with a denied grant) rather than Express's 404.
 * Written green against the hand-written handlers, then kept green across the move to the Jini cms
 * `chartProviderMetadata` / `chartProviderAsset` functions behind a thin Express adapter.
 */
const WS = "ws-pin";
const BASE = `/api/admin/v1/workspaces/${WS}/chart-providers`;
type ChartDeps = Parameters<typeof registerChartProviderRoutes>[0]["deps"];
const BYTES = Buffer.from("export const chart = 1;\n");
const SNAPSHOT = { generation: "g7", siteProvider: "plugin.recharts", providers: [{ id: "plugin.recharts" }] };

function chartDeps(allowed = true): ChartDeps {
  return {
    workspaceId: WS,
    authorize: async () => ({ allowed, reason: allowed ? "ok" : "no_grant" }),
    pluginRuntimeReady: Promise.resolve(),
    siteTitleReady: Promise.resolve(),
    chartProviderSnapshot: async () => SNAPSHOT,
    browserProviders: () => ({ generation: 1, providers: [{ pluginId: "acme/charts", version: "1.0.0", assets: [
      { digest: "sha256-d1", path: "dist/index.js", contentType: "text/javascript", readBytes: () => BYTES },
    ] }] }),
  } as unknown as ChartDeps;
}

async function boot(t: TestContext, { deps, session = true }: { deps: ChartDeps; session?: boolean }) {
  const app = express();
  // The real session gate would need a store; the pin only needs its observable 401 for a missing principal.
  app.use((_req, res, next) => {
    if (session) res.locals.principal = { id: "owner" };
    next();
  });
  app.use("/api/admin", (_req, res, next) => {
    if (res.locals.principal) next();
    else res.status(401).json({ error: "unauthorized" });
  });
  registerChartProviderRoutes({ app, deps });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return (path: string) => fetch(origin + path);
}

test("chart providers wire pin: metadata is 200 { data } with Cache-Control no-store", async (t) => {
  const response = await (await boot(t, { deps: chartDeps() }))(BASE);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
  assert.deepEqual(await response.json(), { data: SNAPSHOT });
});

test("chart providers wire pin: an admitted asset is 200 with its content type, nosniff and the immutable private cache header", async (t) => {
  const response = await (await boot(t, { deps: chartDeps() }))(`${BASE}/assets/acme%2Fcharts/1.0.0/sha256-d1/index.js`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/javascript; charset=utf-8");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("cache-control"), "private, max-age=31536000, immutable");
  assert.equal(Buffer.from(await response.arrayBuffer()).toString(), BYTES.toString());
});

test("chart providers wire pin: a wrong digest, version or filename is the 404 body and carries none of the asset headers", async (t) => {
  const get = await boot(t, { deps: chartDeps() });
  for (const path of ["sha256-bad/index.js", "sha256-d1/other.js"].map((tail) => `${BASE}/assets/acme%2Fcharts/1.0.0/${tail}`).concat(`${BASE}/assets/acme%2Fcharts/9.9.9/sha256-d1/index.js`)) {
    const response = await get(path);
    assert.equal(response.status, 404, path);
    assert.deepEqual(await response.json(), { error: "chart asset was not found" });
    assert.equal(response.headers.get("cache-control"), null, path);
    assert.equal(response.headers.get("x-content-type-options"), null, path);
  }
});

test("chart providers wire pin: the guard answers an UNMATCHED sub-path (403 denied, 401 no session, Express 404 only once allowed)", async (t) => {
  const unmatched = `${BASE}/nothing-here/at-all`;
  const denied = await (await boot(t, { deps: chartDeps(false) }))(unmatched);
  assert.equal(denied.status, 403);
  assert.equal(((await denied.json()) as { code: string }).code, "FORBIDDEN");
  const anonymous = await (await boot(t, { deps: chartDeps(), session: false }))(unmatched);
  assert.equal(anonymous.status, 401);
  const allowed = await (await boot(t, { deps: chartDeps() }))(unmatched);
  assert.equal(allowed.status, 404);
});

test("chart providers wire pin: a foreign workspace is the 404 before any authorization on both routes", async (t) => {
  const get = await boot(t, { deps: chartDeps(false) });
  for (const path of [BASE.replace(WS, "foreign"), `${BASE.replace(WS, "foreign")}/assets/acme%2Fcharts/1.0.0/sha256-d1/index.js`]) {
    const response = await get(path);
    assert.equal(response.status, 404, path);
    assert.deepEqual(await response.json(), { error: "workspace was not found" });
  }
});
