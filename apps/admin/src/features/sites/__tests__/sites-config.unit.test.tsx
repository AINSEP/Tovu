import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { useSitesConfig } from "../hooks/use-sites-config.hooks";
import type { SitesUserConfig, SitesUserConfigPatch } from "@/lib/api";
const config: SitesUserConfig = { sitesHome: "/old", siteRoots: ["/extra"], databases: "inSite", configPath: "/data/config.json", appData: "/data",
  overrides: { sitesHome: false, siteRoots: false }, warning: { provider: "OneDrive", message: "Exact warning", localHome: "/user/Tovu" } };
const wrapper = ({ children }: { children: ReactNode }) => <FetchQueryProvider>{children}</FetchQueryProvider>;
it("loads shared settings, saves all fields and dispatches both warning remedies", async () => {
  const calls: SitesUserConfigPatch[] = [];
  const port = { getSitesConfig: async () => config, setSitesConfig: async (patch: SitesUserConfigPatch) => { calls.push(patch); return { ...config, ...patch }; } };
  const { result } = renderHook(() => useSitesConfig({}, { port }), { wrapper });
  await act(async () => {});
  expect(result.current.config?.warning?.message).toBe("Exact warning");
  act(() => { result.current.setHome("~/new"); result.current.setRoots("~/extra\n~/nested\n"); result.current.setDatabases("appData"); });
  await act(async () => { await result.current.save(); });
  expect(calls[0]).toEqual({ sitesHome: "~/new", siteRoots: ["~/extra", "~/nested"], databases: "appData" });
  await act(async () => { await result.current.useAppData(); });
  await act(async () => { await result.current.useLocalHome(); });
  expect(calls.slice(1)).toEqual([{ databases: "appData" }, { sitesHome: "/user/Tovu" }]);
});
it("omits env-controlled fields and reports exact write errors without replacing saved settings", async () => {
  const calls: SitesUserConfigPatch[] = []; let fail = false;
  const overridden = { ...config, overrides: { sitesHome: true, siteRoots: true } };
  const port = { getSitesConfig: async () => overridden, setSitesConfig: async (patch: SitesUserConfigPatch) => {
    calls.push(patch); if (fail) throw new Error("Cannot write config.json: permission denied"); return { ...overridden, ...patch };
  } };
  const { result } = renderHook(() => useSitesConfig({}, { port }), { wrapper }); await act(async () => {});
  act(() => result.current.setDatabases("appData")); await act(async () => { await result.current.save(); });
  expect(calls).toEqual([{ databases: "appData" }]); expect(result.current.config?.databases).toBe("appData");
  fail = true; await act(async () => { await result.current.save(); });
  expect(result.current.error).toBe("Cannot write config.json: permission denied"); expect(result.current.config?.databases).toBe("appData");
});
it("edits extra folders as rows and drops blank rows on save", async () => {
  const calls: SitesUserConfigPatch[] = [];
  const port = { getSitesConfig: async () => config, setSitesConfig: async (patch: SitesUserConfigPatch) => { calls.push(patch); return { ...config, ...patch } as SitesUserConfig; } };
  const { result } = renderHook(() => useSitesConfig({}, { port }), { wrapper });
  await act(async () => {});
  expect(result.current.rootList).toEqual(["/extra"]);
  act(() => result.current.addRoot());
  expect(result.current.rootList).toEqual(["/extra", ""]); expect(result.current.addedIndex).toBe(1);
  act(() => result.current.setRootAt(1, " ~/more "));
  act(() => result.current.addRoot());
  act(() => result.current.removeRoot(0));
  expect(result.current.rootList).toEqual([" ~/more ", ""]); expect(result.current.addedIndex).toBeNull();
  expect(result.current.roots).toBe(" ~/more \n");
  await act(async () => { await result.current.save(); });
  expect(calls[0]?.siteRoots).toEqual(["~/more"]);
});
