import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import type { KeyringPort } from "../../webhooks/index";
import { startFakeComposio } from "../../../development/e2e/fake-composio-server";
import { composioUserIdFor, createComposioConnectors } from "../../connectors/composio-service";
import { InMemoryConnectorCredentialRepo } from "../../connectors/connector-credential-store.memory";
import { createRouteDeps } from "../app";
import { registerAuthRoutes, requireAdminSession } from "../middleware/dev-auth";
import { createConnectorsModule } from "../modules/connectors";
import type { RouteDeps } from "../routes/types";
import { bootAuthenticated, startTestServer } from "./helpers/http-test-server";

/**
 * @file Route-level tests for the 5 Composio connector routes — real Express app, real session
 * auth, real HTTP, real sealing, real `ComposioConnectorService`.
 *
 * What matters most: the catalog is the provider's REAL static roster (the tab used to render an
 * empty fake), `/connectors/config` and `/connectors/statuses` are not swallowed by the
 * `/:connectorId` route registered after them, an API key survives a PUT→GET round trip as markers
 * only and never appears in any response body, and the `503 SECRET_STORE_UNCONFIGURED` branch fails
 * closed.
 *
 * The catalog assertions are served by the provider's in-process static catalog and reach no
 * network. The key-verification assertions DO make an outbound call, which is why every app here is
 * pointed at `development/e2e/fake-composio-server.ts` — see {@link buildTestApp}. No real keys
 * anywhere; every value is an obvious dummy.
 */

const WORKSPACE_ID = "workspace-local";
const BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}/connectors`;
const CONFIG_PATH = `${BASE}/config`;
const STATUSES_PATH = `${BASE}/statuses`;
const DUMMY_KEY = "comp_UNIT_DUMMY_NOT_A_REAL_KEY_4242";

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

/**
 * Points the connectors service at a fake Composio.
 *
 * Required, not optional: `PUT /connectors/config` now verifies a candidate key against Composio
 * before storing it, so a harness left on the default origin would send every dummy key in this
 * file to the real `backend.composio.dev` and fail on the network rather than on behavior.
 */
async function buildTestApp(
  t: import("node:test").TestContext,
  overrides: Partial<RouteDeps> = {},
  fakeOptions: { rejectApiKey?: boolean } = {}
): Promise<{ app: express.Express; deps: RouteDeps }> {
  const base: RouteDeps = createRouteDeps();
  const fake = await startFakeComposio({
    expectedUserId: composioUserIdFor(base.workspaceId),
    ...(fakeOptions.rejectApiKey === undefined ? {} : { rejectApiKey: fakeOptions.rejectApiKey }),
  });
  t.after(() => fake.close());

  const deps: RouteDeps = {
    ...base,
    ...overrides,
    composioConnectors: createComposioConnectors({
      workspaceId: base.workspaceId,
      repo: base.composioConfigRepo,
      credentialRepo: new InMemoryConnectorCredentialRepo(),
      sealer: overrides.siteAssistantSecretSealer ?? base.siteAssistantSecretSealer,
      keyring: overrides.siteAssistantSecretKeyring ?? base.siteAssistantSecretKeyring,
      clock: base.clock,
      baseUrl: fake.url,
    }),
  };
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  createConnectorsModule(deps).registerRoutes?.(app);
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

test("every route requires a session", async (t) => {
  const { app } = await buildTestApp(t);
  const baseUrl = await startTestServer(app, t);

  assert.equal((await get(baseUrl, BASE, "")).status, 401);
  assert.equal((await get(baseUrl, CONFIG_PATH, "")).status, 401);
  assert.equal((await get(baseUrl, STATUSES_PATH, "")).status, 401);
  assert.equal((await get(baseUrl, `${BASE}/github`, "")).status, 401);
  assert.equal((await put(baseUrl, CONFIG_PATH, "", {})).status, 401);
});

test("a workspace id that is not this site's is 404", async (t) => {
  const { app } = await buildTestApp(t);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const otherBase = "/api/admin/v1/workspaces/not-this-site/connectors";

  assert.equal((await get(baseUrl, otherBase, cookie)).status, 404);
  assert.equal((await get(baseUrl, `${otherBase}/config`, cookie)).status, 404);
});

test("the catalog is the provider's real static roster, not an empty fake", async (t) => {
  const { app } = await buildTestApp(t);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const body = (await (await get(baseUrl, BASE, cookie)).json()) as {
    connectors: { id: string; name: string; provider: string }[];
    meta: { provider: string };
  };

  // The fake this tab used to render returned ZERO. The static catalog is 3 featured connectors
  // plus 183 documented toolkits, and needs no API key to serve.
  assert.ok(body.connectors.length > 100, `expected a populated catalog, got ${body.connectors.length}`);
  assert.equal(body.meta.provider, "composio");

  const ids = new Set(body.connectors.map((connector) => connector.id));
  for (const expected of ["github", "notion", "google_drive"]) {
    assert.ok(ids.has(expected), `expected the featured connector "${expected}"`);
  }
});

test("literal-segment routes are not swallowed by the /:connectorId route registered after them", async (t) => {
  const { app } = await buildTestApp(t);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  // Both would resolve as a connector id (and 404) if registration order regressed.
  const config = await get(baseUrl, CONFIG_PATH, cookie);
  assert.equal(config.status, 200);
  assert.deepEqual(await config.json(), { configured: false, apiKeyTail: "" });

  const statuses = await get(baseUrl, STATUSES_PATH, cookie);
  assert.equal(statuses.status, 200);
  const statusMap = (await statuses.json()) as Record<string, { status: string }>;
  assert.equal(statusMap.github?.status, "available");
});

test("an unknown connector id is 404 with the service's own error code", async (t) => {
  const { app } = await buildTestApp(t);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await get(baseUrl, `${BASE}/definitely-not-a-connector`, cookie);
  assert.equal(res.status, 404);
  assert.equal(((await res.json()) as { code: string }).code, "CONNECTOR_NOT_FOUND");
});

test("a key survives a PUT/GET round trip as markers only and never appears in a response body", async (t) => {
  const { app } = await buildTestApp(t);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const saved = await put(baseUrl, CONFIG_PATH, cookie, { apiKey: DUMMY_KEY });
  assert.equal(saved.status, 200);
  const savedText = await saved.text();
  assert.equal(savedText.includes(DUMMY_KEY), false, "the PUT response must not echo the key");
  assert.deepEqual(JSON.parse(savedText), { configured: true, apiKeyTail: "4242" });

  const read = await get(baseUrl, CONFIG_PATH, cookie);
  const readText = await read.text();
  assert.equal(readText.includes(DUMMY_KEY), false, "the GET response must not carry the key");
  assert.deepEqual(JSON.parse(readText), { configured: true, apiKeyTail: "4242" });
});

test("null clears the stored key; a missing apiKey property is a 400 rather than a guess", async (t) => {
  const { app } = await buildTestApp(t);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  await put(baseUrl, CONFIG_PATH, cookie, { apiKey: DUMMY_KEY });

  const cleared = await put(baseUrl, CONFIG_PATH, cookie, { apiKey: null });
  assert.equal(cleared.status, 200);
  assert.deepEqual(await cleared.json(), { configured: false, apiKeyTail: "" });

  // Neither "store" nor "clear" — guessing between them is how a malformed client wipes a secret.
  const missing = await put(baseUrl, CONFIG_PATH, cookie, {});
  assert.equal(missing.status, 400);
  assert.equal(((await missing.json()) as { code: string }).code, "VALIDATION_ERROR");
});

test("a blank key is rejected at the boundary with a 400", async (t) => {
  const { app } = await buildTestApp(t);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await put(baseUrl, CONFIG_PATH, cookie, { apiKey: "   " });
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { code: string }).code, "VALIDATION_ERROR");
});

test("a key Composio refuses is rejected with 400 and never stored", async (t) => {
  const { app } = await buildTestApp(t, {}, { rejectApiKey: true });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await put(baseUrl, CONFIG_PATH, cookie, { apiKey: DUMMY_KEY });
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { code: string }).code, "COMPOSIO_KEY_REJECTED");

  // The whole point: `configured` must mean "Composio accepts this", not "something was typed".
  assert.deepEqual(await (await get(baseUrl, CONFIG_PATH, cookie)).json(), {
    configured: false,
    apiKeyTail: "",
  });
});

test("an unverifiable key is a 502 and is also not stored", async (t) => {
  const { app, deps } = await buildTestApp(t);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  // Simulates Composio being unreachable rather than answering "no" — a distinct outcome, because
  // telling an operator behind a flaky network that their key is wrong would send them chasing a
  // problem they do not have.
  deps.composioConnectors.probeApiKey = async () => ({ ok: false, reason: "unreachable" });

  const res = await put(baseUrl, CONFIG_PATH, cookie, { apiKey: DUMMY_KEY });
  assert.equal(res.status, 502);
  assert.equal(((await res.json()) as { code: string }).code, "COMPOSIO_UNREACHABLE");
  assert.deepEqual(await (await get(baseUrl, CONFIG_PATH, cookie)).json(), {
    configured: false,
    apiKeyTail: "",
  });
});

test("clearing a key needs no verification — it must work while Composio is down", async (t) => {
  const { app, deps } = await buildTestApp(t);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  assert.equal((await put(baseUrl, CONFIG_PATH, cookie, { apiKey: DUMMY_KEY })).status, 200);

  deps.composioConnectors.probeApiKey = async () => ({ ok: false, reason: "unreachable" });

  // An operator revoking a compromised key must not be blocked by the provider being unreachable.
  const cleared = await put(baseUrl, CONFIG_PATH, cookie, { apiKey: null });
  assert.equal(cleared.status, 200);
  assert.deepEqual(await cleared.json(), { configured: false, apiKeyTail: "" });
});

test("a missing master secret is a 503 SECRET_STORE_UNCONFIGURED, not a 500", async (t) => {
  const { app } = await buildTestApp(t, { siteAssistantSecretKeyring: new BrokenKeyring() });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await put(baseUrl, CONFIG_PATH, cookie, { apiKey: DUMMY_KEY });
  assert.equal(res.status, 503);
  assert.equal(((await res.json()) as { code: string }).code, "SECRET_STORE_UNCONFIGURED");

  // Fail-closed: nothing was stored on the way to that error.
  assert.deepEqual(await (await get(baseUrl, CONFIG_PATH, cookie)).json(), {
    configured: false,
    apiKeyTail: "",
  });
});
