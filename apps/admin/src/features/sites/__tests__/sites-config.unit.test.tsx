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
