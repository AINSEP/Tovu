import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type { MailerCapabilities, MailerPort, MailerSendOptions, MailerSendResult, OutboundEmail } from "../../mail";
import type { ClockPort, IdGeneratorPort } from "../../core/ports";
import {
  InMemoryMagicLinkTokenRepo,
  InMemoryMemberRepo,
  InMemoryMemberSessionRepo,
  InMemoryMemberSubscriptionRepo,
  InMemoryMemberTierRepo,
} from "../repo.memory";
import {
  compSubscription,
  completeSignIn,
  disableMember,
  requestSignInLink,
  setSubscriptionStatus,
  updateProfile,
} from "../write-service";
import { MemberAuthError, MemberConflictError, MemberNotFoundError, MemberValidationError } from "../types";
import type { MembersWriteServiceDeps } from "../ports";

const WORKSPACE_ID = "ws-1";

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** A controllable clock: tests advance it explicitly to exercise TTL expiry. */
function makeClock(initialIso: string): ClockPort & { set(iso: string): void } {
  let current = initialIso;
  return {
    nowIso: () => current,
    set: (iso: string) => {
      current = iso;
    },
  };
}

function makeIds(prefix: string): IdGeneratorPort {
  let counter = 0;
  return { newId: () => `${prefix}-${++counter}` };
}

/** In-memory `MailerPort` test double that records every send. */
function makeMailer(): { mailer: MailerPort; sent: Array<{ message: OutboundEmail; opts: MailerSendOptions }> } {
  const sent: Array<{ message: OutboundEmail; opts: MailerSendOptions }> = [];
  const capabilities: MailerCapabilities = {
    driver: "memory",
    supportsIdempotencyKey: true,
    supportsWebhookFeedback: false,
    maxBatchSize: 1,
  };
  const mailer: MailerPort = {
    capabilities: () => capabilities,
    send: async (message, opts): Promise<MailerSendResult> => {
      sent.push({ message, opts });
      return { ok: true, providerMessageId: `msg-${sent.length}`, acceptedAt: "2026-07-10T00:00:00.000Z" };
    },
    sendBatch: async (messages, opts) => {
      const results: MailerSendResult[] = [];
      for (const message of messages) results.push(await mailer.send(message, opts));
      return results;
    },
  };
  return { mailer, sent };
}

function makeDeps(overrides: Partial<MembersWriteServiceDeps> = {}) {
  const clock = makeClock("2026-07-10T00:00:00.000Z");
  const ids = makeIds("id");
  const { mailer, sent } = makeMailer();

  const deps: MembersWriteServiceDeps = {
    clock,
    ids,
    members: new InMemoryMemberRepo(),
    tiers: new InMemoryMemberTierRepo(),
    subscriptions: new InMemoryMemberSubscriptionRepo(),
    sessions: new InMemoryMemberSessionRepo(),
    magicLinks: new InMemoryMagicLinkTokenRepo(),
    mailer,
    ...overrides,
  };

  return { deps, clock, sent };
}

function extractRawToken(linkText: string): string {
  const match = linkText.match(/token=([a-f0-9]+)/);
  assert.ok(match, "expected a token= query param in the sign-in link body");
  return match![1];
}

test("requestSignInLink -> completeSignIn happy path: hashes both tokens at rest and activates a pending member", async () => {
  const { deps, sent } = makeDeps();

  const requestResult = await requestSignInLink({
    deps,
    input: { workspaceId: WORKSPACE_ID, email: "Jane@Example.com" },
  });
  assert.deepEqual(requestResult, { delivered: true });
  assert.equal(sent.length, 1);

  const pendingMember = await deps.members.findByEmail({ workspaceId: WORKSPACE_ID, email: "jane@example.com" });
  assert.ok(pendingMember, "requestSignInLink should pre-create a pending member");
  assert.equal(pendingMember!.status, "pending");

  const rawToken = extractRawToken(sent[0].message.text!);
  assert.notEqual(rawToken, hashToken(rawToken), "the log must carry the raw token, not its hash");

  const storedTokenRecord = await deps.magicLinks.findByTokenHash({
    workspaceId: WORKSPACE_ID,
    tokenHash: hashToken(rawToken),
  });
  assert.ok(storedTokenRecord, "the magic link token must be discoverable by its hash");
  assert.notEqual(storedTokenRecord!.tokenHash, rawToken, "the raw token must never be stored");

  const completeResult = await completeSignIn({
    deps,
    input: { workspaceId: WORKSPACE_ID, token: rawToken },
  });

  assert.equal(completeResult.member.status, "active");
  assert.ok(completeResult.member.emailVerifiedAt);
  assert.equal(completeResult.member.id, pendingMember!.id);

  assert.ok(completeResult.rawSessionToken, "completeSignIn must surface the raw session token for the cookie");
  assert.notEqual(
    completeResult.session.tokenHash,
    completeResult.rawSessionToken,
    "the session's raw token must never be stored"
  );
  assert.equal(completeResult.session.tokenHash, hashToken(completeResult.rawSessionToken));

  const storedSession = await deps.sessions.findByTokenHash({
    workspaceId: WORKSPACE_ID,
    tokenHash: hashToken(completeResult.rawSessionToken),
  });
  assert.ok(storedSession, "the session must be persisted and discoverable by its token hash");
});

test("completeSignIn rejects an expired magic-link token", async () => {
  const { deps, clock, sent } = makeDeps();

  await requestSignInLink({ deps, input: { workspaceId: WORKSPACE_ID, email: "expired@example.com" } });
  const rawToken = extractRawToken(sent[0].message.text!);

  clock.set("2026-07-10T00:20:00.000Z"); // 20 minutes later; TTL is 15 minutes

  await assert.rejects(
    () => completeSignIn({ deps, input: { workspaceId: WORKSPACE_ID, token: rawToken } }),
    MemberAuthError
  );
});

test("completeSignIn rejects an already-consumed magic-link token (single-use)", async () => {
  const { deps, sent } = makeDeps();

  await requestSignInLink({ deps, input: { workspaceId: WORKSPACE_ID, email: "onceonly@example.com" } });
  const rawToken = extractRawToken(sent[0].message.text!);

  await completeSignIn({ deps, input: { workspaceId: WORKSPACE_ID, token: rawToken } });

  await assert.rejects(
    () => completeSignIn({ deps, input: { workspaceId: WORKSPACE_ID, token: rawToken } }),
    MemberAuthError
  );
});

test("completeSignIn rejects an unknown token", async () => {
  const { deps } = makeDeps();

  await assert.rejects(
    () => completeSignIn({ deps, input: { workspaceId: WORKSPACE_ID, token: "not-a-real-token" } }),
    MemberAuthError
  );
});

test("requestSignInLink for a disabled member is a silent no-op but still reports delivered (anti-enumeration)", async () => {
  const { deps, sent } = makeDeps();
  const disabledMember = {
    id: "member-disabled",
    workspaceId: WORKSPACE_ID,
    email: "disabled@example.com",
    status: "disabled" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
  };
  await deps.members.save(disabledMember);

  const result = await requestSignInLink({
    deps,
    input: { workspaceId: WORKSPACE_ID, email: "disabled@example.com" },
  });

  assert.deepEqual(result, { delivered: true });
  assert.equal(sent.length, 0, "no mail should be sent for a disabled member");
});

test("requestSignInLink rejects a malformed email", async () => {
  const { deps } = makeDeps();

  await assert.rejects(
    () => requestSignInLink({ deps, input: { workspaceId: WORKSPACE_ID, email: "not-an-email" } }),
    MemberValidationError
  );
});

test("disableMember is disable-only (idempotent, never hard-deleted) and revokes live sessions", async () => {
  const { deps } = makeDeps();
  const member = {
    id: "member-1",
    workspaceId: WORKSPACE_ID,
    email: "active@example.com",
    status: "active" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
  };
  await deps.members.save(member);
  await deps.sessions.save({
    id: "session-1",
    workspaceId: WORKSPACE_ID,
    memberId: "member-1",
    tokenHash: hashToken("some-raw-session-token"),
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2027-01-01T00:00:00.000Z",
  });

  const firstResult = await disableMember({ deps, input: { workspaceId: WORKSPACE_ID, memberId: "member-1" } });
  assert.equal(firstResult.member.status, "disabled");

  const sessionAfterDisable = await deps.sessions.findByTokenHash({
    workspaceId: WORKSPACE_ID,
    tokenHash: hashToken("some-raw-session-token"),
  });
  assert.ok(sessionAfterDisable!.revokedAt, "disabling a member must revoke its live sessions");

  // Idempotent: calling disable again must not throw and must not hard-delete the row.
  const secondResult = await disableMember({ deps, input: { workspaceId: WORKSPACE_ID, memberId: "member-1" } });
  assert.equal(secondResult.member.status, "disabled");
  assert.equal(secondResult.member.id, "member-1");

  const stillThere = await deps.members.findById({ workspaceId: WORKSPACE_ID, id: "member-1" });
  assert.ok(stillThere, "a disabled member row must still exist (disable-only, never hard-delete)");
});

test("disableMember rejects an unknown member id", async () => {
  const { deps } = makeDeps();

  await assert.rejects(
    () => disableMember({ deps, input: { workspaceId: WORKSPACE_ID, memberId: "no-such-member" } }),
    MemberNotFoundError
  );
});

test("updateProfile rejects a blank name and a missing member", async () => {
  const { deps } = makeDeps();
  const member = {
    id: "member-2",
    workspaceId: WORKSPACE_ID,
    email: "profile@example.com",
    status: "active" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
  };
  await deps.members.save(member);

  await assert.rejects(
    () =>
      updateProfile({
        deps,
        input: { workspaceId: WORKSPACE_ID, memberId: "member-2", name: "   " },
      }),
    MemberValidationError
  );

  await assert.rejects(
    () =>
      updateProfile({
        deps,
        input: { workspaceId: WORKSPACE_ID, memberId: "no-such-member", name: "Someone" },
      }),
    MemberNotFoundError
  );

  const result = await updateProfile({
    deps,
    input: { workspaceId: WORKSPACE_ID, memberId: "member-2", name: "Jane Doe" },
  });
  assert.equal(result.member.name, "Jane Doe");
  assert.equal(result.member.version, 2);
});

test("compSubscription rejects an archived tier and a duplicate active subscription", async () => {
  const { deps } = makeDeps();
  const member = {
    id: "member-3",
    workspaceId: WORKSPACE_ID,
    email: "sub@example.com",
    status: "active" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
  };
  await deps.members.save(member);

  const archivedTier = {
    id: "tier-archived",
    workspaceId: WORKSPACE_ID,
    name: "Old Tier",
    slug: "old-tier",
    type: "paid" as const,
    status: "archived" as const,
    visibleInPortal: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
  };
  const activeTier = {
    ...archivedTier,
    id: "tier-active",
    slug: "active-tier",
    status: "active" as const,
  };
  await deps.tiers.save(archivedTier);
  await deps.tiers.save(activeTier);

  await assert.rejects(
    () => compSubscription({ deps, input: { workspaceId: WORKSPACE_ID, memberId: "member-3", tierId: "tier-archived" } }),
    MemberValidationError
  );

  const result = await compSubscription({
    deps,
    input: { workspaceId: WORKSPACE_ID, memberId: "member-3", tierId: "tier-active" },
  });
  assert.equal(result.subscription.status, "comped");
  assert.equal(result.subscription.source, "comp");

  // Aggregate/adversarial case: a second comp to the SAME tier must be rejected,
  // not silently create a duplicate entitlement row.
  await assert.rejects(
    () => compSubscription({ deps, input: { workspaceId: WORKSPACE_ID, memberId: "member-3", tierId: "tier-active" } }),
    MemberConflictError
  );
});

test("setSubscriptionStatus updates status, stamps canceledAt on cancel, and rejects unknown ids/values", async () => {
  const { deps } = makeDeps();
  const subscription = {
    id: "sub-1",
    workspaceId: WORKSPACE_ID,
    memberId: "member-4",
    tierId: "tier-4",
    status: "active" as const,
    source: "comp" as const,
    startedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
  };
  await deps.subscriptions.save(subscription);

  const result = await setSubscriptionStatus({
    deps,
    input: { workspaceId: WORKSPACE_ID, subscriptionId: "sub-1", status: "canceled" },
  });
  assert.equal(result.subscription.status, "canceled");
  assert.ok(result.subscription.canceledAt);

  await assert.rejects(
    () =>
      setSubscriptionStatus({
        deps,
        input: { workspaceId: WORKSPACE_ID, subscriptionId: "no-such-sub", status: "canceled" },
      }),
    MemberNotFoundError
  );

  await assert.rejects(
    () =>
      setSubscriptionStatus({
        deps,
        input: {
          workspaceId: WORKSPACE_ID,
          subscriptionId: "sub-1",
          // Cast bypasses compile-time narrowing to simulate a bad runtime value.
          status: "bogus-status" as unknown as "canceled",
        },
      }),
    MemberValidationError
  );
});
