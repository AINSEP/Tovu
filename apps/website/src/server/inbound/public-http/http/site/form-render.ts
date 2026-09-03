/**
 * @file Shared "public HTML form" primitives — baseline chrome, success/error slot markup, the
 * Post/Redirect/Get result round trip, and the validation-flash cookie payload — usable by ANY
 * form-rendering widget, not just `contact-form`.
 *
 * Split out of `render.ts` (2026-08-31, "make it a general FORM pattern" fix). Before this file
 * existed, every one of these pieces lived inside `renderWidgetContactForm` and its neighbors,
 * named and keyed entirely around `contact-form` (`widget-contact-form-success`,
 * `data-contact-form-slug`, ...) — a second form-shaped widget (newsletter signup, survey, RSVP)
 * would have inherited none of it. This module owns only the GENERIC hooks
 * (`.tovu-form`/`.tovu-form-success`/`.tovu-form-error`/`data-form-slug`); a widget that also needs
 * to keep a pre-existing, widget-specific class/attribute name for theme back-compat (as
 * `contact-form` does with `.widget-contact-form`/`data-contact-form-slug`) composes that on top via
 * {@link FormSlotOptions}'s `extraClasses`/`extraAttrs` — this module itself knows nothing about
 * `contact-form` specifically.
 *
 * Framework-agnostic by design, same rule `render.ts`'s own module doc states for the code that used
 * to live here: no `Request`/`Response`, no cookie header parsing. `routes/site/forms-submit.ts`
 * (write side: sets the flash cookie, encodes the query-string result) and `routes/site/pages.ts`
 * (read side: reads+clears the flash cookie, decodes the query string, splices the result into the
 * finished page) are the only two places that touch raw HTTP; both import from here rather than
 * duplicating this logic.
 */

const FORM_CLASS = "tovu-form";
const FORM_SUCCESS_CLASS = "tovu-form-success";
const FORM_ERROR_CLASS = "tovu-form-error";
const FORM_SLUG_ATTR = "data-form-slug";

/** Generic class name a `<form>` element carries so {@link FORM_BASELINE_STYLE} styles it — export
 *  it rather than a literal string so a second form-rendering widget's own `<form class="...">`
 *  cannot drift from what the CSS actually selects. */
export { FORM_CLASS, FORM_SLUG_ATTR };

/**
 * Baseline CSS every form-rendering widget carries with it wherever it renders (lifted from
 * `contact-form`'s own 2026-08-31 fix — see the git history on this file's predecessor block in
 * `render.ts` for the original bug reports). No theme in `content/themes/` has ever styled these
 * hooks (verified by grep across every theme's `css/` directory), so the widget ships usable
 * out of the box rather than requiring theme-author work.
 *
 * Every selector is wrapped in `:where(...)`, which contributes ZERO specificity, so a theme's own
 * (non-`:where`) rule targeting the SAME class always wins regardless of cascade order — this is
 * also why the CSS below only ever needs the GENERIC class names: a widget that also renders a
 * legacy class (via {@link FormSlotOptions}'s `extraClasses`) gets the exact same styling for free,
 * since CSS class selectors match an element carrying EITHER class in its `class` attribute, not
 * just one exclusively.
 *
 * Three hazards already fixed once and preserved here (do not regress any of them):
 * 1. **`display` vs `[hidden]`.** A same-specificity author rule that sets `display` on an element
 *    beats the user-agent `[hidden]{display:none}` stylesheet — `:where()` zeroes *specificity*, not
 *    rule origin. Every rule below that sets `display` on a class an instance can carry `hidden` on
 *    is scoped with `:not([hidden])`. `.tovu-form-success`/`.tovu-form-error` need no such guard
 *    because neither ever sets `display`; any NEW rule added here that touches `display` on either
 *    must carry the same guard.
 * 2. **Undefined tokens.** Every `var(--...)` below must name a token that exists in EVERY theme's
 *    `tokens.json`/`tokens.light.json` — themes are copied, not inherited, so a token added to one
 *    theme is still missing from the other seven. The set actually shared by every theme: `--bg
 *    --surface --surface-2 --fg --muted --border --border-strong --accent --accent-fg --font-display
 *    --font-body --container`. Do not reference anything outside that set — with the ONE deliberate
 *    exception in hazard 3 below, where the fallback chain itself guarantees a real value.
 * 3. **No theme defines `--danger`/`--success` (2026-08-31, "error states have no color" fix).**
 *    Validation errors and the success message rendered with no semantic color at all. Fixed with the
 *    standard CSS custom-property fallback form, `var(--danger, <fallback>)`: a theme that ever
 *    defines `--danger`/`--success` in its own `tokens.json` wins automatically — `var()`'s fallback
 *    only applies when the property is unset ANYWHERE in the inherited chain, which is a cascade rule,
 *    not a source-order one, so it doesn't matter that this `<style>` block is emitted deep in the
 *    page body while a theme's token `:root{}` block sits in `<head>` (`static-render.ts`'s
 *    `tokensToRootCss`). The fallback itself can't be one hardcoded hex either: a single color cannot
 *    hit WCAG AA 4.5:1 against both this repo's near-black dark-mode surfaces (`--bg`/`--surface`/
 *    `--surface-2` all sit at oklch L 9–15%) and its near-white light-mode ones (L ~90–96%) —
 *    verified by converting the actual OKLCH/hex token values to WCAG relative luminance; the
 *    luminance a color needs to clear 4.5:1 against near-black (≥0.22) and against near-white
 *    (≤0.16) are disjoint ranges. So the fallback is itself mode-aware, via two PRIVATE custom
 *    properties (`--tovu-form-danger-fallback`/`--tovu-form-success-fallback` — names no theme will
 *    ever collide with) set by `:root`/`:root[data-theme="light"]`, mirroring `tokensToRootCss`'s own
 *    dark-default/light-override convention. Measured contrast (darkest/lightest real surface each
 *    color sits on): dark-mode red `#f87171` vs `--surface-2` (oklch 15%) = 7.12:1; light-mode red
 *    `#b91c1c` vs `--surface-2` (`#e8ece9`, the least-light of the three light surfaces) = 5.42:1;
 *    dark-mode green `#4ade80` vs `--surface-2` = 11.31:1; light-mode green `#166534` vs `--surface-2`
 *    = 5.98:1. All four clear 4.5:1 with margin against every surface these classes actually render
 *    on (`--bg`, `--surface`, `--surface-2`), in both modes. (Tailwind red-600/green-700, the more
 *    "expected" light-mode shades, were tried first and REJECTED — 4.05:1 and 4.20:1 against
 *    `--surface-2`, both under 4.5:1.) Every element that gets one of these colors already carries a
 *    real text message (the field's own reason, the error summary, or `successMessage`), so color is
 *    never the only signal — satisfies "don't rely on color alone" (WCAG SC 1.4.1) without adding an
 *    icon glyph this baseline has no icon system to draw from.
 */
export const FORM_BASELINE_STYLE =
  "<style>" +
  // Private fallback-only custom properties for hazard 3 above — never referenced by a theme, only by
  // the var(--danger, var(--tovu-form-danger-fallback)) chains below. Mirrors tokensToRootCss's own
  // dark-default / :root[data-theme="light"]-override shape so these track the page's real color mode.
  ":root{--tovu-form-danger-fallback:#f87171;--tovu-form-success-fallback:#4ade80;}" +
  ":root[data-theme=\"light\"]{--tovu-form-danger-fallback:#b91c1c;--tovu-form-success-fallback:#166534;}" +
  `:where(.${FORM_CLASS}:not([hidden])){display:flex;flex-direction:column;gap:14px;max-width:480px;}` +
  ":where(.widget-form-field:not([hidden])){display:flex;flex-direction:column;gap:6px;}" +
  ":where(.widget-form-field label){font-weight:600;font-size:0.9rem;}" +
  ":where(.widget-form-field input),:where(.widget-form-field textarea){font:inherit;padding:8px 10px;" +
  "border:1px solid var(--border,#d1d5db);border-radius:6px;background:var(--surface,#fff);color:inherit;}" +
  ":where(.widget-form-field textarea){min-height:100px;resize:vertical;}" +
  ":where(.widget-form-field-error){color:var(--danger,var(--tovu-form-danger-fallback));font-size:0.85rem;font-weight:700;}" +
  `:where(.${FORM_CLASS} button[type=submit]){align-self:flex-start;padding:8px 16px;` +
  "border:1px solid transparent;border-radius:6px;background:var(--accent,#111827);" +
  "color:var(--accent-fg,#fff);font-weight:600;cursor:pointer;}" +
  `:where(.${FORM_SUCCESS_CLASS}){padding:12px 14px;border-radius:6px;` +
  "background:var(--surface,#fff);border:1px solid var(--border,#d1d5db);" +
  "border-left:4px solid var(--success,var(--tovu-form-success-fallback));color:var(--success,var(--tovu-form-success-fallback));}" +
  `:where(.${FORM_ERROR_CLASS}){padding:10px 12px;border-radius:6px;` +
  "background:var(--surface-2,#f3f4f6);border:1px solid var(--border-strong,#9ca3af);" +
  "border-left:4px solid var(--danger,var(--tovu-form-danger-fallback));color:var(--danger,var(--tovu-form-danger-fallback));font-size:0.9rem;font-weight:600;}" +
  "</style>";

/** Shared shape for {@link renderFormSuccessSlot}/{@link renderFormErrorSlot}. `slug` must already be
 *  HTML-escaped by the caller (this module never re-escapes a value it did not itself produce, same
 *  rule every other render.ts helper follows). `extraClasses`/`extraAttrs` let a widget with a
 *  pre-existing, widget-specific hook (e.g. `contact-form`'s `.widget-contact-form-success`/
 *  `data-contact-form-slug`) keep emitting it alongside the generic one for theme back-compat,
 *  without this module needing to know that widget's name. */
export interface FormSlotOptions {
  slug: string;
  extraClasses?: string;
  extraAttrs?: string;
}

/** Renders a form's hidden success-message slot — revealed later, in place, by
 *  {@link injectFormSubmissionResultIntoHtml} once a same-slug `"success"` result is spliced in.
 *  `message` must already be HTML-escaped by the caller. @complexity O(1). */
export function renderFormSuccessSlot(options: FormSlotOptions & { message: string }): string {
  const classAttr = options.extraClasses ? `${FORM_SUCCESS_CLASS} ${options.extraClasses}` : FORM_SUCCESS_CLASS;
  const attrs = options.extraAttrs ? ` ${options.extraAttrs}` : "";
  return `<div class="${classAttr}" ${FORM_SLUG_ATTR}="${options.slug}"${attrs} hidden>${options.message}</div>`;
}

/** Renders a form's hidden error-summary slot — revealed later, in place, by
 *  {@link injectFormSubmissionResultIntoHtml} for a same-slug `"validation"`/`"rate-limited"`/
 *  `"error"` result. Starts empty; the message text is always attacker-influenced-or-fixed content
 *  spliced in after the fact, never rendered here. @complexity O(1). */
export function renderFormErrorSlot(options: FormSlotOptions): string {
  const classAttr = options.extraClasses ? `${FORM_ERROR_CLASS} ${options.extraClasses}` : FORM_ERROR_CLASS;
  const attrs = options.extraAttrs ? ` ${options.extraAttrs}` : "";
  return `<div class="${classAttr}" ${FORM_SLUG_ATTR}="${options.slug}"${attrs} hidden></div>`;
}

// ---------------------------------------------------------------------------
// escaping/object-shape helpers — deliberately duplicated, not imported, from render.ts
//
// `render.ts` imports FROM this module (`FORM_BASELINE_STYLE`, `injectFormSubmissionResultIntoHtml`,
// ...); importing `escapeHtml`/an object-shape guard back FROM render.ts would make the two modules
// circularly dependent on each other. Both helpers are tiny, stable, single-algorithm primitives
// (render.ts's own copy has needed zero changes since it was written) — duplicating them here is a
// smaller, more legible cost than a circular import between the two form-rendering modules.
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// contact-form Post/Redirect/Get result (2026-08-31 fix, generalized 2026-08-31)
//
// A native `<form>` POST navigates the browser to whatever the submit route returns. The fix there
// is a 303 redirect back to the page that hosted the form, with the outcome threaded through the
// query string; THIS half decodes that query string and splices the outcome into the already-
// rendered page, so it survives with JavaScript disabled.
//
// The render functions above (and any future form-widget's own) have no request in scope — they are
// pure prop-to-HTML functions — so they cannot know at render time whether the visitor loading this
// page just failed a submission. Instead they pre-build stable, hidden anchors (the success slot,
// the form's own error slot, each field's own error slot), and the functions below fill those
// anchors in after the page's FULL html string already exists.
// ---------------------------------------------------------------------------

/** One form submission's outcome, carried from `routes/site/forms-submit.ts` (which constructs it
 *  from the real `submitForm`/error-class result) to `routes/site/pages.ts` (which decodes it back
 *  off `req.query`, merges in any flash-cookie `values` via {@link mergeFormFlashIntoResult}, and
 *  passes it to {@link injectFormSubmissionResultIntoHtml}) via a redirect Location's query string.
 *
 * `values` (2026-08-31 field-wipe fix) is deliberately NOT part of the query-string round trip
 * (`encodeFormSubmissionResultQuery`/`decodeFormSubmissionResultFromQuery` never read or write it) —
 * see {@link FormFlashPayload}'s own doc for why submitted field text travels via a cookie instead.
 * It only ever appears here as something `mergeFormFlashIntoResult` attaches after the query-string
 * decode already ran. */
export type FormSubmissionRedirectResult =
  | { kind: "success"; slug: string }
  | {
      kind: "validation";
      slug: string;
      fieldErrors: ReadonlyArray<{ field: string; reason: string }>;
      values?: Readonly<Record<string, string>>;
    }
  | { kind: "rate-limited"; slug: string; retryAfterSeconds: number }
  | { kind: "error"; slug: string };

/** Query param names shared by {@link encodeFormSubmissionResultQuery} (write side, forms-submit.ts
 *  builds a redirect Location with) and {@link decodeFormSubmissionResultFromQuery} (read side,
 *  pages.ts reads `req.query` with) — one constant so the two halves of the round trip cannot drift
 *  apart from each other. */
const FORM_RESULT_QUERY_KEYS = {
  slug: "form",
  status: "form_status",
  errors: "form_errors",
  retryAfter: "form_retry_after",
} as const;

// A hand-crafted query string is untrusted input regardless of whether it came from our own redirect
// or a visitor typing it directly — these bound how much of it `decodeFormSubmissionResultFromQuery`
// will ever process, so neither side of the round trip can be turned into an unbounded-work vector.
const FORM_RESULT_MAX_FIELD_ERRORS = 20;
const FORM_RESULT_MAX_FIELD_STRING_LEN = 200;

/** Builds the query params `forms-submit.ts` appends to its Post/Redirect/Get `Location` header. A
 *  plain `URLSearchParams`, not a full URL — resolving and validating the redirect's BASE (same-
 *  origin check against `Referer`) is an HTTP/security concern that belongs to the route layer, not
 *  this rendering-layer function. Never encodes `result.values` — see {@link FormSubmissionRedirectResult}'s
 *  own doc for why submitted field text never travels in the query string. */
export function encodeFormSubmissionResultQuery(result: FormSubmissionRedirectResult): URLSearchParams {
  const params = new URLSearchParams();
  params.set(FORM_RESULT_QUERY_KEYS.slug, result.slug);
  params.set(FORM_RESULT_QUERY_KEYS.status, result.kind === "rate-limited" ? "rate_limited" : result.kind);
  if (result.kind === "validation") {
    params.set(FORM_RESULT_QUERY_KEYS.errors, JSON.stringify(result.fieldErrors.slice(0, FORM_RESULT_MAX_FIELD_ERRORS)));
  }
  if (result.kind === "rate-limited") {
    params.set(FORM_RESULT_QUERY_KEYS.retryAfter, String(Math.max(0, Math.trunc(result.retryAfterSeconds))));
  }
  return params;
}

/** Strips every {@link FORM_RESULT_QUERY_KEYS} key from `params` in place. `forms-submit.ts` calls
 *  this on the redirect base's existing query before re-appending a fresh result, so resubmitting the
 *  same form twice on the same page never accumulates stale `form_*` params from the earlier visit. */
export function clearFormSubmissionResultQueryParams(params: URLSearchParams): void {
  for (const key of Object.values(FORM_RESULT_QUERY_KEYS)) params.delete(key);
}

function queryStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** The `form_errors` half of {@link decodeFormSubmissionResultFromQuery} — split out because it is
 *  the one field shaped as nested, attacker-editable JSON rather than a flat scalar, so it carries
 *  its own parse/shape/length guards. Any malformation (not JSON, not an array, oversized, wrong
 *  element shape) degrades to an empty list rather than throwing — a visitor can reach this by
 *  hitting a page directly with a hand-crafted query string, not only via our own redirect.
 * @complexity O(n) in the decoded array's length, itself capped at {@link FORM_RESULT_MAX_FIELD_ERRORS}
 * before this function ever sees it. */
/** Shape-narrows ONE decoded `form_errors` array entry to a `{field, reason}` pair, or `null` when it
 *  isn't one — split out of {@link readFieldErrorsFromQuery}'s own loop body (complexity-debt sweep,
 *  2026-09-03; that function was at cyclomatic 10 / cognitive 12 against this repo's 9 ceilings) so
 *  the per-entry decode decision is its own unit instead of four of the loop's own branches. Same
 *  untrusted-input discipline as before: a non-object entry, or one with no non-empty `field`, is
 *  simply skipped by the caller — never a thrown error. Neither `field` nor `reason` is escaped here;
 *  both remain raw decoded strings until they reach an actual HTML sink ({@link showFieldErrors}),
 *  same "escape at the sink, not at the boundary" rule every other query/cookie decoder in this file
 *  follows.
 * @complexity O(1). */
function parseFieldErrorEntry(entry: unknown): { field: string; reason: string } | null {
  const o = isPlainObject(entry) ? entry : undefined;
  const field = o ? queryStringValue(o.field) : "";
  if (!field) return null;
  const reason = o ? queryStringValue(o.reason) : "";
  return { field: field.slice(0, FORM_RESULT_MAX_FIELD_STRING_LEN), reason: reason.slice(0, FORM_RESULT_MAX_FIELD_STRING_LEN) };
}

function readFieldErrorsFromQuery(raw: unknown): Array<{ field: string; reason: string }> {
  const rawString = queryStringValue(raw);
  if (!rawString || rawString.length > FORM_RESULT_MAX_FIELD_STRING_LEN * FORM_RESULT_MAX_FIELD_ERRORS) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawString);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const errors: Array<{ field: string; reason: string }> = [];
  for (const entry of parsed.slice(0, FORM_RESULT_MAX_FIELD_ERRORS)) {
    const parsedEntry = parseFieldErrorEntry(entry);
    if (parsedEntry) errors.push(parsedEntry);
  }
  return errors;
}

/** Reads a {@link FormSubmissionRedirectResult} back off `query` (an Express `req.query`, or any
 *  plain string-keyed record — kept framework-agnostic per this module's own doc). Every value is
 *  untrusted, the same way `readFieldErrorsFromQuery` already treats `form_errors`: an unrecognized/
 *  malformed `form_status`, or a `form`/`form_status` that isn't a non-empty string, decodes to
 *  `undefined` ("no result to show") rather than throwing. Never produces a `values` field — see
 *  {@link mergeFormFlashIntoResult} for the separate channel that attaches one.
 * @complexity O(1), except `form_status=invalid` which delegates to
 * {@link readFieldErrorsFromQuery}'s own bounded cost. */
export function decodeFormSubmissionResultFromQuery(query: Record<string, unknown>): FormSubmissionRedirectResult | undefined {
  const slug = queryStringValue(query[FORM_RESULT_QUERY_KEYS.slug]);
  const status = queryStringValue(query[FORM_RESULT_QUERY_KEYS.status]);
  if (!slug || !status) return undefined;
  if (status === "success") return { kind: "success", slug };
  if (status === "error") return { kind: "error", slug };
  if (status === "rate_limited") {
    const retryAfterSeconds = Number.parseInt(queryStringValue(query[FORM_RESULT_QUERY_KEYS.retryAfter]), 10);
    return { kind: "rate-limited", slug, retryAfterSeconds: Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds : 0 };
  }
  if (status === "validation") return { kind: "validation", slug, fieldErrors: readFieldErrorsFromQuery(query[FORM_RESULT_QUERY_KEYS.errors]) };
  return undefined;
}

/** Un-hides the success-message sibling {@link renderFormSuccessSlot} pre-rendered for `slugPattern`
 *  (already both HTML- and regex-escaped by the caller). Matches on the GENERIC `${FORM_SUCCESS_CLASS}`
 *  class + `${FORM_SLUG_ATTR}` attribute — never a widget-specific legacy class/attribute — so this
 *  splice works for any form-rendering widget, not just `contact-form` (2026-08-31 generalization).
 *  A replacer FUNCTION, not a replacement string — the spliced-in text can itself contain
 *  `$`-prefixed sequences (`$&`, `$1`, ...) that `String.prototype.replace` would otherwise
 *  reinterpret as its own replacement-pattern syntax, corrupting or duplicating unrelated output; a
 *  function return value is always inserted literally. */
function showFormSuccessMessage(html: string, slugPattern: string): string {
  const successRegex = new RegExp(`(<div class="[^"]*\\b${FORM_SUCCESS_CLASS}\\b[^"]*" ${FORM_SLUG_ATTR}="${slugPattern}"[^>]*) hidden>`, "i");
  return html.replace(successRegex, (_match, openTag: string) => `${openTag}>`);
}

/** Adds `hidden` to the matched `<form ...>` block's own opening tag — used on success, once the
 *  message above is shown, so the visitor sees the confirmation in place of the (now pointless) form
 *  rather than both at once. */
function hideFormElement(formHtml: string): string {
  return formHtml.replace(/^<form /, "<form hidden ");
}

/** Un-hides the form-level error-summary slot with `message` (a fixed string this module writes
 *  itself — never attacker-controlled — for the `rate-limited`/`error` cases and the validation
 *  banner; see {@link showFieldErrors} for the one case where the text IS attacker-controlled).
 *  Matches on the generic class/attribute, same reasoning as {@link showFormSuccessMessage}. */
function showFormErrorSummary(formHtml: string, slugPattern: string, message: string): string {
  const errorRegex = new RegExp(`(<div class="[^"]*\\b${FORM_ERROR_CLASS}\\b[^"]*" ${FORM_SLUG_ATTR}="${slugPattern}"[^>]*) hidden><\\/div>`, "i");
  return formHtml.replace(errorRegex, (_match, openTag: string) => `${openTag}>${message}</div>`);
}

/** Un-hides each per-field error slot named in `fieldErrors` with its own (HTML-escaped) `reason`
 *  text. `field`/`reason` came off `readFieldErrorsFromQuery` — a visitor-controlled query string —
 *  so both get the same `escapeHtml` treatment field labels get; a slot naming a field the form
 *  doesn't actually have (stale/forged) simply never matches and is a no-op for that one entry, not
 *  a partial-corruption risk. `.widget-form-field`/`.widget-form-field-error` are already
 *  form-generic class names (not `contact-form`-specific), so no change was needed here for the
 *  2026-08-31 generalization beyond moving the function. */
function showFieldErrors(formHtml: string, fieldErrors: ReadonlyArray<{ field: string; reason: string }>): string {
  return fieldErrors.reduce((updated, { field, reason }) => {
    const fieldPattern = escapeForRegExp(escapeHtml(field));
    const fieldErrorRegex = new RegExp(`(<div class="widget-form-field-error" data-field="${fieldPattern}"[^>]*) hidden></div>`, "i");
    return updated.replace(fieldErrorRegex, (_match, openTag: string) => `${openTag}>${escapeHtml(reason)}</div>`);
  }, formHtml);
}

/** Sets `<input ...>` tag's `value` attribute to `escapedValue`, given the FULL matched tag text
 *  (open through close). Two shapes, both handled without disturbing anything else the tag carries:
 *  1. The tag already has a `value="..."` attribute (including `value=""`) — REPLACE it in place.
 *     Appending a second `value=` instead (the pre-fix behavior) is a silent no-op in every browser:
 *     the DOM/HTML spec honors only the FIRST `value` attribute on an element, so the stale one
 *     (e.g. `value="old"`) would keep winning over the freshly-flashed one.
 *  2. No existing `value` attribute — insert one just before the tag's own closing `>`, preserving
 *     whichever closing form the source used (bare `<input ...>` stays bare; XHTML-style
 *     `<input .../>` keeps its `/>`) rather than normalizing one into the other.
 *  A replacer FUNCTION at both call sites for the same `$&`/`$1` corruption reason documented on
 *  {@link showFormSuccessMessage} — `escapedValue` is spliced in via template literal, never handed
 *  to `String.prototype.replace` as a replacement-string argument. @complexity O(tag.length). */
function setInputValueAttr(tag: string, escapedValue: string): string {
  const existingValueAttr = /\bvalue="[^"]*"/i;
  if (existingValueAttr.test(tag)) {
    return tag.replace(existingValueAttr, () => `value="${escapedValue}"`);
  }
  const selfClosing = /\/>$/.test(tag);
  const beforeClose = tag.slice(0, tag.length - (selfClosing ? 2 : 1)).replace(/\s+$/, "");
  return `${beforeClose} value="${escapedValue}"${selfClosing ? "/>" : ">"}`;
}

/** Re-populates ONE field's rendered value from the validation flash (2026-08-31 field-wipe fix) —
 *  tries the field's `<textarea name="FIELD">` shape first, then its `<input name="FIELD">` shape;
 *  exactly one ever matches (a field renders as one element kind), so trying both and keeping
 *  whichever changed the string is cheaper than threading the field's own type through this
 *  string-splice layer, which otherwise has no reason to know it. A field id naming an element this
 *  form doesn't have (stale/forged flash) is a silent no-op, same discipline as {@link showFieldErrors}.
 *  The `<input>` match is bounded to `[^>]*>` — a single `>` closes it, same bounding discipline every
 *  other regex in this file uses — so it can never swallow a neighboring tag; {@link setInputValueAttr}
 *  then decides whether that closing `>` was itself `/>` (2026-09-03 fix: previously REQUIRED `/>`, so
 *  a standard HTML5 `<input name="x">` — no XHTML self-close — never matched at all and silently kept
 *  its wiped value). A replacer FUNCTION for the same `$&`/`$1` corruption reason documented on
 *  {@link showFormSuccessMessage}. @complexity O(html.length) per call — two regex passes, the
 *  second only executed when the first did not match. */
function showOneFieldValue(html: string, field: string, value: string): string {
  const fieldPattern = escapeForRegExp(escapeHtml(field));
  const escapedValue = escapeHtml(value);
  const textareaRegex = new RegExp(`(<textarea\\b[^>]*\\bname="${fieldPattern}"[^>]*>)[\\s\\S]*?(<\\/textarea>)`, "i");
  const withTextarea = html.replace(textareaRegex, (_match, openTag: string, closeTag: string) => `${openTag}${escapedValue}${closeTag}`);
  if (withTextarea !== html) return withTextarea;
  const inputRegex = new RegExp(`<input\\b[^>]*\\bname="${fieldPattern}"[^>]*>`, "i");
  return html.replace(inputRegex, (matchedTag: string) => setInputValueAttr(matchedTag, escapedValue));
}

/** Re-populates every field named in `values` (already filtered to repopulatable, non-sensitive
 *  field types and HTML-escaped-safe raw strings by the caller — see `forms-submit.ts`'s
 *  `buildFormFlashValues`) into `formHtml`. `undefined` (no flash present, or a plain success/
 *  rate-limited/error result) is a byte-identical no-op. @complexity O(n) reduce over `values`'
 *  entries, each doing {@link showOneFieldValue}'s own bounded work. */
function showFieldValues(formHtml: string, values: Readonly<Record<string, string>> | undefined): string {
  if (!values) return formHtml;
  return Object.entries(values).reduce((updated, [field, value]) => showOneFieldValue(updated, field, value), formHtml);
}

/**
 * Splices a {@link FormSubmissionRedirectResult} into an already-fully-rendered page's HTML,
 * targeting the ONE form widget instance whose `${FORM_SLUG_ATTR}` matches `result.slug` — every
 * other form on the page (a different widget instance, a different form-rendering widget type, or
 * none at all) is left byte-for-byte unchanged. Called once per response, AFTER every render path
 * has already produced its final HTML string.
 *
 * Keys the match on the GENERIC `${FORM_SLUG_ATTR}` attribute, not a widget-specific one
 * (2026-08-31 generalization) — any widget built on {@link renderFormSuccessSlot}/
 * {@link renderFormErrorSlot}/a `<form>` carrying `${FORM_CLASS}` gets this splice for free, without
 * this function knowing that widget's name.
 *
 * A `result` for a slug that never appears in `html` (a stale or forged query string pointing at a
 * widget this particular page doesn't have) is a silent no-op: `html` comes back byte-identical,
 * never a crash or a misapplied result on the wrong form.
 * @complexity O(html.length) for the initial `<form>` scan, then O(formHtml.length) for the chosen
 * outcome's own splice (bounded by `result.fieldErrors.length`/`values` size for `"validation"`,
 * themselves already capped upstream).
 */
export function injectFormSubmissionResultIntoHtml(html: string, result: FormSubmissionRedirectResult | undefined): string {
  if (!result) return html;
  const slugPattern = escapeForRegExp(escapeHtml(result.slug));
  const formRegex = new RegExp(`<form\\b[^>]*${FORM_SLUG_ATTR}="${slugPattern}"[^>]*>[\\s\\S]*?<\\/form>`, "i");
  const formMatch = formRegex.exec(html);
  if (!formMatch) return html;
  const originalForm = formMatch[0];

  let updatedForm: string;
  if (result.kind === "success") {
    updatedForm = hideFormElement(originalForm);
  } else if (result.kind === "validation") {
    updatedForm = showFormErrorSummary(
      showFieldValues(showFieldErrors(originalForm, result.fieldErrors), result.values),
      slugPattern,
      "Please fix the highlighted fields below."
    );
  } else if (result.kind === "rate-limited") {
    const plural = result.retryAfterSeconds === 1 ? "" : "s";
    updatedForm = showFormErrorSummary(originalForm, slugPattern, `Too many submissions — please try again in ${result.retryAfterSeconds} second${plural}.`);
  } else {
    updatedForm = showFormErrorSummary(originalForm, slugPattern, "Something went wrong — please try again.");
  }

  // The success slot sits BEFORE the `<form>` in document order, so it must be revealed as a
  // SEPARATE regex pass over the already-rebuilt string, never by combining offsets from two
  // different splices into one manual slice — `formMatch.index` was measured against the ORIGINAL
  // `html`, and no longer lines up with anything once an earlier edit shifts every byte after it.
  const withUpdatedForm = html.slice(0, formMatch.index) + updatedForm + html.slice(formMatch.index + originalForm.length);
  return result.kind === "success" ? showFormSuccessMessage(withUpdatedForm, slugPattern) : withUpdatedForm;
}

// ---------------------------------------------------------------------------
// Validation flash cookie (2026-08-31 field-wipe fix)
//
// Post/Redirect/Get means the fresh GET that follows a failed submission cannot see the prior POST
// body — every field a visitor already typed is gone, not just the invalid one. The values cannot
// travel in the redirect's query string: names, email addresses, and message bodies would leak into
// browser history, server logs, and `Referer` headers sent to third parties. Instead they travel in
// a short-lived, `HttpOnly`, read-once cookie: `forms-submit.ts` sets it only on a validation failure
// reached via a real browser POST; `pages.ts` reads it on the very next GET, merges it into the
// decoded query-string result via `mergeFormFlashIntoResult`, and clears it in the SAME response —
// a later plain reload must not resurrect stale input.
// ---------------------------------------------------------------------------

/** Name of the cookie carrying {@link FormFlashPayload}. Exported so `forms-submit.ts` (sets it) and
 *  `pages.ts` (reads + clears it) cannot drift onto different names — mirrors `dev-auth.ts`'s
 *  `SESSION_COOKIE`/`complete-sign-in.ts`'s `MEMBER_SESSION_COOKIE` precedent of one named constant
 *  per cookie, owned by whichever module needs it most, reused verbatim by every other reader/writer. */
export const FORM_FLASH_COOKIE_NAME = "tovu_form_flash";

/** The decoded flash cookie payload: which form (`slug`) it belongs to, and the field values to
 *  re-populate. `slug` guards against a stale cookie from a DIFFERENT form on the same page (or a
 *  form the visitor abandoned) being misapplied to this one — `mergeFormFlashIntoResult` only
 *  attaches `values` when both slugs match. Values are pre-filtered by the caller
 *  (`forms-submit.ts`'s `buildFormFlashValues`) to an ALLOWLIST of repopulatable field types, so a
 *  password-type field (or any future sensitive type this codebase has not added yet) is excluded at
 *  the source and never reaches this payload at all. */
export interface FormFlashPayload {
  slug: string;
  values: Readonly<Record<string, string>>;
}

// A submitted field can be up to 5000 chars (`forms-submit.ts`'s own `MAX_BODY_STRING_LENGTH`) —
// far more than a cookie can hold. Each value is truncated to a short preview length before ever
// being measured against the total budget below; a visitor who typed a genuinely long message sees
// a truncated draft to extend, which is strictly better than the pre-fix behavior of losing it
// outright, without this feature needing a server-side value store (rejected: adds a persistence +
// expiry surface for what stays, even truncated, a low-value edge case).
const FORM_FLASH_MAX_FIELD_VALUE_LENGTH = 300;
// Conservative budget for the cookie's VALUE alone, leaving headroom under browsers' ~4096-byte
// total `Set-Cookie` line (name, `=`, and the `HttpOnly; Path=/; Max-Age=...; SameSite=Lax[; Secure]`
// attribute tail all count against that same budget too).
const FORM_FLASH_MAX_COOKIE_BYTES = 3000;
const FORM_FLASH_MAX_FIELDS = 20; // mirrors forms' own `MAX_FIELDS` (forms.ts) — belt-and-suspenders on decode.
const FORM_FLASH_MAX_FIELD_ID_LENGTH = 100;
const FORM_FLASH_MAX_SLUG_LENGTH = 200;

/**
 * Serializes `payload` for the flash cookie, bounding it to fit. Each value is truncated to
 * {@link FORM_FLASH_MAX_FIELD_VALUE_LENGTH} first; if the result STILL exceeds
 * {@link FORM_FLASH_MAX_COOKIE_BYTES} (a form with many long fields), fields are dropped from the
 * END — i.e. the form's LATER-declared fields are dropped first, keeping earlier ones (typically
 * short identity fields like name/email declared before a long free-text message) — until it fits,
 * or the cookie is skipped entirely (`undefined`) if even zero fields fit under the byte budget
 * alongside the bare `slug`. Skipping rather than emitting a truncated/malformed cookie is a
 * deliberate choice: a missing flash degrades to the pre-fix (values not repopulated) behavior for
 * that one oversized submission, never a broken `Set-Cookie` header.
 * @complexity O(n^2) worst case in `payload.values`' entry count `n` (re-stringifies up to `n+1`
 * times) — `n` is bounded by {@link FORM_FLASH_MAX_FIELDS}-scale form definitions in practice, so
 * this is a handful of cheap `JSON.stringify` calls, never a real cost concern.
 */
export function encodeFormFlashCookieValue(payload: FormFlashPayload): string | undefined {
  const truncatedEntries = Object.entries(payload.values).map(
    ([field, value]) => [field, value.slice(0, FORM_FLASH_MAX_FIELD_VALUE_LENGTH)] as const
  );
  for (let keep = truncatedEntries.length; keep >= 0; keep--) {
    const json = JSON.stringify({ slug: payload.slug, values: Object.fromEntries(truncatedEntries.slice(0, keep)) });
    if (Buffer.byteLength(json, "utf8") <= FORM_FLASH_MAX_COOKIE_BYTES) {
      return keep > 0 ? json : undefined;
    }
  }
  return undefined;
}

/** Shape guard for {@link decodeFormFlashCookieValue}'s parsed JSON — split out purely to keep that
 *  function's own cyclomatic complexity low (this repo's documented ≤9 ceiling); no behavior change
 *  from inlining it. */
function isFlashPayloadShape(parsed: unknown): parsed is { slug: string; values: Record<string, unknown> } {
  if (!isPlainObject(parsed)) return false;
  if (typeof parsed.slug !== "string" || !parsed.slug) return false;
  return isPlainObject(parsed.values);
}

/** The per-field half of {@link decodeFormFlashCookieValue} — split out for the same complexity
 *  reason as {@link isFlashPayloadShape}. Caps both the number of entries considered and each
 *  field id's/value's own length, the same untrusted-input discipline
 *  {@link readFieldErrorsFromQuery} already applies to the query-string side of this feature.
 * @complexity O(n) in `rawValues`' entry count, capped at {@link FORM_FLASH_MAX_FIELDS}. */
function decodeFlashValues(rawValues: Record<string, unknown>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [field, value] of Object.entries(rawValues).slice(0, FORM_FLASH_MAX_FIELDS)) {
    if (typeof value === "string" && field) {
      values[field.slice(0, FORM_FLASH_MAX_FIELD_ID_LENGTH)] = value.slice(0, FORM_FLASH_MAX_FIELD_VALUE_LENGTH);
    }
  }
  return values;
}

/** Decodes a flash cookie's raw (already `decodeURIComponent`-d) value. Every value is untrusted —
 *  a visitor can hand-craft a cookie the same way `decodeFormSubmissionResultFromQuery` already
 *  treats a hand-crafted query string — so any malformation (not JSON, wrong shape, oversized)
 *  degrades to `undefined` rather than throwing.
 * @complexity O(1) plus {@link decodeFlashValues}' own bounded cost. */
export function decodeFormFlashCookieValue(raw: string | undefined): FormFlashPayload | undefined {
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isFlashPayloadShape(parsed)) return undefined;
  return { slug: parsed.slug.slice(0, FORM_FLASH_MAX_SLUG_LENGTH), values: decodeFlashValues(parsed.values) };
}

/** Attaches a decoded flash's `values` onto a decoded query-string `result`, read-once (the caller,
 *  `pages.ts`, clears the cookie regardless of whether this merge actually applied). Only ever
 *  applies to a `"validation"` result for the SAME slug the flash names — a flash for a different
 *  form, a stale/expired one that decoded to `undefined`, or one arriving alongside a `"success"`/
 *  `"rate-limited"`/`"error"` result (a shape it was never set for) all pass `result` through
 *  unchanged. @complexity O(1). */
export function mergeFormFlashIntoResult(
  result: FormSubmissionRedirectResult | undefined,
  flash: FormFlashPayload | undefined
): FormSubmissionRedirectResult | undefined {
  if (!result || result.kind !== "validation" || !flash || flash.slug !== result.slug) return result;
  return { ...result, values: flash.values };
}
