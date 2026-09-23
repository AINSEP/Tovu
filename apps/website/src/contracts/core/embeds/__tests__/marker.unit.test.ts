import assert from "node:assert/strict";
import test from "node:test";

import {
  formatMarkerAttributes,
  hasAuthoredAttributes,
  parseMarkerAttributes,
  scanEmbedMarkers,
  substituteMarkers,
  withElementKeptIfAttributed,
  withInnerContent,
  withInnerContentFinal,
} from "../marker.js";

/**
 * @file Direct unit coverage of the three marker-rebuild functions that
 * `marker.canary.test.ts` never calls (it only exercises `scanEmbedMarkers`,
 * `describeRejection`, `markersOfType`, `withAddedId` against real theme fixtures):
 *
 * - {@link withInnerContent} — splice new inner content, keep tag/attrs, keep the marker attribute
 * - {@link withInnerContentFinal} — same, but also strips `data-embed-config` so a later re-scan
 *   can't rediscover it
 * - {@link substituteMarkers} — whole-element replace driven by a resolver callback, right-to-left
 */

test("withInnerContent keeps the marker's tag and every authored attribute, swaps only the inner content", () => {
  const html = `<nav class="docs-nav" data-embed-config='{"type":"menu","id":"docs"}'>old fallback</nav>`;
  const { markers } = scanEmbedMarkers(html);
  assert.equal(markers.length, 1);

  const result = withInnerContent(markers[0], "<ul><li>new</li></ul>");

  assert.equal(
    result,
    `<nav class="docs-nav" data-embed-config='{"type":"menu","id":"docs"}'><ul><li>new</li></ul></nav>`
  );
});

test("withInnerContent preserves the marker attribute (unlike withInnerContentFinal)", () => {
  const html = `<div data-embed-config='{"type":"partial","id":"nav"}'></div>`;
  const { markers } = scanEmbedMarkers(html);

  const result = withInnerContent(markers[0], "resolved content");

  assert.match(result, /data-embed-config='\{"type":"partial","id":"nav"\}'/);
});

test("withInnerContentFinal strips data-embed-config so a later scan cannot rediscover the marker", () => {
  const html = `<div data-embed-config='{"type":"content","id":"e1"}'>old</div>`;
  const { markers } = scanEmbedMarkers(html);

  const result = withInnerContentFinal(markers[0], "<p>final body</p>");

  assert.equal(result, `<div><p>final body</p></div>`);
  assert.doesNotMatch(result, /data-embed-config/);
  // and the result is genuinely inert to a later scan:
  assert.equal(scanEmbedMarkers(result).markers.length, 0);
});

test("withInnerContentFinal keeps other authored attributes while removing only data-embed-config", () => {
  const html = `<section id="hero" data-embed-config='{"type":"content"}' aria-label="Hero">old</section>`;
  const { markers } = scanEmbedMarkers(html);

  const result = withInnerContentFinal(markers[0], "new");

  assert.equal(result, `<section id="hero" aria-label="Hero">new</section>`);
});

test("substituteMarkers replaces a marker's whole element with the resolver's output", () => {
  const html = `before<div data-embed-config='{"type":"partial","id":"nav"}'></div>after`;

  const result = substituteMarkers(html, (marker) => {
    assert.equal(marker.type, "partial");
    return "<nav>RESOLVED</nav>";
  });

  assert.equal(result, "before<nav>RESOLVED</nav>after");
});

test("substituteMarkers leaves a marker exactly as authored when resolve returns undefined", () => {
  const html = `<nav data-embed-config='{"type":"menu","id":"missing"}'>fallback content</nav>`;

  const result = substituteMarkers(html, () => undefined);

  assert.equal(result, html);
});

test("substituteMarkers splices right-to-left so earlier markers' offsets stay valid after a later replacement changes length", () => {
  const html =
    `<div data-embed-config='{"type":"a","id":"1"}'></div>` +
    `middle` +
    `<div data-embed-config='{"type":"b","id":"2"}'></div>`;

  const result = substituteMarkers(html, (marker) =>
    marker.type === "a" ? "A-OUT" : "B-OUTPUT-MUCH-LONGER-THAN-THE-ORIGINAL-MARKER"
  );

  assert.equal(result, "A-OUTmiddleB-OUTPUT-MUCH-LONGER-THAN-THE-ORIGINAL-MARKER");
});

test("substituteMarkers handles a mix of resolved and left-as-authored markers in one pass", () => {
  const html =
    `<div data-embed-config='{"type":"a","id":"1"}'></div>` +
    `<div data-embed-config='{"type":"b","id":"2"}'>keep me</div>`;

  const result = substituteMarkers(html, (marker) => (marker.type === "a" ? "REPLACED" : undefined));

  assert.equal(result, `REPLACED<div data-embed-config='{"type":"b","id":"2"}'>keep me</div>`);
});

test("substituteMarkers is a no-op on html with no markers", () => {
  const html = "<p>just plain html</p>";

  const result = substituteMarkers(html, () => "should never be called");

  assert.equal(result, html);
});

/**
 * A browser never parses HTML-comment text, or the raw text content of `<script>`/`<style>`
 * elements, as markup — so a well-formed `data-embed-config` marker written inside either is inert,
 * not live. `MARKER_PATTERN` used to be a plain regex over the raw string with no awareness of
 * either boundary, so an authoring note demonstrating the marker syntax (a real pattern in this
 * codebase — see the theme fixtures below) was extracted and resolved as if it were on the page.
 * See `ADS-memory/reports/2026-09-07-media-embed-unresolved.md` for the production incident this
 * regressed: three published pages, including the site root, logged a spurious "unresolved media
 * reference" warning on every render because of exactly this.
 */
test("scanEmbedMarkers ignores a marker written inside an HTML comment, but still finds a live marker elsewhere in the same document", () => {
  const html =
    `<!-- [VIDEO PLACEHOLDER] swap for the wrapper-div marker form: ` +
    `<div class="xai-video" data-embed-config='{"type":"media","id":"placeholder"}'></div> -->` +
    `<div data-embed-config='{"type":"partial","id":"nav"}'></div>`;

  const { markers, rejected } = scanEmbedMarkers(html);

  assert.deepEqual(rejected, []);
  assert.equal(markers.length, 1, "the commented-out marker must not be extracted");
  assert.equal(markers[0].type, "partial");
  assert.equal(markers[0].id, "nav");
});

test("scanEmbedMarkers ignores a marker written inside a <style> block's CSS comment, but still finds a live marker elsewhere in the same document", () => {
  const html =
    `<style>` +
    `/* VIDEO SLOT. Replace with the wrapper-div marker form ` +
    `<div class="lp-video-media" data-embed-config='{"type":"media","id":"placeholder"}'></div> */` +
    `.foo { color: red; }` +
    `</style>` +
    `<div data-embed-config='{"type":"partial","id":"nav"}'></div>`;

  const { markers, rejected } = scanEmbedMarkers(html);

  assert.deepEqual(rejected, []);
  assert.equal(markers.length, 1, "the marker inside the <style> block's CSS comment must not be extracted");
  assert.equal(markers[0].type, "partial");
  assert.equal(markers[0].id, "nav");
});

test("scanEmbedMarkers ignores a marker written inside a <script> block, but still finds a live marker elsewhere in the same document", () => {
  const html =
    `<script>` +
    `// example: <div data-embed-config='{"type":"media","id":"placeholder"}'></div>` +
    `</script>` +
    `<div data-embed-config='{"type":"partial","id":"nav"}'></div>`;

  const { markers, rejected } = scanEmbedMarkers(html);

  assert.deepEqual(rejected, []);
  assert.equal(markers.length, 1, "the marker inside the <script> block must not be extracted");
  assert.equal(markers[0].type, "partial");
  assert.equal(markers[0].id, "nav");
});

test("scanEmbedMarkers still finds a live marker whose fallback content sits right next to a comment/style/script block, with fields read from the ORIGINAL text", () => {
  // Regression guard for the fix itself: a naive fix could blind the scanner to markers, or could
  // read `whole`/`attrs`/`inner` back off a masked (space-filled) copy instead of the real HTML.
  const html =
    `<!-- unrelated note, no marker inside --><style>.x{color:red}</style><script>1;</script>` +
    `<nav class="docs-nav" aria-label="Documentation" data-embed-config='{"type":"menu","id":"docs"}'>` +
    `<span>fallback</span></nav>`;

  const { markers, rejected } = scanEmbedMarkers(html);

  assert.deepEqual(rejected, []);
  assert.equal(markers.length, 1);
  const [marker] = markers;
  assert.equal(marker.tag, "nav");
  assert.ok(marker.attrs.includes('class="docs-nav"'));
  assert.ok(marker.attrs.includes('aria-label="Documentation"'));
  assert.equal(marker.inner, "<span>fallback</span>");
  assert.ok(marker.whole.startsWith('<nav class="docs-nav"'));
  assert.ok(marker.whole.endsWith("</nav>"));
  // The marker's true offset in the ORIGINAL (unmasked) string — substituteMarkers splices by this.
  assert.equal(html.slice(marker.index, marker.index + marker.whole.length), marker.whole);
});

/**
 * 2026-09-16 — owner: "regular attributes that somebody puts on a data-embed-config should work on
 * the rendered tag". These primitives are the shared read/write half of that contract; per-type
 * forwarding rules live in `features/widgets/__tests__/unit/html-embeds.unit.test.ts` (T4).
 */
test('parseMarkerAttributes: drops data-embed-config even though its JSON holds double quotes', () => {
  const html = `<div class="a" data-embed-config='{"type":"media","id":"x"}' autoplay></div>`;
  const { markers } = scanEmbedMarkers(html);

  const attrs = parseMarkerAttributes(markers[0]);

  assert.deepEqual(attrs, [
    { name: "class", value: "a" },
    { name: "autoplay", value: null },
  ]);
});

test("parseMarkerAttributes: reads unquoted, single-quoted and double-quoted values as source text, never entity-decoded", () => {
  const html = `<div title="a &amp; b" data-embed-config='{"type":"widget"}'></div>`;
  const { markers } = scanEmbedMarkers(html);

  const attrs = parseMarkerAttributes(markers[0]);

  assert.deepEqual(attrs, [{ name: "title", value: "a &amp; b" }]);
});

test("parseMarkerAttributes: lowercases names and keeps the FIRST of a duplicate", () => {
  const html = `<div CLASS="first" class="second" data-embed-config='{"type":"widget"}'></div>`;
  const { markers } = scanEmbedMarkers(html);

  const attrs = parseMarkerAttributes(markers[0]);

  assert.deepEqual(attrs, [{ name: "class", value: "first" }]);
});

test("parseMarkerAttributes: skips a token whose name is not a valid attribute name instead of throwing", () => {
  const html = `<div 1bad="x" ok="y" data-embed-config='{"type":"widget"}'></div>`;
  const { markers } = scanEmbedMarkers(html);

  const attrs = parseMarkerAttributes(markers[0]);

  assert.deepEqual(attrs, [{ name: "ok", value: "y" }]);
});

test('formatMarkerAttributes: round-trips source text without double-escaping & and turns an embedded " into &quot;', () => {
  const result = formatMarkerAttributes([{ name: "title", value: 'say "hi" &amp; bye' }]);

  assert.equal(result, ' title="say &quot;hi&quot; &amp; bye"');
});

test("formatMarkerAttributes: a valueless attribute is emitted bare", () => {
  const result = formatMarkerAttributes([{ name: "autoplay", value: null }]);

  assert.equal(result, " autoplay");
});

test("hasAuthoredAttributes: false for a bare marker, true once any other attribute is present", () => {
  const bare = scanEmbedMarkers(`<div data-embed-config='{"type":"widget"}'></div>`).markers[0];
  const attributed = scanEmbedMarkers(`<div class="a" data-embed-config='{"type":"widget"}'></div>`).markers[0];

  assert.equal(hasAuthoredAttributes(bare), false);
  assert.equal(hasAuthoredAttributes(attributed), true);
});

test("withElementKeptIfAttributed: a bare marker returns inner alone; an attributed one keeps tag and attributes and strips data-embed-config", () => {
  const bare = scanEmbedMarkers(`<div data-embed-config='{"type":"widget"}'></div>`).markers[0];
  const attributed = scanEmbedMarkers(`<div style="max-width: 600px;" data-embed-config='{"type":"widget"}'></div>`).markers[0];

  assert.equal(withElementKeptIfAttributed(bare, "resolved"), "resolved");
  assert.equal(withElementKeptIfAttributed(attributed, "resolved"), `<div style="max-width: 600px;">resolved</div>`);
});

/**
 * @file Nesting-aware close: {@link scanEmbedMarkers} finds a marker's own close tag by depth count
 * rather than by nearest textual `</tag>`, so a same-named descendant (`<div><div>…</div></div>`) no
 * longer truncates the marker at the first inner close.
 */

test("scanEmbedMarkers: a marker's inner is everything between its outer tags, even with nested elements of other names", () => {
  const html =
    `<div data-embed-config='{"type":"collection","id":"x"}'>` +
    `<template><div>{{title}}</div></template><div>none</div>` +
    `</div>`;

  const { markers } = scanEmbedMarkers(html);

  assert.equal(markers.length, 1);
  assert.equal(markers[0].type, "collection");
  assert.equal(markers[0].inner, `<template><div>{{title}}</div></template><div>none</div>`);
  assert.equal(markers[0].whole, html);
});

test("scanEmbedMarkers: same-name nesting three deep closes at the balanced tag, not the first close", () => {
  const html = `<div data-embed-config='{"type":"collection","id":"x"}'><div><div>deep</div></div></div>`;

  const { markers } = scanEmbedMarkers(html);

  assert.equal(markers.length, 1);
  assert.equal(markers[0].inner, `<div><div>deep</div></div>`);
  assert.equal(markers[0].whole, html);
});

test("scanEmbedMarkers: an unbalanced inner <div> falls back to the first </div>, matching today's behaviour, without swallowing the rest of the document", () => {
  const html = `<div data-embed-config='{"type":"collection","id":"x"}'><div>oops</div><p>after</p>`;

  const { markers } = scanEmbedMarkers(html);

  assert.equal(markers.length, 1);
  assert.equal(markers[0].inner, `<div>oops`);
  assert.equal(markers[0].whole, `<div data-embed-config='{"type":"collection","id":"x"}'><div>oops</div>`);
});

test("scanEmbedMarkers: a marker nested inside another marker's inner is not reported separately", () => {
  const html =
    `<div data-embed-config='{"type":"outer","id":"o"}'>` +
    `<div data-embed-config='{"type":"inner","id":"i"}'>x</div>` +
    `</div>`;

  const { markers } = scanEmbedMarkers(html);

  assert.equal(markers.length, 1);
  assert.equal(markers[0].type, "outer");
  assert.equal(markers[0].inner, `<div data-embed-config='{"type":"inner","id":"i"}'>x</div>`);
});

test("scanEmbedMarkers: comment/style masking hides a marker written inside them, and hides tags inside those regions from the balanced-close depth count", () => {
  const html =
    `<div data-embed-config='{"type":"collection","id":"x"}'>` +
    `<!-- <div> --><div>real</div>` +
    `</div>` +
    `<style>.x{} <div data-embed-config='{"type":"style-fake"}'></div></style>`;

  const { markers } = scanEmbedMarkers(html);

  assert.equal(markers.length, 1);
  assert.equal(markers[0].type, "collection");
  assert.equal(markers[0].inner, `<!-- <div> --><div>real</div>`);
});

test("scanEmbedMarkers: recognises a marker on an <h2> and on a custom element like <my-card>", () => {
  const h2 = scanEmbedMarkers(`<h2 data-embed-config='{"type":"widget","id":"w"}'>fallback</h2>`).markers;
  const custom = scanEmbedMarkers(`<my-card data-embed-config='{"type":"widget","id":"w"}'>fallback</my-card>`).markers;

  assert.equal(h2.length, 1);
  assert.equal(h2[0].tag, "h2");
  assert.equal(custom.length, 1);
  assert.equal(custom[0].tag, "my-card");
});

test("scanEmbedMarkers: a marker with no close tag at all (a void <img>) is just its open tag and never swallows the rest of the document", () => {
  const open = `<img data-embed-config='{"type":"media","id":"asset-1"}' class="hero">`;
  const html = `<p>before</p>${open}<p>rest of the page</p><div>more</div>`;

  const { markers } = scanEmbedMarkers(html);

  assert.equal(markers.length, 1);
  assert.equal(markers[0].whole, open);
  assert.equal(markers[0].inner, "");
  assert.equal(markers[0].index, `<p>before</p>`.length);
});

test("scanEmbedMarkers: a </div> inside a <script> in a marker's inner is not counted toward its balanced close", () => {
  const html =
    `<div data-embed-config='{"type":"collection","id":"x"}'>` +
    `<script>document.write("</div>")</script><div>real</div>` +
    `</div><p>after</p>`;

  const { markers } = scanEmbedMarkers(html);

  assert.equal(markers.length, 1);
  assert.equal(markers[0].inner, `<script>document.write("</div>")</script><div>real</div>`);
});

test("scanEmbedMarkers: thousands of unbalanced markers scan in linear, not quadratic, time", () => {
  // Each marker opens a <div>, closes an inner one, and never closes itself, so a per-marker depth
  // count that runs to the end of the document on every marker is O(markers x length). 8000 of them
  // (~520 KB) took ~16 s that way; a linear scan takes a few tens of milliseconds.
  const html = `<div data-embed-config='{"type":"widget","id":"x"}'><div>x</div>\n`.repeat(8000);

  const started = performance.now();
  const { markers } = scanEmbedMarkers(html);
  const elapsedMs = performance.now() - started;

  assert.equal(markers.length, 8000);
  assert.equal(markers[1].whole, `<div data-embed-config='{"type":"widget","id":"x"}'><div>x</div>`);
  assert.ok(elapsedMs < 1500, `scan took ${elapsedMs.toFixed(0)} ms`);
});
