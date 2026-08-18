import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated, startTestServer } from "./helpers/http-test-server";
import { createRouteDeps } from "../app";
import { registerAuthRoutes, requireAdminSession } from "../middleware/dev-auth";
import { createAssistantSettingsModule } from "../modules/assistant-settings";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm";
import type { KeyringPort } from "../../webhooks/ports";
import type { RouteDeps } from "../routes/types";

/**
 * @file Route-level tests for ADR-058's 3 site-credential routes (GET/PUT/DELETE
 * `.../assistant/site-credential`). Real auth throughout, mirroring
 * `admin-assistant-execution-routes.test.ts`'s shape.
 *
 * What matters most: the write-only contract (PUT never echoes the key, GET never decrypts), the
 * omitted-apiKey "leave it alone" semantics at the HTTP layer, and the `503 SECRET_STORE_UNCONFIGURED`
 * fail-closed branch when the master secret is unavailable — simulated with a `KeyringPort` double
 * that always throws, swapped into the module's deps for that one test only.
 */

const WORKSPACE_ID = "workspace-local";
const CREDENTIAL_PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/assistant/site-credential`;

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
  createAssistantSettingsModule(deps).registerRoutes?.(app);
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
function del(baseUrl: string, path: string, cookie: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { method: "DELETE", headers: { cookie } });
}

test("all 3 routes require a session — an unauthenticated caller never reaches them", async (t) => {
  const { app } = buildTestApp();
  const baseUrl = await startTestServer(app, t);

  assert.equal((await get(baseUrl, CREDENTIAL_PATH, "")).status, 401);
  assert.equal((await put(baseUrl, CREDENTIAL_PATH, "", {})).status, 401);
  assert.equal((await del(baseUrl, CREDENTIAL_PATH, "")).status, 401);
});

test("a workspace id that is not this site's is 404, on all 3 routes", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const otherPath = "/api/admin/v1/workspaces/some-other-workspace/assistant/site-credential";

  assert.equal((await get(baseUrl, otherPath, cookie)).status, 404);
  assert.equal((await put(baseUrl, otherPath, cookie, {})).status, 404);
  assert.equal((await del(baseUrl, otherPath, cookie)).status, 404);
});

test("GET on a never-configured workspace returns isSet:false with no key material", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await get(baseUrl, CREDENTIAL_PATH, cookie);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: { isSet: boolean; masked: string | null } };
  assert.equal(body.data.isSet, false);
  assert.equal(body.data.masked, null);
});

test("PUT with an apiKey sets it and the response never contains the plaintext key", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await put(baseUrl, CREDENTIAL_PATH, cookie, { apiKey: "AIzaSyLIVE-EXAMPLE-KEY-7777" });
  assert.equal(res.status, 200, await res.clone().text());
  const bodyText = await res.clone().text();
  assert.ok(!bodyText.includes("AIzaSyLIVE-EXAMPLE-KEY-7777"));

  const body = (await res.json()) as { data: { isSet: boolean; masked: string | null } };
  assert.equal(body.data.isSet, true);
  assert.equal(body.data.masked, "••••7777");
});

test("PUT with an empty apiKey is a 400 validation error, and GET afterward still shows not-set", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await put(baseUrl, CREDENTIAL_PATH, cookie, { apiKey: "" });
  assert.equal(res.status, 400);
  assert.equal((await res.json() as { code: string }).code, "SITE_CREDENTIAL_VALIDATION_ERROR");

  const after = (await (await get(baseUrl, CREDENTIAL_PATH, cookie)).json()) as { data: { isSet: boolean } };
  assert.equal(after.data.isSet, false);
});

test("PUT omitting apiKey updates model without disturbing the previously-saved key", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  await put(baseUrl, CREDENTIAL_PATH, cookie, { apiKey: "stable-key-0000" });
  const res = await put(baseUrl, CREDENTIAL_PATH, cookie, { model: "gemini-flash-latest" });

  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: { isSet: boolean; masked: string; model: string } };
  assert.equal(body.data.isSet, true);
  assert.equal(body.data.masked, "••••0000");
  assert.equal(body.data.model, "gemini-flash-latest");
});

test("DELETE clears the key; a second DELETE on an already-cleared credential is a harmless 200", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  await put(baseUrl, CREDENTIAL_PATH, cookie, { apiKey: "to-delete-1234" });
  const first = await del(baseUrl, CREDENTIAL_PATH, cookie);
  assert.equal(first.status, 200);
  assert.equal((await first.json() as { data: { isSet: boolean } }).data.isSet, false);

  const second = await del(baseUrl, CREDENTIAL_PATH, cookie);
  assert.equal(second.status, 200);
});

test("PUT with an apiKey fails closed with 503 SECRET_STORE_UNCONFIGURED when the master secret is unavailable", async (t) => {
  const brokenKeyring = new BrokenKeyring();
  const { app } = buildTestApp({
    siteAssistantSecretKeyring: brokenKeyring,
    siteAssistantSecretSealer: new AesGcmSecretSealer(brokenKeyring),
  });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await put(baseUrl, CREDENTIAL_PATH, cookie, { apiKey: "would-be-a-real-key" });
  assert.equal(res.status, 503);
  assert.equal((await res.json() as { code: string }).code, "SECRET_STORE_UNCONFIGURED");

  // Nothing was written — GET still shows not-set.
  const after = (await (await get(baseUrl, CREDENTIAL_PATH, cookie)).json()) as { data: { isSet: boolean } };
  assert.equal(after.data.isSet, false);
});
