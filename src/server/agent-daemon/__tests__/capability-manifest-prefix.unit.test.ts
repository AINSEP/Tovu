import assert from "node:assert/strict";
import test from "node:test";

import { assemblePromptWithPluginPrefix } from "../plugin-prompt-prefix.js";
import {
  CAPABILITY_MANIFEST_TEXT,
  buildCapabilityManifestPrefix,
  resolveCapabilityManifestArm,
} from "../capability-manifest-prefix.js";

test("resolveCapabilityManifestArm defaults to off with no env var", () => {
  assert.equal(resolveCapabilityManifestArm({}), "off");
});

test("resolveCapabilityManifestArm falls back to off for an unrecognized value", () => {
  assert.equal(resolveCapabilityManifestArm({ TOVU_CAPABILITY_MANIFEST_ARM: "bogus" }), "off");
});

test("resolveCapabilityManifestArm reads passive, gate and mandate exactly", () => {
  assert.equal(resolveCapabilityManifestArm({ TOVU_CAPABILITY_MANIFEST_ARM: "passive" }), "passive");
  assert.equal(resolveCapabilityManifestArm({ TOVU_CAPABILITY_MANIFEST_ARM: "gate" }), "gate");
  assert.equal(resolveCapabilityManifestArm({ TOVU_CAPABILITY_MANIFEST_ARM: "mandate" }), "mandate");
});

test("buildCapabilityManifestPrefix('off') is empty — matches today's behavior exactly", () => {
  assert.equal(buildCapabilityManifestPrefix("off"), "");
});

test("an 'off' prefix leaves the assembled prompt byte-for-byte unchanged", () => {
  const basePrompt = "deploy my site";
  const assembled = assemblePromptWithPluginPrefix(basePrompt, buildCapabilityManifestPrefix("off"));
  assert.equal(assembled, basePrompt);
});

test("buildCapabilityManifestPrefix('passive') is exactly the manifest text, no gate instruction", () => {
  const prefix = buildCapabilityManifestPrefix("passive");
  assert.equal(prefix, CAPABILITY_MANIFEST_TEXT);
  assert.equal(prefix.includes("Before proposing an implementation path"), false);
});

test("buildCapabilityManifestPrefix('gate') is the manifest text PLUS the imperative instruction", () => {
  const prefix = buildCapabilityManifestPrefix("gate");
  assert.equal(prefix.startsWith(CAPABILITY_MANIFEST_TEXT), true);
  assert.equal(prefix.includes("Before proposing an implementation path"), true);
  assert.notEqual(prefix, buildCapabilityManifestPrefix("passive"));
});

test("buildCapabilityManifestPrefix('mandate') is the manifest text PLUS an unconditional first-turn instruction", () => {
  const prefix = buildCapabilityManifestPrefix("mandate");
  assert.equal(prefix.startsWith(CAPABILITY_MANIFEST_TEXT), true);
  assert.equal(prefix.includes("MANDATORY FIRST STEP"), true);
  assert.notEqual(prefix, buildCapabilityManifestPrefix("passive"));
  assert.notEqual(prefix, buildCapabilityManifestPrefix("gate"));
});

test("the mandate instruction carries NO precondition — this is the whole reason it exists", () => {
  // `gate` was measured broken because its only trigger ("before proposing an implementation path")
  // never fired: 3/3 runs asked a clarifying question instead. Any precondition phrasing creeping
  // into `mandate` would silently reintroduce exactly that hole, and the failure is invisible —
  // the arm looks enabled and simply never activates. Assert the absence directly.
  const prefix = buildCapabilityManifestPrefix("mandate");
  assert.equal(prefix.includes("Before proposing an implementation path"), false);
  assert.equal(/before proposing/i.test(prefix), false);
});

test("the mandate instruction closes the two escape routes real runs actually took", () => {
  // Not stylistic assertions: each corresponds to a recorded failure. The agent asked a clarifying
  // question rather than acting (which is what dodged `gate`), and it resolved "design guidance" to
  // "the active theme" before searching at all (the measured root cause of the 0/5 case-(b) result).
  const prefix = buildCapabilityManifestPrefix("mandate");
  assert.equal(/clarifying question/i.test(prefix), true);
  assert.equal(/plausible/i.test(prefix), true);
});

test("manifest text names the search surface and the fallback bucket", () => {
  assert.equal(CAPABILITY_MANIFEST_TEXT.includes("search_tools"), true);
  assert.equal(CAPABILITY_MANIFEST_TEXT.includes("Other installed capabilities"), true);
});

// Regression guard: `capability_search` was removed 2026-08-26 (owner call — every installed Agent
// Plugin now gets its own real `agent_plugin_<pluginId>` tool, found through `search_tools` alone).
// This text is server-injected into a live agent's prompt when an arm other than `off` is selected,
// so a dangling reference here would point a real run at a tool that no longer exists. See
// `ADS-memory/knowledge/2026-08-26-removed-capability-search.md`.
test("manifest text never points the agent at the removed capability_search tool", () => {
  assert.equal(CAPABILITY_MANIFEST_TEXT.includes("capability_search"), false);
  assert.equal(buildCapabilityManifestPrefix("mandate").includes("capability_search"), false);
});

test("manifest text is phrased as a pointer to a search vocabulary, never an existence claim", () => {
  // The debate's central design constraint: this text must never assert a capability IS installed,
  // only that a search term exists for the domain — so it is never false regardless of what a
  // workspace actually has installed. A regression here would silently reintroduce the "fixed list
  // that lies" failure mode the whole slice exists to avoid.
  assert.equal(/\byou can\b/i.test(CAPABILITY_MANIFEST_TEXT), false);
  assert.equal(/\bis installed\b/i.test(CAPABILITY_MANIFEST_TEXT), false);
});
