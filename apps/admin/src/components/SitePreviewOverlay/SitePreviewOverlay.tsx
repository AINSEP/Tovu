import { siteUrl } from "../../lib/site-url";
import { useSitePreviewOverlay, type UseSitePreviewOverlay } from "./hooks/SitePreviewOverlay.hooks";
import { translateSitePreviewOverlayLabel } from "./site-preview-overlay-i18n";

/**
 * @file `admin.show_site_page`'s on-screen surface — a same-origin `<iframe>` panel over the admin,
 * NOT a modal: it deliberately carries no backdrop and no `aria-modal`, because the assistant dock
 * must stay clickable while this is open (§Q6 of `2026-09-15-view-site-tool-PLAN.md` — the whole
 * design exists so showing the site never kills the run that asked for it). Markup only; all state
 * lives in `SitePreviewOverlay.hooks.ts` per this repo's "no component logic in `.tsx`" rule.
 *
 * `<iframe src>` copies `PostEditor.tsx:1719`'s live post-preview iframe exactly, including
 * `referrerPolicy="no-referrer"`. No `sandbox` attribute — this is the site's own published page,
 * same-origin, and must render exactly as a visitor sees it (contrast Theme Studio's preview, which
 * sandboxes because it renders unpublished theme markup).
 *
 * Rendered by `App.tsx` as a DOM sibling of `<main>`, inside `.admin-main-col` (not `<main>` itself,
 * and not `.admin-layout`'s own top level): `.admin-main-col`'s own box never includes the assistant
 * dock's flex column, so this overlay is geometrically incapable of covering the dock in desktop
 * mode — no z-index arithmetic to keep correct. `styles.css`'s `.site-preview-overlay` rule confines
 * it with `position: absolute; inset: 0` inside that (now `position: relative`) column. Also keeps it
 * out of `useAgentPageBridge`'s `contentEl` (`<main>` itself), so `page.find_elements` and
 * `admin.capture_screenshot` never scan or rasterize the overlay's own controls as page content.
 */
export interface SitePreviewOverlayProps {
  locale: string;
  /** Injectable seam for the open/close/subscription hook. Defaults to the real
   *  {@link useSitePreviewOverlay}; a test can pass a fake to render this markup without a real
   *  `site-preview-bus.ts` subscription. */
  useOverlay?: () => UseSitePreviewOverlay;
}

export function SitePreviewOverlay({ locale, useOverlay = useSitePreviewOverlay }: SitePreviewOverlayProps) {
  const { open, path, close } = useOverlay();
  if (!open || path === null) return null;

  const t = (key: string) => translateSitePreviewOverlayLabel(locale, key);

  return (
    <div className="site-preview-overlay" role="dialog" aria-label={t("Site preview")}>
      <div className="site-preview-overlay-header">
        <span className="site-preview-overlay-path" title={path}>
          {path}
        </span>
        <a className="site-preview-overlay-open-external" href={siteUrl(path)} target="_blank" rel="noreferrer">
          {t("Open in browser ↗")}
        </a>
        <button type="button" className="site-preview-overlay-close" onClick={close} aria-label={t("Close preview")}>
          <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
            <path d="M5 5 13 13M13 5 5 13" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <iframe src={siteUrl(path)} title={t("Site preview")} className="site-preview-overlay-frame" referrerPolicy="no-referrer" />
    </div>
  );
}
