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
