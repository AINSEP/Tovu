import assert from "node:assert/strict";
import test from "node:test";

import {
  NewsletterCampaignNotEditableError, NewsletterCampaignNotFoundError, NewsletterConflictError,
  NewsletterDefaultListProtectedError, NewsletterForbiddenError, NewsletterLaunchGateBlockedError,
  NewsletterListNotFoundError, NewsletterSubscriberNotFoundError, NewsletterSubscriptionNotFoundError, NewsletterValidationError,
} from "#src/features/newsletter/index";
import { createCapturingResponse } from "#src/server/__tests__/helpers/http-test-server";
import { mapNewsletterErrorToResponse, newsletterErrorToResponse, toDataResponse } from "../newsletter.js";

// F1.2/F4.1/F4.4: exact external status/code/details fixtures, never computed with a mapper.
// Mutation for each row: drop that class's mapping or any of its diagnostic details.
const cases = [
  { name: "validation", error: new NewsletterValidationError("bad subject", "subject", "required"), status: 400,
    body: { error: "bad subject", code: "NEWSLETTER_VALIDATION_ERROR", details: { field: "subject", reason: "required" } } },
  { name: "subscriber missing", error: new NewsletterSubscriberNotFoundError("member absent", "member-7"), status: 400,
    body: { error: "member absent", code: "NEWSLETTER_SUBSCRIBER_NOT_FOUND", details: { subscriberId: "member-7" } } },
  { name: "campaign not editable", error: new NewsletterCampaignNotEditableError("already sent", "sent", "update"), status: 409,
    body: { error: "already sent", code: "NEWSLETTER_CAMPAIGN_NOT_EDITABLE", details: { currentStatus: "sent", attemptedAction: "update" } } },
  { name: "default list protected", error: new NewsletterDefaultListProtectedError("protected list", "list-3"), status: 409,
    body: { error: "protected list", code: "NEWSLETTER_DEFAULT_LIST_PROTECTED", details: { listId: "list-3" } } },
  { name: "version conflict", error: new NewsletterConflictError("stale campaign", "campaign", "campaign-8", 2, 5), status: 409,
    body: { error: "stale campaign", code: "NEWSLETTER_CONFLICT", details: { entity: "campaign", id: "campaign-8", expectedVersion: 2, actualVersion: 5 } } },
  { name: "launch gate", error: new NewsletterLaunchGateBlockedError("launch blocked", ["mailer_adapter_not_production", "consent_not_ready"]), status: 409,
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
  test(`newsletter ${name} maps to its exact HTTP contract`, () => {
    assert.deepEqual(newsletterErrorToResponse(error), { status, body });
    const { res, capture } = createCapturingResponse();
    mapNewsletterErrorToResponse(error, res);
    assert.deepEqual(capture, { statusCode: status, jsonBody: body });
  });
}

test("unknown newsletter failures redact internal details, including non-Error throws", () => {
  for (const error of [new Error("secret /db/path"), { message: "secret", code: "NEWSLETTER_CONFLICT" }, null, "secret"]) {
    assert.deepEqual(newsletterErrorToResponse(error), { status: 500, body: { error: "internal error", code: "INTERNAL_ERROR" } });
    const { res, capture } = createCapturingResponse();
    mapNewsletterErrorToResponse(error, res);
    assert.deepEqual(capture, { statusCode: 500, jsonBody: { error: "internal error", code: "INTERNAL_ERROR" } });
  }
});

test("newsletter data envelope retains all data values including false and null", () => {
  assert.deepEqual(toDataResponse({ id: "campaign-8", enabled: false, optional: null }), {
    data: { id: "campaign-8", enabled: false, optional: null },
  });
});
