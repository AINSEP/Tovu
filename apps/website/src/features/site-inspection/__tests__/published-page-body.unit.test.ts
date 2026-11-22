import assert from "node:assert/strict";
import test from "node:test";
import { readBoundedBody } from "@jini-ai/diagnostics/web-evidence";

test("readBoundedBody: exact cap is complete, one extra byte is truncated", async () => {
  assert.deepEqual(await readBoundedBody({ response: new Response("abcde"), maxBytes: 5 }), {
    body: "abcde", bodyBytes: 5, truncated: false,
  });
  assert.deepEqual(await readBoundedBody({ response: new Response("abcdef"), maxBytes: 5 }), {
    body: "abcde", bodyBytes: 5, truncated: true,
  });
});
