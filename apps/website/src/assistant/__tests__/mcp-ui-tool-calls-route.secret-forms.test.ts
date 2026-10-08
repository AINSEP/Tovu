import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { ToolExecutor } from "@jini-ai/daemon";

import { SECRET_FORM_TOOL_IDS } from "../../contracts/headless/secret-form-cards.js";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM, SURFACE_TYPED_ANSWER_PARAM } from "@jini-ai/daemon/surface-exchanges";
import { startTestServer } from "../../server/__tests__/helpers/http-test-server.js";
import { RUN_PRINCIPAL_HEADER } from "../daemon-access.js";
import { MCP_UI_TOOL_CALLS_PATH, registerMcpUiToolCallsRoute } from "../mcp-ui-tool-calls-route.js";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


test("secret-card POSTs only answer a principal-bound open exchange and never execute a fresh tool", async t => {
  let executions = 0;
  const toolExecutor: ToolExecutor = {
    execute: async () => { executions++; return { executionId: "unexpected", status: "completed", output: {} }; },
    resumeConfirmation: () => undefined,
    cancel: () => undefined,
    getAuditRecord: () => null,
  };
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const app = express();
  app.use(express.json());
  registerMcpUiToolCallsRoute(app, { toolExecutor, surfaceExchanges });
  const baseUrl = await startTestServer(app, t);
  const post = (toolName: string, params: Record<string, unknown>, principalId = "principal-1") => fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST", headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: principalId },
    body: JSON.stringify({ toolName, params }),
  });
  // Synthetic field values only; assertions and executor instrumentation never report submitted values.
  for (const toolId of SECRET_FORM_TOOL_IDS) {
    const params = { token: "fixture-value", accessToken: "fixture-value", password: "fixture-value", value: "fixture-value" };
    for (const exchangeId of [undefined, "", 7]) {
      const response = await post(toolId, { ...params, ...(exchangeId === undefined ? {} : { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId }) });
      assert.equal(response.status, 403, toolId);
      assert.deepEqual(await response.json(), { error: `'${toolId}' is not an MCP-UI-redeemable tool`, code: "TOOL_NOT_ALLOWLISTED" });
      assert.equal(executions, 0, toolId);
    }
    const stale = await post(toolId, { ...params, [SURFACE_EXCHANGE_ID_PARAM]: "closed-exchange" });
    assert.equal(stale.status, 409, toolId);
    assert.equal(executions, 0, toolId);
    const typed = await post(toolId, { ...params, [SURFACE_TYPED_ANSWER_PARAM]: "fixture answer" });
    assert.equal(typed.status, 409, toolId);
    assert.equal(executions, 0, toolId);

    const exchange = surfaceExchanges.open({ binding: { toolId, principalId: "principal-1" }, emit: async () => undefined });
    try {
      const answer = exchange.receive({});
      const mismatch = await post(toolId, { ...params, [SURFACE_EXCHANGE_ID_PARAM]: exchange.id }, "principal-2");
      assert.equal(mismatch.status, 409, toolId);
      assert.equal(executions, 0, toolId);
      const response = await post(toolId, { ...params, [SURFACE_EXCHANGE_ID_PARAM]: exchange.id });
      assert.equal(response.status, 202, toolId);
      assert.deepEqual(await response.json(), { delivered: true });
      const received = await answer;
      assert.equal(received.status, "received", toolId);
      assert.equal(executions, 0, toolId);
    } finally { exchange.close({}); }
  }
});
