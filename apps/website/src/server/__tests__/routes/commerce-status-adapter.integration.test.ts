import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import { createApp as createBaseApp, createRouteDeps } from "../../runtime/composition/app.js";
import { bootAuthenticated, createCapturingResponse, extractRouteHandler } from "../helpers/http-test-server.js";
import type { RouteDeps } from "../../routes/types.js";
import express from "express";
import type { CommercePaymentRuntimePort } from "@jini-ai/commerce";
import { requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminCommerceStatusRoute } from "../../inbound/admin-http/routes/commerce/status.js";

type TestCommerceDeps = ReturnType<typeof createRouteDeps> & { lipay?: CommercePaymentRuntimePort & Record<string, unknown> };
/** Explicit test-only mounting preserves the future CMS authorization adapter. Production stays off. */
function createApp(deps: TestCommerceDeps): express.Express {
  const app = express();
  app.use("/api/admin/v1/workspaces", requireAdminSession(deps));
  registerAdminCommerceStatusRoute(app, deps);
  app.use(createBaseApp(deps));
  return app;
}

/**
 * @file ADR-001 authenticated Commerce operational-status route.
 *
 * This route is a read boundary only: it reports the optional payment runtime's provider catalog
 * and explicitly leaves every unimplemented Commerce capability unavailable.
 */

const statusUrl = (baseUrl: string, workspaceId: string): string =>
  `${baseUrl}/api/admin/v1/workspaces/${workspaceId}/commerce/status`;

async function loginAsBarePrincipal(deps: RouteDeps, baseUrl: string): Promise<string> {
  await deps.identityReady;
  const principalId = "bare-principal-commerce-status";
  await deps.principalRepo.save({
    id: principalId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: "No Commerce Grants",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId,
    workspaceId: deps.workspaceId,
    username: "bare-commerce-status",
    passwordHash: await deps.passwordHasher.hash({ password: "bare-pw" }),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "bare-commerce-status", password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("commerce status: requires an authenticated admin session", async (t) => {
  const deps: TestCommerceDeps = { ...createRouteDeps() };
  const { baseUrl } = await bootAuthenticated(createApp(deps), t);

  const response = await fetch(statusUrl(baseUrl, deps.workspaceId));

  assert.equal(response.status, 401);
});

test("commerce status: rejects a workspace outside the composed tenant", async (t) => {
  const deps: TestCommerceDeps = { ...createRouteDeps() };
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const response = await fetch(statusUrl(baseUrl, "other-workspace"), { headers: { cookie } });

  assert.equal(response.status, 404);
});

test("commerce status: requires the existing integration-management permission", async (t) => {
  const deps: TestCommerceDeps = { ...createRouteDeps() };
  const { baseUrl } = await bootAuthenticated(createApp(deps), t);
  const cookie = await loginAsBarePrincipal(deps, baseUrl);

  const response = await fetch(statusUrl(baseUrl, deps.workspaceId), { headers: { cookie } });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: `principal 'bare-principal-commerce-status' is not authorized for 'admin.integrations.manage' (no_grant)`,
    code: "FORBIDDEN",
    details: { permission: "admin.integrations.manage", reason: "no_grant" },
  });
});

test("commerce status: returns an unavailable snapshot when no payment runtime is composed", async (t) => {
  const deps: TestCommerceDeps = { ...createRouteDeps() };
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const response = await fetch(statusUrl(baseUrl, deps.workspaceId), { headers: { cookie } });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    contractVersion: 1,
    workspaceId: deps.workspaceId,
    paymentRuntime: {
      status: "unavailable",
      reason: "No payment runtime is composed for this workspace.",
    },
    providers: [],
    configuration: {
      status: "unavailable",
      schema: null,
      reason: "The payment runtime does not expose a provider configuration contract.",
    },
    capabilities: {
      providerDiscovery: "unavailable",
      checkout: "unavailable",
      subscriptions: "unavailable",
      webhookReconciliation: "unavailable",
      revenue: "unavailable",
    },
  });
});

test("commerce status: returns registered providers without claiming downstream capabilities", async (t) => {
  const deps: TestCommerceDeps = {
    ...createRouteDeps(),
    lipay: {
      listProviders: () => [
        {
          id: "regional-pay",
          displayName: "Regional Pay",
          capabilities: {
            refunds: "full",
            tokenization: false,
            recurring: false,
            confirmation: ["redirect"],
            currencies: "any",
            webhooks: true,
          },
        },
      ],
      charge: async () => {
        throw new Error("status reads must not move money");
      },
      refund: async () => {
        throw new Error("status reads must not move money");
      },
      handleWebhook: async () => {
        throw new Error("status reads must not process webhooks");
      },
      getPayment: () => {
        throw new Error("status reads must not invent payment metrics");
      },
      listPayments: () => {
        throw new Error("status reads must not invent payment metrics");
      },
    },
  };
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const response = await fetch(statusUrl(baseUrl, deps.workspaceId), { headers: { cookie } });
  const body = (await response.json()) as {
    paymentRuntime: { status: string };
    providers: unknown[];
    capabilities: Record<string, string>;
  };

  assert.equal(response.status, 200);
  assert.equal(body.paymentRuntime.status, "available");
  assert.equal(body.providers.length, 1);
  assert.deepEqual(body.capabilities, {
    providerDiscovery: "available",
    checkout: "unavailable",
    subscriptions: "unavailable",
    webhookReconciliation: "unavailable",
    revenue: "unavailable",
  });
});

test("commerce status: a payment-runtime failure is a fixed 500 that never echoes the adapter's message", async (t) => {
  const leak = ["sk", "live", "adapter-secret"].join("_");
  const explode = (): never => {
    throw new Error(`provider catalog unavailable: ${leak}`);
  };
  const deps: TestCommerceDeps = {
    ...createRouteDeps(),
    lipay: {
      listProviders: explode,
      charge: async () => explode(),
      refund: async () => explode(),
      handleWebhook: async () => explode(),
      getPayment: explode,
      listPayments: explode,
    },
  };
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const response = await fetch(statusUrl(baseUrl, deps.workspaceId), { headers: { cookie } });
  const raw = await response.text();
  assert.equal(response.status, 500);
  assert.deepEqual(JSON.parse(raw), { error: "internal error", code: "INTERNAL_ERROR" });
  assert.equal(raw.includes(leak), false);
});

/**
 * `String(req.params.workspaceId ?? "")` (extractRouteHandler's own doc, `helpers/http-test-server.ts`):
 * Express guarantees a matched `:workspaceId` is always populated, so the right side of that `??` is
 * unreachable through any real HTTP request. Restored 2026-09-03 after being wrongly deleted as
 * "unreachable dead code" -- the repo's established answer is to KEEP the guard and exercise it with a
 * hand-built `req` that deliberately violates that contract.
 */
test("commerce status: `req.params.workspaceId ?? \"\"` fallback, forced via a direct handler call, is the workspace 404 before authorize()", async () => {
  const authorizations: unknown[] = [];
  const base = createRouteDeps();
  const deps: TestCommerceDeps = { ...base, authorize: async (params) => { authorizations.push(params); return base.authorize(params); } };
  const handler = extractRouteHandler(createApp(deps), "get", "/api/admin/v1/workspaces/:workspaceId/commerce/status");
  const { res, capture } = createCapturingResponse();

  await handler({ params: {}, query: {} }, res);

  assert.deepEqual(capture, { statusCode: 404, jsonBody: { error: "workspace was not found" } });
  assert.deepEqual(authorizations, []);
});
