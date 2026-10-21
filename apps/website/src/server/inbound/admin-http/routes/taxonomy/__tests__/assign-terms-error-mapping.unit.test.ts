import assert from "node:assert/strict";
import test from "node:test";
import { portFake } from "#src/server/__tests__/helpers/port-fake";
import type { TaxonomyRouteDeps } from "../deps.js";
import express from "express";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { ContentTypeMismatchError, WorkspaceMismatchError } from "#src/features/taxonomy/index";
import { registerAdminTaxonomyAssignedTermsRoute } from "../assign-terms.js";

/**
 * The shared assign/unassign/assigned-terms error envelope, driven through the assigned-terms read
 * route with a hand-written `authorize` port that fails the way the validation chain or a broken
 * driver would. No database, no listener.
 */
async function readAssigned(authorize: () => Promise<never>) {
  const app = express();
  registerAdminTaxonomyAssignedTermsRoute(app, portFake<TaxonomyRouteDeps>({ workspaceId: "ws-1", authorize }));
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "principal-1" };
  await extractRouteHandler(app, "get", "/api/admin/v1/taxonomy/assigned-terms")({ params: {}, query: { contentType: "post", contentId: "p1" } }, res);
  return capture;
}

test("assigned-terms maps workspace and content-type mismatches to 400 VALIDATION_ERROR", async () => {
  for (const err of [
    new WorkspaceMismatchError({ message: "term/content workspace does not match the caller's workspace 'ws-1'" }),
    new ContentTypeMismatchError({ message: "supplied content type 'post' does not match the resolved row's own kind 'page'" }),
  ]) {
    assert.deepEqual(await readAssigned(async () => { throw err; }), { statusCode: 400, jsonBody: { error: err.message, code: "VALIDATION_ERROR" } });
  }
});

test("assigned-terms maps a non-Error failure to a generic 500 and an Error to its own message", async () => {
  assert.deepEqual(await readAssigned(async () => { throw "authz offline"; }), {
    statusCode: 500, jsonBody: { error: "internal error", code: "INTERNAL_ERROR" },
  });
  assert.deepEqual(await readAssigned(async () => { throw new Error("db closed"); }), {
    statusCode: 500, jsonBody: { error: "db closed", code: "INTERNAL_ERROR" },
  });
});
