/** @file The site's persisted vault labels for mail webhook signing secrets (product copy).
 * The mail data adapters and the feedback route live in `@jini-ai/platform/mail` (`/sql` for the
 * SQL repos); saved credentials are found by these exact labels, so the prefix never changes. */
import { mailWebhookSecretLabels as labelsWithPrefix } from "@jini-ai/platform/mail";

/** Product prefix of the vault labels `Tovu Mail — <Provider label> Webhook Secret [(previous)]`. */
export const MAIL_WEBHOOK_SECRET_LABEL_PREFIX = "Tovu Mail";

/** Vault labels for a provider's webhook signing secret: current first, then the rotation slot.
 * @example mailWebhookSecretLabels({ providerLabel: "Resend" })
 */
export function mailWebhookSecretLabels({ providerLabel }: { providerLabel: string }, _optional: Record<string, never> = {}): readonly [string, string] {
  return labelsWithPrefix({ providerLabel, labelPrefix: MAIL_WEBHOOK_SECRET_LABEL_PREFIX });
}
