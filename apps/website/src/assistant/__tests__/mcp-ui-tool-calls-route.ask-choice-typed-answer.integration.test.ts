import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createToolRegistry, type SurfaceEmission } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";

import { startTestServer } from "../../server/__tests__/helpers/http-test-server.js";
import { RUN_PRINCIPAL_HEADER } from "../run-ownership.js";
import { MCP_UI_TOOL_CALLS_PATH, registerMcpUiToolCallsRoute } from "../mcp-ui-tool-calls-route.js";
import { ASK_CHOICE_TOOL_ID, buildAskChoiceRegistrations } from "../ask-choice-tool.js";
import {
  SURFACE_EXCHANGE_ID_PARAM,
  SURFACE_TYPED_ANSWER_PARAM,
  createSurfaceExchangeStore,
  type SurfaceExchangeStore,
} from "../../contracts/core/tool-surface-exchanges.js";

/**
 * @file The regression suite for the 2026-09-18 ask-choice deadlock the owner hit live: the
 * assistant asked a question through `assistant_ask_choice`, the owner typed the answer into the
 * chat composer instead of clicking the rendered form, and the chat sat frozen until the exchange's
 * 5-minute idle deadline — `sites/tovu-com/chat.db` run `2adef4d1-3bf2-496f-9e22-7c53ffcc1503`,
 * `run_status='running'` with `ended_at` NULL 35 minutes later. Owner's words: *"it asked a question
 * and I answered but it's stuck ... it should get messages as I type them, not hold it."*
 *
 * Before this change a typed message could not resolve a parked exchange at all: every param shape
 * the surface posts back is one the FORM produces, so prose had nowhere to go.
 * {@link SURFACE_TYPED_ANSWER_PARAM} is that missing carrier.
 *
 * ## Why a typed answer is safe here, where a model-invented one is not
 *
 * `ask-choice-tool.ts`'s own header documents at length why the no-emit-seam fallback needs a
 * single-use, principal-bound ticket: that path RETURNS immediately, leaving the model free to call
 * `assistant_ask_choice` a second time with a `choice` it made up, and a live incident (an unchosen
 * paid `media_generate_asset` spend) is what that ticket exists to prevent.
 *
 * The typed-answer path does not reopen that hole, for a structural reason rather than a policy one:
 * it is reachable ONLY through `SurfaceExchangeStore.deliver`, which is called from
 * `mcp-ui-tool-calls-route.ts` — an authenticated admin HTTP route keyed on a server-verified
 * {@link RUN_PRINCIPAL_HEADER}. A spawned agent has no way to reach it: its own tool calls go
 * through `ToolExecutor`, never through this route. The model cannot type into the composer, and the
 * held-open call is parked inside `receive()` the whole time, so it never even gets a turn in which
 * to try.
 *
 * ## The one thing the typed answer must never become
 *
 * A chosen option. `describeAskChoiceAnswer` reports `choice`/`selections` — the option VALUES the
 * model itself supplied — and a model reading `{"choice": "take15-cut-v3 should be the video"}` would
 * be told the administrator picked an option that was never offered. The second test below is what
 * pins that: prose comes back under its own `freeText` field, with both option fields absent, so the
 * model must read it as words rather than as a selection.
 */

const PRINCIPAL = "principal-admin-1";

/** Builds the real tool surface — one registry, one production-shaped executor (no `delegate`, no
 *  mocks) over the real `assistant_ask_choice` handler. Mirrors
 *  `mcp-ui-tool-calls-route.ask-choice.integration.test.ts`'s own helper exactly. */
function buildRealAskChoiceToolExecutor(surfaceExchanges: SurfaceExchangeStore) {
  const registry = createToolRegistry();
  for (const registration of buildAskChoiceRegistrations(undefined, { surfaceExchanges })) {
    registry.register(registration);
  }
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

/** Calls `assistant_ask_choice` through the REAL executor with the `emitSurface` seam
 *  `delegated-tool-bridge.ts` always supplies, and returns once the call has parked. */
async function openRealDialog(
  toolExecutor: ReturnType<typeof buildRealAskChoiceToolExecutor>,
): Promise<{ pending: ReturnType<typeof toolExecutor.execute>; exchangeId: string }> {
  const emitted: SurfaceEmission[] = [];
  const pending = toolExecutor.execute(
    { id: PRINCIPAL },
    { id: "run-1" },
    ASK_CHOICE_TOOL_ID,
    {
      title: "Which video should §03 show?",
      singleSelect: {
        label: "Pick a clip",
        options: [
          { value: "take12", label: "take12" },
          { value: "take14", label: "take14" },
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
  return { pending, exchangeId: exchangeIdFromEmission(emitted[0]!) };
}

/** Stands up the real daemon-side route over a shared store and returns its base URL. */
async function startRoute(
  t: Parameters<Parameters<typeof test>[1]>[0],
  toolExecutor: ReturnType<typeof buildRealAskChoiceToolExecutor>,
  surfaceExchanges: SurfaceExchangeStore,
): Promise<string> {
  const app = express();
  app.use(express.json());
  registerMcpUiToolCallsRoute(app, { toolExecutor, surfaceExchanges });
  return startTestServer(app, t);
}

test("a typed chat message resolves a parked assistant_ask_choice instead of leaving it to time out", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const toolExecutor = buildRealAskChoiceToolExecutor(surfaceExchanges);
  const { pending, exchangeId } = await openRealDialog(toolExecutor);
  const baseUrl = await startRoute(t, toolExecutor, surfaceExchanges);

  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: PRINCIPAL },
    body: JSON.stringify({
      toolName: ASK_CHOICE_TOOL_ID,
      params: {
        [SURFACE_EXCHANGE_ID_PARAM]: exchangeId,
        [SURFACE_TYPED_ANSWER_PARAM]: "take15-cut-v3 should be the video",
      },
    }),
  });

  const body = (await res.json()) as { delivered?: boolean; error?: string; code?: string };
  assert.equal(res.status, 202, `the typed answer must be delivered, not refused: ${JSON.stringify(body)}`);
  assert.equal(body.delivered, true);

  const executed = await pending;
  assert.equal(executed.status, "completed", `the parked call must resolve, not hang: ${JSON.stringify(executed)}`);
});

test("a typed answer is reported as the administrator's words, never as one of the options the model offered", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const toolExecutor = buildRealAskChoiceToolExecutor(surfaceExchanges);
  const { pending, exchangeId } = await openRealDialog(toolExecutor);
  const baseUrl = await startRoute(t, toolExecutor, surfaceExchanges);

  await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: PRINCIPAL },
    body: JSON.stringify({
      toolName: ASK_CHOICE_TOOL_ID,
      params: {
        [SURFACE_EXCHANGE_ID_PARAM]: exchangeId,
        [SURFACE_TYPED_ANSWER_PARAM]: "take15-cut-v3 should be the video",
      },
    }),
  });

  const executed = await pending;
  const output = executed.output as Record<string, unknown>;
  assert.equal(output["submitted"], true);
  assert.equal(output["freeText"], "take15-cut-v3 should be the video");
  assert.equal(
    output["choice"],
    undefined,
    "prose must never be reported as a chosen option — the model would act on a selection it never offered",
  );
  assert.equal(output["selections"], undefined, "prose must never be reported as a multi-select answer");
  assert.equal(
    output["note"],
    "The administrator answered in their own words instead of picking one of the options. Treat 'freeText' as " +
      "what they said, not as a selection: none of the options you offered was chosen. Say what you understood " +
      "before acting on it, and ask again if it is ambiguous.",
  );
});

test("a typed answer that is not a string is refused rather than delivered as an answer", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const toolExecutor = buildRealAskChoiceToolExecutor(surfaceExchanges);
  const { pending, exchangeId } = await openRealDialog(toolExecutor);
  const baseUrl = await startRoute(t, toolExecutor, surfaceExchanges);

  // Delivered through the real route, so this is the shape a malformed client genuinely produces —
  // not a hand-built call into the handler. A non-string must fall through to the ordinary
  // form-answer branch (no `choice`, no `selections`), never become `freeText: "[object Object]"`.
  await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: PRINCIPAL },
    body: JSON.stringify({
      toolName: ASK_CHOICE_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, [SURFACE_TYPED_ANSWER_PARAM]: { not: "a string" } },
    }),
  });

  const executed = await pending;
  const output = executed.output as Record<string, unknown>;
  assert.equal(output["freeText"], undefined, "a non-string typed answer must not be reported as the human's words");
});

test("an empty typed answer is not treated as an answer at all", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const toolExecutor = buildRealAskChoiceToolExecutor(surfaceExchanges);
  const { pending, exchangeId } = await openRealDialog(toolExecutor);
  const baseUrl = await startRoute(t, toolExecutor, surfaceExchanges);

  await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: PRINCIPAL },
    body: JSON.stringify({
      toolName: ASK_CHOICE_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, [SURFACE_TYPED_ANSWER_PARAM]: "   " },
    }),
  });

  const executed = await pending;
  const output = executed.output as Record<string, unknown>;
  assert.equal(output["freeText"], undefined, "whitespace is not an answer — the model must not be told one arrived");
});

/**
 * The composer cannot name an exchange. A human typing an answer has never seen an exchange id, and
 * the only place one appears client-side is inside the surface's own HTML — which is model-influenced
 * and rendered in a sandbox, so scraping it there and posting it back would be a correlation the
 * model writes both ends of. The route resolves it from the store instead.
 */
test("a typed answer that names no exchange still reaches the one question outstanding for that human", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const toolExecutor = buildRealAskChoiceToolExecutor(surfaceExchanges);
  const { pending } = await openRealDialog(toolExecutor);
  const baseUrl = await startRoute(t, toolExecutor, surfaceExchanges);

  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: PRINCIPAL },
    body: JSON.stringify({
      toolName: ASK_CHOICE_TOOL_ID,
      params: { [SURFACE_TYPED_ANSWER_PARAM]: "take15-cut-v3 should be the video" },
    }),
  });

  const body = (await res.json()) as { delivered?: boolean; error?: string; code?: string };
  assert.equal(res.status, 202, `the typed answer must be routed to the open question: ${JSON.stringify(body)}`);
  assert.equal(body.delivered, true);

  const executed = await pending;
  assert.equal((executed.output as Record<string, unknown>)["freeText"], "take15-cut-v3 should be the video");
});

test("a typed answer with nothing outstanding is refused, not executed as a fresh tool call", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const toolExecutor = buildRealAskChoiceToolExecutor(surfaceExchanges);
  const baseUrl = await startRoute(t, toolExecutor, surfaceExchanges);

  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: PRINCIPAL },
    body: JSON.stringify({
      toolName: ASK_CHOICE_TOOL_ID,
      params: { [SURFACE_TYPED_ANSWER_PARAM]: "take15-cut-v3 should be the video" },
    }),
  });

  // Must NOT fall through to Shape 2, which would run `assistant_ask_choice` as a brand-new call and
  // put a second, unasked-for form on the human's screen.
  const body = (await res.json()) as { error?: string; code?: string };
  assert.equal(res.status, 409, `expected a refusal, got ${res.status}: ${JSON.stringify(body)}`);
  assert.equal(body.code, "SURFACE_NOT_PENDING");
  assert.equal(body.error, "that dialog is no longer waiting for an answer");
});

test("a typed answer never reaches another human's open question", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const toolExecutor = buildRealAskChoiceToolExecutor(surfaceExchanges);
  const { pending } = await openRealDialog(toolExecutor);
  const baseUrl = await startRoute(t, toolExecutor, surfaceExchanges);

  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: "principal-someone-else" },
    body: JSON.stringify({
      toolName: ASK_CHOICE_TOOL_ID,
      params: { [SURFACE_TYPED_ANSWER_PARAM]: "deploy it" },
    }),
  });

  assert.equal(res.status, 409);
  assert.equal(
    await Promise.race([pending.then(() => "resolved" as const), Promise.resolve("still-parked" as const)]),
    "still-parked",
    "another principal's typing must not answer this human's question",
  );
});
