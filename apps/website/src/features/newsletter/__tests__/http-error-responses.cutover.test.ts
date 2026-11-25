import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { registerAdminNewsletterListListsRoute } from "#src/server/runtime/composition/modules/newsletter";
import type { NewsletterRouteDeps } from "#src/server/inbound/admin-http/routes/newsletter/deps.js";
import type { NewsletterErrorMapper } from "@jini-ai/cms/admin-http/http/newsletter";
import {
  NewsletterCampaignNotEditableError,
  NewsletterConflictError,
  NewsletterForbiddenError,
  NewsletterValidationError,
} from "@jini-ai/user-management/newsletter/errors";
import { newsletterErrorResponse } from "@jini-ai/user-management/newsletter/http-error-responses";

/**
 * @file The Jini mapper as the host mounts it: `modules/newsletter.ts` passes `newsletterErrorResponse`
 * straight through as the route specs' `mapNewsletterError`. The wire fixtures here are spelled out, never
 * computed with the mapper, so they pin the shapes the admin UI reads.
 */

// Compile-time compatibility with the CMS route's injected port; no production adapter sits between them.
const mounted: NewsletterErrorMapper = newsletterErrorResponse;

test("a host-used version conflict keeps its flat 409 shape", () => {
  const error = new NewsletterConflictError({ message: "stale campaign", entity: "campaign", id: "campaign-8", expectedVersion: 2, actualVersion: 5 });
  assert.deepEqual(mounted({ err: error }), {
    status: 409,
    body: { error: "stale campaign", code: "NEWSLETTER_CONFLICT", details: { entity: "campaign", id: "campaign-8", expectedVersion: 2, actualVersion: 5 } },
  });
});

test("host-used validation, not-editable and forbidden errors keep their status and code", () => {
  assert.deepEqual(mounted({ err: new NewsletterValidationError({ message: "bad subject", field: "subject", reason: "required" }) }),
    { status: 400, body: { error: "bad subject", code: "NEWSLETTER_VALIDATION_ERROR", details: { field: "subject", reason: "required" } } });
  assert.deepEqual(mounted({ err: new NewsletterCampaignNotEditableError({ message: "already sent", currentStatus: "sent", attemptedAction: "update" }) }),
    { status: 409, body: { error: "already sent", code: "NEWSLETTER_CAMPAIGN_NOT_EDITABLE", details: { currentStatus: "sent", attemptedAction: "update" } } });
  assert.deepEqual(mounted({ err: new NewsletterForbiddenError("newsletter denied") }), { status: 403, body: { error: "newsletter denied", code: "FORBIDDEN" } });
});

test("unknown errors return undefined from the mapper", () => {
  assert.equal(mounted({ err: new Error("connect ECONNREFUSED secret-host:5432") }), undefined);
  assert.equal(mounted({ err: "a thrown string" }), undefined);
});

/** The same mapper as the mounted list route receives it: the route's repo read throws and the response is read. */
async function mountedFailure(t: import("node:test").TestContext, thrown: unknown, tracked: unknown[][]) {
  const deps = { ...createRouteDeps(), authorize: async () => ({ allowed: true, reason: "matched" }),
    newsletterListRepo: { list: async () => { throw thrown; } } } as unknown as NewsletterRouteDeps;
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "test-principal" }; res.locals.adminFailureTracker = { error: (...args: unknown[]) => { tracked.push(args); } }; next(); });
  registerAdminNewsletterListListsRoute({ app, deps });
  const res = await fetch(`${await startTestServer(app, t)}/api/admin/v1/workspaces/workspace-local/newsletter/lists`);
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

test("unknown failure is left to the route failure reporter", async (t) => {
  const secret = "ghp_" + "x".repeat(36);
  t.mock.method(console, "error", () => undefined);
  const tracked: unknown[][] = [];
  const { status, body } = await mountedFailure(t, new Error(`private ${secret}`), tracked);
  assert.equal(status, 500);
  assert.equal(body.code, "INTERNAL_ERROR");
  assert.equal(JSON.stringify(body).includes(secret), false);
  assert.equal(tracked.length, 1, "the route failure reporter, not the mapper, answered");
  const conflict = await mountedFailure(t, new NewsletterConflictError({ message: "stale", entity: "campaign", id: "c", expectedVersion: 1, actualVersion: 2 }), tracked);
  assert.deepEqual([conflict.status, conflict.body.code], [409, "NEWSLETTER_CONFLICT"]);
  assert.equal(tracked.length, 1, "a mapped error is never reported as a failure");
});
