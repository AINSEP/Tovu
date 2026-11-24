import { cleanup, fireEvent, render, screen, within } from "@/__tests__/render-with-jini-kits";
import { ChatSettingsSegmented } from "@jini-ai/chat/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { useTaxonomyRowMenu } from "@jini-ai/admin/screens/taxonomy/TaxonomyRowMenu.hooks";
import { DockSettingsMenu } from "@jini-ai/admin/shell/components/AssistantDock/DockSettingsMenu";
import { dockSettingsMenuSections, type DockSettingsMenuSection } from "@jini-ai/admin/shell/components/AssistantDock/dock-header-rules";
import { CHAT_TOOL_CALL_OPTIONS, DEFAULT_CHAT_DISPLAY } from "../chat-display-preferences";
import { REPLY_LENGTH_OPTIONS, visibleAssistantRuntimePreferences } from "../assistant-runtime-preferences";

/**
 * @file `DockSettingsMenu` section and row markup with the host's real info tip and segmented
 * control, against a typed fake of its menu hook (the `useTaxonomyRowMenuHook` seam). Popup
 * position markup moved with the component to Jini (`@jini-ai/admin`'s own DockSettingsMenu test).
 * Open/close and focus behaviour with the real hook live in `dock-header.unit.test.tsx`.
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
  render(<DockSettingsMenu label="Chat settings" sections={SECTIONS} notice={notice} useTaxonomyRowMenuHook={fake.useMenu} ChatSettingsSegmented={ChatSettingsSegmented} />);
  return fake;
}

/** A measured popup, so role queries can see it (an unmeasured one is `visibility: hidden`). */
const PLACED = { open: true, position: { top: 0, left: 0, placement: "below" } } as const;

const popup = () => document.querySelector<HTMLElement>("[role=menu]")!;

describe("sections", () => {
  it("separates sections and names each labelled group by its heading", () => {
    renderMenu(PLACED);
    expect(document.querySelectorAll("[role=separator]")).toHaveLength(2);
    expect(screen.getAllByRole("group").map((group) => group.getAttribute("aria-labelledby"))).toEqual(["dock-settings-show", "dock-settings-toggles", null]);
    expect(Array.from(document.querySelectorAll(".jini-dock-settings-menu-heading"), (heading) => heading.textContent)).toEqual(["Show", "Toggles"]);
  });

  it("describes only a section that has a tooltip, beside its heading", () => {
    renderMenu(PLACED);
    const [show, toggles, actions] = screen.getAllByRole("group");
    expect(show!.getAttribute("aria-describedby")).toMatch(/-section-show$/);
    expect(show!.querySelectorAll(".jini-dock-settings-menu-heading-row .info-tip")).toHaveLength(1);
    expect(toggles!.getAttribute("aria-describedby")).toBeNull();
    expect(toggles!.querySelectorAll(".jini-dock-settings-menu-heading-row .info-tip")).toHaveLength(0);
    expect(actions!.querySelector(".jini-dock-settings-menu-heading-row")).toBeNull();
  });
});

describe("rows", () => {
  it("draws an all-radio section as the dialog's segmented control, and other setting rows with a check mark", () => {
    renderMenu(PLACED);
    const radios = Array.from(document.querySelectorAll<HTMLInputElement>(".jini-dock-settings-menu-choice .jini-chat-settings-segment input"));
    expect(radios.map((radio) => [radio.type, radio.getAttribute("role"), radio.getAttribute("aria-checked"), radio.checked, radio.labels?.[0]?.textContent])).toEqual([
      ["radio", "menuitemradio", "true", true, "Shown"], ["radio", "menuitemradio", "false", false, "Hidden"],
    ]);
    const rows = Array.from(document.querySelectorAll<HTMLButtonElement>(".jini-row-menu-item"));
    expect(rows.map((row) => [row.getAttribute("role"), row.getAttribute("aria-checked"), Boolean(row.querySelector(".jini-dock-settings-menu-check"))])).toEqual([
      ["menuitemcheckbox", "false", true], ["menuitem", null, false], ["menuitem", null, false],
    ]);
  });

  it("marks only disabled rows aria-disabled and describes only rows with their own tooltip", () => {
    renderMenu(PLACED);
    const rows = Array.from(document.querySelectorAll<HTMLButtonElement>(".jini-row-menu-item"));
    expect(rows.map((row) => row.getAttribute("aria-disabled"))).toEqual([null, null, "true"]);
    expect(rows.map((row) => row.getAttribute("aria-describedby")?.endsWith("-wrap") ?? null)).toEqual([true, null, null]);
  });

  it("registers one roving-focus stop per choice (its checked option) and one per other row", () => {
    const { menu } = renderMenu(PLACED);
    const name = (element: HTMLElement | null) => (element as HTMLInputElement | null)?.labels?.[0]?.textContent ?? element?.textContent;
    expect(menu.itemRefs.current.map(name)).toEqual(["Shown", "Wrap", "Open settings", "Coming soon"]);
  });

  it("applies a choice in place without the close-then-run path", () => {
    const onSelect = vi.fn();
    const sections: DockSettingsMenuSection[] = [{ key: "show", label: "Show", items: [
      { key: "shown", label: "Shown", role: "menuitemradio", checked: true },
      { key: "hidden", label: "Hidden", role: "menuitemradio", onSelect },
    ] }];
    const fake = fakeMenu(PLACED);
    render(<DockSettingsMenu label="Chat settings" sections={sections} useTaxonomyRowMenuHook={fake.useMenu} ChatSettingsSegmented={ChatSettingsSegmented} />);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Hidden" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(fake.selected).toEqual([]);
  });

  it("closes-then-runs an action row and ignores a disabled one", () => {
    const { selected } = renderMenu(PLACED);
    fireEvent.click(screen.getByRole("menuitem", { name: "Coming soon" }));
    expect(selected).toEqual([]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Open settings" }));
    expect(selected).toEqual([SECTIONS[2]!.items[0]!.onSelect]);
  });
});

describe("runtime switches", () => {
  function renderRuntime(agent: { supportsSubagents?: boolean; supportsClaudeInChrome?: boolean } | undefined) {
    const update = vi.fn();
    const sections = dockSettingsMenuSections({ t: (key) => key, toolCallOptions: CHAT_TOOL_CALL_OPTIONS, replyLengthOptions: REPLY_LENGTH_OPTIONS }, {
      display: { preferences: DEFAULT_CHAT_DISPLAY, update: () => {} },
      runtime: { preferences: { useClaudeInChrome: true, preferSubagents: false, replyLength: "normal" }, update, visible: visibleAssistantRuntimePreferences({ agent }) },
    });
    render(<DockSettingsMenu label="Chat settings" sections={sections} useTaxonomyRowMenuHook={fakeMenu(PLACED).useMenu} ChatSettingsSegmented={ChatSettingsSegmented} />);
    return update;
  }
  const switches = () => screen.queryAllByRole("menuitemcheckbox").filter((row) => /Chrome|subagents/.test(row.textContent ?? ""));

  it("shows each switch only when the selected runtime supports it, checked from the stored value", () => {
    renderRuntime({ supportsSubagents: true, supportsClaudeInChrome: true });
    expect(switches().map((row) => [row.textContent, row.getAttribute("aria-checked"), Boolean(row.getAttribute("aria-describedby"))])).toEqual([
      ["Use Claude in Chrome", "true", true], ["Prefer subagents", "false", true],
    ]);
    cleanup();
    renderRuntime({ supportsSubagents: true });
    expect(switches().map((row) => row.textContent)).toEqual(["Prefer subagents"]);
    cleanup();
    renderRuntime(undefined);
    expect(switches()).toEqual([]);
  });

  it("saves the flipped value in place", () => {
    const update = renderRuntime({ supportsSubagents: true, supportsClaudeInChrome: true });
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Use Claude in Chrome" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Prefer subagents" }));
    expect(update.mock.calls).toEqual([[{ useClaudeInChrome: false }], [{ preferSubagents: true }]]);
  });

  it("uses the existing segmented control for Reply length even without runtime support flags", () => {
    const update = renderRuntime(undefined);
    const group = screen.getByRole("group", { name: "Reply length" });
    const radios = within(group).getAllByRole("menuitemradio");
    expect(radios.map(radio => [(radio as HTMLInputElement).labels?.[0]?.textContent, (radio as HTMLInputElement).checked])).toEqual([
      ["Short", false], ["Normal", true], ["Detailed", false],
    ]);
    expect(group.querySelectorAll(".jini-chat-settings-segment input")).toHaveLength(3);
    fireEvent.click(within(group).getByRole("menuitemradio", { name: "Short" }));
    fireEvent.click(within(group).getByRole("menuitemradio", { name: "Detailed" }));
    // The stored value stays Normal (update is a mock), so re-clicking the checked Normal radio is a no-op.
    fireEvent.click(within(group).getByRole("menuitemradio", { name: "Normal" }));
    expect(update.mock.calls).toEqual([[{ replyLength: "short" }], [{ replyLength: "detailed" }]]);
    expect(popup()).toBeInTheDocument();
  });
});
