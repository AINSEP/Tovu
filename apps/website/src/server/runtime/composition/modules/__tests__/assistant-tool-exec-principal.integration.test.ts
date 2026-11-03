import "../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { Principal } from "@jini-ai/core";
import { createRouteDeps } from "../../app.js";
import { ensureToolExecToken } from "#src/assistant/daemon-access";
import { registerAssistantToolExecRoutes } from "../assistant-tool-exec.js";
import { acceptToolRun } from "./assistant-tool-exec.fixture.js";

test("a member cannot execute or discover tools as another run's owner", async (t) => {
  const deps = createRouteDeps();
  await acceptToolRun({ deps, runId: "member-run", principalId: "member" });
  await acceptToolRun({ deps, runId: "ended-run", principalId: "member" });
  await deps.chatRunLedger.settle({ runId: "ended-run", conversationId: "chat-ended-run", messageId: "answer-ended-run",
    content: "done", events: [], status: "succeeded", endedAt: Date.now() });
  await acceptToolRun({ deps, runId: "cancelled-run", principalId: "member" });
  await deps.chatRunLedger.durable!.cancel({ runId: "cancelled-run", reason: "user-stop" }, {});
  await acceptToolRun({ deps: { ...deps, workspaceId: "other-site" }, runId: "foreign-run", principalId: "member" });
  await acceptToolRun({ deps, runId: "superseded-run", principalId: "member" });
  const superseded = await deps.chatRunLedger.durable!.load({ messageId: "answer-superseded-run" }, {});
  assert.ok(superseded);
  assert.equal(await deps.chatRunLedger.durable!.advance({ run: superseded, nextRunId: "replacement-run", now: Date.now(), events: [] }, {}), true);
  const executions: Principal[] = [];
  const catalogs: string[] = [];
  const app = express();
  const toolSurface: Parameters<typeof registerAssistantToolExecRoutes>[0]["toolSurface"] = { daemonCalls: {
      executor: {
        execute: async ({ principal }) => { executions.push(principal); return { executionId: "executed", status: "completed", output: {} }; },
        cancel: () => {}, getAuditRecord: () => null, resumeConfirmation: () => { throw new Error("unused"); },
      },
      listToolsFor: async ({ principalId }) => { catalogs.push(principalId); return []; },
    } };
  registerAssistantToolExecRoutes({ router: app, workspaceId: deps.workspaceId, runStore: deps.chatRunLedger.durable, toolSurface }, {});
  const unconfigured = express.Router();
  registerAssistantToolExecRoutes({ router: unconfigured, workspaceId: deps.workspaceId, runStore: undefined, toolSurface }, {});
  app.use("/unconfigured", unconfigured);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const headers = { authorization: `Bearer ${ensureToolExecToken({}, {})}`, "content-type": "application/json" };
  const execute = (runId: string, principal: Principal) => fetch(`${baseUrl}/internal/tool-executions`, {
    method: "POST", headers, body: JSON.stringify({ executionId: "request", run: { id: runId }, principal, toolId: "probe", input: {} }),
  });
  const catalog = (runId: string, principalId: string) => fetch(`${baseUrl}/internal/tool-catalog?${new URLSearchParams({ runId, principalId })}`, { headers });
  for (const [runId, principalId] of [
    ["member-run", "owner"], ["missing-run", "owner"], ["ended-run", "member"],
    ["cancelled-run", "member"], ["foreign-run", "member"], ["superseded-run", "member"], ["", "member"],
  ]) {
    await t.test(`refuses ${runId || "absent run"} for ${principalId}`, async () => {
      assert.equal((await execute(runId!, { id: principalId! })).status, 403);
      assert.equal((await catalog(runId!, principalId!)).status, 403);
    });
  }
  assert.deepEqual(executions, []);
  assert.deepEqual(catalogs, []);
  assert.equal((await fetch(`${baseUrl}/unconfigured/internal/tool-executions`, { method: "POST", headers,
    body: JSON.stringify({ executionId: "request", run: { id: "member-run" }, principal: { id: "member" }, toolId: "probe", input: {} }) })).status, 403);
  assert.equal((await fetch(`${baseUrl}/unconfigured/internal/tool-catalog?runId=member-run&principalId=member`, { headers })).status, 403);
  assert.equal((await fetch(`${baseUrl}/internal/tool-catalog?principalId=member`, { headers })).status, 403);
  assert.equal((await execute("member-run", { id: "member", roles: ["owner"] })).status, 200);
  assert.deepEqual(executions, [{ id: "member" }], "wire role claims must never reach the executor");
  assert.equal((await execute("member-run", { id: "member", toolAccess: "read-only" } as Principal)).status, 200);
  assert.deepEqual(executions[1], { id: "member", toolAccess: "read-only" }, "attenuation must survive identity binding");
  assert.equal((await catalog("member-run", "member")).status, 200);
  assert.deepEqual(catalogs, ["member"]);
  await deps.chatRunLedger.durable!.cancel({ runId: "member-run", reason: "user-stop" }, {});
  assert.equal((await execute("member-run", { id: "member" })).status, 403);
  assert.equal((await catalog("member-run", "member")).status, 403);
  assert.equal(executions.length, 2, "a prior successful call must not cache run authorization");
  assert.deepEqual(catalogs, ["member"]);
});
