import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminUi } from "../AdminUi";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { ADMIN_THEMES_DICT } from "../../admin-themes/admin-themes-i18n";

vi.mock("../../../admin-themes/use-admin-theme.hooks", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../admin-themes/use-admin-theme.hooks")>(),
  useAdminThemePicker: () => ({ ready: true, themeId: "classic", preference: "light", error: null, selectTheme: vi.fn(), selectPreference: vi.fn() }),
}));
vi.mock("../../settings/hooks/use-admin-appearance-settings.hooks", () => ({
  useAdminAppearanceSettings: () => ({ value: { theme: "light", accentColor: "#a855f7" }, loadError: null, saveState: { status: "idle" }, onChange: vi.fn() }),
}));
vi.mock("../../../hooks/use-admin-locale.hooks", () => ({ useAdminLocale: vi.fn(() => "en") }));

const originalUrl = window.location.href;
afterEach(() => {
  window.history.replaceState(null, "", originalUrl);
  vi.mocked(useAdminLocale).mockReturnValue("en");
});

describe("Admin UI tabs", () => {
  it("updates the page chrome and tabs when the admin locale changes", () => {
    const { container, rerender } = render(<AdminUi />);
    expect(screen.getByRole("heading", { name: "Admin UI" })).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Admin UI" })).toBeInTheDocument();
    vi.mocked(useAdminLocale).mockReturnValue("es");
    rerender(<AdminUi />);
    expect(screen.getByRole("heading", { name: "Interfaz de administración" })).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Interfaz de administración" })).toBeInTheDocument();
    expect(container.querySelector(".admin-ui-page > .page-header .page-kicker")).toHaveTextContent("Estudio");
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Tema", "Apariencia"]);
    vi.mocked(useAdminLocale).mockReturnValue("en");
    rerender(<AdminUi />);
    expect(screen.getByRole("heading", { name: "Admin UI" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Theme", "Appearance"]);
  });

  it.each(Object.keys(ADMIN_THEMES_DICT))("supplies Admin UI copy in the existing %s dictionary", (locale) => {
    for (const key of ["Admin UI", "Studio", "Theme", "Appearance"]) {
      expect(ADMIN_THEMES_DICT[locale]?.[key]).toEqual(expect.any(String));
      expect(ADMIN_THEMES_DICT[locale]?.[key]?.length).toBeGreaterThan(0);
    }
  });

  it.each([undefined, null, "", "unknown", "theme"])("opens Theme for %s", (tabId) => {
    render(<AdminUi tabId={tabId} />);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Theme", "Appearance"]);
    expect(screen.getByRole("radiogroup", { name: "Admin Themes" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Color scheme" })).not.toBeInTheDocument();
  });

  it("opens the existing Appearance controls by URL", () => {
    render(<AdminUi tabId="appearance" />);
    expect(screen.getAllByRole("radiogroup", { name: "Color scheme" })).toHaveLength(1);
    for (const name of ["Light", "Dark", "System"]) expect(screen.getAllByRole("radio", { name })).toHaveLength(1);
    expect(screen.queryByRole("radiogroup", { name: "Admin Themes" })).not.toBeInTheDocument();
  });

  it("redirects the retired Design System query to Appearance", () => {
    window.history.replaceState(null, "", "/admin/admin-ui?tab=design-system");
    const length = window.history.length;
    render(<AdminUi tabId="design-system" />);
    expect(window.location.pathname).toBe("/admin/admin-ui");
    expect(window.location.search).toBe("?tab=appearance");
    expect(window.history.length).toBe(length);
    expect(screen.queryByText(/Design System/)).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Color scheme" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Admin Themes" })).not.toBeInTheDocument();
  });

  it("writes addressable tabs with replacement navigation", async () => {
    window.history.replaceState(null, "", "/admin/admin-ui");
    const length = window.history.length;
    const { rerender } = render(<AdminUi />);
    await userEvent.click(screen.getByRole("tab", { name: "Appearance" }));
    expect(window.location.pathname).toBe("/admin/admin-ui");
    expect(window.location.search).toBe("?tab=appearance");
    expect(window.history.length).toBe(length);
    rerender(<AdminUi tabId="appearance" />);
    expect(screen.getAllByRole("radiogroup", { name: "Color scheme" })).toHaveLength(1);
    for (const name of ["Light", "Dark", "System"]) expect(screen.getAllByRole("radio", { name })).toHaveLength(1);
    await userEvent.click(screen.getByRole("tab", { name: "Theme" }));
    expect(window.location.search).toBe("?tab=theme");
    expect(window.history.length).toBe(length);
  });
});
