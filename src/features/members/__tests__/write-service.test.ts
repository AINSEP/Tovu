import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type {
  MailerCapabilities,
  MailerPort,
  MailerSendOptions,
  MailerSendResult,
  OutboundEmail,
} from "../../../platform/mail/index.js";
import type { ClockPort, IdGeneratorPort } from "@jini-ai/cms/core";
import { OriginNotVerifiedError, type OriginRegistryPort, type VerifiedOrigin } from "../../../origin/index.js";
import {
  InMemoryMagicLinkTokenRepo,
  InMemoryMemberRepo,
  InMemoryMemberSessionRepo,
  InMemoryMemberSubscriptionRepo,
  InMemoryMemberTierRepo,
} from "../repo.memory.js";
import {
  compSubscription,
  completeSignIn,
  disableMember,
  requestSignInLink,
  setSubscriptionStatus,
  updateProfile,
} from "../write-service.js";
import {
  MemberAuthError,
  MemberConflictError,
  MemberNotFoundError,
  MemberValidationError,
} from "../types.js";
import type { MembersWriteServiceDeps } from "../ports.js";

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
    supportsAttachments: false,
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

/** Fake `OriginRegistryPort` — only `canonicalOrigin` matters for these tests. */
function makeOriginRegistry(overrides: Partial<OriginRegistryPort> = {}): OriginRegistryPort {
  return {
    canonicalOrigin: async () => {
      throw new OriginNotVerifiedError("no verified origin registered for this workspace");
    },
    isAllowedRedirectTarget: async () => false,
    isAllowedEgressTarget: async () => false,
    ...overrides,
  };
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

test("completeSignIn rejects a token whose member was disabled AFTER the link was issued", async () => {
  const { deps, sent } = makeDeps();
  await requestSignInLink({ deps, input: { workspaceId: WORKSPACE_ID, email: "raced@example.com" } });
  const rawToken = extractRawToken(sent[0].message.text!);

  const member = await deps.members.findByEmail({ workspaceId: WORKSPACE_ID, email: "raced@example.com" });
  await deps.members.save({ ...member!, status: "disabled" });

  await assert.rejects(
    () => completeSignIn({ deps, input: { workspaceId: WORKSPACE_ID, token: rawToken } }),
    (err: unknown) => {
      assert.ok(err instanceof MemberAuthError);
      assert.equal(err.message, "this account has been disabled");
      return true;
    }
  );
});

test("completeSignIn a SECOND time for an already-active member: status stays 'active' (not re-derived), emailVerifiedAt is NOT overwritten", async () => {
  const { deps, sent } = makeDeps();
  await requestSignInLink({ deps, input: { workspaceId: WORKSPACE_ID, email: "returning@example.com" } });
  const firstToken = extractRawToken(sent[0].message.text!);
  const first = await completeSignIn({ deps, input: { workspaceId: WORKSPACE_ID, token: firstToken } });
  assert.equal(first.member.status, "active");
  const firstVerifiedAt = first.member.emailVerifiedAt;

  // A second sign-in request/complete for the SAME already-active member.
  await requestSignInLink({ deps, input: { workspaceId: WORKSPACE_ID, email: "returning@example.com" } });
  const secondToken = extractRawToken(sent[1].message.text!);
  const second = await completeSignIn({ deps, input: { workspaceId: WORKSPACE_ID, token: secondToken } });

  assert.equal(second.member.status, "active", "an already-active member stays active (ternary false branch)");
  assert.equal(second.member.emailVerifiedAt, firstVerifiedAt, "emailVerifiedAt must not be overwritten once already set (?? branch)");
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

/**
 * T013/C-007/INV-06 (ADR-PIPE-013 Decision §3) — `requestSignInLink`'s
 * origin-fallback branch: a workspace with a verified origin gets an
 * absolute magic-link URL via `OriginRegistryPort.canonicalOrigin`; a
 * workspace that throws `OriginNotVerifiedError` (or has no `origin` dep
 * wired at all) falls back to today's relative-path link, and the response
 * shape (`{delivered:true}`) never varies either way (INV-06 preserved).
 */
test("T013: requestSignInLink builds an absolute link when the workspace has a verified origin", async () => {
  const verified: VerifiedOrigin = {
    scheme: "https",
    host: "members.example.com",
    verifiedAt: "2026-07-01T00:00:00.000Z",
    source: "workspace-setting",
  };
  const { deps, sent } = makeDeps({ origin: makeOriginRegistry({ canonicalOrigin: async () => verified }) });

  const result = await requestSignInLink({ deps, input: { workspaceId: WORKSPACE_ID, email: "verified@example.com" } });

  assert.deepEqual(result, { delivered: true });
  assert.equal(sent.length, 1);
  assert.match(
    sent[0].message.text!,
    /Sign in using this link \(expires in 15 minutes\): https:\/\/members\.example\.com\/auth\/magic\?token=/
  );
});

test("T013: requestSignInLink includes a non-default port and a basePath when the verified origin carries them", async () => {
  const verified: VerifiedOrigin = {
    scheme: "https",
    host: "members.example.com",
    port: 8443,
    basePath: "/portal",
    verifiedAt: "2026-07-01T00:00:00.000Z",
    source: "workspace-setting",
  };
  const { deps, sent } = makeDeps({ origin: makeOriginRegistry({ canonicalOrigin: async () => verified }) });

  await requestSignInLink({ deps, input: { workspaceId: WORKSPACE_ID, email: "ported@example.com" } });

  assert.match(
    sent[0].message.text!,
    /https:\/\/members\.example\.com:8443\/portal\/auth\/magic\?token=/
  );
});

test("T013: requestSignInLink falls back to a relative link when OriginNotVerifiedError is thrown, and still returns {delivered:true}", async () => {
  const { deps, sent } = makeDeps({ origin: makeOriginRegistry() }); // default fake always throws OriginNotVerifiedError

  const result = await requestSignInLink({
    deps,
    input: { workspaceId: WORKSPACE_ID, email: "unverified@example.com" },
  });

  assert.deepEqual(result, { delivered: true });
  assert.equal(sent.length, 1);
  assert.match(sent[0].message.text!, /Sign in using this link \(expires in 15 minutes\): \/auth\/magic\?token=/);
});

test("T013: requestSignInLink with no origin dep wired at all behaves exactly like today (relative link, no error)", async () => {
  const { deps, sent } = makeDeps(); // no `origin` override — field absent entirely

  const result = await requestSignInLink({
    deps,
    input: { workspaceId: WORKSPACE_ID, email: "no-origin-wired@example.com" },
  });

  assert.deepEqual(result, { delivered: true });
  assert.match(sent[0].message.text!, /Sign in using this link \(expires in 15 minutes\): \/auth\/magic\?token=/);
});

test("T013: the origin-fallback path logs one warning-level line carrying workspaceId only — never the email or the raw token", async () => {
  const { deps, sent } = makeDeps({ origin: makeOriginRegistry() });
  const originalWarn = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };

  try {
    await requestSignInLink({ deps, input: { workspaceId: WORKSPACE_ID, email: "secret@example.com" } });
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 1, "exactly one warning-level log line for the fallback");
  const loggedText = warnings[0].map(String).join(" ");
  assert.ok(loggedText.includes(WORKSPACE_ID), "must carry the workspaceId");
  assert.ok(!loggedText.includes("secret@example.com"), "must never carry the recipient email");

  const rawToken = extractRawToken(sent[0].message.text!);
  assert.ok(!loggedText.includes(rawToken), "must never carry the raw token");
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

test("updateProfile: a note-only update (name omitted) trims the note and leaves the existing name untouched", async () => {
  const { deps } = makeDeps();
  const member = {
    id: "member-note",
    workspaceId: WORKSPACE_ID,
    email: "noteonly@example.com",
    name: "Original Name",
    status: "active" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
  };
  await deps.members.save(member);

  const result = await updateProfile({
    deps,
    input: { workspaceId: WORKSPACE_ID, memberId: "member-note", note: "  VIP customer  " },
  });
  assert.equal(result.member.name, "Original Name", "name must be left untouched when omitted");
  assert.equal(result.member.note, "VIP customer", "note must be trimmed");
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

test("setSubscriptionStatus: a non-'canceled' transition leaves canceledAt untouched and stores a provided externalRef", async () => {
  const { deps } = makeDeps();
  const subscription = {
    id: "sub-2",
    workspaceId: WORKSPACE_ID,
    memberId: "member-5",
    tierId: "tier-5",
    status: "active" as const,
    source: "billing" as const,
    startedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
  };
  await deps.subscriptions.save(subscription);

  const result = await setSubscriptionStatus({
    deps,
    input: { workspaceId: WORKSPACE_ID, subscriptionId: "sub-2", status: "expired", externalRef: "ext-ref-1" },
  });
  assert.equal(result.subscription.status, "expired");
  assert.equal(result.subscription.externalRef, "ext-ref-1");
  assert.equal(result.subscription.canceledAt, undefined, "canceledAt must stay untouched for a non-'canceled' transition");
});
