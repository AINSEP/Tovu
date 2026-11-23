import type { TabBarTab } from "@jini-ai/ui/tab-strip";
import { Icon } from "@jini-ai/ui";
import { useCallback, useState, type ChangeEvent } from "react";
import { isUploadTooLarge } from "@/lib/upload-limit";
import type { MediaController } from "./hooks/use-media.hooks";
import { MEDIA_TABS, resolveActiveTab, type MediaTabId, type MediaTabsController } from "./hooks/use-media-tabs.hooks";

/**
 * @file `Media.tsx`'s own derived-value logic for its tab strip, split out per the
 * `<Name>.tsx`/`<Name>.hooks.tsx` pattern `Roles.hooks.tsx` establishes for the identical shape
 * (admin TSX-logic-sweep, 2026-09-05) — this repo's rule that a `.tsx` file carries no functions or
 * derived logic of its own. The icons live here too, exactly as `RolesIcon`/`PoliciesIcon` do in
 * `Roles.hooks.tsx`: they are `ReactNode` values the tab descriptors carry, so the file that
 * builds the descriptors is the file that has to be `.tsx`.
 *
 * The tab strip itself moved to the shared `@jini-ai/ui/tab-strip` on 2026-09-06 (owner: "give the
 * tabs icons … every other tab row in this admin already pairs an icon with its label — match
 * that"). Until then `Media.tsx` drew its own pill row (`media.css`'s retired `.media-tabs`), the
 * last tab strip in the admin not drawn by `TabBar`. Which tabs exist, their ids, the `?tab=`
 * deep-linking (`use-media-tabs.hooks.ts`) and every per-tab agent handle are unchanged — only
 * where the buttons are drawn from.
 */



/** Which icon each `MEDIA_TABS` id carries — a lookup rather than a field on `MEDIA_TABS` itself,
 *  because that constant lives in a `.hooks.ts` file (no JSX) and is the URL contract
 *  `use-media-tabs.hooks.ts` resolves `?tab=` against; the icons are presentation. */
const MEDIA_TAB_ICONS = {
  // All uses a four-tile grid to represent the whole library at once.
  all: <Icon name="tiles-four" size={16} strokeWidth={1.5} />,
  images: <Icon name="picture-frame" size={16} strokeWidth={1.5} />,
  videos: <Icon name="video-frame" size={16} strokeWidth={1.5} />,
  // The cloud represents hosting across several providers and follows the admin’s convention of using generic glyphs for provider groups.
  "external-providers": <Icon name="cloud-outline" size={16} strokeWidth={1.5} />,
  trash: <Icon name="bin-lidded" size={16} strokeWidth={1.5} />,
} as const;

/**
 * The three tabs in the shape `TabBar` takes, from the same `MEDIA_TABS` list the URL resolver uses
 * — one source for which tabs exist and in what order.
 *
 * `handle`/`handleLabel` reproduce, byte for byte, the `agentHandle()` the old inline buttons
 * carried (`media-tab-<id>`, role `button`, "Switch to the <label> tab" with the UNtranslated
 * label), so nothing that drives this screen by handle sees a change. The visible `label` is
 * translated, as it was.
 *
 * `counts` (owner ask, 2026-09-26) feeds `TabBarTab.count` — one lookup by tab id, keyed off
 * `MEDIA_TABS`'s own ids so a tab with no entry (or a `Media()` still loading, per `rules.ts`'s
 * `mediaContentTabCounts`) simply renders no badge, `TabBar`'s own `count !== undefined` check.
 * Defaulted to `{}` so every pre-existing call site (a test calling this directly) keeps rendering
 * exactly as before.
 *
 * @complexity O(1) — a fixed five-element array.
 */
export function resolveMediaTabs({ t }: { t: (key: string) => string }, { counts = {} }: { counts?: Partial<Record<MediaTabId, number>> } = {}): TabBarTab[] {
  return MEDIA_TABS.map((tab) => ({
    id: tab.id,
    label: t(tab.label),
    icon: MEDIA_TAB_ICONS[tab.id],
    count: counts[tab.id],
    handle: `media-tab-${tab.id}`,
    handleLabel: `Switch to the ${tab.label} tab`,
  }));
}

/** `TabBar` reports the chosen id as a plain string; `setActiveTab` takes a `MediaTabId`. Bridged
 *  through the same `resolveActiveTab` guard the URL value goes through rather than a cast — every
 *  id `TabBar` can hand back came from `resolveMediaTabs` above, so the fallback never fires, but
 *  the guard is what makes that a checked fact instead of an asserted one. */
export function resolveMediaTabChange({ setActiveTab }: { setActiveTab: MediaTabsController["setActiveTab"] }, _optional: Record<string, never> = {}): (id: string) => void {
  return (id) => setActiveTab(resolveActiveTab({ tabId: id }));
}

/**
 * The admin's one upload limit (`lib/upload-limit.ts`, P10-M2) for the Upload dialog: a file over
 * it is flagged the moment it is chosen, so the operator is told before any bytes are read or sent.
 * The chosen file still goes to `onFileChange` so the dialog keeps showing what was picked (and a
 * later, smaller pick replaces it); `tooLarge` is what blocks Upload. Closing the dialog clears it.
 * @returns `tooLarge`, plus `chooseFile`/`close` to wire in place of `onFileChange`/`closeUpload`.
 * @complexity O(1).
 */
export function useUploadSizeGuard(
  { onFileChange, closeUpload }: Pick<MediaController, "onFileChange" | "closeUpload">,
  _optional: Record<string, never> = {},
): { tooLarge: boolean; chooseFile: (event: ChangeEvent<HTMLInputElement>) => void; close: () => void } {
  const [tooLarge, setTooLarge] = useState(false);
  const chooseFile = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setTooLarge(isUploadTooLarge({ size: event.target.files?.[0]?.size ?? 0 }));
    onFileChange(event);
  }, [onFileChange]);
  const close = useCallback(() => {
    setTooLarge(false);
    closeUpload();
  }, [closeUpload]);
  return { tooLarge, chooseFile, close };
}
