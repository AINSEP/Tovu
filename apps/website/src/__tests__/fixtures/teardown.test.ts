import assert from "node:assert/strict";
import test from "node:test";

import { onTeardown } from "./teardown.js";

/**
 * @file Bug class (open-bugs 10-31): node:test stops running a context's `after` hooks at the first
 * one that throws, so one helper's failed rmSync/db close skipped a later helper's server close and
 * the file never exited. `nodeLikeHost` models that loop (lib/internal/test_runner/test.js runHook:
 * run in order, rethrow the first failure) so the throwing case runs without failing this file.
 */
function nodeLikeHost() {
  const hooks: Array<() => unknown> = [];
  return {
    after(fn: () => unknown) { hooks.push(fn); },
    async runHooks() { for (const hook of hooks) await hook(); },
  };
}

test("a throwing helper teardown no longer skips a later helper's server close", async () => {
  const host = nodeLikeHost();
  const closed: string[] = [];
  onTeardown({ t: host, step: () => closed.push("server") });
  onTeardown({ t: host, step: () => { throw new Error("rm failed"); } });
  onTeardown({ t: host, step: () => closed.push("db") });
  await assert.rejects(host.runHooks(), /rm failed/, "the teardown failure must still fail the test");
  assert.deepEqual(closed, ["db", "server"], "every queued step runs, last-registered first");
});

test("several teardown failures are all reported", async () => {
  const host = nodeLikeHost();
  onTeardown({ t: host, step: () => { throw new Error("first"); } });
  onTeardown({ t: host, step: () => { throw new Error("second"); } });
  await assert.rejects(host.runHooks(), (error: unknown) => {
    assert.ok(error instanceof AggregateError, "two failures arrive as one AggregateError");
    assert.deepEqual(error.errors.map((item: Error) => item.message), ["second", "first"], "both failures are kept");
    return true;
  });
});

test("a real test context runs queued steps in one hook when the subtest ends", async (t) => {
  const order: string[] = [];
  await t.test("helper user", (inner) => {
    onTeardown({ t: inner, step: () => { order.push("server"); } });
    onTeardown({ t: inner, step: () => { order.push("db"); } });
  });
  assert.deepEqual(order, ["db", "server"], "steps ran in last-registered-first order at subtest end");
});
