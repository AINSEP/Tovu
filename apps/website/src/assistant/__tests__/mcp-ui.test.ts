import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  MCP_UI_MIME_TYPE,
  buildUIToolResult,
  createUIResource,
  escapeHtml,
  escapeJsString,
  type UIResourceUri,
} from "../mcp-ui.js";

/**
 * @file `createUIResource`, `escapeHtml`, and `escapeJsString` had no direct test anywhere in the
 * repo before this file — `buildUIToolResult` is exercised indirectly through
 * `demo-choices-tool.test.ts`, but never for its own optional-`meta` branch. Covers all four
 * directly.
 */

const SAMPLE_URI = "ui://tovu/test/1" as UIResourceUri;

describe("createUIResource", () => {
  it("wraps the HTML string in an EmbeddedResource with the fixed MCP Apps mime type", () => {
    const resource = createUIResource({ uri: SAMPLE_URI, htmlString: "<p>hi</p>" });
    assert.deepEqual(resource, {
      type: "resource",
      resource: {
        uri: SAMPLE_URI,
        mimeType: MCP_UI_MIME_TYPE,
        text: "<p>hi</p>",
      },
    });
  });

  it("omits _meta entirely when spec.meta is not supplied", () => {
    const resource = createUIResource({ uri: SAMPLE_URI, htmlString: "<p>hi</p>" });
    assert.equal("_meta" in resource.resource, false);
  });

  it("carries spec.meta through as the resource's own _meta when supplied", () => {
    const resource = createUIResource({
      uri: SAMPLE_URI,
      htmlString: "<p>hi</p>",
      meta: { "preferred-frame-size": ["100%", "400px"] },
    });
    assert.deepEqual(resource.resource._meta, { "preferred-frame-size": ["100%", "400px"] });
  });
});

describe("buildUIToolResult", () => {
  it("puts the model text first and the UI resource second — MCP Apps' security-relevant order", () => {
    const ui = createUIResource({ uri: SAMPLE_URI, htmlString: "<p>hi</p>" });
    const result = buildUIToolResult({ modelText: "A form was shown.", ui });
    assert.deepEqual(result.content[0], { type: "text", text: "A form was shown." });
    assert.deepEqual(result.content[1], ui);
  });

  it("omits result-level _meta entirely when spec.meta is not supplied", () => {
    const ui = createUIResource({ uri: SAMPLE_URI, htmlString: "<p>hi</p>" });
    const result = buildUIToolResult({ modelText: "text", ui });
    assert.equal("_meta" in result, false);
  });

  it("carries spec.meta through as the result's own _meta when supplied", () => {
    const ui = createUIResource({ uri: SAMPLE_URI, htmlString: "<p>hi</p>" });
    const result = buildUIToolResult({ modelText: "text", ui, meta: { foo: "bar" } });
    assert.deepEqual(result._meta, { foo: "bar" });
  });
});

describe("escapeHtml", () => {
  it("escapes &, <, >, \", and ' so a value cannot break out of an HTML text node", () => {
    assert.equal(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
  });

  it("leaves a value with no special characters unchanged", () => {
    assert.equal(escapeHtml("plain text 123"), "plain text 123");
  });

  it("escapes a realistic injection attempt", () => {
    assert.equal(escapeHtml(`<script>alert('x')</script>`), "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
  });
});

describe("escapeJsString", () => {
  it("JSON-encodes the value, quoting and escaping backslashes/quotes like JSON.stringify", () => {
    assert.equal(escapeJsString(`say "hi"`), JSON.stringify(`say "hi"`));
  });

  it("escapes a literal </script sequence so it cannot close an inline <script> element early", () => {
    const result = escapeJsString("</script><script>alert(1)</script>");
    // Only `<` is escaped, not `>` — HTML's own parser closes a `<script>` element on the
    // `</script` substring alone, so breaking just the `<` is sufficient and is what this
    // function actually does. Hand-computed expected value (not re-derived from the function's own
    // `.replace` call) so this pins the exact output, not just "no </script> survived".
    assert.equal(result, '"\\u003c/script>\\u003cscript>alert(1)\\u003c/script>"');
    assert.equal(result.includes("</script>"), false, "a literal </script> must not survive into the output");
  });

  it("escapes U+2028 and U+2029, which are legal in JSON but were illegal in pre-ES2019 JS string literals", () => {
    const result = escapeJsString("line\u2028sep\u2029end");
    assert.equal(result.includes("\u2028"), false);
    assert.equal(result.includes("\u2029"), false);
    assert.ok(result.includes("\\u2028"));
    assert.ok(result.includes("\\u2029"));
  });

  it("round-trips a plain string back through JSON.parse unchanged", () => {
    const value = "plain string, no special chars";
    assert.equal(JSON.parse(escapeJsString(value)), value);
  });
});
