import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mock, test } from "node:test";

/**
 * @file `createInMemoryApp` (design 02, owner decision 02-a): every call builds its own in-memory root
 * (default parameters were evaluated per call before the default was removed, so a memoized root would
 * be a silent change), and `optional.app` reaches `createApp` untouched. `./app.js` is wrapped with
 * recording fakes so the test sees which root each `createApp` call received.
 */

const real = await import("../app.js");
const roots: object[] = [];
const calls: Array<{ routeDeps: object; options: unknown }> = [];

mock.module("../app.js", { namedExports: {
  ...real,
  createRouteDeps: (...args: Parameters<typeof real.createRouteDeps>) => { const root = real.createRouteDeps(...args); roots.push(root); return root; },
  createApp: (routeDeps: object, options: unknown) => { calls.push({ routeDeps, options }); return real.createApp(routeDeps as never, options as never); },
} });

const { createInMemoryApp } = await import("../memory-route-deps.js");

test("createInMemoryApp builds a new root per call, never a shared one", () => {
  const first = createInMemoryApp();
  const second = createInMemoryApp();
  assert.notEqual(first, second);
  assert.equal(roots.length, 2);
  assert.notEqual(roots[0], roots[1]);
  assert.equal(calls[0]!.routeDeps, roots[0]);
  assert.equal(calls[1]!.routeDeps, roots[1]);
});

test("createInMemoryApp passes optional.app to createApp, and an empty options object when absent", () => {
  calls.length = 0;
  const onBootWork = () => undefined;
  createInMemoryApp({}, { app: { onBootWork } });
  assert.equal((calls[0]!.options as { onBootWork: unknown }).onBootWork, onBootWork);
  createInMemoryApp();
  assert.deepEqual(calls[1]!.options, {});
});

test("createInMemoryApp returns a working express app", () => {
  assert.equal(typeof createInMemoryApp(), "function");
});
