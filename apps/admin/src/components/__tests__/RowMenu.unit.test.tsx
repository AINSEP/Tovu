import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RowMenu, type RowMenuItem } from "../RowMenu";

/**
 * @file `RowMenu` — the portaled 3-dot row overflow menu (see the component's own file header for
 * the `overflow-x: auto` clipping problem this works around, same one `Sidebar.tsx`'s
 * `RailTooltip` already solved for the sidebar). These tests pin the trigger's accessible
 * name/state, the portal target (`document.body`, not wherever `RowMenu` itself is mounted —
 * the whole reason it exists), `role="menu"`/`"menuitem"` semantics, arrow-key/Home/End/Escape
 * navigation, item selection, and click-outside dismissal. Positioning math (`getBoundingClientRect`)
 * is not asserted — jsdom has no real layout engine, so pixel values would be meaningless; only
 * the interaction contract is pinned here.
 */

function items(onSelect: (key: string) => void = () => {}): RowMenuItem[] {
  return [
    { key: "edit", label: "Edit", onSelect: () => onSelect("edit") },
    { key: "disable", label: "Disable", tone: "warning", onSelect: () => onSelect("disable") },
    { key: "delete", label: "Delete", tone: "danger", onSelect: () => onSelect("delete") },
  ];
}

describe("trigger", () => {
  it("has an accessible name, aria-haspopup, and starts collapsed", () => {
    render(<RowMenu triggerLabel='Actions for "My Post"' items={items()} />);
    const trigger = screen.getByRole("button", { name: 'Actions for "My Post"' });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the menu on click and sets aria-expanded", async () => {
    const user = userEvent.setup();
    render(<RowMenu triggerLabel='Actions for "My Post"' items={items()} />);
    await user.click(screen.getByRole("button", { name: 'Actions for "My Post"' }));

    expect(screen.getByRole("button", { name: 'Actions for "My Post"' })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });
});

describe("portal target", () => {
  it("renders the menu on document.body, not inside RowMenu's own render tree", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div className="table-scroll" style={{ overflow: "hidden" }}>
        <RowMenu triggerLabel='Actions for "My Post"' items={items()} />
      </div>
    );
    await user.click(screen.getByRole("button", { name: 'Actions for "My Post"' }));

    // The whole point: a menu that were a descendant of `container` would be clipped by an
    // `overflow: hidden` ancestor exactly like `.table-scroll`/`.list-table` in the real screens.
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
  });
});

describe("menu content", () => {
  it("renders one menuitem per item", async () => {
    const user = userEvent.setup();
    render(<RowMenu triggerLabel="Actions" items={items()} />);
    await user.click(screen.getByRole("button", { name: "Actions" }));

    const menu = screen.getByRole("menu");
    const options = within(menu).getAllByRole("menuitem");
    expect(options.map((o) => o.textContent)).toEqual(["Edit", "Disable", "Delete"]);
  });
});

/**
 * Three-tier tone API (MSG-07): `tone` wires directly to the shared `.btn-warning`/`.btn-danger`
 * classes rather than a bespoke class, so the row-scoped CSS composing rule (`.row-menu-item.btn-
 * danger`/`.row-menu-item.btn-warning` in `styles.css`) is the thing actually producing the color
 * — these tests just pin that the right class lands on the right item, not the resulting color.
 */
describe("tone", () => {
  it("applies no tone class for the default tone", async () => {
    const user = userEvent.setup();
    render(<RowMenu triggerLabel="Actions" items={[{ key: "edit", label: "Edit", onSelect: vi.fn() }]} />);
    await user.click(screen.getByRole("button", { name: "Actions" }));

    const item = screen.getByRole("menuitem", { name: "Edit" });
    expect(item).not.toHaveClass("btn-warning");
    expect(item).not.toHaveClass("btn-danger");
  });

  it('applies .btn-warning for tone: "warning"', async () => {
    const user = userEvent.setup();
    render(
      <RowMenu
        triggerLabel="Actions"
        items={[{ key: "disable", label: "Disable", tone: "warning", onSelect: vi.fn() }]}
      />
    );
    await user.click(screen.getByRole("button", { name: "Actions" }));

    const item = screen.getByRole("menuitem", { name: "Disable" });
    expect(item).toHaveClass("btn-warning");
    expect(item).not.toHaveClass("btn-danger");
  });

  it('applies .btn-danger for tone: "danger"', async () => {
    const user = userEvent.setup();
    render(
      <RowMenu triggerLabel="Actions" items={[{ key: "delete", label: "Delete", tone: "danger", onSelect: vi.fn() }]} />
    );
    await user.click(screen.getByRole("button", { name: "Actions" }));

    const item = screen.getByRole("menuitem", { name: "Delete" });
    expect(item).toHaveClass("btn-danger");
    expect(item).not.toHaveClass("btn-warning");
  });

  it("maps the deprecated destructive: true to .btn-danger for callers that haven't migrated", async () => {
    const user = userEvent.setup();
    render(
      <RowMenu
        triggerLabel="Actions"
        items={[{ key: "delete", label: "Delete", destructive: true, onSelect: vi.fn() }]}
      />
    );
    await user.click(screen.getByRole("button", { name: "Actions" }));

    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveClass("btn-danger");
  });

  it("prefers tone over destructive when both are passed", async () => {
    const user = userEvent.setup();
    render(
      <RowMenu
        triggerLabel="Actions"
        items={[{ key: "disable", label: "Disable", destructive: true, tone: "warning", onSelect: vi.fn() }]}
      />
    );
    await user.click(screen.getByRole("button", { name: "Actions" }));

    const item = screen.getByRole("menuitem", { name: "Disable" });
    expect(item).toHaveClass("btn-warning");
    expect(item).not.toHaveClass("btn-danger");
  });
});

describe("selection", () => {
  it("fires the item's onSelect, closes the menu, and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<RowMenu triggerLabel="Actions" items={items(onSelect)} />);
    const trigger = screen.getByRole("button", { name: "Actions" });

    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Disable" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("disable");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });
});

describe("keyboard navigation", () => {
  it("ArrowDown opens the menu focused on the first item", async () => {
    const user = userEvent.setup();
    render(<RowMenu triggerLabel="Actions" items={items()} />);
    screen.getByRole("button", { name: "Actions" }).focus();

    await user.keyboard("{ArrowDown}");

    expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus();
  });

  it("ArrowUp opens the menu focused on the last item", async () => {
    const user = userEvent.setup();
    render(<RowMenu triggerLabel="Actions" items={items()} />);
    screen.getByRole("button", { name: "Actions" }).focus();

    await user.keyboard("{ArrowUp}");

    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
  });

  it("ArrowDown/ArrowUp move focus among items and wrap", async () => {
    const user = userEvent.setup();
    render(<RowMenu triggerLabel="Actions" items={items()} />);
    await user.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Disable" })).toHaveFocus();

    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
  });

  it("Home/End jump to the first/last item", async () => {
    const user = userEvent.setup();
    render(<RowMenu triggerLabel="Actions" items={items()} />);
    await user.click(screen.getByRole("button", { name: "Actions" }));

    await user.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();

    await user.keyboard("{Home}");
    expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus();
  });

  it("Escape closes the menu and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<RowMenu triggerLabel="Actions" items={items()} />);
    const trigger = screen.getByRole("button", { name: "Actions" });
    await user.click(trigger);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });
});

describe("dismissal", () => {
  it("closes on an outside click without firing any item's onSelect", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <div>
        <RowMenu triggerLabel="Actions" items={items(onSelect)} />
        <button type="button">elsewhere</button>
      </div>
    );
    await user.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "elsewhere" }));

    expect(screen.queryByRole("menu")).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
