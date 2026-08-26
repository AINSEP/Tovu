import { createPortal } from "react-dom";
import { agentHandle } from "@jini-ai/agentic";

import { useInfoTip } from "./InfoTip.hooks";

/**
 * @file A small "ⓘ" affordance that reveals an explanation on hover, focus, or (once open) stays
 * openable/closable entirely from the keyboard — built 2026-08-09 for Menus' "Assign location"
 * column ("for some of the titles"), but not actually wired up anywhere until ThemeExplore.tsx's
 * collapsed "you're editing your own copy" callout became its first real caller (2026-08-11).
 *
 * Deliberately NOT the native `title` attribute: browser tooltips are slow (OS-dependent hover
 * delay), inconsistently exposed to screen readers, and invisible on touch devices. Escape closes
 * the bubble without moving focus off the icon (`handleIconKeyDown`, in `InfoTip.hooks.tsx`) —
 * `onBlur` alone only covers Tab/Shift+Tab leaving the icon, not "close this but let me keep
 * reading from here."
 *
 * Renders the bubble through a `createPortal` into `document.body`, positioned via a measured
 * `getBoundingClientRect()` rather than plain CSS `position: absolute` inside the trigger's own
 * parent. This was designed against a `<th>` in `.list-table`, which has its own `overflow: hidden`
 * (there to clip the table's own rounded corners, unrelated to this) — any bubble positioned as a
 * normal descendant gets clipped by that ancestor the moment it escapes the table's bounds, no
 * matter which side it opens on or what `z-index` it's given. A portal sidesteps the problem
 * entirely: the bubble is a sibling of `<body>`, not a descendant of whatever clipped/scrolling
 * container the trigger happens to live in, so "opens above the trigger" (the owner's actual
 * preference) is safe in ancestors with room to spare.
 *
 * "Opens above" is a preference, not an unconditional rule — see `InfoTip.hooks.tsx`'s
 * `ABOVE_HEADROOM_PX` for the floor that overrides it near the top of the viewport.
 *
 * State/effects (open/closed, placement, portal coordinates) live in `InfoTip.hooks.tsx`, split
 * out the same way `SeeMore`/`SeeMore.hooks.tsx` does: this file stays props-and-JSX only, and the
 * `useTip` prop below lets a test render this JSX against a fake hook — no real DOM measurement
 * required.
 */
export interface InfoTipProps {
  label: string;
  /** Injectable seam for the tooltip's open/close state and placement measurement. Defaults to the
   *  real {@link useInfoTip}; a test can pass a fake here to exercise `InfoTip`'s rendering with a
   *  fixed `open`/`placement`/`coords` instead of driving real hover/focus/measurement. */
  useTip?: typeof useInfoTip;
  /** Publishes the "ⓘ" icon itself as agent-addressable via `agentHandle()` (`@jini-ai/agentic`).
   *  A click ends up focusing the icon, which opens the bubble the same way hover does — so this
   *  is tagged `role: "button"` despite having no `onClick` of its own. Omit to leave it untagged;
   *  every existing render then stays byte-identical, since `agentHandle()` is only spread onto the
   *  icon when a handle is present. */
  agentHandle?: string;
}

export function InfoTip({ label, useTip = useInfoTip, agentHandle: handle }: InfoTipProps) {
  const { open, placement, coords, iconRef, show, hide, handleIconKeyDown } = useTip();

  return (
    <span className="info-tip">
      <span
        ref={iconRef}
        className="info-tip-icon"
        tabIndex={0}
        aria-label={label}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onKeyDown={handleIconKeyDown}
        {...(handle ? agentHandle(handle, { role: "button", label }) : {})}
      >
        ⓘ
      </span>
      {open
        ? createPortal(
            <span
              className={placement === "below" ? "info-tip-bubble info-tip-bubble-below" : "info-tip-bubble"}
              role="presentation"
              aria-hidden="true"
              style={{ top: coords.top, left: coords.left }}
            >
              {label}
            </span>,
            document.body
          )
        : null}
    </span>
  );
}
