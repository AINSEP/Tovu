/**
 * Packaged release gates run a COPY of the app in a fresh OS temp dir. Launched inside the checkout,
 * a packaged app resolves a missing dependency from the checkout's node_modules (Node walks up the
 * directory tree), which hid the 0.1.13–0.1.17 missing-peer bug from every gate.
 */
import { cpSync, existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

/** A fixed, path-only diagnostic safe for the packaged chat gate to print. */
export class PackagedGateIsolationError extends Error {}

/** Throws when `directory` or any real (symlink-resolved) ancestor has a node_modules. */
export function assertPackagedGateIsolation({ directory }: { directory: string }): void {
  // Walks up until `dirname` stops changing (the filesystem root, which is checked too). The loop
  // ends on its own condition rather than an inner `return`, so it has no unreachable exit path.
  for (let dir = realpathSync(directory), previous = ""; dir !== previous; previous = dir, dir = path.dirname(dir)) {
    const modules = path.join(dir, "node_modules");
    if (existsSync(modules)) throw new PackagedGateIsolationError(`Packaged gate isolation refused: ${modules} exists above ${directory}`);
  }
}

type SmokeTargets = { executablePath: string; nodeModulesDir: string };

/**
 * Copies the whole Tovu.app (or win-unpacked) into a fresh temp dir, runs the gate against the copy
 * with that dir as a safe cwd, and always removes the copy.
 * @param options.platform selects the copier (`cpSync` on win32, `cp -R` elsewhere); `process.platform` by default.
 */
export async function withIsolatedSmokeTargets(
  { targets, run }: { targets: SmokeTargets; run: (targets: SmokeTargets, directory: string) => void | Promise<void> },
  { tempRoot = tmpdir(), platform = process.platform }: { tempRoot?: string; platform?: NodeJS.Platform } = {},
): Promise<void> {
  // Real path: macOS tmpdir is /var -> /private/var, and an entry like bin/mcp-bridge.ts runs only
  // when argv[1] equals its own resolved URL, so a symlinked path makes it exit 0 without serving.
  const directory = realpathSync(mkdtempSync(path.join(tempRoot, "tovu-gate-")));
  try {
    assertPackagedGateIsolation({ directory });
    const executableDir = path.dirname(targets.executablePath);
    const appRoot = path.basename(executableDir) === "MacOS" ? path.resolve(executableDir, "../..") : executableDir;
    const copiedRoot = path.join(directory, path.basename(appRoot));
    // Keep framework-relative symlinks as-is. Never ditto: ditto-copied apps have hung before dyld.
    if (platform === "win32") cpSync(appRoot, copiedRoot, { recursive: true, verbatimSymlinks: true });
    else execFileSync("cp", ["-R", appRoot, copiedRoot], { stdio: "pipe" });
    await run({
      executablePath: path.join(copiedRoot, path.relative(appRoot, targets.executablePath)),
      nodeModulesDir: path.join(copiedRoot, path.relative(appRoot, targets.nodeModulesDir)),
    }, directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
