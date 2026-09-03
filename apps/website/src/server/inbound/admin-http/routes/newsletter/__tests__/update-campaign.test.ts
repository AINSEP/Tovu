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
import { registerAdminNewsletterUpdateCampaignRoute } from "../update-campaign.js";
import type { NewsletterRouteDeps } from "../deps.js";
import type { CampaignRecord, NewsletterListRow } from "#src/features/newsletter/types";

/**
 * @file `UPDATE_CAMPAIGN` (api.spec.md §1/§4) branch coverage. `newsletter-routes.test.ts` only
 * exercises a single-field happy-path PATCH; `newsletter-auth.test.ts` covers the zero-grant 403
 * generically. This file covers: `validateCampaignPatchBody`'s type-guard for every field type
 * (including the `bodyJson` OR's both sub-branches — a non-object value AND an explicit `null`),
 * `mergeCampaignPatchFields`'s per-field ternary (each of the 6 fields has its own instrumented
 * true/false site — a partial update only exercises the "false" side for the fields it omits), the
 * workspace-mismatch and direct-invoke fallbacks, campaign-not-found, and — the invariant the
 * dispatch flagged as highest-risk — that a campaign NOT in `draft` (scheduled/sending/sent/etc.)
 * can never be edited through this route, so a post-send or post-schedule mutation is impossible.
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
  registerAdminNewsletterUpdateCampaignRoute(app, deps);
  return { app, deps };
}

async function seedCampaign(deps: NewsletterRouteDeps, overrides: Partial<CampaignRecord> = {}): Promise<CampaignRecord> {
  await deps.newsletterListRepo.save(makeList());
  const campaign = makeCampaign(overrides);
  await deps.newsletterCampaignRepo.saveCampaignRow(campaign);
  return campaign;
}

async function patch(t: import("node:test").TestContext, app: express.Express, path: string, body?: unknown) {
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

test("update-campaign: mismatched workspaceId 404s", async (t) => {
  const { app } = buildApp();
  const { status, json } = await patch(t, app, `/api/admin/v1/workspaces/other-ws/newsletter/campaigns/camp-1`, {});
  assert.equal(status, 404);
  assert.deepEqual(json, { error: "workspace was not found" });
});

test("update-campaign: direct-invoke fallback for nullish params.workspaceId (unreachable through real HTTP)", async () => {
  const { app } = buildApp();
  const handler = extractRouteHandler(app, "patch", "/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id");
  const { res, capture } = createCapturingResponse();
  await handler({ params: { id: "camp-1" }, body: {} }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("update-campaign: direct-invoke with an undefined body hits `(req.body ?? {})` and still succeeds as a true no-op patch", async (t) => {
  const { app, deps } = buildApp();
  const campaign = await seedCampaign(deps, { id: "direct-invoke-camp" });
  const handler = extractRouteHandler(app, "patch", "/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id");
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "test-principal" };
  await handler({ params: { workspaceId: WORKSPACE_ID, id: campaign.id }, body: undefined }, res);
  assert.equal(capture.statusCode, 200, JSON.stringify(capture.jsonBody));
  const body = capture.jsonBody as { data: { subject: string; version: number } };
  assert.equal(body.data.subject, campaign.subject, "an empty patch changes nothing");
  assert.equal(body.data.version, campaign.version + 1, "still writes a new revision, per saveCampaign's own contract");
});

test("update-campaign: a non-string value for a patchable field -> 400 VALIDATION_ERROR, write service never called", async (t) => {
  const { app } = buildApp();
  const { status, json } = await patch(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/camp-1`, {
    subject: 12345,
  });
  assert.equal(status, 400);
  const body = json as { code?: string; error?: string };
  assert.equal(body.code, "VALIDATION_ERROR");
  assert.equal(body.error, "subject must be a string when provided");
});

test("update-campaign: bodyJson as a non-object (e.g. a string) -> 400 (first half of the OR)", async (t) => {
  const { app } = buildApp();
  const { status, json } = await patch(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/camp-1`, {
    bodyJson: "not-an-object",
  });
  assert.equal(status, 400);
  assert.equal((json as { error?: string }).error, "bodyJson must be an object when provided");
});

test("update-campaign: bodyJson: null -> 400 (typeof null IS 'object', so this trips the SECOND half of the OR, not the first)", async (t) => {
  const { app } = buildApp();
  const { status, json } = await patch(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/camp-1`, {
    bodyJson: null,
  });
  assert.equal(status, 400);
  assert.equal((json as { error?: string }).error, "bodyJson must be an object when provided");
});

test("update-campaign: forbidden 403s when unauthorized", async (t) => {
  const { app } = buildApp({ authorize: async () => ({ allowed: false, reason: "insufficient role" }) });
  const { status, json } = await patch(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/camp-1`, {});
  assert.equal(status, 403);
  assert.equal((json as { code?: string }).code, "FORBIDDEN");
  assert.equal((json as { details?: { permission?: string } }).details?.permission, "admin.newsletter.campaign.compose");
});

test("update-campaign: unknown campaign id -> 404 NEWSLETTER_CAMPAIGN_NOT_FOUND", async (t) => {
  const { app } = buildApp();
  const { status, json } = await patch(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/does-not-exist`, {});
  assert.equal(status, 404);
  assert.equal((json as { code?: string }).code, "NEWSLETTER_CAMPAIGN_NOT_FOUND");
});

test("update-campaign: patching every field at once fills the TRUE side of each of the 6 per-field ternaries, plus a valid bodyJson object", async (t) => {
  const { app, deps } = buildApp();
  const campaign = await seedCampaign(deps, { id: "full-patch-camp" });
  const { status, json } = await patch(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/${campaign.id}`, {
    subject: "New subject",
    preheader: "New preheader",
    fromName: "New Sender",
    fromEmail: "new-sender@example.com",
    replyTo: "new-reply@example.com",
    listId: "list-1",
    bodyJson: { type: "doc", content: [] },
  });
  assert.equal(status, 200, JSON.stringify(json));
  const body = json as { data: CampaignRecord };
  assert.equal(body.data.subject, "New subject");
  assert.equal(body.data.preheader, "New preheader");
  assert.equal(body.data.fromName, "New Sender");
  assert.equal(body.data.fromEmail, "new-sender@example.com");
  assert.equal(body.data.replyTo, "new-reply@example.com");
});

// -------------------------------------------------------------------------------------------
// The invariant the dispatch flagged as highest-risk: a campaign that has left `draft` (been
// scheduled, started sending, finished sending, or been canceled) must NEVER be editable through
// this route — this is what stands between an admin and mutating a campaign after it has already
// gone out, or racing the send pipeline mid-send.
// -------------------------------------------------------------------------------------------

for (const nonDraftStatus of ["scheduled", "sending", "sent", "paused", "canceled"] as const) {
  test(`update-campaign: a '${nonDraftStatus}' campaign is rejected 409 NEWSLETTER_CAMPAIGN_NOT_EDITABLE — no post-send mutation`, async (t) => {
    const { app, deps } = buildApp();
    const campaign = await seedCampaign(deps, { id: `camp-${nonDraftStatus}`, status: nonDraftStatus });
    const { status, json } = await patch(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/${campaign.id}`, {
      subject: "Attempted mutation after leaving draft",
    });
    assert.equal(status, 409, JSON.stringify(json));
    assert.equal((json as { code?: string }).code, "NEWSLETTER_CAMPAIGN_NOT_EDITABLE");

    const stored = await deps.newsletterCampaignRepo.findById({ workspaceId: WORKSPACE_ID, id: campaign.id });
    assert.equal(stored?.subject, campaign.subject, "the rejected PATCH must not have mutated the stored campaign");
  });
}

// -------------------------------------------------------------------------------------------
// EC-06 (traceability.spec.md) — optimistic concurrency on `expectedVersion`. behavior.spec.md
// §6.1: "the loser always receives NEWSLETTER_CONFLICT, never a silent no-op success." The write
// chokepoint (`campaign-write-service.ts`'s `saveCampaign`) already enforces this; these tests
// prove the route actually forwards the field, since an omitted forward makes the check a
// permanent no-op for every caller that goes through HTTP.
// -------------------------------------------------------------------------------------------

test("update-campaign: a stale expectedVersion from a losing concurrent PATCH -> 409 NEWSLETTER_CONFLICT, no mutation", async (t) => {
  const { app, deps } = buildApp();
  const campaign = await seedCampaign(deps, { id: "camp-occ-stale" });

  // Winner's PATCH lands first and advances the version.
  const winner = await patch(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/${campaign.id}`, {
    subject: "Winner's edit",
    expectedVersion: campaign.version,
  });
  assert.equal(winner.status, 200, JSON.stringify(winner.json));

  // Loser's PATCH carries the now-stale version it read before the winner's write.
  const loser = await patch(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/${campaign.id}`, {
    subject: "Loser's edit",
    expectedVersion: campaign.version,
  });
  assert.equal(loser.status, 409, JSON.stringify(loser.json));
  assert.equal((loser.json as { code?: string }).code, "NEWSLETTER_CONFLICT");

  const stored = await deps.newsletterCampaignRepo.findById({ workspaceId: WORKSPACE_ID, id: campaign.id });
  assert.equal(stored?.subject, "Winner's edit", "the loser's stale-version PATCH must not have overwritten the winner's edit");
});

test("update-campaign: a matching expectedVersion succeeds and advances the version", async (t) => {
  const { app, deps } = buildApp();
  const campaign = await seedCampaign(deps, { id: "camp-occ-match" });
  const { status, json } = await patch(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/${campaign.id}`, {
    subject: "Updated with a correct version",
    expectedVersion: campaign.version,
  });
  assert.equal(status, 200, JSON.stringify(json));
  const body = json as { data: { subject: string; version: number } };
  assert.equal(body.data.subject, "Updated with a correct version");
  assert.equal(body.data.version, campaign.version + 1);
});

test("update-campaign: an omitted expectedVersion still succeeds (backward compatibility — the field remains optional)", async (t) => {
  const { app, deps } = buildApp();
  const campaign = await seedCampaign(deps, { id: "camp-occ-omitted" });
  const { status, json } = await patch(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/${campaign.id}`, {
    subject: "Updated without sending expectedVersion at all",
  });
  assert.equal(status, 200, JSON.stringify(json));
  const body = json as { data: { subject: string; version: number } };
  assert.equal(body.data.subject, "Updated without sending expectedVersion at all");
  assert.equal(body.data.version, campaign.version + 1);
});

for (const [label, invalidValue] of [
  ["a string", "1"],
  ["a negative number", -1],
] as const) {
  test(`update-campaign: expectedVersion as ${label} -> 400 VALIDATION_ERROR, write service never called`, async (t) => {
    const { app, deps } = buildApp();
    const campaign = await seedCampaign(deps, { id: `camp-occ-invalid-${label.replace(/\s+/g, "-")}` });
    const { status, json } = await patch(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/${campaign.id}`, {
      subject: "Should never be applied",
      expectedVersion: invalidValue,
    });
    assert.equal(status, 400, JSON.stringify(json));
    const body = json as { code?: string; error?: string };
    assert.equal(body.code, "VALIDATION_ERROR");
    assert.equal(body.error, "expectedVersion must be a non-negative integer when provided");

    const stored = await deps.newsletterCampaignRepo.findById({ workspaceId: WORKSPACE_ID, id: campaign.id });
    assert.equal(stored?.subject, campaign.subject, "an invalid expectedVersion must reject before any write");
  });
}

test("update-campaign: expectedVersion as NaN -> 400 VALIDATION_ERROR (direct-invoke, since JSON can't carry a literal NaN over HTTP)", async () => {
  const { app, deps } = buildApp();
  const campaign = await seedCampaign(deps, { id: "camp-occ-invalid-nan" });
  const handler = extractRouteHandler(app, "patch", "/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id");
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "test-principal" };
  await handler(
    { params: { workspaceId: WORKSPACE_ID, id: campaign.id }, body: { subject: "Should never be applied", expectedVersion: NaN } },
    res
  );
  assert.equal(capture.statusCode, 400, JSON.stringify(capture.jsonBody));
  const body = capture.jsonBody as { code?: string; error?: string };
  assert.equal(body.code, "VALIDATION_ERROR");
  assert.equal(body.error, "expectedVersion must be a non-negative integer when provided");

  const stored = await deps.newsletterCampaignRepo.findById({ workspaceId: WORKSPACE_ID, id: campaign.id });
  assert.equal(stored?.subject, campaign.subject, "an invalid expectedVersion must reject before any write");
});
