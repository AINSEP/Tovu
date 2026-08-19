import assert from "node:assert/strict";
import test from "node:test";

import { MAX_HTML_EMBEDS_PER_PAGE, scanHtmlEmbeds, substituteHtmlEmbeds } from "../../html-embeds.js";

/**
 * @file SPEC-047 Slice 2 — `html-embeds.ts`'s scan/substitute pair, tested as the pure string
 * functions they are (no repo, no resolver — see `resolve-html-page-embeds.integration.test.ts` for
 * the resolution-layer coverage).
 *
 * **Rewritten 2026-08-10 onto `data-embed-config`.** Every fixture here spoke the retired
 * `data-embed-type`/`data-embed-id`/`data-embed-variant` vocabulary, which `scanEmbedMarkers` does
 * not read at all — so the whole suite had been failing since the marker-spine unification (`b7acc21`)
 * while asserting behavior that no longer existed.
 *
 * Two tests were INVERTED rather than re-spelled, because the migration deliberately changed the
 * rule they pinned: the old scanner required an EMPTY `<div></div>` and skipped any marker with
 * content inside it. The shared parser matches inner content on purpose, so a theme marker's authored
 * fallback survives when nothing resolves. Re-spelling those two would have re-pinned the exact
 * behavior the migration set out to remove — see `core/embeds/marker.ts`'s `MARKER_PATTERN` doc and
 * `html-entry-refs-consistency.integration.test.ts`'s own note retiring the matching fixture.
 */

test("scanHtmlEmbeds: finds two embeds of different types, in document order", () => {
  const refs = scanHtmlEmbeds(
    `<p>intro</p><div data-embed-config='{"type":"widget","id":"w1"}'></div><div data-embed-config='{"type":"media","id":"asset-1"}'></div>`
  );
  assert.deepEqual(refs, [
    { type: "widget", id: "w1", name: null, variant: null },
    { type: "media", id: "asset-1", name: null, variant: null },
  ]);
});

test("scanHtmlEmbeds: an unregistered/future type token scans exactly like a known one — the scanner never gates on type", () => {
  const refs = scanHtmlEmbeds(`<div data-embed-config='{"type":"some-future-type","id":"x1"}'></div>`);
  assert.deepEqual(refs, [{ type: "some-future-type", id: "x1", name: null, variant: null }]);
});

test('scanHtmlEmbeds: the RETIRED "form" type scans like any other unregistered token — removing it from the resolver registry (2026-08-10) changed resolution, never scanning', () => {
  const refs = scanHtmlEmbeds(`<div data-embed-config='{"type":"form","id":"f1"}'></div>`);
  assert.deepEqual(refs, [{ type: "form", id: "f1", name: null, variant: null }]);
});

test("scanHtmlEmbeds: name and variant config keys are captured alongside id", () => {
  const refs = scanHtmlEmbeds(`<div data-embed-config='{"type":"media","id":"asset-1","variant":"thumb"}'></div>`);
  assert.deepEqual(refs, [{ type: "media", id: "asset-1", name: null, variant: "thumb" }]);
});

test("scanHtmlEmbeds: the marker attribute may sit anywhere among the element's other attributes, which survive the scan untouched", () => {
  const refs = scanHtmlEmbeds(
    `<div class="slot" data-extra="y" data-embed-config='{"type":"media","id":"asset-1","variant":"thumb"}'></div>`
  );
  assert.deepEqual(refs, [{ type: "media", id: "asset-1", name: null, variant: "thumb" }]);
});

test("scanHtmlEmbeds: whitespace between the opening and closing tag is tolerated", () => {
  const refs = scanHtmlEmbeds(`<div data-embed-config='{"type":"widget","id":"w1"}'>\n  \n</div>`);
  assert.deepEqual(refs, [{ type: "widget", id: "w1", name: null, variant: null }]);
});

test("scanHtmlEmbeds: an element with real content between the tags DOES match — that content is a fallback the parser deliberately preserves, not a reason to skip the marker (this inverts the pre-b7acc21 empty-div-only rule)", () => {
  const refs = scanHtmlEmbeds(`<div data-embed-config='{"type":"widget","id":"w1"}'><span>authored fallback</span></div>`);
  assert.deepEqual(refs, [{ type: "widget", id: "w1", name: null, variant: null }]);
});

test("scanHtmlEmbeds: an id longer than the sanity bound normalizes to null rather than being carried into a resolver/entry_refs lookup — the reference itself is still reported (scanning never gates on id validity, see this file's own header)", () => {
  const longId = "x".repeat(500);
  const refs = scanHtmlEmbeds(`<div data-embed-config='{"type":"widget","id":"${longId}"}'></div>`);
  assert.deepEqual(refs, [{ type: "widget", id: null, name: null, variant: null }]);
});

test("scanHtmlEmbeds: an empty id normalizes to null", () => {
  const refs = scanHtmlEmbeds(`<div data-embed-config='{"type":"widget","id":""}'></div>`);
  assert.deepEqual(refs, [{ type: "widget", id: null, name: null, variant: null }]);
});

test("scanHtmlEmbeds: a missing id key reports id: null rather than dropping the reference — resolution (not scanning) decides whether a targetless reference is usable", () => {
  const refs = scanHtmlEmbeds(`<div data-embed-config='{"type":"widget"}'></div>`);
  assert.deepEqual(refs, [{ type: "widget", id: null, name: null, variant: null }]);
});

test("scanHtmlEmbeds: a non-string id is exactly as unusable as a missing one", () => {
  const refs = scanHtmlEmbeds(`<div data-embed-config='{"type":"widget","id":7}'></div>`);
  assert.deepEqual(refs, [{ type: "widget", id: null, name: null, variant: null }]);
});

test("scanHtmlEmbeds: a marker whose config does not parse is absent from the result entirely — render-time stays forgiving, and the unparseable markup survives untouched because substituteHtmlEmbeds cannot see it either", () => {
  assert.deepEqual(scanHtmlEmbeds(`<div data-embed-config='{"type":"widget","id":}'></div>`), []);
});

test("scanHtmlEmbeds: truncates at MAX_HTML_EMBEDS_PER_PAGE, never returns more", () => {
  const html = Array.from(
    { length: MAX_HTML_EMBEDS_PER_PAGE + 20 },
    (_, i) => `<div data-embed-config='{"type":"widget","id":"w${i}"}'></div>`
  ).join("");
  const refs = scanHtmlEmbeds(html);
  assert.equal(refs.length, MAX_HTML_EMBEDS_PER_PAGE);
  assert.equal(refs[0]?.id, "w0", "truncation keeps the FIRST refs in document order, not an arbitrary subset");
});

test("substituteHtmlEmbeds: replaces each placeholder with resolve()'s return value, leaves surrounding markup untouched", () => {
  const html = `<p>before</p><div data-embed-config='{"type":"widget","id":"w1"}'></div><p>after</p>`;
  const out = substituteHtmlEmbeds(html, (ref) => `[${ref.type}:${ref.id}]`);
  assert.equal(out, "<p>before</p>[widget:w1]<p>after</p>");
});

test("substituteHtmlEmbeds: resolve() returning undefined leaves the marker EXACTLY as authored, fallback content included — the invariant that stops a later-stage marker (a theme's nav) from being blanked by this stage", () => {
  const html = `<nav data-embed-config='{"type":"menu","id":"main"}'><em>keep me</em></nav>`;
  const out = substituteHtmlEmbeds(html, () => undefined);
  assert.equal(out, html);
});

test("substituteHtmlEmbeds: an element WITH content is matched and replaced when resolve() returns a value — the pre-b7acc21 rule that skipped it is gone (this inverts that test, it does not re-spell it)", () => {
  const html = `<div data-embed-config='{"type":"widget","id":"w1"}'><em>fallback</em></div>`;
  let calls = 0;
  const out = substituteHtmlEmbeds(html, () => {
    calls += 1;
    return "REPLACED";
  });
  assert.equal(out, "REPLACED");
  assert.equal(calls, 1);
});

test("substituteHtmlEmbeds: the captured id is handed to resolve() as plain data, never re-interpolated into the output by this function itself — a hostile id cannot break out of resolve()'s own returned markup", () => {
  // The `'` closing the attribute early means the config text is `{"type":"widget","id":"` — invalid
  // JSON, so the marker is rejected and left inert rather than exploited. This function does not
  // attempt to be a general HTML sanitizer; it only ever emits what `resolve()` returns for a marker
  // the shared parser accepted.
  const html = `<div data-embed-config='{"type":"widget","id":"'><script>alert(1)</script>"></div>`;
  const out = substituteHtmlEmbeds(html, () => "SHOULD-NOT-BE-CALLED");
  assert.doesNotMatch(out, /SHOULD-NOT-BE-CALLED/);
});

test("substituteHtmlEmbeds: multiple embeds of the same id each resolve independently (resolve() is called once per occurrence, not once per distinct id)", () => {
  const html =
    `<div data-embed-config='{"type":"widget","id":"w1"}'></div><div data-embed-config='{"type":"widget","id":"w1"}'></div>`;
  const seen: string[] = [];
  const out = substituteHtmlEmbeds(html, () => {
    seen.push("call");
    return `[${seen.length}]`;
  });
  // `substituteMarkers` applies right-to-left so each splice leaves earlier offsets valid, so the
  // FIRST call resolves the LAST occurrence — asserted here rather than glossed, since a caller that
  // assumed document order for a stateful `resolve` would be silently wrong.
  assert.equal(out, "[2][1]");
  assert.equal(seen.length, 2);
});

test("substituteHtmlEmbeds: an unknown embed type is still substituted via resolve() — the caller (render.ts) decides how an unresolvable type degrades, not this function", () => {
  const html = `<div data-embed-config='{"type":"some-future-type","id":"x1"}'></div>`;
  const out = substituteHtmlEmbeds(html, (ref) => `[unknown-type:${ref.type}]`);
  assert.equal(out, "[unknown-type:some-future-type]");
});
