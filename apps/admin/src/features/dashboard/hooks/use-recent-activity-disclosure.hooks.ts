import { usePersistedDisclosure, type PersistedDisclosure } from "@jini-ai/ui";

/**
 * @file Open/closed state of the Dashboard's "Recently updated" card (owner 2026-10-13: the
 * dashboard read as "a bit too busy", so the card collapses to its header by default).
 *
 * Persisted per browser in `localStorage`, namespaced under `tovu.admin.` like the default-password
 * banner's dismiss key in `use-dashboard.hooks.ts`. The best-effort storage handling (a failed read
 * falls back to collapsed) lives in `@jini-ai/ui` `usePersistedDisclosure`; Tovu supplies the key.
 */

/** Stores `"1"` while the card is open; any other value, or none, means collapsed. */
export const RECENT_ACTIVITY_OPEN_KEY = "tovu.admin.dashboard.recent-activity.open";

/**
 * @example
 * const { open, toggle, panelId } = useRecentActivityDisclosure();
 */
export function useRecentActivityDisclosure(): PersistedDisclosure {
  return usePersistedDisclosure({ storageKey: RECENT_ACTIVITY_OPEN_KEY });
}
