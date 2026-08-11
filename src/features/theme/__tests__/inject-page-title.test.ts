import assert from "node:assert/strict";
import test from "node:test";

import { injectPageTitle } from "../static-render";

/**
 * @file Certifies {@link injectPageTitle}, substituting a template's `<title>` placeholder with the
 * rendered row's own real title (Task, 2026-08-11: without this, a Page rendered through `basic`'s
 * new `page-shell.html` would show the template's hardcoded title in every browser tab, reintroducing
 * the exact "Blog post — Basic" class of bug Task 1's render-gate fix eliminated for the
 * pre-templated render path). Runs for both Posts and Pages since the same-day marker unification —
 * see this function's own doc in `static-render.ts`.
 */

test("substitutes the placeholder inside <title> with the real title", () => {
  const template = "<head><title>{{title}}</title></head>";
  assert.equal(injectPageTitle(template, "FAQ"), "<head><title>FAQ</title></head>");
});

test("HTML-escapes a title carrying reserved characters", () => {
  const template = "<title>{{title}}</title>";
  assert.equal(injectPageTitle(template, 'Terms & "Conditions" <2026>'), "<title>Terms &amp; &quot;Conditions&quot; &lt;2026&gt;</title>");
});

test("REGRESSION GUARD: a template with no placeholder is returned unchanged", () => {
  const template = "<head><title>Fixed Title</title></head>";
  assert.equal(injectPageTitle(template, "FAQ"), template);
});

test("REGRESSION GUARD: an authoring comment that mentions the placeholder as prose does not shadow the real <title> slot", () => {
  // The exact bug caught while authoring basic/pages/page-shell.html: an explanatory HTML comment
  // referencing the placeholder token as text sits BEFORE the real <title> tag in document order. A
  // bare `.replace("{{title}}", ...)` matches whichever occurrence comes first — the comment's prose,
  // not the real slot — and silently leaves the actual <title> unfilled. The fix scopes the match to
  // the whole `<title>{{title}}</title>` element, so an incidental mention elsewhere is structurally
  // unable to collide with it.
  const template = "<!-- the title placeholder is {{title}} --><title>{{title}}</title>";
  const out = injectPageTitle(template, "FAQ");
  assert.ok(out.includes("<title>FAQ</title>"), "the real <title> tag must be filled");
  assert.ok(out.includes("<!-- the title placeholder is {{title}} -->"), "the comment's own prose is untouched");
});

test("a title that is itself the literal placeholder text renders as that literal string, not a second substitution", () => {
  // Guards the naive alternative implementation (find-then-replace-again) that would recurse into its
  // own output for this specific input. The chosen implementation matches once, up front, so this is
  // not actually reachable with the current regex-based match, but pins the contract explicitly.
  const template = "<title>{{title}}</title>";
  assert.equal(injectPageTitle(template, "{{title}}"), "<title>{{title}}</title>");
});
