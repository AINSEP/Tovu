import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { SiteRecord } from '../contracts/project.js';

export function revealActiveTab({ strip }: { strip: Pick<HTMLElement, 'querySelector'> }, _optional = {}): void {
  strip.querySelector<HTMLElement>('.is-active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
export function tabOverflow({ strip }: { strip: Pick<HTMLElement, 'scrollWidth' | 'clientWidth' | 'scrollLeft'> }, _optional = {}) {
  return { left: strip.scrollLeft > 1, right: strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1 };
}
/** Only the selected tab is in the tab order; a removed selection falls back to All. */
export function tabStripTabIndex(
  { activeTab, projects, tabId }: { activeTab: string | null; projects: readonly Pick<SiteRecord, 'id'>[]; tabId: string | null },
  _optional = {},
): 0 | -1 {
  const selected = projects.some((project) => project.id === activeTab) ? activeTab : null;
  return selected === tabId ? 0 : -1;
}

/** WAI-ARIA horizontal tabs: wrap arrows and activate on focus because workspaces stay mounted. */
export function navigateTabStrip(
  { strip, event }: {
    strip: Pick<HTMLElement, 'querySelectorAll'>;
    event: Pick<ReactKeyboardEvent, 'key' | 'target' | 'preventDefault' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>;
  },
  _optional = {},
): void {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const tabs = Array.from(strip.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const index = tabs.findIndex((tab) => tab === event.target);
  // Close buttons and overflow arrows keep their own keyboard behaviour.
  if (index < 0) return;
  const next = nextTabIndex({ key: event.key, index, count: tabs.length });
  if (next === undefined) return;
  event.preventDefault();
  tabs[next]!.focus();
  tabs[next]!.click();
}

/** Resolve horizontal tab navigation without touching focus or activation.
 * @complexity O(1) time and space.
 */
function nextTabIndex({ key, index, count }: { key: string; index: number; count: number }, _options = {}): number | undefined {
  switch (key) {
    case 'ArrowLeft': return (index + count - 1) % count;
    case 'ArrowRight': return (index + 1) % count;
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return undefined;
  }
}

/** Recheck on resize as well as selection: the active tab can leave view without a tab change. */
export function useTabStrip(
  { activeTab, projects }: { activeTab: string | null; projects: readonly SiteRecord[] },
  { ResizeObserverImpl = globalThis.ResizeObserver }: {
    /** The resize port; defaults to the browser's `ResizeObserver`. */
    ResizeObserverImpl?: typeof ResizeObserver;
  } = {},
) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });
  const tabKey = JSON.stringify(projects.map((project) => [project.id, project.displayName]));
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return undefined;
    const update = () => setOverflow(tabOverflow({ strip }));
    const reveal = () => { revealActiveTab({ strip }); update(); };
    reveal();
    const observer = new ResizeObserverImpl(reveal);
    observer.observe(strip);
    strip.addEventListener('scroll', update);
    return () => { observer.disconnect(); strip.removeEventListener('scroll', update); };
  }, [activeTab, tabKey, ResizeObserverImpl]);
  const scrollLeft = () => stripRef.current?.scrollBy({ left: -200, behavior: 'smooth' });
  const scrollRight = () => stripRef.current?.scrollBy({ left: 200, behavior: 'smooth' });
  const tabIndex = ({ tabId }: { tabId: string | null }, _options = {}) => tabStripTabIndex({ activeTab, projects, tabId }, {});
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (stripRef.current) navigateTabStrip({ strip: stripRef.current, event }, {});
  };
  // Arrows exist only while the strip actually overflows; otherwise they read as dead controls.
  return { stripRef, overflow, showArrows: overflow.left || overflow.right, scrollLeft, scrollRight, tabIndex, onKeyDown };
}
