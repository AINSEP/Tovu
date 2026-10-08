/** The exact storage prefix is retained so refused work parked before extraction stays recoverable. */
import { createStandingDraftLocalBackup } from "@jini-ai/ui/panel-kit";
import type { StandingDraftAutosaveInput, StandingDraftAutosaveSnapshot } from "../hooks/use-standing-draft-autosave.hooks";
export { LOCAL_BACKUP_PRINCIPAL_ID } from "@jini-ai/ui/panel-kit";
export const standingDraftLocalBackup = createStandingDraftLocalBackup({
  keyPrefix: "tovu.admin.standing-draft-backup.", getStorage: () => localStorage,
}, {});
/** Positional compatibility for existing editor adapters; storage failures remain best-effort. */
export function writeStandingDraftLocalBackup(entryId: string, draft: StandingDraftAutosaveInput, savedAt: string, options: { principalId?: string | null } = {}): void {
  standingDraftLocalBackup.write({ entryId, draft, savedAt }, options);
}
export function readStandingDraftLocalBackup(entryId: string, options: { principalId?: string | null } = {}): StandingDraftAutosaveSnapshot | null {
  return standingDraftLocalBackup.read({ entryId }, options);
}
export function clearStandingDraftLocalBackup(entryId: string, options: { principalId?: string | null } = {}): void {
  standingDraftLocalBackup.clear({ entryId }, options);
}
