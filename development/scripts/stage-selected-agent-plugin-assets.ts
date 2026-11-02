/** Tovu host-bundle preparation only; Jini still owns installation, activation and digests. */
import { execFileSync } from 'node:child_process';
import * as filesystem from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

type StagingFilesystem = Pick<typeof filesystem,
  'copyFileSync' | 'existsSync' | 'lstatSync' | 'mkdirSync' | 'mkdtempSync' | 'readFileSync' |
  'readdirSync' | 'realpathSync' | 'renameSync' | 'rmSync'>;
type PackageFilesPort = (required: { packageRoot: string }) => readonly string[];
type RunNodePort = (required: { args: string[]; cwd: string }) => string;

/** Ask npm for its publication file list without running prepack, building, or accessing the registry.
 * @throws Missing npm entrypoint, subprocess failures or invalid npm JSON.
 * @complexity npm owns the package walk; one bounded subprocess and O(f) file-list memory.
 * @example listAgentPluginPackageFiles({ packageRoot }, { npmCli });
 */
export function listAgentPluginPackageFiles(
  { packageRoot }: { packageRoot: string },
  { npmCli = process.env.npm_execpath, runNode = ({ args, cwd }) => execFileSync(process.execPath, args, {
    cwd, encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024,
  }) }: { npmCli?: string; runNode?: RunNodePort } = {},
): readonly string[] {
  if (!npmCli) throw new Error('Run agent asset staging through npm or supply its npmCli JavaScript entrypoint.');
  const output = runNode({ cwd: packageRoot, args: [npmCli, 'pack', '--dry-run', '--json', '--offline', '--ignore-scripts', '--workspaces=false'] });
  const [packed] = JSON.parse(output) as { files: { path: string }[] }[];
  return packed!.files.map(file => file.path);
}

/** Refuse traversal and platform-dependent npm paths before joining anything to a source or target.
 * @throws On absolute paths, backslashes, empty segments or traversal. O(d) for d path segments.
 */
function assertNpmPath({ filename }: { filename: string }): void {
  if (path.posix.isAbsolute(filename) || filename.includes('\\') || filename.includes(':') ||
      filename.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`Unsafe npm payload path: ${filename}`);
  }
}

/** `@scope/name/sub/path` -> `@scope/name`, `name/sub` -> `name`: the npm package a specifier lives in.
 * @complexity O(s) for specifier length. */
function barePackageName({ specifier }: { specifier: string }): string {
  return specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/');
}

/** The real folder of the nearest `package.json` above `manifestPath` that is named `packageName`.
 * Walks up instead of resolving `<package>/package.json`: `@jini-ai/agent-plugins` ships every plugin as
 * a subpath (`@jini-ai/agent-plugins/<id>`) and does not export its `package.json`.
 * @throws When no such ancestor exists. @complexity O(d) for d ancestor folders.
 */
function packageRootOf({ manifestPath, packageName, fs }: { manifestPath: string; packageName: string; fs: StagingFilesystem }): string {
  for (let dir = path.dirname(manifestPath); ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'package.json');
    if (fs.existsSync(candidate) && (JSON.parse(fs.readFileSync(candidate, 'utf8')) as { name?: unknown }).name === packageName) return fs.realpathSync(dir);
    if (path.dirname(dir) === dir) throw new Error(`No package.json named ${packageName} above ${manifestPath}`);
  }
}

/** One npm listing per package root: every selected subpath of `@jini-ai/agent-plugins` shares one.
 * @complexity O(1) per repeated root after the first listing. */
function listOncePerRoot({ listPackageFiles }: { listPackageFiles: PackageFilesPort }): PackageFilesPort {
  const listings = new Map<string, readonly string[]>();
  return ({ packageRoot }) => {
    const cached = listings.get(packageRoot);
    if (cached) return cached;
    const files = listPackageFiles({ packageRoot });
    listings.set(packageRoot, files);
    return files;
  };
}

/** Stage one installed package's exported payload; npm, rather than host exclusion rules, selects files.
 * `packageName` is a package (`./plugin.json` export) or a subpath (`@jini-ai/agent-plugins/<id>`, whose
 * `<id>/plugin.json` the package's `./<id>/*` export serves).
 * @throws On missing/unpublished manifests, duplicate IDs, links, or native filesystem failures.
 * @complexity O(f log f + b) for f listed files and b copied bytes, O(f) selection memory.
 */
function copySelectedPackage(
  { packageName, resolve, staging, ids, fs, listPackageFiles }: {
    packageName: string; resolve: (name: string) => string; staging: string; ids: Set<string>;
    fs: StagingFilesystem; listPackageFiles: PackageFilesPort;
  },
): void {
  const manifestPath = resolve(`${packageName}/plugin.json`);
  const packageRoot = packageRootOf({ manifestPath, packageName: barePackageName({ specifier: packageName }), fs });
  const manifestRelative = path.relative(packageRoot, manifestPath).split(path.sep).join('/');
  assertNpmPath({ filename: manifestRelative });
  const payloadPrefix = path.posix.dirname(manifestRelative) + '/';
  if (payloadPrefix === './') throw new Error('Agent payload manifest must live beneath its npm package root.');
  const filenames = [...new Set(listPackageFiles({ packageRoot }))].sort();
  for (const filename of filenames) assertNpmPath({ filename });
  if (!filenames.includes(manifestRelative)) throw new Error(`Agent manifest is absent from npm payload: ${packageName}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { name: string };
  if (typeof manifest.name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.name)) throw new Error(`Unsafe agent plugin identity: ${manifest.name}`);
  if (ids.has(manifest.name)) throw new Error(`Duplicate selected agent plugin identity: ${manifest.name}`);
  ids.add(manifest.name);
  for (const filename of filenames.filter(filename => filename.startsWith(payloadPrefix))) {
    const source = path.join(packageRoot, filename);
    if (!fs.lstatSync(source).isFile() || fs.realpathSync(source) !== source) throw new Error(`Agent payload must be a regular file without symlinks: ${filename}`);
    const target = path.join(staging, manifest.name, filename.slice(payloadPrefix.length));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

/** Capture exact relative names and bytes, including unexpected uploaded files, without following links.
 * @throws On links, special entries or I/O failures. O(e + b) I/O, O(e log e) sorting, O(e + b) memory.
 */
function snapshot({ root, fs }: { root: string; fs: StagingFilesystem }): [string, Buffer][] {
  if (!fs.lstatSync(root).isDirectory()) throw new Error(`Preserved staging output is not a regular directory: ${root}`);
  const files: [string, Buffer][] = [];
  for (const relative of fs.readdirSync(root, { recursive: true, encoding: 'utf8' }).sort()) {
    const filename = path.join(root, relative);
    const stat = fs.lstatSync(filename);
    if (stat.isDirectory()) continue;
    if (!stat.isFile()) throw new Error(`Preserved staging output contains a non-regular entry: ${filename}`);
    files.push([relative, fs.readFileSync(filename)]);
  }
  return files;
}

/**
 * Materialize only explicitly chosen installed agent packages into a separate bundled-source tree.
 * Existing differing output is preserved and rejected, so callers cannot select uploaded/edited copies
 * as the chosen npm payload. Use a fresh outputRoot for a changed selection or package version.
 * This never installs or activates plugins, or reconciles content/agent-plugins/ui-ux-design wording.
 * @param required Host resolution root, explicit package or subpath names (empty selects none), dedicated output root.
 * @param optional Filesystem, npm listing and subprocess ports; no package-manager lifecycle scripts run.
 * @returns A source root for the existing seeder and sorted plugin IDs, only after the complete tree is ready.
 * @throws Resolution, npm, unsafe source, copy failures, or a conflicting existing output. No old tree is removed.
 * @complexity O(e log e + b) time and O(e + b) memory for selected/existing entries and bytes; one npm query per package.
 * @example stageSelectedAgentPluginAssets({ repoRoot, packageNames: ['@jini-ai/agent-plugins/ui-ux-design'], outputRoot });
 */
export function stageSelectedAgentPluginAssets(
  { repoRoot, packageNames, outputRoot }: { repoRoot: string; packageNames: readonly string[]; outputRoot: string },
  { filesystem: fs = filesystem, npmCli, runNode, listPackageFiles = input => listAgentPluginPackageFiles(input, { npmCli, runNode }) }: {
    filesystem?: StagingFilesystem; npmCli?: string; runNode?: RunNodePort; listPackageFiles?: PackageFilesPort;
  } = {},
): { sourceRoot: string; pluginIds: string[] } {
  const resolve = createRequire(path.join(repoRoot, 'package.json')).resolve;
  fs.mkdirSync(path.dirname(outputRoot), { recursive: true });
  const staging = fs.mkdtempSync(path.join(path.dirname(outputRoot), '.agent-assets-'));
  const ids = new Set<string>();
  const listOnce = listOncePerRoot({ listPackageFiles });
  try {
    for (const packageName of [...new Set(packageNames)].sort()) copySelectedPackage({ packageName, resolve, staging, ids, fs, listPackageFiles: listOnce });
    if (fs.existsSync(outputRoot)) {
      if (!isDeepStrictEqual(snapshot({ root: staging, fs }), snapshot({ root: outputRoot, fs }))) {
        throw new Error(`Preserved agent asset output differs from selected npm payload: ${outputRoot}`);
      }
    } else {
      fs.renameSync(staging, outputRoot);
    }
    return { sourceRoot: outputRoot, pluginIds: [...ids].sort() };
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}
