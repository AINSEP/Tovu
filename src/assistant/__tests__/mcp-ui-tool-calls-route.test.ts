import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import type { Principal, RunRef } from "@jini-ai/core";
import type { ToolExecutionResult, ToolExecutor } from "@jini-ai/daemon";

import { startTestServer } from "../../server/__tests__/helpers/http-test-server";
import { RUN_PRINCIPAL_HEADER } from "../run-ownership";
import { MCP_UI_TOOL_CALLS_PATH, registerMcpUiToolCallsRoute } from "../mcp-ui-tool-calls-route";

/**
 * @file Route-level tests for the daemon-side half of the MCP-UI confirmation redemption endpoint
 * (`mcp-ui-tool-calls-route.ts`, ADR-053 Decision 3).
 *
 * A fake `ToolExecutor` stands in for the real one, so these assert the route's own contract — the
 * allowlist gate, the principal-header requirement, and the `ToolExecutionResult` -> HTTP mapping —
 * independent of `@jini-ai/daemon`'s actual execution machinery, which `tool-executor.test.ts`
 * (Jini) already covers. The security-critical case per the dispatch's own requirement is the third
 * test: a non-allowlisted `toolName` is rejected, and the fake executor's `execute` is never called.
 */

interface RecordedCall {
  principal: Principal;
  run: RunRef;
  toolId: string;
  input: unknown;
}

function createFakeToolExecutor(
  respond: (call: RecordedCall) => ToolExecutionResult
): { executor: ToolExecutor; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const executor: ToolExecutor = {
    execute: async (principal, run, toolId, input) => {
      const call = { principal, run, toolId, input };
      calls.push(call);
      return respond(call);
    },
    resumeConfirmation: () => undefined,
    cancel: () => undefined,
    getAuditRecord: () => null,
  };
  return { executor, calls };
}

function buildApp(toolExecutor: ToolExecutor): express.Express {
  const app = express();
  app.use(express.json());
  registerMcpUiToolCallsRoute(app, { toolExecutor });
  return app;
}

async function postToolCall(baseUrl: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("rejects a call with no principal header — 401, and the executor is never invoked", async (t) => {
  const { executor, calls } = createFakeToolExecutor(() => ({ executionId: "x", status: "completed", output: {} }));
  const baseUrl = await startTestServer(buildApp(executor), t);

  const res = await postToolCall(baseUrl, { toolName: "content_post_delete", params: {} });

  assert.equal(res.status, 401);
  assert.equal(calls.length, 0);
});

test("rejects a non-string or empty toolName — 400, and the executor is never invoked", async (t) => {
  const { executor, calls } = createFakeToolExecutor(() => ({ executionId: "x", status: "completed", output: {} }));
  const baseUrl = await startTestServer(buildApp(executor), t);
  const headers = { [RUN_PRINCIPAL_HEADER]: "principal-1" };

  const missing = await postToolCall(baseUrl, { params: {} }, headers);
  const empty = await postToolCall(baseUrl, { toolName: "", params: {} }, headers);

  assert.equal(missing.status, 400);
  assert.equal(empty.status, 400);
  assert.equal(calls.length, 0);
});

test("SECURITY-CRITICAL: rejects a toolName that is not on the allowlist — 403, and the executor is never invoked", async (t) => {
  const { executor, calls } = createFakeToolExecutor(() => ({ executionId: "x", status: "completed", output: {} }));
  const baseUrl = await startTestServer(buildApp(executor), t);

  const res = await postToolCall(
    baseUrl,
    { toolName: "database_execute_migrate_forward", params: {} },
    { [RUN_PRINCIPAL_HEADER]: "principal-1" }
  );

  assert.equal(res.status, 403);
  assert.equal(((await res.json()) as { code: string }).code, "TOOL_NOT_ALLOWLISTED");
  assert.equal(calls.length, 0, "an unlisted toolName must never reach ToolExecutor.execute — this endpoint is not a general execution surface");
});

test("executes an allowlisted toolName, passing the header principal, a synthetic run, and the given params through", async (t) => {
  const { executor, calls } = createFakeToolExecutor(() => ({
    executionId: "exec-1",
    status: "completed",
    output: { deleted: true, cancelled: false },
  }));
  const baseUrl = await startTestServer(buildApp(executor), t);

  const res = await postToolCall(
    baseUrl,
    { toolName: "content_post_delete", params: { id: "post-1", kind: "post", confirmationToken: "tok" } },
    { [RUN_PRINCIPAL_HEADER]: "principal-42" }
  );

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { deleted: true, cancelled: false });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].principal, { id: "principal-42" });
  assert.equal(calls[0].toolId, "content_post_delete");
  assert.deepEqual(calls[0].input, { id: "post-1", kind: "post", confirmationToken: "tok" });
  assert.ok(calls[0].run.id.length > 0, "a synthetic RunRef must still satisfy the structural {id} contract");
});

test("surfaces a 'failed' execution result (e.g. a stale/reused token) as 400 with the tool's own message", async (t) => {
  const { executor } = createFakeToolExecutor(() => ({
    executionId: "exec-2",
    status: "failed",
    error: "content_post_delete: the confirmation could not be redeemed (unknown-or-expired).",
  }));
  const baseUrl = await startTestServer(buildApp(executor), t);

  const res = await postToolCall(
    baseUrl,
    { toolName: "content_post_delete", params: { id: "post-1", kind: "post" } },
    { [RUN_PRINCIPAL_HEADER]: "principal-42" }
  );

  assert.equal(res.status, 400);
  assert.match(((await res.json()) as { error: string }).error, /could not be redeemed/);
});

test("maps a non-object params to an empty object rather than forwarding an unexpected shape", async (t) => {
  const { executor, calls } = createFakeToolExecutor(() => ({ executionId: "x", status: "completed", output: {} }));
  const baseUrl = await startTestServer(buildApp(executor), t);

  await postToolCall(baseUrl, { toolName: "content_post_delete", params: "not-an-object" }, { [RUN_PRINCIPAL_HEADER]: "principal-1" });

  assert.deepEqual(calls[0]?.input, {});
});
