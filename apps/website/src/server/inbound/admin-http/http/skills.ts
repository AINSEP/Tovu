import type { SkillToolSource } from "#src/features/skills/tool-registrations";

/** Minimal summary DTO for consumers that need discovery fields only. The Skills management
 * route uses listManagedSkills for enabled state and provenance. Guidance is loaded separately. */

/** The wire shape of one installed skill (C-001's `GET .../skills` response, per-item). */
export interface SkillSummary {
  readonly toolId: string;
  readonly name: string;
  readonly description: string;
}

/**
 * Projects loaded skill sources to the three wire fields. Pure, total — no I/O, no validation
 * (inputs are already validated by `loadInstalledSkillToolSources`).
 *
 * @complexity O(n) in `sources.length`.
 */
export function toInstalledSkillsResponse(sources: readonly SkillToolSource[]): SkillSummary[] {
  return sources.map((source) => ({
    toolId: source.id,
    name: source.skillName,
    description: source.description,
  }));
}
