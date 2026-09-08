import assert from "node:assert/strict";
import test from "node:test";

import { scanEmbedMarkers, substituteMarkers, withInnerContent, withInnerContentFinal } from "../marker.js";

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
