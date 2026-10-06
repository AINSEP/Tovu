import { useEffect, useRef } from "react";

const phoneViewport = () => window.matchMedia("(max-width: 640px)").matches;

/** Host adapter for Jini's inline settings sidebar, rendered as a swipeable strip on phones.
 * Watch the shell's pressed state too: it can own the active tab before the URL is controlled.
 * Keep this in hooks so SettingsUi remains markup; upstream extraction is recorded in SURVEY.md.
 */
export function useSettingsActiveTabScroll(
  { ready, tabId }: { ready: boolean; tabId: string | null },
  { isPhone = phoneViewport }: { isPhone?: () => boolean } = {},
) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const strip = rootRef.current?.querySelector(".jini-tabbed-dialog-sidebar");
    if (!ready || !strip) return;
    const scrollActiveTab = () => {
      if (!isPhone()) return;
      strip.querySelector<HTMLElement>('.jini-tabbed-dialog-nav-item[aria-pressed="true"]')
        ?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "instant" });
    };
    scrollActiveTab();
    const observer = new MutationObserver(scrollActiveTab);
    observer.observe(strip, { subtree: true, attributes: true, attributeFilter: ["aria-pressed"] });
    window.addEventListener("resize", scrollActiveTab);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scrollActiveTab);
    };
  }, [ready, tabId, isPhone]);

  return rootRef;
}
