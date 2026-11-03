import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { createToolRegistry } from "@jini-ai/core";
import { createToolExecutor, createRemoteToolExecutor } from "@jini-ai/daemon";
import { processOutbox } from "#src/contracts/core/events/index";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { createSiteRouteDeps } from "../../runtime/composition/deps.js";
import { coreForSite } from "../../runtime/composition/__tests__/helpers/daemon-core.js";
import { registerAssistantToolExecRoutes } from "../../runtime/composition/modules/assistant-tool-exec.js";
import { acceptToolRun } from "../../runtime/composition/modules/__tests__/assistant-tool-exec.fixture.js";
import { ensureToolExecToken } from "#src/assistant/daemon-access";
import { startTestServer } from "../helpers/http-test-server.js";

/** The former daemon enqueue-only outbox prevented event theft. With ADR-070 the write itself
 * runs at the site owner: both the remote write and existing pending rows use its bus/drainer. */
for (const memory of [false, true]) {
  test(`${memory ? "memory" : "SQLite"}: a remote site write and pending events reach server subscribers without a daemon outbox`, async t => {
    const dir = mkdtempSync(path.join(tmpdir(), "daemon-outbox-owner-"));
    mkdirSync(path.join(dir, "themes"));
    const previous = process.env.TOVU_SITE_DIR;
    process.env.TOVU_SITE_DIR = dir;
    let close = async () => {};
    t.after(async () => { await close(); if (previous === undefined) delete process.env.TOVU_SITE_DIR; else process.env.TOVU_SITE_DIR = previous; rmSync(dir, { recursive: true, force: true }); });
    const server = memory ? createRouteDeps() : await createSiteRouteDeps(path.join(dir, "content.db"), { themesDir: path.join(dir, "themes"), onStoreOpened: store => { close = () => store.close(); } });
    await Promise.all(Object.entries(server).filter(([key]) => key.endsWith("Ready")).map(([, work]) => work));
    const core = await coreForSite({ deps: server, t, env: memory ? { TOVU_DB: "memory" } : {} });
    assert.equal("outbox" in core, false); assert.equal("bus" in core, false);
    await processOutbox({ outbox: server.outbox, bus: server.bus, clock: server.clock });
    const received: string[] = [];
    await server.bus.subscribe({ eventName: "entry.updated", handler: async event => { received.push(event.id); } });
    const makeEvent = (id: string) => ({ id, name: "entry.updated" as const, workspaceId: server.workspaceId, occurredAt: server.clock.nowIso(), payload: { entryId: "post" } });
    await server.outbox.enqueue(makeEvent("already-pending"));
    const registry = createToolRegistry({});
    registry.register({ descriptor: { id: "site_write", readOnly: false }, policy: { authorize: () => "allow" }, handler: async () => { await server.outbox.enqueue(makeEvent("remote-write")); return { saved: true }; } });
    const principalId = await server.ownerPrincipalId;
    await acceptToolRun({ deps: server, runId: "outbox-run", principalId });
    const app = express();
    registerAssistantToolExecRoutes({ router: app, runStore: server.chatRunLedger.durable, workspaceId: server.workspaceId,
      toolSurface: { daemonCalls: { executor: createToolExecutor({ registry }), listToolsFor: async () => registry.list({}) } } });
    const baseUrl = await startTestServer(app, t);
    const remote = createRemoteToolExecutor({ baseUrl, token: ensureToolExecToken({}, {}) });
    const result = await remote.execute({ principal: { id: principalId }, run: { id: "outbox-run" }, toolId: "site_write", input: {} });
    assert.equal(result.status, "completed");
    assert.deepEqual(received, [], "only the serving drainer delivers events");
    await processOutbox({ outbox: server.outbox, bus: server.bus, clock: server.clock });
    assert.deepEqual(received.sort(), ["already-pending", "remote-write"]);
    await core.close();
  });
}
