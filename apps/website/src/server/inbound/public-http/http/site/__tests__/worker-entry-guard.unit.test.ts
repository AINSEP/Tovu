import assert from "node:assert/strict";
import test from "node:test";

/**
 * @file The two theme worker entry scripts refuse to run anywhere but inside a `worker_threads`
 * Worker: loaded on the main thread (no `parentPort`), they must throw at import time rather than
 * render a theme in the server process — the very isolation the sandbox exists to provide.
 */

test("the Handlebars worker entry refuses to load on the main thread", async () => {
  await assert.rejects(import("../handlebars-worker.js"), { message: "handlebars-worker.ts must run inside a worker_threads Worker" });
});

test("the Liquid worker entry refuses to load on the main thread", async () => {
  await assert.rejects(import("../liquid-worker.js"), { message: "liquid-worker.ts must run inside a worker_threads Worker" });
});
