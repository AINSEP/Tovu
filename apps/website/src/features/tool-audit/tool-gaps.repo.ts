import { TOOL_GAP_AUDIT_ID, decodeToolGapEntry } from '@jini-ai/daemon/tool-audit';
import type { ContentKernel } from '../../platform/db/content-kernel.js';
import type { ToolGapReadPort } from './tool-gaps.js';

/** Read the existing bounded audit table, keeping the newest explanation revision per fallback.
 * One query, scoped to this workspace and principal before grouping; no new table/migration.
 * O(n) over at most the audit retention cap; returns at most 200 redacted summaries.
 */
export function createToolGapReader(required: { kernel: ContentKernel }, _optional = {}): ToolGapReadPort {
  return {
    async list({ workspaceId, principalId }, { limit = 100 } = {}) {
      const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.trunc(limit))) : 100;
      const rows = await required.kernel.run(db => db.selectFrom('agent_tool_attempts').select('detail')
        .where('id', 'in', db.selectFrom('agent_tool_attempts').select(({ fn }) => fn.max('id').as('latest_id'))
          .where('workspace_id', '=', workspaceId).where('principal_id', '=', principalId)
          .where('tool_id', '=', TOOL_GAP_AUDIT_ID).groupBy('attempt_id'))
        .orderBy('id', 'desc').limit(boundedLimit).execute());
      return rows.flatMap(row => {
        const entry = decodeToolGapEntry({ json: row.detail }, {});
        return entry ? [entry] : [];
      });
    },
  };
}
