import assert from "node:assert/strict";
import test from "node:test";
import { MAX_UPLOAD_BATCH_BYTES, MAX_UPLOAD_BYTES } from "../upload-limits.js";

test("the shared upload limit is 50 MiB, and one chat message may carry two such files", () => {
  assert.equal(MAX_UPLOAD_BYTES, 50 * 1024 * 1024);
  assert.equal(MAX_UPLOAD_BATCH_BYTES, 2 * MAX_UPLOAD_BYTES);
});
