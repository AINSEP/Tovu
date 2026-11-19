import { useRecoveryKit as useJiniRecoveryKit, createRecoveryKitDownload as createJiniRecoveryKitDownload, useOwnerPasswordReset } from '@jini-ai/user-management/react';

import { ownerRecoveryFailure, type OwnerRecoveryPort } from '../../lib/owner-recovery-api';

import { type Translate } from '@jini-ai/core/text';
/** Issue a fresh recovery kit after password proof. */
export function useRecoveryKit({ port, t }: { port: OwnerRecoveryPort; t: Translate }, _options = {}) {
  const controller = useJiniRecoveryKit({
    issue: port.issue,
    describeFailure: ({ error }) => ownerRecoveryFailure({ error, message: 'Recovery codes could not be generated.', action: 'Follow the server explanation before generating another set. Ask the host operator for help if it continues.', step: 'owner-recovery-issue', t, secrets: [controller.password, controller.code] }),
  }, {});
  return controller;
}

/** Download the displayed codes and clear them from the view. */
export function createRecoveryKitDownload({ codes, dismiss }: { codes: string[]; dismiss: () => void }, _options = {}) {
  return createJiniRecoveryKitDownload({ codes, dismiss, filename: 'tovu-owner-recovery-codes.txt', saveTextFile: ({ text, filename }) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
    URL.revokeObjectURL(url);
  } }, {});
}

/** Reset the desktop owner's password using its restored owner session. */
export function useDesktopOwnerReset({ port, t }: { port: OwnerRecoveryPort; t: Translate }, _options = {}) {
  const controller = useOwnerPasswordReset({
    reset: port.reset, t,
    describeFailure: ({ error }) => ownerRecoveryFailure({ error, message: 'The owner password could not be reset.', action: 'Follow the server explanation. Reopen this site in the desktop app to renew local proof if it was refused.', step: 'desktop-owner-reset', t, secrets: [controller.password] }),
    copy: {
      mismatch: t('The passwords do not match. Enter the same password in both fields. Details: desktop-owner-confirmation'),
      recovered: '',
      reset: t('Owner password reset. All sessions and recovery codes were invalidated. Reopen the site or sign in with your new password.'),
    },
  }, {});
  return controller;
}
