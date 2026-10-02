import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TaxonomyRowMenu } from "../TaxonomyRowMenu";

// F1.1/F6.2: real menu, real focus and events. Only action callbacks are faked.
function renderMenu() {
  const host = document.createElement("main");
  document.body.append(host);
  const edit = vi.fn();
  const remove = vi.fn();
  const view = render(<TaxonomyRowMenu
    portalContainer={host}
    triggerLabel="Actions for Category"
    agentHandle="category-menu"
    items={[
      { key: "edit", label: "Edit", onSelect: edit },
      { key: "delete", label: "Delete", tone: "danger", onSelect: remove },
    ]}
  />, { container: host });
  return { host, edit, remove, ...view };
}

describe("taxonomy menus compatible with published admin", () => {
  it("keeps the trigger disabled until a page-owned popup container is mounted", () => {
    render(<TaxonomyRowMenu portalContainer={null} triggerLabel="Actions" items={[{ key: "edit", label: "Edit", onSelect: vi.fn() }]} />);
    expect(screen.getByRole("button", { name: "Actions" })).toBeDisabled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("renders its popup in the supplied page scope, outside the row, and cleans up on unmount", async () => {
    const { host, container, unmount } = renderMenu();
    const trigger = screen.getByRole("button", { name: "Actions for Category" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await userEvent.click(trigger);
    const menu = within(host).getByRole("menu", { name: "Actions for Category" });
    expect(menu.parentElement).toBe(host);
    expect(menu.style.position).toBe("fixed");
    expect(within(menu).getByRole("menuitem", { name: "Delete" })).toHaveClass("btn-danger");
    expect(within(menu).getByRole("menuitem", { name: "Delete" })).toHaveAttribute("data-agent-element", "category-menu-item-delete");
    unmount();
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.querySelector('[data-agent-element="category-menu-item-delete"]')).toBeNull();
    host.remove();
  });

  it("supports keyboard navigation, selection and Escape with focus returned to the trigger", async () => {
    const { host, edit, remove } = renderMenu();
    const trigger = screen.getByRole("button", { name: "Actions for Category" });
    trigger.focus();
    await userEvent.keyboard("{ArrowUp}");
    const menu = within(host).getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Delete" })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(within(menu).getByRole("menuitem", { name: "Edit" })).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(within(menu).getByRole("menuitem", { name: "Delete" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(remove).toHaveBeenCalledExactlyOnceWith();
    expect(edit).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(within(host).getByRole("menuitem", { name: "Edit" })).toHaveFocus();
    await userEvent.keyboard("{End}{ArrowDown}");
    expect(within(host).getByRole("menuitem", { name: "Edit" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    host.remove();
  });

  it("closes on an outside pointer or Tab without invoking actions", async () => {
    const { host, edit, remove } = renderMenu();
    const trigger = screen.getByRole("button", { name: "Actions for Category" });
    await userEvent.click(trigger);
    expect(within(host).getByRole("menu")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await userEvent.click(trigger);
    await userEvent.keyboard("{Tab}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(edit).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    host.remove();
  });

  it("repositions the fixed popup when its anchor scrolls", async () => {
    const { host } = renderMenu();
    const trigger = screen.getByRole("button", { name: "Actions for Category" });
    let bottom = 40;
    vi.spyOn(trigger, "getBoundingClientRect").mockImplementation(() => ({
      top: bottom - 20, bottom, left: 100, right: 120, width: 20, height: 20, x: 100, y: bottom - 20,
      toJSON: () => ({}),
    }));
    await userEvent.click(trigger);
    const menu = within(host).getByRole("menu");
    expect(menu.style.top).toBe("44px");
    bottom = 70;
    fireEvent.scroll(window);
    expect(menu.style.top).toBe("74px");
    host.remove();
  });
});
