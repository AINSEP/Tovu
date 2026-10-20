import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { useTaxonomyRowMenu } from "@/features/taxonomy/TaxonomyRowMenu.hooks";
import { DockSettingsMenu } from "../DockSettingsMenu";
import type { DockSettingsMenuSection } from "../dock-header-rules";

/**
 * @file `DockSettingsMenu` markup for every popup position and row shape, against a typed fake of
 * its menu hook (the `useMenu` seam). Open/close and focus behaviour with the real hook live in
 * `dock-header.unit.test.tsx`.
 */

afterEach(cleanup);

type Menu = ReturnType<typeof useTaxonomyRowMenu>;

/** An always-open (or closed) menu at a fixed position that records its close-then-run calls. */
function fakeMenu(state: { open: boolean; position: Menu["position"] }) {
  const selected: Array<() => void> = [];
  const itemRefs: Menu["itemRefs"] = { current: [] };
  const menu: Menu = {
    ...state, triggerRef: createRef(), menuRef: createRef(), itemRefs,
    onTriggerClick: () => {}, onTriggerKeyDown: () => {}, onMenuKeyDown: () => {},
    selectItem: ({ onSelect }) => { selected.push(onSelect); },
  };
  const useMenu: typeof useTaxonomyRowMenu = () => menu;
  return { menu, useMenu, selected };
}

const SECTIONS: DockSettingsMenuSection[] = [
  { key: "show", label: "Show", tooltip: "• Shown: visible", items: [
    { key: "shown", label: "Shown", role: "menuitemradio", checked: true },
    { key: "hidden", label: "Hidden", role: "menuitemradio" },
  ] },
  { key: "toggles", label: "Toggles", items: [
    { key: "wrap", label: "Wrap", role: "menuitemcheckbox", checked: false, tooltip: "Wrap long lines" },
  ] },
  { key: "actions", items: [
    { key: "open", label: "Open settings", onSelect: () => {} },
    { key: "soon", label: "Coming soon", disabled: true },
  ] },
];

function renderMenu(state: { open: boolean; position: Menu["position"] }, notice?: string) {
  const fake = fakeMenu(state);
  render(<DockSettingsMenu label="Chat settings" sections={SECTIONS} notice={notice} useMenu={fake.useMenu} />);
  return fake;
}

/** A measured popup, so role queries can see it (an unmeasured one is `visibility: hidden`). */
const PLACED = { open: true, position: { top: 0, left: 0, placement: "below" } } as const;

const popup = () => document.querySelector<HTMLElement>("[role=menu]")!;

describe("popup", () => {
  it("renders only the gear while closed", () => {
    renderMenu({ open: false, position: null });
    expect(screen.getByRole("button", { name: "Chat settings" }).getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector("[role=menu]")).toBeNull();
  });

  it("keeps an unmeasured popup hidden off-screen", () => {
    renderMenu({ open: true, position: null });
    expect(popup().className).toBe("row-menu-popup dock-settings-menu");
    expect(popup().style.cssText).toBe("position: fixed; top: -9999px; left: -9999px; visibility: hidden;");
  });

  it("places a measured popup below the gear", () => {
    renderMenu({ open: true, position: { top: 10, left: 20, placement: "below" } });
    expect(popup().className).toBe("row-menu-popup dock-settings-menu");
    expect(popup().style.cssText).toBe("position: fixed; top: 10px; left: 20px; visibility: visible;");
  });

  it("lifts a popup that opens above the gear", () => {
    renderMenu({ open: true, position: { top: 10, left: 20, placement: "above" } });
    expect(popup().className).toBe("row-menu-popup dock-settings-menu row-menu-popup-above");
    expect(popup().style.transform).toBe("translateY(-100%)");
  });

  it("shows a notice under the rows only when one is given", () => {
    renderMenu(PLACED, "Could not save.");
    expect(screen.getByRole("status").textContent).toBe("Could not save.");
    cleanup();
    renderMenu(PLACED);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("sections", () => {
  it("separates sections and names each labelled group by its heading", () => {
    renderMenu(PLACED);
    expect(document.querySelectorAll("[role=separator]")).toHaveLength(2);
    expect(screen.getAllByRole("group").map((group) => group.getAttribute("aria-labelledby"))).toEqual(["dock-settings-show", "dock-settings-toggles", null]);
    expect(Array.from(document.querySelectorAll(".dock-settings-menu-heading"), (heading) => heading.textContent)).toEqual(["Show", "Toggles"]);
  });

  it("describes only a section that has a tooltip, beside its heading", () => {
    renderMenu(PLACED);
    const [show, toggles, actions] = screen.getAllByRole("group");
    expect(show!.getAttribute("aria-describedby")).toMatch(/-section-show$/);
    expect(show!.querySelectorAll(".dock-settings-menu-heading-row .info-tip")).toHaveLength(1);
    expect(toggles!.getAttribute("aria-describedby")).toBeNull();
    expect(toggles!.querySelectorAll(".dock-settings-menu-heading-row .info-tip")).toHaveLength(0);
    expect(actions!.querySelector(".dock-settings-menu-heading-row")).toBeNull();
  });
});

describe("rows", () => {
  it("gives setting rows a check state and a check mark, and plain rows neither", () => {
    renderMenu(PLACED);
    const rows = Array.from(document.querySelectorAll<HTMLButtonElement>(".row-menu-item"));
    expect(rows.map((row) => [row.getAttribute("role"), row.getAttribute("aria-checked"), Boolean(row.querySelector(".dock-settings-menu-check"))])).toEqual([
      ["menuitemradio", "true", true], ["menuitemradio", "false", true], ["menuitemcheckbox", "false", true],
      ["menuitem", null, false], ["menuitem", null, false],
    ]);
  });

  it("marks only disabled rows aria-disabled and describes only rows with their own tooltip", () => {
    renderMenu(PLACED);
    const rows = Array.from(document.querySelectorAll<HTMLButtonElement>(".row-menu-item"));
    expect(rows.map((row) => row.getAttribute("aria-disabled"))).toEqual([null, null, null, null, "true"]);
    expect(rows.map((row) => row.getAttribute("aria-describedby")?.endsWith("-wrap") ?? null)).toEqual([null, null, true, null, null]);
  });

  it("registers every row for roving focus at its position across sections", () => {
    const { menu } = renderMenu(PLACED);
    expect(menu.itemRefs.current.map((button) => button?.textContent)).toEqual(["Shown", "Hidden", "Wrap", "Open settings", "Coming soon"]);
  });

  it("closes-then-runs an action row and ignores a disabled one", () => {
    const { selected } = renderMenu(PLACED);
    fireEvent.click(screen.getByRole("menuitem", { name: "Coming soon" }));
    expect(selected).toEqual([]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Open settings" }));
    expect(selected).toEqual([SECTIONS[2]!.items[0]!.onSelect]);
  });
});
