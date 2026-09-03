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
import { registerAdminNewsletterScheduleCampaignRoute } from "../schedule-campaign.js";
import type { NewsletterRouteDeps } from "../deps.js";
import type { CampaignRecord, NewsletterListRow } from "#src/features/newsletter/types";

/**
 * @file `SCHEDULE_CAMPAIGN` (api.spec.md §1/§4) branch coverage. `newsletter-routes.test.ts` only
 * exercises the happy path with an EMPTY body (`scheduledAt` absent, defaulting to "now");
 * `newsletter-auth.test.ts` covers the zero-grant 403 generically. This file covers: the
 * workspace-mismatch 404 (real + direct-invoke nullish fallback), `isValidScheduledAt`'s full
 * matrix (absent / null / valid string / invalid type), `resolveScheduledAt` actually using a
 * caller-supplied string instead of always defaulting, the direct-invoke `(rawBody ?? {})`
 * fallback, campaign-not-found, and — the invariant that matters most here — that a campaign NOT
 * in `draft` can never be (re)scheduled (no double-schedule / no post-send reschedule).
 */

const WORKSPACE_ID = "workspace-local";

function makeList(overrides: Partial<NewsletterListRow> = {}): NewsletterListRow {
  const now = new Date().toISOString();
  return {
    id: "list-1",
    workspaceId: WORKSPACE_ID,
    name: "Fixture list",
    slug: "fixture-list",
    isDefault: false,
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

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
  registerAdminNewsletterScheduleCampaignRoute(app, deps);
  return { app, deps };
}

async function seedDraftCampaign(deps: NewsletterRouteDeps, overrides: Partial<CampaignRecord> = {}): Promise<CampaignRecord> {
  await deps.newsletterListRepo.save(makeList());
  const campaign = makeCampaign(overrides);
  await deps.newsletterCampaignRepo.saveCampaignRow(campaign);
  return campaign;
}

async function post(t: import("node:test").TestContext, app: express.Express, path: string, body?: unknown) {
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

test("schedule-campaign: mismatched workspaceId 404s", async (t) => {
  const { app } = buildApp();
  const { status, json } = await post(t, app, `/api/admin/v1/workspaces/other-ws/newsletter/campaigns/camp-1/schedule`, {});
  assert.equal(status, 404);
  assert.deepEqual(json, { error: "workspace was not found" });
});

test("schedule-campaign: direct-invoke fallback for nullish params.workspaceId (unreachable through real HTTP)", async () => {
  const { app } = buildApp();
  const handler = extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id/schedule");
  const { res, capture } = createCapturingResponse();
  await handler({ params: { id: "camp-1" }, body: {} }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("schedule-campaign: forbidden 403s when unauthorized", async (t) => {
  const { app } = buildApp({ authorize: async () => ({ allowed: false, reason: "insufficient role" }) });
  const { status, json } = await post(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/camp-1/schedule`, {});
  assert.equal(status, 403);
  assert.equal((json as { code?: string }).code, "FORBIDDEN");
  assert.equal((json as { details?: { permission?: string } }).details?.permission, "admin.newsletter.campaign.schedule");
});

test("schedule-campaign: scheduledAt of an invalid type (e.g. a number) -> 400 before authorize() even runs", async (t) => {
  const { app } = buildApp();
  const { status, json } = await post(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/camp-1/schedule`, {
    scheduledAt: 12345,
  });
  assert.equal(status, 400);
  assert.equal((json as { code?: string }).code, "NEWSLETTER_VALIDATION_ERROR");
});

test("schedule-campaign: scheduledAt: null is valid and defaults to now, same as omitted", async (t) => {
  const { app, deps } = buildApp();
  const campaign = await seedDraftCampaign(deps);
  const { status, json } = await post(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/${campaign.id}/schedule`, {
    scheduledAt: null,
  });
  assert.equal(status, 200, JSON.stringify(json));
  const body = json as { data: { status: string; scheduledAt: string | null } };
  assert.equal(body.data.status, "scheduled");
  assert.ok(body.data.scheduledAt);
});

test("schedule-campaign: a caller-supplied scheduledAt string is honored verbatim (not silently overridden with 'now')", async (t) => {
  const { app, deps } = buildApp();
  const campaign = await seedDraftCampaign(deps);
  const requested = "2030-01-01T00:00:00.000Z";
  const { status, json } = await post(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/${campaign.id}/schedule`, {
    scheduledAt: requested,
  });
  assert.equal(status, 200, JSON.stringify(json));
  const body = json as { data: { scheduledAt: string | null } };
  assert.equal(body.data.scheduledAt, requested);
});

test("schedule-campaign: unknown campaign id -> 404 NEWSLETTER_CAMPAIGN_NOT_FOUND", async (t) => {
  const { app } = buildApp();
  const { status, json } = await post(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/does-not-exist/schedule`, {});
  assert.equal(status, 404);
  assert.equal((json as { code?: string }).code, "NEWSLETTER_CAMPAIGN_NOT_FOUND");
});

test("schedule-campaign: a non-draft campaign (already scheduled) cannot be scheduled again -> 409, no double-schedule", async (t) => {
  const { app, deps } = buildApp();
  const campaign = await seedDraftCampaign(deps, { id: "already-scheduled", status: "scheduled", scheduledAt: new Date().toISOString() });
  const { status, json } = await post(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/${campaign.id}/schedule`, {});
  assert.equal(status, 409);
  assert.equal((json as { code?: string }).code, "NEWSLETTER_CAMPAIGN_NOT_EDITABLE");
});

test("schedule-campaign: an already-sent campaign cannot be scheduled -> 409, never silently re-sent", async (t) => {
  const { app, deps } = buildApp();
  const campaign = await seedDraftCampaign(deps, { id: "already-sent", status: "sent" });
  const { status, json } = await post(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/${campaign.id}/schedule`, {});
  assert.equal(status, 409);
  assert.equal((json as { code?: string }).code, "NEWSLETTER_CAMPAIGN_NOT_EDITABLE");
});

test("schedule-campaign: direct-invoke with an undefined body hits the `(rawBody ?? {})` branch and still succeeds (defaults to now)", async () => {
  const { app, deps } = buildApp();
  const campaign = await seedDraftCampaign(deps, { id: "direct-invoke-camp" });
  const handler = extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id/schedule");
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "test-principal" };
  await handler({ params: { workspaceId: WORKSPACE_ID, id: campaign.id }, body: undefined }, res);
  assert.equal(capture.statusCode, 200, JSON.stringify(capture.jsonBody));
});
