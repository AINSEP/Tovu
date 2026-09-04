import assert from "node:assert/strict";
import test from "node:test";

import type { MailerSendOptions, OutboundEmail } from "../../index.js";
import { SmtpMailerAdapter, type SmtpMailPayload, type SmtpTransport } from "../smtp.nodemailer.js";

/**
 * @file `SmtpMailerAdapter` — exercised against a fake `SmtpTransport`, NEVER a real SMTP socket
 * (`createNodemailerSmtpTransport`, the one function that touches the real `nodemailer` package,
 * is intentionally NOT exercised here — see this file's header on `smtp.nodemailer.ts` for why it
 * is kept to a single, thin, untested-by-design wrapper: there is nothing left to unit-test once
 * the real transport call is mocked out, and a live SMTP send is explicitly out of bounds for this
 * suite).
 */

class FakeSmtpTransport implements SmtpTransport {
  readonly calls: SmtpMailPayload[] = [];
  private readonly outcomes: readonly (() => { messageId: string })[];
  private cursor = 0;

  constructor(outcomes: readonly (() => { messageId: string })[] = [() => ({ messageId: "smtp-id-1" })]) {
    this.outcomes = outcomes;
  }

  async sendMail(mail: SmtpMailPayload): Promise<{ messageId: string }> {
    this.calls.push(mail);
    const outcome = this.outcomes[Math.min(this.cursor, this.outcomes.length - 1)];
    this.cursor += 1;
    return outcome();
  }
}

const SEND_OPTIONS: MailerSendOptions = {
  idempotencyKey: "idem-1",
  workspaceId: "ws-1",
  sourceContext: { module: "members" },
};

function makeMessage(overrides: Partial<OutboundEmail> = {}): OutboundEmail {
  return {
    workspaceId: "ws-1",
    to: { email: "member@example.com" },
    from: { email: "no-reply@tovu.local", name: "Tovu" },
    subject: "Your sign-in link",
    text: "short body",
    ...overrides,
  };
}

test("capabilities reports the smtp driver shape", () => {
  const adapter = new SmtpMailerAdapter(new FakeSmtpTransport());
  assert.deepEqual(adapter.capabilities(), {
    driver: "smtp",
    supportsIdempotencyKey: false,
    supportsWebhookFeedback: false,
    maxBatchSize: 1,
    supportsAttachments: true,
  });
});

test("send() maps addresses to nodemailer's {name,address} object form and returns the provider messageId", async () => {
  const transport = new FakeSmtpTransport();
  const adapter = new SmtpMailerAdapter(transport, { clock: { nowIso: () => "2026-08-31T00:00:00.000Z" } });
  const result = await adapter.send(makeMessage({ replyTo: { email: "support@tovu.local" } }), SEND_OPTIONS);

  assert.equal(transport.calls.length, 1);
  const mail = transport.calls[0];
  assert.deepEqual(mail.from, { name: "Tovu", address: "no-reply@tovu.local" });
  assert.deepEqual(mail.to, { address: "member@example.com" });
  assert.deepEqual(mail.replyTo, { address: "support@tovu.local" });
  assert.equal(mail.subject, "Your sign-in link");
  assert.equal(mail.text, "short body");
  assert.deepEqual(result, { ok: true, providerMessageId: "smtp-id-1", acceptedAt: "2026-08-31T00:00:00.000Z" });
});

test("send() forwards attachments base64-encoded", async () => {
  const transport = new FakeSmtpTransport();
  const adapter = new SmtpMailerAdapter(transport);
  await adapter.send(
    makeMessage({ attachments: [{ filename: "invoice.pdf", contentType: "application/pdf", contentBase64: "QUFB" }] }),
    SEND_OPTIONS
  );
  assert.deepEqual(transport.calls[0].attachments, [
    { filename: "invoice.pdf", content: "QUFB", encoding: "base64", contentType: "application/pdf" },
  ]);
});

test("send() maps a 5xx SMTP reply code to a non-retryable failure", async () => {
  const transport = new FakeSmtpTransport([
    () => {
      const err = new Error("550 5.1.1 The email account does not exist") as Error & { responseCode: number };
      err.responseCode = 550;
      throw err;
    },
  ]);
  const adapter = new SmtpMailerAdapter(transport);
  const result = await adapter.send(makeMessage(), SEND_OPTIONS);
  assert.deepEqual(result, {
    ok: false,
    retryable: false,
    errorCode: "SMTP_550",
    message: "550 5.1.1 The email account does not exist",
  });
});

test("send() maps a 4xx SMTP reply code to a retryable failure", async () => {
  const transport = new FakeSmtpTransport([
    () => {
      const err = new Error("451 4.3.0 Temporary server error") as Error & { responseCode: number };
      err.responseCode = 451;
      throw err;
    },
  ]);
  const adapter = new SmtpMailerAdapter(transport);
  const result = await adapter.send(makeMessage(), SEND_OPTIONS);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.retryable, true);
    assert.equal(result.errorCode, "SMTP_451");
  }
});

test("send() maps EAUTH (bad credentials) to a non-retryable failure", async () => {
  const transport = new FakeSmtpTransport([
    () => {
      const err = new Error("Invalid login") as Error & { code: string };
      err.code = "EAUTH";
      throw err;
    },
  ]);
  const adapter = new SmtpMailerAdapter(transport);
  const result = await adapter.send(makeMessage(), SEND_OPTIONS);
  assert.deepEqual(result, { ok: false, retryable: false, errorCode: "EAUTH", message: "Invalid login" });
});

test("send() maps EENVELOPE (malformed envelope) to a non-retryable failure", async () => {
  const transport = new FakeSmtpTransport([
    () => {
      const err = new Error("No recipients defined") as Error & { code: string };
      err.code = "EENVELOPE";
      throw err;
    },
  ]);
  const adapter = new SmtpMailerAdapter(transport);
  const result = await adapter.send(makeMessage(), SEND_OPTIONS);
  assert.deepEqual(result, { ok: false, retryable: false, errorCode: "EENVELOPE", message: "No recipients defined" });
});

test("send() maps EMESSAGE (rejected message content) to a non-retryable failure", async () => {
  const transport = new FakeSmtpTransport([
    () => {
      const err = new Error("Message content rejected") as Error & { code: string };
      err.code = "EMESSAGE";
      throw err;
    },
  ]);
  const adapter = new SmtpMailerAdapter(transport);
  const result = await adapter.send(makeMessage(), SEND_OPTIONS);
  assert.deepEqual(result, { ok: false, retryable: false, errorCode: "EMESSAGE", message: "Message content rejected" });
});

test("send() maps ECONNECTION (transport failure, no server response) to a retryable failure", async () => {
  const transport = new FakeSmtpTransport([
    () => {
      const err = new Error("connect ECONNREFUSED") as Error & { code: string };
      err.code = "ECONNECTION";
      throw err;
    },
  ]);
  const adapter = new SmtpMailerAdapter(transport);
  const result = await adapter.send(makeMessage(), SEND_OPTIONS);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.retryable, true);
    assert.equal(result.errorCode, "ECONNECTION");
  }
});

test("send() defaults an unrecognized error shape to retryable rather than dropping the message", async () => {
  const transport = new FakeSmtpTransport([
    () => {
      throw new Error("something nodemailer has never told us about");
    },
  ]);
  const adapter = new SmtpMailerAdapter(transport);
  const result = await adapter.send(makeMessage(), SEND_OPTIONS);
  assert.deepEqual(result, {
    ok: false,
    retryable: true,
    errorCode: "SMTP_UNKNOWN_ERROR",
    message: "something nodemailer has never told us about",
  });
});

test("sendBatch() loops send() once per message, preserving result[i] <-> messages[i] ordering under partial failure", async () => {
  const transport = new FakeSmtpTransport([
    () => ({ messageId: "ok-1" }),
    () => {
      const err = new Error("550 rejected") as Error & { responseCode: number };
      err.responseCode = 550;
      throw err;
    },
    () => ({ messageId: "ok-3" }),
  ]);
  const adapter = new SmtpMailerAdapter(transport);
  const messages = [
    makeMessage({ to: { email: "one@example.com" } }),
    makeMessage({ to: { email: "two@example.com" } }),
    makeMessage({ to: { email: "three@example.com" } }),
  ];
  const results = await adapter.sendBatch(messages, SEND_OPTIONS);

  assert.equal(results.length, 3);
  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, false);
  assert.equal(results[2].ok, true);
  assert.equal(transport.calls.length, 3);
  assert.equal(transport.calls[0].to.address, "one@example.com");
  assert.equal(transport.calls[2].to.address, "three@example.com");
});
