import type { ToolAccessChange } from '@jini-ai/daemon';
import { assistantDaemonToken } from '../../lifecycle/assistant-daemon-connection.js';
import { getAgentDaemonUrl } from '../../lifecycle/agent-daemon-port.js';
import type { DaemonCallOptions } from './assistant-daemon-client.js';

import { ToolAccessLoweringError } from '#src/assistant/external-mcp-roster-change';
export { ToolAccessLoweringError } from '#src/assistant/external-mcp-roster-change';

type LoweringOptions = DaemonCallOptions & { send?: typeof fetch; daemonUrl?: () => string; token?: () => string | undefined };

/** Resolve cold-safe host ports only when the caller did not supply them. */
async function loweringPorts(optional: LoweringOptions) {
  const isReady = optional.isReady ?? (await import('../../lifecycle/daemon-supervisor.js')).isAssistantDaemonReady;
  const send = () => optional.send ? Promise.resolve(optional.send) : import('./assistant-daemon-client.js').then(module => module.daemonFetch(optional));
  return { isReady, send, token: optional.token ?? assistantDaemonToken, url: optional.daemonUrl ?? getAgentDaemonUrl };
}

/** Await the existing daemon's Stop and cleanup; never launch a cold daemon just to stop nothing.
 * The endpoint and credential are selected by the site server, never supplied by a model.
 * @complexity One authenticated control request at most 1 KiB; bounded by the cleanup deadline.
 */
export async function lowerAssistantToolAccess(required: ToolAccessChange, optional: LoweringOptions = {}): Promise<void> {
  const ports = await loweringPorts(optional);
  if (!ports.isReady()) return;
  const body = JSON.stringify(required);
  if (Buffer.byteLength(body) > 1024) throw new ToolAccessLoweringError();
  const token = ports.token();
  if (!token) throw new ToolAccessLoweringError();
  try {
    const send = await ports.send();
    const response = await send(`${ports.url()}/api/tool-access/lower`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body, signal: AbortSignal.timeout(10_000),
    });
    const result = await response.json() as { ok?: unknown };
    if (!response.ok || result.ok !== true) throw new ToolAccessLoweringError();
  } catch { throw new ToolAccessLoweringError(); }
}
