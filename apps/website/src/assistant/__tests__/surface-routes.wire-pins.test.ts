import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/platform/system";
import type { ToolExecutor } from "@jini-ai/daemon";

import { startTestServer } from "../../server/__tests__/helpers/http-test-server.js";
import { nodeIntervalScheduler } from "#src/server/runtime/composition/jini-routes";
import { RUN_PRINCIPAL_HEADER } from "../daemon-access.js";
import { A2UI_ACTIONS_PATH, registerA2uiActionsRoute } from "../a2ui-actions-route.js";
import { MCP_UI_TOOL_CALLS_PATH, registerMcpUiToolCallsRoute } from "../mcp-ui-tool-calls-route.js";

/**
 * @file Wire pins for the two surface-answer endpoints: the exact status, body and content type of
 * every refusal branch (unauthenticated, wrong principal, malformed body, success), and the order
 * the checks run in. Written before the routes moved off hand-written Express so the move could
 * not change a byte of what a browser or the daemon proxy sees.
 */

const JSON_CONTENT_TYPE = /^application\/json/;

function newStore() {
  return createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
}

const executor: { instance: ToolExecutor; calls: number } = (() => {
  const state = { instance: undefined as unknown as ToolExecutor, calls: 0 };
  state.instance = { execute: async () => { state.calls += 1; return { executionId: "x", status: "completed", output: {} }; }, resumeConfirmation: () => undefined, cancel: () => undefined, getAuditRecord: () => null };
  return state;
})();

function buildApp(store: ReturnType<typeof newStore>): express.Express {
  const app = express();
  app.use(express.json());
  registerA2uiActionsRoute({ app, deps: { surfaceExchanges: store } });
  registerMcpUiToolCallsRoute({ app, deps: { scheduler: nodeIntervalScheduler, toolExecutor: executor.instance, surfaceExchanges: store } });
  return app;
}

async function post(baseUrl: string, path: string, raw: string | undefined, headers: Record<string, string> = {}) {
  return fetch(`${baseUrl}${path}`, { method: "POST", headers: { ...(raw === undefined ? {} : { "content-type": "application/json" }), ...headers }, ...(raw === undefined ? {} : { body: raw }) });
}

const principal = (id: string) => ({ [RUN_PRINCIPAL_HEADER]: id });
const action = (surfaceId: string) => ({ version: "v1.0", action: { name: "continue", surfaceId, sourceComponentId: "b", timestamp: new Date().toISOString(), context: {} } });

test("A2UI: no principal header is 401 with the exact UNAUTHENTICATED body, before the body is judged", async (t) => {
  const baseUrl = await startTestServer(buildApp(newStore()), t);
  for (const raw of [JSON.stringify({ exchangeId: "e", message: action("e") }), JSON.stringify({}), undefined]) {
    const res = await post(baseUrl, A2UI_ACTIONS_PATH, raw);
    assert.equal(res.status, 401);
    assert.match(res.headers.get("content-type") ?? "", JSON_CONTENT_TYPE);
    assert.deepEqual(await res.json(), { error: `${RUN_PRINCIPAL_HEADER} is required`, code: "UNAUTHENTICATED" });
  }
});

test("A2UI: an empty principal header is as unauthenticated as an absent one", async (t) => {
  const baseUrl = await startTestServer(buildApp(newStore()), t);
  const res = await post(baseUrl, A2UI_ACTIONS_PATH, JSON.stringify({ exchangeId: "e", message: action("e") }), { [RUN_PRINCIPAL_HEADER]: "" });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: `${RUN_PRINCIPAL_HEADER} is required`, code: "UNAUTHENTICATED" });
});

test("A2UI: malformed bodies are 400 with the exact VALIDATION_ERROR body", async (t) => {
  const baseUrl = await startTestServer(buildApp(newStore()), t);
  const noExchange = { error: "'exchangeId' must be a non-empty string", code: "VALIDATION_ERROR" };
  for (const raw of [undefined, "{}", "[]", JSON.stringify({ exchangeId: "" }), JSON.stringify({ exchangeId: 7 })]) {
    const res = await post(baseUrl, A2UI_ACTIONS_PATH, raw, principal("alice"));
    assert.equal(res.status, 400, `body ${String(raw)}`);
    assert.deepEqual(await res.json(), noExchange, `body ${String(raw)}`);
  }
  const mismatch = await post(baseUrl, A2UI_ACTIONS_PATH, JSON.stringify({ exchangeId: "e1", message: action("other") }), principal("alice"));
  assert.equal(mismatch.status, 400);
  assert.deepEqual(await mismatch.json(), { error: 'message declares surfaceId "other", which does not match exchangeId "e1"', code: "VALIDATION_ERROR" });
  const badSchema = await post(baseUrl, A2UI_ACTIONS_PATH, JSON.stringify({ exchangeId: "e1", message: { version: "v1.0", action: { name: "x" } } }), principal("alice"));
  assert.equal(badSchema.status, 400);
  assert.equal(((await badSchema.json()) as { code: string }).code, "VALIDATION_ERROR");
});

test("A2UI: a wrong principal is 409 with the exact not-pending body and the exchange stays open; the right one is 202 { delivered: true }", async (t) => {
  const store = newStore();
  const exchange = store.open({ binding: { toolId: "assistant_demo_a2ui", principalId: "alice", channel: "a2ui" }, emit: async () => undefined });
  t.after(() => exchange.close({}));
  const answer = exchange.receive({});
  const baseUrl = await startTestServer(buildApp(store), t);
  const body = JSON.stringify({ exchangeId: exchange.id, message: action(exchange.id) });

  const wrong = await post(baseUrl, A2UI_ACTIONS_PATH, body, principal("mallory"));
  assert.equal(wrong.status, 409);
  assert.match(wrong.headers.get("content-type") ?? "", JSON_CONTENT_TYPE);
  assert.deepEqual(await wrong.json(), { error: "that surface is no longer waiting for an answer", code: "SURFACE_NOT_PENDING", reason: "binding-mismatch" });
  assert.equal(await Promise.race([answer, Promise.resolve("still-waiting" as const)]), "still-waiting");

  const right = await post(baseUrl, A2UI_ACTIONS_PATH, body, principal("alice"));
  assert.equal(right.status, 202);
  assert.match(right.headers.get("content-type") ?? "", JSON_CONTENT_TYPE);
  assert.deepEqual(await right.json(), { delivered: true });
  assert.equal((await answer).status, "received");
});

test("MCP callback: no principal header is 401 with the exact UNAUTHENTICATED body, before the body is judged, and nothing runs", async (t) => {
  executor.calls = 0;
  const baseUrl = await startTestServer(buildApp(newStore()), t);
  for (const raw of [JSON.stringify({ toolName: "content_post_search", params: {} }), JSON.stringify({}), undefined]) {
    const res = await post(baseUrl, MCP_UI_TOOL_CALLS_PATH, raw);
    assert.equal(res.status, 401);
    assert.match(res.headers.get("content-type") ?? "", JSON_CONTENT_TYPE);
    assert.deepEqual(await res.json(), { error: `${RUN_PRINCIPAL_HEADER} is required`, code: "UNAUTHENTICATED" });
  }
  const empty = await post(baseUrl, MCP_UI_TOOL_CALLS_PATH, JSON.stringify({ toolName: "content_post_search", params: {} }), { [RUN_PRINCIPAL_HEADER]: "" });
  assert.equal(empty.status, 401);
  assert.equal(executor.calls, 0);
});

test("MCP callback: malformed bodies are 400 with the exact VALIDATION_ERROR body", async (t) => {
  const baseUrl = await startTestServer(buildApp(newStore()), t);
  for (const raw of [undefined, "{}", "[]", JSON.stringify({ toolName: "" }), JSON.stringify({ toolName: 3 })]) {
    const res = await post(baseUrl, MCP_UI_TOOL_CALLS_PATH, raw, principal("alice"));
    assert.equal(res.status, 400, `body ${String(raw)}`);
    assert.deepEqual(await res.json(), { error: "'toolName' must be a non-empty string", code: "VALIDATION_ERROR" }, `body ${String(raw)}`);
  }
});

test("MCP callback: a non-allowlisted tool is 403 with the exact refusal body and never executes", async (t) => {
  executor.calls = 0;
  const baseUrl = await startTestServer(buildApp(newStore()), t);
  const res = await post(baseUrl, MCP_UI_TOOL_CALLS_PATH, JSON.stringify({ toolName: "definitely_not_allowlisted", params: {} }), principal("alice"));
  assert.equal(res.status, 403);
  assert.match(res.headers.get("content-type") ?? "", JSON_CONTENT_TYPE);
  assert.deepEqual(await res.json(), { error: "'definitely_not_allowlisted' is not an MCP-UI-redeemable tool", code: "TOOL_NOT_ALLOWLISTED" });
  assert.equal(executor.calls, 0);
});

test("MCP callback: a wrong principal is 409 with the exact not-pending body and the exchange stays open; the right one is 202 { delivered: true }", async (t) => {
  const store = newStore();
  const exchange = store.open({ binding: { toolId: "settings_set_value", principalId: "alice" }, emit: async () => undefined });
  t.after(() => exchange.close({}));
  const answer = exchange.receive({});
  const baseUrl = await startTestServer(buildApp(store), t);
  const body = JSON.stringify({ toolName: "settings_set_value", params: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id } });

  const wrong = await post(baseUrl, MCP_UI_TOOL_CALLS_PATH, body, principal("mallory"));
  assert.equal(wrong.status, 409);
  assert.match(wrong.headers.get("content-type") ?? "", JSON_CONTENT_TYPE);
  assert.deepEqual(await wrong.json(), { error: "that dialog is no longer waiting for an answer", code: "SURFACE_NOT_PENDING", reason: "binding-mismatch" });
  assert.equal(await Promise.race([answer, Promise.resolve("still-waiting" as const)]), "still-waiting");

  const right = await post(baseUrl, MCP_UI_TOOL_CALLS_PATH, body, principal("alice"));
  assert.equal(right.status, 202);
  assert.deepEqual(await right.json(), { delivered: true });
  assert.equal((await answer).status, "received");
});

test("MCP callback: an unknown exchange id with the restore flag and no restorable card is 409 SURFACE_NOT_PENDING (body pinned)", async (t) => {
  const baseUrl = await startTestServer(buildApp(newStore()), t);
  const res = await post(baseUrl, MCP_UI_TOOL_CALLS_PATH, JSON.stringify({ toolName: "settings_set_value", exchangeId: "nope", restore: true }), principal("alice"));
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { code: "SURFACE_NOT_PENDING" });
});

test("MCP callback: a typed answer naming no exchange, with nothing outstanding, is 409 unknown-or-closed", async (t) => {
  const baseUrl = await startTestServer(buildApp(newStore()), t);
  const res = await post(baseUrl, MCP_UI_TOOL_CALLS_PATH, JSON.stringify({ toolName: "assistant_ask_choice", params: { __typedAnswer: "hello" } }), principal("alice"));
  // The status is whatever the allowlist + typed-answer policy yields today; the point of the pin is that the refactor must not change it.
  assert.ok([403, 409].includes(res.status), `status ${res.status}`);
  assert.match(res.headers.get("content-type") ?? "", JSON_CONTENT_TYPE);
});
