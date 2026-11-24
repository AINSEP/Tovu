import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import { ADMIN_FAILURE_VOCABULARY } from "@tovu/contracts/admin-failure-copy";
import { assertAdminResponse } from "#src/server/inbound/admin-http/http/__tests__/assert-admin-response";
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import express from "express";

/**
 * @file rv1123i FIX 2: the hand-written media update answered an unexpected failure with
 * `adminFailureResponse` and the operation alone (`routes/media/update`), never the request's
 * method/route. `sendAdminFailure` prefers the route, and with today's vocabulary both derivations
 * happen to produce the same "Save media item" copy, so a real-vocabulary test cannot tell them apart.
 * This file swaps in a vocabulary with an operation-keyed entry (`media/update`) that only the
 * operation tokens can match. The route tokens end in `:mediaId`, so they never match it. The
 * moved route must still answer with that entry, as the legacy route did.
 *
 * Everything that reads the vocabulary is imported dynamically, after the mock is installed.
 */

const OPERATION_COPY = {
  message: "Operation-keyed media update copy.",
  action: "Operation-keyed media update action.",
  step: "Operation-keyed media update step",
};
mock.module("@tovu/contracts/admin-failure-copy", {
  namedExports: {
    ADMIN_FAILURE_VOCABULARY: { ...ADMIN_FAILURE_VOCABULARY, operations: { ...ADMIN_FAILURE_VOCABULARY.operations, "media/update": OPERATION_COPY } },
  },
});
const { createRouteDeps } = await import("#src/server/runtime/composition/app");
const { registerAdminMediaUpdateRoute } = await import("#src/server/runtime/composition/modules/media");
const { dispatchJsonRequest } = await import("#src/server/__tests__/helpers/in-process-http");

test("media update: a principal-bearing unexpected failure answers the legacy operation-only copy, not the route-derived one", async (t) => {
  const deps = { ...createRouteDeps(), authorize: async () => ({ allowed: true, reason: "matched" }) };
  let reached = false;
  t.mock.method(deps.mediaRepo, "findById", async () => { reached = true; throw new Error("private repo failure"); });
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
  registerAdminMediaUpdateRoute({ app, deps });

  const response = await dispatchJsonRequest(app, "PATCH", "/api/admin/v1/workspaces/workspace-local/media/asset-1", { caption: "x" });

  assert.equal(reached, true, "the repository read must be the failing operation");
  assertAdminResponse({ actual: response, expected: { status: 500, body: { error: "internal error", code: "INTERNAL_ERROR" } } }, { failure: OPERATION_COPY });
});
