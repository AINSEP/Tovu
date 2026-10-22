import assert from "node:assert/strict";
import test from "node:test";
import type { ToolExecutionContext, ToolExecutionOptions } from "@jini-ai/core";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSystemClock } from "@jini-ai/core/primitives";
import type { MailerPort, MailerSendResult } from "../../../platform/mail/index.js";
import { buildMailStatusRegistrations, type MailStatusToolDeps } from "../tool-registrations.js";
import {
  createMailTestSendLimiter, planMailTestSend, readTestRecipient, runMailTestSend,
  TEST_SEND_BURST, TEST_SEND_DUPLICATE_MS, TEST_SEND_REFILL_MS, type MailTestSendDeps, type MailTestSendPlan,
} from "../test-send.js";

/**
 * @file The shared test-send operation (`test-send.ts`) behind `mail_send_test` and the admin
 * mail-test-send route: recipient rules, the truthful outcome mapping, the limiter, and the tool's
 * chosen recipient and test-mode card details. All ports are in-memory fakes.
 */

const OWNER = { principalId: "owner", workspaceId: "ws", username: "owner", email: "owner@example.com", passwordHash: "x" };
const T0 = Date.parse("2026-10-22T10:00:00.000Z");
const ok = (providerMessageId = "pm-1"): MailerSendResult => ({ ok: true, providerMessageId, acceptedAt: "2026-10-22T10:00:00.000Z" });

function mailerWith(result: MailerSendResult, driver = "smtp"): MailerPort & { sent: unknown[] } {
  const sent: unknown[] = [];
  return {
    sent,
    capabilities: () => ({ driver, supportsIdempotencyKey: true, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false }),
    send: async (message, options) => { sent.push({ message, options }); return result; },
    sendBatch: async () => [],
  };
}

function depsWith(overrides: Partial<MailTestSendDeps> = {}): MailTestSendDeps {
  return {
    workspaceId: "ws", mailer: mailerWith(ok()),
    userRepo: { findByPrincipalId: async () => OWNER },
    mailSenderIdentity: { resolve: async () => ({ email: "site@example.com", name: "Site" }) },
    ...overrides,
  };
}

const plan = (overrides: Partial<MailTestSendPlan> = {}): MailTestSendPlan => ({ to: "owner@example.com", chosen: false, driver: "smtp", ...overrides });

test("readTestRecipient: absent stays absent, one plain address is trimmed, anything else is refused", () => {
  assert.equal(readTestRecipient({ value: undefined }), undefined);
  assert.equal(readTestRecipient({ value: "  ops@example.com " }), "ops@example.com");
  for (const bad of ["", "   ", 3, null, "no-at-sign", "a@b", "Ops <ops@example.com>", "a@example.com, b@example.com", `${"a".repeat(250)}@example.com`]) {
    assert.throws(() => readTestRecipient({ value: bad }), { name: "ToolInputError", message: /^to must be one email address/ }, String(bad));
  }
});

test("planMailTestSend: the operator's own address by default, a username address next, a chosen one as given", async () => {
  assert.deepEqual(await planMailTestSend({ principalId: "owner" }, depsWith()), { to: "owner@example.com", chosen: false, driver: "smtp" });
  const byUsername = depsWith({ userRepo: { findByPrincipalId: async () => ({ ...OWNER, email: undefined, username: "ops@example.com" }) } });
  assert.equal((await planMailTestSend({ principalId: "owner" }, byUsername)).to, "ops@example.com");
  const none = depsWith({ userRepo: { findByPrincipalId: async () => null } });
  assert.deepEqual(await planMailTestSend({ principalId: "owner", to: "x@example.com" }, none), { to: "x@example.com", chosen: true, driver: "smtp" });
  await assert.rejects(planMailTestSend({ principalId: "owner" }, none), /Enter a recipient/);
  await assert.rejects(planMailTestSend({ principalId: "owner" }, depsWith({ userRepo: undefined })), /no email address/);
});

test("planMailTestSend: test mode is read so the plan names a redirect or a capture", async () => {
  assert.equal((await planMailTestSend({ principalId: "owner" }, depsWith({ mailTestMode: async () => ({ mode: "redirect", to: "qa@example.com" }) }))).redirectTo, "qa@example.com");
  assert.deepEqual(await planMailTestSend({ principalId: "owner" }, depsWith({ mailTestMode: async () => ({ mode: "capture" }) })), { to: "owner@example.com", chosen: false, driver: "smtp", capture: true });
  assert.deepEqual(await planMailTestSend({ principalId: "owner" }, depsWith({ mailTestMode: async () => ({ mode: "off" }) })), { to: "owner@example.com", chosen: false, driver: "smtp" });
});

test("runMailTestSend: accepted carries the provider's message id and the send keeps its lane and idempotency key", async () => {
  const mailer = mailerWith(ok());
  const result = await runMailTestSend({ principalId: "owner", plan: plan(), ref: "req-1" }, depsWith({ mailer }), { now: () => T0 });
  assert.deepEqual(result, { to: "owner@example.com", from: "site@example.com", driver: "smtp", at: "2026-10-22T10:00:00.000Z", outcome: "accepted", providerMessageId: "pm-1" });
  assert.deepEqual((mailer.sent[0] as { options: unknown }).options, { idempotencyKey: "mail:test:req-1", workspaceId: "ws", sourceContext: { module: "mail", ref: "req-1" }, purpose: "transactional", lane: "interactive" });
});

test("runMailTestSend: a capture id, the console driver and a redirect are reported as such, never as accepted", async () => {
  const captured = await runMailTestSend({ principalId: "owner", plan: plan({ capture: true }), ref: "r" }, depsWith({ mailer: mailerWith(ok("captured:42")) }), { now: () => T0 });
  assert.deepEqual([captured.outcome, (captured as { where: string }).where], ["captured", "capture"]);
  const consoleResult = await runMailTestSend({ principalId: "owner", plan: plan({ driver: "console" }), ref: "r" }, depsWith({ mailer: mailerWith(ok("console-1"), "console") }), { now: () => T0 });
  assert.deepEqual([consoleResult.outcome, (consoleResult as { where: string }).where], ["captured", "console"]);
  const redirected = await runMailTestSend({ principalId: "owner", plan: plan({ redirectTo: "qa@example.com" }), ref: "r" }, depsWith(), { now: () => T0 });
  assert.deepEqual(redirected, { to: "owner@example.com", from: "site@example.com", driver: "smtp", at: "2026-10-22T10:00:00.000Z", outcome: "redirected", redirectedTo: "qa@example.com", providerMessageId: "pm-1" });
});

test("runMailTestSend: a refusal keeps its own code, message, retryability and retry hint", async () => {
  const throttled = mailerWith({ ok: false, retryable: true, errorCode: "MAIL_RATE_LIMITED", message: "slow down", retryAfterMs: 900 });
  assert.deepEqual(await runMailTestSend({ principalId: "owner", plan: plan(), ref: "r" }, depsWith({ mailer: throttled }), { now: () => T0 }),
    { to: "owner@example.com", from: "site@example.com", driver: "smtp", at: "2026-10-22T10:00:00.000Z", outcome: "failed", errorCode: "MAIL_RATE_LIMITED", message: "slow down", retryable: true, retryAfterMs: 900 });
  const suppressed = mailerWith({ ok: false, retryable: false, errorCode: "MAIL_SUPPRESSED", message: "recipient is suppressed" });
  const result = await runMailTestSend({ principalId: "owner", plan: plan(), ref: "r" }, depsWith({ mailer: suppressed }));
  assert.equal(result.outcome, "failed");
  assert.equal("retryAfterMs" in result, false);
  assert.match(result.at, /^\d{4}-\d{2}-\d{2}T/);
});

test("runMailTestSend: the local limiter refuses a duplicate click and a drained bucket before any send", async () => {
  const mailer = mailerWith(ok());
  const limiter = { tryTake: () => ({ ok: false as const, reason: "duplicate" as const, retryAfterMs: 5 }) };
  assert.deepEqual(await runMailTestSend({ principalId: "owner", plan: plan(), ref: "r" }, depsWith({ mailer, mailTestSendLimiter: limiter }), { now: () => T0 }),
    { to: "owner@example.com", from: "site@example.com", driver: "smtp", at: "2026-10-22T10:00:00.000Z", outcome: "failed", errorCode: "MAIL_TEST_DUPLICATE", message: "A test email to this address was just sent; wait a moment before sending another.", retryable: true, retryAfterMs: 5 });
  const drained = { tryTake: () => ({ ok: false as const, reason: "rate_limited" as const, retryAfterMs: 7 }) };
  const result = await runMailTestSend({ principalId: "owner", plan: plan(), ref: "r" }, depsWith({ mailer, mailTestSendLimiter: drained }));
  assert.equal(result.outcome === "failed" && result.errorCode, "MAIL_TEST_RATE_LIMITED");
  assert.equal(mailer.sent.length, 0);
  // The limiter keys on the lower-cased recipient, so case changes are the same click.
  const keys: string[] = [];
  await runMailTestSend({ principalId: "owner", plan: plan({ to: "Owner@Example.com" }), ref: "r" }, depsWith({ mailTestSendLimiter: { tryTake: ({ to }) => { keys.push(to); return { ok: true }; } } }));
  assert.deepEqual(keys, ["owner@example.com"]);
});

test("createMailTestSendLimiter: a second click inside the window is a duplicate; it expires; another recipient is not one", () => {
  let now = T0;
  const limiter = createMailTestSendLimiter({}, { now: () => now });
  assert.deepEqual(limiter.tryTake({ principalId: "p", to: "a@x.co" }), { ok: true });
  now += 1_000;
  assert.deepEqual(limiter.tryTake({ principalId: "p", to: "a@x.co" }), { ok: false, reason: "duplicate", retryAfterMs: TEST_SEND_DUPLICATE_MS - 1_000 });
  assert.deepEqual(limiter.tryTake({ principalId: "p", to: "b@x.co" }), { ok: true });
  now += TEST_SEND_DUPLICATE_MS;
  assert.deepEqual(limiter.tryTake({ principalId: "p", to: "a@x.co" }), { ok: true });
});

test("createMailTestSendLimiter: the burst drains, then one token returns per refill interval", () => {
  let now = T0;
  const limiter = createMailTestSendLimiter({}, { now: () => now });
  for (let index = 0; index < TEST_SEND_BURST; index += 1) assert.deepEqual(limiter.tryTake({ principalId: "p", to: `r${index}@x.co` }), { ok: true });
  assert.deepEqual(limiter.tryTake({ principalId: "p", to: "late@x.co" }), { ok: false, reason: "rate_limited", retryAfterMs: TEST_SEND_REFILL_MS });
  now += TEST_SEND_REFILL_MS / 2;
  assert.deepEqual(limiter.tryTake({ principalId: "p", to: "late@x.co" }), { ok: false, reason: "rate_limited", retryAfterMs: TEST_SEND_REFILL_MS / 2 });
  now += TEST_SEND_REFILL_MS / 2;
  assert.deepEqual(limiter.tryTake({ principalId: "p", to: "late@x.co" }), { ok: true });
  const small = createMailTestSendLimiter({}, { now: () => now, burst: 1, refillMs: 10, duplicateMs: 1 });
  assert.deepEqual(small.tryTake({ principalId: "p", to: "a@x.co" }), { ok: true });
  assert.equal(small.tryTake({ principalId: "p", to: "b@x.co" }).ok, false);
  assert.equal(createMailTestSendLimiter().tryTake({ principalId: "p", to: "a@x.co" }).ok, true);
});

// ---------------------------------------------------------------------------------------------
// mail_send_test over the shared operation: chosen recipient and the card's test-mode line.
// ---------------------------------------------------------------------------------------------

const ctx: ToolExecutionContext = { executionId: "e", principal: { id: "owner" }, run: { id: "r" }, input: {}, signal: new AbortController().signal };

function sendTool(overrides: Partial<MailStatusToolDeps> = {}) {
  let count = 0;
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => `exchange-${++count}` }, defaultChannel: "mcp-ui" });
  const cards: unknown[] = [];
  const confirm: ToolExecutionOptions = { emitSurface: async (surface: unknown) => {
    cards.push(surface);
    store.deliver({ exchangeId: `exchange-${count}`, principalId: "owner", params: { decision: "confirm" } }, { toolId: "mail_send_test" });
  } };
  const mailer = mailerWith(ok());
  const deps: MailStatusToolDeps = { ...depsWith({ mailer }), authorize: async () => ({ allowed: true, reason: "grant" }), ...overrides };
  const registration = buildMailStatusRegistrations(deps, { surfaceExchanges: store }).find((r) => r.descriptor.id === "mail_send_test")!;
  return { call: (input: unknown) => registration.handler({ ...ctx, input }, confirm), cards, mailer };
}

test("mail_send_test sends to a chosen recipient and refuses a malformed one before any card", async () => {
  const f = sendTool();
  const result = await f.call({ to: "ops@example.com" }) as { sent: boolean; outcome: string; to: string };
  assert.deepEqual([result.sent, result.outcome, result.to], [true, "accepted", "ops@example.com"]);
  await assert.rejects(f.call({ to: "not an address" }), /to must be one email address/);
  assert.equal(f.cards.length, 1);
});

test("mail_send_test's card names a test-mode redirect or capture, and a capture is not reported as sent", async () => {
  const redirect = sendTool({ mailTestMode: async () => ({ mode: "redirect", to: "qa@example.com" }) });
  const redirected = await redirect.call({}) as { sent: boolean; outcome: string };
  assert.deepEqual([redirected.sent, redirected.outcome], [true, "redirected"]);
  assert.match(JSON.stringify(redirect.cards), /Redirected to qa@example\.com/);
  const capture = sendTool({ mailTestMode: async () => ({ mode: "capture" }), mailer: mailerWith(ok("captured:1")) });
  const captured = await capture.call({}) as { sent: boolean; outcome: string };
  assert.deepEqual([captured.sent, captured.outcome], [false, "captured"]);
  assert.match(JSON.stringify(capture.cards), /Captured on this server; nothing is sent/);
  const plain = sendTool();
  await plain.call({});
  assert.doesNotMatch(JSON.stringify(plain.cards), /Test mode/);
});
