import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { createBundledSourceArchiveReader, packAgentPluginDirectory } from "../agent-plugins/lifecycle.js";
import { defaultBundledSourceRoot } from "../agent-plugins/supersession.js";
import type { PackageFileInventory } from "./share-file-policy.js";

/**
 * @file Which installed-package files a share may treat as public plugin content: exactly the files
 * THIS build ships. Each bundled source folder is packed with the seeder's own deterministic packer
 * (`packAgentPluginDirectory`), so its digest is the `package/sha256/<digest>/` folder the seeder
 * installs it under, and the packed entries are the package's file inventory. Nothing here reads the
 * site folder: a package-shaped path, `bundled-digests.json` and `activations.json` can all be written
 * by anyone who can write there, the product's bundled sources cannot.
 */

/**
 * Digest -> (package-relative path -> SHA-256) for every bundled source folder. A missing source root,
 * or a folder that does not pack, verifies nothing: its installed files then get the ordinary rules.
 * @complexity O(bundled source bytes): one pack and one hash per file.
 */
export async function readBundledPackageFiles(_required: Record<string, never> = {}, optional: { sourceRoot?: string } = {}): Promise<PackageFileInventory> {
  const sourceRoot = optional.sourceRoot ?? defaultBundledSourceRoot({ env: process.env });
  const inventory = new Map<string, ReadonlyMap<string, string>>();
  const folders = await readdir(sourceRoot, { withFileTypes: true }).catch((): Dirent[] => []);
  for (const folder of folders) {
    if (!folder.isDirectory()) continue;
    const packed = await packAgentPluginDirectory(path.join(sourceRoot, folder.name)).catch(() => null);
    if (packed) inventory.set(packed.sha256, await packedFileHashes({ bytes: packed.bytes }));
  }
  return inventory;
}

/** The packed archive read back with the installer's own reader. O(archive bytes). */
async function packedFileHashes(required: { bytes: Uint8Array }): Promise<ReadonlyMap<string, string>> {
  const files = new Map<string, string>();
  for await (const entry of createBundledSourceArchiveReader().entries(required.bytes)) {
    if (entry.kind !== "file") continue;
    const hash = createHash("sha256");
    for await (const chunk of entry.openReadStream()) hash.update(chunk);
    files.set(entry.entryPath, hash.digest("hex"));
  }
  return files;
}
