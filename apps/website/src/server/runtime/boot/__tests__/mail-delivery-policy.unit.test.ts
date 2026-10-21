import assert from "node:assert/strict";
import test from "node:test";

import type { MailCapturePort, MailProviderModule, MailSendLedgerPort, MailSuppressionRepoPort } from "@jini-ai/platform/mail";

import type { MailTestModeSetting } from "#src/features/settings/mail-provider";
import type { MailerPort, MailerSendOptions, OutboundEmail } from "#src/platform/mail/index";
import { createMailPolicyWrapper, resendPolicyFor } from "../mail-delivery-policy.js";

/**
 * @file The Tovu decorator around Jini's delivery policy: ledger + suppression on every send, the
 * per-provider token bucket, per-send test mode, per-module resend policy and per-message batch keys.
 */

const WS = "ws-1";
const MESSAGE: OutboundEmail = { workspaceId: WS, to: { email: "Reader@Example.com" }, from: { email: "news@example.com" }, subject: "hi", text: "hi" };
const OPTIONS: MailerSendOptions = { idempotencyKey: "k1", workspaceId: WS, sourceContext: { module: "forms" } };

interface Row { outcome: "reserved" | "sent" | "failed" | "unknown"; payloadHash: string; providerMessageId?: string }

/** In-memory ledger keyed like the SQL one; `failed` rows flip back to reserved. */
function memoryLedger(): MailSendLedgerPort & { rows: Map<string, Row> } {
  const rows = new Map<string, Row>();
  const key = (r: { workspaceId: string; idempotencyKey: string; recipient: string }) => `${r.workspaceId}|${r.idempotencyKey}|${r.recipient}`;
  return {
    rows,
    async reserve(input) {
      const existing = rows.get(key(input));
      if (existing && existing.outcome !== "failed") return { status: "existing", outcome: existing.outcome, payloadHash: existing.payloadHash, ...(existing.providerMessageId ? { providerMessageId: existing.providerMessageId } : {}) };
      rows.set(key(input), { outcome: "reserved", payloadHash: input.payloadHash });
      return { status: "reserved" };
    },
    async mark(input) {
      const row = rows.get(key(input))!;
      rows.set(key(input), { ...row, outcome: input.outcome, ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {}) });
    },
  };
}

function suppression(suppressed: readonly string[] = []): MailSuppressionRepoPort {
  return { isSuppressed: async ({ normalizedAddress }) => suppressed.includes(normalizedAddress), suppress: async () => {} };
}

function recordingMailer(result: Awaited<ReturnType<MailerPort["send"]>> = { ok: true, providerMessageId: "pm-1", acceptedAt: "2026-10-21T00:00:00.000Z" }): MailerPort & { calls: { message: OutboundEmail; options: MailerSendOptions }[] } {
  const calls: { message: OutboundEmail; options: MailerSendOptions }[] = [];
  return {
    calls,
    capabilities: () => ({ driver: "fixture", supportsIdempotencyKey: false, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false }),
    send: async (message, options) => { calls.push({ message, options }); return result; },
    sendBatch: async () => { throw new Error("the policy never forwards a batch"); },
  };
}

function provider(rateLimit?: { perSecond: number; burst: number }): MailProviderModule {
  return { id: "fixture", label: "Fixture", credentialKeys: [], capabilities: { hosted: true, feedback: false, domainVerification: false, ...(rateLimit ? { rateLimit } : {}) }, create: () => { throw new Error("unused"); } };
}

function wrapper(options: { testMode?: MailTestModeSetting; suppressed?: string[]; capture?: MailCapturePort; now?: () => number } = {}) {
  const ledger = memoryLedger();
  const wrap = createMailPolicyWrapper(
    { ledger, suppression: suppression(options.suppressed), readTestMode: async () => options.testMode ?? { mode: "off" } },
    { ...(options.capture ? { capture: options.capture } : {}), ...(options.now ? { now: options.now } : {}) },
  );
  return { ledger, wrap };
}

test("resendPolicyFor: sign-in links never re-send; other mail may re-send once unknown", () => {
  assert.equal(resendPolicyFor({ options: { sourceContext: { module: "members" }, purpose: "transactional" } }), "never");
  assert.equal(resendPolicyFor({ options: { sourceContext: { module: "x" }, purpose: "feature:magic_link" } }), "never");
  assert.equal(resendPolicyFor({ options: { sourceContext: { module: "newsletter" }, purpose: "transactional" } }), "on_unknown");
  assert.equal(resendPolicyFor({ options: { sourceContext: { module: "forms" } } }), "on_unknown");
});

test("a send is reserved, dispatched in Tovu's call shape and marked sent; a replay returns the receipt without re-sending", async () => {
  const { ledger, wrap } = wrapper();
  const inner = recordingMailer();
  const mailer = wrap({ providerId: "fixture", provider: provider(), mailer: inner });
  assert.equal(mailer.capabilities().driver, "fixture");
  assert.equal((await mailer.send(MESSAGE, OPTIONS)).ok, true);
  assert.deepEqual(inner.calls, [{ message: MESSAGE, options: OPTIONS }]);
  assert.equal([...ledger.rows.values()][0]!.outcome, "sent");
  const replay = await mailer.send(MESSAGE, OPTIONS);
  assert.equal(replay.ok && replay.providerMessageId, "pm-1");
  assert.equal(inner.calls.length, 1);
});

test("a suppressed recipient is refused before dispatch", async () => {
  const inner = recordingMailer();
  const mailer = wrapper({ suppressed: ["reader@example.com"] }).wrap({ providerId: "fixture", provider: provider(), mailer: inner });
  const result = await mailer.send(MESSAGE, OPTIONS);
  assert.equal(!result.ok && result.errorCode, "MAIL_RECIPIENT_SUPPRESSED");
  assert.equal(inner.calls.length, 0);
});

test("redirect test mode rewrites the recipient to the operator address", async () => {
  const inner = recordingMailer();
  const mailer = wrapper({ testMode: { mode: "redirect", to: "owner@example.com" } }).wrap({ providerId: "fixture", provider: provider(), mailer: inner });
  await mailer.send(MESSAGE, OPTIONS);
  assert.equal(inner.calls[0]!.message.to.email, "owner@example.com");
  assert.equal(inner.calls[0]!.message.headers?.["X-Original-To"], "Reader@Example.com");
});

test("capture test mode stores the message and sends nothing; without a capture store it refuses", async () => {
  const captured: string[] = [];
  const capture: MailCapturePort = { capture: async ({ message }) => { captured.push(message.subject); return { id: "c1" }; } };
  const inner = recordingMailer();
  const result = await wrapper({ testMode: { mode: "capture" }, capture }).wrap({ providerId: "fixture", provider: provider(), mailer: inner }).send(MESSAGE, OPTIONS);
  assert.equal(result.ok && result.providerMessageId, "captured:c1");
  assert.deepEqual(captured, ["hi"]);
  const refused = await wrapper({ testMode: { mode: "capture" } }).wrap({ providerId: "fixture", provider: provider(), mailer: inner }).send(MESSAGE, OPTIONS);
  assert.equal(!refused.ok && refused.errorCode, "MAIL_TEST_CAPTURE_UNAVAILABLE");
  assert.equal(inner.calls.length, 0);
});

test("a provider rate limit is one bucket per provider id, shared across wrapped instances, and refuses retryably", async () => {
  const { wrap } = wrapper({ now: () => 0 });
  const limited = provider({ perSecond: 1, burst: 1 });
  const first = wrap({ providerId: "fixture", provider: limited, mailer: recordingMailer() });
  const second = wrap({ providerId: "fixture", provider: limited, mailer: recordingMailer() });
  assert.equal((await first.send(MESSAGE, OPTIONS)).ok, true);
  const refused = await second.send(MESSAGE, { ...OPTIONS, idempotencyKey: "k2" });
  assert.deepEqual(!refused.ok && { code: refused.errorCode, retryable: refused.retryable, after: refused.retryAfterMs }, { code: "MAIL_RATE_LIMITED", retryable: true, after: 1000 });
});

test("sendBatch dispatches each recipient under its own derived key", async () => {
  const inner = recordingMailer();
  const mailer = wrapper().wrap({ providerId: "fixture", provider: provider(), mailer: inner });
  const results = await mailer.sendBatch([MESSAGE, { ...MESSAGE, to: { email: "b@example.com" } }], OPTIONS);
  assert.equal(results.length, 2);
  assert.deepEqual(inner.calls.map((call) => call.options.idempotencyKey), ["k1:0", "k1:1"]);
});

test("the wrapper's options are optional", async () => {
  const wrap = createMailPolicyWrapper({ ledger: memoryLedger(), suppression: suppression(), readTestMode: async () => ({ mode: "off" }) });
  assert.equal((await wrap({ providerId: "fixture", provider: provider(), mailer: recordingMailer() }).send(MESSAGE, OPTIONS)).ok, true);
});

test("a rate-limited provider uses the wall clock when no clock is injected", async () => {
  const mailer = wrapper().wrap({ providerId: "fixture", provider: provider({ perSecond: 10, burst: 5 }), mailer: recordingMailer() });
  assert.equal((await mailer.send(MESSAGE, OPTIONS)).ok, true);
});
