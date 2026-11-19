import assert from "node:assert/strict";
import { test } from "node:test";
import { exportHtml } from "../export-html-policy.js";

/** @file Exported pages carry no WebMCP: the marked script and all five native form-tool attributes are removed, every other byte stays. */

const PAGE = '<html><head><link rel="canonical" href="/about"><script data-tovu-webmcp-script>x()</script></head>'
  + '<body><form toolname="t" tooldescription="d" toolautosubmit toolparamtitle="p" toolparamdescription="q" action="/s"><input name="n"></form></body></html>';
const FORM = '<body><form      action="/s"><input name="n"></form></body></html>';

test("with a public origin: WebMCP removed, canonical made absolute", () => {
  assert.equal(exportHtml({ html: PAGE, publicOrigin: "https://example.com" }),
    `<html><head><link rel="canonical" href="https://example.com/about"></head>${FORM}`);
});

test("without a public origin: WebMCP removed, canonical omitted", () => {
  assert.equal(exportHtml({ html: PAGE }), `<html><head></head>${FORM}`);
});
