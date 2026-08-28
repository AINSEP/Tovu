import type { SkillToolSource } from "#src/features/skills/tool-registrations";

/**
 * @file `toInstalledSkillsResponse()` — C-002 (implementation-outline.md, skills-composer-typeahead).
 *
 * Purpose:
 * The one place that decides what an installed standalone Agent Skill looks like once it leaves
 * the server. `SkillToolSource` (`features/skills/tool-registrations.ts`) also carries `markdown`
 * (the full `SKILL.md` body) and `bundledFiles` (ABSOLUTE host filesystem paths — justified there
 * only because that consumer is a spawned CLI agent with real filesystem access). Neither may reach
 * the browser: `markdown` would defeat progressive disclosure, and an absolute host path is exactly
 * the class of value that file's own header calls out as never allowed to reach a browser-visible
 * surface (INV-002). Dropping both fields is therefore load-bearing, not incidental field
 * selection — see `routes/admin/skills/list.ts` for the route this feeds.
 *
 * Mirrors `features/plugin-runtime/admin-response.ts`'s `toAdminPluginResponse()` shape (a pure,
 * total DTO projection with no I/O), but stays local to `server/http/admin` rather than living in
 * `features/skills` — unlike the plugins DTO, nothing outside this HTTP surface needs it.
 */

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
