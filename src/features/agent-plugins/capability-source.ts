/**
 * @file The first `CapabilitySource` (`assistant/capability-source-registry.ts`): turns every Agent
 * Plugin installed in a workspace into one discovery-only capability card PER SKILL FOLDER PER
 * DIGEST — not one card per plugin, and not filtered down to a plugin's own eponymous skill the way
 * `resolve-agent-plugin-refs.ts`'s run-start injection is. That narrowing is the right call for a
 * run's prompt prefix (one skill's worth of context, chosen by the composer's pinned ref), but it is
 * the WRONG call for discovery: a 7-skill plugin genuinely offers 7 distinct, independently
 * describable capabilities, and a plugin whose skill folders are all named something OTHER than the
 * plugin's own id (no eponymous skill at all) would otherwise be entirely invisible to
 * `capability_search` — the scaling-cliff gap this slice exists to close.
 *
 * Reuses `resolve-agent-plugin-refs.ts`'s exported `listInstalledPlugins` for the actual
 * `packages/sha256/*` walk rather than re-implementing it: that function already owns the
 * digest-dirname validation and the per-digest failure isolation (a manifest that fails to parse, or
 * a package.json that goes missing, is skipped for that ONE digest, never fatal to every other
 * digest's cards) — duplicating a second, less-validated copy of that walk here would be exactly the
 * kind of drift risk `install.ts`'s own `indexInstalledRoot` doc warns about (fix lands in one copy,
 * not the other). See the APPROVED scope note on `resolve-agent-plugin-refs.ts`'s own export for why
 * this is a one-line, low-risk export rather than the ~15-line duplicate the alternative would need.
 *
 * `read()` delegates straight to `capability-projection.ts`'s `readInstalledSkillMarkdown`, which
 * already composes `package-paths.ts`'s `assertContainedOnDisk` guarantee with the actual file read
 * — one implementation of "stay inside the package root," not two. No new path-safety logic is
 * written anywhere in this file.
 *
 * Tenancy: `list(ctx)` resolves `resolveAgentPluginLayout().forWorkspace(ctx.workspaceId)` itself,
 * the same bare call `server/agent-daemon/plugin-prompt-prefix.ts` already makes at its own
 * workspace-scoped call site — never a cached or shared layout, matching `layout.ts`'s own
 * tenant-isolation rule that an installed package is reachable only through its OWNING workspace's
 * `forWorkspace()` result. Since `ctx.workspaceId` is threaded in by the caller
 * (`capability-tool-registrations.ts`'s lazy catalog build, itself given `routeDeps.workspaceId` —
 * never `process.env.TOVU_WORKSPACE`), this source never resolves a workspace's packages against a
 * DIFFERENT workspace's id.
 *
 * Architectural role: `features/agent-plugins -> assistant`, one-directional — this file reaches
 * `registerCapabilitySource`/`CapabilitySource`/`CapabilityCard`/`CapabilitySourceContext` through
 * the `#src/assistant/index` barrel, the same "port, not a file path" seam every OTHER feature's
 * `registerToolContributor` caller already uses (`comments/tool-registrations.ts` etc.) — never a
 * deep import straight into `capability-source-registry.ts`. Verified empirically, not just by
 * convention: a deep import here measurably regressed `check:architecture`'s "module API surface
 * (files exposed)" hard-constraint ratchet (202 -> 207); routing through the barrel instead keeps
 * that count where the 25-domain rollout already left it, since `assistant/index.ts` was already
 * part of every module's reachable set before this file existed.
 */
import path from "node:path";

import { listInstalledPlugins } from "./resolve-agent-plugin-refs.js";
import { readInstalledSkillMarkdown } from "./capability-projection.js";
import {
  AGENT_PLUGIN_SKILL_CAPABILITY_KIND,
  toAgentPluginSkillCapabilityId,
} from "./capability-id.js";
import { resolveAgentPluginLayout } from "./layout.js";
import {
  registerCapabilitySource,
  type CapabilityCard,
  type CapabilitySource,
  type CapabilitySourceContext,
} from "#src/assistant/index";

export const AGENT_PLUGIN_SKILLS_CAPABILITY_SOURCE_ID = "agent-plugin-skills";

/** Title-cases a kebab-case skill folder name into a human-facing card name — mirrors
 *  `capability-projection.ts`'s own (unexported) `humanize`, duplicated rather than imported since
 *  that module's version is a private implementation detail of a different projection, not a shared
 *  utility either module has promised to keep in sync. */
function humanize(value: string): string {
  return value
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** The shape this source's own `handle` always carries — declared once so `read()` and `listFiles()`
 *  cast the same opaque value the same way, rather than two independently-drifting inline casts.
 *  `files` is the installed plugin's FULL package-relative file list (`InstalledAgentPlugin.files`,
 *  `install.ts`'s own sorted walk) at `list()` time — safe to carry as-is rather than re-walking disk
 *  at `listFiles()` time, because a published package root is content-addressed and frozen read-only
 *  (`install.ts`'s `freezeTree`): the digest this handle's `packageRoot` is keyed to can never gain or
 *  lose a file after `list()` observed it. An upgrade or uninstall changes which DIGEST is current,
 *  not the frozen file set under an already-published one. */
interface AgentPluginSkillCapabilityHandle {
  readonly packageRoot: string;
  readonly skillPath: string;
  readonly files: readonly string[];
}

/**
 * `CapabilitySource.list` — every installed Agent Plugin's every skill folder, across every
 * installed digest, as one card each.
 *
 * @complexity O(d * s) in installed-digest count times average skills-per-digest — `listInstalledPlugins`'s own cost dominates.
 */
async function listAgentPluginSkillCapabilities(ctx: CapabilitySourceContext): Promise<readonly CapabilityCard[]> {
  const packagesDir = resolveAgentPluginLayout().forWorkspace(ctx.workspaceId).packages;
  const installed = await listInstalledPlugins(packagesDir);

  const cards: CapabilityCard[] = [];
  for (const plugin of installed) {
    for (const skill of plugin.skills) {
      cards.push({
        id: toAgentPluginSkillCapabilityId(plugin.pluginId, plugin.archiveDigest, skill.name),
        kind: AGENT_PLUGIN_SKILL_CAPABILITY_KIND,
        pluginId: plugin.pluginId,
        skillName: skill.name,
        revision: plugin.archiveDigest,
        name: humanize(skill.name),
        description: `Skill '${skill.name}' from the '${plugin.pluginId}' Agent Plugin (installed digest ${plugin.archiveDigest}).`,
        keywords: ["skill", plugin.pluginId, skill.name],
        source: AGENT_PLUGIN_SKILLS_CAPABILITY_SOURCE_ID,
        handle: { packageRoot: plugin.packageRoot, skillPath: skill.skillPath, files: plugin.files } satisfies AgentPluginSkillCapabilityHandle,
      });
    }
  }
  return cards;
}

/** `CapabilitySource.read` — resolves a previously-listed card's `handle` back to its real
 *  SKILL.md content. `handle` is opaque to the registry and to `assistant/` alike; only this source,
 *  the one that produced it, is entitled to interpret its shape. */
async function readAgentPluginSkillCapability(handle: unknown, _ctx: CapabilitySourceContext): Promise<string> {
  const { packageRoot, skillPath } = handle as AgentPluginSkillCapabilityHandle;
  return readInstalledSkillMarkdown(packageRoot, skillPath);
}

/** `CapabilitySource.listFiles` — every OTHER file in the handle's installed package (i.e. every
 *  package-relative path `list()` recorded, minus the skill's own `skillPath` — `read()` above
 *  already returns that one's content), as absolute paths rooted under `packageRoot`. Mirrors
 *  `resolve-agent-plugin-refs.ts`'s `resolveOnePluginRef`'s own `otherFiles` construction
 *  (`plugin.files.filter((file) => file !== skillPath).map(...)`) — same filter, same join, so a
 *  `pointer`-delivery run and an `inject`-delivery run see identically-shaped inventories for the
 *  same installed package. No disk access here: `files` was already the real, on-disk file list
 *  `list()` walked, carried through the handle (see {@link AgentPluginSkillCapabilityHandle}'s own
 *  doc for why that is safe against upgrade/uninstall). */
async function listAgentPluginSkillCapabilityFiles(handle: unknown, _ctx: CapabilitySourceContext): Promise<readonly string[]> {
  const { packageRoot, skillPath, files } = handle as AgentPluginSkillCapabilityHandle;
  return files.filter((file) => file !== skillPath).map((file) => path.join(packageRoot, file));
}

/** Builds this source, independent of the global registry — the shape a test exercises directly. */
export function createAgentPluginSkillsCapabilitySource(): CapabilitySource {
  return {
    id: AGENT_PLUGIN_SKILLS_CAPABILITY_SOURCE_ID,
    list: listAgentPluginSkillCapabilities,
    read: readAgentPluginSkillCapability,
    listFiles: listAgentPluginSkillCapabilityFiles,
  };
}

/** Registers this source into the global seam — called once by
 *  `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, alongside (but
 *  independent of) that same function's `contributeCapabilityTools()` call. */
export function registerAgentPluginSkillsCapabilitySource(): void {
  registerCapabilitySource(createAgentPluginSkillsCapabilitySource());
}
