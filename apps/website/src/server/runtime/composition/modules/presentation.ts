import { presentationGetRoute, type PresentationResponseFields } from "@jini-ai/cms/admin-http/routes/presentation/get";
import { themeRescanRoute } from "@jini-ai/cms/admin-http/routes/presentation/rescan-themes";
import { presentationPatchRoute, type PresentationPatchResponseFields } from "@jini-ai/cms/admin-http/routes/presentation/patch";
import { requestThemePreviewRefresh } from "@jini-ai/cms/themes/preview/refresh";
import { setActiveTheme } from "#src/features/presentation/index";
import { isReservedThemePreviewPath } from "#src/features/theme/preview-policy";
import { isPackageShippedTheme } from "@jini-ai/cms/themes/files/original-source";
import { applicableThemeTemplates } from "@jini-ai/cms/themes/template-applicability";
import type { HeadlessThemeSummary } from "@jini-ai/core/contracts/headless/contracts";
import { duplicateThemeIds, findStoredTheme, rescanThemes, ThemeStylingRequiredError, validThemeIds, writableThemeIds } from "#src/features/theme/index";
import { themeCardPreviewUrl } from "#src/features/theme/theme-preview-image";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { toAdminPresentationResponse } from "@jini-ai/cms/admin-http/http/presentation";
import type { ContentRouteDeps, ContentRouteRegistrar } from "./content.js";
import { registerAdminThemePreviewRoute } from "#src/server/inbound/admin-http/routes/themes/preview";
import { themePreviewServiceForHost } from "#src/server/runtime/lifecycle/theme-preview-host";

/**
 * @file The `presentation` admin registrars (RT-K1-adm-presentation-1).
 *
 * GET presentation and POST themes/rescan are Jini route specs
 * (`@jini-ai/cms/admin-http/routes/presentation/*`) mounted behind the admin ports. `ContentRouteDeps`
 * is read only here: each mount builds that route's own small deps object, binding the host's theme
 * discovery, preview host and presentation DTO as functions that read `deps` per request (a rescan
 * refills `deps.themes` in place, and tests reassign fields after registration).
 *
 * PATCH presentation answers an unexpected failure through `adminFailureResponse` with only its
 * operation, so its 500 copy is the operation-derived "The presentation setting operation could not
 * be completed." — not `sendAdminFailure`'s method/route copy ("…could not be saved."). Its mount
 * keeps that with `failureCopy: "operation"`.
 */

/** The two port fields every presentation mount passes. `authorize` is read per request, as the
 *  hand-written routes read `deps.authorize`, so a later reassignment of it is still honoured. */
function presentationPortDeps({ deps }: { deps: ContentRouteDeps }, _optional: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
}

/** Both routes asked `theme.set` through `authorizeDirectOrRespond` (never the publishing-credential
 *  override), so both mount `"direct"`, each with its own `sendAdminFailure` operation. */
function mountOptions(operation: string) {
  return { authorization: "direct" as const, failure: { operation, code: "INTERNAL_ERROR" } };
}

/** The card list's tier/apiVersion are copied verbatim from `DiscoveredTheme.manifest`, whose
 *  `ThemeTier` the wire's `HeadlessThemeTier` mirrors in lockstep; the spec only sees them as strings. */
function presentationResponse(fields: PresentationResponseFields) {
  return toAdminPresentationResponse({ ...fields, availableThemes: fields.availableThemes as HeadlessThemeSummary[] });
}

/** The GET's host collaborators, each bound to this request's `deps`. */
function presentationGetDeps({ deps }: { deps: ContentRouteDeps }, _optional: Record<string, never> = {}) {
  return {
    ...presentationPortDeps({ deps }),
    presentationRepo: deps.presentationRepo,
    themes: () => deps.themes,
    catalogThemeIds: () => validThemeIds({ themes: deps.themes }),
    findStoredTheme: ({ id }: { id: string }) => findStoredTheme({ themes: deps.themes, id }),
    isPackageShippedTheme: ({ manifest }: { manifest: { id: string; tier: string } }) => isPackageShippedTheme({ manifest, packageThemesRoot: deps.packageThemesDir }),
    // Captures of each theme's own render where this site can take them (see `routes/themes/preview.ts`).
    previewCapturesEnabled: () => deps.siteBinding !== undefined && themePreviewServiceForHost({ binding: deps.siteBinding }) !== undefined,
    themeCardPreviewUrl: ({ theme, capturesEnabled }: { theme: { dir: string; id: string; tier: string }; capturesEnabled: boolean }) =>
      themeCardPreviewUrl({ theme, workspaceId: deps.workspaceId }, { capturesEnabled }),
    toPresentationResponse: presentationResponse,
    applicableThemeTemplates,
  };
}

/**
 * GET presentation settings (active theme + available themes), gated by `theme.set`.
 * The image route behind every card URL this listing hands out is registered first, with it, so the
 * two cannot be mounted apart (and the route table keeps its order).
 */
export const registerAdminPresentationGetRoute: ContentRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  registerAdminThemePreviewRoute({ errors, app, deps });
  mountAdminJsonRoute({ errors, app, spec: presentationGetRoute, deps: presentationGetDeps({ deps }) }, mountOptions("routes/presentation/get"));
};

/** POST themes/rescan — re-runs discovery against the same themes root the host discovered from. */
export const registerAdminThemeRescanRoute: ContentRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  const rescanDeps = {
    ...presentationPortDeps({ deps }),
    rescanThemes: () => rescanThemes({ themes: deps.themes, dir: deps.themesDir }),
    catalogThemeIds: () => validThemeIds({ themes: deps.themes }),
    duplicateThemeIds: () => duplicateThemeIds({ themes: deps.themes }),
  };
  mountAdminJsonRoute({ errors, app, spec: themeRescanRoute, deps: rescanDeps }, mountOptions("routes/presentation/rescan-themes"));
};

/** The PATCH's host collaborators, each bound to this request's `deps` (tests reassign fields). */
function presentationPatchDeps({ deps }: { deps: ContentRouteDeps }, _optional: Record<string, never> = {}) {
  return {
    ...presentationPortDeps({ deps }),
    setActiveTheme: ({ activeThemeId, actorId }: { activeThemeId: string; actorId: string }) => setActiveTheme({
      deps: {
        repo: deps.presentationRepo, tracker: deps.tracker, clock: deps.clock,
        availableThemeIds: writableThemeIds(deps, { requestedThemeId: activeThemeId }),
      },
      input: { workspaceId: deps.workspaceId, activeThemeId },
    }, { actorId, source: "admin" }),
    isThemeStylingRequired: ({ err }: { err: unknown }) => err instanceof ThemeStylingRequiredError,
    themes: () => deps.themes,
    catalogThemeIds: () => validThemeIds({ themes: deps.themes }),
    findStoredTheme: ({ id }: { id: string }) => findStoredTheme({ themes: deps.themes, id }),
    requestThemePreviewRefresh: () => { requestThemePreviewRefresh({ themesDir: deps.themesDir, isReservedPath: isReservedThemePreviewPath }); },
    toPresentationResponse: (fields: PresentationPatchResponseFields) =>
      toAdminPresentationResponse({ ...fields, availableThemes: fields.availableThemes as HeadlessThemeSummary[] }),
  };
}

/** PATCH the active theme, gated by `theme.set` (`authorizeDirectOrRespond`, so `"direct"`). */
export const registerAdminPresentationPatchRoute: ContentRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  mountAdminJsonRoute(
    { errors, app, spec: presentationPatchRoute, deps: presentationPatchDeps({ deps }) },
    // No `code`: the hand-written route called `adminFailureResponse` with its operation only.
    { authorization: "direct", failure: { operation: "routes/presentation/patch-active-theme" }, failureCopy: "operation" },
  );
};
