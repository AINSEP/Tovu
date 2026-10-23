/** Tovu's existing mail seam; message and ledger contracts are owned by Jini. */
import type {
  // Shared contract rationale: Jini/packages/platform/src/mail/ports.ts and types.ts.
  MailerCapabilities, MailerSendOptions as JiniMailerSendOptions, MailerSendResult, OutboundEmail,
} from "@jini-ai/platform/mail";
export type {
  MailerCapabilities, MailerSendResult, OutboundEmail,
  MailSuppressionRepoPort, MailSendDedupRepoPort,
} from "@jini-ai/platform/mail";

/** Facts the human approved; checked again inside the selected provider's delivery policy. */
export interface MailTestApproval { providerId: string | null; driver: string; from: OutboundEmail["from"]; mode: "off" | "capture" | "redirect"; effectiveRecipient: string }
export type MailerSendOptions = JiniMailerSendOptions & { mailTestApproval?: MailTestApproval };

/** Host adapters retain the consumer call shape while translating to Jini at dispatch. */
export interface MailerPort {
  capabilities(): MailerCapabilities;
  send(message: OutboundEmail, options: MailerSendOptions): Promise<MailerSendResult>;
  sendBatch(messages: readonly OutboundEmail[], options: MailerSendOptions): Promise<readonly MailerSendResult[]>;
}
export type ConsoleMailerAdapter = MailerPort;
export type InMemoryMailerAdapter = MailerPort;
