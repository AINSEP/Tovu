import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";

import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { resolveMemberSession } from "#src/features/members/access-resolver";
import type { MagicLinkTokenRepoPort, MemberSessionRepoPort, MembersWriteServiceDeps } from "#src/features/members/ports";
import { InMemoryMemberRepo, InMemoryMemberSubscriptionRepo, InMemoryMemberTierRepo } from "#src/features/members/repo.memory";
import { MemberAuthError, type MemberSessionRecord } from "#src/features/members/types";
import { consumeMemberChallenge, issueMemberSession } from "#src/features/members/write-service";

/**
 * @file P5a + P5b (S0): the member bearer digest has two producers that must agree byte for byte: the
 * write side (`write-service.ts` `hashToken`, behind `issueMemberSession` and `consumeMemberChallenge`)
 * and the read side (`access-resolver.ts`, its own copy). A stored session or challenge row is found
 * only by this digest, so changing either side silently signs every member out (or, for a weaker digest,
 * exposes the bearer). The fixture pair is a made-up raw token (class only: a bearer token) and its
 * SHA-256 hex digest, committed as a literal and never recomputed by the code under test.
 */

const NOW = "2026-11-17T00:00:00.000Z";
const WS = "lane-su-ws";
const FROZEN_RAW = "frozen-raw-bearer-token-class-only";
const FROZEN_DIGEST = "df9d1bb8caaee1977a48f8d7c1a2d4f1214af7cc4b8e21c3b8ff72e7ad958a90";

/** A sessions port that records lookups and keeps saved rows by digest, so the two sides can round-trip. */
function recordingSessions(): MemberSessionRepoPort & { lookups: string[]; saved: MemberSessionRecord[] } {
  const saved: MemberSessionRecord[] = [];
  const lookups: string[] = [];
  return {
    lookups, saved,
    findByTokenHash: async ({ tokenHash }) => { lookups.push(tokenHash); return saved.find((row) => row.tokenHash === tokenHash) ?? null; },
    listByMember: async () => saved,
    save: async (record) => { saved.push(record); },
    revoke: async () => undefined,
    revokeAllForMember: async () => undefined,
  };
}

function recordingMagicLinks(): MagicLinkTokenRepoPort & { lookups: string[] } {
  const lookups: string[] = [];
  return {
    lookups,
    findById: async () => null,
    findByTokenHash: async ({ tokenHash }) => { lookups.push(tokenHash); return null; },
    save: async () => undefined,
    reserveCodeAttempt: async () => false,
    consume: async () => undefined,
  };
}

function deps(parts: { sessions: MemberSessionRepoPort; magicLinks: MagicLinkTokenRepoPort }): MembersWriteServiceDeps {
  return {
    clock: createFakeClock({ startIso: NOW }), ids: { newId: () => "id-1" }, members: new InMemoryMemberRepo(), ...parts,
    tiers: new InMemoryMemberTierRepo(), subscriptions: new InMemoryMemberSubscriptionRepo(), principals: new InMemoryPrincipalRepo({}),
    passwordHasher: { hash: async () => "unused", verify: async () => false },
    mailer: {
      capabilities: () => ({ driver: "memory", supportsIdempotencyKey: true, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false }),
      send: async () => { throw new Error("no mail is sent by these paths"); },
      sendBatch: async () => [],
    },
  };
}

test("P5a write side: consumeMemberChallenge looks a link token up by its frozen digest", async () => {
  const magicLinks = recordingMagicLinks();
  await assert.rejects(
    consumeMemberChallenge({ deps: deps({ sessions: recordingSessions(), magicLinks }), input: { workspaceId: WS, token: FROZEN_RAW }, purpose: "signin", nowIso: NOW }),
    MemberAuthError,
  );
  assert.deepEqual(magicLinks.lookups, [FROZEN_DIGEST]);
});

test("P5a write side: issueMemberSession stores the SHA-256 hex digest of the raw token it returns, never the raw token", async () => {
  const sessions = recordingSessions();
  const member = { id: "member-1", workspaceId: WS, email: "m@example.test", status: "active" as const, createdAt: NOW, updatedAt: NOW, version: 1 };
  const issued = await issueMemberSession({ deps: deps({ sessions, magicLinks: recordingMagicLinks() }), member, nowIso: NOW });
  assert.equal(sessions.saved.length, 1);
  assert.equal(sessions.saved[0]?.tokenHash, createHash("sha256").update(issued.rawSessionToken).digest("hex"));
  assert.notEqual(sessions.saved[0]?.tokenHash, issued.rawSessionToken);
});

test("P5b read side: resolveMemberSession looks a session up by the same frozen digest", async () => {
  const sessions = recordingSessions();
  assert.equal(await resolveMemberSession({ sessions, workspaceId: WS, sessionToken: FROZEN_RAW, nowIso: NOW }), null);
  assert.deepEqual(sessions.lookups, [FROZEN_DIGEST]);
});

test("P5 round trip: a session minted by the write side is found by the read side", async () => {
  const sessions = recordingSessions();
  const member = { id: "member-1", workspaceId: WS, email: "m@example.test", status: "active" as const, createdAt: NOW, updatedAt: NOW, version: 1 };
  const issued = await issueMemberSession({ deps: deps({ sessions, magicLinks: recordingMagicLinks() }), member, nowIso: NOW });
  const found = await resolveMemberSession({ sessions, workspaceId: WS, sessionToken: issued.rawSessionToken, nowIso: NOW });
  assert.equal(found?.id, issued.session.id);
});
