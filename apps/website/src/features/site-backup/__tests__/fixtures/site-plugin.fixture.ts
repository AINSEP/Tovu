import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { discoverPlugins } from "@jini-ai/plugins/host/node";
import { pluginHostBinding } from "../../../plugin-runtime/host-binding.js";
import type { SiteBackupSources } from "../../sources.js";

/**
 * @file A site plugin as Jini's installer leaves it, and the share's view of the install folder through
 * Jini's own pinned discovery (what `deps.ts` wires from `pluginRuntime.discoverActivePlugins`).
 */

const sha256 = (text: string | Buffer): string => `sha256-${createHash("sha256").update(text).digest("hex")}`;

function writeAll(root: string, files: Record<string, string>): void {
  for (const [relative, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), text);
  }
}

/** The manifest text {@link installSitePlugin} writes for `package`. */
export function sitePluginManifest(required: { id: string; version: string; package: Record<string, string | Buffer> }): string {
  const integrity = Object.fromEntries(Object.entries(required.package).map(([file, text]) => [file, sha256(text)]));
  return JSON.stringify({ id: required.id, name: required.id, version: required.version, sdkRange: "^0.1.0", engine: 1, tier: "tier-3", capabilities: [], hooks: [], fields: [], integrity });
}

/** Writes `<installDir>/<id>/<version>/`: a valid manifest whose integrity lists exactly `package`, the
 *  package files, and `extra` files the installer never wrote (runtime data, strays). */
export function installSitePlugin(required: { installDir: string; id: string; version: string; package: Record<string, string> }, optional: { extra?: Record<string, string> } = {}): string {
  const root = path.join(required.installDir, required.id, required.version);
  writeAll(root, { "jini.plugin.json": sitePluginManifest(required), ...required.package, ...optional.extra });
  return root;
}

/** `SiteBackupSources.sitePlugins` over `installDir`: Jini discovery with the activation pins. */
export function jiniSitePlugins(required: { installDir: string }, optional: { pins?: Record<string, string> } = {}): NonNullable<SiteBackupSources["sitePlugins"]> {
  const versions = new Map(Object.entries(optional.pins ?? {}));
  return async () => ({ installDir: required.installDir, records: await discoverPlugins({ ...pluginHostBinding, builtIns: [], installDir: required.installDir }, { versions }) });
}
