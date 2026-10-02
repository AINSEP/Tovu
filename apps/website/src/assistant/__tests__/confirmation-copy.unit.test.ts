import assert from "node:assert/strict";
import test from "node:test";
import {askChoiceAgentToolCatalog} from "../ask-choice-tool.js";

test("ordinary requested work is not sent through an extra choice confirmation", () => {
  const description = askChoiceAgentToolCatalog.find(tool => tool.name === "assistant_ask_choice")!.description;
  assert.match(description, /Do not use it to reconfirm ordinary writes/);
  assert.match(description, /Only permanent deletes, sends to real people/);
  assert.match(description, /Do not add a second confirmation question/);
  assert.doesNotMatch(description, /especially before any action that writes/);
});

test("known publishing accounts are used without reconfirming them", async () => {
  const {staticPublishAgentToolCatalog} = await import("../../features/deployments/publish-agent-tools.js");
  for (const name of ["deployment_preview_static_publish", "deployment_get_static_publish_capabilities"]) {
    const description = staticPublishAgentToolCatalog.find(tool => tool.name === name)!.description;
    assert.doesNotMatch(description, /still confirm it with the human/);
    assert.match(description, /missing or ambiguous/);
    assert.match(description, /accountLabel is null and no account was supplied/);
  }
});

test("resetting the visible conversation does not ask the operator for confirmation", async () => {
  const {FRONTEND_CONTROL_CAPABILITIES} = await import("../frontend-control-capabilities.js");
  const reset = FRONTEND_CONTROL_CAPABILITIES.find(capability => capability.id === "chat.reset_conversation")!;
  assert.equal(reset.requiresConfirmation, undefined);
  assert.match(reset.description, /without asking for confirmation/);
  assert.doesNotMatch(reset.description, /Requires explicit confirmation/);
});
