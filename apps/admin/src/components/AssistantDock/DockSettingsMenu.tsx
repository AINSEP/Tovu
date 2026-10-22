import { useId, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { RemixIcon } from "@jini-ai/ui";
import { InfoTip } from "@jini-ai/ui/admin-widgets";
import { ChatSettingsSegmented } from "@jini-ai/chat/react";

import { useTaxonomyRowMenu } from "@/features/taxonomy/TaxonomyRowMenu.hooks";
import { activateDockMenuItem, isChoiceSection, type DockSettingsMenuItem, type DockSettingsMenuSection } from "./dock-header-rules";

type DockMenu = ReturnType<typeof useTaxonomyRowMenu>;

/**
 * The dock header's gear (owner, 2026-10-11): a small menu under it, right-aligned. Built from the
 * admin's row menu — the same `.row-menu-popup`/`.row-menu-item` styling and the same open/close,
 * positioning and roving-focus hook `TaxonomyRowMenu` uses (published `RowMenu` hard-codes its ⋮
 * trigger and has no disabled rows). The hook already anchors the popup's right edge to the
 * trigger's, which keeps it inside the narrow dock.
 * Rows come in sections (a heading, then its rows); a setting row carries a check mark that is
 * always laid out and only shown when on, so toggling never shifts the menu. `notice` is a status
 * line under the rows (a failed save). A row's ⓘ sits beside its button; a radio group's single
 * ⓘ (`groupOptionTooltips`) sits beside its heading.
 * A radio group (Tool calls, Agent plugins) is the Chat settings dialog's own segmented control
 * (owner, 2026-10-21), not a column of check rows. It takes ONE roving-focus stop, its checked
 * option: ↑/↓ move between stops as before, ←/→ pick within the pill (native radio keys).
 * Disabled rows use `aria-disabled`, not `disabled`, so keyboard focus can still land on them.
 */
export function DockSettingsMenu({ label, sections, notice, useMenu = useTaxonomyRowMenu }: {
  label: string; sections: DockSettingsMenuSection[]; notice?: string; useMenu?: typeof useTaxonomyRowMenu;
}) {
  const helpId = useId();
  // Each section's first row index in the flat roving-focus order; a segmented choice is one stop.
  let nextIndex = 0;
  const firstIndexes = sections.map((section) => {
    const first = nextIndex;
    nextIndex += isChoiceSection(section) ? 1 : section.items.length;
    return first;
  });
  const menu = useMenu({ itemCount: nextIndex });
  return <>
    <button
      ref={menu.triggerRef}
      type="button"
      className="assistant-dock-icon-button"
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={menu.open}
      onClick={menu.onTriggerClick}
      onKeyDown={menu.onTriggerKeyDown}
    >
      <RemixIcon name="settings-3-line" size={16} />
    </button>
    {menu.open ? createPortal(
      <div
        ref={menu.menuRef}
        role="menu"
        aria-label={label}
        className={`row-menu-popup dock-settings-menu${menu.position?.placement === "above" ? " row-menu-popup-above" : ""}`}
        style={popupStyle(menu.position)}
        onKeyDown={menu.onMenuKeyDown}
      >
        {sections.map((section, sectionIndex) => <MenuSection key={section.key} section={section} separated={sectionIndex > 0}
          firstIndex={firstIndexes[sectionIndex]!} helpId={helpId} menu={menu} />)}
        {notice ? <p className="dock-settings-menu-notice" role="status">{notice}</p> : null}
      </div>,
      document.body,
    ) : null}
  </>;
}

/** Off-screen and hidden until the hook has measured the popup; lifted when it opens above the gear. */
function popupStyle(position: DockMenu["position"]): CSSProperties {
  return {
    position: "fixed",
    top: position ? position.top : -9999,
    left: position ? position.left : -9999,
    visibility: position ? "visible" : "hidden",
    transform: position?.placement === "above" ? "translateY(-100%)" : undefined,
    maxHeight: popupMaxHeight(position),
  };
}

/**
 * Caps the menu to the room on its side of the gear so it scrolls instead of running off-screen
 * when neither side fits it (a short phone viewport with the dock sheet half-way up). The hook
 * checks "fits below" first, so a capped below-menu still fits below on re-measure and never flips.
 */
function popupMaxHeight(position: DockMenu["position"]): string | undefined {
  if (!position) return undefined;
  return position.placement === "above" ? `${Math.max(0, position.top - 4)}px` : `calc(100dvh - ${position.top + 8}px)`;
}

function MenuSection({ section, separated, firstIndex, helpId, menu }: {
  section: DockSettingsMenuSection; separated: boolean; firstIndex: number; helpId: string; menu: DockMenu;
}) {
  return <>
    {separated ? <div role="separator" className="dock-settings-menu-separator" /> : null}
    <div role="group" aria-labelledby={section.label ? `dock-settings-${section.key}` : undefined}
      aria-describedby={section.tooltip ? `${helpId}-section-${section.key}` : undefined}>
      {/* The section's one ⓘ sits beside the heading, not in it, so the group's name stays the heading alone. */}
      {section.label ? <div className="dock-settings-menu-heading-row">
        <div id={`dock-settings-${section.key}`} className="dock-settings-menu-heading">{section.label}</div>
        {section.tooltip ? <InfoTip label={section.tooltip} descriptionId={`${helpId}-section-${section.key}`} /> : null}
      </div> : null}
      {isChoiceSection(section)
        ? <MenuChoice section={section} itemIndex={firstIndex} name={`${helpId}-${section.key}`} menu={menu} />
        : section.items.map((item, offset) => <MenuRow key={item.key} item={item} itemIndex={firstIndex + offset} helpId={helpId} menu={menu} />)}
    </div>
  </>;
}

/** A radio section as the dialog's segmented pill; a choice applies in place and leaves the menu open. */
function MenuChoice({ section, itemIndex, name, menu }: { section: DockSettingsMenuSection; itemIndex: number; name: string; menu: DockMenu }) {
  return <div className="dock-settings-menu-choice">
    <ChatSettingsSegmented name={name} inputRole="menuitemradio"
      // The hook's roving focus only calls `focus()`, so the checked radio can fill a button's slot.
      checkedRef={(input) => { menu.itemRefs.current[itemIndex] = input as unknown as HTMLButtonElement | null; }}
      items={section.items.map((item) => ({ ...item, change: () => activateDockMenuItem({ item, selectItem: menu.selectItem }) }))} />
  </div>;
}

function MenuRow({ item, itemIndex, helpId, menu }: { item: DockSettingsMenuItem; itemIndex: number; helpId: string; menu: DockMenu }) {
  const checkable = item.role === "menuitemradio" || item.role === "menuitemcheckbox";
  const descriptionId = `${helpId}-${item.key}`;
  return <div className="dock-settings-menu-row">
    <button
      ref={(element) => { menu.itemRefs.current[itemIndex] = element; }}
      type="button"
      role={item.role ?? "menuitem"}
      aria-checked={checkable ? Boolean(item.checked) : undefined}
      tabIndex={-1}
      className="row-menu-item"
      aria-describedby={item.tooltip ? descriptionId : undefined}
      aria-disabled={item.disabled ? true : undefined}
      onClick={() => activateDockMenuItem({ item, selectItem: menu.selectItem })}
    >
      {checkable ? <span className="dock-settings-menu-check" aria-hidden="true"><RemixIcon name="check-line" size={14} /></span> : null}
      {item.label}
    </button>
    {item.tooltip ? <InfoTip label={item.tooltip} descriptionId={descriptionId} /> : null}
  </div>;
}
