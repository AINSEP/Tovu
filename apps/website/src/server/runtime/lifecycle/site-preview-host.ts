/** Serving-host ownership for admin Sites card previews: one service (one capture queue, one lazy
 * browser) per binding, the same lifetime rule `local-site-host.ts` applies to its supervisor. */
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
 * Lazy; launches nothing until a running site is first listed. Off (`undefined`) wherever local
 * site management is off — a production deployment pays no Chromium cost for one card it already
 * knows — and for an install-dir boot with no `sites/.tovu/` to store into.
 * @complexity O(1).
 */
export function sitePreviewServiceForHost({ binding }: { binding: SiteBinding }, _optional = {}): SitePreviewService | undefined {
  if (!isSiteSwitcherEnabled()) return undefined;
  const root = sitePreviewRoot({ binding });
  if (root === null) return undefined;
  const existing = hosts.get(binding.dir);
  if (existing) return existing;
  const service = createSitePreviewService({ store: createSitePreviewStore({ root }), capture: createPlaywrightSitePreviewCapture() });
  hosts.set(binding.dir, service);
  return service;
}
