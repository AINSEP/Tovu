import { useExternalMcpSharedChoice, type SharedView } from './ExternalMcpSharedChoice.hooks';

import { interpolate, type Translate } from '@jini-ai/core/text';
/** Owner choices are loaded only when opened. Existing local sign-ins keep their original action. */
export function ExternalMcpSharedChoice({ serverId, busy, signIn, onChanged, t,
  useExternalMcpSharedChoiceHook = useExternalMcpSharedChoice }: {
  serverId: string; busy: boolean; signIn: () => void; onChanged: () => void; t: Translate;
  useExternalMcpSharedChoiceHook?: typeof useExternalMcpSharedChoice;
}) {
  const { view, error, pending, load, useSaved, stopHere, useLocal } = useExternalMcpSharedChoiceHook({ serverId, onChanged });
  return <div className="external-mcp-shared-choice">
    <button type="button" disabled={busy || pending} onClick={() => void load()}>{t('Use a saved connection on this Mac')}</button>
    <SharedChoices view={view} disabled={busy || pending} signIn={signIn} useSaved={({ credentialId }, _options = {}) => void useSaved({ credentialId })} stopHere={() => void stopHere()} useLocal={() => void useLocal()} t={t} />
    {error && <p role="alert">{error}</p>}
  </div>;
}

function SharedChoices({ view, disabled, signIn, useSaved, stopHere, useLocal, t }: { view: SharedView | undefined; disabled: boolean; signIn: () => void; useSaved: (input: { credentialId: string }, options?: Record<string, never>) => void; stopHere: () => void; useLocal: () => void; t: Translate }) {
  if (!view) return null;
  if (!view.available) return <p>{t('Saved connections are available in the desktop owner profile.')}</p>;
  return <>
    <button type="button" disabled={disabled} onClick={signIn}>{t('Sign in and save on this Mac')}</button>
    <label>{t('Saved connection')} <select aria-label={t('Saved MCP connection')} disabled={disabled} value="" onChange={event => useSaved({ credentialId: event.target.value })}>
      <option value="">{t('Choose a saved connection')}</option>
      {view.connections.map(item => <option key={item.credentialId} value={item.credentialId}>{item.label}</option>)}
    </select></label>
    {view.current && <button type="button" disabled={disabled} onClick={useLocal}>{t("Use this site's local connection")}</button>}
    {view.current && <p>{view.current.granted ? interpolate({ template: t('Shared connection: {status}.'), vars: { status: view.current.status } }) : t('This shared connection is stopped on this site.')}
      {view.current.granted && <button type="button" disabled={disabled} onClick={stopHere}>{t('Stop using here')}</button>}</p>}
    <p>{t('Saving here lets you grant this connection to other sites on this Mac. Existing local connections stay separate.')}</p>
  </>;
}
