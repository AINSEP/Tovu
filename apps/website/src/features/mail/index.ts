/** @file Mail delivery data + feedback (email provider contract v1): ledgers, suppression, capture, webhook. */
export { createMailSendLedgerRepo, type MailRepoDeps, type MailRepoOptions } from "./ledger.repo.js";
export { createMailSuppressionRepo } from "./suppression.repo.js";
export { createMailFeedbackInboxRepo } from "./feedback-inbox.repo.js";
export { createMailCaptureRepo, DEFAULT_CAPTURE_LIST, MAX_CAPTURE_LIST, type CapturedMail, type MailCaptureRepo } from "./capture.repo.js";
export {
  createMailFeedbackRoute, flattenHeaders, MAIL_FEEDBACK_MAX_BODY_BYTES,
  type MailFeedbackRequest, type MailFeedbackRoute, type MailFeedbackRouteDeps,
} from "./feedback-route.js";
export { createSiteMailFeedbackRoute } from "./site-feedback-route.js";
export { createPluginMailFeedbackSources, createVaultMailWebhookSecrets, mailWebhookSecretLabels, type MailAdapterSource } from "./feedback-sources.js";
