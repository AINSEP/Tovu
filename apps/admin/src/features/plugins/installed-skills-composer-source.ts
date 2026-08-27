import { WORKSPACE_ID } from "../../lib/api";
import type { ComposerCapabilitySource, TovuComposerCapability } from "./composer-capabilities";

/**
 * @file The `ComposerCapabilitySource` half of the `skills-composer-typeahead` dispatch
 * (implementation outline C-004) — the browser-side consumer of
 * `GET /api/admin/v1/workspaces/:workspaceId/skills` (Phase 1A, `src/server/routes/admin/skills/list.ts`).
 * That route re-reads `infra/skills/ws/<workspaceId>/` per request via the same loader the agent
 * daemon uses to register `skill_*` tools at boot, so this source and the agent's own tool
 * registry can never disagree about which installed standalone Skills exist or what their tool
 * ids are (outline Q1).
 *
 * Sibling of `tool-catalog-composer-source.ts` — same shape (fetch, shape-guard, degrade-to-`[]`)
 * for a different transport — but NOT the same feature it was rejected in favor of. That source
 * enumerates every registered tool with no `resolve`, deliberately inert (see its own module
 * doc). This source enumerates one narrow, human-curated set — Skills a user installed on
 * purpose — and each row IS actionable: selecting one composes a pointer at the real,
 * registered `skill_<name>` tool into the draft for the user to review and send (outline Q2).
 *
 * Id namespace: `installed-skill:<toolId>`, never `skill:<name>`. The bundled catalog already
 * has an (inert, slated for removal) `skill:ui-ux-design` entry; `installed-skill:` is a prefix
 * that cannot collide with it or with any future one, which is what keeps a single bad row from
 * taking the whole composer menu down (INV-001 — `projectComposerCapabilities` throws on any
 * duplicate item id across sources).
 */

/** The three wire fields C-002 (`server/http/admin/skills.ts`) projects — never `markdown` or
 *  `bundledFiles` (INV-002); this type only needs to describe what actually crosses the wire. */
interface InstalledSkillSummary {
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
 * Builds the `compose-text` pointer for one installed Skill.
 *
 * Names the tool id in both forms a spawned agent run may need it in — its plain id first, the
 * proxied `mcp__jini__execute_delegated_tool` form second — because a Tovu-registered tool is
 * not in the spawned agent's own tool namespace; it is reachable only through Jini's MCP bridge,
 * and a pointer naming only the plain id costs several avoidable discovery hops before the agent
 * finds that out for itself. Same two-step shape `buildPointerSection` already uses for the
 * Agent Plugin pointer arm (`src/features/agent-plugins/resolve-agent-plugin-refs.ts`), the one
 * other place this codebase composes an agent-facing pointer at a Tovu tool id. Duplicated here
 * rather than imported — that function is private to a sibling server-side module this
 * browser-side file must not reach into, the same "small private formatting helper" precedent
 * that function's own doc cites for `humanize()`.
 *
 * This is advisory, not enforced (outline R-1): the resulting text lands in the user's own
 * composer draft, which they review and send like any other message, and the agent may choose
 * not to call the tool. That is the accepted v1 tradeoff (outline D-2) against the heavier
 * `skillRefId` pin rail, deferred pending an owner decision.
 */
function buildSkillPointerText(summary: InstalledSkillSummary): string {
  return [
    `Use the "${summary.name}" skill — call:`,
    ``,
    `  ${summary.toolId}({})`,
    ``,
    `If your tools are proxied, that call is:`,
    `  mcp__jini__execute_delegated_tool({ "toolId": "${summary.toolId}", "input": {} })`,
  ].join("\n");
}

/**
 * Turns one wire summary into a discoverable, actionable composer row.
 *
 * `insertText: ""`, not omitted: an absent `insertText` on the slash-trigger path falls back to
 * `label`, typing the skill's bare name into the draft with no instruction to act on it — the
 * exact trap `composer-capabilities.ts` documents fixing on 2026-08-21. The `resolve` binding
 * below is what actually produces the draft text.
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
    resolve: () => ({ kind: "compose-text", text: buildSkillPointerText(summary) }),
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

        return body.skills.filter(isInstalledSkillSummary).map(toCapability);
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
