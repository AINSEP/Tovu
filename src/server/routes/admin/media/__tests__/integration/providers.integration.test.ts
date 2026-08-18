import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/app";
import { bootAuthenticated, loginAsBarePrincipal } from "#src/server/__tests__/helpers/http-test-server";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Integration-tier coverage for `GET`/`PUT .../media/providers` — real composed app
 * (`createApp`/`createRouteDeps`), real login, matching this repo's established integration-test
 * pattern (see `src/server/routes/admin/integrations/__tests__/integration/
 * create-delete-pause.integration.test.ts` for the identical technique applied to a sibling module).
 */

const WORKSPACE_ID = "workspace-local";
const PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/media/providers`;

function testDeps(overrides: Partial<RouteDeps> = {}): RouteDeps {
  return { ...createRouteDeps(), ...overrides };
}

test("get-providers: mismatched workspaceId 404s", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-real/media/providers`, { headers: { cookie } });
  assert.equal(res.status, 404);
});

test("get-providers: a principal with no grants is denied 403", async (t) => {
  const deps = testDeps();
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);
  const res = await fetch(`${baseUrl}${PATH}`, { headers: { cookie: bareCookie } });
  assert.equal(res.status, 403);
});

test("get-providers: owner sees an empty map before anything is configured (200)", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}${PATH}`, { headers: { cookie } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {});
});

test("put-providers: mismatched workspaceId 404s", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-real/media/providers`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ openai: { apiKey: "sk-1" } }),
  });
  assert.equal(res.status, 404);
});

test("put-providers: a principal with no grants is denied 403", async (t) => {
  const deps = testDeps();
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);
  const res = await fetch(`${baseUrl}${PATH}`, {
    method: "PUT",
    headers: { cookie: bareCookie, "content-type": "application/json" },
    body: JSON.stringify({ openai: { apiKey: "sk-1" } }),
  });
  assert.equal(res.status, 403);
});

test("put-providers: unknown provider id 400s", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}${PATH}`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ "totally-unknown": { apiKey: "sk-1" } }),
  });
  assert.equal(res.status, 400);
});

test("put-providers: valid save round-trips through GET (never leaking key material) and can be cleared", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const saved = await fetch(`${baseUrl}${PATH}`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ openai: { apiKey: "sk-integration-secret" } }),
  });
  assert.equal(saved.status, 200);
  const savedBody = (await saved.json()) as { openai?: { apiKey?: string } };
  assert.equal(savedBody.openai?.apiKey, undefined);

  const fetched = await fetch(`${baseUrl}${PATH}`, { headers: { cookie } });
  const fetchedBody = (await fetched.json()) as { openai?: unknown };
  assert.ok(fetchedBody.openai, "the saved provider must be visible on a subsequent GET");

  const cleared = await fetch(`${baseUrl}${PATH}`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(cleared.status, 200);
  assert.deepEqual(await cleared.json(), {});
});

test("put-providers: a request with no JSON content-type (req.body left undefined by express.json()) is treated as an empty map", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  // Same real-caller path as the unit-tier test of the same name — no `content-type` header means
  // `express.json()` never sets `req.body`, exercising the route's `(req.body ?? {})` fallback.
  const res = await fetch(`${baseUrl}${PATH}`, { method: "PUT", headers: { cookie } });
  const json = await res.json().catch(() => ({}));
  assert.equal(res.status, 200, JSON.stringify(json));
  assert.deepEqual(json, {});
});

test("get-providers: an unexpected repo failure 500s", async (t) => {
  const base = createRouteDeps();
  const deps = testDeps({
    mediaProviderCredentialRepo: {
      ...base.mediaProviderCredentialRepo,
      listByWorkspaceId: async () => {
        throw new Error("boom");
      },
    },
  });
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}${PATH}`, { headers: { cookie } });
  assert.equal(res.status, 500);
});

test("put-providers: an unexpected repo failure 500s", async (t) => {
  const base = createRouteDeps();
  const deps = testDeps({
    mediaProviderCredentialRepo: {
      ...base.mediaProviderCredentialRepo,
      replaceWorkspace: async () => {
        throw new Error("boom");
      },
    },
  });
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}${PATH}`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ openai: { apiKey: "sk-1" } }),
  });
  assert.equal(res.status, 500);
});

test("put-providers: an unconfigured secret store 503s", async (t) => {
  const base = createRouteDeps();
  const deps = testDeps({
    siteAssistantSecretKeyring: {
      ...base.siteAssistantSecretKeyring,
      activeKey: async () => {
        throw new Error("no root key configured");
      },
    },
  });
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}${PATH}`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ openai: { apiKey: "sk-1" } }),
  });
  assert.equal(res.status, 503);
  assert.equal(((await res.json()) as { code?: string }).code, "SECRET_STORE_UNCONFIGURED");
});
