import assert from "node:assert/strict";
import test from "node:test";

import { renderHtmlForm } from "#src/features/forms/html-render";
import { injectFormAttemptTokens, injectFormSubmissionResultIntoHtml } from "../form-render.js";
import { renderWidgetIr } from "../render.js";

/**
 * @file The per-response `_attempt` token every public form carries (2026-10-05 double-submit fix):
 * both renderers' forms receive one, each form its own, inside the form so a native POST sends it,
 * and nothing that is not a public form is touched.
 */

function counter() {
  let n = 0;
  return () => `tok-${++n}`;
}

const builderForm = () => renderWidgetIr({ componentId: "contact-form", props: {
  slug: "contact", fields: [{ id: "email", label: "Email", type: "email", required: true }],
} });
const htmlModeForm = () => renderHtmlForm({ slug: "signup", action: "/forms/signup/submit", fields: [{ id: "email", label: "Email", type: "email", required: true }] });

test("injectFormAttemptTokens: a Builder form and an HTML-mode form each get their own hidden token as their first child", () => {
  const html = injectFormAttemptTokens(`<main>${builderForm()}${htmlModeForm()}</main>`, { newToken: counter() });

  const forms = [...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)].map((match) => match[0]);
  assert.equal(forms.length, 2);
  assert.match(forms[0]!, /data-form-slug="contact"[^>]*><input type="hidden" name="_attempt" value="tok-1">/);
  assert.match(forms[1]!, /data-form-slug="signup"[^>]*><input type="hidden" name="_attempt" value="tok-2">/);
});

test("injectFormAttemptTokens: a form without the public form hook, and a page without forms, come back unchanged", () => {
  const html = `<p>no forms</p><form action="/search" method="get"><input name="q"></form>`;
  assert.equal(injectFormAttemptTokens(html, { newToken: () => assert.fail("no token for a non-public form") }), html);
});

test("injectFormAttemptTokens: the token is HTML-escaped", () => {
  const html = injectFormAttemptTokens(builderForm(), { newToken: () => `"><script>` });
  assert.match(html, /name="_attempt" value="&quot;&gt;&lt;script&gt;"/);
});

test("injectFormAttemptTokens: composes with a success result splice (the form is hidden, the token still inside it)", () => {
  const html = injectFormAttemptTokens(injectFormSubmissionResultIntoHtml(builderForm(), { kind: "success", slug: "contact" }), { newToken: counter() });
  assert.match(html, /<form hidden [^>]*><input type="hidden" name="_attempt" value="tok-1">/);
});
