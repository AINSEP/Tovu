/**
 * @file The orchestration half of `scripts/stage-payload.ts`: every precondition, staging step,
 * post-condition and summary line of assembling `apps/desktop/staging/tovu-payload/` — see that
 * script's header for WHY the payload ships, what ships, and its provenance.
 *
 * The filesystem, the effectful staging steps from `./stage-payload-lib.ts`
 * (each already tested on its own there), the environment, the host and the output stream are all
 * injected ports; the script binds the real ones. Every refusal is a thrown
 * {@link StagePayloadError} carrying the exact message the CLI prints after `stage-payload: `, so the
 * script's only job left is to print it and exit 1.
 */
import type * as nodeFs from "node:fs";
import path from "node:path";
import { orFallbackSync } from "@jini-ai/core/errors/idioms";

import type { assertDistImportsDeclared } from "./dist-import-check.ts";
import { shellStalenessFailure } from "./shell-staleness.ts";
import type { StalenessShell } from "./shell-staleness.ts";
import { isExcluded, resolveTargets } from "./stage-payload-lib.ts";
import type * as lib from "./stage-payload-lib.ts";

/** A refusal to stage; `message` is printed verbatim after `stage-payload: `. */
export class StagePayloadError extends Error {}

/** One `dist/runtime-manifest.json`, as far as staging reads it — see {@link readRuntimeManifest}. */
interface RuntimeManifest {
  cliEntry: string;
}

/** One `STAGED_SHELLS` entry. `sourceDirs`/`sourceFiles` stay optional to match the defensive
 *  `?? []` reads in {@link failIfShellIsStale}. */
interface ShellEntry extends StalenessShell {
  sourceDirs?: string[];
  sourceFiles?: string[];
  /** Files besides `marker` the server needs from this build; a dist missing one is refused. */
  requiredFiles?: string[];
  /** Plain-words consequence of a missing `requiredFiles` entry, for the refusal message. */
  missingMeans?: string;
}

/** The `node:fs` surface staging uses — the real module at the composition edge. */
type StageFs = Pick<typeof nodeFs, "cpSync" | "existsSync" | "lstatSync" | "mkdirSync" | "readdirSync" | "readFileSync" | "realpathSync" | "rmSync" | "statSync" | "unlinkSync">;

/** The effectful staging steps, each defined and tested in `./stage-payload-lib.ts` / `./dist-import-check.ts`. */
interface StageSteps {
  declaredDependencies: typeof lib.declaredDependencies;
  stagePayloadFiles: typeof lib.stagePayloadFiles;
  stageDir: typeof lib.stageDir;
  stageTransitiveDependencies: typeof lib.stageTransitiveDependencies;
  stripNonRuntimeFiles: typeof lib.stripNonRuntimeFiles;
  pruneNativePrebuilds: typeof lib.pruneNativePrebuilds;
  assertClosureComplete: typeof lib.assertClosureComplete;
  assertDistImportsDeclared: typeof assertDistImportsDeclared;
  stageBundledNpm: typeof lib.stageBundledNpm;
  ensurePtyHelpersExecutable: typeof lib.ensurePtyHelpersExecutable;
  diskBytes: typeof lib.diskBytes;
  newestMtime: typeof lib.newestMtime;
}

/** Everything {@link runStagePayload} touches outside its own arguments. */
interface StagePorts {
  fs: StageFs;
  steps: StageSteps;
  shells: readonly ShellEntry[];
  env: NodeJS.ProcessEnv;
  host: { execPath: string; platform: string; arch: string };
  stdout: { write(text: string): unknown };
}

/** The repo-derived locations every step reads or writes. */
interface StageLayout {
  repoRoot: string;
  desktopDir: string;
  outDir: string;
}

function fail({ message }: { message: string }, _options = {}): never {
  throw new StagePayloadError(message);
}

const megabytes = ({ bytes }: { bytes: number }, _options = {}) => (bytes / 1048576).toFixed(1);
const readJson = ({ fs, file }: { fs: StageFs; file: string }, _options = {}) => JSON.parse(fs.readFileSync(file, "utf8"));

/** Runtime workspaces retain their checkout ownership; unrelated Jini siblings are never roots. */
function runtimeWorkspaces({ repoRoot }: StageLayout, { fs }: StagePorts): string[] {
  const packagesDir = path.join(repoRoot, "packages");
  return fs.readdirSync(packagesDir)
    .map((entry) => path.join(packagesDir, entry))
    .filter((directory) => fs.existsSync(path.join(directory, "package.json")));
}

/** The server may import declared runtime dependencies and the host's runtime workspaces. */
function declaredRuntimePackages({ layout, ports }: { layout: StageLayout; ports: StagePorts }, _options = {}): Set<string> {
  const workspaces = runtimeWorkspaces(layout, ports)
    .map((directory) => readJson({ fs: ports.fs, file: path.join(directory, "package.json") }).name as string);
  return new Set([...ports.steps.declaredDependencies({ packageDir: layout.repoRoot }), ...workspaces]);
}

/**
 * Stage only Tovu's runtime workspaces themselves, without their local dependency links.
 * Jini packages are reached through declared edges by the existing transitive dependency walker:
 * their pnpm symlink farms cannot ship or be copied wholesale into the payload.
 * @returns Real workspace roots, which seed the declared closure alongside the root manifest.
 * @complexity O(workspace files copied); sibling platform packages are never enumerated.
 */
function stageWorkspacePackages({ layout, ports }: { layout: StageLayout; ports: StagePorts }, _options = {}): string[] {
  const { fs, steps } = ports;
  return runtimeWorkspaces(layout, ports).map((source) => {
    const name = readJson({ fs, file: path.join(source, "package.json") }).name as string;
    steps.stageDir({ src: source, dest: path.join(layout.outDir, "node_modules", name), dropNestedModules: true });
    return fs.realpathSync(source);
  });
}

/**
 * Copy declared roots, preserving installed nested versions for ordinary npm packages.
 * Linked workspaces omit their pnpm symlink farms: their declared edges are staged separately.
 * @returns Source roots for the existing closure walker and the count actually copied.
 * @throws {StagePayloadError} when a required root is missing.
 * @complexity O(files in declared packages); never scans the Jini sibling directory.
 */
function stageRuntimePackages({ layout, ports }: { layout: StageLayout; ports: StagePorts }, _options = {}): { roots: string[]; count: number } {
  const { fs, steps } = ports;
  const roots = stageWorkspacePackages({ layout, ports });
  let count = roots.length;
  for (const name of steps.declaredDependencies({ packageDir: layout.repoRoot })) {
    if (isExcluded({ name })) continue;
    const source = path.join(layout.repoRoot, "node_modules", name);
    if (!fs.existsSync(source)) fail({ message: `Unresolved runtime dependency: ${layout.repoRoot} -> ${name}` });
    const linked = fs.lstatSync(source).isSymbolicLink();
    roots.push(fs.realpathSync(source));
    // An npm root is copied WITH its nested node_modules, so those nested versions already ship in
    // place. They are roots too: otherwise the closure walker tries to flatten them to the top level,
    // where a different version lives — @modelcontextprotocol/sdk's own express 5 next to the site's
    // express 4 failed every 0.1.26 build ("Package version conflict while flattening express").
    if (!linked) roots.push(...nestedPackageRoots({ packageDir: source, fs }));
    const destination = path.join(layout.outDir, "node_modules", name);
    if (fs.existsSync(destination)) continue;
    steps.stageDir({ src: source, dest: destination, dropNestedModules: linked });
    count += 1;
  }
  return { roots, count };
}

/** Real directories of every package nested under `packageDir/node_modules`, at any depth.
 *  @complexity O(nested packages). */
function nestedPackageRoots({ packageDir, fs }: { packageDir: string; fs: StageFs }, _options = {}): string[] {
  const modules = path.join(packageDir, "node_modules");
  if (!fs.existsSync(modules)) return [];
  return fs.readdirSync(modules)
    .filter((entry) => !entry.startsWith("."))
    .flatMap((entry) => entry.startsWith("@")
      ? fs.readdirSync(path.join(modules, entry)).map((scoped) => path.join(modules, entry, scoped))
      : [path.join(modules, entry)])
    .filter((directory) => fs.existsSync(path.join(directory, "package.json")))
    .flatMap((directory) => [fs.realpathSync(directory), ...nestedPackageRoots({ packageDir: directory, fs })]);
}

/** Replace one symlink with a dereferenced copy of what it points at; a dangling link is dropped.
 *  Unlink/copy failures propagate; the target is never removed.
 *  @returns 1 when replaced, 0 when the link dangled.
 *  @complexity O(entries copied), with filesystem-managed copy buffers. */
function materializeLink({ fs, full }: { fs: StageFs; full: string }, _options = {}): number {
  // Node 24.2's native rmSync follows links during its type check: directory links throw EISDIR,
  // and dangling links are left behind. Unlink the known symlink itself on both Node 22 and 24.
  const target = orFallbackSync({ work: () => fs.realpathSync(full), fallback: undefined, step: "Resolve staged symlink" });
  if (target === undefined) {
    fs.unlinkSync(full);
    return 0;
  }
  // Remove the link itself: Node 24.2's rmSync follows directory links and ignores dangling ones.
  // The destination must be absent so copying cannot merge into or write through the link.
  fs.unlinkSync(full);
  fs.cpSync(target, full, { recursive: true, dereference: true });
  return 1;
}

/**
 * Replace every symlink in the staged tree with the real thing it points at.
 *
 * `cpSync`'s `dereference` only dereferences links whose target lies inside the subtree being
 * copied. A link pointing OUT of it (npm's `.bin/node-which -> ../which/bin/…`) is recreated as a
 * symlink to the resolved ABSOLUTE path — so a developer-machine path ends up inside the bundle.
 * `codesign --verify --deep --strict` rejects that outright ("invalid destination for symbolic link
 * in bundle"), and on any other machine it would simply dangle.
 */
function materializeSymlinks({ fs, dir }: { fs: StageFs; dir: string }, _options = {}): number {
  let replaced = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) replaced += materializeLink({ fs, full });
    // Re-stat rather than trusting the dirent: an entry just materialized from a link to a
    // directory needs walking too, in case its own contents carried links outward.
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) replaced += materializeSymlinks({ fs, dir: full });
  }
  return replaced;
}

function assertNoSymlinks({ fs, dir }: { fs: StageFs; dir: string }, _options = {}): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) fail({ message: `staged tree still contains a symlink after materialization: ${full}` });
    if (entry.isDirectory()) assertNoSymlinks({ fs, dir: full });
  }
}

/**
 * `dist/runtime-manifest.json` is the root build's own output (`emit-dist-package-json.mjs`, derived
 * from the root `package.json`'s `bin.tovu`) — read here rather than assuming the conventional
 * `dist/src/cli/main.js`, since that literal is exactly what broke once already when `src/` was
 * renamed (2026-08-27 restructure).
 */
function readRuntimeManifest({ fs, dir, repoRoot }: { fs: StageFs; dir: string; repoRoot: string }, _options = {}): RuntimeManifest {
  const manifestPath = path.join(dir, "dist", "runtime-manifest.json");
  if (!fs.existsSync(manifestPath)) {
    fail({ message: `no ${manifestPath}. Run \`npm run build\` at ${repoRoot} first.` });
  }
  const manifest = readJson({ fs, file: manifestPath });
  if (typeof manifest.cliEntry !== "string") fail({ message: `${manifestPath} has no "cliEntry" string field.` });
  return manifest;
}

/**
 * The shell resolves the CLI through `resolveCliEntry`, which reads `<payloadRoot>/package.json`'s
 * `bin.tovu` — so that manifest has to be staged, and it has to agree with the `cliEntry` the build
 * recorded. Two independently-derived paths that are allowed to disagree are exactly the failure
 * `runtime-manifest.json` was introduced to prevent, so assert they match instead of picking one.
 */
function assertCliEntryAgreement({ fs, repoRoot, manifest }: { fs: StageFs; repoRoot: string; manifest: RuntimeManifest }, _options = {}): void {
  const binEntry = readJson({ fs, file: path.join(repoRoot, "package.json") }).bin?.tovu;
  if (binEntry !== manifest.cliEntry) {
    fail({ message: `the root package.json's bin.tovu ("${binEntry}") and dist/runtime-manifest.json's cliEntry ("${manifest.cliEntry}") disagree. Re-run \`npm run build\`.` });
  }
}

/** Count `.sql` migrations on both sides — a stale `dist/` is the single likeliest reason a
 *  packaged app rejects a site with `SITE_NEWER_THAN_RUNTIME`, and it is invisible otherwise. */
function countMigrations({ fs, dir }: { fs: StageFs; dir: string }, _options = {}): number {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((entry) => entry.endsWith(".sql")).length : 0;
}

function failIfDistIsStale({ layout, ports: { fs } }: { layout: StageLayout; ports: StagePorts }, _options = {}): void {
  const source = countMigrations({ fs, dir: path.join(layout.repoRoot, "apps", "website", "src", "platform", "db", "drizzle") });
  const built = countMigrations({ fs, dir: path.join(layout.outDir, "dist", "src", "platform", "db", "drizzle") });
  if (built < source) {
    fail(
      { message: `the staged dist/ carries ${built} migrations but source has ${source}. This payload is built ` +
        `from a stale dist/ and will reject any site created from current source with ` +
        `SITE_NEWER_THAN_RUNTIME. Re-run \`npm run build\` at the repo root for a shippable payload.` }
    );
  }
}

/**
 * Refuse a shell whose build output is OLDER than its own source. The comparison itself lives in
 * `./shell-staleness.ts` (and is tested there, against the real 2026-09-12 incident); this
 * function is only the filesystem half.
 *
 * BEHAVIOUR CHANGE, deliberately: anyone packaging from a checkout whose shells are behind their
 * source now hits a HARD STOP where they previously got a shipped-but-wrong artifact.
 *
 * mtime is the floor, not the ceiling. A build-provenance record (git HEAD sha plus a dirty flag,
 * written at build time and asserted here) would be stricter — but a matching `head_sha` is NOT
 * proof of freshness if the build came from a dirty tree, so such a record must carry the dirty
 * flag and staging must refuse a dirty-built payload. Otherwise it becomes another
 * green-for-the-wrong-reason check, which is the failure class this guard exists to end.
 *
 * @complexity O(n) in source files under the shell's own tree.
 */
function failIfShellIsStale(
  { repoRoot, shell, steps }: { repoRoot: string; shell: ShellEntry; steps: StageSteps },
  _options = {},
): void {
  const builtAt = steps.newestMtime({ abs: path.join(repoRoot, shell.relative, shell.marker) });
  let sourceAt = 0;
  for (const dir of shell.sourceDirs ?? []) sourceAt = Math.max(sourceAt, steps.newestMtime({ abs: path.join(repoRoot, dir) }));
  for (const file of shell.sourceFiles ?? []) sourceAt = Math.max(sourceAt, steps.newestMtime({ abs: path.join(repoRoot, file) }));

  const failure = shellStalenessFailure({ builtAt, sourceAt, shell });
  if (failure) fail({ message: failure });
}

/** Refuse a shell build that has its marker but lacks another file the server needs. */
function failIfShellIsIncomplete(repoRoot: string, shell: ShellEntry, { fs }: StagePorts): void {
  const dir = path.join(repoRoot, shell.relative);
  const missing = (shell.requiredFiles ?? []).find((name) => !fs.existsSync(path.join(dir, name)));
  if (missing === undefined) return;
  const consequence = shell.missingMeans ? `, so ${shell.missingMeans}` : "";
  fail({ message: `the built shell at ${dir} is incomplete: ${missing} is missing${consequence}. Run \`${shell.buildWith}\` at ${repoRoot} first.` });
}

/** Refuse a shell build that has its marker but lacks another file the server needs. */
function failIfShellIsIncomplete(repoRoot: string, shell: ShellEntry, { fs }: StagePorts): void {
  const dir = path.join(repoRoot, shell.relative);
  const missing = (shell.requiredFiles ?? []).find((name) => !fs.existsSync(path.join(dir, name)));
  if (missing === undefined) return;
  const consequence = shell.missingMeans ? `, so ${shell.missingMeans}` : "";
  fail(`the built shell at ${dir} is incomplete: ${missing} is missing${consequence}. Run \`${shell.buildWith}\` at ${repoRoot} first.`);
}

/** Every check that must pass before anything under `staging/` is touched. */
function assertSourcePreconditions({ layout, ports }: { layout: StageLayout; ports: StagePorts }, _options = {}): RuntimeManifest {
  const { fs } = ports;
  const manifest = readRuntimeManifest({ fs, dir: layout.repoRoot, repoRoot: layout.repoRoot });
  assertCliEntryAgreement({ fs, repoRoot: layout.repoRoot, manifest });
  if (!fs.existsSync(path.join(layout.repoRoot, manifest.cliEntry))) {
    fail({ message: `no built Tovu CLI at ${path.join(layout.repoRoot, manifest.cliEntry)} (from runtime-manifest.json's cliEntry). Run \`npm run build\` at ${layout.repoRoot} first.` });
  }
  /**
   * The admin and site-chat SPAs are SEPARATE builds from `dist/`: the root `npm run build` compiles
   * the server only. So a checkout that builds cleanly can still have neither shell, and a build made
   * from it produces an app whose every site tab answers `/admin` and `/site-chat` with a 503 — a
   * failure that first shows up after packaging, signing and notarizing. Refusing to stage is the
   * cheap end of that.
   */
  for (const shell of ports.shells) {
    if (!fs.existsSync(path.join(layout.repoRoot, shell.relative, shell.marker))) {
      fail({ message: `no built shell at ${path.join(layout.repoRoot, shell.relative, shell.marker)}. Run \`${shell.buildWith}\` at ${layout.repoRoot} first.` });
    }
    failIfShellIsIncomplete(layout.repoRoot, shell, ports);
    // Existence was never enough -- see failIfShellIsStale's header for the bundle this missed.
    failIfShellIsStale({ repoRoot: layout.repoRoot, shell, steps: ports.steps });
  }
  return manifest;
}

/** Copy the payload and its dependency closure into a fresh `outDir`; returns the staged package count. */
function stageTree({ layout, ports }: { layout: StageLayout; ports: StagePorts }, _options = {}): number {
  const { fs, steps } = ports;
  fs.rmSync(layout.outDir, { recursive: true, force: true });
  fs.mkdirSync(layout.outDir, { recursive: true });
  // `package.json` is staged verbatim because `resolveCliEntry` reads `bin.tovu` from it in BOTH
  // modes — copying it is what keeps that function free of any packaged-mode branch at all.
  steps.stagePayloadFiles({ repoRoot: layout.repoRoot, outDir: layout.outDir });
  const runtime = stageRuntimePackages({ layout, ports });
  const staged = runtime.count + asRefusal({ step: () => steps.stageTransitiveDependencies({
    roots: runtime.roots, outDir: layout.outDir,
  }) });
  if (!fs.existsSync(path.join(layout.outDir, "node_modules", "better-sqlite3"))) {
    fail({ message: "staged tree has no better-sqlite3 — Tovu's CLI cannot open a site database without it." });
  }
  return staged;
}

/** Run a lib step whose only failure mode is a plain `Error`, as a staging refusal. */
function asRefusal<T>({ step }: { step: () => T }, _options = {}): T {
  try {
    return step();
  } catch (err) {
    // `as`: assertClosureComplete, assertDistImportsDeclared, pruneNativePrebuilds,
    // stageBundledNpm and ensurePtyHelpersExecutable only ever throw a plain Error.
    return fail({ message: (err as Error).message });
  }
}

/** Trim the staged tree to what ships, then prove the closure and imports are still complete. */
function trimAndVerify({ layout, ports, manifest }: { layout: StageLayout; ports: StagePorts; manifest: RuntimeManifest }, _options = {}) {
  const { fs, steps } = ports;
  const materialized = materializeSymlinks({ fs, dir: layout.outDir });
  assertNoSymlinks({ fs, dir: layout.outDir });
  // BEFORE assertClosureComplete, deliberately: the closure is then verified against the tree that
  // actually ships, not against a fuller one the strip has yet to touch.
  const stripped = steps.stripNonRuntimeFiles({ outDir: layout.outDir });
  // See `resolveTargets` for why this is the host unless TOVU_TARGET_ARCH says otherwise.
  const targets = resolveTargets({ env: ports.env, host: ports.host });
  const pruned = asRefusal({ step: () => {
    const tally = steps.pruneNativePrebuilds({ outDir: layout.outDir, targets });
    steps.assertClosureComplete({ outDir: layout.outDir });
    steps.assertDistImportsDeclared({
      distDir: path.join(layout.outDir, "dist"),
      entry: path.join(layout.outDir, manifest.cliEntry),
      declared: declaredRuntimePackages({ layout, ports }),
    });
    return tally;
  } });
  return { materialized, stripped, targets, pruned };
}

/** The staged tree must still carry the CLI entry and every shell the source checks demanded. */
function assertStagedTree({ layout, ports, manifest }: { layout: StageLayout; ports: StagePorts; manifest: RuntimeManifest }, _options = {}): void {
  const { fs } = ports;
  const stagedManifest = readRuntimeManifest({ fs, dir: layout.outDir, repoRoot: layout.repoRoot });
  if (stagedManifest.cliEntry !== manifest.cliEntry || !fs.existsSync(path.join(layout.outDir, stagedManifest.cliEntry))) {
    fail({ message: `the staged tree's runtime-manifest.json names cliEntry "${stagedManifest.cliEntry}", which did not survive the dist/ copy.` });
  }
  for (const shell of ports.shells) {
    // After `materializeSymlinks`, not before: that pass could in principle empty out a dangling link.
    if (!fs.existsSync(path.join(layout.outDir, shell.relative, shell.marker))) {
      fail({ message: `staged tree has no shell at ${path.join(layout.outDir, shell.relative, shell.marker)} — the copy must have gone wrong.` });
    }
  }
  failIfDistIsStale({ layout, ports });
}

/**
 * The bundled npm package (plan-desktop-bundled-npx-2026-09-24.md §5, §6 S5) — staged into its own
 * `staging/npm` tree, a SIBLING of `outDir` (`staging/tovu-payload`), not inside it: `npm` is a
 * devDependency of apps/desktop itself (package.json), never a runtime dependency of the Tovu
 * payload above, so it is staged separately from the declared runtime closure. `electron-builder.yml`
 * ships it via its own pair of `extraResources` entries at `Contents/Resources/npm/`.
 */
function stageNpm({ layout, ports }: { layout: StageLayout; ports: StagePorts }, _options = {}): void {
  const npmSrc = path.join(layout.desktopDir, "node_modules", "npm");
  const npmStagingDir = path.join(layout.desktopDir, "staging", "npm");
  const npmStaged = asRefusal({ step: () => ports.steps.stageBundledNpm({ npmSrc, outDir: npmStagingDir }) });
  ports.stdout.write(`stage-payload: staged bundled npm -> ${npmStagingDir} (${npmStaged.fileCount} files, ${megabytes({ bytes: npmStaged.bytes })} MB)\n`);
}

/** Sets the execute bits on the shell's own node-pty `spawn-helper`s, the copy electron-builder
 *  unpacks into `app.asar.unpacked` with whatever mode it finds there. See
 *  `ensurePtyHelpersExecutable` for why the install leaves them unexecutable. */
function stagePtyHelpers({ layout, ports }: { layout: StageLayout; ports: StagePorts }, _options = {}): void {
  const changed = asRefusal({ step: () => ports.steps.ensurePtyHelpersExecutable({ ptyDir: path.join(layout.desktopDir, "node_modules", "node-pty") }) });
  if (changed.length > 0) ports.stdout.write(`stage-payload: set the execute bits on ${changed.length} node-pty spawn-helper(s): ${changed.join(", ")}\n`);
}

/**
 * Assemble the whole shippable payload.
 *
 * @param input.repoRoot the Tovu checkout whose build output and dependencies are staged.
 * @param input.desktopDir `apps/desktop`; the payload lands at `staging/tovu-payload/` under it.
 * @throws {StagePayloadError} on every refusal, before or after any staging write.
 * @complexity O(n) in files under the staged tree.
 */
export function runStagePayload({ repoRoot, desktopDir }: { repoRoot: string; desktopDir: string }, ports: StagePorts): void {
  const layout: StageLayout = {
    repoRoot, desktopDir,
    outDir: path.join(desktopDir, "staging", "tovu-payload"),
  };
  const manifest = assertSourcePreconditions({ layout, ports });
  const staged = stageTree({ layout, ports });
  const { materialized, stripped, targets, pruned } = trimAndVerify({ layout, ports, manifest });
  assertStagedTree({ layout, ports, manifest });
  stageNpm({ layout, ports });
  stagePtyHelpers({ layout, ports });

  // `diskBytes`, not `du -sh`: `du` does not exist on Windows, and diskBytes already walks the same
  // on-disk block accounting the strip/prune tallies below use, so all three sizes stay comparable.
  const sizeMb = megabytes({ bytes: ports.steps.diskBytes({ abs: layout.outDir }) });
  ports.stdout.write(`stage-payload: staged ${staged} packages, materialized ${materialized} symlinks -> ${layout.outDir} (${sizeMb} MB)\n`);
  ports.stdout.write(
    `stage-payload: stripped ${stripped.declaration} declarations, ${stripped.sourceMap} third-party source maps, ` +
      `${stripped.coverage} coverage reports (${megabytes({ bytes: stripped.bytes })} MB on disk)\n`
  );
  const targetLabels = targets.map((target) => `${target.platform}-${target.arch}`).join(" + ");
  ports.stdout.write(
    `stage-payload: native prebuilds kept for ${targetLabels} only; ` +
      `removed ${pruned.prebuilds} other-architecture prebuilds and ${pruned.buildInputs} from-source build inputs ` +
      `(${megabytes({ bytes: pruned.bytes })} MB on disk)\n`
  );
}

/**
 * The repo the payload is staged FROM: this checkout (`apps/desktop/../..`) unless
 * `--repo-root <dir>` names another one (a clean clone, or a deliberately incomplete tree to prove
 * a refusal). The payload always lands under THIS `apps/desktop/staging/`.
 */
export function resolveStageRoot({ argv, desktopDir }: { argv: readonly string[]; desktopDir: string }): string {
  const flagAt = argv.indexOf("--repo-root");
  const explicit = flagAt === -1 ? undefined : argv[flagAt + 1];
  return explicit ? path.resolve(explicit) : path.resolve(desktopDir, "..", "..");
}

/**
 * The CLI contract: a {@link StagePayloadError} prints as `stage-payload: <message>` and exits 1;
 * anything else is a bug and propagates with its stack, as an uncaught error always did.
 *
 * @returns the process exit code.
 */
export function stagePayloadCli(
  { argv, desktopDir, ports }: { argv: readonly string[]; desktopDir: string; ports: StagePorts & { stderr: { write(text: string): unknown } } },
  _options = {},
): 0 | 1 {
  try {
    runStagePayload({ repoRoot: resolveStageRoot({ argv, desktopDir }), desktopDir }, ports);
    return 0;
  } catch (err) {
    if (!(err instanceof StagePayloadError)) throw err;
    ports.stderr.write(`stage-payload: ${err.message}\n`);
    return 1;
  }
}

export type { ShellEntry, StageFs, StagePorts, StageSteps };
