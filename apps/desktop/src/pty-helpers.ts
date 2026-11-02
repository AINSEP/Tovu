/**
 * @file Where node-pty's `spawn-helper`s live and whether they can be executed — one list shared by
 * staging (`ensurePtyHelpersExecutable` sets the bits) and the packaging backstop
 * (`scripts/verify-package.ts` proves the packaged copy kept them).
 *
 * node-pty execs `spawn-helper` to start every terminal; a copy without execute bits fails every
 * terminal with `posix_spawnp failed` (open-bugs 10-31). Plain `node:fs` reads only, so the
 * verifier script can load this file without staging's dependencies.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/** Every `spawn-helper` present under a node-pty package dir: the from-source build plus one per
 *  prebuild platform. No node-pty dir means none.
 *  @complexity O(p) in prebuild directories. */
export function ptyHelperPaths({ ptyDir }: { ptyDir: string }): string[] {
  const prebuilds = path.join(ptyDir, "prebuilds");
  const platforms = existsSync(prebuilds) ? readdirSync(prebuilds).sort() : [];
  const helpers = [path.join(ptyDir, "build", "Release", "spawn-helper"), ...platforms.map((dir) => path.join(prebuilds, dir, "spawn-helper"))];
  return helpers.filter((file) => existsSync(file));
}

/** Whether `mode` lacks any of the user/group/other execute bits. */
export function lacksExecuteBits(mode: number): boolean {
  return (mode & 0o111) !== 0o111;
}

/**
 * The packaging-backstop check: every `spawn-helper` electron-builder unpacked must be executable,
 * and a macOS bundle must carry at least one (node-pty is unpacked whole, electron-builder.yml
 * `asarUnpack`). A Windows resources dir has none (conpty) and passes.
 *
 * @param resourcesDirs - packaged `Resources` dirs (each holds `app.asar` and `app.asar.unpacked`).
 * @returns one line per failure; empty when every dir passes.
 * @complexity O(d * p) for d dirs and p prebuild platforms.
 */
export function packagedPtyHelperFailures(resourcesDirs: string[]): string[] {
  return resourcesDirs.flatMap((dir) => {
    const ptyDir = path.join(dir, "app.asar.unpacked", "node_modules", "node-pty");
    const helpers = ptyHelperPaths({ ptyDir });
    if (helpers.length === 0) return dir.endsWith(path.join("Contents", "Resources")) ? [`no node-pty spawn-helper under ${ptyDir}`] : [];
    return helpers.flatMap((file) => {
      const mode = statSync(file).mode;
      return lacksExecuteBits(mode) ? [`${file} (mode ${(mode & 0o777).toString(8)})`] : [];
    });
  });
}
