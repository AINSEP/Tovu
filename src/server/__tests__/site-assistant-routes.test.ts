import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "../app";
import { setPublicAssistantSettings } from "../../assistant/public-assistant-settings";
import { startTestServer } from "./helpers/http-test-server";

/**
 * @file `POST /api/site-assistant/chat` (ADR-054) — coverage for the master on/off switch
 * (`assistant/public-assistant-settings.ts`), not the model call itself (that needs a live
 * `GEMINI_API_KEY`, which this test environment does not set — see `site-assistant.ts`'s own
 * `NOT_CONFIGURED` 503 branch, which the "enabled" test below deliberately lands on instead of
 * mocking a provider).
 *
 * The property under test is the one `public-assistant-settings.ts`'s file header spells out by
 * name: "publicEnabled: false means... NO assistant endpoint," and "a CSS or JavaScript-level hide
 * is a defect against this contract, not a shortcut" — so disabled must read as 404 (route does not
 * exist), never a 403/503 that would confirm the feature exists but is turned off.
 */

const alwaysAllow = async () => ({ allowed: true, reason: "test" });

async function postChat(baseUrl: string): Promise<Response> {
  return fetch(`${baseUrl}/api/site-assistant/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "What posts are on this site?" }),
  });
}

test("POST /api/site-assistant/chat 404s when the public assistant is disabled (the default)", async (t) => {
  const deps = createRouteDeps();
  const app = createApp(deps);
  const baseUrl = await startTestServer(app, t);

  const res = await postChat(baseUrl);
  assert.equal(res.status, 404);
});

test("POST /api/site-assistant/chat passes the gate once the workspace turns the switch on", async (t) => {
  const deps = createRouteDeps();
  // Await the LAST settings-registration promise in `createRouteDeps()`'s chain
  // (`assistantSettingsReady` -> `executionSettingsReady` -> `settingsUiTabsReady` ->
  // `analyticsSettingsReady`), not just the assistant one: each boot-time registration opens its
  // own transaction on the same in-memory `settingsRepo`, and `InMemorySettingsRepo.transaction` is
  // not reentrant — awaiting only `assistantSettingsReady` races the next link's own transaction and
  // intermittently throws "not reentrant" out of the write below.
  await deps.analyticsSettingsReady;
  await setPublicAssistantSettings(
    { settingsRepo: deps.settingsRepo, clock: deps.clock, ids: deps.idGen, authorize: alwaysAllow, principals: deps.principalRepo },
    { workspaceId: deps.workspaceId, patch: { publicEnabled: true }, callerPrincipalId: "test-caller" },
  );
  const app = createApp(deps);
  const baseUrl = await startTestServer(app, t);

  const res = await postChat(baseUrl);
  // No `GEMINI_API_KEY` in this test environment, so the NEXT check the route makes after the gate
  // (`site-assistant.ts`'s own `NOT_CONFIGURED` branch) is what answers — 503, never 404. Asserting
  // "not 404" rather than the literal 503 keeps this test from being coupled to that unrelated
  // branch's exact status code; what it needs to prove is that the enablement gate let the request
  // through at all.
  assert.notEqual(res.status, 404);
});
