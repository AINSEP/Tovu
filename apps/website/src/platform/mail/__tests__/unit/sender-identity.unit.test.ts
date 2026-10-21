import assert from "node:assert/strict";
import test from "node:test";

import {
  createMailSenderIdentityResolver,
  mailSenderIdentityFor,
  SenderIdentityNotConfiguredError,
  type MailSenderIdentityPort,
} from "../../sender-identity.js";
import type { MailerPort } from "../../ports.js";

/**
 * @file The one sender-identity resolver: the configured site sender wins, a non-delivering mailer
 * keeps the caller's `.local` placeholder, and a delivering mailer with nothing configured refuses
 * with a named, coded error instead of sending a From the provider would reject.
 */

const WS = "ws-sender";
const FALLBACK = { email: "no-reply@members.local", name: "Members" };

/** A mailer whose only observed behavior is the driver it reports; sends must never happen here. */
function mailerWithDriver(driver: string, onCapabilities: () => void = () => {}): MailerPort {
  return {
    capabilities: () => {
      onCapabilities();
      return { driver, supportsIdempotencyKey: false, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false };
    },
    send: async () => assert.fail("the resolver must never send"),
    sendBatch: async () => assert.fail("the resolver must never send"),
  };
}

test("a configured sender is used with its own display name, even on a delivering mailer", async () => {
  const resolver = createMailSenderIdentityResolver({ mailer: mailerWithDriver("smtp") }, {
    readConfiguredSender: async ({ workspaceId }) => {
      assert.equal(workspaceId, WS, "the setting is read for the sending workspace");
      return { email: "hello@example.com", name: "Example Site" };
    },
  });
  assert.deepEqual(await resolver.resolve({ workspaceId: WS, fallback: FALLBACK }), { email: "hello@example.com", name: "Example Site" });
});

test("a configured address without a display name borrows the caller's fallback name", async () => {
  const resolver = createMailSenderIdentityResolver({ mailer: mailerWithDriver("smtp") }, {
    readConfiguredSender: async () => ({ email: "hello@example.com" }),
  });
  assert.deepEqual(await resolver.resolve({ workspaceId: WS, fallback: FALLBACK }), { email: "hello@example.com", name: "Members" });
});

for (const driver of ["console", "memory"]) {
  test(`with nothing configured, the non-delivering "${driver}" mailer keeps the .local placeholder`, async () => {
    const resolver = createMailSenderIdentityResolver({ mailer: mailerWithDriver(driver) }, { readConfiguredSender: async () => ({}) });
    assert.deepEqual(await resolver.resolve({ workspaceId: WS, fallback: FALLBACK }), FALLBACK);
  });
}

test("a null setting read on a console mailer also keeps the placeholder", async () => {
  const resolver = createMailSenderIdentityResolver({ mailer: mailerWithDriver("console") }, { readConfiguredSender: async () => null });
  assert.deepEqual(await resolver.resolve({ workspaceId: WS, fallback: FALLBACK }), FALLBACK);
});

for (const driver of ["smtp", "resend", "some-future-provider"]) {
  test(`with nothing configured, the delivering "${driver}" mailer refuses with SenderIdentityNotConfiguredError`, async () => {
    const resolver = createMailSenderIdentityResolver({ mailer: mailerWithDriver(driver) }, { readConfiguredSender: async () => ({ name: "Only A Name" }) });
    await assert.rejects(resolver.resolve({ workspaceId: WS, fallback: FALLBACK }), (error: unknown) => {
      assert.ok(error instanceof SenderIdentityNotConfiguredError);
      assert.equal(error.name, "SenderIdentityNotConfiguredError");
      assert.equal(error.code, "mail_sender_not_configured");
      assert.match(error.message, new RegExp(`workspace ${WS}`));
      assert.match(error.message, new RegExp(`"${driver}" mailer`));
      assert.match(error.message, /core\.mail\.senderEmail/);
      return true;
    });
  });
}

test("the boot-time mailer swap is settled before the driver is read, so a just-resolved provider is seen", async () => {
  const order: string[] = [];
  let driver = "console";
  const mailer = mailerWithDriver("unused");
  mailer.capabilities = () => {
    order.push(`capabilities:${driver}`);
    return { driver, supportsIdempotencyKey: false, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false };
  };
  const resolver = createMailSenderIdentityResolver({ mailer }, {
    readConfiguredSender: async () => { order.push("read"); return {}; },
    settle: async () => { order.push("settle"); driver = "smtp"; },
  });
  await assert.rejects(resolver.resolve({ workspaceId: WS, fallback: FALLBACK }), SenderIdentityNotConfiguredError);
  assert.deepEqual(order, ["read", "settle", "capabilities:smtp"]);
});

test("a configured sender needs neither the settle nor the driver", async () => {
  const resolver = createMailSenderIdentityResolver({ mailer: mailerWithDriver("smtp", () => assert.fail("driver not needed")) }, {
    readConfiguredSender: async () => ({ email: "hello@example.com", name: "Site" }),
    settle: async () => assert.fail("settle not needed"),
  });
  assert.deepEqual(await resolver.resolve({ workspaceId: WS, fallback: FALLBACK }), { email: "hello@example.com", name: "Site" });
});

test("without a settings reader the resolver behaves as 'nothing configured'", async () => {
  const consoleResolver = createMailSenderIdentityResolver({ mailer: mailerWithDriver("console") });
  assert.deepEqual(await consoleResolver.resolve({ workspaceId: WS, fallback: FALLBACK }), FALLBACK);
  const smtpResolver = createMailSenderIdentityResolver({ mailer: mailerWithDriver("smtp") });
  await assert.rejects(smtpResolver.resolve({ workspaceId: WS, fallback: FALLBACK }), SenderIdentityNotConfiguredError);
});

test("mailSenderIdentityFor returns the composed resolver when one is supplied", async () => {
  const composed: MailSenderIdentityPort = { resolve: async () => ({ email: "composed@example.com" }) };
  const resolver = mailSenderIdentityFor({ mailer: mailerWithDriver("smtp") }, { senderIdentity: composed });
  assert.equal(resolver, composed);
});

test("mailSenderIdentityFor falls back to an unconfigured resolver over the feature's own mailer", async () => {
  assert.deepEqual(await mailSenderIdentityFor({ mailer: mailerWithDriver("console") }).resolve({ workspaceId: WS, fallback: FALLBACK }), FALLBACK);
  await assert.rejects(
    mailSenderIdentityFor({ mailer: mailerWithDriver("smtp") }, {}).resolve({ workspaceId: WS, fallback: FALLBACK }),
    SenderIdentityNotConfiguredError
  );
});
