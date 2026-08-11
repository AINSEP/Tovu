import type { Express, Request, Response } from "express";

import { findTheme, renderStaticPage, renderStaticPartial, type DiscoveredTheme } from "#src/features/theme/index";

/**
 * @file Serves any static theme's page, fully rendered, at `/theme-explore/{themeId}/{pageId}` — the
 * admin Explore screen's preview iframe. Also serves a theme's PARTIALS (`nav`, `footer`, `sidebar`,
 * …) standalone at `/theme-explore/{themeId}/partial/{partialId}`, a sibling route rather than a
 * branch of the page route: partial ids and page ids are different namespaces (a theme could
 * legitimately have a page and a partial that happen to share a name), and a distinct URL shape says
 * so instead of relying on a lookup order to disambiguate.
 *
 * Rendered through the real loader (`renderStaticPage`), not a prebuilt copy: markers resolved,
 * design tokens inlined, asset paths rewritten to `/theme-assets/{themeId}/`. That last part is why
 * this has to be a real URL on the SITE origin rather than HTML posted into a `srcDoc` iframe — a
 * `srcDoc` document resolves those relative asset paths against the ADMIN's origin, where nothing
 * serves them, so every stylesheet 404s and the preview is a wall of unstyled text.
 *
 * Distinct from `theme-preview-static.ts`, which serves each theme's prebuilt `preview/` folder from
 * `build-preview.mjs`. That one is a spike predating static-tier rendering being wired at all, and
 * its header still says so; this is the real path and that one should be retired.
 *
 * Ungated, matching `theme-static-assets.ts`'s existing posture: a theme's pages and CSS are already
 * served to anonymous visitors by the site itself, and `express.static` there already exposes each
 * theme's `pages/*.html` directly. Rendering a page nobody activated reveals nothing the theme files
 * do not, and the admin's own auth cannot reach an iframe pointed at the site origin anyway.
 *
 * Reads `themes` through a getter rather than capturing the array: `rescanThemes` refills that array
 * in place, and a theme downloaded after boot must be previewable without a restart — which is the
 * whole point of the rescan work this sits on top of.
 */
/**
 * The lookup + tier check both routes below need before they can render anything: find the theme,
 * 404 if it doesn't exist, 422 if it isn't `static` tier (the only tier this whole file's rendering
 * path understands). Returns the theme on success, or `null` after already writing the error
 * response — the caller's job is just to `return` in that case, same shape `findTheme` itself uses
 * for "not found".
 */
function resolveStaticTheme(
  res: Response,
  required: { themes: DiscoveredTheme[]; themeId: string }
): DiscoveredTheme | null {
  const { themes, themeId } = required;
  const theme = findTheme({ themes, id: themeId });
  if (!theme) {
    res.status(404).type("text/plain").send(`theme '${themeId}' was not found`);
    return null;
  }
  if (theme.manifest.tier !== "static") {
    res
      .status(422)
      .type("text/plain")
      .send(`theme '${themeId}' is a '${theme.manifest.tier}' theme; only static themes preview this way`);
    return null;
  }
  return theme;
}

export function registerThemePagePreview(
  app: Express,
  required: { getThemes: () => DiscoveredTheme[] }
): void {
  const { getThemes } = required;

  app.get("/theme-explore/:themeId/:pageId", (req: Request, res: Response) => {
    const themeId = String(req.params.themeId ?? "");
    const pageId = String(req.params.pageId ?? "");

    const theme = resolveStaticTheme(res, { themes: getThemes(), themeId });
    if (!theme) return;

    const html = renderStaticPage({ theme, pageId });
    if (html === null) {
      res.status(404).type("text/plain").send(`page '${pageId}' was not found in theme '${themeId}'`);
      return;
    }

    // Never cached: the Explore screen re-requests this immediately after every save, and a cached
    // response would show the operator their pre-save markup and read as "the save did not work".
    res.set("Cache-Control", "no-store").type("text/html").send(html);
  });

  // Partials (`nav`, `footer`, `sidebar`, …) previewed standalone — see this file's header for why
  // this is a sibling route rather than a fallback inside the page route above.
  app.get("/theme-explore/:themeId/partial/:partialId", (req: Request, res: Response) => {
    const themeId = String(req.params.themeId ?? "");
    const partialId = String(req.params.partialId ?? "");

    const theme = resolveStaticTheme(res, { themes: getThemes(), themeId });
    if (!theme) return;

    const html = renderStaticPartial({ theme, partialId });
    if (html === null) {
      res.status(404).type("text/plain").send(`partial '${partialId}' was not found in theme '${themeId}'`);
      return;
    }

    res.set("Cache-Control", "no-store").type("text/html").send(html);
  });
}
