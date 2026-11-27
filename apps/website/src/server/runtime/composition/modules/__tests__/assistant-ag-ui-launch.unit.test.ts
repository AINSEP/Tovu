import assert from "node:assert/strict";
import test from "node:test";

import { readAgUiLaunchFields } from "../assistant-ag-ui-launch.js";

test("launch accepts bounded references and settings but not caller-asserted run authority", () => {
  const refs = Array.from({ length: 32 }, (_, index) => `attachment-${index}`);
  const longestRef = "p".repeat(512);
  const longestSetting = "m".repeat(200);
  const pageContext = { path: "/pages/entry-7", section: "pages" };
  const folders = ["/fixture/picked"];
  const agentPluginState = { selected: "plugin-a" };

  assert.deepEqual(readAgUiLaunchFields({ durable: { launch: {
    attachmentIds: [null, "", "x".repeat(513), ...refs, "over-budget"],
    pluginRefIds: [longestRef, 5, "plugin-b"],
    model: longestSetting, reasoning: "high", pageContext, folders, agentPluginState,
    principalId: "another-owner", recoveryMode: "resume", sessionId: "another-session",
  } } }), {
    attachmentIds: refs, pluginRefIds: [longestRef, "plugin-b"], model: longestSetting, reasoning: "high",
    pageContext, folders, agentPluginState,
  });
});

test("launch treats malformed envelopes as absent and drops invalid individual fields", () => {
  for (const durable of [undefined, null, false, "launch", {}, { launch: null }, { launch: "invalid" }]) {
    assert.deepEqual(readAgUiLaunchFields({ durable }), {});
  }
  assert.deepEqual(readAgUiLaunchFields({ durable: { launch: {
    attachmentIds: "not-an-array", pluginRefIds: ["", 8], model: "", reasoning: "r".repeat(201),
    pageContext: { section: "missing-path" },
  } } }), { pageContext: undefined, folders: undefined, agentPluginState: undefined });
});
