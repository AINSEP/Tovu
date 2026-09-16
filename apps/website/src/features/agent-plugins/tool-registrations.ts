import {
  buildDomainRegistrations,
  indexCatalogById,
  isRecord,
  optionalNumber,
  optionalString,
  requireInputRecord,
  requireString,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
  type WirableToolDefinition,
} from "@jini-ai/cms/core";
// `ToolInputError` specifically — see `agent_plugins_uninstall`'s own section below for why its two
// domain error classes (`AgentPluginNotFoundError`/`AgentPluginNotUninstallableError`) are
// re-classified into this at the tool boundary rather than left as bare `Error`s, mirroring
// `features/post/tool-registrations.ts`'s identical `toModelFacingUpdateError` precedent.
import { ToolInputError, type ToolExecutionContext } from "@jini-ai/core";
import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import {
  resolveConfirmationDecision,
  type AssistantSurfaceDeps,
  type ConfirmationOutcome,
} from "../../contracts/core/tool-surface-exchanges.js";

import { filterActiveAgentPlugins, isAgentPluginActive, readAgentPluginActivations } from "./activation.js";
import { readInstalledMcpServerIds, readInstalledSkillMarkdown } from "./capability-projection.js";
import { resolveAgentPluginLayout } from "./layout.js";
import { listInstalledPlugins } from "./resolve-agent-plugin-refs.js";
import { rankInstalledAgentPlugins, type AgentPluginSearchCandidate } from "./search.js";
import {
  AgentPluginNotFoundError,
  AgentPluginNotUninstallableError,
  previewAgentPluginUninstall,
  uninstallAgentPlugin,
  type AgentPluginUninstallPreview,
} from "./uninstall.js";
import { AGENT_PLUGINS_UNINSTALL_TOOL_ID, buildUninstallConfirmationResource } from "./uninstall-confirmation-ui.js";
import type { ToolContributor } from "#src/assistant/index";

/**
 * @file Registers every installed Agent Plugin as ONE real tool in the `ToolRegistry`.
 *
 * Until it registered alongside — not instead of — `capability-tool-registrations.ts`'s
 * `capability_search`/`capability_get` pair, one tool PAIR feeding a second, parallel discovery
 * index built from Agent Plugins' Skills. That pair was REMOVED 2026-08-26 (owner call): a second
 * index made the agent guess which surface to query, and this file's own per-plugin tool already
 * folds every one of a plugin's skills' vocabulary into one description (see "Why the description
 * must still carry every skill's vocabulary" below), so `search_tools` alone now finds what the
 * removed pair used to. See `ADS-memory/knowledge/2026-08-26-removed-capability-search.md` for the
 * full design that was removed and how to restore it if this trade is ever revisited.
 *
 * ---------------------------------------------------------------------------
 * Supersedes the 2026-08-23 one-tool-PER-SKILL pilot
 * ---------------------------------------------------------------------------
 * The prior revision of this file registered each installed plugin's Skills as separate
 * no-argument tools (`skill_ui_ux_design`, `skill_ui_ux_design_frontend_accessibility`, …).
 * Ranking that pilot against the real ~130-tool catalog (this file's own integration test) proved
 * the registration mechanism and the id/description approach both work, but also surfaced a real
 * design flaw the product owner correctly flagged: a single 7-skill plugin filled 7 of 10
 * `search_tools` result slots for an ordinary design query, crowding out genuinely relevant native
 * tools (`theme_read_file` nearly fell off the page), the plugin's own EPONYMOUS skill lost to its
 * own siblings on the very query that names it, and the approach does not scale — 20 installed
 * plugins x 7 skills apiece would mean every design-flavored query returns one plugin's internals.
 * It also contradicted the product's own composer UI, which pins an installed plugin as ONE chip
 * (`pluginRefIds: ["ui-ux-design"]`), not one chip per skill.
 *
 * This revision collapses that back to the product's own granularity: one tool per installed
 * plugin, with an optional `skill` argument to reach a specific skill's full guidance. The
 * trade-off this buys, measured rather than assumed, is documented in this pilot's own report —
 * short version: per-term BM25 scores drop because the term now sits inside one longer,
 * heterogeneous description instead of seven short focused ones, but the plugin tool still ranks
 * #1 or top-3 for every query that used to find it, and the six freed-up result slots let natives
 * like `theme_read_file` rank meaningfully better.
 *
 * ---------------------------------------------------------------------------
 * Tool id scheme: `agent_plugin_<pluginId>` (hyphens folded to underscores)
 * ---------------------------------------------------------------------------
 * An earlier revision of this file used `skill_<pluginId>` here — a category error the product
 * owner caught. An Agent Plugin is not itself a skill; it is a packaging paradigm that BUNDLES
 * skills, tools, and MCP servers (this codebase already draws that line elsewhere: Jini keeps a
 * separate `packages/agent-plugins/` from `packages/plugins/`, and Tovu's own installer already
 * tags bundled entries with the kind strings `"agent-plugin-skill"` / `"agent-plugin-mcp-server"` —
 * never bare `"skill"`). `skill_` was wrong the moment this file started minting one tool per
 * INSTALLED PLUGIN rather than per skill, and it burned a prefix real standalone skill tools will
 * need later. `agent_plugin_` names what the tool actually represents: one installed plugin, not
 * one of the skills it happens to bundle.
 *
 * This departs on purpose from the immediately-prior revision's stated goal of reusing the id the
 * even-earlier per-skill pilot's own eponymous-skill collapsing rule produced (`skill_<pluginId>`,
 * when `skillName === pluginId`) — that continuity was never actually a reason to keep `skill_`, it
 * just meant the category error shipped twice in a row before it was caught.
 *
 * `sourceForToolId()` (`tool-catalog-query.ts`) derives a tool's catalog `source` by splitting the id
 * on the FIRST underscore with no special-casing — `agent_plugin_ui_ux_design` therefore buckets as
 * source `"agent"`, not `"agent_plugin"` (the splitter only sees the text before the first `_`). That
 * bucket is cosmetic display metadata only: `source` is never part of the FTS index (see
 * `tool-catalog.ts`'s `tool_catalog_fts` schema), so it has zero effect on search ranking.
 * Deliberately NOT "fixed" by editing `sourceForToolId`/`tool-catalog-query.ts` — that splitter is
 * shared by every domain's id, and carving out a special case for this one prefix is not worth it for
 * a display-only bucket.
 *
 * FTS5's default tokenizer treats `_` as a word separator, so the new id indexes as five real,
 * independently matchable words — `agent`, `plugin`, `ui`, `ux`, `design` — rather than a
 * run-together `skillUiUxDesign`-style token. Because `tool-catalog.ts` weights `id` 6x `description`
 * in `bm25()`, those extra tokens are not free: adding "agent" and "plugin" to a 6x field is a real
 * ranking input (it can help a query that mentions "plugin", and can shift other queries slightly via
 * BM25's length normalization), not a cosmetic rename. See this change's own report for the actual
 * before/after rank+score numbers this was re-measured against.
 *
 * The install DIGEST is deliberately NOT part of the id, for the same reason the prior pilot gave:
 * a tool id is typed back into a model's `execute_delegated_tool` call after a `search_tools` hit,
 * and `tool-catalog.ts` (the FTS5 seed) weights `id` 6x `description` in `bm25()` — a 64-hex-char
 * digest folded into every id would only dilute that per-term signal for zero search benefit. That
 * tradeoff makes an ambiguous pluginId — two installed digests of the SAME plugin — a case this
 * loader REFUSES rather than silently picking one: {@link loadInstalledAgentPluginToolSources}
 * logs it loudly and excludes just that one plugin from the returned tool sources, the
 * same "loud, explicit ambiguity error" precedent `resolve-agent-plugin-refs.ts`'s own module doc
 * already establishes for a pinned ref that resolves to more than one digest — except scoped to the
 * one ambiguous plugin rather than aborting every other installed plugin's tool along with it.
 * Adapted here from per-(plugin,skill)-pair to per-plugin, since a plugin id is now the entire
 * granularity of a tool.
 *
 * ---------------------------------------------------------------------------
 * The optional `skill` argument, and why the default is NOT "dump everything"
 * ---------------------------------------------------------------------------
 * Collapsing to one tool per plugin still needs a way to reach a specific skill's full guidance —
 * that capability must not be lost, only re-shaped. `inputSchema` therefore carries one optional
 * string property, `skill`, whose `enum` names every skill this specific installed plugin actually
 * has (documentation for the model, not an enforced constraint — `@jini-ai/core`'s `ToolRegistry`
 * explicitly never parses or validates `inputSchema`; see that package's own header on the point).
 *
 * The DEFAULT (argument omitted) never returns every skill concatenated — measured on the real
 * `ui-ux-design` install: 32,686 bytes across its 7 SKILL.md files, ~8k tokens, far too much to
 * hand back for a bare no-argument call a model might make just to see what a plugin offers. The
 * default instead returns the plugin's own EPONYMOUS skill (`skills/<pluginId>/SKILL.md` — the
 * same file `resolve-agent-plugin-refs.ts`'s `inject`/`pointer` delivery already treats as "this
 * plugin's own instructions", not a summary of them) plus a short `availableSkills` list of the
 * other skill names, so the model can ask for one of those by name on a follow-up call. A plugin
 * with no eponymous skill folder falls back to its alphabetically-first skill instead — see
 * {@link loadInstalledAgentPluginToolSources} — and both the tool's own description and every
 * default-path response name which skill was chosen and why, so that choice is never a silent
 * guess a caller has to reverse-engineer.
 *
 * An unrecognized `skill` value never throws: it falls back to that same default response, with a
 * `note` field naming the value that was not recognized and listing every valid one. A model that
 * mistypes a skill name gets a usable answer, not a failed turn.
 *
 * ---------------------------------------------------------------------------
 * Why the description must still carry every skill's vocabulary
 * ---------------------------------------------------------------------------
 * BM25 only ranks words present in the indexed text (`id` + `description` — see
 * `tool-catalog-query.ts` / `tool-catalog.ts`), and this tool is now the ONLY indexed surface for
 * all of a plugin's skills at once — a query for "shadcn component library" or "WCAG accessibility"
 * must still be able to find this one tool even though neither term appears in the plugin's own
 * top-level name. {@link buildPluginToolDescription} therefore folds every skill's own summary (its
 * frontmatter `description:`, or its opening prose when there is none — the exact per-skill parsing
 * {@link extractFrontmatterDescription} / {@link extractFallbackSummary} already did for the prior
 * pilot, reused here rather than re-implemented) into one combined, readable description naming
 * every skill and what it is for.
 *
 * ---------------------------------------------------------------------------
 * SECURITY — no absolute host path ever reaches a tool id, description, schema, or handler output
 * ---------------------------------------------------------------------------
 * The now-removed `capability-source-registry.ts`'s own header used to be explicit that a
 * `CapabilityCard.handle` "must never be serialized into a `capability_search`/`capability_get`
 * response" because it carries `packageRoot`/`skillPath` — absolute host paths. This module never
 * constructs anything shaped like a `handle` at all: {@link loadInstalledAgentPluginToolSources}
 * uses `plugin.packageRoot`/`skill.skillPath` ONLY as local arguments to the one
 * `readInstalledSkillMarkdown` call that reads each skill file, and neither value is stored on the
 * returned {@link AgentPluginToolSource} or threaded anywhere else. The id is built from `pluginId`
 * (a plugin-declared identifier, not a filesystem path); the description and the `skill` schema's
 * `enum`/description are built from skill names and their own frontmatter/prose; the handler
 * returns `{ pluginId, skillName, guidance, availableSkills, note? }`, where `guidance` is a skill's
 * own markdown BODY, never a path naming where it was read from. Verified empirically, not just by
 * construction: this file's own test suite installs a real plugin into a temp directory (an
 * absolute, unpredictable path by construction) and asserts that path's string never appears in any
 * registered id, description, schema, or handler output.
 *
 * ---------------------------------------------------------------------------
 * Why this is NOT a `ToolContributor` (`tool-contribution-registry.ts`)
 * ---------------------------------------------------------------------------
 * Every other domain's contribution is synchronous — `ToolContributor.build: (routeDeps, surfaces)
 * => ToolRegistration[]` — because its tool ids are known statically at module load. This domain's
 * are not: which plugins/skills exist can only be learned by awaiting `listInstalledPlugins`. This
 * file exposes its own async entry point, {@link registerInstalledAgentPluginTools}, which does
 * exactly what
 * `agent-daemon-server.ts`'s existing `for (const registration of build...())
 * registry.register(registration)` loops already do for `buildAssistantToolRegistrations`'s own
 * output — the same registration mechanism, called once more, after an await. It is not wired into
 * that file by this change (a synchronous top-level composition root, already under heavy
 * concurrent edit) — live-boot wiring stays a separate, later decision.
 */

/** Title-cases a kebab-case name into human words. Duplicated from `capability-projection.ts`'s own
 *  (unexported) `humanize`: a private formatting helper of a sibling module, not a shared utility
 *  either has promised to keep in sync. (A third copy lived in `capability-source.ts` until it was
 *  removed 2026-08-26 — see `ADS-memory/knowledge/2026-08-26-removed-capability-search.md`.) */
function humanize(value: string): string {
  return value
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** `agent_plugin_<pluginId>` — see this file's header, "Tool id scheme", for why `agent_plugin_` (an
 *  installed Agent Plugin, the packaging paradigm) is the correct prefix and not `skill_` (one thing
 *  a plugin bundles, not what this tool id names). */
function toAgentPluginToolId(pluginId: string): string {
  return `agent_plugin_${pluginId.replace(/-/g, "_")}`;
}

/**
 * Extracts a SKILL.md's own YAML frontmatter `description:` field, when present.
 *
 * Deliberately a narrow regex over the delimited block rather than a full YAML parse: every real
 * SKILL.md sampled while building this feature (all 7 of the reference `ui-ux-design` plugin's own
 * skills) uses a single-line `description: ...` value, and a regex over already-known-installed,
 * validated content cannot throw the way a real parser could on an unexpected nested shape (e.g. one
 * skill in that same sample set declares a multi-line `allowed-tools:` list alongside its
 * single-line `description:` — a regex simply ignores it; a naive full-document YAML parse would not).
 */
function extractFrontmatterDescription(markdown: string): string | undefined {
  if (!markdown.startsWith("---")) return undefined;
  const end = markdown.indexOf("\n---", 3);
  if (end === -1) return undefined;
  const frontmatter = markdown.slice(3, end);
  const match = frontmatter.match(/^description:\s*(.+)$/m);
  const raw = match?.[1];
  if (!raw) return undefined;
  return raw.trim().replace(/^["']|["']$/g, "");
}

/** Falls back to the first real prose line when a skill has no (or no parseable) frontmatter — the
 *  reference plugin's own `web-compliance` skill is exactly this case: no frontmatter block at all,
 *  just an H1 followed by real prose. Skips every heading and blank line. */
function extractFallbackSummary(markdown: string): string | undefined {
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (line.length > 0 && !line.startsWith("#")) return line;
  }
  return undefined;
}

/** One skill's summary, for folding into its plugin's combined description — reuses the same
 *  frontmatter/fallback parsing the prior per-skill pilot used, just no longer wrapped into a
 *  standalone tool description of its own. */
function summarizeSkillMarkdown(skillName: string, markdown: string): string {
  return (
    extractFrontmatterDescription(markdown) ?? extractFallbackSummary(markdown) ?? `${humanize(skillName)} guidance and reference material.`
  );
}

/**
 * Builds this plugin tool's model-facing description — an operator SEARCH TARGET, not a card blurb.
 * Folds every skill's own summary in so the words an operator would plausibly type ("accessibility",
 * "shadcn component library", "review my UI for compliance") appear directly in indexed text, per
 * this file's header. Names the default skill (and, when there is no eponymous skill, why the
 * fallback was chosen) so a caller reading only the description already knows what a bare call
 * returns.
 *
 * Leads with an imperative "use this before..." clause rather than a bare noun phrase — a live test
 * found the model choosing a native verb-style tool (e.g. `theme_list`) over this plugin even when
 * this plugin's own tool ranked #1 in search for the same query, on prompts where both plausibly fit
 * ("make it look polished and professional"). The imperative opening is a controlled experiment
 * against that selection bias, not a search-ranking change — the skill-vocabulary tail below is
 * unchanged and still does the BM25 work.
 */
function buildPluginToolDescription(
  pluginId: string,
  skills: readonly AgentPluginSkillDetail[],
  defaultSkillName: string,
  defaultSkillReason: string | undefined,
): string {
  const humanPlugin = humanize(pluginId);
  const defaultNote = defaultSkillReason
    ? `Called with no argument, returns the '${defaultSkillName}' skill (${defaultSkillReason}).`
    : `Called with no argument, returns this plugin's own eponymous '${defaultSkillName}' skill.`;
  const details = skills.map((skill) => `${humanize(skill.name)} (${skill.name}) — ${skill.summary}`).join(" | ");
  return (
    `Use this before making any design/implementation decision in its domain — ` +
    `${humanPlugin} guidance from the installed '${pluginId}' Agent Plugin, covering ${skills.length} ` +
    `skill${skills.length === 1 ? "" : "s"}: ${details} ${defaultNote} Pass the optional 'skill' argument ` +
    `to request a different one by name.`
  );
}

/** One installed plugin's one skill, fully resolved for tool registration — no host paths, nothing
 *  left for the handler to read from disk at call time. See this file's header, SECURITY. */
export interface AgentPluginSkillDetail {
  readonly name: string;
  readonly summary: string;
  readonly markdown: string;
}

/** One installed Agent Plugin, fully resolved into a single tool-ready source. See this file's
 *  header, SECURITY. */
export interface AgentPluginToolSource {
  readonly id: string;
  readonly pluginId: string;
  readonly description: string;
  readonly skills: readonly AgentPluginSkillDetail[];
  /** The skill name a no-argument (or unrecognized-argument) call returns — the plugin's own
   *  eponymous skill when one exists, otherwise a documented fallback (see this file's header). */
  readonly defaultSkillName: string;
  /** Set only when {@link defaultSkillName} is NOT the plugin's eponymous skill — the human-readable
   *  reason folded into both the description and every default-path handler response. */
  readonly defaultSkillReason?: string;
}

/** One installed plugin's manifest identity, as `listInstalledPlugins` returns it — the narrow
 *  slice {@link assertSingleDigestPerPlugin} needs, named separately so that guard doesn't have to
 *  import the whole `InstalledAgentPlugin` shape. */
interface InstalledPluginIdentity {
  readonly pluginId: string;
  readonly archiveDigest: string;
}

/**
 * Refuses loudly when the SAME plugin id is installed under two different archive digests —
 * mutates `digestByPluginId` as its record of "digest seen so far per plugin id". Split out of
 * {@link loadInstalledAgentPluginToolSources}'s loop so that loop is left with only the two things
 * it must do per plugin: check-and-record identity, then (if unique) resolve its tool source.
 *
 * @throws {Error} Caught per-plugin by {@link loadInstalledAgentPluginToolSources}'s own loop,
 * which logs it and skips only this one plugin — the throw itself stays the loud, correct signal
 * for this specific plugin's ambiguity; only where it is caught changed.
 */
function assertSingleDigestPerPlugin(digestByPluginId: Map<string, string>, plugin: InstalledPluginIdentity): void {
  const priorDigest = digestByPluginId.get(plugin.pluginId);
  if (priorDigest !== undefined && priorDigest !== plugin.archiveDigest) {
    throw new Error(
      `agent-plugin tools: '${plugin.pluginId}' is installed under more than one digest ` +
        `(${priorDigest} and ${plugin.archiveDigest}) — this module wires one tool id per installed plugin id ` +
        `with no digest in the id, so an operator must remove the stale install before this plugin can be wired as a tool`,
    );
  }
  digestByPluginId.set(plugin.pluginId, plugin.archiveDigest);
}

/** Reads and summarizes every one of one installed plugin's skills — the only `await`-per-item
 *  work in the whole load, isolated so the caller's loop has no nested `for` of its own. */
async function resolveSkillsForPlugin(plugin: {
  readonly packageRoot: string;
  readonly skills: readonly { readonly name: string; readonly skillPath: string }[];
}): Promise<AgentPluginSkillDetail[]> {
  const skills: AgentPluginSkillDetail[] = [];
  for (const skill of plugin.skills) {
    const markdown = await readInstalledSkillMarkdown(plugin.packageRoot, skill.skillPath);
    skills.push({ name: skill.name, summary: summarizeSkillMarkdown(skill.name, markdown), markdown });
  }
  return skills;
}

/** Which skill a no-argument (or unrecognized-argument) call to this plugin's tool returns —
 *  the plugin's own eponymous skill when one exists, otherwise its alphabetically-first skill (see
 *  this file's header, "The optional `skill` argument"). A pure defaulting decision, isolated from
 *  the source-object construction that consumes it.
 *
 *  @param skills Never empty — every caller only reaches this after the plugin's own
 *  `skills.length === 0` short-circuit. */
function resolveDefaultSkill(
  skills: readonly AgentPluginSkillDetail[],
  pluginId: string,
): { readonly defaultSkillName: string; readonly defaultSkillReason?: string } {
  const eponymous = skills.find((skill) => skill.name === pluginId);
  if (eponymous) return { defaultSkillName: eponymous.name };

  // Guarded by every caller (`skills.length === 0` short-circuits first), so `skills[0]` is
  // always defined here.
  const fallbackSkill = skills[0] as AgentPluginSkillDetail;
  return {
    defaultSkillName: fallbackSkill.name,
    defaultSkillReason:
      `no eponymous skill folder ('skills/${pluginId}/SKILL.md') exists in this installed package — ` +
      `defaulting to its alphabetically-first skill`,
  };
}

/** Assembles one installed plugin's fully-resolved {@link AgentPluginToolSource} from its already
 *  fetched skills — pure construction, no I/O, so it's the composition {@link
 *  loadInstalledAgentPluginToolSources}'s loop reduces to a call. */
function buildToolSource(pluginId: string, skills: readonly AgentPluginSkillDetail[]): AgentPluginToolSource {
  const { defaultSkillName, defaultSkillReason } = resolveDefaultSkill(skills, pluginId);
  return {
    id: toAgentPluginToolId(pluginId),
    pluginId,
    description: buildPluginToolDescription(pluginId, skills, defaultSkillName, defaultSkillReason),
    skills,
    defaultSkillName,
    ...(defaultSkillReason !== undefined ? { defaultSkillReason } : {}),
  };
}

/**
 * Loads every installed Agent Plugin for one workspace, resolved into one tool-ready source per
 * plugin. Per-plugin failures are isolated: a pluginId installed under more than one digest (a
 * genuine, actionable ambiguity — see this file's header for why the digest itself is not folded
 * into the id) — or any other per-plugin resolution failure, e.g. an unreadable SKILL.md — is
 * logged via `console.warn` and excluded from the returned array, but never aborts the whole load.
 * One bad plugin install must not take every other installed plugin's tool down with it.
 *
 * @complexity O(d * s) in installed-digest count times average skills-per-digest, dominated by
 * `listInstalledPlugins`'s own walk plus one `readInstalledSkillMarkdown` per skill.
 */
export async function loadInstalledAgentPluginToolSources(ctx: {
  readonly workspaceId: string;
}): Promise<readonly AgentPluginToolSource[]> {
  const workspaceLayout = resolveAgentPluginLayout().forWorkspace(ctx.workspaceId);
  const installed = await listInstalledPlugins(workspaceLayout.packages);

  // ACTIVATION GATE (2026-08-26) — the second of three surfaces (see `activation.ts`). Filtered
  // BEFORE the ambiguity check below on purpose: two installed digests of a plugin nobody has
  // enabled is not an operator-actionable error, and throwing on it would let a dormant, disabled
  // package break tool registration for every OTHER plugin in the workspace.
  const activations = await readAgentPluginActivations(workspaceLayout.root);
  const active = filterActiveAgentPlugins(activations, installed, (plugin) => plugin.pluginId);

  const digestByPluginId = new Map<string, string>();
  // Keyed by pluginId (not a plain array) so a LATER conflicting digest can retract an EARLIER
  // digest's already-resolved source for the same plugin — `assertSingleDigestPerPlugin` only
  // throws on the second digest it sees for a given id, so a plain per-iteration push would let
  // ambiguity silently keep whichever digest happened to resolve first, which is exactly the
  // "silently picking one" outcome this file's header says the ambiguity guard must refuse.
  const sourceByPluginId = new Map<string, AgentPluginToolSource>();
  const poisonedPluginIds = new Set<string>();

  for (const plugin of active) {
    if (poisonedPluginIds.has(plugin.pluginId)) continue; // already ruled ambiguous; stays excluded

    try {
      assertSingleDigestPerPlugin(digestByPluginId, plugin);
      if (plugin.skills.length === 0) continue; // nothing this plugin's tool could ever return

      const skills = await resolveSkillsForPlugin(plugin);
      sourceByPluginId.set(plugin.pluginId, buildToolSource(plugin.pluginId, skills));
    } catch (error) {
      // Isolated per plugin so one bad install (digest ambiguity, an unreadable SKILL.md, ...)
      // cannot take every OTHER installed plugin's tool down with it — see this file's header,
      // "The install DIGEST is deliberately NOT part of the id", for why the digest-ambiguity case
      // itself is still a genuine, actionable refusal, just scoped to this one plugin now.
      sourceByPluginId.delete(plugin.pluginId);
      poisonedPluginIds.add(plugin.pluginId);
      console.warn(`[agent-plugins] '${plugin.pluginId}': ${error instanceof Error ? error.message : String(error)} — skipped`);
    }
  }
  return [...sourceByPluginId.values()];
}

/** This module's own risk classification: every plugin tool is a pure read of already-installed,
 *  already-validated local content — no domain call, no write path. */
export function agentPluginToolDerivedRisk(sources: readonly AgentPluginToolSource[]): DerivedRiskByToolId {
  return new Map<string, AgentToolSideEffect>(sources.map((source) => [source.id, "none"]));
}

/** `inputSchema` for one plugin's tool: a single optional `skill` string, its `enum` documenting
 *  every valid value for THIS installed plugin. Documentation only — `@jini-ai/core`'s
 *  `ToolRegistry` never parses or validates `inputSchema`, so an unrecognized value can never be
 *  rejected before it reaches {@link readSkillArgument} / {@link buildPluginToolResult}, which
 *  handle it gracefully rather than relying on schema enforcement that does not exist. */
function buildPluginInputSchema(source: AgentPluginToolSource): Record<string, unknown> {
  const skillNames = source.skills.map((skill) => skill.name);
  return {
    type: "object",
    additionalProperties: false,
    required: [],
    properties: {
      skill: {
        type: "string",
        enum: skillNames,
        description:
          `Optional. Request one specific skill's full guidance instead of the default overview. One of: ` +
          `${skillNames.join(", ")}. Defaults to '${source.defaultSkillName}' when omitted; an unrecognized ` +
          `value falls back to that same default and reports the valid values instead of failing.`,
      },
    },
  };
}

/** Reads the optional `skill` argument off `ctx.input`, refusing any OTHER field (mirrors
 *  `requireNoInput`'s "reject a populated-but-wrong shape" discipline for the one field this tool
 *  does accept) but never rejecting a `skill` value merely because it does not name a real skill —
 *  see this file's header on why an unrecognized value is a graceful fallback, not a thrown error. */
function readSkillArgument(rawInput: unknown): string | undefined {
  if (rawInput === undefined) return undefined;
  if (!isRecord(rawInput)) throw new Error("input must be an object");
  const unexpectedKeys = Object.keys(rawInput).filter((key) => key !== "skill");
  if (unexpectedKeys.length > 0) {
    throw new Error(`this tool accepts only an optional 'skill' argument — unexpected field(s): ${unexpectedKeys.join(", ")}`);
  }
  return optionalString(rawInput, "skill");
}

/**
 * Resolves one plugin tool's response for a given (possibly absent, possibly unrecognized)
 * requested skill name. Pure and synchronous so the unit tests exercise it directly.
 *
 * - A recognized `requestedSkill` returns exactly that skill.
 * - `undefined` (argument omitted) returns {@link AgentPluginToolSource.defaultSkillName}.
 * - An unrecognized, non-empty `requestedSkill` ALSO returns the default skill, plus a `note`
 *   naming the value that was not recognized and listing every valid one — never a thrown error.
 *
 * Every response additionally carries `availableSkills`: every other skill name this plugin has, so
 * a model that got the default (or a specific skill) still knows what else it can ask for next.
 */
function buildPluginToolResult(source: AgentPluginToolSource, requestedSkill: string | undefined): Record<string, unknown> {
  const allSkillNames = source.skills.map((skill) => skill.name);

  if (requestedSkill !== undefined) {
    const match = source.skills.find((skill) => skill.name === requestedSkill);
    if (match) {
      return {
        pluginId: source.pluginId,
        skillName: match.name,
        guidance: match.markdown,
        availableSkills: allSkillNames.filter((name) => name !== match.name),
      };
    }
  }

  const fallback = source.skills.find((skill) => skill.name === source.defaultSkillName);
  if (!fallback) {
    // Cannot happen in practice: `defaultSkillName` is always chosen FROM `source.skills` in
    // `loadInstalledAgentPluginToolSources`. Guarded rather than asserted with `!` so a future bug
    // here fails loudly with an actionable message instead of a null-dereference.
    throw new Error(`agent-plugin tool '${source.id}': default skill '${source.defaultSkillName}' missing from its own skill list`);
  }

  return {
    pluginId: source.pluginId,
    skillName: fallback.name,
    guidance: fallback.markdown,
    availableSkills: allSkillNames.filter((name) => name !== fallback.name),
    ...(requestedSkill !== undefined
      ? {
          note:
            `Unrecognized skill '${requestedSkill}' for the '${source.pluginId}' plugin — showing the default ` +
            `skill '${fallback.name}' instead. Valid values: ${allSkillNames.join(", ")}.`,
        }
      : {}),
  };
}

/**
 * ===========================================================================================
 * REVOCATION — the activation gate has to run AGAIN, per call, or a disable never lands
 * ===========================================================================================
 *
 * {@link loadInstalledAgentPluginToolSources}'s own ACTIVATION GATE runs exactly once, because
 * `registerInstalledAgentPluginTools` runs exactly once: inside `agent-daemon-server.ts`'s
 * `start()`. `@jini-ai/core`'s `ToolRegistry` is append-only BY DESIGN — its own header calls that
 * out ("unregister is not exposed; ... tools are registered once at composition time") — so nothing
 * anywhere can take a registration back out of a daemon that is already running.
 *
 * That left a privilege-retention hole (sol finding 5-1, 2026-09-16): an operator who switched a
 * plugin OFF, from either inbound adapter, kept a live `agent_plugin_<id>` tool serving that
 * plugin's guidance until Tovu was restarted — while both the admin screen and the tool's own
 * success message told them the revocation had taken effect. The activations record really IS
 * re-read per run by the OTHER two gate surfaces (run-start ref injection, discovery); the tool
 * surface was the one that had snapshotted it.
 *
 * The gate therefore moves to where the capability is actually spent — the invocation itself. This
 * is not "a filter bolted onto the read path": `@jini-ai/core`'s `authorizeToolInvocation` consults
 * a registration's `ToolPolicy` BEFORE it will hand the handler back to `ToolExecutor`, and the
 * handler is unreachable by any other route, so a policy check here is the single sink for running
 * one of these tools, not one of several. A revoked plugin's call ends as `denied` without the
 * handler ever being entered, and the daemon's own audit record says so.
 *
 * Consequences worth stating rather than discovering later:
 * - Revocation is immediate and reversible in BOTH directions for a tool that was registered at
 *   boot. It is NOT symmetric for one that was not: enabling a plugin that was disabled when the
 *   daemon started still needs a restart, because there is no registration to re-admit. That is the
 *   asymmetry `plugin-runtime/tool-registrations.ts`'s `restartNoteFor` reports to the model.
 * - The tool stays VISIBLE. `registry.list()` and `search_tools`' one-shot FTS snapshot
 *   (`agent-daemon-server.ts`) are both append-only too, so a revoked plugin's tool can still be
 *   found and attempted; it just cannot run. Hiding it needs a registry mutation API that does not
 *   exist, and a visible-but-refusing tool is the safe direction of that pair.
 * - It inherits `readAgentPluginActivations`'s fail-OPEN reading of a missing/corrupt record
 *   (absent means active — see `activation.ts`'s header for why), exactly like the other two gate
 *   surfaces. Diverging here would make one surface disagree with the other two about what "active"
 *   means, which is a worse failure than the one it would fix.
 */
export interface AgentPluginActivationGate {
  /** Re-reads this workspace's activation record and answers whether `pluginId` may still run. */
  isActive(pluginId: string): Promise<boolean>;
}

/**
 * The production gate: one small `activations.json` read per tool call, against the same
 * `forWorkspace()` root every other path in this feature goes through.
 *
 * Deliberately NOT cached. The record changes when a human toggles a plugin, and the whole point of
 * this gate is that such a toggle is observed by the very next call; a cache would reintroduce the
 * staleness window the gate exists to close, to save a sub-millisecond read on a human-paced call.
 *
 * @param ctx.workspaceId - The tenant whose record is consulted. Never an instance-level path.
 * @returns A gate whose `isActive` is fresh per call.
 * @complexity O(p) per call in the recorded plugin count, plus one small file read.
 */
export function createAgentPluginActivationGate(ctx: { readonly workspaceId: string }): AgentPluginActivationGate {
  const workspaceRoot = resolveAgentPluginLayout().forWorkspace(ctx.workspaceId).root;
  return {
    async isActive(pluginId: string): Promise<boolean> {
      return isAgentPluginActive(await readAgentPluginActivations(workspaceRoot), pluginId);
    },
  };
}

/**
 * Wraps one registration's policy so the plugin's CURRENT activation is checked before its handler
 * can be reached, then defers to the policy `buildDomainRegistrations` already attached.
 *
 * Deferring rather than replacing matters: the kit's policy is a deliberate pass-through today
 * (each tool's permission is evaluated at its own chokepoint), and a future kit that puts something
 * real there must not be silently dropped by this wrapper.
 *
 * @complexity O(1) plus the gate's own read.
 */
function withActivationGate(
  registration: ToolRegistration,
  gate: AgentPluginActivationGate,
  pluginId: string,
): ToolRegistration {
  const inner = registration.policy;
  return {
    ...registration,
    policy: {
      async authorize(authCtx) {
        if (!(await gate.isActive(pluginId))) return "deny";
        return inner.authorize(authCtx);
      },
    },
  };
}

/**
 * Turns already-resolved plugin sources into real `ToolRegistration`s — pure and synchronous, unlike
 * {@link loadInstalledAgentPluginToolSources}, so this is the half a unit test exercises without
 * touching disk. Uses the SAME `buildDomainRegistrations` gate every other domain's
 * `tool-registrations.ts` uses (catalog/risk cross-check, `inputSchema` presence, drift tripwire) —
 * not a parallel mechanism.
 *
 * `activation` is required, not optional, and is applied HERE rather than by the caller for the
 * reason this file's REVOCATION note above gives: a gate a call site has to remember to attach is a
 * gate some future call site will register tools without. Every registration this function can
 * produce carries it. The build itself stays synchronous and touches no disk — the gate reads only
 * when a call is actually authorized.
 *
 * @param sources - Already-resolved, already-activation-filtered plugin sources.
 * @param activation - The per-call revocation gate (see {@link createAgentPluginActivationGate}).
 * @complexity O(n) in source count; each source's gate read is deferred to invocation.
 */
export function buildAgentPluginToolRegistrations(
  sources: readonly AgentPluginToolSource[],
  activation: AgentPluginActivationGate,
): ToolRegistration[] {
  const catalog: WirableToolDefinition[] = sources.map((source) => ({
    name: source.id,
    description: source.description,
    sideEffects: "none",
    authorization: { permission: "admin.assistant.use" },
    inputSchema: buildPluginInputSchema(source),
  }));

  const handlers: Record<string, ToolHandler> = {};
  const pluginIdByToolId = new Map<string, string>();
  for (const source of sources) {
    handlers[source.id] = async (ctx) => buildPluginToolResult(source, readSkillArgument(ctx.input));
    pluginIdByToolId.set(source.id, source.pluginId);
  }

  const registrations = buildDomainRegistrations({
    domain: "agent-plugin-skill",
    catalogModule: "features/agent-plugins/tool-registrations.ts",
    catalog: indexCatalogById(catalog),
    handlers,
    derivedRisk: agentPluginToolDerivedRisk(sources),
  });

  return registrations.map((registration) => {
    const pluginId = pluginIdByToolId.get(registration.descriptor.id);
    // Unreachable via this function — every registration comes from `handlers`, whose keys are the
    // same `source.id`s the map was built from. Guarded rather than asserted with `!` so a future
    // kit that synthesized an extra registration would be REFUSED rather than silently ungated.
    if (pluginId === undefined) {
      throw new Error(
        `tool-registrations: '${registration.descriptor.id}' has no owning Agent Plugin, so its activation could not be gated`,
      );
    }
    return withActivationGate(registration, activation, pluginId);
  });
}

/**
 * Composition-root entry point: loads every installed plugin for one workspace and registers each
 * as a real tool directly on `registry` — the same `registry.register(registration)` call
 * `agent-daemon-server.ts`'s own top-level loops make for `buildAssistantToolRegistrations`'s output,
 * just awaited first. See this file's header for why this is a standalone async function rather than
 * a `ToolContributor`, and why it is not (yet) called from that live boot sequence.
 *
 * Registers with the REAL activation gate, so every tool this puts into the daemon's registry stops
 * answering the moment its plugin is switched off — see the REVOCATION note above
 * {@link createAgentPluginActivationGate}.
 */
export async function registerInstalledAgentPluginTools(
  registry: { register: (registration: ToolRegistration) => void },
  ctx: { readonly workspaceId: string },
): Promise<void> {
  const sources = await loadInstalledAgentPluginToolSources(ctx);
  for (const registration of buildAgentPluginToolRegistrations(sources, createAgentPluginActivationGate(ctx))) {
    registry.register(registration);
  }
}

/**
 * ===========================================================================================
 * `search_agent_plugin_local` — a SEPARATE, STATIC tool, not another per-plugin dynamic one
 * ===========================================================================================
 *
 * Everything above this point (`agent_plugin_<pluginId>`, `registerInstalledAgentPluginTools`) is a
 * dynamic tool PER installed, ACTIVE plugin — its id, schema, and description cannot exist until an
 * async disk read has resolved which plugins are installed, which is why that half of this file is
 * wired directly onto the `ToolRegistry` from `agent-daemon-server.ts`'s boot sequence rather than
 * through the ordinary static `ToolContributor` seam (see this file's header, "Why this is NOT a
 * ToolContributor").
 *
 * `search_agent_plugin_local` is different in kind: ONE tool, whose id/schema/description are known
 * at module load with no disk access at all — the disk read happens inside the HANDLER, at call time,
 * the same way `plugins_list`'s handler reads `discoverPlugins()` fresh on every call. That is exactly
 * the shape every OTHER domain's `contribute<Domain>Tools()` already has, so this tool is wired through
 * the ordinary static seam (`tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`) rather
 * than joining the dynamic half above — it is part of the ~171-tool native catalog `search_tools`
 * indexes at boot, not something that only exists after a workspace-scoped async load has run.
 *
 * ---------------------------------------------------------------------------
 * The gap this closes
 * ---------------------------------------------------------------------------
 * The assistant can enable/disable a discovered `.tovu-plugin`-family plugin (`plugins_set_enabled`,
 * `features/plugin-runtime/tool-registrations.ts` — a DIFFERENT plugin system, see that file's own
 * 2026-08-23 header note) and can USE an already-active Agent Plugin's skills
 * (`agent_plugin_<pluginId>`, above) — but before this addition there was no way to FIND one. An
 * operator asking "is there a plugin for X" had no tool that could answer; the only paths in were
 * either already knowing the exact `agent_plugin_<pluginId>` id, or `search_tools` happening to
 * surface one of those dynamic per-plugin tools directly (which only works for plugins that are both
 * installed AND already enabled — `loadInstalledAgentPluginToolSources` filters to
 * `filterActiveAgentPlugins` before registering a single dynamic tool). A disabled-but-installed
 * plugin was invisible to every surface.
 *
 * ---------------------------------------------------------------------------
 * Local only — no marketplace/web search (by design, not by omission)
 * ---------------------------------------------------------------------------
 * This searches `listInstalledPlugins()` — packages already extracted under this workspace's own
 * `packages/sha256/*` (`layout.ts`). It does not reach a marketplace, a registry, or the web. That is
 * a deliberate scope line, not a missing follow-up bolted on later: the response shape below (a flat
 * `matches[]` of already-installed plugins) says nothing about install source, so a future marketplace
 * search can be added as a SECOND tool (or a second mode) without this one's contract having to grow a
 * "local vs remote" distinction it does not need today.
 *
 * ---------------------------------------------------------------------------
 * Ranking signal: why keywords, id, description, AND skills — not keywords alone
 * ---------------------------------------------------------------------------
 * `plugin.json`'s `keywords` array is the obvious signal — author-curated, exactly analogous to
 * `tool-search-keywords.ts`'s whole reason for existing (operators ask in words the artifact's own
 * prose does not contain). But keywords alone would under-serve this catalog for a concrete, measured
 * reason: the real bundled `ui-ux-design` package ships NO `keywords` field at all (verified —
 * `sites/tovu-com/agent-plugins/ws/workspace-local/packages/sha256/.../plugin.json` has only `name`
 * and `description`), so a keywords-only ranker would make that entire installed plugin unfindable by
 * search. `id` and `description` both matter for the same reason `search_components`'s own catalog
 * ranks on id+description+capabilities together rather than one field alone. See `search.ts`'s own
 * header for the full per-field weighting rationale and why skills are folded in too, at the lowest
 * weight.
 *
 * ---------------------------------------------------------------------------
 * SECURITY — same no-host-path discipline as the dynamic tools above
 * ---------------------------------------------------------------------------
 * `loadAgentPluginSearchCandidates` below reads `plugin.packageRoot` only to pass it to
 * `resolveSkillsForPlugin`/`readInstalledMcpServerIds` — neither value, nor any other absolute path,
 * is stored on `AgentPluginSearchCandidate` or reaches the handler's response. MCP servers are
 * reported as ids only (`readInstalledMcpServerIds`'s own doc: never transport config, which MAY
 * carry secrets).
 */

const SEARCH_AGENT_PLUGIN_LOCAL_TOOL_ID = "search_agent_plugin_local";

/** Mirrors `component-catalog-tool.ts`'s identical `SEARCH_LIMIT_MAX`/`SEARCH_LIMIT_DEFAULT` — same
 *  reasoning: the values are the contract this schema states to the model, so restating them (rather
 *  than importing a value from an unrelated domain) keeps the enforced bound and the documented one
 *  from silently drifting apart. */
const SEARCH_LIMIT_MAX = 25;
const SEARCH_LIMIT_DEFAULT = 10;

/** The narrow slice of the route-deps bag this tool's handler reads — only a workspace id, since
 *  everything else it needs (`listInstalledPlugins`, `readAgentPluginActivations`) is resolved from
 *  that id alone via `layout.ts`. Declared structurally, mirroring `PluginsToolDeps`'s own shape, so
 *  `assistant/tool-registrations.ts` can fold this into `AssistantToolRegistryDeps` without this
 *  domain importing that file's god type back. */
export interface AgentPluginSearchToolDeps {
  readonly workspaceId: string;
}

const SEARCH_AGENT_PLUGIN_LOCAL_DESCRIPTION =
  "Searches the Agent Plugins installed in THIS workspace — agent-plugins.org packages (plugin.json plus " +
  "skills and an optional mcp.json) under this site's own agent-plugins directory. This is a DIFFERENT " +
  "system from plugins_list, which lists the separate .tovu-plugin site/runtime plugin family — use this " +
  "one to find an Agent Plugin, not a site plugin. Returns ranked matches: id, version, description, " +
  "keywords, whether it is currently enabled for this workspace (plugins_set_enabled with family " +
  "'agent-plugin' changes that), and what it " +
  "contributes (its skills, and any MCP server ids it declares — ids only, never connection details). " +
  "Local installed packages only — never a marketplace or the web. Once you have the right id, call its " +
  "own agent_plugin_<id> tool (e.g. agent_plugin_site_compliance) for that plugin's full guidance.";

const SEARCH_AGENT_PLUGIN_LOCAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["query"],
  properties: {
    query: {
      type: "string",
      minLength: 1,
      description:
        "What you're looking for, in plain language — e.g. 'a plugin for deploying to fly.io', " +
        "'accessibility guidance', 'gdpr compliance checks'. Matched against each installed Agent " +
        "Plugin's id, author-declared keywords, description, and bundled skills. Required.",
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: SEARCH_LIMIT_MAX,
      description: `Max results to return (1-${SEARCH_LIMIT_MAX}). Optional, defaults to ${SEARCH_LIMIT_DEFAULT}.`,
    },
  },
} as const;

/** This tool's one-entry catalog, exported (not inlined into {@link buildAgentPluginSearchRegistrations})
 *  so `assistant/__tests__/tool-registrations.contracts.test.ts`'s `CATALOGS_BY_DOMAIN` — which
 *  cross-checks every wired domain's published schema/risk/actor-class contract against this SAME
 *  source of truth — can import it the same way it imports every sibling domain's `<domain>AgentToolCatalog`. */
export const agentPluginSearchAgentToolCatalog: WirableToolDefinition[] = [
  {
    name: SEARCH_AGENT_PLUGIN_LOCAL_TOOL_ID,
    description: SEARCH_AGENT_PLUGIN_LOCAL_DESCRIPTION,
    sideEffects: "none",
    authorization: { permission: "admin.assistant.use" },
    inputSchema: SEARCH_AGENT_PLUGIN_LOCAL_SCHEMA,
  },
];

/**
 * Resolves every installed plugin in one workspace into a search-ready {@link AgentPluginSearchCandidate}.
 *
 * UNLIKE {@link loadInstalledAgentPluginToolSources} (the dynamic per-plugin tool loader above), this
 * INCLUDES disabled plugins. Search exists so the assistant can find — and then a human can decide
 * whether to turn on — an installed-but-inactive plugin; filtering those out here would make a
 * disabled plugin permanently undiscoverable through the one tool that could report it exists.
 *
 * UNLIKE that same loader's {@link assertSingleDigestPerPlugin}, a plugin id installed under more than
 * one digest is NOT fatal here: this silently keeps the first-encountered digest for that id rather
 * than throwing, so every OTHER, unambiguous plugin in the workspace stays discoverable. The ambiguity
 * itself is still a loud, operator-actionable error the moment anything tries to actually USE the
 * plugin (`resolveOnePluginRef`/the dynamic-tool loader both refuse outright) — duplicating that
 * refusal in a read-only search tool would only make discovery unavailable too, for no safety benefit.
 *
 * @complexity O(p * s) in installed-plugin count times average skills-per-plugin — the same shape
 * {@link loadInstalledAgentPluginToolSources} already accepts for this identical catalog, plus one
 * `mcp.json` read per plugin.
 *
 * Exported (2026-09-09) for a second caller outside this module:
 * `server/inbound/admin-http/routes/agent-plugins/list.ts` — the admin UI's read of the SAME
 * installed-plugin state this tool searches — reuses this loader rather than re-deriving it, so
 * "what plugins are installed" has one source of truth with two consumers (a tool and the admin
 * page), matching this file's own `listInstalledPlugins` precedent above.
 */
export async function loadAgentPluginSearchCandidates(ctx: { readonly workspaceId: string }): Promise<readonly AgentPluginSearchCandidate[]> {
  const workspaceLayout = resolveAgentPluginLayout().forWorkspace(ctx.workspaceId);
  const installed = await listInstalledPlugins(workspaceLayout.packages);
  const activations = await readAgentPluginActivations(workspaceLayout.root);

  const seenPluginIds = new Set<string>();
  const candidates: AgentPluginSearchCandidate[] = [];

  for (const plugin of installed) {
    if (seenPluginIds.has(plugin.pluginId)) continue;
    seenPluginIds.add(plugin.pluginId);

    const skills = await resolveSkillsForPlugin(plugin);
    const mcpServerIds = await readInstalledMcpServerIds(plugin.packageRoot);

    candidates.push({
      pluginId: plugin.pluginId,
      ...(plugin.version !== undefined ? { version: plugin.version } : {}),
      ...(plugin.description !== undefined ? { description: plugin.description } : {}),
      keywords: plugin.keywords ?? [],
      enabled: isAgentPluginActive(activations, plugin.pluginId),
      skills: skills.map((skill) => ({ name: skill.name, summary: skill.summary })),
      mcpServerIds,
    });
  }

  return candidates;
}

/** This tool's own risk classification: a pure read of already-installed, already-validated local
 *  content, same as every other read-only tool this domain and its siblings (`plugins_list`,
 *  `search_components`) already declare `"none"` for. */
export const agentPluginSearchDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  [SEARCH_AGENT_PLUGIN_LOCAL_TOOL_ID, "none"],
]);

/**
 * Builds the `search_agent_plugin_local` registration — pure catalog/schema construction plus one
 * handler closure; the actual disk read happens only when the handler is invoked, matching
 * `plugins_list`'s identical "read fresh on every call" shape.
 *
 * @complexity O(1) to build; see {@link loadAgentPluginSearchCandidates} and
 * {@link rankInstalledAgentPlugins} for the handler's own per-call cost.
 */
export function buildAgentPluginSearchRegistrations(routeDeps: AgentPluginSearchToolDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    [SEARCH_AGENT_PLUGIN_LOCAL_TOOL_ID]: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const query = requireString(input, "query");
      const rawLimit = optionalNumber(input, "limit");
      // Clamped, not rejected — an out-of-range limit is an optimization hint, not part of what the
      // caller is actually asking for, mirroring `component-catalog-tool.ts`'s identical treatment of
      // `search_components`' own `limit` argument.
      const limit = rawLimit === undefined ? SEARCH_LIMIT_DEFAULT : Math.min(Math.max(Math.trunc(rawLimit), 1), SEARCH_LIMIT_MAX);

      const candidates = await loadAgentPluginSearchCandidates({ workspaceId: routeDeps.workspaceId });
      const matches = rankInstalledAgentPlugins(query, candidates, limit);

      return {
        matches: matches.map((match) => ({
          pluginId: match.pluginId,
          version: match.version ?? null,
          description: match.description ?? null,
          keywords: match.keywords,
          enabled: match.enabled,
          skills: match.skills,
          mcpServers: match.mcpServerIds,
          score: match.score,
        })),
        // Lets a zero-`matches` response distinguish "nothing is installed at all" from "N plugins
        // are installed but none matched this query" — the model needs that distinction to decide
        // whether to suggest installing something new versus rephrasing the search.
        totalInstalled: candidates.length,
      };
    },
  };

  return buildDomainRegistrations({
    domain: "agent-plugin-search",
    catalogModule: "features/agent-plugins/tool-registrations.ts",
    catalog: indexCatalogById(agentPluginSearchAgentToolCatalog),
    handlers,
    derivedRisk: agentPluginSearchDerivedRisk,
  });
}

/**
 * Contributes `search_agent_plugin_local` to the assistant's STATIC tool catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, the ordinary seam every
 * other domain's `contribute<Domain>Tools()` uses. See this section's own header for why this tool
 * uses that seam while `registerInstalledAgentPluginTools` above deliberately does not.
 */
export function contributeAgentPluginSearchTools(): ToolContributor {
  return { domain: "agent-plugin-search", build: buildAgentPluginSearchRegistrations, risk: agentPluginSearchDerivedRisk };
}

/**
 * ===========================================================================================
 * `agent_plugins_uninstall` — the uninstall tool for THIS package family, not `.tovu-plugin`'s
 * ===========================================================================================
 * `features/plugin-runtime/tool-registrations.ts` already has `plugins_uninstall` for the OTHER
 * plugin system (`.tovu-plugin` site/runtime plugins). This is the same feature, one family over —
 * see `uninstall.ts`'s own header for the full design, including the two deliberate divergences from
 * that file's shape (no cross-workspace "enabled somewhere else" precondition; bundled is refused for
 * permanence, not mere absence).
 *
 * Static, like `search_agent_plugin_local` above, not dynamic like `agent_plugin_<pluginId>`: this
 * tool's id/schema/description are fixed at module load, so it is wired through the ordinary
 * `ToolContributor` seam (`contributeAgentPluginUninstallTools`, registered once at composition-root
 * boot) rather than the async-discovery path `registerInstalledAgentPluginTools` uses.
 *
 * Tool id is `agent_plugins_uninstall` — PLURAL `agent_plugins_`, not singular `agent_plugin_` —
 * deliberately outside the dynamic per-plugin tool's own reserved `agent_plugin_<pluginId>` namespace
 * (`toAgentPluginToolId` above). A plugin literally named `uninstall` would otherwise mint a dynamic
 * tool id (`agent_plugin_uninstall`) that collides with a hypothetical static `agent_plugin_uninstall`
 * — the plural prefix used here can never collide with that singular-prefixed scheme (verified: no
 * `pluginId` substitution into `agent_plugin_<id>` can ever reproduce the substring `plugins_`
 * immediately after `agent_`, since the generator always inserts exactly one `_` there, never `s_`).
 *
 * Permission: `admin.plugins.enable` — the SAME permission `AGENT_PLUGIN_SET_ENABLED`
 * (`server/inbound/admin-http/routes/agent-plugins/set-enabled.ts`) already checks, no new grant
 * introduced. Matches plugin-runtime's own `plugins_uninstall` precedent of reusing its sibling
 * mutation's permission rather than minting a new one for a strictly stronger operation on the same
 * resource. Checked explicitly here via `requireToolPermission` (unlike `search_agent_plugin_local`,
 * which has no mutation to gate beyond the blanket `admin.assistant.use` every wired tool already
 * carries) — a delete deserves its own explicit evaluation, not only the ambient one.
 *
 * Confirmation (2026-09-14): the call PARKS on a human's Uninstall/Cancel click, the held-open
 * exchange `content_post_delete`/`media_trash_asset` use (`uninstall-confirmation-ui.ts`). Deleting a
 * package is irreversible and removes guidance the assistant itself runs on, so it is not the model's
 * to decide; the first cut only asked the MODEL to confirm in prose. Order inside the handler:
 * permission, then `previewAgentPluginUninstall` (so an unknown or bundled id is refused before a
 * human is asked anything), then the dialog, then `uninstallAgentPlugin`, which re-runs both refusals
 * against the disk as it is after the answer. Fails closed with no `emitSurface`, like its siblings.
 *
 * Risk classification: `deletes-durable-state`, not `mutates-durable-state`. This domain imports
 * `AgentToolSideEffect` from the current kit (`@jini-ai/cms/core`) rather than declaring its own
 * narrower per-domain copy the way `plugin-runtime/agent-tools.ts` does (that file's own union
 * predates this member and still uses `mutates-durable-state` for its `plugins_uninstall` — not
 * something this dispatch touches), so the more precise classification is available and used here:
 * this tool genuinely removes content from every read path (`search_agent_plugin_local`,
 * `agent_plugin_<pluginId>`, `resolveAgentPluginRefs`), which is exactly the distinction
 * `deletes-durable-state` exists to make loud rather than folding into the milder classification a
 * title edit would also carry.
 */

/** The narrow slice of the route-deps bag this tool's handler reads. `authorize`/`workspaceId`
 *  mirror `PluginsToolDeps`'s identical two fields for the sibling family's own `plugins_uninstall` —
 *  everything else this tool needs (`resolveAgentPluginLayout`, `uninstallAgentPlugin`) is resolved
 *  from `workspaceId` alone, the same shape `AgentPluginSearchToolDeps` above already uses. */
export interface AgentPluginUninstallToolDeps {
  readonly authorize: AuthorizeFn;
  readonly workspaceId: string;
}

const AGENT_PLUGINS_UNINSTALL_DESCRIPTION =
  "PERMANENTLY removes an installed Agent Plugin from THIS workspace: deletes its on-disk package " +
  "and its activation record. This is NOT reversible from inside Tovu — there is no revision history " +
  "or trash to restore it from; reinstalling means re-running the install with the plugin's archive. " +
  "ALWAYS ASKS THE HUMAN FIRST: this tool opens a confirmation dialog and waits for their answer; nothing " +
  "is removed unless they confirm, and a cancel or no answer comes back as a result, not an error. " +
  "Refused with a clear reason, before any dialog, if the plugin id is not installed in this workspace or " +
  "is BUNDLED with Tovu (bundled plugins are re-seeded on every boot, so uninstalling one would silently " +
  "reappear on the next restart) — to stop a bundled plugin being used, call plugins_set_enabled with " +
  "family 'agent-plugin' and enabled false instead. After a confirmed uninstall the plugin's own " +
  "agent_plugin_<id> tool stays listed until Tovu restarts.";

/** What a confirmed uninstall must still tell the user. The package is gone and new runs no longer
 *  pin it, but a plugin's `agent_plugin_<id>` tool is registered once at agent-daemon boot with its
 *  guidance held in memory (`buildAgentPluginToolRegistrations` above), so it keeps answering until a
 *  restart — "uninstalled" alone would mislead, the same confusion `plugins_set_enabled`'s
 *  `restartRequired` exists to prevent. */
const UNINSTALL_RESTART_NOTE =
  "Uninstalled. Its files and activation record are gone and new runs no longer load it, but if it was enabled when " +
  "the agent daemon started, its own agent_plugin_<id> tool keeps answering from memory until Tovu restarts — tell " +
  "the user a restart finishes the removal.";

const AGENT_PLUGINS_UNINSTALL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["pluginId"],
  properties: {
    pluginId: {
      type: "string",
      minLength: 1,
      description:
        "The Agent Plugin's id (its plugin.json 'name'), as returned by search_agent_plugin_local. Must be " +
        "installed in this workspace and not bundled with Tovu — both are refused with a clear reason.",
    },
  },
} as const;

/** This tool's one-entry catalog, exported for the same cross-check reason
 *  `agentPluginSearchAgentToolCatalog` above already is. */
export const agentPluginUninstallAgentToolCatalog: WirableToolDefinition[] = [
  {
    name: AGENT_PLUGINS_UNINSTALL_TOOL_ID,
    description: AGENT_PLUGINS_UNINSTALL_DESCRIPTION,
    sideEffects: "deletes-durable-state",
    authorization: { permission: "admin.plugins.enable" },
    inputSchema: AGENT_PLUGINS_UNINSTALL_SCHEMA,
  },
];

/**
 * Re-classifies `uninstallAgentPlugin`'s own domain errors into `ToolInputError` on their way to the
 * model, and passes every other rejection through untouched.
 *
 * Same reasoning as `features/post/tool-registrations.ts`'s `toModelFacingUpdateError`: an unknown
 * `pluginId` and a bundled-plugin refusal are both exactly "the CALLER's input was the problem, and a
 * different input (a real installed id; a different tool call to disable instead) resolves it" — the
 * honest classification, not a trick to defeat `@jini-ai/daemon`'s redaction. Neither message carries
 * anything beyond the plugin id the caller already sent and, for the bundled case, the name of the
 * tool to call instead — nothing internal leaks.
 */
function toModelFacingUninstallError(error: unknown): unknown {
  if (error instanceof AgentPluginNotFoundError || error instanceof AgentPluginNotUninstallableError) {
    return new ToolInputError(error.message);
  }
  return error;
}

/** Runs one `uninstall.ts` call with its refusals re-classified for the model.
 *  @complexity O(1) beyond `fn`. */
async function withModelFacingUninstallErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw toModelFacingUninstallError(error);
  }
}

/**
 * Raises the uninstall-confirmation dialog and parks on the human's answer.
 *
 * Fails CLOSED when the execution context cannot hold a call open, exactly like
 * `content_post_delete`/`plugins_set_enabled`: degrading to "remove it and mention we could not ask"
 * would make the confirmation decorative in precisely the contexts that most need it.
 *
 * @throws {Error} When there is no `emitSurface` to raise a dialog through.
 * @complexity O(1) plus the human's own latency, bounded by the exchange store's TTLs.
 */
async function confirmUninstall(
  surfaces: AssistantSurfaceDeps,
  ctx: Pick<ToolExecutionContext, "principal" | "signal"> & Partial<Pick<ToolExecutionContext, "emitSurface">>,
  preview: AgentPluginUninstallPreview,
): Promise<ConfirmationOutcome> {
  const emitSurface = ctx.emitSurface;
  if (!emitSurface) {
    throw new Error(
      "agent_plugins_uninstall: this execution context has no interactive confirmation channel (no emitSurface), so a " +
        "permanent uninstall cannot be gated here. Nothing was removed.",
    );
  }

  const exchange = surfaces.surfaceExchanges.open({ toolId: AGENT_PLUGINS_UNINSTALL_TOOL_ID, principalId: ctx.principal.id }, emitSurface);
  const ui = buildUninstallConfirmationResource({ preview, exchangeId: exchange.id });

  // A cancelled run must not leave a dialog holding a call nobody is listening to.
  const closeOnAbort = () => exchange.close();
  ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
  try {
    return await resolveConfirmationDecision(exchange, { channel: "mcp-ui", payload: { resource: ui } });
  } finally {
    ctx.signal.removeEventListener("abort", closeOnAbort);
  }
}

/** ADR-055 Decision 6: a no-answer is a RESULT, not an exception — nothing was removed either way,
 *  and the model is still alive to say so. @complexity O(1). */
function notConfirmedUninstallResult(outcome: Exclude<ConfirmationOutcome, { confirmed: true }>, pluginId: string): unknown {
  const base = { uninstalled: false, pluginId, restartRequired: false };
  if (outcome.reason === "declined") {
    return { ...base, cancelled: true, note: `The user declined. '${pluginId}' was NOT uninstalled and nothing changed.` };
  }
  return {
    ...base,
    cancelled: false,
    reason: outcome.reason,
    note:
      outcome.reason === "expired"
        ? `The user did not answer the confirmation before it expired. '${pluginId}' was NOT uninstalled.`
        : `The confirmation was closed because the run ended. '${pluginId}' was NOT uninstalled.`,
  };
}

/** This tool's own risk classification. */
export const agentPluginUninstallDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  [AGENT_PLUGINS_UNINSTALL_TOOL_ID, "deletes-durable-state"],
]);

/**
 * Builds the `agent_plugins_uninstall` registration — mirrors `buildAgentPluginSearchRegistrations`'s
 * shape immediately above (same `buildDomainRegistrations` gate), plus the explicit
 * `requireToolPermission` call and the human confirmation this tool's delete warrants (see this
 * section's header for the order and why).
 */
export function buildAgentPluginUninstallRegistrations(routeDeps: AgentPluginUninstallToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    [AGENT_PLUGINS_UNINSTALL_TOOL_ID]: async (ctx) => {
      const pluginId = requireString(requireInputRecord(ctx.input), "pluginId");
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: "admin.plugins.enable",
        entityType: "agent-plugin",
        entityId: pluginId,
      });

      const request = { layout: resolveAgentPluginLayout(), workspaceId: routeDeps.workspaceId, pluginId };
      const preview = await withModelFacingUninstallErrors(() => previewAgentPluginUninstall(request));

      const outcome = await confirmUninstall(surfaces, ctx, preview);
      if (!outcome.confirmed) return notConfirmedUninstallResult(outcome, pluginId);

      const result = await withModelFacingUninstallErrors(() => uninstallAgentPlugin(request));
      return {
        uninstalled: true,
        cancelled: false,
        pluginId: result.pluginId,
        removedDigests: result.removedDigests,
        restartRequired: true,
        note: UNINSTALL_RESTART_NOTE,
      };
    },
  };

  return buildDomainRegistrations({
    domain: "agent-plugin-uninstall",
    catalogModule: "features/agent-plugins/tool-registrations.ts",
    catalog: indexCatalogById(agentPluginUninstallAgentToolCatalog),
    handlers,
    derivedRisk: agentPluginUninstallDerivedRisk,
  });
}

/**
 * Contributes `agent_plugins_uninstall` to the assistant's static tool catalog — the same
 * `installFirstPartyToolContributors()` seam `contributeAgentPluginSearchTools` above uses.
 */
export function contributeAgentPluginUninstallTools(): ToolContributor {
  return { domain: "agent-plugin-uninstall", build: buildAgentPluginUninstallRegistrations, risk: agentPluginUninstallDerivedRisk };
}
