import { WORKSPACE_ID } from "../../lib/api";
import type { ComposerCapabilitySource, TovuComposerCapability } from "./composer-capabilities";

/** Installed standalone skills are read fresh from the site's workspace skills directory.
 * Selection pins guidance behind a removable composer chip; dispatch adds it to the run prompt. */

/** The three wire fields C-002 (`server/http/admin/skills.ts`) projects — never `markdown` or
 *  `bundledFiles` (INV-002); this type only needs to describe what actually crosses the wire. */
interface InstalledSkillSummary {
  readonly enabled?: boolean;
  readonly toolId: string;
  readonly name: string;
  readonly description: string;
}

interface InstalledSkillsResponse {
  readonly skills?: unknown;
}

const INSTALLED_SKILLS_PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/skills`;
const INSTALLED_SKILLS_GROUP_ID = "installed-skills";
const INSTALLED_SKILLS_GROUP_LABEL = "Installed Skills";

/** See this file's own module doc: the one prefix guaranteed not to collide with the bundled
 *  catalog's `skill:` entries. */
const INSTALLED_SKILL_ID_PREFIX = "installed-skill:";

function isInstalledSkillSummary(value: unknown): value is InstalledSkillSummary {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { toolId?: unknown }).toolId === "string" &&
    typeof (value as { name?: unknown }).name === "string" &&
    typeof (value as { description?: unknown }).description === "string"
  );
}

/**
 * Turns one wire summary into a discoverable, actionable composer row.
 *
 * `insertText: ""`, not omitted: an absent `insertText` on the slash-trigger path falls back to
 * `label`, typing the skill's bare name into the draft with no instruction to act on it — the
 * exact trap `composer-capabilities.ts` documents fixing on 2026-08-21. The `resolve` binding
 * below loads the agent guidance behind the chip.
 */
function toCapability(summary: InstalledSkillSummary): TovuComposerCapability {
  return {
    groupId: INSTALLED_SKILLS_GROUP_ID,
    groupLabel: INSTALLED_SKILLS_GROUP_LABEL,
    item: {
      id: `${INSTALLED_SKILL_ID_PREFIX}${summary.toolId}`,
      label: summary.name,
      description: summary.description,
      kind: "skill",
      keywords: ["skill", summary.name],
      insertText: "",
    },
    resolve: () => ({ kind: "installed-skill", toolId: summary.toolId }),
  };
}

/**
 * Builds a {@link ComposerCapabilitySource} backed by the installed-Skills route.
 *
 * Degrades to an empty list on ANY failure — non-2xx, network error, or a body that isn't the
 * expected `{skills: [...]}` shape — rather than throwing. Load-bearing, not defensive polish
 * (INV-001): `projectComposerCapabilities` awaits every source's `list()` through one
 * `Promise.all`, so a single REJECTING source takes the WHOLE projection down with it, including
 * the bundled catalog's always-available `/search` and `/mcp` rows. A workspace with zero
 * installed skills, an unauthorized session, or a route that 500s on a duplicate-frontmatter-name
 * conflict must cost this one capability — never the rest of the composer.
 *
 * @complexity O(1) network round trip; O(n) to map n installed skills.
 */
export function createInstalledSkillsComposerCapabilitySource(): ComposerCapabilitySource {
  return {
    id: "installed-skills",
    list: async () => {
      try {
        const response = await fetch(INSTALLED_SKILLS_PATH, { credentials: "same-origin" });
        if (!response.ok) return [];

        const body = (await response.json()) as InstalledSkillsResponse;
        if (!Array.isArray(body.skills)) return [];

        return body.skills.filter(isInstalledSkillSummary).filter(s => s.enabled !== false).map(toCapability);
      } catch (error) {
        // Network failure, an unreachable server, a malformed body — every case degrades to
        // "nothing to add" rather than breaking the composer. See this function's own doc for
        // why that is required, not merely nice to have.
        console.error(
          "[installed-skills-composer-source] installed-skills enumeration failed; falling back to the bundled catalog only",
          error,
        );
        return [];
      }
    },
  };
}
