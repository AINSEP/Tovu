import { useState } from 'react';
import { integrationsApi } from '@/features/integrations/api/integrations-api';
import { describeApiError } from '@/lib/admin-http/request';

export type SharedView = Awaited<ReturnType<typeof integrationsApi.listSharedMcpConnections>>;

/** Load and select owner-saved MCP connections for this server. */
export function useExternalMcpSharedChoice({ serverId, onChanged }: { serverId: string; onChanged: () => void }, _options = {}) {
  const [view, setView] = useState<SharedView>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  async function load() {
    setPending(true); setError('');
    try { setView(await integrationsApi.listSharedMcpConnections({ serverId })); }
    catch (cause) { setError(describeApiError({ e: cause, fallback: 'Saved connections could not be opened. Try opening them again.' })); }
    finally { setPending(false); }
  }
  async function useSaved({ credentialId }: { credentialId: string }, _options = {}) {
    if (!credentialId) return;
    setPending(true); setError('');
    try { await integrationsApi.useSharedMcpConnection({ serverId, credentialId }); await load(); onChanged(); }
    catch (cause) { setError(describeApiError({ e: cause, fallback: 'This saved connection could not be granted to this server. Choose another connection or sign in.' })); }
    finally { setPending(false); }
  }
  async function stopHere() {
    setPending(true); setError('');
    try { await integrationsApi.stopSharedMcpConnection({ serverId }); await load(); onChanged(); }
    catch (cause) { setError(describeApiError({ e: cause, fallback: 'The connection could not be stopped here. Try again.' })); }
    finally { setPending(false); }
  }
  async function useLocal() {
    setPending(true); setError('');
    try { await integrationsApi.useLocalMcpConnection({ serverId }); await load(); onChanged(); }
    catch (cause) { setError(describeApiError({ e: cause, fallback: 'The local connection could not be selected. Try again.' })); }
    finally { setPending(false); }
  }
  return { view, error, pending, load, useSaved, stopHere, useLocal };
}
