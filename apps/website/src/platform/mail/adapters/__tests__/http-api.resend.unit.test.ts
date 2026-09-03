import assert from "node:assert/strict";
import test from "node:test";

import type { HttpClientPort, HttpRequest, HttpResponse } from "../../../http/index.js";
import type { MailerSendOptions, OutboundEmail } from "../../index.js";
import { HttpApiMailerAdapter } from "../http-api.resend.js";

/**
 * @file `HttpApiMailerAdapter` (Resend) — exercised against a small, self-contained fake
 * `HttpClientPort`, NEVER a real network call. Mirrors `comments/__tests__/spam.external.test.ts`'s
 * own `FakeHttpClient` pattern (that adapter is this codebase's other outbound-HTTP-over-
 * `HttpClientPort` adapter).
 */

type ScriptedResponse = HttpResponse | (() => HttpResponse);

class FakeHttpClient implements HttpClientPort {
  readonly calls: HttpRequest[] = [];
  private readonly responses: readonly ScriptedResponse[];
  private cursor = 0;

  constructor(responses: readonly ScriptedResponse[] = [{ status: 200, headers: {}, bodyText: '{"id":"resend-id-1"}' }]) {
    this.responses = responses;
  }

  async send(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push(request);
    const entry = this.responses[Math.min(this.cursor, this.responses.length - 1)];
    this.cursor += 1;
    if (typeof entry === "function") return entry();
    return entry;
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

test("capabilities reports the resend driver shape", () => {
  const adapter = new HttpApiMailerAdapter(new FakeHttpClient(), { apiKey: "re_test" });
  assert.deepEqual(adapter.capabilities(), {
    driver: "resend",
    supportsIdempotencyKey: true,
    supportsWebhookFeedback: true,
    maxBatchSize: 1,
    supportsAttachments: true,
  });
});

test("send() POSTs to /emails with bearer auth, JSON body, and the idempotency key header", async () => {
  const http = new FakeHttpClient();
  const adapter = new HttpApiMailerAdapter(http, { apiKey: "re_test_key" });
  const result = await adapter.send(makeMessage(), SEND_OPTIONS);

  assert.equal(http.calls.length, 1);
  const req = http.calls[0];
  assert.equal(req.method, "POST");
  assert.equal(req.url, "https://api.resend.com/emails");
  assert.equal(req.headers.Authorization, "Bearer re_test_key");
  assert.equal(req.headers["content-type"], "application/json");
  assert.equal(req.headers["Idempotency-Key"], "idem-1");

  const body = JSON.parse(req.body ?? "{}") as Record<string, unknown>;
  assert.equal(body.from, "Tovu <no-reply@tovu.local>");
  assert.equal(body.to, "member@example.com");
  assert.equal(body.subject, "Your sign-in link");
  assert.equal(body.text, "short body");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.providerMessageId, "resend-id-1");
});

test("send() respects a custom baseUrl (test-injectable, no hardcoded host)", async () => {
  const http = new FakeHttpClient();
  const adapter = new HttpApiMailerAdapter(http, { apiKey: "re_test", baseUrl: "https://mail.example.internal" });
  await adapter.send(makeMessage(), SEND_OPTIONS);
  assert.equal(http.calls[0].url, "https://mail.example.internal/emails");
});

test("send() forwards attachments using Resend's snake_case field shape", async () => {
  const http = new FakeHttpClient();
  const adapter = new HttpApiMailerAdapter(http, { apiKey: "re_test" });
  await adapter.send(
    makeMessage({
      attachments: [{ filename: "invoice.pdf", contentType: "application/pdf", contentBase64: "QUFB" }],
    }),
    SEND_OPTIONS
  );
  const body = JSON.parse(http.calls[0].body ?? "{}") as { attachments?: unknown[] };
  assert.deepEqual(body.attachments, [{ filename: "invoice.pdf", content: "QUFB", content_type: "application/pdf" }]);
});

test("send() maps a 422 validation_error to a non-retryable failure with the provider's error name", async () => {
  const http = new FakeHttpClient([
    { status: 422, headers: {}, bodyText: JSON.stringify({ statusCode: 422, name: "validation_error", message: "Invalid `to` field" }) },
  ]);
  const adapter = new HttpApiMailerAdapter(http, { apiKey: "re_test" });
  const result = await adapter.send(makeMessage(), SEND_OPTIONS);
  assert.deepEqual(result, { ok: false, retryable: false, errorCode: "validation_error", message: "Invalid `to` field" });
});

test("send() maps a 429 rate_limit_exceeded to a retryable failure", async () => {
  const http = new FakeHttpClient([
    { status: 429, headers: {}, bodyText: JSON.stringify({ statusCode: 429, name: "rate_limit_exceeded", message: "Too many requests" }) },
  ]);
  const adapter = new HttpApiMailerAdapter(http, { apiKey: "re_test" });
  const result = await adapter.send(makeMessage(), SEND_OPTIONS);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.retryable, true);
    assert.equal(result.errorCode, "rate_limit_exceeded");
  }
});

test("send() maps a 500 to a retryable failure, and a 401 to a non-retryable one", async () => {
  const http500 = new FakeHttpClient([{ status: 500, headers: {}, bodyText: '{"name":"application_error","message":"oops"}' }]);
  const adapter500 = new HttpApiMailerAdapter(http500, { apiKey: "re_test" });
  const result500 = await adapter500.send(makeMessage(), SEND_OPTIONS);
  assert.equal(result500.ok, false);
  if (!result500.ok) assert.equal(result500.retryable, true);

  const http401 = new FakeHttpClient([{ status: 401, headers: {}, bodyText: '{"name":"missing_api_key","message":"no key"}' }]);
  const adapter401 = new HttpApiMailerAdapter(http401, { apiKey: "" });
  const result401 = await adapter401.send(makeMessage(), SEND_OPTIONS);
  assert.equal(result401.ok, false);
  if (!result401.ok) assert.equal(result401.retryable, false);
});

test("send() handles a non-JSON error body without throwing", async () => {
  const http = new FakeHttpClient([{ status: 503, headers: {}, bodyText: "<html>Service Unavailable</html>" }]);
  const adapter = new HttpApiMailerAdapter(http, { apiKey: "re_test" });
  const result = await adapter.send(makeMessage(), SEND_OPTIONS);
  assert.deepEqual(result, { ok: false, retryable: true, errorCode: "HTTP_503", message: "<html>Service Unavailable</html>" });
});

test("send() maps a thrown transport error (network failure/EgressPolicy refusal) to a retryable TRANSPORT_ERROR, never throws", async () => {
  const http = new FakeHttpClient([
    () => {
      throw new Error("egress to 'api.resend.com' rejected: resolved address is private");
    },
  ]);
  const adapter = new HttpApiMailerAdapter(http, { apiKey: "re_test" });
  const result = await adapter.send(makeMessage(), SEND_OPTIONS);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.retryable, true);
    assert.equal(result.errorCode, "TRANSPORT_ERROR");
    assert.match(result.message, /resolved address is private/);
  }
});

test("sendBatch() loops send() once per message, preserving result[i] <-> messages[i] ordering under partial failure", async () => {
  const http = new FakeHttpClient([
    { status: 200, headers: {}, bodyText: '{"id":"ok-1"}' },
    { status: 422, headers: {}, bodyText: '{"name":"validation_error","message":"bad address"}' },
    { status: 200, headers: {}, bodyText: '{"id":"ok-3"}' },
  ]);
  const adapter = new HttpApiMailerAdapter(http, { apiKey: "re_test" });
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
  if (results[0].ok) assert.equal(results[0].providerMessageId, "ok-1");
  if (results[2].ok) assert.equal(results[2].providerMessageId, "ok-3");
  assert.equal(http.calls.length, 3);
  assert.equal(http.calls[0].body ? (JSON.parse(http.calls[0].body) as { to: string }).to : "", "one@example.com");
  assert.equal(http.calls[2].body ? (JSON.parse(http.calls[2].body) as { to: string }).to : "", "three@example.com");
});

test("send() forwards replyTo, html, and custom headers when provided", async () => {
  const http = new FakeHttpClient();
  const adapter = new HttpApiMailerAdapter(http, { apiKey: "re_test" });
  await adapter.send(
    makeMessage({
      replyTo: { email: "support@example.com", name: "Support" },
      html: "<p>Hello</p>",
      headers: { "X-Custom": "val" },
    }),
    SEND_OPTIONS
  );
  const body = JSON.parse(http.calls[0].body ?? "{}") as Record<string, unknown>;
  assert.equal(body.reply_to, "Support <support@example.com>");
  assert.equal(body.html, "<p>Hello</p>");
  assert.deepEqual(body.headers, { "X-Custom": "val" });
});

test("send() falls back to opts.idempotencyKey if response JSON does not have string id", async () => {
  const http = new FakeHttpClient([{ status: 200, headers: {}, bodyText: "{}" }]);
  const adapter = new HttpApiMailerAdapter(http, { apiKey: "re_test" });
  const res = await adapter.send(makeMessage(), { ...SEND_OPTIONS, idempotencyKey: "fallback-key" });
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.providerMessageId, "fallback-key");
});

test("send() handles 409 conflict as retryable, and empty bodyText falls back to HTTP status message", async () => {
  const http409 = new FakeHttpClient([{ status: 409, headers: {}, bodyText: "" }]);
  const adapter = new HttpApiMailerAdapter(http409, { apiKey: "re_test" });
  const res = await adapter.send(makeMessage(), SEND_OPTIONS);
  assert.deepEqual(res, {
    ok: false,
    retryable: true,
    errorCode: "HTTP_409",
    message: "Resend responded with HTTP 409",
  });
});

test("send() handles non-Error thrown during transport", async () => {
  const http = new FakeHttpClient([
    () => {
      throw "string exception";
    },
  ]);
  const adapter = new HttpApiMailerAdapter(http, { apiKey: "re_test" });
  const res = await adapter.send(makeMessage(), SEND_OPTIONS);
  assert.deepEqual(res, {
    ok: false,
    retryable: true,
    errorCode: "TRANSPORT_ERROR",
    message: "string exception",
  });
});

test("send() uses timeoutMs from options when specified", async () => {
  const http = new FakeHttpClient();
  const adapter = new HttpApiMailerAdapter(http, { apiKey: "re_test", timeoutMs: 5000 });
  await adapter.send(makeMessage(), { ...SEND_OPTIONS, timeoutMs: 2500 });
  assert.equal(http.calls[0].timeoutMs, 2500);
});

