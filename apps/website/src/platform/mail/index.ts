/**
 * @file Public surface (barrel) for the `mail` Tier-2 core library (ADR-037).
 *
 * ADR-009 §1: a module's public contract is its `index.ts`; boundary lint forbids deep
 * imports. This is INTERFACES AND TYPES ONLY — adapters (Console/Smtp/HttpApi/InMemory) and
 * the suppression/dedup ledger implementations are the ADR-037 follow-up build.
 *
 * 2026-08-31: the follow-up build landed for the two production adapters. `HttpApiMailerAdapter`/
 * `SmtpMailerAdapter` are real classes living inside this same library (`./adapters/*.ts`) and are
 * exported below as VALUES, not just types — a same-tier internal re-export, no boundary issue.
 * `ConsoleMailerAdapter` is NOT re-exported here: its concrete class lives in
 * `../../features/members/mailer.console.ts` (a Tier-3 feature), reachable only through that
 * module's own barrel (`../../features/members/index.js`) — re-exporting a Tier-3 class from this
 * Tier-2 barrel would be the upward import ADR-024's tiering forbids. See `ports.ts`'s own note.
 * The suppression/dedup ledger implementations remain unbuilt.
 */
export type {
  EmailAddress,
  EmailAttachment,
  MailerCapabilities,
  MailerFeedbackEvent,
  MailerSendOptions,
  MailerSendResult,
  OutboundEmail,
} from "./types.js";

export type {
  ConsoleMailerAdapter,
  InMemoryMailerAdapter,
  MailerPort,
  MailSendDedupRepoPort,
  MailSuppressionRepoPort,
} from "./ports.js";

export { HttpApiMailerAdapter, type HttpApiMailerAdapterConfig } from "./adapters/http-api.resend.js";
export {
  createNodemailerSmtpTransport,
  SmtpMailerAdapter,
  type CreateNodemailerSmtpTransportConfig,
  type SmtpMailerAdapterDeps,
  type SmtpMailPayload,
  type SmtpTransport,
} from "./adapters/smtp.nodemailer.js";
