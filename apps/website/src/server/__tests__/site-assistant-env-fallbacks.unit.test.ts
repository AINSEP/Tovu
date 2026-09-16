import assert from "node:assert/strict";
import test from "node:test";

import type { ByokProtocol } from "../../assistant/index.js";
import { siteAssistantEnvFallbacks } from "../runtime/composition/modules/site-assistant.js";

/**
 * @file `siteAssistantEnvFallbacks` (t91 F3.1) is the single gate every env-sourced value for a
 * site-assistant provider turn passes through. Its whole job is restricting `GEMINI_API_KEY`,
 * `TOVU_SITE_ASSISTANT_BASE_URL`, and `TOVU_SITE_ASSISTANT_MODEL` to the `google` protocol — this
 * is the only coverage for the Anthropic/OpenAI endpoint gate, since a route-level test can't
 * reach it without either storing a baseUrl (masking the env fallback entirely) or letting a RED
 * run dial the real public Anthropic/OpenAI endpoint.
 */

const ALL_ENV_SET: NodeJS.ProcessEnv = {
  GEMINI_API_KEY: "gemini-key",
  TOVU_SITE_ASSISTANT_BASE_URL: "https://example.invalid/base",
  TOVU_SITE_ASSISTANT_MODEL: "some-model",
};

for (const protocol of ["anthropic", "openai", "azure"] as const satisfies readonly ByokProtocol[]) {
  test(`site assistant env fallbacks: ${protocol} gets none of the three env values, even when all are set`, () => {
    assert.deepEqual(siteAssistantEnvFallbacks(ALL_ENV_SET, protocol), {
      apiKey: undefined,
      baseUrl: undefined,
      model: undefined,
    });
  });
}

test("site assistant env fallbacks: google reads and trims all three", () => {
  const result = siteAssistantEnvFallbacks(
    {
      GEMINI_API_KEY: "  k  ",
      TOVU_SITE_ASSISTANT_BASE_URL: " https://proxy.example ",
      TOVU_SITE_ASSISTANT_MODEL: " gemini-x ",
    },
    "google",
  );
  assert.deepEqual(result, { apiKey: "k", baseUrl: "https://proxy.example", model: "gemini-x" });
});

test("site assistant env fallbacks: google with whitespace-only env values gets undefined for each", () => {
  const result = siteAssistantEnvFallbacks(
    {
      GEMINI_API_KEY: "   ",
      TOVU_SITE_ASSISTANT_BASE_URL: "\t",
      TOVU_SITE_ASSISTANT_MODEL: "",
    },
    "google",
  );
  assert.deepEqual(result, { apiKey: undefined, baseUrl: undefined, model: undefined });
});
