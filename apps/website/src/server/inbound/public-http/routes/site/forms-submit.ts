import { RESERVED_SEGMENTS } from "#src/platform/routing/reserved-paths";
import express, { type Express } from "express";
import { createFormSubmitHandler } from "@jini-ai/cms/forms/express";
import { submitForm, type SubmitFormDeps } from "#src/features/forms/index";
import { siteRelativeTargetReason } from "@jini-ai/cms/redirects";
import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import { isHttpsRequest } from "../oauth/public-origin.js";
import { clearFormSubmissionResultQueryParams, encodeFormSubmissionResultQuery,
  encodeFormFlashCookieValue, FORM_FLASH_COOKIE_NAME } from "../../http/site/render.js";

/**
 * @file Public submission route for `forms` (SPEC-010 `FORMS_POST_SUBMIT`, REQ-05).
 *
 * Mirrors `routes/site/analytics-ingest.ts`'s public-route shape: no session required, registered
 * before the site `/:slug` catch-all (see `server/app.ts`'s wiring). Reuses `resolveClientIp`
 * (`core/rate-limit/rate-limit.ts`) rather than re-deriving IP resolution — all real validation
 * happens inside `submitForm` (C-008); this file owns only the HTTP boundary.
 *
 * A native `<form>` POST navigates the browser to whatever this route returns — the ORIGINAL bug
 * here (2026-08-31 fix) was that every branch replied with raw JSON, which a JS-disabled visitor saw
 * as a literal `{"status":"accepted"}` screen instead of their page. `wantsHtmlResponse` splits the
 * two audiences this endpoint actually has by content negotiation: a fetch/XHR/API caller (this
 * file's own existing tests, none of which set an `Accept` header, land here) keeps the untouched
 * JSON contract; a real browser form submission (`Accept: text/html,...`) gets a Post/Redirect/Get
 * 303 back to the page that hosted the form, with the outcome threaded through the query string via
 * {@link encodeFormSubmissionResultQuery} — `routes/site/pages.ts` decodes and splices it back into
 * that page (`http/site/render.ts`'s `injectFormSubmissionResultIntoHtml`) on the way back down.
 *
 * A validation failure ALSO sets the `tovu_form_flash` cookie ({@link setFormFlashCookieForValidationFailure})
 * so the OTHER fields the visitor already typed survive that same round trip instead of coming back
 * wiped (2026-08-31 fix) — see `http/site/form-render.ts`'s "Validation flash cookie" section for why
 * this travels via a cookie rather than the query string.
 */

export interface RegisterFormsSubmitRouteDeps {
  workspaceId: string;
  submitForm: SubmitFormDeps;
}

/** Registers `POST /forms/:slug/submit`. Must be registered BEFORE the site `/:slug` catch-all.
 *
 * `express.urlencoded` is mounted on THIS route's own POST registration (not a global `app.ts`
 * mount — same scoping precedent as `template-preview.ts`'s `POST` handler) because a real,
 * JavaScript-disabled `<form method="post">` — the exact case this file's Post/Redirect/Get fix
 * exists for — always encodes its body as `application/x-www-form-urlencoded`, which `app.ts`'s
 * blanket `express.json()` cannot parse; without this, every field on a genuine browser submission
 * would silently arrive as missing, failing REQUIRED-field validation on every real, non-JS
 * submission regardless of the redirect fix. A `fetch`/JSON caller (every pre-existing test in this
 * file) is unaffected — Express dispatches to whichever parser matches the request's actual
 * `Content-Type`, so mounting both here is additive, never a double-parse of the same request. */
export function registerFormsSubmitRoute(app: Express, deps: RegisterFormsSubmitRouteDeps): void {
  app.post("/forms/:slug/submit", express.urlencoded({ extended: false }), createFormSubmitHandler({
    workspaceId: deps.workspaceId,
    definitionRepo: deps.submitForm.definitionRepo,
    submit: ({ input }) => submitForm({ deps: deps.submitForm, input }, {}),
    resolveClientIp,
    isHttpsRequest,
    resultCodec: {
      encodeResultQuery: encodeFormSubmissionResultQuery,
      clearResultQueryParams: clearFormSubmissionResultQueryParams,
      encodeFlashCookie: encodeFormFlashCookieValue,
      flashCookieName: FORM_FLASH_COOKIE_NAME,
    },
    targetRefusalReason: target => siteRelativeTargetReason({ target, reservedSegments: RESERVED_SEGMENTS }, {}),
  }, {}));
}
