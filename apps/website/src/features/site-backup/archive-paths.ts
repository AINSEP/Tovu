import { SiteShareRefusal } from "./share-policy.js";
import { validateSharePath } from "./share-file-policy.js";

/** Pure ZIP-only mapping. The repository collector and Git backup retain their runtime layout. */
export function runtimeToArchivePath(required: { path: string }, _optional = {}): string | null {
  const file = required.path;
  if (/^themes\/(?:README\.md|\.preview-refresh\.json)$/.test(file)) return null;
  if (/^agent-plugins\/ws\/[^/]+\/(?:activations|bundled-digests)\.json$/.test(file)) return null;
  const original = /^themes\/__original-themes__\/[^/]+\/([^/]+)\/(.+)$/.exec(file);
  if (original) return `themes/__originals__/${original[1]}/${original[2]}`;
  const theme = /^themes\/(?:static|declarative|code)\/([^/]+)\/(.+)$/.exec(file);
  if (theme) return `themes/${theme[1]}/${theme[2]}`;
  if (file.startsWith("overrides/")) return "themes/" + file;
  return pluginArchivePath({ path: file });
}

function pluginArchivePath({ path: file }: { path: string }): string | null {
  const agent = /^agent-plugins\/ws\/[^/]+\/([^/]+)\/(?:package\/sha256\/[a-f0-9]{64}|(memory\/(?:notes|learned)))\/(.+)$/.exec(file);
  if (agent) return `agent-plugins/${agent[1]}/${agent[2] ?? "package"}/${agent[3]}`;
  const versionedSite = /^plugins\/([^/]+)\/\d+\.\d+(?:\.[^/]+)?\/(.+)$/.exec(file);
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
  if (file.startsWith("themes/overrides/")) return file.slice("themes/".length);
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
  const skill = /^(skills\/(?:ws\/[^/]+\/)?[^/]+)\//.exec(required.path)?.[1];
  return skill ?? /^(agent-plugins\/[^/]+|plugins\/[^/]+)\//.exec(required.path)?.[1];
}

/** Retain the existing package scanner's proof: known bundled digest AND exact local file hash. */
export function archiveSecretScanPath(required: { path: string; plugins: readonly import("./archive-manifest.js").ArchivePlugin[] }, _optional = {}): string {
  const match = /^(agent-plugins|plugins)\/([^/]+)\/package\/(.+)$/.exec(required.path);
  if (!match) return required.path;
  const kind = match[1] === "agent-plugins" ? "agent" : "site";
  const plugin = required.plugins.find(plugin => plugin.kind === kind && plugin.id === match[2]);
  return `agent-plugins/ws/archive/${match[2]}/package/sha256/${plugin?.digest ?? "0".repeat(64)}/${match[3]}`;
}

function sitePluginArchivePath(required: { id: string; relative: string }): string {
  const area = /^memory\/(?:notes|learned)\//.test(required.relative) ? "" : "package/";
  return `plugins/${required.id}/${area}${required.relative}`;
}

/** One warning per edited unit; multiple edited files must not duplicate notices. */
export function editedArchiveWarnings(required: { units: Iterable<string> }, _optional = {}): string[] {
  const labels: Record<string, string> = { themes: "Theme", "agent-plugins": "Agent plugin", plugins: "Plugin", skills: "Skill" };
  return [...new Set(required.units)].sort().map(unit => {
    const parts = unit.split("/"), kind = parts[0], id = parts.at(-1);
    return `${labels[kind!] ?? "Extension"} '${id}' was edited. It was imported and kept switched off.`;
  });
}
