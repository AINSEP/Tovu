import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { useSitesConfig } from "../hooks/use-sites-config.hooks";
import type { SitesUserConfig, SitesUserConfigPatch } from "@/lib/api";
const config: SitesUserConfig = { sitesHome: "/old", siteRoots: ["/extra"], databases: "inSite", configPath: "/data/config.json", appData: "/data",
  overrides: { sitesHome: false, siteRoots: false }, warning: { provider: "OneDrive", message: "Exact warning", localHome: "/user/Tovu" } };
const wrapper = ({ children }: { children: ReactNode }) => <FetchQueryProvider>{children}</FetchQueryProvider>;
afterEach(() => vi.unstubAllGlobals());
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

it.each([new Error("Config cannot be read"), "Config cannot be read"])("reports a rejected settings read and clears it after saving (%s)", async (failure) => {
  const calls: SitesUserConfigPatch[] = [];
  const port = { getSitesConfig: async (): Promise<SitesUserConfig> => { throw failure; },
    setSitesConfig: async (patch: SitesUserConfigPatch) => { calls.push(patch); return { ...config, ...patch }; } };
  const { result } = renderHook(() => useSitesConfig({}, { port }), { wrapper });
  await waitFor(() => expect(result.current.error).toBe("Config cannot be read"));
  expect(result.current.config).toBeNull();
  act(() => { result.current.setHome("/recovered"); result.current.setRoots(" /extra/recovered \n "); });
  await act(async () => { await result.current.save(); });
  expect(calls).toEqual([{ databases: "inSite", sitesHome: "/recovered", siteRoots: ["/extra/recovered"] }]);
  expect(result.current.config?.sitesHome).toBe("/recovered");
  expect(result.current.error).toBeNull();
});

it("shows non-Error write failures and keeps the accepted settings", async () => {
  const port = { getSitesConfig: async () => config,
    setSitesConfig: async (): Promise<SitesUserConfig> => { throw "Disk unavailable"; } };
  const { result } = renderHook(() => useSitesConfig({}, { port }), { wrapper });
  await waitFor(() => expect(result.current.config).toEqual(config));
  await act(async () => { await result.current.useAppData(); });
  expect(result.current.error).toBe("Disk unavailable");
  expect(result.current.config).toEqual(config);
});

it.each(["resolve", "reject"] as const)("ignores an obsolete settings read that later %ss", async (settlement) => {
  let resolve!: (value: SitesUserConfig) => void;
  let reject!: (reason: Error) => void;
  const pending = new Promise<SitesUserConfig>((yes, no) => { resolve = yes; reject = no; });
  const oldPort = { getSitesConfig: () => pending, setSitesConfig: async () => config };
  const currentConfig = { ...config, sitesHome: "/current" };
  const newPort = { getSitesConfig: async () => currentConfig, setSitesConfig: async () => currentConfig };
  const { result, rerender } = renderHook(({ port }) => useSitesConfig({}, { port }), { initialProps: { port: oldPort }, wrapper });
  rerender({ port: newPort });
  await waitFor(() => expect(result.current.config).toEqual(currentConfig));
  await act(async () => {
    if (settlement === "resolve") resolve(config);
    else reject(new Error("obsolete error"));
  });
  expect(result.current.config).toEqual(currentConfig);
  expect(result.current.error).toBeNull();
});

it("the local-home remedy is inert before loading and when no sync warning exists", async () => {
  let complete!: (value: SitesUserConfig) => void;
  const calls: SitesUserConfigPatch[] = [];
  const port = { getSitesConfig: () => new Promise<SitesUserConfig>(resolve => { complete = resolve; }),
    setSitesConfig: async (patch: SitesUserConfigPatch) => { calls.push(patch); return config; } };
  const { result } = renderHook(() => useSitesConfig({}, { port }), { wrapper });
  await act(async () => { await result.current.useLocalHome(); });
  await act(async () => { complete({ ...config, warning: null }); });
  await act(async () => { await result.current.useLocalHome(); });
  expect(result.current.config?.warning).toBeNull();
  expect(calls).toEqual([]);
});

it("loads through the default API port with omitted arguments and opens and closes settings", async () => {
  const requests: string[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    expect(url).toBe("/api/admin/v1/workspaces/workspace-local/system/sites/config");
    expect(init?.method ?? "GET").toBe("GET");
    requests.push(url);
    return Response.json(config);
  });
  const { result } = renderHook(() => useSitesConfig(), { wrapper });
  await waitFor(() => expect(result.current.config).toEqual(config));
  expect(requests).toEqual(["/api/admin/v1/workspaces/workspace-local/system/sites/config"]);
  expect(result.current.open).toBe(false);
  act(() => result.current.show());
  expect(result.current.open).toBe(true);
  act(() => result.current.close());
  expect(result.current.open).toBe(false);
});
