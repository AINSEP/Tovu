import { addDeclaredHostsToPolicy, REPORT_ONLY_HEADER } from "#src/contracts/core/public-page-security-headers";
import { renderPluginWidgetPartials } from "#src/features/plugin-runtime/widget-partials";
import { readRequestCookie } from "#src/server/http/request-cookie";
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { injectListingScript } from "@jini-ai/cms/listing";
import { decodeFormSubmissionResultFromQuery } from "@jini-ai/cms/forms/result-query";
import { injectFormSubmissionResultIntoHtml } from "@jini-ai/cms/forms/result-html";
import { FORM_FEEDBACK, FORM_RESULT_MARKUP } from "../../../http/site/form-feedback-policy.js";
import { decodeFormFlashCookieValue, mergeFormFlashIntoResult } from "@jini-ai/cms/forms/result-flash";
import { FORM_FLASH_COOKIE_NAME, FORM_RESULT_QUERY_KEYS } from "../../../http/site/form-wire-policy.js";
import type { FormSubmissionRedirectResult } from "@jini-ai/cms/forms";
import { injectExtraHeadIntoStaticPage } from "@jini-ai/cms/presentation/html";
import { markOffSiteLinksOpenInNewTab } from "@jini-ai/cms/presentation/html";
import { injectFormAttemptTokens } from "@jini-ai/cms/forms/form-controls";
import { injectMemberAuthScript } from "../../../http/site/member-auth-script.js";
import { isHttpsRequest } from "../../../../../../platform/express/public-origin.js";
import { MEMBER_SESSION_COOKIE } from "../../../http/members.js";
import type { RouteDeps } from "#src/server/routes/types";
import { listingBatchBody, assertListingPageServed } from "./listing/listing-state.js";
import { isStaticExportRequest, CACHE_CONTROL_PRIVATE_STATIC_EXPORT, CACHE_CONTROL_PUBLIC_PAGE, CACHE_CONTROL_PRIVATE_FORM_RESULT, CACHE_CONTROL_PRIVATE_MEMBER_RESPONSE } from "./request-policy.js";

/** Clears the validation flash cookie (2026-08-31 field-wipe fix) — read-once contract: once THIS
 *  GET has read it, a later plain reload of the same page must NOT resurrect the same stale values.
 *  Attributes mirror what `forms-submit.ts`'s `setFormFlashCookie` set it with; matching them isn't
 *  required for the browser to recognize this as the same cookie (only name+Path are), but keeps the
 *  set/clear pair symmetric, same as `dev-auth.ts`'s own `setSessionCookie`/`clearSessionCookie`. */
function clearFormFlashCookie(req: Request, res: Response): void {
  res.clearCookie(FORM_FLASH_COOKIE_NAME, { httpOnly: true, path: "/", sameSite: "lax", secure: isHttpsRequest(req) });
}

/** {@link resolvePerVisitorResponse}'s two outputs: the form result to splice into the HTML (if
 *  any), and the `Cache-Control` this response must therefore send. Returned together, from the one
 *  place that knows whether ANY per-visitor state was in play, so no render branch can splice
 *  per-visitor content in and then pick the header independently — the defect this shape replaces
 *  ({@link CACHE_CONTROL_PRIVATE_FORM_RESULT} documents it). */
interface PerVisitorResponse {
  readonly result: FormSubmissionRedirectResult | undefined;
  readonly cacheControl: string;
}

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
export function resolvePerVisitorResponse({ req, res }: { req: Request; res: Response }, _optional: Record<string, never> = {}): PerVisitorResponse {
  const queryResult = decodeFormSubmissionResultFromQuery({ query: req.query, keys: FORM_RESULT_QUERY_KEYS });
  const flash = decodeFormFlashCookieValue({ raw: readRequestCookie({ request: req, name: FORM_FLASH_COOKIE_NAME }) });
  if (flash) clearFormFlashCookie(req, res);
  const result = mergeFormFlashIntoResult({ result: queryResult, flash });
  // Both arms matter, and neither implies the other. `result` covers a PRG landing whose body gets
  // rewritten. `flash` covers the case where the merge dropped it (no `form_*` params, or a
  // different form's slug) yet a read-once cookie was still consumed and cleared ON THIS RESPONSE —
  // storing that response would let a shared cache replay the clearing `Set-Cookie` to other
  // visitors and outlive the cookie it retired.
  if (result !== undefined || flash !== undefined) {
    return { result, cacheControl: CACHE_CONTROL_PRIVATE_FORM_RESULT };
  }
  // The member arm, checked on cookie PRESENCE alone — see
  // {@link CACHE_CONTROL_PRIVATE_MEMBER_RESPONSE}'s own doc for why not on "the filter dropped
  // something." Ordering between the two private arms is cosmetic (both resolve to the same
  // never-store literal); what matters is that `public` is reachable ONLY when NEITHER trigger
  // fired, so a request carrying both cookies can never fall back to it through either path.
  if (readRequestCookie({ request: req, name: MEMBER_SESSION_COOKIE }) !== undefined) {
    return { result, cacheControl: CACHE_CONTROL_PRIVATE_MEMBER_RESPONSE };
  }
  // The static-export marker changes the body (no visitor-chat widget), so it is a per-visitor
  // trigger too — see {@link isStaticExportRequest}.
  if (isStaticExportRequest(req)) {
    return { result, cacheControl: CACHE_CONTROL_PRIVATE_STATIC_EXPORT };
  }
  return { result, cacheControl: CACHE_CONTROL_PUBLIC_PAGE };
}

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
/** The page's report-only policy names what its plugin exports declared; nothing is added otherwise. O(hosts). */
function addPluginExportHostsToResponse({ req, hosts }: { req: Request; hosts: import("#src/contracts/core/public-page-security-headers").DeclaredPageHosts | undefined }, _optional: Record<string, never> = {}): void {
  const response = req.res;
  const policy = response?.getHeader?.(REPORT_ONLY_HEADER);
  if (hosts && response && typeof policy === "string") response.setHeader(REPORT_ONLY_HEADER, addDeclaredHostsToPolicy({ policy, hosts }));
}

async function finalizePublicPageHtml({ req, html, formResult, deps }: { req: Request; html: string; formResult: FormSubmissionRedirectResult | undefined; deps: RouteDeps }, _optional = {}): Promise<string> {
  const batchBody = listingBatchBody({ req, html });
  if (batchBody !== undefined) return batchBody;
  assertListingPageServed({ req, html });
  html = injectExtraHeadIntoStaticPage({ html, extraHead: deps.pluginExportRender?.headHtml({}) });
  addPluginExportHostsToResponse({ req, hosts: deps.pluginExportRender?.declaredHosts({}) });
  html = injectListingScript({ html });
  if (deps.pluginContributions) html = await renderPluginWidgetPartials({ html, workspaceId: deps.workspaceId, contributions: deps.pluginContributions, activationRepo: deps.pluginActivationRepo });
  const finished = injectFormSubmissionResultIntoHtml({ html: markOffSiteLinksOpenInNewTab({ html, siteHost: req.hostname }), result: formResult, markup: FORM_RESULT_MARKUP, feedback: FORM_FEEDBACK });
  // Member sign-in needs this server's API, which an exported file never has: its header keeps the
  // theme's plain "Sign in" link.
  if (isStaticExportRequest(req)) return finished;
  return injectMemberAuthScript({ html: injectFormAttemptTokens({ html: finished, newToken: ({ slug }) => {
    const attemptToken = randomUUID();
    // The composition supplies this same process-lifetime owner to submission. Static exports
    // returned above never issue tokens; rendering observes time without claiming a submission.
    deps.formSubmissionAttempts?.issue({ workspaceId: deps.workspaceId, slug, attemptToken, issuedAtMs: deps.clock.nowMs() }, {});
    return attemptToken;
  } }, {}), workspaceId: deps.workspaceId });
}

/** Sends a finished public page: this request's `Cache-Control`, the HTML type, and the finalized
 *  body (a see-more batch request gets just its batch). */
export async function sendPublicPage({ req, res, deps, html, perVisitor }: {
  req: Request; res: Response; deps: RouteDeps; html: string; perVisitor: PerVisitorResponse;
}): Promise<void> {
  // Live comments never enter browser/CDN caches; approval, selection and disable take effect on the next request.
  const cacheControl = html.includes('data-comments-surface') ? 'private, no-store' : perVisitor.cacheControl;
  res.set("Cache-Control", cacheControl).type("html").send(await finalizePublicPageHtml({ req, html, formResult: perVisitor.result, deps }));
}
