import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import { ADMIN_FAILURE_VOCABULARY } from "@tovu/contracts/admin-failure-copy";
import { assertAdminResponse } from "#src/server/inbound/admin-http/http/__tests__/assert-admin-response";
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import express from "express";

/**
 * @file rv1123i FIX 2: the hand-written SEO put-entry answered an unexpected failure with
 * `adminFailureResponse` and the operation alone (`routes/seo/put-entry`), never the request's
 * method/route. This file swaps in a vocabulary with an operation-keyed entry (`seo/put-entry`)
 * that only the operation tokens can match. The route tokens end in `:entryId`, so they never
 * match it. The moved route must still answer with that entry, as the legacy route did. This
 * proves the pinned copy is derived from the operation rather than hard-coded to today's text.
 *
 * Everything that reads the vocabulary is imported dynamically, after the mock is installed.
 */

const OPERATION_COPY = {
  message: "Operation-keyed SEO entry copy.",
  action: "Operation-keyed SEO entry action.",
  step: "Operation-keyed SEO entry step",
};
mock.module("@tovu/contracts/admin-failure-copy", {
  namedExports: {
    ADMIN_FAILURE_VOCABULARY: { ...ADMIN_FAILURE_VOCABULARY, operations: { ...ADMIN_FAILURE_VOCABULARY.operations, "seo/put-entry": OPERATION_COPY } },
  },
});
const { createRouteDeps } = await import("#src/server/runtime/composition/app");
const { registerAdminSeoPutEntryRoute } = await import("#src/server/runtime/composition/modules/seo");
const { dispatchJsonRequest } = await import("#src/server/__tests__/helpers/in-process-http");

test("seo put-entry: a principal-bearing unexpected failure answers the legacy operation-only copy, not the route-derived one", async (t) => {
  const deps = { ...createRouteDeps(), authorize: async () => ({ allowed: true, reason: "matched" }) };
  await deps.seoReady;
  let reached = false;
  t.mock.method(deps.postRepo, "saveIfVersion", async () => { reached = true; throw new Error("private repo failure"); });
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
  registerAdminSeoPutEntryRoute({ app, deps });

  const response = await dispatchJsonRequest(app, "PUT", "/api/admin/v1/workspaces/workspace-local/seo/entries/post-home", { title: "x" });

  assert.equal(reached, true, "the conditional write must be the failing operation");
  assertAdminResponse({ actual: response, expected: { status: 500, body: { error: "internal error", code: "INTERNAL_ERROR" } } }, { failure: OPERATION_COPY });
});
