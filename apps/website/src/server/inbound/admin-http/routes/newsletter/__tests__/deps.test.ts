import assert from "node:assert/strict";
import test from "node:test";
import { toSendPipelineDeps, type NewsletterRouteDeps } from "../deps.js";

/** @file The send pipeline's production `sleep` port is a real timer wait (quota waits, review email#4). */

test("toSendPipelineDeps: sleep resolves after a real timer wait", async () => {
  const deps = toSendPipelineDeps({} as NewsletterRouteDeps);
  assert.ok(deps.sleep, "the production bundle always waits short quota hints inline");
  const started = performance.now();
  assert.equal(await deps.sleep(5), undefined);
  assert.ok(performance.now() - started >= 4);
});
