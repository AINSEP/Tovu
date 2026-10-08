import assert from "node:assert/strict";
import test from "node:test";

import { rankInstalledAgentPlugins, type AgentPluginSearchCandidate } from "../../lifecycle.js";

/**
 * @file `rankInstalledAgentPlugins()` — pure field-weighted relevance ranking, no I/O. See
 * `search.ts`'s own header for the field-weight rationale this file proves out.
 */

function candidate(overrides: Partial<AgentPluginSearchCandidate> = {}): AgentPluginSearchCandidate {
  return {
    pluginId: "site-compliance",
    version: "1.0.0",
    description:
      "Evidence-based privacy, cookie/consent, and accessibility risk screening for a Tovu site.",
    keywords: ["compliance", "privacy", "gdpr", "ccpa", "cpra", "cookie", "consent", "wcag", "accessibility"],
    enabled: true,
    skills: [{ name: "site-compliance", summary: "Evidence-based privacy and accessibility risk screening." }],
    mcpServerIds: [],
    ...overrides,
  };
}

test("limit truncates the result set to the requested size", () => {
  const many = [
    candidate({ pluginId: "weak", keywords: [], description: "gdpr", skills: [] }),
    candidate({ pluginId: "weaker", keywords: [], description: undefined, skills: [{ name: "misc", summary: "gdpr" }] }),
    candidate({ pluginId: "gdpr-top", keywords: ["gdpr"], description: "gdpr", skills: [] }),
    candidate({ pluginId: "gdpr-next", keywords: ["gdpr"], description: undefined, skills: [] }),
  ];
  const matches = rankInstalledAgentPlugins("gdpr", many, 2);
  assert.equal(matches.length, 2);
  assert.deepEqual(matches.map(match => match.pluginId), ["gdpr-top", "gdpr-next"]);
});

test("every field of the source candidate is carried through onto the match, plus a score", () => {
  const original = candidate();
  const [match] = rankInstalledAgentPlugins("gdpr", [original], 10);
  assert.ok(match);
  assert.equal(match.pluginId, "site-compliance");
  assert.equal(match.version, "1.0.0");
  assert.equal(match.enabled, true);
  assert.deepEqual(match.mcpServerIds, []);
  assert.equal(typeof match.score, "number");
  const { score, ...payload } = match;
  assert.deepEqual(payload, original);
  assert.ok(score > 0);
});
