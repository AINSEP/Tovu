/**
 * @file Host binding of Jini's `useSitePreview` to the preload's `window.tovuRunner` bridge.
 * `SiteRecord.previewVersion` (`contracts/project.ts`) is the version token; the hook fetches once per
 * distinct version over `SITE_IPC_CHANNELS.preview` (see `@jini-ai/ui/site-card` for the decisions).
 */
import { useSitePreview as useBridgedSitePreview } from '@jini-ai/ui/site-card';
import { runnerInventoryBridge } from './runner-api.js';

/** A card's preview-capture URL, or `null` (no capture, in flight, or failed). O(1) per render. */
export function useSitePreview({ id, previewVersion }: { id: string; previewVersion: number | null }, _options = {}): string | null {
  return useBridgedSitePreview({ id, previewVersion, getBridge: runnerInventoryBridge });
}
