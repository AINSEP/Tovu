import { useRecoveryCodeSignIn } from '@jini-ai/user-management/react';

import { ownerRecoveryFailure, type OwnerRecoveryPort } from '../../lib/owner-recovery-api';

import { type Translate } from '@jini-ai/core/text';
/** Reset the owner password with a one-use recovery code. */
export function useOwnerRecoverySignIn({ recover, t }: { recover: OwnerRecoveryPort['recover']; t: Translate }, _options = {}) {
  const controller = useRecoveryCodeSignIn({
    recover, t,
    describeFailure: ({ error }) => ownerRecoveryFailure({ error, message: 'The owner account could not be recovered.', action: 'Follow the server explanation. Ask the host operator for help if recovery is unavailable.', step: 'owner-recovery-redeem', t, secrets: [controller.code.trim(), controller.password] }),
    copy: {
      mismatch: t('The passwords do not match. Enter the same password in both fields. Details: owner-recovery-confirmation'),
      recovered: t('Owner password reset. Sign in with your new password. Authenticators, passkeys, sessions and recovery codes were invalidated.'),
      reset: '',
    },
  }, {});
  return controller;
}
