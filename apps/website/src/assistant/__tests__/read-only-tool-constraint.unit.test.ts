import assert from "node:assert/strict";
import test from "node:test";
import { checkReadOnlyTool } from "@jini-ai/daemon/read-only-tools";
import { tovuReadOnlyToolMessages, readOnlyToolRefusalMessage } from "../read-only-tool-constraint.js";

test("Tovu directs unknown read-only tool ids to discovery with candidates and preserves write refusal wording", () => {
  const registry = { list: () => [{ id: "content_read.menu", readOnly: true }, { id: "media_import_from_url", readOnly: false }] };
  assert.equal(checkReadOnlyTool({ toolId: "content_read", registry, messages: tovuReadOnlyToolMessages }, {}),
    'no tool "content_read" is registered; use search_tools — did you mean content_read.menu?');
  assert.equal(checkReadOnlyTool({ toolId: "missing", registry, messages: tovuReadOnlyToolMessages }, {}),
    'no tool "missing" is registered; use search_tools');
  assert.equal(checkReadOnlyTool({ toolId: "media_import_from_url", registry, messages: tovuReadOnlyToolMessages }, {}),
    readOnlyToolRefusalMessage("media_import_from_url"));
});
