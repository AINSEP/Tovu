import { useState, type FormEvent } from 'react';
import type { UserFacingError } from '@jini-ai/core';
import type { Translate } from '@jini-ai/ui/panel-kit';
import { ownerRecoveryFailure, type OwnerRecoveryPort } from '../../lib/owner-recovery-api';

/** Reset the owner password with a one-use recovery code. */
export function useOwnerRecoverySignIn({ recover, t }: { recover: OwnerRecoveryPort['recover']; t: Translate }, _options = {}) {
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
  return { code, setCode, password, setPassword, confirmation, setConfirmation, failure, busy, message, submit };
}
