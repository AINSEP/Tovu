import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { RouteRegistrar } from "#src/server/routes/types";
import { registerAdminNewsletterArchiveListRoute } from "../archive-list.js";
import { registerAdminNewsletterCreateCampaignRoute } from "../create-campaign.js";
import { registerAdminNewsletterCreateSubscriptionRoute } from "../create-subscription.js";
import { registerAdminNewsletterGetCampaignRoute } from "../get-campaign.js";
import { registerAdminNewsletterListCampaignsRoute } from "../list-campaigns.js";
import { registerAdminNewsletterListListsRoute } from "../list-lists.js";
import { registerAdminNewsletterListSubscriptionsRoute } from "../list-subscriptions.js";
import { registerAdminNewsletterRemoveSubscriptionRoute } from "../remove-subscription.js";
import { registerAdminNewsletterResendConfirmationRoute } from "../resend-confirmation.js";
import { registerAdminNewsletterSendCampaignRoute } from "../send-campaign.js";
import type { NewsletterRouteDeps } from "../deps.js";

/**
 * @file The three guards every admin newsletter route runs before touching the domain layer, asserted
 * once per route: a foreign `:workspaceId` is a 404, a denied `authorize()` is a 403 naming the
 * route's own permission (and nothing is read), and a failure after the gate (here: the
 * `newsletterReady` boot promise rejecting) is mapped to the generic 500 envelope rather than
 * escaping as an unhandled rejection. `newsletter-routes.test.ts` covers the happy paths end to end.
 */

const WORKSPACE_ID = "workspace-local";
const BASE = (workspaceId: string) => `/api/admin/v1/workspaces/${workspaceId}/newsletter`;

const VALID_CAMPAIGN_BODY = {
  subject: "Autumn",
  fromName: "Acme",
  fromEmail: "news@acme.test",
  replyTo: "help@acme.test",
  listId: "list-1",
  bodyJson: { type: "doc" },
};

interface RouteCase {
  name: string;
  register: RouteRegistrar;
  method: "GET" | "POST" | "DELETE";
  path: string;
  permission: string;
  body?: unknown;
}

const ROUTES: readonly RouteCase[] = [
  { name: "archive-list", register: registerAdminNewsletterArchiveListRoute, method: "POST", path: "/lists/list-1/archive", permission: "admin.newsletter.list.manage" },
  { name: "create-campaign", register: registerAdminNewsletterCreateCampaignRoute, method: "POST", path: "/campaigns", permission: "admin.newsletter.campaign.compose", body: VALID_CAMPAIGN_BODY },
  { name: "create-subscription", register: registerAdminNewsletterCreateSubscriptionRoute, method: "POST", path: "/lists/list-1/subscriptions", permission: "admin.newsletter.subscriber.manage", body: { subscriberId: "member-1" } },
  { name: "get-campaign", register: registerAdminNewsletterGetCampaignRoute, method: "GET", path: "/campaigns/camp-1", permission: "admin.newsletter.read" },
  { name: "list-campaigns", register: registerAdminNewsletterListCampaignsRoute, method: "GET", path: "/campaigns", permission: "admin.newsletter.read" },
  { name: "list-lists", register: registerAdminNewsletterListListsRoute, method: "GET", path: "/lists", permission: "admin.newsletter.read" },
  { name: "list-subscriptions", register: registerAdminNewsletterListSubscriptionsRoute, method: "GET", path: "/lists/list-1/subscriptions", permission: "admin.newsletter.subscriber.read" },
  { name: "remove-subscription", register: registerAdminNewsletterRemoveSubscriptionRoute, method: "DELETE", path: "/lists/list-1/subscriptions/sub-1", permission: "admin.newsletter.subscriber.manage" },
  { name: "resend-confirmation", register: registerAdminNewsletterResendConfirmationRoute, method: "POST", path: "/subscriptions/sub-1/resend-confirmation", permission: "admin.newsletter.subscriber.manage" },
  { name: "send-campaign", register: registerAdminNewsletterSendCampaignRoute, method: "POST", path: "/campaigns/camp-1/send", permission: "admin.newsletter.campaign.send" },
];

function buildApp(route: RouteCase, depsOverrides: Partial<NewsletterRouteDeps> = {}) {
  const deps = {
    ...createRouteDeps(),
    authorize: async () => ({ allowed: true, reason: "matched" }),
    ...depsOverrides,
  } as unknown as NewsletterRouteDeps;
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  route.register(app, deps);
  return app;
}

async function call(t: import("node:test").TestContext, app: express.Express, route: RouteCase, workspaceId: string) {
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${BASE(workspaceId)}${route.path}`, {
    method: route.method,
    headers: route.body === undefined ? {} : { "content-type": "application/json" },
    body: route.body === undefined ? undefined : JSON.stringify(route.body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

for (const route of ROUTES) {
  test(`${route.name}: a workspace id that is not this site's is 404 before authorize() is consulted`, async (t) => {
    let authorizeCalls = 0;
    const app = buildApp(route, {
      authorize: async () => {
        authorizeCalls += 1;
        return { allowed: true, reason: "matched" };
      },
    });
    const { status, json } = await call(t, app, route, "other-ws");
    assert.equal(status, 404);
    assert.deepEqual(json, { error: "workspace was not found" });
    assert.equal(authorizeCalls, 0);
  });

  test(`${route.name}: a denied authorize() is a 403 naming ${route.permission}, and the boot promise is never awaited`, async (t) => {
    const seen: string[] = [];
    let readyAwaited = false;
    const app = buildApp(route, {
      authorize: async (input: { permission: string }) => {
        seen.push(input.permission);
        return { allowed: false, reason: "no_grant" };
      },
      newsletterReady: {
        then(resolve: () => void) {
          readyAwaited = true;
          resolve();
        },
      } as unknown as Promise<void>,
    } as unknown as Partial<NewsletterRouteDeps>);
    const { status, json } = await call(t, app, route, WORKSPACE_ID);
    assert.equal(status, 403);
    assert.equal(json.code, "FORBIDDEN");
    assert.deepEqual(json.details, { permission: route.permission, reason: "no_grant" });
    assert.deepEqual(seen, [route.permission]);
    assert.equal(readyAwaited, false);
  });

  test(`${route.name}: a failure after the permission gate is the generic 500 INTERNAL_ERROR envelope`, async (t) => {
    const notReady = Promise.reject(new Error("newsletter tables failed to migrate"));
    notReady.catch(() => undefined);
    const app = buildApp(route, { newsletterReady: notReady });
    const { status, json } = await call(t, app, route, WORKSPACE_ID);
    assert.equal(status, 500);
    assert.deepEqual(json, { error: "internal error", code: "INTERNAL_ERROR" });
  });
}

/** A host that mounts these registrars without a JSON body parser leaves `req.body` undefined. */
function buildAppWithoutBodyParser(register: RouteRegistrar) {
  const deps = { ...createRouteDeps(), authorize: async () => ({ allowed: true, reason: "matched" }) } as unknown as NewsletterRouteDeps;
  const app = express();
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  register(app, deps);
  return app;
}

test("create-campaign: with no body parser mounted the missing body is a 400 VALIDATION_ERROR, not a 500", async (t) => {
  const baseUrl = await startTestServer(buildAppWithoutBodyParser(registerAdminNewsletterCreateCampaignRoute), t);
  const res = await fetch(`${baseUrl}${BASE(WORKSPACE_ID)}/campaigns`, { method: "POST" });
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { code: string }).code, "VALIDATION_ERROR");
});

test("create-subscription: with no body parser mounted the missing body is a 400 naming subscriberId, not a 500", async (t) => {
  const baseUrl = await startTestServer(buildAppWithoutBodyParser(registerAdminNewsletterCreateSubscriptionRoute), t);
  const res = await fetch(`${baseUrl}${BASE(WORKSPACE_ID)}/lists/list-1/subscriptions`, { method: "POST" });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "subscriberId is a required string", code: "VALIDATION_ERROR" });
});
