import { useEffect, useRef, useState, type MouseEvent, type FocusEvent } from "react";
import { createPortal } from "react-dom";
import { NAV, type NavItem } from "../nav";
import { adminHref } from "../lib/router";
import { useSidebarRail } from "../hooks/use-sidebar-rail.hooks";

/**
 * Grouped admin sidebar (the `.cms-nav` design). Replaces the flat,
 * WordPress-shaped menu. `activeId` matches a NavItem.id (see App.activeSectionId).
 *
 * Below the tablet breakpoint (`styles.css`'s `@media (max-width: 900px)`) this same nav becomes
 * an off-canvas drawer driven by `open`/`onClose`, toggled from `App.tsx`'s mobile top bar
 * (`.admin-topbar-toggle`). At desktop widths `open`/`onClose` are inert — the nav is always
 * in-flow and `.cms-nav-mobile-head` stays `display: none` — so this component has one render
 * path for both layouts rather than a second mobile-only variant.
 *
 * At desktop widths only, this same nav can also collapse to an icon-only rail
 * (`.cms-nav.is-rail`, `useSidebarRail`) — a *different* boolean from the mobile drawer's `open`,
 * on purpose: MSG-05's own wording was "a user who collapsed the rail on desktop should not find
 * their phone drawer stuck open, and vice versa". `useSidebarRail` owns its own persistence
 * (localStorage) entirely inside this component; `App.tsx` never needs to know the rail state
 * exists, unlike `open`/`onClose`, which App.tsx also needs for the backdrop it renders.
 */

/** One rail tooltip's target: the label to show and the viewport point to anchor it at (already
 *  vertically centered / horizontally offset past the hovered item — see `showTooltip` below). */
interface TooltipTarget {
  label: string;
  top: number;
  left: number;
}

function Icon(props: { markup: string }) {
  return (
    <svg
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      dangerouslySetInnerHTML={{ __html: props.markup }}
    />
  );
}

/**
 * Rail-mode tooltip, portaled to `document.body`.
 *
 * Not a CSS-only `position: absolute` child of the hovered item (the first approach tried here) —
 * `.cms-nav` needs `overflow-y: auto` for its own scrollbar, and the CSS overflow spec computes
 * an omitted or even an explicitly-`visible` `overflow-x` to `auto` the instant the other axis
 * isn't `visible` (verified live: setting `overflow-x: visible` alongside `overflow-y: auto` on
 * `.cms-nav` still read back as `overflow-x: auto` via `getComputedStyle`). That silently clips
 * anything positioned to escape the rail's own edge, including a tooltip meant to float over the
 * page next to it — `opacity`/`visibility` both read correctly in a probe, but nothing painted.
 * A portal sidesteps the ancestor entirely: the tooltip is a DOM sibling of the app root, not a
 * descendant of the clipping element, positioned with `position: fixed` at coordinates computed
 * from the hovered item's own `getBoundingClientRect()`.
 */
function RailTooltip(props: { target: TooltipTarget | null }) {
  if (!props.target) return null;
  return createPortal(
    <div className="cms-tooltip-portal" style={{ top: props.target.top, left: props.target.left }} role="presentation">
      {props.target.label}
    </div>,
    document.body,
  );
}

function Item(props: {
  item: NavItem;
  active: boolean;
  onShowTooltip: (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>, label: string) => void;
  onHideTooltip: () => void;
}) {
  const { item, active } = props;

  if (item.soon || !item.href) {
    return (
      <div className="cms-item is-soon" aria-disabled="true">
        <Icon markup={item.icon} />
        <span>{item.label}</span>
        {/* Hidden outright in rail mode (`styles.css`) rather than shrunk — there is nowhere for
            a "Soon" pill to sit next to a centered icon, and `is-soon`'s own faint icon/text
            color (below) is what keeps the item reading as disabled once the badge is gone. */}
        <span className="soon">Soon</span>
      </div>
    );
  }

  return (
    <a
      className={`cms-item${active ? " active" : ""}`}
      // `NavItem.href` is a route path; the `/admin` base is applied here so nav.ts never has to
      // know it. A real URL, so cmd-click and "copy link address" behave normally.
      href={adminHref(item.href)}
      aria-current={active ? "page" : undefined}
      onMouseEnter={(e) => props.onShowTooltip(e, item.label)}
      onMouseLeave={props.onHideTooltip}
      onFocus={(e) => props.onShowTooltip(e, item.label)}
      onBlur={props.onHideTooltip}
    >
      <Icon markup={item.icon} />
      {/* The real accessible name — kept in the DOM and merely clipped visually in rail mode
          (`styles.css`'s rail block reuses the same clip-rect recipe as `.visually-hidden`), not
          removed, so the rail stays a set of named links rather than 26 unlabelled icons. The
          portaled tooltip above is a *sighted-only* supplement to this, not a replacement for
          it — a screen reader never sees the portal, only this label. */}
      <span>{item.label}</span>
    </a>
  );
}

export function Sidebar(props: { activeId: string; onLogout: () => void; open: boolean; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const rail = useSidebarRail();
  const [tooltip, setTooltip] = useState<TooltipTarget | null>(null);

  // Moves focus onto the drawer's own close control the moment it opens, so a keyboard/screen-
  // reader user lands inside the drawer rather than on whatever was focused behind it (the
  // topbar toggle that just opened it). Only fires on the open transition, not on every render.
  useEffect(() => {
    if (props.open) closeButtonRef.current?.focus();
  }, [props.open]);

  // Rail state can change (toggled, or the viewport crossing the 900px breakpoint) while a
  // tooltip is showing; drop it rather than let a stale one float over content that no longer
  // corresponds to a collapsed rail.
  useEffect(() => {
    setTooltip(null);
  }, [rail.collapsed]);

  function showTooltip(e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>, label: string) {
    if (!rail.collapsed) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTooltip({ label, top: r.top + r.height / 2, left: r.right + 10 });
  }
  function hideTooltip() {
    setTooltip(null);
  }

  return (
    <nav
      className={`cms-nav scroll${props.open ? " is-open" : ""}${rail.collapsed ? " is-rail" : ""}`}
      aria-label="Admin"
      id="admin-sidebar"
    >
      <div className="cms-nav-mobile-head">
        <span>Navigation</span>
        <button ref={closeButtonRef} type="button" className="cms-nav-close" onClick={props.onClose} aria-label="Close navigation">
          <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M5 5 13 13M13 5 5 13" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {NAV.map((group, gi) => (
        <div className="cms-section" key={group.label ?? `top-${gi}`}>
          {/* In rail mode this becomes a plain divider rule (styles.css) rather than vanishing —
              26 items across five groups with zero separation once the labels are gone is a
              scanning problem of its own (MSG-05). The label text stays in the DOM either way. */}
          {group.label ? <div className="cms-group">{group.label}</div> : null}
          {group.items.map((item) => (
            <Item
              key={item.id}
              item={item}
              active={item.id === props.activeId}
              onShowTooltip={showTooltip}
              onHideTooltip={hideTooltip}
            />
          ))}
        </div>
      ))}

      <div className="cms-foot">
        {/* Desktop-only (styles.css hides this row in the mobile drawer, which has its own close
            control above and no rail concept). A real accessible name + `aria-expanded` per
            MSG-05 — not a bare icon button. */}
        <div className="cms-rail-toggle-row">
          <button
            type="button"
            className="cms-rail-toggle"
            onClick={rail.toggle}
            aria-expanded={!rail.collapsed}
            aria-label={rail.collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={rail.collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              {/* Two chevrons back-to-back (a "collapse/expand panel" glyph), flipped via CSS
                  rotation on `.is-rail` rather than swapped markup — one icon, two states. */}
              <path d="M6.5 4.5 3.5 9l3 4.5M11.5 4.5 14.5 9l-3 4.5" />
            </svg>
          </button>
        </div>
        <button
          className="cms-logout"
          onClick={props.onLogout}
          onMouseEnter={(e) => showTooltip(e, "Log out")}
          onMouseLeave={hideTooltip}
          onFocus={(e) => showTooltip(e, "Log out")}
          onBlur={hideTooltip}
        >
          <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M7 15H4a1.5 1.5 0 01-1.5-1.5v-9A1.5 1.5 0 014 3h3M11.5 12L15 9l-3.5-3M15 9H7" />
          </svg>
          <span>Log out</span>
        </button>
      </div>
      <RailTooltip target={tooltip} />
    </nav>
  );
}
