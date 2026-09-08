import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSISTANT_DISALLOWED_TOOLS,
  BASH_GUIDANCE_BLOCK,
  BASH_PROHIBITION_BLOCK,
  buildBaseSystemOverlay,
  buildBashProhibitionBlock,
  resolveBashProhibitionEnabled,
} from "../assistant-system-overlay.js";

test("resolveBashProhibitionEnabled defaults to false with no env var set", () => {
  assert.equal(resolveBashProhibitionEnabled({}), false);
});

test("resolveBashProhibitionEnabled is false for anything other than the exact sentinel '1'", () => {
  assert.equal(resolveBashProhibitionEnabled({ TOVU_AGENT_FORBID_BASH: "true" }), false);
  assert.equal(resolveBashProhibitionEnabled({ TOVU_AGENT_FORBID_BASH: "0" }), false);
  assert.equal(resolveBashProhibitionEnabled({ TOVU_AGENT_FORBID_BASH: "" }), false);
});

test("resolveBashProhibitionEnabled reads the '1' sentinel exactly", () => {
  assert.equal(resolveBashProhibitionEnabled({ TOVU_AGENT_FORBID_BASH: "1" }), true);
});

test("buildBashProhibitionBlock(false) is BASH_GUIDANCE_BLOCK verbatim, unmodified", () => {
  assert.equal(buildBashProhibitionBlock(false), BASH_GUIDANCE_BLOCK);
});

test("buildBashProhibitionBlock(true) is BASH_PROHIBITION_BLOCK verbatim, unmodified", () => {
  assert.equal(buildBashProhibitionBlock(true), BASH_PROHIBITION_BLOCK);
});

// Regression: a same-day change dropped the original HEAD steering text entirely when the
// prohibition flag was off, leaving a downloaded Tovu with LESS Bash guidance than it had
// yesterday. The owner approved restoring it verbatim as the flag-off default — this is the core
// defect this file exists to fix.
test("default (flag off): the base overlay carries the original steering text, not the prohibition", () => {
  const overlay = buildBaseSystemOverlay(false);
  assert.equal(overlay.includes(BASH_GUIDANCE_BLOCK), true);
  assert.equal(overlay.includes("ABSOLUTE PROHIBITION"), false);
  assert.equal(overlay.includes("THE BASH TOOL IS FORBIDDEN"), false);
});

test("flag on: the base overlay contains the prohibition block verbatim, not the steering text", () => {
  const overlay = buildBaseSystemOverlay(true);
  assert.equal(overlay.includes("ABSOLUTE PROHIBITION"), true);
  assert.equal(overlay.includes(BASH_PROHIBITION_BLOCK), true);
  assert.equal(overlay.includes(BASH_GUIDANCE_BLOCK), false);
});

test("the rest of the base overlay is identical whether the flag is on or off", () => {
  // Splitting each overlay on its own variant of the Bash slot isolates exactly the one piece
  // allowed to differ; every other character — tool-catalog protocol, ask-choice guidance,
  // credential-auth-diagnostic instructions, etc — must be byte-for-byte the same either way.
  const overlayOff = buildBaseSystemOverlay(false);
  const overlayOn = buildBaseSystemOverlay(true);
  assert.equal(
    overlayOn.replace(BASH_PROHIBITION_BLOCK, ""),
    overlayOff.replace(BASH_GUIDANCE_BLOCK, ""),
  );
});

test("both overlays still carry the surrounding tool-catalog protocol untouched", () => {
  for (const overlay of [buildBaseSystemOverlay(false), buildBaseSystemOverlay(true)]) {
    assert.equal(overlay.includes("search_tools FIRST"), true);
    assert.equal(overlay.includes("What to do instead when you believe no tool fits"), true);
    assert.equal(overlay.includes("assistant_ask_choice"), true);
  }
});

// FABRICATED-STAT FIX (2026-09-08): the overlay used to assert "the right tool is in the default
// top 10 98% of the time and in the top 20 100% of the time" — no reproducible source (see
// `ADS-memory/reports/2026-09-08-parent-tool-read-eval.md` §0.1: the cited 130-case eval never
// measured top-20, and its own top-10 result is 25%, not 98%). That report's repaired baseline
// (real 177-tool composition) measured the true figures: 87% top-10, 94% top-20, n=130. Also fixes
// the internal tension with this same overlay's own "if it still does not exist, SAY SO" guidance a
// few sentences later — a "100% of the time" guarantee and a real not-found path cannot both be true.
test("both overlays state the true measured accuracy (87% top-10 / 94% top-20), not the fabricated 98%/100% figure", () => {
  for (const overlay of [buildBaseSystemOverlay(false), buildBaseSystemOverlay(true)]) {
    assert.equal(
      overlay.includes(
        "search again with a higher limit (up to 25) or different phrasing before concluding no " +
          "tool exists: on a 130-case blind set the right tool is in the default top 10 87% of the " +
          "time and in the top 20 94% of the time, so a miss at either cutoff is common enough to " +
          "be worth a retry, not proof the tool is absent.",
      ),
      true,
    );
    assert.equal(overlay.includes("98%"), false);
    assert.equal(overlay.includes("100% of the time"), false);
  }
});

// Finding 2 (SEC-assistant-env-isolation-2026-09-07): ASSISTANT_DISALLOWED_TOOLS is the actual,
// enforced gate (agent-daemon-server.ts forwards it to AgentExecutorRunInput.disallowedTools) —
// these pin its exact contents against silent drift, since a caller reads this array by reference.
test("ASSISTANT_DISALLOWED_TOOLS names exactly the host-CLI-builtin tools the security report flagged as dangerous and unused", () => {
  assert.deepEqual(
    [...ASSISTANT_DISALLOWED_TOOLS].sort(),
    [
      "Bash",
      "CronCreate",
      "CronDelete",
      "CronList",
      "Edit",
      "EnterWorktree",
      "ExitWorktree",
      "RemoteTrigger",
      "Task",
      "Workflow",
      "Write",
    ].sort(),
  );
});

test("ASSISTANT_DISALLOWED_TOOLS does not name a tool the assistant has real observed use of (Read, ToolSearch, or Tovu's own catalog names)", () => {
  for (const usedTool of ["Read", "ToolSearch", "search_tools", "describe_tool", "execute_delegated_tool"]) {
    assert.equal(ASSISTANT_DISALLOWED_TOOLS.includes(usedTool), false, `${usedTool} has real observed use in chat.db and must not be restricted`);
  }
});
