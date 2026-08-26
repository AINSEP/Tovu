import {
  buildDomainRegistrations,
  indexCatalogById,
  isRecord,
  optionalString,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
  type WirableToolDefinition,
} from "@jini-ai/cms/core";

import { filterActiveAgentPlugins, readAgentPluginActivations } from "./activation.js";
import { readInstalledSkillMarkdown } from "./capability-projection.js";
import { resolveAgentPluginLayout } from "./layout.js";
import { listInstalledPlugins } from "./resolve-agent-plugin-refs.js";

/**
 * @file Registers every installed Agent Plugin as ONE real tool in the `ToolRegistry`, alongside —
 * not instead of — `capability-tool-registrations.ts`'s `capability_search`/`capability_get` pair.
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
 * tradeoff makes an ambiguous pluginId — two installed digests of the SAME plugin, which
 * `capability-source.ts` handles by minting two disjoint cards — a case this loader REFUSES
 * outright (see {@link loadInstalledAgentPluginToolSources}) rather than silently picking one, the
 * same "loud, explicit ambiguity error" precedent `resolve-agent-plugin-refs.ts`'s own module doc
 * already establishes for a pinned ref that resolves to more than one digest. Adapted here from
 * per-(plugin,skill)-pair to per-plugin, since a plugin id is now the entire granularity of a tool.
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
 * `capability-source-registry.ts`'s own header is explicit that a `CapabilityCard.handle` "must
 * never be serialized into a `capability_search`/`capability_get` response" because it carries
 * `packageRoot`/`skillPath` — absolute host paths. This module never constructs anything shaped
 * like a `handle` at all: {@link loadInstalledAgentPluginToolSources} uses `plugin.packageRoot`/
 * `skill.skillPath` ONLY as local arguments to the one `readInstalledSkillMarkdown` call that reads
 * each skill file, and neither value is stored on the returned {@link AgentPluginToolSource} or
 * threaded anywhere else. The id is built from `pluginId` (a plugin-declared identifier, not a
 * filesystem path); the description and the `skill` schema's `enum`/description are built from
 * skill names and their own frontmatter/prose; the handler returns `{ pluginId, skillName, guidance,
 * availableSkills, note? }`, where `guidance` is a skill's own markdown BODY — the exact same
 * content `capability_get` already returns for the same skill, never a path naming where it was
 * read from. Verified empirically, not just by construction: this file's own test suite installs a
 * real plugin into a temp directory (an absolute, unpredictable path by construction) and asserts
 * that path's string never appears in any registered id, description, schema, or handler output.
 *
 * ---------------------------------------------------------------------------
 * Why this is NOT a `ToolContributor` (`tool-contribution-registry.ts`)
 * ---------------------------------------------------------------------------
 * Every other domain's contribution is synchronous — `ToolContributor.build: (routeDeps, surfaces)
 * => ToolRegistration[]` — because its tool ids are known statically at module load. This domain's
 * are not: which plugins/skills exist can only be learned by awaiting `listInstalledPlugins`, the
 * same disk read `capability-source.ts`'s own `list()` performs. This file exposes its own async
 * entry point, {@link registerInstalledAgentPluginTools}, which does exactly what
 * `agent-daemon-server.ts`'s existing `for (const registration of build...())
 * registry.register(registration)` loops already do for `buildAssistantToolRegistrations`'s own
 * output — the same registration mechanism, called once more, after an await. It is not wired into
 * that file by this change (a synchronous top-level composition root, already under heavy
 * concurrent edit) — live-boot wiring stays a separate, later decision.
 */

/** Title-cases a kebab-case name into human words. Duplicated from `capability-source.ts`'s own
 *  (unexported) `humanize` for the same reason THAT file duplicates it from `capability-projection.ts`:
 *  a private formatting helper of a sibling module, not a shared utility any of the three has
 *  promised to keep in sync. */
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

/**
 * Loads every installed Agent Plugin for one workspace, resolved into one tool-ready source per
 * plugin.
 *
 * @throws {Error} If a pluginId is installed under more than one digest — this loader registers one
 * tool id per plugin id (see this file's header for why the digest itself is not folded into the
 * id), so that case is a genuine, actionable ambiguity rather than something to silently resolve.
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
  const sources: AgentPluginToolSource[] = [];

  for (const plugin of active) {
    const priorDigest = digestByPluginId.get(plugin.pluginId);
    if (priorDigest !== undefined && priorDigest !== plugin.archiveDigest) {
      throw new Error(
        `agent-plugin tools: '${plugin.pluginId}' is installed under more than one digest ` +
          `(${priorDigest} and ${plugin.archiveDigest}) — this module wires one tool id per installed plugin id ` +
          `with no digest in the id, so an operator must remove the stale install before this plugin can be wired as a tool`,
      );
    }
    digestByPluginId.set(plugin.pluginId, plugin.archiveDigest);

    if (plugin.skills.length === 0) continue; // nothing this plugin's tool could ever return

    const skills: AgentPluginSkillDetail[] = [];
    for (const skill of plugin.skills) {
      const markdown = await readInstalledSkillMarkdown(plugin.packageRoot, skill.skillPath);
      skills.push({ name: skill.name, summary: summarizeSkillMarkdown(skill.name, markdown), markdown });
    }

    const eponymous = skills.find((skill) => skill.name === plugin.pluginId);
    // `plugin.skills` is never empty here (guarded above), so `skills[0]` is always defined.
    const fallbackSkill = skills[0] as AgentPluginSkillDetail;
    const defaultSkillName = eponymous ? eponymous.name : fallbackSkill.name;
    const defaultSkillReason = eponymous
      ? undefined
      : `no eponymous skill folder ('skills/${plugin.pluginId}/SKILL.md') exists in this installed package — ` +
        `defaulting to its alphabetically-first skill`;

    sources.push({
      id: toAgentPluginToolId(plugin.pluginId),
      pluginId: plugin.pluginId,
      description: buildPluginToolDescription(plugin.pluginId, skills, defaultSkillName, defaultSkillReason),
      skills,
      defaultSkillName,
      ...(defaultSkillReason !== undefined ? { defaultSkillReason } : {}),
    });
  }
  return sources;
}

/** This module's own risk classification: every plugin tool is a pure read of already-installed,
 *  already-validated local content — no domain call, no write path, mirroring
 *  `capability_search`/`capability_get`'s identical `"none"` classification. */
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
 * Turns already-resolved plugin sources into real `ToolRegistration`s — pure and synchronous, unlike
 * {@link loadInstalledAgentPluginToolSources}, so this is the half a unit test exercises without
 * touching disk. Uses the SAME `buildDomainRegistrations` gate every other domain's
 * `tool-registrations.ts` uses (catalog/risk cross-check, `inputSchema` presence, drift tripwire) —
 * not a parallel mechanism.
 */
export function buildAgentPluginToolRegistrations(sources: readonly AgentPluginToolSource[]): ToolRegistration[] {
  const catalog: WirableToolDefinition[] = sources.map((source) => ({
    name: source.id,
    description: source.description,
    sideEffects: "none",
    authorization: { permission: "admin.assistant.use" },
    inputSchema: buildPluginInputSchema(source),
  }));

  const handlers: Record<string, ToolHandler> = {};
  for (const source of sources) {
    handlers[source.id] = async (ctx) => buildPluginToolResult(source, readSkillArgument(ctx.input));
  }

  return buildDomainRegistrations({
    domain: "agent-plugin-skill",
    catalogModule: "features/agent-plugins/tool-registrations.ts",
    catalog: indexCatalogById(catalog),
    handlers,
    derivedRisk: agentPluginToolDerivedRisk(sources),
  });
}

/**
 * Composition-root entry point: loads every installed plugin for one workspace and registers each
 * as a real tool directly on `registry` — the same `registry.register(registration)` call
 * `agent-daemon-server.ts`'s own top-level loops make for `buildAssistantToolRegistrations`'s output,
 * just awaited first. See this file's header for why this is a standalone async function rather than
 * a `ToolContributor`, and why it is not (yet) called from that live boot sequence.
 */
export async function registerInstalledAgentPluginTools(
  registry: { register: (registration: ToolRegistration) => void },
  ctx: { readonly workspaceId: string },
): Promise<void> {
  const sources = await loadInstalledAgentPluginToolSources(ctx);
  for (const registration of buildAgentPluginToolRegistrations(sources)) {
    registry.register(registration);
  }
}
