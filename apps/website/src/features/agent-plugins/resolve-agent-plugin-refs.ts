/**
 * @file Resolves a run's pinned Agent Plugin refs (`pluginRefIds` — `run-start-context.ts`'s
 * decoded `contextRef` field, itself sourced from the composer's `pluginRefId` chips,
 * `composer-capabilities.ts`'s own doc) into the real prompt-prefix text `agent-daemon-server.ts`'s
 * `onStarted` prepends to the run's prompt.
 *
 * ---------------------------------------------------------------------------
 * The activation-record gap this function works around (KNOWN GAP, not silently papered over)
 * ---------------------------------------------------------------------------
 * PARTIALLY CLOSED, 2026-08-26. `activation.ts` now records, per workspace, whether a plugin id is
 * ENABLED — and this function refuses a pinned ref for a disabled one before it resolves anything.
 * What that record deliberately does NOT carry is which installed DIGEST is current for a plugin id.
 * For a BUNDLED plugin, `bundled-digests.ts`'s ledger now answers that (2026-09-18): the boot seeder
 * records which digest the running build published, so a workspace holding an upgraded plugin's old
 * and new package is no longer ambiguous — the build's own record names the winner. For every other
 * plugin id, closing this needs the operator-facing upgrade/pin flow (and, alongside it, the
 * admission gate for MCP servers `capability-projection.ts`'s own header names) and remains a
 * separate, later decision.
 *
 * So this function still scans every digest this workspace has ever installed under
 * `packages/sha256/*` and matches on the installed `plugin.json`'s own `name` field, after dropping
 * any digest of a bundled plugin the ledger records as superseded:
 *
 * - Exactly one match: resolves normally.
 * - Zero matches: fails with a "not installed" reason — the operator pinned a chip for a plugin
 *   that is not (or no longer) actually on disk for this workspace.
 * - More than one match: fails with an explicit ambiguity reason naming every matching digest.
 *   Silently picking one (e.g. the lexicographically-last, or "the newest") would be a WORSE
 *   failure mode than an explicit error — a wrong plugin's content would reach the agent, and
 *   nothing about the run would look wrong until someone noticed the agent's advice didn't match
 *   what was supposedly pinned. An explicit error is loud and immediately actionable instead. That
 *   refusal is UNCHANGED and still the default: the ledger narrows a plugin id only when the build
 *   itself published one of the installed digests, which is authority rather than a guess, and it
 *   has no say at all over packages an operator installed (`bundled-digests.ts`, consequence 1).
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
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { resolveAgentPluginActivation, type AgentPluginActivationVerdict } from "./activation.js";
import { preferBundledAgentPluginDigests, readBundledAgentPluginDigests, type BundledAgentPluginDigests } from "./bundled-digests.js";
import { indexInstalledRoot, type InstalledAgentPlugin } from "./install.js";
import { readInstalledSkillMarkdown } from "./capability-projection.js";
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
  workspaceLayout: Pick<AgentPluginWorkspaceLayout, "packages" | "root">,
  deliveryMode: AgentPluginDeliveryMode = resolveAgentPluginDeliveryMode(),
): Promise<ResolveAgentPluginRefsResult> {
  if (pluginRefIds.length === 0) return { ok: true, promptPrefix: "" };

  // Read ONCE for the whole call, not per ref: it is one small file, and every ref resolves against
  // the same workspace's ledger. See `bundled-digests.ts` for why this can only ever RESOLVE an
  // ambiguity below, never create one.
  const bundledDigests = await readBundledAgentPluginDigests(workspaceLayout.root);

  const sections: string[] = [];
  for (const pluginRefId of pluginRefIds) {
    // ACTIVATION GATE (2026-08-26; strict per ref since 2026-09-16, t91 F1.1b) — the third and last
    // surface (see `activation.ts`). One small file read per pinned ref: refs are few, and the
    // fail-CLOSED `resolveAgentPluginActivation` (the same reader the per-call tool gate uses)
    // refuses on a corrupt/unreadable file instead of reading it as "nothing recorded" — injecting a
    // plugin's guidance SPENDS it exactly like a tool call, so this surface must refuse rather than
    // read a fault as consent.
    const refusal = activationRefusal(pluginRefId, await resolveAgentPluginActivation(workspaceLayout.root, pluginRefId));
    if (refusal !== undefined) return { ok: false, reason: refusal };

    const resolved = await resolveOnePluginRef(pluginRefId, workspaceLayout.packages, deliveryMode, bundledDigests);
    if (!resolved.ok) return resolved;
    sections.push(resolved.section);
  }
  return { ok: true, promptPrefix: sections.join("\n\n") };
}

/** The run-start refusal for one ref's activation verdict, or `undefined` when it may be injected.
 *  @complexity O(1). */
function activationRefusal(pluginRefId: string, verdict: AgentPluginActivationVerdict): string | undefined {
  if (verdict.verdict === "active") return undefined;
  if (verdict.verdict === "undetermined") {
    return (
      `Agent Plugin '${pluginRefId}' was not loaded: this workspace's activation record could not be read, so whether ` +
      `it is enabled cannot be confirmed (${verdict.reason}). Nothing was injected; repair activations.json and start the run again.`
    );
  }
  // A distinct reason from "not installed", because the operator's remedy is different: the bytes
  // ARE here and the fix is to enable the plugin, not to install it. Telling them to install
  // something already present is the kind of wrong-but-plausible error message that costs an
  // afternoon.
  return (
    `Agent Plugin '${pluginRefId}' is installed in this workspace but is not enabled — it ships with Tovu and ` +
    "stays inactive until an operator turns it on. Enable it before pinning it to a run."
  );
}

/** Every installed digest's `InstalledAgentPlugin`, indexed once per call to
 *  {@link resolveAgentPluginRefs} — one `readdir` plus one `indexInstalledRoot` walk per digest.
 *  Digest directory names that do not match the expected 64-hex-character shape are skipped rather
 *  than passed to `indexInstalledRoot` — `packages/sha256/` is not asserted empty of anything else
 *  a future tool might place there, and a non-digest entry is not this function's to interpret.
 *
 *  Exported for a second caller outside this module: `tool-registrations.ts`'s
 *  `loadInstalledAgentPluginToolSources` needs the SAME per-digest walk (every installed digest,
 *  whichever skills each one carries) to build one `agent_plugin_<pluginId>` tool per installed
 *  plugin — the exact shape this function already builds, just consumed differently than
 *  `resolveOnePluginRef`'s own "resolve one pinned ref" use below. (A third caller,
 *  `capability-source.ts`'s now-removed capability-catalog source, used this the same way from
 *  2026-08-22 until it was removed 2026-08-26 — see
 *  `ADS-memory/knowledge/2026-08-26-removed-capability-search.md`.) Reusing this rather than
 *  re-walking `packages/sha256/*` a second, less-validated way keeps the digest-directory-name check
 *  and the per-digest failure isolation in exactly one place. */
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

/**
 * Whether one installed archive digest still has its package directory under `packagesDir` — the
 * cheap, per-call "is this still installed" signal `tool-registrations.ts`'s tool gate needs.
 *
 * Lives here, beside {@link listInstalledPlugins}, because it must agree with that walk about two
 * things a second implementation would eventually get wrong: that an installed package root IS
 * `<packagesDir>/<digest>` and nothing else, and that a directory name is only a digest when it
 * matches the 64-hex shape. It deliberately does NOT re-index the package (`indexInstalledRoot`
 * reads and validates a manifest, which is far too much per tool call): directory presence is
 * exactly what `uninstall.ts` removes, and it removes it by `rename` BEFORE it touches the
 * activation record, so the gate observes a removal at least as early as it observes the record's
 * deletion, never later.
 *
 * Follows symlinks (plain `stat`, not `lstat`) on purpose — `listInstalledPlugins` does too, so a
 * deployment whose digest directory is a symlink registers a tool that this would otherwise refuse
 * to authorize.
 *
 * @returns `false` for a digest that does not match the installed-directory grammar, for a missing
 * directory, for a non-directory at that path, and for ANY filesystem fault — every answer this
 * cannot establish positively is `false`, because its one caller uses it to authorize.
 * @complexity One `stat`.
 */
export async function isInstalledDigestPresent(packagesDir: string, archiveDigest: string): Promise<boolean> {
  if (!SHA256_DIGEST_DIRNAME_PATTERN.test(archiveDigest)) return false;
  try {
    return (await stat(path.join(packagesDir, archiveDigest))).isDirectory();
  } catch {
    return false;
  }
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
  bundledDigests: BundledAgentPluginDigests,
): Promise<{ readonly ok: true; readonly section: string } | { readonly ok: false; readonly reason: string }> {
  // Superseded installs of a BUNDLED plugin are dropped here — by the build's own recorded answer,
  // never by picking one. Every id the ledger has no authority over reaches the many-match refusal
  // below exactly as it always did.
  const installed = preferBundledAgentPluginDigests(await listInstalledPlugins(packagesDir), bundledDigests);
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

/** `agent_plugin_<pluginId>` (hyphens folded to underscores) — the id
 *  `features/agent-plugins/tool-registrations.ts`'s own `toAgentPluginToolId` mints for the same
 *  plugin, duplicated here as a one-line transform rather than imported: that function is private to
 *  a sibling module this file must not reach into (mirrors this codebase's own precedent for
 *  `humanize()`, duplicated three times across `capability-projection.ts` /
 *  (the now-removed) `capability-source.ts` / `tool-registrations.ts`, each with the same "private
 *  formatting helper of a sibling module" reasoning). If the two ever drift, `resolve-agent-plugin-
 *  refs.unit.test.ts`'s pointer-mode tests assert against the REAL installed tool id, not this
 *  template, so a drift fails loudly there. */
function toAgentPluginToolId(pluginId: string): string {
  return `agent_plugin_${pluginId.replace(/-/g, "_")}`;
}

/**
 * `pointer` delivery — the ~400-byte replacement for the ~15KB `inject` section above.
 *
 * Two properties are load-bearing, each one bought with a measurement rather than reasoned from
 * first principles:
 *
 * 1. **It is mandatory, and says so.** The owner's framing is "the chip shouldn't inject anything, let
 *    the AI know what to look at" — right in substance, with one precision that must not be lost: this
 *    cannot inject NOTHING, because a tool can simply be ignored. The 2026-08-21 run read 0 of 30
 *    files listed as optional, and read exactly the 4 that SKILL.md named once the wrapper stopped
 *    hedging. Injection's one real virtue is that it is guaranteed; that virtue is kept here for the
 *    ~400 bytes and dropped for the 15KB.
 *
 * 2. **It names the bridge call, not just the tool.** Neither `agent_plugin_<pluginId>` nor its
 *    now-removed predecessor `capability_get` is in the spawned agent's own tool namespace —
 *    measured live 2026-08-22 (`ADS-memory/reports/2026-08-22-capability-tools-first-live-run.md`):
 *    the agent reaches Tovu tools only through Jini's MCP proxy, and burned five discovery hops
 *    (`ToolSearch` x3, `search_tools`, `describe_tool` x2) locating that route on a prompt that
 *    named both tools explicitly and did nothing else. A pointer saying only "call
 *    agent_plugin_<pluginId>" would name a tool that does not exist from the agent's side. The
 *    plain name is given FIRST and the proxied form second, so a Jini rename degrades this to the
 *    still-workable "search for it" case rather than to a call that hard-fails.
 *
 * REDIRECTED 2026-08-26 (owner call, `ADS-memory/knowledge/2026-08-26-removed-capability-search.md`):
 * this used to name `capability_get({ "id": <capability-id.ts's card id> })`. That tool pair is gone;
 * `agent_plugin_<pluginId>` called with NO argument already returns exactly the same content — the
 * plugin's own eponymous skill (`tool-registrations.ts`'s `loadInstalledAgentPluginToolSources`
 * documents that default) — so the redirect changes delivery, never content. The eponymous-skill
 * existence check below is unchanged from before this redirect: it is what makes "no argument"
 * exactly correct rather than a guess.
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
  // whose no-argument default resolves to some OTHER (alphabetically-first) skill instead of the one
  // the pin actually named, and the run would look like the agent disobeyed rather than like the pin
  // being wrong.
  if (!plugin.skills.some((skill) => skill.name === pluginRefId)) {
    return {
      ok: false,
      reason: `Agent Plugin '${pluginRefId}' has no readable 'skills/${pluginRefId}/SKILL.md' in its installed package: no such skill folder`,
    };
  }

  const toolId = toAgentPluginToolId(pluginRefId);
  const body = [
    `MANDATORY — before you begin this task, make this one tool call and follow what it returns:`,
    ``,
    `  ${toolId}({})`,
    ``,
    `If your tools are proxied, that call is:`,
    `  mcp__jini__execute_delegated_tool({ "toolId": "${toolId}", "input": {} })`,
    ``,
    `Called with no argument, it returns this Agent Plugin's own instructions — not a summary, and`,
    `not background material you may skip. Follow them, including any files they direct you to load,`,
    `before you start work.`,
  ].join("\n");

  return { ok: true, section: `<<AGENT_PLUGIN pluginId="${pluginRefId}">>\n${body}\n<</AGENT_PLUGIN>>` };
}
