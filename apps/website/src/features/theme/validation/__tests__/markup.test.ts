import assert from "node:assert/strict";
import test from "node:test";
import { checkMarkupFile } from "../markup.js";
import { scanEmbedMarkers } from "@jini-ai/cms/widgets/markers";
import { resolveSeverity } from '../profiles.js';

test('gallery validation accepts the new vocabulary and reports image-specific errors and alt warnings', () => {
  const markup = (config: Record<string, unknown>) => `<div data-embed-config='${JSON.stringify({ type: 'gallery', ...config })}'></div>`;
  assert.deepEqual(checkMarkupFile({ relativePath: 'pages/gallery.html', content: markup({ images: [{ mediaId: 'one', alt: '' }], layout: 'masonry' }) }), []);
  const issues = checkMarkupFile({ relativePath: 'pages/gallery.html', content: markup({ images: [{ src: 'javascript:alert(1)' }], layout: 'slider' }) });
  assert.ok(issues.some(issue => issue.ruleId === 'markup-gallery-config-invalid' && issue.message.includes('images[0].src')));
  assert.ok(issues.some(issue => issue.ruleId === 'markup-gallery-config-invalid' && issue.message.includes('layout')));
  assert.ok(issues.some(issue => issue.ruleId === 'markup-gallery-alt-missing' && issue.message.includes('images[0].alt')));
  for (const profile of ['author', 'install', 'publish'] as const) {
    assert.equal(resolveSeverity({ ruleId: 'markup-gallery-alt-missing', profile }), 'warning');
    assert.equal(resolveSeverity({ ruleId: 'markup-gallery-config-invalid', profile }), 'error');
  }
});

// F4.4: each invalid marker isolates one guard; no unrelated manifest errors.
test("invalid JSON and unquoted attributes are reported against their own file", () => {
  assert.deepEqual(checkMarkupFile({ relativePath: "pages/broken.html", content: "<div data-embed-config='{oops}'></div>" }), [{
    ruleId: "markup-embed-config-unparseable", path: "pages/broken.html",
    message: "'pages/broken.html': data-embed-config marker #1 could not be parsed (invalid-json)",
  }]);
  assert.deepEqual(checkMarkupFile({ relativePath: "pages/unquoted.html", content: "<div data-embed-config=payload></div>" }), [{
    ruleId: "markup-embed-config-not-single-quoted", path: "pages/unquoted.html",
    message: "'pages/unquoted.html' has an unquoted data-embed-config attribute (found: data-embed-config=payload) — the runtime scanner requires a single- or double-quoted value and will leave this marker unresolved, silently",
  }]);
});

// F4.4/F5.2: a typo sibling proves the marker was scanned; only its type differs.
// Removing taxonomy from the accepted vocabulary must fail the positive case.
test("taxonomy embeds are accepted while a misspelled taxonomy type is rejected", () => {
  const content = '<div data-embed-config=\'{"type":"taxonomy","id":"topics"}\'></div>';
  assert.deepEqual(scanEmbedMarkers({ html: content }).markers.map(({ config }) => config), [{ type: "taxonomy", id: "topics" }]);
  assert.deepEqual(checkMarkupFile({ relativePath: "render/topics.html", content }), []);
  assert.deepEqual(checkMarkupFile({
    relativePath: "render/topics.html", content: '<div data-embed-config=\'{"type":"taxonomyy","id":"topics"}\'></div>',
  }).map(({ ruleId, path }) => ({ ruleId, path })), [{ ruleId: "markup-embed-config-unknown-type", path: "render/topics.html" }]);
});

// BUG/F4.6: the real runtime now accepts browser-serialized double quotes.
// The validator's obsolete single-quote guard must not block this working embed.
test("browser-serialized form embeds accepted by the runtime also pass theme markup validation", () => {
  const content = '<div data-embed-config="{&quot;type&quot;:&quot;form&quot;,&quot;id&quot;:&quot;contact&quot;,&quot;mode&quot;:&quot;html&quot;}"></div>';
  const scanned = scanEmbedMarkers({ html: content });
  assert.deepEqual(scanned.rejected, []);
  assert.deepEqual(scanned.markers.map(({ config }) => config), [{ type: "form", id: "contact", mode: "html" }]);
  assert.deepEqual(checkMarkupFile({ relativePath: "render/contact.html", content }), []);
});

// Quoting acceptance must still delegate every payload failure to the runtime parser.
test("double-quoted invalid payloads retain the runtime's exact rejection without a quote finding", () => {
  for (const [payload, kind] of [
    ["{oops}", "invalid-json"],
    ["[]", "not-an-object"],
    ["{&quot;id&quot;:&quot;contact&quot;}", "missing-type"],
  ]) {
    const content = `<div data-embed-config="${payload}"></div>`;
    const scanned = scanEmbedMarkers({ html: content });
    assert.deepEqual(scanned.markers, []);
    assert.deepEqual(scanned.rejected.map(({ occurrence, problem }) => ({ occurrence, kind: problem.kind })), [{ occurrence: 1, kind }]);
    assert.deepEqual(checkMarkupFile({ relativePath: "render/contact.html", content }), [{
      ruleId: "markup-embed-config-unparseable", path: "render/contact.html",
      message: `'render/contact.html': data-embed-config marker #1 could not be parsed (${kind})`,
    }]);
  }
});

const embed = (config: Record<string, unknown>) => `<div data-embed-config='${JSON.stringify(config)}'></div>`;
const ruleIds = (content: string) => checkMarkupFile({ relativePath: "p.html", content }).map(({ ruleId }) => ruleId);

test("issue families are reported in a fixed order: agent element, unquoted, unparseable, per-marker gallery/type, then WebMCP", () => {
  const content = '<div data-agent-element="x"></div><div data-embed-config=raw></div><div data-embed-config=\'{bad}\'></div>'
    + embed({ type: "gallery", images: [{ src: "javascript:x" }] }) + embed({ type: "nope" }) + '<div toolname="x" tooldescription="d"></div>';
  assert.deepEqual(ruleIds(content), [
    "markup-data-agent-element-forbidden", "markup-embed-config-not-single-quoted", "markup-embed-config-unparseable",
    "markup-gallery-config-invalid", "markup-gallery-config-invalid", "markup-gallery-alt-missing",
    "markup-embed-config-unknown-type", "markup-webmcp-placement",
  ]);
});

test("media markers are gallery-checked only when they carry content, items or html", () => {
  assert.deepEqual(ruleIds(embed({ type: "media", items: [{ src: "javascript:x" }] })), ["markup-gallery-config-invalid", "markup-gallery-config-invalid"]);
  // A nested content payload is what gets validated, not the outer marker.
  assert.deepEqual(ruleIds(embed({ type: "media", content: { images: [{ src: "javascript:x" }] } })), ["markup-gallery-config-invalid", "markup-gallery-config-invalid", "markup-gallery-alt-missing"]);
  assert.deepEqual(ruleIds(embed({ type: "media", html: "<p>x</p>" })), []);
  assert.deepEqual(ruleIds(embed({ type: "media", id: "m1" })), []);
});

test("gallery checks match the type case-insensitively while the vocabulary check is exact", () => {
  assert.deepEqual(ruleIds(embed({ type: "Gallery", images: [{ mediaId: "one" }] })), ["markup-gallery-config-invalid", "markup-gallery-alt-missing", "markup-embed-config-unknown-type"]);
  assert.deepEqual(ruleIds(embed({ type: "MEDIA", items: [{ mediaId: "one" }] })), ["markup-gallery-config-invalid", "markup-gallery-config-invalid", "markup-embed-config-unknown-type"]);
});
