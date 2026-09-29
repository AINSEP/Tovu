import assert from "node:assert/strict";
import { test } from "node:test";

import { expect, vi } from "../fixtures/vitest-compat.js";

/**
 * @file `../fixtures/vitest-compat.ts` must FAIL a wrong assertion, or every ported deploy-target case
 * running on it would be a green that proves nothing.
 */

test("the vitest compat matchers fail wrong assertions and pass right ones", async () => {
  assert.throws(() => expect(1).toBe(2));
  assert.throws(() => expect({ a: 1 }).toEqual({ a: 1, b: 2 }));
  assert.throws(() => expect({ a: 1, b: 2 }).toEqual({ a: 1 }));
  expect({ a: 1, b: 2 }).toMatchObject({ a: 1 });
  assert.throws(() => expect({ a: 1 }).toMatchObject({ a: 2 }));
  assert.throws(() => expect("abc").toMatch(/z/));
  assert.throws(() => expect(vi.fn()).toHaveBeenCalled());
  assert.throws(() => expect("x").not.toBe("x"));
  await assert.rejects(expect(Promise.resolve(1)).rejects.toThrow("x"));
  await assert.rejects(expect(Promise.reject(new Error("abc"))).rejects.toThrow("zzz"));
  await expect(Promise.reject(new Error("abc"))).rejects.toThrow("ab");
  assert.throws(() => (expect("s") as unknown as Record<string, () => void>).toFoo!(), /unsupported matcher 'toFoo'/);
  expect({ m: "hello world" }).toMatchObject({ m: expect.stringContaining("world") });
  assert.throws(() => expect({ m: "hello" }).toMatchObject({ m: expect.stringContaining("world") }));
});
