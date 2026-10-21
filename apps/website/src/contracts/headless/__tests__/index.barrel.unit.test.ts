import assert from "node:assert/strict";
import test from "node:test";

import * as headless from "../index.js";
import { deriveContentConversationTitle } from "../content-chat-title.js";
import { directPageAction, TOOL_APPROVAL_POLICY } from "../assistant-tool-approval-policy.js";
import * as permanentDeletes from "../assistant-permanent-deletes-policy.js";
import { ASSISTANT_CLI_CAPABILITIES, ASSISTANT_SUBAGENTS_KEY, ASSISTANT_SUBAGENTS_NAMESPACE, assistantCliPermissions } from "../assistant-subagents-policy.js";

/** @file The headless contract barrel re-exports the owning modules' values unchanged (same identities, nothing extra). */

test("the headless barrel exposes exactly the owning modules' runtime values", () => {
  const expected: Record<string, unknown> = {
    deriveContentConversationTitle, directPageAction, TOOL_APPROVAL_POLICY,
    ASSISTANT_SUBAGENTS_NAMESPACE, ASSISTANT_SUBAGENTS_KEY, ASSISTANT_CLI_CAPABILITIES, assistantCliPermissions,
    ...permanentDeletes,
  };
  assert.deepEqual(Object.keys(headless).sort(), Object.keys(expected).sort());
  for (const [name, value] of Object.entries(expected)) {
    assert.equal((headless as Record<string, unknown>)[name], value, name);
  }
});
