/** The host mail transport the Jini member challenge flow runs on: delivery availability and sender
 * resolution from `platform/mail`, and the Jini email renderer. Every composition that issues a
 * sign-in or reset challenge binds this as `MembersWriteServiceDeps.mailTransport`. */
import { renderEmailForSend } from "@jini-ai/platform/mail/email-template";
import type { MembersMailTransport } from "@jini-ai/user-management/members/ports";
import { isMailDeliveryAvailable, mailSenderIdentityFor } from "../../platform/mail/index.js";

export const membersMailTransport: MembersMailTransport = {
  isDeliveryAvailable: isMailDeliveryAvailable,
  senderIdentityFor: mailSenderIdentityFor,
  renderEmailForSend,
};
