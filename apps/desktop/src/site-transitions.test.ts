/**
 * @file Coverage for `site-transitions.ts` — the store that makes `starting` and `stopping`
 * producible at all.
 *
 * Its whole contract is the `finally`: a mark that outlives its transition is worse than no mark,
 * because a card stuck on "Starting…" has a disabled button and no way back. So the failure arms
 * are tested as carefully as the success ones, and so is the identity rule that keeps one
 * transition's unwind from clearing a later one's mark.
 *
 * No `electron` import anywhere in the module, so this runs under plain `node --test`.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createSiteTransitions } from "./site-transitions.ts";

/** A promise plus the handles to settle it from the test — how every "while it is in flight" case
 *  below holds a transition open long enough to observe the mark. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("a site with nothing in flight reports no transition", () => {
  assert.equal(createSiteTransitions().get("/sites/a"), null);
});

test("the mark is readable WHILE the body runs — the whole point of the store", async () => {
  const transitions = createSiteTransitions();
  const gate = deferred<string>();

  const running = transitions.during("/sites/a", "starting", () => gate.promise);
  assert.equal(transitions.get("/sites/a"), "starting");

  gate.resolve("booted");
  assert.equal(await running, "booted");
});

test("during() resolves with the body's own value, not a wrapper", async () => {
  const transitions = createSiteTransitions();
  assert.deepEqual(await transitions.during("/sites/a", "stopping", async () => ({ port: 4000 })), { port: 4000 });
});

test("the mark is cleared once the body resolves", async () => {
  const transitions = createSiteTransitions();
  await transitions.during("/sites/a", "starting", async () => undefined);
  assert.equal(transitions.get("/sites/a"), null);
});

test("the mark is cleared when the body REJECTS — a failed start must not leave a card starting forever", async () => {
  const transitions = createSiteTransitions();
  await assert.rejects(
    transitions.during("/sites/a", "starting", async () => {
      throw new Error("tovu serve failed: PORT_IN_USE");
    }),
    /PORT_IN_USE/,
  );
  assert.equal(transitions.get("/sites/a"), null);
});

test("the rejection is re-thrown, not swallowed into a resolved promise", async () => {
  const transitions = createSiteTransitions();
  const thrown = new Error("boom");
  await assert.rejects(
    transitions.during("/sites/a", "stopping", () => Promise.reject(thrown)),
    (error: unknown) => {
      assert.equal(error, thrown, "the caller must receive the body's own error object");
      return true;
    },
  );
});

test("stopping and starting are reported as themselves, not as one 'busy'", async () => {
  const transitions = createSiteTransitions();
  const gate = deferred<void>();

  const running = transitions.during("/sites/a", "stopping", () => gate.promise);
  assert.equal(transitions.get("/sites/a"), "stopping");

  gate.resolve();
  await running;
});

test("one site's transition says nothing about another's", async () => {
  const transitions = createSiteTransitions();
  const gate = deferred<void>();

  const running = transitions.during("/sites/a", "starting", () => gate.promise);
  assert.equal(transitions.get("/sites/b"), null);

  gate.resolve();
  await running;
});

test("an earlier transition's unwind never clears a LATER one's mark for the same site", async () => {
  // `project-ipc.ts` serializes per site dir, so overlapping transitions should not happen. "Should
  // not happen" is not a reason for the store to corrupt if it ever does: a stuck `starting` has a
  // disabled button and no way out, and it would be blamed on the serializer rather than here.
  const transitions = createSiteTransitions();
  const first = deferred<void>();
  const second = deferred<void>();

  const firstRun = transitions.during("/sites/a", "starting", () => first.promise);
  const secondRun = transitions.during("/sites/a", "stopping", () => second.promise);
  assert.equal(transitions.get("/sites/a"), "stopping", "the later transition owns the mark");

  first.resolve();
  await firstRun;
  assert.equal(transitions.get("/sites/a"), "stopping", "the earlier unwind must leave the later mark alone");

  second.resolve();
  await secondRun;
  assert.equal(transitions.get("/sites/a"), null);
});

test("a site can transition again after a previous one finished", async () => {
  const transitions = createSiteTransitions();
  await transitions.during("/sites/a", "starting", async () => undefined);
  const gate = deferred<void>();
  const running = transitions.during("/sites/a", "stopping", () => gate.promise);
  assert.equal(transitions.get("/sites/a"), "stopping");
  gate.resolve();
  await running;
  assert.equal(transitions.get("/sites/a"), null);
});
