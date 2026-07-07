import assert from "node:assert/strict";
import test from "node:test";

import type { JsonObject } from "../../../../core/ports";
import { renderDocNode } from "../render";

function textDoc(...content: JsonObject[]): JsonObject {
  return { type: "doc", content: [{ type: "paragraph", content }] };
}

test("renderDocNode: bold/italic/code marks still render (regression)", () => {
  const html = renderDocNode(
    textDoc(
      { type: "text", text: "b", marks: [{ type: "bold" }] },
      { type: "text", text: "i", marks: [{ type: "italic" }] },
      { type: "text", text: "c", marks: [{ type: "code" }] }
    )
  );
  assert.equal(html, "<p><strong>b</strong><em>i</em><code>c</code></p>");
});

test("C7: a link mark renders an anchor with its href", () => {
  const html = renderDocNode(
    textDoc({ type: "text", text: "plugins", marks: [{ type: "link", attrs: { href: "/how-plugins-work" } }] })
  );
  assert.equal(html, '<p><a href="/how-plugins-work">plugins</a></p>');
});

test("C7: relative, http(s) and mailto hrefs are allowed; text is escaped", () => {
  for (const href of ["/about", "#top", "https://tovu.dev", "http://x.io", "mailto:a@b.co"]) {
    const html = renderDocNode(
      textDoc({ type: "text", text: "<x>", marks: [{ type: "link", attrs: { href } }] })
    );
    assert.equal(html, `<p><a href="${href}">&lt;x&gt;</a></p>`);
  }
});

test("C7: javascript:, data: and non-string hrefs collapse to '#' (no script smuggling)", () => {
  for (const href of ["javascript:alert(1)", "data:text/html,<script>", "  javascript:alert(1)", 42, null, undefined]) {
    const html = renderDocNode(
      textDoc({ type: "text", text: "x", marks: [{ type: "link", attrs: { href } as never }] })
    );
    assert.equal(html, '<p><a href="#">x</a></p>');
  }
});

test("C7: link composes with an emphasis mark on the same text", () => {
  const html = renderDocNode(
    textDoc({ type: "text", text: "here", marks: [{ type: "bold" }, { type: "link", attrs: { href: "/x" } }] })
  );
  assert.equal(html, '<p><a href="/x"><strong>here</strong></a></p>');
});
