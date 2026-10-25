/** Shared safe status/configuration contracts are owned by Jini; Tovu retains selection control.
 * The provider verdict remains separate from credential presence and delivery evidence.
 * Setup copy is plugin/host data, and credential summaries expose presence without values.
 */
import type { MailProviderConfigurationReport } from "@jini-ai/platform/mail";
export type {
  MailStatusReport, MailProviderError, MailProviderField, MailProviderSetup,
  MailProviderConfiguration, MailProviderConfigurationReport,
} from "@jini-ai/platform/mail";

/** Explicit provider selection: `check` validates without sending, `select` writes both lanes. */
export interface MailProviderControl {
  check(required: { id: string }): Promise<{ ok: true; label: string } | { ok: false; reason: string }>;
  select(required: { id: string; principalId: string }): Promise<void>;
  /** The safe configuration DTO for every installed provider. Absent in older roots. */
  describe?(): Promise<MailProviderConfigurationReport>;
  /** Drops cached provider mailers and status so the next send and status read start fresh. */
  invalidate?(): void;
}
