import { useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * @file A small "ⓘ" affordance that reveals an explanation on hover/focus — for column headers and
 * field labels whose meaning isn't obvious from the label alone (first use: Menus' "Assign
 * location" column, 2026-08-09 owner request — "for some of the titles", implying more call sites
 * later, hence a shared component here rather than inlining it into `Menus.tsx`).
 *
 * Deliberately NOT the native `title` attribute: browser tooltips are slow (OS-dependent hover
 * delay), inconsistently exposed to screen readers, and invisible on touch devices.
 *
 * Renders the bubble through a `createPortal` into `document.body`, positioned via a measured
 * `getBoundingClientRect()` rather than plain CSS `position: absolute` inside the trigger's own
 * parent. Found live: this component's first real use sits inside a `<th>` in `.list-table`, which
 * has its own `overflow: hidden` (there to clip the table's own rounded corners, unrelated to this)
 * — any bubble positioned as a normal descendant gets clipped by that ancestor the moment it
 * escapes the table's bounds, no matter which side it opens on or what `z-index` it's given. A
 * portal sidesteps the problem entirely: the bubble is a sibling of `<body>`, not a descendant of
 * whatever clipped/scrolling container the trigger happens to live in, so "opens above the trigger"
 * (the owner's actual preference) is safe everywhere, not just in ancestors with room to spare.
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
