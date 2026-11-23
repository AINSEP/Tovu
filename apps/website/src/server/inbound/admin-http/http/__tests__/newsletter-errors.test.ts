import { assertAdminResponse } from "#src/server/inbound/admin-http/http/__tests__/assert-admin-response";
import assert from "node:assert/strict";
import test from "node:test";

import {
  NewsletterCampaignNotEditableError, NewsletterCampaignNotFoundError, NewsletterConflictError,
  NewsletterDefaultListProtectedError, NewsletterForbiddenError, NewsletterLaunchGateBlockedError,
  NewsletterListNotFoundError, NewsletterSubscriberNotFoundError, NewsletterSubscriptionNotFoundError, NewsletterValidationError,
} from "@jini-ai/user-management/newsletter/errors";
import { createCapturingResponse } from "#src/server/__tests__/helpers/http-test-server";
import { mapNewsletterErrorToResponse, newsletterErrorToResponse, toDataResponse } from "../newsletter.js";

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
  test(`newsletter ${name} maps to its exact HTTP contract`, () => {
    assertAdminResponse({ actual: newsletterErrorToResponse({ err: error }), expected: { status, body } });
    const { res, capture } = createCapturingResponse();
    mapNewsletterErrorToResponse({ err: error, res });
    assertAdminResponse({ actual: capture, expected: { statusCode: status, jsonBody: body } });
  });
}

test("unknown newsletter failures redact internal details, including non-Error throws", () => {
  const failure = { message: "The newsletter operation could not be completed.", action: "Check the result before repeating this operation. Copy details and report this problem.", step: "newsletter operation" };
  for (const error of [new Error("secret /db/path"), { message: "secret", code: "NEWSLETTER_CONFLICT" }, null, "secret"]) {
    assertAdminResponse({ actual: newsletterErrorToResponse({ err: error }), expected: { status: 500, body: { error: "internal error", code: "INTERNAL_ERROR" } } }, { failure });
    const { res, capture } = createCapturingResponse();
    mapNewsletterErrorToResponse({ err: error, res });
    assertAdminResponse({ actual: capture, expected: { statusCode: 500, jsonBody: { error: "internal error", code: "INTERNAL_ERROR" } } }, { failure });
  }
});

test("newsletter data envelope retains all data values including false and null", () => {
  assert.deepEqual(toDataResponse({ data: { id: "campaign-8", enabled: false, optional: null } }), {
    data: { id: "campaign-8", enabled: false, optional: null },
  });
});
