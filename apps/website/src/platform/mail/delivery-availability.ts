/** Product recovery wording stays in Tovu; Jini owns driver availability checks. */
import { isMailDeliveryAvailable as isJiniMailDeliveryAvailable } from "@jini-ai/platform/mail";
import type { MailerPort } from "./ports.js";
import { toJiniMailer } from "./purpose-scoped-mailer.js";

export const MAIL_DELIVERY_UNAVAILABLE_NOTE = "Email sending is not configured: messages are printed to the server console and never leave this machine. Set up a mail provider agent plugin and save its key in Access Tokens to send real email.";

/** Reads capabilities synchronously and sends no message. */
/** Boot hydrates the mailer asynchronously, so an early capability read can still report the
 * pre-swap console fallback; see server/runtime/boot/resolve-mailer.ts's startup-race rationale. */
// Console-as-unavailable policy: Jini/packages/platform/src/mail/delivery-availability.ts.
export function isMailDeliveryAvailable(mailer: MailerPort): boolean {
  return isJiniMailDeliveryAvailable({ mailer: toJiniMailer({ mailer }) });
}
