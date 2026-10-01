import assert from "node:assert/strict";
import test from "node:test";
import { readBoundedBody } from "../published-page.js";

test("readBoundedBody: exact cap is complete, one extra byte is truncated", async () => {
  assert.deepEqual(await readBoundedBody(new Response("abcde"), 5), {
    body: "abcde", bodyBytes: 5, truncated: false,
  });
  assert.deepEqual(await readBoundedBody(new Response("abcdef"), 5), {
    body: "abcde", bodyBytes: 5, truncated: true,
  });
});
