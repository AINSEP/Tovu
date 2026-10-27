/** Runtime-shaped fixture content projected into the current archive contract, never a v1 writer. */
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import path from "node:path";
import { buildShareZip } from "../share-zip.js";
import { runtimeToArchivePath } from "../archive-paths.js";
import { buildArchiveManifest, type ArchiveMedia, type ArchivePlugin } from "../archive-manifest.js";
import type { SiteSharePlanContent } from "../plan-store.js";
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

export function fixtureArchivePlan(required: { plan: SiteSharePlanContent; files?: ReadonlyMap<string, Buffer> }): SiteSharePlanContent {
  const source = required.files ?? new Map(required.plan.bufferedFiles?.map(file => [file.path, file.content]));
  const files = new Map<string, Buffer>();
  const media: ArchiveMedia[] = [];
  if (required.plan.database) {
    const db = new Database(required.plan.database.bytes);
    try {
      const rows = db.prepare("SELECT m.id,m.slug,m.original_filename,b.sha256,b.storage_key FROM media m JOIN asset_blobs b ON b.workspace_id=m.workspace_id AND b.sha256=m.source_sha256 WHERE m.kind <> 'document' OR m.status='active' ORDER BY m.id").all() as { id: string; slug: string | null; original_filename: string | null; sha256: string; storage_key: string }[];
      for (const row of rows) {
        const slug = row.slug ?? row.id;
        const ext = path.extname(row.original_filename ?? "").slice(1) || "bin";
        const file = `media/${slug}.${ext}`;
        const bytes = source.get("uploads/" + row.storage_key) ?? [...source.values()].find(bytes => sha(bytes) === row.sha256);
        if (bytes) { files.set(file, bytes); media.push({ id: row.id, slug, path: file, sha256: row.sha256 }); }
      }
    } finally { db.close(); }
  }
  for (const [file, bytes] of source) {
    if (file === "database/content.db" || file === "content.db" || file.startsWith("uploads/") || file.startsWith("media/")) continue;
    const mapped = file.startsWith("settings/") ? "settings.json" : runtimeToArchivePath({ path: file });
    if (mapped) files.set(mapped, bytes);
  }
  if (!files.has("settings.json")) files.set("settings.json", Buffer.from(JSON.stringify({ name: required.plan.site.name, template: {} })));
  const roots = new Map<string, ArchivePlugin>();
  for (const file of files.keys()) {
    const match = /^(agent-plugins|plugins)\/([^/]+)\/package\//.exec(file);
    if (!match) continue;
    const original = [...source.keys()].find(key => key.includes(`/${match[2]}/package/sha256/`));
    const digest = original?.match(/\/sha256\/([a-f0-9]{64})\//)?.[1] ?? "a".repeat(64);
    roots.set(match[1] + "/" + match[2], { kind: match[1] === "agent-plugins" ? "agent" : "site", id: match[2]!, version: "1.0.0", digest, enabled: false, shipped: true });
  }
  return { ...required.plan, media, plugins: [...roots.values()], files: [], bufferedFiles: [...files].map(([path, content]) => ({ path, content })), totalBytes: (required.plan.database?.bytes.length ?? 0) + [...files.values()].reduce((sum, bytes) => sum + bytes.length, 0) };
}
export async function buildFixtureShareZip(required: Parameters<typeof buildShareZip>[0], optional: Parameters<typeof buildShareZip>[1] = {}): Promise<Buffer> {
  return buildShareZip({ ...required, plan: fixtureArchivePlan({ plan: required.plan }) }, optional);
}
export function fixtureManifest(required: { plan: SiteSharePlanContent; files: ReadonlyMap<string, Buffer> }): string {
  return buildArchiveManifest({ schema: required.plan.schema, site: { name: required.plan.site.name }, scopes: required.plan.include, media: required.plan.media ?? [], plugins: required.plan.plugins ?? [], files: [...required.files].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha(bytes) })) });
}
