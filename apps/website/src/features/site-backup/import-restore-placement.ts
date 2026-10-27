import fs from "node:fs";
import path from "node:path";
import { validateSharePath } from "./share-file-policy.js";
import { checkSourceDirContainment } from "#src/features/theme/validation/structure";
import { loadTheme } from "#src/features/theme/theme";

/**
 * @file Where each staged import file may land: the live site, or the unserved
 * `.import-quarantine/` tree. Untrusted extensions never enter a discovery/activation root.
 */

/** Theme ids (`<tier>/<name>`) to quarantine, and each compiled theme's authored-source prefix. */
export interface ThemeManifestFindings {
  readonly quarantinedThemes: ReadonlySet<string>;
  readonly compiledSources: ReadonlyMap<string, string>;
}

type ThemeManifestVerdict = { kind: "plain" } | { kind: "quarantine" } | { kind: "compiled"; sourcePrefix: string };
/** The manifest's `build` exactly as staged; its fields are re-checked before use. */
type CompiledBuild = Parameters<typeof checkSourceDirContainment>[0]["build"];
const PLAIN: ThemeManifestVerdict = { kind: "plain" };
const QUARANTINE: ThemeManifestVerdict = { kind: "quarantine" };

const THEME_MANIFEST = /^themes\/((?:__original-themes__\/)?(?:static|declarative))\/([^/]+)\/theme.json$/;
const THEME_FILE = /^themes\/((?:__original-themes__\/)?(?:static|declarative))\/([^/]+)\/(.+)$/;
const THEME_ID = /^themes\/((?:__original-themes__\/)?(?:static|declarative)\/[^/]+)\//;
const STATIC_ASSET = /\.(?:html?|css|m?js|json|webmanifest|xml|liquid|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|txt|md|mp4|webm|pdf)$/i;

/**
 * Reads every staged static/declarative `theme.json`: a tier that disagrees with its folder, an
 * unreadable manifest, or an unsafe/invalid compiled build quarantines the theme.
 * @complexity O(themes × theme validation).
 */
export function inspectThemeManifests(required: { root: string; files: readonly string[] }): ThemeManifestFindings {
  const quarantinedThemes = new Set<string>();
  const compiledSources = new Map<string, string>();
  for (const file of required.files) {
    const match = THEME_MANIFEST.exec(file);
    if (!match) continue;
    const id = match[1] + "/" + match[2];
    const verdict = inspectThemeManifest({ root: required.root, file, tier: match[1]!, name: match[2]! });
    if (verdict.kind === "quarantine") quarantinedThemes.add(id);
    if (verdict.kind === "compiled") compiledSources.set(id, verdict.sourcePrefix);
  }
  return { quarantinedThemes, compiledSources };
}

function inspectThemeManifest(required: { root: string; file: string; tier: string; name: string }): ThemeManifestVerdict {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(required.root, required.file), "utf8"));
    if (manifest.tier !== required.tier.split("/").at(-1)) return QUARANTINE;
    if (manifest.build?.source !== "compiled") return PLAIN;
    return inspectCompiledTheme({ root: required.root, id: required.tier + "/" + required.name, name: required.name, manifest });
  } catch { return QUARANTINE; }
}

/** @throws whatever the share path policy or theme loader throws; the caller quarantines on it. */
function inspectCompiledTheme(required: { root: string; id: string; name: string; manifest: { tier: unknown; build: CompiledBuild } }): ThemeManifestVerdict {
  const { build } = required.manifest;
  if (required.manifest.tier !== "static" || typeof build.sourceDir !== "string" || checkSourceDirContainment({ build, schemaVersion: 2 }).length) return QUARANTINE;
  // A trailing '/' is an empty segment, so this refusal also guarantees `sourcePrefix` below.
  validateSharePath({ path: build.sourceDir });
  // The theme owner treats compiled output as static, never as a server code tier. Reuse its
  // artifact validation; preserve authored build source ONLY in the quarantine tree.
  const theme = loadTheme({ themeDir: path.join(required.root, "themes", required.id), id: required.name, source: "site" });
  if (theme.status === "invalid") return QUARANTINE;
  return { kind: "compiled", sourcePrefix: "themes/" + required.id + "/" + build.sourceDir + "/" };
}

/**
 * Every staged theme tree that may go live: all its files are supported static assets (compiled
 * source excepted) and its manifest was not quarantined.
 * @complexity O(files).
 */
export function liveThemeTrees(required: { files: readonly string[]; findings: ThemeManifestFindings }): Set<string> {
  const live = new Set<string>();
  const quarantined = new Set(required.findings.quarantinedThemes);
  for (const file of required.files) {
    const match = THEME_FILE.exec(file);
    if (!match) continue;
    const id = match[1] + "/" + match[2];
    live.add(id);
    if (isCompiledSource({ file, theme: id, compiledSources: required.findings.compiledSources })) continue;
    // Browser JS is an ordinary static asset, unlike TS/JS modules in a code theme. The whole
    // tree is quarantined if it includes build source or declares a different executable tier.
    if (!STATIC_ASSET.test(match[3]!)) quarantined.add(id);
  }
  for (const id of quarantined) live.delete(id);
  return live;
}

function isCompiledSource(required: { file: string; theme: string; compiledSources: ReadonlyMap<string, string> }): boolean {
  const prefix = required.compiledSources.get(required.theme);
  return prefix !== undefined && required.file.startsWith(prefix);
}

/**
 * The site-relative destination of one staged file, or `null` when it is never restored.
 * Uploads and live theme files keep their path; everything else lands under `.import-quarantine/`.
 */
export function restoreDestination(required: { file: string; liveThemes: ReadonlySet<string>; compiledSources: ReadonlyMap<string, string> }): string | null {
  const { file } = required;
  if (file === "settings.json") return null; // Init regenerates host config and fresh identity.
  if (file.startsWith("uploads/")) return file;
  const theme = THEME_ID.exec(file)?.[1];
  const live = theme !== undefined && required.liveThemes.has(theme) && !isCompiledSource({ file, theme, compiledSources: required.compiledSources });
  return live ? file : ".import-quarantine/" + file;
}

/** Private roots plus exclusive files prevent extraction through pre-existing links or aliases.
 * @param optional.validatePath the share path policy; injectable only so the containment guard
 *   behind it can be proven on its own.
 */
export function writeExclusive(required: { root: string; relative: string; bytes: Buffer }, optional: { validatePath?: (required: { path: string }) => void } = {}): void {
  (optional.validatePath ?? validateSharePath)({ path: required.relative });
  const target = path.resolve(required.root, required.relative);
  if (!target.startsWith(path.resolve(required.root) + path.sep)) throw new Error("Import path escaped staging");
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, required.bytes, { flag: "wx", mode: 0o600 });
}
