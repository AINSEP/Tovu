import userEvent from "@testing-library/user-event";
import { render, screen, within } from "@/__tests__/render-with-jini-kits";
import { SitesHomeSetting } from "../SitesHomeSetting";
import type { SitesUserConfigPatch } from "@jini-ai/core/contracts/site/admin-sites";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@/__tests__/render-with-jini-kits";
import { afterEach, expect, it, vi } from "vitest";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { useHostSitesConfig } from "../hooks/sites-dependencies.hooks";
import type { SitesUserConfig } from "@jini-ai/core/contracts/site/admin-sites";
const config: SitesUserConfig = { sitesHome: "/old", siteRoots: ["/extra"], databases: "inSite", configPath: "/data/config.json", appData: "/data",
  overrides: { sitesHome: false, siteRoots: false }, warning: { provider: "OneDrive", message: "Exact warning", localHome: "/user/Tovu" } };
const wrapper = ({ children }: { children: ReactNode }) => <FetchQueryProvider>{children}</FetchQueryProvider>;
afterEach(() => vi.unstubAllGlobals());
it("loads through the default API port with omitted arguments and opens and closes settings", async () => {
  const requests: string[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    expect(url).toBe("/api/admin/v1/workspaces/workspace-local/system/sites/config");
    expect(init?.method ?? "GET").toBe("GET");
    requests.push(url);
    return Response.json(config);
  });
  const { result } = renderHook(() => useHostSitesConfig(), { wrapper });
  await waitFor(() => expect(result.current.config).toEqual(config));
  expect(requests).toEqual(["/api/admin/v1/workspaces/workspace-local/system/sites/config"]);
  expect(result.current.open).toBe(false);
  act(() => result.current.show());
  expect(result.current.open).toBe(true);
  act(() => result.current.close());
  expect(result.current.open).toBe(false);
});

function serveConfig(initial: SitesUserConfig) {
  const writes: SitesUserConfigPatch[] = [];
  let saved = structuredClone(initial);
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (url !== "/api/admin/v1/workspaces/workspace-local/system/sites/config") {
      return Response.json({ error: "Unexpected resource" }, { status: 404 });
    }
    switch (init?.method ?? "GET") {
      case "GET": return Response.json(saved);
      case "PUT": {
        const patch = JSON.parse(String(init?.body)) as SitesUserConfigPatch;
        writes.push(patch);
        saved = { ...saved, ...patch };
        if (patch.sitesHome === saved.warning?.localHome) saved.warning = null;
        return Response.json(saved);
      }
      default: return Response.json({ error: "Unexpected method" }, { status: 405 });
    }
  });
  return writes;
}

it("edits extra folders and database placement, then shows the saved settings", async () => {
  const writes = serveConfig({ ...config, siteRoots: [], warning: null });
  const user = userEvent.setup();
  render(<SitesHomeSetting home="/old" tabs={<nav aria-label="Site sections">All sites</nav>} />, { wrapper });
  expect(screen.getByRole("navigation", { name: "Site sections" })).toHaveTextContent("All sites");
  await user.click(screen.getByRole("button", { name: "Sites settings" }));
  const dialog = within(await screen.findByRole("dialog"));
  const home = dialog.getByRole("textbox", { name: "New websites folder" });
  await waitFor(() => expect(home).toHaveValue("/old"));
  expect(dialog.getByText("No extra folders.")).toBeVisible();
  await user.clear(home);
  await user.type(home, "/sites/new");
  await user.click(dialog.getByRole("button", { name: "Add folder" }));
  const first = dialog.getByRole("textbox", { name: "Extra folder 1" });
  expect(first).toHaveFocus();
  await user.type(first, "/archive");
  await user.click(dialog.getByRole("button", { name: "Add folder" }));
  await user.type(dialog.getByRole("textbox", { name: "Extra folder 2" }), "  /shared  ");
  await user.click(dialog.getByRole("button", { name: "Remove folder 1" }));
  expect(dialog.getByRole("textbox", { name: "Extra folder 1" })).toHaveValue("  /shared  ");
  await user.selectOptions(dialog.getByRole("combobox", { name: "Database location" }), "appData");
  expect(dialog.getByText("Saved in /data/config.json")).toBeVisible();
  await user.click(dialog.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(writes).toEqual([{ sitesHome: "/sites/new", siteRoots: ["/shared"], databases: "appData" }]));
  await waitFor(() => expect(dialog.getByRole("textbox", { name: "Extra folder 1" })).toHaveValue("/shared"));
});

it("offers each sync remedy separately and explains the new-database safety change", async () => {
  const writes = serveConfig(config);
  const user = userEvent.setup();
  render(<SitesHomeSetting home="/old" />, { wrapper });
  const warning = await screen.findByRole("alert");
  expect(warning).toHaveTextContent("OneDrive syncs this folder. Store databases in app-data to prevent corruption.");
  await user.click(within(warning).getByRole("button", { name: "Store databases in app-data" }));
  await waitFor(() => expect(warning).toHaveTextContent("OneDrive syncs this folder. New databases use app-data for safety."));
  await user.click(within(warning).getByRole("button", { name: "Use /user/Tovu" }));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(writes).toEqual([{ databases: "appData" }, { sitesHome: "/user/Tovu" }]);
});

it("shows why environment-pinned folders cannot be edited or moved", async () => {
  const writes = serveConfig({ ...config, overrides: { sitesHome: true, siteRoots: true } });
  const user = userEvent.setup();
  render(<SitesHomeSetting home="/old" />, { wrapper });
  const warning = await screen.findByRole("alert");
  expect(within(warning).getByRole("button", { name: "Use /user/Tovu" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Sites settings" }));
  const dialog = within(await screen.findByRole("dialog"));
  expect(dialog.getByRole("textbox", { name: "New websites folder" })).toBeDisabled();
  expect(dialog.getByRole("textbox", { name: "Extra folder 1" })).toBeDisabled();
  expect(dialog.getByRole("button", { name: "Remove folder 1" })).toBeDisabled();
  expect(dialog.getByRole("button", { name: "Add folder" })).toBeDisabled();
  expect(dialog.getByText("TOVU_SITES_HOME overrides this setting.")).toBeVisible();
  expect(dialog.getByText("TOVU_SITE_ROOTS overrides this setting.")).toBeVisible();
  expect(writes).toEqual([]);
});

it("keeps configuration load errors visible inside and outside settings and disables Save", async () => {
  vi.stubGlobal("fetch", async (url: string) => {
    if (url !== "/api/admin/v1/workspaces/workspace-local/system/sites/config") {
      return Response.json({ error: "Unexpected resource" }, { status: 404 });
    }
    return Response.json({ error: "Site configuration is unreadable." }, { status: 403 });
  });
  const user = userEvent.setup();
  render(<SitesHomeSetting home="/old" />, { wrapper });
  expect(await screen.findByRole("alert")).toHaveTextContent("Site configuration is unreadable.");
  await user.click(screen.getByRole("button", { name: "Sites settings" }));
  const dialog = within(await screen.findByRole("dialog"));
  expect(dialog.getByRole("alert")).toHaveTextContent("Site configuration is unreadable.");
  expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
  expect(screen.getAllByRole("alert")).toHaveLength(1);
});
