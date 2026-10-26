import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createAiGenerationSink, withProductAnalyticsGuards, type ProductAiGeneration } from "@jini-ai/analytics/product";
import { createRouteDeps } from "../../app.js";
import { createByokToolSurface } from "#src/assistant/index";
import { registerAuthRoutes } from "#src/server/inbound/admin-http/dev-auth";
import { bootAuthenticated } from "#src/server/__tests__/helpers/http-test-server";
import { startStubProviderServer } from "#src/server/__tests__/helpers/stub-provider-server";
import { BYOK_TURN_PATH, createAssistantByokModule } from "../assistant-byok.js";

for (const { includeAiContent, consent } of [{ includeAiContent: false, consent: true }, { includeAiContent: true, consent: true }, { includeAiContent: true, consent: false }]) {
  test(`BYOK generations: real provider frames, content=${includeAiContent}, operator consent=${consent}`, async (t) => {
    const generations: ProductAiGeneration[] = [];
    const analytics = withProductAnalyticsGuards({ inner: { capture() {}, identify() {}, includeAiContent, captureAiGeneration: (event) => { generations.push(event); } }, consent: () => consent });
    const deps = { ...createRouteDeps(), aiTraceSink: createAiGenerationSink({ analytics, userId: "site:fixture" })! };
    const app = express();
    app.use(express.json());
    registerAuthRoutes(app, deps);
    createAssistantByokModule(deps, createByokToolSurface(deps, { installExtensions: false })).registerRoutes?.(app);
    const { baseUrl, cookie } = await bootAuthenticated(app, t);
    const providerUrl = await startStubProviderServer(t, () => ({ status: 200, body: [
      'event: message_start\ndata: {"type":"message_start","message":{"id":"reply","role":"assistant","content":[],"model":"fixture-model","usage":{"input_tokens":3,"output_tokens":0}}}',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Welcome"}}',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}',
      'event: message_stop\ndata: {"type":"message_stop"}', "",
    ].join("\n\n") }));
    const response = await fetch(`${baseUrl}${BYOK_TURN_PATH}`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({
      messages: [{ role: "user", content: "Hello" }], byok: { protocol: "anthropic", apiKey: ["fixture", "key"].join("-"), model: "fixture-model", baseUrl: providerUrl },
    }) });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /event: end/);
    assert.equal(generations.length, consent ? 1 : 0);
    if (!consent) return;
    const generation = generations[0]!;
    assert.deepEqual({ model: generation.properties.model, provider: generation.properties.provider, inputTokens: generation.properties.inputTokens,
      outputTokens: generation.properties.outputTokens, isError: generation.properties.isError, toolCallCount: generation.properties.toolCallCount },
    { model: "fixture-model", provider: "anthropic", inputTokens: 3, outputTokens: 2, isError: false, toolCallCount: 0 });
    assert.equal(generation.userId, "site:fixture");
    assert.equal(typeof generation.properties.latencySeconds, "number");
    assert.equal(generation.properties.costUsd, undefined);
    assert.equal(generation.input, includeAiContent ? "Hello" : undefined);
    assert.equal(generation.output, includeAiContent ? "Welcome" : undefined);
  });
}
