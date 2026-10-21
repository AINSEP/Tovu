import {
  createMailSenderIdentityResolver as createJiniMailSenderIdentityResolver,
  SenderIdentityNotConfiguredError as JiniSenderIdentityNotConfiguredError,
  type CreateMailSenderIdentityResolverOptional as JiniResolverOptional,
  type MailSenderIdentityPort,
} from "@jini-ai/platform/mail";
import type { MailerPort } from "./ports.js";

/**
 * @file Tovu's binding of the one place a system email's `From` is decided (members sign-in links,
 * newsletter confirmations, form notifications). Decision order, the non-delivering drivers and the
 * rationale: Jini/packages/platform/src/mail/sender-identity.ts. Tovu supplies the active mailer's
 * driver, the `core.mail.*` settings read, the boot-time settle and the refusal copy below.
 */

export type { ConfiguredMailSender, MailSenderIdentityPort } from "@jini-ai/platform/mail";

/** Thrown when a delivering mailer is active but the site has no sender address configured. */
export class SenderIdentityNotConfiguredError extends JiniSenderIdentityNotConfiguredError {
  constructor(required: { workspaceId: string; driver: string }, _optional: Record<string, never> = {}) {
    super(required, {
      message:
        `No sender address is configured for workspace ${required.workspaceId}, so the "${required.driver}" mailer ` +
        `cannot send: real mail providers reject the placeholder no-reply@*.local sender. Set the site's ` +
        `"core.mail.senderEmail" setting (and optionally "core.mail.senderName") to an address the provider accepts.`,
    });
    this.name = "SenderIdentityNotConfiguredError";
  }
}

export interface CreateMailSenderIdentityResolverOptional extends Pick<JiniResolverOptional, "readConfiguredSender"> {
  /** Waits for the boot-time mailer swap (`server/runtime/boot/resolve-mailer.ts`'s `settle`). Without
   *  it, a read in the first moments after boot, or right after a key is saved, can still see the
   *  Console fallback and pick the placeholder for a send that then reaches the real provider. */
  settle?: () => Promise<void>;
}

/**
 * Builds the resolver over the active mailer (`console`/`memory` keep the placeholder; see Jini).
 * @complexity One settle, at most one settings read, one capabilities read.
 */
export function createMailSenderIdentityResolver(
  required: { mailer: MailerPort },
  optional: CreateMailSenderIdentityResolverOptional = {}
): MailSenderIdentityPort {
  return createJiniMailSenderIdentityResolver({ readDriver: () => required.mailer.capabilities().driver }, {
    ...optional,
    notConfigured: (details) => new SenderIdentityNotConfiguredError(details),
  });
}

/**
 * The resolver a feature should use: the composed one when its composition root supplied it, else
 * one over the feature's own mailer with nothing configured (so a delivering mailer still refuses).
 * @complexity O(1).
 */
export function mailSenderIdentityFor(
  required: { mailer: MailerPort },
  optional: { senderIdentity?: MailSenderIdentityPort } = {}
): MailSenderIdentityPort {
  return optional.senderIdentity ?? createMailSenderIdentityResolver({ mailer: required.mailer });
}
