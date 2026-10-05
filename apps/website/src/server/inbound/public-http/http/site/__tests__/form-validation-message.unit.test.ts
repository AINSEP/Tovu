import assert from "node:assert/strict";
import test from "node:test";
import { formDocumentLocale, formValidationMessages } from "../form-validation-message.js";

// Direct tests for the public form error copy: labels come from the rendered form's markup
// (aria-label, label[for], wrapping label), copy follows the form's or document's language.
const message = (formHtml: string, reason = "required", locale = "en", field = "f") => formValidationMessages({ formHtml, errors: [{ field, reason }], locale })[0]!.message;

test("each error maps to one message, in order, keyed by its field", () => {
  assert.deepEqual(formValidationMessages({
    formHtml: '<form><input name="a" aria-label="Alpha"><input name="b" aria-label="Beta"></form>',
    errors: [{ field: "b", reason: "too_long" }, { field: "a", reason: "required" }],
    locale: "en",
  }), [{ field: "b", message: "Please shorten Beta." }, { field: "a", message: "Please enter Alpha." }]);
  assert.deepEqual(formValidationMessages({ formHtml: "<form></form>", errors: [], locale: "en" }), []);
});

test("the reason picks the template; required checkboxes ask to select", () => {
  const html = '<input name="f" aria-label="Topic">';
  assert.equal(message(html, "required"), "Please enter Topic.");
  assert.equal(message(html, "too_long"), "Please shorten Topic.");
  assert.equal(message(html, "invalid_email"), "Please check Topic.");
  assert.equal(message('<input type="CheckBox" name="f" aria-label="Terms">', "required"), "Please select Terms.");
  assert.equal(message('<input type="checkbox" name="f" aria-label="Terms">', "invalid"), "Please check Terms.");
});

test("aria-label wins over label[for], which wins over a wrapping label", () => {
  assert.equal(message('<label for="x">For label</label><label>Wrap <input id="x" name="f" aria-label="Aria"></label>'), "Please enter Aria.");
  assert.equal(message('<label>Wrap <input id="x" name="f"></label><label for="x">For label</label>'), "Please enter For label.");
  assert.equal(message('<label for="other">Other</label><label>Wrap <div><textarea id="x" name="f">draft</textarea></div></label>'), "Please enter Wrap.");
  assert.equal(message('<label>Choose <select name="f"><option>Red</option></select></label>'), "Please enter Choose.");
});

test("label text skips controls, scripts, styles and templates but keeps nested text and entities", () => {
  assert.equal(message('<label for="x"><b>Full</b> <i>name</i><style>.a{}</style><script>bad()</script><template>t</template><input name="g"> &amp; title *</label><input id="x" name="f">'), "Please enter Full name & title.");
});

test("a missing control, an unlabeled control or an empty label falls back to the generic noun", () => {
  assert.equal(message('<input name="other" aria-label="Other">'), "Please enter this field.");
  assert.equal(message('<input name="f">'), "Please enter this field.");
  assert.equal(message('<label for="x"> * </label><input id="x" name="f">'), "Please enter this field.");
  assert.equal(message('<input name="f" aria-label="">'), "Please enter this field.");
  // Template contents are inert, so the live control's label is used.
  assert.equal(message('<template><input name="f" aria-label="Hidden"></template><input name="f" aria-label="Live">'), "Please enter Live.");
});

test("English copy turns Email and Your ... labels into natural phrases", () => {
  assert.equal(message('<input name="f" aria-label="EMAIL">'), "Please enter your email.");
  assert.equal(message('<label for="x">Your full name *</label><input id="x" name="f">'), "Please enter your full name.");
  assert.equal(message('<input name="f" aria-label="Yourself">'), "Please enter Yourself.");
  // An unknown locale falls back to English, including the phrasing.
  assert.equal(message('<input name="f" aria-label="Email">', "required", "xx"), "Please enter your email.");
});

test("the form's lang attribute beats the document locale, and other languages keep labels verbatim", () => {
  assert.equal(message('<form lang="de"><input name="f" aria-label="Email"></form>', "required", "fr"), "Bitte füllen Sie Email aus.");
  assert.equal(message('<form><input name="f" aria-label="Your name"></form>', "required", "fr"), "Veuillez renseigner Your name.");
  assert.equal(message('<form lang=""><input name="f" aria-label="Nom"></form>', "too_long", "fr"), "Veuillez raccourcir Nom.");
  assert.equal(message('<form lang="ja"><input type="checkbox" name="f" aria-label="規約"></form>'), "規約を選択してください。");
});

test("label text is inserted literally, never as a replacement pattern", () => {
  assert.equal(message('<input name="f" aria-label="Price $& $1 $$">'), "Please enter Price $& $1 $$.");
});

test("formDocumentLocale reads the html element's lang in any quoting, defaulting to en", () => {
  assert.equal(formDocumentLocale({ html: '<!doctype html><html class="a" lang="pt-BR"><body>' }), "pt-BR");
  assert.equal(formDocumentLocale({ html: "<html lang='es'>" }), "es");
  assert.equal(formDocumentLocale({ html: "<HTML data-x=1 LANG = ja>" }), "ja");
  assert.equal(formDocumentLocale({ html: '<html lang="">' }), "en");
  assert.equal(formDocumentLocale({ html: '<html><body lang="de">' }), "en");
  assert.equal(formDocumentLocale({ html: '<htmlx lang="de">' }), "en");
  assert.equal(formDocumentLocale({ html: "" }), "en");
});
