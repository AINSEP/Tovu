import { useCallback, useId, useState } from "react";

/**
 * @file Open/closed state of the Dashboard's "Recently updated" card (owner 2026-10-13: the
 * dashboard read as "a bit too busy", so the card collapses to its header by default).
 *
 * Persisted per browser in `localStorage`, namespaced under `tovu.admin.` like the default-password
 * banner's dismiss key in `use-dashboard.hooks.ts`. Every read and write is best-effort:
 * `localStorage` throws outright in some privacy modes, and a failed read falls back to collapsed,
 * the default, so the worst case is the card starting closed again.
 */

/** Stores `"1"` while the card is open; any other value, or none, means collapsed. */
export const RECENT_ACTIVITY_OPEN_KEY = "tovu.admin.dashboard.recent-activity.open";

/** @complexity Time/space: O(1). */
function readOpen(): boolean {
  try {
    return localStorage.getItem(RECENT_ACTIVITY_OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** @complexity Time/space: O(1). */
function writeOpen(open: boolean): void {
  try {
    localStorage.setItem(RECENT_ACTIVITY_OPEN_KEY, open ? "1" : "0");
  } catch {
    // best-effort; see this file's header.
  }
}

export interface RecentActivityDisclosure {
  open: boolean;
  toggle: () => void;
  /** DOM id for the collapsible body, so the header button can point `aria-controls` at it. */
  panelId: string;
}

/**
 * @example
 * const { open, toggle, panelId } = useRecentActivityDisclosure();
 */
export function useRecentActivityDisclosure(): RecentActivityDisclosure {
  const [open, setOpen] = useState(readOpen);
  const panelId = useId();
  const toggle = useCallback(() => {
    setOpen((previous) => {
      writeOpen(!previous);
      return !previous;
    });
  }, []);
  return { open, toggle, panelId };
}
