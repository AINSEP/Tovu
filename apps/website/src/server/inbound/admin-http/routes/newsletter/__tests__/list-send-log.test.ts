import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import {
  createCapturingResponse,
  extractRouteHandler,
  startTestServer,
} from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminNewsletterListSendLogRoute } from "../list-send-log.js";
import type { NewsletterRouteDeps } from "../deps.js";
import type { CampaignRecord } from "#src/features/newsletter/types";

/**
 * @file `LIST_SEND_LOG` (api.spec.md §1) branch coverage. `newsletter-routes.test.ts` only
 * exercises the happy path for a campaign that exists in the caller's own workspace (empty send
 * log); `newsletter-auth.test.ts` covers the zero-grant 403 generically. This file covers the
 * workspace-mismatch 404 (both real HTTP and the direct-invoke nullish-param fallback) and the
 * campaign-not-found 404, none of which any existing test exercises for THIS route.
 */

const WORKSPACE_ID = "workspace-local";

function makeCampaign(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  const now = new Date().toISOString();
  return {
    id: "camp-1",
    workspaceId: WORKSPACE_ID,
    status: "draft",
    subject: "Summer Newsletter",
    preheader: "Check out what's new",
    fromName: "Acme",
    fromEmail: "newsletter@acme.test",
    replyTo: "help@acme.test",
    listId: "list-1",
    scheduledAt: null,
    sendStartedAt: null,
    audienceSnapshotId: null,
    counters: { recipients: 0, delivered: 0, failed: 0, bounced: 0, complained: 0, unsubscribed: 0 },
    version: 1,
    createdByPrincipal: "test-principal",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function buildApp(depsOverrides: Partial<NewsletterRouteDeps> = {}): { app: express.Express; deps: NewsletterRouteDeps } {
  const base = createRouteDeps();
  const deps = {
    ...base,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    ...depsOverrides,
  } as unknown as NewsletterRouteDeps;

  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminNewsletterListSendLogRoute(app, deps);
  return { app, deps };
}

test("list-send-log: mismatched workspaceId 404s", async (t) => {
  const { app } = buildApp();
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/other-ws/newsletter/campaigns/camp-1/sends`, {
    headers: {},
  });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "workspace was not found" });
});

test("list-send-log: direct-invoke fallback for nullish params.workspaceId (unreachable through real HTTP)", async () => {
  const { app } = buildApp();
  const handler = extractRouteHandler(app, "get", "/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id/sends");
  const { res, capture } = createCapturingResponse();
  await handler({ params: { id: "camp-1" } }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("list-send-log: forbidden 403s when unauthorized", async (t) => {
  const { app } = buildApp({ authorize: async () => ({ allowed: false, reason: "insufficient role" }) });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/camp-1/sends`);
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "admin.newsletter.subscriber.read");
});

test("list-send-log: unknown campaign id 404s with NEWSLETTER_CAMPAIGN_NOT_FOUND", async (t) => {
  const { app } = buildApp();
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/does-not-exist/sends`);
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "NEWSLETTER_CAMPAIGN_NOT_FOUND");
});

test("list-send-log: an existing campaign in the right workspace returns 200 with its send rows", async (t) => {
  const { app, deps } = buildApp();
  const campaign = makeCampaign();
  await deps.newsletterCampaignRepo.saveCampaignRow(campaign);

  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/${campaign.id}/sends`);
  assert.equal(res.status, 200, await res.clone().text());
  const body = (await res.json()) as { data: unknown[] };
  assert.deepEqual(body.data, []);
});
