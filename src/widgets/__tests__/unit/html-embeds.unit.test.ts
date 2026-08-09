import assert from "node:assert/strict";
import test from "node:test";

import { MAX_HTML_EMBEDS_PER_PAGE, scanHtmlEmbeds, substituteHtmlEmbeds } from "../../html-embeds";

/**
 * @file SPEC-047 Slice 2 (generalized 2026-08-07) — `html-embeds.ts`'s `data-embed-type`
 * scan/substitute pair, tested as the pure string functions they are (no repo, no resolver — see
 * `resolve-html-page-embeds.integration.test.ts` for the resolution-layer coverage).
 */

test("scanHtmlEmbeds: finds a widget embed and a form embed, in document order", () => {
  const refs = scanHtmlEmbeds(
    '<p>intro</p><div data-embed-type="widget" data-embed-id="w1"></div><div data-embed-type="form" data-embed-id="f1"></div>'
  );
  assert.deepEqual(refs, [
    { type: "widget", id: "w1", name: null, variant: null },
    { type: "form", id: "f1", name: null, variant: null },
  ]);
});

test("scanHtmlEmbeds: an unregistered/future type token scans exactly like a known one — the scanner never gates on type", () => {
  const refs = scanHtmlEmbeds('<div data-embed-type="some-future-type" data-embed-id="x1"></div>');
  assert.deepEqual(refs, [{ type: "some-future-type", id: "x1", name: null, variant: null }]);
});

test("scanHtmlEmbeds: data-embed-name and data-embed-variant are captured alongside data-embed-id", () => {
  const refs = scanHtmlEmbeds(
    '<div data-embed-type="media" data-embed-id="asset-1" data-embed-variant="thumb"></div>'
  );
  assert.deepEqual(refs, [{ type: "media", id: "asset-1", name: null, variant: "thumb" }]);
});

test("scanHtmlEmbeds: data-embed-id, data-embed-name, and data-embed-variant may appear in any order among the div's other attributes", () => {
  const refs = scanHtmlEmbeds(
    '<div class="slot" data-embed-variant="thumb" data-extra="y" data-embed-type="media" data-embed-id="asset-1"></div>'
  );
  assert.deepEqual(refs, [{ type: "media", id: "asset-1", name: null, variant: "thumb" }]);
});

test("scanHtmlEmbeds: whitespace between the opening and closing tag is tolerated", () => {
  const refs = scanHtmlEmbeds('<div data-embed-type="widget" data-embed-id="w1">\n  \n</div>');
  assert.deepEqual(refs, [{ type: "widget", id: "w1", name: null, variant: null }]);
});

test("scanHtmlEmbeds: a div with real content between the tags does not match — it is not an empty placeholder, so it is left alone rather than misread", () => {
  const refs = scanHtmlEmbeds('<div data-embed-type="widget" data-embed-id="w1"><span>not empty</span></div>');
  assert.deepEqual(refs, []);
});

test("scanHtmlEmbeds: an id longer than the sanity bound normalizes to null rather than being carried into a resolver/entry_refs lookup — the reference itself is still reported (scanning never gates on id validity, see this file's own header)", () => {
  const longId = "x".repeat(500);
  const refs = scanHtmlEmbeds(`<div data-embed-type="widget" data-embed-id="${longId}"></div>`);
  assert.deepEqual(refs, [{ type: "widget", id: null, name: null, variant: null }]);
});

test("scanHtmlEmbeds: an empty id attribute normalizes to null", () => {
  const refs = scanHtmlEmbeds('<div data-embed-type="widget" data-embed-id=""></div>');
  assert.deepEqual(refs, [{ type: "widget", id: null, name: null, variant: null }]);
});

test("scanHtmlEmbeds: a missing id attribute reports id: null rather than dropping the reference — resolution (not scanning) decides whether a name-only reference is usable", () => {
  const refs = scanHtmlEmbeds('<div data-embed-type="widget"></div>');
  assert.deepEqual(refs, [{ type: "widget", id: null, name: null, variant: null }]);
});

test("scanHtmlEmbeds: truncates at MAX_HTML_EMBEDS_PER_PAGE, never returns more", () => {
  const html = Array.from(
    { length: MAX_HTML_EMBEDS_PER_PAGE + 20 },
    (_, i) => `<div data-embed-type="widget" data-embed-id="w${i}"></div>`
  ).join("");
  const refs = scanHtmlEmbeds(html);
  assert.equal(refs.length, MAX_HTML_EMBEDS_PER_PAGE);
  assert.equal(refs[0]?.id, "w0", "truncation keeps the FIRST refs in document order, not an arbitrary subset");
});

test("substituteHtmlEmbeds: replaces each placeholder with resolve()'s return value, leaves surrounding markup untouched", () => {
  const html = '<p>before</p><div data-embed-type="widget" data-embed-id="w1"></div><p>after</p>';
  const out = substituteHtmlEmbeds(html, (ref) => `[${ref.type}:${ref.id}]`);
  assert.equal(out, "<p>before</p>[widget:w1]<p>after</p>");
});

test("substituteHtmlEmbeds: a non-matching (non-empty) div is left byte-for-byte unchanged, resolve() is never called for it", () => {
  const html = '<div data-embed-type="widget" data-embed-id="w1"><em>keep me</em></div>';
  let calls = 0;
  const out = substituteHtmlEmbeds(html, () => {
    calls += 1;
    return "REPLACED";
  });
  assert.equal(out, html);
  assert.equal(calls, 0);
});

test("substituteHtmlEmbeds: the captured id is handed to resolve() as plain data, never re-interpolated into the output by this function itself — a hostile id cannot break out of resolve()'s own returned markup", () => {
  const html = '<div data-embed-type="widget" data-embed-id="\"><script>alert(1)</script>"></div>';
  // The malformed quoting means this simply does not match the placeholder pattern — it is left
  // inert, not exploited. This function does not attempt to be a general HTML sanitizer; it only
  // ever emits what `resolve()` returns for a matched placeholder.
  const out = substituteHtmlEmbeds(html, () => "SHOULD-NOT-BE-CALLED");
  assert.doesNotMatch(out, /SHOULD-NOT-BE-CALLED/);
});

test("substituteHtmlEmbeds: multiple embeds of the same id each resolve independently (resolve() is called once per occurrence, not once per distinct id)", () => {
  const html = '<div data-embed-type="widget" data-embed-id="w1"></div><div data-embed-type="widget" data-embed-id="w1"></div>';
  let calls = 0;
  const out = substituteHtmlEmbeds(html, () => {
    calls += 1;
    return `[${calls}]`;
  });
  assert.equal(out, "[1][2]");
  assert.equal(calls, 2);
});

test("substituteHtmlEmbeds: an unknown embed type is still substituted via resolve() — the caller (render.ts) decides how an unresolvable type degrades, not this function", () => {
  const html = '<div data-embed-type="some-future-type" data-embed-id="x1"></div>';
  const out = substituteHtmlEmbeds(html, (ref) => `[unknown-type:${ref.type}]`);
  assert.equal(out, "[unknown-type:some-future-type]");
});
