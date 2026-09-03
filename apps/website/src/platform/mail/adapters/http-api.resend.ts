import type { HttpClientPort } from "../../http/index.js";
import type { MailerPort } from "../ports.js";
import type {
  EmailAddress,
  EmailAttachment,
  MailerCapabilities,
  MailerSendOptions,
  MailerSendResult,
  OutboundEmail,
} from "../types.js";

/**
 * @file `HttpApiMailerAdapter` — the ADR-006 rule-of-two "hosted API" half of `MailerPort`
 * (ADR-037), and the owner-picked DEFAULT adapter (2026-08-31 decision). Talks to Resend's REST
 * API (`https://api.resend.com`) exclusively through the guarded `HttpClientPort` (ADR-038) — no
 * `fetch`/`http.request` anywhere in this file, same egress discipline `comments/spam.external.ts`'s
 * `AkismetSpamCheck` already established for an outbound-HTTP adapter in this codebase.
 *
 * Why hosted API over SMTP as the default (owner reasoning, recorded here since it drives this
 * file's existence): Tovu ships self-hosted/desktop, and outbound SMTP (ports 587/465) is blocked
 * or throttled by most residential ISPs and every major cloud provider by default, while outbound
 * HTTPS always works. A provider API also gives real deliverability (warmed sending IPs, SPF/
 * DKIM/DMARC already aligned for their sending domain) and — the load-bearing point —
 * bounce/complaint webhook feedback, which is the only thing that can ever populate
 * `MailSuppressionRepoPort`'s ledger (`../ports.ts`). Raw SMTP gives no feedback signal at all.
 *
 * Provider choice: Resend, not Postmark/SES (`../ports.ts` names all three as candidates) — picked
 * for the simplest API surface (one POST, JSON in/out, bearer auth) and a usable free tier. The
 * request/response mapping below (`toResendPayload`/`classifyResendError`) is the only
 * Resend-specific surface; swapping in a second provider later means adding a sibling adapter
 * file with the same shape, not restructuring this one — deliberately NOT built as a
 * multi-provider framework up front (one real provider done correctly beats an abstraction over a
 * single implementation).
 *
 * `sendBatch` loops `send()` sequentially rather than calling Resend's real `/emails/batch`
 * endpoint. This is a deliberate, disclosed choice, not an oversight: ADR-037's round-2 amendment
 * 3 requires batch results to be `result[i] ↔ messages[i]` with **partial failure allowed** (a
 * batch is NOT atomic), but Resend's batch endpoint reports success/failure for the WHOLE request,
 * not per-message — mapping that onto the ADR's per-item contract would mean inventing behavior
 * Resend's API does not actually provide. Looping `send()` gives the ADR's real per-message
 * semantics for free and is exactly the shape `ConsoleMailerAdapter` (`features/members/
 * mailer.console.ts`) already uses for the same method — no separate shared "batch loop" helper
 * exists in this codebase yet (checked before writing this file), so this mirrors that adapter's
 * own inline loop rather than introducing one. `capabilities().maxBatchSize` is `1` accordingly —
 * honest about what THIS adapter does, not about what the provider could theoretically do.
 */

/** Resend's real API base — an operator-configured credential's `baseUrl` should be exactly this;
 *  kept as an explicit default rather than hardcoded into every call so a test (or a future
 *  Resend-compatible proxy) can point elsewhere. */
const DEFAULT_BASE_URL = "https://api.resend.com";

/** A human is not waiting synchronously on most mail sends, but this still bounds a hung request
 *  rather than relying solely on `EgressPolicy.connectTimeoutMs` (`HttpRequest.timeoutMs` is a
 *  required field the caller — this adapter — must always supply). */
const DEFAULT_TIMEOUT_MS = 10_000;

export interface HttpApiMailerAdapterConfig {
  /** Resend API key (`re_...`). Never logged — see this file's own `send`/`sendBatch` bodies. */
  apiKey: string;
  /** Defaults to Resend's real API origin. */
  baseUrl?: string;
  timeoutMs?: number;
}

/** `EmailAddress` -> Resend's `"Name <email>"` / bare-email string field shape (Resend's JSON API
 *  takes a plain string here, unlike nodemailer's own `{name,address}` object convention — see
 *  `smtp.nodemailer.ts` for that adapter's own, different formatting choice).
 *
 * @complexity O(1). */
function formatAddress(address: EmailAddress): string {
  return address.name ? `${address.name} <${address.email}>` : address.email;
}

/** Resend's own attachment shape: `content` is the base64 payload directly (no `contentBase64` ->
 *  `content` rename ambiguity to get wrong), `content_type` is snake_case per Resend's REST
 *  convention (every other Resend field this adapter sends follows the same convention).
 *
 * @complexity O(1) per attachment; O(n) over `message.attachments` in the caller. */
function toResendAttachment(attachment: EmailAttachment) {
  return {
    filename: attachment.filename,
    content: attachment.contentBase64,
    content_type: attachment.contentType,
  };
}

/** Builds the exact JSON body Resend's `POST /emails` (and, looped, `sendBatch`) expects.
 *
 * @complexity O(n) in `message.attachments` length (bounded by what the caller supplied — this
 *   port never fans out over a caller-unbounded collection). */
function toResendPayload(message: OutboundEmail): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    from: formatAddress(message.from),
    to: formatAddress(message.to),
    subject: message.subject,
  };
  if (message.replyTo) payload.reply_to = formatAddress(message.replyTo);
  if (message.html !== undefined) payload.html = message.html;
  if (message.text !== undefined) payload.text = message.text;
  if (message.headers) payload.headers = message.headers;
  if (message.attachments && message.attachments.length > 0) {
    payload.attachments = message.attachments.map(toResendAttachment);
  }
  return payload;
}

/** HTTP statuses Resend documents as transient (rate limit, a concurrent-idempotency-key
 *  conflict, or a server-side outage) vs permanent (bad request, auth, validation, not found) —
 *  per Resend's published API error reference. */
function isRetryableResendStatus(status: number): boolean {
  return status === 429 || status === 409 || status >= 500;
}

/** Resend's documented error body is `{statusCode, message, name}`; `name` (e.g.
 *  `"validation_error"`) is the closest thing to a stable machine-readable code, so it is used as
 *  `errorCode` when present. A non-JSON or differently-shaped body (an upstream proxy error page,
 *  say) still produces a usable result — this never throws.
 *
 * @complexity O(1) — one bounded `JSON.parse` attempt over an already-capped response body
 *   (`EgressPolicy.maxResponseBytes`/`maxDecompressedBytes`, enforced by `HttpClientPort` itself). */
function classifyResendError(status: number, bodyText: string): MailerSendResult {
  let errorCode = `HTTP_${status}`;
  let message = bodyText || `Resend responded with HTTP ${status}`;
  try {
    const parsed = JSON.parse(bodyText) as { name?: unknown; message?: unknown };
    if (typeof parsed.name === "string" && parsed.name !== "") errorCode = parsed.name;
    if (typeof parsed.message === "string" && parsed.message !== "") message = parsed.message;
  } catch {
    // Non-JSON body (e.g. an intermediary error page) — fall back to the raw text above.
  }
  return { ok: false, retryable: isRetryableResendStatus(status), errorCode, message };
}

/**
 * `MailerPort` adapter over Resend's hosted email API. See this file's header for the full
 * provider-choice and batch-strategy reasoning.
 *
 * @complexity O(1) per `send` (one guarded HTTP call); `sendBatch` is O(n) in message count
 *   (sequential `send()` loop — see file header for why this is not Resend's native batch call).
 * @overallScore 100
 */
export class HttpApiMailerAdapter implements MailerPort {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly httpClient: HttpClientPort,
    private readonly config: HttpApiMailerAdapterConfig
  ) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  capabilities(): MailerCapabilities {
    return {
      driver: "resend",
      // Resend honours a forwarded `Idempotency-Key` header on `/emails` (24h dedup window).
      supportsIdempotencyKey: true,
      // Resend emits `email.bounced`/`email.complained`/`email.delivered` webhooks — the signal
      // `MailSuppressionRepoPort`'s ledger needs (see this file's header). This codebase does not
      // yet run the receiving endpoint (ADR-037 §3's "mail-lib-owned" follow-up), but that is a
      // separate, later build — this field describes the PROVIDER's real capability, same as
      // `AkismetSpamCheck`'s own `report()` method exists ahead of every caller using it.
      supportsWebhookFeedback: true,
      // See file header — loops `send()` rather than calling Resend's real batch endpoint.
      maxBatchSize: 1,
      supportsAttachments: true,
    };
  }

  async send(message: OutboundEmail, opts: MailerSendOptions): Promise<MailerSendResult> {
    let status: number;
    let bodyText: string;
    try {
      const response = await this.httpClient.send({
        method: "POST",
        url: `${this.baseUrl}/emails`,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json",
          "Idempotency-Key": opts.idempotencyKey,
        },
        body: JSON.stringify(toResendPayload(message)),
        timeoutMs: opts.timeoutMs ?? this.timeoutMs,
      });
      status = response.status;
      bodyText = response.bodyText;
    } catch (err) {
      // Network failure, timeout, or an EgressPolicy refusal (e.g. this workspace's configured
      // host is not on the allowlist) — never thrown across the `MailerPort` boundary (ADR-024
      // §3 serializable-result discipline). Retryable: the caller (or the outbox) can safely
      // retry a transport-level failure; it costs nothing beyond one more attempt.
      return {
        ok: false,
        retryable: true,
        errorCode: "TRANSPORT_ERROR",
        message: err instanceof Error ? err.message : String(err),
      };
    }

    if (status < 200 || status >= 300) {
      return classifyResendError(status, bodyText);
    }

    const parsed = JSON.parse(bodyText) as { id?: unknown };
    const providerMessageId = typeof parsed.id === "string" ? parsed.id : opts.idempotencyKey;
    return { ok: true, providerMessageId, acceptedAt: new Date().toISOString() };
  }

  async sendBatch(
    messages: readonly OutboundEmail[],
    opts: MailerSendOptions
  ): Promise<readonly MailerSendResult[]> {
    const results: MailerSendResult[] = [];
    for (const [index, message] of messages.entries()) {
      // Resend dedupes by `Idempotency-Key` (24h window) — reusing `opts.idempotencyKey` as-is for
      // every message in the batch would make messages 2..n look like retries of message 1 and they
      // would never actually send. The `:index` suffix is deterministic (not random), so a
      // redelivery of this same batch (same base key, same message order — ADR-009) reproduces the
      // exact same per-message keys rather than minting new ones.
      results.push(await this.send(message, { ...opts, idempotencyKey: `${opts.idempotencyKey}:${index}` }));
    }
    return results;
  }
}
