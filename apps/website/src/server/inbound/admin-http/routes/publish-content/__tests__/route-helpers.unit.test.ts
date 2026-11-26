import assert from "node:assert/strict";
import test from "node:test";

import { createCapturingResponse } from "#src/server/__tests__/helpers/http-test-server";
import { readRouteParam, rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";

import {
  acceptOverwriteEntityKeys,
  OVERWRITE_REFUSED,
} from "@jini-ai/cms/admin-http/routes/publish-content/peer-transport";

test("readRouteParam reads an absent or undefined param as an empty string, never the literal 'undefined'", () => {
  assert.equal(readRouteParam({ req: { params: {} }, name: "workspaceId" }), "");
  // Exercise an intentionally invalid request that Express would not normally supply.
  assert.equal(readRouteParam({ req: { params: { workspaceId: undefined as unknown as string } }, name: "workspaceId" }), "");
  assert.equal(readRouteParam({ req: { params: { peerId: "peer-1" } }, name: "peerId" }), "peer-1");
});

test("rejectForeignWorkspace sends the 404 for an absent workspace param", () => {
  const { res, capture } = createCapturingResponse();
  assert.equal(rejectForeignWorkspace({ req: { params: {} }, res, workspaceId: "ws" }), true);
  assert.deepEqual(capture, { statusCode: 404, jsonBody: { error: "workspace was not found" } });
});

test("rejectForeignWorkspace lets the matching workspace through without writing", () => {
  const { res, capture } = createCapturingResponse();
  assert.equal(rejectForeignWorkspace({ req: { params: { workspaceId: "ws" } }, res, workspaceId: "ws" }), false);
  assert.deepEqual(capture, { statusCode: 200, jsonBody: undefined });
});

const MALFORMED_TICKS_400 = { statusCode: 400, jsonBody: { error: "'overwriteEntityKeys' must be an array of strings", code: "VALIDATION_ERROR" } };
const allowAll = (_required: unknown, _optional = {}): boolean => true;

test("acceptOverwriteEntityKeys reads absent and null as 'force nothing' and sends nothing", () => {
  for (const raw of [undefined, null]) {
    const { res, capture } = createCapturingResponse();
    assert.equal(acceptOverwriteEntityKeys({ res, raw, mayOverwrite: allowAll }), null);
    assert.deepEqual(capture, { statusCode: 200, jsonBody: undefined });
  }
});

test("acceptOverwriteEntityKeys refuses a non-array, a non-string entry, and more than 1000 entries with the exact 400", () => {
  for (const raw of ["post:1", ["post:1", 2], Array.from({ length: 1001 }, (_, i) => `post:${i}`)]) {
    const { res, capture } = createCapturingResponse();
    assert.equal(acceptOverwriteEntityKeys({ res, raw, mayOverwrite: allowAll }), OVERWRITE_REFUSED);
    assert.deepEqual(capture, MALFORMED_TICKS_400);
  }
});

test("acceptOverwriteEntityKeys accepts exactly 1000 string entries", () => {
  const keys = Array.from({ length: 1000 }, (_, i) => `post:${i}`);
  const { res, capture } = createCapturingResponse();
  assert.deepEqual(acceptOverwriteEntityKeys({ res, raw: keys, mayOverwrite: allowAll }), keys);
  assert.deepEqual(capture, { statusCode: 200, jsonBody: undefined });
});

test("acceptOverwriteEntityKeys sends the exact 400 for malformed ticks and never asks the rule", () => {
  const { res, capture } = createCapturingResponse();
  let asked = false;
  const result = acceptOverwriteEntityKeys({ res, raw: "post:1", mayOverwrite: () => { asked = true; return true; } });
  assert.equal(result, OVERWRITE_REFUSED);
  assert.equal(asked, false);
  assert.deepEqual(capture, { statusCode: 400, jsonBody: { error: "'overwriteEntityKeys' must be an array of strings", code: "VALIDATION_ERROR" } });
});

test("acceptOverwriteEntityKeys answers OVERWRITE_REFUSED when the route's rule refuses", () => {
  const { res } = createCapturingResponse();
  assert.equal(acceptOverwriteEntityKeys({ res, raw: ["post:1"], mayOverwrite: () => false }), OVERWRITE_REFUSED);
});

test("acceptOverwriteEntityKeys passes the read ticks to the rule and returns them when allowed", () => {
  const { res } = createCapturingResponse();
  const seen: Array<readonly string[] | null> = [];
  assert.deepEqual(acceptOverwriteEntityKeys({ res, raw: ["post:1"], mayOverwrite: ({ overwriteEntityKeys }, _options = {}) => { seen.push(overwriteEntityKeys); return true; } }), ["post:1"]);
  assert.equal(acceptOverwriteEntityKeys({ res, raw: undefined, mayOverwrite: ({ overwriteEntityKeys }, _options = {}) => { seen.push(overwriteEntityKeys); return true; } }), null);
  assert.deepEqual(seen, [["post:1"], null]);
});
