import assert from "node:assert/strict";
import { test } from "node:test";
import { createHostMediaProviderRegistry } from "../host-media-provider-registry.js";

// Grok left Jini's built-ins (K05); Tovu keeps its availability only by contributing the xAI media plugin here.
test("the host media registry keeps Grok image, video catalogue and TTS availability", () => {
  const registry = createHostMediaProviderRegistry();
  assert.equal(registry.findProvider({ id: "grok" })?.id, "grok");
  assert.equal(registry.findProvider({ id: "xai-grok-imagine" })?.id, "grok");
  assert.ok(registry.modelsForSurface({ surface: "image" }).some((model) => model.id === "grok-imagine-image"));
  assert.ok(registry.modelsForSurface({ surface: "audio" }, { audioKind: "speech" }).some((model) => model.id === "grok-tts"));
  assert.ok(registry.get({ providerId: "grok", routeKey: "image" }));
  assert.ok(registry.get({ providerId: "grok", routeKey: "audio:speech" }));
  assert.equal(registry.get({ providerId: "grok", routeKey: "video" }), undefined);
});

test("the host media registry still serves the other built-in vendors", () => {
  const registry = createHostMediaProviderRegistry();
  assert.ok(registry.get({ providerId: "openai", routeKey: "image" }));
  assert.ok(registry.get({ providerId: "elevenlabs", routeKey: "audio:sfx" }));
});
