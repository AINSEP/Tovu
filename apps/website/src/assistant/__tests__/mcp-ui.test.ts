import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createUIResource } from "@jini-ai/ui/mcp-ui/surfaces";

import { buildUIToolResult, type UIResourceUri } from "../mcp-ui.js";

/**
 * @file Pins Tovu's tool-result wrapper, including its optional metadata. Resource construction
 * and escaping are exercised by Jini's resource.test.ts and escape.test.ts.
 */

const SAMPLE_URI = "ui://tovu/test/1" as UIResourceUri;

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
