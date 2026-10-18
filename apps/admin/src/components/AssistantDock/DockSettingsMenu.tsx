import { Fragment, useId } from "react";
import { createPortal } from "react-dom";
import { RemixIcon } from "@jini-ai/ui";
import { InfoTip } from "@jini-ai/ui/admin-widgets";

import { useTaxonomyRowMenu } from "@/features/taxonomy/TaxonomyRowMenu.hooks";
import { activateDockMenuItem, type DockSettingsMenuSection } from "./dock-header-rules";

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
 * Disabled rows use `aria-disabled`, not `disabled`, so keyboard focus can still land on them.
 */
export function DockSettingsMenu({ label, sections, notice, useMenu = useTaxonomyRowMenu }: {
  label: string; sections: DockSettingsMenuSection[]; notice?: string; useMenu?: typeof useTaxonomyRowMenu;
}) {
  const items = sections.flatMap((section) => section.items);
  const menu = useMenu({ itemCount: items.length });
  const helpId = useId();
  let index = 0;
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
        style={{
          position: "fixed",
          top: menu.position ? menu.position.top : -9999,
          left: menu.position ? menu.position.left : -9999,
          visibility: menu.position ? "visible" : "hidden",
          transform: menu.position?.placement === "above" ? "translateY(-100%)" : undefined,
        }}
        onKeyDown={menu.onMenuKeyDown}
      >
        {sections.map((section, sectionIndex) => <Fragment key={section.key}>
          {sectionIndex > 0 ? <div role="separator" className="dock-settings-menu-separator" /> : null}
          <div role="group" aria-labelledby={section.label ? `dock-settings-${section.key}` : undefined}
            aria-describedby={section.tooltip ? `${helpId}-section-${section.key}` : undefined}>
            {/* The section's one ⓘ sits beside the heading, not in it, so the group's name stays the heading alone. */}
            {section.label ? <div className="dock-settings-menu-heading-row">
              <div id={`dock-settings-${section.key}`} className="dock-settings-menu-heading">{section.label}</div>
              {section.tooltip ? <InfoTip label={section.tooltip} descriptionId={`${helpId}-section-${section.key}`} /> : null}
            </div> : null}
            {section.items.map((item) => {
              const itemIndex = index++;
              const checkable = item.role === "menuitemradio" || item.role === "menuitemcheckbox";
              const descriptionId = `${helpId}-${item.key}`;
              return <div key={item.key} className="dock-settings-menu-row">
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
            })}
          </div>
        </Fragment>)}
        {notice ? <p className="dock-settings-menu-notice" role="status">{notice}</p> : null}
      </div>,
      document.body,
    ) : null}
  </>;
}
