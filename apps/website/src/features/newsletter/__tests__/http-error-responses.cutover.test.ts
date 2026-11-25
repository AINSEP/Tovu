import assert from "node:assert/strict";
import test from "node:test";
import type { NewsletterErrorMapper } from "@jini-ai/cms/admin-http/http/newsletter";
import { newsletterErrorResponse } from "@jini-ai/user-management/newsletter/http-error-responses";
import { NewsletterConflictError } from "@jini-ai/user-management/newsletter/errors";

const mapper: NewsletterErrorMapper = newsletterErrorResponse;

test("host conflict keeps the flat 409 shape", () => {
  const err = new NewsletterConflictError({ message: "stale", entity: "campaign", id: "campaign", expectedVersion: 1, actualVersion: 2 });
  assert.deepEqual(mapper({ err }), { status: 409, body: { error: "stale", code: "NEWSLETTER_CONFLICT", details: { entity: "campaign", id: "campaign", expectedVersion: 1, actualVersion: 2 } } });
});

test("unknown failure is left to the route failure reporter", () => {
  assert.equal(mapper({ err: new Error("secret-token-fixture") }), undefined);
});
