import type { EmailAddress } from "@jini-ai/platform/mail";
import type { MailerPort } from "./ports.js";

/**
 * @file The one place a system email's `From` is decided (members sign-in links, newsletter
 * confirmations, form notifications). Each caller passes its own `*.local` placeholder as the
 * fallback; the placeholder is only ever used by a mailer that sends nothing, because real
 * providers (hosted APIs, SMTP relays) reject a `.local` sender outright.
 *
 * Order: the site's configured sender wins whatever the mailer is. With no configured sender, a
 * non-delivering mailer (Console, in-memory) keeps the placeholder, so local development still
 * works with zero setup. A delivering mailer with no configured sender throws
 * {@link SenderIdentityNotConfiguredError} instead of handing the provider a From it will refuse.
 */

/** Drivers that never hand a message to a real provider, so a `.local` From cannot be rejected.
 *  `console` prints to stdout (`features/members/mailer.console.ts`); `memory` is the in-process
 *  fake. Every other driver is treated as delivering: an unknown driver fails closed. */
const NON_DELIVERING_MAIL_DRIVERS: ReadonlySet<string> = new Set(["console", "memory"]);

/** Thrown when a delivering mailer is active but the site has no sender address configured. */
export class SenderIdentityNotConfiguredError extends Error {
  readonly code = "mail_sender_not_configured";

  constructor(required: { workspaceId: string; driver: string }, _optional: Record<string, never> = {}) {
    super(
      `No sender address is configured for workspace ${required.workspaceId}, so the "${required.driver}" mailer ` +
        `cannot send: real mail providers reject the placeholder no-reply@*.local sender. Set the site's ` +
        `"core.mail.senderEmail" setting (and optionally "core.mail.senderName") to an address the provider accepts.`
    );
    this.name = "SenderIdentityNotConfiguredError";
  }
}

/** The site's saved sender, either part possibly absent. */
export interface ConfiguredMailSender {
  email?: string;
  name?: string;
}

/** Resolves the `From` for one system email. */
export interface MailSenderIdentityPort {
  /**
   * @param required.fallback The caller's placeholder sender; its `name` also fills in a missing
   *   configured display name.
   * @throws SenderIdentityNotConfiguredError See this file's header.
   */
  resolve(required: { workspaceId: string; fallback: EmailAddress }, optional?: Record<string, never>): Promise<EmailAddress>;
}

export interface CreateMailSenderIdentityResolverOptional {
  /** Reads the site's saved sender. Absent: nothing is configured (hermetic test roots). */
  readConfiguredSender?: (required: { workspaceId: string }) => Promise<ConfiguredMailSender | null>;
  /** Waits for the boot-time mailer swap (`server/runtime/boot/resolve-mailer.ts`'s `settle`). Without
   *  it, a read in the first moments after boot, or right after a key is saved, can still see the
   *  Console fallback and pick the placeholder for a send that then reaches the real provider. */
  settle?: () => Promise<void>;
}

/**
 * Builds the resolver over the active mailer. See this file's header for the decision order.
 * @complexity One settle, at most one settings read, one capabilities read.
 */
export function createMailSenderIdentityResolver(
  required: { mailer: MailerPort },
  optional: CreateMailSenderIdentityResolverOptional = {}
): MailSenderIdentityPort {
  return {
    resolve: async ({ workspaceId, fallback }) => {
      const configured = await optional.readConfiguredSender?.({ workspaceId });
      if (configured?.email) return { email: configured.email, name: configured.name ?? fallback.name };
      await optional.settle?.();
      const { driver } = required.mailer.capabilities();
      if (NON_DELIVERING_MAIL_DRIVERS.has(driver)) return fallback;
      throw new SenderIdentityNotConfiguredError({ workspaceId, driver });
    },
  };
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
