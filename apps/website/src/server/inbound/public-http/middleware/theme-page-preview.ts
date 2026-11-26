import type { Express, Request, Response } from "express";
import {
  staticThemePagePreview,
  staticThemePartialPreview,
  templatedThemePagePreview,
  templatedPreviewFailureResponse,
  type FindPreviewTheme,
  type ThemePreviewResponse,
} from "@jini-ai/cms/public-http/middleware/theme-page-preview";

import { findTheme, renderStaticPage, renderStaticPartial, type DiscoveredTheme } from "#src/features/theme/index";
import { listPublishedPosts } from "#src/features/post/index";
import { authorizeThemeSetPermission } from "../../admin-http/routes/themes/explore.js";
import { requireAdminSession } from "../../admin-http/dev-auth.js";
import { failureReporterOf, reportServerFailure } from "#src/server/inbound/shared/admin-failure";
import type { RouteDeps } from "#src/server/routes/types";
import { renderSite } from "../http/site/render-site.js";
import { resolveMediaTransformVersionsForRender, resolveMediaAssetMetadataForRender } from "../routes/site/pages/render-context/media-metadata.js";
import { resolveWidgetsForRender, resolveHtmlEmbedsForRender } from "../routes/site/pages/render-context/widgets.js";
import { resolveSiteTitleForRender, resolveSiteTimeZoneForRender } from "../routes/site/pages/render-context/site-title.js";

/**
 * @file Express adapter for the theme Explore preview routes (`/theme-explore/{themeId}/{pageId}`,
 * `/theme-explore/{themeId}/partial/{partialId}`, `/theme-explore/{themeId}/template/{templateId}`).
 * The decisions — lookups, tier checks, which renderer answers, the response each refusal or render
 * writes, why the static routes are ungated and the templated one is gated — live in
 * `@jini-ai/cms/public-http/middleware/theme-page-preview`. This file keeps the host side: the route
 * table, the admin-session + `theme.set` gate on the templated route, the failure reporter, and the
 * bindings of Tovu's theme loader, post reader and render cluster into that module's deps.
 *
 * Reads `deps.themes` directly rather than through a `getThemes()` indirection: `rescanThemes`
 * (`features/theme/theme.ts`) mutates that array IN PLACE (`themes.length = 0; themes.push(...)`),
 * never replaces the reference, so a theme downloaded after boot is previewable without a restart
 * exactly the same way a plain field read would be.
 */

/** Writes a preview answer: status, each header in order, then the content type and body. */
function sendPreview(res: Response, response: ThemePreviewResponse): void {
  res.status(response.status);
  for (const [name, value] of response.headers) res.set(name, value);
  res.type(response.type).send(response.body);
}

function themeLookup(deps: RouteDeps): FindPreviewTheme<DiscoveredTheme> {
  return ({ themeId }) => findTheme({ themes: deps.themes, id: themeId });
}

export function registerThemePagePreview({ app, deps }: { app: Express; deps: RouteDeps }, _optional: Record<string, never> = {}): void {
  registerStaticPagePreview(app, deps);
  registerStaticPartialPreview(app, deps);
  registerTemplatedPreview(app, deps);
}

function registerStaticPagePreview(app: Express, deps: RouteDeps): void {
  app.get("/theme-explore/:themeId/:pageId", (req: Request, res: Response) => {
    const themeId = String(req.params.themeId ?? "");
    const pageId = String(req.params.pageId ?? "");
    sendPreview(res, staticThemePagePreview({ themeId, pageId, deps: { findTheme: themeLookup(deps), renderStaticPage, renderStaticPartial } }));
  });
}

function registerStaticPartialPreview(app: Express, deps: RouteDeps): void {
  app.get("/theme-explore/:themeId/partial/:partialId", (req: Request, res: Response) => {
    const themeId = String(req.params.themeId ?? "");
    const partialId = String(req.params.partialId ?? "");
    sendPreview(res, staticThemePartialPreview({ themeId, partialId, deps: { findTheme: themeLookup(deps), renderStaticPage, renderStaticPartial } }));
  });
}

// Templated (`.liquid`) theme preview — see the Jini module's header for why this route, unlike its
// two siblings above, is gated. `requireAdminSession` is applied as route-scoped middleware (not a
// blanket mount over this whole file) so the two static-tier routes above stay exactly as ungated
// as they always were.
function registerTemplatedPreview(app: Express, deps: RouteDeps): void {
  app.get(
    "/theme-explore/:themeId/template/:templateId",
    requireAdminSession(deps),
    (req: Request, res: Response) => renderTemplatedPreview({ req, res, deps })
  );
}

async function renderTemplatedPreview(required: { req: Request; res: Response; deps: RouteDeps }, _optional = {}): Promise<void> {
  const { req, res, deps } = required;
  try {
    if (!(await authorizeThemeSetPermission({ deps, res }))) return;

    const themeId = String(req.params.themeId ?? "");
    const templateId = String(req.params.templateId ?? "");
    sendPreview(res, await templatedThemePagePreview({ themeId, templateId, deps: templatedPreviewDeps(deps) }));
  } catch (error) {
    const { errorId } = reportServerFailure({ error, operation: "theme-preview:render" }, { reporter: failureReporterOf({ res }) });
    sendPreview(res, templatedPreviewFailureResponse({ errorId }));
  }
}

/** Tovu's published-post reader and render cluster, bound to this workspace for the templated preview. */
function templatedPreviewDeps(deps: RouteDeps) {
  return {
    findTheme: themeLookup(deps),
    listPublishedPosts: () => listPublishedPosts({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId } }),
    resolveWidgets: ({ theme }: { theme: DiscoveredTheme }, optional: Parameters<typeof resolveWidgetsForRender>[1]) =>
      resolveWidgetsForRender({ deps, theme }, optional),
    resolveMediaTransformVersions: () => resolveMediaTransformVersionsForRender(deps),
    resolveMediaAssetMetadata: ({ post }: Pick<Parameters<typeof resolveMediaAssetMetadataForRender>[0], "post">) =>
      resolveMediaAssetMetadataForRender({ deps, post }),
    resolveHtmlEmbeds: ({ post }: Pick<Parameters<typeof resolveHtmlEmbedsForRender>[0], "post">) => resolveHtmlEmbedsForRender({ deps, post }),
    resolveSiteTitle: () => resolveSiteTitleForRender(deps),
    resolveSiteTimeZone: () => resolveSiteTimeZoneForRender(deps),
    renderSite,
  };
}
