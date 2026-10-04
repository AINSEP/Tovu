import { constants, lstatSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync, renameSync, unlinkSync, chmodSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { RawFilePort, RawFileSnapshot } from "#src/features/publish-content/backstop-ports";
import { checkRawFilePath, BACKSTOP_LIMITS } from "#src/features/publish-content/backstop-policy";
import { normalizeMode } from "#src/features/publish-content/file-tree-policy";

function missing(error: unknown): boolean { return (error as { code?: string })?.code === "ENOENT"; }
function sha(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }

/** Single CMS site-file adapter. lstat every component, never follow a link; stage on the same
 * filesystem and rename only verified regular bytes. Previous files stay in a private folder for
 * one-click undo, rather than relying on the whole-db restore/restart path. */
export function createRawFileSitePort({ siteDir }: { siteDir: string }, _optional: Record<string, never> = {}): RawFilePort {
  const root = path.resolve(siteDir);
  function check(relPath: string): string | null {
    const denied = checkRawFilePath({ relPath });
    if (denied) return denied;
    try {
      const rootStat = lstatSync(root);
      if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return "The site folder must be a real directory, never a link.";
      const parts = relPath.split("/");
      let current = root;
      for (let i = 0; i < parts.length; i++) {
        current = path.join(current, parts[i]!);
        let stat;
        try { stat = lstatSync(current); } catch (error) { if (missing(error)) return null; throw error; }
        if (stat.isSymbolicLink()) return "Links are never sent; choose a regular file inside the site folder.";
        if (i < parts.length - 1 ? !stat.isDirectory() : !stat.isFile()) return "Choose a regular file inside the site folder.";
      }
      return null;
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
    try { fd = openSync(filename, constants.O_RDONLY | constants.O_NOFOLLOW); } catch (error) { if (missing(error)) return null; throw error; }
    try {
      const stat = lstatSync(filename);
      if (stat.size > BACKSTOP_LIMITS.bytes) throw new Error("Choose files totaling at most 50 MB per send.");
      return { absPath: filename, bytes: readFileSync(fd), mode: normalizeMode(stat.mode) };
    } finally { closeSync(fd); }
  }
  function privateDir(name: ".publish-staging" | ".publish-previous"): string {
    const dir = path.join(root, name);
    try { const stat = lstatSync(dir); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("The publish staging folder is not a safe directory."); }
    catch (error) { if (!missing(error)) throw error; mkdirSync(dir, { mode: 0o700 }); }
    chmodSync(dir, 0o700);
    return dir;
  }
  function parents(relPath: string): void {
    let current = root;
    for (const part of relPath.split("/").slice(0, -1)) {
      current = path.join(current, part);
      try { const stat = lstatSync(current); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Links are never sent; choose a regular file inside the site folder."); }
      catch (error) { if (!missing(error)) throw error; mkdirSync(current, { mode: 0o755 }); }
    }
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
        try { unlinkSync(target(inverse.relPath)); } catch (error) { if (!missing(error)) throw error; }
        return;
      }
      if (!/^[a-f0-9-]{36}$/.test(inverse.backupName)) throw new Error("The saved undo file has an unsafe address.");
      const backup = path.join(privateDir(".publish-previous"), inverse.backupName);
      const fd = openSync(backup, constants.O_RDONLY | constants.O_NOFOLLOW);
      let bytes: Buffer;
      try { bytes = readFileSync(fd); } finally { closeSync(fd); }
      if (sha(bytes) !== inverse.sha256) throw new Error("The saved undo file failed its checksum check.");
      replace(inverse.relPath, bytes, inverse.mode);
    },
  };
}
