import { useState } from 'react';
import { api, describeApiError } from '@/lib/api';
import { interpolate, type Translate } from '@jini-ai/ui/panel-kit';

type SharedView = Awaited<ReturnType<typeof api.listSharedMcpConnections>>;
/** Owner choices are loaded only when opened. Existing local sign-ins keep their original action. */
export function ExternalMcpSharedChoice({ serverId, busy, signIn, onChanged, t }: {
  serverId: string; busy: boolean; signIn: () => void; onChanged: () => void; t: Translate;
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
  async function useLocal() {
    setPending(true); setError('');
    try { await api.useLocalMcpConnection(serverId); await load(); onChanged(); }
    catch (cause) { setError(describeApiError(cause, 'The local connection could not be selected. Try again.')); }
    finally { setPending(false); }
  }
  return <div className="external-mcp-shared-choice">
    <button type="button" disabled={busy || pending} onClick={() => void load()}>{t('Use a saved connection on this Mac')}</button>
    <SharedChoices view={view} disabled={busy || pending} signIn={signIn} useSaved={credentialId => void useSaved(credentialId)} stopHere={() => void stopHere()} useLocal={() => void useLocal()} t={t} />
    {error && <p role="alert">{error}</p>}
  </div>;
}

function SharedChoices({ view, disabled, signIn, useSaved, stopHere, useLocal, t }: { view: SharedView | undefined; disabled: boolean; signIn: () => void; useSaved: (id: string) => void; stopHere: () => void; useLocal: () => void; t: Translate }) {
  if (!view) return null;
  if (!view.available) return <p>{t('Saved connections are available in the desktop owner profile.')}</p>;
  return <>
    <button type="button" disabled={disabled} onClick={signIn}>{t('Sign in and save on this Mac')}</button>
    <label>{t('Saved connection')} <select aria-label={t('Saved MCP connection')} disabled={disabled} value="" onChange={event => useSaved(event.target.value)}>
      <option value="">{t('Choose a saved connection')}</option>
      {view.connections.map(item => <option key={item.credentialId} value={item.credentialId}>{item.label}</option>)}
    </select></label>
    {view.current && <button type="button" disabled={disabled} onClick={useLocal}>{t("Use this site's local connection")}</button>}
    {view.current && <p>{view.current.granted ? interpolate({ template: t('Shared connection: {status}.'), vars: { status: view.current.status } }) : t('This shared connection is stopped on this site.')}
      {view.current.granted && <button type="button" disabled={disabled} onClick={stopHere}>{t('Stop using here')}</button>}</p>}
    <p>{t('Saving here lets you grant this connection to other sites on this Mac. Existing local connections stay separate.')}</p>
  </>;
}
