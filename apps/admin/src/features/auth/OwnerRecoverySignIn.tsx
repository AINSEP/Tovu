import { ErrorNotice, type Translate } from '@jini-ai/ui/panel-kit';
import type { UserFacingError } from '@jini-ai/core';
import { useState, type FormEvent } from 'react';
import { AGENT_PRIVATE_ATTRIBUTE } from '@jini-ai/agentic';
import { SecretInput } from '@/components/SecretInput/SecretInput';
import { ownerRecoveryPort, ownerRecoveryFailure, type OwnerRecoveryPort } from '../../lib/owner-recovery-api';

const identityTranslate: Translate = text => text;

/** Sign-in adapter for a lost owner password; code scope is selected only by the server.
 * @complexity O(1), one request on explicit submit (64-character code and bounded password), no polling.
 */
export function OwnerRecoverySignIn({ recover = ownerRecoveryPort.recover, t = identityTranslate }: { recover?: OwnerRecoveryPort['recover']; t?: Translate }) {
  const [code, setCode] = useState(''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [failure, setFailure] = useState<UserFacingError | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmation) { setMessage(t('The passwords do not match. Enter the same password in both fields. Details: owner-recovery-confirmation')); return; }
    setBusy(true); setMessage(''); setFailure(null);
    try {
      await recover({ code: code.trim(), password });
      setMessage(t('Owner password reset. Sign in with your new password. Authenticators, passkeys, sessions and recovery codes were invalidated.'));
    } catch (error) { setFailure(ownerRecoveryFailure({ error, message: 'The owner account could not be recovered.', action: 'Follow the server explanation. Ask the host operator for help if recovery is unavailable.', step: 'owner-recovery-redeem', t, secrets: [code.trim(), password] })); }
    finally { setCode(''); setPassword(''); setConfirmation(''); setBusy(false); }
  }
  return <details className="login-card"><summary>{t('Lost your owner password?')}</summary>
    <p>{t('Use a saved recovery code to reset your password and remove authenticators and passkeys. Without a code, ask the host operator to recover this site.')}</p>
    <form onSubmit={submit}>
      <label htmlFor="owner-recovery-code">{t('Recovery code')}</label>
      <SecretInput id="owner-recovery-code" label={t('Recovery code')} autoComplete="off" maxLength={64} value={code} onChange={event => setCode(event.target.value)} {...{ [AGENT_PRIVATE_ATTRIBUTE]: '' }} />
      <label htmlFor="owner-recovery-password">{t('New password')}</label>
      <SecretInput id="owner-recovery-password" label={t('New password')} autoComplete="new-password" maxLength={512} value={password} onChange={event => setPassword(event.target.value)} {...{ [AGENT_PRIVATE_ATTRIBUTE]: '' }} />
      <label htmlFor="owner-recovery-confirm">{t('Confirm new password')}</label>
      <SecretInput id="owner-recovery-confirm" label={t('Confirm new password')} autoComplete="new-password" maxLength={512} value={confirmation} onChange={event => setConfirmation(event.target.value)} {...{ [AGENT_PRIVATE_ATTRIBUTE]: '' }} />
      <button disabled={busy || !code || !password}>{t('Recover owner account')}</button>
    </form>
    {failure ? <ErrorNotice failure={failure} t={t} /> : null}
    {message ? <p className="notice" role="status">{message}</p> : null}
  </details>;
}
