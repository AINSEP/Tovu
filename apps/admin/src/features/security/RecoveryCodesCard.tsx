import { RecoveryCodesCard as JiniRecoveryCodesCard } from '@jini-ai/user-management/react/auth/RecoveryCodesCard';
import { createRecoveryKitDownload, useDesktopOwnerReset, useRecoveryKit } from './RecoveryCodesCard.hooks';
import { ErrorNotice } from '@jini-ai/ui/panel-kit';
import type { OwnerRecoveryPort } from '@jini-ai/user-management/react/auth/owner-recovery-api';
import { ownerRecoveryPort, ownerRecoveryFailure } from '../../lib/owner-clients';
import { type Translate } from '@jini-ai/core/text';
const identityTranslate: Translate = text => text;

/** Existing Security page adapter. Codes live only in component memory until saved/dismissed.
 * @complexity O(1), one small status read on mount; one ten-code write per explicit rotation.
 */
export function RecoveryCodesCard({ port = ownerRecoveryPort, t = identityTranslate }: { port?: OwnerRecoveryPort; t?: Translate }) {
  return <JiniRecoveryCodesCard port={port} t={t} describeFailure={ownerRecoveryFailure} FailureNotice={ErrorNotice} filename="tovu-owner-recovery-codes.txt" createDownloadHook={createRecoveryKitDownload} useRecoveryKitHook={useRecoveryKit} useDesktopOwnerResetHook={useDesktopOwnerReset} />;
}
