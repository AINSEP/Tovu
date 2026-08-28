import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import type { KeyringPort } from "../../features/webhooks/index.js";
import { AesGcmSecretSealer } from "../../features/webhooks/secret-sealer.aesgcm.js";
import { createRouteDeps } from "../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../middleware/dev-auth.js";
import { createMediaModule } from "../runtime/composition/modules/media.js";
import type { RouteDeps } from "../routes/types.js";
import { bootAuthenticated, startTestServer } from "./helpers/http-test-server.js";

/**
 * @file Route-level tests for the 2 media-provider-credential routes (GET/PUT
 * `.../media/providers`) — real Express app, real session auth, real HTTP, real sealing.
 *
 * What matters most: a key survives a PUT→GET round trip as markers only and never appears in any
 * response body, the whole-map-replace contract really deletes an omitted provider over the wire,
 * a UI-spelled provider id is rejected at the boundary, and the `503 SECRET_STORE_UNCONFIGURED`
 * branch fails closed — simulated with a `KeyringPort` double swapped in for that one test.
 */

const WORKSPACE_ID = "workspace-local";
const PROVIDERS_PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/media/providers`;

/** Always fails — simulates a missing `TOVU_INTEGRATIONS_ROOT_KEY` without touching real env state. */
class BrokenKeyring implements KeyringPort {
  async activeKey(): Promise<{ readonly keyId: string }> {
    throw new Error("no root key: TOVU_INTEGRATIONS_ROOT_KEY is not set and allowFileFallback is disabled");
  }
  async deriveSigningSecret(): Promise<Uint8Array> {
    throw new Error("no root key");
  }
  async derive(): Promise<Uint8Array> {
    throw new Error("no root key");
  }
}

function buildTestApp(overrides: Partial<RouteDeps> = {}): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = { ...createRouteDeps(), ...overrides };
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  createMediaModule(deps).registerRoutes?.(app);
  return { app, deps };
}

function get(baseUrl: string, path: string, cookie: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { headers: { cookie } });
}
function put(baseUrl: string, path: string, cookie: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

test("both routes require a session — an unauthenticated caller never reaches them", async (t) => {
  const { app } = buildTestApp();
  const baseUrl = await startTestServer(app, t);

  assert.equal((await get(baseUrl, PROVIDERS_PATH, "")).status, 401);
  assert.equal((await put(baseUrl, PROVIDERS_PATH, "", {})).status, 401);
});

test("a workspace id that is not this site's is 404 on both routes", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const otherPath = "/api/admin/v1/workspaces/some-other-workspace/media/providers";

  assert.equal((await get(baseUrl, otherPath, cookie)).status, 404);
  assert.equal((await put(baseUrl, otherPath, cookie, {})).status, 404);
});

test("GET on a never-configured workspace returns an empty map, not an error", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await get(baseUrl, PROVIDERS_PATH, cookie);
  assert.equal(res.status, 200);
  // `{}` is a real answer meaning "reached, manages nothing" — distinct from unreachable.
  assert.deepEqual(await res.json(), {});
});

test("a key PUT over HTTP round-trips through GET as markers, and never appears in any body", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const secret = "sk-live-EXAMPLE-DUMMY-4242";

  const putRes = await put(baseUrl, PROVIDERS_PATH, cookie, {
    openai: { apiKey: secret, baseUrl: "https://api.openai.com/v1", model: "dall-e-3" },
  });
  assert.equal(putRes.status, 200, await putRes.clone().text());
  assert.ok(!(await putRes.clone().text()).includes(secret), "PUT response must not echo the key");
  assert.deepEqual(await putRes.json(), {
    openai: { baseUrl: "https://api.openai.com/v1", model: "dall-e-3", apiKeyConfigured: true, apiKeyTail: "4242" },
  });

  const getRes = await get(baseUrl, PROVIDERS_PATH, cookie);
  assert.ok(!(await getRes.clone().text()).includes(secret), "GET response must not echo the key");
  assert.deepEqual(await getRes.json(), {
    openai: { baseUrl: "https://api.openai.com/v1", model: "dall-e-3", apiKeyConfigured: true, apiKeyTail: "4242" },
  });
});

test("omitting a provider from a later PUT deletes it, over the wire", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  await put(baseUrl, PROVIDERS_PATH, cookie, {
    openai: { apiKey: "sk-one-1111" },
    grok: { apiKey: "xai-two-2222" },
  });
  await put(baseUrl, PROVIDERS_PATH, cookie, { openai: { apiKeyConfigured: true, apiKeyTail: "1111" } });

  const body = (await (await get(baseUrl, PROVIDERS_PATH, cookie)).json()) as Record<string, unknown>;
  assert.deepEqual(Object.keys(body), ["openai"]);
});

test("editing baseUrl without resending the key keeps the stored key", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  await put(baseUrl, PROVIDERS_PATH, cookie, { grok: { apiKey: "xai-keep-8888" } });
  await put(baseUrl, PROVIDERS_PATH, cookie, {
    grok: { apiKeyConfigured: true, apiKeyTail: "8888", baseUrl: "https://api.x.ai/v1" },
  });

  const body = (await (await get(baseUrl, PROVIDERS_PATH, cookie)).json()) as Record<
    string,
    { apiKeyConfigured?: boolean; apiKeyTail?: string; baseUrl?: string }
  >;
  assert.equal(body.grok?.apiKeyConfigured, true);
  assert.equal(body.grok?.apiKeyTail, "8888");
  assert.equal(body.grok?.baseUrl, "https://api.x.ai/v1");
});

test("a UI-spelled provider id is rejected at the boundary with a 400", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await put(baseUrl, PROVIDERS_PATH, cookie, { "xai-grok-imagine": { apiKey: "k-1234" } });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "MEDIA_PROVIDER_CREDENTIAL_VALIDATION_ERROR");

  // ...and nothing was stored under the bad id.
  assert.deepEqual(await (await get(baseUrl, PROVIDERS_PATH, cookie)).json(), {});
});

test("a missing master secret is a 503 SECRET_STORE_UNCONFIGURED, not a 500", async (t) => {
  const brokenKeyring = new BrokenKeyring();
  const { app } = buildTestApp({
    siteAssistantSecretKeyring: brokenKeyring,
    siteAssistantSecretSealer: new AesGcmSecretSealer(brokenKeyring),
  });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await put(baseUrl, PROVIDERS_PATH, cookie, { openai: { apiKey: "sk-nope-0000" } });
  assert.equal(res.status, 503);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "SECRET_STORE_UNCONFIGURED");
});

test("an empty map clears everything over the wire", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  await put(baseUrl, PROVIDERS_PATH, cookie, { openai: { apiKey: "sk-gone-3333" } });
  assert.deepEqual(await (await put(baseUrl, PROVIDERS_PATH, cookie, {})).json(), {});
  assert.deepEqual(await (await get(baseUrl, PROVIDERS_PATH, cookie)).json(), {});
});
