/**
 * @file The decision half of `scripts/verify-package.ts` — the BACKSTOP half of the packaging safety
 * gate (see that script's header for where it sits in `package.json`'s `package` chain and why it
 * cannot be a `quality-gates.json` gate). It locates the freshly built `app.asar`, runs the
 * byte-for-byte comparison from `./asar-verify.ts`, checks the bundled npm and node-pty's
 * spawn-helper modes, and turns the outcome
 * into an exit code.
 *
 * Every filesystem read and every output stream is an injected port, so the whole CLI decision —
 * which asar is picked, which resources dirs are checked, which message and exit code each outcome
 * produces — is unit-tested here with hand-written fakes. The script only binds the real `node:fs`,
 * the real asar verifier, and `process.stdout`/`process.stderr`.
 */
import path from "node:path";

import type { AsarVerification } from "./asar-verify.ts";

/** The one `fs.Dirent` surface the bundle walk reads. */
interface VerifyPackageDirent {
  name: string;
  isDirectory(): boolean;
}

/** The read-only filesystem surface the asar lookup needs. */
interface VerifyPackageFs {
  existsSync(target: string): boolean;
  readdirSync(target: string, options: { withFileTypes: true }): VerifyPackageDirent[];
  statSync(target: string): { mtimeMs: number };
}

/** A writable text sink — `process.stdout`/`process.stderr` at the composition edge. */
interface TextSink {
  write(text: string): unknown;
}

/** Everything `runVerifyPackage` touches outside its own arguments. */
interface VerifyPackagePorts {
  fs: VerifyPackageFs;
  verify(asarPath: string, sourceRoot: string, prefixes: string[]): AsarVerification;
  isEmptyVerification(checkedCount: number): boolean;
  formatMismatchReport(mismatches: AsarVerification["mismatches"]): string;
  bundledNpmFailures(resourcesDirs: string[]): string[];
  ptyHelperFailures(resourcesDirs: string[]): string[];
  prefixes: string[];
  stdout: TextSink;
  stderr: TextSink;
}

/** Every `*.app` bundle under `dir`, recursively. `release/` can hold leftovers from earlier builds
 *  or probes, so finding ONE bundle is not enough on its own — see {@link resolveAsarPath}.
 *  An unreadable (or absent) directory contributes nothing.
 *  @complexity O(n) in directory entries under `dir`. */
function findAppBundles(fs: VerifyPackageFs, dir: string): string[] {
  let entries: VerifyPackageDirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((entry) => entry.isDirectory()).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.name.endsWith(".app") ? [full] : findAppBundles(fs, full);
  });
}

/**
 * Every resources directory a packaged build could have produced — the same two layouts
 * {@link resolveAsarPath} already knows about, but ALL of them (not just the newest), since a
 * leftover probe build from an earlier run must not be reported clean just because it is not the
 * one {@link resolveAsarPath} picked.
 *
 * @complexity O(n) in bundles found under `release/`.
 */
function findResourcesDirs(fs: VerifyPackageFs, desktopRoot: string): string[] {
  const releaseDir = path.join(desktopRoot, "release");
  const dirs = findAppBundles(fs, releaseDir).map((bundle) => path.join(bundle, "Contents/Resources"));
  const winUnpackedResources = path.join(releaseDir, "win-unpacked", "resources");
  if (fs.existsSync(winUnpackedResources)) dirs.push(winUnpackedResources);
  return dirs;
}

/**
 * The `app.asar` to verify: an explicit `--asar` wins (what a deliberate-corruption drill or a
 * one-off probe build uses); otherwise the most-recently-modified candidate found under `release/`,
 * across BOTH packaged layouts electron-builder produces:
 *   - macOS: any `.app` bundle under a `mac`-prefixed output directory, e.g.
 *     `release/mac-arm64/Tovu.app/Contents/Resources/app.asar` — `findAppBundles` already walks the
 *     whole tree, so `mac-arm64`, plain `mac`, or any other `mac`-prefixed directory is found with
 *     no glob needed (NOTE: do not write a literal asterisk immediately followed by a slash in this
 *     comment block — it closes the JSDoc block comment early and the rest parses as code).
 *   - Windows: `release/win-unpacked/resources/app.asar` — `win-unpacked` has no `.app` bundle at
 *     all, so it is checked for directly.
 * A fresh `electron-builder` run is what just produced the newest one; older probes or other arches
 * may still be sitting in the same output directory, so only the candidate's own `app.asar` mtime
 * (not the bundle directory's) decides "newest" across the two shapes uniformly.
 *
 * @returns the chosen path, or `undefined` when no candidate exists.
 * @complexity O(n) in bundles found under `release/`.
 */
export function resolveAsarPath({ fs, argv, desktopRoot }: { fs: VerifyPackageFs; argv: readonly string[]; desktopRoot: string }, _options = {}): string | undefined {
  const flagAt = argv.indexOf("--asar");
  const explicit = flagAt === -1 ? undefined : argv[flagAt + 1];
  if (explicit) return path.resolve(explicit);

  const releaseDir = path.join(desktopRoot, "release");
  const candidates = findAppBundles(fs, releaseDir).map((bundle) => path.join(bundle, "Contents/Resources/app.asar"));
  candidates.push(path.join(releaseDir, "win-unpacked", "resources", "app.asar"));
  const existing = candidates.filter((candidate) => fs.existsSync(candidate));
  existing.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return existing[0];
}

/** The asar comparison half; returns the failure message, or `undefined` on a clean, non-empty pass. */
function asarFailure(ports: VerifyPackagePorts, asarPath: string, desktopRoot: string): string | undefined {
  const { checkedCount, mismatches } = ports.verify(asarPath, desktopRoot, ports.prefixes);
  ports.stdout.write(`verify-package: ${checkedCount} file(s) checked\n`);
  if (ports.isEmptyVerification(checkedCount)) {
    return "verify-package: verified nothing — path-separator or prefix bug (see asar-verify.ts's " +
      "toArchiveEntryPath doc comment); this is a failure, not a clean pass\n";
  }
  if (mismatches.length > 0) return `verify-package: ${ports.formatMismatchReport(mismatches)}\n`;
  return undefined;
}

/** The resources dirs the npm and spawn-helper checks read. The verified asar's own resources dir
 *  always counts, so an explicit `--asar` outside `release/` is checked too rather than passing
 *  with zero dirs. */
function resourcesDirsFor(ports: VerifyPackagePorts, asarPath: string, desktopRoot: string): string[] {
  return [...new Set([path.dirname(asarPath), ...findResourcesDirs(ports.fs, desktopRoot)])];
}

/** The bundled-npm half; returns the failure message, or `undefined` on a pass. */
function npmFailure(ports: VerifyPackagePorts, resourcesDirs: string[]): string | undefined {
  const failures = ports.bundledNpmFailures(resourcesDirs);
  if (failures.length === 0) return undefined;
  return `verify-package: bundled npm is missing from the packaged app:\n  ${failures.join("\n  ")}\n` +
    "Every stdio MCP server launched via a bare npx/npm command would have nothing to run. Check " +
    "electron-builder.yml's two npm extraResources entries and that `npm run stage` ran before packaging.\n";
}

/** The node-pty half; returns the failure message, or `undefined` on a pass. electron-builder keeps
 *  the mode it finds, so a helper staging left unexecutable ships that way (see pty-helpers.ts). */
function ptyFailure(ports: VerifyPackagePorts, resourcesDirs: string[]): string | undefined {
  const failures = ports.ptyHelperFailures(resourcesDirs);
  if (failures.length === 0) return undefined;
  return `verify-package: node-pty spawn-helper is missing or not executable in the packaged app:\n  ${failures.join("\n  ")}\n` +
    "Every terminal would fail with `posix_spawnp failed`. Check that `npm run stage` ran before " +
    "packaging (it sets the execute bits) and electron-builder.yml's node-pty asarUnpack entry.\n";
}

/**
 * Run the whole packaging backstop.
 *
 * @param input.argv the CLI arguments after the script path (`[--asar <path>]`).
 * @param input.desktopRoot the `apps/desktop` directory, the source side of the comparison.
 * @returns the process exit code: 0 when every verified file is byte-identical, npm is bundled and
 *   every node-pty spawn-helper is executable; 1 when no asar exists, nothing was verified, a
 *   mismatch was found, npm is missing, or a spawn-helper is missing or not executable.
 * @complexity O(n) in archive entries plus bundles under `release/`.
 */
export function runVerifyPackage({ argv, desktopRoot }: { argv: readonly string[]; desktopRoot: string }, ports: VerifyPackagePorts): 0 | 1 {
  const asarPath = resolveAsarPath({ fs: ports.fs, argv, desktopRoot });
  if (asarPath === undefined) {
    ports.stderr.write(`verify-package: no app.asar found under ${path.join(desktopRoot, "release")} (checked *.app bundles and win-unpacked) — did electron-builder run?\n`);
    return 1;
  }
  ports.stdout.write(`verify-package: checking ${asarPath} against source under ${ports.prefixes.join(", ")}\n`);
  const asarMessage = asarFailure(ports, asarPath, desktopRoot);
  if (asarMessage !== undefined) {
    ports.stderr.write(asarMessage);
    return 1;
  }
  const resourcesDirs = resourcesDirsFor(ports, asarPath, desktopRoot);
  const packagedMessage = npmFailure(ports, resourcesDirs) ?? ptyFailure(ports, resourcesDirs);
  if (packagedMessage !== undefined) {
    ports.stderr.write(packagedMessage);
    return 1;
  }
  ports.stdout.write(`verify-package: OK — bundled npm present in ${resourcesDirs.length} resources dir(s)\n`);
  ports.stdout.write("verify-package: OK — every file byte-identical to source\n");
  return 0;
}

export type { VerifyPackageDirent, VerifyPackageFs, VerifyPackagePorts };
