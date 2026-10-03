import assert from "node:assert/strict";
import test from "node:test";
import type { ToolExecutionContext } from "@jini-ai/core";
import { InMemoryMagicLinkTokenRepo, InMemoryMemberRepo, InMemoryMemberSessionRepo, InMemoryMemberSubscriptionRepo, InMemoryMemberTierRepo } from "../repo.memory.js";
import { createRateLimiter, MAGIC_LINK_PER_EMAIL } from "../../../contracts/core/rate-limit/rate-limit.js";
import { ConsoleMailerAdapter } from "../mailer.console.js";
import { buildMembersRegistrations, type MembersToolDeps } from "../tool-registrations.js";

const NOTE = "Email sending is not configured: messages are printed to the server console and never leave this machine. Set up a mail provider agent plugin and save its key in Access Tokens to send real email.";
const NOW = "2026-10-01T00:00:00Z";
function harness(driver = "console", allowed = true) {
  let next = 0;
  const sent: string[] = [];
  const deps: MembersToolDeps = { workspaceId: "ws", clock: { nowIso: () => NOW, nowMs() { return Date.parse(this.nowIso()); } }, idGen: { newId: () => `m${++next}` }, memberRepo: new InMemoryMemberRepo(), memberTierRepo: new InMemoryMemberTierRepo(), memberSubscriptionRepo: new InMemoryMemberSubscriptionRepo(), memberSessionRepo: new InMemoryMemberSessionRepo(), magicLinkRepo: new InMemoryMagicLinkTokenRepo(),
    authorize: async () => ({ allowed, reason: "fixture grant" }), magicLinkPerEmailLimiter: { check: async ({ key: _key }) => ({ allowed: true }) },
    mailer: { capabilities: () => ({ ...new ConsoleMailerAdapter().capabilities(), driver }), send: async (message) => { sent.push(message.to.email); return { ok: true, providerMessageId: "message", acceptedAt: NOW }; }, sendBatch: async () => assert.fail("must not batch") },
  };
  const tool = buildMembersRegistrations(deps).find((r) => r.descriptor.id === "members_request_magic_link")!;
  const call = (email: string) => tool.handler({ executionId: "e", principal: { id: "owner" }, run: { id: "r" }, input: { email }, signal: new AbortController().signal } satisfies ToolExecutionContext);
  return { deps, sent, call };
}

test("mail off returns identical exact responses for existing, missing and disabled members", async () => {
  const { deps, call, sent } = harness();
  await deps.memberRepo.save({ id: "existing", workspaceId: "ws", email: "exists@example.com", status: "active", createdAt: NOW, updatedAt: NOW, version: 1 });
  await deps.memberRepo.save({ id: "disabled", workspaceId: "ws", email: "disabled@example.com", status: "disabled", createdAt: NOW, updatedAt: NOW, version: 1 });
  const expected = { delivered: false, mailDeliveryAvailable: false, note: NOTE };
  assert.deepEqual(await call("exists@example.com"), expected);
  assert.deepEqual(await call("missing@example.com"), expected);
  assert.deepEqual(await call("disabled@example.com"), expected);
  // The existing service still runs (validation/token behavior is unchanged); the console
  // adapter's acceptance is never represented as real delivery.
  assert.deepEqual(sent, ["exists@example.com", "missing@example.com"]);
});

test("mail on preserves constant success for registered, missing and disabled addresses", async () => {
  const { deps, call, sent } = harness("smtp");
  await deps.memberRepo.save({ id: "existing", workspaceId: "ws", email: "exists@example.com", status: "active", createdAt: NOW, updatedAt: NOW, version: 1 });
  await deps.memberRepo.save({ id: "disabled", workspaceId: "ws", email: "disabled@example.com", status: "disabled", createdAt: NOW, updatedAt: NOW, version: 1 });
  for (const email of ["exists@example.com", "missing@example.com", "disabled@example.com"]) assert.deepEqual(await call(email), { delivered: true, mailDeliveryAvailable: true });
  assert.deepEqual(sent, ["exists@example.com", "missing@example.com"]);
});

test("mail-off path retains authorization, rate limiting and email validation", async () => {
  const denied = harness("console", false);
  denied.deps.mailer.capabilities = () => assert.fail("must authorize first");
  await assert.rejects(() => denied.call("valid@example.com"), { message: "MEMBERS_FORBIDDEN: principal 'owner' is not authorized for 'member.manage' (fixture grant)" });
  const limited = harness();
  limited.deps.magicLinkPerEmailLimiter.check = async ({ key: _key }) => ({ allowed: false, retryAfterSeconds: 42 });
  await assert.rejects(() => limited.call("valid@example.com"), { message: "MEMBERS_RATE_LIMITED: too many sign-in requests for 'valid@example.com' — retry after 42s" });
  await assert.rejects(() => harness().call("not-an-email"), { message: "MEMBERS_VALIDATION_FAILED: 'not-an-email' is not a valid email address" });
});

test("mail availability is read after send resolves the boot-time console fallback", async () => {
  const { deps, call } = harness();
  let resolved = false;
  const initialCapabilities = deps.mailer.capabilities();
  deps.mailer.capabilities = () => ({ ...initialCapabilities, driver: resolved ? "smtp" : "console" });
  deps.mailer.send = async () => { resolved = true; return { ok: true, providerMessageId: "message", acceptedAt: NOW }; };
  assert.deepEqual(await call("valid@example.com"), { delivered: true, mailDeliveryAvailable: true });
});

test("lazy configuration is settled even for disabled members without sending them mail", async () => {
  const responses = [];
  for (const email of ["disabled@example.com", "existing@example.com", "missing@example.com"]) {
    const { deps, call, sent } = harness();
    await deps.memberRepo.save({ id: "disabled", workspaceId: "ws", email: "disabled@example.com", status: "disabled", createdAt: NOW, updatedAt: NOW, version: 1 });
    await deps.memberRepo.save({ id: "existing", workspaceId: "ws", email: "existing@example.com", status: "active", createdAt: NOW, updatedAt: NOW, version: 1 });
    let resolved = false;
    let settlements = 0;
    const capabilities = deps.mailer.capabilities();
    deps.mailer.capabilities = () => ({ ...capabilities, driver: resolved ? "smtp" : "console" });
    deps.settleMailer = async () => { settlements++; resolved = true; };
    responses.push(await call(email));
    assert.equal(settlements, 1);
    assert.deepEqual(sent, email === "disabled@example.com" ? [] : [email]);
  }
  assert.deepEqual(responses, Array.from({ length: 3 }, () => ({ delivered: true, mailDeliveryAvailable: true })));
});

test("whitespace-only email retains its model-facing validation error with the real limiter", async () => {
  const { deps, call } = harness();
  const limiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: deps.clock });
  deps.magicLinkPerEmailLimiter = limiter;
  await assert.rejects(() => call("   "), {
    message: "MEMBERS_VALIDATION_FAILED: '   ' is not a valid email address",
  });
  assert.equal(await limiter.size({}), 0);
});
