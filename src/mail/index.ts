/**
 * @file Public surface (barrel) for the `mail` Tier-2 core library (ADR-037).
 *
 * ADR-009 §1: a module's public contract is its `index.ts`; boundary lint forbids deep
 * imports. This is INTERFACES AND TYPES ONLY — adapters (Console/Smtp/HttpApi/InMemory) and
 * the suppression/dedup ledger implementations are the ADR-037 follow-up build.
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
  HttpApiMailerAdapter,
  InMemoryMailerAdapter,
  MailerPort,
  MailSendDedupRepoPort,
  MailSuppressionRepoPort,
  SmtpMailerAdapter,
} from "./ports.js";
