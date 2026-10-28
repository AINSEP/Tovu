/** Shared local-host policy and registered source discovery; never boot or repair another site. */
import fs from "node:fs";
import path from "node:path";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";
import type { SitesWorkspace } from "#src/platform/site-dir/sites-home";
import { resolveSiteDatabasePaths } from "#src/platform/site-dir/site-databases";
import { readSiteMetaJson } from "#src/features/webhooks/site-key-sources";
import { bootLocalOwnerSignIn } from "../boot/local-owner-signin.js";
import { detectDeploymentSignals } from "../boot/boot-readiness-warnings.js";

import type { RegisteredSiteSource } from '#src/assistant/host-contracts';
export type { RegisteredSiteSource } from '#src/assistant/host-contracts';
type RegisteredEntry = RegisteredSiteSource & { registeredId: string };

/** Recognize desktop/local hosts without deployment signals. Never reads a site registry.
 * @throws Propagates runtime-mode configuration errors. @complexity O(1) environment checks.
 */
export function isLocalTovuHost(_required: Record<string, never>, _options = {}): boolean {
  return bootLocalOwnerSignIn.enabled ||
    (resolveRuntimeMode() === "local" && detectDeploymentSignals({ env: process.env }).length === 0);
}

/** Registry IDs are discovery, never a request-supplied path. Exclude both sides of an identity collision.
 * O(n) small metadata/filesystem probes and maps for n registered folders; no source databases open.
 */
export function registeredSources({ workspace, targetSiteId, targetSiteDir, targetFile }: {
  workspace: SitesWorkspace; targetSiteId: string; targetSiteDir: string; targetFile: string | undefined;
}, _options = {}): RegisteredSiteSource[] {
  const entries = readRegisteredEntries({ workspace });
  const identities = new Map<string, number>();
  const folders = new Map<string, number>();
  for (const source of entries) {
    identities.set(source.siteId, (identities.get(source.siteId) ?? 0) + 1);
    folders.set(source.dir, (folders.get(source.dir) ?? 0) + 1);
  }
  const currentDir = fs.realpathSync(targetSiteDir);
  return entries.filter(source => {
    if (source.siteId !== source.registeredId || source.siteId === targetSiteId || source.dir === currentDir ||
      identities.get(source.siteId) !== 1 || folders.get(source.dir) !== 1) return false;
    return hasSeparateDatabase({ source, workspace, targetFile });
  });
}

function readRegisteredEntries({ workspace }: { workspace: SitesWorkspace }, _options = {}): RegisteredEntry[] {
  const entries: RegisteredEntry[] = [];
  for (const entry of workspace.registry({}).list({})) {
    try {
      const dir = fs.realpathSync(entry.path);
      if (!fs.statSync(dir).isDirectory() || dir.split(path.sep).includes("site-trash")) continue;
      const meta = readSiteMetaJson(dir);
      if (typeof meta?.siteId !== "string" || !meta.siteId) continue;
      entries.push({ siteId: meta.siteId, name: entry.name, dir, registeredId: entry.id });
    } catch { /* Missing/unreadable folders are unavailable choices, never repaired here. */ }
  }
  return entries;
}

function hasSeparateDatabase({ source, workspace, targetFile }: {
  source: RegisteredSiteSource; workspace: SitesWorkspace; targetFile: string | undefined;
}, _options = {}): boolean {
  try {
    const sourceFile = resolveSiteDatabasePaths({ dir: source.dir }, { workspace, reserveIdentity: false }).contentDbPath;
    if (!targetFile || targetFile === ":memory:" || !fs.existsSync(sourceFile)) return true;
    // Folder identities alone cannot detect a symlink/hardlink to the live target database.
    const a = fs.statSync(sourceFile), b = fs.statSync(targetFile);
    return a.dev !== b.dev || a.ino !== b.ino;
  } catch { return false; }
}
