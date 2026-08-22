/**
 * @file Resolves a run's pinned Agent Plugin refs (`pluginRefIds` — `run-start-context.ts`'s
 * decoded `contextRef` field, itself sourced from the composer's `pluginRefId` chips,
 * `composer-capabilities.ts`'s own doc) into the real prompt-prefix text `agent-daemon-server.ts`'s
 * `onStarted` prepends to the run's prompt.
 *
 * ---------------------------------------------------------------------------
 * The activation-record gap this function works around (KNOWN GAP, not silently papered over)
 * ---------------------------------------------------------------------------
 * There is no record anywhere — confirmed 2026-08-21, zero hits in `src/db/` and `src/server/` —
 * of which installed digest is "the" current install for a plugin id in a workspace. Building that
 * (an operator-facing activation table, presumably alongside a future admission gate for MCP
 * servers — `capability-projection.ts`'s own header names the same deferred future work) is a
 * separate, later decision. Until it exists, this function scans every digest this workspace has
 * ever installed under `packages/sha256/*` and matches on the installed `plugin.json`'s own `name`
 * field:
 *
 * - Exactly one match: resolves normally.
 * - Zero matches: fails with a "not installed" reason — the operator pinned a chip for a plugin
 *   that is not (or no longer) actually on disk for this workspace.
 * - More than one match: fails with an explicit ambiguity reason naming every matching digest.
 *   Silently picking one (e.g. the lexicographically-last, or "the newest") would be a WORSE
 *   failure mode than an explicit error — a wrong plugin's content would reach the agent, and
 *   nothing about the run would look wrong until someone noticed the agent's advice didn't match
 *   what was supposedly pinned. An explicit error is loud and immediately actionable instead.
 *
 * ---------------------------------------------------------------------------
 * What gets injected, and why not the whole 280K package
 * ---------------------------------------------------------------------------
 * Only the resolved plugin's own eponymous skill — `skills/<pluginRefId>/SKILL.md` (the skill
 * folder whose name equals the plugin's own id; for `ui-ux-design` specifically, this is real,
 * ~5.5KB content, not all seven of that plugin's skill folders). The reasoning mirrors
 * `capability-projection.ts`'s own "Skills get a real executable binding" rule: a Skill's markdown
 * IS the plugin's real, agent-facing content, while the rest of the package (references,
 * examples, scripts) is supporting material a plugin's own SKILL.md is written to point an agent
 * at when it needs more depth (the Agent Plugins spec's own convention every skill in this package
 * follows). Injecting the FULL package indiscriminately would balloon every run's prompt with
 * pages this specific task usually never needs. Every OTHER file in the resolved package is still
 * listed by absolute path — genuinely `Read`-able by the spawned CLI agent, which runs with real
 * filesystem access unlike a browser-facing preview — so nothing is unreachable, only deferred to
 * an explicit follow-up read.
 *
 * Architectural role:
 * Server-side only (reads `node:fs/promises`, imports `install.ts`'s `indexInstalledRoot`) — never
 * imported into a browser bundle. Returns a discriminated result rather than throwing, so
 * `agent-daemon-server.ts`'s `onStarted` gets one place to branch on success/failure without a
 * second try/catch layer duplicating this module's own error classification.
 */
import { readdir } from "node:fs/promises";
import path from "node:path";

import { indexInstalledRoot, type InstalledAgentPlugin } from "./install.js";
import { readInstalledSkillMarkdown } from "./capability-projection.js";
import { toAgentPluginSkillCapabilityId } from "./capability-id.js";
import type { AgentPluginWorkspaceLayout } from "./layout.js";

const SHA256_DIGEST_DIRNAME_PATTERN = /^[a-f0-9]{64}$/;

/**
 * How a pinned ref's content reaches the agent.
 *
 * - `inject` — the whole eponymous SKILL.md (~15KB for `ui-ux-design`) plus every other package file
 *   listed by absolute path, in the run's prompt prefix. Today's shipped behaviour, and the default.
 * - `pointer` — ~400 bytes naming the exact tool call that returns that SAME SKILL.md, and nothing
 *   else. The content is identical; only the delivery differs, which is what makes the two a
 *   controlled comparison rather than two different experiments.
 *
 * Selected per-process by `TOVU_AGENT_PLUGIN_DELIVERY`. This is a MEASUREMENT AFFORDANCE, not a
 * feature flag with a migration plan attached: §3.1 of the 2026-08-22 handoff cannot run arm 2
 * (pointer) and arm 3 (status quo) against one another if shipping one deletes the other, and the
 * whole point of that A/B is that nobody yet knows which wins. Whichever arm wins becomes the
 * unconditional behaviour and this union goes away.
 */
export type AgentPluginDeliveryMode = "inject" | "pointer";

const DEFAULT_DELIVERY_MODE: AgentPluginDeliveryMode = "inject";

/** Reads the delivery mode for this process. An unset or unrecognised value is `inject` — an A/B
 *  affordance must never be able to change production behaviour by typo. */
export function resolveAgentPluginDeliveryMode(
  env: { readonly TOVU_AGENT_PLUGIN_DELIVERY?: string | undefined } = process.env,
): AgentPluginDeliveryMode {
  return env.TOVU_AGENT_PLUGIN_DELIVERY === "pointer" ? "pointer" : DEFAULT_DELIVERY_MODE;
}

export type ResolveAgentPluginRefsResult =
  | { readonly ok: true; readonly promptPrefix: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Resolves every pinned `pluginRefId` into real on-disk text and joins the results into one
 * prompt-prefix block, in the order the refs were pinned.
 *
 * @param pluginRefIds - This run's pinned Agent Plugin ids (`run-start-context.ts`'s decoded
 *   `pluginRefIds` — already filtered to non-empty strings by that point). An empty array resolves
 *   to an empty prefix with no filesystem access at all — the common case (no plugin pinned).
 * @param workspaceLayout - This run's own workspace's Agent Plugin layout
 *   (`resolveAgentPluginLayout().forWorkspace(workspaceId)`), never a shared/instance-level one —
 *   see `layout.ts`'s own tenant-isolation header for why a workspace's installed packages must
 *   never be resolved against another workspace's tree.
 * @returns `{ ok: true, promptPrefix }` once every ref resolves, or the FIRST `{ ok: false, reason }`
 *   encountered — a run pinning two refs where the second is ambiguous still fails clearly, rather
 *   than partially augmenting the prompt with only the first ref's content.
 * @complexity O(r * d) where r is `pluginRefIds.length` and d is the number of installed digests in
 *   this workspace — each ref independently re-scans the (typically small) digest list, since a
 *   different ref may resolve to a different digest.
 */
export async function resolveAgentPluginRefs(
  pluginRefIds: readonly string[],
  workspaceLayout: Pick<AgentPluginWorkspaceLayout, "packages">,
  deliveryMode: AgentPluginDeliveryMode = resolveAgentPluginDeliveryMode(),
): Promise<ResolveAgentPluginRefsResult> {
  if (pluginRefIds.length === 0) return { ok: true, promptPrefix: "" };

  const sections: string[] = [];
  for (const pluginRefId of pluginRefIds) {
    const resolved = await resolveOnePluginRef(pluginRefId, workspaceLayout.packages, deliveryMode);
    if (!resolved.ok) return resolved;
    sections.push(resolved.section);
  }
  return { ok: true, promptPrefix: sections.join("\n\n") };
}

/** Every installed digest's `InstalledAgentPlugin`, indexed once per call to
 *  {@link resolveAgentPluginRefs} — one `readdir` plus one `indexInstalledRoot` walk per digest.
 *  Digest directory names that do not match the expected 64-hex-character shape are skipped rather
 *  than passed to `indexInstalledRoot` — `packages/sha256/` is not asserted empty of anything else
 *  a future tool might place there, and a non-digest entry is not this function's to interpret.
 *
 *  Exported (2026-08-22) for a second caller outside this module: `capability-source.ts`'s
 *  capability-catalog source needs the SAME per-digest walk (every installed digest, whichever
 *  skills each one carries) to produce one capability card per skill folder per digest — the exact
 *  shape this function already builds, just consumed differently than `resolveOnePluginRef`'s own
 *  "resolve one pinned ref" use below. Reusing this rather than re-walking `packages/sha256/*` a
 *  second, less-validated way keeps the digest-directory-name check and the per-digest failure
 *  isolation in exactly one place. */
export async function listInstalledPlugins(packagesDir: string): Promise<readonly InstalledAgentPlugin[]> {
  let entries: string[];
  try {
    entries = await readdir(packagesDir);
  } catch (error) {
    if (isEnoent(error)) return [];
    throw error;
  }

  const installed: InstalledAgentPlugin[] = [];
  for (const digest of entries) {
    if (!SHA256_DIGEST_DIRNAME_PATTERN.test(digest)) continue;
    try {
      installed.push(await indexInstalledRoot(path.join(packagesDir, digest), digest));
    } catch {
      // A digest directory that no longer indexes cleanly (a manifest that failed validation, a
      // package.json missing) is skipped, not fatal to every OTHER ref this run might resolve —
      // it simply cannot be a match for anything, the same as if it were absent.
    }
  }
  return installed;
}

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

/**
 * Resolves one `pluginRefId`, applying the zero/one/many-match rules described in this module's
 * own header.
 */
async function resolveOnePluginRef(
  pluginRefId: string,
  packagesDir: string,
  deliveryMode: AgentPluginDeliveryMode,
): Promise<{ readonly ok: true; readonly section: string } | { readonly ok: false; readonly reason: string }> {
  const installed = await listInstalledPlugins(packagesDir);
  const matches = installed.filter((plugin) => plugin.pluginId === pluginRefId);

  if (matches.length === 0) {
    return {
      ok: false,
      reason: `Agent Plugin '${pluginRefId}' is not installed in this workspace — pinned by the composer but not found under any installed package`,
    };
  }
  if (matches.length > 1) {
    const digests = matches.map((plugin) => plugin.archiveDigest).sort();
    return {
      ok: false,
      reason: `Agent Plugin '${pluginRefId}' matches ${matches.length} installed packages (digests: ${digests.join(", ")}) — refusing to guess which one to use`,
    };
  }

  const plugin = matches[0] as InstalledAgentPlugin;
  const skillPath = `skills/${pluginRefId}/SKILL.md`;

  if (deliveryMode === "pointer") return buildPointerSection(pluginRefId, plugin);

  let skillMarkdown: string;
  try {
    skillMarkdown = await readInstalledSkillMarkdown(plugin.packageRoot, skillPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: `Agent Plugin '${pluginRefId}' has no readable '${skillPath}' in its installed package: ${message}`,
    };
  }

  const otherFiles = plugin.files
    .filter((file) => file !== skillPath)
    .map((file) => path.join(plugin.packageRoot, file));

  // FRAMING IS LOAD-BEARING, not cosmetic. This header used to read "(open any of these directly if
  // the task needs more than the summary above)", which did two things that broke the feature in
  // practice: it called the injected SKILL.md a "summary", and it made the plugin's own reference
  // files conditional. This wrapper is the OUTER frame around the plugin's text, so where the two
  // disagree the wrapper wins — and `ui-ux-design`'s SKILL.md explicitly instructs the opposite
  // ("any request for visual quality loads the premium bundle up front ... Do not wait for the user
  // to name a source; they never will"). Measured on the real install, 2026-08-21: under the old
  // framing a live page-generation run read 0 of the 30 listed files and produced output identical
  // to the no-plugin control; told plainly to read them, the same run read exactly the 4 files that
  // SKILL.md names. Guarded by `resolve-agent-plugin-refs.unit.test.ts`'s inventory-framing test.
  const inventory = otherFiles.length > 0
    ? `\n\nThe SKILL.md above is this Agent Plugin's own instructions — follow them, including any files it directs you to load before starting work. Every other file in the installed package is listed below by absolute path and is readable now:\n${otherFiles.map((file) => `- ${file}`).join("\n")}`
    : "";

  return {
    ok: true,
    section: `<<AGENT_PLUGIN pluginId="${pluginRefId}">>\n${skillMarkdown}${inventory}\n<</AGENT_PLUGIN>>`,
  };
}

/**
 * `pointer` delivery — the ~400-byte replacement for the ~15KB `inject` section above.
 *
 * Three properties are load-bearing, each one bought with a measurement rather than reasoned from
 * first principles:
 *
 * 1. **It is mandatory, and says so.** The owner's framing is "the chip shouldn't inject anything, let
 *    the AI know what to look at" — right in substance, with one precision that must not be lost: this
 *    cannot inject NOTHING, because a tool can simply be ignored. The 2026-08-21 run read 0 of 30
 *    files listed as optional, and read exactly the 4 that SKILL.md named once the wrapper stopped
 *    hedging. Injection's one real virtue is that it is guaranteed; that virtue is kept here for the
 *    ~400 bytes and dropped for the 15KB.
 *
 * 2. **It names the bridge call, not just the tool.** `capability_get` is NOT in the spawned agent's
 *    tool namespace — measured live 2026-08-22 (`ADS-memory/reports/
 *    2026-08-22-capability-tools-first-live-run.md`): the agent reaches Tovu tools only through Jini's
 *    MCP proxy, and burned five discovery hops (`ToolSearch` x3, `search_tools`, `describe_tool` x2)
 *    locating that route on a prompt that named both tools explicitly and did nothing else. A pointer
 *    saying only "call capability_get" would name a tool that does not exist from the agent's side.
 *    The plain name is given FIRST and the proxied form second, so a Jini rename degrades this to the
 *    still-workable "search for it" case rather than to a call that hard-fails.
 *
 * 3. **The id is minted by the same function `capability-source.ts` mints cards with**
 *    (`capability-id.ts`), never a template string written twice — see that file's header for why a
 *    drift here would be the most expensive possible failure in this feature.
 *
 * Deliberately points at the plugin's own EPONYMOUS skill, exactly what `inject` sends, so arm 2 and
 * arm 3 of the A/B differ in delivery alone and not in content.
 */
function buildPointerSection(
  pluginRefId: string,
  plugin: InstalledAgentPlugin,
): { readonly ok: true; readonly section: string } | { readonly ok: false; readonly reason: string } {
  // Parity with `inject`'s own failure: a pinned ref whose eponymous skill is missing must fail
  // loudly in BOTH modes. Without this check `pointer` would happily emit a well-formed instruction
  // to fetch a card that `capability_search` can never return, and the run would look like the agent
  // disobeyed rather than like the pin being wrong.
  if (!plugin.skills.some((skill) => skill.name === pluginRefId)) {
    return {
      ok: false,
      reason: `Agent Plugin '${pluginRefId}' has no readable 'skills/${pluginRefId}/SKILL.md' in its installed package: no such skill folder`,
    };
  }

  const capabilityId = toAgentPluginSkillCapabilityId(pluginRefId, plugin.archiveDigest, pluginRefId);
  const body = [
    `MANDATORY — before you begin this task, make this one tool call and follow what it returns:`,
    ``,
    `  capability_get({ "id": "${capabilityId}" })`,
    ``,
    `If your tools are proxied, that call is:`,
    `  mcp__jini__execute_delegated_tool({ "toolId": "capability_get", "input": { "id": "${capabilityId}" } })`,
    ``,
    `What it returns is this Agent Plugin's own instructions — not a summary, and not background`,
    `material you may skip. Follow them, including any files they direct you to load, before you`,
    `start work.`,
  ].join("\n");

  return { ok: true, section: `<<AGENT_PLUGIN pluginId="${pluginRefId}">>\n${body}\n<</AGENT_PLUGIN>>` };
}
