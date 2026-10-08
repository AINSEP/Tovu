/** Entry transport adapter; @jini-ai/ui/panel-kit owns debounce, refusal recovery and exit flushing. */
import { useMemo } from "react";
import { useStandingDraftAutosave as useAutosave, type StandingDraftAutosavePort as JiniPort, type StandingDraftAutosaveOptions } from "@jini-ai/ui/panel-kit";
import { standingDraftLocalBackup } from "../lib/standing-draft-local-backup";
import type { StandingDraftAutosaveInput, StandingDraftAutosaveSnapshot } from "@jini-ai/ui/panel-kit";
export type { StandingDraftAutosaveInput, StandingDraftAutosaveSnapshot, StandingDraftAutosaveController, StandingDraftStaleBasis } from "@jini-ai/ui/panel-kit";
export interface StandingDraftAutosavePort {
  getBackupPrincipalId?: JiniPort["getBackupPrincipalId"];
  putAutosave(id: string, draft: StandingDraftAutosaveInput, options?: { keepalive?: boolean }): Promise<{ applied: boolean }>;
  getAutosave(id: string): Promise<{ autosave: StandingDraftAutosaveSnapshot | null }>;
  discardAutosave(id: string): Promise<{ ok: boolean }>;
}
/** Memoize the converted port: a new identity would repeat recovery and flush pending edits on render. */
export function useStandingDraftAutosave(input: Omit<StandingDraftAutosaveOptions, "port" | "backup"> & { port: StandingDraftAutosavePort }, _options = {}) {
  const { port } = input;
  const adapted = useMemo<JiniPort>(() => ({
    ...(port.getBackupPrincipalId ? { getBackupPrincipalId: (required: Record<string, never>, options: Record<string, never> = {}) => port.getBackupPrincipalId!(required, options) } : {}),
    putAutosave: ({ id, draft }, options) => port.putAutosave(id, draft, options),
    getAutosave: ({ id }) => port.getAutosave(id),
    discardAutosave: ({ id }) => port.discardAutosave(id),
  }), [port]);
  return useAutosave({ ...input, port: adapted, backup: standingDraftLocalBackup }, {});
}
