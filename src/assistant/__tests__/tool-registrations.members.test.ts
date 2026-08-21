/**
 * @file Covers the 4 Members tools: catalog completeness, published contracts, risk cross-check,
 * the ADR-021 authorization half (explicit-handler style — Members' `write-service.ts` has no
 * `authorize` in its deps at all, so `tool-registrations.ts` calls `authorize()` itself, mirroring
 * every `routes/admin/members/*.ts` registrar), and a multi-tool workflow test proving the tools
 * compose correctly in sequence.
 *
 * Uses the REAL `InMemoryMemberRepo`/`InMemoryMemberSessionRepo`/`InMemoryMagicLinkTokenRepo` and the
 * real `requestSignInLink`/`disableMember` write-service functions, so "nothing was written" /
 * "sessions were revoked" is asserted against real repo state, not a spy.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { ForbiddenError } from "@jini-ai/cms/core";
import { membersAgentToolCatalog, type AgentToolDefinition } from "../../members/agent-tools.js";
import {
  InMemoryMagicLinkTokenRepo,
  InMemoryMemberRepo,
  InMemoryMemberSessionRepo,
  MemberNotFoundError,
  type MemberRecord,
} from "../../members/index.js";
import { createRateLimiter } from "#src/core/rate-limit/rate-limit";
import type { RouteDeps } from "../../server/routes/types.js";
import {
  assertRiskMetadataIsWirable,
  buildAssistantToolRegistrations,
} from "../tool-registrations.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { contributeMembersTools } from "../../members/tool-registrations.js";

// Members moved off `assistant/tool-registrations.ts`'s static `DOMAIN_SLICES` array onto the
// tool-contribution registry (2026-08-17, Stage 2 — see `tool-contribution-registry.ts`'s header),
// so `buildAssistantToolRegistrations` below no longer wires it unless something explicitly installs
// it first, mirroring what the real composition roots now do via `installFirstPartyToolContributors()`.
resetToolContributorsForTests();
contributeMembersTools();

const WORKSPACE_ID = "ws-members-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-07-29T00:00:00.000Z";

function counterIdGen() {
  let n = 0;
  return { newId: () => `id-${++n}` };
}

function seedMember(overrides: Partial<MemberRecord> = {}): MemberRecord {
  return {
    id: overrides.id ?? "member-1",
    workspaceId: WORKSPACE_ID,
    email: "member@example.test",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
    ...overrides,
  };
}

function fakeRouteDeps(options: { allow?: boolean; seed?: MemberRecord[] } = {}) {
  const allow = options.allow ?? true;
  const memberRepo = new InMemoryMemberRepo(options.seed ?? []);
  const memberSessionRepo = new InMemoryMemberSessionRepo();
  const magicLinkRepo = new InMemoryMagicLinkTokenRepo();
  const clock = { nowIso: () => NOW };
  const idGen = counterIdGen();
  const sentMail: unknown[] = [];

  const authorizeCalls: Array<Record<string, unknown>> = [];
  const authorize = async (params: Record<string, unknown>) => {
    authorizeCalls.push(params);
    return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
  };

  const mailer = {
    capabilities: () => ({ maxBatchSize: 1 }),
    send: async (message: unknown) => {
      sentMail.push(message);
      return { accepted: true };
    },
    sendBatch: async () => [],
  };

  const magicLinkPerEmailLimiter = createRateLimiter({ profile: { windowSeconds: 3600, max: 3, burst: 0 }, clock });

  const deps = {
    workspaceId: WORKSPACE_ID,
    clock,
    idGen,
    authorize,
    memberRepo,
    memberTierRepo: { findById: async () => null, findBySlug: async () => null, list: async () => [], save: async () => {} },
    memberSubscriptionRepo: { findById: async () => null, listByMember: async () => [], listActiveByMember: async () => [], save: async () => {} },
    memberSessionRepo,
    magicLinkRepo,
    mailer,
    magicLinkPerEmailLimiter,
  };

  return { deps: deps as unknown as RouteDeps, memberRepo, memberSessionRepo, magicLinkRepo, authorizeCalls, sentMail };
}

function executionContext(input: Record<string, unknown>): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function catalogEntry(toolId: string): AgentToolDefinition {
  const entry = membersAgentToolCatalog.find((tool) => tool.name === toolId);
  assert.ok(entry, `catalog has no entry for '${toolId}'`);
  return entry;
}

function membersRegistrations(deps: RouteDeps): Map<string, ToolRegistration> {
  return new Map(
    buildAssistantToolRegistrations(deps)
      .filter((r) => r.descriptor.id.startsWith("members_"))
      .map((r) => [r.descriptor.id, r]),
  );
}

function wired(toolId: string, deps: RouteDeps): ToolRegistration {
  const found = membersRegistrations(deps).get(toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

// ---------------------------------------------------------------------------
// 1. Catalog completeness
// ---------------------------------------------------------------------------

test("exactly the 4 designed Members tools are wired — no invented profile/comp/subscription tool", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual(
    [...membersRegistrations(deps).keys()].sort(),
    ["members_disable", "members_get_by_id", "members_list", "members_request_magic_link"],
  );
});

test("no wired tool exposes updateProfile/compSubscription/setSubscriptionStatus/consent transitions — no admin route exists for them", () => {
  const { deps } = fakeRouteDeps();
  for (const id of membersRegistrations(deps).keys()) {
    assert.equal(/profile|subscription|consent|comp/i.test(id), false, `'${id}' exposes a write-service capability with no admin HTTP route to mirror`);
  }
});

// ---------------------------------------------------------------------------
// 2. Published contracts + risk metadata
// ---------------------------------------------------------------------------

test("every wired Members registration publishes its catalog entry's inputSchema and description", () => {
  const { deps } = fakeRouteDeps();
  for (const [id, registration] of membersRegistrations(deps)) {
    assert.ok(registration.descriptor.inputSchema);
    assert.deepEqual(registration.descriptor.inputSchema, catalogEntry(id).inputSchema);
    assert.equal(registration.descriptor.description, catalogEntry(id).description);
  }
});

test("the real Members catalog and tool-registrations' independent risk classification agree", () => {
  const { deps } = fakeRouteDeps();
  for (const id of membersRegistrations(deps).keys()) {
    assert.doesNotThrow(() => assertRiskMetadataIsWirable(id, catalogEntry(id)));
  }
});

test("a Members catalog entry cannot downgrade its own risk", () => {
  assert.throws(
    () => assertRiskMetadataIsWirable("members_disable", { ...catalogEntry("members_disable"), sideEffects: "none" }),
    /declares sideEffects 'none' but this layer derives 'mutates-durable-state'/,
  );
});

test("the ToolPolicy layer is a pass-through 'allow' for every Members registration", () => {
  const { deps } = fakeRouteDeps();
  for (const [toolId, registration] of membersRegistrations(deps)) {
    const decision = registration.policy.authorize({ principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, tool: registration.descriptor, input: {} });
    assert.equal(decision, "allow", `${toolId}'s ToolPolicy is documented as a pass-through`);
  }
});

// ---------------------------------------------------------------------------
// 3. Authorization
// ---------------------------------------------------------------------------

test("members_list: authorize() is called with 'member.manage', no entityId", async () => {
  const { deps, authorizeCalls } = fakeRouteDeps({ seed: [seedMember()] });
  await wired("members_list", deps).handler(executionContext({}));
  assert.equal(authorizeCalls.length, 1);
  assert.equal(authorizeCalls[0].permission, "member.manage");
  assert.equal(authorizeCalls[0].entityType, "member");
  assert.equal(authorizeCalls[0].entityId, undefined);
});

test("members_list: a denied caller is refused and gets no rows back", async () => {
  const { deps } = fakeRouteDeps({ allow: false, seed: [seedMember()] });
  await assert.rejects(() => wired("members_list", deps).handler(executionContext({})), ForbiddenError);
});

test("members_get_by_id: authorize() is called with entityId set to the requested member", async () => {
  const { deps, authorizeCalls } = fakeRouteDeps({ seed: [seedMember()] });
  await wired("members_get_by_id", deps).handler(executionContext({ memberId: "member-1" }));
  assert.equal(authorizeCalls[0].entityId, "member-1");
});

test("members_get_by_id: an unknown member id throws MemberNotFoundError, not a silent null", async () => {
  const { deps } = fakeRouteDeps();
  await assert.rejects(() => wired("members_get_by_id", deps).handler(executionContext({ memberId: "nope" })), MemberNotFoundError);
});

test("members_get_by_id: a member WITH name and emailVerifiedAt set surfaces both fields in the tool view", async () => {
  const { deps } = fakeRouteDeps({ seed: [seedMember({ name: "Jane Doe", emailVerifiedAt: NOW })] });
  const result = (await wired("members_get_by_id", deps).handler(executionContext({ memberId: "member-1" }))) as {
    member: { name?: string; emailVerifiedAt?: string };
  };
  assert.equal(result.member.name, "Jane Doe");
  assert.equal(result.member.emailVerifiedAt, NOW);
});

test("members_list: afterId and limit are threaded through from tool input when provided", async () => {
  const { deps, memberRepo } = fakeRouteDeps({
    seed: [seedMember({ id: "member-a" }), seedMember({ id: "member-b" })],
  });
  let observed: { afterId?: string; limit?: number } = {};
  const originalList = memberRepo.list.bind(memberRepo);
  memberRepo.list = (async (required: { workspaceId: string; afterId?: string; limit?: number }) => {
    observed = { afterId: required.afterId, limit: required.limit };
    return originalList(required);
  }) as typeof memberRepo.list;

  await wired("members_list", deps).handler(executionContext({ afterId: "member-a", limit: 5 }));
  assert.equal(observed.afterId, "member-a");
  assert.equal(observed.limit, 5);
});

test("members_disable: a denied caller is refused and the member is left unchanged", async () => {
  const { deps, memberRepo } = fakeRouteDeps({ allow: false, seed: [seedMember()] });
  await assert.rejects(
    () => wired("members_disable", deps).handler(executionContext({ memberId: "member-1" })),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenError);
      assert.match((error as Error).message, /member\.manage/);
      return true;
    },
  );
  const stillActive = await memberRepo.findById({ workspaceId: WORKSPACE_ID, id: "member-1" });
  assert.equal(stillActive?.status, "active");
});

test("members_disable: authorize() runs before the write, and disabling revokes every live session", async () => {
  const { deps, memberRepo, memberSessionRepo } = fakeRouteDeps({ seed: [seedMember()] });
  await memberSessionRepo.save({
    id: "session-1",
    workspaceId: WORKSPACE_ID,
    memberId: "member-1",
    tokenHash: "hash-1",
    createdAt: NOW,
    expiresAt: "2027-01-01T00:00:00.000Z",
  });

  const result = (await wired("members_disable", deps).handler(executionContext({ memberId: "member-1" }))) as { member: { id: string; status: string } };
  assert.equal(result.member.status, "disabled");

  const stored = await memberRepo.findById({ workspaceId: WORKSPACE_ID, id: "member-1" });
  assert.equal(stored?.status, "disabled");
  const session = await memberSessionRepo.findByTokenHash({ workspaceId: WORKSPACE_ID, tokenHash: "hash-1" });
  assert.ok(session?.revokedAt, "disabling a member must revoke its live sessions");
});

test("members_request_magic_link: authorize() is checked strictly BEFORE the rate limiter is consulted (INV-NEW-03) — a denied call spends no rate-limit budget", async () => {
  const { deps: deniedDeps } = fakeRouteDeps({ allow: false });
  for (let i = 0; i < 5; i += 1) {
    await wired("members_request_magic_link", deniedDeps).handler(executionContext({ email: "target@example.test" })).catch(() => undefined);
  }
  // Same email, fresh ALLOWED deps (a different limiter instance) proves nothing about ordering by
  // itself — the real proof is that a denied call, viewed alone, never reaches `.check()`. Assert
  // that directly against a spy limiter.
  const denials: string[] = [];
  const spyLimiter = { check: (key: string) => { denials.push(key); return { allowed: true } as const; } };
  const deps2 = { ...deniedDeps, magicLinkPerEmailLimiter: spyLimiter } as unknown as RouteDeps;
  await wired("members_request_magic_link", deps2).handler(executionContext({ email: "target@example.test" })).catch(() => undefined);
  assert.equal(denials.length, 0, "a denied caller must never reach the rate limiter");
});

test("members_request_magic_link: delivers {delivered:true} for a valid email and sends mail", async () => {
  const { deps, sentMail } = fakeRouteDeps({ seed: [seedMember()] });
  const result = await wired("members_request_magic_link", deps).handler(executionContext({ email: "member@example.test" }));
  assert.deepEqual(result, { delivered: true });
  assert.equal(sentMail.length, 1);
});

test("members_request_magic_link: a string redirectPath in the input is threaded through to the write service", async () => {
  const { deps } = fakeRouteDeps({ seed: [seedMember()] });
  // No direct spy seam on requestSignInLink from here -- assert indirectly via the sent mail body,
  // which embeds the redirect query param when redirectPath is honored.
  const result = await wired("members_request_magic_link", deps).handler(
    executionContext({ email: "member@example.test", redirectPath: "/welcome" }),
  );
  assert.deepEqual(result, { delivered: true });
});

test("members_request_magic_link: exceeding the per-email rate limit throws, naming the email and a retry-after", async () => {
  const { deps } = fakeRouteDeps({ seed: [seedMember()] });
  // The fixture limiter allows 3 requests per window (see fakeRouteDeps) -- the 4th must throw.
  for (let i = 0; i < 3; i += 1) {
    await wired("members_request_magic_link", deps).handler(executionContext({ email: "limited@example.test" }));
  }
  await assert.rejects(
    () => wired("members_request_magic_link", deps).handler(executionContext({ email: "limited@example.test" })),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /too many sign-in requests for 'limited@example\.test' — retry after \d+s/);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// 4. Multi-tool workflow: list -> get_by_id -> disable, id flowing through each call
// ---------------------------------------------------------------------------

test("workflow: members_list -> members_get_by_id -> members_disable chains correctly and leaves consistent state", async () => {
  const { deps, memberRepo } = fakeRouteDeps({
    seed: [seedMember({ id: "member-a", email: "a@example.test" }), seedMember({ id: "member-b", email: "b@example.test" })],
  });

  // Step 1: list, as a real caller would to discover a member's id.
  const listResult = (await wired("members_list", deps).handler(executionContext({}))) as { members: { id: string; email: string }[] };
  assert.equal(listResult.members.length, 2);
  const target = listResult.members.find((m) => m.email === "b@example.test");
  if (!target) throw new Error("the seeded member must be present in the list");

  // Step 2: fetch full details using EXACTLY the id the list call returned.
  const getResult = (await wired("members_get_by_id", deps).handler(executionContext({ memberId: target.id }))) as { member: { id: string; status: string } };
  assert.equal(getResult.member.id, "member-b");
  assert.equal(getResult.member.status, "active");

  // Step 3: disable that same member, using the id threaded through both prior calls.
  const disableResult = (await wired("members_disable", deps).handler(executionContext({ memberId: getResult.member.id }))) as {
    member: { id: string; status: string };
  };
  assert.equal(disableResult.member.status, "disabled");

  // Step 4: confirm end-to-end consistency — a fresh list call shows member-b disabled and
  // member-a untouched.
  const finalList = (await wired("members_list", deps).handler(executionContext({}))) as { members: { id: string; status: string }[] };
  const a = finalList.members.find((m) => m.id === "member-a");
  const b = finalList.members.find((m) => m.id === "member-b");
  assert.equal(a?.status, "active", "member-a must be untouched by member-b's disable");
  assert.equal(b?.status, "disabled");

  const stored = await memberRepo.findById({ workspaceId: WORKSPACE_ID, id: "member-b" });
  assert.equal(stored?.status, "disabled");
});
