import assert from "node:assert/strict";
import test from "node:test";
import { createCliProbeCache } from "../cli-probe-cache.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("cold and repeated requests return immediately while one background probe runs", async () => {
  const next = deferred<string[]>();
  const started = deferred<void>();
  let calls = 0;
  const cache = createCliProbeCache({ initial: () => ["previous"], probe: () => {
    calls++; started.resolve(); return next.promise;
  } });
  assert.deepEqual(await cache.read({}), ["previous"]);
  await started.promise;
  assert.deepEqual(await cache.read({}), ["previous"]);
  assert.equal(calls, 1);
  next.resolve(["exact-model-v2"]);
  await cache.settled({});
  assert.deepEqual(await cache.read({}), ["exact-model-v2"]);
  assert.equal(calls, 1);
});

test("Rescan queues one forced refresh behind an in-flight probe and keeps the previous value", async () => {
  const first = deferred<string[]>();
  const started = deferred<void>();
  const forces: boolean[] = [];
  let active = 0;
  let peak = 0;
  const cache = createCliProbeCache({ initial: () => ["previous"], probe: async ({ force }) => {
    forces.push(force); peak = Math.max(peak, ++active); started.resolve();
    const result = forces.length === 1 ? await first.promise : ["rescanned"];
    active--; return result;
  } });
  await cache.read({});
  await started.promise;
  assert.deepEqual(await cache.read({ force: true }), ["previous"]);
  assert.deepEqual(await cache.read({ force: true }), ["previous"]);
  first.resolve(["first"]);
  await cache.settled({});
  assert.deepEqual(await cache.read({}), ["rescanned"]);
  assert.deepEqual(forces, [false, true]);
  assert.equal(peak, 1);
});

test("failed background probes retain the cache and require an explicit Rescan to retry", async () => {
  let calls = 0;
  const cache = createCliProbeCache({ initial: () => ["previous"], probe: async () => {
    if (++calls === 1) throw new Error("private stderr");
    return ["recovered"];
  } });
  await cache.read({}); await cache.settled({});
  assert.deepEqual(await cache.read({}), ["previous"]);
  assert.equal(calls, 1);
  await cache.read({ force: true }); await cache.settled({});
  assert.deepEqual(await cache.read({}), ["recovered"]);
});
