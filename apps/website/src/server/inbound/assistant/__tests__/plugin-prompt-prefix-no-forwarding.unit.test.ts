import assert from "node:assert/strict";
import test from "node:test";

import * as promptPrefix from "../plugin-prompt-prefix.js";

test("prompt prefix does not re-export the assembly helper", () => {
  assert.equal(typeof promptPrefix.resolveAgentPluginPromptPrefix, "function");
  assert.equal("assemblePromptWithPluginPrefix" in promptPrefix, false);
});
