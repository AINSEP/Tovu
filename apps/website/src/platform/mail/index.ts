/** Tovu mail boundary: shared contracts come from Jini; host adapters keep existing consumers. */
// Shared contracts: Jini/packages/platform/src/mail/ports.ts (ADR-037).
// Hosted-provider implementations belong to Agent Plugins; this boundary exposes their generic
// contract. Do not re-export the members feature's concrete ConsoleMailerAdapter here: that would
// pull a higher-tier feature into the platform barrel (ADR-024). The local SMTP adapter is same-tier.
export type {
  EmailAddress, EmailAttachment, MailerCapabilities, MailerFeedbackEvent,
  MailerSendOptions, MailerSendResult, OutboundEmail,
  MailSuppressionRepoPort, MailSendDedupRepoPort,
} from "@jini-ai/platform/mail";
export type { ConsoleMailerAdapter, InMemoryMailerAdapter, MailerPort } from "./ports.js";
export type { MailAdapterCreateContext, MailAdapterCredential, MailAdapterKit, MailAdapterModule } from "./adapter-module.js";
export { isMailDeliveryAvailable, MAIL_DELIVERY_UNAVAILABLE_NOTE } from "./delivery-availability.js";
export {
  createNodemailerSmtpTransport, SmtpMailerAdapter,
  type CreateNodemailerSmtpTransportConfig, type SmtpMailerAdapterDeps,
  type SmtpMailPayload, type SmtpTransport,
} from "./adapters/smtp.nodemailer.js";
