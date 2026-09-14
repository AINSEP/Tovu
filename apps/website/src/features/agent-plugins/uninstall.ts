/**
 * @file `uninstallAgentPlugin()` — permanently removes one workspace's installed Agent Plugin: its
 * on-disk package(s) under `packages/sha256/*` for this `pluginId`, then its activation record.
 * `previewAgentPluginUninstall()` runs the same refusals without removing anything.
 *
 * `features/plugin-runtime/uninstall.ts` already has this exact feature for the OTHER plugin family
 * (`.tovu-plugin` site/runtime plugins) — this is "the same feature, one family over", mirroring its
 * shape: the same `<Domain>NotFoundError`/`<Domain>NotUninstallableError` pair, thrown for the same
 * two reasons (unknown id; nothing an operator can actually remove). Two deliberate divergences from
 * that file, both because the underlying mechanics genuinely differ, not by oversight:
 *
 * 1. **No third `PluginEnabledError`-equivalent precondition.** Plugin-runtime refuses to uninstall a
 *    plugin that is enabled in ANY workspace, because its on-disk artifact is INSTANCE-WIDE — shared
 *    across every workspace via one `installDir` — so removing it while a DIFFERENT workspace still
 *    has it enabled would silently break that workspace's runtime. Agent Plugins have no such
 *    hazard: `layout.ts`'s own header (owner decision, tenant-grade isolation, 2026-08-12) states
 *    plainly that each workspace gets its own `ws/<workspaceId>/packages/sha256/` tree, and "Uninstall
 *    is `rm -rf ws/<workspaceId>/packages/sha256/<digest>/`, full stop" — there is no OTHER workspace
 *    for this operation to endanger. Whether the CALLING workspace has this plugin currently enabled
 *    is not gated on either: disabling first buys no safety here (unlike plugin-runtime, disabling
 *    would not protect anyone else's runtime), and gating on it would only add friction with no
 *    corresponding risk removed.
 *
 * 2. **Bundled is refused as UNINSTALLABLE, not as NOT-FOUND — and for a different reason than
 *    plugin-runtime's built-ins.** Plugin-runtime's `PluginNotUninstallableError` covers a `"built-in"`
 *    discovery record that was never written to `installDir` at all — there is nothing on disk to
 *    remove. A bundled Agent Plugin is NOT that case: `seed-bundled.ts` genuinely extracts it onto
 *    disk at boot, so it IS `listInstalledPlugins`-visible and this function's own "not found" check
 *    would pass. The refusal here is about PERMANENCE, not presence: `recordBundledAgentPluginIfAbsent`
 *    re-seeds both the package and its (absent-record-only) disabled activation entry on every boot
 *    (`activation.ts`'s header), so deleting the files now would appear to succeed and then silently
 *    reappear on the next restart — a worse outcome than refusing outright, because it would look like
 *    uninstall lied. `AgentPluginNotUninstallableError`'s message says this plainly and names the
 *    levers that DO work: `plugins_set_enabled` with family `agent-plugin` (the assistant's own tool
 *    since a1abe2bb, so the model can act on the refusal itself) or the Agent Plugins admin screen's
 *    switch. Either one turns a bundled plugin off, even though nothing can make Tovu stop shipping it.
 *
 * ---------------------------------------------------------------------------
 * Preview, then uninstall — both run the refusals
 * ---------------------------------------------------------------------------
 * `agent_plugins_uninstall` asks a human before it removes anything. A refusal has to come back
 * BEFORE that dialog, or a human is asked to confirm something that cannot happen, so the tool calls
 * `previewAgentPluginUninstall()` first. The preview carries only what a dialog may show (id,
 * versions, digests) — never `packageRoot`, which is a host path. After the answer the tool calls
 * `uninstallAgentPlugin()`, which runs both refusals again against the disk as it is then: the
 * dialog can stay open for minutes.
 *
 * ---------------------------------------------------------------------------
 * Tombstone vs. delete on the activation record — DELETE, settled
 * ---------------------------------------------------------------------------
 * See `activation.ts`'s `deleteAgentPluginActivation()` for the mechanism; the decision itself
 * belongs here, next to the only call site that makes it. A tombstone (leaving `enabled: false` on
 * disk after the bytes are gone) would invert `activation.ts`'s own stated rule — "absent means
 * active, because an operator's own install IS the consent" — the moment this same plugin id is ever
 * reinstalled: the fresh install would inherit a stale disabled flag about bytes that no longer exist,
 * which is a worse UX than starting over. Deleting the record makes a future reinstall of this id
 * begin exactly where a first-ever install begins.
 *
 * ---------------------------------------------------------------------------
 * Why this module resolves its own workspace layout, rather than accepting one
 * ---------------------------------------------------------------------------
 * Same SECURITY discipline `install.ts`'s `InstallAgentPluginRequired.layout` documents in full: this
 * takes the INSTANCE-level `AgentPluginLayout` plus one `workspaceId`, and calls
 * `layout.forWorkspace(workspaceId)` itself, exactly once per call, so the packages directory it scans
 * and the activation file it edits can never come from two different, hand-stitched sources that
 * quietly disagree about which workspace they belong to.
 *
 * ---------------------------------------------------------------------------
 * Why removal isn't a plain `fs.rm(recursive)`
 * ---------------------------------------------------------------------------
 * `install.ts`'s `freezeTree` chmods every published package directory to `0o555` (no write bit) —
 * that's what makes the package genuinely read-only after install. A plain recursive `rm` on a frozen
 * tree fails EACCES trying to unlink/rmdir inside it (the same fact `__tests__/fixtures/force-remove.ts`
 * exists to work around in tests). `removeFrozenPackageTree` below is that same "restore write
 * permission, then remove" logic as real production code — this is the first production caller that
 * ever needs to remove a package root that install-time freezing already made.
 */
import { chmod, readdir, rm } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import { deleteAgentPluginActivation, readAgentPluginActivations } from "./activation.js";
import type { InstalledAgentPlugin } from "./install.js";
import type { AgentPluginLayout } from "./layout.js";
import { listInstalledPlugins } from "./resolve-agent-plugin-refs.js";

/** The plugin id has no installed package on disk for this workspace. */
export class AgentPluginNotFoundError extends Error {}

/** The plugin is bundled with Tovu — see this file's header for why that is permanent, not merely
 *  "nothing to remove". */
export class AgentPluginNotUninstallableError extends Error {}

export interface UninstallAgentPluginRequired {
  readonly layout: AgentPluginLayout;
  readonly workspaceId: string;
  readonly pluginId: string;
}

export type UninstallAgentPluginOptional = {};

export interface UninstallAgentPluginResult {
  readonly pluginId: string;
  /** Every installed archive digest removed for this plugin id — normally exactly one. All matching
   *  digests are removed: uninstall's job is to make the plugin genuinely gone, so unlike the tool
   *  loader, which must pick ONE to serve, there is no "which one" question here. */
  readonly removedDigests: readonly string[];
}

/** What an uninstall of one plugin would remove, in a form safe to show a human: no host path. */
export interface AgentPluginUninstallPreview {
  readonly pluginId: string;
  /** Distinct manifest versions across the matching digests; empty when none declares one. */
  readonly versions: readonly string[];
  readonly archiveDigests: readonly string[];
}

/** The refusals both entry points share, plus what removal needs. Internal: `matches` carries host
 *  paths (`packageRoot`) and must not reach a preview. */
interface UninstallTargets {
  readonly workspaceRoot: string;
  readonly matches: readonly InstalledAgentPlugin[];
}

/**
 * Reports what uninstalling `pluginId` would remove, without removing anything.
 *
 * @throws {AgentPluginNotFoundError} No installed package for `pluginId` exists in this workspace.
 * @throws {AgentPluginNotUninstallableError} The plugin's activation record has `origin: "bundled"`.
 * @complexity O(d) in this workspace's installed-digest count (one `listInstalledPlugins` walk).
 */
export async function previewAgentPluginUninstall(required: UninstallAgentPluginRequired): Promise<AgentPluginUninstallPreview> {
  const { matches } = await resolveUninstallTargets(required);
  const versions = [...new Set(matches.flatMap((plugin) => (plugin.version === undefined ? [] : [plugin.version])))];
  return { pluginId: required.pluginId, versions, archiveDigests: matches.map((plugin) => plugin.archiveDigest) };
}

/**
 * Uninstalls one workspace's installed Agent Plugin: removes every installed archive digest for
 * `pluginId` under this workspace's own `packages/sha256/`, then deletes its activation record.
 *
 * @throws {AgentPluginNotFoundError} No installed package for `pluginId` exists in this workspace.
 * @throws {AgentPluginNotUninstallableError} The plugin's activation record has `origin: "bundled"`.
 * @complexity O(d) in this workspace's installed-digest count (one `listInstalledPlugins` walk) plus
 * O(f) in the total file count under the matching digest(s) being removed.
 */
export async function uninstallAgentPlugin(
  required: UninstallAgentPluginRequired,
  _optional: UninstallAgentPluginOptional = {},
): Promise<UninstallAgentPluginResult> {
  const { workspaceRoot, matches } = await resolveUninstallTargets(required);

  const removedDigests: string[] = [];
  for (const plugin of matches) {
    await removeFrozenPackageTree(plugin.packageRoot);
    removedDigests.push(plugin.archiveDigest);
  }

  // Files first, activation record second: if the removal above throws, no activation state has
  // been touched yet, matching plugin-runtime's own "files-first" ordering rationale (uninstall.ts's
  // header there) for the identical reason — a failed attempt leaves state exactly as it was.
  await deleteAgentPluginActivation({ workspaceRoot, pluginId: required.pluginId });

  return { pluginId: required.pluginId, removedDigests };
}

/**
 * Finds `pluginId`'s installed digests in this workspace and applies both refusals.
 *
 * @throws {AgentPluginNotFoundError} No match on disk.
 * @throws {AgentPluginNotUninstallableError} The activation record says `origin: "bundled"`.
 * @complexity O(d) in the installed-digest count.
 */
async function resolveUninstallTargets(required: UninstallAgentPluginRequired): Promise<UninstallTargets> {
  const { layout, workspaceId, pluginId } = required;

  // The one call that turns (instance layout, workspaceId) into real, internally-consistent
  // packages/root paths — see this file's header, "Why this module resolves its own workspace
  // layout". `forWorkspace` itself still throws for a syntactically invalid `workspaceId`.
  const workspaceLayout = layout.forWorkspace(workspaceId);

  const installed = await listInstalledPlugins(workspaceLayout.packages);
  const matches = installed.filter((plugin) => plugin.pluginId === pluginId);
  if (matches.length === 0) {
    throw new AgentPluginNotFoundError(`Agent Plugin '${pluginId}' is not installed in this workspace — nothing to uninstall`);
  }

  const activations = await readAgentPluginActivations(workspaceLayout.root);
  if (activations.plugins[pluginId]?.origin === "bundled") {
    throw new AgentPluginNotUninstallableError(bundledRefusalMessage(pluginId));
  }

  return { workspaceRoot: workspaceLayout.root, matches };
}

/** Names the levers that do work for a bundled plugin — see this file's header, item 2. */
function bundledRefusalMessage(pluginId: string): string {
  return (
    `Agent Plugin '${pluginId}' is bundled with Tovu and cannot be uninstalled — it is re-seeded on every boot ` +
    "(seed-bundled.ts), so removing its files now would silently reappear on the next restart. To stop it being " +
    `used, disable it instead: call plugins_set_enabled with family 'agent-plugin', pluginId '${pluginId}', ` +
    "enabled false (disabling needs no confirmation), or turn it off from the Agent Plugins admin screen."
  );
}

/**
 * Restores write permission through `root`'s whole tree, then removes it — the production
 * counterpart of `__tests__/fixtures/force-remove.ts` (that file's own header explains why a plain
 * recursive `rm` cannot work here: `install.ts`'s `freezeTree` leaves every directory `0o555`).
 * Deliberately not shared code with that test fixture: the fixture is intentionally test-only and
 * this is the first production need for the same operation, not a refactor opportunity forced by it.
 *
 * @complexity O(f) in the file/directory count under `root`.
 */
async function removeFrozenPackageTree(root: string): Promise<void> {
  await makeTreeWritable(root);
  await rm(root, { recursive: true, force: true });
}

async function makeTreeWritable(dir: string): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  await chmod(dir, 0o700).catch(() => undefined);
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await makeTreeWritable(absolute);
    } else {
      await chmod(absolute, 0o600).catch(() => undefined);
    }
  }
}
