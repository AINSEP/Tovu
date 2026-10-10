import { act, renderHook, render, screen, cleanup, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { useSitesHome } from "../hooks/use-sites-home.hooks";
import { resolveSiteCardView } from "../Sites.hooks";
import type { AdminSitesSnapshot } from "@/lib/api";

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
it("a Desktop-owned running card offers its URL and has no Web stop action", () => {
  const site = { name: "alpha", dir: "/home/alpha", displayName: "Alpha", createdAt: "2026-10-09", active: false };
  const snapshot: AdminSitesSnapshot = { sites: [site], switchingEnabled: true, localManagementEnabled: true, persistedSiteName: null,
    currentSite: { name: "owner", dir: "/home/owner", listed: true, dirOverridden: false },
    localSites: [{ name: "alpha", status: "running", pid: 10, port: 3456, daemonPort: null, adminUrl: "http://localhost:3456/admin/", app: "Desktop", external: true }] };
  const view = resolveSiteCardView({ site, snapshot, busyName: null, switchingEnabled: true, activatingName: null, managed: true });
  expect(view.lifecycle).toBeNull(); expect(view.openUrl).toBe("http://localhost:3456/admin/"); expect(view.menu).not.toContain("trash");
});

it("a lease alone supplies the existing Open action even without local lifecycle management", () => {
  const site = { name: "outside", dir: "/outside", displayName: "Outside", createdAt: "2026-10-09", active: false,
    running: { pid: 10, port: 3456, app: "Desktop", started: "2026-10-09T00:00:00.000Z", scheme: "https" as const } };
  const snapshot: AdminSitesSnapshot = { sites: [site], switchingEnabled: false, persistedSiteName: null,
    currentSite: { name: "owner", dir: "/owner", listed: true, dirOverridden: true } };
  const view = resolveSiteCardView({ site, snapshot, busyName: null, switchingEnabled: false, activatingName: null, managed: false });
  expect(view.openUrl).toBe("https://localhost:3456/admin/"); expect(view.lifecycle).toBeNull(); expect(view.menu).toEqual([]);
});

// DI replaces only the settings port; the component and locale owner execute normally.
import { SitesHomeSetting } from "../SitesHomeSetting";
import { t as translate } from "../sites-i18n";
import type { useSitesConfig } from "../hooks/use-sites-config.hooks";
afterEach(cleanup);
it("renders localized sites settings and the automatic appData safety notice", () => {
  const useSettings = (() => ({ open: false, saving: false, error: null, show() {}, useAppData: async () => {}, useLocalHome: async () => {},
    config: { databases: "appData", overrides: { sitesHome: false }, warning: { provider: "OneDrive", localHome: "/local", message: "English backend diagnostic" } },
  })) as unknown as typeof useSitesConfig;
  render(<SitesHomeSetting home="/home" useSettings={useSettings} t={(key) => translate({ locale: "de", key })} />);
  expect(screen.getByRole("button", { name: "Website-Einstellungen" })).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain("OneDrive synchronisiert diesen Ordner. Neue Datenbanken verwenden zur Sicherheit App-Daten.");
  expect(screen.queryByText("English backend diagnostic")).toBeNull();
});

it("puts Sites settings beside the tab row and renders the dialog as a labelled stacked form", async () => {
  // 2026-10-09 redesign: the button lives in the tab row; each folder is its own labelled row.
  const { default: userEvent } = await import("@testing-library/user-event");
  const user = userEvent.setup();
  const calls: string[] = [];
  const useSettings = (() => ({ open: true, saving: false, error: null, show() {}, close() {}, useAppData: async () => {}, useLocalHome: async () => {},
    home: "/Users/owner/Documents/Tovu", setHome: (value: string) => calls.push(`home:${value}`), databases: "inSite", setDatabases() {},
    rootList: ["/extra/one"], addedIndex: null, setRootAt: (index: number, value: string) => calls.push(`root:${index}:${value}`),
    addRoot: () => calls.push("add"), removeRoot: (index: number) => calls.push(`remove:${index}`), save: async () => { calls.push("save"); },
    config: { databases: "inSite", configPath: "/data/config.json", overrides: { sitesHome: false, siteRoots: false } },
  })) as unknown as typeof useSitesConfig;
  render(<SitesHomeSetting home="/home" tabs={<div role="tablist" aria-label="Sites tabs" />} useSettings={useSettings} />);
  const row = screen.getByRole("tablist", { name: "Sites tabs" }).parentElement!;
  expect(within(row).getByRole("button", { name: "Sites settings" })).toBeTruthy();
  expect(screen.getByLabelText("New websites folder")).toHaveValue("/Users/owner/Documents/Tovu");
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
  const useSettings = (() => ({ open: true, saving: false, error: null, show() {}, close() {}, useAppData: async () => {}, useLocalHome: async () => {},
    home: "/h", setHome() {}, databases: "appData", setDatabases() {}, rootList: [], addedIndex: null, setRootAt() {}, addRoot() {}, removeRoot() {}, save: async () => {},
    config: { databases: "appData", configPath: "/c.json", overrides: { sitesHome: true, siteRoots: true } },
  })) as unknown as typeof useSitesConfig;
  render(<SitesHomeSetting home="/h" useSettings={useSettings} />);
  expect(screen.getByText("No extra folders.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Add folder" })).toBeDisabled();
  expect(screen.getByLabelText("New websites folder")).toBeDisabled();
  expect(screen.getByText("TOVU_SITES_HOME overrides this setting.")).toBeTruthy();
  expect(screen.getByText("TOVU_SITE_ROOTS overrides this setting.")).toBeTruthy();
});
