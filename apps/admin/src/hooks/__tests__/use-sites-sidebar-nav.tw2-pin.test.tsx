import { createElement, type ReactNode } from "react";
import { Sidebar } from "@jini-ai/admin/react";
import { renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, expect, it, vi } from "vitest";
import * as navI18n from "@/lib/admin-nav-i18n";
import type { AdminNavGroup } from "@/nav";
import type { AdminSitesSnapshot } from "@/lib/api";
import type { SitesPort } from "@/features/sites/hooks/sites-port.hooks";
import { useSitesSidebarNav } from "../use-sites-sidebar-nav.hooks";

const groups: readonly AdminNavGroup[] = [{ items: [
  { id: "sites", label: "Sites", href: "/sites", order: 1 },
  { id: "overview", label: "Overview", href: "/", order: 2 },
] }];
function SidebarScope({ children }: { children: ReactNode }) {
  return createElement(Sidebar, { activeId: "sites", railStorageKey: "tw2-sites-pin", children });
}

it.each([
  { locale: "en", name: "live-site", label: "Sites (live-site)", prefix: "Sites (" },
  { locale: "es", name: "live-site", label: "Sitios (live-site)", prefix: "Sitios (" },
  { locale: "unknown", name: "live-site", label: "Sites (live-site)", prefix: "Sites (" },
  { locale: "es", name: "", label: "Sitios", prefix: "Sitios (" },
])("formats the live name for $locale / '$name' and preserves other entries", async ({ locale, name, label, prefix }) => {
  const snapshot: AdminSitesSnapshot = {
    switchingEnabled: true, sites: [], persistedSiteName: "pending-site",
    currentSite: { name, dir: "/sites/current", listed: false, dirOverridden: false },
  };
  const port: Pick<SitesPort, "listSites"> = { listSites: vi.fn(async () => snapshot) };
  const { result } = renderHook(() => useSitesSidebarNav({ groups, locale }, { port }), { wrapper: SidebarScope });
  expect(result.current.groups[0]!.items[0]!.label).toBe(locale === "es" ? "Sitios" : "Sites");
  await waitFor(() => expect(port.listSites).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(result.current.groups[0]!.items[0]!.label).toBe(label));
  expect(result.current).toMatchObject({ siteName: name, prefix, suffix: ")", title: undefined, target: null });
  expect(result.current.groups[0]!.items[1]).toBe(groups[0]!.items[1]);
  expect(groups[0]!.items[0]!.label).toBe("Sites");
});

it("does not load sites when the supplied navigation has no Sites row", () => {
  const port: Pick<SitesPort, "listSites"> = { listSites: vi.fn(() => Promise.reject(new Error("unexpected Sites read"))) };
  const { result } = renderHook(() => useSitesSidebarNav({ groups: [], locale: "en" }, { port }), { wrapper: SidebarScope });
  expect(port.listSites).not.toHaveBeenCalled();
  expect(result.current).toMatchObject({ groups: [], siteName: "", prefix: "Sites (", suffix: ")", title: undefined });
});

afterEach(() => vi.restoreAllMocks());

it.each([
  { pattern: "Sites", prefix: "Sites", suffix: "", label: "Siteslive" },
  { pattern: "{siteName}", prefix: "", suffix: "", label: "live" },
  { pattern: "A{siteName}B{siteName}C", prefix: "A", suffix: "B", label: "AliveB" },
])("preserves split-pattern behavior for '$pattern'", async ({ pattern, prefix, suffix, label }) => {
  vi.spyOn(navI18n, "translateAdminNavLabel").mockImplementation(({ key }) => key === "Sites ({siteName})" ? pattern : "Plain");
  const port: Pick<SitesPort, "listSites"> = { listSites: async () => ({
    switchingEnabled: true, sites: [], persistedSiteName: "pending",
    currentSite: { name: "live", dir: "/sites/current", listed: false, dirOverridden: false },
  }) };
  const { result } = renderHook(() => useSitesSidebarNav({ groups, locale: "en" }, { port }), { wrapper: SidebarScope });
  await waitFor(() => expect(result.current.siteName).toBe("live"));
  expect(result.current).toMatchObject({ prefix, suffix });
  expect(result.current.groups[0]!.items[0]!.label).toBe(label);
});
