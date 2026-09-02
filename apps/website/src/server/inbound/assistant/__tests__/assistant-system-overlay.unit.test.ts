import assert from "node:assert/strict";
import test from "node:test";

import {
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
