import assert from "node:assert/strict";
import test from "node:test";

import { guardUserText } from "@jini-ai/chat/core";
import { CREDENTIAL_PASTE_MODEL_NOTE } from "#src/assistant/credential-guidance";
import { resolveMessages, toWireSurfacePayload } from "../assistant-byok.js";

/** BYOK request shaping: client history is validated fail-soft and bounded; surface emissions are
 * re-keyed to the wire shape, with only `mcp-ui` carrying the tool-use id. */

test("history keeps only well-formed user/assistant turns with non-empty text, guarding user text", () => {
  const user = "please draft the post";
  assert.deepEqual(resolveMessages([
    null, "text", { role: "system", content: "x" }, { role: "user", content: 7 }, { role: "assistant", content: "" },
    { role: "user", content: user }, { role: "assistant", content: "Done." },
  ]), [
    { role: "user", content: guardUserText({ text: user }, { modelNote: CREDENTIAL_PASTE_MODEL_NOTE, secretRedacted: false }) },
    { role: "assistant", content: "Done." },
  ]);
});

test("a non-array history is empty and a long one keeps only the newest 40 turns", () => {
  assert.deepEqual(resolveMessages({ role: "user", content: "x" }), []);
  const many = Array.from({ length: 45 }, (_, index) => ({ role: "assistant", content: `turn ${index}` }));
  const kept = resolveMessages(many);
  assert.equal(kept.length, 40);
  assert.deepEqual([kept[0]?.content, kept.at(-1)?.content], ["turn 5", "turn 44"]);
});

test("a surface emission's own type/toolUseId never leak; only mcp-ui carries the route's tool-use id", () => {
  const payload = { type: "spoofed", toolUseId: "spoofed-id", html: "<b>ok</b>" };
  assert.deepEqual(toWireSurfacePayload({ channel: "mcp-ui", payload } as never, "tool-1"), { html: "<b>ok</b>", type: "mcp-ui", toolUseId: "tool-1" });
  assert.deepEqual(toWireSurfacePayload({ channel: "a2ui", payload } as never, "tool-1"), { html: "<b>ok</b>", type: "a2ui" });
  assert.deepEqual(payload, { type: "spoofed", toolUseId: "spoofed-id", html: "<b>ok</b>" }, "the emission itself is not mutated");
});
