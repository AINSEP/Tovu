import assert from "node:assert/strict";
import test from "node:test";
import { askChoiceToolResult, isAskChoiceUiResource } from "../ask-choice-ui-resource.js";
import { buildUIToolResult } from "../mcp-ui.js";

const VALID = { type: "resource", resource: { uri: "ui://tovu/ask-choice/p/1", mimeType: "text/html", text: "<form></form>" } };

for (const mimeType of ["text/html", "text/html;profile=mcp-app", "text/html+skybridge"]) {
  test(`an HTML ui:// resource with ${mimeType} is accepted`, () => {
    assert.equal(isAskChoiceUiResource({ ...VALID, resource: { ...VALID.resource, mimeType } }), true);
  });
}

for (const [name, ui] of [
  ["null", null],
  ["a string", "ui://x"],
  ["an object without type", { resource: VALID.resource }],
  ["a non-resource type", { ...VALID, type: "text" }],
  ["an envelope without resource", { type: "resource" }],
  ["a null resource", { type: "resource", resource: null }],
  ["a primitive resource", { type: "resource", resource: "html" }],
  ["a resource without uri", { type: "resource", resource: { mimeType: "text/html", text: "x" } }],
  ["a non-string uri", { type: "resource", resource: { ...VALID.resource, uri: 7 } }],
  ["a non-ui:// uri", { type: "resource", resource: { ...VALID.resource, uri: "https://evil.example/form" } }],
  ["a resource without mimeType", { type: "resource", resource: { uri: VALID.resource.uri, text: "x" } }],
  ["a non-HTML mimeType", { type: "resource", resource: { ...VALID.resource, mimeType: "application/javascript" } }],
  ["a non-string mimeType", { type: "resource", resource: { ...VALID.resource, mimeType: ["text/html"] } }],
  ["a resource without text", { type: "resource", resource: { uri: VALID.resource.uri, mimeType: "text/html" } }],
  ["a non-string text", { type: "resource", resource: { ...VALID.resource, text: { html: "x" } } }],
] as const) {
  test(`${name} is not an ask-choice UI resource`, () => {
    assert.equal(isAskChoiceUiResource(ui), false);
  });
}

test("a valid rendered form becomes the standard UI tool result", () => {
  const ui: unknown = VALID;
  assert.ok(isAskChoiceUiResource(ui));
  assert.deepEqual(askChoiceToolResult({ modelText: "pending", ui }), { ...buildUIToolResult({ modelText: "pending", ui }) });
});

test("an invalid rendered form is refused with the renderer error", () => {
  assert.throws(() => askChoiceToolResult({ modelText: "pending", ui: { type: "text" } }), { message: "ask-choice renderer returned an invalid UI resource" });
});
