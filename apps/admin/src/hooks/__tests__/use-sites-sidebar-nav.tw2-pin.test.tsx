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

// L13 Stryker: the truncation measure (`scrollWidth > clientWidth`, its boundary), the resize
// re-measure, and the `data-cms-sites-split` marker/cleanup had no coverage (jsdom has no layout, so
// the measure port is injected).
import { act, render } from "@/__tests__/fetch-query-render";

function Probe({ measure, onView }: { measure?: (element: HTMLElement) => { scrollWidth: number; clientWidth: number }; onView: (view: ReturnType<typeof useSitesSidebarNav>) => void }) {
  const port: Pick<SitesPort, "listSites"> = { listSites: async () => ({
    switchingEnabled: true, sites: [], persistedSiteName: "p",
    currentSite: { name: "a-very-long-site-name", dir: "/sites/current", listed: false, dirOverridden: false },
  }) };
  const view = useSitesSidebarNav({ groups, locale: "en" }, measure ? { port, measure } : { port });
  onView(view);
  return createElement("span", { ref: view.nameRef }, view.siteName);
}

it("titles a truncated name only while it overflows, re-measuring on resize, and marks then unmarks the shared row", async () => {
  const nav = document.createElement("nav");
  nav.id = "admin-sidebar";
  nav.innerHTML = `<a class="cms-item" href="/admin/sites"><span>Sites</span></a>`;
  document.body.append(nav);
  const size = { scrollWidth: 120, clientWidth: 120 };
  let view!: ReturnType<typeof useSitesSidebarNav>;
  const rendered = render(createElement(Probe, { measure: () => ({ ...size }), onView: v => { view = v; } }), { wrapper: SidebarScope });
  const row = nav.querySelector("a")!;
  await waitFor(() => expect(view.target).toBe(row));
  expect(row.hasAttribute("data-cms-sites-split")).toBe(true);
  expect(view.title).toBeUndefined();
  size.scrollWidth = 121;
  act(() => { window.dispatchEvent(new Event("resize")); });
  expect(view.title).toBe("a-very-long-site-name");
  size.scrollWidth = 120;
  act(() => { window.dispatchEvent(new Event("resize")); });
  expect(view.title).toBeUndefined();
  rendered.unmount();
  expect(row.hasAttribute("data-cms-sites-split")).toBe(false);
  nav.remove();
});

it("the default measure reads the element's own widths, and a ResizeObserver re-measures when present", async () => {
  const observed: Element[] = [];
  let fire!: () => void;
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class { constructor(cb: () => void) { fire = cb; } observe(el: Element) { observed.push(el); } disconnect() { disconnect(); } });
  const nav = document.createElement("nav");
  nav.id = "admin-sidebar";
  document.body.append(nav);
  let view!: ReturnType<typeof useSitesSidebarNav>;
  const rendered = render(createElement(Probe, { onView: v => { view = v; } }), { wrapper: SidebarScope });
  await waitFor(() => expect(view.siteName).toBe("a-very-long-site-name"));
  const span = observed.at(-1) as HTMLElement;
  expect(span.textContent).toBe("a-very-long-site-name");
  Object.defineProperty(span, "scrollWidth", { configurable: true, value: 300 });
  Object.defineProperty(span, "clientWidth", { configurable: true, value: 100 });
  act(() => fire());
  expect(view.title).toBe("a-very-long-site-name");
  rendered.unmount();
  expect(disconnect).toHaveBeenCalled();
  nav.remove();
  vi.unstubAllGlobals();
});
