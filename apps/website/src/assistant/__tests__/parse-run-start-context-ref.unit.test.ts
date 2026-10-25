import assert from "node:assert/strict";
import test from "node:test";

import { parseRunStartContextRef } from "../run-start-context.js";

/**
 * @file `parseRunStartContextRef` — the decode/validate step `agent-daemon-server.ts`'s `onStarted`
 * uses, moved to its own module (`run-start-context.ts`, see that file's header for why) so this
 * import does NOT pull in `agent-daemon-server.ts` itself — that file ends in an unconditional
 * `void start()` that binds a real port at import time, which would make importing it from a test
 * either bind a real port in this process or, if the port is already taken by a live daemon
 * elsewhere, call `process.exit()` mid test-run. Neither is acceptable here. This is the hop that
 * most directly proves "the picker's model survives into the executor call" — its output is spread
 * verbatim into `agentExecutor.run(...)` with no further transformation (see `onStarted`'s own
 * `...(model !== undefined ? { model } : {})`).
 */

test("forwards a model present in contextRef", () => {
  const result = parseRunStartContextRef(JSON.stringify({ prompt: "hi", principalId: "p1", model: "sonnet" }));
  assert.equal(result.model, "sonnet");
  assert.equal(result.prompt, "hi");
  assert.equal(result.principalId, "p1");
});

test("omits model when absent from contextRef", () => {
  const result = parseRunStartContextRef(JSON.stringify({ prompt: "hi", principalId: "p1" }));
  assert.equal(result.model, undefined);
});

test("a non-string model is not forwarded", () => {
  const result = parseRunStartContextRef(JSON.stringify({ prompt: "hi", principalId: "p1", model: 42 }));
  assert.equal(result.model, undefined);
});

test("an empty-string model is not forwarded", () => {
  const result = parseRunStartContextRef(JSON.stringify({ prompt: "hi", principalId: "p1", model: "" }));
  assert.equal(result.model, undefined);
});

test("still requires prompt and principalId, unchanged", () => {
  assert.throws(() => parseRunStartContextRef(JSON.stringify({ principalId: "p1" })), /prompt/);
  assert.throws(() => parseRunStartContextRef(JSON.stringify({ prompt: "hi" })), /principalId/);
});

test("still filters attachmentIds down to non-empty strings, unchanged", () => {
  const result = parseRunStartContextRef(
    JSON.stringify({ prompt: "hi", principalId: "p1", attachmentIds: ["a", "", 42, "b"] }),
  );
  assert.deepEqual(result.attachmentIds, ["a", "b"]);
});

test("forwards pluginRefIds present in contextRef", () => {
  const result = parseRunStartContextRef(
    JSON.stringify({ prompt: "hi", principalId: "p1", pluginRefIds: ["ui-ux-design"] }),
  );
  assert.deepEqual(result.pluginRefIds, ["ui-ux-design"]);
});

test("defaults pluginRefIds to an empty array when absent from contextRef", () => {
  const result = parseRunStartContextRef(JSON.stringify({ prompt: "hi", principalId: "p1" }));
  assert.deepEqual(result.pluginRefIds, []);
});

test("filters pluginRefIds down to non-empty strings, same as attachmentIds", () => {
  const result = parseRunStartContextRef(
    JSON.stringify({ prompt: "hi", principalId: "p1", pluginRefIds: ["ui-ux-design", "", 42, "second-plugin"] }),
  );
  assert.deepEqual(result.pluginRefIds, ["ui-ux-design", "second-plugin"]);
});

test("a non-array pluginRefIds is not forwarded", () => {
  const result = parseRunStartContextRef(
    JSON.stringify({ prompt: "hi", principalId: "p1", pluginRefIds: "ui-ux-design" }),
  );
  assert.deepEqual(result.pluginRefIds, []);
});

// `conversationId` — feeds `agent-session-resume.ts`'s per-conversation session lookup, same
// "silently degrade to none" convention already proven above for `model`.

test("forwards a conversationId present in contextRef", () => {
  const result = parseRunStartContextRef(JSON.stringify({ prompt: "hi", principalId: "p1", conversationId: "c1" }));
  assert.equal(result.conversationId, "c1");
});

test("omits conversationId when absent from contextRef", () => {
  const result = parseRunStartContextRef(JSON.stringify({ prompt: "hi", principalId: "p1" }));
  assert.equal(result.conversationId, undefined);
});

test("a non-string conversationId is not forwarded", () => {
  const result = parseRunStartContextRef(JSON.stringify({ prompt: "hi", principalId: "p1", conversationId: 42 }));
  assert.equal(result.conversationId, undefined);
});

test("an empty-string conversationId is not forwarded", () => {
  const result = parseRunStartContextRef(JSON.stringify({ prompt: "hi", principalId: "p1", conversationId: "" }));
  assert.equal(result.conversationId, undefined);
});

/**
 * `reasoning` is the model field's twin: the Execution tab's "Reasoning effort" pick rides the same
 * `contextRef` envelope, and `onStarted` spreads it into `AgentExecutor.run()` the same way, so the
 * def's own `buildArgs` can emit `--effort <level>` / `-c model_reasoning_effort=...`. Decoding it
 * with the identical optional/degrade rules is what keeps the two from drifting apart.
 */
test("forwards a reasoning level present in contextRef", () => {
  const result = parseRunStartContextRef(JSON.stringify({ prompt: "hi", principalId: "p1", reasoning: "high" }));
  assert.equal(result.reasoning, "high");
});

test("omits reasoning when absent from contextRef", () => {
  const result = parseRunStartContextRef(JSON.stringify({ prompt: "hi", principalId: "p1" }));
  assert.equal(result.reasoning, undefined);
});

test("a non-string reasoning is not forwarded", () => {
  const result = parseRunStartContextRef(JSON.stringify({ prompt: "hi", principalId: "p1", reasoning: 3 }));
  assert.equal(result.reasoning, undefined);
});

test("an empty-string reasoning is not forwarded", () => {
  const result = parseRunStartContextRef(JSON.stringify({ prompt: "hi", principalId: "p1", reasoning: "" }));
  assert.equal(result.reasoning, undefined);
});

test("model and reasoning both survive the same envelope", () => {
  const result = parseRunStartContextRef(
    JSON.stringify({ prompt: "hi", principalId: "p1", model: "opus", reasoning: "max" }),
  );
  assert.equal(result.model, "opus");
  assert.equal(result.reasoning, "max");
});

test("invalid JSON and non-object envelopes cannot start a run", () => {
  assert.throws(() => parseRunStartContextRef("not JSON"), SyntaxError);
  for (const raw of ["null", "[]", "42", '"text"', "true"]) {
    assert.throws(() => parseRunStartContextRef(raw), Error, raw);
  }
});

test("daemon model prompt removes pasted credentials and preserves the request", () => {
  const secret = 'sk-' + 'A1b2C3d4E5f6G7h8I9j0';
  const prompt = parseRunStartContextRef(JSON.stringify({ prompt: `Use this ${secret} to connect my account`, principalId: 'p1' })).prompt;
  assert.equal(prompt, 'Use this [token removed] to connect my account\n\nThe user tried to share a credential; open the matching card. Do not repeat the removed value. Tell them to rotate it if it was real.');
  assert.equal(prompt.includes(secret), false, 'raw credential reached daemon model input');
});

test('carries validated per-chat plugin decisions and the actual current request', () => {
  const state = { decision: { selected: ['synthetic'] }, excluded: ['excluded'] };
  const result = parseRunStartContextRef(JSON.stringify({ prompt: 'full transcript', userPrompt: 'design a theme', principalId: 'p1', agentPluginState: state }));
  assert.deepEqual(result.agentPluginState, state);
  assert.equal(result.userPrompt, 'design a theme');
  assert.deepEqual(parseRunStartContextRef(JSON.stringify({ prompt: 'hi', principalId: 'p1', agentPluginState: { decision: 'forged', excluded: [42] } })).agentPluginState, { decision: null, excluded: [] });
});

// L11 Stryker: the recovery fields, the coldStartContext/userPrompt size caps and the required-field
// refusals survived. One row per branch, asserting WHICH error and WHICH fields come back.
test("missing, empty or non-string prompt/principalId is refused naming the field", () => {
  for (const [body, label] of [[{ principalId: "p" }, "prompt"], [{ prompt: "", principalId: "p" }, "prompt"], [{ prompt: 1, principalId: "p" }, "prompt"],
    [{ prompt: "hi" }, "principalId"], [{ prompt: "hi", principalId: "" }, "principalId"], [{ prompt: "hi", principalId: ["p"] }, "principalId"]] as const) {
    assert.throws(() => parseRunStartContextRef(JSON.stringify(body)), { message: `contextRef did not decode to a non-empty '${label}'` }, JSON.stringify(body));
  }
});

test("recovery fields pass only in their documented shapes", () => {
  const full = parseRunStartContextRef(JSON.stringify({ prompt: "hi", principalId: "p", assistantMessageId: "m-1", recoveryMode: "native", recoverySessionId: "s-1" }));
  assert.equal(full.assistantMessageId, "m-1");
  assert.equal(full.recoveryMode, "native");
  assert.equal(full.recoverySessionId, "s-1");
  assert.equal(parseRunStartContextRef(JSON.stringify({ prompt: "hi", principalId: "p", recoveryMode: "reconstruction" })).recoveryMode, "reconstruction");
  const none = parseRunStartContextRef(JSON.stringify({ prompt: "hi", principalId: "p", assistantMessageId: "", recoveryMode: "NATIVE", recoverySessionId: 7 }));
  for (const key of ["assistantMessageId", "recoveryMode", "recoverySessionId", "model", "reasoning", "conversationId", "coldStartContext", "userPrompt", "pageContext"]) {
    assert.equal(Object.hasOwn(none, key), false, key);
  }
});

test("optional strings are kept only when non-empty, and the cold-start and user-prompt texts are capped", () => {
  const parsed = parseRunStartContextRef(JSON.stringify({ prompt: "hi", principalId: "p", model: "m", reasoning: "high", conversationId: "c-1",
    coldStartContext: `${"a".repeat(10)}${"b".repeat(500_000)}`, userPrompt: `${"u".repeat(16_000)}tail` }));
  assert.equal(parsed.model, "m");
  assert.equal(parsed.reasoning, "high");
  assert.equal(parsed.conversationId, "c-1");
  assert.equal(parsed.coldStartContext, "b".repeat(500_000), "the most recent 500k characters are kept");
  assert.equal(parsed.userPrompt, "u".repeat(16_000), "the user prompt keeps its first 16k characters");
  const empty = parseRunStartContextRef(JSON.stringify({ prompt: "hi", principalId: "p", model: "", reasoning: "", conversationId: "", coldStartContext: "" }));
  for (const key of ["model", "reasoning", "conversationId", "coldStartContext"]) assert.equal(Object.hasOwn(empty, key), false, key);
});
