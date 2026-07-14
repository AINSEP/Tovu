/**
 * @file T024 — failing-first tests for `unsubscribe.ts` (REQ-14/15/30/32, INV-04/INV-09,
 * AC-18/19/20/39, EC-03).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { buildUnsubscribeLink, processUnsubscribe, type UnsubscribeDeps, type UnsubscribeTokenClaims } from "../unsubscribe";
import { NewsletterUnsubscribeTokenInvalidError } from "../errors";
import { InMemoryNewsletterSubscriptionRepo } from "../repo.memory";
import type { MembersConsentCapability } from "../ports";
import type { SubscriptionRow } from "../types";

const WS = "ws-1";
const NOW = "2026-07-13T00:00:00.000Z";
const clock = { nowIso: () => NOW };

// Deterministic fake keyring: HKDF-like, but simple and reproducible for tests.
const keyring = {
  activeKey: async () => ({ keyId: "k1" }),
  deriveSigningSecret: async () => new Uint8Array(32),
  derive: async (input: { workspaceId: string; purpose: string; info: string }) =>
    new TextEncoder().encode(`${input.workspaceId}:${input.purpose}:${input.info}`),
};

const originRegistry = {
  canonicalOrigin: async () => ({ scheme: "https" as const, host: "acme.test", verifiedAt: "2026-07-13T00:00:00.000Z", source: "workspace-setting" as const }),
  isAllowedRedirectTarget: async () => true,
  isAllowedEgressTarget: async () => true,
};

function baseSubscription(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: "sub-1",
    workspaceId: WS,
    listId: "list-1",
    subscriberId: "subscriber-1",
    status: "subscribed",
    source: "admin",
    consentRevisionIdAtSubscribe: "rev-1",
    subscribedAt: NOW,
    unsubscribedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

let revokedCalls: string[] = [];
function makeDeps(subscription: SubscriptionRow, withCapability = true): { deps: UnsubscribeDeps; repo: InMemoryNewsletterSubscriptionRepo } {
  revokedCalls = [];
  const capability: MembersConsentCapability = {
    request: async () => ({ requested: true }),
    confirm: async () => ({ status: "granted", consentRevisionId: "rev-1" }),
    revoke: async (input) => {
      revokedCalls.push(input.subscriberId);
      return { status: "revoked" };
    },
  };
  const repo = new InMemoryNewsletterSubscriptionRepo([subscription]);
  return {
    repo,
    deps: { subscriptionRepo: repo, keyring, originRegistry, consentCapability: withCapability ? capability : null, clock },
  };
}

async function tokenFor(deps: UnsubscribeDeps, consentRevisionId: string): Promise<string> {
  const claims: UnsubscribeTokenClaims = {
    workspaceId: WS,
    subscriberId: "subscriber-1",
    listId: "list-1",
    campaignId: null,
    consentRevisionId,
  };
  const link = await buildUnsubscribeLink({ deps, claims });
  return new URL(link).searchParams.get("token")!;
}

test("processUnsubscribe: a stale-revision token (from a re-subscribe under a new consent grant) is REJECTED (AC-18)", async () => {
  const { deps } = makeDeps(baseSubscription({ consentRevisionIdAtSubscribe: "rev-2" })); // subscription has moved to rev-2
  const staleToken = await tokenFor(deps, "rev-1"); // token was minted against the OLD rev-1

  await assert.rejects(processUnsubscribe({ deps, input: { rawToken: staleToken } }), (err: unknown) => {
    assert.ok(err instanceof NewsletterUnsubscribeTokenInvalidError);
    assert.equal(err.reason, "consent_revision_mismatch");
    return true;
  });
});

test("processUnsubscribe: a current-revision token succeeds and calls MembersConsentCapability.revoke (AC-19)", async () => {
  const { deps, repo } = makeDeps(baseSubscription({ consentRevisionIdAtSubscribe: "rev-1" }));
  const token = await tokenFor(deps, "rev-1");

  const result = await processUnsubscribe({ deps, input: { rawToken: token } });
  assert.equal(result.outcome, "unsubscribed");
  assert.deepEqual(revokedCalls, ["subscriber-1"]);

  const updated = await repo.findById({ workspaceId: WS, id: "sub-1" });
  assert.equal(updated?.status, "unsubscribed");
  assert.ok(updated?.unsubscribedAt);
});

test("processUnsubscribe: a repeat of the SAME now-processed token is idempotent success, not rejected (AC-20/EC-03)", async () => {
  const { deps } = makeDeps(baseSubscription({ consentRevisionIdAtSubscribe: "rev-1" }));
  const token = await tokenFor(deps, "rev-1");

  const first = await processUnsubscribe({ deps, input: { rawToken: token } });
  assert.equal(first.outcome, "unsubscribed");

  const second = await processUnsubscribe({ deps, input: { rawToken: token } });
  assert.equal(second.outcome, "already-unsubscribed", "a repeat is idempotent success, never rejected");
  assert.equal(revokedCalls.length, 1, "revoke is not called a second time for an already-processed token");
});

test("processUnsubscribe: the EC-03 carve-out does not swallow INV-04 — a stale token can never reach idempotent-success, even for an already-unsubscribed row", async () => {
  // Row is already unsubscribed (from a real rev-1 unsubscribe), then re-subscribed under rev-2 —
  // the OLD rev-1 token must be rejected on revision mismatch, never treated as "already processed".
  const { deps } = makeDeps(baseSubscription({ status: "subscribed", consentRevisionIdAtSubscribe: "rev-2" }));
  const staleToken = await tokenFor(deps, "rev-1");

  await assert.rejects(processUnsubscribe({ deps, input: { rawToken: staleToken } }), (err: unknown) => {
    assert.ok(err instanceof NewsletterUnsubscribeTokenInvalidError);
    assert.equal(err.reason, "consent_revision_mismatch");
    return true;
  });
});

test("processUnsubscribe: a tampered token (bad signature) is rejected", async () => {
  const { deps } = makeDeps(baseSubscription());
  const token = await tokenFor(deps, "rev-1");
  const tampered = token.slice(0, -2) + "00";
  await assert.rejects(processUnsubscribe({ deps, input: { rawToken: tampered } }), (err: unknown) => {
    assert.ok(err instanceof NewsletterUnsubscribeTokenInvalidError);
    assert.equal(err.reason, "signature_invalid");
    return true;
  });
});

test("processUnsubscribe: unknown subscription is rejected as not_found", async () => {
  const { deps } = makeDeps(baseSubscription({ subscriberId: "someone-else" }));
  const token = await tokenFor(deps, "rev-1");
  await assert.rejects(processUnsubscribe({ deps, input: { rawToken: token } }), (err: unknown) => {
    assert.ok(err instanceof NewsletterUnsubscribeTokenInvalidError);
    assert.equal(err.reason, "not_found");
    return true;
  });
});

test("buildUnsubscribeLink: links are built ONLY via OriginRegistryPort.canonicalOrigin — never a raw Host header (REQ-30/INV-09/AC-39)", async () => {
  const { deps } = makeDeps(baseSubscription());
  const link = await buildUnsubscribeLink({
    deps,
    claims: { workspaceId: WS, subscriberId: "subscriber-1", listId: "list-1", campaignId: null, consentRevisionId: "rev-1" },
  });
  // No code path here ever reads a Host header — the origin comes exclusively from `originRegistry`.
  assert.ok(link.startsWith("https://acme.test/newsletter/unsubscribe?token="));
});
