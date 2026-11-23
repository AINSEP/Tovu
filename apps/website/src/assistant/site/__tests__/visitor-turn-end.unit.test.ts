/** VISITOR-CHAT cut-off (2026-11-23): see `visitor-turn-end.ts` for why the adapter's `stop` cannot be trusted alone. */
import assert from "node:assert/strict";
import test from "node:test";
import { outputTokensOf, visitorTurnEnd } from "../visitor-turn-end";

test("outputTokensOf reads the normalised output_tokens and ignores anything else", () => {
  assert.equal(outputTokensOf({ usage: { output_tokens: 42 } }), 42);
  assert.equal(outputTokensOf({ usage: { output_tokens: "42" } }), undefined);
  assert.equal(outputTokensOf({ usage: null }), undefined);
  assert.equal(outputTokensOf({ usage: {} }), undefined);
});

test("a stop whose last request used the whole output budget is truncated", () => {
  assert.deepEqual(visitorTurnEnd({ reason: "stop", lastOutputTokens: 1024, maxTokens: 1024 }), { reason: "truncated" });
  assert.deepEqual(visitorTurnEnd({ reason: "stop", lastOutputTokens: 5000, maxTokens: 1024 }), { reason: "truncated" });
});

test("a stop under the budget, or with no usage reported, stays a stop", () => {
  assert.deepEqual(visitorTurnEnd({ reason: "stop", lastOutputTokens: 1023, maxTokens: 1024 }), { reason: "stop" });
  assert.deepEqual(visitorTurnEnd({ reason: "stop", lastOutputTokens: undefined, maxTokens: 1024 }), { reason: "stop" });
});

test("only a stop is reclassified: error, navigation and tool-turn caps pass through untouched", () => {
  for (const reason of ["error", "navigation", "max_tool_turns", "contaminated"]) {
    assert.deepEqual(visitorTurnEnd({ reason, lastOutputTokens: 9999, maxTokens: 1024 }), { reason });
  }
});
