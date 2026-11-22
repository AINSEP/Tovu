import type { NextFunction, Request } from "express";
import { listingState } from "./listing/listing-state.js";

/**
 * Set by `features/site-export/site-exporter.ts`'s `exportFetch` on every request its crawl makes
 * (static export AND static-publish, which runs the identical `exportSite` engine — see that
 * file's own doc). Kept as a literal string here rather than a shared import for the same reason
 * `render.ts`'s `SITE_ASSISTANT_MOUNT_ID` is duplicated across the render.ts/site-chat boundary:
 * `site-export` must never import from `server/inbound/**` (this file's sibling module-cycle
 * history), so there is no single module both sides could import this from without recreating that
 * exact cycle.
 */
const STATIC_EXPORT_REQUEST_HEADER = "x-tovu-static-export";

/**
 * Whether this request carries the exporter's {@link STATIC_EXPORT_REQUEST_HEADER} marker. The header
 * is public — any visitor can send it to the live server — so every response rendered under it must
 * also send {@link CACHE_CONTROL_PRIVATE_STATIC_EXPORT} instead of the shared-cacheable directive:
 * otherwise one crafted request would let a CDN store the widget-less body under the plain URL and
 * replay it to every visitor for the full `max-age` + `stale-while-revalidate` window.
 */
export function isStaticExportRequest(req: Pick<Request, "header">): boolean {
  return Boolean(req.header(STATIC_EXPORT_REQUEST_HEADER));
}

/** What a page response sends instead of {@link CACHE_CONTROL_PUBLIC_PAGE} when rendered under the
 *  static-export marker — see {@link isStaticExportRequest}. Same never-store literal and same
 *  "own named constant, independent reason" shape as the form/member directives below. */
export const CACHE_CONTROL_PRIVATE_STATIC_EXPORT = "private, no-store";

/**
 * Owner decision (TM-TOVU-2026-08-12-A request-cost audit, Phase 2 change 2 of 2). Applied to every
 * success response this file sends — home, the static-theme-page short-circuit, the template
 * branch, and the generic dynamic post render — because all four share the SAME cacheability
 * property the audit's deliverable A proved empirically: none of `resolveWidgetsForRender`/
 * `buildExtraHead`/`resolveStaticMenusForRender`/`renderViaTemplate`/`renderSite` even receive `req`
 * as an argument, so the output is identical for every anonymous visitor requesting the same URL —
 * confirmed by diffing real responses across different cookies/Accept-Language headers, not assumed.
 *
 * `max-age=60`: an edit becomes publicly visible within a minute. `stale-while-revalidate=300`: a
 * CDN can serve a slightly-stale copy while it revalidates in the background, absorbing traffic
 * spikes without a thundering-herd re-render. 5 minutes (rather than 60s) for the base `max-age` was
 * considered and rejected — long enough that an author fixing a typo would reasonably think their
 * edit hadn't saved.
 *
 * Deliberately NOT applied to error responses (404/500) in this file — a fresh render is generally
 * the same page again, but a 500 is exactly the response a CDN must never cache as if it were
 * durable, and 404 caching wasn't part of what the audit measured or the owner decided on.
 */
export const CACHE_CONTROL_PUBLIC_PAGE = "public, max-age=60, stale-while-revalidate=300";

/**
 * What those same four responses send INSTEAD of {@link CACHE_CONTROL_PUBLIC_PAGE} when the body
 * carries THIS visitor's Post/Redirect/Get form state — {@link resolvePerVisitorResponse} decides
 * which directive applies, per request, for this and every other per-visitor trigger.
 *
 * The cacheability property {@link CACHE_CONTROL_PUBLIC_PAGE} documents ("identical for every
 * anonymous visitor requesting the same URL") holds only up to the point
 * `injectFormSubmissionResultIntoHtml` splices a result in. From there the body carries the
 * visitor's own re-populated field text, which reached us through the private `HttpOnly`
 * `tovu_form_flash` cookie precisely so it would never sit in a shareable URL (2026-08-31 fix).
 * Sending that body as `public` with no `Vary` would move the exposure rather than close it: a CDN
 * or proxy may serve visitor A's name/email/message to visitor B.
 *
 * `no-store`, not `Vary: Cookie`. `Vary` alone closes the shared-cache leak but leaves the response
 * storable, which defeats the flash cookie's READ-ONCE contract by a second route: the cookie is
 * cleared with `Max-Age=0` in this very response (`clearFormFlashCookie`), but a cached copy of the
 * body would keep re-serving the same values for the full `max-age` under a value-free URL — a
 * back-navigation or re-click resurrecting exactly what the clear was meant to retire.
 *
 * Deliberately NOT blanket: a request carrying no form state is the ordinary case and keeps the
 * public directive, so this costs nothing for normal site traffic.
 */
export const CACHE_CONTROL_PRIVATE_FORM_RESULT = "private, no-store";

/**
 * The SECOND thing those same four responses send INSTEAD of {@link CACHE_CONTROL_PUBLIC_PAGE}:
 * this request carried a `tovu_member_session` cookie, so the body was rendered with THIS visitor's
 * member entitlements in hand (2026-09-02, ADR-030 §4 gating).
 *
 * A real hole opened by the member gating, not one it inherited. {@link CACHE_CONTROL_PUBLIC_PAGE}'s
 * own doc block rests on a property that was empirically true when it was written — "the output is
 * identical for every anonymous visitor requesting the same URL," proven by diffing real responses
 * across different cookies. `filterVisiblePosts` falsifies exactly that property: the `posts` list
 * `renderSite` prints into the home grid and the "more dispatches" region is now cookie-dependent, so
 * a shared cache storing a signed-in member's copy would replay gated titles and links to anonymous
 * visitors for the full `max-age` (and five more minutes stale). That is the precise exposure gating
 * the listing exists to close — reintroduced by the CDN rather than by the renderer.
 *
 * Deliberately the SAME literal as {@link CACHE_CONTROL_PRIVATE_FORM_RESULT}, and deliberately its
 * own named constant rather than a reuse of that one: the two decisions are independent (a visitor
 * can carry either cookie, both, or neither) and read as different reasons at the call site, but both
 * mean "never store this." That constant's own doc block already reasons through the `no-store` vs
 * `Vary: Cookie` choice in full and it applies here unchanged — `Vary: Cookie` closes the
 * cross-visitor leak but leaves the response STORABLE, which is not enough for a body whose contents
 * are an entitlement decision.
 *
 * Triggered on cookie PRESENCE, never on "the filter actually removed something." A
 * content-dependent trigger would make the header itself a side channel — an attacker could learn
 * whether gated content exists at a URL by watching the directive flip — and would be fragile besides
 * (a member with nothing filtered on this request still received a per-visitor body). A visitor
 * carrying no member cookie is the ordinary case and keeps {@link CACHE_CONTROL_PUBLIC_PAGE}
 * byte-for-byte, so normal site traffic pays nothing for this.
 */
export const CACHE_CONTROL_PRIVATE_MEMBER_RESPONSE = "private, no-store";

/**
 * `GET /:slug`'s own slug-shaped-request gate: strips an accepted trailing `.html`, then rejects
 * anything that isn't a clean single-segment site slug — calling `next()` and returning
 * `undefined` so the caller falls through to API/static/404 handling exactly as Express's own
 * routing would if this middleware weren't here. Returns the cleaned slug string otherwise.
 */
export function resolveRequestedSlug({ req, next }: { req: Request; next: NextFunction }, _optional: Record<string, never> = {}): string | undefined {
  // A trailing .html is accepted and stripped so /blog.html resolves identically to /blog — a
  // static theme's own page files are still named foo.html on disk, and someone can always type
  // or bookmark the literal filename even though rewritePageLinks() only ever emits clean routes.
  const slug = String(req.params.slug ?? "").replace(/\.html$/, "");
  // Not a site page — let API/static/404 handling continue.
  if (!slug.match(/^[a-z0-9-]+$/) || slug === "admin" || slug === "api") {
    next();
    return undefined;
  }
  return slug;
}

/** The path redirect rules are matched against: a `/page/<n>` request's own URL, never the page its
 *  rewrite points at (A-1, 2026-10-22). Matching the rewritten path made a rule on `/old/page/3` (a
 *  WordPress import's numbered archive) never fire, and a rule on `/old` catch every `/old/page/<n>`. */
export function redirectLookupPath({ req }: { req: Request }, _optional: Record<string, never> = {}): string {
  return listingState.listingPageRequestOf({ req })?.requestPath ?? req.path;
}
