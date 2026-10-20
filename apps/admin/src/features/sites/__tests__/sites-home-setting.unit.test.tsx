import { act, renderHook, render, screen, cleanup, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { useSitesHome } from "../hooks/use-sites-home.hooks";

afterEach(() => vi.unstubAllGlobals());

it.each([undefined, {}])("saves through the default API port when options are %s", async (options) => {
  const sent: string[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    expect(url).toBe("/api/admin/v1/workspaces/workspace-local/system/sites/home");
    expect(init).toMatchObject({ method: "PUT", credentials: "same-origin" });
    expect(JSON.parse(String(init?.body))).toEqual({ path: "/requested/home" });
    sent.push(url);
    return Response.json({ home: "/canonical/home" });
  });
  const { result } = renderHook(() => useSitesHome({ home: "/old" }, options), {
    wrapper: ({ children }) => <FetchQueryProvider>{children}</FetchQueryProvider>,
  });
  act(() => result.current.setPath("/requested/home"));
  await act(async () => { await result.current.save(); });
  expect(sent).toEqual(["/api/admin/v1/workspaces/workspace-local/system/sites/home"]);
  expect(result.current.path).toBe("/canonical/home");
  expect(result.current.error).toBeNull();
  expect(result.current.saving).toBe(false);
});

it("home settings use the injected action and show exact errors without changing the saved folder", async () => {
  const calls: string[] = []; let fail = false;
  const port = { setSitesHome: async ({ path }: { path: string }) => {
    calls.push(path); if (fail) throw new Error("TOVU_SITES_HOME overrides this setting."); return { home: path };
  } };
  const { result } = renderHook(() => useSitesHome({ home: "/old" }, { port }), { wrapper: ({ children }) => <FetchQueryProvider>{children}</FetchQueryProvider> });
  act(() => result.current.setPath("/new"));
  await act(async () => { await result.current.save(); });
  expect(calls).toEqual(["/new"]); expect(result.current.path).toBe("/new"); expect(result.current.error).toBeNull();
  fail = true;
  await act(async () => { await result.current.save(); });
  expect(result.current.error).toBe("TOVU_SITES_HOME overrides this setting."); expect(result.current.path).toBe("/new");
});
it("keeps the draft after a non-Error failure and accepts the server's normalized home on retry", async () => {
  let fail = true;
  const calls: string[] = [];
  const port = { setSitesHome: async ({ path }: { path: string }) => {
    calls.push(path);
    if (fail) throw "Folder is read-only";
    return { home: "/normalized/home" };
  } };
  const { result } = renderHook(() => useSitesHome({ home: "/old" }, { port }), {
    wrapper: ({ children }) => <FetchQueryProvider>{children}</FetchQueryProvider>,
  });
  act(() => result.current.setPath("/draft/../home"));
  await act(async () => { await result.current.save(); });
  expect(result.current.error).toBe("Folder is read-only");
  expect(result.current.path).toBe("/draft/../home");
  expect(result.current.saving).toBe(false);

  fail = false;
  await act(async () => { await result.current.save(); });
  expect(result.current.error).toBeNull();
  expect(result.current.path).toBe("/normalized/home");
  expect(result.current.saving).toBe(false);
  expect(calls).toEqual(["/draft/../home", "/draft/../home"]);
});

// DI replaces only the settings port; the component and locale owner execute normally.
import { SitesHomeSetting } from "../SitesHomeSetting";
import { t as translate } from "../sites-i18n";
import type { useSitesConfig } from "../hooks/use-sites-config.hooks";
import type { SitesUserConfig } from "@/lib/api";
afterEach(cleanup);

type SitesSettings = ReturnType<typeof useSitesConfig>;

function configFixture(overrides: Partial<SitesUserConfig> = {}): SitesUserConfig {
  return { sitesHome: "/h", siteRoots: [], databases: "inSite", configPath: "/data/config.json", appData: "/app-data",
    overrides: { sitesHome: false, siteRoots: false }, warning: null, ...overrides };
}

/** A typed stand-in for `useSitesConfig`'s result: the dialog open, nothing saving, no rows. */
function fakeSettings(overrides: Partial<SitesSettings> = {}): SitesSettings {
  return { open: true, show() {}, close() {}, config: configFixture(), home: "/h", setHome() {}, roots: "", setRoots() {},
    rootList: [], addedIndex: null, setRootAt() {}, addRoot() {}, removeRoot() {}, databases: "inSite", setDatabases() {},
    save: async () => {}, saving: false, error: null, useAppData: async () => {}, useLocalHome: async () => {}, ...overrides };
}

function renderWith(settings: SitesSettings, t?: (key: string) => string) {
  return render(<SitesHomeSetting home="/h" useSettings={() => settings} t={t} />);
}

const syncWarning = { provider: "OneDrive", localHome: "/local", message: "English backend diagnostic" };

it("renders localized sites settings and the automatic appData safety notice", () => {
  const settings = fakeSettings({ open: false, config: configFixture({ databases: "appData", warning: syncWarning }) });
  renderWith(settings, (key) => translate({ locale: "de", key }));
  expect(screen.getByRole("button", { name: "Website-Einstellungen" })).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain("OneDrive synchronisiert diesen Ordner. Neue Datenbanken verwenden zur Sicherheit App-Daten.");
  expect(screen.queryByText("English backend diagnostic")).toBeNull();
});

it("tells an in-site database owner to move databases to app-data when the folder is synced", () => {
  renderWith(fakeSettings({ open: false, config: configFixture({ warning: syncWarning }) }));
  expect(screen.getByRole("alert").textContent).toContain("OneDrive syncs this folder. Store databases in app-data to prevent corruption.");
});

it("shows no sync warning before the config has loaded", () => {
  renderWith(fakeSettings({ open: false, config: null }));
  expect(screen.queryByRole("alert")).toBeNull();
});

it("runs the app-data remedy from the sync warning", async () => {
  const { default: userEvent } = await import("@testing-library/user-event");
  const calls: string[] = [];
  renderWith(fakeSettings({ open: false, config: configFixture({ warning: syncWarning }), useAppData: async () => { calls.push("appData"); } }));
  await userEvent.setup().click(screen.getByRole("button", { name: "Store databases in app-data" }));
  expect(calls).toEqual(["appData"]);
});

it("runs the local-folder remedy from the sync warning", async () => {
  const { default: userEvent } = await import("@testing-library/user-event");
  const calls: string[] = [];
  renderWith(fakeSettings({ open: false, config: configFixture({ warning: syncWarning }), useLocalHome: async () => { calls.push("localHome"); } }));
  await userEvent.setup().click(screen.getByRole("button", { name: "Use /local" }));
  expect(calls).toEqual(["localHome"]);
});

it("disables the local-folder remedy when TOVU_SITES_HOME overrides the home", () => {
  renderWith(fakeSettings({ open: false, config: configFixture({ warning: syncWarning, overrides: { sitesHome: true, siteRoots: false } }) }));
  expect(screen.getByRole("button", { name: "Use /local" })).toBeDisabled();
});

it("disables both sync remedies while a save is in flight", () => {
  renderWith(fakeSettings({ open: false, saving: true, config: configFixture({ warning: syncWarning }) }));
  expect(screen.getByRole("button", { name: "Store databases in app-data" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Use /local" })).toBeDisabled();
});

it("opens the dialog from the Sites settings button", async () => {
  const { default: userEvent } = await import("@testing-library/user-event");
  const calls: string[] = [];
  renderWith(fakeSettings({ open: false, show: () => { calls.push("show"); } }));
  await userEvent.setup().click(screen.getByRole("button", { name: "Sites settings" }));
  expect(calls).toEqual(["show"]);
});

it("shows a settings error beside the tab row while the dialog is closed", () => {
  renderWith(fakeSettings({ open: false, error: "Could not read /data/config.json" }));
  expect(screen.getByRole("alert").textContent).toBe("Could not read /data/config.json");
});

it("shows a settings error once, inside the form, while the dialog is open", () => {
  renderWith(fakeSettings({ error: "Could not write /data/config.json" }));
  expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual(["Could not write /data/config.json"]);
});

it("passes typed edits to the home, extra-folder and database setters", async () => {
  const { default: userEvent } = await import("@testing-library/user-event");
  const user = userEvent.setup();
  const calls: string[] = [];
  renderWith(fakeSettings({ home: "", rootList: [""], setHome: (value) => { calls.push(`home:${String(value)}`); },
    setRootAt: (index, value) => { calls.push(`root:${index}:${value}`); }, setDatabases: (value) => { calls.push(`db:${String(value)}`); } }));
  await user.type(screen.getByLabelText("New websites folder"), "x");
  await user.type(screen.getByLabelText("Extra folder 1"), "y");
  await user.selectOptions(screen.getByLabelText("Database location"), "appData");
  expect(calls).toEqual(["home:x", "root:0:y", "db:appData"]);
});

it("focuses the extra-folder row that Add folder just created", () => {
  renderWith(fakeSettings({ rootList: ["/one", ""], addedIndex: 1 }));
  expect(screen.getByLabelText("Extra folder 2")).toHaveFocus();
});

it("offers no Save and no config path before the config has loaded", () => {
  renderWith(fakeSettings({ config: null }));
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  expect(screen.queryByText(/^Saved in/)).toBeNull();
});

it("disables Save while a save is in flight", () => {
  renderWith(fakeSettings({ saving: true }));
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
});

it("puts Sites settings beside the tab row and renders the dialog as a labelled stacked form", async () => {
  // 2026-10-09 redesign: the button lives in the tab row; each folder is its own labelled row.
  const { default: userEvent } = await import("@testing-library/user-event");
  const user = userEvent.setup();
  const calls: string[] = [];
  const settings = fakeSettings({ home: "/Users/owner/Documents/Tovu/sites", setHome: (value) => { calls.push(`home:${String(value)}`); },
    rootList: ["/extra/one"], setRootAt: (index, value) => { calls.push(`root:${index}:${value}`); },
    addRoot: () => { calls.push("add"); }, removeRoot: (index) => { calls.push(`remove:${index}`); }, save: async () => { calls.push("save"); } });
  render(<SitesHomeSetting home="/home" tabs={<div role="tablist" aria-label="Sites tabs" />} useSettings={() => settings} />);
  const row = screen.getByRole("tablist", { name: "Sites tabs" }).parentElement!;
  expect(within(row).getByRole("button", { name: "Sites settings" })).toBeTruthy();
  expect(screen.getByLabelText("New websites folder")).toHaveValue("/Users/owner/Documents/Tovu/sites");
  const folderInfo = screen.getByRole("button", { name: "About New websites folder" });
  expect(folderInfo).toHaveAccessibleDescription("New sites are created in this folder. Existing site folders stay where they are.");
  await user.click(folderInfo);
  expect(folderInfo).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("group", { name: /^Extra sites folders/ })).toBeTruthy();
  expect(screen.getByLabelText("Extra folder 1")).toHaveValue("/extra/one");
  expect(screen.getByLabelText("Database location")).toHaveValue("inSite");
  expect(screen.getByText("Existing databases keep their location. Stop the site before moving databases.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "About Database location" })).toBeTruthy();
  expect(screen.getByText("Saved in /data/config.json")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Add folder" }));
  await user.click(screen.getByRole("button", { name: "Remove folder 1" }));
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(calls).toEqual(["add", "remove:0", "save"]);
});

it("shows an empty-list hint and disables folder rows the environment overrides", () => {
  renderWith(fakeSettings({ databases: "appData", config: configFixture({ databases: "appData", overrides: { sitesHome: true, siteRoots: true } }) }));
  expect(screen.getByText("No extra folders.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Add folder" })).toBeDisabled();
  expect(screen.getByLabelText("New websites folder")).toBeDisabled();
  expect(screen.getByText("TOVU_SITES_HOME overrides this setting.")).toBeTruthy();
  expect(screen.getByText("TOVU_SITE_ROOTS overrides this setting.")).toBeTruthy();
});
