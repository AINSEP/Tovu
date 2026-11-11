import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError, type AdminLocalSiteState, type AdminSitesSnapshot } from "@/lib/api";
import { liveImportAdminUrl, liveImportSiteName, useLiveImportSite } from "../hooks/use-live-import-site.hooks";
import type { SitesPort } from "../hooks/sites-port.hooks";

/**
 * @file "From a live website" on the web admin makes a NEW site (owner, 2026-11-10): the Sites
 * screen's own Create and Start, then the new site's Import tab with the address filled in.
 */

const t = (key: string): string => key;

function snapshot(names: string[], localSites: AdminLocalSiteState[] = []): AdminSitesSnapshot {
  return { sites: names.map((name) => ({ name })), localSites } as unknown as AdminSitesSnapshot;
}
function local(name: string, overrides: Partial<AdminLocalSiteState> = {}): AdminLocalSiteState {
  return { name, status: "starting", pid: 1, port: 3005, daemonPort: 4005, adminUrl: "https://localhost:3005/admin/", ...overrides };
}
function port(overrides: Partial<SitesPort> = {}): SitesPort & { opened: string[] } {
  const opened: string[] = [];
  return {
    opened,
    openSite: (url) => { opened.push(url); },
    listSites: async () => snapshot(["tovu-dev"]),
    createSite: async ({ name }) => ({ site: { name, dir: `/sites/${name}`, siteId: "s-1" } }),
    manageLocalSite: async ({ name }) => local(name, { status: "running" }),
    listTokenSignInPlugins: async () => ({ plugins: [] }),
    activateSite: () => Promise.reject(new Error("activateSite was not expected")),
    ...overrides,
  };
}

describe("live import site rules", () => {
  it("names the new site after the address's host, free of the names already taken", () => {
    expect(liveImportSiteName({ address: " https://www.Example.com/about ", taken: [] })).toBe("example-com");
    expect(liveImportSiteName({ address: "https://shop.example.co.uk", taken: [] })).toBe("shop-example-co-uk");
    expect(liveImportSiteName({ address: "https://example.com", taken: ["example-com", "example-com-2"] })).toBe("example-com-3");
    expect(liveImportSiteName({ address: "http://127.0.0.1:8080/", taken: [] })).toBe("127-0-0-1");
  });

  it("opens the new site's own Import tab with the address filled in, as the desktop app does", () => {
    expect(liveImportAdminUrl({ adminUrl: "https://localhost:3005/admin/", address: " https://example.com/about " }))
      .toBe("https://localhost:3005/admin/import-export?tab=import&liveImport=https%3A%2F%2Fexample.com%2Fabout");
    expect(liveImportAdminUrl({ adminUrl: "https://localhost:3005/admin", address: "https://example.com" }))
      .toBe("https://localhost:3005/admin/import-export?tab=import&liveImport=https%3A%2F%2Fexample.com");
  });
});

describe("useLiveImportSite", () => {
  it("makes a new site, starts it, waits until it runs, then opens its Import tab", async () => {
    const created: string[] = [];
    const states = [local("example-com-2"), local("example-com-2", { status: "running" })];
    const sites = port({
      listSites: vi.fn()
        .mockResolvedValueOnce(snapshot(["tovu-dev", "example-com"]))
        .mockImplementation(async () => snapshot([], [states.shift()!])),
      createSite: async ({ name }) => { created.push(name); return { site: { name, dir: `/sites/${name}`, siteId: "s-1" } }; },
      manageLocalSite: vi.fn(async ({ name }) => local(name)),
    });
    const wait = vi.fn(async () => {});
    const { result } = renderHook(() => useLiveImportSite({ port: sites, t }, { wait }));
    await act(() => result.current.start("https://example.com"));
    expect(created).toEqual(["example-com-2"]);
    expect(sites.manageLocalSite).toHaveBeenCalledWith({ name: "example-com-2", action: "start", confirmed: true });
    expect(wait).toHaveBeenCalledTimes(2);
    expect(sites.opened).toEqual(["https://localhost:3005/admin/import-export?tab=import&liveImport=https%3A%2F%2Fexample.com"]);
    expect(result.current.error).toBeNull();
  });

  it("ignores an address that is not a web address, and a second press while one runs", async () => {
    const createSite = vi.fn(async ({ name }: { name: string }) => ({ site: { name, dir: "", siteId: "" } }));
    const { result } = renderHook(() => useLiveImportSite({ port: port({ createSite }), t }));
    await act(() => result.current.start("javascript:alert(1)"));
    expect(createSite).not.toHaveBeenCalled();
    await act(() => Promise.all([result.current.start("https://a.example"), result.current.start("https://a.example")]));
    expect(createSite).toHaveBeenCalledTimes(1);
  });

  it("says in plain words when the site could not be made", async () => {
    const sites = port({ createSite: () => Promise.reject(new ApiError("", 403, "SITE_SWITCHING_DISABLED")) });
    const { result } = renderHook(() => useLiveImportSite({ port: sites, t }));
    await act(() => result.current.start("https://example.com"));
    expect(result.current.error).toBe("Site switching is turned off on this deployment.");
    expect(result.current.creating).toBe(false);
    expect(sites.opened).toEqual([]);
  });

  it("names the made site when it does not start, and says where to start it", async () => {
    const crashed = port({ manageLocalSite: async ({ name }) => local(name, { status: "crashed", adminUrl: null }) });
    const first = renderHook(() => useLiveImportSite({ port: crashed, t }, { wait: async () => {} }));
    await act(() => first.result.current.start("https://example.com"));
    expect(first.result.current.error).toBe("{name} was made but didn't start. Start it from All sites, then import there.".replace("{name}", "example-com"));
    expect(crashed.opened).toEqual([]);

    const refused = port({ manageLocalSite: () => Promise.reject(new ApiError("", 409, "SITE_LIMIT")) });
    const second = renderHook(() => useLiveImportSite({ port: refused, t }, { wait: async () => {} }));
    await act(() => second.result.current.start("https://example.com"));
    expect(second.result.current.error).toBe("example-com was made but didn't start. Start it from All sites, then import there. Stop a site before starting another.");

    const slow = port({ manageLocalSite: async ({ name }) => local(name), listSites: async () => snapshot(["x"], [local("example-com")]) });
    const wait = vi.fn(async () => {});
    const third = renderHook(() => useLiveImportSite({ port: slow, t }, { wait, attempts: 3 }));
    await act(() => third.result.current.start("https://example.com"));
    expect(wait).toHaveBeenCalledTimes(3);
    expect(third.result.current.error).toMatch(/^example-com was made but didn't start\./);
  });
});
