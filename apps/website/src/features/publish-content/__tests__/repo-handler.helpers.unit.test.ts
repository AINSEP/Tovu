import assert from "node:assert/strict";
import test from "node:test";

import { gatewayDeps, okOrThrow } from "../repo-handler.js";
import type { PublishContentDeps } from "../type-registry.js";

/**
 * @file `repo-handler.ts`'s two exported helpers (Stryker lane L14: lines 139-150 had no test).
 * `gatewayDeps` must refuse loudly when ANY one of changeSets/authorize/outbox is missing, naming
 * the entity type, and pass all five through otherwise; `okOrThrow` unwraps or rethrows the SAME
 * error object.
 */

const FULL = { clock: { nowMs: () => 1 }, idGen: { newId: () => "i" }, changeSets: {}, authorize: async () => ({ allowed: true }), outbox: {} };

test("gatewayDeps returns exactly the five gateway deps when all are wired", () => {
  const deps = { ...FULL, workspaceId: "ws", extra: 1 } as unknown as PublishContentDeps;
  assert.deepEqual(Object.keys(gatewayDeps(deps, "post")).sort(), ["authorize", "changeSets", "clock", "idGen", "outbox"]);
  assert.equal(gatewayDeps(deps, "post").changeSets, FULL.changeSets);
});

test("gatewayDeps refuses when EACH of changeSets/authorize/outbox is missing, naming the entity type", () => {
  for (const missing of ["changeSets", "authorize", "outbox"] as const) {
    const deps = { ...FULL, [missing]: undefined } as unknown as PublishContentDeps;
    assert.throws(() => gatewayDeps(deps, "redirect"), (e: unknown) =>
      e instanceof Error && e.message.startsWith("publish-content: redirect.apply() requires PublishContentDeps.changeSets/authorize/outbox"), missing);
  }
});

test("okOrThrow unwraps a success and rethrows the very same error object on failure", () => {
  assert.equal(okOrThrow({ ok: true, value: 7 }), 7);
  assert.equal(okOrThrow({ ok: true, value: undefined }), undefined);
  const error = new RangeError("boom");
  assert.throws(() => okOrThrow({ ok: false, error }), (e: unknown) => e === error);
});
