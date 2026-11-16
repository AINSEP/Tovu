import { captureVisitorEvent } from "../../../../visitor-analytics.js";
import type { NextFunction, Request, Response } from "express";
import { PostNotFoundError } from "#src/features/post/post";
import type { DiscoveredTheme } from "#src/features/theme/theme";
import type { RouteDeps } from "#src/server/routes/types";
import type { SiteRequestDeps } from "../render-context/deps.js";
import { ListingBatchNotFoundError } from "../listing/listing-state.js";
import { redirectLookupPath } from "../request-policy.js";
import type { StaticMenuMap } from "../render-context/static-menus.js";
import { tryRedirectPhase } from "../redirect-phase.js";
import { finishStaticTierDocument } from "../static-tier.js";
import { listingBatchNotFound } from "./listing.js";
import { reportSiteRenderFault } from "./virtual-page.js";

/**
 * `GET /:slug`'s `PostNotFoundError` handling — always fully handles the response (a redirect, a
 * themed 404, or the bare fallback 404), never falls through. Split out of the route's own catch
 * block so that block's `err instanceof PostNotFoundError` discriminant is the only branch left
 * inline at the call site.
 *
 * It can still reject (a default-policy `post_content` handler that throws, a themed-404 render
 * fault): call it inside a `try`, or through {@link handlePostNotFoundInSlugCatch} where there is
 * none.
 */
export async function handlePostNotFoundOnSlugRoute(
  req: Request,
  res: Response,
  deps: RouteDeps,
  theme: DiscoveredTheme | null,
  staticMenus: StaticMenuMap | undefined
): Promise<void> {
  if (await tryRedirectPhase({ phase: "post_content", path: redirectLookupPath({ req }), workspaceId: deps.workspaceId, res })) return;

  // A static theme that ships its own pages/404.html gets a themed not-found page instead of
  // the bare fallback below — E4 (D2, 2026-09-23) runs it through the SAME
  // `finishStaticTierDocument` pipeline every other static-tier surface uses, so a widget or
  // collection marker on the 404 page (or a partial it references) resolves too, not only its menu
  // markers (the one thing the old direct `renderStaticPage` call already substituted).
  if (theme && theme.manifest.tier === "static" && theme.pages["404"] !== undefined) {
    const staticHtml = await finishStaticTierDocument({ deps, input: {
      theme,
      pageId: "404",
      html: theme.pages["404"],
      currentPath: req.path,
      staticMenus,
    } }, {});
    if (staticHtml) {
      void captureVisitorEvent({ deps, request: req, name: "site_not_found", properties: { routeTemplate: "/:slug" } });
      res.status(404).type("html").send(staticHtml);
      return;
    }
  }

  void captureVisitorEvent({ deps, request: req, name: "site_not_found", properties: { routeTemplate: "/:slug" } });
  res.status(404).type("html").send("<h1>404 — page not found</h1><p><a href='/'>Home</a></p>");
}

/**
 * {@link handlePostNotFoundOnSlugRoute} for `GET /:slug`'s own catch block — the one call site with
 * no enclosing `catch`. Express 4 ignores the promise an async handler returns, so a rejection there
 * (a default-policy `post_content` handler that throws, or a themed-404 render fault) used to leave
 * the request with no response at all and surface only as a process-wide unhandled rejection
 * (t91 F4.3-A). Answers it exactly as the route's catch answers every other fault.
 *
 * @param input.slug the slug `resolveRequestedSlug` already validated — used only in the fault line.
 * @complexity O(1) beyond {@link handlePostNotFoundOnSlugRoute}.
 */
async function handlePostNotFoundInSlugCatch(input: {
  req: Request;
  res: Response;
  deps: RouteDeps;
  theme: DiscoveredTheme | null;
  staticMenus: StaticMenuMap | undefined;
  slug: string;
}): Promise<void> {
  const { req, res, deps, theme, staticMenus, slug } = input;
  try {
    await handlePostNotFoundOnSlugRoute(req, res, deps, theme, staticMenus);
  } catch (err) {
    reportSiteRenderFault({ detail: `GET /:slug failed (slug=${slug})`, err });
    res.status(500).type("html").send("<h1>Site error</h1>");
  }
}

/** `GET /:slug`'s catch: a see-more miss falls through to the 404, a missing post renders the
 *  themed 404, and anything else is a reported 500. */
export async function handleSlugRouteError({ err, req, res, next, deps, theme, staticMenus, slug }: {
  err: unknown; req: Request; res: Response; next: NextFunction; deps: SiteRequestDeps;
  theme: DiscoveredTheme | null; staticMenus: StaticMenuMap | undefined; slug: string;
}): Promise<void> {
  if (err instanceof ListingBatchNotFoundError) return listingBatchNotFound({ req, res, next, workspaceId: deps.workspaceId });
  // A `PostNotFoundError` is ordinary control flow on this route (no post at this slug), not a
  // fault — reporting it would bury every real fault under one line per 404 a crawler produces.
  if (err instanceof PostNotFoundError) {
    await handlePostNotFoundInSlugCatch({ req, res, deps, theme, staticMenus, slug });
    return undefined;
  }
  reportSiteRenderFault({ detail: `GET /:slug failed (slug=${slug})`, err });
  res.status(500).type("html").send("<h1>Site error</h1>");
  return undefined;
}
