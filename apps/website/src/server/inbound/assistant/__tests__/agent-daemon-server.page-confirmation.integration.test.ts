import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import ts from "typescript";
import { createToolRegistry, type SurfaceEmission, type ToolRegistration } from "@jini-ai/core";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/core/primitives";
import { createToolExecutor } from "@jini-ai/daemon";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM, SURFACE_TYPED_ANSWER_PARAM } from "@jini-ai/daemon/surface-exchanges";
import { withReadOnlyFrontendCapabilities } from "#src/assistant/frontend-control-capabilities";
import { withPageNavigateErrorRewrap } from "#src/assistant/rewrap-page-navigate-error";
import { createLostFrontendBindings } from "#src/assistant/lost-frontend-binding";
import { applyToolApprovalPolicy } from "#src/assistant/tool-approval-policy";
import { RUN_PRINCIPAL_HEADER } from "#src/assistant/daemon-access";
import { startTestServer } from "../../../__tests__/helpers/http-test-server.js";
import { daemonSource, evaluateDaemonStatements } from "./helpers/daemon-source.js";

/** Execute the production registration loop with a harmless, observable frontend effect. */
async function fixture() {
  let effects = 0;
  let executedInput: unknown;
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const registration: ToolRegistration = {
    descriptor: { id: "page.click", inputSchema: { type: "object" } },
    policy: { authorize: () => "allow" },
    handler: async ctx => { effects++; executedInput = ctx.input; return { clicked: true }; },
  };
  const registry = createToolRegistry({});
  const loop = daemonSource.statements.find(statement => ts.isForOfStatement(statement) && statement.expression.getText(daemonSource).includes("frontendControl.toolRegistrations"));
  assert.ok(loop);
  await evaluateDaemonStatements([loop], {
    registry, surfaceExchanges, withReadOnlyFrontendCapabilities, withPageNavigateErrorRewrap,
    applyToolApprovalPolicy, lostFrontendBindings: createLostFrontendBindings(),
    frontendControl: { toolRegistrations: [registration] },
  });
  const toolExecutor = createToolExecutor({ registry });
  return { surfaceExchanges, toolExecutor, effects: () => effects, executedInput: () => executedInput };
}

const request = { principal: { id: "owner" }, run: { id: "page-run" }, toolId: "page.click" };

test("the daemon's actual loop asks one chat card before an opaque click; HTTP human acceptance runs the frozen input once", async t => {
  const { MCP_UI_TOOL_CALLS_PATH, registerMcpUiToolCallsRoute } = await import("#src/assistant/mcp-ui-tool-calls-route");
  const f = await fixture();
  const app = express();
  app.use(express.json());
  let callbackExecutions = 0;
  registerMcpUiToolCallsRoute(app, { surfaceExchanges: f.surfaceExchanges, toolExecutor: {
    ...f.toolExecutor,
    execute: (...args) => { callbackExecutions++; return f.toolExecutor.execute(...args); },
  } });
  const baseUrl = await startTestServer(app, t);
  const input = { handle: "delete-site-confirm" };
  let cards = 0;
  let exchangeId = "";
  let emit!: () => void;
  const emitted = new Promise<"card">(resolve => { emit = () => resolve("card"); });
  const pending = f.toolExecutor.execute({ ...request, input }, { emitSurface: async (emission: SurfaceEmission) => {
    assert.equal(emission.channel, "mcp-ui");
    cards++;
    const html = (emission.payload as { resource: { resource: { text: string } } }).resource.resource.text;
    assert.match(html, /delete-site-confirm/);
    exchangeId = html.match(/__exchangeId"\s*:\s*"([^"]+)"/)![1]!;
    emit();
  } });
  assert.equal(await Promise.race([emitted, pending.then(() => "effect-before-card")]), "card");
  assert.equal(f.effects(), 0);
  input.handle = "mutated-after-proposal";
  const answer = (params: object, principal = "owner") => fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST", headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: principal },
    body: JSON.stringify({ toolName: "page.click", params }),
  });
  const params = { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" };
  const agentAnswer = await f.toolExecutor.execute({ ...request, input: params });
  assert.equal(agentAnswer.status, "failed", "an agent tool reply cannot answer a human's pending card");
  assert.equal(f.effects(), 0);
  assert.equal((await answer(params, "intruder")).status, 409);
  assert.equal(f.effects(), 0);
  assert.equal((await answer({ ...params, [SURFACE_TYPED_ANSWER_PARAM]: "yes" })).status, 403);
  assert.equal(f.effects(), 0);
  assert.equal((await answer(params)).status, 202);
  assert.equal((await pending).status, "completed");
  assert.equal(cards, 1);
  assert.equal(f.effects(), 1);
  assert.deepEqual(f.executedInput(), { handle: "delete-site-confirm" });
  assert.equal((await answer(params)).status, 409);
  assert.equal((await answer({ handle: "delete-site-confirm", decision: "confirm" })).status, 403);
  assert.equal(f.effects(), 1);
  assert.equal(callbackExecutions, 0, "a card answer resumes the parked call, never starts a tool");
});

test("reviewed direct page clicks run without a card or confirmation channel", async () => {
  const f = await fixture();
  const result = await f.toolExecutor.execute({ ...request, input: { handle: "plugins-install-confirm" } });
  assert.equal(result.status, "completed");
  assert.equal(f.effects(), 1);
  assert.equal(f.surfaceExchanges.size(), 0);
});

for (const decision of ["cancel", "typed-yes", "abort"] as const) {
  test(`an opaque page click has no effect after ${decision}`, async () => {
    const f = await fixture();
    const controller = new AbortController();
    let exchangeId = "";
    let emit!: () => void;
    const emitted = new Promise<"card">(resolve => { emit = () => resolve("card"); });
    const pending = f.toolExecutor.execute({ ...request, input: { handle: "overwrite-confirm" } }, {
      signal: controller.signal,
      emitSurface: async emission => {
        const html = (emission.payload as { resource: { resource: { text: string } } }).resource.resource.text;
        exchangeId = html.match(/__exchangeId"\s*:\s*"([^"]+)"/)![1]!;
        emit();
      },
    });
    assert.equal(await Promise.race([emitted, pending.then(() => "effect-before-card")]), "card");
    assert.equal(f.effects(), 0);
    if (decision === "abort") controller.abort();
    else f.surfaceExchanges.deliver({ exchangeId, principalId: "owner", params: decision === "cancel" ? { decision } : { [SURFACE_TYPED_ANSWER_PARAM]: "yes" } }, { toolId: "page.click" });
    await pending;
    assert.equal(f.effects(), 0);
    assert.equal(f.surfaceExchanges.size(), 0);
  });
}

test("an opaque daemon click without a human card transport refuses before effects", async () => {
  const f = await fixture();
  const result = await f.toolExecutor.execute({ ...request, input: { handle: "publish-confirm" } });
  assert.equal(result.status, "failed");
  assert.match(result.error ?? "", /NO_CONFIRMATION_CHANNEL/);
  assert.equal(f.effects(), 0);
});
