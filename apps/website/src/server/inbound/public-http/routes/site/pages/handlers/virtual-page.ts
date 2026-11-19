import type { Request, Response } from "express";
import type { PublicPostRecord as PostRecord } from "#src/features/post/contracts";
import { resolveRenderThemeId } from "../../../../middleware/render-theme-override.js";
// Keep request rendering separate from theme installation, imports, and agent tools.
import { resolveTemplateBranchChoice } from "#src/features/theme/static-template-choice";
import { NO_THEME_ID, resolveActiveTheme } from "#src/features/theme/active-theme";
import type { RouteDeps } from "#src/server/routes/types";
import { withListingBatch } from "../listing/listing-batch.js";
import { resolveSiteAssistantWidgetForRequest } from "../render-context/widgets.js";
import { resolveStaticMenusForRender } from "../render-context/static-menus.js";
import { resolvePerVisitorResponse, sendPublicPage } from "../response.js";
import { renderViaTemplate } from "../template-render.js";
import { renderGenericPostPage } from "./post.js";

/** Sends the shared "no themes installed" 500 both site routes fall back to when
 * `resolveActiveTheme` finds nothing — a workspace with zero discovered themes at all (a fresh
 * boot before the default theme seed, or every theme dir failing to parse). Not a per-request
 * condition either route can recover from, so both `GET /` and `GET /:slug` short-circuit here
 * identically. */
export function sendNoThemesInstalled(res: Response): void {
  res.status(500).type("html").send("<h1>No themes installed</h1>");
}

/**
 * The one place either site route's outer catch records an unexpected fault before sending the
 * branded `<h1>Site error</h1>` 500. `GET /`'s catch used to be a literal bare `catch {}` and
 * `GET /:slug`'s discarded everything that was not a `PostNotFoundError`, so a site could 500 on
 * `/` and `/pricing` at once with no record anywhere of what had actually failed. `products.ts`'s
 * own file header records what that cost in practice: a missing `presentation_settings` row 500ed
 * one public route for as long as it did precisely because the catch that absorbed it said nothing,
 * while the sibling route silently degraded past the same missing row.
 *
 * REPORTING, not rethrowing, is the fix here, and the difference is not cosmetic:
 *  - Express 4 (this app's version) does not forward a rejected `async` handler to its error
 *    middleware — that is Express 5 behaviour. A `throw` from these catches escapes as an unhandled
 *    rejection, which Node terminates the process for by default, so rethrowing would trade one
 *    broken URL for every URL on the site, including the ones rendering perfectly.
 *  - The 500 really is per-request-recoverable: nothing in this render path is cached between
 *    requests (theme, settings, menus, widgets and content are all re-resolved per request), so a
 *    fault on one render implies nothing about the next one. Failing the process closed would be
 *    strictly worse than failing this response closed.
 * Only the diagnosis was ever missing, so the diagnosis is all this adds — the visitor-facing body
 * stays the same opaque `<h1>Site error</h1>`, deliberately: an internal message or stack must not
 * reach an anonymous visitor.
 *
 * `console.error` matches what this same route tree's other handlers already use
 * (`comments-submit.ts`, `payments-webhook.ts`). `RouteDeps` carries no logger port to inject, and
 * `platform/observability` deliberately exposes one method (`trackRequest`) with no error channel —
 * see its `ports.ts` header.
 *
 * @param detail the route PATTERN plus, at most, values already validated to a bounded shape —
 *   never a raw request URL. The only request-derived value any caller passes is `GET /:slug`'s
 *   `slug`, which `resolveRequestedSlug` has already matched against `/^[a-z0-9-]+$/`, so it can
 *   carry neither unbounded log volume nor a newline.
 * @param err whatever the catch received, passed through unchanged so the stack survives.
 * @complexity O(1).
 */
export function reportSiteRenderFault({ detail, err }: { detail: string; err: unknown }, _optional = {}): void {
  console.error(`[site/pages] ${detail}`, err);
}

/**
 * Serve a page that has no row of its own (core's member sign-in pages, `member-pages.ts`) through
 * the same path an html-format Page takes, so it wears the active theme's page template, header and
 * footer on every tier. `post` lives only in memory: on the template branch its body reaches the
 * content slot through `renderViaTemplate`'s pending-body override (keyed to its id, the one the
 * admin preview uses), so no repo lookup runs for it. Errors propagate to the caller.
 */
export async function serveVirtualPage({ req, res, deps, post }: {
  req: Request; res: Response; deps: RouteDeps; post: PostRecord;
}): Promise<void> {
  deps = withListingBatch({ deps, req });
  const [activeThemeId, siteAssistantEnabled] = await Promise.all([
    resolveRenderThemeId(res, deps),
    resolveSiteAssistantWidgetForRequest({ request: req, deps }),
  ]);
  const resolved = resolveActiveTheme({ deps, activeThemeId });
  if (resolved === null) return sendNoThemesInstalled(res);
  const theme = resolved === NO_THEME_ID ? null : resolved;
  const branch = theme ? resolveTemplateBranchChoice({ theme, post }) : { kind: "ineligible" as const };
  const perVisitor = resolvePerVisitorResponse({ req, res });
  const previewPost = branch.kind === "page-shell" ? { ...post, templateChoice: branch.templateChoice } : post;
  const html = theme && branch.kind !== "ineligible"
    ? await renderViaTemplate({ deps, theme, post: previewPost, staticMenus: await resolveStaticMenusForRender({ deps, theme, currentPath: req.path }) }, { pendingBodyJson: undefined, pendingBodyHtml: post.bodyHtml ?? "", extraHead: undefined, siteAssistantEnabled })
    : await renderGenericPostPage({ deps, theme, post, posts: [], siteAssistantEnabled });
  await sendPublicPage({ req, res, deps, html, perVisitor });
  return undefined;
}
