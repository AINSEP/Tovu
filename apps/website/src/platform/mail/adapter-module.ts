import type { HttpClientPort } from "../http/index.js";
import type { MailerPort } from "./ports.js";

/**
 * @file The contract a mail-adapter MODULE (shipped inside an Agent Plugin) is written against.
 *
 * Hosted mail providers live in plugins, not core: core loads a plugin's module
 * (`features/agent-plugins/mail-adapter-registry.ts`), hands it the saved credential and a
 * {@link MailAdapterKit}, and gets back an ordinary {@link MailerPort}. Nothing here names a vendor.
 * SMTP stays in core (`./adapters/smtp.nodemailer.ts`) as the always-available fallback.
 */

/** The saved credential an adapter is built from (`custom_credential_sets`, found by the label the
 *  plugin's descriptor declares). */
export interface MailAdapterCredential {
  readonly token: string;
  readonly baseUrl?: string;
  readonly username?: string;
}

/** What a module may call that is not a Node builtin: a plugin ships no npm dependencies. */
export interface MailAdapterKit {
  /** The guarded outbound-HTTP seam (ADR-038); every provider request goes through its egress policy. */
  readonly httpClient: HttpClientPort;
}

export interface MailAdapterCreateContext {
  readonly credential: MailAdapterCredential;
  readonly kit: MailAdapterKit;
}

/** A mail-adapter module's default export. */
export interface MailAdapterModule {
  create(context: MailAdapterCreateContext): MailerPort;
}
