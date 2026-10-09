/**
 * @file `GET /api/admin/v1/workspaces/:ws/themes/:themeId/preview` — a Themes card's picture of the
 * theme's OWN render.
 *
 * Why it exists: a card used to show the theme's shipped `screenshots/index.*`, a static file that a
 * duplicate, an import or a theme built from the starter carries over verbatim from its source, and
 * that nothing ever regenerates after an edit — so every theme copied from Tovu Starter showed the
 * Starter's "Three things to start with" picture. Now the card asks this route, which screenshots
 * `/theme-explore/<id>/<page>` (the same real render the Explore preview iframe shows) whenever the
 * theme's files are newer than the stored capture (`themeContentVersion`), and serves that.
 *
 * The capture queue, store and browser are the Sites cards' (`features/sites/site-preview`), one
 * queue per served site (`theme-preview-host.ts`). Unlike the Sites listing, this waits for a due
 * capture (bounded by `waitMs`): it is an `<img>` request, so the card fills in when the picture is
 * ready instead of showing a stale one until the next visit. A capture that cannot be made (no
 * Chromium, a page that fails to load, a slow drain) answers with the shipped screenshot, uncached,
 * or `404` so the card shows its placeholder.
 *
 * Static tier only: the capture browser carries no admin session, and only static pages render at
 * `/theme-explore/` ungated (see `theme-page-preview.ts`). The listing never points another tier here.
 */
import type { Express } from "express";
import { authorizeOrRespond } from "../../authorize-guard.js";
import { getAuthedPrincipal } from "../../dev-auth.js";
import type { RouteDeps } from "#src/server/routes/types";
import { SITE_PREVIEW_CONTENT_TYPE, type SitePreviewService } from "#src/features/sites/index";
import type { DiscoveredTheme } from "#src/features/theme/index";
import { themeContentVersion, themePreviewImage } from "#src/features/theme/theme-preview-image";
import { servingAddressOf } from "../sites/site-previews.js";
import { themePreviewServiceForHost } from "#src/server/runtime/lifecycle/theme-preview-host";

export interface ThemePreviewRouteDeps extends Pick<RouteDeps, "workspaceId" | "authorize" | "themes"> {
  siteBinding?: RouteDeps["siteBinding"];
  /** The capture queue; `undefined` resolves it from `siteBinding`, `null` turns captures off. */
  themePreviews?: SitePreviewService | null;
}

export interface ThemePreviewRouteOptions {
  /** Longest an image request waits for a due capture before answering with the fallback. */
  waitMs?: number;
  contentVersion?: (required: { dir: string }) => number;
  /** The theme's shipped screenshot URL, or `null` — the fallback when no capture can be served. */
  shippedImage?: (required: { dir: string; id: string }) => string | null;
}

/** The page a capture renders: `index` when the theme has one, else its first page. @complexity O(p). */
function capturePageId(theme: DiscoveredTheme): string | null {
  const pages = Object.keys(theme.pages ?? {});
  return pages.includes("index") ? "index" : pages[0] ?? null;
}

/** Resolves after `ms`, or when `work` settles — whichever is first. Never rejects. */
function settleWithin(work: Promise<void>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<void>((resolve) => { timer = setTimeout(resolve, ms); });
  return Promise.race([work.catch(() => {}), timeout]).finally(() => clearTimeout(timer));
}

/**
 * @complexity O(t + f) per request for t themes and the theme's f files (one tree walk), plus at
 *   most one capture (~1–2 s) when the theme changed since the last one.
 */
export function registerAdminThemePreviewRoute(
  { app, deps }: { app: Express; deps: ThemePreviewRouteDeps },
  { waitMs = 20_000, contentVersion = themeContentVersion, shippedImage = themePreviewImage }: ThemePreviewRouteOptions = {},
): void {
  const previews = deps.themePreviews !== undefined
    ? deps.themePreviews ?? undefined
    : deps.siteBinding ? themePreviewServiceForHost({ binding: deps.siteBinding }) : undefined;

  app.get("/api/admin/v1/workspaces/:workspaceId/themes/:themeId/preview", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) { res.status(404).json({ error: "workspace was not found" }); return; }
    try {
      const principal = getAuthedPrincipal(res);
      // Same permission as the presentation listing that hands out this URL.
      if (!(await authorizeOrRespond(res, deps.authorize, { principalId: principal.id,
        permission: "theme.set", workspaceId: deps.workspaceId, entityType: "presentation" }))) return;
      const themeId = String(req.params.themeId ?? "");
      const theme = deps.themes.find((t) => t.status === "valid" && t.manifest.id === themeId && t.manifest.tier === "static");
      if (!theme) { res.status(404).json({ code: "THEME_NOT_FOUND", error: "no such static theme" }); return; }

      const pageId = capturePageId(theme);
      if (previews && pageId !== null) {
        const version = contentVersion({ dir: theme.dir });
        // The queue's "older than createdAt is unusable" rule is exactly "captured before the last edit".
        const site = { name: themeId, createdAt: new Date(version).toISOString() };
        let captured = previews.versions({ sites: [site], targets: [] })[themeId];
        const serving = servingAddressOf({ req });
        if (captured === undefined && serving) {
          const url = `${serving.scheme}://localhost:${serving.port}/theme-explore/${encodeURIComponent(themeId)}/${encodeURIComponent(pageId)}`;
          previews.versions({ sites: [site], targets: [{ name: themeId, url, lifecycle: String(version) }] });
          await settleWithin(previews.idle(), waitMs);
          captured = previews.versions({ sites: [site], targets: [] })[themeId];
        }
        const bytes = captured === undefined ? null : previews.read({ name: themeId });
        if (bytes !== null) {
          res.status(200).set({
            "Content-Type": SITE_PREVIEW_CONTENT_TYPE,
            "Cache-Control": "private, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
          }).send(bytes);
          return;
        }
      }

      // `no-store`: the next request may well have a capture to show.
      const fallback = shippedImage({ dir: theme.dir, id: themeId });
      res.set({ "Cache-Control": "no-store" });
      if (fallback === null) { res.status(404).json({ code: "THEME_PREVIEW_NOT_FOUND", error: "no preview" }); return; }
      res.redirect(302, fallback);
    } catch (err) {
      console.error("[themes] unexpected error serving a theme preview", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
}
