import { useRef, useState, type KeyboardEvent } from "react";

/**
 * @file `InfoTip`'s open/close state, placement, and portal coordinates — split out of the
 * component so it can be swapped for a fake via the `useTip` prop on `InfoTipProps`, the same
 * `<Name>.tsx`/`<Name>.hooks.tsx` split `ConfirmDialog`/`ConfirmDialog.hooks.tsx` uses in
 * `@jini-ai/admin`. No `-port.hooks.ts`/`-dependencies.hooks.ts` pair: the only outside dependency
 * is `getBoundingClientRect`, a synchronous DOM read with nothing to fail or fake a rejection for,
 * the same reasoning `ChatFab.hooks.tsx`'s `useFabPosition` gives for skipping a port.
 */

/** A floor on how much room has to exist above the icon before "opens above" (the preference) is
 *  honored — see the component's own former header for the full account of why this exists and
 *  how `176` was chosen. */
const ABOVE_HEADROOM_PX = 176;

export interface InfoTipController {
  open: boolean;
  placement: "above" | "below";
  coords: { top: number; left: number };
  iconRef: React.RefObject<HTMLSpanElement | null>;
  show: () => void;
  hide: () => void;
  /** Escape-to-dismiss without moving focus off the icon — see the component's own doc for why
   *  this can't just be `onBlur`. */
  handleIconKeyDown: (e: KeyboardEvent<HTMLSpanElement>) => void;
}

/**
 * Owns `InfoTip`'s open/close state and the measured placement/coordinates its portal renders at.
 *
 * @returns `open`/`placement`/`coords` for the portal, `iconRef` to attach to the trigger, and the
 *   `show`/`hide`/`handleIconKeyDown` event handlers.
 * @complexity Time/space: O(1) — one `getBoundingClientRect` read per `show()`.
 */
export function useInfoTip(): InfoTipController {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"above" | "below">("above");
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const iconRef = useRef<HTMLSpanElement>(null);

  const show = () => {
    const rect = iconRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nextPlacement = rect.top < ABOVE_HEADROOM_PX ? "below" : "above";
    setPlacement(nextPlacement);
    setCoords({ top: nextPlacement === "above" ? rect.top : rect.bottom, left: rect.left + rect.width / 2 });
    setOpen(true);
  };
  const hide = () => setOpen(false);

  function handleIconKeyDown(e: KeyboardEvent<HTMLSpanElement>) {
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      hide();
    }
  }

  return { open, placement, coords, iconRef, show, hide, handleIconKeyDown };
}
