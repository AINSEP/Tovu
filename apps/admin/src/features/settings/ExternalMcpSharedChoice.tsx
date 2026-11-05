import { useState } from 'react';
import { api, describeApiError } from '@/lib/api';

type SharedView = Awaited<ReturnType<typeof api.listSharedMcpConnections>>;
/** Owner choices are loaded only when opened. Existing local sign-ins keep their original action. */
export function ExternalMcpSharedChoice({ serverId, busy, signIn, onChanged }: {
  serverId: string; busy: boolean; signIn: () => void; onChanged: () => void;
}) {
  const [view, setView] = useState<SharedView>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  async function load() {
    setPending(true); setError('');
    try { setView(await api.listSharedMcpConnections(serverId)); }
    catch (cause) { setError(describeApiError(cause, 'Saved connections could not be opened. Try opening them again.')); }
    finally { setPending(false); }
  }
  async function useSaved(credentialId: string) {
    if (!credentialId) return;
    setPending(true); setError('');
    try { await api.useSharedMcpConnection({ serverId, credentialId }); await load(); onChanged(); }
    catch (cause) { setError(describeApiError(cause, 'This saved connection could not be granted to this server. Choose another connection or sign in.')); }
    finally { setPending(false); }
  }
  async function stopHere() {
    setPending(true); setError('');
    try { await api.stopSharedMcpConnection(serverId); await load(); onChanged(); }
    catch (cause) { setError(describeApiError(cause, 'The connection could not be stopped here. Try again.')); }
    finally { setPending(false); }
  }
  return <div className="external-mcp-shared-choice">
    <button type="button" disabled={busy || pending} onClick={() => void load()}>Use a saved connection on this Mac</button>
    {view?.available && <>
      <button type="button" disabled={busy || pending} onClick={signIn}>Sign in and save on this Mac</button>
      <label>Saved connection <select aria-label="Saved MCP connection" disabled={busy || pending} value="" onChange={event => void useSaved(event.target.value)}>
        <option value="">Choose a saved connection</option>
        {view.connections.map(item => <option key={item.credentialId} value={item.credentialId}>{item.label}</option>)}
      </select></label>
      {view.current && <p>{view.current.granted ? `Shared connection: ${view.current.status}.` : 'This shared connection is stopped on this site.'}
        {view.current.granted && <button type="button" disabled={busy || pending} onClick={() => void stopHere()}>Stop using here</button>}</p>}
      <p>Saving here lets you grant this connection to other sites on this Mac. Existing local connections stay separate.</p>
    </>}
    {view && !view.available && <p>Saved connections are available in the desktop owner profile.</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
