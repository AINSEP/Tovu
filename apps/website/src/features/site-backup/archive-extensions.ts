import { createHash } from "node:crypto";
import { resolveThemeOriginalSource } from "#src/features/theme/index";
import { createTovuAgentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";
import { collectSiteBackupFiles, readPlannedFile, type PlannedDiskFile, type SiteBackupSources } from "./sources.js";
import type { ArchivePlugin } from "./archive-manifest.js";
import { runtimeToArchivePath } from "./archive-paths.js";
import { SiteShareRefusal } from "./share-policy.js";
import { PLUGIN_MANIFEST_FILENAMES } from "@jini-ai/plugins/host";

/** Selects installed package versions through the lifecycle owner; includes reset baselines.
 * @throws SiteShareRefusal for multiple workspaces, unsafe originals or stale planned files.
 * @complexity O(files × (themes + plugins) + package bytes), bounded by share caps.
 */
export async function prepareArchiveExtensions(required: { sources: SiteBackupSources; files: readonly PlannedDiskFile[] }, optional: { packageThemesRoot?: string } = {}): Promise<{ files: PlannedDiskFile[]; plugins: ArchivePlugin[] }> {
  const files = [...required.files];
  await includeThemeOriginals({ sources: required.sources, files }, optional);
  const workspaces = new Set(files.flatMap(file => /^agent-plugins\/ws\/([^/]+)\//.exec(file.path)?.[1] ?? []));
  if (workspaces.size > 1) throw new SiteShareRefusal({ code: "UNSUPPORTED_DATA", message: "Export requires a single plugin workspace." });
  const plugins: ArchivePlugin[] = [];
  let selected = files;
  const workspaceId = [...workspaces][0];
  if (workspaceId) {
    const lifecycle = createTovuAgentPluginLifecycle({ layout: required.sources.agentPlugins });
    const workspaceRoot = required.sources.agentPlugins.forWorkspace(workspaceId).root;
    const candidates = await lifecycle.listInstalledPlugins(workspaceRoot);
    const installed = lifecycle.preferBundledAgentPluginDigests(candidates, await lifecycle.readBundledAgentPluginDigests(workspaceRoot));
    if (new Set(installed.map(plugin => plugin.pluginId)).size !== installed.length) throw new SiteShareRefusal({ code: "UNSUPPORTED_PLUGIN", message: "Export requires one installed digest per plugin id." });
    const activations = await lifecycle.readAgentPluginActivations({ workspaceRoot });
    const supersededRoots = candidates.filter(candidate => !installed.includes(candidate)).map(plugin => plugin.packageRoot + "/");
    selected = files.filter(file => !supersededRoots.some(root => file.absPath.startsWith(root)));
    for (const plugin of installed) plugins.push({ kind: "agent", id: plugin.pluginId, version: plugin.version ?? "unknown", digest: plugin.archiveDigest, enabled: activations.plugins[plugin.pluginId]?.enabled ?? true, shipped: true });
  }
  plugins.push(...await unindexedAgentRecords({ files: selected, plugins }));
  plugins.push(...await sitePluginRecords({ files: selected }));
  return { files: selected.filter(file => runtimeToArchivePath({ path: file.path }) !== null), plugins };
}

async function includeThemeOriginals(required: { sources: SiteBackupSources; files: PlannedDiskFile[] }, optional: { packageThemesRoot?: string }): Promise<void> {
  const themes = required.files.filter(file => /^themes\/(static|declarative|code)\/[^/]+\/theme.json$/.test(file.path));
  for (const file of themes) {
    const [, tier, id] = file.path.split("/");
    const originalPrefix = `themes/__original-themes__/${tier}/${id}/`;
    if (required.files.some(file => file.path.startsWith(originalPrefix))) continue;
    const original = resolveThemeOriginalSource({ manifest: { tier: tier as "static", id: id! }, siteThemesRoot: required.sources.themesDir, packageThemesRoot: optional.packageThemesRoot });
    if (original) {
      const collected = await collectSiteBackupFiles({ sources: { ...required.sources, themesDir: original.originalDir }, include: { database: false, media: false, themes: true, plugins: false, settings: false } }, { profile: "share" });
      if (collected.skipped.length) throw new SiteShareRefusal({ code: "UNSAFE_FILE", message: `Cannot export theme original '${id}': ${collected.skipped[0]!.reason}.` });
      required.files.push(...collected.files.filter(file => file.path.startsWith("themes/")).map(file => ({ ...file, path: originalPrefix + file.path.slice("themes/".length) })));
    } else {
      // A theme without a recorded baseline still needs a recoverable original in v2.
      // Preserve its current snapshot as that baseline; never invent package content.
      const livePrefix = `themes/${tier}/${id}/`;
      required.files.push(...required.files.filter(file => file.path.startsWith(livePrefix)).map(file => ({ ...file, path: originalPrefix + file.path.slice(livePrefix.length) })));
    }
  }
}

async function sitePluginRecords({ files }: { files: readonly PlannedDiskFile[] }): Promise<ArchivePlugin[]> {
  const groups = new Map<string, PlannedDiskFile[]>();
  for (const file of files) {
    const mapped = runtimeToArchivePath({ path: file.path });
    const id = mapped && /^plugins\/([^/]+)\/package\//.exec(mapped)?.[1];
    if (id) { const group = groups.get(id) ?? []; group.push(file); groups.set(id, group); }
  }
  const plugins: ArchivePlugin[] = [];
  for (const [id, entries] of groups) {
    const digest = createHash("sha256");
    let version = "unknown";
    for (const file of entries) {
      const read = await readPlannedFile(file);
      if (!read.ok) throw new SiteShareRefusal({ code: "PLAN_STALE", message: read.message });
      digest.update(file.path).update(createHash("sha256").update(read.bytes).digest());
      version = sitePluginVersion({ file, bytes: read.bytes, id, current: version });
    }
    plugins.push({ kind: "site", id, version, digest: digest.digest("hex"), enabled: false, shipped: true });
  }
  return plugins;
}

/** Malformed/unindexed packages are still site content. Preserve their bytes, never infer trust. */
async function unindexedAgentRecords(required: { files: readonly PlannedDiskFile[]; plugins: readonly ArchivePlugin[] }): Promise<ArchivePlugin[]> {
  const known = new Map(required.plugins.map(plugin => [plugin.id, plugin.digest]));
  const extras: ArchivePlugin[] = [];
  for (const file of required.files) {
    const match = /^agent-plugins\/ws\/[^/]+\/([^/]+)\/package\/sha256\/([a-f0-9]{64})\//.exec(file.path);
    if (!match) continue;
    const [, id, digest] = match;
    const previous = known.get(id!);
    if (previous && previous !== digest) throw new SiteShareRefusal({ code: "UNSUPPORTED_PLUGIN", message: `Plugin '${id}' has multiple installed digests.` });
    if (!previous) {
      known.set(id!, digest!);
      extras.push({ kind: "agent", id: id!, version: "unknown", digest: digest!, enabled: false, shipped: true });
    }
  }
  return extras;
}

/** Only the package's own manifest names its version; nested example manifests do not. Jini lists exactly
 *  one manifest per package (the one discovery validated against its version folder). */
function sitePluginVersion(required: { file: PlannedDiskFile; bytes: Buffer; id: string; current: string }): string {
  if (!PLUGIN_MANIFEST_FILENAMES.some(name => required.file.path === `plugins/${required.id}/package/${name}`)) return required.current;
  return String(JSON.parse(required.bytes.toString("utf8")).version ?? "unknown");
}
