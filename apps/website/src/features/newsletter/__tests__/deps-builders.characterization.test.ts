import assert from "node:assert/strict";
import test from "node:test";

import { toSendPipelineDeps, toUnsubscribeDeps, type NewsletterRouteDeps } from "../../../server/inbound/admin-http/routes/newsletter/deps.js";
import { toNewsletterSendPipelineDeps, type NewsletterToolDeps } from "../tool-registrations.js";

/**
 * @file T33 characterization (dedupe design, `development/refactor-patterns/dedupe/dedupe-03.terra-prompt.md`).
 * Pins the two send-pipeline bindings so the merge into `features/newsletter/deps-builders.ts`
 * changes nothing: the admin route binding hard-wires the launch gate to `false` and carries the
 * one-click unsubscribe deps plus a real `sleep`; the agent-tool binding honors
 * `newsletterSendingEnabled` and carries neither (open owner question O8). Must PASS before and
 * after the change.
 */

/** Distinct sentinel per field (same pattern as `routes/newsletter/__tests__/deps.test.ts`). */
function sentinels(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const sentinel = (name: string) => ({ sentinel: name });
  return {
    newsletterCampaignRepo: sentinel("campaignRepo"),
    newsletterSubscriptionRepo: sentinel("subscriptionRepo"),
    newsletterAudienceSnapshotRepo: sentinel("audienceSnapshotRepo"),
    newsletterSendRepo: sentinel("sendRepo"),
    newsletterSubscriberDirectory: sentinel("subscriberDirectory"),
    newsletterHooks: sentinel("hooks"),
    newsletterKeyring: sentinel("keyring"),
    originRegistry: sentinel("originRegistry"),
    mailer: sentinel("mailer"),
    membersConsentCapability: null,
    outbox: sentinel("outbox"),
    bus: sentinel("bus"),
    clock: sentinel("clock"),
    idGen: sentinel("idGen"),
    ...overrides,
  };
}

const sendingOn = async (_workspaceId: string): Promise<boolean> => true;

test("admin toSendPipelineDeps: unsubscribe deps present, real sleep, launch gate always false", async () => {
  const routeDeps = sentinels({ newsletterSendingEnabled: sendingOn }) as unknown as NewsletterRouteDeps;
  const bundle = toSendPipelineDeps(routeDeps);
  assert.deepEqual(bundle.unsubscribe, toUnsubscribeDeps(routeDeps));
  assert.equal(typeof bundle.sleep, "function");
  assert.equal(await bundle.launchGateDeps.isSendingEnabled("ws"), false, "the admin binding ignores any sending toggle");
  assert.equal(bundle.campaignRepo, routeDeps.newsletterCampaignRepo);
  assert.equal(bundle.ids, routeDeps.idGen);
  assert.equal(bundle.launchGateDeps.mailer, routeDeps.mailer);
});

test("admin toSendPipelineDeps: sleep really waits (pending until the requested delay has elapsed)", async (t) => {
  // `typeof sleep === "function"` above would also accept a no-op `async () => {}`; the admin
  // binding's sleep is a real timer wait, so pin that under mocked timers.
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const bundle = toSendPipelineDeps(sentinels() as unknown as NewsletterRouteDeps);
  const sleep = bundle.sleep;
  assert.ok(sleep, "the admin binding supplies sleep");
  let settled = false;
  const pending = sleep(250).then(() => { settled = true; });
  await flushMicrotasks();
  assert.equal(settled, false, "a no-op sleep would already have resolved");
  t.mock.timers.tick(249);
  await flushMicrotasks();
  assert.equal(settled, false, "still pending 1 ms before the requested delay");
  t.mock.timers.tick(1);
  await pending;
  assert.equal(settled, true);
});

/** Lets already-resolved promise chains run; only `setTimeout` is mocked, so `setImmediate` is real. */
async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test("tool toNewsletterSendPipelineDeps: no unsubscribe, no sleep, launch gate follows newsletterSendingEnabled", async () => {
  const withToggle = toNewsletterSendPipelineDeps(sentinels({ newsletterSendingEnabled: sendingOn }) as unknown as NewsletterToolDeps);
  assert.equal("unsubscribe" in withToggle, false);
  assert.equal("sleep" in withToggle, false);
  assert.equal(await withToggle.launchGateDeps.isSendingEnabled("ws"), true);

  const withoutToggle = toNewsletterSendPipelineDeps(sentinels() as unknown as NewsletterToolDeps);
  assert.equal(await withoutToggle.launchGateDeps.isSendingEnabled("ws"), false);
});

test("both bindings forward the same repos and ports by identity", () => {
  const raw = sentinels();
  const admin = toSendPipelineDeps(raw as unknown as NewsletterRouteDeps);
  const tool = toNewsletterSendPipelineDeps(raw as unknown as NewsletterToolDeps);
  for (const key of ["campaignRepo", "subscriptionRepo", "audienceSnapshotRepo", "sendRepo", "subscriberDirectory", "hooks", "mailer", "outbox", "bus", "clock", "ids"] as const) {
    assert.equal(admin[key], tool[key], key);
  }
  assert.deepEqual(Object.keys(admin.launchGateDeps).sort(), Object.keys(tool.launchGateDeps).sort());
});
