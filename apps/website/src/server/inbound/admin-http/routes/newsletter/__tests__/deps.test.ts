import assert from "node:assert/strict";
import test from "node:test";
import { createMailSenderIdentityResolver } from "#src/platform/mail/index";

import { toConfirmationDeps, toSendPipelineDeps, toSubscriptionsDeps, toUnsubscribeDeps, type NewsletterRouteDeps } from "../deps.js";

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

test("confirmation and subscription bundles resolve the composed sender, or the newsletter fallback when none is supplied", async () => {
  const mailer: NewsletterRouteDeps["mailer"] = {
    capabilities: () => ({ driver: "memory", supportsIdempotencyKey: false, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false }),
    send: async () => assert.fail("resolving a sender must not deliver mail"),
    sendBatch: async () => assert.fail("resolving a sender must not deliver mail"),
  };
  const reads: string[] = [];
  const mailSenderIdentity = createMailSenderIdentityResolver({ mailer }, { readConfiguredSender: async ({ workspaceId }) => {
    reads.push(workspaceId);
    return { email: "sender@example.test", name: "Site Sender" };
  } });
  const deps = routeDeps({ mailer, mailSenderIdentity });
  const bundle = toConfirmationDeps(deps);
  assert.equal(bundle.mailer, mailer);
  assert.deepEqual(await bundle.resolveFrom({ workspaceId: "confirmation-site" }), { email: "sender@example.test", name: "Site Sender" });
  assert.deepEqual(await toSubscriptionsDeps(deps).confirmationDeps.resolveFrom({ workspaceId: "subscription-site" }), { email: "sender@example.test", name: "Site Sender" });
  assert.deepEqual(reads, ["confirmation-site", "subscription-site"]);
  assert.deepEqual(await toConfirmationDeps(routeDeps({ mailer, mailSenderIdentity: undefined })).resolveFrom({ workspaceId: "unconfigured-site" }),
    { email: "no-reply@newsletter.local", name: "Newsletter" });
});

/** The send pipeline's production `sleep` port is a real timer wait (quota waits, review email#4). */

test("toSendPipelineDeps: sleep resolves after a real timer wait", async () => {
  const deps = toSendPipelineDeps({} as NewsletterRouteDeps);
  assert.ok(deps.sleep, "the production bundle always waits short quota hints inline");
  const started = performance.now();
  assert.equal(await deps.sleep({ ms: 5 }), undefined);
  assert.ok(performance.now() - started >= 4);
});
