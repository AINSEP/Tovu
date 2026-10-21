import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { createApp } from "#src/server/runtime/composition/app";
import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { startSiteSearchMaintenance, type MaintenanceTimers } from "../modules/site-search.js";
import { buildSiteSearchToolRegistrations } from "../site-search-tools.js";

/**
 * @file The real SQLite composition wires site search end to end: `createSiteRouteDeps` builds one
 * runtime on `RouteDeps.siteSearch` over the real 0023 tables and the `core.search/provider` setting,
 * `createApp` serves `GET /api/search` from it, the maintenance loop's boot pass records the
 * configured (and, today, unregistered) built-in provider as the building target, and the assistant
 * contributor builds the four search tools from the same runtime.
 */

type SiteDeps = Awaited<ReturnType<typeof createSiteRouteDeps>>;

async function boot(t: TestContext): Promise<SiteDeps> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-site-search-"));
  const deps = await createSiteRouteDeps(path.join(dir, "content.db"));
  t.after(async () => {
    await Promise.all([deps.identityReady, deps.siteTitleReady, deps.pluginRuntimeReady, deps.legacyPublishCredentialsReady, deps.siteSearch?.ready]
      .map(ready => Promise.resolve(ready).catch(() => undefined)));
    await deps.contentKernel?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return deps;
}

test("the real composition serves search from one runtime: 503 until a provider exists, a recorded boot target, four tools", async (t) => {
  const deps = await boot(t);
  const runtime = deps.siteSearch;
  assert.ok(runtime, "createSiteRouteDeps wires RouteDeps.siteSearch");
  await runtime.ready;
  assert.equal(runtime.siteId, deps.workspaceId, "v1: the workspace id is the site id");
  assert.equal(await runtime.readProviderSetting(), "builtin");

  const base = await startTestServer(createApp(deps), t);
  const res = await fetch(`${base}/api/search?q=hello`);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "search_unavailable", reason: "not_configured" });

  const queue: (() => void)[] = [];
  const timers: MaintenanceTimers = { set: run => { queue.push(run); return queue.length; }, clear: () => undefined };
  const loop = startSiteSearchMaintenance({ runtime }, { timers });
  queue.shift()!();
  // The pass reschedules itself only once it has finished.
  for (let i = 0; i < 400 && queue.length === 0; i += 1) await new Promise<void>(resolve => { setTimeout(resolve, 5); });
  assert.equal(queue.length, 1, "the boot pass finished");
  await loop.stop();
  const status = await runtime.service.status({ siteId: runtime.siteId });
  assert.equal(status.active, null);
  assert.deepEqual(status.building, { providerId: "builtin", generation: 1, registered: false, counts: { pending: 0, indexed: 0, unknown: 0, failed: 0 } });

  const tools = buildSiteSearchToolRegistrations(deps, { surfaceExchanges: {} as never });
  assert.deepEqual(tools.map(tool => tool.descriptor.id).sort(), ["search_query", "search_reindex", "search_set_provider", "search_status"]);
});
