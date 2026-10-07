import { useEffect } from "react";

/** The shared sidebar has rail tooltips only; expanded CMS labels keep their full translated text. */
export function useCmsSidebarLabelTooltips(
  { navId = "admin-sidebar" }: { navId?: string },
  { doc = document }: { doc?: Document } = {},
): void {
  useEffect(() => {
    const nav = doc.getElementById(navId);
    if (!nav) return;
    const original = new Map<Element, string | null>();
    const update = () => {
      for (const link of nav.querySelectorAll("a.cms-item")) {
        const text = link.querySelector("span")?.textContent;
        if (!text) continue;
        if (!original.has(link)) original.set(link, link.getAttribute("title"));
        link.setAttribute("title", text);
      }
    };
    update();
    // Locale and permission changes can replace labels/rows without remounting the sidebar.
    const observer = new MutationObserver(update);
    observer.observe(nav, { childList: true, characterData: true, subtree: true });
    return () => {
      observer.disconnect();
      for (const [link, title] of original) {
        if (title === null) link.removeAttribute("title");
        else link.setAttribute("title", title);
      }
    };
  }, [doc, navId]);
}
