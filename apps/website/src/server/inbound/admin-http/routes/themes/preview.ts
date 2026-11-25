import type { Express } from "express";
import {
  themePreviewRoute,
  type ThemePreviewCaptureQueue,
  type ThemePreviewRouteDeps as ThemePreviewSpecDeps,
} from "@jini-ai/cms/admin-http/routes/themes/preview";
import { servingAddressOf } from "@jini-ai/cms/admin-http/routes/sites/site-previews";
import type { RouteDeps } from "#src/server/routes/types";
import { SITE_PREVIEW_CONTENT_TYPE, type SitePreviewService } from "#src/features/sites/index";
import { themeContentVersion, themePreviewImage } from "#src/features/theme/theme-preview-image";
import { themePreviewServiceForHost } from "#src/server/runtime/lifecycle/theme-preview-host";
import { mountAdminRawRoute } from "../../admin-raw-route-ports.js";

/**
 * @file `GET /api/admin/v1/workspaces/:ws/themes/:themeId/preview`: the host binding of Jini's
 * `themePreviewRoute` (see its file doc for why the route exists and its wire contract). This file owns
 * what only this host knows: the capture queue per served site (`theme-preview-host.ts`), the theme
 * content version and shipped-image lookups, the preview store's media type, and the request's own
 * serving address, bound per request by `requestDeps`.
 */

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
  /** Resolves the capture queue from `siteBinding` when `themePreviews` is left `undefined`. */
  previewServiceForHost?: (required: { binding: NonNullable<RouteDeps["siteBinding"]> }) => SitePreviewService | undefined;
}

/** Placeholder for a request-bound dep at mount time; `requestDeps` replaces it on every request. */
const boundPerRequest = (): never => { throw new Error("bound per request by requestDeps"); };

/**
 * @complexity O(t + f) per request for t themes and the theme's f files (one tree walk), plus at
 *   most one capture (~1–2 s) when the theme changed since the last one.
 */
export function registerAdminThemePreviewRoute(
  { app, deps }: { app: Express; deps: ThemePreviewRouteDeps },
  {
    waitMs = 20_000, contentVersion = themeContentVersion, shippedImage = themePreviewImage,
    previewServiceForHost = themePreviewServiceForHost,
  }: ThemePreviewRouteOptions = {},
): void {
  let previews = deps.themePreviews ?? undefined;
  if (deps.themePreviews === undefined && deps.siteBinding) previews = previewServiceForHost({ binding: deps.siteBinding });
  const mounted: ThemePreviewSpecDeps & Pick<RouteDeps, "workspaceId" | "authorize"> = {
    workspaceId: deps.workspaceId,
    authorize: (params) => deps.authorize(params),
    themes: deps.themes,
    previews: previews as ThemePreviewCaptureQueue | undefined,
    servingAddress: boundPerRequest,
    contentVersion, shippedImage, waitMs, previewContentType: SITE_PREVIEW_CONTENT_TYPE,
  };
  mountAdminRawRoute({ app, spec: themePreviewRoute, deps: mounted }, {
    failure: { operation: "routes/themes/preview", code: "INTERNAL_ERROR" },
    // The live theme list is read when the request arrives, as the hand-written route read `deps.themes`.
    requestDeps: ({ req, deps: base }) => ({ ...base, themes: deps.themes, servingAddress: () => servingAddressOf({ req }) }),
  });
}
