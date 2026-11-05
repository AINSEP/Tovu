import type { Express } from 'express';
import { z } from 'zod';
import type { ToolAccessChange, ToolAccessStopResult } from '@jini-ai/daemon';

export const TOOL_ACCESS_LOWERING_PATH = '/api/tool-access/lower';
const ids = z.array(z.string().min(1).max(128)).max(32).optional();
const changeSchema = z.object({ agentIds: ids, serverIds: ids, pluginIds: ids }).strict()
  .refine(value => [value.agentIds, value.serverIds, value.pluginIds].some(values => values && values.length > 0));

/** The full daemon bearer gate is mounted by the scope before this route; run credentials cannot
 * call this path. Input never selects a site or principal, only launch snapshots in this scope.
 * @complexity O(n) validated IDs, with a 1 KiB control payload cap and no polling.
 */
export function registerToolAccessLoweringRoute({ app, lower }: {
  app: Pick<Express, 'post'>;
  lower: (required: ToolAccessChange) => Promise<ToolAccessStopResult>;
}, _optional = {}): void {
  app.post(TOOL_ACCESS_LOWERING_PATH, async (req, res) => {
    const parsed = changeSchema.safeParse(req.body);
    if (!parsed.success || Buffer.byteLength(JSON.stringify(req.body)) > 1024) {
      res.status(400).json({ error: 'Tool access changes require agent, server, or plugin IDs in a control payload at most 1 KiB.' }); return;
    }
    try {
      const result = await lower(parsed.data);
      res.status(result.failedRunIds.length === 0 ? 200 : 503).json({ ok: result.failedRunIds.length === 0, ...result });
    } catch {
      res.status(503).json({ ok: false, error: "Couldn't stop affected answers after tool access changed." });
    }
  });
}
