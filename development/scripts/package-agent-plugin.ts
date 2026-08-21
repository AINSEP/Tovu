/**
 * @file Dev-only: packages an Agent Plugin source directory into a real `.zip`, rooted AT the plugin
 * directory (not at a parent folder containing it) — `install.ts`'s own `installAgentPlugin` requires
 * `plugin.json` at the archive ROOT (`indexInstalledRoot` reads `<packageRoot>/plugin.json`), so a zip
 * that nests the plugin under its own directory name would fail `MANIFEST_MISSING` on install. Prints
 * the resulting archive's SHA-256 so it can be pinned via `--sha256` on `install-agent-plugin.ts`.
 *
 * Uses `yazl` (a devDependency already used by this feature's own `__tests__/fixtures/build-zip.ts`)
 * for the same reason that fixture does: this script is dev-only tooling for building test/demo
 * archives, not a production archive writer — the feature only ever needs to READ an Agent Plugin
 * archive a registry already produced (`install.ts`), never to write one at runtime. Must never be
 * imported by production code.
 *
 * Usage:
 *   npx tsx development/scripts/package-agent-plugin.ts <plugin-dir> [--out <zip-path>]
 *
 * Exits 1 if `<plugin-dir>` has no `plugin.json` at its root — fails fast rather than silently
 * producing an archive `installAgentPlugin` would reject anyway.
 */
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, readdir } from "node:fs/promises";
import path from "node:path";
// @ts-expect-error -- yazl ships no type declarations (pre-existing gap: build-zip.ts's own import
// hits the identical TS7016 under this repo's stricter test tsconfig; not this script's to fix).
import * as yazl from "yazl";

interface PackageAgentPluginArgs {
  readonly sourceDir: string;
  readonly outPath: string;
}

function printUsageAndExit(message: string): never {
  console.error(message);
  console.error("Usage: npx tsx development/scripts/package-agent-plugin.ts <plugin-dir> [--out <zip-path>]");
  process.exit(1);
}

function parseArgs(argv: readonly string[]): PackageAgentPluginArgs {
  const args = argv.slice(2);
  const outFlagIndex = args.indexOf("--out");
  const outArg = outFlagIndex === -1 ? undefined : args[outFlagIndex + 1];
  const positional = args.filter((_, i) => i !== outFlagIndex && i !== outFlagIndex + 1);

  const sourceDirArg = positional[0];
  if (sourceDirArg === undefined) printUsageAndExit("Missing required <plugin-dir>.");

  const sourceDir = path.resolve(sourceDirArg);
  const outPath = path.resolve(outArg ?? `${sourceDir}.zip`);
  return { sourceDir, outPath };
}

/**
 * Recursively lists every regular file under `dir`, as POSIX-style paths relative to `dir` — the
 * shape `yazl`'s `addFile` wants as a `metadataPath`.
 *
 * @throws Nothing of its own — propagates whatever `readdir` throws (e.g. `dir` not existing).
 * @complexity O(f) in the number of filesystem entries under `dir`.
 */
async function listFilesRecursive(dir: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(path.join(dir, entry.name), relative)));
    } else if (entry.isFile()) {
      files.push(relative);
    }
    // A symlink (or anything else) is silently skipped rather than followed: even if this script
    // followed it, install.ts's own SYMLINK_ENTRY_REJECTED rule means a real symlink zip ENTRY would
    // be refused on the other end anyway — so producing one here would only make an archive nobody
    // could actually install.
  }
  return files;
}

/**
 * Streams `zipfile`'s output to `outPath`, resolving with the written archive's own SHA-256 and byte
 * count once the file handle closes — digested from the SAME bytes landing on disk, not a second
 * read-back.
 *
 * @throws Whatever the write or zip stream itself reports (disk full, permission denied, etc.).
 * @complexity O(b) in total archive bytes.
 */
function writeZipAndDigest(zipfile: InstanceType<typeof yazl.ZipFile>, outPath: string): Promise<{ sha256: string; bytes: number }> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    let bytes = 0;
    const output = createWriteStream(outPath);
    zipfile.outputStream.on("data", (chunk: Buffer) => {
      hash.update(chunk);
      bytes += chunk.byteLength;
    });
    zipfile.outputStream.on("error", reject);
    output.on("error", reject);
    output.on("close", () => resolve({ sha256: hash.digest("hex"), bytes }));
    zipfile.outputStream.pipe(output);
  });
}

async function main(): Promise<void> {
  const { sourceDir, outPath } = parseArgs(process.argv);

  try {
    await access(path.join(sourceDir, "plugin.json"));
  } catch {
    printUsageAndExit(
      `ABORT: '${sourceDir}' has no plugin.json at its root — installAgentPlugin would reject this archive with MANIFEST_MISSING.`,
    );
  }

  const relativeFiles = (await listFilesRecursive(sourceDir)).sort();
  const zipfile = new yazl.ZipFile();
  for (const relative of relativeFiles) {
    zipfile.addFile(path.join(sourceDir, relative), relative);
  }
  zipfile.end();

  const { sha256, bytes } = await writeZipAndDigest(zipfile, outPath);

  console.log(`Packaged ${relativeFiles.length} file(s) from '${sourceDir}'`);
  console.log(`  -> ${outPath} (${bytes} bytes)`);
  console.log(`  sha256: ${sha256}`);
}

void main();
