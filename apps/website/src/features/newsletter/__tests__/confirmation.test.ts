/**
 * @file T023 — failing-first tests for `confirmation.ts` (REQ-11/12/13/32, INV-03, AC-14/15/16/17, EC-02).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { consumeConfirmationToken, issueConfirmationToken, type ConfirmationDeps } from "../confirmation.js";
import { NewsletterConfirmTokenInvalidError } from "../errors.js";
import { InMemoryNewsletterConfirmationTokenRepo, InMemoryNewsletterSubscriptionRepo } from "../repo.memory.js";
import type { MembersConsentCapability } from "../ports.js";
import type { SubscriptionRow } from "../types.js";

const WS = "ws-1";
let now = "2026-07-13T00:00:00.000Z";
const clock = { nowIso: () => now };
let counter = 0;
const ids = { newId: () => `tok-${++counter}` };

const sentEmails: { to: string; subject: string }[] = [];
const mailer = {
  capabilities: () => ({ driver: "console", supportsIdempotencyKey: true, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false }),
  send: async (message: { to: { email: string }; subject: string }) => {
    sentEmails.push({ to: message.to.email, subject: message.subject });
    return { ok: true as const, providerMessageId: "m1", acceptedAt: now };
  },
  sendBatch: async () => [],
};

const originRegistry = {
  canonicalOrigin: async () => ({ scheme: "https" as const, host: "acme.test", verifiedAt: "2026-07-13T00:00:00.000Z", source: "workspace-setting" as const }),
  isAllowedRedirectTarget: async () => true,
  isAllowedEgressTarget: async () => true,
};

function makeCallOrderSpy(): { capability: MembersConsentCapability; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    capability: {
      request: async () => {
        calls.push("request");
        return { requested: true };
      },
      confirm: async () => {
        calls.push("confirm");
        return { status: "granted", consentRevisionId: "rev-1" };
      },
      revoke: async () => ({ status: "revoked" }),
    },
  };
}

function baseSubscription(): SubscriptionRow {
  return {
    id: "sub-1",
    workspaceId: WS,
    listId: "list-1",
    subscriberId: "subscriber-1",
    status: "pending",
    source: "admin",
    consentRevisionIdAtSubscribe: null,
    subscribedAt: null,
    unsubscribedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function makeDeps(consentCapability: MembersConsentCapability | null): { deps: ConfirmationDeps; subscriptionRepo: InMemoryNewsletterSubscriptionRepo } {
  const subscriptionRepo = new InMemoryNewsletterSubscriptionRepo([baseSubscription()]);
  const deps: ConfirmationDeps = {
    tokenRepo: new InMemoryNewsletterConfirmationTokenRepo(),
    subscriptionRepo,
    mailer,
    consentCapability,
    originRegistry,
    clock,
    ids,
  };
  return { deps, subscriptionRepo };
}

test("issueConfirmationToken: sends the confirm email WITHOUT changing subscription status yet (AC-14)", async () => {
  const { deps, subscriptionRepo } = makeDeps(null);
  sentEmails.length = 0;
  await issueConfirmationToken({ deps, input: { workspaceId: WS, subscriptionId: "sub-1", recipientEmail: "a@a.test" } });

  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0]!.to, "a@a.test");
  const subscription = await subscriptionRepo.findById({ workspaceId: WS, id: "sub-1" });
  assert.equal(subscription?.status, "pending", "status must not change on issue, only on consume");
});

test("issueConfirmationToken: at most one unconsumed token exists — reissuance invalidates the prior one (behavior.spec §2.1, AC-16)", async () => {
  const { deps } = makeDeps(null);
  const first = await issueConfirmationToken({ deps, input: { workspaceId: WS, subscriptionId: "sub-1", recipientEmail: "a@a.test" } });
  const second = await issueConfirmationToken({ deps, input: { workspaceId: WS, subscriptionId: "sub-1", recipientEmail: "a@a.test" } });

  const firstToken = await deps.tokenRepo.findById({ workspaceId: WS, id: first.tokenId });
  const secondToken = await deps.tokenRepo.findById({ workspaceId: WS, id: second.tokenId });
  assert.ok(firstToken?.consumedAt !== null, "the prior token must be superseded (consumed) once a new one is issued");
  assert.equal(secondToken?.consumedAt, null);

  const unconsumed = await deps.tokenRepo.findUnconsumedBySubscription({ workspaceId: WS, subscriptionId: "sub-1" });
  assert.equal(unconsumed.length, 1, "at most one unconsumed token at any moment");
});

test("consumeConfirmationToken: flips status to 'subscribed' STRICTLY AFTER a mocked granted response, never before (AC-15, INV-03)", async () => {
  const spy = makeCallOrderSpy();
  const { deps, subscriptionRepo } = makeDeps(spy.capability);

  // Capture status at the moment `confirm()` resolves, by wrapping the spy.
  const observedStatusAtConfirm: string[] = [];
  const wrappedCapability: MembersConsentCapability = {
    request: spy.capability.request,
    confirm: async (input) => {
      const before = await subscriptionRepo.findById({ workspaceId: WS, id: "sub-1" });
      observedStatusAtConfirm.push(before!.status);
      return spy.capability.confirm(input);
    },
    revoke: spy.capability.revoke,
  };
  deps.consentCapability = wrappedCapability;

  const rawToken = await issueRawToken(deps);
  const result = await consumeConfirmationToken({ deps, input: { workspaceId: WS, rawToken } });

  assert.deepEqual(spy.calls, ["request", "confirm"]);
  assert.equal(observedStatusAtConfirm[0], "pending", "status must still be 'pending' at the moment confirm() is called");
  assert.equal(result.subscription.status, "subscribed");
  assert.equal(result.subscription.consentRevisionIdAtSubscribe, "rev-1");
});

test("consumeConfirmationToken: expired token is rejected with no state change (AC-17)", async () => {
  const spy = makeCallOrderSpy();
  const { deps, subscriptionRepo } = makeDeps(spy.capability);
  const rawToken = await issueRawToken(deps);

  now = "2026-07-16T00:00:01.000Z"; // 72h + 1s later
  await assert.rejects(consumeConfirmationToken({ deps, input: { workspaceId: WS, rawToken } }), (err: unknown) => {
    assert.ok(err instanceof NewsletterConfirmTokenInvalidError);
    assert.equal(err.reason, "expired");
    return true;
  });
  const subscription = await subscriptionRepo.findById({ workspaceId: WS, id: "sub-1" });
  assert.equal(subscription?.status, "pending", "no state change on an expired-token attempt");
  now = "2026-07-13T00:00:00.000Z";
});

test("consumeConfirmationToken: a second click on an already-consumed token is INVALID, not a repeat success (EC-02)", async () => {
  const spy = makeCallOrderSpy();
  const { deps } = makeDeps(spy.capability);
  const rawToken = await issueRawToken(deps);

  await consumeConfirmationToken({ deps, input: { workspaceId: WS, rawToken } });
  await assert.rejects(consumeConfirmationToken({ deps, input: { workspaceId: WS, rawToken } }), (err: unknown) => {
    assert.ok(err instanceof NewsletterConfirmTokenInvalidError);
    assert.equal(err.reason, "already_consumed");
    return true;
  });
});

test("consumeConfirmationToken: an unknown token is rejected as not_found", async () => {
  const { deps } = makeDeps(null);
  await assert.rejects(consumeConfirmationToken({ deps, input: { workspaceId: WS, rawToken: "bogus" } }), (err: unknown) => {
    assert.ok(err instanceof NewsletterConfirmTokenInvalidError);
    assert.equal(err.reason, "not_found");
    return true;
  });
});

test("consumeConfirmationToken: an unbound consentCapability is a hard error (ADR-PIPE-011 — never stub to succeed)", async () => {
  const { deps } = makeDeps(null); // no consentCapability
  const rawToken = await issueRawToken(deps);
  await assert.rejects(consumeConfirmationToken({ deps, input: { workspaceId: WS, rawToken } }), {
    message: "MembersConsentCapability is unbound — Newsletter cannot confirm consent until Members ships a real binding (ADR-PIPE-011)",
  });
});

test("consumeConfirmationToken: a non-'granted' confirm result (denied) is rejected, token still marked consumed", async () => {
  const deniedCapability: MembersConsentCapability = {
    request: async () => ({ requested: true }),
    confirm: async () => ({ status: "denied", consentRevisionId: "rev-x" }),
    revoke: async () => ({ status: "revoked" }),
  };
  const { deps } = makeDeps(deniedCapability);
  const rawToken = await issueRawToken(deps);
  await assert.rejects(consumeConfirmationToken({ deps, input: { workspaceId: WS, rawToken } }), (err: unknown) => {
    assert.ok(err instanceof NewsletterConfirmTokenInvalidError);
    assert.equal(err.message, "consent was not granted (status: denied)");
    assert.equal(err.reason, "expired");
    return true;
  });
  // Single-use regardless of outcome -- a second attempt with the SAME token is now "already_consumed".
  await assert.rejects(consumeConfirmationToken({ deps, input: { workspaceId: WS, rawToken } }), (err: unknown) => {
    assert.ok(err instanceof NewsletterConfirmTokenInvalidError);
    assert.equal(err.reason, "already_consumed");
    return true;
  });
});

test("issueConfirmationToken: a non-default port on the verified origin is included in the confirm URL", async () => {
  const { deps } = makeDeps(null);
  deps.originRegistry = {
    canonicalOrigin: async () => ({ scheme: "https" as const, host: "acme.test", port: 8443, verifiedAt: "2026-07-13T00:00:00.000Z", source: "workspace-setting" as const }),
    isAllowedRedirectTarget: async () => true,
    isAllowedEgressTarget: async () => true,
  };
  let capturedHtml = "";
  const originalSend = deps.mailer.send.bind(deps.mailer);
  deps.mailer.send = (async (message: { html?: string }, opts: unknown) => {
    capturedHtml = message.html ?? "";
    return originalSend(message as never, opts as never);
  }) as typeof deps.mailer.send;

  await issueConfirmationToken({ deps, input: { workspaceId: WS, subscriptionId: "sub-1", recipientEmail: "a@a.test" } });
  assert.ok(capturedHtml.includes("https://acme.test:8443/newsletter/confirm?token="), `expected a port-qualified URL, got: ${capturedHtml}`);
});

/** Test helper: issue a token and recover its RAW value by intercepting the mailer send. */
async function issueRawToken(deps: ConfirmationDeps): Promise<string> {
  let captured = "";
  const originalSend = deps.mailer.send.bind(deps.mailer);
  deps.mailer.send = (async (message: { html?: string }, opts: unknown) => {
    const match = /token=([a-f0-9]+)/.exec(message.html ?? "");
    captured = match ? match[1]! : "";
    return originalSend(message as never, opts as never);
  }) as typeof deps.mailer.send;
  await issueConfirmationToken({ deps, input: { workspaceId: WS, subscriptionId: "sub-1", recipientEmail: "a@a.test" } });
  return captured;
}
