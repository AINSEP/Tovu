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
import { delegatedToolExecuteRoute } from "@jini-ai/http-kit";

import {
  InMemoryMagicLinkTokenRepo,
  InMemoryMemberRepo,
  InMemoryMemberSessionRepo,
  InMemoryMemberSubscriptionRepo,
  InMemoryMemberTierRepo,
} from "../repo.memory.js";
import { buildMembersRegistrations, type MembersToolDeps } from "../tool-registrations.js";

const WORKSPACE_ID = "ws-members-errors";
const PRINCIPAL_ID = "principal-1";
const NOW = "2026-09-16T00:00:00.000Z";

function makeRouteDeps(options: { allow?: boolean; allowEveryRequest?: boolean } = {}): MembersToolDeps {
  const allow = options.allow ?? true;
  let counter = 0;
  return {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    memberRepo: new InMemoryMemberRepo(),
    memberTierRepo: new InMemoryMemberTierRepo(),
    memberSubscriptionRepo: new InMemoryMemberSubscriptionRepo(),
    memberSessionRepo: new InMemoryMemberSessionRepo(),
    magicLinkRepo: new InMemoryMagicLinkTokenRepo(),
    mailer: { send: async () => undefined } as unknown as MembersToolDeps["mailer"],
    magicLinkPerEmailLimiter: {
      check: () => (options.allowEveryRequest === false ? { allowed: false, retryAfterSeconds: 42 } : { allowed: true }),
    },
    authorize: async () => (allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" }),
  };
}

async function buildHarness(routeDeps: MembersToolDeps) {
  const registry = createToolRegistry();
  for (const registration of buildMembersRegistrations(routeDeps)) registry.register(registration);
  const toolExecutor = createToolExecutor({ registry });
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog() });
  const { run } = await lifecycle.start({ contextRef: "ctx-1" });
  return { run, lifecycle, toolExecutor, resolvePrincipal: () => ({ id: PRINCIPAL_ID }) };
}

type Harness = Awaited<ReturnType<typeof buildHarness>>;

async function call(harness: Harness, toolId: string, input: unknown) {
  return delegatedToolExecuteRoute.handle({ runId: harness.run.id, toolUseId: `tu-${toolId}`, toolId, input }, harness);
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
