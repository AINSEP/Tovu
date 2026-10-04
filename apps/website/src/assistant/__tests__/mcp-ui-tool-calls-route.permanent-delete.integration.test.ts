import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { ToolExecutionContext } from "@jini-ai/core";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { buildPermanentDeleteRegistrations } from "#src/features/permanent-delete/tool-registrations";
import { PERMANENT_DELETE_SPECS } from "#src/features/permanent-delete/agent-tools";
import { createSurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { RUN_PRINCIPAL_HEADER } from "../run-ownership.js";
import { MCP_UI_TOOL_CALLS_PATH, registerMcpUiToolCallsRoute } from "../mcp-ui-tool-calls-route.js";

/** Port test, not run in Codex sandbox. Every card must reach the existing authenticated exchange
 * callback; a callback without an exchange must never invoke the ToolExecutor. */
for (const spec of PERMANENT_DELETE_SPECS) {
  test(`${spec.name}: browser callback confirms a parked call; fresh execution and wrong principal are refused`, async t => {
    const surfaceExchanges = createSurfaceExchangeStore();
    const app = express();
    app.use(express.json());
    registerMcpUiToolCallsRoute(app, {
      surfaceExchanges,
      toolExecutor: { execute: async () => { assert.fail("callback executed a new tool call"); } } as never,
    });
    const baseUrl = await startTestServer(app, t);
    const post = (params: Record<string, unknown>, principalId: string) => fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
      method: "POST", headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: principalId },
      body: JSON.stringify({ toolName: spec.name, params }),
    });
    assert.equal((await post({ decision: "confirm" }, "owner")).status, 403);
    let deletes = 0;
    let confirmedExchangeId = "";
    const registration = buildPermanentDeleteRegistrations({
      workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "matched" }),
      prepare: async () => ({ details: [{ label: "Item", value: "Review this item" }], execute: async () => { deletes++; return { removed: true, id: "target" }; } }),
    }, { surfaceExchanges }).find(r => r.descriptor.id === spec.name)!;
    const ctx: ToolExecutionContext = {
      executionId: "e", principal: { id: "owner" }, run: { id: "r" }, signal: new AbortController().signal,
      input: spec.key ? { [spec.key]: "target" } : {},
    };
    const emitSurface = async () => {
      const exchangeId = surfaceExchanges.findTypedAnswerTarget({ principalId: "owner", toolId: spec.name })!;
      confirmedExchangeId = exchangeId;
      assert.equal(deletes, 0);
      assert.equal((await post({ __exchangeId: exchangeId, decision: "confirm" }, "someone-else")).status, 409);
      assert.equal(deletes, 0);
      assert.equal((await post({ __exchangeId: exchangeId, decision: "confirm" }, "owner")).status, 202);
    };
    assert.deepEqual(await registration.handler(ctx, { emitSurface }), { removed: true, id: "target" });
    assert.equal(deletes, 1);
    assert.equal((await post({ __exchangeId: confirmedExchangeId, decision: "confirm" }, "owner")).status, 409);
    assert.equal(deletes, 1);
  });
}
