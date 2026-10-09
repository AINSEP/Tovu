import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Sidebar } from "@jini-ai/admin/react";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import type { AdminNavGroup } from "@/nav";
import type { AdminSitesSnapshot } from "@/lib/api";
import { createFakeSitesPort } from "@/features/sites/hooks/sites-dependencies.hooks";
import { useSites } from "@/features/sites/hooks/use-sites.hooks";
import { publishContentRefresh } from "@/lib/content-refresh-bus";
import { useCmsSidebarLabelTooltips } from "@/hooks/use-cms-sidebar-label-tooltips.hooks";
import { SitesSidebarNav } from "../SitesSidebarNav";

const groups: AdminNavGroup[] = [{ items: [{ id: "sites", label: "Sites", href: "/sites", icon: "", order: 1 }] }];
function snapshot(name = "plannie"): AdminSitesSnapshot {
  return { switchingEnabled: true, sites: [], currentSite: { name, dir: `/sites/${name}`, listed: false, dirOverridden: false }, persistedSiteName: "pending-site" };
}
function ExistingTooltips() { useCmsSidebarLabelTooltips({}); return null; }

describe("Sites sidebar label", () => {
  function mount({ name = "plannie", locale = "en", widths = { scrollWidth: 80, clientWidth: 80 }, collapsed = false } = {}) {
    return render(<FetchQueryProvider><Sidebar activeId="sites" railDefaultCollapsed={collapsed} railStorageKey={`sites-nav-test-${collapsed}`}>
      <ExistingTooltips />
      <SitesSidebarNav groups={groups} locale={locale} options={{ port: createFakeSitesPort(snapshot(name)), measure: () => widths }} />
    </Sidebar></FetchQueryProvider>);
  }

  it("names the currently served site, including an unlisted site, rather than a pending activation", async () => {
    mount();
    const link = await screen.findByRole("link", { name: "Sites (plannie)" });
    expect(link.getAttribute("title")).toBeNull();
    expect(link.querySelector(".cms-sites-name")?.getAttribute("title")).toBeNull();
    await waitFor(() => expect(link.querySelector(".cms-sites-prefix")?.textContent).toBe("Sites ("));
  });

  it("shows the native full-name tooltip only when measured overflow exists, and removes it after resize", async () => {
    const widths = { scrollWidth: 300, clientWidth: 80 };
    mount({ name: "a-long-site-name", widths });
    const link = await screen.findByRole("link", { name: "Sites (a-long-site-name)" });
    await waitFor(() => expect(link.querySelector(".cms-sites-name")?.getAttribute("title")).toBe("a-long-site-name"));
    widths.clientWidth = 300;
    act(() => window.dispatchEvent(new Event("resize")));
    expect(link.querySelector(".cms-sites-name")?.getAttribute("title")).toBeNull();
    expect(link.getAttribute("title")).toBeNull();
  });

  it("keeps Sites plain when there is no active name", async () => {
    let settle!: (value: AdminSitesSnapshot) => void;
    const response = new Promise<AdminSitesSnapshot>((resolve) => { settle = resolve; });
    const port = createFakeSitesPort(() => response);
    render(<FetchQueryProvider><Sidebar activeId="sites" railStorageKey="sites-empty-name-test">
      <ExistingTooltips />
      <SitesSidebarNav groups={groups} locale="en" options={{ port }} />
    </Sidebar></FetchQueryProvider>);
    await act(async () => { settle(snapshot("")); await response; });
    const link = screen.getByRole("link", { name: "Sites" });
    expect(link.querySelector(".cms-sites-label")).toBeNull();
    expect(link.getAttribute("title")).toBeNull();
  });

  it("uses the existing nav dictionary for the complete parentheses pattern", async () => {
    mount({ locale: "es" });
    expect(await screen.findByRole("link", { name: "Sitios (plannie)" })).toBeTruthy();
  });

  it("shares the Sites screen snapshot cache and follows site refresh events", async () => {
    let current = snapshot();
    let reads = 0;
    const port = createFakeSitesPort(async () => { reads += 1; return current; });
    function SitesScreen() { useSites(port, (key) => key); return null; }
    render(<FetchQueryProvider><Sidebar activeId="sites" railStorageKey="sites-cache-test">
      <SitesSidebarNav groups={groups} locale="en" options={{ port }} />
    </Sidebar><SitesScreen /></FetchQueryProvider>);
    await screen.findByRole("link", { name: "Sites (plannie)" });
    expect(reads).toBe(1);
    current = snapshot("next-site");
    act(() => publishContentRefresh(["sites"]));
    await screen.findByRole("link", { name: "Sites (next-site)" });
  });

  it("keeps exactly one split label, without decorating the row's className, across active-state changes", async () => {
    const port = createFakeSitesPort(snapshot());
    const tree = (activeId: string) => <FetchQueryProvider><Sidebar activeId={activeId} railStorageKey="sites-active-flip-test">
      <SitesSidebarNav groups={groups} locale="en" options={{ port }} />
    </Sidebar></FetchQueryProvider>;
    const { rerender } = render(tree("sites"));
    const link = await screen.findByRole("link", { name: "Sites (plannie)" });
    await waitFor(() => expect(link.querySelectorAll(".cms-sites-label")).toHaveLength(1));
    rerender(tree("overview"));
    rerender(tree("sites"));
    expect(link.className).toBe("cms-item active");
    expect(link.querySelectorAll(".cms-sites-label")).toHaveLength(1);
    expect(link.querySelector(":scope > span:first-of-type")?.textContent).toBe("Sites (plannie)");
  });

  it("keeps the full site label in the shared collapsed rail tooltip", async () => {
    mount({ collapsed: true });
    const link = await screen.findByRole("link", { name: "Sites (plannie)" });
    fireEvent.mouseEnter(link);
    await waitFor(() => expect(document.querySelector(".cms-tooltip-portal")?.textContent).toBe("Sites (plannie)"));
  });
});
