import assert from "node:assert/strict";
import test from "node:test";

import { escapeHtml, escapeXml } from "@jini-ai/core/text";

// The one HTML/XML escaper the public renderers, exporter, store, newsletter pages and MCP-UI dialog
// share. It replaced twelve hand-rolled copies (build-vs-borrow-verified 2026-09-28 §3).

test("escapeHtml: escapes all five special characters, apostrophe as numeric &#39;", () => {
  assert.equal(escapeHtml({ text: `&<>"'` }), "&amp;&lt;&gt;&quot;&#39;");
});

test("escapeHtml: & is escaped first, so an existing entity is escaped once, not twice", () => {
  assert.equal(escapeHtml({ text: "&lt; <" }), "&amp;lt; &lt;");
});

test("escapeHtml: plain text and non-ASCII pass through unchanged", () => {
  assert.equal(escapeHtml({ text: "Café Münster 123" }), "Café Münster 123");
  assert.equal(escapeHtml({ text: "" }), "");
});

test("escapeXml: same set, apostrophe as the XML named entity &apos; (sitemap bytes)", () => {
  assert.equal(escapeXml({ text: `&<>"'` }), "&amp;&lt;&gt;&quot;&apos;");
  assert.equal(escapeXml({ text: "https://a.example/?a=1&b=2" }), "https://a.example/?a=1&amp;b=2");
});

test("escapeXml: empty and plain Unicode text pass through unchanged", () => {
  assert.equal(escapeXml({ text: "" }), "");
  assert.equal(escapeXml({ text: "Café 日本語 123" }), "Café 日本語 123");
});
