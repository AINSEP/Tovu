import type { TabBarTab } from "../../components/TabBar";
import { MEDIA_TABS, resolveActiveTab, type MediaTabsController } from "./hooks/use-media-tabs.hooks";

/**
 * @file `Media.tsx`'s own derived-value logic for its tab strip, split out per the
 * `<Name>.tsx`/`<Name>.hooks.tsx` pattern `Roles.hooks.tsx` establishes for the identical shape
 * (admin TSX-logic-sweep, 2026-09-05) — this repo's rule that a `.tsx` file carries no functions or
 * derived logic of its own. The icons live here too, exactly as `RolesIcon`/`PoliciesIcon` do in
 * `Roles.hooks.tsx`: they are `ReactNode` values the tab descriptors carry, so the file that
 * builds the descriptors is the file that has to be `.tsx`.
 *
 * The tab strip itself moved to the shared `components/TabBar` on 2026-09-06 (owner: "give the
 * tabs icons … every other tab row in this admin already pairs an icon with its label — match
 * that"). Until then `Media.tsx` drew its own pill row (`media.css`'s retired `.media-tabs`), the
 * last tab strip in the admin not drawn by `TabBar`. Which tabs exist, their ids, the `?tab=`
 * deep-linking (`use-media-tabs.hooks.ts`) and every per-tab agent handle are unchanged — only
 * where the buttons are drawn from.
 */

/** Shared attributes for a decorative line icon — the same 24px/1.5-stroke/round-join set
 *  `Roles.hooks.tsx`, `source-control-visuals.tsx` and `deployment-visuals.tsx` each define
 *  locally, so every tab row in this admin reads as one family. `aria-hidden`, because each sits
 *  directly beside the text label that already says the same thing. */
const LINE_ICON = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

/** All — a four-tile grid, i.e. the whole library at once. */
export function AllMediaIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.2" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" />
    </svg>
  );
}

/** Images — a framed picture: a sun and a horizon. */
export function ImagesIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M20.5 15.5 16 11l-6.5 6.5M3.5 17l3.5-3.5 2.5 2.5" />
    </svg>
  );
}

/** Videos — the same frame with a play mark inside it. */
export function VideosIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M10.25 9.25v5.5l4.5-2.75z" />
    </svg>
  );
}

/** Media providers — a cloud, the generic shape of "hosted elsewhere". No vendor mark: this admin
 *  draws zero brand logos (see `source-control-visuals.tsx`'s header), and this tab lists several. */
export function MediaProvidersIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d="M7.5 18.5h9.25a3.75 3.75 0 0 0 .6-7.45A5.5 5.5 0 0 0 6.8 9.6 4.25 4.25 0 0 0 7.5 18.5z" />
    </svg>
  );
}

/** Which icon each `MEDIA_TABS` id carries — a lookup rather than a field on `MEDIA_TABS` itself,
 *  because that constant lives in a `.hooks.ts` file (no JSX) and is the URL contract
 *  `use-media-tabs.hooks.ts` resolves `?tab=` against; the icons are presentation. */
const MEDIA_TAB_ICONS = {
  all: <AllMediaIcon />,
  images: <ImagesIcon />,
  videos: <VideosIcon />,
  "media-providers": <MediaProvidersIcon />,
} as const;

/**
 * The four tabs in the shape `TabBar` takes, from the same `MEDIA_TABS` list the URL resolver uses
 * — one source for which tabs exist and in what order.
 *
 * `handle`/`handleLabel` reproduce, byte for byte, the `agentHandle()` the old inline buttons
 * carried (`media-tab-<id>`, role `button`, "Switch to the <label> tab" with the UNtranslated
 * label), so nothing that drives this screen by handle sees a change. The visible `label` is
 * translated, as it was.
 *
 * @complexity O(1) — a fixed four-element array.
 */
export function resolveMediaTabs(t: (key: string) => string): TabBarTab[] {
  return MEDIA_TABS.map((tab) => ({
    id: tab.id,
    label: t(tab.label),
    icon: MEDIA_TAB_ICONS[tab.id],
    handle: `media-tab-${tab.id}`,
    handleLabel: `Switch to the ${tab.label} tab`,
  }));
}

/** `TabBar` reports the chosen id as a plain string; `setActiveTab` takes a `MediaTabId`. Bridged
 *  through the same `resolveActiveTab` guard the URL value goes through rather than a cast — every
 *  id `TabBar` can hand back came from `resolveMediaTabs` above, so the fallback never fires, but
 *  the guard is what makes that a checked fact instead of an asserted one. */
export function resolveMediaTabChange(setActiveTab: MediaTabsController["setActiveTab"]): (id: string) => void {
  return (id) => setActiveTab(resolveActiveTab(id));
}
