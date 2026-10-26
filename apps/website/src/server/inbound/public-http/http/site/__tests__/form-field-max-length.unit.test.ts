/** Public forms show the length caps the submit route enforces (owner 2026-10-25, spam protection). */
import assert from "node:assert/strict";
import test from "node:test";
import { stampFormFieldMaxLengths } from "../form-render.js";
import { formValidationMessages } from "../form-validation-message.js";
import { injectFormSubmissionResultIntoHtml, renderWidgetIr } from "../render.js";

const FIELDS = [
  { id: "name", label: "Name", type: "text", required: true },
  { id: "email", label: "Email", type: "email", required: true },
  { id: "message", label: "Message", type: "textarea", required: true },
  { id: "code", label: "Code", type: "text", required: false, maxLength: 8 },
  { id: "age", label: "Age", type: "number", required: false },
];

const tagFor = (html: string, name: string) => new RegExp(`<(?:input|textarea)\\b[^>]*\\sname="${name}"[^>]*>`).exec(html)?.[0] ?? "";

test("Builder forms render maxlength on every text field: defaults, per-field override, none on non-text", () => {
  const html = renderWidgetIr({ componentId: "contact-form", props: { slug: "contact", fields: FIELDS } });
  assert.match(tagFor(html, "name"), /\smaxlength="100"/);
  assert.match(tagFor(html, "email"), /\smaxlength="100"/);
  assert.match(tagFor(html, "message"), /^<textarea\b[^>]*\smaxlength="2000"/);
  assert.match(tagFor(html, "code"), /\smaxlength="8"/);
  assert.equal((tagFor(html, "code").match(/maxlength=/g) ?? []).length, 1, "the field's own maxlength is not duplicated");
  assert.doesNotMatch(tagFor(html, "age"), /maxlength/);
  assert.doesNotMatch(tagFor(html, "_hp"), /maxlength/, "the honeypot is not a declared field");
});

test("HTML-mode forms get the cap on authored controls but keep an author's own maxlength", () => {
  const html = renderWidgetIr({ componentId: "contact-form", props: {
    slug: "authored", mode: "html",
    fields: [{ id: "name", label: "Name", type: "text", required: false }, { id: "note", label: "Note", type: "textarea", required: false }, { id: "nick", label: "Nick", type: "text", required: false, maxLength: 20 }],
    html: '<input type="text" name="name"/><textarea name="note"></textarea><input name="nick" maxlength="20">',
  } });
  assert.match(tagFor(html, "name"), /^<input type="text" name="name" maxlength="100"\/>$/);
  assert.match(tagFor(html, "note"), /^<textarea name="note" maxlength="2000">$/);
  assert.equal(tagFor(html, "nick"), '<input name="nick" maxlength="20">');
});

test("hidden inputs and undeclared controls are left alone", () => {
  const fields = [{ id: "ref", label: "Ref", type: "hidden", required: false }] as Parameters<typeof stampFormFieldMaxLengths>[1];
  const html = '<input type="hidden" name="ref" value="x"><input name="other">';
  assert.equal(stampFormFieldMaxLengths(html, fields), html);
});

test("a too_long error names the field's limit; a control without maxlength keeps the plain copy", () => {
  const html = renderWidgetIr({ componentId: "contact-form", props: { slug: "contact", fields: FIELDS } });
  const updated = injectFormSubmissionResultIntoHtml(html, { kind: "validation", slug: "contact", fieldErrors: [{ field: "message", reason: "too_long" }] });
  assert.ok(updated.includes('id="widget-contact-message-error">Please keep Message to 2000 characters or fewer.</div>'));
  const plain = '<form><input name="topic" aria-label="Topic"></form>';
  assert.deepEqual(formValidationMessages({ formHtml: plain, locale: "en", errors: [{ field: "topic", reason: "too_long" }] }), [{ field: "topic", message: "Please shorten Topic." }]);
  const fr = '<form lang="fr"><input name="nom" aria-label="Nom" maxlength="100"></form>';
  assert.deepEqual(formValidationMessages({ formHtml: fr, locale: "en", errors: [{ field: "nom", reason: "too_long" }] }), [{ field: "nom", message: "Veuillez raccourcir Nom à 100 caractères maximum." }]);
});
