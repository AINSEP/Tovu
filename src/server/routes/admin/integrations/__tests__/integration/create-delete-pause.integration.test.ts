import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/app";
import { bootAuthenticated, loginAsBarePrincipal } from "#src/server/__tests__/helpers/http-test-server";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Integration-tier coverage for `POST/DELETE/PAUSE .../integrations/subscriptions` — boots the
 * REAL composed app (`createApp`/`createRouteDeps`, real in-memory adapters, real identity/RBAC
 * stack, real login) rather than a bare Express app with stubbed auth, matching this repo's
 * established integration-test pattern (see `src/server/routes/admin/plugins/__tests__/integration/
 * plugins-http.integration.test.ts`).
 *
 * `src/server/__tests__/admin-integrations-routes.test.ts` already covers this same domain
 * thoroughly at the UNIT tier (its filename doesn't match `*.integration.test.ts` or
 * `__tests__/integration/`, so it classifies as unit under this repo's tier convention even though
 * it also boots a real app + real login) — this file exists because the two-tier gate measures unit
 * and integration coverage from SEPARATE `node --test` runs (`test:cov:server:unit` only loads
 * files that AREN'T integration-tier), so that file's execution contributes nothing to this file's
 * measured tier. Deliberately not a byte-for-byte duplicate of that file's scenarios — trimmed to
 * the branches `create.ts`/`delete.ts`/`pause.ts` actually have, via `createApp()` (the real
 * composition root) instead of hand-assembling a standalone router.
 */

const WORKSPACE_ID = "workspace-local";
const SUBS_PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/integrations/subscriptions`;

function testDeps(overrides: Partial<RouteDeps> = {}): RouteDeps {
  return { ...createRouteDeps(), ...overrides };
}

test("create: mismatched workspaceId 404s", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-real/integrations/subscriptions`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", targetUrl: "https://example.com/hook", topics: ["a"] }),
  });
  assert.equal(res.status, 404);
});

test("create: a principal with no grants is denied 403, real login stack", async (t) => {
  const deps = testDeps();
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const res = await fetch(`${baseUrl}${SUBS_PATH}`, {
    method: "POST",
    headers: { cookie: bareCookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", targetUrl: "https://example.com/hook", topics: ["a"] }),
  });
  assert.equal(res.status, 403);
});

test("create: missing label 400s", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}${SUBS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ targetUrl: "https://example.com/hook", topics: ["a"] }),
  });
  assert.equal(res.status, 400);
});

test("create: no topics 400s", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}${SUBS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", targetUrl: "https://example.com/hook" }),
  });
  assert.equal(res.status, 400);
});

test("create: valid request succeeds (201)", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}${SUBS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", targetUrl: "https://example.com/hook", topics: ["a"] }),
  });
  assert.equal(res.status, 201);
});

test("create: an unexpected repo failure 500s", async (t) => {
  const base = createRouteDeps();
  const deps = testDeps({
    webhookSubscriptionRepo: {
      ...base.webhookSubscriptionRepo,
      save: async () => {
        throw new Error("boom");
      },
    },
  });
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}${SUBS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", targetUrl: "https://example.com/hook", topics: ["a"] }),
  });
  assert.equal(res.status, 500);
});

test("delete: mismatched workspaceId 404s", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-real/integrations/subscriptions/x`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(res.status, 404);
});

test("delete: a principal with no grants is denied 403", async (t) => {
  const deps = testDeps();
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);
  const res = await fetch(`${baseUrl}${SUBS_PATH}/whatever`, { method: "DELETE", headers: { cookie: bareCookie } });
  assert.equal(res.status, 403);
});

test("delete: unknown subscription id 404s", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}${SUBS_PATH}/missing`, { method: "DELETE", headers: { cookie } });
  assert.equal(res.status, 404);
});

test("delete: soft-deletes an existing subscription (200, status disabled)", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const created = await fetch(`${baseUrl}${SUBS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", targetUrl: "https://example.com/hook", topics: ["a"] }),
  });
  const { subscription } = (await created.json()) as { subscription: { id: string } };

  const res = await fetch(`${baseUrl}${SUBS_PATH}/${subscription.id}`, { method: "DELETE", headers: { cookie } });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { subscription: { status: string } };
  assert.equal(body.subscription.status, "disabled");
});

test("delete: an unexpected repo failure 500s", async (t) => {
  const deps = testDeps();
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const created = await fetch(`${baseUrl}${SUBS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", targetUrl: "https://example.com/hook", topics: ["a"] }),
  });
  const { subscription } = (await created.json()) as { subscription: { id: string } };

  // Swap the repo AFTER creation so `findById` still sees the row (delegated through the SAME
  // original instance, preserving its internal `this`-bound state) but `save` (the delete's write)
  // fails — exercises delete.ts's generic catch without needing a second app/deps pair. Delegating
  // via arrow functions rather than extracting bare method references matters here: the original
  // repo's methods read `this`-bound internal state, which a bare `originalRepo.findById` reference
  // would lose the moment it is called off a different object.
  const originalRepo = deps.webhookSubscriptionRepo;
  deps.webhookSubscriptionRepo = {
    findById: (input) => originalRepo.findById(input),
    listByWorkspace: (input) => originalRepo.listByWorkspace(input),
    save: async () => {
      throw new Error("boom");
    },
  };

  const res = await fetch(`${baseUrl}${SUBS_PATH}/${subscription.id}`, { method: "DELETE", headers: { cookie } });
  assert.equal(res.status, 500);
});

test("pause: mismatched workspaceId 404s", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-real/integrations/subscriptions/x/pause`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 404);
});

test("pause: a principal with no grants is denied 403", async (t) => {
  const deps = testDeps();
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);
  const res = await fetch(`${baseUrl}${SUBS_PATH}/whatever/pause`, {
    method: "POST",
    headers: { cookie: bareCookie, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 403);
});

test("pause: unknown subscription id 404s", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}${SUBS_PATH}/missing/pause`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 404);
});

test("pause: pauses (default) then resumes (paused:false), real toggling round trip", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const created = await fetch(`${baseUrl}${SUBS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", targetUrl: "https://example.com/hook", topics: ["a"] }),
  });
  const { subscription } = (await created.json()) as { subscription: { id: string } };

  const paused = await fetch(`${baseUrl}${SUBS_PATH}/${subscription.id}/pause`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(paused.status, 200);
  assert.equal(((await paused.json()) as { subscription: { status: string } }).subscription.status, "paused");

  const resumed = await fetch(`${baseUrl}${SUBS_PATH}/${subscription.id}/pause`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ paused: false }),
  });
  assert.equal(resumed.status, 200);
  assert.equal(((await resumed.json()) as { subscription: { status: string } }).subscription.status, "active");
});

test("pause: pausing a disabled (deleted) subscription 400s (validation error)", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const created = await fetch(`${baseUrl}${SUBS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", targetUrl: "https://example.com/hook", topics: ["a"] }),
  });
  const { subscription } = (await created.json()) as { subscription: { id: string } };

  await fetch(`${baseUrl}${SUBS_PATH}/${subscription.id}`, { method: "DELETE", headers: { cookie } });

  const res = await fetch(`${baseUrl}${SUBS_PATH}/${subscription.id}/pause`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
});

test("pause: an unexpected repo failure 500s", async (t) => {
  const deps = testDeps();
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const created = await fetch(`${baseUrl}${SUBS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", targetUrl: "https://example.com/hook", topics: ["a"] }),
  });
  const { subscription } = (await created.json()) as { subscription: { id: string } };

  // Same delegate-through-arrow-functions technique as the delete 500 test above — see its comment.
  const originalRepo = deps.webhookSubscriptionRepo;
  deps.webhookSubscriptionRepo = {
    findById: (input) => originalRepo.findById(input),
    listByWorkspace: (input) => originalRepo.listByWorkspace(input),
    save: async () => {
      throw new Error("boom");
    },
  };

  const res = await fetch(`${baseUrl}${SUBS_PATH}/${subscription.id}/pause`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 500);
});
