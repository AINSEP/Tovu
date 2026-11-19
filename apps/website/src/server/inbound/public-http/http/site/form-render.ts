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

import { escapeHtml } from "#src/platform/html/escape";
import { formValidationMessages, formDocumentLocale } from "./form-validation-message.js";
import { FORM_ATTEMPT_FIELD } from "@jini-ai/cms/forms/submission-attempts";
import { FORM_SUBMISSION_TOO_FAST_MESSAGE } from "@jini-ai/cms/forms/html-render";
import type { FieldDescriptor, FormSubmissionRedirectResult } from "@jini-ai/cms/forms";
import { FORM_CLASS, FORM_SUCCESS_CLASS, FORM_ERROR_CLASS, FORM_SLUG_ATTR } from "./form-presentation-assets.js";
import { fieldMaxChars } from "#src/features/forms/render-entry";

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
// object-shape validation — shared core owner, independent of render.ts
//
// `render.ts` imports FROM this module (`FORM_BASELINE_STYLE`, `injectFormSubmissionResultIntoHtml`,
// ...); importing an object-shape guard back FROM render.ts would make the two modules circularly
// dependent on each other. The core owner avoids that circular import between the two rendering
// modules. (`escapeHtml` likewise comes from the import-free leaf `platform/html/escape.ts`.)
// ---------------------------------------------------------------------------

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

/** Un-hides the success-message sibling {@link renderFormSuccessSlot} pre-rendered for `slugPattern`
 *  (already both HTML- and regex-escaped by the caller). Matches on the GENERIC `${FORM_SUCCESS_CLASS}`
 *  class + `${FORM_SLUG_ATTR}` attribute — never a widget-specific legacy class/attribute — so this
 *  splice works for any form-rendering widget, not just `contact-form` (2026-08-31 generalization).
 *  A replacer FUNCTION, not a replacement string — the spliced-in text can itself contain
 *  `$`-prefixed sequences (`$&`, `$1`, ...) that `String.prototype.replace` would otherwise
 *  reinterpret as its own replacement-pattern syntax, corrupting or duplicating unrelated output; a
 *  function return value is always inserted literally. */
function showFormSuccessMessage({ html, slugPattern }: { html: string; slugPattern: string }, _optional = {}): string {
  const successRegex = new RegExp(`(<div class="[^"]*\\b${FORM_SUCCESS_CLASS}\\b[^"]*" ${FORM_SLUG_ATTR}="${slugPattern}"[^>]*) hidden>`, "i");
  const plainRegex = new RegExp(`(<div data-tovu-form-success ${FORM_SLUG_ATTR}="${slugPattern}"[^>]*) hidden>`, "i");
  return html.replace(successRegex, (_match, openTag: string) => `${openTag}>`)
    .replace(plainRegex, (_match, openTag: string) => `${openTag}>`);
}

/** Adds `hidden` to the matched `<form ...>` block's own opening tag — used on success, once the
 *  message above is shown, so the visitor sees the confirmation in place of the (now pointless) form
 *  rather than both at once. */
function hideFormElement({ formHtml }: { formHtml: string }, _optional = {}): string {
  return formHtml.replace(/^<form /, "<form hidden ");
}

/** Un-hides the form-level error-summary slot with `message` (a fixed string this module writes
 *  itself — never attacker-controlled — for the `rate-limited`/`error` cases and the validation
 *  banner; see {@link showFieldErrors} for the one case where the text IS attacker-controlled).
 *  Matches on the generic class/attribute, same reasoning as {@link showFormSuccessMessage}. */
function showFormErrorSummary({ formHtml, slugPattern, message }: { formHtml: string; slugPattern: string; message: string }, _optional = {}): string {
  const errorRegex = new RegExp(`(<div class="[^"]*\\b${FORM_ERROR_CLASS}\\b[^"]*" ${FORM_SLUG_ATTR}="${slugPattern}"[^>]*) hidden><\\/div>`, "i");
  const plainRegex = new RegExp(`(<div data-tovu-form-error ${FORM_SLUG_ATTR}="${slugPattern}"[^>]*) hidden><\\/div>`, "i");
  return formHtml.replace(errorRegex, (_match, openTag: string) => `${openTag}>${message}</div>`)
    .replace(plainRegex, (_match, openTag: string) => `${openTag}>${message}</div>`);
}

/** Un-hides each per-field error slot named in `fieldErrors` with its localized, HTML-escaped
 *  instruction. `field` came off `readFieldErrorsFromQuery` — a visitor-controlled query string —
 *  and messages include server-rendered labels, so both get `escapeHtml`; a slot naming a field the form
 *  doesn't actually have (stale/forged) simply never matches and is a no-op for that one entry, not
 *  a partial-corruption risk. `.widget-form-field`/`.widget-form-field-error` are already
 *  form-generic class names (not `contact-form`-specific), so no change was needed here for the
 *  2026-08-31 generalization beyond moving the function. */
function showFieldErrors({ formHtml, fieldErrors }: { formHtml: string; fieldErrors: ReadonlyArray<{ field: string; message: string }> }, _optional = {}): string {
  return fieldErrors.reduce((updated, { field, message }) => {
    const fieldPattern = RegExp.escape(escapeHtml({ text: field }));
    const fieldErrorRegex = new RegExp(`(<div class="widget-form-field-error" data-field="${fieldPattern}"[^>]*) hidden></div>`, "i");
    return updated.replace(fieldErrorRegex, (_match, openTag: string) => `${openTag}>${escapeHtml({ text: message })}</div>`);
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
 *  to `String.prototype.replace` as a replacement-string argument. @complexity O(tag.length).
 *
 *  BUG FIX (2026-09-05, Gemini audit finding #5): the existing-attribute check used to be
 *  `/\bvalue="[^"]*"/i` — `\b` is a boundary between a word char and a non-word char, not "start of
 *  attribute name," so it also matched mid-attribute-name (`data-default-value="x"` has a `\b` right
 *  before "value" because `-` precedes it), silently corrupting a theme author's own custom
 *  `data-*-value` attribute in place instead of adding a real `value=`. It also required double
 *  quotes, so a hand-authored `value='old'` (single-quoted) was invisible to this check and got a
 *  SECOND, double-quoted `value=` appended below — regressing the exact stale-value-wins bug already
 *  fixed once for double quotes (browsers only honor the first same-named attribute). Requiring a
 *  literal preceding whitespace character (the actual attribute-name boundary in HTML) rather than
 *  `\b`, and matching either quote character via a backreference, fixed both without touching the
 *  "no existing attribute" branch below.
 *
 *  BUG FIX (2026-09-06): that same-day fix's own value-body class, `[^"']*`, excluded BOTH quote
 *  characters instead of just the one delimiting THIS attribute — so `value="Don't know"` (a
 *  double-quoted value containing a legitimate apostrophe) could not be spanned by `[^"']*` at all: it
 *  stops at the embedded `'`, backtracking never finds a `"` there, and the whole match fails. That
 *  re-creates the exact append-a-second-`value=` bug this function's own doc already describes as
 *  fixed, just gated on "value contains the OTHER quote character" instead of "value uses the OTHER
 *  quote style." Fixed by matching each quote style as its own alternative — `"[^"]*"` or `'[^']*'` —
 *  so the body only ever excludes the ONE character that would end that particular alternative, not
 *  both, letting a double-quoted value safely contain an apostrophe (and a single-quoted value safely
 *  contain a double quote). No backreference is needed anymore since each alternative already commits
 *  to a specific delimiter pair. Unquoted `value=old` attributes are a separate, pre-existing gap (not
 *  introduced or widened by this fix) — grepping every theme's HTML for an unquoted `value=` attribute
 *  found zero occurrences, so it's left out of scope rather than folded into this change. */
function setInputValueAttr({ tag, escapedValue }: { tag: string; escapedValue: string }, _optional = {}): string {
  const existingValueAttr = /(\s)value=("[^"]*"|'[^']*')/i;
  if (existingValueAttr.test(tag)) {
    return tag.replace(existingValueAttr, (_match, leadingSpace: string) => `${leadingSpace}value="${escapedValue}"`);
  }
  const selfClosing = /\/>$/.test(tag);
  const beforeClose = tag.slice(0, tag.length - (selfClosing ? 2 : 1)).trimEnd();
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
function showOneFieldValue({ html, field, value }: { html: string; field: string; value: string }, _optional = {}): string {
  const fieldPattern = RegExp.escape(escapeHtml({ text: field }));
  const escapedValue = escapeHtml({ text: value });
  const textareaRegex = new RegExp(`(<textarea\\b[^>]*\\bname="${fieldPattern}"[^>]*>)[\\s\\S]*?(<\\/textarea>)`, "i");
  const withTextarea = html.replace(textareaRegex, (_match, openTag: string, closeTag: string) => `${openTag}${escapedValue}${closeTag}`);
  if (withTextarea !== html) return withTextarea;
  const inputRegex = new RegExp(`<input\\b[^>]*\\bname="${fieldPattern}"[^>]*>`, "i");
  return html.replace(inputRegex, (matchedTag: string) => setInputValueAttr({ tag: matchedTag, escapedValue }));
}

/** Re-populates every field named in `values` (already filtered to repopulatable, non-sensitive
 *  field types and HTML-escaped-safe raw strings by the caller — see `forms-submit.ts`'s
 *  `buildFormFlashValues`) into `formHtml`. `undefined` (no flash present, or a plain success/
 *  rate-limited/error result) is a byte-identical no-op. @complexity O(n) reduce over `values`'
 *  entries, each doing {@link showOneFieldValue}'s own bounded work. */
function showFieldValues({ formHtml, values }: { formHtml: string; values: Readonly<Record<string, string>> | undefined }, _optional = {}): string {
  if (!values) return formHtml;
  return Object.entries(values).reduce((updated, [field, value]) => showOneFieldValue({ html: updated, field, value }), formHtml);
}

/** The `"validation"` outcome for one matched `<form>` block: per-field messages (labels read from
 *  the form's own markup, copy in the document's language), re-populated values, and the summary.
 *  An HTML-mode form (`data-tovu-form`) lists every message in its summary; a Builder form shows the
 *  generic line because its per-field messages already sit beside each field. A result with no field
 *  errors still produces one generic "check this field" message. @complexity O(formHtml.length) per
 *  field error. */
function showValidationResult(
  { html, originalForm, slugPattern, result }: { html: string; originalForm: string; slugPattern: string; result: Extract<FormSubmissionRedirectResult, { kind: "validation" }> },
): string {
  const authored = originalForm.includes("data-tovu-form=");
  const messages = formValidationMessages({
    formHtml: originalForm,
    errors: result.fieldErrors.length ? result.fieldErrors : [{ field: "", reason: "invalid" }],
    locale: formDocumentLocale({ html }),
  });
  return showFormErrorSummary({ formHtml: showFieldValues({ formHtml: showFieldErrors({ formHtml: originalForm, fieldErrors: messages }), values: result.values }), slugPattern, message: authored ? messages.map(({ message }) => escapeHtml({ text: message })).join(" ") : "Please fix the highlighted fields below." });
}

/** Rebuilds the one matched `<form>` block for `result`'s outcome (success hides it; every other
 *  outcome reveals its error summary). The success MESSAGE slot sits outside the form and is shown
 *  separately by the caller. @complexity O(formHtml.length), plus {@link showValidationResult}'s own
 *  work for `"validation"`. */
function updateFormForResult(
  { html, originalForm, slugPattern, result }: { html: string; originalForm: string; slugPattern: string; result: FormSubmissionRedirectResult },
): string {
  if (result.kind === "success") return hideFormElement({ formHtml: originalForm });
  if (result.kind === "validation") return showValidationResult({ html, originalForm, slugPattern, result });
  if (result.kind === "too-fast") return showFormErrorSummary({ formHtml: showFieldValues({ formHtml: originalForm, values: result.values }), slugPattern, message: FORM_SUBMISSION_TOO_FAST_MESSAGE });
  if (result.kind === "rate-limited") {
    const plural = result.retryAfterSeconds === 1 ? "" : "s";
    return showFormErrorSummary({ formHtml: originalForm, slugPattern, message: `Too many submissions — please try again in ${result.retryAfterSeconds} second${plural}.` });
  }
  return showFormErrorSummary({ formHtml: originalForm, slugPattern, message: "Something went wrong — please try again." });
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
export function injectFormSubmissionResultIntoHtml({ html, result }: { html: string; result: FormSubmissionRedirectResult | undefined }, _optional = {}): string {
  if (!result) return html;
  const slugPattern = RegExp.escape(escapeHtml({ text: result.slug }));
  const formRegex = new RegExp(`<form\\b[^>]*${FORM_SLUG_ATTR}="${slugPattern}"[^>]*>[\\s\\S]*?<\\/form>`, "i");
  const formMatch = formRegex.exec(html);
  if (!formMatch) return html;
  const originalForm = formMatch[0];

  const updatedForm = updateFormForResult({ html, originalForm, slugPattern, result });

  // The success slot sits BEFORE the `<form>` in document order, so it must be revealed as a
  // SEPARATE regex pass over the already-rebuilt string, never by combining offsets from two
  // different splices into one manual slice — `formMatch.index` was measured against the ORIGINAL
  // `html`, and no longer lines up with anything once an earlier edit shifts every byte after it.
  const withUpdatedForm = html.slice(0, formMatch.index) + updatedForm + html.slice(formMatch.index + originalForm.length);
  return result.kind === "success" ? showFormSuccessMessage({ html: withUpdatedForm, slugPattern }) : withUpdatedForm;
}

/** Every public form's opening tag: both renderers (Builder and HTML mode) stamp `${FORM_SLUG_ATTR}`. */
const FORM_OPENING_TAG = new RegExp(`<form\\b[^>]*\\b${FORM_SLUG_ATTR}="([^"]*)"[^>]*>`, "gi");

/**
 * Puts a fresh hidden `_attempt` token first inside every public form on a page being served, so the
 * submit route can tell a double-clicked Send (one token, twice) from two real submissions (two
 * page loads). See `Jini packages/cms/src/forms/submission-attempts.ts` for the dedupe it feeds and its fallback.
 *
 * Applied per response, after rendering, because neither form renderer has a request in scope and
 * a rendered body must stay identical for every visitor up to this point. A page a shared cache
 * replays repeats its token; that only falls back to the old same-IP-and-body comparison.
 * `newToken` receives the form slug so composition can register server issuance while generating
 * the token. Generation errors propagate; no client timestamp or extra control is introduced.
 * @complexity O(html.length) — one regex pass; one `newToken()` call per form.
 */
export function injectFormAttemptTokens(
  { html, newToken }: { html: string; newToken: (required: { slug: string }, optional?: Record<string, never>) => string },
  _optional: Record<string, never> = {},
): string {
  return html.replace(
    FORM_OPENING_TAG,
    (openTag, slug: string) => `${openTag}<input type="hidden" name="${FORM_ATTEMPT_FIELD}" value="${escapeHtml({ text: newToken({ slug }, {}) })}">`,
  );
}

/** One visible text control's `maxlength`: an author's own attribute stays; otherwise the cap the
 *  submit route enforces (`features/forms/field-length-caps.ts`). Hidden inputs have nothing to show. */
function stampControlMaxLength({ tag, caps }: { tag: string; caps: ReadonlyMap<string, number> }, _optional = {}): string {
  const max = caps.get(/\sname="([^"]*)"/i.exec(tag)?.[1] ?? "");
  if (max === undefined || /\smaxlength\s*=/i.test(tag) || /\stype="hidden"/i.test(tag)) return tag;
  const selfClosing = /\/>$/.test(tag);
  return `${tag.slice(0, tag.length - (selfClosing ? 2 : 1)).trimEnd()} maxlength="${max}"${selfClosing ? "/>" : ">"}`;
}

/** Adds `maxlength` to every text input/textarea of a rendered public form (Builder or HTML mode) so
 *  the browser stops typing at the same cap the server refuses past. Browsers count UTF-16 units here
 *  while the server counts code points, so the browser is never the looser of the two.
 *  @complexity O(html.length + fields). */
export function stampFormFieldMaxLengths({ html, fields }: { html: string; fields: readonly FieldDescriptor[] }, _optional = {}): string {
  const caps = new Map<string, number>();
  for (const field of fields) {
    const max = typeof field === "object" && field !== null ? fieldMaxChars({ field }) : undefined;
    if (max !== undefined) caps.set(field.id, max);
  }
  return html.replace(/<(?:input|textarea)\b[^>]*>/gi, (tag) => stampControlMaxLength({ tag, caps }));
}
