import assert from "node:assert/strict";
import test from "node:test";
import { checkMarkupFile, checkTovuAgentAttributePresence } from "../markup.js";

// F4.4: each invalid marker isolates one guard; no unrelated manifest errors.
test("invalid JSON and unquoted attributes are reported against their own file", () => {
  assert.deepEqual(checkMarkupFile({ relativePath: "pages/broken.html", content: "<div data-embed-config='{oops}'></div>" }), [{
    ruleId: "markup-embed-config-unparseable", path: "pages/broken.html",
    message: "'pages/broken.html': data-embed-config marker #1 could not be parsed (invalid-json)",
  }]);
  assert.deepEqual(checkMarkupFile({ relativePath: "pages/unquoted.html", content: "<div data-embed-config=payload></div>" }), [{
    ruleId: "markup-embed-config-not-single-quoted", path: "pages/unquoted.html",
    message: "'pages/unquoted.html' has a data-embed-config attribute not written with single quotes (found: data-embed-config=payload) — the runtime scanner only recognizes the single-quoted form and will leave this marker unresolved, silently",
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
