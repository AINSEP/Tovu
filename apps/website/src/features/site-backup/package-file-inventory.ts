import { readBundledImportPluginIds as readIds, readBundledPackageFiles as readFiles } from "@jini-ai/devops/backup/site/package-file-inventory";
import { createBundledSourceArchiveReader, packAgentPluginDirectory } from "../agent-plugins/lifecycle.js";
import { bundledAgentPluginsDir } from "#src/platform/site-dir/index";
import { listBundledAgentPluginServers } from "../agent-plugins/new-site-agent-plugin-tokens.js";
import type { PackageFileInventory } from "./share-file-policy.js";

/**
 * @file Host binding: this build's bundled agent-plugin source folder, packer, archive reader and
 * catalog reader behind the generic bundled-package inventory (see the devops module for the rules).
 */

/**
 * Digest -> (package-relative path -> SHA-256) for every bundled source folder of this build.
 * @complexity O(bundled source bytes): one pack and one hash per file.
 */
export async function readBundledPackageFiles(_required: Record<string, never> = {}, optional: { sourceRoot?: string } = {}): Promise<PackageFileInventory> {
  return readFiles({ sourceRoot: optional.sourceRoot ?? bundledAgentPluginsDir(), packAgentPluginDirectory, createBundledSourceArchiveReader });
}

/** Known bundled plugin ids of this build; an absent/unreadable source root recognises none.
 * @complexity O(bundled plugin manifests and MCP declarations), via the existing catalog reader.
 */
export async function readBundledImportPluginIds(_required: Record<string, never> = {}, optional: { sourceRoot?: string } = {}): Promise<ReadonlySet<string>> {
  return readIds({ sourceRoot: optional.sourceRoot ?? bundledAgentPluginsDir(), listBundledAgentPluginServers });
}
