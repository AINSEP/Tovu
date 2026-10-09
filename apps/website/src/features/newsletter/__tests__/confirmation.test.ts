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
const now = "2026-07-13T00:00:00.000Z";
const clock = { nowIso: () => now };
let counter = 0;
const ids = { newId: () => `tok-${++counter}` };

function makeMailer() {
  const sentEmails: { to: string; subject: string; html: string }[] = [];
  return {
    sentEmails,
    capabilities: () => ({ driver: "console", supportsIdempotencyKey: true, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false }),
    send: async (message: { to: { email: string }; subject: string; html?: string }) => {
      sentEmails.push({ to: message.to.email, subject: message.subject, html: message.html ?? "" });
      return { ok: true as const, providerMessageId: "m1", acceptedAt: now };
    },
    sendBatch: async () => [],
  };
}

const originRegistry = {
  canonicalOrigin: async () => ({ scheme: "https" as const, host: "acme.test", verifiedAt: "2026-07-13T00:00:00.000Z", source: "workspace-setting" as const }),
  isAllowedRedirectTarget: async () => true,
  isAllowedEgressTarget: async () => true,
};

function makeCallOrderSpy() {
  const calls: string[] = [];
  const requests: Parameters<MembersConsentCapability["request"]>[0][] = [];
  const confirms: Parameters<MembersConsentCapability["confirm"]>[0][] = [];
  return {
    calls, requests, confirms,
    capability: {
      request: async (input: Parameters<MembersConsentCapability["request"]>[0]) => {
        calls.push("request");
        requests.push(input);
        return { requested: true as const };
      },
      confirm: async (input: Parameters<MembersConsentCapability["confirm"]>[0]) => {
        calls.push("confirm");
        confirms.push(input);
        return { status: "granted" as const, consentRevisionId: "rev-1" };
      },
      revoke: async () => ({ status: "revoked" as const }),
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

function makeDeps(consentCapability: MembersConsentCapability | null) {
  const subscriptionRepo = new InMemoryNewsletterSubscriptionRepo([baseSubscription()]);
  const mailer = makeMailer();
  const deps: ConfirmationDeps = {
    tokenRepo: new InMemoryNewsletterConfirmationTokenRepo(),
    subscriptionRepo,
    mailer,
    consentCapability,
    originRegistry,
    clock,
    ids,
  };
  return { deps, subscriptionRepo, sentEmails: mailer.sentEmails };
}

test("issueConfirmationToken: sends the confirm email WITHOUT changing subscription status yet (AC-14)", async () => {
  const { deps, subscriptionRepo, sentEmails } = makeDeps(null);
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
  assert.ok(firstToken, "the superseded token must still exist");
  assert.ok(firstToken.consumedAt !== null, "the prior token must be superseded (consumed) once a new one is issued");
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
  const stored = await subscriptionRepo.findById({ workspaceId: WS, id: "sub-1" });
  assert.deepEqual(stored, { ...baseSubscription(), status: "subscribed", consentRevisionIdAtSubscribe: "rev-1", subscribedAt: now, updatedAt: now });
  const tokens = await deps.tokenRepo.findUnconsumedBySubscription({ workspaceId: WS, subscriptionId: "sub-1" });
  assert.equal(tokens.length, 0);
  const tokenId = spy.confirms[0]?.confirmTokenId;
  assert.ok(tokenId);
  assert.ok(await deps.tokenRepo.findById({ workspaceId: WS, id: tokenId }));
  assert.deepEqual(spy.requests, [{ workspaceId: WS, subscriberId: "subscriber-1", evidence: { consentTextRef: "newsletter-subscription-confirm-v1", source: "admin", confirmTokenId: tokenId } }]);
  assert.deepEqual(spy.confirms, [{ workspaceId: WS, subscriberId: "subscriber-1", confirmTokenId: tokenId }]);
});

test("consumeConfirmationToken: expired token is rejected with no state change (AC-17)", async () => {
  const spy = makeCallOrderSpy();
  const { deps, subscriptionRepo } = makeDeps(spy.capability);
  const rawToken = await issueRawToken(deps);

  deps.clock = { nowIso: () => "2026-07-16T00:00:01.000Z" }; // 72h + 1s later
  await assert.rejects(consumeConfirmationToken({ deps, input: { workspaceId: WS, rawToken } }), (err: unknown) => {
    assert.ok(err instanceof NewsletterConfirmTokenInvalidError);
    assert.equal(err.reason, "expired");
    return true;
  });
  const subscription = await subscriptionRepo.findById({ workspaceId: WS, id: "sub-1" });
  assert.equal(subscription?.status, "pending", "no state change on an expired-token attempt");
  assert.deepEqual(spy.calls, []);
});

test("confirmation tokens last 72 hours, valid immediately before expiry and expired exactly at expiry", async () => {
  for (const [at, valid] of [["2026-07-15T23:59:59.999Z", true], ["2026-07-16T00:00:00.000Z", false]] as const) {
    const spy = makeCallOrderSpy();
    const { deps, subscriptionRepo } = makeDeps(spy.capability);
    const rawToken = await issueRawToken(deps);
    const [token] = await deps.tokenRepo.findUnconsumedBySubscription({ workspaceId: WS, subscriptionId: "sub-1" });
    assert.equal(token?.expiresAt, "2026-07-16T00:00:00.000Z");
    deps.clock = { nowIso: () => at };
    if (valid) {
      await consumeConfirmationToken({ deps, input: { workspaceId: WS, rawToken } });
      const stored = await subscriptionRepo.findById({ workspaceId: WS, id: "sub-1" });
      assert.equal(stored?.status, "subscribed");
      assert.equal(stored?.subscribedAt, at);
      assert.deepEqual(spy.calls, ["request", "confirm"]);
    } else {
      await assert.rejects(consumeConfirmationToken({ deps, input: { workspaceId: WS, rawToken } }), (err: unknown) => {
        assert.ok(err instanceof NewsletterConfirmTokenInvalidError);
        assert.equal(err.reason, "expired");
        return true;
      });
      assert.deepEqual(await subscriptionRepo.findById({ workspaceId: WS, id: "sub-1" }), baseSubscription());
      assert.deepEqual(spy.calls, []);
    }
  }
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
  assert.deepEqual(await deps.subscriptionRepo.findById({ workspaceId: WS, id: "sub-1" }), baseSubscription());
  // Single-use regardless of outcome -- a second attempt with the SAME token is now "already_consumed".
  await assert.rejects(consumeConfirmationToken({ deps, input: { workspaceId: WS, rawToken } }), (err: unknown) => {
    assert.ok(err instanceof NewsletterConfirmTokenInvalidError);
    assert.equal(err.reason, "already_consumed");
    return true;
  });
});

test("issueConfirmationToken: clickable URLs preserve custom ports/base paths and omit default ports", async () => {
  for (const [scheme, port, basePath, expected] of [
    ["https", 8443, undefined, "https://acme.test:8443/newsletter/confirm"],
    ["https", 443, undefined, "https://acme.test/newsletter/confirm"],
    ["http", 80, undefined, "http://acme.test/newsletter/confirm"],
    ["https", 443, "/site", "https://acme.test/site/newsletter/confirm"],
  ] as const) {
    const { deps } = makeDeps(makeCallOrderSpy().capability);
    deps.originRegistry = {
      ...originRegistry,
      canonicalOrigin: async () => ({ scheme, host: "acme.test", port, basePath, verifiedAt: now, source: "workspace-setting" as const }),
    };
    let confirmUrl: URL | undefined;
    const rawToken = await issueRawToken(deps, (url) => { confirmUrl = url; });
    const result = await consumeConfirmationToken({ deps, input: { workspaceId: WS, rawToken } });
    assert.equal(result.subscription.status, "subscribed");
    assert.ok(confirmUrl);
    assert.equal(confirmUrl.origin + confirmUrl.pathname, expected);
    assert.deepEqual([...confirmUrl.searchParams.keys()], ["token"]);
    assert.equal(confirmUrl.hash, "");
  }
});

/** Test helper: issue a token and recover its RAW value from the clickable anchor. */
async function issueRawToken(deps: ConfirmationDeps, captureUrl?: (url: URL) => void): Promise<string> {
  let captured: URL | undefined;
  const originalSend = deps.mailer.send.bind(deps.mailer);
  deps.mailer.send = (async (message: { html?: string }, opts: unknown) => {
    const match = /<a href="([^"]+)"/.exec(message.html ?? "");
    assert.ok(match, "confirmation email must contain a clickable link");
    captured = new URL(match[1]!);
    return originalSend(message as never, opts as never);
  }) as typeof deps.mailer.send;
  try {
    await issueConfirmationToken({ deps, input: { workspaceId: WS, subscriptionId: "sub-1", recipientEmail: "a@a.test" } });
  } finally {
    deps.mailer.send = originalSend;
  }
  assert.ok(captured);
  captureUrl?.(captured);
  const token = captured.searchParams.get("token");
  assert.ok(token);
  return token;
}
