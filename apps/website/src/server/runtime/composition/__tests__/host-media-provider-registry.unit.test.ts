import assert from "node:assert/strict";
import { test } from "node:test";
import { createHostMediaProviderRegistry, hostMediaProviderRegistryId, MEDIA_PROVIDER_ENV_VARS } from "#src/features/media-generation/host-media-providers";

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

// Codex FIX 20/23: b-g5b and b-g6b each mounted xAI; the host now builds ONE registry with xAI once,
// under the persisted id `grok` (a sealed `grok` row must keep resolving), `xai-grok-imagine` only an alias.
test("the host media registry lists grok exactly once and resolves the xai-grok-imagine alias to it", () => {
  const registry = createHostMediaProviderRegistry();
  const ids = registry.listProviders().map((provider) => provider.id);
  assert.equal(ids.filter((id) => id === "grok").length, 1);
  assert.equal(ids.includes("xai-grok-imagine"), false);
  assert.equal(registry.findProvider({ id: "xai-grok-imagine" })?.id, "grok");
  assert.equal(hostMediaProviderRegistryId({ id: "xai-grok-imagine" }), "grok");
  assert.equal(hostMediaProviderRegistryId({ id: "grok" }), "grok");
  assert.deepEqual(MEDIA_PROVIDER_ENV_VARS.grok, ["XAI_API_KEY"]);
});
