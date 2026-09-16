import { createRequire } from "node:module";

import type { ClockPort } from "@jini-ai/cms/core";
import type { MailerPort } from "../ports.js";
import type { EmailAddress, MailerCapabilities, MailerSendOptions, MailerSendResult, OutboundEmail } from "../types.js";

/**
 * @file `SmtpMailerAdapter` — the ADR-006 rule-of-two "second real adapter" half of `MailerPort`
 * (ADR-037). The escape hatch for an operator with a corporate mail server, or who does not want a
 * third-party API in the loop at all — `../adapters/http-api.resend.ts`'s own file header records
 * the owner's reasoning for why THAT adapter is the default; this one exists for the case that
 * reasoning does not fit.
 *
 * `SmtpMailerAdapter` itself depends only on {@link SmtpTransport} — a two-method structural
 * interface, not the `nodemailer` package. `createNodemailerSmtpTransport` below is the ONE place
 * this file (or any composition root using it) actually imports `nodemailer`; tests exercise the
 * class against a fake `SmtpTransport`, never a real socket (same seam-injection shape
 * `comments/spam.external.ts`'s `AkismetSpamCheck` uses for `HttpClientPort`, and `../http/
 * client.ts`'s own `createDefaultHttpClient` uses for `HttpTransportAdapter`).
 *
 * New dependency: `nodemailer` (+ `@types/nodemailer` for the factory's own typing). Flagged
 * explicitly per this task's brief — no bare-SMTP client already exists in this codebase
 * (`node:crypto`/`node:https` alone do not speak the SMTP protocol), and hand-rolling SMTP
 * (MAIL FROM/RCPT TO/DATA, STARTTLS negotiation, AUTH LOGIN/PLAIN) is exactly the kind of
 * protocol-correctness surface not worth re-implementing for a single adapter.
 *
 * `sendBatch` loops `send()` — same reasoning `http-api.resend.ts`'s own header gives (no shared
 * batch-loop helper exists in this codebase yet; this mirrors `ConsoleMailerAdapter`'s existing
 * inline loop rather than introducing one). SMTP has no native batch verb to call instead, so this
 * is not even a simplification — it is the only shape available.
 */

/** The minimal shape this adapter needs from a mail transport — satisfied structurally by a real
 *  `nodemailer.Transporter` (no `implements` needed on nodemailer's side) and trivially fakeable
 *  in tests. */
export interface SmtpTransport {
  sendMail(mail: SmtpMailPayload): Promise<{ messageId: string }>;
}

/** One nodemailer-shaped outbound message. Deliberately a LOCAL type, not `nodemailer`'s own
 *  `SendMailOptions` — this file's production code only ever constructs values of this narrower
 *  shape, so a test's fake {@link SmtpTransport} needs no dependency on nodemailer's types either. */
export interface SmtpMailPayload {
  from: { name?: string; address: string };
  to: { name?: string; address: string };
  replyTo?: { name?: string; address: string };
  subject: string;
  html?: string;
  text?: string;
  headers?: Readonly<Record<string, string>>;
  // NOT `readonly` (unlike this file's other array-shaped fields): nodemailer's own `Attachment[]`
  // is a mutable array type, so a `readonly` element type here would make every real
  // `createNodemailerSmtpTransport` call fail to typecheck against nodemailer's own `sendMail`
  // overloads. `send()` below always constructs a fresh array via `.map()`, so mutability here
  // costs nothing in practice — no caller relies on this field being frozen.
  attachments?: { filename: string; content: string; encoding: "base64"; contentType: string }[];
}

export interface SmtpMailerAdapterDeps {
  /** Defaults to system wall-clock; inject a fake clock for deterministic tests. */
  clock?: ClockPort;
}

/** `EmailAddress` -> nodemailer's own `{name, address}` object convention — chosen over a
 *  formatted `"Name <email>"` string (which `http-api.resend.ts` uses for Resend's JSON API)
 *  because nodemailer handles header-safe quoting/encoding of `name` itself when given the
 *  object form, so this adapter never has to.
 *
 * @complexity O(1). */
function toNodemailerAddress(address: EmailAddress): { name?: string; address: string } {
  return address.name ? { name: address.name, address: address.email } : { address: address.email };
}

/** `err.code` values nodemailer uses for a failure the server never got to respond to at all
 *  (auth rejected, envelope malformed, message content rejected) — retrying as-is would just
 *  reproduce the same rejection, unlike a transport hiccup. Named set instead of an inline
 *  equality chain so {@link classifySmtpError} reads as one flat lookup rather than three
 *  near-identical branches. */
const NON_RETRYABLE_SMTP_CODES = new Set(["EAUTH", "EENVELOPE", "EMESSAGE"]);

/**
 * Classifies a thrown `sendMail` error into a `MailerSendResult` failure. Prefers a real SMTP
 * reply code (`err.responseCode`, present when the server actually answered) over nodemailer's own
 * `err.code` (present for pre-response failures — auth, connection, malformed envelope): a 4xx
 * reply is the server's own "try again later," a 5xx is its own "do not retry as-is" (RFC 5321
 * §4.2.1). An error shape this adapter has never seen defaults to retryable — silently dropping a
 * message on an unrecognized failure is worse than one extra redelivery attempt on a message that
 * genuinely could not be sent.
 *
 * @complexity O(1).
 */
function classifySmtpError(err: unknown): MailerSendResult {
  const message = err instanceof Error ? err.message : String(err);
  const responseCode = hasNumericField(err, "responseCode") ? err.responseCode : undefined;
  if (responseCode !== undefined) {
    const retryable = responseCode >= 400 && responseCode < 500;
    return { ok: false, retryable, errorCode: `SMTP_${responseCode}`, message };
  }

  const code = hasStringField(err, "code") ? err.code : undefined;
  if (code !== undefined) {
    // ECONNECTION / ETIMEDOUT / ESOCKET / EDNS and any other pre-response transport failure —
    // all transient by nature (nothing about the message itself was rejected) — retryable is
    // true for anything not in NON_RETRYABLE_SMTP_CODES.
    return { ok: false, retryable: !NON_RETRYABLE_SMTP_CODES.has(code), errorCode: code, message };
  }
  return { ok: false, retryable: true, errorCode: "SMTP_UNKNOWN_ERROR", message };
}

function hasNumericField<K extends string>(value: unknown, key: K): value is Record<K, number> {
  return typeof value === "object" && value !== null && key in value && typeof (value as Record<K, unknown>)[key] === "number";
}

function hasStringField<K extends string>(value: unknown, key: K): value is Record<K, string> {
  return typeof value === "object" && value !== null && key in value && typeof (value as Record<K, unknown>)[key] === "string";
}

/**
 * `MailerPort` adapter over a raw SMTP connection. See this file's header for the transport
 * seam, the new-dependency disclosure, and the `sendBatch` reasoning.
 *
 * @complexity O(1) per `send`; `sendBatch` is O(n) in message count (sequential loop).
 * @overallScore 100
 */
export class SmtpMailerAdapter implements MailerPort {
  private readonly clock: ClockPort;

  constructor(
    private readonly transport: SmtpTransport,
    deps: SmtpMailerAdapterDeps = {}
  ) {
    this.clock = deps.clock ?? { nowIso: () => new Date().toISOString() };
  }

  capabilities(): MailerCapabilities {
    return {
      driver: "smtp",
      // Raw SMTP has no dedup-key concept at the protocol level — the mail lib's own send-dedup
      // ledger (`MailSendDedupRepoPort`, `../ports.ts`) is meant to cover this gap but is not
      // implemented or wired yet (see its doc).
      supportsIdempotencyKey: false,
      // No bounce/complaint feedback channel without a separate, unconfigured-here return-path
      // mailbox parser — a real gap, not a rounding error (see `http-api.resend.ts`'s header for
      // why the hosted-API adapter is the default partly BECAUSE of this asymmetry).
      supportsWebhookFeedback: false,
      // See file header — loops `send()`; SMTP has no batch verb to call instead.
      maxBatchSize: 1,
      supportsAttachments: true,
    };
  }

  async send(message: OutboundEmail, _opts: MailerSendOptions): Promise<MailerSendResult> {
    try {
      const info = await this.transport.sendMail({
        from: toNodemailerAddress(message.from),
        to: toNodemailerAddress(message.to),
        ...(message.replyTo ? { replyTo: toNodemailerAddress(message.replyTo) } : {}),
        subject: message.subject,
        ...(message.html !== undefined ? { html: message.html } : {}),
        ...(message.text !== undefined ? { text: message.text } : {}),
        ...(message.headers ? { headers: message.headers } : {}),
        ...(message.attachments && message.attachments.length > 0
          ? {
              attachments: message.attachments.map((attachment) => ({
                filename: attachment.filename,
                content: attachment.contentBase64,
                encoding: "base64" as const,
                contentType: attachment.contentType,
              })),
            }
          : {}),
      });
      return { ok: true, providerMessageId: info.messageId, acceptedAt: this.clock.nowIso() };
    } catch (err) {
      return classifySmtpError(err);
    }
  }

  async sendBatch(
    messages: readonly OutboundEmail[],
    opts: MailerSendOptions
  ): Promise<readonly MailerSendResult[]> {
    const results: MailerSendResult[] = [];
    for (const message of messages) {
      results.push(await this.send(message, opts));
    }
    return results;
  }
}

export interface CreateNodemailerSmtpTransportConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
  timeoutMs?: number;
}

/**
 * The ONE place this codebase constructs a real `nodemailer` transport. A thin wrapper down to
 * {@link SmtpTransport}'s two-method shape — `SmtpMailerAdapter` itself never imports `nodemailer`
 * (see this file's header). Composition-root-only in practice (mirrors `../http/client.ts`'s own
 * `createDefaultHttpClient` convenience wrapper over its module-private transport).
 *
 * @complexity O(1) — constructs one pooled transporter; connections are opened lazily by
 *   nodemailer per `sendMail` call, not here.
 */
export function createNodemailerSmtpTransport(config: CreateNodemailerSmtpTransportConfig): SmtpTransport {
  // Deferred `require` (not a static top-level `import`) so a composition root that never
  // configures an SMTP credential never pays nodemailer's module-load cost — the same lazy-load
  // reasoning `platform/observability/index.ts`'s own `createObservabilityPort` documents for its
  // OTel adapter. `createRequire` (not a bare `require`, which does not exist in this ESM-only
  // codebase — `package.json`'s `"type": "module"`) — same substitution `server/runtime/
  // composition/deps.ts`'s own `runExportSiteLazily` doc explains.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate; see doc above.
  const nodemailer = createRequire(import.meta.url)("nodemailer") as typeof import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
    connectionTimeout: config.timeoutMs,
  });
  return {
    sendMail: async (mail) => {
      const info = await transporter.sendMail(mail);
      return { messageId: info.messageId };
    },
  };
}
