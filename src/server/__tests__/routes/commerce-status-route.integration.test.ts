import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "../../app";
import { bootAuthenticated } from "../helpers/http-test-server";
import type { RouteDeps } from "../../routes/types";

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
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
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
  const deps: RouteDeps = { ...createRouteDeps() };
  const { baseUrl } = await bootAuthenticated(createApp(deps), t);

  const response = await fetch(statusUrl(baseUrl, deps.workspaceId));

  assert.equal(response.status, 401);
});

test("commerce status: rejects a workspace outside the composed tenant", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const response = await fetch(statusUrl(baseUrl, "other-workspace"), { headers: { cookie } });

  assert.equal(response.status, 404);
});

test("commerce status: requires the existing integration-management permission", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
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
  const deps: RouteDeps = { ...createRouteDeps() };
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
  const deps: RouteDeps = {
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
