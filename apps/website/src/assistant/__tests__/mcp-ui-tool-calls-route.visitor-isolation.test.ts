import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import express from "express";
import ts from "typescript";

import { createToolRegistry } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/platform/system";
import { startTestServer } from "../../server/__tests__/helpers/http-test-server.js";
import { nodeIntervalScheduler } from "../../server/runtime/composition/jini-routes.js";
import { RUN_PRINCIPAL_HEADER } from "../daemon-access.js";
import { MCP_UI_TOOL_CALLS_PATH, registerMcpUiToolCallsRoute } from "../mcp-ui-tool-calls-route.js";

function assertDedicatedVisitorStore() {
  const filename = new URL("../../server/runtime/composition/modules/site-assistant.ts", import.meta.url);
  const source = ts.createSourceFile(filename.pathname, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true);
  const factory = source.statements.find((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === "createSiteAssistantModule");
  assert.ok(factory?.body);
  const confirmations = factory.body.statements.filter(ts.isVariableStatement)
    .flatMap(node => [...node.declarationList.declarations])
    .find(node => ts.isIdentifier(node.name) && node.name.text === "confirmations");
  assert.ok(confirmations?.initializer && ts.isCallExpression(confirmations.initializer));
  assert.equal(confirmations.initializer.expression.getText(source), "createVisitorConfirmations");
  const deps = confirmations.initializer.arguments[0];
  assert.ok(deps && ts.isObjectLiteralExpression(deps));
  const exchanges = deps.properties.find((node): node is ts.PropertyAssignment =>
    ts.isPropertyAssignment(node) && node.name.getText(source) === "exchanges");
  assert.ok(exchanges && ts.isCallExpression(exchanges.initializer));
  assert.equal(exchanges.initializer.expression.getText(source), "createSurfaceExchangeStore");
  assert.match(exchanges.initializer.arguments[0]!.getText(source), /defaultChannel:\s*"visitor-tool-confirmation"/);
}

test("admin MCP-UI replies cannot deliver visitor exchanges and the site assistant creates its own store", async t => {
  assertDedicatedVisitorStore();
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(),
    idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const toolId = "settings_set_value";
  const principalId = "anonymous-visitor";
  const channel = "visitor-tool-confirmation";
  const exchange = store.open({ binding: { toolId, principalId, channel }, emit: async () => undefined });
  const answer = exchange.receive({});
  const app = express();
  app.use(express.json());
  registerMcpUiToolCallsRoute({ app, deps: { scheduler: nodeIntervalScheduler,
    toolExecutor: createToolExecutor({ registry: createToolRegistry({}) }), surfaceExchanges: store } });
  try {
    const baseUrl = await startTestServer(app, t);
    for (const replyPrincipal of ["admin-principal", principalId]) {
      const response = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
        method: "POST", headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: replyPrincipal },
        body: JSON.stringify({ toolName: toolId, exchangeId: exchange.id, params: { allow: true } }),
        signal: AbortSignal.timeout(2000),
      });
      assert.equal(response.status, 409);
      assert.equal((await response.json() as { reason: string }).reason, "binding-mismatch");
      assert.equal(store.size(), 1);
      assert.equal(await Promise.race([answer, Promise.resolve("waiting")]), "waiting");
    }
    assert.deepEqual(store.deliver({ exchangeId: exchange.id, principalId, params: { allow: false } },
      { toolId, channel }), { ok: true });
    assert.deepEqual(await answer, { status: "received", params: { allow: false } });
  } finally { exchange.close({}); }
});
