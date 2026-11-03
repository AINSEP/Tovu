import { act, renderHook, waitFor } from '@/__tests__/fetch-query-render';
import { expect, it } from 'vitest';
import { createFakeAgentPluginsPort } from '../hooks/agent-plugins-dependencies.hooks';
import { useAgentPlugins } from '../hooks/use-agent-plugins.hooks';
import type { AdminAgentPlugin } from '@/lib/api';

it('returning from a plugin sign-in tab refreshes its signed-in badge', async () => {
  const plugin: AdminAgentPlugin = { pluginId: 'example-media', enabled: true, version: null, description: null,
    keywords: [], skills: [], mcpServerIds: ['example'], connectionStatus: 'disconnected' };
  const port = createFakeAgentPluginsPort();
  port.listAgentPlugins = async () => ({ agentPlugins: [{ ...plugin }] });
  const { result } = renderHook(() => useAgentPlugins({ port, locale: 'en', t: key => key }));
  await waitFor(() => expect(result.current.agentPlugins?.[0]?.connectionStatus).toBe('disconnected'));
  plugin.connectionStatus = 'connected';
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(result.current.agentPlugins?.[0]?.connectionStatus).toBe('connected'));
});
