import { sql } from "kysely";
import type { ContentKernel } from "../content-kernel.js";
import type { BackstopAuditPort, BackstopAuditRecord, BackstopGap } from "#src/features/publish-content/backstop-audit";

/** Optional, staged schema: absent storage keeps the feature closed, without crashing boot. */
export function createBackstopAuditSqlitePort({ kernel }: { kernel: ContentKernel }, _optional: Record<string, never> = {}): BackstopAuditPort {
  return {
    ready: async () => (await kernel.query(sql`SELECT name FROM sqlite_schema WHERE type='table' AND name='publish_backstop_log'`)).length === 1,
    save: async ({ record }) => {
      await kernel.execute(sql`INSERT INTO publish_backstop_log
        (id, workspace_id, direction, actor_id, destination, reason, at, items_json, gap_labels_json, result, run_id, details_json, inverses_json)
        VALUES (${record.id}, ${record.workspaceId}, ${record.direction}, ${record.actorId}, ${record.destination}, ${record.reason}, ${record.at},
          ${JSON.stringify(record.items)}, ${JSON.stringify(record.gapLabels)}, ${record.result}, ${record.runId}, ${JSON.stringify(record.details)}, ${JSON.stringify(record.inverses)})
        ON CONFLICT(id) DO UPDATE SET result=excluded.result, run_id=excluded.run_id, details_json=excluded.details_json, inverses_json=excluded.inverses_json, items_json=excluded.items_json`);
    },
    get: async ({ workspaceId, id }) => {
      const [row] = await kernel.query<Record<string, unknown>>(sql`SELECT * FROM publish_backstop_log WHERE workspace_id=${workspaceId} AND (id=${id} OR run_id=${id}) ORDER BY direction ASC LIMIT 1`);
      if (!row) return null;
      return { id: row.id, workspaceId: row.workspace_id, direction: row.direction, actorId: row.actor_id, destination: row.destination, reason: row.reason,
        at: row.at, items: JSON.parse(row.items_json as string), gapLabels: JSON.parse(row.gap_labels_json as string), result: row.result, runId: row.run_id,
        details: JSON.parse(row.details_json as string), inverses: JSON.parse(row.inverses_json as string) } as BackstopAuditRecord;
    },
    gaps: async ({ workspaceId }) => {
      const events = await kernel.query<{ gap_labels_json: string; reason: string; at: string }>(sql`SELECT gap_labels_json, reason, at FROM publish_backstop_log WHERE workspace_id=${workspaceId} AND direction='source' AND result IN ('success', 'undone') ORDER BY at DESC`);
      const groups = new Map<string, BackstopGap>();
      for (const event of events) for (const label of new Set(JSON.parse(event.gap_labels_json) as string[])) {
        const prior = groups.get(label);
        groups.set(label, prior ? { ...prior, count: prior.count + 1 } : { label, count: 1, lastReason: event.reason, lastAt: event.at });
      }
      return [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    },
  };
}
