import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";

import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { setMemberPassword } from "#src/features/members/password-auth";
import type { MembersWriteServiceDeps } from "#src/features/members/ports";
import { SqlMagicLinkTokenRepo, SqlMemberRepo, SqlMemberSessionRepo } from "#src/features/members/repo";
import { InMemoryMemberSubscriptionRepo, InMemoryMemberTierRepo } from "#src/features/members/repo.memory";
import { issueMemberSession } from "#src/features/members/write-service";
import { buildTrashRegistry } from "#src/features/trash/registry";
import { createTableTrashAdapter } from "#src/features/trash/table-adapter";
import { recordingKernel } from "./support/recording-kernel.js";

/**
 * @file P2 (S0): one member, one lock. The member session save, the bulk session revoke, the
 * password persist and Trash's `hide` for the `member` entry must all take the SAME lock string, so
 * a sign-in racing Trash, a password change or a revoke can never interleave. Each of the four sites
 * builds the string itself today; this pin is what lets a move change one of them safely.
 */

const WS = "lane-su-ws";
const MEMBER = "member-1";
const NOW = "2026-11-17T00:00:00.000Z";
const MEMBER_LOCK = `trash:member:${WS}:${MEMBER}`;

/** Only hashing is controlled; storage, transactions and locks are the real SQLite kernel behind the recorder. */
function harness() {
  const { kernel, keys } = recordingKernel();
  const clock = createFakeClock({ startIso: NOW });
  let sequence = 0;
  const members = new SqlMemberRepo(kernel);
  const sessions = new SqlMemberSessionRepo(kernel);
  const digest = (value: string) => `test:${createHash("sha256").update(value).digest("hex")}`;
  const deps: MembersWriteServiceDeps = {
    credentialLifecycle: kernel, clock, ids: { newId: () => `id-${++sequence}` }, members, sessions,
    magicLinks: new SqlMagicLinkTokenRepo(kernel), tiers: new InMemoryMemberTierRepo(), subscriptions: new InMemoryMemberSubscriptionRepo(),
    principals: new InMemoryPrincipalRepo({}),
    passwordHasher: { hash: async ({ password }) => digest(password), verify: async (input) => input.hash === digest(input.password) },
    mailer: {
      capabilities: () => ({ driver: "memory", supportsIdempotencyKey: true, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false }),
      send: async () => { throw new Error("no mail is sent by these paths"); },
      sendBatch: async () => [],
    },
  };
  const member = { id: MEMBER, workspaceId: WS, email: "m@example.test", status: "active" as const, createdAt: NOW, updatedAt: NOW, version: 1 };
  return { kernel, keys, deps, members, sessions, member, digest };
}

test("session save takes the member lock", async () => {
  const h = harness();
  await h.members.save(h.member);
  h.keys.length = 0;
  await issueMemberSession({ deps: h.deps, member: h.member, nowIso: NOW });
  assert.deepEqual(h.keys, [MEMBER_LOCK]);
});

test("session revoke-all takes the member lock", async () => {
  const h = harness();
  await h.members.save(h.member);
  await h.sessions.revokeAllForMember({ workspaceId: WS, memberId: MEMBER, revokedAt: NOW });
  assert.deepEqual(h.keys, [MEMBER_LOCK]);
});

test("password persist takes the member lock (then its own session revoke re-enters the same key)", async () => {
  const h = harness();
  await h.members.save(h.member);
  await h.members.setPasswordHash({ workspaceId: WS, memberId: MEMBER, passwordHash: h.digest("old-password-1") });
  const { rawSessionToken } = await issueMemberSession({ deps: h.deps, member: h.member, nowIso: NOW });
  h.keys.length = 0;
  await setMemberPassword({ deps: h.deps, input: { workspaceId: WS, sessionToken: rawSessionToken, currentPassword: "old-password-1", password: "new-password-2" } });
  assert.ok(h.keys.length >= 1);
  assert.deepEqual([...new Set(h.keys)], [MEMBER_LOCK]);
  assert.equal(h.keys[0], MEMBER_LOCK, "the persist lock is taken first, before the revoke inside it");
});

test("Trash hide for the member entry takes the member lock", async () => {
  const h = harness();
  const entry = buildTrashRegistry().get("member");
  assert.ok(entry);
  await h.members.save(h.member);
  h.keys.length = 0;
  assert.equal((await createTableTrashAdapter({ entry, db: h.kernel }).hide({ workspaceId: WS, entityId: MEMBER, at: NOW, expectedVersion: null })).ok, true);
  assert.deepEqual(h.keys, [MEMBER_LOCK]);
});
