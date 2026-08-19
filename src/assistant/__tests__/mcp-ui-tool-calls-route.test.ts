import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import type { Principal, RunRef } from "@jini-ai/core";
import type { ToolExecutionResult, ToolExecutor } from "@jini-ai/daemon";

import { startTestServer } from "../../server/__tests__/helpers/http-test-server.js";
import { RUN_PRINCIPAL_HEADER } from "../run-ownership.js";
import { MCP_UI_TOOL_CALLS_PATH, registerMcpUiToolCallsRoute } from "../mcp-ui-tool-calls-route.js";
import { SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore } from "../../core/tool-surface-exchanges.js";

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

function buildApp(toolExecutor: ToolExecutor, surfaceExchanges = createSurfaceExchangeStore()): express.Express {
  const app = express();
  app.use(express.json());
  registerMcpUiToolCallsRoute(app, { toolExecutor, surfaceExchanges });
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

/**
 * ---- Shape 1: exchange delivery (ADR-055 Decision 1) ----
 *
 * The distinguishing property of this half is a NEGATIVE one: the executor is never touched. The
 * held-open call already passed the registry's authorization gate when the agent made it, so running
 * that gate again here would be authorizing the human's answer as though it were a fresh
 * invocation. Every test below therefore asserts `calls.length === 0` alongside its own subject.
 */

test("a body carrying an exchange id delivers to the held-open call and never invokes the executor", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const { executor, calls } = createFakeToolExecutor(() => ({ executionId: "x", status: "completed", output: {} }));
  const baseUrl = await startTestServer(buildApp(executor, surfaceExchanges), t);

  const exchange = surfaceExchanges.open({ toolId: "content_post_delete", principalId: "principal-1" }, async () => undefined);
  const answer = exchange.receive();
  const res = await postToolCall(
    baseUrl,
    { toolName: "content_post_delete", params: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id, plan: "pro", extras: ["a", "b"] } },
    { [RUN_PRINCIPAL_HEADER]: "principal-1" }
  );

  assert.equal(res.status, 202);
  assert.deepEqual(await res.json(), { delivered: true });
  assert.equal(calls.length, 0, "an exchange delivery must not re-execute the tool");
  assert.deepEqual(await answer, {
    status: "received",
    params: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id, plan: "pro", extras: ["a", "b"] },
  });
});

test("the delivery response carries no tool output — the agent's own call returns that, to the model", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const { executor } = createFakeToolExecutor(() => ({ executionId: "x", status: "completed", output: { secret: "leaked" } }));
  const baseUrl = await startTestServer(buildApp(executor, surfaceExchanges), t);

  const exchange = surfaceExchanges.open({ toolId: "content_post_delete", principalId: "principal-1" }, async () => undefined);
  const res = await postToolCall(
    baseUrl,
    { toolName: "content_post_delete", params: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id } },
    { [RUN_PRINCIPAL_HEADER]: "principal-1" }
  );

  // Echoing the result here would make this response a second copy of an answer the human already
  // gave, and hand the iframe output it has no use for.
  assert.deepEqual(Object.keys((await res.json()) as object), ["delivered"]);
});

test("an unknown, expired or already-closed exchange is 409, not 404 or a silent success", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const { executor, calls } = createFakeToolExecutor(() => ({ executionId: "x", status: "completed", output: {} }));
  const baseUrl = await startTestServer(buildApp(executor, surfaceExchanges), t);

  const res = await postToolCall(
    baseUrl,
    { toolName: "content_post_delete", params: { [SURFACE_EXCHANGE_ID_PARAM]: "never-minted" } },
    { [RUN_PRINCIPAL_HEADER]: "principal-1" }
  );

  assert.equal(res.status, 409);
  assert.equal(((await res.json()) as { code: string }).code, "SURFACE_NOT_PENDING");
  assert.equal(calls.length, 0);
});

test("an exchange delivery from the wrong principal is refused and leaves the call still waiting", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const { executor, calls } = createFakeToolExecutor(() => ({ executionId: "x", status: "completed", output: {} }));
  const baseUrl = await startTestServer(buildApp(executor, surfaceExchanges), t);

  const exchange = surfaceExchanges.open({ toolId: "content_post_delete", principalId: "alice" }, async () => undefined);
  const answer = exchange.receive();
  const res = await postToolCall(
    baseUrl,
    { toolName: "content_post_delete", params: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id } },
    { [RUN_PRINCIPAL_HEADER]: "mallory" }
  );

  assert.equal(res.status, 409);
  assert.equal(calls.length, 0);
  assert.equal(surfaceExchanges.size(), 1, "alice's dialog is still open; her call must not be consumed");
  assert.equal(await Promise.race([answer, Promise.resolve("still-waiting" as const)]), "still-waiting");
});

test("the allowlist gate still applies to an exchange delivery, before the exchange is even looked up", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const { executor } = createFakeToolExecutor(() => ({ executionId: "x", status: "completed", output: {} }));
  const baseUrl = await startTestServer(buildApp(executor, surfaceExchanges), t);

  const exchange = surfaceExchanges.open({ toolId: "not_allowlisted", principalId: "principal-1" }, async () => undefined);
  const res = await postToolCall(
    baseUrl,
    { toolName: "not_allowlisted", params: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id } },
    { [RUN_PRINCIPAL_HEADER]: "principal-1" }
  );

  // Defence in depth rather than the load-bearing check (the park's own binding is that), but the
  // route must not grow a second entrance that skips a gate the other shape enforces.
  assert.equal(res.status, 403);
  assert.equal(surfaceExchanges.size(), 1);
});

test("a body with no exchange id still takes the legacy redemption path unchanged", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const { executor, calls } = createFakeToolExecutor(() => ({ executionId: "x", status: "completed", output: { ok: true } }));
  const baseUrl = await startTestServer(buildApp(executor, surfaceExchanges), t);

  const res = await postToolCall(
    baseUrl,
    { toolName: "content_post_delete", params: { id: "post-1", token: "t" } },
    { [RUN_PRINCIPAL_HEADER]: "principal-1" }
  );

  // ADR-053's path stays in force until ADR-055 Decision 2 replaces it; the discriminator is the
  // park id's presence, so the delete flow is untouched by this change.
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.input, { id: "post-1", token: "t" });
});

test("an empty or non-string exchange id falls through to the legacy path rather than 409-ing", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const { executor, calls } = createFakeToolExecutor(() => ({ executionId: "x", status: "completed", output: {} }));
  const baseUrl = await startTestServer(buildApp(executor, surfaceExchanges), t);

  const empty = await postToolCall(
    baseUrl,
    { toolName: "content_post_delete", params: { [SURFACE_EXCHANGE_ID_PARAM]: "" } },
    { [RUN_PRINCIPAL_HEADER]: "principal-1" }
  );
  const wrongType = await postToolCall(
    baseUrl,
    { toolName: "content_post_delete", params: { [SURFACE_EXCHANGE_ID_PARAM]: 42 } },
    { [RUN_PRINCIPAL_HEADER]: "principal-1" }
  );

  assert.equal(empty.status, 200);
  assert.equal(wrongType.status, 200);
  assert.equal(calls.length, 2);
});

test("a top-level exchangeId works without any tool-call params — the channel-neutral carrier", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const { executor, calls } = createFakeToolExecutor(() => ({ executionId: "x", status: "completed", output: {} }));
  const baseUrl = await startTestServer(buildApp(executor, surfaceExchanges), t);

  const exchange = surfaceExchanges.open({ toolId: "content_post_delete", principalId: "principal-1" }, async () => undefined);
  const answer = exchange.receive();

  // MCP-UI has to smuggle its correlation through tool-call params, because an mcp-ui surface can
  // only answer by issuing a tool call. A channel that can name the exchange directly — A2UI, the
  // protocol's own surface_response, anything later — uses this and never touches that shape. That
  // is what stops this route from being MCP-only.
  const res = await postToolCall(
    baseUrl,
    { toolName: "content_post_delete", exchangeId: exchange.id, params: { action: "submit", value: 7 } },
    { [RUN_PRINCIPAL_HEADER]: "principal-1" }
  );

  assert.equal(res.status, 202);
  assert.equal(calls.length, 0);
  assert.deepEqual(await answer, { status: "received", params: { action: "submit", value: 7 } });
});

test("a top-level exchangeId wins over a params-borne one, so one body cannot name two exchanges", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const { executor } = createFakeToolExecutor(() => ({ executionId: "x", status: "completed", output: {} }));
  const baseUrl = await startTestServer(buildApp(executor, surfaceExchanges), t);

  const real = surfaceExchanges.open({ toolId: "content_post_delete", principalId: "principal-1" }, async () => undefined);
  const other = surfaceExchanges.open({ toolId: "content_post_delete", principalId: "principal-1" }, async () => undefined);
  const realAnswer = real.receive();

  await postToolCall(
    baseUrl,
    { toolName: "content_post_delete", exchangeId: real.id, params: { [SURFACE_EXCHANGE_ID_PARAM]: other.id } },
    { [RUN_PRINCIPAL_HEADER]: "principal-1" }
  );

  assert.deepEqual(await realAnswer, { status: "received", params: { [SURFACE_EXCHANGE_ID_PARAM]: other.id } });
  assert.equal(
    await Promise.race([other.receive(), Promise.resolve("untouched" as const)]),
    "untouched",
    "the params-borne id must not also be delivered to"
  );
});
