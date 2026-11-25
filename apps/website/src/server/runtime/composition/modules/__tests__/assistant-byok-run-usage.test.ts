import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { AgentRunTrackingOutcome } from "@jini-ai/core/contracts/observability";
import { createRouteDeps } from "../../app.js";
import { createByokToolSurface } from "#src/assistant/index";
import { registerAuthRoutes } from "#src/server/inbound/admin-http/dev-auth";
import { bootAuthenticated } from "#src/server/__tests__/helpers/http-test-server";
import { startStubProviderServer } from "#src/server/__tests__/helpers/stub-provider-server";
import { BYOK_TURN_PATH, createAssistantByokModule } from "../assistant-byok.js";
import { createByokRunUsage } from "../assistant-byok-run-usage.js";

/**
 * @file The usage a BYOK turn's agent-run span ends with. Source semantics, read from the adapters in
 * `@jini-ai/agent-runtime/providers`: every provider request opens with `status: requesting`, and the
 * `usage` events inside one request are CUMULATIVE snapshots (Anthropic merges each `message_delta`
 * into the `message_start` usage and re-emits the whole; Gemini re-sends `usageMetadata`), so the
 * per-request delta is that request's last snapshot. The run total is the sum of those deltas across
 * the tool loop's requests. Cost is never priced from tokens; only an explicitly reported USD value counts.
 */

const event = (frame: Record<string, unknown>) => `event: ${String(frame.type)}\ndata: ${JSON.stringify(frame)}`;
const TOOL_REQUEST = [
  event({ type: "message_start", message: { id: "one", role: "assistant", content: [], model: "fixture-model", usage: { input_tokens: 3, output_tokens: 0 } } }),
  event({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_fixture", name: "fixture_absent_tool", input: {} } }),
  event({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{}" } }),
  event({ type: "content_block_stop", index: 0 }),
  event({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 2 } }),
  // A second, cumulative snapshot of the SAME request: 5 output tokens in total, not 2 + 5.
  event({ type: "message_delta", delta: {}, usage: { output_tokens: 5 } }),
  event({ type: "message_stop" }), "",
].join("\n\n");
const TEXT_REQUEST = [
  event({ type: "message_start", message: { id: "two", role: "assistant", content: [], model: "fixture-model", usage: { input_tokens: 7, output_tokens: 0 } } }),
  event({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Done" } }),
  event({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 4 } }),
  event({ type: "message_stop" }), "",
].join("\n\n");

test("the run span sums provider usage deltas and does not invent cost", async (t) => {
  const outcomes: AgentRunTrackingOutcome[] = [];
  const base = createRouteDeps();
  const trace = base.tracker.trace.bind(base.tracker);
  const tracker = { ...base.tracker, trace: ((spec: Parameters<typeof trace>[0], options: Parameters<typeof trace>[1]) => trace({ ...spec, run: (span) => spec.run({
    ...span, setOutcome: (outcome: AgentRunTrackingOutcome) => { outcomes.push(outcome); span.setOutcome(outcome); },
  } as typeof span) }, options)) as typeof trace };
  const deps = { ...base, tracker };
  const app = express();
  app.use(express.json());
  registerAuthRoutes({ app, deps });
  createAssistantByokModule({ routeDeps: deps }, { toolSurface: createByokToolSurface(deps, { installExtensions: false }) }).registerRoutes?.({ app });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const providerUrl = await startStubProviderServer(t, (callCount) => ({ status: 200, body: callCount === 1 ? TOOL_REQUEST : TEXT_REQUEST }));
  const response = await fetch(`${baseUrl}${BYOK_TURN_PATH}`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({
    messages: [{ role: "user", content: "Hello" }], byok: { protocol: "anthropic", apiKey: ["fixture", "key"].join("-"), model: "fixture-model", baseUrl: providerUrl },
  }) });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /event: end/);
  // Two requests: 3 + 7 input, 5 + 4 output. The adapters report tokens only, so no cost key at all.
  assert.deepEqual(outcomes.map((outcome) => outcome.usage), [{ inputTokens: 10, outputTokens: 9 }]);
});

test("a reported zero stays known, an unreported counter stays absent, and only reported USD is cost", () => {
  const usage = createByokRunUsage();
  usage.observe({ type: "status", label: "requesting" });
  usage.observe({ type: "usage", usage: { output_tokens: 0, cost: 99 } });
  assert.deepEqual(usage.total(), { outputTokens: 0 });
  usage.observe({ type: "status", label: "requesting" });
  usage.observe({ type: "usage", usage: { output_tokens: 1 }, costUsd: 0.25 } as never);
  assert.deepEqual(usage.total(), { outputTokens: 1, costUsd: 0.25 });
});

test("a turn whose provider reported no recognizable usage leaves the span without usage", () => {
  const usage = createByokRunUsage();
  usage.observe({ type: "status", label: "requesting" });
  usage.observe({ type: "usage", usage: null });
  usage.observe({ type: "usage", usage: { unrelated: 4 } });
  assert.equal(usage.total(), undefined);
  assert.deepEqual(usage.withUsage({ status: "succeeded" }), { status: "succeeded" });
});
