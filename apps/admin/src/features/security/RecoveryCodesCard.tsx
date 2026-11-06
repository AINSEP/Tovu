import { ErrorNotice, type Translate } from '@jini-ai/ui/panel-kit';
import type { UserFacingError } from '@jini-ai/core';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AGENT_PRIVATE_ATTRIBUTE } from '@jini-ai/agentic';
import { SecretInput } from '@/components/SecretInput/SecretInput';
import { ownerRecoveryPort, ownerRecoveryFailure, type OwnerRecoveryPort, type OwnerRecoveryStatus } from '../../lib/owner-recovery-api';

const identityTranslate: Translate = text => text;

/** Existing Security page adapter. Codes live only in component memory until saved/dismissed.
 * @complexity O(1), one small status read on mount; one ten-code write per explicit rotation.
 */
export function RecoveryCodesCard({ port = ownerRecoveryPort, t = identityTranslate }: { port?: OwnerRecoveryPort; t?: Translate }) {
  const [status, setStatus] = useState<OwnerRecoveryStatus>();
  const [loadError, setLoadError] = useState<{ cause: unknown } | null>(null);
  useEffect(() => {
    let active = true;
    void port.status().then(value => { if (active) setStatus(value); }).catch(error => {
      if (active) setLoadError({ cause: error });
    });
    return () => { active = false; };
  }, [port]);
  const error = useMemo(() => loadError ? ownerRecoveryFailure({ error: loadError.cause,
    message: 'Owner recovery settings could not load.',
    action: 'Reload this page after resolving the server explanation. Ask the host operator to check the identity database if it continues.',
    step: 'owner-recovery-status', t }) : null, [loadError, t]);
  if (error) return <ErrorNotice failure={error} t={t} />;
  if (!status) return <p>{t('Loading owner recovery…')}</p>;
  if (!status.isOwner || !status.available) return null;
  return <section className="card">
    <h3>{t('Recovery codes')}</h3>
    <p>{t('Save ten single-use codes somewhere private. Using one resets your owner password, removes authenticators and passkeys, signs out all sessions and invalidates every code in the set.')}</p>
    <RecoveryKit port={port} t={t} />
    {status.desktopOwnerReset ? <DesktopOwnerReset port={port} t={t} /> : null}
  </section>;
}

/** Issue only after password proof; never persist raw codes or leave the submitted password in state.
 * @complexity O(1), one rotation per submit and at most ten codes in memory.
 */
function RecoveryKit({ port, t }: { port: OwnerRecoveryPort; t: Translate }) {
  const [password, setPassword] = useState(''), [code, setCode] = useState(''), [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState<UserFacingError | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null); setCodes([]);
    try { setCodes((await port.issue({ password, ...(code ? { code } : {}) })).codes); }
    catch (error) { setError(ownerRecoveryFailure({ error, message: 'Recovery codes could not be generated.', action: 'Follow the server explanation before generating another set. Ask the host operator for help if it continues.', step: 'owner-recovery-issue', t, secrets: [password, code] })); }
    finally { setPassword(''); setCode(''); setBusy(false); }
  }
  return <div>
    <form onSubmit={submit}>
      <label htmlFor="recovery-current-password">{t('Current owner password')}</label>
      <SecretInput id="recovery-current-password" label={t('Current owner password')} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} {...{ [AGENT_PRIVATE_ATTRIBUTE]: '' }} />
      <label>{t('Authenticator code (if enabled)')}<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} data-agent-private="" value={code} onChange={event => setCode(event.target.value)} /></label>
      <button className="btn-primary" disabled={busy || !password}>{t('Generate recovery codes')}</button>
      <p>{t('Generating a new set invalidates all previous codes. Codes are shown only now.')}</p>
    </form>
    {error ? <ErrorNotice failure={error} t={t} /> : null}
    {codes.length ? <RecoveryKitOutput codes={codes} dismiss={() => setCodes([])} t={t} /> : null}
  </div>;
}

/** Download the currently displayed kit once, then erase it from this view. No server read.
 * @complexity O(1), one local blob of ten codes (~650 bytes), immediately released.
 */
function RecoveryKitOutput({ codes, dismiss, t }: { codes: string[]; dismiss: () => void; t: Translate }) {
  function download() {
    const url = URL.createObjectURL(new Blob([codes.join('\n') + '\n'], { type: 'text/plain' }));
    const link = document.createElement('a'); link.href = url; link.download = 'tovu-owner-recovery-codes.txt'; link.click();
    URL.revokeObjectURL(url); dismiss();
  }
  return <div {...{ [AGENT_PRIVATE_ATTRIBUTE]: '' }}>
    <pre>{codes.join('\n')}</pre>
    <button type="button" className="btn-secondary" onClick={download}>{t('Download codes')}</button>
    <button type="button" className="btn-secondary" onClick={dismiss}>{t('I saved these codes')}</button>
  </div>;
}

/** Desktop proof restores the ordinary owner session before this action is offered by the server.
 * @complexity O(1) UI state, one reset request per explicit submit; no staff promotion.
 */
function DesktopOwnerReset({ port, t }: { port: OwnerRecoveryPort; t: Translate }) {
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [failure, setFailure] = useState<UserFacingError | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmation) { setMessage(t('The passwords do not match. Enter the same password in both fields. Details: desktop-owner-confirmation')); return; }
    setBusy(true); setMessage(''); setFailure(null);
    try { await port.reset({ password }); setMessage(t('Owner password reset. All sessions and recovery codes were invalidated. Reopen the site or sign in with your new password.')); }
    catch (error) { setFailure(ownerRecoveryFailure({ error, message: 'The owner password could not be reset.', action: 'Follow the server explanation. Reopen this site in the desktop app to renew local proof if it was refused.', step: 'desktop-owner-reset', t, secrets: [password] })); }
    finally { setPassword(''); setConfirmation(''); setBusy(false); }
  }
  return <details><summary>{t('Reset owner password')}</summary>
    <p>{t('Your desktop launch restored your owner session. Choose a new password; this signs out all sessions and invalidates recovery codes.')}</p>
    <form onSubmit={submit}>
      <label htmlFor="desktop-owner-password">{t('New owner password')}</label>
      <SecretInput id="desktop-owner-password" label={t('New owner password')} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} {...{ [AGENT_PRIVATE_ATTRIBUTE]: '' }} />
      <label htmlFor="desktop-owner-confirm">{t('Confirm new owner password')}</label>
      <SecretInput id="desktop-owner-confirm" label={t('Confirm new owner password')} autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} {...{ [AGENT_PRIVATE_ATTRIBUTE]: '' }} />
      <label>{t('Authenticator code (if enabled)')}<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} data-agent-private="" value={code} onChange={event => setCode(event.target.value)} /></label>
      <button className="btn-primary" disabled={busy || !password}>{t('Reset password and sign out sessions')}</button>
    </form>
    {failure ? <ErrorNotice failure={failure} t={t} /> : null}
    {message ? <p className="notice" role="status">{message}</p> : null}
  </details>;
}
