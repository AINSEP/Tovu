import assert from "node:assert/strict";
import test from "node:test";
import { injectFormSubmissionResultIntoHtml, encodeFormSubmissionResultQuery, decodeFormSubmissionResultFromQuery } from "../form-render.js";
import { FORM_VALIDATION_COPY } from "../form-validation-i18n.js";

test("native HTML validation uses authored labels and sentences, with localized document language", () => {
  const form = '<form data-tovu-form="contact" data-form-slug="contact"><div data-tovu-form-error data-form-slug="contact" role="alert" hidden></div><label for="email-id">Your email</label><input name="internal_email" id="email-id"></form>';
  const result = { kind: "validation" as const, slug: "contact", fieldErrors: [{ field: "internal_email", reason: "required" }] };
  assert.match(injectFormSubmissionResultIntoHtml(form, result), /Please enter your email\./);
  const spanish = injectFormSubmissionResultIntoHtml(`<html lang="es-MX">${form}</html>`, result);
  assert.match(spanish, /Introduce Your email\./);
  assert.doesNotMatch(spanish, /internal_email: required|Please check your answers/);
  const params = encodeFormSubmissionResultQuery(result);
  assert.deepEqual(decodeFormSubmissionResultFromQuery(Object.fromEntries(params)), result);
});

test("validation safely escapes labels, never echoes forged error text or unknown machine field ids", () => {
  const html = '<form data-tovu-form="contact" data-form-slug="contact"><div data-tovu-form-error data-form-slug="contact" hidden></div><label>Work &amp; &lt;email&gt;<input name="email"></label></form>';
  const actual = injectFormSubmissionResultIntoHtml(html, { kind: "validation", slug: "contact", fieldErrors: [
    { field: "email", reason: "<script>bad</script>" }, { field: "forged_secret", reason: "required" },
  ] });
  assert.match(actual, /Please check Work &amp; &lt;email&gt;\./);
  assert.match(actual, /Please enter this field\./);
  assert.doesNotMatch(actual, /<script>bad|forged_secret/);
});

test("every supported public-form locale supplies all validation instructions", () => {
  assert.equal(Object.keys(FORM_VALIDATION_COPY).length, 22);
  for (const [locale, copy] of Object.entries(FORM_VALIDATION_COPY)) {
    assert.equal(copy.length, 5, locale);
    for (const template of copy.slice(0, 4)) assert.ok(template.includes("{label}"), locale);
    assert.ok(copy[4].length > 0, locale);
  }
});
