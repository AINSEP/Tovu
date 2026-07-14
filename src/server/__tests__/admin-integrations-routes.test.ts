import assert from "node:assert/strict";
import test from "node:test";

import { bootAuthenticated } from "./helpers/http-test-server";
import express from "express";

import { InMemoryWebhookDeliveryRepo, InMemoryWebhookSubscriptionRepo } from "../../integrations";
import type { WebhookDeliveryRecord } from "../../integrations";
import { createRouteDeps } from "../app";
import { registerAuthRoutes, requireAdminSession } from "../middleware/dev-auth";
import { registerAdminIntegrationsCreateRoute } from "../routes/admin/integrations/create";
import { registerAdminIntegrationsDeleteRoute } from "../routes/admin/integrations/delete";
import { registerAdminIntegrationsDeliveriesRoute } from "../routes/admin/integrations/deliveries";
import type { IntegrationsRouteDeps } from "../routes/admin/integrations/deps";
import { registerAdminIntegrationsListRoute } from "../routes/admin/integrations/list";
import { registerAdminIntegrationsPauseRoute } from "../routes/admin/integrations/pause";

/**
 * @file Route-level tests for the integrations admin HTTP API (ADR-036 admin wiring).
 *
 * `src/server/app.ts` is out of scope for this task (see the handoff report for the `createApp`
 * wiring lines), so these tests build a standalone Express app the same way `app.ts` composes
 * one — auth middleware + the route registrars under test — instead of exercising `createApp()`
 * directly. `createRouteDeps()` (already exported by `app.ts`, unmodified) supplies the base
 * `RouteDeps`; the two webhook repos are layered on top to form `IntegrationsRouteDeps`.
 */

function makeDelivery(overrides: Partial<WebhookDeliveryRecord> = {}): WebhookDeliveryRecord {
  return {
    id: "delivery-1",
    workspaceId: "workspace-local",
    subscriptionId: "sub-1",
    eventId: "event-1",
    topic: "post.published",
    status: "delivered",
    attempts: 1,
    nextAttemptAt: "2026-07-10T00:00:00.000Z",
    lastResponseStatus: 200,
    lastError: null,
    signedWithVersion: 1,
    createdAt: "2026-07-10T00:00:00.000Z",
    deliveredAt: "2026-07-10T00:00:01.000Z",
    deadAt: null,
    ...overrides,
  };
}

function buildTestApp(): { app: express.Express; deps: IntegrationsRouteDeps } {
  const deps: IntegrationsRouteDeps = {
    ...createRouteDeps(),
    webhookSubscriptionRepo: new InMemoryWebhookSubscriptionRepo(),
    webhookDeliveryRepo: new InMemoryWebhookDeliveryRepo(),
  };

  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));

  registerAdminIntegrationsListRoute(app, deps);
  registerAdminIntegrationsCreateRoute(app, deps);
  registerAdminIntegrationsPauseRoute(app, deps);
  registerAdminIntegrationsDeleteRoute(app, deps);
  registerAdminIntegrationsDeliveriesRoute(app, deps);

  return { app, deps };
}

/** Boots a test app on an ephemeral port and returns an authenticated fetch cookie + base URL. */
test("integrations routes: list is empty before any subscription exists", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/integrations/subscriptions`, {
    headers: { cookie },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { subscriptions: unknown[] };
  assert.deepEqual(body.subscriptions, []);
});

test("integrations routes: list rejects a workspaceId that doesn't match the seeded workspace", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/some-other-workspace/integrations/subscriptions`, {
    headers: { cookie },
  });
  assert.equal(res.status, 404);
});

test("integrations routes: create validates https:// and never leaks secret material in the response", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const rejected = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/integrations/subscriptions`,
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ label: "Bad", targetUrl: "http://example.com/hooks", topics: ["post.published"] }),
    }
  );
  assert.equal(rejected.status, 400);

  const created = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/integrations/subscriptions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      label: "  My Endpoint  ",
      targetUrl: "https://example.com/hooks",
      topics: ["post.published", "post.published"],
    }),
  });
  assert.equal(created.status, 201);
  const { subscription } = (await created.json()) as { subscription: Record<string, unknown> };
  assert.equal(subscription.label, "My Endpoint");
  assert.deepEqual(subscription.topics, ["post.published"]);
  assert.equal(subscription.status, "active");
  assert.equal(subscription.lastDelivery, null);
  // No signing secret was ever stored to begin with (derive-not-store, ADR-036 §5) — assert the
  // response carries only the generation counter, never a `secret`/`signingSecret` field.
  assert.equal("secret" in subscription, false);
  assert.equal("signingSecret" in subscription, false);
  assert.equal(subscription.secretVersion, 1);
});

test("integrations routes: create rejects a private-IP target via the real OriginRegistry oracle (ADR-PIPE-015 GAP-06)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const rejected = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/integrations/subscriptions`,
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        label: "SSRF attempt",
        targetUrl: "https://169.254.169.254/latest/meta-data",
        topics: ["post.published"],
      }),
    }
  );
  assert.equal(rejected.status, 400);
  const body = (await rejected.json()) as { error: string };
  assert.match(body.error, /not an allowed egress target/);

  // A host on the dev-capability egress allowlist (see app.ts's `createRouteDeps`) still works —
  // proves this isn't a blanket rejection of every target.
  const allowed = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/integrations/subscriptions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ label: "OK", targetUrl: "https://example.com/hooks", topics: ["post.published"] }),
  });
  assert.equal(allowed.status, 201);
});

test("integrations routes: pause toggles active <-> paused, and a disabled subscription rejects pause", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const created = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/integrations/subscriptions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ label: "Endpoint", targetUrl: "https://example.com/hooks", topics: ["*"] }),
  });
  const { subscription } = (await created.json()) as { subscription: { id: string } };

  const paused = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/integrations/subscriptions/${subscription.id}/pause`,
    { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({}) }
  );
  assert.equal(paused.status, 200);
  assert.equal(((await paused.json()) as { subscription: { status: string } }).subscription.status, "paused");

  const resumed = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/integrations/subscriptions/${subscription.id}/pause`,
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ paused: false }),
    }
  );
  assert.equal(resumed.status, 200);
  assert.equal(((await resumed.json()) as { subscription: { status: string } }).subscription.status, "active");

  const deleted = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/integrations/subscriptions/${subscription.id}`,
    { method: "DELETE", headers: { cookie } }
  );
  assert.equal(deleted.status, 200);
  assert.equal(((await deleted.json()) as { subscription: { status: string } }).subscription.status, "disabled");

  const pauseAfterDelete = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/integrations/subscriptions/${subscription.id}/pause`,
    { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({}) }
  );
  assert.equal(pauseAfterDelete.status, 400);
});

test("integrations routes: pause/delete on an unknown subscription id returns 404", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const pause = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/integrations/subscriptions/missing/pause`,
    { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({}) }
  );
  assert.equal(pause.status, 404);

  const del = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/integrations/subscriptions/missing`,
    { method: "DELETE", headers: { cookie } }
  );
  assert.equal(del.status, 404);
});

test("integrations routes: list's lastDelivery picks the newest row by createdAt, not insertion order", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const created = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/integrations/subscriptions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ label: "Endpoint", targetUrl: "https://example.com/hooks", topics: ["*"] }),
  });
  const { subscription } = (await created.json()) as { subscription: { id: string } };

  // Insert out of chronological order — a repo/adapter is free to return rows in any order, so
  // the route (not insertion order) must be what decides "most recent" (adversarial ordering case).
  await deps.webhookDeliveryRepo.enqueue(
    makeDelivery({
      id: "delivery-mid",
      subscriptionId: subscription.id,
      createdAt: "2026-07-10T01:00:00.000Z",
      status: "delivered",
    })
  );
  await deps.webhookDeliveryRepo.enqueue(
    makeDelivery({
      id: "delivery-newest",
      subscriptionId: subscription.id,
      createdAt: "2026-07-10T03:00:00.000Z",
      status: "failed",
      lastResponseStatus: 500,
    })
  );
  await deps.webhookDeliveryRepo.enqueue(
    makeDelivery({
      id: "delivery-oldest",
      subscriptionId: subscription.id,
      createdAt: "2026-07-10T00:00:00.000Z",
      status: "delivered",
    })
  );

  const list = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/integrations/subscriptions`, {
    headers: { cookie },
  });
  const { subscriptions } = (await list.json()) as {
    subscriptions: Array<{ id: string; lastDelivery: { id: string; status: string } | null }>;
  };
  const row = subscriptions.find((s) => s.id === subscription.id);
  assert.ok(row);
  assert.equal(row?.lastDelivery?.id, "delivery-newest");
  assert.equal(row?.lastDelivery?.status, "failed");
});

test("integrations routes: deliveries endpoint returns the log newest-first and 404s for an unknown subscription", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const created = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/integrations/subscriptions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ label: "Endpoint", targetUrl: "https://example.com/hooks", topics: ["*"] }),
  });
  const { subscription } = (await created.json()) as { subscription: { id: string } };

  await deps.webhookDeliveryRepo.enqueue(
    makeDelivery({ id: "d-1", subscriptionId: subscription.id, createdAt: "2026-07-10T00:00:00.000Z" })
  );
  await deps.webhookDeliveryRepo.enqueue(
    makeDelivery({
      id: "d-2",
      subscriptionId: subscription.id,
      createdAt: "2026-07-10T02:00:00.000Z",
      status: "failed",
      lastResponseStatus: 502,
      lastError: "bad gateway",
    })
  );

  const res = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/integrations/subscriptions/${subscription.id}/deliveries`,
    { headers: { cookie } }
  );
  assert.equal(res.status, 200);
  const { deliveries } = (await res.json()) as { deliveries: Array<{ id: string; status: string }> };
  assert.deepEqual(
    deliveries.map((d) => d.id),
    ["d-2", "d-1"]
  );
  assert.equal(deliveries[0].status, "failed");

  const missing = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/integrations/subscriptions/missing/deliveries`,
    { headers: { cookie } }
  );
  assert.equal(missing.status, 404);
});

/**
 * Registers a principal with a login but no role/policy grants at all — `authorize()` returns
 * `no_grant` for any permission it's checked against (mirrors `identity-routes.test.ts`'s viewer
 * construction, minus the role assignment). Used to prove the denied side of
 * `admin.integrations.manage`.
 */
async function loginAsBarePrincipal(
  deps: ReturnType<typeof buildTestApp>["deps"],
  baseUrl: string
): Promise<string> {
  await deps.identityReady;
  const bareId = "bare-principal-integrations";
  await deps.principalRepo.save({
    id: bareId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: "No Grants",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId: bareId,
    workspaceId: deps.workspaceId,
    username: "bare-integrations",
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "bare-integrations", password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("integrations routes: SPEC-006 REQ-05 — a principal without admin.integrations.manage is denied 403 on every route, and a grant restores access", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const listDenied = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/integrations/subscriptions`, {
    headers: { cookie: bareCookie },
  });
  assert.equal(listDenied.status, 403);
  const listDeniedBody = (await listDenied.json()) as {
    code: string;
    details: { permission: string; reason: string };
  };
  assert.equal(listDeniedBody.code, "FORBIDDEN");
  assert.equal(listDeniedBody.details.permission, "admin.integrations.manage");
  assert.equal(listDeniedBody.details.reason, "no_grant");

  const createDenied = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/integrations/subscriptions`,
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie: bareCookie },
      body: JSON.stringify({ label: "Should not exist", targetUrl: "https://example.com/hooks", topics: ["*"] }),
    }
  );
  assert.equal(createDenied.status, 403);
  assert.equal(((await createDenied.json()) as { code: string }).code, "FORBIDDEN");

  // No subscription was created for the denied caller.
  const listAfterDenied = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/integrations/subscriptions`,
    { headers: { cookie: ownerCookie } }
  );
  const { subscriptions: subsAfterDenied } = (await listAfterDenied.json()) as { subscriptions: unknown[] };
  assert.equal(subsAfterDenied.length, 0, "the denied create must not have written a subscription");

  // The owner (wildcard '*') succeeds where the bare principal was denied.
  const createAllowed = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/integrations/subscriptions`,
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ label: "Owner Endpoint", targetUrl: "https://example.com/hooks", topics: ["*"] }),
    }
  );
  assert.equal(createAllowed.status, 201);
  const { subscription } = (await createAllowed.json()) as { subscription: { id: string } };

  const pauseDenied = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/integrations/subscriptions/${subscription.id}/pause`,
    { method: "POST", headers: { "content-type": "application/json", cookie: bareCookie }, body: JSON.stringify({}) }
  );
  assert.equal(pauseDenied.status, 403);

  const deliveriesDenied = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/integrations/subscriptions/${subscription.id}/deliveries`,
    { headers: { cookie: bareCookie } }
  );
  assert.equal(deliveriesDenied.status, 403);

  const deleteDenied = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/integrations/subscriptions/${subscription.id}`,
    { method: "DELETE", headers: { cookie: bareCookie } }
  );
  assert.equal(deleteDenied.status, 403);

  // The subscription is untouched by any of the denied mutation attempts.
  const stillActive = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/integrations/subscriptions`,
    { headers: { cookie: ownerCookie } }
  );
  const { subscriptions: stillActiveList } = (await stillActive.json()) as {
    subscriptions: Array<{ id: string; status: string }>;
  };
  const row = stillActiveList.find((s) => s.id === subscription.id);
  assert.equal(row?.status, "active", "the denied pause/delete attempts must not have applied");
});
