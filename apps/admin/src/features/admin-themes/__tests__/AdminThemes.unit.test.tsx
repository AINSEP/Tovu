import { render, screen, waitFor } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_APPEARANCE, DEFAULT_INTERFACE, type AppearanceConfig, type InterfaceConfig } from "../../../lib/settings-tabs";
import type { AdminThemeDocumentEnv, AdminThemePort } from "../../../admin-themes/use-admin-theme.hooks";
import { ADMIN_THEMES, type AdminThemeManifest } from "../../../admin-themes/registry";
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

function previewPort(theme: AppearanceConfig["theme"], adminTheme = "classic"): AdminThemePort {
  return {
    loadInterface: () => Promise.resolve({ ...DEFAULT_INTERFACE, adminTheme }),
    loadAppearance: () => Promise.resolve({ ...DEFAULT_APPEARANCE, theme }),
    saveInterface: vi.fn(),
    saveAppearance: vi.fn(),
  };
}

const DARK_SWATCH = { bg: "#000001", surface: "#000002", text: "#000003", accent: "#000004", border: "#000005" };

function manifest(overrides: Partial<AdminThemeManifest>): AdminThemeManifest {
  return { id: "test", name: "Test", schemes: ["light"], stylesheets: { admin: "", chat: "" }, fonts: [], preview: {}, ...overrides };
}

async function swatchOf(container: HTMLElement, name: RegExp) {
  const card = await screen.findByRole("radio", { name });
  await waitFor(() => expect(card).toBeEnabled());
  expect(container.contains(card)).toBe(true);
  return card.querySelector<HTMLElement>(".admin-theme-swatch");
}

describe("AdminThemes — card previews from partial manifests", () => {
  it("draws the theme's first scheme's swatch when the resolved scheme has no preview of its own", async () => {
    const duo = manifest({ id: "duo", name: "Duo", schemes: ["dark", "light"], preview: { dark: DARK_SWATCH } });
    const { container } = render(<AdminThemes port={previewPort("light", "duo")} env={{ root: document.createElement("html") }} themes={[duo]} />);
    const swatch = await swatchOf(container, /Duo/);
    expect(swatch?.dataset.scheme).toBe("light");
    expect(swatch?.style.getPropertyValue("--swatch-accent")).toBe(DARK_SWATCH.accent);
  });

  it("draws no swatch for a theme whose manifest previews no scheme at all", async () => {
    const bare = manifest({ id: "bare", name: "Bare", schemes: [], preview: {} });
    const { container } = render(<AdminThemes port={previewPort("dark", "bare")} env={{ root: document.createElement("html") }} themes={[bare]} />);
    expect(await swatchOf(container, /Bare/)).toBeNull();
  });
});

describe("AdminThemes — previewing the \"system\" scheme", () => {
  const darkQuery = (query: string) => ({ matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList;

  it("resolves it against the injected env's media port", async () => {
    const { container } = render(<AdminThemes port={previewPort("system")} env={{ root: document.createElement("html"), matchMedia: darkQuery }} />);
    expect((await swatchOf(container, /Tovu Classic/))?.dataset.scheme).toBe("dark");
  });

  it("resolves it against the browser's matchMedia when no env is injected", async () => {
    const spy = vi.spyOn(window, "matchMedia").mockImplementation(darkQuery);
    try {
      const { container } = render(<AdminThemes port={previewPort("system")} />);
      expect((await swatchOf(container, /Tovu Classic/))?.dataset.scheme).toBe("dark");
    } finally {
      spy.mockRestore();
    }
  });

  it("reads it as light when the browser has no matchMedia at all", async () => {
    const original = window.matchMedia;
    Object.defineProperty(window, "matchMedia", { value: undefined, writable: true, configurable: true });
    try {
      const { container } = render(<AdminThemes port={previewPort("system")} />);
      expect((await swatchOf(container, /Tovu Classic/))?.dataset.scheme).toBe("light");
    } finally {
      Object.defineProperty(window, "matchMedia", { value: original, writable: true, configurable: true });
    }
  });
});
