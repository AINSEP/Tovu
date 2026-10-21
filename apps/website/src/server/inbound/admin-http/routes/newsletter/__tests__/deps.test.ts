import assert from "node:assert/strict";
import test from "node:test";

import { toConfirmationDeps, toSubscriptionsDeps, toUnsubscribeDeps, type NewsletterRouteDeps } from "../deps.js";

/**
 * @file `routes/newsletter/deps.ts`'s bundle assemblers forward the composition root's own instances
 * (never copies or stand-ins): the keyring `unsubscribe.ts` derives tokens from, the `null` consent
 * seam, and the site's system-mail sender resolver.
 */

/** Distinct sentinel per field, so a swapped or dropped field fails the identity checks below. */
function routeDeps(overrides: Partial<NewsletterRouteDeps> = {}): NewsletterRouteDeps {
  const sentinel = (name: string) => ({ sentinel: name });
  return {
    newsletterSubscriptionRepo: sentinel("subscriptionRepo"),
    newsletterConfirmationTokenRepo: sentinel("tokenRepo"),
    newsletterListRepo: sentinel("listRepo"),
    newsletterSubscriberDirectory: sentinel("subscriberDirectory"),
    newsletterKeyring: sentinel("keyring"),
    originRegistry: sentinel("originRegistry"),
    mailer: sentinel("mailer"),
    mailSenderIdentity: sentinel("mailSenderIdentity"),
    membersConsentCapability: null,
    clock: sentinel("clock"),
    idGen: sentinel("idGen"),
    ...overrides,
  } as unknown as NewsletterRouteDeps;
}

test("toUnsubscribeDeps forwards the subscription repo, the shared keyring, the origin registry, the consent seam and the clock", () => {
  const deps = routeDeps();
  assert.deepEqual(Object.keys(toUnsubscribeDeps(deps)).sort(), ["clock", "consentCapability", "keyring", "originRegistry", "subscriptionRepo"]);
  const bundle = toUnsubscribeDeps(deps);
  assert.equal(bundle.subscriptionRepo, deps.newsletterSubscriptionRepo);
  assert.equal(bundle.keyring, deps.newsletterKeyring);
  assert.equal(bundle.originRegistry, deps.originRegistry);
  assert.equal(bundle.consentCapability, null, "the unshipped Members consent seam stays null, never a stand-in");
  assert.equal(bundle.clock, deps.clock);
});

test("toConfirmationDeps hands confirmation mail the composed sender resolver, and leaves it unset when the root supplied none", () => {
  const deps = routeDeps();
  const bundle = toConfirmationDeps(deps);
  assert.equal(bundle.senderIdentity, deps.mailSenderIdentity);
  assert.equal(bundle.mailer, deps.mailer);
  assert.equal(toConfirmationDeps(routeDeps({ mailSenderIdentity: undefined })).senderIdentity, undefined);
  // `saveSubscription` triggers a confirmation, so the nested bundle carries the same resolver.
  assert.equal(toSubscriptionsDeps(deps).confirmationDeps.senderIdentity, deps.mailSenderIdentity);
});
