import { createPortal } from "react-dom";
import { RemixIcon } from "@jini-ai/ui";

import { useTaxonomyRowMenu } from "@/features/taxonomy/TaxonomyRowMenu.hooks";
import { activateDockMenuItem, type DockSettingsMenuItem } from "./dock-header-rules";

/**
 * The dock header's gear (owner, 2026-10-11): a small menu under it, right-aligned. Built from the
 * admin's row menu — the same `.row-menu-popup`/`.row-menu-item` styling and the same open/close,
 * positioning and roving-focus hook `TaxonomyRowMenu` uses (published `RowMenu` hard-codes its ⋮
 * trigger and has no disabled rows). The hook already anchors the popup's right edge to the
 * trigger's, which keeps it inside the narrow dock.
 * Disabled rows use `aria-disabled`, not `disabled`, so keyboard focus can still land on them.
 */
export function DockSettingsMenu({ label, items, useMenu = useTaxonomyRowMenu }: {
  label: string; items: DockSettingsMenuItem[]; useMenu?: typeof useTaxonomyRowMenu;
}) {
  const menu = useMenu({ itemCount: items.length });
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
        className={`row-menu-popup${menu.position?.placement === "above" ? " row-menu-popup-above" : ""}`}
        style={{
          position: "fixed",
          top: menu.position ? menu.position.top : -9999,
          left: menu.position ? menu.position.left : -9999,
          visibility: menu.position ? "visible" : "hidden",
          transform: menu.position?.placement === "above" ? "translateY(-100%)" : undefined,
        }}
        onKeyDown={menu.onMenuKeyDown}
      >
        {items.map((item, index) => <button
          key={item.key}
          ref={(element) => { menu.itemRefs.current[index] = element; }}
          type="button"
          role="menuitem"
          tabIndex={-1}
          className="row-menu-item"
          aria-disabled={item.disabled ? true : undefined}
          onClick={() => activateDockMenuItem({ item, selectItem: menu.selectItem })}
        >{item.label}</button>)}
      </div>,
      document.body,
    ) : null}
  </>;
}
