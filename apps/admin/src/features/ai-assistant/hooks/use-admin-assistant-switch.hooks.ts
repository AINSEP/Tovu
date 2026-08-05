import { useSyncExternalStore } from "react";

import { getAssistantDockOpen, requestAssistantDock, subscribeToAssistantDock } from "../../../lib/assistant-dock-bus";

/**
 * @file State for `AdminAssistantSwitch` — whether the admin's own assistant dock is open.
 *
 * `useSyncExternalStore` rather than `useState` + an effect: the dock can be toggled by the FAB, by
 * Escape, or by this control, and a local copy would drift out of date the moment one of the other
 * two won. A checkbox that misreports whether the panel is open is worse than no checkbox. Moved
 * verbatim from `AdminAssistantSwitch`'s component body.
 */

export interface AdminAssistantSwitchController {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export function useAdminAssistantSwitch(): AdminAssistantSwitchController {
  const open = useSyncExternalStore(subscribeToAssistantDock, getAssistantDockOpen, () => false);
  return { open, setOpen: requestAssistantDock };
}
