import assert from "node:assert/strict";
import test from "node:test";

import { extractPlainTextFromHtml } from "../html-plain-text.js";

// pb1/F4.4: keep malformed references literal while decoding valid scalar boundaries.
test("BUG: HTML entity decoding accepts uppercase hex and preserves surrogate references", () => {
  assert.equal(extractPlainTextFromHtml("<p>&#X1F600; &#55296; &#xDFFF; &#x10FFFF;</p>"),
    " 😀 &#55296; &#xDFFF; \u{10FFFF} ");
});

// Class lists use HTML's ASCII whitespace, not regex word boundaries. Exercise a true header
// among lookalikes and a data-class attribute that must not hide the page's own prose.
test("BUG: only the exact header class token removes prose", () => {
  assert.equal(extractPlainTextFromHtml(
    '<section class="post-detail-header-extra">Kept first</section>' +
    '<div data-class="post-detail-header">Kept second</div>' +
    "<header id='meta' class='other\tpost-detail-header\nextra'><span>Hidden title</span></header>" +
    '<section class="x-post-detail-header">Kept last</section>',
  ).replace(/\s+/g, " ").trim(), "Kept first Kept second Kept last");
});
