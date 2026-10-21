import type { MailStatus } from "@jini-ai/platform/mail";

/**
 * The site's mail status: Jini's `computeMailStatus` projection (state, per-lane provider/state,
 * warnings) plus the catalog facts the admin screen and `system_get_mail_status` show. Built by
 * `server/runtime/boot/resolve-mailer.ts`; declared here so routes and features need no boot import.
 */
export interface MailStatusReport extends MailStatus {
  readonly providers: readonly { id: string; label: string; hosted: boolean; origin: "core" | "plugin" }[];
  /** Plugin providers that were not loaded, and why (log-safe). */
  readonly refusals: readonly string[];
}
