import assert from "node:assert/strict";
import test from "node:test";

import { resolveProviderFromCredential, type SiteAssistantCredentialChoice } from "../site-assistant.js";

/** The provider decision for a visitor chat turn, without a repo or sealer: each refusal answers 503
 * with its code and an operator-facing diagnostic; a usable choice resolves key, model and endpoint. */

function harness() {
  const sent: { status?: number; body?: unknown } = {};
  const reported: Array<{ code: string; diagnostic: unknown }> = [];
  const res = { status(code: number) { sent.status = code; return res; }, json(body: unknown) { sent.body = body; return res; } };
  const reportError = (entry: { code: string; diagnostic: unknown }) => { reported.push(entry); return { message: `public:${entry.code}` }; };
  return { sent, reported, decide: (env: NodeJS.ProcessEnv, choice: Partial<SiteAssistantCredentialChoice>) =>
    resolveProviderFromCredential(res as never, env, { provider: "google", baseUrl: null, model: null, apiKey: null, keyStored: false, ...choice }, reportError as never) };
}

const UNOPENABLE = " A key IS stored for this workspace but could not be decrypted — check that the server's TOVU_SITE_KEY is the same one it was saved under, then re-save the key.";

test("an unsupported provider is refused naming the supported ones", () => {
  const h = harness();
  assert.equal(h.decide({}, { provider: "mystery" }), null);
  assert.equal(h.sent.status, 503);
  assert.deepEqual(h.sent.body, { error: "public:PROVIDER_UNSUPPORTED" });
  assert.deepEqual(h.reported, [{ code: "PROVIDER_UNSUPPORTED", diagnostic: 'site assistant is configured for an unsupported provider "mystery" — supported providers are anthropic, openai, azure, google.' }]);
});

for (const keyStored of [false, true]) {
  test(`a Google choice with no key anywhere is NOT_CONFIGURED${keyStored ? ", noting the stored key that would not open" : ""}`, () => {
    const h = harness();
    assert.equal(h.decide({}, { keyStored }), null);
    assert.deepEqual(h.reported, [{ code: "NOT_CONFIGURED", diagnostic:
      `site assistant is not configured — save a key on the Visitor's AI Assistant admin tab, or set GEMINI_API_KEY in the server environment.${keyStored ? UNOPENABLE : ""}` }]);
  });

  test(`a non-Google choice with no key never borrows GEMINI_API_KEY${keyStored ? " (stored key unopenable)" : ""}`, () => {
    const h = harness();
    assert.equal(h.decide({ GEMINI_API_KEY: "g-key" }, { provider: "anthropic", keyStored }), null);
    assert.deepEqual(h.reported, [{ code: "NOT_CONFIGURED", diagnostic:
      `site assistant is configured for the "anthropic" provider but has no usable anthropic key — save one on the Visitor's AI Assistant admin tab. GEMINI_API_KEY is a Google key and is deliberately not used for anthropic.${keyStored ? UNOPENABLE : ""}` }]);
  });
}

test("a non-Google key without a model is MODEL_NOT_CONFIGURED", () => {
  const h = harness();
  assert.equal(h.decide({}, { provider: "anthropic", apiKey: "sk-stored" }), null);
  assert.equal(h.reported[0]?.code, "MODEL_NOT_CONFIGURED");
});

test("a stored key keeps its own stored endpoint and model", () => {
  const h = harness();
  assert.deepEqual(h.decide({ TOVU_SITE_ASSISTANT_BASE_URL: "https://env.example" }, { provider: "anthropic", apiKey: "sk-stored", model: " claude-x ", baseUrl: "https://stored.example" }),
    { protocol: "anthropic", apiKey: "sk-stored", model: "claude-x", baseUrl: "https://stored.example" });
  assert.equal(h.sent.status, undefined);
});

test("an env-sourced Google key dials only the env endpoint and falls back to the default model", () => {
  const h = harness();
  assert.deepEqual(h.decide({ GEMINI_API_KEY: " g-env ", TOVU_SITE_ASSISTANT_BASE_URL: "https://vertex.example" }, { baseUrl: "https://stored-not-for-env-key.example" }),
    { protocol: "google", apiKey: "g-env", model: "gemini-flash-latest", baseUrl: "https://vertex.example" });
});
