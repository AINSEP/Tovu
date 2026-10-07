import { siteUrl } from "@/lib/site-url";
import type { ThemeExploreFile } from "./use-theme-explore.hooks";
import { useThemePreviewRefresh } from "./use-theme-preview-refresh.hooks";

/**
 * Whether `file` is a `templated`-tier Liquid source file — case-insensitive, matching every other
 * extension check in this screen's server counterpart (`explore.ts`'s
 * `isTextReadable`/`isAssetExtension`). A plain extension check rather than reading `file.kind`:
 * `fileGroup` (`explore.ts`) has no `templates/` case, so every `.liquid` file lands in the generic
 * `"other"` group today — indistinguishable from `NOTICE.md` by `kind` alone, but NOT
 * indistinguishable by what the Preview tab owes the operator (see {@link previewSrcFor}).
 *
 * @complexity O(1).
 */
function isLiquidTemplateFile(file: ThemeExploreFile): boolean {
  return file.path.toLowerCase().endsWith(".liquid");
}

/**
 * The URL for the selected file's preview, or `null` when the file has no meaningful one.
 *
 * Four shapes, because "preview" means four different things here:
 * - a **page** renders through the theme's own shell at `/theme-explore/{theme}/{page}`
 * - a **partial** renders standalone inside a minimal styled host, at `…/partial/{id}`
 * - a **`.liquid` template** (2026-08-12) renders through the real Liquid render pipeline at
 *   `…/template/{id}` — `id` is the filename minus `.liquid` (`file.label` for a non-page/partial
 *   file is the bare basename WITH its extension, see `fileLabel`/`use-theme-explore.hooks.ts`),
 *   matching `theme.ts`'s own `templateId = file.slice(0, -".liquid".length)` derivation
 *   byte-for-byte. The server (`theme-page-preview.ts`) is the single source of truth for whether a
 *   given template id is actually renderable — an id it doesn't recognize (a custom-named template a
 *   third-party theme ships) degrades to that route's own honest plain-text refusal inside the
 *   iframe rather than this function trying to duplicate the route/template-id mapping client-side.
 * - everything else — an asset (image, font), and now also CSS/JS/JSON/`other`-group files whether
 *   or not they're `readable` — is served raw from `/theme-assets/`, the same URL a visitor's browser
 *   would fetch it from. That route (`theme-static-assets.ts`) serves a theme's ENTIRE folder generically
 *   via `express.static`, with the correct `Content-Type` per extension — it was never scoped to
 *   binary/asset-group files only. So the browser's own native viewer does the rendering for free: CSS/JS
 *   show as syntax-colored plain text, JSON gets Chrome's built-in collapsible tree viewer, images/fonts
 *   render as themselves. 2026-08-17 owner ask (verbatim): "Can we get preview to just render everything,
 *   in a simple manner. If it's an image, it renders that. If it's a JavaScript, it just renders like
 *   HTML. If it's JSON same." — every file type should show SOMETHING in Preview, not just images.
 */
export function previewSrcFor(
  themeId: string,
  file: ThemeExploreFile | undefined,
  previewNonce: number,
): string | null {
  if (!file) return null;
  const theme = encodeURIComponent(themeId);
  if (file.kind === "page")
    return siteUrl(`/theme-explore/${theme}/${encodeURIComponent(file.label)}?v=${previewNonce}`);
  if (file.kind === "partial") {
    return siteUrl(`/theme-explore/${theme}/partial/${encodeURIComponent(file.label)}?v=${previewNonce}`);
  }
  if (isLiquidTemplateFile(file)) {
    const templateId = file.label.replace(/\.liquid$/i, "");
    return siteUrl(`/theme-explore/${theme}/template/${encodeURIComponent(templateId)}?v=${previewNonce}`);
  }
  return siteUrl(
    `/theme-assets/${theme}/${file.path.split("/").map(encodeURIComponent).join("/")}?v=${previewNonce}`,
  );
}

export function useThemeExplorePreview(
  {
    themeId,
    files,
    selected,
    previewNonce,
  }: { themeId: string; files: readonly ThemeExploreFile[]; selected: string | null; previewNonce: number },
  { makeRevision }: { makeRevision?: () => string } = {},
): string | null {
  const file = files.find((file) => file.path === selected);
  const refreshed = useThemePreviewRefresh({
    url: previewSrcFor(themeId, file, previewNonce) ?? "",
    makeRevision,
  });
  return refreshed.url || null;
}
