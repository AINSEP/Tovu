/** Tovu mail boundary: shared contracts come from Jini; host adapters keep existing consumers. */
// Shared contracts: Jini/packages/platform/src/mail/ports.ts and Jini/packages/platform/src/mail/types.ts (ADR-037).
// Hosted-provider implementations belong to Agent Plugins; this boundary exposes their generic
// contract. Do not re-export the members feature's concrete ConsoleMailerAdapter here: that would
// pull a higher-tier feature into the platform barrel (ADR-024). The local SMTP adapter is same-tier.
export type {
  EmailAddress, EmailAttachment, MailerCapabilities, MailerFeedbackEvent,
  MailerSendResult, OutboundEmail,
  MailSuppressionRepoPort, MailSendDedupRepoPort,
  SenderDomainVerification,
  SenderDomainVerificationPort,
} from "@jini-ai/platform/mail";
/** MailerPort is Jini's positional mailer. Host adapters retain the consumer call shape while translating to Jini at dispatch.
 * Approval facts are checked again inside the selected provider's delivery policy. */
export type { PositionalMailer as MailerPort, MailerSendOptions, MailTestApproval } from "@jini-ai/platform/mail";
export type { MailAdapterCreateContext, MailAdapterCredential, MailAdapterKit, MailAdapterModule } from "./adapter-module.js";
export { isMailDeliveryAvailable, MAIL_DELIVERY_UNAVAILABLE_NOTE } from "./delivery-availability.js";
export {
  createMailSenderIdentityResolver, mailSenderIdentityFor, SenderIdentityNotConfiguredError,
  type ConfiguredMailSender, type CreateMailSenderIdentityResolverOptional, type MailSenderIdentityPort,
} from "./sender-identity.js";
export {
  createNodemailerSmtpTransport,
  type CreateNodemailerSmtpTransportConfig,
  type SmtpMailPayload, type SmtpTransport,
} from "./adapters/smtp.nodemailer.js";

export type {
  MailStatusReport, MailProviderField, MailProviderSetup, MailProviderConfiguration,
  MailProviderConfigurationReport,
} from "@jini-ai/platform/mail";
export type { MailProviderControl } from "./mail-status.js";
export type { MailPurposeGateProbe } from "./purpose-gate-probe.js";
export { credentialSecrets, safeMailProviderText } from "@jini-ai/platform/mail";
