/** Electron-main adapter: Jini owns HTTP/SDK hosting, the desktop table owns tool behavior. */
import type { McpHttpToolServerHandle } from '@jini-ai/mcp';
import { createSitesMcpToolHost, type ToolContext } from './sites-mcp-tools.ts';
import { DESKTOP_MCP_URL_ENV, DESKTOP_MCP_TOKEN_ENV, SITES_MCP_SERVER_ID } from './sites-mcp-identity.ts';

/** Start the owning main's endpoint without a launcher, keyring or saved connection.
 * @example const bridge = await startDesktopMcpHttp({ context }, { warn });
 * @throws Listener errors for the main's best-effort startup/retry policy.
 * @complexity O(tool count) setup; dispatch cost belongs to each existing tool handler.
 */
export async function startDesktopMcpHttp({ context }: { context: ToolContext },
  { warn }: { warn?: (message: string) => void } = {},
): Promise<McpHttpToolServerHandle & { env: Record<string, string> }> {
  // Load inside the best-effort start: an unavailable package adapter degrades tools, not site boot.
  const { startMcpHttpToolServer } = await import('@jini-ai/mcp');
  const table = createSitesMcpToolHost({ context });
  const host = await startMcpHttpToolServer({ name: SITES_MCP_SERVER_ID, version: '1', tools: table.tools, resolveBaseUrl: () => '' }, { warn });
  return { ...host, env: { [DESKTOP_MCP_URL_ENV]: host.url, [DESKTOP_MCP_TOKEN_ENV]: host.token },
    async close(required, optional = {}) { await host.close(required, optional); await table.drain({}); },
  };
}

/** One main owns one listener, shared by every site it spawns. Startup errors warn and retry
 * in the background; an attaching main never calls this supplier for someone else's server.
 * @example const runtime = createDesktopMcpHttpRuntime({ context, warn });
 * @complexity O(1) state; per-call work belongs to the table/HTTP host.
 */
export function createDesktopMcpHttpRuntime({ context, warn }: { context: ToolContext; warn: (message: string) => void },
  { start }: { start?: typeof startDesktopMcpHttp } = {},
): { environment(required: Record<string, never>, optional?: Record<string, never>): Promise<Record<string, string>>; close(required: Record<string, never>, optional?: Record<string, never>): Promise<void> } {
  const table = createSitesMcpToolHost({ context });
  // The package is loaded behind a best-effort boundary so missing runtime exports cannot refuse
  // site boot during the preparation/release handoff. Jini owns listener retries once available.
  const runtime = import('@jini-ai/mcp').then(({ createMcpHttpToolServerRuntime }) => createMcpHttpToolServerRuntime({
    name: SITES_MCP_SERVER_ID, version: '1', tools: table.tools, resolveBaseUrl: () => '',
  }, { warn, ...(start ? { start: () => start({ context }, { warn }) } : {}) })).catch(() => {
    warn('tovu-desktop: desktop tools host unavailable for this application release.');
    return undefined;
  });
  return {
    async environment(required, optional = {}) {
      const capability = await (await runtime)?.capability(required, optional);
      return capability ? { [DESKTOP_MCP_URL_ENV]: capability.url, [DESKTOP_MCP_TOKEN_ENV]: capability.token } : {};
    },
    async close(required, optional = {}) {
      await (await runtime)?.close(required, optional);
      await table.drain({});
    },
  };
}
