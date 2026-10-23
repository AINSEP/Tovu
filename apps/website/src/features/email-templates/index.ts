/**
 * @file HTML email templates — raw-HTML documents on Pages storage with `{{field}}` fill-ins, an
 * admin preview (scripts kept, sandboxed) and a static send render. `operations.ts` holds the one
 * shared operation per capability; the admin routes and the `email_template_*` tools both call it.
 *
 * Send-path seam: `renderEmailTemplateForSend(...)` returns `{ subject, html, text, missingFields }`;
 * spread `subject`/`html`/`text` into an `OutboundEmail` next to `to`/`from` and hand it to the
 * mailer. It sends nothing itself.
 */
export {
  createEmailTemplate,
  editEmailTemplate,
  EmailTemplateInputError,
  EmailTemplateNotFoundError,
  EmailTemplateVersionConflictError,
  getEmailTemplate,
  listEmailTemplates,
  previewEmailTemplate,
  readFieldValues,
  renameEmailTemplate,
  renderEmailTemplateForSend,
  type EmailTemplateDeps,
  type EmailTemplateDetail,
  type EmailTemplatePreview,
  type EmailTemplateSummary,
} from "./operations.js";
export { renderEmailForSend, renderEmailPreview, fillPlaceholders, type SendableEmail, type EmailFieldValues } from "./render.js";
