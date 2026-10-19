import { createHash } from "node:crypto";
import type { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { buildSiteBackupManifest, readPlannedFile, SITE_BACKUP_DATABASE_PATH, SITE_BACKUP_MANIFEST_PATH } from "./sources.js";
import type { SiteSharePlanContent } from "./plan-store.js";
import { checkShareLimits, SHARE_LIMITS, SiteShareRefusal } from "./share-policy.js";
import { requireShareSecretFree, claimSharePath } from "./share-file-policy.js";
import type { SiteBackupPushProgress } from "./push-engine.js";

/**
 * The ZIP target of the common backup content plan. Calls Jini's buffered binary-safe encoder;
 * checks the exact sanitized bytes and builds the same manifest the repository target uses.
 * @throws SiteShareRefusal for stale files, unsafe aliases, secrets, cancellation, and v1 caps.
 * @complexity O(payload bytes + paths²), at most 2,000 paths; O(payload bytes) memory, bounded to 300 MiB.
 */
export async function buildShareZip(required: { plan: SiteSharePlanContent; zip: typeof zipFolderFiles }, optional: { signal?: AbortSignal; progress?: SiteBackupPushProgress } = {}): Promise<Buffer> {
  const { plan } = required;
  const memory = [...(plan.bufferedFiles ?? []), ...(plan.database ? [{ path: SITE_BACKUP_DATABASE_PATH, content: plan.database.bytes }] : [])];
  const sizes = [...plan.files, ...memory.map(file => ({ path: file.path, bytes: file.content.length }))];
  checkShareLimits({ files: sizes, totalBytes: plan.totalBytes });
  const aliases = new Map<string, string>(), fileAliases = new Set<string>();
  claimSharePath({ path: SITE_BACKUP_MANIFEST_PATH, directory: false, aliases, files: fileAliases });
  for (const file of sizes) claimSharePath({ path: file.path, directory: false, aliases, files: fileAliases });
  const files: File[] = [];
  const inventory: { path: string; bytes: number; sha256: string }[] = [];
  const add = (entry: { path: string; content: Buffer }) => {
    optional.signal?.throwIfAborted();
    requireShareSecretFree({ path: entry.path, bytes: entry.content });
    // Node File accepts Buffer directly; the DOM type omits potentially shared-backed views.
    // This assertion preserves the bytes without allocating a second Uint8Array.
    const picked = new File([entry.content as BlobPart], entry.path.split("/").at(-1)!);
    // Jini's picker encoder strips the selected folder's name. Supply that same picker contract
    // explicitly so archive paths keep their first scope segment (database/, uploads/, themes/).
    Object.defineProperty(picked, "webkitRelativePath", { value: `share/${entry.path}` });
    files.push(picked);
    inventory.push({ path: entry.path, bytes: entry.content.length, sha256: createHash("sha256").update(entry.content).digest("hex") });
    if (optional.progress) { optional.progress.filesDone++; optional.progress.bytesDone += entry.content.length; }
  };
  for (const entry of memory) add(entry);
  for (const file of plan.files) {
    const loaded = await readPlannedFile(file);
    if (!loaded.ok) throw new SiteShareRefusal({ code: "PLAN_STALE", message: loaded.message });
    add({ path: file.path, content: loaded.bytes });
  }
  const manifest = Buffer.from(buildSiteBackupManifest({ ...plan, files: inventory }));
  if (manifest.length > SHARE_LIMITS.maxManifestBytes) throw new SiteShareRefusal({ code: "LIMIT_EXCEEDED", message: "Share manifest exceeds 2 MiB." });
  checkShareLimits({ files: [...inventory, { path: SITE_BACKUP_MANIFEST_PATH, bytes: manifest.length }] });
  files.push(new File([manifest], SITE_BACKUP_MANIFEST_PATH));
  optional.signal?.throwIfAborted();
  // Jini adds ZIP header overhead to the same archive cap before allocating the final File.
  try { return Buffer.from(await (await required.zip({ files, maxBytes: SHARE_LIMITS.maxArchiveBytes })).arrayBuffer()); }
  catch (error) {
    if (error instanceof Error && /limit|large|many/i.test(error.message)) throw new SiteShareRefusal({ code: "LIMIT_EXCEEDED", message: "Share exceeds the v1 300 MiB ZIP archive cap." });
    throw error;
  }
}
