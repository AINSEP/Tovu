import { useCallback, useEffect, useState } from "react";

/**
 * @file Desktop sidebar rail-collapse preference (persisted).
 *
 * Deliberately its own hook, not a `useState` inline in `Sidebar.tsx` — the persistence and the
 * cross-tab sync below are both real behavior worth naming and testing on their own, and
 * `apps/admin/INFO.md`'s hook convention is where stateful, non-component logic like this lives.
 * No `<name>-port.hooks.ts` / `<name>-dependencies.hooks.ts` pair: this hook's only outside
 * dependency is `localStorage`, which is a browser built-in rather than a swappable backend, so
 * the three-file port seam that exists to let `useAssistantChats` run against a fake API client
 * has nothing to inject here.
 *
 * This is the DESKTOP collapse — a user preference, both states fully usable, persisted so it
 * survives navigation and reload. It is a different mechanism from the mobile off-canvas drawer
 * (`App.tsx`'s `sidebarOpen`/`setSidebarOpen`): that one is session-only overlay state that
 * *should* reset on every navigation (see the `useEffect(() => setSidebarOpen(false), [routePath])`
 * there), where resetting this preference on navigation would be exactly the bug MSG-05 called
 * out — "a collapse that resets on every page change is worse than no collapse". Driving both off
 * one boolean would make each navigation either fight the user's rail choice or leave the phone
 * drawer stuck open; they are kept as two separate pieces of state on purpose.
 */

const STORAGE_KEY = "tovu-admin-sidebar-rail-collapsed";

/** Reads the persisted value once, defensively — `localStorage` can throw in a locked-down
 *  embed/iframe context (Safari private mode historically, some hardened browser configs), and a
 *  first-run visitor has no key at all. Both cases fall back to the same default: expanded. */
function readPersisted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writePersisted(collapsed: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // Best-effort — a user who cannot persist the preference still gets a working toggle for the
    // current tab; failing loudly here would break the rail over a non-essential preference write.
  }
}

export interface SidebarRail {
  collapsed: boolean;
  toggle: () => void;
}

/**
 * @complexity O(1) — one state read/write per toggle, no derived computation.
 */
export function useSidebarRail(): SidebarRail {
  const [collapsed, setCollapsed] = useState<boolean>(() => readPersisted());

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      writePersisted(next);
      return next;
    });
  }, []);

  /** Cross-tab sync: two admin tabs open side by side should agree on the rail state rather than
   *  silently diverging the moment either one is toggled — the same reasoning that makes
   *  `subscribeToSettingsChanges` a document-wide feed rather than a per-panel one. */
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;
      setCollapsed(event.newValue === "1");
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { collapsed, toggle };
}
