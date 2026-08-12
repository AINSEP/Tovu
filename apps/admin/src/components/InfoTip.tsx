import { useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

/**
 * @file A small "ⓘ" affordance that reveals an explanation on hover, focus, or (once open) stays
 * openable/closable entirely from the keyboard — built 2026-08-09 for Menus' "Assign location"
 * column ("for some of the titles"), but not actually wired up anywhere until ThemeExplore.tsx's
 * collapsed "you're editing your own copy" callout became its first real caller (2026-08-11).
 *
 * Deliberately NOT the native `title` attribute: browser tooltips are slow (OS-dependent hover
 * delay), inconsistently exposed to screen readers, and invisible on touch devices. Escape closes
 * the bubble without moving focus off the icon (`handleIconKeyDown` below) — `onBlur` alone only
 * covers Tab/Shift+Tab leaving the icon, not "close this but let me keep reading from here."
 *
 * Renders the bubble through a `createPortal` into `document.body`, positioned via a measured
 * `getBoundingClientRect()` rather than plain CSS `position: absolute` inside the trigger's own
 * parent. This was designed against a `<th>` in `.list-table`, which has its own `overflow: hidden`
 * (there to clip the table's own rounded corners, unrelated to this) — any bubble positioned as a
 * normal descendant gets clipped by that ancestor the moment it escapes the table's bounds, no
 * matter which side it opens on or what `z-index` it's given. A portal sidesteps the problem
 * entirely: the bubble is a sibling of `<body>`, not a descendant of whatever clipped/scrolling
 * container the trigger happens to live in, so "opens above the trigger" (the owner's actual
 * preference) is safe everywhere a future caller might sit, not just in ancestors with room to
 * spare — ThemeExplore.tsx's actual first use doesn't need it (its own header has no clipping
 * ancestor) but gets it for free at no extra cost.
 */
export function InfoTip(props: { label: string }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const iconRef = useRef<HTMLSpanElement>(null);

  const show = () => {
    const rect = iconRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords({ top: rect.top, left: rect.left + rect.width / 2 });
    setOpen(true);
  };
  const hide = () => setOpen(false);

  // Escape-to-dismiss without moving focus: `onBlur` alone only closes the bubble when focus
  // actually leaves the icon (Tab/Shift+Tab), so a keyboard user who wants to close it and stay put
  // — e.g. to keep reading the surrounding row before deciding where to go next — had no way to do
  // that until this handler existed. `stopPropagation` keeps Escape from also bubbling to an
  // ancestor dialog/drawer that treats it as "close me" (this component has no such ancestor today,
  // but a future call site inside one would otherwise close both at once on a single keypress).
  function handleIconKeyDown(e: KeyboardEvent<HTMLSpanElement>) {
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      hide();
    }
  }

  return (
    <span className="info-tip">
      <span
        ref={iconRef}
        className="info-tip-icon"
        tabIndex={0}
        aria-label={props.label}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onKeyDown={handleIconKeyDown}
      >
        ⓘ
      </span>
      {open
        ? createPortal(
            <span
              className="info-tip-bubble"
              role="presentation"
              aria-hidden="true"
              style={{ top: coords.top, left: coords.left }}
            >
              {props.label}
            </span>,
            document.body
          )
        : null}
    </span>
  );
}
