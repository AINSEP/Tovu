/**
 * @file RED regression suite for the Members half of the 2026-09-16 "always say the real reason"
 * sweep, modelled on `features/widgets/__tests__/integration/tool-registrations.delegated-error-
 * status.test.ts`: it drives the REAL delegated-tool-call transport (`delegatedToolExecuteRoute`
 * over a real `ToolRegistry`/`ToolExecutor`/`RunLifecycle`) so what is asserted is literally the
 * payload a spawned agent CLI receives, not a service-level approximation of it.
 *
 * RED before the fix, for every case below: `{ ok: false, error: { code: "INTERNAL_ERROR", message:
 * "an internal error occurred" } }`. Members had NO error reclassification of any kind — all four
 * wired tools sent every typed domain error (`MemberNotFoundError`, `MemberValidationError`, the
 * kit's `ForbiddenError`) into the SEC-005 redactor.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute } from "@jini-ai/daemon/http";

import {
  InMemoryMagicLinkTokenRepo,
  InMemoryMemberRepo,
  InMemoryMemberSessionRepo,
  InMemoryMemberSubscriptionRepo,
  InMemoryMemberTierRepo,
} from "../repo.memory.js";
import { buildMembersRegistrations, type MembersToolDeps } from "../tool-registrations.js";
import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { MemberConflictError, MemberAuthError } from "../types.js";

const WORKSPACE_ID = "ws-members-errors";
const PRINCIPAL_ID = "principal-1";
const NOW = "2026-09-16T00:00:00.000Z";

function makeRouteDeps(options: { allow?: boolean; allowEveryRequest?: boolean } = {}): MembersToolDeps {
  const allow = options.allow ?? true;
  let counter = 0;
  return {
    workspaceId: WORKSPACE_ID,
    clock: { nowMs: () => Date.parse(NOW) },
    idGen: { newId: () => `id-${++counter}` },
    memberRepo: new InMemoryMemberRepo(),
    memberTierRepo: new InMemoryMemberTierRepo(),
    memberSubscriptionRepo: new InMemoryMemberSubscriptionRepo(),
    memberSessionRepo: new InMemoryMemberSessionRepo(),
    magicLinkRepo: new InMemoryMagicLinkTokenRepo(),
    principalRepo: new InMemoryPrincipalRepo({}),
    mailer: {
      capabilities: () => ({ driver: "smtp", maxBatchSize: 1, supportsIdempotencyKey: false, supportsWebhookFeedback: false, supportsAttachments: true }),
      send: async () => ({ ok: true, providerMessageId: "message", acceptedAt: NOW }),
      sendBatch: async () => [],
    },
    magicLinkPerEmailLimiter: {
      check: async ({ key: _key }) => (options.allowEveryRequest === false ? { allowed: false, retryAfterSeconds: 42 } : { allowed: true }),
    },
    authorize: async () => (allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" }),
  };
}

async function buildHarness(routeDeps: MembersToolDeps) {
  const registry = createToolRegistry({});
  for (const registration of buildMembersRegistrations(routeDeps)) registry.register(registration);
  const toolExecutor = createToolExecutor({ registry });
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog() });
  const { run } = await lifecycle.start({ contextRef: "ctx-1" });
  return { run, lifecycle, toolExecutor, resolvePrincipal: () => ({ id: PRINCIPAL_ID }) };
}

type Harness = Awaited<ReturnType<typeof buildHarness>>;

async function call(harness: Harness, toolId: string, input: unknown) {
  return delegatedToolExecuteRoute.handle({ input: { runId: harness.run.id, toolUseId: `tu-${toolId}`, toolId, input }, deps: harness });
}

test("members_get_by_id for an unknown member is BAD_REQUEST with the real not-found reason, not a redacted 500", async () => {
  const harness = await buildHarness(makeRouteDeps());

  const result = await call(harness, "members_get_by_id", { memberId: "nope" });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: "MEMBERS_NOT_FOUND: member 'nope' was not found",
  });
});

test("members_disable for an unknown member is BAD_REQUEST with the real not-found reason", async () => {
  const harness = await buildHarness(makeRouteDeps());

  const result = await call(harness, "members_disable", { memberId: "ghost" });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: "MEMBERS_NOT_FOUND: member 'ghost' was not found",
  });
});

test("a denied principal gets the real authorization reason, naming the permission — not 'an internal error occurred'", async () => {
  const harness = await buildHarness(makeRouteDeps({ allow: false }));

  const result = await call(harness, "members_list", {});

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: `MEMBERS_FORBIDDEN: principal '${PRINCIPAL_ID}' is not authorized for 'member.manage' (insufficient_permission)`,
  });
});

test("every Members tool surfaces the denial, not just the first one — the sibling-arm check", async () => {
  for (const [toolId, input] of [
    ["members_list", {}],
    ["members_get_by_id", { memberId: "m-1" }],
    ["members_disable", { memberId: "m-1" }],
    ["members_request_magic_link", { email: "someone@example.com" }],
  ] as const) {
    const harness = await buildHarness(makeRouteDeps({ allow: false }));

    const result = await call(harness, toolId, input);

    assert.equal(result.ok, false, `${toolId}: expected a refusal`);
    if (result.ok) continue;
    assert.equal(result.error.code, "BAD_REQUEST", `${toolId}: still redacted — ${JSON.stringify(result.error)}`);
    assert.match(result.error.message, /^MEMBERS_FORBIDDEN: /, `${toolId}: ${result.error.message}`);
  }
});

test("members_request_magic_link with a malformed email says which value was rejected", async () => {
  const harness = await buildHarness(makeRouteDeps());

  const result = await call(harness, "members_request_magic_link", { email: "not-an-email" });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: "MEMBERS_VALIDATION_FAILED: 'not-an-email' is not a valid email address",
  });
});

test("members_request_magic_link over the per-email rate limit says so, with the retry delay", async () => {
  const harness = await buildHarness(makeRouteDeps({ allowEveryRequest: false }));

  const result = await call(harness, "members_request_magic_link", { email: "someone@example.com" });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: "MEMBERS_RATE_LIMITED: too many sign-in requests for 'someone@example.com' — retry after 42s",
  });
});


const MEMBER_VIEW = {
  id: "m-1", email: "alice@example.com", name: "Alice", status: "active" as const,
  emailVerifiedAt: "2026-09-15T00:00:00.000Z", createdAt: "2026-09-14T00:00:00.000Z", updatedAt: "2026-09-15T00:00:00.000Z", version: 3,
};

async function seedMember(deps: MembersToolDeps) {
  await deps.memberRepo.save({ ...MEMBER_VIEW, workspaceId: WORKSPACE_ID, note: "operator-only", fields: { private: "hidden" } });
}

function output(result: Awaited<ReturnType<typeof call>>) {
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error("expected success");
  return result.value.result.output;
}

test("all Members tools require member.manage and accept a principal with exactly that permission", async () => {
  for (const [toolId, input] of [
    ["members_list", {}], ["members_get_by_id", { memberId: "m-1" }],
    ["members_disable", { memberId: "m-1" }], ["members_request_magic_link", { email: "alice@example.com" }],
  ] as const) {
    for (const heldPermission of ["member.manage", "admin.menus.update"]) {
      const deps = makeRouteDeps();
      deps.authorize = async ({ permission }) => ({ allowed: permission === heldPermission, reason: permission === heldPermission ? "matched" : "insufficient_permission" });
      await seedMember(deps);
      const result = await call(await buildHarness(deps), toolId, input);
      if (heldPermission === "member.manage") {
        output(result);
      } else {
        assert.equal(result.ok, false, toolId);
        if (result.ok) throw new Error("expected refusal");
        assert.deepEqual(result.error, { code: "BAD_REQUEST", message: `MEMBERS_FORBIDDEN: principal '${PRINCIPAL_ID}' is not authorized for 'member.manage' (insufficient_permission)` });
      }
    }
  }
});

test("list, get, disable and magic-link success preserve the model-facing payloads", async () => {
  const deps = makeRouteDeps();
  await seedMember(deps);
  const harness = await buildHarness(deps);
  assert.deepEqual(output(await call(harness, "members_list", {})), { members: [MEMBER_VIEW] });
  assert.deepEqual(output(await call(harness, "members_get_by_id", { memberId: "m-1" })), { member: MEMBER_VIEW });
  const disabled = { ...MEMBER_VIEW, status: "disabled", updatedAt: NOW, version: 4 };
  assert.deepEqual(output(await call(harness, "members_disable", { memberId: "m-1" })), { member: disabled });
  assert.equal((await deps.memberRepo.findById({ workspaceId: WORKSPACE_ID, id: "m-1" }))?.status, "disabled");
  assert.deepEqual(output(await call(harness, "members_request_magic_link", { email: "other@example.com" })), { delivered: true, mailDeliveryAvailable: true });
  assert.equal((await deps.memberRepo.findByEmail({ workspaceId: WORKSPACE_ID, email: "other@example.com" }))?.status, "pending");
});

test("magic-link limiter shares normalized email budget and authorization denial spends none", async () => {
  const deps = makeRouteDeps();
  const keys: string[] = [];
  const counts = new Map<string, number>();
  deps.magicLinkPerEmailLimiter = { async check({ key }) {
    keys.push(key);
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    return count > 1 ? { allowed: false, retryAfterSeconds: 42 } : { allowed: true };
  } };
  let allowed = false;
  deps.authorize = async () => ({ allowed, reason: allowed ? "matched" : "insufficient_permission" });
  const harness = await buildHarness(deps);
  assert.equal((await call(harness, "members_request_magic_link", { email: "  ALICE@example.com  " })).ok, false);
  assert.deepEqual(keys, []);
  allowed = true;
  assert.deepEqual(output(await call(harness, "members_request_magic_link", { email: "  ALICE@example.com  " })), { delivered: true, mailDeliveryAvailable: true });
  const limited = await call(harness, "members_request_magic_link", { email: "alice@example.com" });
  assert.equal(limited.ok, false);
  if (limited.ok) throw new Error("expected rate limit");
  assert.deepEqual(limited.error, { code: "BAD_REQUEST", message: "MEMBERS_RATE_LIMITED: too many sign-in requests for 'alice@example.com' — retry after 42s" });
  assert.deepEqual(keys, ["alice@example.com", "alice@example.com"]);
  assert.deepEqual(output(await call(harness, "members_request_magic_link", { email: "bob@example.com" })), { delivered: true, mailDeliveryAvailable: true });
});

test("a repository conflict is model-facing while an unexpected auth error remains redacted", async () => {
  for (const [error, expected] of [
    [new MemberConflictError("member update conflicted"), { code: "BAD_REQUEST", message: "MEMBERS_CONFLICT: member update conflicted" }],
    [new MemberAuthError("sign-in link was already used"), { code: "INTERNAL_ERROR", message: "an internal error occurred" }],
  ] as const) {
    const deps = makeRouteDeps();
    deps.memberRepo.findById = async () => { throw error; };
    const result = await call(await buildHarness(deps), "members_get_by_id", { memberId: "m-1" });
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("expected failure");
    assert.deepEqual({ code: result.error.code, message: result.error.message }, expected);
  }
});

// REGRESSION (fix-plan C6b): `limit` went to the repo unchecked (-5 read as an empty page) and an
// `afterId` naming no member silently restarted from the first page.
test("members_list refuses a bad limit and an unknown afterId with the real reason; a valid afterId pages", async () => {
  const deps = makeRouteDeps();
  await seedMember(deps);
  const harness = await buildHarness(deps);

  for (const limit of [-5, 0, 1.5]) {
    const result = await call(harness, "members_list", { limit });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.deepEqual(result.error, { code: "BAD_REQUEST", message: "'limit' must be an integer between 1 and 100" });
  }
  const unknown = await call(harness, "members_list", { afterId: "ghost" });
  assert.equal(unknown.ok, false);
  if (unknown.ok) return;
  assert.deepEqual(unknown.error, { code: "BAD_REQUEST", message: "unknown afterId 'ghost'" });

  assert.deepEqual(output(await call(harness, "members_list", { afterId: "m-1" })), { members: [] });
  assert.deepEqual(output(await call(harness, "members_list", { limit: 500 })), { members: [MEMBER_VIEW] });
});
