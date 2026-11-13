import assert from "node:assert/strict";
import test from "node:test";

import { createCapturingResponse } from "#src/server/__tests__/helpers/http-test-server";
import { readRouteParam, rejectForeignWorkspace } from "../route-guards.js";

/**
 * @file Contract for the shared route preamble (dedupe plan, group RG1). ~190 admin/public route
 * files hand-rolled this exact 404; they now call this one helper, so its status and body are
 * locked here byte-for-byte against the inline block it replaces.
 */

test("rejectForeignWorkspace: own workspace returns false and writes nothing", () => {
  const { res, capture } = createCapturingResponse();
  assert.equal(rejectForeignWorkspace({ req: { params: { workspaceId: "ws-1" } }, res, workspaceId: "ws-1" }), false);
  assert.equal(capture.jsonBody, undefined);
  assert.equal(capture.statusCode, 200);
});

test("rejectForeignWorkspace: another workspace gets the inline block's exact 404", () => {
  const { res, capture } = createCapturingResponse();
  assert.equal(rejectForeignWorkspace({ req: { params: { workspaceId: "ws-2" } }, res, workspaceId: "ws-1" }), true);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("rejectForeignWorkspace: a missing param reads as '' (the `?? \"\"` guard), so it is foreign, never 'undefined'", () => {
  const { res, capture } = createCapturingResponse();
  assert.equal(rejectForeignWorkspace({ req: { params: {} }, res, workspaceId: "undefined" }), true);
  assert.equal(capture.statusCode, 404);
});

test("readRouteParam: returns the matched param, or '' when absent", () => {
  assert.equal(readRouteParam({ req: { params: { id: "abc" } }, name: "id" }), "abc");
  assert.equal(readRouteParam({ req: { params: {} }, name: "id" }), "");
});
