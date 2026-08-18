import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { createRouteDeps } from "#src/server/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminMediaGetProvidersRoute } from "../get-providers";
import { registerAdminMediaPutProvidersRoute } from "../put-providers";
import type { MediaProviderRouteDeps } from "../deps";

/**
 * @file Unit-tier coverage for `GET`/`PUT .../media/providers` (`registerAdminMediaGetProvidersRoute`/
 * `registerAdminMediaPutProvidersRoute`). Same pattern as `admin/integrations/__tests__/create.test.ts`:
 * bare Express app, stubbed `res.locals.principal`, real in-memory repos/sealer/keyring narrowed out
 * of `createRouteDeps()`.
 */

const WORKSPACE_ID = "workspace-local";
const PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/media/providers`;

function buildApp(depsOverrides: Partial<MediaProviderRouteDeps> = {}): express.Express {
  const base = createRouteDeps();
  const deps: MediaProviderRouteDeps = {
    workspaceId: base.workspaceId,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    clock: base.clock,
    mediaProviderCredentialRepo: base.mediaProviderCredentialRepo,
    siteAssistantSecretSealer: base.siteAssistantSecretSealer,
    siteAssistantSecretKeyring: base.siteAssistantSecretKeyring,
    ...depsOverrides,
  };
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminMediaGetProvidersRoute(app, deps);
  registerAdminMediaPutProvidersRoute(app, deps);
  return app;
}

async function get(t: import("node:test").TestContext, app: express.Express, path = PATH) {
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${path}`);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function put(t: import("node:test").TestContext, app: express.Express, body: unknown, path = PATH) {
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${path}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

test("get-providers: mismatched workspaceId 404s", async (t) => {
  const app = buildApp();
  const { status } = await get(t, app, "/api/admin/v1/workspaces/not-real/media/providers");
  assert.equal(status, 404);
});

test("get-providers: forbidden (media.read denied) 403s", async (t) => {
  const app = buildApp({ authorize: async () => ({ allowed: false, reason: "no grant" }) });
  const { status } = await get(t, app);
  assert.equal(status, 403);
});

test("get-providers: empty map when nothing configured (200, bare object)", async (t) => {
  const app = buildApp();
  const { status, json } = await get(t, app);
  assert.equal(status, 200);
  assert.deepEqual(json, {});
});

test("get-providers: an unexpected repo failure 500s", async (t) => {
  const base = createRouteDeps();
  const app = buildApp({
    mediaProviderCredentialRepo: {
      ...base.mediaProviderCredentialRepo,
      listByWorkspaceId: async () => {
        throw new Error("boom");
      },
    },
  });
  const { status } = await get(t, app);
  assert.equal(status, 500);
});

test("put-providers: mismatched workspaceId 404s", async (t) => {
  const app = buildApp();
  const { status } = await put(t, app, { openai: { apiKey: "sk-1" } }, "/api/admin/v1/workspaces/not-real/media/providers");
  assert.equal(status, 404);
});

test("put-providers: forbidden (media.write denied) 403s", async (t) => {
  const app = buildApp({ authorize: async () => ({ allowed: false, reason: "no grant" }) });
  const { status } = await put(t, app, { openai: { apiKey: "sk-1" } });
  assert.equal(status, 403);
});

test("put-providers: unknown provider id 400s", async (t) => {
  const app = buildApp();
  const { status } = await put(t, app, { "not-a-real-provider": { apiKey: "sk-1" } });
  assert.equal(status, 400);
});

test("put-providers: non-object body 400s", async (t) => {
  const app = buildApp();
  const { status } = await put(t, app, "not-an-object");
  assert.equal(status, 400);
});

test("put-providers: valid apiKey saves and never echoes the key back (200)", async (t) => {
  const app = buildApp();
  const { status, json } = await put(t, app, { openai: { apiKey: "sk-secret-value", baseUrl: "https://api.openai.com/v1" } });
  assert.equal(status, 200, JSON.stringify(json));
  const body = json as { openai?: { apiKey?: string; keyTail?: string } };
  assert.ok(body.openai);
  assert.equal(body.openai?.apiKey, undefined, "key material must never be echoed back");
});

test("put-providers: omitting a previously-configured provider deletes it (whole-set semantics)", async (t) => {
  const app = buildApp();
  const first = await put(t, app, { openai: { apiKey: "sk-1" } });
  assert.equal(first.status, 200);

  const second = await put(t, app, {});
  assert.equal(second.status, 200);
  assert.deepEqual(second.json, {});
});

test("put-providers: an unconfigured secret store 503s", async (t) => {
  const base = createRouteDeps();
  const app = buildApp({
    siteAssistantSecretKeyring: {
      ...base.siteAssistantSecretKeyring,
      activeKey: async () => {
        throw new Error("no root key configured");
      },
    },
  });
  const { status, json } = await put(t, app, { openai: { apiKey: "sk-1" } });
  assert.equal(status, 503);
  assert.equal((json as { code?: string }).code, "SECRET_STORE_UNCONFIGURED");
});

test("put-providers: a request with no JSON content-type (req.body left undefined by express.json()) is treated as an empty map, not a crash", async (t) => {
  const app = buildApp();
  const baseUrl = await startTestServer(app, t);
  // Deliberately omit `content-type` so `express.json()` never parses a body and leaves
  // `req.body` as `undefined` — exercises `put-providers.ts`'s `(req.body ?? {})` fallback, a real
  // path any caller can hit by sending a PUT with no/non-JSON content-type, not just an artificial one.
  const res = await fetch(`${baseUrl}${PATH}`, { method: "PUT" });
  const json = await res.json().catch(() => ({}));
  assert.equal(res.status, 200, JSON.stringify(json));
  assert.deepEqual(json, {});
});

test("put-providers: an unexpected repo failure 500s", async (t) => {
  const base = createRouteDeps();
  const app = buildApp({
    mediaProviderCredentialRepo: {
      ...base.mediaProviderCredentialRepo,
      replaceWorkspace: async () => {
        throw new Error("boom");
      },
    },
  });
  const { status } = await put(t, app, { openai: { apiKey: "sk-1" } });
  assert.equal(status, 500);
});
