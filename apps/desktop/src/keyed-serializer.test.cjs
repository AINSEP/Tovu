/**
 * @file Direct tests for `keyed-serializer.cjs`. No Electron, no real child process — pure promise
 * ordering, asserted against a controllable fake `fn`.
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const { createKeyedSerializer } = require("./keyed-serializer.cjs");

function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

test("run() resolves to fn's own return value", async () => {
  const { run } = createKeyedSerializer();
  const result = await run("site-a", () => Promise.resolve(42));
  assert.equal(result, 42);
});

test("two calls for the SAME key run strictly one after another, never overlapping", async () => {
  const { run } = createKeyedSerializer();
  const order = [];
  const first = deferred();

  const call1 = run("site-a", async () => {
    order.push("1-start");
    await first.promise;
    order.push("1-end");
  });
  const call2 = run("site-a", async () => {
    order.push("2-start");
  });

  // call2's body must not have run yet — call1 is still awaiting `first`.
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(order, ["1-start"]);

  first.resolve();
  await Promise.all([call1, call2]);
  assert.deepEqual(order, ["1-start", "1-end", "2-start"]);
});

test("calls for DIFFERENT keys are never serialized against each other", async () => {
  const { run } = createKeyedSerializer();
  const order = [];
  const blockA = deferred();

  const callA = run("site-a", async () => {
    order.push("a-start");
    await blockA.promise;
    order.push("a-end");
  });
  const callB = run("site-b", async () => {
    order.push("b-start");
    order.push("b-end");
  });

  await callB;
  assert.deepEqual(order, ["a-start", "b-start", "b-end"]);

  blockA.resolve();
  await callA;
  assert.deepEqual(order, ["a-start", "b-start", "b-end", "a-end"]);
});

test("a failed call does not block the next call queued behind it for the same key", async () => {
  const { run } = createKeyedSerializer();
  const order = [];

  const call1 = run("site-a", async () => {
    order.push("1");
    throw new Error("boom");
  });
  const call2 = run("site-a", async () => {
    order.push("2");
    return "ok";
  });

  await assert.rejects(call1, /boom/);
  assert.equal(await call2, "ok");
  assert.deepEqual(order, ["1", "2"]);
});
