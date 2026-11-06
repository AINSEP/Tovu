import { formatUserFacingError, type UserFacingError } from '@jini-ai/core';
import { TOVU_ERROR_REDACTION_OPTIONS } from '@tovu/contracts/secret-redaction';
import type { Translate } from '@jini-ai/ui/panel-kit';
import { describeApiError } from './api';
import { requestOnce } from './api';

export interface OwnerRecoveryStatus { isOwner: boolean; available: boolean; desktopOwnerReset: boolean }
export interface OwnerRecoveryPort {
  status(): Promise<OwnerRecoveryStatus>;
  issue(input: { password: string; code?: string }): Promise<{ codes: string[] }>;
  reset(input: { password: string }): Promise<void>;
  recover(input: { code: string; password: string }): Promise<void>;
}

/** Single-send client: never retry a rotation/redemption whose response may have been lost.
 * @complexity O(1), one request per action, kit responses bounded to ten 64-character codes.
 */
const post = <T,>(path: string, body: unknown): Promise<T> => requestOnce<T>({ path: `/auth/${path}`, init: {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store',
} });

export const ownerRecoveryPort: OwnerRecoveryPort = {
  status: () => requestOnce<OwnerRecoveryStatus>({ path: '/auth/owner-recovery', init: { cache: 'no-store' } }),
  issue: input => post('recovery-codes', input),
  reset: input => post('reset-owner', input),
  recover: input => post('recover-owner', input),
};


/** Preserve the server's specific explanation and provide selectable, redacted incident evidence.
 * Submitted secrets are exact redaction hints because a driver may echo them without a label.
 * @complexity O(diagnostic characters), no requests, clocks or clipboard effects.
 * @example ownerRecoveryFailure({ error, message: 'Recovery settings could not load.', action: 'Reload this page.', step: 'owner-recovery-status', t });
 */
export function ownerRecoveryFailure(
  { error, message, action, step, t, secrets = [] }: { error: unknown; message: string; action: string; step: string; t: Translate; secrets?: string[] },
  _options = {},
): UserFacingError {
  return formatUserFacingError({ message: describeApiError(error, t(message)), action: t(action), step, cause: error },
    { ...TOVU_ERROR_REDACTION_OPTIONS, exactSecrets: secrets.filter(Boolean) });
}
