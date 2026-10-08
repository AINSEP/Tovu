import assert from "node:assert/strict";
import test from "node:test";
import { checkMarkupFile, checkTovuAgentAttributePresence } from "../markup.js";
import { scanEmbedMarkers } from "@jini-ai/cms/widgets/markers";

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

test("empty agent handles are rejected in both quote styles while nonempty and absent handles pass", () => {
  for (const content of ["<div data-tovu-agent='  '></div>", '<div data-tovu-agent=""></div>']) {
    assert.deepEqual(checkTovuAgentAttributePresence({ relativePath: "pages/index.html", content }), [{
      ruleId: "markup-tovu-agent-empty", path: "pages/index.html",
      message: "'pages/index.html' has a data-tovu-agent attribute with an empty value",
    }]);
  }
  assert.deepEqual(checkTovuAgentAttributePresence({ relativePath: "pages/index.html", content: '<div data-tovu-agent="agent-one"></div>' }), []);
  assert.deepEqual(checkTovuAgentAttributePresence({ relativePath: "pages/index.html", content: "<div></div>" }), []);
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
