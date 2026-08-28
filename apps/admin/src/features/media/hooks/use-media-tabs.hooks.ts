import { navigate } from "@/lib/router";

export type MediaTabId = "all" | "images" | "videos" | "media-providers";

export const MEDIA_TABS: readonly { id: MediaTabId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "images", label: "Images" },
  { id: "videos", label: "Videos" },
  { id: "media-providers", label: "Media providers" },
];

const MEDIA_TAB_IDS = MEDIA_TABS.map((tab) => tab.id) as readonly string[];

export interface MediaTabsController {
  activeTab: MediaTabId;
  setActiveTab: (tab: MediaTabId) => void;
}

/** Falls back to "all" for an absent or unrecognized `?tab=` value — same "don't trust a raw
 *  query value" guard `Deployment.tsx`'s `resolveActiveTabId`/`SettingsUi.tsx`'s `requestedTabId`
 *  both apply, for the same reason (a stale link or a typo must not blank the panel).
 *  @complexity O(1) — fixed-size id list, not caller-controlled. */
function resolveActiveTab(tabId: string | null | undefined): MediaTabId {
  return tabId && MEDIA_TAB_IDS.includes(tabId) ? (tabId as MediaTabId) : "all";
}

/**
 * Active-tab state for the Media page's tab bar, `?tab=` deep-linked — same convention
 * `Deployment.tsx`'s `resolveActiveTabId`/`handleTabChange` and `SettingsUi.tsx`'s
 * `requestedTabId`/`handleTabChange` both use: the active tab lives in the URL, not component
 * state, so `/admin/media?tab=videos` is both bookmarkable and survives a refresh.
 *
 * No port: purely local UI state derived from a prop plus a `navigate()` call, so there is
 * nothing to inject a dependency for — `Media.tsx` takes this hook itself as an overridable prop
 * (`useMediaTabsHook`, defaulted to this hook) rather than through a `useWiredX()` pair, the same
 * no-port treatment `use-media-lightbox.hooks.ts` gets for the identical reason.
 *
 * @param tabId - The `?tab=` query value from `panels.tsx`'s `media` route (`URLSearchParams.get`
 * returns `null` when the param is absent).
 * @returns Tab-bar state: the active tab id (resolved against `MEDIA_TABS`) and a setter that
 * writes the new id into the URL via `navigate(..., { replace: true })`, matching `Deployment`'s
 * own reasoning for `replace` — switching tabs should not grow the back-button history one entry
 * per click.
 */
export function useMediaTabs(tabId?: string | null): MediaTabsController {
  const activeTab = resolveActiveTab(tabId);
  function setActiveTab(tab: MediaTabId) {
    navigate(`/media?tab=${tab}`, { replace: true });
  }
  return { activeTab, setActiveTab };
}
