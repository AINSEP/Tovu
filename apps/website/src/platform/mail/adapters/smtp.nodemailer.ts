/** Tovu SMTP wiring: lazily load the vendor and hand it to Jini's SMTP transport. */
import { createRequire } from "node:module";
// Delivery rationale lives in Jini/packages/platform/src/mail/smtp.ts; SMTP is the corporate-server
// escape hatch when the default hosted provider does not fit (ADR-037).
import type { SmtpMailPayload } from "@jini-ai/core/contracts/mail";
import { createNodemailerSmtpTransport as createJiniSmtpTransport } from "@jini-ai/platform/mail/smtp";
export type { SmtpMailPayload } from "@jini-ai/core/contracts/mail";

/** Existing Tovu vendor seam; the Jini adapter receives an object-shaped wrapper. */
export interface SmtpTransport {
  sendMail({ mail }: { mail: SmtpMailPayload }, optional?: Record<string, never>): Promise<{ messageId: string }>;
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
  return { sendMail: ({ mail }) => transport.sendMail({ mail }) };
}
