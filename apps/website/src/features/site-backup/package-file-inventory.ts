import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { createBundledSourceArchiveReader, packAgentPluginDirectory } from "../agent-plugins/lifecycle.js";
import { bundledAgentPluginsDir } from "#src/platform/site-dir/index";
import { listBundledAgentPluginServers } from "../agent-plugins/new-site-agent-plugin-tokens.js";
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
  const sourceRoot = bundledSourceRoot(optional);
  const inventory = new Map<string, ReadonlyMap<string, string>>();
  const folders = await readdir(sourceRoot, { withFileTypes: true }).catch((): Dirent[] => []);
  for (const folder of folders) {
    if (!folder.isDirectory()) continue;
    const packed = await packAgentPluginDirectory(path.join(sourceRoot, folder.name)).catch(() => null);
    if (packed) inventory.set(packed.sha256, await packedFileHashes({ bytes: packed.bytes }));
  }
  return inventory;
}

/** Import scan classification comes from this build's catalog, never the archive's `shipped` flag.
 * This grants no execution trust: restore seeds local code and quarantines the imported package.
 * @returns Known bundled ids; an absent/unreadable source root recognises none.
 * @complexity O(bundled plugin manifests and MCP declarations), via the existing catalog reader.
 */
export async function readBundledImportPluginIds(_required: Record<string, never> = {}, optional: { sourceRoot?: string } = {}): Promise<ReadonlySet<string>> {
  const plugins = await listBundledAgentPluginServers({ bundledSourceRoot: bundledSourceRoot(optional) });
  return new Set(plugins.map(plugin => plugin.pluginId));
}

function bundledSourceRoot(optional: { sourceRoot?: string }): string {
  return optional.sourceRoot ?? bundledAgentPluginsDir();
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
