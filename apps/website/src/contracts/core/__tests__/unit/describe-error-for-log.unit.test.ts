import assert from "node:assert/strict";
import test from "node:test";

import { describeErrorForLog } from "../../model-facing-tool-errors.js";

/**
 * @file The website's positional `describeErrorForLog` must be callable directly inside a catch
 * block: a broken error object (throwing getter, revoked Proxy) must never replace the failure it
 * describes. Callers must not paste their own try/catch guard around it.
 */

test("describes class, code and direct cause without the message", () => {
  const err = new TypeError("password=hunter2", { cause: Object.assign(new Error("x"), { code: "ECONNREFUSED" }) });
  assert.equal(describeErrorForLog(err), "TypeError cause=Error(ECONNREFUSED)");
});

test("never throws for hostile getters or a revoked proxy", () => {
  const hostileCode = new Error("x");
  Object.defineProperty(hostileCode, "code", { get() { throw new Error("code getter"); } });
  assert.equal(describeErrorForLog(hostileCode), "[diagnostic unavailable]");

  const { proxy, revoke } = Proxy.revocable(new Error("x"), {});
  revoke();
  assert.equal(describeErrorForLog(proxy), "[diagnostic unavailable]");
});
