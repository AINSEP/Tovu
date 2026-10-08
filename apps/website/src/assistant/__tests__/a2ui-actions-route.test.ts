import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { startTestServer } from "../../server/__tests__/helpers/http-test-server.js";
import { RUN_PRINCIPAL_HEADER } from "../daemon-access.js";
import { A2UI_ACTIONS_PATH, registerA2uiActionsRoute } from "../a2ui-actions-route.js";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


/**
 * @file Route-level tests for the daemon-side inbound half of A2UI (`a2ui-actions-route.ts`,
 * ADR-055 Decision 1, A2UI's own channel).
 *
 * No fake `ToolExecutor` here, unlike `mcp-ui-tool-calls-route.test.ts` — this route never reaches
 * one at all (see that file's own module doc for why re-gating a held-open call's answer would be
 * wrong), so there is nothing to assert was never called beyond the exchange itself staying open.
 */

function buildApp(surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" })): express.Express {
  const app = express();
  app.use(express.json());
  registerA2uiActionsRoute(app, { surfaceExchanges });
  return app;
}

async function postAction(baseUrl: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${baseUrl}${A2UI_ACTIONS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const ACTION_MESSAGE = {
  version: "v1.0",
  action: {
    name: "continue",
    surfaceId: "ex-1",
    sourceComponentId: "actionButton",
    timestamp: new Date().toISOString(),
    context: {},
  },
};

test("rejects a call with no principal header — 401, and nothing is delivered", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const exchange = surfaceExchanges.open({ binding: { toolId: "assistant_demo_a2ui", principalId: "principal-1", channel: "a2ui" }, emit: async () => undefined });
  t.after(() => exchange.close({}));
  const answer = exchange.receive({});
  const baseUrl = await startTestServer(buildApp(surfaceExchanges), t);
  const message = { ...ACTION_MESSAGE, action: { ...ACTION_MESSAGE.action, surfaceId: exchange.id } };

  const res = await postAction(baseUrl, { exchangeId: exchange.id, message });

  assert.equal(res.status, 401);
  assert.equal(surfaceExchanges.size(), 1, "unauthenticated delivery must leave the exchange open");
  assert.equal(await Promise.race([answer, Promise.resolve("still-waiting" as const)]), "still-waiting");
  const authorizedMessage = { ...message, action: { ...message.action, context: { authorized: true } } };
  const authorized = await postAction(baseUrl, { exchangeId: exchange.id, message: authorizedMessage }, { [RUN_PRINCIPAL_HEADER]: "principal-1" });
  assert.equal(authorized.status, 202);
  assert.deepEqual(await answer, { status: "received", params: { message: authorizedMessage } });
});

test("rejects a missing or empty exchangeId — 400", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const baseUrl = await startTestServer(buildApp(surfaceExchanges), t);
  const headers = { [RUN_PRINCIPAL_HEADER]: "principal-1" };

  const missing = await postAction(baseUrl, { message: ACTION_MESSAGE }, headers);
  const empty = await postAction(baseUrl, { exchangeId: "", message: ACTION_MESSAGE }, headers);

  assert.equal(missing.status, 400);
  assert.equal(empty.status, 400);
});

test("rejects a message that fails A2UI's own renderer->agent schema — 400, with the schema's own reason", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const baseUrl = await startTestServer(buildApp(surfaceExchanges), t);

  const res = await postAction(
    baseUrl,
    { exchangeId: "ex-1", message: { version: "v1.0", action: { name: "x" /* missing required fields */ } } },
    { [RUN_PRINCIPAL_HEADER]: "principal-1" }
  );

  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { code: string }).code, "VALIDATION_ERROR");
});

test("rejects a message whose declared surfaceId disagrees with the route's exchangeId", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const exchange = surfaceExchanges.open({ binding: { toolId: "assistant_demo_a2ui", principalId: "principal-1", channel: "a2ui" }, emit: async () => undefined });
  const answer = exchange.receive({});
  const baseUrl = await startTestServer(buildApp(surfaceExchanges), t);

  const res = await postAction(
    baseUrl,
    { exchangeId: exchange.id, message: { ...ACTION_MESSAGE, action: { ...ACTION_MESSAGE.action, surfaceId: "some-other-surface" } } },
    { [RUN_PRINCIPAL_HEADER]: "principal-1" }
  );

  assert.equal(res.status, 400);
  assert.equal(surfaceExchanges.size(), 1, "the mismatched request must not consume the still-open exchange");
  assert.equal(await Promise.race([answer, Promise.resolve("still-waiting" as const)]), "still-waiting");
});

test("delivers a matching action to the held-open exchange, and never needs a toolId", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const exchange = surfaceExchanges.open({ binding: { toolId: "assistant_demo_a2ui", principalId: "principal-1", channel: "a2ui" }, emit: async () => undefined });
  const answer = exchange.receive({});
  const baseUrl = await startTestServer(buildApp(surfaceExchanges), t);

  const message = { ...ACTION_MESSAGE, action: { ...ACTION_MESSAGE.action, surfaceId: exchange.id } };
  const res = await postAction(baseUrl, { exchangeId: exchange.id, message }, { [RUN_PRINCIPAL_HEADER]: "principal-1" });

  assert.equal(res.status, 202);
  assert.deepEqual(await res.json(), { delivered: true });
  assert.deepEqual(await answer, { status: "received", params: { message } });
});

test("a functionResponse message (no surfaceId at all) delivers without tripping the cross-check", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const exchange = surfaceExchanges.open({ binding: { toolId: "assistant_demo_a2ui", principalId: "principal-1", channel: "a2ui" }, emit: async () => undefined });
  const answer = exchange.receive({});
  const baseUrl = await startTestServer(buildApp(surfaceExchanges), t);

  const message = { version: "v1.0", functionResponse: { functionCallId: "call-1", call: "greetUser", value: "hi" } };
  const res = await postAction(baseUrl, { exchangeId: exchange.id, message }, { [RUN_PRINCIPAL_HEADER]: "principal-1" });

  assert.equal(res.status, 202);
  assert.deepEqual(await answer, { status: "received", params: { message } });
});

test("an error message carrying surfaceId is cross-checked against exchangeId, same as an action", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const exchange = surfaceExchanges.open({ binding: { toolId: "assistant_demo_a2ui", principalId: "principal-1", channel: "a2ui" }, emit: async () => undefined });
  const answer = exchange.receive({});
  const baseUrl = await startTestServer(buildApp(surfaceExchanges), t);

  const message = { version: "v1.0", error: { code: "VALIDATION_FAILED", surfaceId: exchange.id, path: "/foo", message: "bad" } };
  const res = await postAction(baseUrl, { exchangeId: exchange.id, message }, { [RUN_PRINCIPAL_HEADER]: "principal-1" });

  assert.equal(res.status, 202);
  assert.deepEqual(await answer, { status: "received", params: { message } });
});

test("an error message declaring the WRONG surfaceId is rejected, just like a mismatched action", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const exchange = surfaceExchanges.open({ binding: { toolId: "assistant_demo_a2ui", principalId: "principal-1", channel: "a2ui" }, emit: async () => undefined });
  const baseUrl = await startTestServer(buildApp(surfaceExchanges), t);

  const message = { version: "v1.0", error: { code: "VALIDATION_FAILED", surfaceId: "some-other-surface", path: "/foo", message: "bad" } };
  const res = await postAction(baseUrl, { exchangeId: exchange.id, message }, { [RUN_PRINCIPAL_HEADER]: "principal-1" });

  assert.equal(res.status, 400);
  assert.equal(surfaceExchanges.size(), 1, "the mismatched error must not consume the still-open exchange");
});

test("a generic error message keyed by functionCallId (no surfaceId) delivers without tripping the cross-check", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const exchange = surfaceExchanges.open({ binding: { toolId: "assistant_demo_a2ui", principalId: "principal-1", channel: "a2ui" }, emit: async () => undefined });
  const answer = exchange.receive({});
  const baseUrl = await startTestServer(buildApp(surfaceExchanges), t);

  const message = { version: "v1.0", error: { code: "TIMEOUT", functionCallId: "call-1", message: "timed out" } };
  const res = await postAction(baseUrl, { exchangeId: exchange.id, message }, { [RUN_PRINCIPAL_HEADER]: "principal-1" });

  assert.equal(res.status, 202);
  assert.deepEqual(await answer, { status: "received", params: { message } });
});

test("an unknown, expired, or already-closed exchange is 409, not 404 or a silent success", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const baseUrl = await startTestServer(buildApp(surfaceExchanges), t);

  const res = await postAction(
    baseUrl,
    { exchangeId: "never-minted", message: { ...ACTION_MESSAGE, action: { ...ACTION_MESSAGE.action, surfaceId: "never-minted" } } },
    { [RUN_PRINCIPAL_HEADER]: "principal-1" }
  );

  assert.equal(res.status, 409);
  assert.equal(((await res.json()) as { code: string }).code, "SURFACE_NOT_PENDING");
});

test("an actually expired exchange rejects delivery with 409", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }, { idleTtlMs: 1 });
  const baseUrl = await startTestServer(buildApp(surfaceExchanges), t);
  const exchange = surfaceExchanges.open({ binding: { toolId: "assistant_demo_a2ui", principalId: "principal-1", channel: "a2ui" }, emit: async () => undefined });
  t.after(() => exchange.close({}));
  assert.deepEqual(await exchange.receive({}), { status: "expired" });
  const message = { ...ACTION_MESSAGE, action: { ...ACTION_MESSAGE.action, surfaceId: exchange.id } };

  const res = await postAction(baseUrl, { exchangeId: exchange.id, message }, { [RUN_PRINCIPAL_HEADER]: "principal-1" });

  assert.equal(res.status, 409);
  assert.equal(((await res.json()) as { code: string }).code, "SURFACE_NOT_PENDING");
  assert.equal(surfaceExchanges.size(), 0);
  assert.deepEqual(await exchange.receive({}), { status: "expired" }, "rejected delivery must not buffer an answer");
});

test("an answered exchange rejects a replay with 409 after the handler closes it", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const baseUrl = await startTestServer(buildApp(surfaceExchanges), t);
  const exchange = surfaceExchanges.open({ binding: { toolId: "assistant_demo_a2ui", principalId: "principal-1", channel: "a2ui" }, emit: async () => undefined });
  t.after(() => exchange.close({}));
  const message = { ...ACTION_MESSAGE, action: { ...ACTION_MESSAGE.action, surfaceId: exchange.id } };
  const headers = { [RUN_PRINCIPAL_HEADER]: "principal-1" };
  const first = await postAction(baseUrl, { exchangeId: exchange.id, message }, headers);
  assert.equal(first.status, 202);
  assert.deepEqual(await exchange.receive({}), { status: "received", params: { message } });
  exchange.close({});

  const replay = await postAction(baseUrl, { exchangeId: exchange.id, message }, headers);

  assert.equal(replay.status, 409);
  assert.equal(((await replay.json()) as { code: string }).code, "SURFACE_NOT_PENDING");
  assert.equal(surfaceExchanges.size(), 0);
  assert.deepEqual(await exchange.receive({}), { status: "abandoned" }, "replay must not buffer a second answer");
});

test("an action from the wrong principal is refused and leaves the call still waiting", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const exchange = surfaceExchanges.open({ binding: { toolId: "assistant_demo_a2ui", principalId: "alice", channel: "a2ui" }, emit: async () => undefined });
  const answer = exchange.receive({});
  const baseUrl = await startTestServer(buildApp(surfaceExchanges), t);

  const message = { ...ACTION_MESSAGE, action: { ...ACTION_MESSAGE.action, surfaceId: exchange.id } };
  const res = await postAction(baseUrl, { exchangeId: exchange.id, message }, { [RUN_PRINCIPAL_HEADER]: "mallory" });

  assert.equal(res.status, 409);
  assert.equal(surfaceExchanges.size(), 1, "alice's exchange must not be consumed by mallory's post");
  assert.equal(await Promise.race([answer, Promise.resolve("still-waiting" as const)]), "still-waiting");
});

test("an A2UI post cannot answer or cancel a pending MCP-UI confirmation of the same principal", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  // No channel: every MCP-UI tool opens this way, e.g. a delete confirmation.
  const exchange = surfaceExchanges.open({ binding: { toolId: "content_post_delete", principalId: "principal-1" }, emit: async () => undefined });
  const answer = exchange.receive({});
  const baseUrl = await startTestServer(buildApp(surfaceExchanges), t);

  const message = { ...ACTION_MESSAGE, action: { ...ACTION_MESSAGE.action, surfaceId: exchange.id } };
  const res = await postAction(baseUrl, { exchangeId: exchange.id, message }, { [RUN_PRINCIPAL_HEADER]: "principal-1" });

  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), {
    error: "that surface is no longer waiting for an answer",
    code: "SURFACE_NOT_PENDING",
    reason: "binding-mismatch",
  });
  assert.equal(await Promise.race([answer, Promise.resolve("still-waiting" as const)]), "still-waiting");
});
