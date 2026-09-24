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
// top 10 98% of the time and in the top 20 100% of the time". Verified fabricated: the eval it
// claimed as its source (`tool-search-heldout-v2.eval.ts`) declares `CUTOFFS = [1, 3, 5, 10] as
// const` — no top-20 cutoff exists in that file. `git log -S` on the exact phrase traces it to
// `d6ac6975` (2026-08-08), which added it as brand-new text (to this file's pre-extraction home,
// `agent-daemon-server.ts`) with no cited measurement — not carried through from a real eval run.
// Full trail: `ADS-memory/reports/2026-09-08-byok-fabricated-stat.md`.
//
// The fix does NOT replace the false number with a true-today one — see that report for why: a
// retrieval percentage is a property of the current catalog, the catalog is actively changing in
// this same repo, and nothing in this file re-measures the number it would assert. The second
// assertion below guards that reasoning directly, failing the moment anyone adds ANY percentage
// back to this text, not just the specific old one. It also removes a standing internal
// contradiction: a "100% of the time" guarantee sat a few sentences before this same overlay's own
// "if it still does not exist, SAY SO" guidance — both cannot be true at once.
// Deliberately NOT a full-string pin (superseded an earlier version of this test that was one):
// pinning the entire sentence recreates the same trap in the test layer that this fix removes
// from the prompt text — a maintainer reworking the retry guidance would have to fight a
// brittle test unrelated to the property that actually matters. These assert the specific,
// load-bearing phrases the behavior depends on instead.
test("both overlays tell the model a miss at the default cutoff is weak evidence, not proof no tool exists, and to retry before giving up", () => {
  for (const overlay of [buildBaseSystemOverlay(false), buildBaseSystemOverlay(true)]) {
    assert.match(overlay, /search again with a higher limit \(up to 25\) or different phrasing/);
    assert.match(overlay, /weak evidence, not proof that no matching tool exists/);
  }
});

test("neither overlay names a coverage percentage — a hardcoded retrieval number here is the exact shape of the defect this fixes, regardless of whether the number happens to be true today", () => {
  for (const overlay of [buildBaseSystemOverlay(false), buildBaseSystemOverlay(true)]) {
    assert.doesNotMatch(overlay, /\d+%/);
  }
});

// Finding 2 (SEC-assistant-env-isolation-2026-09-07): ASSISTANT_DISALLOWED_TOOLS is the actual,
// enforced gate (agent-daemon-server.ts forwards it to AgentExecutorRunInput.disallowedTools) —
// these pin its exact contents against silent drift, since a caller reads this array by reference.
test("ASSISTANT_DISALLOWED_TOOLS names exactly the host-CLI-builtin tools the security report flagged as dangerous and unused", () => {
  assert.deepEqual(
    ASSISTANT_DISALLOWED_TOOLS.filter((rule) => !rule.includes("(")).sort(),
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

// Owner rule: the agent must never read the root key. The CLI runs under bypassPermissions with a
// production cwd that contains sites/.tovu, so its built-in Read/Grep/Glob would otherwise walk
// straight past the fs-files denylist. Grep and Glob honour Read() deny rules; `//` is an absolute
// pattern, so `//**/.tovu/**` covers the folder at any depth, cwd or home alike.
test("ASSISTANT_DISALLOWED_TOOLS denies Read on the .tovu folder at any depth, in home, on any *root-key*.hex, and on /proc", () => {
  assert.deepEqual(
    ASSISTANT_DISALLOWED_TOOLS.filter((rule) => rule.includes("(")).sort(),
    [
      "Read(//**/.tovu/**)",
      "Read(~/.tovu/**)",
      "Read(//**/*root-key*.hex)",
      "Read(//proc/**)",
    ].sort(),
  );
});

test("ASSISTANT_DISALLOWED_TOOLS does not name a tool the assistant has real observed use of (Read, ToolSearch, or Tovu's own catalog names)", () => {
  for (const usedTool of ["Read", "ToolSearch", "search_tools", "describe_tool", "execute_delegated_tool"]) {
    assert.equal(ASSISTANT_DISALLOWED_TOOLS.includes(usedTool), false, `${usedTool} has real observed use in chat.db and must not be restricted`);
  }
});
