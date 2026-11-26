/** Product binding: plugin admission belongs to Jini's host; placement uses the shared
 * partial marker parser/expander. No CMS widget registry or resolver is replaced. */
import { renderPluginWidgetPartials } from "@jini-ai/plugins/runtime/widget-partials";
import { markersOfType, PARTIAL_MARKER_TYPE, expandPartials } from "@jini-ai/cms/widgets/markers";
import { validateServerWidgetFragment } from "@jini-ai/cms/widgets/html";
import { DEFAULT_THEME_SLOTS } from "@jini-ai/cms/themes/theme-slots";
import { readRequestCookie } from "#src/server/http/request-cookie";
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { addPluginExportHostsToResponse, resolveVisitorPagePolicy, sendPublicPage as sendPage, type PerVisitorResponse } from "@jini-ai/cms/public-http/routes/site/pages/response";
import { CONFIG_ID } from "@jini-ai/cookie-consent";
import { hasConsentGatedScripts } from "@jini-ai/cookie-consent/site/pre-consent-cache";
import { decodeFormSubmissionResultFromQuery } from "@jini-ai/cms/forms/result-query";
import { injectFormSubmissionResultIntoHtml } from "@jini-ai/cms/forms/result-html";
import { FORM_FEEDBACK, FORM_RESULT_MARKUP } from "../../../http/site/form-feedback-policy.js";
import { decodeFormFlashCookieValue } from "@jini-ai/cms/forms/result-flash";
import { FORM_FLASH_COOKIE_NAME, FORM_RESULT_QUERY_KEYS, MEMBER_AUTH_NAMES, MEMBER_AUTH_SCRIPT_MARKER } from "../../../http/site/form-wire-policy.js";
import { markOffSiteLinksOpenInNewTab } from "@jini-ai/cms/presentation/html";
import { injectMemberAuthScript } from "@jini-ai/cms/public-http/http/site/member-auth-script";
import { isHttpsRequest } from "../../../../../../platform/express/public-origin.js";
import { MEMBER_SESSION_COOKIE } from "../../../http/members.js";
import type { RouteDeps } from "#src/server/routes/types";
import { listingState } from "@jini-ai/cms/public-http/routes/site/pages/listing/listing-state";
import { preConsentCacheControl } from "./pre-consent-cache.js";
import { isStaticExportRequest, CACHE_CONTROL_PRIVATE_STATIC_EXPORT, CACHE_CONTROL_PUBLIC_PAGE, CACHE_CONTROL_PRIVATE_FORM_RESULT, CACHE_CONTROL_PRIVATE_MEMBER_RESPONSE } from "./request-policy.js";

/**
 * Resolves everything about this request that makes its response PER-VISITOR rather than shared:
 * the {@link FormSubmissionRedirectResult} to splice into the HTML, if any, AND the one
 * `Cache-Control` directive the response must therefore send.
 *
 * The form half: the query-string result (`decodeFormSubmissionResultFromQuery`) plus, for a
 * `"validation"` result, the same-slug flash cookie's field values (`mergeFormFlashIntoResult`) so
 * the OTHER fields the visitor already typed survive the Post/Redirect/Get round trip instead of
 * coming back wiped (2026-08-31 fix). The flash cookie is READ-ONCE: whether or not one was present,
 * it is cleared on `res` right here, in the same response that reads it.
 *
 * Resolved ONCE per request and threaded to every render branch — the same "compute once, thread to
 * every branch" shape `siteAssistantEnabled` already uses on the `/:slug` handler (ADR-054). That is
 * load-bearing for the header, not just tidy: this is the single place that knows whether ANY
 * per-visitor state was in play, so no render branch can splice per-visitor content in and then pick
 * its own directive independently. See {@link CACHE_CONTROL_PRIVATE_FORM_RESULT} for the defect that
 * split ownership produced the first time.
 *
 * Named for what it resolves, not for forms alone (was `resolveFormSubmissionResult`): the
 * member-session arm below is a second, entirely independent per-visitor trigger, and a request may
 * carry both cookies at once.
 *
 * @complexity O(1) plus the bounded cost already documented on the functions it calls.
 */
export const resolvePerVisitorResponse = ({ req, res }: { req: Request; res: Response }, _optional: Record<string, never> = {}): PerVisitorResponse =>
  resolveVisitorPagePolicy({
    queryResult: decodeFormSubmissionResultFromQuery({ query: req.query, keys: FORM_RESULT_QUERY_KEYS }),
    flash: decodeFormFlashCookieValue({ raw: readRequestCookie({ request: req, name: FORM_FLASH_COOKIE_NAME }) }),
/** Clears the validation flash cookie (2026-08-31 field-wipe fix) — read-once contract: once THIS
 *  GET has read it, a later plain reload of the same page must NOT resurrect the same stale values.
 *  Attributes mirror what `forms-submit.ts`'s `setFormFlashCookie` set it with; matching them isn't
 *  required for the browser to recognize this as the same cookie (only name+Path are), but keeps the
 *  set/clear pair symmetric, same as `dev-auth.ts`'s own `setSessionCookie`/`clearSessionCookie`. */
    clearFlash: () => void res.clearCookie(FORM_FLASH_COOKIE_NAME, { httpOnly: true, path: "/", sameSite: "lax", secure: isHttpsRequest(req) }),
    memberCookiePresent: () => readRequestCookie({ request: req, name: MEMBER_SESSION_COOKIE }) !== undefined,
    staticExport: () => isStaticExportRequest(req),
    cache: { form: CACHE_CONTROL_PRIVATE_FORM_RESULT, member: CACHE_CONTROL_PRIVATE_MEMBER_RESPONSE, staticExport: CACHE_CONTROL_PRIVATE_STATIC_EXPORT, public: CACHE_CONTROL_PUBLIC_PAGE },
  });

/**
 * The one place every page/post response in this file finalizes its assembled HTML before it reaches
 * a browser — every `res...send(...)` call site below routes through this instead of composing
 * {@link markOffSiteLinksOpenInNewTab} and {@link injectFormSubmissionResultIntoHtml} by hand, so
 * both treatments are applied identically regardless of which theme tier (static/declarative/
 * templated/handlebars), or which of home/page/post/marketing/bare-page branch, produced `html`.
 *
 * Owner rule (2026-09-24): "links should open a new tab" — implemented generically here, at the
 * server's one HTML-finalization step, rather than requiring every theme or authored page to add
 * `target="_blank"` to each individual off-site link. `req.hostname` is Express's own already-parsed,
 * port-free Host value (synchronous — no additional I/O beyond what every call site already has in
 * scope), used to tell an off-site link apart from an absolute link back to this same site.
 *
 * Each form also gets this response's own `_attempt` token ({@link injectFormAttemptTokens}) so a
 * double-clicked Send stores one submission. Not under the static-export marker: an exported file is
 * served unchanged to every visitor and re-published on every export, so a token baked into it would
 * be shared and would change every exported page on every publish; those forms post without one.
 *
 * @complexity O(html length) — one pass for each of the three transforms it composes.
 */
/** Sends a finished public page: this request's `Cache-Control`, the HTML type, and the finalized
 *  body (a see-more batch request gets just its batch). */
export const sendPublicPage = ({ req, res, deps, html, perVisitor }: {
  req: Request; res: Response; deps: RouteDeps; html: string; perVisitor: PerVisitorResponse;
}): Promise<void> => sendPage({
  html, perVisitor,
  preConsentCacheControl: ({ html, cacheControl }) => preConsentCacheControl({ html, request: req, cacheControl }),
  hasConsentGatedScripts: ({ html }) => hasConsentGatedScripts({ html, configId: CONFIG_ID }),
  writer: { vary: name => void res.vary(name), set: (name, value) => void res.set(name, value), type: value => void res.type(value), send: html => void res.send(html) },
  ports: {
    listingBatchBody: ({ html }) => listingState.listingBatchBody({ req, html }),
    assertListingPageServed: ({ html }) => listingState.assertListingPageServed({ req, html }),
    pluginHead: () => deps.pluginExportRender?.headHtml({}),
    addPluginHosts: () => addPluginExportHostsToResponse({ response: req.res, hosts: deps.pluginExportRender?.declaredHosts({}) }),
    hasWidgetPartials: () => Boolean(deps.pluginContributions),
    widgetPartials: ({ html }) => renderPluginWidgetPartials({ html, workspaceId: deps.workspaceId, contributions: deps.pluginContributions!, activationRepo: deps.pluginActivationRepo, render: {
      readNames: ({ html }) => markersOfType({ html, type: PARTIAL_MARKER_TYPE }).flatMap(marker => marker.id ? [marker.id] : []),
      validateHtml: validateServerWidgetFragment,
      expand: ({ html, partials, slots }) => expandPartials({ defaultSlots: DEFAULT_THEME_SLOTS, html, theme: { partials: { ...partials }, manifest: { slots } } }),
    } }),
    finishFormResult: ({ html, formResult }) => injectFormSubmissionResultIntoHtml({ html: markOffSiteLinksOpenInNewTab({ html, siteHost: req.hostname }), result: formResult, markup: FORM_RESULT_MARKUP, feedback: FORM_FEEDBACK }),
    staticExport: () => isStaticExportRequest(req),
    workspaceId: deps.workspaceId, randomUUID, nowMs: () => deps.clock.nowMs(), formSubmissionAttempts: () => deps.formSubmissionAttempts,
    memberAuthScript: ({ html }) => injectMemberAuthScript({ html, workspaceId: deps.workspaceId, marker: MEMBER_AUTH_SCRIPT_MARKER, names: MEMBER_AUTH_NAMES }),
  },
});
