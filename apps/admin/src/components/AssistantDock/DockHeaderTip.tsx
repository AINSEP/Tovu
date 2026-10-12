import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { infoTipBubbleStyle } from "@jini-ai/ui/admin-widgets";

import { useDockHeaderTip } from "./DockHeaderTip.hooks";

/**
 * Wraps one dock-header icon button (close, conversations, settings) with the same white bubble
 * the subagents icon's `InfoTip` shows, opening under it (owner, 2026-10-11). Same markup and
 * classes as `InfoTip`'s portal, so `styles.css`'s `.info-tip-bubble` rules style both.
 * The bubble is `aria-hidden`: each wrapped button carries the same text as its own `aria-label`.
 */
export function DockHeaderTip({ label, children, useTip = useDockHeaderTip }: {
  label: string; children: ReactNode; useTip?: typeof useDockHeaderTip;
}) {
  const tip = useTip();
  return (
    <span ref={tip.anchorRef} className="dock-header-tip" {...tip.handlers}>
      {children}
      {tip.open
        ? createPortal(
            <span ref={tip.bubbleRef} className="info-tip-bubble info-tip-bubble-below" role="presentation" aria-hidden="true"
              style={infoTipBubbleStyle(tip.coords)}>
              {label}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
