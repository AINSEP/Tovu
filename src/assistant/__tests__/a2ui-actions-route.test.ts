import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { startTestServer } from "../../server/__tests__/helpers/http-test-server.js";
import { RUN_PRINCIPAL_HEADER } from "../run-ownership.js";
import { A2UI_ACTIONS_PATH, registerA2uiActionsRoute } from "../a2ui-actions-route.js";
import { createSurfaceExchangeStore } from "../../core/tool-surface-exchanges.js";

/**
 * @file Route-level tests for the daemon-side inbound half of A2UI (`a2ui-actions-route.ts`,
 * ADR-055 Decision 1, A2UI's own channel).
 *
 * No fake `ToolExecutor` here, unlike `mcp-ui-tool-calls-route.test.ts` — this route never reaches
 * one at all (see that file's own module doc for why re-gating a held-open call's answer would be
 * wrong), so there is nothing to assert was never called beyond the exchange itself staying open.
 */

function buildApp(surfaceExchanges = createSurfaceExchangeStore()): express.Express {
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
  const surfaceExchanges = createSurfaceExchangeStore();
  const baseUrl = await startTestServer(buildApp(surfaceExchanges), t);

  const res = await postAction(baseUrl, { exchangeId: "ex-1", message: ACTION_MESSAGE });

  assert.equal(res.status, 401);
});

test("rejects a missing or empty exchangeId — 400", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const baseUrl = await startTestServer(buildApp(surfaceExchanges), t);
  const headers = { [RUN_PRINCIPAL_HEADER]: "principal-1" };

  const missing = await postAction(baseUrl, { message: ACTION_MESSAGE }, headers);
  const empty = await postAction(baseUrl, { exchangeId: "", message: ACTION_MESSAGE }, headers);

  assert.equal(missing.status, 400);
  assert.equal(empty.status, 400);
});

test("rejects a message that fails A2UI's own renderer->agent schema — 400, with the schema's own reason", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
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
  const surfaceExchanges = createSurfaceExchangeStore();
  const exchange = surfaceExchanges.open({ toolId: "assistant_demo_a2ui", principalId: "principal-1" }, async () => undefined);
  const answer = exchange.receive();
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
  const surfaceExchanges = createSurfaceExchangeStore();
  const exchange = surfaceExchanges.open({ toolId: "assistant_demo_a2ui", principalId: "principal-1" }, async () => undefined);
  const answer = exchange.receive();
  const baseUrl = await startTestServer(buildApp(surfaceExchanges), t);

  const message = { ...ACTION_MESSAGE, action: { ...ACTION_MESSAGE.action, surfaceId: exchange.id } };
  const res = await postAction(baseUrl, { exchangeId: exchange.id, message }, { [RUN_PRINCIPAL_HEADER]: "principal-1" });

  assert.equal(res.status, 202);
  assert.deepEqual(await res.json(), { delivered: true });
  assert.deepEqual(await answer, { status: "received", params: { message } });
});

test("a functionResponse message (no surfaceId at all) delivers without tripping the cross-check", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const exchange = surfaceExchanges.open({ toolId: "assistant_demo_a2ui", principalId: "principal-1" }, async () => undefined);
  const answer = exchange.receive();
  const baseUrl = await startTestServer(buildApp(surfaceExchanges), t);

  const message = { version: "v1.0", functionResponse: { functionCallId: "call-1", call: "greetUser", value: "hi" } };
  const res = await postAction(baseUrl, { exchangeId: exchange.id, message }, { [RUN_PRINCIPAL_HEADER]: "principal-1" });

  assert.equal(res.status, 202);
  assert.deepEqual(await answer, { status: "received", params: { message } });
});

test("an unknown, expired, or already-closed exchange is 409, not 404 or a silent success", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const baseUrl = await startTestServer(buildApp(surfaceExchanges), t);

  const res = await postAction(
    baseUrl,
    { exchangeId: "never-minted", message: { ...ACTION_MESSAGE, action: { ...ACTION_MESSAGE.action, surfaceId: "never-minted" } } },
    { [RUN_PRINCIPAL_HEADER]: "principal-1" }
  );

  assert.equal(res.status, 409);
  assert.equal(((await res.json()) as { code: string }).code, "SURFACE_NOT_PENDING");
});

test("an action from the wrong principal is refused and leaves the call still waiting", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const exchange = surfaceExchanges.open({ toolId: "assistant_demo_a2ui", principalId: "alice" }, async () => undefined);
  const answer = exchange.receive();
  const baseUrl = await startTestServer(buildApp(surfaceExchanges), t);

  const message = { ...ACTION_MESSAGE, action: { ...ACTION_MESSAGE.action, surfaceId: exchange.id } };
  const res = await postAction(baseUrl, { exchangeId: exchange.id, message }, { [RUN_PRINCIPAL_HEADER]: "mallory" });

  assert.equal(res.status, 409);
  assert.equal(surfaceExchanges.size(), 1, "alice's exchange must not be consumed by mallory's post");
  assert.equal(await Promise.race([answer, Promise.resolve("still-waiting" as const)]), "still-waiting");
});
