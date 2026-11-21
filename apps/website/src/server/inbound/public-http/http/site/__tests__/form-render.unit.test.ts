import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { FORM_RESULT_QUERY_KEYS } from "../form-wire-policy.js";

import { FORM_BASELINE_STYLE, FORM_SUCCESS_CLASS, FORM_ERROR_CLASS } from "../form-presentation-assets.js";
import { clearFormSubmissionResultQueryParams, decodeFormSubmissionResultFromQuery, encodeFormSubmissionResultQuery } from "@jini-ai/cms/forms/result-query";
import { decodeFormFlashCookieValue, encodeFormFlashCookieValue, mergeFormFlashIntoResult } from "@jini-ai/cms/forms/result-flash";
import { renderFormErrorSlot, renderFormSuccessSlot } from "@jini-ai/cms/forms/form-controls";
import { injectFormSubmissionResultIntoHtml } from "@jini-ai/cms/forms/result-html";
import { FORM_FEEDBACK, FORM_RESULT_MARKUP } from "../form-feedback-policy.js";

/**
 * @file Form-result query and flash-cookie boundaries, for the parts `render.test.ts`'s
 * round-trip tests cannot see.
 *
 * A round trip (encode → decode) passes even when encode writes too much, because decode caps and
 * clamps on its own. And `clearFormSubmissionResultQueryParams` had no direct test at all: if it
 * missed a key, a second submission from the same page would carry the first one's stale
 * `form_errors`/`form_retry_after` in its redirect Location.
 */

test("baseline style hides a hidden form or slot even when the theme sets display on it", () => {
  // BYHO's `.oh-form form{display:grid}` beat the UA [hidden] rule, so a sent form stayed visible.
  assert.ok(FORM_BASELINE_STYLE.includes(":where(.tovu-form[hidden],[data-form-slug][hidden]){display:none!important;}"));
});

test("clearFormSubmissionResultQueryParams removes all four form_* keys and keeps the page's own params", () => {
  const params = new URLSearchParams(
    "utm_source=mail&form=contact&form_status=validation&form_errors=%5B%5D&form_retry_after=30&page=2"
  );

  clearFormSubmissionResultQueryParams({ params, keys: FORM_RESULT_QUERY_KEYS });

  assert.equal(params.toString(), "utm_source=mail&page=2");
});

test("encode: success writes exactly the slug and status, no errors or retry key", () => {
  assert.equal(encodeFormSubmissionResultQuery({ result: { kind: "success", slug: "contact" }, keys: FORM_RESULT_QUERY_KEYS }).toString(), "form=contact&form_status=success");
});

test("timing retry round-trips without answers in the URL and restores eligible text with fixed copy", () => {
  const query = encodeFormSubmissionResultQuery({ result: { kind: "too-fast", slug: "contact", values: { name: "Ada" } }, keys: FORM_RESULT_QUERY_KEYS });
  assert.equal(query.toString(), "form=contact&form_status=too-fast");
  const result = decodeFormSubmissionResultFromQuery({ query: Object.fromEntries(query), keys: FORM_RESULT_QUERY_KEYS });
  assert.deepEqual(result, { kind: "too-fast", slug: "contact" });
  assert.deepEqual(mergeFormFlashIntoResult({ result, flash: { slug: "other", values: { name: "wrong" } } }), result);
  const merged = mergeFormFlashIntoResult({ result, flash: { slug: "contact", values: { name: "Ada <safe>" } } });
  const html = '<form data-form-slug="contact"><div class="tovu-form-error" data-form-slug="contact" hidden></div><input name="name"><input type="file" name="photo"></form>';
  assert.equal(injectFormSubmissionResultIntoHtml({ html, result: merged, markup: FORM_RESULT_MARKUP, feedback: FORM_FEEDBACK }), '<form data-form-slug="contact"><div class="tovu-form-error" data-form-slug="contact">Please wait a moment, then submit again.</div><input name="name" value="Ada &lt;safe&gt;"><input type="file" name="photo"></form>');
  const authored = '<form data-tovu-form data-form-slug="contact"><div data-tovu-form-error data-form-slug="contact" hidden></div><input name="name"></form>';
  assert.equal(injectFormSubmissionResultIntoHtml({ html: authored, result, markup: FORM_RESULT_MARKUP, feedback: FORM_FEEDBACK }), '<form data-tovu-form data-form-slug="contact"><div data-tovu-form-error data-form-slug="contact">Please wait a moment, then submit again.</div><input name="name"></form>');
});

test("encode: validation writes at most 20 field errors — the first 20, in order", () => {
  const fieldErrors = Array.from({ length: 25 }, (_, i) => ({ field: `f${i}`, reason: "Required" }));

  const params = encodeFormSubmissionResultQuery({ result: { kind: "validation", slug: "contact", fieldErrors }, keys: FORM_RESULT_QUERY_KEYS });

  const written = JSON.parse(params.get("form_errors") ?? "null") as Array<{ field: string }>;
  assert.equal(written.length, 20);
  assert.equal(written[0].field, "f0");
  assert.equal(written[19].field, "f19");
  assert.equal(params.get("form_status"), "validation");
  assert.equal(params.has("form_retry_after"), false);
});

test("encode: rate-limited writes status 'rate_limited' and a whole, non-negative retry-after", () => {
  const fractional = encodeFormSubmissionResultQuery({ result: { kind: "rate-limited", slug: "contact", retryAfterSeconds: 12.9 }, keys: FORM_RESULT_QUERY_KEYS });
  assert.equal(fractional.get("form_status"), "rate_limited");
  assert.equal(fractional.get("form_retry_after"), "12");
  assert.equal(fractional.has("form_errors"), false);

  const negative = encodeFormSubmissionResultQuery({ result: { kind: "rate-limited", slug: "contact", retryAfterSeconds: -5 }, keys: FORM_RESULT_QUERY_KEYS });
  assert.equal(negative.get("form_retry_after"), "0");
});

test("decode: skips field errors without a non-empty string field and keeps valid errors", () => {
  const result = decodeFormSubmissionResultFromQuery({ query: {
    form: "contact",
    form_status: "validation",
    form_errors: JSON.stringify([
      null, [], true, { reason: "required" }, { field: "", reason: "required" },
      { field: 42, reason: "required" }, { field: "email", reason: "invalid" },
    ]),
  }, keys: FORM_RESULT_QUERY_KEYS });

  assert.deepEqual(result, {
    kind: "validation", slug: "contact", fieldErrors: [{ field: "email", reason: "invalid" }],
  });
});

test("decode: rejects field-error JSON over 4000 characters even when it is valid JSON", () => {
  const errors = [{ field: "email", reason: "required" }];
  const query = { form: "contact", form_status: "validation" };
  const raw = JSON.stringify(errors).padEnd(4000, " ");

  assert.deepEqual(decodeFormSubmissionResultFromQuery({ query: { ...query, form_errors: raw }, keys: FORM_RESULT_QUERY_KEYS }), {
    kind: "validation", slug: "contact", fieldErrors: errors,
  });
  assert.deepEqual(decodeFormSubmissionResultFromQuery({ query: { ...query, form_errors: `${raw} ` }, keys: FORM_RESULT_QUERY_KEYS }), {
    kind: "validation", slug: "contact", fieldErrors: [],
  });
});

test("decode: ignores a result without a non-empty string form slug", () => {
  for (const form of [undefined, "", 42, ["contact"]]) {
    assert.equal(decodeFormSubmissionResultFromQuery({ query: { form, form_status: "success" }, keys: FORM_RESULT_QUERY_KEYS }), undefined);
  }
});

test("decode flash: JSON null is ignored without throwing", () => {
  assert.equal(decodeFormFlashCookieValue({ raw: "null" }), undefined);
});

test("decode flash: rejects a missing, empty or non-string slug even with valid values", () => {
  for (const slug of [undefined, "", 42]) {
    assert.equal(decodeFormFlashCookieValue({ raw: JSON.stringify({ slug, values: { email: "ada@example.com" } }) }), undefined);
  }
});

test("slots: a widget's extra classes and attributes are emitted beside the generic hooks", () => {
  assert.equal(
    renderFormSuccessSlot({ slug: "s", message: "Thanks", className: FORM_SUCCESS_CLASS }, { extraClasses: "legacy-success", extraAttrs: 'data-legacy="s"' }),
    '<div class="jini-form-success legacy-success" data-form-slug="s" data-legacy="s" hidden>Thanks</div>',
  );
  assert.equal(
    renderFormErrorSlot({ slug: "s", className: FORM_ERROR_CLASS }, { extraClasses: "legacy-error", extraAttrs: 'data-legacy="s"' }),
    '<div class="tovu-form-error legacy-error" data-form-slug="s" data-legacy="s" hidden></div>',
  );
});

test("slots: without extras only the generic class and slug attribute are emitted", () => {
  assert.equal(renderFormSuccessSlot({ slug: "s", message: "Thanks", className: FORM_SUCCESS_CLASS }), '<div class="jini-form-success" data-form-slug="s" hidden>Thanks</div>');
  assert.equal(renderFormErrorSlot({ slug: "s", className: FORM_ERROR_CLASS }), '<div class="tovu-form-error" data-form-slug="s" hidden></div>');
});

test("encode flash: a payload with no values sets no cookie", () => {
  assert.equal(encodeFormFlashCookieValue({ payload: { slug: "s", values: {} } }), undefined);
});

test("encode flash: a slug too long for the cookie on its own sets no cookie", () => {
  assert.equal(encodeFormFlashCookieValue({ payload: { slug: "s".repeat(3001), values: { name: "Ada" } } }), undefined);
});

// HTML-mode forms mark their slots with bare `data-jini-form-success`/`data-tovu-form-error`
// attributes instead of the Builder classes.
const htmlModeFormPage =
  '<div data-jini-form-success data-form-slug="s" hidden>Thanks</div>' +
  '<form data-tovu-form="s" data-form-slug="s"><div data-tovu-form-error data-form-slug="s" hidden></div></form>';

test("inject: success on an HTML-mode form reveals its bare success slot and hides the form", () => {
  assert.equal(
    injectFormSubmissionResultIntoHtml({ html: htmlModeFormPage, result: { kind: "success", slug: "s" }, markup: FORM_RESULT_MARKUP, feedback: FORM_FEEDBACK }),
    '<div data-jini-form-success data-form-slug="s">Thanks</div>' +
      '<form hidden data-tovu-form="s" data-form-slug="s"><div data-tovu-form-error data-form-slug="s" hidden></div></form>',
  );
});

test("inject: a one-second rate limit says 'second', not 'seconds'", () => {
  assert.equal(
    injectFormSubmissionResultIntoHtml({ html: htmlModeFormPage, result: { kind: "rate-limited", slug: "s", retryAfterSeconds: 1 }, markup: FORM_RESULT_MARKUP, feedback: FORM_FEEDBACK }),
    '<div data-jini-form-success data-form-slug="s" hidden>Thanks</div>' +
      '<form data-tovu-form="s" data-form-slug="s"><div data-tovu-form-error data-form-slug="s">Too many submissions — please try again in 1 second.</div></form>',
  );
});


test("encode flash: multibyte values obey the byte budget and preserve the earliest fields", () => {
  const value = "界".repeat(300);
  const json = encodeFormFlashCookieValue({ payload: { slug: "contact", values: { first: value, second: value, third: value, fourth: value } } });
  assert.ok(json);
  assert.ok(Buffer.byteLength(json, "utf8") <= 3000);
  assert.equal(json, JSON.stringify({ slug: "contact", values: { first: value, second: value, third: value } }));
});

test("decode query: field ids and reasons are each capped at 200 characters", () => {
  const result = decodeFormSubmissionResultFromQuery({ query: {
    form: "contact", form_status: "validation",
    form_errors: JSON.stringify([{ field: "f".repeat(201), reason: "r".repeat(201) }]),
  }, keys: FORM_RESULT_QUERY_KEYS });
  assert.deepEqual(result, {
    kind: "validation", slug: "contact", fieldErrors: [{ field: "f".repeat(200), reason: "r".repeat(200) }],
  });
});

test("a flash for another form cannot restore text into a timing retry", () => {
  const result = mergeFormFlashIntoResult({
    result: { kind: "too-fast", slug: "contact" },
    flash: { slug: "newsletter", values: { name: "Other form's answer" } },
  });
  const html = '<form data-form-slug="contact"><input name="name"></form>';
  assert.equal(injectFormSubmissionResultIntoHtml({ html, result, markup: FORM_RESULT_MARKUP, feedback: FORM_FEEDBACK }), html);
});

test("retry restores dollar text into one existing value and leaves a foreign form untouched", () => {
  const foreign = '<form data-form-slug="other"><input name="name" value="foreign"></form>';
  const html = foreign + '<form data-form-slug="s"><div class="tovu-form-error" data-form-slug="s" hidden></div><input name="name" value="old"><textarea name="note">old</textarea></form>';
  assert.equal(injectFormSubmissionResultIntoHtml({ html, result: {
    kind: "too-fast", slug: "s", values: { name: "$& $1", note: "$& $1" },
  }, markup: FORM_RESULT_MARKUP, feedback: FORM_FEEDBACK }), foreign + '<form data-form-slug="s"><div class="tovu-form-error" data-form-slug="s">Please wait a moment, then submit again.</div><input name="name" value="$&amp; $1"><textarea name="note">$&amp; $1</textarea></form>');
});
