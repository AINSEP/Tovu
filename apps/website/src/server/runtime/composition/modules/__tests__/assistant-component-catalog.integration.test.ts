import "../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createRouteDeps } from "../../app.js";
import { ensureToolExecToken } from "#src/assistant/daemon-access";
import { registerAssistantToolExecRoutes } from "../assistant-tool-exec.js";
import { acceptToolRun } from "./assistant-tool-exec.fixture.js";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";

const snapshot = { generation: "plugins:2", siteProvider: "charts.example", providers: [
  { id: "charts.example", kinds: ["bar", "line"], javascript: "/providers/example.js", stylesheet: "/providers/example.css" },
] };

test("component discovery derives identity from a live site run and preserves admitted providers", async t => {
  const deps = createRouteDeps();
  await acceptToolRun({ deps, runId: "live", principalId: "member" });
  await acceptToolRun({ deps: { ...deps, workspaceId: "other-site" }, runId: "foreign", principalId: "member" });
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  let reads = 0;
  let entered!: () => void;
  const runRead = new Promise<void>(resolve => { entered = resolve; });
  const runStore = { find: async (...args: Parameters<NonNullable<typeof deps.chatRunLedger.durable>["find"]>) => {
    const run = await deps.chatRunLedger.durable!.find(...args);
    if (args[0].runId === "live" || args[0].runId === "waiting") entered();
    return run;
  } };
  const app = express();
  registerAssistantToolExecRoutes({ router: app, workspaceId: deps.workspaceId, runStore,
    toolSurface: { daemonCalls: { executor: { execute: async () => ({ executionId: "unused", status: "completed" }),
      cancel() {}, getAuditRecord: () => null, resumeConfirmation: () => { throw new Error("unused"); } }, listToolsFor: () => [] } },
    components: { pluginRuntimeReady: ready, siteTitleReady: Promise.resolve(), chartProviderSnapshot: async () => { reads++; return { ...snapshot, executableManifests: [{ _def: "must not cross the wire" }] }; } },
  }, {});
  const baseUrl = await startTestServer(app, t);
  const headers = { authorization: `Bearer ${ensureToolExecToken({}, {})}` };
  const read = (query: string, authenticated = true) => fetch(`${baseUrl}/internal/component-catalog?${query}`, { headers: authenticated ? headers : {} });
  assert.equal((await read("runId=live", false)).status, 401);
  for (const query of ["", "runId=missing", "runId=foreign", "runId=live&principalId=owner"]) {
    assert.ok([401, 404].includes((await read(query)).status), query);
  }
  assert.equal(reads, 0);
  let settled = false;
  const pending = read("runId=live").then(response => { settled = true; return response; });
  await runRead;
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(reads, 0, "snapshot reads wait for readiness");
  assert.equal(settled, false, "the existing server readiness must settle before snapshot reads");
  release();
  const response = await pending;
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("etag"), null);
  assert.deepEqual(await response.json(), { snapshot });
  assert.equal(reads, 1);
  await deps.chatRunLedger.durable!.cancel({ runId: "live", reason: "user-stop" }, {});
  assert.equal((await read("runId=live")).status, 404);
  assert.equal(reads, 1, "no global or last-principal fallback for expired runs");
});

test("component discovery rechecks the live attempt after plugin readiness", async t => {
  const deps = createRouteDeps();
  await acceptToolRun({ deps, runId: "waiting", principalId: "member" });
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  let reads = 0;
  let entered!: () => void;
  const runRead = new Promise<void>(resolve => { entered = resolve; });
  const runStore = { find: async (...args: Parameters<NonNullable<typeof deps.chatRunLedger.durable>["find"]>) => {
    const run = await deps.chatRunLedger.durable!.find(...args);
    if (args[0].runId === "live" || args[0].runId === "waiting") entered();
    return run;
  } };
  const app = express();
  registerAssistantToolExecRoutes({ router: app, workspaceId: deps.workspaceId, runStore,
    toolSurface: { daemonCalls: { executor: { execute: async () => ({ executionId: "unused", status: "completed" }),
      cancel() {}, getAuditRecord: () => null, resumeConfirmation: () => { throw new Error("unused"); } }, listToolsFor: () => [] } },
    components: { pluginRuntimeReady: ready, siteTitleReady: Promise.resolve(), chartProviderSnapshot: async () => { reads++; return { ...snapshot, executableManifests: [{ _def: "must not cross the wire" }] }; } },
  }, {});
  const baseUrl = await startTestServer(app, t);
  const pending = fetch(`${baseUrl}/internal/component-catalog?runId=waiting`, { headers: { authorization: `Bearer ${ensureToolExecToken({}, {})}` } });
  await runRead;
  await deps.chatRunLedger.durable!.cancel({ runId: "waiting", reason: "user-stop" }, {});
  release();
  assert.equal((await pending).status, 404);
  assert.equal(reads, 0);
});
