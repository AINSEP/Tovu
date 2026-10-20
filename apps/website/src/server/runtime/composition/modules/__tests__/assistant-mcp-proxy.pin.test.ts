import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createRouteDeps } from "../../app.js";
import { createByokToolSurface, MCP_UI_TOOL_CALLS_PATH, SURFACE_EXCHANGE_ID_PARAM } from "#src/assistant/index";
import { SURFACE_TYPED_ANSWER_PARAM } from "@jini-ai/daemon/surface-exchanges";
import { registerAuthRoutes } from "#src/server/inbound/admin-http/dev-auth";
import { bootAuthenticated } from "#src/server/__tests__/helpers/http-test-server";
import { startStubProviderServer } from "#src/server/__tests__/helpers/stub-provider-server";
import { createAssistantModule } from "../assistant.js";

/** TW2 L136: correlation precedence and local-first delivery, including security refusals. */
test("MCP proxy pins validation, explicit/param/typed correlations and authoritative daemon fallback", async t => {
  const deps = createRouteDeps();
  const store = createByokToolSurface(deps, { installExtensions: false }).surfaceExchanges;
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  createAssistantModule(deps, store).registerRoutes?.(app);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const previous = process.env.JINI_AGENT_DAEMON_URL;
  t.after(() => { if (previous === undefined) delete process.env.JINI_AGENT_DAEMON_URL; else process.env.JINI_AGENT_DAEMON_URL = previous; });
  const forwarded: Record<string, unknown>[] = [];
  process.env.JINI_AGENT_DAEMON_URL = await startStubProviderServer(t, (_count, body) => {
    forwarded.push(body);
    return { status: 200, body: JSON.stringify({ daemon: true }) };
  });
  const post = (body: unknown) => fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(2000) });
  for (const toolName of [undefined, "", 7]) {
    const response = await post({ toolName });
    assert.equal(response.status, 400);
    assert.equal((await response.json() as { code: string }).code, "VALIDATION_ERROR");
  }
  const denied = await post({ toolName: "unregistered_tool" });
  assert.equal(denied.status, 403);
  await denied.text();
  const toolName = "assistant_ask_choice";
  const principalId = await deps.ownerPrincipalId;
  for (const carrier of ["top", "params", "typed", "empty-top"] as const) {
    const exchange = store.open({ binding: { toolId: toolName, principalId }, emit: async () => undefined });
    try {
      const params = { answer: "yes", [SURFACE_EXCHANGE_ID_PARAM]: exchange.id };
      const bodies = {
        top: { toolName, exchangeId: exchange.id, params: { ...params, [SURFACE_EXCHANGE_ID_PARAM]: "ignored" } },
        params: { toolName, exchangeId: 7, params },
        typed: { toolName, params: { [SURFACE_TYPED_ANSWER_PARAM]: "yes" } },
        "empty-top": { toolName, exchangeId: "", params },
      };
      const response = await post(bodies[carrier]);
      assert.equal(response.status, carrier === "empty-top" ? 200 : 202);
      await response.text();
      if (carrier !== "empty-top") assert.equal((await exchange.receive({})).status, "received");
    } finally { exchange.close({}); }
  }
  const wrongOwner = store.open({ binding: { toolId: toolName, principalId: "someone-else" }, emit: async () => undefined });
  try {
    const response = await post({ toolName, exchangeId: wrongOwner.id });
    assert.equal(response.status, 409);
    assert.equal((await response.json() as { reason: string }).reason, "binding-mismatch");
  } finally { wrongOwner.close({}); }
  for (const body of [
    { toolName, exchangeId: "daemon-owned", params: [] },
    { toolName, params: { [SURFACE_TYPED_ANSWER_PARAM]: "unmatched" } },
    { toolName, params: null },
  ]) {
    const response = await post(body);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { daemon: true });
  }
  assert.equal(forwarded.length, 4);
});
