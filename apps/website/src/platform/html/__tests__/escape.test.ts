import assert from "node:assert/strict";
import test from "node:test";

import { escapeHtml, escapeXml } from "../escape.js";

// The one HTML/XML escaper the public renderers, exporter, store, newsletter pages and MCP-UI dialog
// share. It replaced twelve hand-rolled copies (build-vs-borrow-verified 2026-09-28 §3).

test("escapeHtml: escapes all five special characters, apostrophe as numeric &#39;", () => {
  assert.equal(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
});

test("escapeHtml: & is escaped first, so an existing entity is escaped once, not twice", () => {
  assert.equal(escapeHtml("&lt; <"), "&amp;lt; &lt;");
});

test("escapeHtml: plain text and non-ASCII pass through unchanged", () => {
  assert.equal(escapeHtml("Café Münster 123"), "Café Münster 123");
  assert.equal(escapeHtml(""), "");
});

test("escapeXml: same set, apostrophe as the XML named entity &apos; (sitemap bytes)", () => {
  assert.equal(escapeXml(`&<>"'`), "&amp;&lt;&gt;&quot;&apos;");
  assert.equal(escapeXml("https://a.example/?a=1&b=2"), "https://a.example/?a=1&amp;b=2");
});
