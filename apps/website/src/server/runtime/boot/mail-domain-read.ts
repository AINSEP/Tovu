/** Jini owns sending-key-first domain reads and the forbidden-only account fallback.
 * The replacement context is read-only and never reaches the sending mailer.
 */
export { readMailDomain, isDomainReadPermissionRefused } from "@jini-ai/platform/mail";
export type { MailDomainReadCredentialPort } from "@jini-ai/platform/mail";
