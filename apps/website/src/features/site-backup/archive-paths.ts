import { SiteShareRefusal } from "./share-policy.js";
import { validateSharePath, PLUGIN_VERSION_FOLDER, SHARED_PLUGIN_MEMORY } from "./share-file-policy.js";

/**
 * Archive folder for the site's theme overrides. A theme id cannot hold `_` (`__originals__` relies on
 * the same rule), so a theme named `overrides` keeps `themes/overrides/` and never meets this namespace.
 */
const OVERRIDES_ARCHIVE_PREFIX = "themes/__overrides__/";
/** The code unit every override file belongs to, on both the archive and the staged side. */
export const OVERRIDES_UNIT = "themes/__overrides__";

/** Pure ZIP-only mapping. The repository collector and Git backup retain their runtime layout. */
export function runtimeToArchivePath(required: { path: string }, _optional = {}): string | null {
  const file = required.path;
  if (/^themes\/(?:README\.md|\.preview-refresh\.json)$/.test(file)) return null;
  if (/^agent-plugins\/ws\/[^/]+\/(?:activations|bundled-digests)\.json$/.test(file)) return null;
  const original = /^themes\/__original-themes__\/[^/]+\/([^/]+)\/(.+)$/.exec(file);
  if (original) return `themes/__originals__/${original[1]}/${original[2]}`;
  const theme = /^themes\/(?:static|declarative|code)\/([^/]+)\/(.+)$/.exec(file);
  if (theme) return `themes/${theme[1]}/${theme[2]}`;
  if (file.startsWith("overrides/")) return OVERRIDES_ARCHIVE_PREFIX + file.slice("overrides/".length);
  // Skills live per workspace (`skills/ws/<ws>/<skill>`); the archive keeps only the skill folder.
  const skill = /^skills\/ws\/[^/]+\/(.+)$/.exec(file);
  if (skill) return "skills/" + skill[1];
  return pluginArchivePath({ path: file });
}

const AGENT_PLUGIN_FILE = new RegExp(String.raw`^agent-plugins\/ws\/[^/]+\/([^/]+)\/(?:package\/sha256\/[a-f0-9]{64}|(${SHARED_PLUGIN_MEMORY}))\/(.+)$`);
const VERSIONED_SITE_PLUGIN_FILE = new RegExp(String.raw`^plugins\/([^/]+)\/${PLUGIN_VERSION_FOLDER}\/(.+)$`);
const SHARED_MEMORY_FILE = new RegExp(String.raw`^${SHARED_PLUGIN_MEMORY}\/`);

function pluginArchivePath({ path: file }: { path: string }): string | null {
  const agent = AGENT_PLUGIN_FILE.exec(file);
  if (agent) return `agent-plugins/${agent[1]}/${agent[2] ?? "package"}/${agent[3]}`;
  const versionedSite = VERSIONED_SITE_PLUGIN_FILE.exec(file);
  if (versionedSite) return sitePluginArchivePath({ id: versionedSite[1]!, relative: versionedSite[2]! });
  const site = /^plugins\/(?:static|declarative|code)\/([^/]+)\/(.+)$/.exec(file);
  if (site) return `plugins/${site[1]}/package/${site[2]}`;
  if (/^plugins\/[^/]+\/(?:package|memory)\//.test(file)) return file;
  if (/^plugins\/[^/]+\//.test(file)) return file.replace(/^(plugins\/[^/]+)\//, "$1/package/");
  if (file.startsWith("agent-plugins/")) throw new SiteShareRefusal({ code: "UNSUPPORTED_PLUGIN", message: `Cannot flatten plugin path '${file}'. Update its installed layout before export.` });
  return file;
}

/** Restore a theme's tier from its own manifest; unknown/executable trees remain quarantine candidates. */
export function archiveToRuntimePath(required: { path: string; files: ReadonlyMap<string, Buffer> }, _optional = {}): string {
  const file = required.path;
  if (file.startsWith(OVERRIDES_ARCHIVE_PREFIX)) return "overrides/" + file.slice(OVERRIDES_ARCHIVE_PREFIX.length);
  const theme = /^themes\/(?:(__originals__)\/)?([^/]+)\/(.+)$/.exec(file);
  if (!theme) return file;
  const prefix = theme[1] ? "themes/__originals__/" : "themes/";
  let tier = "untrusted";
  try {
    const manifest = JSON.parse(required.files.get(`${prefix}${theme[2]}/theme.json`)!.toString("utf8"));
    if (["static", "declarative", "code"].includes(manifest.tier)) tier = manifest.tier;
  } catch { /* A malformed/missing manifest preserves the whole theme in quarantine. */ }
  const result = `themes/${theme[1] ? "__original-themes__/" : ""}${tier}/${theme[2]}/${theme[3]}`;
  validateSharePath({ path: result });
  return result;
}

/** Unit that must stay off when any of its bytes were edited; originals share the live theme's identity. */
export function archiveCodeUnit(required: { path: string }, _optional = {}): string | undefined {
  const theme = /^themes\/(?:__originals__\/)?([^/]+)\//.exec(required.path);
  if (theme) return "themes/" + theme[1];
  return /^(skills\/[^/]+|agent-plugins\/[^/]+|plugins\/[^/]+)\//.exec(required.path)?.[1];
}

/** Retain the existing package scanner's proof: known bundled digest AND exact local file hash.
 * Only an AGENT package maps into the content-addressed root. A site plugin's archive path is already
 * its runtime path (`plugins/<id>/package/...`), so it keeps the ordinary name rules export applies:
 * mapping it there let import accept `mcp.json` and credential-named files that export refuses. */
export function archiveSecretScanPath(required: { path: string; plugins: readonly import("./archive-manifest.js").ArchivePlugin[] }, _optional = {}): string {
  const match = /^agent-plugins\/([^/]+)\/package\/(.+)$/.exec(required.path);
  if (!match) return required.path;
  const plugin = required.plugins.find(plugin => plugin.kind === "agent" && plugin.id === match[1]);
  return `agent-plugins/ws/archive/${match[1]}/package/sha256/${plugin?.digest ?? "0".repeat(64)}/${match[2]}`;
}

function sitePluginArchivePath(required: { id: string; relative: string }): string {
  const area = SHARED_MEMORY_FILE.test(required.relative) ? "" : "package/";
  return `plugins/${required.id}/${area}${required.relative}`;
}

const UNIT_LABELS: Record<string, string> = { themes: "Theme", "agent-plugins": "Agent plugin", plugins: "Plugin", skills: "Skill" };
function unitLabel(unit: string): string {
  const parts = unit.split("/");
  return `${UNIT_LABELS[parts[0]!] ?? "Extension"} '${parts.at(-1)}'`;
}

/** One warning per edited unit; multiple edited files must not duplicate notices. */
export function editedArchiveWarnings(required: { units: Iterable<string> }, _optional = {}): string[] {
  return [...new Set(required.units)].sort().map(unit => `${unitLabel(unit)} was edited. It was imported and kept switched off.`);
}

/** One warning per unit this install does not recognise as its own code, so it landed switched off. */
export function keptOffArchiveWarnings(required: { units: Iterable<string> }, _optional = {}): string[] {
  return [...new Set(required.units)].sort().map(unit => unit === OVERRIDES_UNIT
    ? "Theme overrides aren't code this Tovu recognises. They were imported and kept switched off."
    : `${unitLabel(unit)} isn't code this Tovu recognises. It was imported and kept switched off.`);
}
