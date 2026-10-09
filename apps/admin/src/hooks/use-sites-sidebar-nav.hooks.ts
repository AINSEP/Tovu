import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useSidebar } from "@jini-ai/admin/react";
import type { AdminNavGroup } from "@/nav";
import { translateAdminNavLabel } from "@/lib/admin-nav-i18n";
import { defaultSitesPort } from "@/features/sites/hooks/sites-dependencies.hooks";
import type { SitesPort } from "@/features/sites/hooks/sites-port.hooks";
import { useSitesSnapshot } from "@/features/sites/hooks/use-sites-snapshot.hooks";

export interface SitesSidebarNavOptions {
  port?: Pick<SitesPort, "listSites">;
  doc?: Document;
  /** Read browser layout by default; tests inject exact dimensions without module mocks. */
  measure?: (element: HTMLElement) => { scrollWidth: number; clientWidth: number };
}

function measureSiteName(element: HTMLElement) {
  return { scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
}

export interface SitesSidebarNavView {
  groups: readonly AdminNavGroup[];
  siteName: string;
  prefix: string;
  suffix: string;
  target: HTMLElement | null;
  nameRef: RefObject<HTMLSpanElement | null>;
  title: string | undefined;
}

/**
 * CMS Sites label adapter over Jini's sidebar and the Sites screen's shared query cache.
 * The shared row still owns its icon, route, accessible name and rail tooltip. A portal supplies
 * only the split visual label because this installed Sidebar has no label-only rendering slot.
 * @returns Markup-ready label parts, portal target, and a native tooltip only for measured overflow.
 * @complexity O(n) in the supplied nav items; one cached Sites read, no per-item requests.
 */
export function useSitesSidebarNav(
  { groups, locale }: { groups: readonly AdminNavGroup[]; locale: string },
  { port = defaultSitesPort, doc = document, measure = measureSiteName }: SitesSidebarNavOptions = {},
): SitesSidebarNavView {
  const { collapsed } = useSidebar();
  const enabled = groups.some((group) => group.items.some((item) => item.id === "sites"));
  const list = useSitesSnapshot({ port }, { enabled });
  // currentSite is the live binding, even for an unlisted site; persistedSiteName awaits restart.
  const siteName = enabled ? list.data?.currentSite.name ?? "" : "";
  const plain = translateAdminNavLabel({ locale, key: "Sites" });
  const pattern = translateAdminNavLabel({ locale, key: "Sites ({siteName})" });
  const [prefix, suffix = ""] = pattern.split("{siteName}");
  const label = siteName ? `${prefix}${siteName}${suffix}` : plain;
  const labelledGroups = groups.map((group) => ({ ...group, items: group.items.map((item) => item.id === "sites" ? { ...item, label } : item) }));
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);
  const hasName = Boolean(siteName);

  useEffect(() => {
    const nav = doc.getElementById("admin-sidebar");
    if (!nav || !hasName) { setTarget(null); return; }
    // No row class is added here: React rewrites the shared row's className on every active change,
    // so styles.css keys off the portaled label's presence with `:has` instead.
    const discover = () => setTarget(nav.querySelector<HTMLElement>('a.cms-item[href$="/sites"]'));
    discover();
    // Permission/locale changes can replace the shared row without remounting this adapter.
    const observer = new MutationObserver(discover);
    observer.observe(nav, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [doc, hasName]);

  useLayoutEffect(() => {
    const element = nameRef.current;
    if (!element) { setTruncated(false); return; }
    const update = () => {
      const { scrollWidth, clientWidth } = measure(element);
      setTruncated(scrollWidth > clientWidth);
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
    observer?.observe(element);
    doc.defaultView?.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      doc.defaultView?.removeEventListener("resize", update);
    };
  }, [target, siteName, collapsed, doc, measure]);

  return { groups: labelledGroups, siteName, prefix, suffix, target, nameRef, title: truncated ? siteName : undefined };
}
