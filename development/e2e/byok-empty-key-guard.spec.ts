import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * @file BYOK empty-key guard — zero network reaches the provider (2026-08-04 dispatch, Item
 * 2 of the original brief, promoted to the adversarial floor by MSG-1).
 *
 * `listProviderModels`/`testProviderConnection` (`@jini-ai/agent-runtime/providers/{model-
 * catalog,connection-test}.ts`) reject an empty/whitespace `apiKey` locally, before any
 * fetch, for every protocol in `PROTOCOLS_REQUIRING_API_KEY` (anthropic/openai/senseaudio/
 * google). `aihubmix` is the sole exception in the shared package (its catalog is public,
 * confirmed by source — `providerModelsHeaders`'s aihubmix branch sends no Authorization
 * header for a blank key rather than rejecting) but is UNREACHABLE through this exemption
 * here: Tovu's own route (`list-models.ts:6`) only allowlists anthropic/openai/azure/google,
 * so aihubmix can't be exercised through the real HTTP surface and isn't asserted here.
 *
 * `page.route`/a real local listener are used deliberately, not as a weaker stand-in for a
 * live provider call: this spec doesn't just read the returned message (a route COULD return
 * the right-looking string while still having made a real network call first) — the final
 * case proves zero requests reached an actual reachable host, using the same "confused
 * deputy" pattern as `byok-ssrf-guard.spec.ts`. Zero real keys, zero provider quota.
 *
 * One login for the whole file, not one per case — see `byok-ssrf-guard.spec.ts`'s header
 * for why (the real `LOGIN_STRICT` rate limiter, 10 req/60s/IP, is tripped by this suite's
 * own login volume otherwise; the limiter itself is untouched).
 */

const A2UI_LOGIN = { username: "admin", password: "tovu-dev" };
async function login(request: APIRequestContext): Promise<void> {
  const res = await request.post("/api/admin/v1/auth/login", { data: A2UI_LOGIN });
  expect(res.status()).toBe(200);
}

const MODELS_PATH = "/api/admin/v1/workspaces/workspace-local/assistant/execution/models";
const TEST_CONN_PATH = "/api/admin/v1/workspaces/workspace-local/assistant/execution/test-connection";

test("empty-key guard: local rejection for every key-requiring protocol, both routes", async ({ request }) => {
  await login(request);

  const protocols: Array<{ protocol: string; baseUrl: string }> = [
    { protocol: "anthropic", baseUrl: "https://api.anthropic.com" },
    { protocol: "openai", baseUrl: "https://api.openai.com" },
    { protocol: "google", baseUrl: "https://generativelanguage.googleapis.com" },
  ];

  for (const { protocol, baseUrl } of protocols) {
    for (const apiKey of ["", "   \t  "]) {
      const label = `${protocol} apiKey=${JSON.stringify(apiKey)}`;
      const modelsRes = await request.post(MODELS_PATH, { data: { protocol, baseUrl, apiKey } });
      const modelsBody = await modelsRes.json();
      expect(modelsBody.ok, `models: ${label}`).toBe(false);
      expect(modelsBody.message, `models: ${label}`).toBe(
        "No API key — model discovery needs the key from this browser.",
      );

      const testConnRes = await request.post(TEST_CONN_PATH, {
        data: { protocol, baseUrl, apiKey, model: "some-model" },
      });
      const testConnBody = await testConnRes.json();
      expect(testConnBody.ok, `test-connection: ${label}`).toBe(false);
      expect(testConnBody.message, `test-connection: ${label}`).toBe(
        "No API key — connection test needs the key from this browser.",
      );
    }
  }
});

test("zero-network proof: an empty key never reaches a real listener, even one the SSRF guard allows (loopback)", async ({
  request,
}) => {
  await login(request);

  // The strongest version of "zero requests reach the provider": point baseUrl at a REAL
  // listener on loopback (which `byok-ssrf-guard.spec.ts` proves the SSRF guard allows
  // through) with an EMPTY key, and prove the empty-key guard still stops it before the
  // SSRF-allowed path is ever reached.
  let hitCount = 0;
  const deputy = http.createServer((_req, res) => {
    hitCount++;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: [{ id: "should-never-be-reached", object: "model" }] }));
  });
  await new Promise<void>((resolve) => deputy.listen(0, "127.0.0.1", resolve));
  const port = (deputy.address() as AddressInfo).port;

  try {
    const res = await request.post(MODELS_PATH, {
      data: { protocol: "openai", baseUrl: `http://127.0.0.1:${port}`, apiKey: "" },
    });
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.message).toBe("No API key — model discovery needs the key from this browser.");
    // The measured fact: the guard fired BEFORE the SSRF-allowed loopback path was ever
    // reached, even though that path is open for a non-empty key.
    expect(hitCount).toBe(0);
  } finally {
    await new Promise<void>((resolve) => deputy.close(() => resolve()));
  }
});
