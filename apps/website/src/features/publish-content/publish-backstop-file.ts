import fs, { constants } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { RawFilePort, RawFileSnapshot } from "#src/features/publish-content/backstop-ports";
import { checkRawFilePath, BACKSTOP_LIMITS } from "#src/features/publish-content/backstop-policy";
import { normalizeMode } from "#src/features/publish-content/file-tree-policy";

function missing(error: unknown): boolean { return (error as { code?: string })?.code === "ENOENT"; }
function sha(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }

const LINK_REFUSAL = "Links are never sent; choose a regular file inside the site folder.";
const NOT_REGULAR_REFUSAL = "Choose a regular file inside the site folder.";

/** The `node:fs` calls this adapter makes, injectable so fault paths are testable without races. */
export type BackstopFilesystem = Pick<typeof fs, "lstatSync" | "mkdirSync" | "openSync" | "closeSync" | "readFileSync" | "writeFileSync" | "renameSync" | "unlinkSync" | "chmodSync">;

/** lstat that reports an absent path as null; every other failure propagates. */
function lstatOrNull({ file }: { file: string }, { filesystem }: { filesystem: BackstopFilesystem }): fs.Stats | null {
  try { return filesystem.lstatSync(file); } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
}

/** Walk each component below the root without following links. An absent component means the
 * file is new, which is safe. @complexity O(c) lstat calls for c path components.
 */
function componentsRefusal({ root, parts }: { root: string; parts: readonly string[] }, { filesystem }: { filesystem: BackstopFilesystem }): string | null {
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const stat = lstatOrNull({ file: current }, { filesystem });
    if (!stat) return null;
    if (stat.isSymbolicLink()) return LINK_REFUSAL;
    if (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile()) return NOT_REGULAR_REFUSAL;
  }
  return null;
}

/** Single CMS site-file adapter. lstat every component, never follow a link; stage on the same
 * filesystem and rename only verified regular bytes. Previous files stay in a private folder for
 * one-click undo, rather than relying on the whole-db restore/restart path.
 * @param options.filesystem - The `node:fs` calls used; defaults to Node's.
 */
export function createRawFileSitePort({ siteDir }: { siteDir: string }, { filesystem = fs }: { filesystem?: BackstopFilesystem } = {}): RawFilePort {
  const { lstatSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync, renameSync, unlinkSync, chmodSync } = filesystem;
  const root = path.resolve(siteDir);
  function check(relPath: string): string | null {
    const denied = checkRawFilePath({ relPath });
    if (denied) return denied;
    try {
      // lstat never follows a link: a linked site folder is not a directory here.
      if (!lstatSync(root).isDirectory()) return "The site folder must be a real directory, never a link.";
      return componentsRefusal({ root, parts: relPath.split("/") }, { filesystem });
    } catch (error) { return missing(error) ? "The site folder is unavailable." : "This file cannot be inspected safely."; }
  }
  function target(relPath: string): string {
    const reason = check(relPath);
    if (reason) throw new Error(reason);
    return path.join(root, ...relPath.split("/"));
  }
  function read(relPath: string): RawFileSnapshot | null {
    const filename = target(relPath);
    let fd: number;
    try { fd = openSync(filename, constants.O_RDONLY | constants.O_NOFOLLOW); } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
    try {
      const stat = lstatSync(filename);
      if (stat.size > BACKSTOP_LIMITS.bytes) throw new Error("Choose files totaling at most 50 MB per send.");
      return { absPath: filename, bytes: readFileSync(fd), mode: normalizeMode(stat.mode) };
    } finally { closeSync(fd); }
  }
  function privateDir(name: ".publish-staging" | ".publish-previous"): string {
    const dir = path.join(root, name);
    // lstat never follows a link, so a linked folder fails isDirectory() too.
    const stat = lstatOrNull({ file: dir }, { filesystem });
    if (!stat) mkdirSync(dir, { mode: 0o700 });
    if (stat && !stat.isDirectory()) throw new Error("The publish staging folder is not a safe directory.");
    chmodSync(dir, 0o700);
    return dir;
  }
  function parents(relPath: string): void {
    let current = root;
    for (const part of relPath.split("/").slice(0, -1)) {
      current = path.join(current, part);
      const stat = lstatOrNull({ file: current }, { filesystem });
      if (!stat) mkdirSync(current, { mode: 0o755 });
      if (stat && !stat.isDirectory()) throw new Error(LINK_REFUSAL);
    }
  }
  /** A backup's bytes, or `null` when it is gone. Never follows a link. */
  function readBackup(backup: string): Buffer | null {
    let fd: number;
    try { fd = openSync(backup, constants.O_RDONLY | constants.O_NOFOLLOW); } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
    try { return readFileSync(fd); } finally { closeSync(fd); }
  }
  function alreadyRestored(inverse: { relPath: string; sha256: string | null }): boolean {
    const current = read(inverse.relPath);
    return current !== null && sha(current.bytes) === inverse.sha256;
  }
  function removeCreatedFile({ relPath }: { relPath: string }, _optional = {}): void {
    try { unlinkSync(target(relPath)); } catch (error) { if (!missing(error)) throw error; }
  }
  function replace(relPath: string, bytes: Uint8Array, mode: number): void {
    target(relPath);
    if (bytes.byteLength > BACKSTOP_LIMITS.bytes) throw new Error("Choose files totaling at most 50 MB per send.");
    const stage = path.join(privateDir(".publish-staging"), randomUUID());
    try {
      writeFileSync(stage, bytes, { mode: normalizeMode(mode), flag: "wx" });
      // The process umask must not change the normalized mode included in the checked hash.
      chmodSync(stage, normalizeMode(mode));
      if (sha(readFileSync(stage)) !== sha(bytes)) throw new Error("The staged file failed its checksum check.");
      parents(relPath);
      renameSync(stage, target(relPath));
    } finally {
      try { unlinkSync(stage); } catch (error) { if (!missing(error)) throw error; }
    }
  }
  return {
    check: async ({ relPath }) => check(relPath),
    read: async ({ relPath }) => read(relPath),
    capture: async ({ relPath }) => {
      const prior = read(relPath);
      if (!prior) return { relPath, backupName: null, sha256: null, size: null, mode: 0o644 };
      const backupName = randomUUID();
      writeFileSync(path.join(privateDir(".publish-previous"), backupName), prior.bytes, { mode: 0o600, flag: "wx" });
      return { relPath, backupName, sha256: sha(prior.bytes), size: prior.bytes.byteLength, mode: prior.mode };
    },
    replace: async ({ relPath, bytes, mode }) => replace(relPath, bytes, mode),
    restore: async ({ inverse }) => {
      if (inverse.backupName === null) {
        removeCreatedFile({ relPath: inverse.relPath });
        return;
      }
      if (!/^[a-f0-9-]{36}$/.test(inverse.backupName)) throw new Error("The saved undo file has an unsafe address.");
      const backup = path.join(privateDir(".publish-previous"), inverse.backupName);
      const bytes = readBackup(backup);
      // A repeated undo finds its copy already reclaimed below: done when the file holds those bytes.
      if (bytes === null && alreadyRestored(inverse)) return;
      if (bytes === null) throw new Error("The saved undo file is missing.");
      if (sha(bytes) !== inverse.sha256) throw new Error("The saved undo file failed its checksum check.");
      replace(inverse.relPath, bytes, inverse.mode);
      // The undo is spent and nothing else reads this copy; kept, every overwrite would leave up to
      // 50 MB behind for good.
      try { unlinkSync(backup); } catch (error) { if (!missing(error)) throw error; }
    },
  };
}
