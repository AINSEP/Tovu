import assert from "node:assert/strict";
import test from "node:test";

import { toSendPipelineDeps, toUnsubscribeDeps, type NewsletterRouteDeps } from "../deps.js";

/**
 * @file The `NewsletterRouteDeps` -> domain-bundle assemblers are pure field mappings; these tests pin
 * the two whose mapping carries a decision rather than a rename: `toUnsubscribeDeps` must hand the
 * SAME process keyring/consent seam through (never a stand-in), and `toSendPipelineDeps`'s Launch
 * Gate precondition (a) is hard-wired off (behavior.spec.md §3's documented default).
 */

/** Distinct sentinel objects so identity (not just shape) is what each assertion checks. */
function routeDeps(overrides: Partial<NewsletterRouteDeps> = {}): NewsletterRouteDeps {
  const tag = (name: string) => ({ name });
  return {
    workspaceId: "workspace-local",
    newsletterSubscriptionRepo: tag("subscriptionRepo"),
    newsletterCampaignRepo: tag("campaignRepo"),
    newsletterAudienceSnapshotRepo: tag("audienceSnapshotRepo"),
    newsletterSendRepo: tag("sendRepo"),
    newsletterSubscriberDirectory: tag("subscriberDirectory"),
    newsletterHooks: tag("hooks"),
    newsletterKeyring: tag("keyring"),
    originRegistry: tag("originRegistry"),
    membersConsentCapability: null,
    mailer: tag("mailer"),
    outbox: tag("outbox"),
    bus: tag("bus"),
    clock: tag("clock"),
    idGen: tag("idGen"),
    ...overrides,
  } as unknown as NewsletterRouteDeps;
}

test("toUnsubscribeDeps: passes the route's own repo, keyring, origin registry, consent seam and clock through by identity", () => {
  const deps = routeDeps();
  const bundle = toUnsubscribeDeps(deps);
  assert.deepEqual(Object.keys(bundle).sort(), ["clock", "consentCapability", "keyring", "originRegistry", "subscriptionRepo"]);
  assert.equal(bundle.subscriptionRepo, deps.newsletterSubscriptionRepo);
  assert.equal(bundle.keyring, deps.newsletterKeyring);
  assert.equal(bundle.originRegistry, deps.originRegistry);
  assert.equal(bundle.consentCapability, null, "an unbound Members consent seam stays null, never a permissive stand-in");
  assert.equal(bundle.clock, deps.clock);
});

test("toUnsubscribeDeps: a bound consent capability is forwarded as-is", () => {
  const capability = { name: "members-consent" };
  const bundle = toUnsubscribeDeps(routeDeps({ membersConsentCapability: capability } as unknown as Partial<NewsletterRouteDeps>));
  assert.equal(bundle.consentCapability, capability);
});

test("toSendPipelineDeps: Launch Gate precondition (a) resolves false for every workspace, while (b)-(d) read the route deps", async () => {
  const deps = routeDeps();
  const bundle = toSendPipelineDeps(deps);
  assert.equal(await bundle.launchGateDeps.isSendingEnabled("workspace-local"), false);
  assert.equal(await bundle.launchGateDeps.isSendingEnabled("another-workspace"), false);
  assert.equal(bundle.launchGateDeps.consentCapability, null);
  assert.equal(bundle.launchGateDeps.originRegistry, deps.originRegistry);
  assert.equal(bundle.launchGateDeps.mailer, deps.mailer);
  assert.equal(bundle.mailer, deps.mailer);
  assert.equal(bundle.ids, deps.idGen);
});
