import { useState } from "react";

export type MediaTabId = "all" | "images" | "videos" | "media-providers";

export const MEDIA_TABS: readonly { id: MediaTabId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "images", label: "Images" },
  { id: "videos", label: "Videos" },
  { id: "media-providers", label: "Media providers" },
];

/**
 * Active-tab state for the Media page's new tab bar (owner instruction, 2026-08-08: "let's do
 * the UI first" — a UI-review pass, so this is deliberately just tab-switching state, not yet a
 * URL-synced `?tab=` deep link the way `SettingsUi.tsx`'s `requestedTabId` is. Add that once the
 * structure itself is confirmed, matching that file's own pattern rather than inventing a second
 * one.
 */
export function useMediaTabs() {
  const [activeTab, setActiveTab] = useState<MediaTabId>("all");
  return { activeTab, setActiveTab };
}
