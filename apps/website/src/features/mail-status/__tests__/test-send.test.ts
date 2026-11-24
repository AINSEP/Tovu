import assert from "node:assert/strict";
import test from "node:test";
import type { ToolExecutionContext, ToolExecutionOptions } from "@jini-ai/core";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSystemClock } from "@jini-ai/platform/system";
import type { PositionalMailer as MailerPort, MailerSendResult } from "@jini-ai/platform/mail";
import { buildMailStatusRegistrations, type MailStatusToolDeps } from "../tool-registrations.js";
import { planMailTestSend, runMailTestSend, type MailTestSendDeps, type MailTestSendPlan } from "@jini-ai/platform/mail/test-send";

/**
 * @file The shared test-send operation (`test-send.ts`) behind `mail_send_test` and the admin
 * mail-test-send route: recipient rules, the truthful outcome mapping, the limiter, and the tool's
 * chosen recipient and test-mode card details. All ports are in-memory fakes.
 */

const OWNER = { principalId: "owner", workspaceId: "ws", username: "owner", email: "owner@example.com", passwordHash: "x" };
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

test("real policy redirects the transport, captures locally, suppresses, and replays one request without another limiter token", async () => {
  const { createMailPolicyWrapper } = await import("../../../server/runtime/boot/mail-delivery-policy.js");
  for (const mode of [{ mode: "redirect" as const, to: "qa@example.com" }, { mode: "capture" as const }, { mode: "off" as const }]) {
    let suppressed = false, takes = 0; const captures: string[] = [];
    const transport = mailerWith(ok()); const ledgerRows = new Map<string, { outcome: "sent" | "reserved"; payloadHash: string; providerMessageId?: string }>();
    const mailer = createMailPolicyWrapper({
      ledger: { reserve: async input => { const row = ledgerRows.get(input.idempotencyKey); if (row) return { status: "existing", ...row }; ledgerRows.set(input.idempotencyKey, { outcome: "reserved", payloadHash: input.payloadHash }); return { status: "reserved" }; }, mark: async input => { const row = ledgerRows.get(input.idempotencyKey)!; ledgerRows.set(input.idempotencyKey, { ...row, outcome: input.outcome as "sent", providerMessageId: input.providerMessageId }); } },
      suppression: { isSuppressed: async () => suppressed, suppress: async () => {} }, readTestMode: async () => mode,
    }, { capture: { capture: async ({ message }) => { captures.push(message.to.email); return { id: "capture-1" }; } } })({ providerId: "smtp", provider: { capabilities: {} } as never, mailer: transport });
    const deps = depsWith({ mailer, mailTestMode: async () => mode, mailTestProvider: async () => "smtp", mailTestRequests: new Map(), mailTestSendLimiter: { tryTake: () => { takes++; return { ok: true }; } } });
    const prepared = await planMailTestSend({ deps, principalId: "owner" });
    const result = await runMailTestSend({ deps, principalId: "owner", plan: prepared, ref: "one" });
    const replay = await runMailTestSend({ deps, principalId: "owner", plan: prepared, ref: "one" });
    assert.deepEqual(replay, result); assert.equal(takes, 1);
    if (mode.mode === "capture") { assert.equal(result.outcome, "captured"); assert.deepEqual(captures, ["owner@example.com"]); assert.equal(transport.sent.length, 0); }
    else { assert.equal(result.outcome, mode.mode === "redirect" ? "redirected" : "accepted"); assert.equal((transport.sent[0] as { message: { to: { email: string } } }).message.to.email, mode.mode === "redirect" ? "qa@example.com" : "owner@example.com"); }
    suppressed = true;
    const refusal = await runMailTestSend({ deps, principalId: "owner", plan: prepared, ref: "two" });
    assert.equal(refusal.outcome === "failed" && refusal.errorCode, "MAIL_RECIPIENT_SUPPRESSED");
    assert.equal(transport.sent.length, mode.mode === "capture" ? 0 : 1); assert.equal(captures.length, mode.mode === "capture" ? 1 : 0);
  }
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

test("unknown outcomes stay unknown and cannot suggest automatic retry", async () => {
  const deps = depsWith({ mailer: mailerWith({ ok: false, unknown: true, retryable: true, errorCode: "MAIL_OUTCOME_UNKNOWN", message: "Provider acceptance is unknown" }) });
  const prepared = await planMailTestSend({ deps, principalId: "owner" });
  const result = await runMailTestSend({ deps, principalId: "owner", plan: prepared, ref: "unknown" });
  assert.equal(result.outcome, "unknown"); assert.equal("retryable" in result && result.retryable, false);
});

test("approval is refused after mode, provider, sender or redirect target changes, before taking a token", async () => {
  for (const change of ["mode", "provider", "sender", "recipient"] as const) {
    let mode: import("@jini-ai/core/contracts/mail").MailTestModeSetting = { mode: "redirect", to: "qa@example.com" };
    let provider = "smtp", from = "site@example.com", takes = 0; const mailer = mailerWith(ok());
    const deps = depsWith({ mailer, mailTestMode: async () => mode, mailTestProvider: async () => provider,
      mailSenderIdentity: { resolve: async () => ({ email: from }) }, mailTestSendLimiter: { tryTake: () => { takes++; return { ok: true }; } } });
    const prepared = await planMailTestSend({ deps, principalId: "owner" });
    if (change === "mode") mode = { mode: "off" }; if (change === "provider") provider = "other"; if (change === "sender") from = "other@example.com"; if (change === "recipient") mode = { mode: "redirect", to: "else@example.com" };
    await assert.rejects(runMailTestSend({ deps, principalId: "owner", plan: prepared, ref: change }), /configuration changed since approval/);
    assert.equal(takes, 0); assert.equal(mailer.sent.length, 0);
  }
});

test("provider failure text never reaches the shared operation or tool result", async () => {
  const failure: MailerSendResult = { ok: false, retryable: false, errorCode: "SMTP_AUTH", message: "token=super-secret recipient=private@example.com" };
  const deps = depsWith({ mailer: mailerWith(failure) });
  const result = await runMailTestSend({ deps, principalId: "owner", plan: await planMailTestSend({ deps, principalId: "owner" }), ref: "safe" });
  assert.equal("message" in result && result.message, "The provider refused the message (code SMTP_AUTH).");
  assert.doesNotMatch(JSON.stringify(result), /super-secret|private@example/);
  const tool = sendTool({ mailer: mailerWith(failure) });
  const toolResult = await tool.call({});
  assert.match(JSON.stringify(toolResult), /The provider refused the message/);
  assert.doesNotMatch(JSON.stringify(toolResult), /super-secret|private@example/);
});

