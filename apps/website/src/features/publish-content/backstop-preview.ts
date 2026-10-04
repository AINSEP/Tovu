import { createHash } from "node:crypto";
import { checkRawTable, checkRawFilePath, checkRawValues } from "./backstop-policy.js";
import type { BackstopPorts, RawRowSnapshot } from "./backstop-ports.js";
import type { PackedEntity } from "./type-registry.js";

export interface BackstopPreview {
  readonly entityType: string;
  readonly entityId: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly unavailableReason: string | null;
}

function safeValues({ row, workspaceId }: { row: RawRowSnapshot; workspaceId: string }, _optional = {}): string | null {
  return checkRawTable({ table: row.table, columns: [...row.columns.map((column) => column.name), ...Object.keys(row.values)] }) ??
    (Object.hasOwn(row.values, "workspace_id") && row.values.workspace_id !== workspaceId ? "This row belongs to a different workspace." : null) ??
    checkRawValues({ table: row.table, values: Object.fromEntries(Object.entries(row.values).map(([name, value]) => [name,
      typeof value === "object" && value !== null ? Buffer.from(value.blobBase64, "base64").toString("utf8") : value])) });
}

/** Only called after import-plan authorization. Preview re-runs the immutable policy on LIVE
 * values too: a safe source must never be used to read a newly private live column or workspace.
 * File values are checksum/size/mode, never arbitrary file text or private absolute paths. */
export async function buildBackstopPreview(
  { entities, backstop, workspaceId }: { entities: readonly PackedEntity[]; backstop: BackstopPorts; workspaceId: string },
  _optional: Record<string, never> = {},
): Promise<readonly BackstopPreview[]> {
  const previews: BackstopPreview[] = [];
  for (const entity of entities) {
    if (entity.entityType !== "raw-row" && entity.entityType !== "raw-file") continue;
    const preview: BackstopPreview = { entityType: entity.entityType, entityId: entity.id, before: null, after: null, unavailableReason: null };
    try {
      if (entity.entityType === "raw-row") {
        const incoming = entity.state as unknown as RawRowSnapshot;
        const denied = safeValues({ row: incoming, workspaceId }) ??
          (backstop.coveredTables.some((table) => table.toLowerCase() === incoming.table.toLowerCase()) ? "This table already publishes normally." : null);
        if (denied) { previews.push({ ...preview, unavailableReason: denied }); continue; }
        if (!backstop.rows) { previews.push({ ...preview, unavailableReason: "Live row values are not available." }); continue; }
        const live = await backstop.rows.read({ table: incoming.table, pk: incoming.pk });
        const privateLive = live ? safeValues({ row: live, workspaceId }) : null;
        previews.push({ ...preview, before: privateLive ? null : live?.values ?? null, after: incoming.values, unavailableReason: privateLive });
      } else {
        const denied = checkRawFilePath({ relPath: entity.id }) ??
          (backstop.coveredRoots.some((root) => entity.id.toLowerCase() === root.toLowerCase().replace(/\/$/, "") || entity.id.toLowerCase().startsWith(root.toLowerCase().replace(/\/$/, "") + "/")) ? "This file already publishes normally." : null) ??
          await backstop.files?.check({ relPath: entity.id });
        if (denied) { previews.push({ ...preview, unavailableReason: denied }); continue; }
        if (!backstop.files) { previews.push({ ...preview, unavailableReason: "Live file values are not available." }); continue; }
        const live = await backstop.files.read({ relPath: entity.id });
        const before = live ? { path: entity.id, sha256: createHash("sha256").update(live.bytes).digest("hex"), size: live.bytes.byteLength, mode: live.mode & 0o111 ? 0o755 : 0o644 } : null;
        const { path, sha256, size, mode } = entity.state;
        previews.push({ ...preview, before, after: { path, sha256, size, mode } });
      }
    } catch {
      previews.push({ ...preview, unavailableReason: "These values could not be inspected safely. Check again before sending." });
    }
  }
  return previews;
}
