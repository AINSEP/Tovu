import { formatUserFacingError, type UserFacingError } from '@jini-ai/core';
import { TOVU_ERROR_REDACTION_OPTIONS } from '@tovu/contracts/secret-redaction';

import { describeApiError } from './admin-http/request';
import { requestOnce } from './admin-http/request';

import { type Translate } from '@jini-ai/core/text';
export interface OwnerRecoveryStatus { isOwner: boolean; available: boolean; desktopOwnerReset: boolean }
export interface OwnerRecoveryPort {
  status(): Promise<OwnerRecoveryStatus>;
  issue(input: { password: string; code?: string }, optional?: Record<string, never>): Promise<{ codes: string[] }>;
  reset(input: { password: string }, optional?: Record<string, never>): Promise<void>;
  recover(input: { code: string; password: string }, optional?: Record<string, never>): Promise<void>;
}

/** Single-send client: never retry a rotation/redemption whose response may have been lost.
 * @complexity O(1), one request per action, kit responses bounded to ten 64-character codes.
 */
const post = <T,>({ path, body }: { path: string; body: unknown }, _options = {}): Promise<T> => requestOnce<T>({ path: `/auth/${path}`, init: {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store',
} });

export const ownerRecoveryPort: OwnerRecoveryPort = {
  status: () => requestOnce<OwnerRecoveryStatus>({ path: '/auth/owner-recovery', init: { cache: 'no-store' } }),
  issue: (input, _optional = {}) => post({ path: 'recovery-codes', body: input }),
  reset: (input, _optional = {}) => post({ path: 'reset-owner', body: input }),
  recover: (input, _optional = {}) => post({ path: 'recover-owner', body: input }),
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
  return formatUserFacingError({ message: describeApiError({ e: error, fallback: t(message) }), action: t(action), step, cause: error },
    { ...TOVU_ERROR_REDACTION_OPTIONS, exactSecrets: secrets.filter(Boolean) });
}
