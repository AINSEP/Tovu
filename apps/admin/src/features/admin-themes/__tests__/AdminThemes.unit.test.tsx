import { render, screen, waitFor } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_APPEARANCE, DEFAULT_INTERFACE, type AppearanceConfig, type InterfaceConfig } from "../../../lib/settings-tabs";
import type { AdminThemeDocumentEnv, AdminThemePort } from "../../../admin-themes/use-admin-theme.hooks";
import { ADMIN_THEMES } from "../../../admin-themes/registry";
import { AdminThemes } from "../AdminThemes";

vi.mock("../../../hooks/use-admin-locale.hooks", () => ({ useAdminLocale: () => "en" }));

/**
 * @file Studio → Admin Themes: one card per registered manifest, a click repaints <html> and saves
 * the choice. Scheme selection belongs only to the Appearance tab.
 */

function setup({ adminTheme = "classic", theme = "light" as AppearanceConfig["theme"] } = {}) {
  let iface: InterfaceConfig = { ...DEFAULT_INTERFACE, adminTheme };
  let appearance: AppearanceConfig = { ...DEFAULT_APPEARANCE, theme };
  const port: AdminThemePort = {
    loadInterface: () => Promise.resolve(iface),
    loadAppearance: vi.fn(() => Promise.resolve(appearance)),
    saveInterface: vi.fn((next: InterfaceConfig) => { iface = next; return Promise.resolve(["adminTheme"]); }),
    saveAppearance: vi.fn((next: AppearanceConfig) => { appearance = next; return Promise.resolve(["theme"]); }),
  };
  const env: AdminThemeDocumentEnv = { root: document.createElement("html"), storage: { setItem: vi.fn() } };
  render(<AdminThemes port={port} env={env} />);
  return { port, env };
}

describe("AdminThemes", () => {
  it("renders a card per installed theme from its manifest, with the stored one checked", async () => {
    setup({ adminTheme: "default" });
    const cards = await screen.findAllByRole("radio");
    expect(cards.map((card) => card.textContent)).toEqual([expect.stringContaining("Tovu Classic")]);
    expect(cards).toHaveLength(ADMIN_THEMES.length);
    await waitFor(() => expect(screen.getByRole("radio", { name: /Tovu Classic/ })).toHaveAttribute("aria-checked", "true"));
    expect(screen.queryByRole("radio", { name: /Jini Default/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Admin Themes" })).toBeInTheDocument();
  });

  it("clicking a card applies the theme to <html> at once and persists it", async () => {
    const { port, env } = setup({ adminTheme: "default" });
    const user = userEvent.setup();
    const card = await screen.findByRole("radio", { name: /Tovu Classic/ });
    await waitFor(() => expect(card).toBeEnabled());
    await user.click(card);
    expect(env.root.getAttribute("data-admin-theme")).toBe("classic");
    expect(port.saveInterface).toHaveBeenCalledWith(DEFAULT_INTERFACE, { ...DEFAULT_INTERFACE, adminTheme: "default" });
    await waitFor(() => expect(card).toHaveAttribute("aria-checked", "true"));
  });

  it.each(["glass", "removed-theme"])("shows Classic active for stored %s without a save or error", async (adminTheme) => {
    const { port } = setup({ adminTheme, theme: "dark" });
    const card = await screen.findByRole("radio", { name: /Tovu Classic/ });
    await waitFor(() => expect(card).toHaveAttribute("aria-checked", "true"));
    expect(screen.getAllByRole("radio")).toHaveLength(1);
    expect(screen.queryByRole("radio", { name: /Glassmorphic/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(port.saveInterface).not.toHaveBeenCalled();
  });

  it("keeps scheme controls off the Theme tab", async () => {
    setup();
    await screen.findByRole("radio", { name: /Tovu Classic/ });
    expect(screen.queryByRole("radiogroup", { name: "Color scheme" })).not.toBeInTheDocument();
    for (const name of ["Light", "Dark", "System"]) {
      expect(screen.queryByRole("radio", { name })).not.toBeInTheDocument();
    }
  });

  it("previews each card from its own manifest swatch", async () => {
    const { container } = render(<AdminThemes port={{
      loadInterface: () => Promise.resolve(DEFAULT_INTERFACE),
      loadAppearance: () => Promise.resolve(DEFAULT_APPEARANCE),
      saveInterface: vi.fn(),
      saveAppearance: vi.fn(),
    }} env={{ root: document.createElement("html") }} />);
    await screen.findAllByRole("radio", { name: /Tovu Classic/ });
    const swatches = [...container.querySelectorAll<HTMLElement>(".admin-theme-swatch")];
    expect(swatches.map((swatch) => swatch.style.getPropertyValue("--swatch-accent"))).toEqual(ADMIN_THEMES.map((theme) => theme.preview.light?.accent));
  });
});

describe("AdminThemes — failed save", () => {
  it("says the theme could not be saved, with the server's reason", async () => {
    const { port } = setup({ adminTheme: "default" });
    vi.mocked(port.saveInterface).mockImplementation(() => Promise.reject(new Error("ledger locked")));
    const user = userEvent.setup();
    const card = await screen.findByRole("radio", { name: /Tovu Classic/ });
    await waitFor(() => expect(card).toBeEnabled());
    await user.click(card);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save the theme: ledger locked");
  });
});
