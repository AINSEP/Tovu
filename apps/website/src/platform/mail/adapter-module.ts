/** Plugin modules retain Tovu's HTTP and mail call shapes at their host boundary. */
import type { MailAdapterCredential } from "@jini-ai/platform/mail";
import type { HttpClientPort } from "../http/index.js";
import type { MailerPort } from "./ports.js";
export type { MailAdapterCredential } from "@jini-ai/platform/mail";

/** Hosted providers live in Agent Plugins, keeping vendor dependencies out of core; boot loads
 * their modules with saved credentials and this kit. SMTP remains the core fallback. */
// Shared provider contract: Jini/packages/platform/src/mail/adapter-module.ts.
/** Plugins ship no npm dependencies; the kit supplies their non-Node capabilities. */
export interface MailAdapterKit {
  /** ADR-038: every provider request passes through the guarded outbound egress policy. */
  readonly httpClient: HttpClientPort;
}
export interface MailAdapterCreateContext {
  readonly credential: MailAdapterCredential;
  readonly kit: MailAdapterKit;
}
/** A loaded Tovu plugin receives guarded HTTP and returns the existing host mail port. */
export interface MailAdapterModule {
  create(context: MailAdapterCreateContext): MailerPort;
}
