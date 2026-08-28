import assert from "node:assert/strict";
import test from "node:test";

import { toInstalledSkillsResponse } from "../../skills.js";
import type { SkillToolSource } from "#src/features/skills/tool-registrations";

/**
 * @file C-002 `toInstalledSkillsResponse()` — implementation-outline.md (skills-composer-typeahead).
 *
 * TDD-certified against the not-yet-created `../../skills.ts`; currently RED — the module does not
 * exist. These assertions describe the contract the Programmer stage must satisfy: a pure
 * `SkillToolSource[] -> SkillSummary[]` projection whose whole job (INV-002) is to keep `markdown`
 * and absolute-path `bundledFiles` from ever crossing the HTTP boundary — see this repo's
 * `tool-registrations.ts:71-73` for why an absolute host path must never reach a browser-visible
 * surface.
 */

function source(overrides: Partial<SkillToolSource> = {}): SkillToolSource {
  return {
    id: "skill_incident_response",
    skillName: "incident-response",
    description: "Use when handling production incidents, defining severity and escalation.",
    markdown: "---\nname: incident-response\ndescription: Use when handling production incidents.\n---\n\nFull skill body.",
    bundledFiles: [
      { kind: "references", path: "/Users/example/infra/skills/ws/workspace-local/incident-response/references/runbook.md" },
    ],
    ...overrides,
  };
}

test("C-002: projects toolId/name/description verbatim from source id/skillName/description", () => {
  const result = toInstalledSkillsResponse([source()]);
  assert.deepEqual(result, [
    {
      toolId: "skill_incident_response",
      name: "incident-response",
      description: "Use when handling production incidents, defining severity and escalation.",
    },
  ]);
});

test("INV-002: the wire object never carries markdown or bundledFiles, even though the source has both", () => {
  const [result] = toInstalledSkillsResponse([source()]);
  assert.ok(result);
  assert.deepEqual(Object.keys(result).sort(), ["description", "name", "toolId"]);
});

test("projects every source in order, one wire row per source", () => {
  const result = toInstalledSkillsResponse([
    source({ id: "skill_incident_response", skillName: "incident-response" }),
    source({ id: "skill_code_review", skillName: "code-review", description: "Use when reviewing a pull request." }),
  ]);
  assert.deepEqual(
    result.map((r) => r.toolId),
    ["skill_incident_response", "skill_code_review"]
  );
});

test("an empty source list projects to an empty array", () => {
  assert.deepEqual(toInstalledSkillsResponse([]), []);
});
