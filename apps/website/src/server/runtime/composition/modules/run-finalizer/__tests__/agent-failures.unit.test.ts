import assert from "node:assert/strict";
import { test } from "node:test";
import { agentFailures } from "../agent-failures.js";

test("saved authentication wording classifies as an auth failure and ordinary text as none", () => {
  assert.equal(agentFailures.classifyServiceFailure({ text: "Not logged in · Please run /login" }), "AGENT_AUTH_REQUIRED");
  assert.equal(agentFailures.classifyServiceFailure({ text: "the build finished" }), null);
});

test("a launch rejection is worded by the runtime and redacts a leaked bearer value", () => {
  const message = agentFailures.startupFailureMessage(
    { stage: "recovery launch", error: new Error("connection refused; Bearer private-value") },
    { notice: "The assistant start response was not confirmed. Wait while this attempt is checked." },
  );
  assert.match(message, /recovery launch/);
  assert.match(message, /connection refused/);
  assert.doesNotMatch(message, /private-value/);
});
