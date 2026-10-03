import assert from "node:assert/strict";
import test from "node:test";
import { extractPlainTextFromHtml } from "../html-plain-text.js";

test("HTML text preserves prose around multiple nested headers and removes scripts and styles", () => {
  assert.equal(extractPlainTextFromHtml('Before<div class="x post-detail-header"><div>Title</div>Date</div>Middle<header class="post-detail-header">Other</header><script>secret()</script><style>.secret{}</style><p>A&amp;B &#x1F600; &unknown;</p>After').replace(/\s+/g, " ").trim(),
    "Before Middle A&B 😀 &unknown; After");
});
test("an unclosed header preserves its prose rather than dropping the remainder", () => {
  assert.equal(extractPlainTextFromHtml('<div class="post-detail-header">Unclosed<p>Body</p>'), " Unclosed Body ");
});
// F1.2/F4.4: the entity alone is malformed; the surrounding stored HTML is valid.
for (const entity of ["&#1114112;", "&#9999999999;", "&#x110000;"]) {
  test(`BUG: out-of-range entity ${entity} passes through without crashing excerpt generation`, () => {
    assert.equal(extractPlainTextFromHtml(`<p>Before ${entity} after</p>`), ` Before ${entity} after `);
  });
}

// F4.4/F5.2: these are distinct class tokens, not the injected title/date header.
for (const className of ["post-detail-header-extra", "x-post-detail-header"]) {
  test(`BUG: prose in the distinct class ${className} is retained`, () => {
    assert.equal(extractPlainTextFromHtml(`<p>Before</p><div class="${className}">Kept prose</div><p>After</p>`)
      .replace(/\s+/g, " ").trim(), "Before Kept prose After");
  });
}

// F4.3: an unknown name that collides with Object.prototype must still be literal prose.
test("BUG: an unknown constructor entity remains unchanged instead of exposing a prototype value", () => {
  assert.equal(extractPlainTextFromHtml("<p>Keep &constructor; as text.</p>"), " Keep &constructor; as text. ");
});
