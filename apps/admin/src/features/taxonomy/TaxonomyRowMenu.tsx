import { createPortal } from "react-dom";
import type { JSX } from "react";
import { resolveTone, toneClassName, type RowMenuProps } from "@jini-ai/admin/react";
import { agentHandle } from "@jini-ai/agentic";
import { buildAgentListHandles } from "../../lib/agent-list-handles";
import { useTaxonomyRowMenu } from "./TaxonomyRowMenu.hooks";

export type TaxonomyRowMenuProps = Pick<RowMenuProps, "items" | "triggerLabel" | "agentHandle"> & {
  /** Mounted page root, outside the row scroller and inside the scoped agent driver. */
  portalContainer: HTMLElement | null;
};

/**
 * A page-scoped overflow menu using the contracts published in admin 0.3.10.
 * That release's RowMenu always portals to document.body, outside the page driver's root.
 * Keep the host-specific portal here until a published component offers the same contract.
 * @param props - Actions, accessible trigger name, optional agent handle and mounted page root.
 * @returns Trigger plus a fixed popup; no popup is allowed before the page root mounts.
 * @example <TaxonomyRowMenu items={actions} triggerLabel="Actions" portalContainer={pageRoot} />
 */
export function TaxonomyRowMenu({ items, triggerLabel, agentHandle: baseHandle, portalContainer }: TaxonomyRowMenuProps): JSX.Element {
  const menu = useTaxonomyRowMenu({ itemCount: items.length });
  const itemHandles = baseHandle ? buildAgentListHandles(`${baseHandle}-item`, items.map((item) => item.key)) : undefined;
  return <>
    <button
      ref={menu.triggerRef}
      type="button"
      className="row-menu-trigger"
      aria-label={triggerLabel}
      aria-haspopup="menu"
      aria-expanded={menu.open}
      disabled={portalContainer === null || items.length === 0}
      onClick={menu.onTriggerClick}
      onKeyDown={menu.onTriggerKeyDown}
      {...(baseHandle === undefined ? {} : agentHandle(baseHandle, { role: "button", label: triggerLabel }))}
    >
      <svg viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
        <circle cx="9" cy="4.5" r="1.5" />
        <circle cx="9" cy="9" r="1.5" />
        <circle cx="9" cy="13.5" r="1.5" />
      </svg>
    </button>
    {menu.open && portalContainer ? createPortal(
      <div
        ref={menu.menuRef}
        role="menu"
        aria-label={triggerLabel}
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
          className={["row-menu-item", toneClassName(resolveTone(item))].filter(Boolean).join(" ")}
          onClick={() => menu.selectItem(item.onSelect)}
          {...(itemHandles === undefined ? {} : agentHandle(itemHandles[index], { role: "button", label: item.label }))}
        >{item.label}</button>)}
      </div>, portalContainer,
    ) : null}
  </>;
}
