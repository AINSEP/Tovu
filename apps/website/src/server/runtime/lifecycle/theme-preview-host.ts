/** Serving-host ownership for admin Themes card captures: one queue (one lazy browser) per served
 * site, the same lifetime and gating `site-preview-host.ts` applies to Sites card captures, reusing
 * that feature's store, queue and Playwright capture rather than a second screenshot stack. */
import path from "node:path";
import { isSiteSwitcherEnabled, type SiteBinding } from "#src/platform/site-dir/index";
import {
  createPlaywrightSitePreviewCapture,
  createSitePreviewService,
  createSitePreviewStore,
  sitePreviewRoot,
  type SitePreviewService,
} from "#src/features/sites/index";

const hosts = new Map<string, SitePreviewService>();

/**
 * Captures land in `sites/.tovu/theme-previews/<site>/<theme id>.jpg`: gitignored beside the Sites
 * captures, and per site because two sites may each have a different theme under the same id.
 * Off (`undefined`) wherever Sites captures are off — production and install-dir boots keep the
 * shipped `screenshots/` thumbnails and pay no Chromium cost.
 * @complexity O(1).
 */
export function themePreviewServiceForHost({ binding }: { binding: SiteBinding }, _optional = {}): SitePreviewService | undefined {
  if (!isSiteSwitcherEnabled()) return undefined;
  const sitesRoot = sitePreviewRoot({ binding });
  if (sitesRoot === null) return undefined;
  const existing = hosts.get(binding.dir);
  if (existing) return existing;
  const root = path.join(path.dirname(sitesRoot), "theme-previews", binding.name);
  const service = createSitePreviewService({ store: createSitePreviewStore({ root }), capture: createPlaywrightSitePreviewCapture() });
  hosts.set(binding.dir, service);
  return service;
}
