/**
 * @file A Sites card's preview image: which URL to show, and the placeholder when there is none.
 *
 * The admin twin of the desktop's `apps/desktop/src/renderer/use-site-preview.hooks.ts`. The
 * snapshot carries only a version token per site (`AdminSitesSnapshot.previewVersions`), never the
 * bytes; the image is fetched by the browser itself from a URL that embeds that version, so a
 * repeated 3s Sites poll re-renders the same `src` and costs no request, and a new capture is a new
 * URL. The server decides when to capture — see `site-preview-service.ts` in the website app.
 */
import { useCallback, useState } from "react";
import { adminSitePreviewUrl, type AdminSiteListEntry, type AdminSitesSnapshot } from "@/lib/api";

export interface SiteCardPreviewView {
  /** The image to show, or `null` for the placeholder (no capture yet, or an older server). */
  src: string | null;
  /** The placeholder's glyph: the folder name's first character — data, never translated copy. */
  initial: string;
}

/**
 * Pure: the card preview for `site` from the listing's version tokens.
 * @complexity O(1).
 */
export function resolveSiteCardPreview(
  { site, snapshot }: { site: Pick<AdminSiteListEntry, "name">; snapshot: Pick<AdminSitesSnapshot, "previewVersions"> },
  { urlFor = adminSitePreviewUrl }: { urlFor?: typeof adminSitePreviewUrl } = {},
): SiteCardPreviewView {
  const version = snapshot.previewVersions?.[site.name];
  return {
    src: version === undefined ? null : urlFor({ name: site.name, version }),
    initial: site.name.charAt(0).toUpperCase(),
  };
}

/**
 * {@link resolveSiteCardPreview} plus the one piece of state it needs: an image URL that failed to
 * load falls back to the placeholder until a new capture changes the URL, so a broken or deleted
 * file never leaves the browser's broken-image glyph on a card.
 * @complexity O(1) per render.
 */
export function useSiteCardPreview(
  required: { site: Pick<AdminSiteListEntry, "name">; snapshot: Pick<AdminSitesSnapshot, "previewVersions"> },
  optional: { urlFor?: typeof adminSitePreviewUrl } = {},
): SiteCardPreviewView & { onError: () => void } {
  const view = resolveSiteCardPreview(required, optional);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const onError = useCallback(() => setFailedSrc(view.src), [view.src]);
  return { src: view.src === failedSrc ? null : view.src, initial: view.initial, onError };
}
