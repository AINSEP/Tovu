import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminNewsletterListCampaignsRoute } from "../list-campaigns.js";
import { registerAdminNewsletterListSubscriptionsRoute } from "../list-subscriptions.js";
import type { NewsletterRouteDeps } from "../deps.js";
import type { CampaignRecord, SubscriptionRow } from "#src/features/newsletter/types";

/**
 * @file Route-level tests for `LIST_CAMPAIGNS` and `LIST_SUBSCRIPTIONS`.
 *
 * `newsletter-routes.test.ts` only checks that a just-created row appears (`.some(...)`). Neither
 * the `?status=` filter on the campaigns list nor the `:listId` scoping of the subscriptions list
 * was asserted: a route that ignored either would still pass that suite.
 */

const WORKSPACE_ID = "workspace-local";
const BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter`;
const NOW = "2026-09-01T00:00:00.000Z";

function campaign(id: string, status: CampaignRecord["status"]): CampaignRecord {
  return {
    id,
    workspaceId: WORKSPACE_ID,
    status,
    subject: `Subject ${id}`,
    preheader: null,
    fromName: "Acme",
    fromEmail: "news@acme.test",
    replyTo: "help@acme.test",
    listId: "list-1",
    scheduledAt: null,
    sendStartedAt: null,
    audienceSnapshotId: null,
    counters: { recipients: 0, delivered: 0, failed: 0, bounced: 0, complained: 0, unsubscribed: 0 },
    version: 1,
    createdByPrincipal: "test-principal",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function subscription(id: string, listId: string): SubscriptionRow {
  return {
    id,
    workspaceId: WORKSPACE_ID,
    listId,
    subscriberId: `member-${id}`,
    status: "pending",
    source: "admin",
    consentRevisionIdAtSubscribe: null,
    subscribedAt: null,
    unsubscribedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

async function buildApp(): Promise<{ app: express.Express; deps: NewsletterRouteDeps; permissions: string[] }> {
  const base = createRouteDeps();
  const permissions: string[] = [];
  const deps = {
    ...base,
    authorize: async (input: { permission: string }) => {
      permissions.push(input.permission);
      return { allowed: true, reason: "matched" };
    },
  } as unknown as NewsletterRouteDeps;
  await deps.newsletterReady;

  const app = express();
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminNewsletterListCampaignsRoute(app, deps);
  registerAdminNewsletterListSubscriptionsRoute(app, deps);
  return { app, deps, permissions };
}

async function getIds(baseUrl: string, path: string): Promise<string[]> {
  const res = await fetch(`${baseUrl}${path}`);
  assert.equal(res.status, 200, path);
  const body = (await res.json()) as { data: Array<{ id: string }> };
  return body.data.map((row) => row.id).sort();
}

test("list-campaigns: ?status= returns only campaigns in that status; without it, every campaign", async (t) => {
  const { app, deps, permissions } = await buildApp();
  await deps.newsletterCampaignRepo.saveCampaignRow(campaign("c-draft", "draft"));
  await deps.newsletterCampaignRepo.saveCampaignRow(campaign("c-scheduled", "scheduled"));
  await deps.newsletterCampaignRepo.saveCampaignRow(campaign("c-canceled", "canceled"));
  const baseUrl = await startTestServer(app, t);

  assert.deepEqual(await getIds(baseUrl, `${BASE}/campaigns?status=scheduled`), ["c-scheduled"]);
  assert.deepEqual(await getIds(baseUrl, `${BASE}/campaigns?status=draft`), ["c-draft"]);
  assert.deepEqual(await getIds(baseUrl, `${BASE}/campaigns?status=sent`), []);
  assert.deepEqual(await getIds(baseUrl, `${BASE}/campaigns`), ["c-canceled", "c-draft", "c-scheduled"]);
  assert.ok(permissions.every((p) => p === "admin.newsletter.read"));
});

test("list-subscriptions: returns only the subscriptions of the list in the URL, gated by subscriber.read", async (t) => {
  const { app, deps, permissions } = await buildApp();
  await deps.newsletterSubscriptionRepo.save(subscription("s-a1", "list-a"));
  await deps.newsletterSubscriptionRepo.save(subscription("s-a2", "list-a"));
  await deps.newsletterSubscriptionRepo.save(subscription("s-b1", "list-b"));
  const baseUrl = await startTestServer(app, t);

  assert.deepEqual(await getIds(baseUrl, `${BASE}/lists/list-a/subscriptions`), ["s-a1", "s-a2"]);
  assert.deepEqual(await getIds(baseUrl, `${BASE}/lists/list-b/subscriptions`), ["s-b1"]);
  assert.deepEqual(await getIds(baseUrl, `${BASE}/lists/list-empty/subscriptions`), []);
  assert.deepEqual([...new Set(permissions)], ["admin.newsletter.subscriber.read"]);
});

test("list-campaigns + list-subscriptions: a workspace id that is not this site's is 404", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  for (const path of ["/campaigns", "/lists/list-a/subscriptions"]) {
    const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/other-ws/newsletter${path}`);
    assert.equal(res.status, 404, path);
    assert.deepEqual(await res.json(), { error: "workspace was not found" });
  }
});
