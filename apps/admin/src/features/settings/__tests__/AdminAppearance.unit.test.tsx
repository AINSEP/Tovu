import { fireEvent, render, screen, waitFor, within } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ACCENT_COLOR } from "@jini-ai/ui";
import { AdminAppearance } from "../AdminAppearance";
import { DEFAULT_APPEARANCE, DEFAULT_INTERFACE, type AppearanceConfig, type InterfaceConfig } from "../../../lib/settings-tabs";
import type { AdminThemeDocumentEnv, AdminThemePort } from "../../../admin-themes/use-admin-theme.hooks";
import type { useAdminAppearanceSettings } from "../hooks/use-admin-appearance-settings.hooks";

const persistence = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("../../../hooks/use-admin-locale.hooks", () => ({ useAdminLocale: () => "en" }));
vi.mock("../../../lib/settings-tabs", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../lib/settings-tabs")>(),
  loadAppearance: () => persistence.load(),
  saveAppearance: (...args: unknown[]) => persistence.save(...args),
}));

const rootStyle = document.documentElement.getAttribute("style");
afterEach(() => {
  vi.clearAllMocks();
  if (rootStyle === null) document.documentElement.removeAttribute("style");
  else document.documentElement.setAttribute("style", rootStyle);
});

function slice(overrides: Partial<ReturnType<typeof useAdminAppearanceSettings>> = {}): ReturnType<typeof useAdminAppearanceSettings> {
  return {
    value: { ...DEFAULT_APPEARANCE, accentColor: "#a855f7" },
    onChange: vi.fn(),
    loadError: null,
    saveState: { status: "idle" },
    refresh: vi.fn(),
    ...overrides,
  };
}

function themePicker({ theme = "light" as AppearanceConfig["theme"] } = {}) {
  let appearance: AppearanceConfig = { ...DEFAULT_APPEARANCE, theme, accentColor: "#a855f7" };
  const port: AdminThemePort = {
    loadInterface: () => Promise.resolve(DEFAULT_INTERFACE),
    loadAppearance: vi.fn(() => Promise.resolve(appearance)),
    saveInterface: vi.fn((_: InterfaceConfig) => Promise.resolve([])),
    saveAppearance: vi.fn((next: AppearanceConfig) => { appearance = next; return Promise.resolve(["theme"]); }),
  };
  const env: AdminThemeDocumentEnv = { root: document.createElement("html"), storage: { setItem: vi.fn() } };
  return { port, env };
}

describe("Appearance moved to Admin UI", () => {
  it("has one compact Light / Dark / System control that repaints and saves the shell's setting", async () => {
    const { port, env } = themePicker();
    const appearance = slice();
    const { container } = render(<AdminAppearance useAppearanceHook={() => appearance} port={port} env={env} />);
    const group = screen.getByRole("radiogroup", { name: "Color scheme" });
    expect(screen.getByText("Color scheme", { selector: ".jini-field > .jini-field-label" })).toBeVisible();
    expect(screen.getAllByRole("radiogroup", { name: "Color scheme" })).toHaveLength(1);
    expect(group).toHaveClass("segmented", "admin-themes-scheme");
    expect(within(group).getAllByRole("radio").map((radio) => radio.textContent)).toEqual(["Light", "Dark", "System"]);
    expect(container.querySelector(".jini-seg-control")).toBeNull();
    expect(screen.queryByRole("group", { name: "Appearance" })).not.toBeInTheDocument();
    const user = userEvent.setup();
    await waitFor(() => expect(within(group).getByRole("radio", { name: "Dark" })).toBeEnabled());
    expect(within(group).getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
    const previous = { ...DEFAULT_APPEARANCE, accentColor: "#a855f7" };
    for (const [name, theme] of [["Dark", "dark"], ["System", "system"], ["Light", "light"]] as const) {
      await user.click(within(group).getByRole("radio", { name }));
      expect(env.root.getAttribute("data-color-scheme")).toBe(theme === "dark" ? "dark" : "light");
      expect(port.saveAppearance).toHaveBeenLastCalledWith({ ...previous, theme }, previous);
      await waitFor(() => expect(within(group).getByRole("radio", { name })).toHaveAttribute("aria-checked", "true"));
      await waitFor(() => expect(port.loadAppearance).toHaveBeenCalledTimes(theme === "dark" ? 2 : theme === "system" ? 3 : 4));
      previous.theme = theme;
    }
    expect(appearance.onChange).not.toHaveBeenCalled();
  });

  it("merges the accent selection without losing the stored scheme", () => {
    const appearance = slice({ value: { ...DEFAULT_APPEARANCE, theme: "system" } });
    render(<AdminAppearance useAppearanceHook={() => appearance} {...themePicker()} />);
    fireEvent.change(screen.getByLabelText("Custom accent color"), { target: { value: "#a855f7" } });
    expect(appearance.onChange).toHaveBeenCalledWith({ theme: "system", accentColor: "#a855f7" });
  });

  it("keeps Jini's default and preset accent choices without changing the scheme", async () => {
    const appearance = slice({ value: { ...DEFAULT_APPEARANCE, theme: "system" } });
    render(<AdminAppearance useAppearanceHook={() => appearance} {...themePicker()} />);
    const group = screen.getByRole("radiogroup", { name: "Accent color" });
    await userEvent.click(within(group).getByRole("radio", { name: "#059669" }));
    expect(appearance.onChange).toHaveBeenLastCalledWith({ theme: "system", accentColor: "#059669" });
    await userEvent.click(within(group).getByRole("radio", { name: "Default accent color" }));
    expect(appearance.onChange).toHaveBeenLastCalledWith({ ...DEFAULT_APPEARANCE, theme: "system", accentColor: DEFAULT_ACCENT_COLOR });
  });

  it("reports a scheme save failure and restores the persisted selection", async () => {
    const { port, env } = themePicker();
    vi.mocked(port.saveAppearance).mockRejectedValueOnce(new Error("scheme write failed"));
    render(<AdminAppearance useAppearanceHook={() => slice()} port={port} env={env} />);
    const dark = screen.getByRole("radio", { name: "Dark" });
    await waitFor(() => expect(dark).toBeEnabled());
    await userEvent.click(dark);
    expect(await screen.findByRole("alert")).toHaveTextContent("scheme write failed");
    expect(screen.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
    expect(env.root.getAttribute("data-color-scheme")).toBe("light");
  });

  it("shows loading, then preserves load/save errors alongside editable defaults", () => {
    const { rerender } = render(<AdminAppearance useAppearanceHook={() => slice({ value: null })} {...themePicker()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading appearance");
    rerender(<AdminAppearance useAppearanceHook={() => slice({ loadError: "read failed", saveState: { status: "error", message: "write failed" } })} {...themePicker()} />);
    expect(screen.getAllByRole("alert").map((item) => item.textContent)).toEqual(["read failed", "write failed"]);
    expect(screen.getByRole("radiogroup", { name: "Color scheme" })).toBeInTheDocument();
  });

  it("uses the existing debounced settings lifecycle and persists against the loaded diff base", async () => {
    const previous = { ...DEFAULT_APPEARANCE, theme: "system", accentColor: "#a855f7" } as const;
    let stored: AppearanceConfig = previous;
    persistence.load.mockImplementation(async () => stored);
    persistence.save.mockImplementation(async (next: AppearanceConfig) => {
      stored = next;
      return ["accentColor"];
    });
    render(<AdminAppearance {...themePicker()} />);
    const input = await screen.findByLabelText("Custom accent color");
    fireEvent.change(input, { target: { value: "#059669" } });
    await waitFor(() => expect(persistence.save).toHaveBeenCalledWith({ ...previous, accentColor: "#059669" }, previous));
    expect(document.documentElement.style.getPropertyValue("--jini-theme-light-primary")).toBe("#059669");
  });
});
