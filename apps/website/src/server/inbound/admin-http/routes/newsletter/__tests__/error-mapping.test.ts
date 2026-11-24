import { assertAdminResponse } from "#src/server/inbound/admin-http/http/__tests__/assert-admin-response";
import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import {
  NewsletterCampaignNotEditableError, NewsletterCampaignNotFoundError, NewsletterConflictError,
  NewsletterDefaultListProtectedError, NewsletterForbiddenError, NewsletterLaunchGateBlockedError,
  NewsletterListNotFoundError, NewsletterSubscriberNotFoundError, NewsletterSubscriptionNotFoundError, NewsletterValidationError,
} from "#src/features/newsletter/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { registerAdminNewsletterListListsRoute } from "#src/server/runtime/composition/modules/newsletter";
import type { NewsletterRouteDeps } from "../deps.js";

/**
 * @file The typed-error -> HTTP contract of the admin newsletter routes, asserted at the wire. It
 * replaces `http/__tests__/newsletter-errors.test.ts`, which tested the deleted `http/newsletter.ts`
 * helper (`newsletterErrorToResponse` / `mapNewsletterErrorToResponse`) in isolation; the rule now lives
 * in `features/newsletter/http-error-responses.ts` and is applied by the Jini route specs, so it is
 * proven here through a real registrar: the list route's repo read throws, and the response is read.
 */

async function failWith(
  t: import("node:test").TestContext, thrown: unknown,
  { tracker }: { tracker?: { error: (...args: unknown[]) => void } } = {},
): Promise<{ status: number; json: unknown }> {
  const deps = {
    ...createRouteDeps(),
    authorize: async () => ({ allowed: true, reason: "matched" }),
    newsletterListRepo: { list: async () => { throw thrown; } },
  } as unknown as NewsletterRouteDeps;
  const app = express();
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    if (tracker) res.locals.adminFailureTracker = tracker;
    next();
  });
  registerAdminNewsletterListListsRoute({ app, deps });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/newsletter/lists`);
  return { status: res.status, json: await res.json() };
}

// F1.2/F4.1/F4.4: exact external status/code/details fixtures, never computed with a mapper.
// Mutation for each row: drop that class's mapping or any of its diagnostic details.
const cases = [
  { name: "validation", error: new NewsletterValidationError({ message: "bad subject", field: "subject", reason: "required" }), status: 400,
    body: { error: "bad subject", code: "NEWSLETTER_VALIDATION_ERROR", details: { field: "subject", reason: "required" } } },
  { name: "subscriber missing", error: new NewsletterSubscriberNotFoundError({ message: "member absent", subscriberId: "member-7" }), status: 400,
    body: { error: "member absent", code: "NEWSLETTER_SUBSCRIBER_NOT_FOUND", details: { subscriberId: "member-7" } } },
  { name: "campaign not editable", error: new NewsletterCampaignNotEditableError({ message: "already sent", currentStatus: "sent", attemptedAction: "update" }), status: 409,
    body: { error: "already sent", code: "NEWSLETTER_CAMPAIGN_NOT_EDITABLE", details: { currentStatus: "sent", attemptedAction: "update" } } },
  { name: "default list protected", error: new NewsletterDefaultListProtectedError({ message: "protected list", listId: "list-3" }), status: 409,
    body: { error: "protected list", code: "NEWSLETTER_DEFAULT_LIST_PROTECTED", details: { listId: "list-3" } } },
  { name: "version conflict", error: new NewsletterConflictError({ message: "stale campaign", entity: "campaign", id: "campaign-8", expectedVersion: 2, actualVersion: 5 }), status: 409,
    body: { error: "stale campaign", code: "NEWSLETTER_CONFLICT", details: { entity: "campaign", id: "campaign-8", expectedVersion: 2, actualVersion: 5 } } },
  { name: "launch gate", error: new NewsletterLaunchGateBlockedError({ message: "launch blocked", unmetPreconditions: ["mailer_adapter_not_production", "consent_not_ready"] }), status: 409,
    body: { error: "launch blocked", code: "NEWSLETTER_LAUNCH_GATE_BLOCKED", details: { unmetPreconditions: ["mailer_adapter_not_production", "consent_not_ready"] } } },
  { name: "campaign missing", error: new NewsletterCampaignNotFoundError("campaign absent"), status: 404,
    body: { error: "campaign absent", code: "NEWSLETTER_CAMPAIGN_NOT_FOUND" } },
  { name: "list missing", error: new NewsletterListNotFoundError("list absent"), status: 404,
    body: { error: "list absent", code: "NEWSLETTER_LIST_NOT_FOUND" } },
  { name: "subscription missing", error: new NewsletterSubscriptionNotFoundError("subscription absent"), status: 404,
    body: { error: "subscription absent", code: "NEWSLETTER_SUBSCRIPTION_NOT_FOUND" } },
  { name: "forbidden", error: new NewsletterForbiddenError("newsletter denied"), status: 403,
    body: { error: "newsletter denied", code: "FORBIDDEN" } },
];
for (const { name, error, status, body } of cases) {
  test(`newsletter ${name} maps to its exact HTTP contract`, async (t) => {
    const { status: actualStatus, json } = await failWith(t, error);
    assertAdminResponse({ actual: { status: actualStatus, body: json }, expected: { status, body } });
  });
}

test("unknown newsletter failures redact internal details, including non-Error throws", async (t) => {
  const failure = { message: "The newsletter operation could not be completed.", action: "Check the result before repeating this operation. Copy details and report this problem.", step: "newsletter operation" };
  for (const error of [new Error("secret /db/path"), { message: "secret", code: "NEWSLETTER_CONFLICT" }, null, "secret"]) {
    const { status, json } = await failWith(t, error);
    assertAdminResponse({ actual: { status, body: json }, expected: { status: 500, body: { error: "internal error", code: "INTERNAL_ERROR" } } }, { failure });
  }
});

// Replaces the `newsletter` row of `http/__tests__/unexpected-route-errors.test.ts` (it exercised the
// deleted `newsletterErrorToResponse` fallback directly): an unexpected failure is reported once to the
// log and the tracker under the same error ID the response carries, and the secret reaches none of them.
test("unknown newsletter failures are correlated in log and tracker without leaking details", async (t) => {
  const secret = "ghp_" + "x".repeat(36);
  const logs: unknown[][] = [], tracked: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  for (const error of [new Error(`private ${secret}`), `private ${secret}`, null]) {
    const { status, json } = await failWith(t, error, { tracker: { error: (...args: unknown[]) => { tracked.push(args); } } });
    const body = json as Record<string, unknown>;
    assert.equal(status, 500);
    assert.equal(body.code, "INTERNAL_ERROR");
    assert.match(String(body.errorId), /^ERR-(?:[0-9A-F]{4}-){3}[0-9A-F]{4}$/);
    assert.equal(JSON.stringify(body).includes(secret), false);
    assert.ok(JSON.stringify(logs.at(-1)).includes(String(body.errorId)));
    assert.ok(JSON.stringify(tracked.at(-1)).includes(String(body.errorId)));
  }
  assert.equal(JSON.stringify(logs).includes(secret), false);
  assert.equal(logs.length, 3);
  assert.equal(tracked.length, 3);
});
