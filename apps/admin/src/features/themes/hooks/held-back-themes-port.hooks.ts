import type { HeldBackApprovalResult, HeldBackCheckResult, HeldBackRestoreResult, HeldBackThemesList } from "../api/held-back-themes-api";

/**
 * @file What `use-held-back-themes.hooks.ts` needs from the outside world, as an interface rather
 * than a direct `lib/api` import — same `useX(dependencies)` / wired-hook split as `themes-port.hooks.ts`.
 * Its own port, not part of `ThemesPort`: held-back themes live in the import quarantine, a different
 * resource from the registry of installed themes. Every method rejects with an `ApiError`.
 */
export interface HeldBackThemesPort {
  /** The held-back themes, plus the chosen-theme marker when the owner's pick was among them. */
  list(): Promise<HeldBackThemesList>;
  /** Re-run the safety checks on one theme. Changes nothing. */
  check(required: { themeId: string }, optional?: Record<string, never>): Promise<HeldBackCheckResult>;
  /** Record the approval card's "Restore" for the check's plan; the server mints the approval token. */
  approveRestore(required: { themeId: string; planId: string; planHash: string }, optional?: Record<string, never>): Promise<HeldBackApprovalResult>;
  /** Move a checked theme to its live place: `approvedDigest` is the version check, `confirmationToken` the approval. */
  restore(required: { themeId: string; approvedDigest: string; confirmationToken: string }, optional?: Record<string, never>): Promise<HeldBackRestoreResult>;
}
