import { useState, type FormEvent } from 'react';
import type { UserFacingError } from '@jini-ai/core';
import type { Translate } from '@jini-ai/ui/panel-kit';
import { ownerRecoveryFailure, type OwnerRecoveryPort } from '../../lib/owner-recovery-api';

/** Issue a fresh recovery kit after password proof. */
export function useRecoveryKit({ port, t }: { port: OwnerRecoveryPort; t: Translate }, _options = {}) {
  const [password, setPassword] = useState(''), [code, setCode] = useState(''), [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState<UserFacingError | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null); setCodes([]);
    try { setCodes((await port.issue({ password, ...(code ? { code } : {}) })).codes); }
    catch (error) { setError(ownerRecoveryFailure({ error, message: 'Recovery codes could not be generated.', action: 'Follow the server explanation before generating another set. Ask the host operator for help if it continues.', step: 'owner-recovery-issue', t, secrets: [password, code] })); }
    finally { setPassword(''); setCode(''); setBusy(false); }
  }
  return { password, setPassword, code, setCode, codes, setCodes, busy, error, submit };
}

/** Download the displayed codes and clear them from the view. */
export function createRecoveryKitDownload({ codes, dismiss }: { codes: string[]; dismiss: () => void }, _options = {}) {
  function download() {
    const url = URL.createObjectURL(new Blob([codes.join('\n') + '\n'], { type: 'text/plain' }));
    const link = document.createElement('a'); link.href = url; link.download = 'tovu-owner-recovery-codes.txt'; link.click();
    URL.revokeObjectURL(url); dismiss();
  }
  return download;
}

/** Reset the desktop owner's password using its restored owner session. */
export function useDesktopOwnerReset({ port, t }: { port: OwnerRecoveryPort; t: Translate }, _options = {}) {
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
  return { password, setPassword, confirmation, setConfirmation, busy, message, failure, submit };
}
