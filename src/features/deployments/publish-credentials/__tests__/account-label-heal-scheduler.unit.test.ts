import assert from "node:assert/strict";
import test from "node:test";

import { createAccountLabelHealScheduler, idsNeedingAccountLabelHeal } from "../account-label-heal-scheduler.js";
import type { PublishCredentialSummary } from "../types.js";

/**
 * @file Regression coverage for the owner-reported bug: an existing `publish_credential_sets` row
 * saved before its first auto-verify ever succeeded (or predating the verify/heal wiring entirely)
 * stays `account_label: null` forever unless a human clicks the per-row "Verify" action — the
 * assistant then has no account to default a github-pages publish's `owner` to, and refuses rather
 * than guess (the correct behavior, per `publish-agent-tools.ts`'s own doc, but not what a
 * non-technical owner expects to have to fix by hand).
 *
 * This module is the fix: `server/routes/admin/system/publish-credentials.ts`'s GET (list) handler —
 * the ONE human-gated, non-agent-reachable read for this table (`static-publish/verify.ts`'s own
 * header: only a human-gated caller may ever trigger a provider probe, never the agent's capabilities
 * tool, which reads this same table via `listPublishCredentials` directly) — calls
 * {@link idsNeedingAccountLabelHeal} to find every currently-null, healable-provider row, then
 * {@link AccountLabelHealScheduler.triggerFor} to heal each one in the background, non-blocking.
 *
 * `createAccountLabelHealScheduler`'s own tests are the load-bearing half of this coverage: the
 * scheduler sits directly behind `res.status(200).json(...)` in a route `server/routes/admin/system/
 * publish-credentials.ts` commit `62ca21c7` (same night) just finished hardening against exactly this
 * failure mode — an async handler whose background work rejects unguarded takes down the WHOLE server
 * process (Express 4 does not catch an async handler's own rejection). Every test below that exercises
 * a REJECTING `heal` also asserts no `unhandledRejection` fires, not just that `onHealError` was
 * called — the callback firing proves the happy path; the missing process event proves the guard.
 */

function summary(overrides: Partial<PublishCredentialSummary> & Pick<PublishCredentialSummary, "id" | "providerId" | "accountLabel">): PublishCredentialSummary {
  return {
    label: "a token",
    configured: true,
    isDefault: false,
    createdAt: "2026-08-16T00:00:00.000Z",
    updatedAt: "2026-08-16T00:00:00.000Z",
    ...overrides,
  };
}

/** Node's event loop runs all pending microtasks (promise `.then`/`.catch`/`.finally` chains) before
 *  any macrotask — `setImmediate` is a macrotask, so awaiting one guarantees every microtask queued so
 *  far (including a fire-and-forget `heal` promise's own settle-then-`.finally()` chain) has already
 *  run. A bare `await Promise.resolve()` only guarantees ONE microtask tick, which is not enough for a
 *  `.catch().finally()` chain (two extra ticks) — this is the same "microtask assumptions are fragile,
 *  prefer a macrotask flush" lesson this codebase's own fetch-query migration notes ran into. */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

test("idsNeedingAccountLabelHeal — selects only null-labeled rows on a healable provider", () => {
  const rows: PublishCredentialSummary[] = [
    summary({ id: "1", providerId: "github-pages", accountLabel: null }),
    summary({ id: "2", providerId: "github-pages", accountLabel: "octocat" }), // already healed
    summary({ id: "3", providerId: "netlify", accountLabel: null }), // never yields a label
  ];
  const canYield = (providerId: string) => providerId === "github-pages";

  assert.deepEqual(idsNeedingAccountLabelHeal(rows, canYield), ["1"]);
});

test("idsNeedingAccountLabelHeal — empty input, empty output (no false-positive candidates)", () => {
  assert.deepEqual(idsNeedingAccountLabelHeal([], () => true), []);
});

test("createAccountLabelHealScheduler — calls heal exactly once per new id", () => {
  const calls: string[] = [];
  const scheduler = createAccountLabelHealScheduler({ heal: async (id) => void calls.push(id) });

  scheduler.triggerFor(["a", "b"]);

  assert.deepEqual(calls, ["a", "b"]);
});

test("createAccountLabelHealScheduler — does not re-trigger a heal already in flight", async () => {
  let callCount = 0;
  let releaseFirst!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const scheduler = createAccountLabelHealScheduler({
    heal: async () => {
      callCount += 1;
      await gate;
    },
  });

  scheduler.triggerFor(["a"]);
  scheduler.triggerFor(["a"]); // still in flight — must be skipped, not queued or re-called

  assert.equal(callCount, 1);
  releaseFirst();
  await flush();
});

test("createAccountLabelHealScheduler — re-triggers the SAME id once its previous attempt has settled", async () => {
  let callCount = 0;
  const scheduler = createAccountLabelHealScheduler({ heal: async () => void (callCount += 1) });

  scheduler.triggerFor(["a"]);
  await flush();
  scheduler.triggerFor(["a"]);
  await flush();

  assert.equal(callCount, 2);
});

test("createAccountLabelHealScheduler — a rejected heal is reported via onHealError, never thrown, and never an unhandled rejection", async () => {
  const errors: Array<{ id: string; err: unknown }> = [];
  const scheduler = createAccountLabelHealScheduler({
    heal: async () => {
      throw new Error("provider unreachable");
    },
    onHealError: (id, err) => {
      errors.push({ id, err });
    },
  });

  const unhandled: unknown[] = [];
  const onUnhandled = (err: unknown) => unhandled.push(err);
  process.on("unhandledRejection", onUnhandled);
  try {
    assert.doesNotThrow(() => scheduler.triggerFor(["a"]));
    await flush();
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }

  assert.equal(errors.length, 1);
  assert.equal(errors[0]!.id, "a");
  assert.deepEqual(unhandled, []);
});

test("createAccountLabelHealScheduler — defends against a heal that throws synchronously instead of returning a rejected promise", () => {
  const errors: Array<{ id: string; err: unknown }> = [];
  const scheduler = createAccountLabelHealScheduler({
    // Deliberately NOT `async` — violates the documented `heal` contract (always return a Promise),
    // to prove the scheduler does not simply trust callers to get that right.
    heal: (() => {
      throw new Error("sync boom");
    }) as unknown as (id: string) => Promise<unknown>,
    onHealError: (id, err) => {
      errors.push({ id, err });
    },
  });

  assert.doesNotThrow(() => scheduler.triggerFor(["a"]));
  assert.equal(errors.length, 1);
});

test("createAccountLabelHealScheduler — an id that failed is eligible again on the next triggerFor (no permanent blacklist)", async () => {
  let callCount = 0;
  const scheduler = createAccountLabelHealScheduler({
    heal: async () => {
      callCount += 1;
      throw new Error("still unreachable");
    },
    onHealError: () => {},
  });

  scheduler.triggerFor(["a"]);
  await flush();
  scheduler.triggerFor(["a"]);
  await flush();

  assert.equal(callCount, 2);
});
