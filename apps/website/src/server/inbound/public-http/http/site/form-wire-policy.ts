import type { MemberAuthNames } from "@jini-ai/cms/public-http/http/site/member-auth-script";
import { formBaselineStyle, formRangeReadoutJs, formRangeReadoutScript, type FormPresentationNames } from "@jini-ai/cms/public-http/http/site/form-presentation-assets";

/** Query param names shared by {@link encodeFormSubmissionResultQuery} (write side, forms-submit.ts
 *  builds a redirect Location with) and {@link decodeFormSubmissionResultFromQuery} (read side,
 *  pages.ts reads `req.query` with) — one constant so the two halves of the round trip cannot drift
 *  apart from each other. */
export const FORM_RESULT_QUERY_KEYS = {
  slug: "form",
  status: "form_status",
  errors: "form_errors",
  retryAfter: "form_retry_after",
} as const;

/** Name of the cookie carrying {@link FormFlashPayload}. Exported so `forms-submit.ts` (sets it) and
 *  `pages.ts` (reads + clears it) cannot drift onto different names — mirrors `dev-auth.ts`'s
 *  `SESSION_COOKIE`/`complete-sign-in.ts`'s `MEMBER_SESSION_COOKIE` precedent of one named constant
 *  per cookie, owned by whichever module needs it most, reused verbatim by every other reader/writer. */
export const FORM_FLASH_COOKIE_NAME = "tovu_form_flash";


/** Boolean attribute stamped on the member sign-in `<style>` and `<script>` that
 *  `injectMemberAuthScript` (`@jini-ai/cms`) adds to a public page; its presence is that function's
 *  idempotency check, so the host owns one fixed name (the engine ships no product-branded one). */
export const MEMBER_AUTH_SCRIPT_MARKER = "data-tovu-member-auth";

/** Class names Tovu's member page markup (`routes/site/member-pages.ts`) and themes use, injected into
 *  `@jini-ai/cms`'s member sign-in style and script (which ship no legacy class name of their own). */
export const MEMBER_AUTH_NAMES: MemberAuthNames = {
  authClass: "member-auth",
  fieldClass: "member-field",
  passwordClass: "member-password",
  passwordToggleClass: "member-password-toggle",
  passwordSlashClass: "member-password-slash",
  labelRowClass: "member-label-row",
  actionsClass: "member-actions",
  submitClass: "member-submit",
  linksClass: "member-auth-links",
  linkClass: "member-link",
  noteClass: "member-note",
  signoutClass: "member-signout",
  providerListClass: "member-provider-list",
  providerClass: "member-provider",
  providerThemeClasses: "btn btn-ghost",
  orClass: "member-or",
  oidcErrorClass: "member-oidc-error",
  headingRowClass: "member-heading-row",
  identitiesClass: "member-identities",
  identityListClass: "member-identity-list",
  identityClass: "member-identity",
  tipClass: "member-tip",
  tipTextClass: "member-tip-text",
  accountShortClass: "member-account-short",
  accountEmailClass: "member-account-email",
  dangerFallbackProp: "--member-danger-fallback",
  successFallbackProp: "--member-success-fallback",
};

/** Product class, attribute and custom-property names Tovu themes select on (tovu-theme's `theme.css`
 *  "forms" section styles `.tovu-form`). Injected into `@jini-ai/cms`'s baseline CSS and range-readout
 *  script, which ship no product-branded name of their own. */
export const FORM_PRESENTATION_NAMES: FormPresentationNames = {
  formClass: "tovu-form",
  errorClass: "tovu-form-error",
  fieldClass: "widget-form-field",
  fieldHelpClass: "widget-form-field-help",
  fieldCheckboxClass: "widget-form-field-checkbox",
  fieldErrorClass: "widget-form-field-error",
  formAttr: "data-tovu-form",
  errorAttr: "data-tovu-form-error",
  rangeValueClass: "tovu-form-range-value",
  rangeMarkerAttr: "data-tovu-range",
  dangerFallbackProp: "--tovu-form-danger-fallback",
  successFallbackProp: "--tovu-form-success-fallback",
};

/** Class a `<form>` element carries so {@link FORM_BASELINE_STYLE} styles it — a named constant rather
 *  than a literal so a second form-rendering widget's own `<form class="...">` cannot drift from what
 *  the CSS actually selects. */
export const FORM_CLASS = FORM_PRESENTATION_NAMES.formClass;
export const FORM_ERROR_CLASS = FORM_PRESENTATION_NAMES.errorClass;

/** Baseline CSS every form-rendering widget carries (see `formBaselineStyle`), built once with Tovu's names. */
export const FORM_BASELINE_STYLE = formBaselineStyle({ names: FORM_PRESENTATION_NAMES });
/** Range-slider readout script body, for tests that run it against a fake `document`. */
export const FORM_RANGE_READOUT_JS = formRangeReadoutJs({ names: FORM_PRESENTATION_NAMES });
/** {@link FORM_RANGE_READOUT_JS} as the inline `<script>` a rendered form appends after itself. */
export const FORM_RANGE_READOUT_SCRIPT = formRangeReadoutScript({ names: FORM_PRESENTATION_NAMES });
