import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
  buildDomainRegistrations,
  indexCatalogById,
  requireNoInput,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
  type WirableToolDefinition,
} from "@jini-ai/cms/core";

import { readFrontmatterField } from "#src/platform/markdown/frontmatter";

import { resolveSkillLayout } from "./layout.js";

/**
 * @file Registers every installed standalone Agent Skill (`<site>/skills/ws/<workspaceId>/<dir>/
 * SKILL.md`) as ONE real tool in the `ToolRegistry` — the standalone-skill counterpart to
 * `src/features/agent-plugins/tool-registrations.ts`, structurally mirrored but deliberately NOT
 * built on top of it (owner decision, verbatim: "they are different things. there should be a
 * skills/ and a separate agent-plugins/ directory").
 *
 * ---------------------------------------------------------------------------
 * A Skill is not a Plugin — why that difference reaches this file
 * ---------------------------------------------------------------------------
 * Per the Agent Skills spec (agentskills.io): a skill is a folder — `SKILL.md` with YAML frontmatter
 * (at minimum `name` and `description`), then instructions, plus optional `references/`, `scripts/`,
 * `assets/`. "A single skill doesn't require a plugin wrapper." Loading is PROGRESSIVE DISCLOSURE:
 * discovery sees only `name`/`description`; the full body is read only once the task actually
 * matches. An Agent Plugin (agent-plugins.org, `src/features/agent-plugins/`) is a PACKAGE that
 * bundles multiple skills plus `mcp.json` plus client config — already implemented, and this file
 * does not modify it. Because a standalone skill is already the atomic unit (unlike a plugin, which
 * may bundle several skills under one id), this file is simpler than its agent-plugin counterpart in
 * one structural way worth naming up front: there is no "combined description across many skills" and
 * no optional `skill` argument to pick among them — one skill folder is one tool, full stop.
 *
 * ---------------------------------------------------------------------------
 * Tool id scheme: `skill_<sanitized name>`
 * ---------------------------------------------------------------------------
 * `agent-plugins/tool-registrations.ts`'s own header records that an earlier revision of THAT file
 * used `skill_<pluginId>` and that this was a category error the product owner caught — an Agent
 * Plugin is a packaging paradigm, not itself a skill. That same header explicitly names the
 * consequence: "`skill_` was wrong the moment this file started minting one tool per INSTALLED
 * PLUGIN... and it burned a prefix real standalone skill tools will need later." This file is that
 * later use. `plugin_` is not available either — it collides with the existing native
 * `plugins_list`/`plugins_set_enabled` tools (`features/plugin-runtime/`, an unrelated "plugin"
 * concept). `skill_` is free and is exactly the reserved prefix this feature claims.
 *
 * ---------------------------------------------------------------------------
 * Tool description = the skill's own frontmatter `description`, VERBATIM
 * ---------------------------------------------------------------------------
 * That is the whole point of progressive disclosure: `search_tools`' discovery pass must see what the
 * skill's own author wrote as the trigger condition ("Use when handling production incidents..."),
 * not a wrapper sentence this module invents. No combining, no humanizing, no folding in other
 * fields — unlike the agent-plugin tool's `buildPluginToolDescription`, which has to fold several
 * skills' vocabulary into one description because several skills share one tool there. Here, one
 * skill is one tool, so its own description already IS the correct indexed text.
 *
 * ---------------------------------------------------------------------------
 * The handler's output: full `SKILL.md` body, plus a pointer to the rest — never inlined
 * ---------------------------------------------------------------------------
 * A skill's optional `references/`, `scripts/`, `assets/` files are the second stage of progressive
 * disclosure: read only once the agent is actually doing the task and needs more than the top-level
 * instructions. Inlining their contents into every tool call would defeat that (and, for a skill like
 * this feature's own installed `incident-response` fixture, balloon a call that usually only needs
 * the top-level workflow). The handler instead returns each bundled file's path so the caller can
 * `Read` it on demand — the same "list paths, do not inline" shape
 * `resolve-agent-plugin-refs.ts`'s own `inventory` block already uses for an installed plugin's
 * non-eponymous files.
 *
 * These paths are ABSOLUTE, which is a deliberate divergence from
 * `agent-plugins/tool-registrations.ts`'s stated SECURITY property that "no absolute host path ever
 * reaches a tool id, description, schema, or handler output." Two reasons that property does not
 * transfer here: (1) trust model — an Agent Plugin archive is "genuinely hostile third-party input"
 * (that file's own `layout.ts` header); a skill folder is an operator dropping trusted content
 * directly onto this instance's own disk, no download, no archive extraction. (2) mechanism — the
 * agent-plugin tool's handler never returns a file list at all (only `resolveAgentPluginRefs`'s
 * separate PROMPT-PREFIX path does, and that path already uses absolute paths for the identical
 * reason given there: the spawned CLI agent has real filesystem access and its `Read` tool requires
 * an absolute path). A standalone skill has no equivalent prompt-prefix delivery mechanism — this
 * tool call IS the only delivery mechanism — so if bundled files are to be reachable at all, this is
 * the one place that can name them, and a relative path with no stated base would not be `Read`-able
 * by a caller that was never told the base.
 *
 * ---------------------------------------------------------------------------
 * Bad-folder isolation: skip and warn, never throw — except for one real ambiguity
 * ---------------------------------------------------------------------------
 * A skill folder with no `SKILL.md`, or with frontmatter missing `name`/`description`, is skipped
 * with a `console.warn` naming the folder — never fatal to every OTHER folder in the same workspace,
 * mirroring `listInstalledPlugins`'s own per-digest failure isolation. The one case this file DOES
 * throw on on a valid-looking installed set is two DIFFERENT skill folders whose frontmatter `name`
 * collides (so both would mint the identical tool id) — not covered by the "skip a bad folder" rule
 * above, because neither folder is individually bad. This mirrors
 * `loadInstalledAgentPluginToolSources`'s own multi-digest ambiguity guard and the same
 * `resolveOnePluginRef` "more than one match" rule: silently registering only one of the two (e.g.
 * "whichever `readdir` returned first") would be a worse failure than a loud, actionable error,
 * because nothing about the resulting tool call would look wrong until someone noticed it always
 * answered from the folder they did not mean.
 *
 * Architectural role:
 * `loadInstalledSkillToolSources` is the only disk-reading half; `buildSkillToolRegistrations` is
 * pure and synchronous so a unit test exercises the registration/schema/handler shape without a real
 * filesystem, matching the same split `agent-plugins/tool-registrations.ts` keeps.
 */

/** One parsed skill's required frontmatter fields — `name` and `description` per the Agent Skills
 *  spec's stated minimum. Anything else a skill's frontmatter carries (`version`, `last_updated`,
 *  `allowed-tools`, ...) is not this loader's concern. */
interface SkillFrontmatter {
  readonly name: string;
  readonly description: string;
}

/**
 * Extracts `name:` and `description:` from a `SKILL.md`'s YAML frontmatter block, via the shared
 * {@link readFrontmatterField} (a real YAML parse of the isolated block, falling back to a single-line
 * regex only when that block isn't valid YAML — see that module's header for why: a folded/literal
 * block scalar `description:` value needs a real parse to resolve, not a regex over its marker line).
 *
 * @returns `undefined` when the file has no frontmatter block, or the block is missing either
 * required field — the caller treats that as "skip this folder" (see this file's header), never a
 * thrown error.
 * @complexity O(n) in the frontmatter block's own length.
 */
function parseSkillFrontmatter(markdown: string): SkillFrontmatter | undefined {
  const name = readFrontmatterField(markdown, "name");
  const description = readFrontmatterField(markdown, "description");
  if (!name || !description) return undefined;

  return { name, description };
}

/** `skill_<sanitized name>` — see this file's header, "Tool id scheme", for why `skill_` is the
 *  correct, reserved prefix. Sanitizes more aggressively than `agent-plugins/tool-registrations.ts`'s
 *  own `toAgentPluginToolId` (which only folds hyphens): a skill's `name` frontmatter field is
 *  free-form author-supplied text, not a value already constrained by the Agent Plugins manifest name
 *  grammar, so every run of characters outside `[a-z0-9]` collapses to one underscore and any
 *  leading/trailing underscore is trimmed — the id stays a legal, predictable identifier regardless
 *  of what an author wrote.
 *  @returns `undefined` when sanitizing leaves nothing usable (e.g. a name made entirely of symbols)
 *  — the caller treats that the same as unparseable frontmatter: skip and warn. */
function toSkillToolId(name: string): string | undefined {
  const sanitized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return sanitized.length > 0 ? `skill_${sanitized}` : undefined;
}

/** The three optional bundled-content subdirectories the Agent Skills spec names. Order here is also
 *  the order {@link listBundledFiles} walks them in. */
const BUNDLED_SUBDIRS = ["references", "scripts", "assets"] as const;
type SkillBundledFileKind = (typeof BUNDLED_SUBDIRS)[number];

/** One file bundled alongside a skill's `SKILL.md`, resolved to an absolute, directly `Read`-able
 *  path — see this file's header for why absolute (not relative) is the deliberate choice here. */
export interface SkillBundledFile {
  readonly kind: SkillBundledFileKind;
  readonly path: string;
}

/**
 * Recursively lists every file under one skill's `references/`, `scripts/`, and `assets/`
 * subdirectories — whichever exist. A missing subdirectory contributes nothing and is never an
 * error: the Agent Skills spec marks all three optional, and the reference `incident-response`
 * fixture this feature installs has only `references/`.
 *
 * @complexity O(f) in the total file count under the three subdirectories.
 */
async function listBundledFiles(skillDir: string): Promise<readonly SkillBundledFile[]> {
  const files: SkillBundledFile[] = [];
  for (const kind of BUNDLED_SUBDIRS) {
    await walkFiles(path.join(skillDir, kind), (absolutePath) => files.push({ kind, path: absolutePath }));
  }
  return files;
}

/** One directory's worth of recursion for {@link listBundledFiles}. A missing `dir` (the common case
 *  — most skills do not bundle all three subdirectories) is silently a no-op, not an error. Entries
 *  are visited in sorted order so the resulting file list is deterministic across filesystems. */
async function walkFiles(dir: string, onFile: (absolutePath: string) => void): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isEnoent(error)) return;
    throw error;
  }
  for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) await walkFiles(entryPath, onFile);
    else if (entry.isFile()) onFile(entryPath);
  }
}

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

/** One installed standalone Agent Skill, fully resolved into a single tool-ready source. */
export interface SkillToolSource {
  readonly id: string;
  /** The skill's own frontmatter `name`, unsanitized — carried through for handler output and error
   *  messages; {@link id} is the sanitized, tool-safe derivative of this value. */
  readonly skillName: string;
  /** The skill's own frontmatter `description`, verbatim — see this file's header. */
  readonly description: string;
  /** The full `SKILL.md` file content, frontmatter included — the same "handler returns the exact
   *  file" precedent `agent-plugins/tool-registrations.ts`'s handler already establishes. */
  readonly markdown: string;
  readonly bundledFiles: readonly SkillBundledFile[];
}

/** Human-readable reason a skill folder's `SKILL.md` could not be read — split out of
 *  {@link resolveSkillEntry} so its nested "missing vs. unreadable" ternary lives in its own function
 *  rather than adding two nested-ternary steps to that function's own complexity count. */
function describeSkillMdReadFailure(error: unknown): string {
  if (isEnoent(error)) return "no SKILL.md";
  return `SKILL.md could not be read (${error instanceof Error ? error.message : String(error)})`;
}

/** One entry-resolution outcome: `"skip"` covers every tolerated case this loader's header documents
 *  under "Bad-folder isolation" (not a directory, missing/unreadable SKILL.md, unparseable
 *  frontmatter, unusable id) — only `"resolved"` contributes to the loaded source list. */
type SkillEntryResolution = { readonly kind: "skip" } | { readonly kind: "resolved"; readonly source: SkillToolSource };

/**
 * Resolves one workspace-root directory entry into a ready {@link SkillToolSource}, or a `"skip"`
 * outcome for every tolerated failure — pulled out of {@link loadInstalledSkillToolSources} so that
 * function's own loop body is a flat dispatch on the result instead of nested try/catch and
 * early-continue branches for each entry.
 *
 * @param input.seenDirById - Mutated in place: records `id -> folder name` for every entry this call
 * resolves, so the caller's next call (for the next entry) can detect a same-id collision.
 * @throws {Error} Only for the one non-tolerated case: `frontmatter.name` sanitizes to an `id` already
 * present in `seenDirById` — see this file's header, "Bad-folder isolation".
 * @complexity O(f) in the entry's own bundled-file count (from {@link listBundledFiles}).
 */
async function resolveSkillEntry(input: {
  readonly workspaceRoot: string;
  readonly entry: { readonly name: string; isDirectory: () => boolean };
  readonly seenDirById: Map<string, string>;
}): Promise<SkillEntryResolution> {
  const { workspaceRoot, entry, seenDirById } = input;
  if (!entry.isDirectory()) return { kind: "skip" };
  const skillDir = path.join(workspaceRoot, entry.name);

  let markdown: string;
  try {
    markdown = await readFile(path.join(skillDir, "SKILL.md"), "utf8");
  } catch (error) {
    console.warn(`[skills] '${entry.name}': ${describeSkillMdReadFailure(error)} — skipped`);
    return { kind: "skip" };
  }

  const frontmatter = parseSkillFrontmatter(markdown);
  if (!frontmatter) {
    console.warn(`[skills] '${entry.name}': SKILL.md has no parseable frontmatter with both 'name' and 'description' — skipped`);
    return { kind: "skip" };
  }

  const id = toSkillToolId(frontmatter.name);
  if (!id) {
    console.warn(`[skills] '${entry.name}': frontmatter name '${frontmatter.name}' could not be turned into a valid tool id — skipped`);
    return { kind: "skip" };
  }

  const priorDir = seenDirById.get(id);
  if (priorDir !== undefined) {
    throw new Error(
      `skills: '${frontmatter.name}' is declared by more than one installed skill folder ('${priorDir}' and '${entry.name}') — ` +
        `both would register the same tool id '${id}'; rename one skill's frontmatter 'name' to disambiguate`,
    );
  }
  seenDirById.set(id, entry.name);

  return {
    kind: "resolved",
    source: { id, skillName: frontmatter.name, description: frontmatter.description, markdown, bundledFiles: await listBundledFiles(skillDir) },
  };
}

/**
 * Loads every installed standalone Agent Skill for one workspace, resolved into one tool-ready
 * source per skill folder.
 *
 * @throws {Error} If two installed skill folders declare the same frontmatter `name` — see
 * {@link resolveSkillEntry}.
 * @complexity O(d * f) in installed skill-folder count times average bundled-file count per skill.
 */
export async function loadInstalledSkillToolSources(ctx: {
  readonly workspaceId: string;
}): Promise<readonly SkillToolSource[]> {
  const workspaceRoot = resolveSkillLayout().forWorkspace(ctx.workspaceId).root;

  let entries;
  try {
    entries = await readdir(workspaceRoot, { withFileTypes: true });
  } catch (error) {
    if (isEnoent(error)) return [];
    throw error;
  }

  const sources: SkillToolSource[] = [];
  const seenDirById = new Map<string, string>();
  for (const entry of entries) {
    const resolution = await resolveSkillEntry({ workspaceRoot, entry, seenDirById });
    if (resolution.kind === "resolved") sources.push(resolution.source);
  }

  return sources;
}

/** This module's own risk classification: every skill tool is a pure read of already-installed,
 *  operator-trusted local content — no domain call, no write path, mirroring
 *  `agent-plugins/tool-registrations.ts`'s identical `"none"` classification for the same reason. */
export function skillToolDerivedRisk(sources: readonly SkillToolSource[]): DerivedRiskByToolId {
  return new Map<string, AgentToolSideEffect>(sources.map((source) => [source.id, "none"]));
}

/** No arguments — every skill tool takes none (see this file's header: one skill is one tool, with
 *  no `skill` argument to select among siblings the way the agent-plugin tool needs). Shape mirrors
 *  `features/database/agent-tools.ts`'s own `NO_INPUT_SCHEMA`. */
const NO_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {},
} as const;

/**
 * Turns already-resolved skill sources into real `ToolRegistration`s — pure and synchronous, unlike
 * {@link loadInstalledSkillToolSources}, so this is the half a unit test exercises without touching
 * disk. Uses the SAME `buildDomainRegistrations` gate every other domain's `tool-registrations.ts`
 * uses (catalog/risk cross-check, `inputSchema` presence, drift tripwire) — not a parallel mechanism.
 */
export function buildSkillToolRegistrations(sources: readonly SkillToolSource[]): ToolRegistration[] {
  const catalog: WirableToolDefinition[] = sources.map((source) => ({
    name: source.id,
    description: source.description,
    sideEffects: "none",
    authorization: { permission: "admin.assistant.use" },
    inputSchema: NO_INPUT_SCHEMA,
  }));

  const handlers: Record<string, ToolHandler> = {};
  for (const source of sources) {
    handlers[source.id] = async (ctx) => {
      requireNoInput(ctx.input);
      return {
        skillName: source.skillName,
        guidance: source.markdown,
        bundledFiles: source.bundledFiles.map((file) => ({ kind: file.kind, path: file.path })),
      };
    };
  }

  return buildDomainRegistrations({
    domain: "skill",
    catalogModule: "features/skills/tool-registrations.ts",
    catalog: indexCatalogById(catalog),
    handlers,
    derivedRisk: skillToolDerivedRisk(sources),
  });
}

/**
 * Composition-root entry point: loads every installed standalone Agent Skill for one workspace and
 * registers each as a real tool directly on `registry` — the same `registry.register(registration)`
 * call `agent-daemon-server.ts`'s own top-level loops make for every other domain, just awaited
 * first. Mirrors `agent-plugins/tool-registrations.ts`'s own `registerInstalledAgentPluginTools`.
 */
export async function registerInstalledSkillTools(
  registry: { register: (registration: ToolRegistration) => void },
  ctx: { readonly workspaceId: string },
): Promise<void> {
  const sources = await loadInstalledSkillToolSources(ctx);
  for (const registration of buildSkillToolRegistrations(sources)) {
    registry.register(registration);
  }
}
