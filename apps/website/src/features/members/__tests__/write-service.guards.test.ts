import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryMagicLinkTokenRepo } from "../repo.memory.js";
import { memberChallengeStore } from "../write-service.js";
import { requestSignInLink } from "../write-service.js";
import { MemberValidationError } from "../types.js";

/**
 * @file F6 fix wave (L7 Stryker survivors in write-service.ts): the member challenge store refuses a
 * non-member realm and a missing identity, and the address validator is anchored at both ends.
 */

const identity = { memberId: "m-1", createdAt: "2026-10-25T00:00:00.000Z" };
const record = { id: "c-1", workspaceId: "ws", realm: "member", purpose: "signin", tokenHash: "t", codeHash: null, failedAttempts: 0, expiresAt: "2026-10-25T00:15:00.000Z" };

test("a member-realm challenge with an identity is saved under that identity", async () => {
  const repo = new InMemoryMagicLinkTokenRepo();
  await memberChallengeStore({ repo, identity }).save(record as never);
  const saved = await repo.findById({ workspaceId: "ws", id: "c-1" });
  assert.equal(saved?.memberId, "m-1");
  assert.equal(saved?.purpose, "signin");
});

for (const [label, store, input] of [
  ["an admin-realm challenge (cross-realm reuse)", { identity }, { ...record, realm: "admin" }],
  ["a challenge without the deferred member identity", {}, record],
] as const) {
  test(`${label} is refused and nothing is stored`, async () => {
    const repo = new InMemoryMagicLinkTokenRepo();
    await assert.rejects(memberChallengeStore({ repo, ...store }).save(input as never), { message: "Member challenge issuance requires member identity" });
    assert.equal(await repo.findById({ workspaceId: "ws", id: "c-1" }), null);
  });
}

for (const email of ["x ada@example.test", "ada@example.test x", "ada@@example.test", "ada@example", "@example.test", "ada@.test x", "ada@exa mple.test", ""]) {
  test(`the member address validator refuses ${JSON.stringify(email)} before any write`, async () => {
    const repo = new InMemoryMagicLinkTokenRepo();
    await assert.rejects(requestSignInLink({ deps: { magicLinks: repo } as never, input: { workspaceId: "ws", email } }),
      (error: unknown) => error instanceof MemberValidationError && error.message === `'${email}' is not a valid email address`);
  });
}
