import { useEffect, useRef, useState } from 'react';
import type { SiteRecord } from '../contracts/project.js';

export function revealActiveTab({ strip }: { strip: Pick<HTMLElement, 'querySelector'> }, _optional = {}): void {
  strip.querySelector<HTMLElement>('.is-active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
export function tabOverflow({ strip }: { strip: Pick<HTMLElement, 'scrollWidth' | 'clientWidth' | 'scrollLeft'> }, _optional = {}) {
  return { left: strip.scrollLeft > 1, right: strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1 };
}
/** Recheck on resize as well as selection: the active tab can leave view without a tab change. */
export function useTabStrip({ activeTab, projects }: { activeTab: string | null; projects: readonly SiteRecord[] }, _optional = {}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });
  const tabKey = JSON.stringify(projects.map((project) => [project.id, project.displayName]));
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const update = () => setOverflow(tabOverflow({ strip }));
    const reveal = () => { revealActiveTab({ strip }); update(); };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(strip);
    strip.addEventListener('scroll', update);
    return () => { observer.disconnect(); strip.removeEventListener('scroll', update); };
  }, [activeTab, tabKey]);
  const scrollLeft = () => stripRef.current?.scrollBy({ left: -200, behavior: 'smooth' });
  const scrollRight = () => stripRef.current?.scrollBy({ left: 200, behavior: 'smooth' });
  // Arrows exist only while the strip actually overflows; otherwise they read as dead controls.
  return { stripRef, overflow, showArrows: overflow.left || overflow.right, scrollLeft, scrollRight };
}
