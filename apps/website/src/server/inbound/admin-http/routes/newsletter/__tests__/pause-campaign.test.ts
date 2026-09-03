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
import { registerAdminNewsletterPauseCampaignRoute } from "../pause-campaign.js";
import type { NewsletterRouteDeps } from "../deps.js";
import type { CampaignRecord } from "#src/features/newsletter/index";

const WORKSPACE_ID = "workspace-local";

function makeCampaign(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  const now = new Date().toISOString();
  return {
    id: "camp-1",
    workspaceId: WORKSPACE_ID,
    status: "sending",
    subject: "Summer Newsletter",
    preheader: "Check out what's new",
    fromName: "Acme",
    fromEmail: "newsletter@acme.test",
    replyTo: "help@acme.test",
    listId: "list-1",
    scheduledAt: now,
    sendStartedAt: now,
    audienceSnapshotId: "snap-1",
    counters: { recipients: 10, delivered: 0, failed: 0, bounced: 0, complained: 0, unsubscribed: 0 },
    version: 1,
    createdByPrincipal: "test-principal",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function buildApp(depsOverrides: Partial<NewsletterRouteDeps> = {}): {
  app: express.Express;
  deps: NewsletterRouteDeps;
} {
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
  registerAdminNewsletterPauseCampaignRoute(app, deps);
  return { app, deps };
}

async function post(t: import("node:test").TestContext, app: express.Express, path: string) {
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${path}`, { method: "POST" });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

test("pause-campaign: mismatched workspaceId 404s", async (t) => {
  const { app } = buildApp();
  const { status, json } = await post(
    t,
    app,
    `/api/admin/v1/workspaces/other-ws/newsletter/campaigns/camp-1/pause`
  );
  assert.equal(status, 404);
  assert.deepEqual(json, { error: "workspace was not found" });
});

test("pause-campaign: forbidden 403s when unauthorized", async (t) => {
  const { app } = buildApp({
    authorize: async () => ({ allowed: false, reason: "insufficient role" }),
  });
  const { status, json } = await post(
    t,
    app,
    `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/camp-1/pause`
  );
  assert.equal(status, 403);
  assert.equal((json as { code?: string }).code, "FORBIDDEN");
  assert.equal((json as { details?: { reason?: string } }).details?.reason, "insufficient role");
});

test("pause-campaign: successful pause transitions sending campaign to paused", async (t) => {
  const { app, deps } = buildApp();
  const campaign = makeCampaign({ status: "sending" });
  await deps.newsletterCampaignRepo.saveCampaignRow(campaign);

  const { status, json } = await post(
    t,
    app,
    `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/${campaign.id}/pause`
  );
  assert.equal(status, 200);
  const body = json as { data?: CampaignRecord };
  assert.equal(body.data?.id, campaign.id);
  assert.equal(body.data?.status, "paused");

  const stored = await deps.newsletterCampaignRepo.findById({
    workspaceId: WORKSPACE_ID,
    id: campaign.id,
  });
  assert.equal(stored?.status, "paused");
});

test("pause-campaign: not found campaign returns 404", async (t) => {
  const { app } = buildApp();
  const { status, json } = await post(
    t,
    app,
    `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/non-existent/pause`
  );
  assert.equal(status, 404);
  assert.equal((json as { code?: string }).code, "NEWSLETTER_CAMPAIGN_NOT_FOUND");
});

test("pause-campaign: invalid state transition returns 409 conflict", async (t) => {
  const { app, deps } = buildApp();
  const campaign = makeCampaign({ id: "draft-camp", status: "draft" });
  await deps.newsletterCampaignRepo.saveCampaignRow(campaign);

  const { status, json } = await post(
    t,
    app,
    `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/${campaign.id}/pause`
  );
  assert.equal(status, 409);
  assert.equal((json as { code?: string }).code, "NEWSLETTER_CAMPAIGN_NOT_EDITABLE");
});

test("pause-campaign: generic unexpected error maps to 500", async (t) => {
  const { app, deps } = buildApp();
  deps.newsletterCampaignRepo.transaction = async () => {
    throw new Error("unexpected db explosion");
  };

  const { status, json } = await post(
    t,
    app,
    `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/camp-1/pause`
  );
  assert.equal(status, 500);
  assert.deepEqual(json, { error: "internal error", code: "INTERNAL_ERROR" });
});

test("pause-campaign: undefined workspaceId fallback via direct handler invocation", async () => {
  const { app } = buildApp();
  const handler = extractRouteHandler(
    app,
    "post",
    "/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id/pause"
  );

  const { res, capture } = createCapturingResponse();
  const req = { params: { workspaceId: undefined, id: "camp-1" } } as unknown as Parameters<typeof handler>[0];
  await handler(req, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});
