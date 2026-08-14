import { useState } from "react";

export type MediaTabId = "all" | "images" | "videos" | "media-providers";

export const MEDIA_TABS: readonly { id: MediaTabId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "images", label: "Images" },
  { id: "videos", label: "Videos" },
  { id: "media-providers", label: "Media providers" },
];

export interface MediaTabsController {
  activeTab: MediaTabId;
  setActiveTab: (tab: MediaTabId) => void;
}

/**
 * Active-tab state for the Media page's tab bar (owner instruction, 2026-08-08: "let's do
 * the UI first" — a UI-review pass, so this is deliberately just tab-switching state, not yet a
 * URL-synced `?tab=` deep link the way `SettingsUi.tsx`'s `requestedTabId` is. Add that once the
 * structure itself is confirmed, matching that file's own pattern rather than inventing a second
 * one.
 *
 * No port: purely local UI state with no I/O, so there is nothing to inject a dependency for —
 * `Media.tsx` takes this hook itself as an overridable prop (`useMediaTabsHook`, defaulted to this
 * hook) rather than through a `useWiredX()` pair, the same no-port treatment
 * `use-media-lightbox.hooks.ts` gets for the identical reason.
 *
 * @returns Tab-bar state: the active tab id and its setter.
 */
export function useMediaTabs(): MediaTabsController {
  const [activeTab, setActiveTab] = useState<MediaTabId>("all");
  return { activeTab, setActiveTab };
}
