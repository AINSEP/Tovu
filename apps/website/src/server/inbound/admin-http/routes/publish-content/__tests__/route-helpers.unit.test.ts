import assert from "node:assert/strict";
import test from "node:test";

import { createCapturingResponse } from "#src/server/__tests__/helpers/http-test-server";

import {
  acceptOverwriteEntityKeys,
  INVALID_OVERWRITE_KEYS,
  OVERWRITE_REFUSED,
  readOverwriteEntityKeys,
  rejectForeignWorkspace,
  routeParam,
} from "../route-helpers.js";

test("routeParam reads an absent or null param as an empty string, never the literal 'undefined'/'null'", () => {
  assert.equal(routeParam({ params: {} }, "workspaceId"), "");
  assert.equal(routeParam({ params: { workspaceId: undefined } }, "workspaceId"), "");
  assert.equal(routeParam({ params: { peerId: "peer-1" } }, "peerId"), "peer-1");
});

test("rejectForeignWorkspace sends the 404 for an absent workspace param", () => {
  const { res, capture } = createCapturingResponse();
  assert.equal(rejectForeignWorkspace({ params: {} }, res, "ws"), true);
  assert.deepEqual(capture, { statusCode: 404, jsonBody: { error: "workspace was not found" } });
});

test("rejectForeignWorkspace lets the matching workspace through without writing", () => {
  const { res, capture } = createCapturingResponse();
  assert.equal(rejectForeignWorkspace({ params: { workspaceId: "ws" } }, res, "ws"), false);
  assert.deepEqual(capture, { statusCode: 200, jsonBody: undefined });
});

test("readOverwriteEntityKeys reads absent and null as 'force nothing'", () => {
  assert.equal(readOverwriteEntityKeys(undefined), null);
  assert.equal(readOverwriteEntityKeys(null), null);
});

test("readOverwriteEntityKeys refuses a non-array, a non-string entry, and more than 1000 entries", () => {
  assert.equal(readOverwriteEntityKeys("post:1"), INVALID_OVERWRITE_KEYS);
  assert.equal(readOverwriteEntityKeys(["post:1", 2]), INVALID_OVERWRITE_KEYS);
  assert.equal(readOverwriteEntityKeys(Array.from({ length: 1001 }, (_, i) => `post:${i}`)), INVALID_OVERWRITE_KEYS);
});

test("readOverwriteEntityKeys accepts exactly 1000 string entries", () => {
  const keys = Array.from({ length: 1000 }, (_, i) => `post:${i}`);
  assert.deepEqual(readOverwriteEntityKeys(keys), keys);
});

test("acceptOverwriteEntityKeys sends the exact 400 for malformed ticks and never asks the rule", () => {
  const { res, capture } = createCapturingResponse();
  let asked = false;
  const result = acceptOverwriteEntityKeys(res, "post:1", () => { asked = true; return true; });
  assert.equal(result, OVERWRITE_REFUSED);
  assert.equal(asked, false);
  assert.deepEqual(capture, { statusCode: 400, jsonBody: { error: "'overwriteEntityKeys' must be an array of strings", code: "VALIDATION_ERROR" } });
});

test("acceptOverwriteEntityKeys answers OVERWRITE_REFUSED when the route's rule refuses", () => {
  const { res } = createCapturingResponse();
  assert.equal(acceptOverwriteEntityKeys(res, ["post:1"], () => false), OVERWRITE_REFUSED);
});

test("acceptOverwriteEntityKeys passes the read ticks to the rule and returns them when allowed", () => {
  const { res } = createCapturingResponse();
  const seen: Array<readonly string[] | null> = [];
  assert.deepEqual(acceptOverwriteEntityKeys(res, ["post:1"], (_res, keys) => { seen.push(keys); return true; }), ["post:1"]);
  assert.equal(acceptOverwriteEntityKeys(res, undefined, (_res, keys) => { seen.push(keys); return true; }), null);
  assert.deepEqual(seen, [["post:1"], null]);
});
