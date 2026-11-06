import type { TotpSettingsPort } from '@jini-ai/user-management/react';
import { requestOnce } from './api';

/** Thin site transport: single-send writes never replay a proof after a lost response.
 * @complexity O(1), one request per explicit action; status loads once, no poll.
 */
const post = <T,>(action: string, input: unknown): Promise<T> => requestOnce<T>({
  path: `/auth/mfa/${action}`, init: { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input), cache: 'no-store' },
});

export const ownerMfaPort: TotpSettingsPort = {
  status: () => requestOnce({ path: '/auth/mfa', init: { cache: 'no-store' } }),
  enroll: input => post('enroll', input),
  confirm: input => post('confirm', input),
  remove: input => post('remove', input),
};
