import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createToolRegistry, type SurfaceEmission, type ToolHandler } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";

import { PUBLISH_CONTENT_PUBLISH_TOOL_ID } from "../../features/publish-content/agent-tools.js";
import { buildPublishConfirmationResource } from "../../features/publish-content/publish-confirmation-ui.js";
import { startTestServer } from "../../server/__tests__/helpers/http-test-server.js";
import { RUN_PRINCIPAL_HEADER } from "../run-ownership.js";
import { MCP_UI_TOOL_CALLS_PATH, registerMcpUiToolCallsRoute } from "../mcp-ui-tool-calls-route.js";
import {
  SURFACE_EXCHANGE_ID_PARAM,
  createSurfaceExchangeStore,
  resolveConfirmationDecision,
  type SurfaceExchangeStore,
} from "../../contracts/core/tool-surface-exchanges.js";

/**
 * @file Route-level allowlist proof for `publish_content_publish`'s confirmation dialog — the
 * regression coverage for the bug the owner hit live on 2026-09-24: the "Publish to tovu.fly.dev?"
 * dialog rendered with the right counts, but clicking Publish failed with "'publish_content_publish'
 * is not an MCP-UI-redeemable tool", because the id was never added to `MCP_UI_REDEEMABLE_TOOL_IDS`.
 * (The gap stayed hidden until f0cfd0c67, since before it the daemon always answered "nothing to
 * publish" and the dialog was unreachable.)
 *
 * The real handler needs a connected destination peer, a pushed plan and a live import, none of
 * which bear on the allowlist check. So the registered handler here opens its exchange exactly the way
 * the real one does (`publish-content/tool-registrations.ts`: `surfaceExchanges.open({ toolId,
 * principalId }, ctx.emitSurface)` then `resolveConfirmationDecision`), and the dialog is the REAL
 * `buildPublishConfirmationResource`, so the button payload posted below is the one the browser posts.
 */

const PRINCIPAL = "principal-admin-1";

function buildToolExecutor(surfaceExchanges: SurfaceExchangeStore) {
  const handler: ToolHandler = async (ctx) => {
    assert.ok(ctx.emitSurface, "the executor must supply an emit seam");
    const exchange = surfaceExchanges.open({ toolId: PUBLISH_CONTENT_PUBLISH_TOOL_ID, principalId: ctx.principal.id }, ctx.emitSurface);
    const ui = buildPublishConfirmationResource({
      siteLabel: "tovu.fly.dev",
      counts: { added: 51, replaced: 8, unchanged: 26, skipped: 21 },
      planId: "plan-1",
      exchangeId: exchange.id,
    });
    const outcome = await resolveConfirmationDecision(exchange, { channel: "mcp-ui", payload: { resource: ui } });
    return { confirmed: outcome.confirmed };
  };
  const registry = createToolRegistry();
  registry.register({
    descriptor: { id: PUBLISH_CONTENT_PUBLISH_TOOL_ID },
    handler,
    policy: { authorize: () => "allow" },
  });
  return createToolExecutor({ registry });
}

/** The button's own `toolName`/`params`, read out of the rendered dialog HTML the way the iframe sends them. */
function buttonPayload(emission: SurfaceEmission, decision: "confirm" | "cancel"): { toolName: string; params: Record<string, unknown> } {
  const resource = (emission.payload as { resource?: { resource?: { text?: string } } }).resource;
  const html = resource?.resource?.text ?? "";
  const idMatch = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(idMatch, "the dialog must carry its exchange id");
  assert.ok(html.includes(`"toolName":"${PUBLISH_CONTENT_PUBLISH_TOOL_ID}"`), "the dialog's buttons must post to publish_content_publish");
  return { toolName: PUBLISH_CONTENT_PUBLISH_TOOL_ID, params: { [SURFACE_EXCHANGE_ID_PARAM]: idMatch[1]!, decision } };
}

for (const decision of ["confirm", "cancel"] as const) {
  test(`real round trip: a '${decision}' click on the publish dialog is admitted by the allowlist (202, not 403) and resolves the parked call`, async (t) => {
    const surfaceExchanges = createSurfaceExchangeStore();
    const toolExecutor = buildToolExecutor(surfaceExchanges);

    let resolveEmission: (emission: SurfaceEmission) => void = () => undefined;
    const firstEmission = new Promise<SurfaceEmission>((resolve) => {
      resolveEmission = resolve;
    });
    const pending = toolExecutor.execute({ id: PRINCIPAL }, { id: "run-1" }, PUBLISH_CONTENT_PUBLISH_TOOL_ID, {}, undefined, async (emission: SurfaceEmission) => {
      resolveEmission(emission);
    });
    const first = await Promise.race([firstEmission.then((emission) => ({ emission })), pending.then((settled) => ({ settled }))]);
    assert.ok("emission" in first, `the call settled without raising a dialog: ${JSON.stringify(first)}`);

    const app = express();
    app.use(express.json());
    registerMcpUiToolCallsRoute(app, { toolExecutor, surfaceExchanges });
    const baseUrl = await startTestServer(app, t);

    const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: PRINCIPAL },
      body: JSON.stringify(buttonPayload(first.emission, decision)),
    });
    const body = (await res.json()) as { delivered?: boolean };

    // Load-bearing: without the id in MCP_UI_REDEEMABLE_TOOL_IDS the route refuses with 403
    // TOOL_NOT_ALLOWLISTED before it ever touches the exchange.
    assert.equal(res.status, 202, `expected the allowlist to accept this delivery: ${JSON.stringify(body)}`);
    assert.equal(body.delivered, true);

    const executed = await pending;
    assert.equal(executed.status, "completed", `the parked call must resolve completed: ${JSON.stringify(executed)}`);
    assert.deepEqual(executed.output, { confirmed: decision === "confirm" });
  });
}

test("a click from a different principal is refused even though the tool is allowlisted", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const toolExecutor = buildToolExecutor(surfaceExchanges);

  let resolveEmission: (emission: SurfaceEmission) => void = () => undefined;
  const firstEmission = new Promise<SurfaceEmission>((resolve) => {
    resolveEmission = resolve;
  });
  const pending = toolExecutor.execute({ id: PRINCIPAL }, { id: "run-1" }, PUBLISH_CONTENT_PUBLISH_TOOL_ID, {}, undefined, async (emission: SurfaceEmission) => {
    resolveEmission(emission);
  });
  const emission = await firstEmission;

  const app = express();
  app.use(express.json());
  registerMcpUiToolCallsRoute(app, { toolExecutor, surfaceExchanges });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: "principal-someone-else" },
    body: JSON.stringify(buttonPayload(emission, "confirm")),
  });
  assert.notEqual(res.status, 202, "another principal must not be able to answer this dialog");

  // The right principal can still answer afterwards, which also settles the parked call.
  const ownRes = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: PRINCIPAL },
    body: JSON.stringify(buttonPayload(emission, "cancel")),
  });
  assert.equal(ownRes.status, 202);
  const executed = await pending;
  assert.deepEqual(executed.output, { confirmed: false }, "the foreign click must not have confirmed the publish");
});
