import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createToolRegistry, type SurfaceEmission } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";

import { startTestServer } from "../../server/__tests__/helpers/http-test-server.js";
import { RUN_PRINCIPAL_HEADER } from "../run-ownership.js";
import { MCP_UI_TOOL_CALLS_PATH, registerMcpUiToolCallsRoute } from "../mcp-ui-tool-calls-route.js";
import { ASK_CHOICE_TOOL_ID, buildAskChoiceRegistrations } from "../ask-choice-tool.js";
import { SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore, type SurfaceExchangeStore } from "../../contracts/core/tool-surface-exchanges.js";

/**
 * @file The real, non-mocked round trip through the MCP-UI callback route's Shape 1 (exchange
 * delivery) for `assistant_ask_choice` — the regression coverage for the bug the owner hit live: the
 * form rendered and the administrator answered it, but redemption failed with a 403
 * `TOOL_NOT_ALLOWLISTED` because `assistant_ask_choice` was never added to `MCP_UI_REDEEMABLE_TOOL_IDS`
 * when the tool landed (`ask-choice-tool.ts`).
 *
 * Mirrors `mcp-ui-tool-calls-route.integration.test.ts`'s own Shape-1 discipline exactly (real
 * `ToolRegistry` + `createToolExecutor`, no `delegate`, a real `SurfaceExchangeStore` shared with the
 * route, HTTP via `startTestServer`) rather than `mcp-ui-tool-calls-route.test.ts`'s fake executor,
 * because a fake executor cannot reproduce the allowlist rejection this bug actually was — that check
 * runs before the (fake or real) executor is ever reached, so only a real 403 from the real route
 * proves the fix. `assistant_ask_choice` needs no repo/outbox/bus the way `content_post_delete` does
 * (`buildAskChoiceRegistrations`'s first parameter is unused), so this file is a straight simplification
 * of that one's setup, not a divergent shape.
 *
 * Written and run against the pre-change code first (`MCP_UI_REDEEMABLE_TOOL_IDS` without
 * `assistant_ask_choice`), where the first test below fails with the exact 403 the owner saw rather
 * than the 202 it asserts — the required RED evidence for this dispatch's allowlist addition.
 */

const PRINCIPAL = "principal-admin-1";

/** Builds the real tool surface: one registry, one production-shaped executor (no `delegate`, no
 *  mocks) over the real `assistant_ask_choice` handler. */
function buildRealAskChoiceToolExecutor(surfaceExchanges: SurfaceExchangeStore) {
  const registry = createToolRegistry();
  for (const registration of buildAskChoiceRegistrations(undefined, { surfaceExchanges })) {
    registry.register(registration);
  }
  // Same construction as `agent-daemon-server.ts`'s own `createToolExecutor({ registry })` call —
  // no `delegate` — so this exercises the real production configuration, not an idealized one.
  return createToolExecutor({ registry });
}

/** Pulls the exchange id out of the emitted mcp-ui surface's HTML — the way the rendered iframe would. */
function exchangeIdFromEmission(emission: SurfaceEmission): string {
  const resource = (emission.payload as { resource?: { resource?: { text?: string } } }).resource;
  const html = resource?.resource?.text ?? "";
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id, or the administrator's answer has nothing to name");
  return match[1]!;
}

/** Calls `assistant_ask_choice` through the REAL executor, exactly as a spawned agent's first (and
 * only) call would — including the `emitSurface` `delegated-tool-bridge.ts` always supplies. */
async function openRealDialog(
  toolExecutor: ReturnType<typeof buildRealAskChoiceToolExecutor>,
): Promise<{ pending: ReturnType<typeof toolExecutor.execute>; exchangeId: string }> {
  const emitted: SurfaceEmission[] = [];
  const pending = toolExecutor.execute(
    { id: PRINCIPAL },
    { id: "run-1" },
    ASK_CHOICE_TOOL_ID,
    {
      title: "Deploy the hotfix now?",
      singleSelect: {
        label: "What should I do?",
        options: [
          { value: "deploy", label: "Deploy now" },
          { value: "wait", label: "Wait for review" },
        ],
      },
    },
    undefined,
    async (emission: SurfaceEmission) => {
      emitted.push(emission);
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the form must be emitted before the call parks");
  return { pending, exchangeId: exchangeIdFromEmission(emitted[0]) };
}

test("real round trip: an mcp-ui submission of assistant_ask_choice's form is redeemed, not refused as unallowlisted", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const toolExecutor = buildRealAskChoiceToolExecutor(surfaceExchanges);

  const { pending, exchangeId } = await openRealDialog(toolExecutor);

  const app = express();
  app.use(express.json());
  registerMcpUiToolCallsRoute(app, { toolExecutor, surfaceExchanges });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: PRINCIPAL },
    body: JSON.stringify({
      toolName: ASK_CHOICE_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, choice: "deploy" },
    }),
  });

  // This is the exact failure the owner hit live, before the allowlist fix: a 403 with this exact
  // body, raised by `mcp-ui-tool-calls-route.ts`'s own `isMcpUiToolCallAllowed` gate before the
  // exchange delivery below is ever reached.
  const body = (await res.json()) as { delivered?: boolean; error?: string; code?: string };
  assert.equal(res.status, 202, `expected the delivery to be accepted, not refused as unallowlisted: ${JSON.stringify(body)}`);
  assert.equal(body.delivered, true);

  // Deliberately not the tool's own result — the route returns `{delivered:true}` because the
  // outcome belongs to the AGENT's call, not this HTTP response. Assert that call resolves with the
  // administrator's real answer.
  const executed = await pending;
  assert.equal(executed.status, "completed", `parked call must resolve completed: ${JSON.stringify(executed)}`);
  assert.deepEqual(executed.output, {
    submitted: true,
    choice: "deploy",
    note: "Tell the administrator what you understood from their answer, in plain language, before proceeding.",
  });
});
