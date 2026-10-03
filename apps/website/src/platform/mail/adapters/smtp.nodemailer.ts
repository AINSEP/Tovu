/** Tovu SMTP wiring: lazily load the vendor and adapt existing host ports to Jini. */
import { createRequire } from "node:module";
// Delivery rationale lives in Jini/packages/platform/src/mail/smtp.ts; SMTP is the corporate-server
// escape hatch when the default hosted provider does not fit (ADR-037).
import type { ISODateTime } from "@jini-ai/core/primitives";
import {
  createNodemailerSmtpTransport as createJiniSmtpTransport,
  SmtpMailerAdapter as JiniSmtpMailerAdapter,
  type SmtpMailPayload,
} from "@jini-ai/platform/mail/smtp";
import type { MailerPort, MailerCapabilities, MailerSendOptions, MailerSendResult, OutboundEmail } from "../ports.js";
import { toTovuMailer } from "../purpose-scoped-mailer.js";
export type { SmtpMailPayload } from "@jini-ai/platform/mail/smtp";

/** Existing Tovu vendor seam; the Jini adapter receives an object-shaped wrapper. */
export interface SmtpTransport {
  sendMail(mail: SmtpMailPayload): Promise<{ messageId: string }>;
}
export interface SmtpMailerAdapterDeps {
  /** Retains the existing host clock seam; the constructor translates it to Jini's epoch clock. */
  clock?: { nowIso(): ISODateTime };
}

/** Preserves Tovu's constructor and consumer calls; Jini owns payloads and error classification. */
export class SmtpMailerAdapter implements MailerPort {
  private readonly mailer: MailerPort;

  constructor(transport: SmtpTransport, { clock = { nowIso: () => new Date().toISOString() } }: SmtpMailerAdapterDeps = {}) {
    this.mailer = toTovuMailer({ mailer: new JiniSmtpMailerAdapter({
      transport: { sendMail: ({ mail }) => transport.sendMail(mail) },
      clock: { nowMs: () => Date.parse(clock.nowIso()) },
    }) });
  }

  /** Reports SMTP delivery capabilities without connecting. */
  capabilities(): MailerCapabilities {
    return this.mailer.capabilities();
  }

  /** Sends through Jini's SMTP adapter and returns its classified outcome. */
  send(message: OutboundEmail, options: MailerSendOptions): Promise<MailerSendResult> {
    return this.mailer.send(message, options);
  }

  /** Uses Jini's sequential batch dispatch, retaining delivery metadata. */
  sendBatch(messages: readonly OutboundEmail[], options: MailerSendOptions): Promise<readonly MailerSendResult[]> {
    return this.mailer.sendBatch(messages, options);
  }
}

export interface CreateNodemailerSmtpTransportConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
  timeoutMs?: number;
}

/** Injects the lazily loaded nodemailer module into Jini; connections open only on send.
 * @example createNodemailerSmtpTransport({ host, port, secure, auth, timeoutMs })
 */
export function createNodemailerSmtpTransport({ timeoutMs, ...required }: CreateNodemailerSmtpTransportConfig): SmtpTransport {
  // Host owns vendor loading so sites without SMTP never load nodemailer.
  // createRequire is needed in this ESM module. Loading an npm vendor here avoids the duplicate
  // first-party TypeScript module graph that caused earlier require-based wiring bugs.
  const nodemailer: typeof import("nodemailer") = createRequire(import.meta.url)("nodemailer");
  const transport = createJiniSmtpTransport({ ...required, nodemailer }, { timeoutMs });
  return { sendMail: (mail) => transport.sendMail({ mail }) };
}
