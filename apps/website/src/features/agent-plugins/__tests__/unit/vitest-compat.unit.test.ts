import assert from "node:assert/strict";
import { AssertionError } from "node:assert";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, vi } from "../fixtures/vitest-compat.js";

/**
 * @file `../fixtures/vitest-compat.ts` must FAIL a wrong assertion, or every ported deploy-target case
 * running on it would be a green that proves nothing.
 */

test("the vitest compat matchers fail wrong assertions and pass right ones", async () => {
  assert.throws(() => expect(1).toBe(2), { constructor: AssertionError, name: "AssertionError", message: "expected 1 to be 2" });
  assert.throws(() => expect({ a: 1 }).toEqual({ a: 1, b: 2 }));
  assert.throws(() => expect({ a: 1, b: 2 }).toEqual({ a: 1 }));
  expect({ a: 1, b: 2 }).toMatchObject({ a: 1 });
  assert.throws(() => expect({ a: 1 }).toMatchObject({ a: 2 }), { constructor: AssertionError, name: "AssertionError", message: 'expected {"a":1} to match {"a":2}' });
  assert.throws(() => expect("abc").toMatch(/z/), { constructor: AssertionError, name: "AssertionError", message: 'expected "abc" to match /z/' });
  assert.throws(() => expect(vi.fn()).toHaveBeenCalled(), { constructor: AssertionError, name: "AssertionError", message: "expected the mock to have been called" });
  assert.throws(() => expect("x").not.toBe("x"), { constructor: AssertionError, name: "AssertionError", message: 'NOT: expected "x" to be "x"' });
  await assert.rejects(expect(Promise.resolve(1)).rejects.toThrow("x"));
  await assert.rejects(expect(Promise.reject(new Error("abc"))).rejects.toThrow("zzz"));
  await expect(Promise.reject(new Error("abc"))).rejects.toThrow("ab");
  assert.throws(() => (expect("s") as unknown as Record<string, () => void>).toFoo!(), /unsupported matcher 'toFoo'/);
  expect({ m: "hello world" }).toMatchObject({ m: expect.stringContaining("world") });
  assert.throws(() => expect({ m: "hello" }).toMatchObject({ m: expect.stringContaining("world") }), { constructor: AssertionError, name: "AssertionError", message: 'expected {"m":"hello"} to match {"m":{"description":"StringContaining \\"world\\""}}' });
});

test("compat mocks retain exact arguments, resolve configured values and clear calls", async () => {
  const fn = vi.fn().mockResolvedValue("resolved");
  assert.equal(await fn("first", { id: 2 }), "resolved");
  assert.equal(await fn("second"), "resolved");
  assert.deepEqual(fn.mock.calls, [["first", { id: 2 }], ["second"]]);
  expect(fn).toHaveBeenCalledTimes(2);
  assert.throws(() => expect(fn).toHaveBeenCalledTimes(1), { constructor: AssertionError, name: "AssertionError", message: "expected 2 calls to be 1" });
  fn.mockClear();
  assert.deepEqual(fn.mock.calls, []);
  assert.equal(await fn("third"), "resolved");
  assert.deepEqual(fn.mock.calls, [["third"]]);
});

test("compat timers fire at the deadline and globals restore to their original value", async () => {
  const original = globalThis.fetch;
  const replacement = async () => new Response("stubbed");
  vi.useFakeTimers();
  try {
    const fired: string[] = [];
    setTimeout(() => fired.push("deadline"), 100);
    await vi.advanceTimersByTimeAsync(99);
    assert.deepEqual(fired, []);
    await vi.advanceTimersByTimeAsync(1);
    assert.deepEqual(fired, ["deadline"]);
    vi.stubGlobal("fetch", replacement);
    vi.stubGlobal("fetch", async () => new Response("second stub"));
    vi.unstubAllGlobals();
    assert.equal(globalThis.fetch, original);
  } finally {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    globalThis.fetch = original;
  }
});

for (const brokenCleanup of [false, true]) test(`caught forbidden fetch still fails after every cleanup; broken cleanup=${brokenCleanup}`, () => {
  const compatUrl = new URL("../fixtures/vitest-compat.ts", import.meta.url).href;
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const root = mkdtempSync(path.join(tmpdir(), "tovu-network-guard-"));
  const childPath = path.join(root, "guard.test.mjs");
  try {
    writeFileSync(childPath, `
      import { after, afterEach, test } from 'node:test';
      import { writeFileSync } from 'node:fs';
      import { installNetworkGuard } from ${JSON.stringify(compatUrl)};
      import { onTeardown } from ${JSON.stringify(new URL("../../../../__tests__/fixtures/teardown.ts", import.meta.url).href)};
      installNetworkGuard();
      afterEach(t => writeFileSync(${JSON.stringify(path.join(root, "later-after-each"))} + t.name, "yes"));
      after(() => writeFileSync(${JSON.stringify(path.join(root, "cleaned"))}, "yes"));
      test('caught forbidden fetch', async t => {
        onTeardown({ t, step: () => writeFileSync(${JSON.stringify(path.join(root, "queued-cleanup"))}, "yes") });
        onTeardown({ t, step: () => { if (${brokenCleanup}) { writeFileSync(${JSON.stringify(path.join(root, "broken-cleanup-attempted"))}, "yes"); throw new Error('cleanup canary'); } } });
        await globalThis.fetch('https://guard.example.test/forbidden').catch(() => {});
      });
      test('clean following test', () => {});
    `);
    // These assertions inspect TAP; Node's default reporter can be spec instead.
    const run = spawnSync(process.execPath, ["--import", "tsx", "--test", "--test-reporter=tap", "--test-timeout=60000", "--test-concurrency=2", childPath], { encoding: "utf8", timeout: 60_000, env });
    assert.ifError(run.error);
    assert.equal(run.status, 1);
    if (brokenCleanup) {
      assert.match(run.stdout + run.stderr, /test teardown failed/);
      assert.equal(existsSync(path.join(root, "broken-cleanup-attempted")), true);
    } else {
      assert.match(run.stdout + run.stderr, /no test may reach the real network/);
      assert.match(run.stdout + run.stderr, /https:\/\/guard.example.test\/forbidden/);
    }
    // A guard failure must not skip the file's own cleanup (e.g. dialect-matrix's shared PGlite close).
    assert.equal(existsSync(path.join(root, "cleaned")), true, "file-level after hook must still run");
    assert.equal(existsSync(path.join(root, "later-after-eachcaught forbidden fetch")), true, "later afterEach must run before guard verification");
    assert.equal(existsSync(path.join(root, "later-after-eachclean following test")), true);
    assert.equal(existsSync(path.join(root, "queued-cleanup")), true, "queued cleanup must survive another cleanup failure");
    assert.match(run.stdout, /ok 2 - clean following test/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("compat value and error matchers accept the right value and reject the wrong one", () => {
  const cases: Array<[unknown, string, unknown[], unknown, string]> = [
    [new TypeError("bad"), "toBeInstanceOf", [TypeError], new Error("bad"), "expected {} to be an instance of TypeError"],
    [undefined, "toBeUndefined", [], null, "expected null to be undefined"],
    [null, "toBeNull", [], undefined, "expected undefined to be null"],
    ["present", "toBeDefined", [], undefined, "expected a defined value"],
    [["a", "b"], "toHaveLength", [2], ["a"], "expected length 1 to be 2"],
    [["a", "b"], "toContain", ["b"], ["a"], 'expected ["a"] to contain "b"'],
    [3, "toBeGreaterThan", [2], 2, "expected 2 to be greater than 2"],
    [{ key: "value" }, "toHaveProperty", ["key", "value"], { key: "wrong" }, 'expected {"key":"wrong"} to have property key'],
    [() => { throw new TypeError("bad"); }, "toThrow", [TypeError], () => { throw new Error("bad"); }, `expected thrown "bad" to match ${String(TypeError)}`],
  ];
  for (const [right, matcher, args, wrong, message] of cases) {
    expect(right)[matcher]!(...args);
    assert.throws(() => expect(wrong)[matcher]!(...args), { constructor: AssertionError, name: "AssertionError", message });
  }
});
