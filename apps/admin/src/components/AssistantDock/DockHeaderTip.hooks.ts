import { type FocusEvent, type KeyboardEvent, type MouseEvent } from "react";
import { useInfoTip } from "@jini-ai/ui/admin-widgets";

import { shouldShowHeaderTip } from "./dock-header-rules";

/**
 * Tooltip state for one dock-header icon button. Reuses the shared `InfoTip`'s own hook, so the
 * bubble opens BELOW with the same measurement, edge shift (Jini's `placeInfoTipBubble`, by the
 * bubble's real width, inside the dock's `data-jini-tip-bounds`) and scroll-follow as the subagents
 * icon's tip. `InfoTip` itself cannot be used here: its trigger is its own `role="button"` span
 * whose click pins the tip, and these buttons' clicks already do something (close, open a menu).
 * So the wrapper only listens: hover/focus show, leave/blur/click/Escape hide.
 * @param _input - Reserved for required inputs (none today).
 * @param options.useTip - Injectable tooltip controller; defaults to the shared `useInfoTip`.
 * @returns Bubble state plus the wrapper's ref and event handlers.
 */
export function useDockHeaderTip(_input: Record<string, never> = {}, { useTip = useInfoTip }: { useTip?: typeof useInfoTip } = {}) {
  const tip = useTip({}, { placement: "bottom" });

  // The owner rejected the browser's dark tooltip stacking on this white one (2026-10-10).
  // Removing the switcher's title once was insufficient: React rewrote it on active-chat changes.
  // Jini now owns the opt-out via `nativeTitle={false}`; menu rows keep their native titles,
  // including "Double-click to rename", the only place that hint appears.

  const showFrom = (event: MouseEvent<HTMLSpanElement> | FocusEvent<HTMLSpanElement>) => {
    if (shouldShowHeaderTip({ target: event.target })) tip.show();
  };

  return {
    open: tip.open,
    coords: tip.coords,
    anchorRef: tip.iconRef,
    bubbleRef: tip.bubbleRef,
    handlers: {
      onMouseEnter: showFrom,
      onMouseLeave: tip.leave,
      onFocus: showFrom,
      onBlur: tip.hide,
      // The click is the button's own action; the tip would otherwise sit over the menu it opened.
      onClick: tip.hide,
      onKeyDown: (event: KeyboardEvent<HTMLSpanElement>) => {
        if (event.key === "Escape" && tip.open) tip.hide();
      },
    },
  };
}
