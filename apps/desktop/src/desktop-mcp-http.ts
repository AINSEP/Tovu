import { formatErrorForLog } from '@jini-ai/core';
import { TOVU_ERROR_REDACTION_OPTIONS } from '@tovu/contracts/secret-redaction';
/** Electron-main adapter: Jini owns HTTP/SDK hosting, the desktop table owns tool behavior. */
import { createMcpHttpToolServerRuntime, startMcpHttpToolServer, type McpHttpToolServerHandle } from '@jini-ai/mcp';
import { startCapabilityDelivery } from '@jini-ai/mcp/federation/hosted';
import { randomBytes } from 'node:crypto';
import { assertLoopbackAdminUrl } from './desktop-auth.ts';
import { createSitesMcpToolHost, type ToolContext } from './sites-mcp-tools.ts';
import { DESKTOP_MCP_URL_ENV, DESKTOP_MCP_TOKEN_ENV, DESKTOP_MCP_HANDOFF_ENV, SITES_MCP_SERVER_ID } from './sites-mcp-identity.ts';

/** Start the owning main's endpoint without a launcher, keyring or saved connection.
 * @example const bridge = await startDesktopMcpHttp({ context }, { warn });
 * @throws Listener errors for the main's best-effort startup/retry policy.
 * @complexity O(tool count) setup; dispatch cost belongs to each existing tool handler.
 */
export async function startDesktopMcpHttp({ context }: { context: ToolContext },
  { warn }: { warn?: (message: string) => void } = {},
): Promise<McpHttpToolServerHandle & { env: Record<string, string> }> {
  // Keep listener startup best-effort: an unavailable tools host degrades tools, not site boot.
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
export function createDesktopMcpHttpRuntime({ context, warn }: { context: ToolContext; warn: (required: { message: string }) => void },
  { start, fetch: fetchImpl = globalThis.fetch }: { start?: typeof startDesktopMcpHttp; fetch?: typeof fetch } = {},
): { environment(required: Record<string, never>, optional?: Record<string, never>): Promise<Record<string, string>>;
  connectSite(required: { adminUrl: string; onExit: (required: { listener: () => void }) => void }, optional?: Record<string, never>): void;
  close(required: Record<string, never>, optional?: Record<string, never>): Promise<void> } {
  const table = createSitesMcpToolHost({ context });
  const handoffToken = randomBytes(32).toString('hex');
  const disconnects = new Set<() => void>();
  let stopped = false;
  // The factory runs behind a best-effort boundary so startup errors do not refuse site boot
  // during the preparation/release handoff. Jini owns listener retries once available.
  const runtime = Promise.resolve().then(() => createMcpHttpToolServerRuntime({
    name: SITES_MCP_SERVER_ID, version: '1', tools: table.tools, resolveBaseUrl: () => '',
  }, { warn: (message) => warn({ message }), ...(start ? { start: () => start({ context }, { warn: (message) => warn({ message }) }) } : {}) })).catch(error => {
    warn({ message: `tovu-desktop: desktop tools host unavailable for this application release. ${formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS)}` });
    return undefined;
  });
  return {
    async environment(required, optional = {}) {
      if (stopped) return {};
      const capability = await (await runtime)?.capability(required, optional);
      if (stopped) return {};
      return { [DESKTOP_MCP_HANDOFF_ENV]: handoffToken,
        ...(capability ? { [DESKTOP_MCP_URL_ENV]: capability.url, [DESKTOP_MCP_TOKEN_ENV]: capability.token } : {}) };
    },
    connectSite({ adminUrl, onExit }, _optional = {}) {
      if (stopped) return;
      // Endpoint policy stays here: a loopback admin URL and this one fixed path, checked before any
      // delivery exists. Jini only POSTs to the endpoint it is handed and never follows a redirect.
      const endpoint = new URL('/internal/desktop-mcp-capability', assertLoopbackAdminUrl({ adminUrl }));
      let delivery: ReturnType<typeof startCapabilityDelivery> | undefined;
      let exited = false;
      const disconnect = () => { exited = true; delivery?.disconnect({}); disconnects.delete(disconnect); };
      disconnects.add(disconnect);
      onExit({ listener: disconnect });
      if (exited) return;
      // Delivery retries belong to the same Jini runtime that repairs the listener. Only this
      // spawning main has the handoff token. Attaching windows never call connectSite.
      delivery = startCapabilityDelivery({ endpoint, handoffToken, host: runtime, fetch: fetchImpl,
        // A fixed string: the cause may name a path or port, and nothing here may carry a token.
        onUnavailable: () => { warn({ message: 'tovu-desktop: desktop capability recovery unavailable for this application release.' }); },
      });
    },
    async close(required, optional = {}) {
      stopped = true;
      for (const disconnect of disconnects) disconnect();
      await (await runtime)?.close(required, optional);
      await table.drain({});
    },
  };
}
