import fs from "node:fs";
import type { ImportPayloadFs } from "@jini-ai/devops/backup/site/import-index/payload-namespace";

export function createSiteImportPayloadFs(_required: Record<string, never>, _optional: Record<string, never> = {}): ImportPayloadFs {
  return {
    readdir: ({ dir }, _optional = {}) => fs.readdirSync(dir),
    kind: ({ file }, _optional = {}) => {
      try {
        const stat = fs.lstatSync(file);
        if (stat.isFile()) return "file";
        if (stat.isDirectory()) return "directory";
        return "other";
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
        throw error;
      }
    },
    rename: ({ from, to }, _optional = {}) => fs.renameSync(from, to),
    rm: ({ file, recursive }, _optional = {}) => fs.rmSync(file, { recursive, force: true }),
    mkdir: ({ dir, mode }, _optional = {}) => fs.mkdirSync(dir, { mode }),
    chmod: ({ file, mode }, _optional = {}) => fs.chmodSync(file, mode),
    writeExclusive: ({ file, mode }, _optional = {}) => { fs.closeSync(fs.openSync(file, "wx", mode)); },
    fsyncFile: ({ file }, _optional = {}) => {
      const descriptor = fs.openSync(file, "r");
      try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    },
    fsyncDir: ({ dir }, _optional = {}) => {
      // Atomic rename is same-volume; directory fsync has platform limits.
      let descriptor: number | undefined;
      try { descriptor = fs.openSync(dir, "r"); fs.fsyncSync(descriptor); }
      catch (error) {
        if (!["EPERM", "EISDIR", "EINVAL", "EACCES", "ENOTSUP"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
      } finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
    },
  };
}
