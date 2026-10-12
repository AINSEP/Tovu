import { useCallback, useState } from "react";

export interface ChatSettingsDialogState {
  open: boolean;
  show: () => void;
  close: () => void;
}

/** Open/closed state for the dock's Chat settings dialog (the gear menu opens it, ✕/Escape/backdrop close it). */
export function useChatSettingsDialog(): ChatSettingsDialogState {
  const [open, setOpen] = useState(false);
  return { open, show: useCallback(() => setOpen(true), []), close: useCallback(() => setOpen(false), []) };
}
