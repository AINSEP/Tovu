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
