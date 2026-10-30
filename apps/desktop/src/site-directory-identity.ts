/** Tovu marker policy; Jini continues to own registry uniqueness, locks and atomic writes. */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createNodeAtomicFilesystem, writeJsonFileAtomic, type AtomicFilesystemPort } from "@jini-ai/platform/fs";
import { readSiteIdentity } from "./project-delete-guard.ts";
import { withFileLock } from "./durable-json-file.ts";
import { createSitesWorkspace, type SitesWorkspace } from "./shared-sites.ts";

export interface SiteIdentityOptions {
  workspace?: Pick<SitesWorkspace, "registry">;
  filesystem?: AtomicFilesystemPort;
  newIdentity?: () => string;
}

/** Give a Finder copy its own identity before admission/start; aliases and moves keep theirs.
 * @param required.siteDir An existing site folder, already admitted by the caller's classifier.
 * @param options Registry, atomic filesystem and UUID ports; defaults match Desktop/CLI discovery.
 * @throws A plain sentence if a copy's marker cannot safely be replaced. No original is written.
 * @complexity O(r + m) time, O(r + m) space for r catalog rows and m marker bytes.
 */
export function ensureIndependentSiteIdentity({ siteDir }: { siteDir: string }, options: SiteIdentityOptions = {}): void {
  const id = readSiteIdentity(siteDir);
  // Legacy markerless identities belong to the existing admission/boot owner.
  if (id === null) return;
  const workspace = options.workspace ?? createSitesWorkspace({});
  const owner = workspace.registry({}).list({}).find((entry) => entry.id === id);
  if (!owner || !fs.existsSync(owner.path)) return;
  const canonical = fs.realpathSync(siteDir);
  if (fs.realpathSync(owner.path) === canonical) return;

  const marker = path.join(canonical, ".site-meta.json");
  try {
    withFileLock(marker, () => replaceCopiedIdentity({ marker, id }, options));
  } catch {
    throw new Error("This copied website could not start because Tovu could not give its folder a separate identity.");
  }
}

/** Re-read under the marker lock so concurrent adds cannot assign two identities to one copy.
 * Preserve schema stamps, unknown fields and the source's key identity (including its legacy
 * siteId fallback), as the website's duplicateMeta owner requires for already sealed data.
 * @throws Read/write errors; the caller supplies the user-facing sentence.
 * @complexity O(m) time and space in marker bytes; Jini replaces the marker atomically.
 */
function replaceCopiedIdentity({ marker, id }: { marker: string; id: string },
  { filesystem = createNodeAtomicFilesystem({}), newIdentity = randomUUID }: SiteIdentityOptions = {},
): void {
  const meta = JSON.parse(fs.readFileSync(marker, "utf8")) as Record<string, unknown>;
  if (meta.siteId !== id) return;
  writeJsonFileAtomic({ filePath: marker, data: { ...meta, siteId: newIdentity(), siteKeyId: meta.siteKeyId ?? id }, fs: filesystem }, { refuseSymlink: true });
}
